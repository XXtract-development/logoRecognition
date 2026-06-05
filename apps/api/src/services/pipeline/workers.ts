/**
 * Training-pipeline step workers (Epic 9, Story 9.3).
 *
 * Processes the four BullMQ-flow steps that buildTrainingFlow() defines:
 *   incorporate-feedback → build-batch → train-model → evaluate-model
 *
 * Each step is an individually-retryable job (attempts/backoff come from the
 * flow job-options). The flow state lives in Redis, so an API-container restart
 * never loses a partially-completed training run (NFR1/AC2).
 *
 * Concurrency (AC3): the train-model step runs at Worker concurrency 1 — never
 * more than one training at a time. BullMQ's `concurrency` is a *Worker* option
 * (not a job option), so it is enforced HERE, where the Worker is constructed.
 *
 * Step contracts:
 *   incorporate-feedback  → incorporatePendingFeedback() service (no HTTP self-call)
 *   build-batch           → executeBuildBatchStep() → mlClient.buildSyntheticBatch
 *                           (synthetic fill is non-critical: ML failure is logged
 *                            and the step still completes with an empty plan, so
 *                            training can proceed on real data)
 *   train-model           → mlClient.startTraining + checkTrainingStep polling
 *                           until completed/failed; a failed/aborted ML job throws
 *                           so the step retries (AC2)
 *   evaluate-model        → read challenger's metrics.holdout, evaluateGate vs the
 *                           active champion. pass → persist metrics.gate (+ holdout +
 *                           triggerReasons) on the modelVersion (approval-queue, 9.5).
 *                           fail → emitGateFailure with comparison figures (9.4 AC6).
 */

import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './queue';
import {
  checkTrainingStep,
  executeBuildBatchStep,
  getTrainingJobOptions,
} from './training-flow';
import { incorporatePendingFeedback } from './feedback-incorporation';
import { evaluateGate, emitGateFailure, type ModelMetrics } from './quality-gate';
import { mlClient } from '../ml-client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-workers');

const TRAINING_QUEUE = 'training';

// Poll interval while waiting for an ML training job to finish.
const TRAIN_POLL_INTERVAL_MS = parseInt(process.env.TRAIN_POLL_INTERVAL_MS || '15000', 10);
// Hard wall-clock cap for a single train-model attempt (defence-in-depth on top
// of checkTrainingStep's own timeout). Default 6h.
const TRAIN_MAX_WAIT_MS = parseInt(process.env.TRAIN_MAX_WAIT_MS || `${6 * 60 * 60 * 1000}`, 10);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ============================================
// Step processors (exported for direct unit testing — no Redis required)
// ============================================

export interface StepJobData {
  triggerId: string;
  batchId?: string;
  startedAt?: number;
  step?: string;
  triggerReasons?: string[];
}

/** incorporate-feedback: turn validated feedback into training data (AC1). */
export async function processIncorporateFeedback(): Promise<{ incorporated: number }> {
  logger.info('Step: incorporate-feedback');
  return incorporatePendingFeedback();
}

/** build-batch: request a synthetic batch plan for under-represented classes (AC4). */
export async function processBuildBatch(data: StepJobData): Promise<{
  batches: unknown[];
  shortfall_reported: Record<string, number>;
}> {
  logger.info('Step: build-batch', { triggerId: data.triggerId });
  const result = await executeBuildBatchStep({});
  // Surface shortfall on the job result so the pipeline-jobs panel can show it.
  logger.info('build-batch shortfall report', { shortfall: result.shortfall_reported });
  return result;
}

/**
 * train-model: kick off an ML-service training run and poll until it terminates.
 *
 * Throws on a failed/aborted ML job (checkTrainingStep → retryable) so the step
 * retries per its job-options (AC2). Returns the modelVersionId of the freshly
 * registered challenger on success.
 */
export async function processTrainModel(data: StepJobData): Promise<{ mlJobId: string }> {
  const batchId = data.batchId ?? data.triggerId;
  logger.info('Step: train-model', { triggerId: data.triggerId, batchId });

  const job = await mlClient.startTraining({ batch_id: batchId });
  const mlJobId = job.job_id;
  const startedAt = Date.now();

  // Poll the ML service until the job completes or fails.
  for (;;) {
    if (Date.now() - startedAt > TRAIN_MAX_WAIT_MS) {
      throw new Error(`train-model exceeded max wait (${Math.round(TRAIN_MAX_WAIT_MS / 60000)}m) for ML job ${mlJobId}`);
    }

    const check = await checkTrainingStep({ mlJobId, startedAt });

    if (check.state === 'completed') {
      logger.info('train-model completed', { mlJobId });
      return { mlJobId };
    }

    if (check.state === 'failed') {
      // retryable=true → throw so BullMQ retries the whole step (AC2).
      throw new Error(`ML training job ${mlJobId} failed/aborted: ${check.reason ?? 'unknown'}`);
    }

    await sleep(TRAIN_POLL_INTERVAL_MS);
  }
}

/**
 * evaluate-model: gate the freshly-trained challenger against the active champion.
 *
 * Reads the newest non-active modelVersion (the challenger just registered by the
 * ML service with metrics.holdout) and the active champion. On pass, persists the
 * gate verdict into modelVersion.metrics.gate (+ holdout + triggerReasons) so the
 * 9.5 approval-queue can pick it up. On fail, emits gate_failed with comparison
 * figures (9.4 AC6).
 */
export async function processEvaluateModel(data: StepJobData): Promise<{
  passed: boolean;
  modelVersionId?: string;
}> {
  logger.info('Step: evaluate-model', { triggerId: data.triggerId });

  const challenger = await prisma.modelVersion.findFirst({
    where: { isActive: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenger) {
    throw new Error('evaluate-model: no challenger model version found to evaluate');
  }

  const champion = await prisma.modelVersion.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const challengerMetrics = (challenger.metrics as Record<string, unknown> | null) ?? {};
  const challengerHoldout = (challengerMetrics.holdout ?? {}) as {
    accuracy?: number;
    holdout_hash?: string;
    holdoutHash?: string;
  };

  const challengerGateInput: ModelMetrics = {
    holdoutAccuracy: challengerHoldout.accuracy ?? 0,
    holdoutHash: challengerHoldout.holdoutHash ?? challengerHoldout.holdout_hash ?? null,
  };

  let championGateInput: ModelMetrics | null = null;
  if (champion) {
    const championMetrics = (champion.metrics as Record<string, unknown> | null) ?? {};
    const championHoldout = (championMetrics.holdout ?? {}) as {
      accuracy?: number;
      holdout_hash?: string;
      holdoutHash?: string;
    };
    championGateInput = {
      holdoutAccuracy: championHoldout.accuracy ?? 0,
      holdoutHash: championHoldout.holdoutHash ?? championHoldout.holdout_hash ?? null,
    };
  }

  const verdict = evaluateGate({
    champion: championGateInput,
    challenger: challengerGateInput,
  });

  // Persist the gate verdict + triggerReasons onto the challenger so the 9.5
  // approval-queue (metrics.gate.passed === true) can surface it. We merge into
  // the existing metrics JSON rather than overwrite (keep metrics.holdout).
  const nextMetrics = {
    ...challengerMetrics,
    gate: {
      passed: verdict.passed,
      reason: verdict.reason ?? null,
      comparison: verdict.comparison ?? null,
      evaluatedAt: new Date().toISOString(),
    },
    triggerReasons: data.triggerReasons ?? (challengerMetrics.triggerReasons ?? []),
  };

  await prisma.modelVersion.update({
    where: { id: challenger.id },
    data: { metrics: nextMetrics as object },
  });

  if (!verdict.passed) {
    // 9.4 AC6: notify with comparison figures (fail path).
    emitGateFailure({
      modelVersionId: challenger.id,
      comparison: verdict.comparison,
      reason: verdict.reason,
    });
    logger.warn('evaluate-model: gate failed', {
      modelVersionId: challenger.id,
      comparison: verdict.comparison,
    });
  } else {
    logger.info('evaluate-model: gate passed — awaiting approval (9.5)', {
      modelVersionId: challenger.id,
    });
  }

  return { passed: verdict.passed, modelVersionId: challenger.id };
}

// ============================================
// Worker registration
// ============================================

/**
 * Route a flow job to its step processor by job name.
 * Exported so tests can drive the processor without a live Worker/Redis.
 */
export async function processTrainingJob(job: Pick<Job, 'name' | 'data'>): Promise<unknown> {
  const data = (job.data ?? {}) as StepJobData;

  switch (job.name) {
    case 'incorporate-feedback':
      return processIncorporateFeedback();
    case 'build-batch':
      return processBuildBatch(data);
    case 'train-model':
      return processTrainModel(data);
    case 'evaluate-model':
      return processEvaluateModel(data);
    default:
      // retraining-check (the cron job) is handled by the trigger worker; any
      // other name is ignored here so a single queue can host both.
      return undefined;
  }
}

let trainingWorker: Worker | null = null;

/**
 * Register the BullMQ worker that processes the four training-flow steps.
 * Called once at API startup (alongside the trigger cron worker).
 *
 * AC3: Worker concurrency=1 — never more than one training step active at a
 * time, which (combined with the FlowProducer dependency chain) guarantees a
 * single training runs at once.
 */
export function registerTrainingFlowWorker(): Worker {
  if (trainingWorker) return trainingWorker;

  const connection = getRedisConnection();
  const { concurrency } = getTrainingJobOptions();

  trainingWorker = new Worker(
    TRAINING_QUEUE,
    async (job) => processTrainingJob(job),
    { connection, concurrency },
  );

  trainingWorker.on('failed', (job, err) => {
    logger.error('Training-flow step failed', {
      jobId: job?.id,
      step: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  trainingWorker.on('completed', (job) => {
    logger.info('Training-flow step completed', { jobId: job.id, step: job.name });
  });

  logger.info('Training-flow worker registered', { concurrency });

  return trainingWorker;
}
