/**
 * Story 13.6 — flywheel rollback-, export- en overview-pauze-routes.
 *
 * Dekt (AC 2/6):
 *  - POST /flywheel/batches/:id/rollback: happy path (200 + rolled_back), 400
 *    zonder reden, 404 onbekende batch, 409 niet-passed, ADMIN-only;
 *  - GET /flywheel/hard-negatives/export: JSON + CSV, ADMIN-only;
 *  - GET /flywheel/overview: bevat de pauze-stand `paused`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

// Mock de rollback-service (route-flow test — service heeft eigen unit-tests).
const rollbackBatch = vi.fn();
class BatchNotFoundError extends Error {}
class BatchNotRollbackableError extends Error {
  constructor(public batchId: string, public status: string) {
    super('not-rollbackable');
  }
}
vi.mock('../../services/flywheel/rollback', () => ({
  rollbackBatch: (...a: unknown[]) => rollbackBatch(...a),
  BatchNotFoundError,
  BatchNotRollbackableError,
}));

// Mock de export-service.
const getHardNegativeExport = vi.fn();
vi.mock('../../services/flywheel/hard-negative-export', () => ({
  getHardNegativeExport: (...a: unknown[]) => getHardNegativeExport(...a),
  toCsv: (rows: unknown[]) => `contentHash\n${rows.length}`,
}));

// Mock de pauze-stand voor de overview.
const getPauseState = vi.fn();
vi.mock('../../services/flywheel/pause', () => ({
  getPauseState: (...a: unknown[]) => getPauseState(...a),
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
  getPauseState.mockResolvedValue({ paused: false, reason: null, since: null, by: null });
  getHardNegativeExport.mockResolvedValue([]);
});

describe('POST /api/v1/flywheel/batches/:id/rollback (AC 2)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('happy path → 200 rolled_back', async () => {
    rollbackBatch.mockResolvedValue({ batchId: 'b1', deactivatedReferences: 2, candidateIds: ['c1', 'c2'] });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/batches/b1/rollback',
      payload: { reason: 'foute promotie' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('rolled_back');
    expect(body.deactivatedReferences).toBe(2);
    expect(rollbackBatch).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 'b1', reason: 'foute promotie', by: 'u1' })
    );
  });

  it('zonder reden → 400', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/batches/b1/rollback',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(rollbackBatch).not.toHaveBeenCalled();
  });

  it('onbekende batch → 404', async () => {
    rollbackBatch.mockRejectedValue(new BatchNotFoundError('nope'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/batches/nope/rollback',
      payload: { reason: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('niet-passed batch → 409', async () => {
    rollbackBatch.mockRejectedValue(new BatchNotRollbackableError('b1', 'quarantined'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/batches/b1/rollback',
      payload: { reason: 'x' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('niet-ADMIN → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/batches/b1/rollback',
      payload: { reason: 'x' },
    });
    expect(res.statusCode).toBe(403);
    expect(rollbackBatch).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/flywheel/hard-negatives/export (AC 6)', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('JSON-export → 200 met total + rows', async () => {
    getHardNegativeExport.mockResolvedValue([
      { contentHash: 'h1', t3777Code: 'A', cropPath: 'artwork-crops/1.png', reason: 'quarantaine-afkeuring', createdAt: 'now' },
    ]);
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/hard-negatives/export' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBe(1);
    expect(body.rows[0].reason).toBe('quarantaine-afkeuring');
  });

  it('CSV-export → 200 text/csv', async () => {
    getHardNegativeExport.mockResolvedValue([{ contentHash: 'h1' }]);
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/hard-negatives/export?format=csv' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('contentHash');
  });

  it('niet-ADMIN → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/hard-negatives/export' });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /api/v1/flywheel/overview — pauze-stand', () => {
  let app: FastifyInstance;
  afterEach(async () => { if (app) await app.close(); });

  it('bevat paused=true wanneer gepauzeerd', async () => {
    getPauseState.mockResolvedValue({ paused: true, reason: 'auto', since: 'now', by: 'system' });
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/overview' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.paused).toBe(true);
    expect(body.pause.reason).toBe('auto');
  });
});
