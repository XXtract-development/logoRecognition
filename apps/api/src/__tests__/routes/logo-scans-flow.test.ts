// Story 1.2 — POST/GET /api/v1/pipeline/logo-scans: request, queue, poll (FR-1, FR-3, AD-3, AD-4, NFR-1)
vi.unmock('../../middleware/auth');
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, Buffer | string>();
  const redis = {
    store,
    async get(k: string) { const v = store.get(k); return v === undefined ? null : v.toString(); },
    async getBuffer(k: string) { const v = store.get(k); return v === undefined ? null : Buffer.from(v); },
    async setex(k: string, _ttl: number, v: Buffer | string) { store.set(k, v); return 'OK'; },
    async set(k: string, v: Buffer | string) { store.set(k, v); return 'OK'; },
    async eval(_s: string, _n: number, k: string, v: string) {
      const cur = store.get(k); if (cur && ['done', 'failed'].includes(JSON.parse(cur.toString()).status)) return 0;
      store.set(k, v); return 1;
    },
    async del(k: string) { store.delete(k); return 1; },
  };
  const queue = { jobs: [] as Array<{ name: string; data: any; opts: any }>, waiting: 0, active: 0, failAdd: false };
  return { redis, queue };
});

vi.mock('bullmq', () => ({
  Queue: class {
    async add(name: string, data: unknown, opts: unknown) {
      if (h.queue.failAdd) throw new Error('redis down');
      h.queue.jobs.push({ name, data, opts }); h.queue.waiting += 1; return {};
    }
    async getWaitingCount() { return h.queue.waiting; }
    async getActiveCount() { return h.queue.active; }
    async close() {}
  },
  Worker: class { on() { return this; } async close() {} },
}));
vi.mock('../../services/pipeline/queue', async (orig) => ({
  ...(await orig<typeof import('../../services/pipeline/queue')>()),
  getRedisConnection: () => h.redis,
}));
vi.mock('../../services/ml-client', () => ({ mlClient: { localizeArtwork: vi.fn(), classifyArtwork: vi.fn() } }));
vi.mock('../../core/db', () => ({
  default: { referenceLogo: { findMany: vi.fn(async () => [{ t3777Code: 'RECYCLABLE', fieldType: 'PackagingMarkedLabelAccreditationCode' }]) } },
}));

import { logoScanRoutes } from '../../api/v1/logo-scans';
import {
  LOGO_SCAN_MAX_MS, LOGO_SCAN_MAX_IMAGE_BYTES, LOGO_SCAN_MAX_PIXELS, runLogoScanJob,
} from '../../services/pipeline/logo-scan-flow';
import { mlClient } from '../../services/ml-client';
import prisma from '../../core/db';

const URL = '/api/v1/pipeline/logo-scans';
const KEY = { 'x-api-key': 'test-key-1' };
const originalEnv = { ...process.env };

async function app() {
  const server = Fastify();
  await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
  await server.register(logoScanRoutes, { prefix: '/api/v1' });
  return server;
}
const png = (w = 64, h2 = 64) => sharp({ create: { width: w, height: h2, channels: 3, background: '#fff' } }).png().toBuffer();
const jpeg = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } }).jpeg().toBuffer();

function form(parts: Array<{ name: string; value: string | Buffer; filename?: string; type?: string }>) {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ''}\r\n${p.type ? `Content-Type: ${p.type}\r\n` : ''}\r\n`));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { ...KEY, 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
const post = (server: Awaited<ReturnType<typeof app>>, image: Buffer, extra: Array<{ name: string; value: string }> = [], type = 'image/png') => {
  const f = form([...extra, { name: 'file', value: image, filename: 'a.png', type }]);
  return server.inject({ method: 'POST', url: URL, headers: f.headers, payload: f.payload });
};
const get = (server: Awaited<ReturnType<typeof app>>, id: string, headers: Record<string, string> = KEY) =>
  server.inject({ method: 'GET', url: `${URL}/${id}`, headers });

const classified = (box = { x: 0, y: 0, width: 32, height: 32 }) => ({
  results: [{ bbox: box, t3777_code: 'RECYCLABLE', confidence: 0.97, method: 'embedding', evidence: {}, reference_version: 'v1' }],
});

beforeEach(() => {
  process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1';
  h.redis.store.clear(); h.queue.jobs.length = 0; h.queue.waiting = 0; h.queue.active = 0; h.queue.failAdd = false;
  vi.mocked(mlClient.localizeArtwork).mockReset().mockResolvedValue({ detections: [{ bbox: { x: 0, y: 0, width: 32, height: 32 } }], truncated: false } as any);
  vi.mocked(mlClient.classifyArtwork).mockReset().mockResolvedValue(classified() as any);
});
afterEach(() => { vi.useRealTimers(); process.env = { ...originalEnv }; });

describe('Story 1.7 — zoekruimte in de worker', () => {
  const refs = [{ t3777Code: 'RECYCLABLE' }, { t3777Code: 'NUTRISCORE_A' }, { t3777Code: 'VEGAN' }];
  const run = async (gpc?: string) => {
    vi.mocked(prisma.referenceLogo.findMany).mockResolvedValueOnce(refs as any);
    const server = await app();
    const { scanId } = (await post(server, await png(), gpc === undefined ? [] : [{ name: 'gpcCategoryCode', value: gpc }])).json();
    await runLogoScanJob({ scanId });
    const done = (await get(server, scanId)).json();
    await server.close();
    return { done, codes: vi.mocked(mlClient.localizeArtwork).mock.calls[0][0].codes as string[] };
  };
  it('ml-service contract: remaining_budget_ms stays within 1..165000 although a scan may run 240 s', async () => {
    await run();
    const loc = vi.mocked(mlClient.localizeArtwork).mock.calls[0];
    const cls = vi.mocked(mlClient.classifyArtwork).mock.calls[0];
    for (const call of [loc, cls]) {
      const budget = (call[0] as any).remaining_budget_ms as number;
      expect(budget).toBeGreaterThanOrEqual(1);
      expect(budget).toBeLessThanOrEqual(165000);
      expect((call[1] as any).timeoutMs).toBeLessThanOrEqual(165000);
    }
  });
  it('niet-voedselcode: Nutri-Score valt af, dieet, keurmerk en gevaarsymbool blijven; zoekruimte vastgelegd', async () => {
    const { done, codes } = await run('47000000');
    expect(codes).toContain('RECYCLABLE');
    expect(codes).toContain('FLAME');
    expect(codes).not.toContain('NUTRISCORE_A');
    expect(codes).toContain('VEGAN');
    expect(done.logoResults.zoekruimte).toEqual({ gpcCategoryCode: '47000000', beperkt: true, aantalSoorten: codes.length });
  });
  it('een mislukte scan heeft geen zoekruimte', async () => {
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new Error('ml down'));
    const { done } = await run('47000000').catch(() => ({ done: null as any }));
    expect(done?.status).toBe('failed');
    expect(done?.logoResults?.zoekruimte).toBeUndefined();
  });
  it('voedselcode en geen code: volledige set', async () => {
    for (const gpc of ['50200000', undefined, 'onzin']) {
      vi.mocked(mlClient.localizeArtwork).mockClear();
      const { done, codes } = await run(gpc);
      expect(codes).toEqual(expect.arrayContaining(['RECYCLABLE', 'NUTRISCORE_A', 'VEGAN', 'FLAME']));
      expect(done.logoResults.zoekruimte).toMatchObject({ beperkt: false, aantalSoorten: codes.length });
    }
  });
});

describe('constants', () => {
  it('are named and match the agreed limits', () => {
    expect(LOGO_SCAN_MAX_MS).toBe(240000);
    expect(LOGO_SCAN_MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(LOGO_SCAN_MAX_PIXELS).toBeGreaterThan(0);
  });
});

describe('POST logo-scans', () => {
  it('202 + scanId for a png; job queued on its own queue with unique jobId; hash of original bytes', async () => {
    const server = await app();
    const img = await png();
    const res = await post(server, img, [{ name: 'productId', value: 'P1' }, { name: 'pipelineId', value: 'pl' }, { name: 'gpcCategoryCode', value: '10000' }]);
    expect(res.statusCode).toBe(202);
    const { scanId } = res.json();
    expect(scanId).toMatch(/[0-9a-f-]{36}/);
    expect(h.queue.jobs).toHaveLength(1);
    expect(h.queue.jobs[0].opts.jobId).toBe(scanId);
    const state = JSON.parse(h.redis.store.get(`logo-scan:state:${scanId}`) as string);
    expect(state.status).toBe('pending');
    expect(state.imageHash).toBe(createHash('sha256').update(img).digest('hex'));
    expect(state.productId).toBe('P1');
    await server.close();
  });
  it('accepts a jpeg', async () => {
    const server = await app();
    expect((await post(server, await jpeg(), [], 'image/jpeg')).statusCode).toBe(202);
    await server.close();
  });
  it('401 without key; no job queued', async () => {
    const server = await app();
    const f = form([{ name: 'file', value: await png(), filename: 'a.png', type: 'image/png' }]);
    const { 'x-api-key': _k, ...headers } = f.headers;
    const res = await server.inject({ method: 'POST', url: URL, headers, payload: f.payload });
    expect(res.statusCode).toBe(401);
    expect(h.queue.jobs).toHaveLength(0);
    await server.close();
  });
  it('400 without a file, with a non-image, and when mimetype lies (magic bytes decide)', async () => {
    const server = await app();
    const none = form([{ name: 'productId', value: 'x' }]);
    expect((await server.inject({ method: 'POST', url: URL, headers: none.headers, payload: none.payload })).statusCode).toBe(400);
    for (const bytes of [Buffer.from('hello world, not an image'), Buffer.from('GIF89a' + 'x'.repeat(50)), await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).webp().toBuffer()]) {
      const res = await post(server, bytes, [], 'image/png');
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({ code: 'INVALID_IMAGE' });
      expect(res.json().error.requestId).toBeTruthy();
    }
    expect(h.queue.jobs).toHaveLength(0);
    await server.close();
  });
  it('400 for two files', async () => {
    const server = await app();
    const img = await png();
    const f = form([{ name: 'file', value: img, filename: 'a.png', type: 'image/png' }, { name: 'file', value: img, filename: 'b.png', type: 'image/png' }]);
    expect((await server.inject({ method: 'POST', url: URL, headers: f.headers, payload: f.payload })).statusCode).toBe(400);
    await server.close();
  });
  it('413 for a file above the byte limit', async () => {
    const server = await app();
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(LOGO_SCAN_MAX_IMAGE_BYTES + 10)]);
    const res = await post(server, big);
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('IMAGE_TOO_LARGE');
    await server.close();
  });
  it('400 for a decodable png with too many pixels', async () => {
    const server = await app();
    const res = await post(server, await png(LOGO_SCAN_MAX_PIXELS > 1e9 ? 100 : Math.ceil(Math.sqrt(LOGO_SCAN_MAX_PIXELS)) + 10, Math.ceil(Math.sqrt(LOGO_SCAN_MAX_PIXELS)) + 10));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_IMAGE');
    await server.close();
  }, 60000);
  it('503 with Retry-After when the queue is full; nothing queued', async () => {
    const server = await app();
    h.queue.waiting = 10_000;
    const res = await post(server, await png());
    expect(res.statusCode).toBe(503);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.json().error.code).toBe('BUSY');
    expect(h.queue.jobs).toHaveLength(0);
    await server.close();
  });
  it('503 (not a hang, not a silent 202) when enqueueing fails', async () => {
    const server = await app();
    h.queue.failAdd = true;
    const res = await post(server, await png());
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBeTruthy();
    await server.close();
  });
  it('10 concurrent requests: every one is a 202 with a state record or a 503 with Retry-After; none lost', async () => {
    process.env.LOGO_SCAN_MAX_QUEUED = '6';
    const server = await app();
    const img = await png();
    const results = await Promise.all(Array.from({ length: 10 }, () => post(server, img)));
    const ok = results.filter(r => r.statusCode === 202);
    const busy = results.filter(r => r.statusCode === 503);
    expect(ok.length + busy.length).toBe(10);
    expect(ok.length).toBeLessThanOrEqual(6);
    expect(busy.length).toBeGreaterThan(0);
    busy.forEach(r => expect(r.headers['retry-after']).toBeTruthy());
    expect(h.queue.jobs).toHaveLength(ok.length);
    for (const r of ok) expect(h.redis.store.has(`logo-scan:state:${r.json().scanId}`)).toBe(true);
    expect(new Set(ok.map(r => r.json().scanId)).size).toBe(ok.length);
    await server.close();
  });
});

describe('GET logo-scans/:scanId', () => {
  it('401 without key; 404 standard error for unknown id', async () => {
    const server = await app();
    expect((await get(server, 'abc', {})).statusCode).toBe(401);
    const res = await get(server, '00000000-0000-4000-8000-000000000000');
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.json().error.requestId).toBeTruthy();
    await server.close();
  });
  it('walks pending -> running -> done with raw detections and a GS1 block', async () => {
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    expect((await get(server, scanId)).json()).toMatchObject({ scanId, status: 'pending' });

    let seenRunning = '';
    vi.mocked(mlClient.localizeArtwork).mockImplementationOnce(async () => {
      seenRunning = (await get(server, scanId)).json().status;
      return { detections: [{ bbox: { x: 0, y: 0, width: 32, height: 32 } }], truncated: false } as any;
    });
    await runLogoScanJob({ scanId });
    expect(seenRunning).toBe('running');

    const done = (await get(server, scanId)).json();
    expect(done.status).toBe('done');
    expect(done.logoResults.schemaVersion).toBe('1'); // Story 1.5: RECYCLABLE is not in the GS1 table (or is off)
    expect(done.logoResults.items).toEqual([]);
    expect(done.logoResults.detections).toHaveLength(1);
    expect(done.logoResults.detections[0]).toMatchObject({ t3777_code: 'RECYCLABLE', confidence: 0.97 });
    expect(typeof done.processingTimeMs).toBe('number');
    expect(h.redis.store.has(`logo-scan:image:${scanId}`)).toBe(false);
    await server.close();
  });
  it('failed with reason when the ML service errors; never stays running', async () => {
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new Error('ml down'));
    await runLogoScanJob({ scanId });
    const res = (await get(server, scanId)).json();
    expect(res.status).toBe('failed');
    expect(res.reason).toBe('recognition_unavailable');
    expect(res.logoResults).toMatchObject({ schemaVersion: '1', status: 'failed', reason: 'recognition_unavailable', items: [] }); // Story 1.5
    await server.close();
  });
  it('failed/timeout when a scan was waiting longer than LOGO_SCAN_MAX_MS before it started', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    vi.setSystemTime(Date.now() + 240000 + 1000);
    await runLogoScanJob({ scanId });
    expect(mlClient.localizeArtwork).not.toHaveBeenCalled();
    expect((await get(server, scanId)).json()).toMatchObject({ status: 'failed', reason: 'timeout' });
    await server.close();
  });
  it('failed/timeout when recognition hangs past the deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    vi.mocked(mlClient.localizeArtwork).mockImplementationOnce(() => new Promise(() => {}));
    const run = runLogoScanJob({ scanId });
    await vi.advanceTimersByTimeAsync(240000 + 1000);
    await run;
    expect((await get(server, scanId)).json()).toMatchObject({ status: 'failed', reason: 'timeout' });
    await server.close();
  });
  it('a pending/running scan older than the limit (dead worker) is reported failed/timeout on read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    vi.setSystemTime(Date.now() + 240000 + 1000);
    expect((await get(server, scanId)).json()).toMatchObject({ status: 'failed', reason: 'timeout' });
    await server.close();
  });
});

describe('review hardening', () => {
  it('400 for a valid png header with a corrupt body', async () => {
    const server = await app();
    const good = await png(256, 256);
    const corrupt = Buffer.concat([good.subarray(0, 60), Buffer.alloc(200, 7)]);
    const res = await post(server, corrupt);
    expect(res.statusCode).toBe(400);
    expect(h.queue.jobs).toHaveLength(0);
    await server.close();
  });
  it('a late timeout-on-read cannot overwrite done, and a late worker cannot resurrect failed', async () => {
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    await runLogoScanJob({ scanId });
    expect((await get(server, scanId)).json().status).toBe('done');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + LOGO_SCAN_MAX_MS + 1000);
    expect((await get(server, scanId)).json().status).toBe('done');
    const second = (await (async () => { vi.useRealTimers(); return post(server, await png()); })()).json().scanId;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + LOGO_SCAN_MAX_MS + 1000);
    expect((await get(server, second)).json().reason).toBe('timeout');
    await runLogoScanJob({ scanId: second });
    expect(mlClient.localizeArtwork).toHaveBeenCalledTimes(1);
    expect((await get(server, second)).json().status).toBe('failed');
    await server.close();
  });
  it('POST answers 503 (not a hang) when Redis stalls', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const server = await app();
    const img = await png();
    const orig = h.redis.setex; h.redis.setex = () => new Promise(() => {});
    const pending = post(server, img);
    let settled = false; pending.then(() => { settled = true; }, () => { settled = true; });
    // Pump on a real-time budget (Date is not faked), not an iteration count: the image is decoded for real before the
    // admission starts, and on a slower runner a fixed number of iterations ended before the 3 s deadline was even armed,
    // which hung this test and, through the stuck admission chain, the two tests after it.
    const t0 = Date.now();
    while (!settled && Date.now() - t0 < 20_000) { await vi.advanceTimersByTimeAsync(100); await new Promise(r => setImmediate(r)); }
    const res = await pending;
    h.redis.setex = orig;
    expect(res.statusCode).toBe(503);
    expect(res.headers['retry-after']).toBeTruthy();
    await server.close();
  }, 30_000);
  it("another consumer's scan and a malformed id look unknown (404)", async () => {
    process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1,beheer:test-key-2';
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    expect((await get(server, scanId, { 'x-api-key': 'test-key-2' })).statusCode).toBe(404);
    expect((await get(server, 'not-a-uuid')).statusCode).toBe(404);
    expect((await get(server, scanId)).statusCode).toBe(200);
    await server.close();
  });
  it('a result with zero localized regions is done with empty detections', async () => {
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce({ detections: [], truncated: false } as any);
    await runLogoScanJob({ scanId });
    expect((await get(server, scanId)).json().logoResults.detections).toEqual([]);
    expect(mlClient.classifyArtwork).not.toHaveBeenCalled();
    await server.close();
  });
});
