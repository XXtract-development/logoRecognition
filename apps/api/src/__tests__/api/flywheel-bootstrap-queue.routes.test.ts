/**
 * Story 17.2 AC2 — GET/POST/PATCH /api/v1/flywheel/bootstrap-queue.
 *
 * Route-flow-test (de service `bootstrap-queue` heeft eigen unit-tests). Dekt:
 * GET-sortering (via de service), mutaties (override/excluded/add + enqueue),
 * validatie (400), 404 onbekende code, ADMIN-only (403 voor USER).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const getBootstrapQueue = vi.fn();
const setPriorityOverride = vi.fn();
const setExcluded = vi.fn();
const addClass = vi.fn();
const enqueueBootstrapRun = vi.fn();

class BootstrapQueueCodeNotFoundError extends Error {}
class BootstrapQueueInvalidCodeError extends Error {}

vi.mock('../../services/flywheel/bootstrap-queue', () => ({
  getBootstrapQueue: (...a: unknown[]) => getBootstrapQueue(...a),
  setPriorityOverride: (...a: unknown[]) => setPriorityOverride(...a),
  setExcluded: (...a: unknown[]) => setExcluded(...a),
  addClass: (...a: unknown[]) => addClass(...a),
  BootstrapQueueCodeNotFoundError,
  BootstrapQueueInvalidCodeError,
}));

vi.mock('../../services/flywheel/bootstrap-run', () => ({
  enqueueBootstrapRun: (...a: unknown[]) => enqueueBootstrapRun(...a),
}));

async function buildApp(role: 'ADMIN' | 'USER'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-secret' });
  app.addHook('preHandler', async (request) => {
    (request as any).user = { userId: 'u1', email: 'a@b.c', role };
  });
  const { flywheelRoutes } = await import('../../api/v1/flywheel');
  await app.register(flywheelRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/flywheel/bootstrap-queue (AC2)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('happy path → 200 met effectief geordende lijst', async () => {
    getBootstrapQueue.mockResolvedValue({
      items: [
        { t3777Code: 'HIGH', status: 'wachtend', declarationFrequency: 100, priorityOverride: null, excluded: false, lastRunAt: null, createdAt: '2026-07-01', newlyActivated: false },
      ],
      newlyActivatedCodes: [],
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/bootstrap-queue' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).items).toHaveLength(1);
  });

  it('USER (niet-admin) → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/bootstrap-queue' });
    expect(res.statusCode).toBe(403);
    expect(getBootstrapQueue).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/flywheel/bootstrap-queue/:code (AC2)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('override zetten → 200, service aangeroepen met gebruiker', async () => {
    setPriorityOverride.mockResolvedValue({ t3777Code: 'A', priorityOverride: 5 });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/flywheel/bootstrap-queue/A',
      payload: { priorityOverride: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(setPriorityOverride).toHaveBeenCalledWith('A', 5, 'u1');
  });

  it('override wissen (null) → service met null', async () => {
    setPriorityOverride.mockResolvedValue({ t3777Code: 'A', priorityOverride: null });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/flywheel/bootstrap-queue/A',
      payload: { priorityOverride: null },
    });
    expect(res.statusCode).toBe(200);
    expect(setPriorityOverride).toHaveBeenCalledWith('A', null, 'u1');
  });

  it('excluded togglen → 200, service aangeroepen', async () => {
    setExcluded.mockResolvedValue({ t3777Code: 'A', excluded: true });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/flywheel/bootstrap-queue/A',
      payload: { excluded: true },
    });
    expect(res.statusCode).toBe(200);
    expect(setExcluded).toHaveBeenCalledWith('A', true, 'u1');
  });

  it('lege body → 400', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/flywheel/bootstrap-queue/A',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('onbekende code → 404', async () => {
    setExcluded.mockRejectedValue(new BootstrapQueueCodeNotFoundError('NOPE'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/flywheel/bootstrap-queue/NOPE',
      payload: { excluded: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it('USER → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/flywheel/bootstrap-queue/A',
      payload: { excluded: true },
    });
    expect(res.statusCode).toBe(403);
    expect(setExcluded).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/flywheel/bootstrap-queue (AC2 + taak 5)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it("action 'add' → klasse toegevoegd (200)", async () => {
    addClass.mockResolvedValue({ t3777Code: 'NEW', status: 'wachtend' });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/bootstrap-queue',
      payload: { action: 'add', t3777Code: 'NEW', declarationFrequency: 12 },
    });
    expect(res.statusCode).toBe(200);
    expect(addClass).toHaveBeenCalledWith('NEW', 12, 'u1');
  });

  it("action 'add' met lege code → 400", async () => {
    addClass.mockRejectedValue(new BootstrapQueueInvalidCodeError());
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/bootstrap-queue',
      payload: { action: 'add', t3777Code: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it("action 'enqueue' → 202, run geagendeerd", async () => {
    enqueueBootstrapRun.mockResolvedValue(undefined);
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/bootstrap-queue',
      payload: { action: 'enqueue', t3777Code: 'A' },
    });
    expect(res.statusCode).toBe(202);
    expect(enqueueBootstrapRun).toHaveBeenCalledWith('A');
  });

  it('onbekende action → 400', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/bootstrap-queue',
      payload: { action: 'weird' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('USER → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/bootstrap-queue',
      payload: { action: 'add', t3777Code: 'X' },
    });
    expect(res.statusCode).toBe(403);
    expect(addClass).not.toHaveBeenCalled();
  });
});
