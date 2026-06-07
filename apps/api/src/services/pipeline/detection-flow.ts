/**
 * Artwork detection orchestration (Story 8-3O) — Node-side BullMQ worker flow.
 *
 * One job per artwork IMAGE (a JPG/PNG `storage_path`, or one rasterized PDF
 * page). The job chain (decision 1/6):
 *   dedup-pre-filter (O2/O3)
 *     → mlClient.localizeArtwork (8-3P-calibrated; templates loaded ML-side)
 *     → mlClient.classifyArtwork({ gtin, persist_crops:true })  (O1 crop write)
 *     → crosscheckDetections (service, byte-gelijk aan de 8.5-route)
 *     → registerCropsTx for auto-accepted detections (8.6 path, no internal HTTP)
 *
 * Idempotency is a WORKER pre-filter, NOT in the crosscheck service (O2): the
 * worker queries BOTH existing open review items AND existing training-data
 * registrations and drops detections whose (sourceFile, t3777Code, quantized
 * bbox) already exists — this is what stops duplicate review items on re-runs
 * AND double registration on a retry after a partial success.
 *
 * BullMQ retry semantics: the per-job function THROWS on a hard failure (e.g.
 * ML down) so BullMQ retries the job; a sibling image's job is unaffected
 * (per-item isolation, 8.1 pattern). Enqueue itself is best-effort soft-fail in
 * the import flow so a queueing error never breaks an import run.
 */

import { Queue } from 'bullmq';
import { getRedisConnection, PIPELINE_JOB_OPTIONS } from './queue';
import { mlClient } from '../ml-client';
import {
  crosscheckDetections,
  CrosscheckDetection,
} from '../artwork-crosscheck';
import {
  registerCropsTx,
  RegisterableCrop,
  TxClient,
} from '../artwork-registration';
import { ProvenanceMethod } from '../provenance';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('detection-flow');

export const DETECTION_QUEUE = 'artwork-detection';

/** Quantization raster for the dedup bbox key (O3). */
const DEDUP_BBOX_RASTER_PX = parseInt(process.env.DETECTION_DEDUP_RASTER_PX || '8', 10);

// ============================================
// Types
// ============================================

export interface DetectionJobData {
  gtin: string;
  storagePath: string;
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A detection as carried through the worker (camelCase, post-mapping). */
export interface WorkerDetection {
  t3777Code: string;
  bbox: BBox;
  confidence: number;
  method?: string;
  cropPath?: string;
  sourceFile: string;
}

/** Existing item used for the dedup pre-filter (review item OR registration). */
export interface ExistingDetectionKey {
  sourceFile: string | null;
  t3777Code: string;
  bbox: BBox | null | Record<string, unknown>;
}

// ============================================
// Declaration provider (decision 5 — pluggable, default empty)
// ============================================

export type DeclarationProvider = (gtin: string) => Promise<string[]>;

/**
 * Default declaration provider: returns an EMPTY declaration for every GTIN.
 * With an empty declaration the crosscheck routes everything to review (the
 * existing safe behaviour). The real catalog-API provider lands in story 8-3D.
 */
export const emptyDeclarationProvider: DeclarationProvider = async () => [];

let activeDeclarationProvider: DeclarationProvider = emptyDeclarationProvider;

/** Swap the declaration provider (8-3D wires the catalog provider here). */
export function setDeclarationProvider(provider: DeclarationProvider): void {
  activeDeclarationProvider = provider;
}

// ============================================
// Dedup pre-filter (O2/O3)
// ============================================

function quantize(v: number): number {
  // floor division onto the raster: bboxes within the same raster cell collide,
  // so a few-px-shifted re-detection of the same instance dedups (O3). floor —
  // NOT round — so x=9 and x=12 both map to cell 1 on an 8px raster.
  return Math.floor(v / DEDUP_BBOX_RASTER_PX);
}

function bboxKey(bbox: BBox | null | undefined | Record<string, unknown>): string {
  if (!bbox || typeof bbox !== 'object') return 'null';
  const b = bbox as Partial<BBox>;
  if (
    typeof b.x !== 'number' ||
    typeof b.y !== 'number' ||
    typeof b.width !== 'number' ||
    typeof b.height !== 'number'
  ) {
    // declared-but-not-found items have null/empty bbox — key on null so they
    // dedup on (sourceFile, code) alone (reason-type handled by the caller set).
    return 'null';
  }
  return `${quantize(b.x)}:${quantize(b.y)}:${quantize(b.width)}:${quantize(b.height)}`;
}

function detectionKey(sourceFile: string | null | undefined, t3777Code: string, bbox: BBox | null | undefined | Record<string, unknown>): string {
  return `${sourceFile ?? ''}|${t3777Code}|${bboxKey(bbox)}`;
}

/**
 * Drop fresh detections that already have a review item / registration (O2/O3).
 * Pure function: the worker assembles `existing` from both sources and passes
 * it in. Keys on (sourceFile, t3777Code, quantized bbox).
 */
export function dedupDetections<T extends { t3777Code: string; sourceFile?: string | null; bbox: BBox }>(
  fresh: T[],
  existing: ExistingDetectionKey[]
): T[] {
  const seen = new Set(
    existing.map((e) => detectionKey(e.sourceFile, e.t3777Code, e.bbox))
  );
  const kept: T[] = [];
  for (const d of fresh) {
    const key = detectionKey(d.sourceFile, d.t3777Code, d.bbox);
    if (seen.has(key)) continue;
    seen.add(key); // also dedup within the fresh batch
    kept.push(d);
  }
  return kept;
}

// ============================================
// Method mapping (classify → provenance union)
// ============================================

/**
 * classify returns method='embedding'|'classifier'; the provenance union
 * (RegisterableCrop.method) is 'template'|'classifier'|'human'|'synthetic' and
 * has no 'embedding'. Map the model-derived methods onto 'classifier' for the
 * registration provenance (both are automated model verdicts); 'template' is
 * preserved if a future classify path returns it.
 */
function toProvenanceMethod(method?: string): ProvenanceMethod {
  if (method === 'template') return 'template';
  // embedding/classifier/anything-else → classifier (automated model verdict)
  return 'classifier';
}

// ============================================
// Worker job
// ============================================

export interface DetectionJobResult {
  storagePath: string;
  localized: number;
  classified: number;
  reviewItemsCreated: number;
  autoAccepted: number;
}

/**
 * Run the full detection chain for one artwork image. THROWS on a hard ML/DB
 * failure so BullMQ retries the job (per-item isolation, 8.1 pattern).
 */
export async function runDetectionJob(data: DetectionJobData): Promise<DetectionJobResult> {
  const { gtin, storagePath } = data;

  // 1. Localize (templates loaded ML-side; 8-3P calibration applies).
  const localizeResult = await mlClient.localizeArtwork({ storage_path: storagePath });
  const localized = localizeResult.detections ?? [];

  if (localized.length === 0) {
    logger.info('No keurmerk localized on artwork', { gtin, storagePath });
    return { storagePath, localized: 0, classified: 0, reviewItemsCreated: 0, autoAccepted: 0 };
  }

  // 2. Classify each localized region with crop-persistence (O1).
  const crops = localized
    .map((d) => d.bbox as BBox | undefined)
    .filter((b): b is BBox => !!b && typeof b === 'object');

  const classifyResult = await mlClient.classifyArtwork({
    storage_path: storagePath,
    crops,
    gtin,
    persist_crops: true,
  });
  const classified = classifyResult.results ?? [];

  // 3. Map classify results (snake_case) → worker detections (camelCase).
  //    sourceFile is the artwork storage key (classify results don't carry it).
  const detections: WorkerDetection[] = classified
    .filter((r) => r.t3777_code && r.t3777_code !== 'UNKNOWN')
    .map((r) => ({
      t3777Code: r.t3777_code,
      bbox: (r.bbox ?? { x: 0, y: 0, width: 0, height: 0 }) as BBox,
      confidence: r.confidence,
      method: r.method,
      cropPath: r.crop_path ?? undefined,
      sourceFile: storagePath,
    }));

  // 4. Dedup pre-filter (O2/O3) against existing review items + registrations.
  const existing = await loadExistingDetectionKeys(gtin, storagePath);
  const deduped = dedupDetections(detections, existing);

  if (deduped.length === 0) {
    logger.info('All detections already processed (dedup)', { gtin, storagePath });
    return {
      storagePath,
      localized: localized.length,
      classified: classified.length,
      reviewItemsCreated: 0,
      autoAccepted: 0,
    };
  }

  // 5. Crosscheck against the declaration (default empty → all to review).
  const declared = await activeDeclarationProvider(gtin);
  const crosscheckInput: CrosscheckDetection[] = deduped.map((d) => ({
    t3777Code: d.t3777Code,
    confidence: d.confidence,
    bbox: d.bbox,
    method: d.method,
    cropPath: d.cropPath,
    sourceFile: d.sourceFile,
  }));

  const { autoAccepted, reviewItems } = await crosscheckDetections(
    gtin,
    crosscheckInput,
    declared
  );

  // 6. Auto-accepted detections → 8.6 registration path (only those with a crop).
  const registerable: RegisterableCrop[] = autoAccepted
    .filter((d) => !!d.cropPath && !!d.sourceFile)
    .map((d) => ({
      t3777Code: d.t3777Code,
      cropPath: d.cropPath as string,
      sourceFile: d.sourceFile as string,
      bbox: d.bbox,
      method: toProvenanceMethod(d.method),
      confidence: d.confidence,
    }));

  if (registerable.length > 0) {
    await prisma.$transaction(async (tx) =>
      registerCropsTx(tx as TxClient, gtin, registerable)
    );
  }

  logger.info('Detection job complete', {
    gtin,
    storagePath,
    localized: localized.length,
    classified: classified.length,
    reviewItems: reviewItems.length,
    autoAccepted: registerable.length,
  });

  return {
    storagePath,
    localized: localized.length,
    classified: classified.length,
    reviewItemsCreated: reviewItems.length,
    autoAccepted: registerable.length,
  };
}

/**
 * Assemble the dedup key-set from BOTH existing open review items AND existing
 * training-data registrations for this artwork (so a retry after a partial
 * success neither re-creates review items nor double-registers).
 */
async function loadExistingDetectionKeys(
  gtin: string,
  storagePath: string
): Promise<ExistingDetectionKey[]> {
  const keys: ExistingDetectionKey[] = [];

  const reviewItems = await prisma.artworkReviewItem.findMany({
    where: { gtin, sourceFile: storagePath },
    select: { sourceFile: true, t3777Code: true, bbox: true },
  });
  for (const r of reviewItems) {
    keys.push({ sourceFile: r.sourceFile, t3777Code: r.t3777Code, bbox: r.bbox as BBox | null });
  }

  // Registrations: training-data carries the source + bbox in provenance JSON.
  const registrations = await prisma.trainingData.findMany({
    where: {
      active: true,
      provenance: { path: ['sourceFile'], equals: storagePath },
    },
    select: { label: true, provenance: true },
  });
  for (const t of registrations) {
    const prov = (t.provenance ?? {}) as { sourceFile?: string; bbox?: BBox };
    keys.push({
      sourceFile: prov.sourceFile ?? storagePath,
      t3777Code: t.label,
      bbox: prov.bbox ?? null,
    });
  }

  return keys;
}

// ============================================
// Enqueue (decision 7 — per image / per PDF page)
// ============================================

export interface ImportedArtworkForEnqueue {
  gtin: string;
  mimeType?: string;
  storagePath: string;
  pages?: {
    dpi?: number;
    pages?: Array<{ page: number; imagePath: string }>;
    error?: string;
  } | null;
}

/**
 * Enqueue detection jobs for one freshly-imported artwork (O5):
 *   - JPG/PNG  → one job on the storage key.
 *   - PDF      → one job PER rasterized page (pages.pages[].imagePath); the raw
 *                PDF itself is never localized.
 * Returns the enqueued job descriptors (also handy for tests/diagnostics).
 */
export async function enqueueDetectionForImport(
  imported: ImportedArtworkForEnqueue
): Promise<Array<{ gtin: string; storagePath: string; jobId?: string }>> {
  const isPdf =
    (imported.mimeType ?? '').toLowerCase() === 'application/pdf' ||
    imported.storagePath.toLowerCase().endsWith('.pdf');

  const targets: string[] = [];
  if (isPdf) {
    for (const p of imported.pages?.pages ?? []) {
      if (p.imagePath) targets.push(p.imagePath);
    }
  } else {
    targets.push(imported.storagePath);
  }

  if (targets.length === 0) return [];

  const connection = getRedisConnection();
  const queue = new Queue(DETECTION_QUEUE, { connection });
  const enqueued: Array<{ gtin: string; storagePath: string; jobId?: string }> = [];
  try {
    for (const storagePath of targets) {
      const job = await queue.add(
        'detect-artwork',
        { gtin: imported.gtin, storagePath } as DetectionJobData,
        // 9.1 retry/backoff (decision 1) MUST be spread in here: BullMQ reads
        // attempts/backoff from the options serialized by THIS adding instance,
        // not from the factory's separate instance. Stable jobId per (gtin,
        // image) → BullMQ dedups duplicate enqueues.
        { ...PIPELINE_JOB_OPTIONS, jobId: `detect:${imported.gtin}:${storagePath}` }
      );
      enqueued.push({ gtin: imported.gtin, storagePath, jobId: job?.id });
    }
  } finally {
    await queue.close();
  }

  return enqueued;
}
