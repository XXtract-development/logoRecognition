/**
 * Retention of raw logo-scan detections (Story 1.3, AD-4): rows of `logo_scans` older than
 * 12 months are deleted daily at 03:40 Europe/Amsterdam by a BullMQ Job Scheduler on its own queue.
 */
import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from './queue';
import { deleteScansCreatedBefore } from './logo-scan-store';
import { createLogger } from '../../core/logger';

const logger = createLogger('logo-scan-cleanup');
export const LOGO_SCAN_CLEANUP_QUEUE = 'logo-scan-cleanup';
const RETENTION_MONTHS = 12;

/** Delete scans created more than 12 months before `now`; returns how many. A missing table is a quiet 0. */
export async function purgeExpiredLogoScans(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  const count = await deleteScansCreatedBefore(cutoff);
  if (count) logger.info('expired logo scans removed', { count });
  return count;
}

let worker: Worker | null = null;
/** Register the daily scheduler (idempotent on the scheduler id) and the worker that purges. */
export async function registerLogoScanCleanup(): Promise<void> {
  const connection = getRedisConnection();
  if (!worker) {
    worker = new Worker(LOGO_SCAN_CLEANUP_QUEUE, () => purgeExpiredLogoScans(), { connection, concurrency: 1 });
    worker.on('failed', (_job, err) => logger.error('logo-scan cleanup failed', { error: err.message }));
  }
  const queue = new Queue(LOGO_SCAN_CLEANUP_QUEUE, { connection });
  try {
    await queue.upsertJobScheduler(
      'logo-scan-cleanup-scheduler', { pattern: '40 3 * * *', tz: 'Europe/Amsterdam' }, { name: 'logo-scan-cleanup', data: {} },
    );
  } finally {
    await queue.close();
  }
}

/** Graceful shutdown. */
export async function closeLogoScanCleanup(): Promise<void> {
  await worker?.close();
  worker = null;
}
