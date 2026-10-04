vi.unmock('../../middleware/auth');
vi.unmock('../../services/ml-client');
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ghsReviewRoutes } from '../../api/v1/ghs-review';
import { MLClient, mlClient, MLServiceError } from '../../services/ml-client';

const originalEnv = { ...process.env };
const body = { image: 'original-base64', mimeType: 'image/png' as const };
async function app() {
  const server = Fastify();
  await server.register(cookie);
  await server.register(ghsReviewRoutes, { prefix: '/api/v1' });
  return server;
}
function token(role: string) {
  return jwt.sign({ userId: 'review-user', email: 'review@example.test', role }, process.env.JWT_SECRET!);
}
beforeEach(() => {
  process.env.PIPELINE_SERVICE_KEY = 'p'.repeat(32);
  process.env.GHS_REVIEW_INTERNAL_KEY = 'i'.repeat(32);
});
afterEach(() => { vi.restoreAllMocks(); process.env = { ...originalEnv }; });

describe('GHS review gateway', () => {
  it('accepts exact service key, preserves partial answer, and forwards only input', async () => {
    const review = vi.spyOn(mlClient, 'reviewGhs').mockResolvedValue({ status: 'partial', humanReviewRequired: true });
    const server = await app();
    const result = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY }, payload: body });
    expect(result.statusCode).toBe(200);
    expect(result.json().status).toBe('partial');
    expect(review).toHaveBeenCalledWith(body);
    await server.close();
  });
  it('checks ADMIN role and never falls back from a supplied wrong key to JWT', async () => {
    const review = vi.spyOn(mlClient, 'reviewGhs').mockResolvedValue({ status: 'ai-reviewed' });
    const server = await app();
    const cases: Array<{ headers: Record<string,string>; status: number }> = [
      { headers: {}, status: 401 },
      { headers: { authorization: 'Bearer invalid' }, status: 401 },
      { headers: { 'x-api-key': 'lr_fake' }, status: 401 },
      { headers: { authorization: `Bearer ${token('ADMIN')}` }, status: 200 },
      { headers: { authorization: `Bearer ${token('USER')}` }, status: 403 },
      { headers: { 'x-api-key': 'wrong', authorization: `Bearer ${token('ADMIN')}` }, status: 401 },
    ];
    for (const item of cases) {
      const result = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: item.headers, payload: body });
      expect(result.statusCode).toBe(item.status);
    }
    expect(review).toHaveBeenCalledTimes(1);
    await server.close();
  });
  it('fails closed when service key is unconfigured', async () => {
    delete process.env.PIPELINE_SERVICE_KEY;
    const review = vi.spyOn(mlClient, 'reviewGhs');
    const server = await app();
    const result = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: { 'x-api-key': 'whatever' }, payload: body });
    expect(result.statusCode).toBe(503);
    expect(review).not.toHaveBeenCalled();
    await server.close();
  });
  it.each([
    [{ ...body, prompt: 'secret-prompt' }, 422],
    [{ ...body, mimeType: 'image/gif' }, 422],
    [{ ...body, image: ['original-base64'] }, 422],
    [{ ...body, mimeType: ['image/png'] }, 422],
    [{ ...body, image: 123 }, 422],
    [null, 422],
    [{ ...body, image: 'x'.repeat(6 * 1024 * 1024) }, 413],
  ])('rejects schema and size violations', async (payload, status) => {
    const review = vi.spyOn(mlClient, 'reviewGhs');
    const server = await app();
    const result = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY }, payload });
    expect(result.statusCode).toBe(status);
    expect(result.body).not.toContain('secret-prompt');
    expect(review).not.toHaveBeenCalled();
    await server.close();
  });
  it.each([401, 403, 413, 422, 429, 502, 503, 504])('preserves safe upstream status %i', async (status) => {
    vi.spyOn(mlClient, 'reviewGhs').mockRejectedValue(new MLServiceError('safe', status, 'safe'));
    const server = await app();
    const result = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY }, payload: body });
    expect(result.statusCode).toBe(status);
    await server.close();
  });
});

describe('Dedicated ML review transport', () => {
  it('uses internal auth, no redirects, and timeout above ML deadline', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { status: 'ai-reviewed' } });
    const result = await new MLClient('http://ml.test').reviewGhs(body);
    expect(result).toEqual({ status: 'ai-reviewed' });
    expect(post).toHaveBeenCalledWith('http://ml.test/ml/ghs/review', body, expect.objectContaining({ timeout: 105000, maxRedirects: 0, headers: expect.objectContaining({ 'x-ghs-review-key': 'i'.repeat(32) }) }));
  });
  it('fails before HTTP when key is absent and supports explicit pipeline fallback', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    delete process.env.GHS_REVIEW_INTERNAL_KEY;
    delete process.env.PIPELINE_SERVICE_KEY;
    const client = new MLClient('http://ml.test');
    await expect(client.reviewGhs(body)).rejects.toMatchObject({ statusCode: 503 });
    expect(post).not.toHaveBeenCalled();
    process.env.PIPELINE_SERVICE_KEY = 'p'.repeat(32);
    await client.reviewGhs(body);
    expect(post).toHaveBeenCalledWith(expect.any(String), body, expect.objectContaining({ headers: expect.objectContaining({ 'x-ghs-review-key': 'p'.repeat(32) }) }));
  });
  it.each([
    [{ response: { status: 429, data: 'secret-provider-image' } }, 429],
    [{ code: 'ECONNABORTED' }, 504],
    [{ code: 'ECONNREFUSED' }, 503],
    [{ response: { status: 500, data: 'secret-provider-image' } }, 502],
  ])('sanitizes raw Axios errors', async (details, status) => {
    vi.spyOn(axios, 'post').mockRejectedValue({ isAxiosError: true, message: 'secret-provider-image', config: { headers: { Authorization: 'secret-key' }, data: 'secret-image' }, ...details });
    try {
      await new MLClient('http://ml.test').reviewGhs(body);
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MLServiceError);
      expect(error).toMatchObject({ statusCode: status });
      expect(JSON.stringify(error)).not.toContain('secret');
      expect((error as Error).message).not.toContain('secret');
    }
  });
});


describe('Gateway transport integration', () => {
  it.each(['ai-reviewed', 'partial'])('returns the intact real-client %s response', async (status) => {
    const response = {
      status, humanReviewRequired: true, labelType: 'ai-prelabel',
      reviews: [
        { reviewId: 'a', configuredModel: 'vision-a', returnedModel: 'actual-a', status: 'succeeded', output: { pageType: 'label', readability: 'readable', annotations: [] }, projectedAnnotations: [] },
        status === 'partial' ? { reviewId: 'b', configuredModel: 'vision-b', status: 'failed', error: { code: 'PROVIDER_ERROR' } } : { reviewId: 'b', status: 'succeeded', output: { pageType: 'technical', readability: 'uncertain', annotations: [] } },
      ],
      comparison: { status: status === 'partial' ? 'incomplete' : 'disagree' },
    };
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: response });
    const server = await app();
    const result = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY }, payload: body });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual(response);
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/ml/ghs/review'), body, expect.objectContaining({ headers: expect.objectContaining({ 'x-ghs-review-key': 'i'.repeat(32) }) }));
    await server.close();
  });

  it('preserves real global rate-limit status and retry headers', async () => {
    const review = vi.spyOn(mlClient, 'reviewGhs').mockResolvedValue({ status: 'ai-reviewed' });
    const server = Fastify();
    await server.register(cookie);
    await server.register(rateLimit, { max: 1, timeWindow: 60000 });
    await server.register(ghsReviewRoutes, { prefix: '/api/v1' });
    const request = { method: 'POST' as const, url: '/api/v1/ghs/review', headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY }, payload: body };
    expect((await server.inject(request)).statusCode).toBe(200);
    const blocked = await server.inject(request);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.headers['x-ratelimit-limit']).toBe('1');
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(review).toHaveBeenCalledTimes(1);
    await server.close();
  });
});
