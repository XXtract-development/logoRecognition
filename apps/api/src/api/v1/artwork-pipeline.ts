/**
 * Artwork Pipeline Routes — Epic 8 (Stories 8.1, 8.5, 8.6)
 *
 * Story 8.1 — Artwork import via mediaserver with caching:
 *   POST /artwork-import/runs          { gtins?: string[] }   → 202 { runId }
 *   GET  /artwork-import/runs/:runId                          → 200 { status, imported, skipped, failed }
 *
 * Story 8.5 — T3777 crosscheck:
 *   POST /artwork/:gtin/crosscheck     { detections, declared } → 200 { autoAccepted, reviewItems }
 *   GET  /artwork/review-queue                                  → 200 open review items
 *   GET  /artwork/review-items/:id/crop-url                      → 200 { cropUrl } (on-view presign)
 *
 * Story 8.6 — Training data registration with provenance:
 *   POST  /artwork/:gtin/register-training-data    { items }     → 201
 *   PATCH /training/data/deactivate-by-source       { sourceFile } → 200 { deactivated }
 *   PATCH /artwork/review-items/:id/accept                       → 200 (doorzet to training data)
 *   PATCH /artwork/review-items/:id/reject                       → 200
 *   POST  /artwork/review-items/process-accepted                 → 200 (catch-up doorzet)
 *
 * RBAC: mutating endpoints (POST import runs, register, deactivate, accept,
 *       reject, process-accepted) require ADMIN.
 *       GET status, GET review-queue and GET crop-url are open to any
 *       authenticated user.
 *       crosscheck (POST) requires ADMIN.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import prisma from '../../core/db';
import { logger } from '../../core/logger';
import { requireRole, authMiddleware } from '../../middleware/auth';
import { uploadArtwork, downloadTrainingObject } from '../../services/storage';
import { mediaServerClient } from '../../services/mediaserver-client';
import { mlClient } from '../../services/ml-client';
import {
  TxClient,
  RegisterableCrop,
  registerCropsTx,
  processAcceptedReviewItems,
} from '../../services/artwork-registration';
import { crosscheckDetections } from '../../services/artwork-crosscheck';
import { enqueueDetectionForImport } from '../../services/pipeline/detection-flow';

// ============================================
// Constants
// ============================================

/** RBAC: import runs and data write operations require ADMIN. */
const REQUIRE_ADMIN = requireRole('ADMIN');

/** Default concurrent mediaserver downloads per run. */
const DEFAULT_CONCURRENCY = parseInt(
  process.env.ARTWORK_IMPORT_CONCURRENCY || '3',
  10
);

/**
 * Minutes after which a run without a heartbeat is considered stale.
 * A stale run is transitioned to 'failed' to prevent eternal 'running' state
 * after an API crash.
 */
const IMPORT_RUN_STALE_MINUTES = parseInt(
  process.env.IMPORT_RUN_STALE_MINUTES || '10',
  10
);

/**
 * DPI for PDF-artwork rasterization (Story 8.2, FR45). Default 300.
 * Passed through to the ML service; configurable via ARTWORK_RASTER_DPI.
 */
const ARTWORK_RASTER_DPI = parseInt(process.env.ARTWORK_RASTER_DPI || '300', 10);

// ============================================
// Helpers
// ============================================

/**
 * Mark stale runs (no heartbeat for > IMPORT_RUN_STALE_MINUTES) as failed.
 * Called at the start of each new import to clean up previous crashes.
 */
async function markStaleRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - IMPORT_RUN_STALE_MINUTES * 60 * 1000);
  await prisma.artworkImportRun.updateMany({
    where: { status: 'running', heartbeatAt: { lt: cutoff } },
    data: { status: 'failed', completedAt: new Date() },
  });
}

/**
 * Compute SHA-256 hash of a buffer.
 */
function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/** True when the file name is a PDF (case-insensitive extension check). */
function isPdf(fileName: string, mimeType?: string): boolean {
  if (mimeType && mimeType.toLowerCase() === 'application/pdf') return true;
  return fileName.toLowerCase().endsWith('.pdf');
}

/**
 * Rasterize an imported PDF artwork and persist the page relation (Story 8.2,
 * AC1). Called AFTER the import itself has already succeeded.
 *
 * Soft-fail (AC2): any rasterization error is recorded in the item's `pages`
 * JSON as an `error` reason and logged — it must NEVER throw, NEVER mark the
 * item failed, and NEVER count as a pipeline error. The import already
 * succeeded; rasterization is a best-effort follow-up step.
 *
 * Exported for direct (non-HTTP) unit testing of the AC behavior.
 */
export async function rasterizeImportedPdf(
  importId: string,
  gtin: string,
  storagePath: string
): Promise<void> {
  try {
    const result = await mlClient.rasterizeArtwork(storagePath, ARTWORK_RASTER_DPI);

    // Store the per-page relation as a structured JSON object (never str()):
    // { dpi, pages: [{ page, imagePath }], error? }. The object is handed to
    // Prisma's Json field directly — no JSON.stringify.
    const pagesJson: {
      dpi: number;
      pages: Array<{ page: number; imagePath: string }>;
      error?: string;
    } = {
      dpi: result.dpi,
      pages: result.pages.map((p) => ({ page: p.page, imagePath: p.image_path })),
    };
    if (result.error) {
      pagesJson.error = result.error;
    }

    await prisma.artworkImport.update({
      where: { id: importId },
      data: { pages: pagesJson },
    });

    logger.info('PDF artwork rasterized', {
      gtin,
      importId,
      storagePath,
      pageCount: pagesJson.pages.length,
      error: result.error ?? undefined,
    });
  } catch (err) {
    // Soft-fail: record the reason on the item, do NOT rethrow, do NOT mark failed.
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn('PDF artwork rasterization failed (soft-fail, item stays imported)', {
      gtin,
      importId,
      storagePath,
      error: reason,
    });
    try {
      await prisma.artworkImport.update({
        where: { id: importId },
        data: { pages: { dpi: ARTWORK_RASTER_DPI, pages: [], error: reason } },
      });
    } catch (persistErr) {
      logger.warn('Could not persist rasterization error to import record', {
        importId,
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }
  }
}

/**
 * Process a single GTIN: discover media items, import new ones, skip cached ones.
 * Updates the run counters directly in the DB after each item.
 */
async function importGtin(runId: string, gtin: string): Promise<void> {
  let items;
  try {
    items = await mediaServerClient.discoverArtwork(gtin);
  } catch (err) {
    logger.warn('Artwork discovery failed for GTIN', {
      gtin,
      error: err instanceof Error ? err.message : String(err),
    });
    // Count the entire GTIN as a single failure.
    // Upsert (not create): a repeated discovery failure for the same GTIN on a
    // re-run would otherwise collide with the @@unique([mediaId]) constraint and
    // crash the whole run.
    const failureMediaId = `discovery-failure-${gtin}`;
    await prisma.artworkImport.upsert({
      where: { mediaId: failureMediaId },
      create: {
        gtin,
        mediaId: failureMediaId,
        fileName: '',
        sourceLocation: '',
        status: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
        importRunId: runId,
      },
      update: {
        status: 'failed',
        failureReason: err instanceof Error ? err.message : String(err),
        importRunId: runId,
      },
    });
    await prisma.artworkImportRun.update({
      where: { id: runId },
      data: { failedCount: { increment: 1 }, heartbeatAt: new Date() },
    });
    return;
  }

  for (const item of items) {
    // Dedup: does a successfully imported record already exist for this mediaId?
    const existing = await prisma.artworkImport.findUnique({
      where: { mediaId: item.id },
      select: { id: true, status: true, gln: true },
    });

    if (existing?.status === 'imported') {
      // gln backfill (8-3D prerequisite): records imported before the gln
      // column was sourced stay NULL forever because the dedup skip never
      // reaches the upsert. Backfill it here — re-import is the documented
      // repair path for missing glns.
      if (!existing.gln && item.gln) {
        await prisma.artworkImport.update({
          where: { id: existing.id },
          data: { gln: item.gln },
        });
      }
      await prisma.artworkImportRun.update({
        where: { id: runId },
        data: { skippedCount: { increment: 1 }, heartbeatAt: new Date() },
      });
      continue;
    }

    // Track what was imported so the (separate) rasterization step can run
    // OUTSIDE the import try/catch — a rasterize failure must not mark the
    // import as failed (AC2).
    let importedRecord: { id: string; storagePath: string; isPdfFile: boolean; mimeType: string } | null = null;

    // Download and store
    try {
      const { buffer, mimeType } = await mediaServerClient.downloadFile(
        item.previewUrl
      );
      const hash = sha256(buffer);
      const storagePath = `artwork/${gtin}/${item.fileName}`;

      await uploadArtwork(buffer, storagePath, mimeType);

      const record = await prisma.artworkImport.upsert({
        where: { mediaId: item.id },
        create: {
          gtin,
          // gln from the mediaserver discovery response (Story 8-3O, S3/D1).
          // Nullable: records without a gln stay NULL → declared=[] fallback.
          gln: item.gln ?? null,
          mediaId: item.id,
          fileName: item.fileName,
          sourceLocation: item.previewUrl,
          sha256Hash: hash,
          storagePath,
          mimeType,
          status: 'imported',
          importRunId: runId,
        },
        update: {
          // Never clobber a previously stored gln with NULL on re-import
          // (review finding 2; decision 8 only promises forward-filling).
          ...(item.gln ? { gln: item.gln } : {}),
          sha256Hash: hash,
          storagePath,
          mimeType,
          status: 'imported',
          failureReason: null,
          importRunId: runId,
        },
      });

      await prisma.artworkImportRun.update({
        where: { id: runId },
        data: { importedCount: { increment: 1 }, heartbeatAt: new Date() },
      });

      importedRecord = {
        id: record.id,
        storagePath,
        isPdfFile: isPdf(item.fileName, mimeType),
        mimeType,
      };
    } catch (err) {
      logger.warn('Artwork item import failed', {
        gtin,
        mediaId: item.id,
        error: err instanceof Error ? err.message : String(err),
      });

      await prisma.artworkImport.upsert({
        where: { mediaId: item.id },
        create: {
          gtin,
          mediaId: item.id,
          fileName: item.fileName,
          sourceLocation: item.previewUrl,
          status: 'failed',
          failureReason: err instanceof Error ? err.message : String(err),
          importRunId: runId,
        },
        update: {
          status: 'failed',
          failureReason: err instanceof Error ? err.message : String(err),
          importRunId: runId,
        },
      });

      await prisma.artworkImportRun.update({
        where: { id: runId },
        data: { failedCount: { increment: 1 }, heartbeatAt: new Date() },
      });
    }

    // Rasterization step (Story 8.2) — runs OUTSIDE the import try/catch so a
    // rasterize failure cannot mark the item failed or increment failedCount.
    // Only PDFs are rasterized; JPG/PNG already go straight into the pipeline.
    if (importedRecord && importedRecord.isPdfFile) {
      await rasterizeImportedPdf(importedRecord.id, gtin, importedRecord.storagePath);
    }

    // Detection enqueue (Story 8-3O, O5) — runs OUTSIDE the import try/catch and
    // AFTER rasterization so a PDF's pages exist. Best-effort soft-fail: an
    // enqueue error is logged and never breaks the import run (AC3). For PDFs we
    // re-read the persisted `pages` relation so we enqueue one job per page.
    if (importedRecord) {
      try {
        let pages: { dpi?: number; pages?: Array<{ page: number; imagePath: string }>; error?: string } | null = null;
        if (importedRecord.isPdfFile) {
          const fresh = await prisma.artworkImport.findUnique({
            where: { id: importedRecord.id },
            select: { pages: true },
          });
          pages = (fresh?.pages ?? null) as typeof pages;
        }
        await enqueueDetectionForImport({
          gtin,
          mimeType: importedRecord.mimeType,
          storagePath: importedRecord.storagePath,
          pages,
        });
      } catch (err) {
        logger.warn('Detection enqueue failed (soft-fail, import stays successful)', {
          gtin,
          importId: importedRecord.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

/**
 * Run the import loop for a set of GTINs with configurable concurrency.
 * Marks the run as completed (or failed) when done.
 */
async function runImportLoop(runId: string, gtins: string[]): Promise<void> {
  const concurrency = DEFAULT_CONCURRENCY;

  try {
    // Process GTINs in batches of `concurrency`
    for (let i = 0; i < gtins.length; i += concurrency) {
      const batch = gtins.slice(i, i + concurrency);
      await Promise.all(batch.map((gtin) => importGtin(runId, gtin)));
    }

    // Mark as completed
    await prisma.artworkImportRun.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date(), heartbeatAt: new Date() },
    });

    logger.info('Artwork import run completed', { runId, gtins: gtins.length });
  } catch (err) {
    logger.error('Artwork import run failed unexpectedly', {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
    await prisma.artworkImportRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  }
}

// ============================================
// Route handlers
// ============================================

interface ImportRunBody {
  gtins?: string[];
  force?: boolean;
}

interface RunParams {
  runId: string;
}

interface CrosscheckParams {
  gtin: string;
}

interface DetectionItem {
  t3777Code: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  method?: string;
  /**
   * Crop + source references (Epic 8, Stories 8.3/8.4). Carried through the
   * crosscheck so a review item that is later accepted can be pushed to
   * training-data registration with full provenance (Story 8.6 doorzet).
   * Optional because legacy callers may not yet supply them.
   */
  cropPath?: string;
  sourceFile?: string;
}

interface CrosscheckBody {
  detections: DetectionItem[];
  declared: string[];
}

interface RegisterTrainingDataItem {
  t3777Code: string;
  cropPath: string;
  sourceFile: string;
  bbox: { x: number; y: number; width: number; height: number };
  method: 'template' | 'classifier' | 'human' | 'synthetic';
  confidence: number;
}

interface RegisterTrainingDataBody {
  items: RegisterTrainingDataItem[];
}

interface DeactivateBySourceBody {
  sourceFile: string;
}

interface SynthesizeBody {
  t3777Code: string;
  count: number;
  seed?: number;
}

/**
 * Placeholder GTIN for synthetic training data (Story 8.7). Synthetic samples
 * are not tied to a real product, but registerCropsTx (the 8.6 path) needs a
 * gtin for the LogoImage marker. This sentinel keeps them grouped and out of
 * any real-product reporting.
 */
const SYNTHETIC_GTIN = 'synthetic';

export async function artworkPipelineRoutes(fastify: FastifyInstance) {
  // -----------------------------------------------------------------------
  // Story 8.1 — Import runs
  // -----------------------------------------------------------------------

  /**
   * POST /artwork-import/runs
   * Start an artwork import run. Accepts an optional list of GTINs.
   * Requires ADMIN role.
   *
   * Returns 202 Accepted with { runId } immediately; processing runs in the
   * background (in-process async for this story; moved to BullMQ in Epic 9).
   *
   * Delta strategy: by default, already-imported items (same mediaId, status
   * imported) are skipped. Pass { force: true } to re-check all items.
   */
  fastify.post<{ Body: ImportRunBody }>(
    '/artwork-import/runs',
    { preHandler: REQUIRE_ADMIN },
    async (request: FastifyRequest<{ Body: ImportRunBody }>, reply: FastifyReply) => {
      // Mark stale runs from previous crashed API instances
      await markStaleRuns();

      const gtins: string[] = request.body?.gtins ?? [];

      // Create persistent run record immediately
      const run = await prisma.artworkImportRun.create({
        data: {
          status: 'running',
          gtins: gtins,
          heartbeatAt: new Date(),
        },
      });

      logger.info('Artwork import run started', { runId: run.id, gtins: gtins.length });

      // Kick off background import — do not await (202 response is immediate)
      setImmediate(() => {
        runImportLoop(run.id, gtins).catch((err) => {
          logger.error('Background import loop error', {
            runId: run.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      });

      return reply.status(202).send({ runId: run.id });
    }
  );

  /**
   * GET /artwork-import/runs/:runId
   * Fetch the status of an import run.
   *
   * Returns 200 { status, imported, skipped, failed: [{gtin, reason}] }
   * Returns 404 for unknown runId.
   */
  fastify.get<{ Params: RunParams }>(
    '/artwork-import/runs/:runId',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: RunParams }>, reply: FastifyReply) => {
      const { runId } = request.params;

      const run = await prisma.artworkImportRun.findUnique({
        where: { id: runId },
        include: {
          items: {
            where: { status: 'failed' },
            select: { gtin: true, failureReason: true },
          },
        },
      });

      if (!run) {
        return reply.status(404).send({ error: 'Import run niet gevonden' });
      }

      const failedItems = run.items.map((item) => ({
        gtin: item.gtin,
        reason: item.failureReason ?? 'Unknown error',
      }));

      return {
        status: run.status,
        imported: run.importedCount,
        skipped: run.skippedCount,
        failed: failedItems,
      };
    }
  );

  // -----------------------------------------------------------------------
  // Story 8-3O — Manual detection-run management
  // -----------------------------------------------------------------------

  /**
   * POST /artwork-detection/runs
   * Manually (re)start detection over an existing set of artwork. Accepts a
   * GTIN list and/or an importRunId; enqueues one detection job per imported
   * image (PDFs per rasterized page). Idempotent at the queue level (stable
   * jobId per image). Requires ADMIN.
   *
   * Returns 202 { enqueued } with the number of jobs queued.
   */
  fastify.post<{ Body: { gtins?: string[]; importRunId?: string } }>(
    '/artwork-detection/runs',
    { preHandler: REQUIRE_ADMIN },
    async (
      request: FastifyRequest<{ Body: { gtins?: string[]; importRunId?: string } }>,
      reply: FastifyReply
    ) => {
      const { gtins, importRunId } = request.body ?? {};

      if ((!gtins || gtins.length === 0) && !importRunId) {
        return reply.status(400).send({ error: 'gtins of importRunId is vereist' });
      }

      const where: { status: string; gtin?: { in: string[] }; importRunId?: string } = {
        status: 'imported',
      };
      if (gtins && gtins.length > 0) where.gtin = { in: gtins };
      if (importRunId) where.importRunId = importRunId;

      const imports = await prisma.artworkImport.findMany({
        where,
        select: { gtin: true, storagePath: true, mimeType: true, pages: true },
      });

      let enqueued = 0;
      for (const imp of imports) {
        if (!imp.storagePath) continue;
        try {
          const jobs = await enqueueDetectionForImport({
            gtin: imp.gtin,
            mimeType: imp.mimeType ?? undefined,
            storagePath: imp.storagePath,
            pages: (imp.pages ?? null) as {
              dpi?: number;
              pages?: Array<{ page: number; imagePath: string }>;
              error?: string;
            } | null,
          });
          enqueued += jobs.length;
        } catch (err) {
          logger.warn('Detection enqueue failed for import (manual run)', {
            gtin: imp.gtin,
            storagePath: imp.storagePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info('Manual detection run enqueued', {
        candidates: imports.length,
        enqueued,
        gtins: gtins?.length ?? 0,
        importRunId: importRunId ?? null,
      });

      return reply.status(202).send({ enqueued, candidates: imports.length });
    }
  );

  // -----------------------------------------------------------------------
  // Story 8.5 — T3777 crosscheck and routing
  // -----------------------------------------------------------------------

  /**
   * POST /artwork/:gtin/crosscheck
   * Compare detected keurmerken against GS1 T3777 declaration.
   *
   * Auto-accept rules:
   * - Detection ∈ declared AND confidence ≥ per-method threshold → autoAccepted
   * - declared[] is empty → everything goes to reviewItems (safety: no independent confirmation)
   * - detected but not declared, or declared but not detected → reviewItems with reason
   *
   * Detected but confidence < threshold → reviewItems with reason "confidence onder drempel"
   */
  fastify.post<{ Params: CrosscheckParams; Body: CrosscheckBody }>(
    '/artwork/:gtin/crosscheck',
    { preHandler: REQUIRE_ADMIN },
    async (
      request: FastifyRequest<{ Params: CrosscheckParams; Body: CrosscheckBody }>,
      reply: FastifyReply
    ) => {
      const { gtin } = request.params;
      const { detections = [], declared = [] } = request.body;

      // Thin wrapper (Story 8-3O): the crosscheck logic now lives in the
      // service so the detection worker can call it directly (no internal HTTP).
      const { autoAccepted, reviewItems } = await crosscheckDetections(
        gtin,
        detections,
        declared
      );

      return reply.status(200).send({ autoAccepted, reviewItems });
    }
  );

  /**
   * GET /artwork/review-queue
   * Fetch all open artwork review items (for the combined review UI).
   */
  fastify.get<{ Querystring: { q?: string; take?: string } }>(
    '/artwork/review-queue',
    { preHandler: authMiddleware },
    async (
      request: FastifyRequest<{ Querystring: { q?: string; take?: string } }>,
      reply: FastifyReply
    ) => {
      // Optional focus filter: `q` matches a substring of `reason` (e.g. "12.6"
      // to show only the keurmerk acceptance candidates instead of the whole
      // bulk-run queue). `take` bounds the payload (default 1000). Highest
      // confidence first so the most-likely-real crops surface at the top.
      const { q, take } = request.query;
      const limit = Math.min(Math.max(parseInt(String(take ?? '1000'), 10) || 1000, 1), 5000);
      const items = await prisma.artworkReviewItem.findMany({
        where: { status: 'open', ...(q ? { reason: { contains: q } } : {}) },
        orderBy: [{ confidence: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: limit,
      });

      return reply.status(200).send({ data: items });
    }
  );

  /**
   * GET /artwork/review-items/:id/crop-url
   * On-view crop URL for a single review item. Returns an API-relative
   * streaming URL (see /crop below) instead of a presigned MinIO URL:
   * presigned URLs carry the *internal* MinIO endpoint (localhost:9000 on
   * ACC), which the browser cannot reach — acceptance finding 2026-06-06.
   * Items without a crop return cropUrl=null (empty-preview state in the UI).
   * Open to any authenticated user (read-only).
   */
  fastify.get<{ Params: { id: string } }>(
    '/artwork/review-items/:id/crop-url',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const item = await prisma.artworkReviewItem.findUnique({ where: { id } });
      if (!item) {
        return reply.status(404).send({ error: 'Review item niet gevonden' });
      }

      const cropUrl = item.cropPath ? `/api/v1/artwork/review-items/${id}/crop` : null;

      return reply.status(200).send({ cropUrl });
    }
  );

  /**
   * GET /artwork/review-items/:id/crop
   * Streams the crop image bytes through the API (cookie-authenticated <img>
   * requests work same-origin; MinIO stays internal). 404 when the item or its
   * crop object is missing. Open to any authenticated user (read-only).
   */
  fastify.get<{ Params: { id: string } }>(
    '/artwork/review-items/:id/crop',
    { preHandler: authMiddleware },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const item = await prisma.artworkReviewItem.findUnique({ where: { id } });
      if (!item || !item.cropPath) {
        return reply.status(404).send({ error: 'Geen crop voor dit reviewitem' });
      }

      const buffer = await downloadTrainingObject(item.cropPath);
      if (!buffer) {
        return reply.status(404).send({ error: 'Crop niet gevonden in opslag' });
      }

      const ext = item.cropPath.split('.').pop()?.toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      reply.header('Cache-Control', 'private, max-age=300');
      return reply.type(mime).send(buffer);
    }
  );

  /**
   * PATCH /artwork/review-items/:id/accept
   * Accept an open review item and push it straight to training-data
   * registration (Story 8.6 doorzet). On success the item becomes 'registered';
   * if it lacks crop/source references it is accepted but reported as skipped so
   * a datamanager can complete it. Requires ADMIN.
   */
  fastify.patch<{ Params: { id: string }; Body: { t3777Code?: string } }>(
    '/artwork/review-items/:id/accept',
    { preHandler: REQUIRE_ADMIN },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { t3777Code?: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      // Optional correction: accept the crop under a DIFFERENT keurmerk code than
      // predicted (the assembler's prediction is noisy). The crop is then
      // registered under the corrected label.
      const override = request.body?.t3777Code?.trim();

      const item = await prisma.artworkReviewItem.findUnique({ where: { id } });
      if (!item) {
        return reply.status(404).send({ error: 'Review item niet gevonden' });
      }
      if (item.status === 'registered') {
        return reply.status(409).send({ error: 'Review item is al geregistreerd' });
      }

      // Mark accepted (and apply the code correction) first so a crop-less item
      // still leaves the open queue and is picked up by a later catch-up.
      const accepted = await prisma.artworkReviewItem.update({
        where: { id },
        data: {
          status: 'accepted',
          ...(override && override !== item.t3777Code ? { t3777Code: override } : {}),
        },
      });

      const result = await processAcceptedReviewItems([accepted]);

      logger.info('Review item accepted', {
        reviewItemId: id,
        registered: result.registered,
        skipped: result.skipped,
      });

      return reply.status(200).send({
        status: result.registered > 0 ? 'registered' : 'accepted',
        registered: result.registered,
        skipped: result.skipped,
      });
    }
  );

  /**
   * PATCH /artwork/review-items/:id/reject
   * Reject an open review item (no training data is created). Requires ADMIN.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/artwork/review-items/:id/reject',
    { preHandler: REQUIRE_ADMIN },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const item = await prisma.artworkReviewItem.findUnique({ where: { id } });
      if (!item) {
        return reply.status(404).send({ error: 'Review item niet gevonden' });
      }

      await prisma.artworkReviewItem.update({
        where: { id },
        data: { status: 'rejected' },
      });

      logger.info('Review item rejected', { reviewItemId: id });

      return reply.status(200).send({ status: 'rejected' });
    }
  );

  /**
   * PATCH /artwork/review-items/:id/reopen
   * Undo a previous accept/reject: set the item back to 'open'. If it had been
   * accepted, the training-data row(s) created from its crop (matched by the
   * shared cropPath, Story 8.6) are deactivated so the correction also removes
   * the crop from training. Idempotent. Requires ADMIN.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/artwork/review-items/:id/reopen',
    { preHandler: REQUIRE_ADMIN },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const item = await prisma.artworkReviewItem.findUnique({ where: { id } });
      if (!item) {
        return reply.status(404).send({ error: 'Review item niet gevonden' });
      }

      let deactivated = 0;
      if (item.cropPath) {
        const result = await prisma.trainingData.updateMany({
          where: { cropPath: item.cropPath, active: true },
          data: { active: false },
        });
        deactivated = result.count;
      }

      await prisma.artworkReviewItem.update({ where: { id }, data: { status: 'open' } });

      logger.info('Review item reopened', { reviewItemId: id, deactivatedTrainingData: deactivated });

      return reply.status(200).send({ status: 'open', deactivatedTrainingData: deactivated });
    }
  );

  /**
   * POST /artwork/review-items/process-accepted
   * Catch-up doorzet (Story 8.6): register all 'accepted' review items that
   * were accepted before this flow existed (or were skipped for missing crops
   * and have since been completed). Idempotent — registered items are excluded
   * by status. Requires ADMIN.
   */
  fastify.post(
    '/artwork/review-items/process-accepted',
    { preHandler: REQUIRE_ADMIN },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const accepted = await prisma.artworkReviewItem.findMany({
        where: { status: 'accepted' },
        orderBy: { createdAt: 'asc' },
      });

      const result = await processAcceptedReviewItems(accepted);

      logger.info('Catch-up processing of accepted review items', {
        candidates: accepted.length,
        registered: result.registered,
        skipped: result.skipped,
      });

      return reply.status(200).send({
        processed: accepted.length,
        registered: result.registered,
        skipped: result.skipped,
      });
    }
  );

  // -----------------------------------------------------------------------
  // Story 8.6 — Training data registration with provenance
  // -----------------------------------------------------------------------

  /**
   * POST /artwork/:gtin/register-training-data
   * Register auto-accepted or human-approved crops as training data.
   * Creates a LogoImage record (artworkSource=true) + a TrainingData record
   * per item with full provenance.
   *
   * Requires ADMIN.
   */
  fastify.post<{ Params: CrosscheckParams; Body: RegisterTrainingDataBody }>(
    '/artwork/:gtin/register-training-data',
    { preHandler: REQUIRE_ADMIN },
    async (
      request: FastifyRequest<{ Params: CrosscheckParams; Body: RegisterTrainingDataBody }>,
      reply: FastifyReply
    ) => {
      const { gtin } = request.params;
      const { items = [] } = request.body;

      if (items.length === 0) {
        return reply.status(400).send({ error: 'Geen items opgegeven' });
      }

      let created: string[] = [];

      // Register all items atomically: a failure mid-loop must not leave a
      // partial set of training-data records behind (the previous per-item
      // catch returned 500 while committing items 0..N-1).
      try {
        created = await prisma.$transaction(async (tx) =>
          registerCropsTx(tx as TxClient, gtin, items)
        );
      } catch (err) {
        logger.error('Failed to register training data items', {
          gtin,
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(500).send({ error: 'Registratie van trainingsdata mislukt' });
      }

      logger.info('Training data registered from artwork', {
        gtin,
        count: created.length,
      });

      return reply.status(201).send({ registered: created.length, ids: created });
    }
  );

  /**
   * PATCH /training/data/deactivate-by-source
   * Bulk-deactivate all training data records from a given source file.
   * Uses Prisma JSON path filter on provenance.sourceFile.
   * Never deletes records (ATDD test verifies this).
   *
   * Requires ADMIN.
   */
  fastify.patch<{ Body: DeactivateBySourceBody }>(
    '/training/data/deactivate-by-source',
    { preHandler: REQUIRE_ADMIN },
    async (
      request: FastifyRequest<{ Body: DeactivateBySourceBody }>,
      reply: FastifyReply
    ) => {
      const { sourceFile } = request.body;

      if (!sourceFile) {
        return reply.status(400).send({ error: 'sourceFile is vereist' });
      }

      const result = await prisma.trainingData.updateMany({
        where: {
          provenance: {
            path: ['sourceFile'],
            equals: sourceFile,
          },
        },
        data: { active: false },
      });

      logger.info('Training data bulk-deactivated', {
        sourceFile,
        count: result.count,
      });

      return reply.status(200).send({ deactivated: result.count });
    }
  );

  // -----------------------------------------------------------------------
  // Story 8.7 — Synthetic training-data generation
  // -----------------------------------------------------------------------

  /**
   * POST /artwork/synthesize
   * Generate synthetic training composites for one keurmerk class and register
   * them as training data through the 8.6 path (method='synthetic').
   *
   * The ML service does the image work + MinIO persistence and returns crop
   * descriptors; this endpoint registers them via registerCropsTx — the single
   * registration path (no duplicate writer). Every record lands holdout=false
   * (NFR3): synthetic data never enters the protected holdout set.
   *
   * Requires ADMIN.
   */
  fastify.post<{ Body: SynthesizeBody }>(
    '/artwork/synthesize',
    { preHandler: REQUIRE_ADMIN },
    async (request: FastifyRequest<{ Body: SynthesizeBody }>, reply: FastifyReply) => {
      const { t3777Code, count, seed } = request.body ?? ({} as SynthesizeBody);

      if (!t3777Code || typeof count !== 'number' || count < 1) {
        return reply.status(400).send({ error: 't3777Code en count (>=1) zijn vereist' });
      }

      let synthResult;
      try {
        synthResult = await mlClient.synthesizeArtwork(t3777Code, count, seed);
      } catch (err) {
        logger.error('Synthetic generation request failed', {
          t3777Code,
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(502).send({ error: 'Synthetische generatie mislukt' });
      }

      if (synthResult.generated === 0) {
        // Open-input gate: no usable references/backgrounds. Not an error —
        // report 0 so the caller knows the class needs reference uploads first.
        logger.info('No synthetic samples generated (missing references/backgrounds)', {
          t3777Code,
        });
        return reply.status(200).send({ generated: 0, registered: 0, ids: [] });
      }

      // Register via the 8.6 path (method='synthetic', holdout=false enforced
      // by registerCropsTx). Atomic: a mid-batch failure leaves no partial set.
      const crops: RegisterableCrop[] = synthResult.samples.map((s) => ({
        t3777Code: s.t3777_code,
        cropPath: s.crop_path,
        sourceFile: s.source_file,
        bbox: s.bbox,
        method: 'synthetic',
        confidence: s.confidence,
      }));

      let registered: string[] = [];
      try {
        registered = await prisma.$transaction(async (tx) =>
          registerCropsTx(tx as TxClient, SYNTHETIC_GTIN, crops)
        );
      } catch (err) {
        logger.error('Failed to register synthetic training data', {
          t3777Code,
          error: err instanceof Error ? err.message : String(err),
        });
        return reply.status(500).send({ error: 'Registratie van synthetische data mislukt' });
      }

      logger.info('Synthetic training data generated and registered', {
        t3777Code,
        generated: synthResult.generated,
        registered: registered.length,
      });

      return reply.status(201).send({
        generated: synthResult.generated,
        registered: registered.length,
        ids: registered,
      });
    }
  );
}
