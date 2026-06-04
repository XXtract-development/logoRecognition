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
 *       GET status and GET review-queue are open to any authenticated user.
 *       crosscheck (POST) requires ADMIN or data-manager role.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import prisma from '../../core/db';
import { logger } from '../../core/logger';
import { requireRole, authMiddleware } from '../../middleware/auth';
import { uploadArtwork } from '../../services/storage';
import { mediaServerClient } from '../../services/mediaserver-client';
import { mlClient } from '../../services/ml-client';
import {
  KEURMERK_CATEGORY,
  buildProvenance,
  ProvenanceMethod,
} from '../../services/provenance';
import type { Prisma } from '@prisma/client';

/**
 * Minimal transactional-client surface used by the shared registration helper.
 * Typed locally so it works against both the real Prisma client and the test
 * mock (which exposes the same model accessors).
 */
type TxClient = Prisma.TransactionClient;

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

// Crosscheck confidence thresholds per detection method.
// Detections without a method fall under STRICTEST (classifier).
const CROSSCHECK_THRESHOLD_TEMPLATE = parseFloat(
  process.env.CROSSCHECK_THRESHOLD_TEMPLATE || '0.85'
);
const CROSSCHECK_THRESHOLD_EMBEDDING = parseFloat(
  process.env.CROSSCHECK_THRESHOLD_EMBEDDING || '0.80'
);
const CROSSCHECK_THRESHOLD_CLASSIFIER = parseFloat(
  process.env.CROSSCHECK_THRESHOLD_CLASSIFIER || '0.90'
);

// ============================================
// Helpers
// ============================================

function getThresholdForMethod(method?: string): number {
  switch (method) {
    case 'template':
      return CROSSCHECK_THRESHOLD_TEMPLATE;
    case 'embedding':
      return CROSSCHECK_THRESHOLD_EMBEDDING;
    case 'classifier':
      return CROSSCHECK_THRESHOLD_CLASSIFIER;
    default:
      // No method provided → apply strictest threshold
      return CROSSCHECK_THRESHOLD_CLASSIFIER;
  }
}

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
 * One crop to register as training data (Story 8.6). Shared by the explicit
 * register endpoint and the accept-driven "doorzet" of review items.
 */
interface RegisterableCrop {
  t3777Code: string;
  cropPath: string;
  sourceFile: string;
  bbox: { x: number; y: number; width: number; height: number };
  method: ProvenanceMethod;
  confidence: number;
}

/**
 * Register a batch of crops as training data within an existing transaction
 * (Story 8.6). For each crop:
 *   - find-or-create a LogoImage marked `metadata.artworkSource=true` (the
 *     NOT NULL imageId FK requires an image row; the marker keeps these out of
 *     the Image Library — see images.ts),
 *   - upsert the keurmerk Logo so per-category stats stay linked,
 *   - create a TrainingData record (active=true, holdout=false) with full
 *     provenance built through the shared mapper shape.
 *
 * Returns the created TrainingData ids. Must run inside a transaction so a
 * mid-batch failure never leaves partial records behind.
 */
async function registerCropsTx(
  tx: TxClient,
  gtin: string,
  crops: RegisterableCrop[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const crop of crops) {
    // storagePath is not unique in the schema → findFirst + create.
    let logoImage = await tx.logoImage.findFirst({
      where: { storagePath: crop.cropPath },
      select: { id: true },
    });
    if (!logoImage) {
      logoImage = await tx.logoImage.create({
        data: {
          filename: crop.sourceFile,
          storagePath: crop.cropPath,
          metadata: { artworkSource: true, gtin },
        },
      });
    }

    await tx.logo.upsert({
      where: { category_value: { category: KEURMERK_CATEGORY, value: crop.t3777Code } },
      update: {},
      create: { category: KEURMERK_CATEGORY, value: crop.t3777Code },
    });

    const td = await tx.trainingData.create({
      data: {
        imageId: logoImage.id,
        label: crop.t3777Code,
        confidence: crop.confidence,
        validated: true,
        holdout: false,
        active: true,
        cropPath: crop.cropPath,
        provenance: buildProvenance({
          sourceFile: crop.sourceFile,
          bbox: crop.bbox,
          method: crop.method,
          confidence: crop.confidence,
        }),
      },
    });

    ids.push(td.id);
  }
  return ids;
}

/**
 * Doorzet (Story 8.6, carried over from 8.5): push 'accepted' ArtworkReviewItems
 * to training-data registration and mark them 'registered'.
 *
 * An item can only be registered when it carries the crop references that
 * provenance requires (cropPath + sourceFile). Items missing those are skipped
 * (never fabricated) and reported back so they remain visible for manual fixing.
 *
 * Returns counts so both the accept action and the catch-up endpoint can report.
 */
async function processAcceptedReviewItems(
  items: Array<{
    id: string;
    gtin: string;
    t3777Code: string;
    cropPath: string | null;
    sourceFile: string | null;
    bbox: unknown;
    confidence: number | null;
    method: string | null;
  }>
): Promise<{ registered: number; skipped: number; skippedIds: string[] }> {
  let registered = 0;
  let skipped = 0;
  const skippedIds: string[] = [];

  for (const item of items) {
    // Provenance requires a crop + source. Without them we cannot register a
    // truthful record — skip rather than fabricate (the no-fabricate rule).
    if (!item.cropPath || !item.sourceFile) {
      skipped += 1;
      skippedIds.push(item.id);
      logger.warn('Accepted review item lacks crop/source; cannot register', {
        reviewItemId: item.id,
        gtin: item.gtin,
      });
      continue;
    }

    const bbox = (item.bbox && typeof item.bbox === 'object'
      ? (item.bbox as RegisterableCrop['bbox'])
      : { x: 0, y: 0, width: 0, height: 0 });

    // The reviewer made the call → provenance method is 'human'.
    const crop: RegisterableCrop = {
      t3777Code: item.t3777Code,
      cropPath: item.cropPath,
      sourceFile: item.sourceFile,
      bbox,
      method: 'human',
      confidence: item.confidence ?? 0,
    };

    await prisma.$transaction(async (tx) => {
      await registerCropsTx(tx as TxClient, item.gtin, [crop]);
      await tx.artworkReviewItem.update({
        where: { id: item.id },
        data: { status: 'registered' },
      });
    });

    registered += 1;
  }

  return { registered, skipped, skippedIds };
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
      select: { id: true, status: true },
    });

    if (existing?.status === 'imported') {
      await prisma.artworkImportRun.update({
        where: { id: runId },
        data: { skippedCount: { increment: 1 }, heartbeatAt: new Date() },
      });
      continue;
    }

    // Track what was imported so the (separate) rasterization step can run
    // OUTSIDE the import try/catch — a rasterize failure must not mark the
    // import as failed (AC2).
    let importedRecord: { id: string; storagePath: string; isPdfFile: boolean } | null = null;

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

      const autoAccepted: DetectionItem[] = [];
      const reviewItems: Array<{
        t3777Code: string;
        reason: string;
        confidence?: number;
        bbox?: DetectionItem['bbox'];
        method?: string;
        cropPath?: string;
        sourceFile?: string;
      }> = [];

      const declaredSet = new Set(declared);

      // Process each detection
      for (const detection of detections) {
        const threshold = getThresholdForMethod(detection.method);

        if (declaredSet.size === 0) {
          // Safety rule: no declaration = no auto-accept
          reviewItems.push({
            t3777Code: detection.t3777Code,
            reason: 'Geen T3777-declaratie beschikbaar — verwacht handmatige review',
            confidence: detection.confidence,
            bbox: detection.bbox,
            method: detection.method,
            cropPath: detection.cropPath,
            sourceFile: detection.sourceFile,
          });
          continue;
        }

        if (declaredSet.has(detection.t3777Code)) {
          if (detection.confidence >= threshold) {
            autoAccepted.push(detection);
          } else {
            reviewItems.push({
              t3777Code: detection.t3777Code,
              reason: `Confidence onder drempel (${detection.confidence.toFixed(2)} < ${threshold.toFixed(2)})`,
              confidence: detection.confidence,
              bbox: detection.bbox,
              method: detection.method,
              cropPath: detection.cropPath,
              sourceFile: detection.sourceFile,
            });
          }
        } else {
          // Detected but not declared
          reviewItems.push({
            t3777Code: detection.t3777Code,
            reason: `Gevonden maar niet verwacht (niet gedeclareerd in T3777 voor GTIN ${gtin})`,
            confidence: detection.confidence,
            bbox: detection.bbox,
            method: detection.method,
            cropPath: detection.cropPath,
            sourceFile: detection.sourceFile,
          });
        }
      }

      // Check for "declared but not found"
      const detectedCodes = new Set(detections.map((d) => d.t3777Code));
      for (const code of declared) {
        if (!detectedCodes.has(code)) {
          reviewItems.push({
            t3777Code: code,
            reason: `Verwacht maar niet gevonden op het artwork (gedeclareerd in T3777 voor GTIN ${gtin})`,
          });
        }
      }

      // Persist review items to ArtworkReviewItem table
      if (reviewItems.length > 0) {
        await prisma.artworkReviewItem.createMany({
          data: reviewItems.map((item) => ({
            gtin,
            t3777Code: item.t3777Code,
            bbox: item.bbox ?? {},
            confidence: item.confidence,
            method: item.method,
            reason: item.reason,
            cropPath: item.cropPath,
            sourceFile: item.sourceFile,
            status: 'open',
          })),
          skipDuplicates: false,
        });
      }

      return reply.status(200).send({ autoAccepted, reviewItems });
    }
  );

  /**
   * GET /artwork/review-queue
   * Fetch all open artwork review items (for the combined review UI).
   */
  fastify.get(
    '/artwork/review-queue',
    { preHandler: authMiddleware },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const items = await prisma.artworkReviewItem.findMany({
        where: { status: 'open' },
        orderBy: { createdAt: 'desc' },
      });

      return reply.status(200).send({ data: items });
    }
  );

  /**
   * PATCH /artwork/review-items/:id/accept
   * Accept an open review item and push it straight to training-data
   * registration (Story 8.6 doorzet). On success the item becomes 'registered';
   * if it lacks crop/source references it is accepted but reported as skipped so
   * a datamanager can complete it. Requires ADMIN.
   */
  fastify.patch<{ Params: { id: string } }>(
    '/artwork/review-items/:id/accept',
    { preHandler: REQUIRE_ADMIN },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      const item = await prisma.artworkReviewItem.findUnique({ where: { id } });
      if (!item) {
        return reply.status(404).send({ error: 'Review item niet gevonden' });
      }
      if (item.status === 'registered') {
        return reply.status(409).send({ error: 'Review item is al geregistreerd' });
      }

      // Mark accepted first so a crop-less item still leaves the open queue and
      // is picked up by a later catch-up once its crop is supplied.
      await prisma.artworkReviewItem.update({
        where: { id },
        data: { status: 'accepted' },
      });

      const result = await processAcceptedReviewItems([item]);

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
}
