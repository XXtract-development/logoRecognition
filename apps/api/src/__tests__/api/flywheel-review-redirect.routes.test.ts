/**
 * Story 19.12 — mens-accept = grondwaarheid → directe referentie (vervangt de
 * 13.2-AC6-ombuiging).
 *
 * Een expliciete menselijke accept registreert de bevestigde crop ALTIJD direct
 * als review-confirmed referentie (mlClient.registerReference), ongeacht de
 * FLYWHEEL_NOMINATION_ENABLED-vlag, en enqueue't GEEN nominatie meer. De
 * nominatie-omweg (13.2) is vervallen: review-nominaties slaan de promotiedrempel
 * over (nomination.ts, 19.11) en promoteOne kent geen storage_path-guard → dat
 * maakte een tweede, dubbele actieve referentie naast de directe registratie.
 * De gold-set-aanwas (14.1, recordAcceptDecision) blijft achter de vlag.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { mlClient } from '../../services/ml-client';
import { downloadTrainingObject } from '../../services/storage';

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

describe('Story 19.12 — reviewstation-accept → directe referentie', () => {
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

  it('Story 19.12: met vlag AAN registreert accept direct (review-confirmed) en enqueue-t GEEN nominatie', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    (mlClient.registerReference as any).mockResolvedValueOnce({ added: true, reason: 'added' });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/artwork/review-items/ri-0001/accept',
    });

    expect(res.statusCode).toBe(200);
    // 19.12: mens-accept = grondwaarheid → directe review-confirmed referentie,
    // ongeacht de vlag (dit faalt op het oude 13.2-ombuiggedrag dat onder de vlag
    // JUIST niet registreerde → rood→groen-regressietest).
    expect(mlClient.registerReference).toHaveBeenCalledWith(
      'artwork-crops/08718989912451/crop-1.png',
      'EU_ORGANIC_FARMING'
    );
    // GEEN nominatie meer: de omweg is vervallen om een dubbele actieve ref
    // (directe registratie + gepromoveerde review-nominatie) te voorkomen.
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('met vlag UIT: directe registratie ongewijzigd, geen nominatie', async () => {
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

  // Story 19.12 — handler 2 (human-annotation) krijgt dezelfde behandeling: ook
  // hier áltijd direct registreren, geen nominatie (dekt de tweede accept-handler).
  it('Story 19.12: annotate registreert de getekende crop direct (review-confirmed), geen nominatie', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    (mlClient.registerReference as any).mockResolvedValueOnce({ added: true, reason: 'added' });
    // downloadTrainingObject → een echt (klein) PNG-buffer zodat sharp de crop kan uitsnijden.
    const png = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 120, g: 160, b: 90 } },
    })
      .png()
      .toBuffer();
    (downloadTrainingObject as any).mockResolvedValue(png);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/artwork/review-items/ri-0001/annotate',
      payload: { rel: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
    });

    expect(res.statusCode).toBe(200);
    // Deterministische annotatie-cropkey (annot_{id}.png) → direct geregistreerd.
    expect(mlClient.registerReference).toHaveBeenCalledWith(
      'artwork-crops/08718989912451/annot_ri-0001.png',
      'EU_ORGANIC_FARMING'
    );
    expect(addSpy).not.toHaveBeenCalled();
  });
});
