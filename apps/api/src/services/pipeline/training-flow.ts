/**
 * Training Pipeline Flow (Epic 9, Story 9.3)
 *
 * Defines the BullMQ FlowProducer-based pipeline:
 *   incorporate-feedback → build-batch → train-model → evaluate-model
 *
 * Each step is individually retryable. The flow state persists in Redis so
 * an API-container restart never loses a partially-completed training run (NFR1).
 *
 * Training concurrency: 1 at a time, within the configurable time window
 * (TRAINING_WINDOW_START / TRAINING_WINDOW_END env vars, 24-hour HH:MM format).
 *
 * Synthetic batch hook (AC4, deferred from Story 8.7):
 *   The build-batch step calls mlClient.buildSyntheticBatch() for classes
 *   under the configured minimum. The ratio cap wins over min_per_class
 *   (conflict-resolution decision 2026-06-04, tested in 8.7-pytest).
 */

import { FlowProducer, Queue } from 'bullmq';
import { getRedisConnection } from './queue';
import { mlClient, MLServiceError } from '../ml-client';
import { createLogger } from '../../core/logger';

const logger = createLogger('pipeline-training-flow');

// ============================================
// Types
// ============================================

export interface BuildTrainingFlowOptions {
  triggerId: string;
  batchId?: string;
  /** Concrete retraining reasons, persisted onto the challenger for the 9.5 approval-queue. */
  triggerReasons?: string[];
}

/** Flow step names that represent an in-progress training run (concurrency=1 guard). */
export const TRAINING_STEP_NAMES = [
  'incorporate-feedback',
  'build-batch',
  'train-model',
  'evaluate-model',
] as const;

export interface TrainingFlowNode {
  name: string;
  queueName: string;
  data?: Record<string, unknown>;
  opts?: Record<string, unknown>;
  children?: TrainingFlowNode[];
}

export interface CheckTrainingStepResult {
  state: 'active' | 'completed' | 'failed' | 'unknown';
  retryable: boolean;
  reason?: string;
}

export interface TrainingJobOptions {
  concurrency: number;
  window: {
    start: string; // HH:MM 24-hour
    end: string;   // HH:MM 24-hour
  };
}

export interface BuildSyntheticBatchResult {
  batches: unknown[];
  shortfall_reported: Record<string, number>;
}

// ============================================
// Flow defaults
// ============================================

const FLOW_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: false,
  removeOnFail: false,
};

// ============================================
// Core functions
// ============================================

/**
 * Build a BullMQ FlowProducer graph for the full training pipeline.
 *
 * AC1: flow contains all four steps in the correct order.
 * The structure is: evaluate-model (root) → train-model → build-batch → incorporate-feedback
 * so that BullMQ processes children first (bottom-up dependency resolution).
 */
export function buildTrainingFlow(options: BuildTrainingFlowOptions): TrainingFlowNode {
  const { triggerId, batchId, triggerReasons } = options;

  const flowData = { triggerId, batchId, triggerReasons, startedAt: Date.now() };

  const flow: TrainingFlowNode = {
    name: 'evaluate-model',
    queueName: 'training',
    data: { ...flowData, step: 'evaluate-model' },
    opts: FLOW_JOB_OPTIONS,
    children: [
      {
        name: 'train-model',
        queueName: 'training',
        data: { ...flowData, step: 'train-model' },
        opts: { ...FLOW_JOB_OPTIONS, ...getTrainingJobOptions() },
        children: [
          {
            name: 'build-batch',
            queueName: 'training',
            data: { ...flowData, step: 'build-batch' },
            opts: FLOW_JOB_OPTIONS,
            children: [
              {
                name: 'incorporate-feedback',
                queueName: 'training',
                data: { ...flowData, step: 'incorporate-feedback' },
                opts: FLOW_JOB_OPTIONS,
              },
            ],
          },
        ],
      },
    ],
  };

  return flow;
}

/**
 * Whether a training flow is already in progress (concurrency=1, AC3).
 *
 * Returns the jobId of an active/waiting/delayed training step if one exists,
 * else null. Used by the manual-start route (409) and the auto-start path
 * (skip duplicate) so two flows never run concurrently.
 */
export async function getActiveTrainingFlowJobId(): Promise<string | null> {
  const connection = getRedisConnection();
  const queue = new Queue('training', { connection });
  try {
    const jobs = await queue.getJobs(['active', 'waiting', 'delayed', 'paused']);
    const stepNames = new Set<string>(TRAINING_STEP_NAMES);
    const active = jobs.find((j) => stepNames.has(j.name));
    return active?.id ?? null;
  } finally {
    await queue.close();
  }
}

/**
 * Submit the flow to BullMQ and return the job IDs.
 * Exported for use by the handmatige-start route (Task 5).
 */
export async function submitTrainingFlow(
  options: BuildTrainingFlowOptions
): Promise<{ flowId: string; jobIds: string[] }> {
  const connection = getRedisConnection();
  const flow = buildTrainingFlow(options);

  const flowProducer = new FlowProducer({ connection });
  const result = await flowProducer.add(flow as Parameters<typeof flowProducer.add>[0]);
  await flowProducer.close();

  // Collect all job IDs from the flow result
  const jobIds: string[] = [];
  function collectIds(node: { job?: { id?: string }; children?: typeof node[] }) {
    if (node?.job?.id) jobIds.push(node.job.id);
    for (const child of node.children ?? []) {
      collectIds(child);
    }
  }
  collectIds(result as Parameters<typeof collectIds>[0]);

  const flowId = jobIds[0] ?? 'flow-unknown';

  logger.info('Training flow submitted', { flowId, triggerId: options.triggerId, jobIds });

  return { flowId, jobIds };
}

/**
 * Check whether an ML-service training job is still alive.
 *
 * AC2: if the ML job is not found (404) or has exceeded the startedAt threshold,
 * returns { state: 'failed', retryable: true }.
 */
export async function checkTrainingStep(opts: {
  mlJobId: string;
  startedAt: number;
  timeoutMs?: number;
}): Promise<CheckTrainingStepResult> {
  const { mlJobId, startedAt, timeoutMs = 10 * 60 * 1000 } = opts; // 10 min default

  try {
    const status = await mlClient.getTrainingStatus(mlJobId);

    if (!status) {
      return { state: 'failed', retryable: true, reason: 'ML job not found' };
    }

    // If still running but exceeded our wall-clock timeout
    const elapsed = Date.now() - startedAt;
    if (elapsed > timeoutMs && status.status === 'running') {
      return { state: 'failed', retryable: true, reason: `ML job timed out after ${Math.round(elapsed / 60000)}m` };
    }

    const state = (() => {
      switch (status.status) {
        case 'completed': return 'completed' as const;
        case 'failed':    return 'failed' as const;
        case 'running':   return 'active' as const;
        default:          return 'unknown' as const;
      }
    })();

    return {
      state,
      retryable: state === 'failed',
    };
  } catch (error) {
    if (error instanceof MLServiceError && error.statusCode === 404) {
      return { state: 'failed', retryable: true, reason: 'ML job not found (404)' };
    }
    return { state: 'failed', retryable: true, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Return the job options for the train-model step.
 *
 * AC3: concurrency=1, window in HH:MM 24-hour format.
 */
export function getTrainingJobOptions(): TrainingJobOptions {
  const start = process.env.TRAINING_WINDOW_START || '22:00';
  const end = process.env.TRAINING_WINDOW_END || '06:00';

  return {
    concurrency: 1,
    window: { start, end },
  };
}

/**
 * Build-batch step: incorporate existing feedback and request synthetic batch fill.
 *
 * AC4 (deferred from 8.7): calls mlClient.buildSyntheticBatch() for under-represented
 * classes. Ratio cap wins over min_per_class (conflict-resolution decision 2026-06-04).
 * Shortfall is reported in the job result for logging.
 */
export async function executeBuildBatchStep(opts: {
  minPerClass?: number;
  syntheticRatio?: number;
}): Promise<BuildSyntheticBatchResult> {
  const minPerClass = opts.minPerClass ?? parseInt(process.env.SYNTHETIC_MIN_PER_CLASS || '50', 10);
  const ratio = opts.syntheticRatio ?? parseFloat(process.env.SYNTHETIC_RATIO || '0.3');

  logger.info('Build batch step: requesting synthetic batch fill', { minPerClass, ratio });

  try {
    const result = await mlClient.buildSyntheticBatch({ minPerClass, ratio });
    logger.info('Build batch step completed', { shortfall: result.shortfall_reported });
    return result;
  } catch (error) {
    logger.warn('Build batch step: synthetic batch fill failed (non-fatal)', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Non-fatal: return empty result so training can proceed with real data only
    return { batches: [], shortfall_reported: {} };
  }
}
