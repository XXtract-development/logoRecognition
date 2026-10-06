// Story 1.1 — service-key auth for POST /api/v1/pipeline/logo-scans (FR-20, AD-3, NFR-4)
vi.unmock('../../middleware/auth');
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logoScanRoutes } from '../../api/v1/logo-scans';
import { parseLogoPipelineKeys, resolveLogoPipelineConsumer } from '../../services/pipeline/logo-pipeline-keys';
import { logger } from '../../core/logger';

const originalEnv = { ...process.env };
const URL = '/api/v1/pipeline/logo-scans';

async function app() {
  const server = Fastify();
  await server.register(logoScanRoutes, { prefix: '/api/v1' });
  return server;
}

beforeEach(() => {
  process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1,beheer:test-key-2';
  process.env.API_KEY = 'shared-api-key';
  process.env.PIPELINE_SERVICE_KEY = 'p'.repeat(32);
});
afterEach(() => { vi.restoreAllMocks(); process.env = { ...originalEnv }; });

describe('LOGO_PIPELINE_KEYS parsing', () => {
  it('parses name:key pairs, trims, splits on first colon only', () => {
    expect(parseLogoPipelineKeys(' a:k1 , b:k:2 ')).toEqual([{ name: 'a', key: 'k1' }, { name: 'b', key: 'k:2' }]);
  });
  it('ignores empty, malformed and unnamed entries; undefined gives none', () => {
    expect(parseLogoPipelineKeys(undefined)).toEqual([]);
    expect(parseLogoPipelineKeys('')).toEqual([]);
    expect(parseLogoPipelineKeys('nocolon,:nokeyname,noval:,ok:x')).toEqual([{ name: 'ok', key: 'x' }]);
  });
  it('resolves exact match only: no prefix, no longer key, no wrong case', () => {
    expect(resolveLogoPipelineConsumer('test-key-2')).toBe('beheer');
    for (const bad of ['test-key', 'test-key-1x', 'TEST-KEY-1', '', undefined, 'lr_org_abcdef']) {
      expect(resolveLogoPipelineConsumer(bad as string | undefined)).toBeNull();
    }
  });
});

describe('POST /api/v1/pipeline/logo-scans auth', () => {
  it('401 without key, unknown key, lr_ shaped key, shared API_KEY, PIPELINE_SERVICE_KEY, prefix', async () => {
    const server = await app();
    const headers: Array<Record<string, string>> = [
      {}, { 'x-api-key': 'unknown-key' }, { 'x-api-key': 'lr_org_0123456789abcdef' },
      { 'x-api-key': 'shared-api-key' }, { 'x-api-key': 'p'.repeat(32) }, { 'x-api-key': 'test-key' },
    ];
    for (const h of headers) {
      const res = await server.inject({ method: 'POST', url: URL, headers: h, payload: {} });
      expect(res.statusCode).toBe(401);
      const err = res.json().error;
      expect(err.code).toBe('UNAUTHORIZED');
      expect(typeof err.message).toBe('string');
      expect(err.requestId).toBeTruthy();
    }
    await server.close();
  });
  it('401 for a duplicated or comma-joined x-api-key header', async () => {
    const server = await app();
    const res = await server.inject({ method: 'POST', url: URL, headers: { 'x-api-key': 'test-key-1, x' }, payload: {} });
    expect(res.statusCode).toBe(401);
    await server.close();
  });
  it('fails closed (401) when LOGO_PIPELINE_KEYS is missing or empty', async () => {
    const server = await app();
    for (const v of [undefined, '']) {
      if (v === undefined) delete process.env.LOGO_PIPELINE_KEYS; else process.env.LOGO_PIPELINE_KEYS = v;
      const res = await server.inject({ method: 'POST', url: URL, headers: { 'x-api-key': 'test-key-1' }, payload: {} });
      expect(res.statusCode).toBe(401);
    }
    await server.close();
  });
  it('valid key gives 501 NOT_IMPLEMENTED stub', async () => {
    const server = await app();
    const res = await server.inject({ method: 'POST', url: URL, headers: { 'x-api-key': 'test-key-2' }, payload: {} });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED');
    await server.close();
  });
  it('never logs key values; logs only consumer name on success', async () => {
    const calls: unknown[] = [];
    for (const m of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, m).mockImplementation(((...a: unknown[]) => { calls.push(a); return logger; }) as never);
    }
    const server = await app();
    await server.inject({ method: 'POST', url: URL, headers: { 'x-api-key': 'unknown-secret-xyz' }, payload: {} });
    await server.inject({ method: 'POST', url: URL, headers: { 'x-api-key': 'test-key-1' }, payload: {} });
    const dump = JSON.stringify(calls);
    expect(dump).not.toContain('unknown-secret-xyz');
    expect(dump).not.toContain('test-key-1');
    expect(dump).not.toContain('test-key-2');
    expect(dump).toContain('n8n');
    await server.close();
  });
});
