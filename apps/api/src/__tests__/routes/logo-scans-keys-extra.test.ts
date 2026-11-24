// SPEC-nutriscore-acc-test CAP-1 — LOGO_PIPELINE_KEYS_EXTRA naast LOGO_PIPELINE_KEYS
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLogoPipelineConsumer } from '../../services/pipeline/logo-pipeline-keys';

const originalEnv = { ...process.env };
beforeEach(() => {
  delete process.env.LOGO_PIPELINE_KEYS;
  delete process.env.LOGO_PIPELINE_KEYS_EXTRA;
  process.env.API_KEY = 'shared-api-key';
  process.env.PIPELINE_SERVICE_KEY = 'p'.repeat(32);
});
afterEach(() => { process.env = { ...originalEnv }; });

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
