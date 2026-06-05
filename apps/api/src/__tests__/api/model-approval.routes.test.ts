/**
 * Model Approval Routes Tests — ATDD RED PHASE (Epic 9, Story 9.5)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `it.skip`; verwijder de `.skip` per test zodra
 * Story 9.5 geïmplementeerd is.
 *
 * Contract (Story 9.5 — FR57, NFR5, NFR6):
 *   GET  /api/v1/models/approval-queue → challengers die de gate haalden, met
 *        evaluatierapport { challenger, champion, diff, datasetGrowth, triggerReasons }
 *   POST /api/v1/models/:modelId/activate → bestaande flow, MAAR:
 *        - service-account-callers (x-api-key) krijgen 403 — activatie vereist mens
 *        - elke activatie wordt gelogd met gebruiker + tijdstip
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mockUser } from '../helpers/mock-data';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

describe('Model Approval Routes (ATDD RED — Story 9.5)', () => {
  let app: FastifyInstance;

  function buildApp(authAs: 'user' | 'service' | 'anonymous'): Promise<FastifyInstance> {
    const instance = Fastify({ logger: false });
    return (async () => {
      await instance.register(cookie, { secret: 'test-secret' });
      instance.addHook('preHandler', async (request) => {
        if (authAs === 'user') {
          (request as any).user = { userId: mockUser.id, email: mockUser.email, role: 'USER' };
        } else if (authAs === 'service') {
          (request as any).serviceAccount = { name: 'pipeline-scheduler' };
        }
        // 'anonymous': decorate nothing — no request.user, no x-api-key. This
        // exercises the production path where main.ts has no global auth hook.
      });
      const { trainingRoutes } = await import('../../api/v1/training');
      await instance.register(trainingRoutes, { prefix: '/api/v1' });
      await instance.ready();
      return instance;
    })();
  }

  beforeEach(async () => {
    app = await buildApp('user');
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('GET /models/approval-queue', () => {
    // ATDD: Story 9.5 implemented
    it('should list gate-passing challengers with full evaluation report', async () => {
      (mockPrisma.modelVersion.findMany as vi.Mock).mockResolvedValue([
        {
          id: 'challenger-1',
          version: 'v20260610_031500',
          isActive: false,
          metrics: { holdout: { accuracy: 0.94, holdoutHash: 'sha256:abc' }, gate: { passed: true } },
        },
      ]);
      (mockPrisma.modelVersion.findFirst as vi.Mock).mockResolvedValue({
        id: 'champion-1',
        version: 'v20260601_000000',
        isActive: true,
        metrics: { holdout: { accuracy: 0.91 } },
      });

      const response = await app.inject({ method: 'GET', url: '/api/v1/models/approval-queue' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      const item = body.data[0];
      expect(item.evaluationReport).toMatchObject({
        challenger: expect.objectContaining({ holdoutAccuracy: expect.any(Number) }),
        champion: expect.objectContaining({ holdoutAccuracy: expect.any(Number) }),
        diff: expect.any(Object),
        triggerReasons: expect.any(Array),
      });
    });

    // ATDD: Story 9.5 implemented
    it('should exclude challengers that failed the gate', async () => {
      (mockPrisma.modelVersion.findMany as vi.Mock).mockResolvedValue([]);
      (mockPrisma.modelVersion.findFirst as vi.Mock).mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/api/v1/models/approval-queue' });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data).toHaveLength(0);
    });
  });

  describe('POST /models/:modelId/activate — human gate (NFR5)', () => {
    // ATDD: Story 9.5 implemented
    it('should refuse activation by service accounts with 403', async () => {
      const serviceApp = await buildApp('service');

      const response = await serviceApp.inject({
        method: 'POST',
        url: '/api/v1/models/challenger-1/activate',
        headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY || 'test-service-key' },
      });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toMatch(/menselijke|human|goedkeuring|approval/i);

      await serviceApp.close();
    });

    // ATDD: Story 9.5 implemented
    // Testcorrectie (8.2-precedent): Replaced the `??`-chain
    //   `mockPrisma.auditLog?.create ?? mockPrisma.modelActivationLog?.create`
    // with a direct assertion on `mockPrisma.modelActivationLog.create`.
    // The `??`-chain returned `undefined` when neither property existed on the mock,
    // causing `expect(undefined).toHaveBeenCalledWith(...)` to throw instead of fail.
    // Own table ModelActivationLog is the correct approach (not a generic auditLog).
    it('should log every activation with user and timestamp', async () => {
      (mockPrisma.modelVersion.findUnique as vi.Mock).mockResolvedValue({
        id: 'challenger-1',
        isActive: false,
      });
      (mockPrisma.modelActivationLog.create as vi.Mock).mockResolvedValue({ id: 'log-1' });

      await app.inject({
        method: 'POST',
        url: '/api/v1/models/challenger-1/activate',
      });

      // Activatie-audit: wie + wanneer (FR60-voorloper; volledige audit-trail in Story 10.3)
      expect(mockPrisma.modelActivationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
          }),
        }),
      );
    });

    // NFR5/NFR6 (pre-merge review): an anonymous caller (no JWT user, no
    // x-api-key) must be refused with 401 and must NOT produce a bogus
    // userId:'unknown' audit row. main.ts mounts no global auth hook, so the
    // activate handler enforces this itself. The user-decoration harness above
    // never exercises this path; this test registers the routes WITHOUT it.
    it('should refuse anonymous activation with 401 and write no audit log', async () => {
      const anonApp = await buildApp('anonymous');

      const response = await anonApp.inject({
        method: 'POST',
        url: '/api/v1/models/challenger-1/activate',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error.code).toBe('UNAUTHORIZED');
      // NFR6: no audit row may be created for an unauthenticated activation attempt.
      expect(mockPrisma.modelActivationLog.create).not.toHaveBeenCalled();

      await anonApp.close();
    });
  });
});
