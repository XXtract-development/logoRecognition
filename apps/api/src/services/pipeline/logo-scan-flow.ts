/**
 * Logo-scan flow (Story 1.2): asynchronous "request a scan, poll for the result".
 *
 *   POST  → validate image → state `pending` + image bytes in Redis → job on queue `logo-scan`
 *   worker → state `running` → localize + classify (same ML calls as /detect) → `done` | `failed`
 *   GET   → state from Redis
 *
 * State lives in Redis only (TTL 24 h): no Prisma model, no migration (the `logo_scans`
 * table, deduplication and `attempt` arrive in Story 1.3; the GS1 block in Story 1.5).
 */
import { Queue, Worker } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getRedisConnection } from './queue';
import { mlClient } from '../ml-client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { normalizeReferenceCode } from '../field-type-mapping';
import {
  GHS_REFERENCE_PAIRS, MAX_DECODED_PIXELS, MAX_NORMALIZED_BYTES, assertCompleteClassification, boxKey, validBox,
} from '../../api/legacy-detect';

const logger = createLogger('logo-scan-flow');

/** Maximum time from accepted request to `done` or `failed`; after it a scan is `failed`/`timeout`. */
export const LOGO_SCAN_MAX_MS = 300000;
/** Largest image accepted. Equals the multipart fileSize limit in main.ts (10 MB). */
export const LOGO_SCAN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Largest decoded image, in pixels (same guard as /detect). */
export const LOGO_SCAN_MAX_PIXELS = MAX_DECODED_PIXELS;
/** Seconds advised to a caller that is turned away because the service is busy. */
export const LOGO_SCAN_RETRY_AFTER_S = 5;
const STATE_TTL_S = 86400;
const IMAGE_TTL_S = 3600;
export const LOGO_SCAN_QUEUE = 'logo-scan';
const MAX_CROPS = 64;
const ADMISSION_DEADLINE_MS = 3000;

const stateKey = (id: string) => `logo-scan:state:${id}`;
const imageKey = (id: string) => `logo-scan:image:${id}`;
const envInt = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export type LogoScanStatus = 'pending' | 'running' | 'done' | 'failed';
export type LogoScanReason = 'timeout' | 'invalid_image' | 'recognition_unavailable';

export interface LogoScanState {
  scanId: string;
  status: LogoScanStatus;
  reason?: LogoScanReason;
  logoResults?: { schemaVersion: 'pending'; detections: unknown[]; items: unknown[] };
  /** Run time of the worker for this scan (excludes queue wait); the p50/p95 metric. */
  processingTimeMs?: number;
  createdAt: number;
  imageHash: string;
  consumer: string;
  productId?: string;
  pipelineId?: string;
  gpcCategoryCode?: string;
}

export class LogoScanBusyError extends Error {}

let queue: Queue | null = null;
const getQueue = () => (queue ??= new Queue(LOGO_SCAN_QUEUE, { connection: getRedisConnection() }));

async function writeState(state: LogoScanState) {
  await getRedisConnection().setex(stateKey(state.scanId), STATE_TTL_S, JSON.stringify(state));
}
// Compare-and-set: never overwrite a terminal state, so a late worker or a read-time timeout cannot undo `done`/`failed`.
const WRITE_IF_OPEN = `local c = redis.call('GET', KEYS[1])
if c then local s = cjson.decode(c).status if s == 'done' or s == 'failed' then return 0 end end
redis.call('SETEX', KEYS[1], ARGV[2], ARGV[1]) return 1`;
async function writeIfOpen(state: LogoScanState): Promise<boolean> {
  const r = await getRedisConnection().eval(WRITE_IF_OPEN, 1, stateKey(state.scanId), JSON.stringify(state), String(STATE_TTL_S));
  return r === 1;
}
async function readState(scanId: string): Promise<LogoScanState | null> {
  const raw = await getRedisConnection().get(stateKey(scanId));
  return raw ? (JSON.parse(raw) as LogoScanState) : null;
}
const terminal = (s: LogoScanState) => s.status === 'done' || s.status === 'failed';

// Admissions run one at a time so the capacity check and the enqueue cannot interleave.
// ponytail: per API instance; with several instances the cap is approximate, per-instance mutex is enough for now.
let admission: Promise<unknown> = Promise.resolve();

export function submitLogoScan(input: {
  image: Buffer; consumer: string; productId?: string; pipelineId?: string; gpcCategoryCode?: string;
}): Promise<{ scanId: string }> {
  const body = async () => {
    const q = getQueue();
    const [waiting, active] = await Promise.all([q.getWaitingCount(), q.getActiveCount()]);
    if (waiting + active >= envInt('LOGO_SCAN_MAX_QUEUED', 20)) throw new LogoScanBusyError('queue full');
    const scanId = randomUUID();
    const redis = getRedisConnection();
    try {
      await writeState({
        scanId, status: 'pending', createdAt: Date.now(), consumer: input.consumer,
        imageHash: createHash('sha256').update(input.image).digest('hex'),
        productId: input.productId, pipelineId: input.pipelineId, gpcCategoryCode: input.gpcCategoryCode,
      });
      await redis.setex(imageKey(scanId), IMAGE_TTL_S, input.image);
      // attempts 1: a retry would eat into the 300 s limit; re-scanning is Story 1.3's `attempt`.
      // jobId = scanId: a fixed id would silently drop a second add.
      await q.add('logo-scan', { scanId }, { jobId: scanId, attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: STATE_TTL_S } });
    } catch (err) {
      await Promise.allSettled([redis.del(stateKey(scanId)), redis.del(imageKey(scanId))]);
      logger.error('logo-scan enqueue failed', { error: err instanceof Error ? err.message : 'unknown' });
      throw new LogoScanBusyError('enqueue failed');
    }
    return { scanId };
  };
  // A stalled Redis must give a 503, not a hanging request that also blocks every later admission.
  // ponytail: a call that completes after this deadline may still enqueue a scan nobody was told about; it simply expires.
  const run = admission.then(() => withDeadline(body(), ADMISSION_DEADLINE_MS).catch(err => {
    throw err instanceof TimeoutError ? new LogoScanBusyError('admission timed out') : err;
  }));
  admission = run.catch(() => undefined);
  return run;
}

/** Read a scan; a pending/running scan past the maximum time (e.g. dead worker) becomes failed/timeout. */
export async function getLogoScan(scanId: string): Promise<LogoScanState | null> {
  const state = await readState(scanId);
  if (state && !terminal(state) && Date.now() > state.createdAt + LOGO_SCAN_MAX_MS) {
    const failed: LogoScanState = { ...state, status: 'failed', reason: 'timeout' };
    if (await writeIfOpen(failed)) return failed;
    return readState(scanId); // the worker finished first
  }
  return state;
}

class TimeoutError extends Error {}
class InvalidImageError extends Error {}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError('deadline')), Math.max(ms, 0)); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** Existing recognition (as /detect): normalize, localize, classify. Returns the raw classified results. */
async function recognize(image: Buffer, deadline: number) {
  const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new TimeoutError('deadline'); return ms; };
  let normalized;
  try {
    normalized = await sharp(image, { limitInputPixels: LOGO_SCAN_MAX_PIXELS, animated: false }).rotate().png().toBuffer({ resolveWithObject: true });
  } catch { throw new InvalidImageError('undecodable'); }
  if (normalized.data.length > MAX_NORMALIZED_BYTES) throw new InvalidImageError('normalized too large');
  const references = await prisma.referenceLogo.findMany({ where: { active: true }, select: { t3777Code: true, fieldType: true } });
  const codes = [...new Set([...references, ...GHS_REFERENCE_PAIRS].map(r => normalizeReferenceCode(r.t3777Code)))];
  const image_b64 = normalized.data.toString('base64');
  const { width, height } = normalized.info;
  const localizeBudget = remaining();
  const localized = await mlClient.localizeArtwork({
    proposal_strategy: 'visual', strict_runtime: true, remaining_budget_ms: localizeBudget, image_b64, codes,
  }, { timeoutMs: localizeBudget });
  if (localized.truncated !== false || !Array.isArray(localized.detections)) throw new Error('Localization did not complete');
  const crops = localized.detections.map(d => d.bbox).filter(b => validBox(b, width, height));
  if (crops.length !== localized.detections.length || crops.length > MAX_CROPS || new Set(crops.map(boxKey)).size !== crops.length) {
    throw new Error('Localization returned unusable regions');
  }
  if (!crops.length) return [];
  const classifyBudget = remaining();
  const classified = await mlClient.classifyArtwork({
    strict_runtime: true, remaining_budget_ms: classifyBudget, image_b64, crops, confidence_threshold: 0.99, persist_crops: false,
  }, { timeoutMs: classifyBudget });
  assertCompleteClassification(classified.results, crops, width, height);
  return classified.results;
}

export async function runLogoScanJob({ scanId }: { scanId: string }): Promise<void> {
  const redis = getRedisConnection();
  const state = await readState(scanId);
  if (!state || terminal(state)) return;
  const finish = async (patch: Partial<LogoScanState>) => {
    await writeIfOpen({ ...(await readState(scanId) ?? state), ...patch }); // no-op if already terminal
  };
  const deadline = state.createdAt + LOGO_SCAN_MAX_MS;
  const started = Date.now();
  try {
    if (started >= deadline) throw new TimeoutError('expired in queue');
    if (!await writeIfOpen({ ...state, status: 'running' })) return; // already timed out on read
    const image = await redis.getBuffer(imageKey(scanId));
    if (!image) throw new Error('image no longer available');
    const detections = await withDeadline(recognize(image, deadline), deadline - started);
    await finish({
      status: 'done', processingTimeMs: Date.now() - started,
      logoResults: { schemaVersion: 'pending', detections, items: [] },
    });
  } catch (err) {
    const reason: LogoScanReason = err instanceof TimeoutError ? 'timeout' : err instanceof InvalidImageError ? 'invalid_image' : 'recognition_unavailable';
    logger.error('logo-scan failed', { scanId, reason, error: err instanceof Error ? err.message : 'unknown' });
    await finish({ status: 'failed', reason, processingTimeMs: Date.now() - started });
  } finally {
    await redis.del(imageKey(scanId));
  }
  const final = await readState(scanId);
  logger.info('logo-scan finished', { scanId, status: final?.status, processingTimeMs: final?.processingTimeMs, consumer: state.consumer });
}

let logoScanWorker: Worker | null = null;
/** Register the `logo-scan` worker. Concurrency LOGO_SCAN_CONCURRENCY (default 2). */
export function registerLogoScanWorker(): Worker {
  if (logoScanWorker) return logoScanWorker;
  logoScanWorker = new Worker(LOGO_SCAN_QUEUE, job => runLogoScanJob(job.data as { scanId: string }), {
    connection: getRedisConnection(), concurrency: envInt('LOGO_SCAN_CONCURRENCY', 2),
  });
  // A crashed or stalled job must not stay pending/running: mark it failed.
  logoScanWorker.on('failed', (job, err) => {
    logger.error('logo-scan job crashed', { jobId: job?.id, error: err.message });
    if (!job?.data?.scanId) return;
    readState(job.data.scanId)
      .then(st => st && writeIfOpen({ ...st, status: 'failed', reason: 'recognition_unavailable' }))
      .catch(() => undefined);
  });
  return logoScanWorker;
}

/** Graceful shutdown: close the worker and queue. */
export async function closeLogoScanFlow(): Promise<void> {
  await Promise.allSettled([logoScanWorker?.close(), queue?.close()]);
  logoScanWorker = null; queue = null;
}
