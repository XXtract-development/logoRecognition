/**
 * Pipeline Queue Infrastructure (Epic 9, Story 9.1)
 *
 * BullMQ-backed persistent job queue for the retraining pipeline.
 * Redis state survives API container restarts (crash-resilience, NFR1).
 *
 * Queue names:
 *   training  — main training flow jobs
 *
 * SECURITY: isServiceRequest() verifies callers via PIPELINE_SERVICE_KEY env
 * using crypto.timingSafeEqual to prevent timing attacks. No fallback default
 * — missing key always returns false (safe default).
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import crypto from 'crypto';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-queue');

// ============================================
// Types
// ============================================

export interface PipelineQueues {
  training: Queue;
  'artwork-detection': Queue;
  flywheel: Queue;
}

/**
 * Known queue names. `getJobStatus` is parametrized over these (O6) so the
 * existing jobs-endpoint can surface detection jobs alongside training jobs.
 *
 * `flywheel` (Story 13.4, AD-6) carries the nightly promotion loop + watchdog on
 * worker-concurrency 1, so promotion/bootstrap/audit are mutually exclusive.
 */
export type QueueName = 'training' | 'artwork-detection' | 'flywheel';

/**
 * Shared default job-options (9.1): attempts ≥ 3, exponential backoff, history
 * retained. Used BOTH by the queue factory AND by enqueueDetectionForImport's
 * `.add()` call — BullMQ reads attempts/backoff from the options serialized onto
 * the job by the *adding* Queue instance, so the enqueue path must spread these
 * in (the factory's defaultJobOptions live on a different instance).
 */
export const PIPELINE_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: false,
  removeOnFail: false,
};

export interface JobStatusResult {
  id: string;
  state: string;
  failedReason?: string;
  retryable: boolean;
  progress?: number | object | string;
  data?: unknown;
}

// ============================================
// Redis connection
// ============================================

/**
 * Create a shared ioredis connection for BullMQ.
 * Lazily instantiated; reused across queue/worker instances.
 */
let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
    redisConnection.on('error', (err: Error) => {
      logger.error('Redis connection error', { error: err.message });
    });
  }
  return redisConnection;
}

/**
 * Story 19.16 (AC3) — sluit de gedeelde ioredis-verbinding zodat een SCRIPT (geen
 * server) zijn event-loop kan leegdraaien en vanzelf eindigt. Zonder dit bleef de
 * indexbouwer na het printen van zijn plan hangen tot een externe `kill`.
 *
 * Bewust `disconnect()` en niet `quit()`: `quit()` wacht op openstaande commando's,
 * en met `maxRetriesPerRequest: null` rejecteren die nooit — precies in het scenario
 * waarin een commando al hangt zou `quit()` dus mee blijven hangen. `disconnect()`
 * breekt direct af. Idempotent: tweemaal aanroepen is veilig.
 *
 * NIET aanroepen vanuit de draaiende API/worker — daar is de verbinding gedeeld.
 */
export function closeRedisConnection(): void {
  if (!redisConnection) return;
  try {
    redisConnection.disconnect();
  } catch (err) {
    logger.warn('Redis disconnect failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  } finally {
    redisConnection = null;
  }
}

// ============================================
// Queue factory
// ============================================

/**
 * Create and configure the pipeline queues.
 * Called once at application startup; subsequent calls return fresh instances
 * (use a singleton wrapper in main.ts if needed).
 *
 * AC1: attempts ≥ 3, exponential backoff, removeOnComplete !== true
 */
export function createPipelineQueues(): PipelineQueues {
  const connection = getRedisConnection();

  const defaultJobOptions = PIPELINE_JOB_OPTIONS;

  const training = new Queue('training', { connection, defaultJobOptions });

  // Artwork-detection queue (Story 8-3O): one job per artwork image, processed
  // by the detection worker (localize → classify → crosscheck → register).
  // Same 9.1 defaults — Redis state survives restarts (crash-resilience, AC4).
  const artworkDetection = new Queue('artwork-detection', { connection, defaultJobOptions });

  // Flywheel queue (Story 13.4): nightly promotion loop + watchdog. Worker
  // concurrency 1 (workers.ts) — promotion/bootstrap/audit serialise. Same 9.1
  // defaults; Redis state survives restarts (crash-recovery, AD-12).
  const flywheel = new Queue('flywheel', { connection, defaultJobOptions });

  logger.info('Pipeline queues created', {
    queues: ['training', 'artwork-detection', 'flywheel'],
  });

  return { training, 'artwork-detection': artworkDetection, flywheel };
}

// ============================================
// Job status
// ============================================

/**
 * Get the current status of a job by ID.
 *
 * AC2: failedReason filled for failed jobs, retryable=true for failed state.
 */
export async function getJobStatus(
  jobId: string,
  queueName: QueueName = 'training'
): Promise<JobStatusResult> {
  const connection = getRedisConnection();
  const queue = new Queue(queueName, { connection });

  try {
    const job = await queue.getJob(jobId);

    if (!job) {
      return {
        id: jobId,
        state: 'not_found',
        retryable: false,
      };
    }

    const state = await job.getState();
    const isFailed = state === 'failed';

    return {
      id: jobId,
      state,
      failedReason: isFailed ? (job.failedReason ?? 'Unknown failure') : undefined,
      retryable: isFailed,
      // job.progress can be number | MaybePromise<void> in BullMQ types; cast to a safe shape
      progress: typeof job.progress === 'number' || typeof job.progress === 'object' ? job.progress as number | object : undefined,
      data: job.data,
    };
  } finally {
    await queue.close();
  }
}

// ============================================
// Service-account authentication (AC3, NFR6)
// ============================================

/**
 * Check whether an incoming request originates from a trusted service account.
 *
 * Compares the x-api-key header with PIPELINE_SERVICE_KEY using
 * crypto.timingSafeEqual (constant-time comparison) to prevent timing attacks.
 *
 * Rules:
 * - Returns false if PIPELINE_SERVICE_KEY is not configured (safe default).
 * - Returns false if the header is absent.
 * - Returns false if buffer lengths differ (avoids timingSafeEqual throw).
 * - Returns true only when keys match byte-for-byte.
 */
export function isServiceRequest(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const configuredKey = process.env.PIPELINE_SERVICE_KEY;

  // No key configured → reject all service-account calls
  if (!configuredKey) {
    return false;
  }

  const providedKey = request.headers['x-api-key'];

  if (!providedKey || typeof providedKey !== 'string') {
    return false;
  }

  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(configuredKey, 'utf8');
  const b = Buffer.from(providedKey, 'utf8');

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}
