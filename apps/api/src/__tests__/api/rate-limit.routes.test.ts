/**
 * Rate-limit error handling + thumbnail-flood exclusion (Story 12.13)
 *
 * Root cause (see story 12-13-rate-limit-429-en-thumbnail-flood.md): `@fastify/rate-limit`
 * does `throw errorResponseBuilder(req, context)` (its index.js) and relies on the thrown
 * value carrying `statusCode` — its own default builder does exactly that. The app's
 * previous `errorResponseBuilder` (main.ts) returned a plain body object WITHOUT
 * `statusCode`, so the global errorHandler's `error.statusCode || 500` fell through to
 * 500 INTERNAL_ERROR instead of the existing 429 branch, masking real rate-limit
 * rejections as server errors. The review-UI's code-picker (`RefThumb` in
 * MobileReviewDeck.tsx, capped at 80 rendered rows) also renders one `<img>` per filtered
 * keurmerk code, firing up to ~80 `GET /reference-logos/code/:code/image` requests at once
 * that ate the same per-IP budget and caused the next legitimate action (e.g. accept) to be
 * rejected. Fix: a bounded per-route override (3x the global budget) on that one route, NOT
 * a full `rateLimit: false` bypass — the route has no auth gate and does a DB lookup + MinIO
 * download + sharp resize per hit, so leaving it fully unmetered would itself be a
 * resource-exhaustion regression (flagged in adversarial review).
 *
 * These tests mirror the real rate-limit registration (main.ts) and register the real
 * `referenceLogosRoutes` module so the exclusion is exercised against actual production
 * code, not a stand-in.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { errorHandler } from '../../middleware/errorHandler';
import { referenceLogosRoutes } from '../../api/v1/reference-logos';
import { PrismaClient } from '@prisma/client';
import { downloadTrainingObject } from '../../services/storage';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

const RATE_LIMIT_MAX = 3;
// Mirrors the hardcoded per-route override on GET /reference-logos/code/:code/image
// (apps/api/src/api/v1/reference-logos.ts) — kept in sync deliberately so this suite
// notices if that route's bound ever drifts from what these tests assume.
const THUMBNAIL_ROUTE_MAX = 300;

/**
 * Builds a test app that mirrors main.ts's rate-limit registration (same
 * errorResponseBuilder + same errorHandler) with a small global `max` so the
 * non-excluded-route tests stay fast/deterministic, plus the real
 * reference-logos routes (to prove the per-route override works against
 * actual production code) and one plain non-excluded route (to prove the
 * global limiter still bites elsewhere).
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(rateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: 60000,
    errorResponseBuilder: () => {
      const err = new Error('Too many requests, please slow down') as Error & {
        statusCode: number;
      };
      err.statusCode = 429;
      return err;
    },
  });

  app.setErrorHandler(errorHandler);

  await app.register(referenceLogosRoutes, { prefix: '/api/v1' });

  // Non-excluded, otherwise-identical GET route — proves the global limiter
  // still protects endpoints that are NOT explicitly exempted.
  app.get('/api/v1/__test__/limited', async () => ({ ok: true }));

  await app.ready();
  return app;
}

describe('Rate limiting — 429 mapping + thumbnail-flood exclusion (Story 12.13)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    (mockPrisma.referenceLogo.findFirst as vi.Mock).mockResolvedValue({
      id: 'ref-1',
      t3777Code: 'EU_ORGANIC_FARMING',
      variantLabel: 'kleur-nl',
      storagePath: 'reference-logos/EU_ORGANIC_FARMING/kleur-nl.png',
      active: true,
    });
    (downloadTrainingObject as vi.Mock).mockResolvedValue(
      Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
        'hex',
      ),
    );
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('AC1/AC3: returns 429 with RATE_LIMIT_EXCEEDED (not 500) once a non-excluded route is over budget', async () => {
    const responses = [];
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      responses.push(
        await app.inject({ method: 'GET', url: '/api/v1/__test__/limited' }),
      );
    }

    const withinBudget = responses.slice(0, RATE_LIMIT_MAX);
    const overBudget = responses[RATE_LIMIT_MAX];

    for (const res of withinBudget) {
      expect(res.statusCode).toBe(200);
    }

    // The bug produced a 500 INTERNAL_ERROR here; the fix must produce 429.
    expect(overBudget.statusCode).toBe(429);
    expect(overBudget.statusCode).not.toBe(500);
    const body = JSON.parse(overBudget.body);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.code).not.toBe('INTERNAL_ERROR');
    expect(overBudget.headers['retry-after']).toBeDefined();
    expect(overBudget.headers['x-ratelimit-limit']).toBeDefined();
  });

  it('AC2: the thumbnail route survives a realistic bulk-fanout (a full 80-row picker open) without hitting 429', async () => {
    const responses = [];
    // 80 = the review-UI code-picker's actual render cap (MobileReviewDeck.tsx
    // `pickList` is `.slice(0, 80)`), well within the route's own 300/60s budget
    // and far past the tiny global budget (RATE_LIMIT_MAX=3) used elsewhere in
    // this test file — proving the per-route override, not the global limiter,
    // governs this endpoint.
    for (let i = 0; i < 80; i++) {
      responses.push(
        await app.inject({
          method: 'GET',
          url: '/api/v1/reference-logos/code/EU_ORGANIC_FARMING/image',
        }),
      );
    }

    for (const res of responses) {
      expect(res.statusCode).not.toBe(429);
      expect(res.statusCode).toBe(200);
    }
  });

  it('AC3: the thumbnail route is bounded, not fully unmetered — its own higher budget still trips 429 eventually', async () => {
    const responses = [];
    for (let i = 0; i < THUMBNAIL_ROUTE_MAX + 1; i++) {
      responses.push(
        await app.inject({
          method: 'GET',
          url: '/api/v1/reference-logos/code/EU_ORGANIC_FARMING/image',
        }),
      );
    }

    const overBudget = responses[THUMBNAIL_ROUTE_MAX];
    expect(overBudget.statusCode).toBe(429);
    const body = JSON.parse(overBudget.body);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  }, 15000);

  it('AC2/AC3: the thumbnail route\'s own (higher) budget does not leak into or borrow from non-excluded routes', async () => {
    // Exhaust a good chunk of the excluded route's OWN, separate budget...
    for (let i = 0; i < RATE_LIMIT_MAX * 5; i++) {
      await app.inject({
        method: 'GET',
        url: '/api/v1/reference-logos/code/EU_ORGANIC_FARMING/image',
      });
    }

    // ...the non-excluded route must still enforce its own, untouched (tiny) budget.
    const responses = [];
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      responses.push(
        await app.inject({ method: 'GET', url: '/api/v1/__test__/limited' }),
      );
    }
    expect(responses[RATE_LIMIT_MAX].statusCode).toBe(429);
  });

  it('AC4: existing error-handler mappings (400/401/403/404/413/415) remain intact, alongside the 429 fix', () => {
    const send = vi.fn();
    const reply = { status: vi.fn(() => ({ send })) } as any;
    const request = { id: 'req-1', method: 'GET', url: '/x' } as any;

    const cases: Array<[Partial<{ statusCode: number; code: string; validation: unknown }>, number, string]> = [
      [{ validation: [{}] }, 400, 'VALIDATION_ERROR'],
      [{ statusCode: 401 }, 401, 'UNAUTHORIZED'],
      [{ statusCode: 403 }, 403, 'FORBIDDEN'],
      [{ statusCode: 404 }, 404, 'NOT_FOUND'],
      [{ code: 'FST_ERR_CTP_BODY_TOO_LARGE' }, 413, 'PAYLOAD_TOO_LARGE'],
      [{ code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
      [{ statusCode: 429 }, 429, 'RATE_LIMIT_EXCEEDED'],
    ];

    for (const [errorInput, expectedStatus, expectedCode] of cases) {
      reply.status.mockClear();
      send.mockClear();
      errorHandler(errorInput as any, request, reply);
      expect(reply.status).toHaveBeenCalledWith(expectedStatus);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: expectedCode }) }),
      );
    }
  });
});
