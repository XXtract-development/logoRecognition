/**
 * Story 13.2 — 12.3-pad-ombuiging (AC6) route-tests.
 *
 * Met FLYWHEEL_NOMINATION_ENABLED=true buigt het reviewstation-accept-pad om
 * naar nominatie (herkomst review, geënqueue-d) en roept het GEEN
 * mlClient.registerReference meer aan (ml-service schrijft geen referentie-
 * tabellen). Met de vlag uit blijft het legacy-12.3-gedrag ongewijzigd — dat is
 * de regressietest.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mlClient } from '../../services/ml-client';

const mockPrisma = new PrismaClient() as unknown as Record<string, any>;

const reviewItemWithCrop = {
  id: 'ri-0001',
  gtin: '08718989912451',
  t3777Code: 'EU_ORGANIC_FARMING',
  cropPath: 'artwork-crops/08718989912451/crop-1.png',
  sourceFile: 'artwork/08718989912451/x.png',
  bbox: { x: 10, y: 10, width: 80, height: 80 },
  confidence: 0.91,
  method: 'template',
  reason: 'Confidence onder drempel',
  status: 'open',
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-secret' });
  app.addHook('preHandler', async (request) => {
    (request as any).user = { userId: 'u1', email: 'a@b.c', role: 'ADMIN' };
  });
  const { artworkPipelineRoutes } = await import('../../api/v1/artwork-pipeline');
  await app.register(artworkPipelineRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('Story 13.2 — reviewstation-accept ombuiging (AC6)', () => {
  let app: FastifyInstance;
  let addSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    (mockPrisma.artworkReviewItem.findUnique as any).mockResolvedValue(reviewItemWithCrop);
    (mockPrisma.artworkReviewItem.update as any).mockResolvedValue({
      ...reviewItemWithCrop,
      status: 'accepted',
    });
    (mockPrisma.trainingData.create as any).mockResolvedValue({ id: 'td-1', label: 'EU_ORGANIC_FARMING' });
    (mockPrisma.trainingData.updateMany as any).mockResolvedValue({ count: 0 });

    // Spy op de enqueue-queue.
    const bullmq = await import('bullmq');
    addSpy = vi.fn().mockResolvedValue({ id: 'job-1' });
    (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      add: addSpy,
      close: vi.fn().mockResolvedValue(undefined),
      getJob: vi.fn().mockResolvedValue(null),
    }));

    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.FLYWHEEL_NOMINATION_ENABLED;
  });

  it('met vlag AAN: geen registerReference, wél nominatie-enqueue (AC6)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/artwork/review-items/ri-0001/accept',
    });

    expect(res.statusCode).toBe(200);
    // 12.3-registratie is uitgeschakeld (ml-service schrijft geen ref-tabellen).
    expect(mlClient.registerReference).not.toHaveBeenCalled();
    // In plaats daarvan een nominatie-job met herkomst review.
    expect(addSpy).toHaveBeenCalledOnce();
    const [jobName, jobData] = addSpy.mock.calls[0];
    expect(jobName).toBe('nominate-crosscheck');
    expect(jobData.origin).toBe('review');
    expect(jobData.detections[0].t3777Code).toBe('EU_ORGANIC_FARMING');
  });

  it('met vlag UIT: legacy-12.3-registratie ongewijzigd (regressietest, AC6)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    (mlClient.registerReference as any).mockResolvedValueOnce({ added: true, reason: 'added' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/artwork/review-items/ri-0001/accept',
    });

    expect(res.statusCode).toBe(200);
    expect(mlClient.registerReference).toHaveBeenCalledWith(
      'artwork-crops/08718989912451/crop-1.png',
      'EU_ORGANIC_FARMING'
    );
    expect(addSpy).not.toHaveBeenCalled();
  });
});
