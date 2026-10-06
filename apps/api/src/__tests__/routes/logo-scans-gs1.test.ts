// Story 1.5 — worker bouwt het GS1-blok; signalWord op de POST (FR-5..FR-8, AD-6)
vi.unmock('../../middleware/auth');
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, Buffer | string>();
  const redis = {
    store,
    async get(k: string) { const v = store.get(k); return v === undefined ? null : v.toString(); },
    async getBuffer(k: string) { const v = store.get(k); return v === undefined ? null : Buffer.from(v); },
    async setex(k: string, _t: number, v: Buffer | string) { store.set(k, v); return 'OK'; },
    async eval(_s: string, _n: number, k: string, v: string) {
      const cur = store.get(k); if (cur && ['done', 'failed'].includes(JSON.parse(cur.toString()).status)) return 0;
      store.set(k, v); return 1;
    },
    async del(k: string) { store.delete(k); return 1; },
  };
  return { redis };
});
vi.mock('bullmq', () => ({
  Queue: class { async add() { return {}; } async getWaitingCount() { return 0; } async getActiveCount() { return 0; } async close() {} },
  Worker: class { on() { return this; } async close() {} },
}));
vi.mock('../../services/pipeline/queue', async (orig) => ({ ...(await orig<typeof import('../../services/pipeline/queue')>()), getRedisConnection: () => h.redis }));
vi.mock('../../services/ml-client', () => ({ mlClient: { localizeArtwork: vi.fn(), classifyArtwork: vi.fn() } }));
vi.mock('../../core/db', () => ({
  default: { referenceLogo: { findMany: vi.fn(async () => [{ t3777Code: 'EU_ORGANIC_FARMING', fieldType: 'PackagingMarkedLabelAccreditationCode' }]) } },
}));

import { logoScanRoutes } from '../../api/v1/logo-scans';
import { runLogoScanJob } from '../../services/pipeline/logo-scan-flow';
import { validateLogoResults } from '../../services/pipeline/gs1-block';
import { mlClient } from '../../services/ml-client';

const URL = '/api/v1/pipeline/logo-scans';
const KEY = { 'x-api-key': 'test-key-1' };
const box = (x: number) => ({ x, y: 0, width: 16, height: 16 });
const res = (code: string, x: number, over: Record<string, unknown> = {}) => ({
  bbox: box(x), t3777_code: code, confidence: 0.97, method: 'embedding', evidence: {}, reference_version: 'r1', ...over,
});

async function app() {
  const server = Fastify();
  await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
  await server.register(logoScanRoutes, { prefix: '/api/v1' });
  return server;
}
async function post(server: Awaited<ReturnType<typeof app>>, extra: Array<{ name: string; value: string }> = []) {
  const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } }).png().toBuffer();
  const b = '----t1';
  const chunks: Buffer[] = [];
  for (const p of extra) chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
  chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), img, Buffer.from(`\r\n--${b}--\r\n`));
  const r = await server.inject({ method: 'POST', url: URL, headers: { ...KEY, 'content-type': `multipart/form-data; boundary=${b}` }, payload: Buffer.concat(chunks) });
  return r.json().scanId as string;
}
const getResult = async (server: Awaited<ReturnType<typeof app>>, id: string) =>
  (await server.inject({ method: 'GET', url: `${URL}/${id}`, headers: KEY })).json();
const mockMl = (results: unknown[], crops = results.map((r: any) => r.bbox)) => {
  vi.mocked(mlClient.localizeArtwork).mockReset().mockResolvedValue({ detections: crops.map((bbox) => ({ bbox })), truncated: false } as any);
  vi.mocked(mlClient.classifyArtwork).mockReset().mockResolvedValue({ results } as any);
};

beforeEach(() => { process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1'; h.redis.store.clear(); });

describe('worker bouwt logoResults v1', () => {
  it('done-scan: schemaVersion 1, GS1-item, ruwe detecties onveranderd, valideert', async () => {
    const server = await app();
    mockMl([res('EU_ORGANIC_FARMING', 0), res('SOORT_BUITEN_TABEL', 20)]);
    const id = await post(server, [{ name: 'productId', value: 'P1' }]);
    await runLogoScanJob({ scanId: id });
    const out = await getResult(server, id);
    const lr = out.logoResults;
    expect(out.status).toBe('done');
    expect(lr).toMatchObject({ schemaVersion: '1', scanId: id, productId: 'P1', status: 'ok' });
    expect(lr.items).toHaveLength(1);
    expect(lr.items[0].gs1[0].veld).toBe('packagingMarkedLabelAccreditationCode');
    expect(lr.detections).toHaveLength(2);
    expect(lr.detections[0]).toMatchObject({ t3777_code: 'EU_ORGANIC_FARMING', confidence: 0.97, method: 'embedding', reference_version: 'r1' });
    expect(validateLogoResults(lr)).toEqual([]);
    await server.close();
  });
  it('signalWord van de POST komt in logoResults.signaalwoord; vreemde waarde wordt weggelaten', async () => {
    const server = await app();
    mockMl([res('GHS02', 0, { method: 'ghs-specialist' })]);
    const a = await post(server, [{ name: 'signalWord', value: 'DANGER' }]);
    await runLogoScanJob({ scanId: a });
    expect((await getResult(server, a)).logoResults.signaalwoord).toBe('DANGER');
    mockMl([res('GHS02', 0, { method: 'ghs-specialist' })]);
    const b = await post(server, [{ name: 'signalWord', value: 'whatever' }]);
    await runLogoScanJob({ scanId: b });
    const lr = (await getResult(server, b)).logoResults;
    expect('signaalwoord' in lr).toBe(false);
    expect(lr.items[0].bewijs.markeringen).toContain('signaalwoord ontbreekt');
    await server.close();
  });
  it('status partial wanneer een deel van de classificatie ontbreekt', async () => {
    const server = await app();
    mockMl([res('EU_ORGANIC_FARMING', 0)], [box(0), box(20)]);
    const id = await post(server);
    await runLogoScanJob({ scanId: id });
    const lr = (await getResult(server, id)).logoResults;
    expect(lr.status).toBe('partial');
    expect(lr.reason).toBe('classification_incomplete');
    expect(lr.items).toHaveLength(1);
    expect(validateLogoResults(lr)).toEqual([]);
    await server.close();
  });
  it('failed-scan draagt logoResults met status failed en reden', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockReset().mockRejectedValue(new Error('ml down'));
    const id = await post(server);
    await runLogoScanJob({ scanId: id });
    const out = await getResult(server, id);
    expect(out.status).toBe('failed');
    expect(out.logoResults).toMatchObject({ schemaVersion: '1', status: 'failed', reason: 'recognition_unavailable', items: [], detections: [] });
    expect(validateLogoResults(out.logoResults)).toEqual([]);
    await server.close();
  });
  it('dezelfde invoer geeft byte-gelijke logoResults', async () => {
    const server = await app();
    const run = async () => { mockMl([res('EU_ORGANIC_FARMING', 0), res('NUTRISCORE_C', 20)]); const id = await post(server); await runLogoScanJob({ scanId: id }); return (await getResult(server, id)).logoResults; };
    const [a, b] = [await run(), await run()];
    const strip = (x: any) => JSON.stringify({ ...x, scanId: 'x' }).replace(/"scanId":"[^"]*"/g, '');
    expect(strip(a)).toBe(strip(b));
    await server.close();
  });
});
