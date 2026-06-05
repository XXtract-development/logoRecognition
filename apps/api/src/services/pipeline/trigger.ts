/**
 * Retraining Trigger Service (Epic 9, Story 9.2)
 *
 * Evaluates retraining conditions with configurable thresholds (AC1).
 * Sends concrete Socket.IO notifications with reason text (AC2).
 * Persists notifications to RetrainingNotification table so offline managers
 * do not miss triggers (AC3).
 * Redis-based dedup prevents duplicate notifications within the dedup window (AC4).
 *
 * Cron schedule: RETRAINING_CRON env (default: '0 6 * * *' — daily 06:00)
 * Dedup window: RETRAINING_DEDUP_HOURS env (default: 24)
 */

import crypto from 'crypto';
import { Queue, Worker } from 'bullmq';
import { getRedisConnection } from './queue';
import prisma from '../../core/db';
import { socketIOManager } from '../socket-io-manager';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-trigger');

// ============================================
// Types
// ============================================

export interface RetrainingThresholds {
  minFeedbackCount: number;
  minUnincorporatedRatio: number;
  lowAccuracyThreshold: number;
}

export interface TriggerResult {
  shouldRetrain: boolean;
  reasons: string[];
}

export interface EmitContext {
  emit: (event: string, data: unknown) => void;
}

// ============================================
// Dedup helpers
// ============================================

const DEDUP_HOURS = parseInt(process.env.RETRAINING_DEDUP_HOURS || '24', 10);

/**
 * Compute a deterministic triggerId from the reason list + current time window.
 * Two identical reason lists within the same dedup window produce the same ID.
 */
function computeTriggerId(reasons: string[]): string {
  const windowStart = Math.floor(Date.now() / (DEDUP_HOURS * 3600 * 1000));
  const raw = [...reasons].sort().join('|') + ':' + windowStart;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 64);
}

/**
 * In-process dedup cache (augments Redis dedup).
 * Prevents duplicate notifications within the same API process lifecycle,
 * even when Redis is mocked in tests.
 * Key: triggerId → expiry timestamp (ms)
 */
const inProcessDedupCache = new Map<string, number>();

function isInProcessDupliciate(triggerId: string): boolean {
  const expiry = inProcessDedupCache.get(triggerId);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    inProcessDedupCache.delete(triggerId);
    return false;
  }
  return true;
}

function markInProcessDedup(triggerId: string): void {
  inProcessDedupCache.set(triggerId, Date.now() + DEDUP_HOURS * 3600 * 1000);
}

// ============================================
// Core business logic
// ============================================

/**
 * Evaluate whether retraining is needed against configurable thresholds.
 * Reads current counts from the database.
 *
 * AC1: thresholds come from the passed config object, not hardcoded constants.
 */
export async function evaluateRetrainingTrigger(
  thresholds: RetrainingThresholds
): Promise<TriggerResult> {
  const { minFeedbackCount, minUnincorporatedRatio, lowAccuracyThreshold } = thresholds;

  const [totalFeedback, unincorporated] = await Promise.all([
    prisma.feedbackEntry.count(),
    prisma.feedbackEntry.count({ where: { incorporated: false } }),
  ]);

  const reasons: string[] = [];

  // Condition 1: enough unincorporated feedback
  const unincorporatedRatio = totalFeedback > 0 ? unincorporated / totalFeedback : 0;
  if (totalFeedback >= minFeedbackCount && unincorporatedRatio >= minUnincorporatedRatio) {
    reasons.push(
      `${unincorporated} nieuwe gevalideerde annotaties sinds laatste training`
    );
  }

  // Condition 2: model accuracy dropped below threshold
  const activeModel = await prisma.modelVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (activeModel && activeModel.accuracy !== null && activeModel.accuracy !== undefined) {
    if (activeModel.accuracy < lowAccuracyThreshold) {
      reasons.push(
        `Modelnauwkeurigheid (${(activeModel.accuracy * 100).toFixed(1)}%) is gedaald onder de drempel (${(lowAccuracyThreshold * 100).toFixed(1)}%)`
      );
    }
  }

  return {
    shouldRetrain: reasons.length > 0,
    reasons,
  };
}

/**
 * Persist a trigger notification and emit a Socket.IO event.
 *
 * AC2: concrete reason text sent in the event payload.
 * AC3: persisted to RetrainingNotification before emit.
 * AC4: Redis-based dedup — second call within the window is a no-op.
 */
export async function notifyRetrainingRecommended(
  trigger: TriggerResult,
  ctx: EmitContext
): Promise<void> {
  if (!trigger.shouldRetrain || trigger.reasons.length === 0) {
    return;
  }

  const triggerId = computeTriggerId(trigger.reasons);
  const dedupKey = `retraining:dedup:${triggerId}`;
  const ttlSeconds = DEDUP_HOURS * 3600;

  // 1. In-process dedup (fast path, also works in tests without real Redis)
  if (isInProcessDupliciate(triggerId)) {
    logger.info('Retraining trigger dedup (in-process) — skipping duplicate notification', { triggerId });
    return;
  }

  // Mark dedup in-process immediately (before async Redis to prevent races)
  markInProcessDedup(triggerId);

  // 2. Redis dedup (crash-resistant, survives API restarts — AC4)
  const redis = getRedisConnection();
  const existing = await redis.get(dedupKey);

  if (existing) {
    logger.info('Retraining trigger dedup (Redis) — skipping duplicate notification', { triggerId });
    return;
  }

  // Set dedup key in Redis BEFORE persisting / emitting (prevents race conditions on restart)
  await redis.setex(dedupKey, ttlSeconds, '1');

  // Persist to DB (AC3: offline managers can see it on page load)
  try {
    await prisma.retrainingNotification.create({
      data: {
        triggerId,
        reasons: trigger.reasons,
        status: 'unread',
      },
    });
  } catch (error: unknown) {
    // Unique constraint violation means another process already inserted — that's OK
    const isUniqueViolation =
      error instanceof Error && error.message.includes('Unique constraint');
    if (!isUniqueViolation) {
      logger.error('Failed to persist retraining notification', {
        triggerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Remove dedup key so the next attempt can retry
      await redis.del(dedupKey);
      throw error;
    }
    logger.info('Retraining notification already exists (concurrent insert)', { triggerId });
    return;
  }

  // Emit Socket.IO event (AC2: concrete reason text)
  ctx.emit('retraining_recommended', {
    triggerId,
    reasons: trigger.reasons,
    timestamp: new Date().toISOString(),
  });

  logger.info('Retraining recommended notification sent', {
    triggerId,
    reasons: trigger.reasons,
  });
}

// ============================================
// Cron scheduler registration
// ============================================

const RETRAINING_CRON = process.env.RETRAINING_CRON || '0 6 * * *';

/**
 * Register the retraining-check repeatable job with BullMQ.
 * Called once at startup (from queue init or main.ts).
 */
export async function registerRetrainingCronJob(): Promise<void> {
  const connection = getRedisConnection();

  const queue = new Queue('training', { connection });

  await queue.add(
    'retraining-check',
    {},
    {
      repeat: { pattern: RETRAINING_CRON },
      jobId: 'retraining-check-cron',
    }
  );

  // Worker processes the retraining-check jobs
  const worker = new Worker(
    'training',
    async (job) => {
      if (job.name !== 'retraining-check') return;

      logger.info('Running scheduled retraining condition check');

      const thresholds: RetrainingThresholds = {
        minFeedbackCount: parseInt(process.env.RETRAINING_MIN_FEEDBACK_COUNT || '100', 10),
        minUnincorporatedRatio: parseFloat(process.env.RETRAINING_MIN_UNINCORPORATED_RATIO || '0.1'),
        lowAccuracyThreshold: parseFloat(process.env.RETRAINING_LOW_ACCURACY_THRESHOLD || '0.85'),
      };

      const trigger = await evaluateRetrainingTrigger(thresholds);

      if (trigger.shouldRetrain) {
        await notifyRetrainingRecommended(trigger, {
          emit: (event, data) => socketIOManager.broadcastAll(event, data),
        });
      }
    },
    { connection }
  );

  worker.on('error', (err) => {
    logger.error('Retraining check worker error', { error: err.message });
  });

  logger.info('Retraining cron job registered', { cron: RETRAINING_CRON });
}
