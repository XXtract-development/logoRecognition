/**
 * Story 13.2 — flywheel overview-route (AC7).
 *
 * GET /api/v1/flywheel/overview ontsluit de gemiste-nominatie-teller
 * (missedNominations) — dashboard-voeding (Story 15.2).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

describe('Story 13.2 — GET /api/v1/flywheel/overview (AC7)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    app.addHook('preHandler', async (request) => {
      (request as any).user = { userId: 'u1', email: 'a@b.c', role: 'ADMIN' };
    });
    const { flywheelRoutes } = await import('../../api/v1/flywheel');
    await app.register(flywheelRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('geeft de gemiste-nominatie-teller met alle redenen terug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/overview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.missedNominations).toBeDefined();
    expect(Object.keys(body.missedNominations).sort()).toEqual(
      ['pauze', 'phash-onbereikbaar', 'vlag-uit'].sort()
    );
    expect(typeof body.missedNominationsTotal).toBe('number');
  });

  // Story 13.4 (AC9): de overview ontsluit de watchdog-observatie
  // lastSuccessfulPromotionRun (ISO-timestamp of null).
  it('ontsluit lastSuccessfulPromotionRun (Story 13.4, AC9)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/overview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect('lastSuccessfulPromotionRun' in body).toBe(true);
    expect(
      body.lastSuccessfulPromotionRun === null ||
        typeof body.lastSuccessfulPromotionRun === 'string'
    ).toBe(true);
  });

  // Story 14.2 (AC1/AC4): de overview ontsluit het paneel goldSetComposition,
  // on-read berekend. De gemockte gold_set_records is leeg → expliciet 'set-leeg'.
  it('ontsluit het paneel goldSetComposition (Story 14.2, AC1/AC4)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/overview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.goldSetComposition).toBeDefined();
    const g = body.goldSetComposition;
    expect(g.size).toBe(0);
    expect(g.labelDistribution).toEqual({ echt: 0, vals: 0, other: 0, echtRatio: 0 });
    expect(g.topClasses).toEqual([]);
    expect(g.bottomClasses).toEqual([]);
    expect(g.skewSignals).toEqual([{ type: 'set-leeg', waarde: 0, drempel: 0 }]);
    expect(g.thresholds).toEqual({ classShareMax: 0.2, echtMin: 0.6, echtMax: 0.9 });
  });

  // Story 14.2 (AC1/AC2): met een gevulde actieve set retourneert het paneel de
  // verdeling, top-5 én de scheefgroei-signalen (klasse >20%, ECHT buiten band).
  it('rapporteert verdeling, top-5 en scheefgroei-signalen bij een gevulde set (Story 14.2, AC1/AC2)', async () => {
    const prisma = (await import('../../core/db')).default as unknown as {
      goldSetRecord: { findMany: ReturnType<typeof vi.fn> };
    };
    // 5 actieve records: 4 ECHT (80%), 1 VALS; klasse A = 3/5 = 60% > 20%.
    prisma.goldSetRecord.findMany.mockResolvedValueOnce([
      { label: 'ECHT', t3777Code: 'A' },
      { label: 'ECHT', t3777Code: 'A' },
      { label: 'ECHT', t3777Code: 'A' },
      { label: 'ECHT', t3777Code: 'B' },
      { label: 'VALS', t3777Code: 'B' },
    ]);

    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/overview' });
    expect(res.statusCode).toBe(200);
    const g = JSON.parse(res.body).goldSetComposition;
    expect(g.size).toBe(5);
    expect(g.labelDistribution.echt).toBe(4);
    expect(g.labelDistribution.echtRatio).toBeCloseTo(0.8, 5);
    expect(g.topClasses[0]).toMatchObject({ t3777Code: 'A', count: 3 });
    // A = 60% > 20% → klasse-signaal. 80% ECHT ligt binnen 60–90% → geen band-signaal.
    expect(
      g.skewSignals.some(
        (s: { type: string; klasse?: string }) =>
          s.type === 'klasse-oververtegenwoordigd' && s.klasse === 'A'
      )
    ).toBe(true);
    expect(
      g.skewSignals.some((s: { type: string }) => s.type === 'echt-aandeel-buiten-band')
    ).toBe(false);
  });
});
