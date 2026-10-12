/**
 * Logo-scan flow (Story 1.2): asynchronous "request a scan, poll for the result".
 *
 *   POST  → validate image → state `pending` + image bytes in Redis → job on queue `logo-scan`
 *   worker → state `running` → localize + classify (same ML calls as /detect) → `done` | `failed`
 *   GET   → state from Redis
 *
 * State lives in Redis (TTL 24 h). Story 1.3 adds the `logo_scans` table (kept 12 months): a `done`
 * scan with the same key is reused (`deduplicated`), `attempt` counts re-runs, and `logo_current_image`
 * decides which image of a product is current (an older one is `superseded`). All database access is in
 * logo-scan-store.ts and tolerant: without the table everything behaves as in Story 1.2.
 * The GS1 block (Story 1.5) is built by gs1-block.ts.
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
  GHS_REFERENCE_PAIRS, MAX_DECODED_PIXELS, MAX_NORMALIZED_BYTES, SCORE_KINDS, boxKey, validBox,
} from '../../api/legacy-detect';
import { buildLogoResults, validateLogoResults, type LogoResults, type RawDetection } from './gs1-block';
import { beperkSoorten } from '../zoekruimte';
import { policyVersion } from '../gs1-mapping';
import { closeLogoScanCleanup } from './logo-scan-cleanup';
import {
  advanceCurrentImage, currentImage, findReusableScan, findScan, insertScan, markRunning, referencePoolVersion, saveOutcome, type ScanRow,
} from './logo-scan-store';

const logger = createLogger('logo-scan-flow');

/** Maximum time from accepted request to `done` or `failed`; after it a scan is `failed`/`timeout`. */
export const LOGO_SCAN_MAX_MS = 240000;
/** ml-service `remaining_budget_ms` is validated le=165000 (apps/ml-service/app/api/artwork.py); above that it answers 422. */
export const ML_MAX_BUDGET_MS = 165000;
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
const DB_READ_DEADLINE_MS = 1000;

const stateKey = (id: string) => `logo-scan:state:${id}`;
const imageKey = (id: string) => `logo-scan:image:${id}`;
const envInt = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export type LogoScanStatus = 'pending' | 'running' | 'done' | 'failed' | 'superseded';
export type LogoScanReason = 'timeout' | 'invalid_image' | 'recognition_unavailable' | 'result_invalid';

export interface LogoScanState {
  scanId: string;
  status: LogoScanStatus;
  reason?: LogoScanReason;
  logoResults?: LogoResults;
  /** Run time of the worker for this scan (excludes queue wait); the p50/p95 metric. */
  processingTimeMs?: number;
  createdAt: number;
  imageHash: string;
  consumer: string;
  productId?: string;
  pipelineId?: string;
  gpcCategoryCode?: string;
  /** OCR signal word from n8n (DANGER|WARNING only); copied into logoResults.signaalwoord. */
  signalWord?: string;
  /** Reference pool version at admission (`referencePoolVersion()`); absent when the database was unavailable. */
  referenceVersion?: string;
  /** Step-1 measurement; stored next to logoResults in the row, never in the GET response. */
  stap1?: Stap1;
}

/**
 * What step 1 (localization) produced, per scan, for later measurement from `logo_scans.logo_results.stap1`.
 * Counts: `voorstellen` visual proposals after merging duplicates, `verfijnd` refined boxes, `ghs` GHS detections (null when the ml image
 * did not report them), `vakjes` boxes sent to classify. After a successful localization also `aanroepen` provider calls,
 * `tokensIn`/`tokensUit` summed provider tokens, `overgeslagen` invalid boxes skipped, `weggevallen` boxes cut by the
 * 64-box cap before and after refinement and `onverfijnd` proposals left unrefined to keep the time reserve (each null
 * when the ml image did not report it). A failed scan adds `fase` + `fout` (the ml error class when parseable).
 */
export type Stap1 = {
  voorstellen?: number | null; verfijnd?: number | null; ghs?: number | null; vakjes?: number;
  aanroepen?: number | null; tokensIn?: number | null; tokensUit?: number | null; overgeslagen?: number | null; weggevallen?: number | null; onverfijnd?: number | null;
  fase?: 'lokalisatie' | 'classificatie' | 'beeld' | 'wachtrij' | 'resultaat'; fout?: string;
};

export class LogoScanBusyError extends Error {}

let queue: Queue | null = null;
const getQueue = () => (queue ??= new Queue(LOGO_SCAN_QUEUE, { connection: getRedisConnection() }));

async function writeState(state: LogoScanState) {
  await getRedisConnection().setex(stateKey(state.scanId), STATE_TTL_S, JSON.stringify(state));
}
// Compare-and-set: never overwrite a terminal state, so a late worker or a read-time timeout cannot undo `done`/`failed`.
const WRITE_IF_OPEN = `local c = redis.call('GET', KEYS[1])
if c then local s = cjson.decode(c).status if s == 'done' or s == 'failed' or s == 'superseded' then return 0 end end
redis.call('SETEX', KEYS[1], ARGV[2], ARGV[1]) return 1`;
async function writeIfOpen(state: LogoScanState): Promise<boolean> {
  const r = await getRedisConnection().eval(WRITE_IF_OPEN, 1, stateKey(state.scanId), JSON.stringify(state), String(STATE_TTL_S));
  return r === 1;
}
async function readState(scanId: string): Promise<LogoScanState | null> {
  const raw = await getRedisConnection().get(stateKey(scanId));
  return raw ? (JSON.parse(raw) as LogoScanState) : null;
}
const terminal = (s: LogoScanState) => s.status === 'done' || s.status === 'failed' || s.status === 'superseded';
const supersededState = (s: LogoScanState): LogoScanState => ({ ...s, status: 'superseded', logoResults: undefined });

// Admissions run one at a time so the capacity check and the enqueue cannot interleave.
// ponytail: per API instance; with several instances the cap is approximate, per-instance mutex is enough for now.
let admission: Promise<unknown> = Promise.resolve();
let lastServerStamp = 0;

export function submitLogoScan(input: {
  image: Buffer; consumer: string; productId?: string; pipelineId?: string; gpcCategoryCode?: string; signalWord?: string;
  rescan?: boolean; requestedAt?: string;
}): Promise<{ scanId: string; deduplicated?: true }> {
  const body = async () => {
    const imageHash = createHash('sha256').update(input.image).digest('hex');
    const { productId } = input;
    // Request time decides "forward": the caller's requestedAt unless unreadable or more than 60 s ahead.
    const now = Date.now();
    const asked = input.requestedAt ? Date.parse(input.requestedAt) : NaN;
    // Server time is made strictly increasing per instance, so two requests in the same millisecond keep their arrival order.
    const stamp = Math.max(now, lastServerStamp + 1);
    const callerTime = Number.isFinite(asked) && asked <= now + 60000;
    if (!callerTime) lastServerStamp = stamp;
    const requestedAt = new Date(callerTime ? asked : stamp);
    const modelVersion = process.env.LOGO_MODEL_VERSION?.trim() || undefined;
    // Reads run inside the serialized admission: a slow database must not stall every POST, so each read has a short deadline and counts as "unavailable".
    const guarded = <T>(work: Promise<T>) => withDeadline(work, DB_READ_DEADLINE_MS).catch(() => undefined);
    const referenceVersion = await guarded(referencePoolVersion());
    const cur = productId && referenceVersion ? await guarded(currentImage(productId)) : null;
    const dbOn = referenceVersion !== undefined && cur !== undefined; // false: table missing or database down → Story 1.2 behaviour
    const tracked = { imageHash, modelVersion: modelVersion ?? 'unknown', referenceVersion: referenceVersion ?? '', policyVersion: policyVersion(), consumer: input.consumer, requestedAt };
    const base: LogoScanState = {
      scanId: '', status: 'pending', createdAt: now, consumer: input.consumer, imageHash,
      productId, pipelineId: input.pipelineId, gpcCategoryCode: input.gpcCategoryCode,
      signalWord: input.signalWord === 'DANGER' || input.signalWord === 'WARNING' ? input.signalWord : undefined,
      referenceVersion: referenceVersion || undefined,
    };

    if (dbOn && productId && cur && cur.imageHash !== imageHash && requestedAt <= cur.requestedAt) {
      // An older (or equally old: the existing one stays) image than the current one: no job, no recognition.
      const scanId = randomUUID();
      await insertScan({ ...tracked, scanId, productId, pipelineId: input.pipelineId, status: 'superseded' });
      await writeState({ ...base, scanId, status: 'superseded' });
      return { scanId };
    }
    if (dbOn && productId && !input.rescan && modelVersion) {
      const hit = await guarded(findReusableScan({ productId, imageHash, modelVersion, referenceVersion: referenceVersion! }, input.consumer, new Date(now - 86400000)));
      // A stored result is only reusable when it was made for the same signal word, category and mapping policy as this request.
      if (hit && sameRequest(hit, base)) {
        await advanceCurrentImage(productId, imageHash, requestedAt, cur ?? null);
        logger.info('logo-scan deduplicated', { consumer: input.consumer, pipelineId: input.pipelineId, reusedScanId: hit.scanId });
        return { scanId: hit.scanId, deduplicated: true as const };
      }
    }

    const q = getQueue();
    const [waiting, active] = await Promise.all([q.getWaitingCount(), q.getActiveCount()]);
    if (waiting + active >= envInt('LOGO_SCAN_MAX_QUEUED', 20)) throw new LogoScanBusyError('queue full');
    const scanId = randomUUID();
    const redis = getRedisConnection();
    try {
      if (dbOn) await insertScan({ ...tracked, scanId, productId, pipelineId: input.pipelineId, status: 'pending' });
      await writeState({ ...base, scanId });
      await redis.setex(imageKey(scanId), IMAGE_TTL_S, input.image);
      // attempts 1: a retry would eat into the 240 s limit; a re-run is a new scan with attempt + 1.
      // jobId = scanId: a fixed id would silently drop a second add.
      await q.add('logo-scan', { scanId }, { jobId: scanId, attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: STATE_TTL_S } });
      // Only after a successful enqueue: a failed enqueue must not leave the product pointing at a scan that never ran.
      if (dbOn && productId) await advanceCurrentImage(productId, imageHash, requestedAt, cur ?? null);
    } catch (err) {
      await Promise.allSettled([redis.del(stateKey(scanId)), redis.del(imageKey(scanId)), saveOutcome(scanId, { status: 'failed', reason: 'recognition_unavailable' })]);
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

const GPC = /^\d{8}$/;
function sameRequest(hit: ScanRow, base: LogoScanState): boolean {
  const results = (hit.logoResults ?? {}) as { signaalwoord?: string; zoekruimte?: { gpcCategoryCode?: string } };
  const gpc = base.gpcCategoryCode && GPC.test(base.gpcCategoryCode) ? base.gpcCategoryCode : undefined;
  return results.signaalwoord === base.signalWord && results.zoekruimte?.gpcCategoryCode === gpc && hit.policyVersion === policyVersion();
}

function stateFromRow(row: ScanRow): LogoScanState {
  // `stap1` lives next to the schema fields in the row; the state keeps it apart so the response stays schema-valid.
  const { stap1, ...logoResults } = (row.logoResults ?? {}) as LogoResults & { stap1?: Stap1 };
  return {
    scanId: row.scanId, status: row.status as LogoScanStatus, reason: (row.reason ?? undefined) as LogoScanReason | undefined,
    logoResults: row.logoResults ? logoResults : undefined, stap1: row.logoResults ? stap1 : undefined,
    processingTimeMs: row.processingTimeMs ?? undefined,
    createdAt: new Date(row.createdAt).getTime(), imageHash: row.imageHash, consumer: row.consumer,
    productId: row.productId ?? undefined, pipelineId: row.pipelineId ?? undefined,
    referenceVersion: row.referenceVersion || undefined,
  };
}

/** Read a scan: Redis first, then the table. A pending/running scan past the maximum time (e.g. dead worker) becomes failed/timeout. */
export async function getLogoScan(scanId: string): Promise<LogoScanState | null> {
  let state = await readState(scanId);
  if (!state) {
    const row = await findScan(scanId);
    state = row ? stateFromRow(row) : null;
  }
  if (state && !terminal(state) && state.productId) {
    // A newer image may have superseded this scan while Redis still says pending/running.
    const row = await findScan(scanId);
    if (row?.status === 'superseded') {
      const result = supersededState(state);
      return (await writeIfOpen(result)) ? result : readState(scanId);
    }
  }
  if (state && !terminal(state) && Date.now() > state.createdAt + LOGO_SCAN_MAX_MS) {
    const failed = failedState(state, 'timeout', { stap1: { fase: state.status === 'running' ? 'lokalisatie' : 'wachtrij', fout: 'timeout' } });
    const outcome = await saveOutcome(scanId, { status: 'failed', reason: 'timeout', logoResults: { ...failed.logoResults, stap1: failed.stap1 } });
    if (outcome === 'skipped') {
      const row = await findScan(scanId); // the worker may have stored the result a moment ago
      if (row && row.status !== 'pending' && row.status !== 'running') return stateFromRow(row);
    }
    const result = outcome === 'superseded' ? supersededState(state) : failed;
    if (await writeIfOpen(result)) return result;
    return readState(scanId); // the worker finished first
  }
  return state;
}

/** A failed scan still carries a schema-valid logoResults (status failed + reason, no items). */
function failedState(state: LogoScanState, reason: LogoScanReason, patch: Partial<LogoScanState> = {}): LogoScanState {
  return {
    ...state, ...patch, status: 'failed', reason,
    logoResults: buildLogoResults({
      scanId: state.scanId, productId: state.productId, imageHash: state.imageHash, status: 'failed', reason,
      modelVersion: process.env.LOGO_MODEL_VERSION, referenceVersion: state.referenceVersion, signalWord: state.signalWord,
      width: 1, height: 1, detections: [],
    }),
  };
}

class TimeoutError extends Error {}
class InvalidImageError extends Error {}
class ResultInvalidError extends Error {}
class ImageMissingError extends Error {}
/** A recognition failure that knows in which phase it happened and what step 1 had produced so far. */
class RecognizeError extends Error {
  constructor(message: string, public stap1: Stap1) { super(message); }
}

/** Error class for `stap1.fout`: the ml 503 class when parseable, else `ml_status_<n>`, else the message capped at 100 chars. */
function foutklasse(err: unknown): string {
  const ml = (err ?? {}) as { statusCode?: unknown; detail?: unknown };
  if (typeof ml.statusCode === 'number' && typeof ml.detail === 'string') {
    return /\(([A-Za-z0-9_]+)\)$/.exec(ml.detail)?.[1] ?? `ml_status_${ml.statusCode}`;
  }
  return (err instanceof Error ? err.message : 'unknown').slice(0, 100);
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeoutError('deadline')), Math.max(ms, 0)); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/** Existing recognition (as /detect): normalize, localize, classify. Returns the valid classified results plus the image size; `partial` when not every region was classified. */
async function recognize(image: Buffer, deadline: number, stap1: Stap1, gpcCategoryCode?: string) {
  const remaining = () => { const ms = deadline - Date.now(); if (ms <= 0) throw new TimeoutError('deadline'); return ms; };
  let normalized;
  try {
    normalized = await sharp(image, { limitInputPixels: LOGO_SCAN_MAX_PIXELS, animated: false }).rotate().png().toBuffer({ resolveWithObject: true });
  } catch { throw new InvalidImageError('undecodable'); }
  if (normalized.data.length > MAX_NORMALIZED_BYTES) throw new InvalidImageError('normalized too large');
  const references = await prisma.referenceLogo.findMany({ where: { active: true }, select: { t3777Code: true, fieldType: true } });
  const alle = [...new Set([...references, ...GHS_REFERENCE_PAIRS].map(r => normalizeReferenceCode(r.t3777Code)))];
  const { codes, zoekruimte } = beperkSoorten(alle, gpcCategoryCode);
  const image_b64 = normalized.data.toString('base64');
  const { width, height } = normalized.info;
  // The ML service rejects (422) a time budget above 165 s, while a scan may run up to LOGO_SCAN_MAX_MS: cap what is sent.
  const localizeBudget = Math.min(remaining(), ML_MAX_BUDGET_MS);
  // `stap1` is owned by the caller so a later timeout or invalid result still keeps the counts and the phase.
  const fail = (fase: Stap1['fase'], err: unknown, fout = foutklasse(err)): never => {
    throw new RecognizeError(err instanceof Error ? err.message : String(err), { ...stap1, fase, fout });
  };
  stap1.fase = 'lokalisatie';
  const localized = await mlClient.localizeArtwork({
    proposal_strategy: 'visual', strict_runtime: true, remaining_budget_ms: localizeBudget, image_b64, codes,
  }, { timeoutMs: localizeBudget }).catch(err => fail('lokalisatie', err));
  if (localized.truncated !== false || !Array.isArray(localized.detections)) fail('lokalisatie', new Error('Localization did not complete'), 'incomplete_localization');
  const p = localized.proposals;
  Object.assign(stap1, { voorstellen: p?.raw ?? null, verfijnd: p?.refined ?? null, ghs: p?.ghs ?? null, vakjes: localized.detections.length });
  const crops = localized.detections.map(d => d.bbox).filter(b => validBox(b, width, height));
  if (crops.length !== localized.detections.length || crops.length > MAX_CROPS || new Set(crops.map(boxKey)).size !== crops.length) {
    fail('lokalisatie', new Error('Localization returned unusable regions'), 'unusable_regions');
  }
  // Calls and tokens only after a successful localization; a failed one leaves them absent.
  Object.assign(stap1, {
    aanroepen: p?.calls ?? null, tokensIn: p?.tokens_in ?? null, tokensUit: p?.tokens_out ?? null,
    overgeslagen: p?.skipped ?? null, weggevallen: p?.dropped ?? null, onverfijnd: p?.unrefined ?? null,
  });
  if (!crops.length) { delete stap1.fase; return { results: [] as RawDetection[], width, height, partial: false, zoekruimte }; }
  stap1.fase = 'classificatie';
  const classifyBudget = Math.min(remaining(), ML_MAX_BUDGET_MS);
  // No confidence_threshold: the ml-service applies its per-method threshold, so `twijfelachtig` means real doubt.
  const classified = await mlClient.classifyArtwork({
    strict_runtime: true, remaining_budget_ms: classifyBudget, image_b64, crops, persist_crops: false,
  }, { timeoutMs: classifyBudget }).catch(err => fail('classificatie', err));
  if (!Array.isArray(classified.results)) fail('classificatie', new Error('Classification response is malformed'), 'malformed_results');
  // Keep each result that matches a distinct requested region and is well-formed; a gap makes the scan `partial`, none at all is a failure.
  const open = new Set(crops.map(boxKey));
  const results = classified.results.filter(r => {
    const ok = validBox(r?.bbox, width, height) && open.has(boxKey(r.bbox)) && Number.isFinite(r.confidence) &&
      r.confidence >= 0 && r.confidence <= 1 && Object.prototype.hasOwnProperty.call(SCORE_KINDS, r.method) &&
      typeof r.t3777_code === 'string' && !!r.t3777_code.trim();
    if (ok) open.delete(boxKey(r.bbox!));
    return ok;
  }) as RawDetection[];
  if (!results.length) fail('classificatie', new Error('Classification evidence is malformed'), 'malformed_results');
  delete stap1.fase;
  return { results, width, height, partial: open.size > 0, zoekruimte };
}

/** `stap1` for a failed job: what `recognize` recorded, else the phase and error derived from the error type. */
function stap1Bij(err: unknown, expiredInQueue: boolean, seen: Stap1): Stap1 {
  if (err instanceof RecognizeError) return err.stap1;
  if (err instanceof TimeoutError) return { ...seen, fase: expiredInQueue ? 'wachtrij' : seen.fase ?? 'lokalisatie', fout: 'timeout' };
  if (err instanceof InvalidImageError) return { fase: 'beeld', fout: 'invalid_image' };
  if (err instanceof ResultInvalidError) return { ...seen, fase: 'resultaat', fout: 'result_invalid' };
  if (err instanceof ImageMissingError) return { fase: 'beeld', fout: 'image_missing' };
  return { ...seen, fase: seen.fase ?? 'lokalisatie', fout: (err instanceof Error ? err.message : 'unknown').slice(0, 100) };
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
  const stap1: Stap1 = {};
  try {
    if (started >= deadline) throw new TimeoutError('expired in queue');
    if (await markRunning(scanId) === 'superseded') { await writeIfOpen(supersededState(await readState(scanId) ?? state)); return; }
    if (!await writeIfOpen({ ...state, status: 'running' })) return; // already timed out on read
    const image = await redis.getBuffer(imageKey(scanId));
    if (!image) throw new ImageMissingError('image no longer available');
    const { results, width, height, partial, zoekruimte } = await withDeadline(recognize(image, deadline, stap1, state.gpcCategoryCode), deadline - started);
    const logoResults = buildLogoResults({
      scanId, productId: state.productId, imageHash: state.imageHash, status: partial ? 'partial' : 'ok',
      reason: partial ? 'classification_incomplete' : undefined, modelVersion: process.env.LOGO_MODEL_VERSION,
      referenceVersion: state.referenceVersion, signalWord: state.signalWord, width, height, detections: results, zoekruimte,
    });
    const problems = validateLogoResults(logoResults);
    if (problems.length) throw new ResultInvalidError(problems.slice(0, 3).join('; '));
    const processingTimeMs = Date.now() - started;
    // Compare-and-set in the table: a scan superseded while it ran is not stored as done.
    // `stap1` goes into the row next to the schema fields; the state keeps it apart so the response stays schema-valid.
    if (await saveOutcome(scanId, { status: 'done', processingTimeMs, logoResults: { ...logoResults, stap1 } }) === 'superseded') {
      await writeIfOpen(supersededState(await readState(scanId) ?? state));
    } else {
      await finish({ status: 'done', processingTimeMs, logoResults, stap1 });
    }
  } catch (err) {
    const reason: LogoScanReason = err instanceof TimeoutError ? 'timeout' : err instanceof InvalidImageError ? 'invalid_image'
      : err instanceof ResultInvalidError ? 'result_invalid' : 'recognition_unavailable';
    logger.error('logo-scan failed', { scanId, reason, error: err instanceof Error ? err.message : 'unknown' });
    const current = await readState(scanId) ?? state;
    const failed = failedState(current, reason, { processingTimeMs: Date.now() - started, stap1: stap1Bij(err, started >= deadline, stap1) });
    const outcome = await saveOutcome(scanId, {
      status: 'failed', reason, logoResults: { ...failed.logoResults, stap1: failed.stap1 }, processingTimeMs: failed.processingTimeMs,
    });
    await writeIfOpen(outcome === 'superseded' ? supersededState(current) : failed);
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
      .then(st => st && writeIfOpen(failedState(st, 'recognition_unavailable')))
      .catch(() => undefined);
  });
  return logoScanWorker;
}

/** Graceful shutdown: close the worker and queue. */
export async function closeLogoScanFlow(): Promise<void> {
  await Promise.allSettled([logoScanWorker?.close(), queue?.close(), closeLogoScanCleanup()]);
  logoScanWorker = null; queue = null;
}
