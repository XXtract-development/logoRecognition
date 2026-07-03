/**
 * Story 15.3 — batch-detail-, kandidaat-decision- en batch-close-routes.
 *
 * Route-flow-test (de services hebben eigen unit-tests). Dekt:
 *   - GET  /flywheel/batches/:id            → 200 detail, 404 onbekend, ADMIN-only.
 *   - POST /flywheel/candidates/:id/decision → 200 afkeuren/vrijgeven, 400 ongeldig,
 *     404 onbekend, 409 batch in verwerking, 409 conflict, ADMIN-only.
 *   - POST /flywheel/batches/:id/close      → 200, 404, 409 niet-afsluitbaar/onbeoordeeld.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const getBatchDetail = vi.fn();
const decideCandidate = vi.fn();
const closeBatch = vi.fn();

class BatchDetailNotFoundError extends Error {}
class CandidateNotFoundError extends Error {}
class CandidateBatchProcessingError extends Error {}
class CandidateConflictError extends Error {}
class BatchCloseNotFoundError extends Error {}
class BatchNotFullyReviewedError extends Error {
  constructor(public batchId: string, public pending: number) {
    super('not-reviewed');
  }
}
class BatchNotCloseableError extends Error {}

vi.mock('../../services/flywheel/batch-detail', () => ({
  getBatchDetail: (...a: unknown[]) => getBatchDetail(...a),
  BatchDetailNotFoundError,
}));
vi.mock('../../services/flywheel/candidate-decision', () => ({
  decideCandidate: (...a: unknown[]) => decideCandidate(...a),
  isCandidateDecision: (d: string) => ['afkeuren', 'vrijgeven', 'undo'].includes(d),
  CandidateNotFoundError,
  CandidateBatchProcessingError,
  CandidateConflictError,
}));
vi.mock('../../services/flywheel/batch-close', () => ({
  closeBatch: (...a: unknown[]) => closeBatch(...a),
  BatchCloseNotFoundError,
  BatchNotFullyReviewedError,
  BatchNotCloseableError,
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

describe('GET /api/v1/flywheel/batches/:id (AC1)', () => {
  let app: FastifyInstance;
  afterEach(async () => app && (await app.close()));

  it('happy path → 200 met detail', async () => {
    getBatchDetail.mockResolvedValue({ batch: { batchId: 'b1' }, candidates: [], promotionThresholds: {} });
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/batches/b1' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).batch.batchId).toBe('b1');
  });

  it('onbekende batch → 404', async () => {
    getBatchDetail.mockRejectedValue(new BatchDetailNotFoundError('nope'));
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/batches/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('niet-ADMIN → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/batches/b1' });
    expect(res.statusCode).toBe(403);
    expect(getBatchDetail).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/flywheel/candidates/:id/decision (AC2/AC3)', () => {
  let app: FastifyInstance;
  afterEach(async () => app && (await app.close()));

  it('afkeuren happy path → 200', async () => {
    decideCandidate.mockResolvedValue({ candidateId: 'c1', status: 'rejected', decision: 'afkeuren' });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/c1/decision',
      payload: { decision: 'afkeuren' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('rejected');
    expect(decideCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ candidateId: 'c1', decision: 'afkeuren', by: 'u1' })
    );
  });

  it('vrijgeven happy path → 200 candidate', async () => {
    decideCandidate.mockResolvedValue({ candidateId: 'c1', status: 'candidate', decision: 'vrijgeven' });
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/c1/decision',
      payload: { decision: 'vrijgeven' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('candidate');
  });

  it('ongeldige decision → 400 zonder de service aan te roepen', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/c1/decision',
      payload: { decision: 'promoveren' },
    });
    expect(res.statusCode).toBe(400);
    expect(decideCandidate).not.toHaveBeenCalled();
  });

  it('onbekende kandidaat → 404', async () => {
    decideCandidate.mockRejectedValue(new CandidateNotFoundError('nope'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/nope/decision',
      payload: { decision: 'afkeuren' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('kandidaat in een batch IN VERWERKING → 409 (AD-16)', async () => {
    decideCandidate.mockRejectedValue(new CandidateBatchProcessingError('c1'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/c1/decision',
      payload: { decision: 'afkeuren' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('verloren conditional-update-race → 409', async () => {
    decideCandidate.mockRejectedValue(new CandidateConflictError('c1', 'in_batch', 'gewijzigd'));
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/c1/decision',
      payload: { decision: 'vrijgeven' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('niet-ADMIN → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/flywheel/candidates/c1/decision',
      payload: { decision: 'afkeuren' },
    });
    expect(res.statusCode).toBe(403);
    expect(decideCandidate).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/flywheel/batches/:id/close (AC4)', () => {
  let app: FastifyInstance;
  afterEach(async () => app && (await app.close()));

  it('happy path → 200 met samenvattingsaantallen', async () => {
    closeBatch.mockResolvedValue({ batchId: 'b1', closedAt: '2026-07-03T00:00:00.000Z', rejected: 3, released: 5 });
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'POST', url: '/api/v1/flywheel/batches/b1/close', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.rejected).toBe(3);
    expect(body.released).toBe(5);
  });

  it('onbekende batch → 404', async () => {
    closeBatch.mockRejectedValue(new BatchCloseNotFoundError('nope'));
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'POST', url: '/api/v1/flywheel/batches/nope/close', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('nog onbeoordeelde kandidaten → 409', async () => {
    closeBatch.mockRejectedValue(new BatchNotFullyReviewedError('b1', 2));
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'POST', url: '/api/v1/flywheel/batches/b1/close', payload: {} });
    expect(res.statusCode).toBe(409);
  });

  it('niet-afsluitbaar → 409', async () => {
    closeBatch.mockRejectedValue(new BatchNotCloseableError('b1'));
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'POST', url: '/api/v1/flywheel/batches/b1/close', payload: {} });
    expect(res.statusCode).toBe(409);
  });
});
