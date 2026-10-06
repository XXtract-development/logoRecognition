/**
 * Database access for logo scans (Story 1.3): `logo_scans` and `logo_current_image`.
 *
 * Every call is tolerant: a missing table (Prisma P2021) or any other database failure yields
 * `undefined` ("unavailable"), never an exception, so the caller falls back to Story 1.2
 * behaviour (Redis only, no dedupe). A missing table is logged once, until a call succeeds again.
 */
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('logo-scan-store');
const OPEN = ['pending', 'running'];
let warnedMissingTable = false;

/** Run a database call; `undefined` means unavailable (missing table, failure, or no such model). */
async function tolerant<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await call();
    warnedMissingTable = false;
    return result;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2021') {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        logger.warn('logo_scans table missing (migration 0022 not applied); running on Redis only, no deduplication');
      }
    } else {
      logger.warn('logo-scan database call failed', { error: err instanceof Error ? err.message : 'unknown' });
    }
    return undefined;
  }
}

// The generated client has these delegates after `prisma generate`; `any` keeps the store usable when a caller mocks core/db without them.
type Count = Promise<{ count: number }>;
const scans = () => (prisma as any).logoScan;
const currents = () => (prisma as any).logoCurrentImage;

export interface ScanRow {
  scanId: string; productId: string | null; pipelineId: string | null; imageHash: string; status: string; reason: string | null;
  consumer: string; logoResults: unknown; processingTimeMs: number | null; createdAt: Date; requestedAt: Date; policyVersion?: string | null;
}
export interface ScanKey { productId: string; imageHash: string; modelVersion: string; referenceVersion: string }
export type SaveOutcome = 'saved' | 'superseded' | 'skipped';

/** Signature of the active reference pool: `<count>:<latest createdAt>`. */
export async function referencePoolVersion(): Promise<string | undefined> {
  try {
    const r = await prisma.referenceLogo.aggregate({ where: { active: true }, _count: true, _max: { createdAt: true } });
    return `${r._count}:${r._max.createdAt ? new Date(r._max.createdAt).toISOString() : 'none'}`;
  } catch (err) {
    logger.warn('reference pool version unavailable; no deduplication', { error: err instanceof Error ? err.message : 'unknown' });
    return undefined;
  }
}

export const currentImage = (productId: string) =>
  tolerant(() => currents().findUnique({ where: { productId } }) as Promise<{ imageHash: string; requestedAt: Date } | null>);

/**
 * Move the product's current image to `imageHash` when `requestedAt` is later than the stored one (`cur` = what the caller read, or null
 * when there was none); when it moved, open scans of other hashes become `superseded`. A concurrent first insert (P2002) falls through to the update.
 */
export async function advanceCurrentImage(
  productId: string, imageHash: string, requestedAt: Date, cur: { imageHash: string; requestedAt: Date } | null,
): Promise<void> {
  let moved = false;
  if (!cur) {
    try {
      await currents().create({ data: { productId, imageHash, requestedAt } });
      moved = true;
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') { await tolerant(() => Promise.reject(err)); return; }
    }
  }
  if (!moved) {
    const r = await tolerant(() => currents().updateMany({ where: { productId, requestedAt: { lt: requestedAt } }, data: { imageHash, requestedAt } }) as Count);
    moved = (r?.count ?? 0) > 0; // equal time: the existing one stays
  }
  if (moved) {
    await tolerant(() => scans().updateMany({
      where: { productId, imageHash: { not: imageHash }, status: { in: OPEN } }, data: { status: 'superseded' },
    }) as Count);
  }
}

/** A `done` scan of the same consumer, product, image and versions requested since `since`. */
export const findReusableScan = (key: ScanKey, consumer: string, since: Date) =>
  tolerant(() => scans().findFirst({
    where: { ...key, consumer, status: 'done', requestedAt: { gte: since } }, orderBy: { requestedAt: 'desc' },
  }) as Promise<ScanRow | null>);

/** Insert a scan with attempt = highest existing attempt for the key + 1; retries when a concurrent insert took the number. */
export async function insertScan(
  data: { scanId: string; productId?: string; pipelineId?: string; imageHash: string; modelVersion: string; referenceVersion: string;
    policyVersion: string; status: string; consumer: string; requestedAt: Date },
): Promise<number | undefined> {
  for (let i = 0; i < 3; i++) {
    let attempt = 1;
    if (data.productId) {
      const last = await tolerant(() => scans().findFirst({
        where: { productId: data.productId, imageHash: data.imageHash, modelVersion: data.modelVersion, referenceVersion: data.referenceVersion },
        orderBy: { attempt: 'desc' },
      }) as Promise<{ attempt: number } | null>);
      if (last === undefined) return undefined;
      attempt = (last?.attempt ?? 0) + 1;
    }
    try {
      await scans().create({ data: { ...data, attempt } });
      warnedMissingTable = false;
      return attempt;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue;
      await tolerant(() => Promise.reject(err)); // shared logging and warn-once
      return undefined;
    }
  }
  logger.warn('logo-scan row not stored: attempt number kept colliding', { scanId: data.scanId });
  return undefined;
}

export const findScan = (scanId: string) => tolerant(() => scans().findUnique({ where: { scanId } }) as Promise<ScanRow | null>);

/** pending → running. `superseded` when the scan was superseded before it started. */
export async function markRunning(scanId: string): Promise<SaveOutcome> {
  const r = await tolerant(() => scans().updateMany({ where: { scanId, status: 'pending' }, data: { status: 'running' } }) as Count);
  if (r === undefined || r.count > 0) return r === undefined ? 'skipped' : 'saved';
  return (await findScan(scanId))?.status === 'superseded' ? 'superseded' : 'skipped';
}

/** Store the outcome of an open scan (compare-and-set); `superseded` when it was superseded meanwhile. */
export async function saveOutcome(
  scanId: string, data: { status: string; reason?: string; logoResults?: unknown; processingTimeMs?: number },
): Promise<SaveOutcome> {
  const r = await tolerant(() => scans().updateMany({ where: { scanId, status: { in: OPEN } }, data }) as Count);
  if (r === undefined) return 'skipped';
  if (r.count > 0) return 'saved';
  return (await findScan(scanId))?.status === 'superseded' ? 'superseded' : 'skipped';
}

/** Delete scans (and stale current-image pointers) older than `cutoff`. A missing table is a warn-once 0; any other failure is thrown so the job fails visibly. */
export async function deleteScansCreatedBefore(cutoff: Date): Promise<number> {
  try {
    const r = await scans().deleteMany({ where: { createdAt: { lt: cutoff } } }) as { count: number };
    await currents().deleteMany({ where: { requestedAt: { lt: cutoff } } });
    warnedMissingTable = false;
    return r.count;
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2021') throw err;
    await tolerant(() => Promise.reject(err)); // warn once
    return 0;
  }
}
