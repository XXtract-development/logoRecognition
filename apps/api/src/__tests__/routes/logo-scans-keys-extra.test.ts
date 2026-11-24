// SPEC-nutriscore-acc-test CAP-1 — LOGO_PIPELINE_KEYS_EXTRA naast LOGO_PIPELINE_KEYS
// spec-nutriscore-acc-review-fixes — review A1/A2/A4, E1-E4, V3
vi.unmock('../../middleware/auth');
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logoScanRoutes } from '../../api/v1/logo-scans';
import { resolveLogoPipelineConsumer } from '../../services/pipeline/logo-pipeline-keys';
import { logger } from '../../core/logger';

const originalEnv = { ...process.env };
beforeEach(() => {
  delete process.env.LOGO_PIPELINE_KEYS;
  delete process.env.LOGO_PIPELINE_KEYS_EXTRA;
  process.env.API_KEY = 'shared-api-key';
  process.env.PIPELINE_SERVICE_KEY = 'p'.repeat(32);
});
afterEach(() => { vi.restoreAllMocks(); process.env = { ...originalEnv }; });

describe('LOGO_PIPELINE_KEYS_EXTRA', () => {
  it('(a) only the main list: unchanged behaviour', () => {
    process.env.LOGO_PIPELINE_KEYS = 'n8n-acc:k-main';
    expect(resolveLogoPipelineConsumer('k-main')).toBe('n8n-acc');
    expect(resolveLogoPipelineConsumer('other')).toBeNull();
  });
  it('(b) both lists: a key from either works and gives its own name', () => {
    process.env.LOGO_PIPELINE_KEYS = 'n8n-acc:k-main';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'nutriscore-test:k-extra';
    expect(resolveLogoPipelineConsumer('k-main')).toBe('n8n-acc');
    expect(resolveLogoPipelineConsumer('k-extra')).toBe('nutriscore-test');
  });
  it('(c) only EXTRA set: its key works', () => {
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'nutriscore-test:k-extra';
    expect(resolveLogoPipelineConsumer('k-extra')).toBe('nutriscore-test');
  });
  it('(d) both empty or unset: nobody gets in', () => {
    expect(resolveLogoPipelineConsumer('k-extra')).toBeNull();
    process.env.LOGO_PIPELINE_KEYS = '';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = '';
    expect(resolveLogoPipelineConsumer('k-extra')).toBeNull();
  });
  it('(e) prefix, shared keys and an empty key never match', () => {
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'nutriscore-test:k-extra';
    for (const bad of ['k-ext', 'k-extra-x', 'shared-api-key', 'p'.repeat(32), '', undefined]) {
      expect(resolveLogoPipelineConsumer(bad as string | undefined)).toBeNull();
    }
  });
  it('(f) a broken EXTRA entry leaves the main list intact', () => {
    process.env.LOGO_PIPELINE_KEYS = 'n8n-acc:k-main';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'garbage,:nokeyname,noval:';
    expect(resolveLogoPipelineConsumer('k-main')).toBe('n8n-acc');
    expect(resolveLogoPipelineConsumer('garbage')).toBeNull();
  });
});

// Each case uses its own values: parsing is memoised per (main, extra) value pair.
function spyWarn() {
  const calls: unknown[][] = [];
  vi.spyOn(logger, 'warn').mockImplementation(((...a: unknown[]) => { calls.push(a); return logger; }) as never);
  return calls;
}

describe('LOGO_PIPELINE_KEYS_EXTRA guards (review)', () => {
  it('[P0] an EXTRA entry reusing a main-list name is refused and warned by name only', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'n8n-acc:k-main-a1';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'n8n-acc:k-clash-a1,nutriscore-test:k-ok-a1';
    expect(resolveLogoPipelineConsumer('k-clash-a1')).toBeNull();
    expect(resolveLogoPipelineConsumer('k-main-a1')).toBe('n8n-acc');
    expect(resolveLogoPipelineConsumer('k-ok-a1')).toBe('nutriscore-test');
    const dump = JSON.stringify(warns);
    expect(dump).toContain('LOGO_PIPELINE_KEYS_EXTRA');
    expect(dump).toContain('n8n-acc');
    expect(dump).not.toContain('k-clash-a1');
    expect(dump).not.toContain('k-main-a1');
  });
  it('[P0] the same key in both lists keeps the main name and warns with names, never the key', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'main-a2:k-dup-a2';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'extra-a2:k-dup-a2';
    expect(resolveLogoPipelineConsumer('k-dup-a2')).toBe('main-a2');
    const dump = JSON.stringify(warns);
    expect(dump).toContain('extra-a2');
    expect(dump).not.toContain('k-dup-a2');
  });
  it('[P1] whitespace-only EXTRA and a trailing comma are silent', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'main-e3:k-main-e3';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = '   ';
    expect(resolveLogoPipelineConsumer('k-main-e3')).toBe('main-e3');
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'extra-e3:k-extra-e3,';
    expect(resolveLogoPipelineConsumer('k-extra-e3')).toBe('extra-e3');
    expect(warns).toEqual([]);
  });
  it('[P1] a broken EXTRA entry is warned under the EXTRA label', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'main-e4:k-main-e4';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'garbage-e4';
    expect(resolveLogoPipelineConsumer('k-main-e4')).toBe('main-e4');
    expect(warns).toHaveLength(1);
    expect(String(warns[0][0])).toContain('LOGO_PIPELINE_KEYS_EXTRA');
  });
  it('[P1] the same configuration warns once, not on every request', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'main-a4:k-main-a4';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'garbage-a4';
    for (let i = 0; i < 3; i++) resolveLogoPipelineConsumer('k-main-a4');
    expect(warns).toHaveLength(1);
  });
  it('[P1] a key repeated inside EXTRA: first wins, the later duplicate is dropped with its name only', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'main-d1:k-main-d1';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'extra-d1a:k-dup-d1,extra-d1b:k-dup-d1';
    expect(resolveLogoPipelineConsumer('k-dup-d1')).toBe('extra-d1a');
    const dump = JSON.stringify(warns);
    expect(dump).toContain('extra-d1b');
    expect(dump).not.toContain('k-dup-d1');
  });
  it('[P1] a key repeated inside the main list: first wins, warned with names only', () => {
    const warns = spyWarn();
    process.env.LOGO_PIPELINE_KEYS = 'main-d2a:k-dup-d2,main-d2b:k-dup-d2';
    expect(resolveLogoPipelineConsumer('k-dup-d2')).toBe('main-d2a');
    const dump = JSON.stringify(warns);
    expect(dump).toContain('main-d2b');
    expect(dump).not.toContain('k-dup-d2');
  });
  it('[P1] the same EXTRA name twice with new keys is key rotation and stays allowed', () => {
    process.env.LOGO_PIPELINE_KEYS = 'main-r1:k-main-r1';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'rot-r1:k-rot-old-r1,rot-r1:k-rot-new-r1';
    expect(resolveLogoPipelineConsumer('k-rot-old-r1')).toBe('rot-r1');
    expect(resolveLogoPipelineConsumer('k-rot-new-r1')).toBe('rot-r1');
  });
  it('[P0] route: a clashing EXTRA key gets 401, the main key still authenticates', async () => {
    process.env.LOGO_PIPELINE_KEYS = 'n8n-acc:k-main-v3';
    process.env.LOGO_PIPELINE_KEYS_EXTRA = 'n8n-acc:k-clash-v3';
    const server = Fastify();
    try {
      await server.register(multipart);
      await server.register(logoScanRoutes, { prefix: '/api/v1' });
      const post = (key: string) => server.inject({ method: 'POST', url: '/api/v1/pipeline/logo-scans', headers: { 'x-api-key': key }, payload: {} });
      expect((await post('k-clash-v3')).statusCode).toBe(401);
      expect((await post('k-main-v3')).statusCode).toBe(400); // authenticated; empty body is INVALID_IMAGE
    } finally {
      await server.close();
    }
  });
});
