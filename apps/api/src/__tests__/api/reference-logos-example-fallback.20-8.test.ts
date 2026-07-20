/**
 * Story 20.8 — Voorbeeld-logo altijd aanwezig.
 *
 * `/reference-logos/code/:code/image` moet, wanneer er GEEN actieve
 * reference_logo is, terugvallen op een opgeslagen GS1-gids-VOORBEELDbeeld
 * (`reference-examples/<code>.png`) zodat de reviewer altijd ziet naar welk
 * logo hij zoekt. Bestaat ook dat niet -> 404. Het voorbeeld is UITSLUITEND
 * voor weergave (geen reference_logos-rij, geen embedding) — dit endpoint
 * raakt de herkenning niet.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { errorHandler } from '../../middleware/errorHandler';
import { referenceLogosRoutes } from '../../api/v1/reference-logos';
import { PrismaClient } from '@prisma/client';
import { downloadTrainingObject } from '../../services/storage';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  await app.register(referenceLogosRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('Story 20.8 — voorbeeld-logo gids-fallback', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });
  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('AC1: actieve referentie aanwezig -> serveert de referentie (source=reference)', async () => {
    (mockPrisma.referenceLogo.findFirst as vi.Mock).mockResolvedValue({
      id: 'ref-1',
      t3777Code: 'EU_ORGANIC_FARMING',
      variantLabel: 'kleur-nl',
      storagePath: 'reference-logos/EU_ORGANIC_FARMING/kleur-nl.png',
      active: true,
    });
    (downloadTrainingObject as vi.Mock).mockResolvedValue(PNG);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reference-logos/code/EU_ORGANIC_FARMING/image',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-reference-source']).toBe('reference');
    expect(downloadTrainingObject).toHaveBeenCalledWith(
      'reference-logos/EU_ORGANIC_FARMING/kleur-nl.png',
    );
  });

  it('AC1: geen actieve referentie maar gids-voorbeeld bestaat -> serveert het voorbeeld (source=guide-example)', async () => {
    (mockPrisma.referenceLogo.findFirst as vi.Mock).mockResolvedValue(null);
    (downloadTrainingObject as vi.Mock).mockImplementation(async (key: string) =>
      key === 'reference-examples/SOCIETY_PLASTICS_INDUSTRY.png' ? PNG : null,
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reference-logos/code/SOCIETY_PLASTICS_INDUSTRY/image',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-reference-source']).toBe('guide-example');
    expect(downloadTrainingObject).toHaveBeenCalledWith(
      'reference-examples/SOCIETY_PLASTICS_INDUSTRY.png',
    );
  });

  it('AC1: geen referentie én geen gids-voorbeeld -> 404', async () => {
    (mockPrisma.referenceLogo.findFirst as vi.Mock).mockResolvedValue(null);
    (downloadTrainingObject as vi.Mock).mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reference-logos/code/NIET_IN_GIDS/image',
    });

    expect(res.statusCode).toBe(404);
  });

  it('AC2: het fallback-pad raakt reference_logos NIET (alleen een lees-download)', async () => {
    (mockPrisma.referenceLogo.findFirst as vi.Mock).mockResolvedValue(null);
    (downloadTrainingObject as vi.Mock).mockImplementation(async (key: string) =>
      key === 'reference-examples/BDIH_LOGO.png' ? PNG : null,
    );

    await app.inject({
      method: 'GET',
      url: '/api/v1/reference-logos/code/BDIH_LOGO/image',
    });

    // geen create/update/delete op referenceLogo — puur weergave
    expect(mockPrisma.referenceLogo.create as vi.Mock).not.toHaveBeenCalled();
    expect(mockPrisma.referenceLogo.update as vi.Mock).not.toHaveBeenCalled();
  });

  it('review-F2: een code met traversal-tekens -> 404 zonder storage-toegang', async () => {
    (mockPrisma.referenceLogo.findFirst as vi.Mock).mockResolvedValue(null);
    (downloadTrainingObject as vi.Mock).mockResolvedValue(PNG);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/reference-logos/code/' + encodeURIComponent('../../secret') + '/image',
    });

    expect(res.statusCode).toBe(404);
    expect(downloadTrainingObject).not.toHaveBeenCalled();
  });
});
