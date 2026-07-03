/**
 * Story 15.2 — POST /api/v1/flywheel/outliers/:id/decision (AC6).
 *
 * Route-flow-test (service heeft eigen unit-tests). Dekt: happy path
 * behouden/deactiveren, 400 ongeldige decision, 404 onbekende finding, 409 reeds
 * beoordeeld (idempotentie), ADMIN-only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const decideOutlier = vi.fn();
class OutlierFindingNotFoundError extends Error {}
class OutlierFindingAlreadyDecidedError extends Error {
  constructor(public findingId: string, public status: string) {
    super('already-decided');
  }
}
vi.mock('../../services/flywheel/outlier-decision', () => ({
  decideOutlier: (...a: unknown[]) => decideOutlier(...a),
  OutlierFindingNotFoundError,
  OutlierFindingAlreadyDecidedError,
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

describe('POST /api/v1/flywheel/outliers/:id/decision (AC6)', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
  });

  it('behouden happy path → 200', async () => {
    decideOutlier.mockResolvedValue({
      findingId: 'f1',
      status: 'behouden',
      referenceLogoId: 'r1',
      deactivated: false,
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/outliers/f1/decision',
      payload: { decision: 'behouden' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('behouden');
    expect(decideOutlier).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: 'f1', decision: 'behouden', by: 'u1' })
    );
  });

  it('deactiveren happy path → 200 (soft-delete gemeld)', async () => {
    decideOutlier.mockResolvedValue({
      findingId: 'f1',
      status: 'gedeactiveerd',
      referenceLogoId: 'r1',
      deactivated: true,
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/outliers/f1/decision',
      payload: { decision: 'deactiveren' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('gedeactiveerd');
    expect(body.deactivated).toBe(true);
  });

  it('ongeldige decision → 400 zonder de service aan te roepen', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/outliers/f1/decision',
      payload: { decision: 'verwijderen' },
    });
    expect(res.statusCode).toBe(400);
    expect(decideOutlier).not.toHaveBeenCalled();
  });

  it('onbekende finding → 404', async () => {
    decideOutlier.mockRejectedValue(new OutlierFindingNotFoundError('nope'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/outliers/nope/decision',
      payload: { decision: 'behouden' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('reeds beoordeelde finding → 409 (idempotentie)', async () => {
    decideOutlier.mockRejectedValue(new OutlierFindingAlreadyDecidedError('f1', 'behouden'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/outliers/f1/decision',
      payload: { decision: 'deactiveren' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('niet-ADMIN → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/outliers/f1/decision',
      payload: { decision: 'behouden' },
    });
    expect(res.statusCode).toBe(403);
    expect(decideOutlier).not.toHaveBeenCalled();
  });
});
