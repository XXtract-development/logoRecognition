/**
 * Story 16.2 — GET /api/v1/flywheel/bootstrap-queue/:code/traceability (AC3).
 *
 * Route-flow-test (de service `mismatch-workload` heeft eigen unit-tests in
 * flywheel-workload.test.ts). Dekt: happy path (GTINs + verwerkingen), 404 zonder
 * onderliggende events, 500 bij servicefout, ADMIN-only (403 voor USER).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const getWorkloadItemTraceability = vi.fn();
vi.mock('../../services/flywheel/mismatch-workload', () => ({
  getWorkloadItemTraceability: (...a: unknown[]) => getWorkloadItemTraceability(...a),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/flywheel/bootstrap-queue/:code/traceability (AC3)', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it('happy path → 200 met GTINs + verwerkingen', async () => {
    getWorkloadItemTraceability.mockResolvedValue({
      t3777Code: 'A',
      distinctGtins: 2,
      gtins: ['1', '2'],
      events: [
        { gtin: '2', gln: 'GLN_A', origin: 'crosscheck', runId: 'r2', createdAt: new Date('2026-07-02') },
        { gtin: '1', gln: null, origin: 'kruischeck', runId: 'r1', createdAt: new Date('2026-07-01') },
      ],
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/bootstrap-queue/A/traceability',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.gtins).toEqual(['1', '2']);
    expect(body.events).toHaveLength(2);
    expect(getWorkloadItemTraceability).toHaveBeenCalledWith('A');
  });

  it('geen onderliggende events → 404', async () => {
    getWorkloadItemTraceability.mockResolvedValue({
      t3777Code: 'LEEG',
      distinctGtins: 0,
      gtins: [],
      events: [],
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/bootstrap-queue/LEEG/traceability',
    });
    expect(res.statusCode).toBe(404);
  });

  it('servicefout → 500', async () => {
    getWorkloadItemTraceability.mockRejectedValue(new Error('db down'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/bootstrap-queue/A/traceability',
    });
    expect(res.statusCode).toBe(500);
  });

  it('USER (niet-admin) → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/bootstrap-queue/A/traceability',
    });
    expect(res.statusCode).toBe(403);
    expect(getWorkloadItemTraceability).not.toHaveBeenCalled();
  });
});
