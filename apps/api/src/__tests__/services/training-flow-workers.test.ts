/**
 * Training-flow worker tests (Epic 9, Story 9.3).
 *
 * Tests the REAL step processors (not mocked facades): incorporate-feedback,
 * build-batch, train-model (retryable on ML failure), evaluate-model (gate-pass
 * persists metrics.gate for the 9.5 approval-queue; gate-fail emits comparison
 * figures per 9.4 AC6).
 *
 * Only the boundaries are mocked: mlClient (ML REST), prisma (DB), and
 * socketIOManager (Socket.IO). The processor logic itself runs for real.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock the ML client boundary ---------------------------------------------
const startTraining = vi.fn();
const getTrainingStatus = vi.fn();
const buildSyntheticBatch = vi.fn();

vi.mock('../../services/ml-client', () => ({
  mlClient: {
    startTraining: (...a: unknown[]) => startTraining(...a),
    getTrainingStatus: (...a: unknown[]) => getTrainingStatus(...a),
    buildSyntheticBatch: (...a: unknown[]) => buildSyntheticBatch(...a),
  },
  MLServiceError: class MLServiceError extends Error {
    statusCode?: number;
    constructor(message: string, statusCode?: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// --- Mock the Socket.IO boundary ---------------------------------------------
const broadcastAll = vi.fn();
vi.mock('../../services/socket-io-manager', () => ({
  socketIOManager: { broadcastAll: (...a: unknown[]) => broadcastAll(...a) },
}));

import prisma from '../../core/db';
import {
  processIncorporateFeedback,
  processBuildBatch,
  processTrainModel,
  processEvaluateModel,
  processTrainingJob,
} from '../../services/pipeline/workers';

// Shorthands for the global prisma mock (from setup.ts).
const feedbackEntry = prisma.feedbackEntry as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const logoImage = prisma.logoImage as unknown as { findFirst: ReturnType<typeof vi.fn> };
const trainingData = prisma.trainingData as unknown as { create: ReturnType<typeof vi.fn> };
const modelVersion = prisma.modelVersion as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Speed up the train-model poll loop.
  process.env.TRAIN_POLL_INTERVAL_MS = '1';
});

describe('Training-flow workers (Story 9.3)', () => {
  // ---------------------------------------------------------------------------
  // incorporate-feedback step
  // ---------------------------------------------------------------------------
  describe('incorporate-feedback step', () => {
    it('creates validated training data from pending feedback and marks it incorporated', async () => {
      feedbackEntry.findMany.mockResolvedValue([
        {
          id: 'fb-1',
          correctLogoId: 'EKO',
          confidence: 0.9,
          validatedBy: 'tester',
          log: { imageHash: 'hash-1' },
        },
      ]);
      logoImage.findFirst.mockResolvedValue({ id: 'img-1' });
      trainingData.create.mockResolvedValue({ id: 'td-1' });
      feedbackEntry.update.mockResolvedValue({ id: 'fb-1' });

      const result = await processIncorporateFeedback();

      expect(result.incorporated).toBe(1);
      expect(trainingData.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ imageId: 'img-1', label: 'EKO', validated: true }),
        }),
      );
      expect(feedbackEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'fb-1' }, data: { incorporated: true } }),
      );
    });

    it('is a no-op when there is no pending feedback', async () => {
      feedbackEntry.findMany.mockResolvedValue([]);
      const result = await processIncorporateFeedback();
      expect(result.incorporated).toBe(0);
      expect(trainingData.create).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // build-batch step (AC4)
  // ---------------------------------------------------------------------------
  describe('build-batch step', () => {
    it('calls buildSyntheticBatch and returns shortfall_reported', async () => {
      buildSyntheticBatch.mockResolvedValue({
        batches: [{ label: 'EKO' }],
        shortfall_reported: { RARE: 5 },
      });

      const result = await processBuildBatch({ triggerId: 't-1' });

      expect(buildSyntheticBatch).toHaveBeenCalledOnce();
      expect(result.shortfall_reported).toEqual({ RARE: 5 });
    });

    it('is non-fatal when synthetic fill fails — returns an empty plan so training proceeds', async () => {
      buildSyntheticBatch.mockRejectedValue(new Error('ml down'));

      const result = await processBuildBatch({ triggerId: 't-1' });

      // Synthetic fill is non-critical: the step still completes (no throw) with
      // an empty plan so train-model can run on real data.
      expect(result.batches).toEqual([]);
      expect(result.shortfall_reported).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // train-model step (AC2 — retryable on ML failure)
  // ---------------------------------------------------------------------------
  describe('train-model step', () => {
    it('returns the ML job id when training completes', async () => {
      startTraining.mockResolvedValue({ job_id: 'ml-1', status: 'running' });
      getTrainingStatus.mockResolvedValue({ status: 'completed' });

      const result = await processTrainModel({ triggerId: 't-1', batchId: 'batch-1' });

      expect(startTraining).toHaveBeenCalledWith({ batch_id: 'batch-1' });
      expect(result.mlJobId).toBe('ml-1');
    });

    it('throws (retryable) when the ML training job fails/aborts', async () => {
      startTraining.mockResolvedValue({ job_id: 'ml-2', status: 'running' });
      getTrainingStatus.mockResolvedValue({ status: 'failed' });

      await expect(processTrainModel({ triggerId: 't-1', batchId: 'batch-1' })).rejects.toThrow(
        /failed|aborted/i,
      );
    });

    it('throws (retryable) when the ML job has vanished (404 via checkTrainingStep)', async () => {
      startTraining.mockResolvedValue({ job_id: 'ml-3', status: 'running' });
      // getTrainingStatus returns null → checkTrainingStep => failed/retryable
      getTrainingStatus.mockResolvedValue(null);

      await expect(processTrainModel({ triggerId: 't-1' })).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // evaluate-model step (gate pass → metrics.gate; gate fail → comparison)
  // ---------------------------------------------------------------------------
  describe('evaluate-model step', () => {
    it('persists a passing gate verdict into modelVersion.metrics.gate (9.5 approval-queue)', async () => {
      // Newest non-active = challenger; active = champion (same holdout, better acc).
      modelVersion.findFirst
        .mockResolvedValueOnce({
          id: 'challenger-1',
          metrics: { holdout: { accuracy: 0.93, holdout_hash: 'sha256:abc' } },
        })
        .mockResolvedValueOnce({
          id: 'champion-1',
          metrics: { holdout: { accuracy: 0.9, holdout_hash: 'sha256:abc' } },
        });
      modelVersion.update.mockResolvedValue({ id: 'challenger-1' });

      const result = await processEvaluateModel({
        triggerId: 't-1',
        triggerReasons: ['512 nieuwe annotaties'],
      });

      expect(result.passed).toBe(true);
      expect(result.modelVersionId).toBe('challenger-1');

      const updateArg = modelVersion.update.mock.calls[0][0];
      expect(updateArg.where).toEqual({ id: 'challenger-1' });
      expect(updateArg.data.metrics.gate.passed).toBe(true);
      // Existing holdout block preserved; triggerReasons carried through.
      expect(updateArg.data.metrics.holdout).toBeDefined();
      expect(updateArg.data.metrics.triggerReasons).toEqual(['512 nieuwe annotaties']);
      // A passing gate does NOT emit a gate_failed event.
      expect(broadcastAll).not.toHaveBeenCalledWith('gate_failed', expect.anything());
    });

    it('emits gate_failed with comparison figures when the challenger is worse (9.4 AC6)', async () => {
      modelVersion.findFirst
        .mockResolvedValueOnce({
          id: 'challenger-2',
          metrics: { holdout: { accuracy: 0.85, holdout_hash: 'sha256:abc' } },
        })
        .mockResolvedValueOnce({
          id: 'champion-1',
          metrics: { holdout: { accuracy: 0.91, holdout_hash: 'sha256:abc' } },
        });
      modelVersion.update.mockResolvedValue({ id: 'challenger-2' });

      const result = await processEvaluateModel({ triggerId: 't-1' });

      expect(result.passed).toBe(false);
      // metrics.gate persisted with passed=false too.
      const updateArg = modelVersion.update.mock.calls[0][0];
      expect(updateArg.data.metrics.gate.passed).toBe(false);
      // gate_failed broadcast carries comparison figures.
      expect(broadcastAll).toHaveBeenCalledWith(
        'gate_failed',
        expect.objectContaining({
          modelVersionId: 'challenger-2',
          comparison: expect.objectContaining({ championAccuracy: 0.91, challengerAccuracy: 0.85 }),
        }),
      );
    });

    it('throws when there is no challenger model to evaluate', async () => {
      modelVersion.findFirst.mockResolvedValueOnce(null);
      await expect(processEvaluateModel({ triggerId: 't-1' })).rejects.toThrow(/challenger/i);
    });
  });

  // ---------------------------------------------------------------------------
  // job router
  // ---------------------------------------------------------------------------
  describe('processTrainingJob router', () => {
    it('routes by job name and ignores unrelated names (e.g. the cron job)', async () => {
      feedbackEntry.findMany.mockResolvedValue([]);
      const incorporated = await processTrainingJob({ name: 'incorporate-feedback', data: {} });
      expect(incorporated).toEqual({ incorporated: 0 });

      const ignored = await processTrainingJob({ name: 'retraining-check', data: {} });
      expect(ignored).toBeUndefined();
    });
  });
});
