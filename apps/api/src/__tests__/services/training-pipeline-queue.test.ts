/**
 * Training Pipeline Queue Tests — ATDD RED PHASE (Epic 9, Stories 9.1-9.4)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `it.skip`; verwijder de `.skip` per test zodra de
 * bijbehorende story geïmplementeerd is.
 *
 * Verwachte module-indeling (contract voor de developer):
 *   apps/api/src/services/pipeline/queue.ts          — BullMQ setup (queues, workers)
 *   apps/api/src/services/pipeline/trigger.ts        — geplande trigger-check + dedup
 *   apps/api/src/services/pipeline/training-flow.ts  — FlowProducer-graf incorporate→train→evaluate
 *   apps/api/src/services/pipeline/quality-gate.ts   — champion/challenger-gate op holdout
 *
 * NB: BullMQ wordt gemockt — deze tests verifiëren de contracten/het gedrag,
 * niet Redis zelf. Volg het mock-patroon van bestaande service-tests in
 * __tests__/services/.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Training Pipeline Queue (ATDD RED — Epic 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Story 9.1 — Persistente job-queue-infrastructuur (P0)
  // -------------------------------------------------------------------------

  describe('Queue infrastructure', () => {
    // TODO ATDD: remove .skip when implemented (Story 9.1)
    it.skip('should register queues with retry + backoff defaults', async () => {
      const { createPipelineQueues } = await import('../../services/pipeline/queue');

      const queues = createPipelineQueues();

      expect(queues.training).toBeDefined();
      const defaults = queues.training.defaultJobOptions;
      expect(defaults.attempts).toBeGreaterThanOrEqual(3);
      expect(defaults.backoff).toBeDefined();
      expect(defaults.removeOnComplete).not.toBe(true); // historie zichtbaar houden
    });

    // TODO ATDD: remove .skip when implemented (Story 9.1)
    it.skip('should expose job status including failure reason for failed jobs', async () => {
      const { getJobStatus } = await import('../../services/pipeline/queue');

      const status = await getJobStatus('job-failed-1');

      expect(status).toMatchObject({
        id: 'job-failed-1',
        state: expect.stringMatching(/failed|completed|active|waiting|delayed/),
      });
      if (status.state === 'failed') {
        expect(status.failedReason).toBeTruthy();
        expect(status.retryable).toBe(true);
      }
    });

    // TODO ATDD: remove .skip when implemented (Story 9.1, NFR6)
    it.skip('should authenticate scheduled callers via service account, not user session', async () => {
      const { isServiceRequest } = await import('../../services/pipeline/queue');

      expect(isServiceRequest({ headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY || 'test-service-key' } })).toBe(true);
      expect(isServiceRequest({ headers: {} })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Story 9.2 — Geplande retraining-trigger met notificatie (P0)
  // -------------------------------------------------------------------------

  describe('Scheduled retraining trigger', () => {
    // TODO ATDD: remove .skip when implemented (Story 9.2)
    it.skip('should evaluate retraining conditions with configurable thresholds', async () => {
      const { evaluateRetrainingTrigger } = await import('../../services/pipeline/trigger');

      const result = await evaluateRetrainingTrigger({
        minFeedbackCount: 50, // configureerbaar i.p.v. hardcoded MIN_FEEDBACK_COUNT
        minUnincorporatedRatio: 0.2,
        lowAccuracyThreshold: 0.9,
      });

      expect(result).toHaveProperty('shouldRetrain');
      expect(result).toHaveProperty('reasons');
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    // TODO ATDD: remove .skip when implemented (Story 9.2)
    it.skip('should include the concrete reason in the trigger notification', async () => {
      const { notifyRetrainingRecommended } = await import('../../services/pipeline/trigger');
      const socketSpy = vi.fn();

      await notifyRetrainingRecommended(
        { shouldRetrain: true, reasons: ['512 nieuwe gevalideerde annotaties sinds laatste training'] },
        { emit: socketSpy },
      );

      expect(socketSpy).toHaveBeenCalledWith(
        expect.stringMatching(/retraining/),
        expect.objectContaining({ reasons: expect.arrayContaining([expect.stringContaining('512')]) }),
      );
    });

    // TODO ATDD: remove .skip when implemented (Story 9.2)
    it.skip('should not send duplicate notifications within the dedup window', async () => {
      const { notifyRetrainingRecommended } = await import('../../services/pipeline/trigger');
      const socketSpy = vi.fn();
      const trigger = { shouldRetrain: true, reasons: ['testreden'] };

      await notifyRetrainingRecommended(trigger, { emit: socketSpy });
      await notifyRetrainingRecommended(trigger, { emit: socketSpy }); // zelfde venster

      expect(socketSpy).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Story 9.3 — Trainingspipeline als crash-bestendige job-flow (P0)
  // -------------------------------------------------------------------------

  describe('Training flow', () => {
    // TODO ATDD: remove .skip when implemented (Story 9.3)
    it.skip('should build a flow with the steps incorporate → batch → train → evaluate', async () => {
      const { buildTrainingFlow } = await import('../../services/pipeline/training-flow');

      const flow = buildTrainingFlow({ triggerId: 'trigger-1' });

      const stepNames = flattenFlowNames(flow);
      expect(stepNames).toEqual(
        expect.arrayContaining(['incorporate-feedback', 'build-batch', 'train-model', 'evaluate-model']),
      );
    });

    // TODO ATDD: remove .skip when implemented (Story 9.3)
    it.skip('should detect an aborted ML-service training and mark the step retryable', async () => {
      const { checkTrainingStep } = await import('../../services/pipeline/training-flow');

      // ML-service meldt job die niet meer bestaat/hangt
      const result = await checkTrainingStep({ mlJobId: 'ml-job-gone', startedAt: Date.now() - 60_000 });

      expect(result.state).toBe('failed');
      expect(result.retryable).toBe(true);
    });

    // TODO ATDD: remove .skip when implemented (Story 9.3, NFR2)
    it.skip('should only schedule the train step inside the configured window with concurrency 1', async () => {
      const { getTrainingJobOptions } = await import('../../services/pipeline/training-flow');

      const opts = getTrainingJobOptions();

      expect(opts.concurrency).toBe(1);
      expect(opts.window).toBeDefined(); // bijv. { start: '22:00', end: '06:00' }
    });
  });

  // -------------------------------------------------------------------------
  // Story 9.4 — Champion/challenger-kwaliteitsgate (P0)
  // -------------------------------------------------------------------------

  describe('Quality gate', () => {
    // TODO ATDD: remove .skip when implemented (Story 9.4)
    it.skip('should pass a challenger that meets or beats the champion on the same holdout set', async () => {
      const { evaluateGate } = await import('../../services/pipeline/quality-gate');

      const verdict = evaluateGate({
        champion: { holdoutAccuracy: 0.91, holdoutHash: 'sha256:abc' },
        challenger: { holdoutAccuracy: 0.93, holdoutHash: 'sha256:abc' },
      });

      expect(verdict.passed).toBe(true);
    });

    // TODO ATDD: remove .skip when implemented (Story 9.4)
    it.skip('should fail a challenger below the champion and include comparison figures', async () => {
      const { evaluateGate } = await import('../../services/pipeline/quality-gate');

      const verdict = evaluateGate({
        champion: { holdoutAccuracy: 0.91, holdoutHash: 'sha256:abc' },
        challenger: { holdoutAccuracy: 0.85, holdoutHash: 'sha256:abc' },
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.comparison).toMatchObject({ championAccuracy: 0.91, challengerAccuracy: 0.85 });
    });

    // TODO ATDD: remove .skip when implemented (Story 9.4)
    it.skip('should refuse to compare models evaluated on different holdout sets', async () => {
      const { evaluateGate } = await import('../../services/pipeline/quality-gate');

      const verdict = evaluateGate({
        champion: { holdoutAccuracy: 0.91, holdoutHash: 'sha256:abc' },
        challenger: { holdoutAccuracy: 0.95, holdoutHash: 'sha256:OTHER' },
      });

      expect(verdict.passed).toBe(false);
      expect(verdict.reason).toMatch(/holdout/i);
    });
  });
});

/** Hulpfunctie: namen van alle nodes in een BullMQ-flow-definitie. */
function flattenFlowNames(node: { name: string; children?: Array<{ name: string; children?: unknown[] }> }): string[] {
  const names = [node.name];
  for (const child of node.children ?? []) {
    names.push(...flattenFlowNames(child as { name: string; children?: [] }));
  }
  return names;
}
