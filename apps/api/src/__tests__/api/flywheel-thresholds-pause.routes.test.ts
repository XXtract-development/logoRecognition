/**
 * Story 15.4 — flywheel drempel- en pauze-routes.
 *
 * Dekt (AC 2/3/4):
 *  - GET /flywheel/thresholds: per-methode-view + historie, ADMIN-only;
 *  - PUT /flywheel/thresholds: 400 zonder reden (verplicht-redenveld-blokkade),
 *    400 buiten bereik, 400 onbekende methode, happy path 200, ADMIN-only;
 *  - POST /flywheel/pause: pauze/hervat happy path, 400 ongeldige actie,
 *    hervat-response bevat de openstaande-quarantaine-waarschuwing, ADMIN-only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

// Mock de drempel-service (route-flow test — service heeft eigen unit-tests).
const getThresholdsView = vi.fn();
const changeThreshold = vi.fn();
class ThresholdReasonRequiredError extends Error {}
class ThresholdMethodInvalidError extends Error {}
class ThresholdOutOfRangeError extends Error {}
vi.mock('../../services/flywheel/thresholds', () => ({
  getThresholdsView: (...a: unknown[]) => getThresholdsView(...a),
  changeThreshold: (...a: unknown[]) => changeThreshold(...a),
  ThresholdReasonRequiredError,
  ThresholdMethodInvalidError,
  ThresholdOutOfRangeError,
}));

// Mock de pauze-control-service.
const pauseFlywheelControlled = vi.fn();
const resumeFlywheelControlled = vi.fn();
vi.mock('../../services/flywheel/pause-control', () => ({
  pauseFlywheelControlled: (...a: unknown[]) => pauseFlywheelControlled(...a),
  resumeFlywheelControlled: (...a: unknown[]) => resumeFlywheelControlled(...a),
}));

// De overige services die het route-bestand importeert zijn hier niet onder test;
// hun echte implementaties draaien tegen de gemockte prisma uit setup.ts.

async function buildApp(role: 'ADMIN' | 'USER'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-secret' });
  app.addHook('preHandler', async (request) => {
    (request as any).user = { userId: 'sanne', email: 'a@b.c', role };
  });
  const { flywheelRoutes } = await import('../../api/v1/flywheel');
  await app.register(flywheelRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/flywheel/thresholds (AC 2)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('happy path → 200 met per-methode-view + historie', async () => {
    getThresholdsView.mockResolvedValue({
      methods: [
        { method: 'template', value: 0.9, envValue: 0.9, source: 'default', min: 0.5, max: 0.99, step: 0.01 },
        { method: 'embedding', value: 0.92, envValue: 0.9, source: 'override', min: 0.5, max: 0.99, step: 0.01 },
        { method: 'classifier', value: 0.9, envValue: 0.9, source: 'default', min: 0.5, max: 0.99, step: 0.01 },
      ],
      history: [],
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/thresholds' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.methods).toHaveLength(3);
    expect(body.methods.map((m: { method: string }) => m.method)).toEqual([
      'template',
      'embedding',
      'classifier',
    ]);
  });

  it('403 voor niet-ADMIN', async () => {
    app = await buildApp('USER');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/thresholds' });
    expect(res.statusCode).toBe(403);
  });
});

describe('PUT /api/v1/flywheel/thresholds (AC 2)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('400 zonder reden (verplicht-redenveld-blokkade)', async () => {
    changeThreshold.mockRejectedValue(new ThresholdReasonRequiredError('Een reden is verplicht.'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/flywheel/thresholds',
      payload: { method: 'template', newValue: 0.92, reason: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 buiten bereik', async () => {
    changeThreshold.mockRejectedValue(new ThresholdOutOfRangeError('buiten bereik'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/flywheel/thresholds',
      payload: { method: 'template', newValue: 1.5, reason: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 onbekende methode', async () => {
    changeThreshold.mockRejectedValue(new ThresholdMethodInvalidError('onbekend'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/flywheel/thresholds',
      payload: { method: 'foo', newValue: 0.9, reason: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 zonder numerieke waarde', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/flywheel/thresholds',
      payload: { method: 'template', reason: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('happy path → 200 en geeft userId door aan de service', async () => {
    changeThreshold.mockResolvedValue({
      method: 'embedding',
      oldValue: 0.9,
      newValue: 0.92,
      reason: 'reden',
      changedAt: '2026-07-03T09:00:00Z',
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/flywheel/thresholds',
      payload: { method: 'embedding', newValue: 0.92, reason: 'reden' },
    });
    expect(res.statusCode).toBe(200);
    expect(changeThreshold).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'embedding', newValue: 0.92, reason: 'reden', by: 'sanne' })
    );
  });

  it('403 voor niet-ADMIN', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/flywheel/thresholds',
      payload: { method: 'template', newValue: 0.9, reason: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/flywheel/pause (AC 3/4)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('pauze happy path → 200 en roept de pauze-service met userId aan', async () => {
    pauseFlywheelControlled.mockResolvedValue({
      paused: true, reason: 'x', since: 's', by: 'sanne', openQuarantines: null,
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/pause',
      payload: { action: 'pause' },
    });
    expect(res.statusCode).toBe(200);
    expect(pauseFlywheelControlled).toHaveBeenCalledWith('sanne', null);
    expect(JSON.parse(res.body).paused).toBe(true);
  });

  it('hervat happy path → 200 met openstaande-quarantaine-waarschuwing', async () => {
    resumeFlywheelControlled.mockResolvedValue({
      paused: false, reason: null, since: null, by: 'sanne', openQuarantines: 2,
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/pause',
      payload: { action: 'resume' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.paused).toBe(false);
    expect(body.openQuarantines).toBe(2);
  });

  it('400 bij een ongeldige actie', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/pause',
      payload: { action: 'stop' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('403 voor niet-ADMIN', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/pause',
      payload: { action: 'pause' },
    });
    expect(res.statusCode).toBe(403);
  });
});
