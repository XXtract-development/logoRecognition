/**
 * Holdout Routes Tests — ATDD RED PHASE (Epic 7, Stories 7.1 & 7.2)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `it.skip`; verwijder de `.skip` per test zodra de
 * bijbehorende story geïmplementeerd is. De tests beschrijven het VERWACHTE
 * gedrag (API-contract) van de holdout-functionaliteit.
 *
 * Contract (Story 7.1 — FR41, NFR3):
 *   PATCH /api/v1/training/data/:id/holdout   { holdout: boolean } → 200 { id, holdout }
 *   GET   /api/v1/training/data?holdout=true  → 200 { data: [...] } (alleen holdout-records)
 *   POST  /api/v1/training/start              → 422 wanneer holdout-set leeg of < minimum
 *
 * Contract (Story 7.2 — FR42):
 *   GET /api/v1/models/:modelId               → 200 { ..., holdoutMetrics: { accuracy,
 *        precision, recall, f1, holdoutSize, holdoutHash } }
 *   GET /api/v1/feedback/model-comparison     → comparisons[].holdoutMetrics aanwezig
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mockUser } from '../helpers/mock-data';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

const mockTrainingDataRecord = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  imageId: 'a1b2c3d4-0000-0000-0000-000000000002',
  label: 'EU_ORGANIC_FARMING',
  confidence: 0.97,
  validated: true,
  holdout: false,
  createdAt: new Date('2026-06-01T10:00:00Z'),
};

describe('Holdout Routes (ATDD RED — Story 7.1 & 7.2)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });

    // Mock auth middleware (zelfde patroon als feedback.routes.test.ts)
    app.addHook('preHandler', async (request) => {
      (request as any).user = {
        userId: mockUser.id,
        email: mockUser.email,
        role: 'USER',
      };
    });

    // Bestaande training-routes; de nieuwe holdout-endpoints horen hier te landen.
    const { trainingRoutes } = await import('../../api/v1/training');
    await app.register(trainingRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Story 7.1 — Holdout-markering (FR41) — P0
  // -------------------------------------------------------------------------

  describe('PATCH /training/data/:id/holdout', () => {
    // TODO ATDD: remove .skip when implemented (Story 7.1)
    it('should mark a training data record as holdout', async () => {
      (mockPrisma.trainingData.update as vi.Mock).mockResolvedValue({
        ...mockTrainingDataRecord,
        holdout: true,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/training/data/${mockTrainingDataRecord.id}/holdout`,
        payload: { holdout: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.holdout).toBe(true);
      expect(mockPrisma.trainingData.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTrainingDataRecord.id },
          data: expect.objectContaining({ holdout: true }),
        }),
      );
    });

    // TODO ATDD: remove .skip when implemented (Story 7.1)
    it('should unmark a holdout record back to trainable', async () => {
      (mockPrisma.trainingData.update as vi.Mock).mockResolvedValue({
        ...mockTrainingDataRecord,
        holdout: false,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/training/data/${mockTrainingDataRecord.id}/holdout`,
        payload: { holdout: false },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).holdout).toBe(false);
    });

    // TODO ATDD: remove .skip when implemented (Story 7.1)
    it('should return 404 for an unknown training data id', async () => {
      (mockPrisma.trainingData.update as vi.Mock).mockRejectedValue(
        Object.assign(new Error('Record not found'), { code: 'P2025' }),
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/training/data/00000000-0000-0000-0000-000000000000/holdout',
        payload: { holdout: true },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /training/data?holdout=true', () => {
    // TODO ATDD: remove .skip when implemented (Story 7.1)
    it('should return only holdout records when filtered', async () => {
      (mockPrisma.trainingData.findMany as vi.Mock).mockResolvedValue([
        { ...mockTrainingDataRecord, holdout: true },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/data?holdout=true',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.every((r: { holdout: boolean }) => r.holdout === true)).toBe(true);
      expect(mockPrisma.trainingData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ holdout: true }),
        }),
      );
    });
  });

  describe('POST /training/start — holdout guard (NFR3)', () => {
    // TODO ATDD: remove .skip when implemented (Story 7.1)
    it('should refuse to start training when the holdout set is empty', async () => {
      // Geen enkel holdout-record aanwezig
      (mockPrisma.trainingData.count as vi.Mock).mockResolvedValue(0);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {
          batch_id: 'a1b2c3d4-0000-0000-0000-00000000000b',
          config: { epochs: 10, batch_size: 16 },
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toMatch(/holdout/i);
    });

    // TODO ATDD: remove .skip when implemented (Story 7.1)
    it('should refuse to start training when holdout set is below configured minimum', async () => {
      // 3 records terwijl het minimum (default) hoger ligt
      (mockPrisma.trainingData.count as vi.Mock).mockResolvedValue(3);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {
          batch_id: 'a1b2c3d4-0000-0000-0000-00000000000b',
          config: { epochs: 10, batch_size: 16 },
        },
      });

      expect(response.statusCode).toBe(422);
      expect(JSON.parse(response.body).error).toMatch(/holdout/i);
    });
  });

  // -------------------------------------------------------------------------
  // Story 7.2 — Holdout-evaluatie (FR42) — P0
  // -------------------------------------------------------------------------

  describe('GET /models/:modelId — holdout metrics', () => {
    // TODO ATDD: remove .skip when implemented (Story 7.2)
    it.skip('should expose holdout metrics separately from train/val metrics', async () => {
      (mockPrisma.modelVersion.findUnique as vi.Mock).mockResolvedValue({
        id: 'a1b2c3d4-0000-0000-0000-00000000000c',
        version: 'v20260603_120000',
        accuracy: 0.96,
        metrics: {
          holdout: {
            accuracy: 0.93,
            precision: 0.92,
            recall: 0.91,
            f1: 0.915,
            holdoutSize: 250,
            holdoutHash: 'sha256:abc123',
          },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/models/a1b2c3d4-0000-0000-0000-00000000000c',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.holdoutMetrics).toBeDefined();
      expect(body.holdoutMetrics.accuracy).toBeGreaterThan(0);
      expect(body.holdoutMetrics.holdoutSize).toBeGreaterThan(0);
      expect(body.holdoutMetrics.holdoutHash).toMatch(/^sha256:/);
      // holdout-metrics zijn onderscheiden van train-metrics
      expect(body.holdoutMetrics.accuracy).not.toBe(body.accuracy);
    });
  });

  describe('GET /feedback/model-comparison — holdout metrics per versie', () => {
    // TODO ATDD: remove .skip when implemented (Story 7.2)
    it.skip('should include holdout metrics for each compared model version', async () => {
      // Aparte app met feedback-routes (zelfde patroon als feedback.routes.test.ts)
      const feedbackApp = Fastify({ logger: false });
      await feedbackApp.register(cookie, { secret: 'test-secret' });
      feedbackApp.addHook('preHandler', async (request) => {
        (request as any).user = { userId: mockUser.id, email: mockUser.email, role: 'USER' };
      });
      const { feedbackRoutes } = await import('../../api/v1/feedback');
      await feedbackApp.register(feedbackRoutes, { prefix: '/api/v1' });
      await feedbackApp.ready();

      (mockPrisma.modelVersion.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'model-a',
          version: 'v20260601_090000',
          accuracy: 0.95,
          isActive: true,
          metrics: { holdout: { accuracy: 0.92, holdoutHash: 'sha256:abc123' } },
        },
        {
          id: 'model-b',
          version: 'v20260603_120000',
          accuracy: 0.97,
          isActive: false,
          metrics: { holdout: { accuracy: 0.94, holdoutHash: 'sha256:abc123' } },
        },
      ]);

      const response = await feedbackApp.inject({
        method: 'GET',
        url: '/api/v1/feedback/model-comparison',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      for (const comparison of body.comparisons) {
        expect(comparison.holdoutMetrics).toBeDefined();
        expect(comparison.holdoutMetrics.holdoutHash).toBe('sha256:abc123');
      }

      await feedbackApp.close();
    });
  });
});
