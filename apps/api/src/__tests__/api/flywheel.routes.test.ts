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
});
