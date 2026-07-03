/**
 * Verify-declared route tests — Story 12.8 (AC1/AC6/AC9).
 *
 * Route-flow with a mocked verify-flow service:
 *   - POST returns 202 { runId } with the system API key (n8n path).
 *   - GET polls the run-state: running → done with verdicts.
 *   - no-artwork run-state is surfaced verbatim.
 *   - 404 for an unknown runId.
 *   - 401 without any auth (no x-api-key, no JWT).
 *   - a JWT (dashboard) also works.
 *
 * The verify-flow service (enqueue + run) is unit-tested separately; here it is
 * mocked so the route contract is asserted in isolation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

// Mock the verify-flow service so the route test is isolated from BullMQ/Redis.
const enqueueVerifyDeclared = vi.fn().mockResolvedValue(undefined);
const readRunState = vi.fn();
vi.mock('../../services/pipeline/verify-flow', () => ({
  enqueueVerifyDeclared: (...args: unknown[]) => enqueueVerifyDeclared(...args),
  readRunState: (...args: unknown[]) => readRunState(...args),
}));

const GTIN = '08718989912451';
const API_KEY = 'system-test-key';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-secret' });
  const { verifyDeclaredRoutes } = await import('../../api/v1/verify-declared');
  await app.register(verifyDeclaredRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('Story 12.8 — verify-declared routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.API_KEY = API_KEY;
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // AC1 — POST 202 { runId } with the system API key
  // -------------------------------------------------------------------------
  it('AC1: POST returns 202 { runId } for the system API key (n8n)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artwork/${GTIN}/verify-declared`,
      headers: { 'x-api-key': API_KEY },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(typeof body.runId).toBe('string');
    expect(enqueueVerifyDeclared).toHaveBeenCalledWith(GTIN, body.runId);
  });

  it('AC1: rejects an invalid GTIN with 400 (no run started)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artwork/not-a-gtin/verify-declared`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.statusCode).toBe(400);
    expect(enqueueVerifyDeclared).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC9 — API-key auth (401 without key)
  // -------------------------------------------------------------------------
  it('AC9: returns 401 without any auth (no x-api-key, no JWT)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artwork/${GTIN}/verify-declared`,
    });
    expect(res.statusCode).toBe(401);
    expect(enqueueVerifyDeclared).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC6 — GET poll: running → done with verdicts
  // -------------------------------------------------------------------------
  it('AC6: GET polls running then done with verdicts', async () => {
    readRunState.mockResolvedValueOnce({
      status: 'running',
      gtin: GTIN,
      declaration: { reason: 'ok', codes: ['GREEN_DOT'] },
      verdicts: [],
      processingTimeMs: null,
    });

    const running = await app.inject({
      method: 'GET',
      url: `/api/v1/artwork/verify-declared/runs/run-1`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(running.statusCode).toBe(200);
    expect(running.json().status).toBe('running');

    readRunState.mockResolvedValueOnce({
      status: 'done',
      gtin: GTIN,
      declaration: { reason: 'ok', codes: ['GREEN_DOT'] },
      verdicts: [
        {
          declaredCode: 'GREEN_DOT',
          code: 'GREEN_DOT',
          alias: null,
          verdict: 'CONFIRMED',
          confidence: 0.95,
          bbox: { x: 1, y: 2, width: 10, height: 10 },
          sourceFile: 'artwork/x/a.png',
          method: 'template',
        },
      ],
      processingTimeMs: 1234,
    });

    const done = await app.inject({
      method: 'GET',
      url: `/api/v1/artwork/verify-declared/runs/run-1`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(done.statusCode).toBe(200);
    const body = done.json();
    expect(body.status).toBe('done');
    expect(body.verdicts[0].verdict).toBe('CONFIRMED');
    expect(body.declaration.reason).toBe('ok');
    expect(body.processingTimeMs).toBe(1234);
  });

  it('AC1/AC6: surfaces a no-artwork run-state verbatim', async () => {
    readRunState.mockResolvedValue({
      status: 'no-artwork',
      gtin: GTIN,
      declaration: { reason: 'ok', codes: [] },
      verdicts: [],
      processingTimeMs: 12,
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artwork/verify-declared/runs/run-2`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('no-artwork');
  });

  it('AC6: returns 404 for an unknown runId', async () => {
    readRunState.mockResolvedValue(null);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/artwork/verify-declared/runs/unknown`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.statusCode).toBe(404);
  });

  it('AC1: a JWT-authenticated dashboard user can also start a run', async () => {
    // A separate app that injects a JWT user via a preHandler BEFORE the route
    // auth — the route's verifyDeclaredAuth falls back to authMiddleware which
    // accepts an already-attached valid token. Here we assert the API-key branch
    // is not the only path by supplying a valid bearer via the auth service.
    const { generateTokens } = await import('../../services/auth');
    const { accessToken: token } = generateTokens({ userId: 'u1', email: 'a@b.c', role: 'ADMIN' });
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/artwork/${GTIN}/verify-declared`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(202);
  });
});
