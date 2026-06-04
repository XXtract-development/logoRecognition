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
 *   POST /artwork/:gtin/register-training-data  { items }     → 201
 *   PATCH /training/data/deactivate-by-source   { sourceFile } → 200 { deactivated }
 *
 * RBAC: mutating endpoints (POST import runs, register, deactivate) require ADMIN.
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

    // Download and store
    try {
      const { buffer, mimeType } = await mediaServerClient.downloadFile(
        item.previewUrl
      );
      const hash = sha256(buffer);
      const storagePath = `artwork/${gtin}/${item.fileName}`;

      await uploadArtwork(buffer, storagePath, mimeType);

      await prisma.artworkImport.upsert({
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

      const KEURMERK_CATEGORY = 'keurmerk';

      let created: string[] = [];

      // Register all items atomically: a failure mid-loop must not leave a
      // partial set of training-data records behind (the previous per-item
      // catch returned 500 while committing items 0..N-1).
      try {
        created = await prisma.$transaction(async (tx) => {
          const ids: string[] = [];
          for (const item of items) {
            // Find or create a LogoImage for this crop path (artwork source marker).
            // storagePath is not unique in the schema, so we use findFirst + create.
            let logoImage = await tx.logoImage.findFirst({
              where: { storagePath: item.cropPath },
              select: { id: true },
            });
            if (!logoImage) {
              logoImage = await tx.logoImage.create({
                data: {
                  filename: item.sourceFile,
                  storagePath: item.cropPath,
                  metadata: { artworkSource: true, gtin },
                },
              });
            }

            // Upsert the Logo (category=keurmerk) to maintain stats linkage
            await tx.logo.upsert({
              where: { category_value: { category: KEURMERK_CATEGORY, value: item.t3777Code } },
              update: {},
              create: { category: KEURMERK_CATEGORY, value: item.t3777Code },
            });

            // Create the training data record with provenance
            const td = await tx.trainingData.create({
              data: {
                imageId: logoImage.id,
                label: item.t3777Code,
                confidence: item.confidence,
                validated: true,
                holdout: false,
                active: true,
                cropPath: item.cropPath,
                provenance: {
                  sourceFile: item.sourceFile,
                  bbox: item.bbox,
                  method: item.method,
                  confidence: item.confidence,
                },
              },
            });

            ids.push(td.id);
          }
          return ids;
        });
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
