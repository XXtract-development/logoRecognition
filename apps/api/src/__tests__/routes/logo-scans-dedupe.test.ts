// Story 1.3 — repeatable and traceable scans (FR-2, AD-4, AD-12, NFR-3). ATDD: written before the implementation.
// Prisma and Redis are mocked; no database, no network.
vi.unmock('../../middleware/auth');
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, Buffer | string>();
  const terminal = ['done', 'failed', 'superseded'];
  const redis = {
    store,
    async get(k: string) { const v = store.get(k); return v === undefined ? null : v.toString(); },
    async getBuffer(k: string) { const v = store.get(k); return v === undefined ? null : Buffer.from(v); },
    async setex(k: string, _ttl: number, v: Buffer | string) { store.set(k, v); return 'OK'; },
    async eval(_s: string, _n: number, k: string, v: string) {
      const cur = store.get(k); if (cur && terminal.includes(JSON.parse(cur.toString()).status)) return 0;
      store.set(k, v); return 1;
    },
    async del(k: string) { store.delete(k); return 1; },
  };
  const queue = { jobs: [] as Array<{ name: string; data: any; opts: any }>, waiting: 0, active: 0, failAdd: false };
  const pool = { count: 5, max: new Date('2026-09-01T00:00:00Z') as Date | null, fail: false };
  const fake = { db: null as any };
  const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { redis, queue, pool, fake, log };
});

vi.mock('bullmq', () => ({
  Queue: class {
    async add(name: string, data: unknown, opts: unknown) { if (h.queue.failAdd) throw new Error('redis down'); h.queue.jobs.push({ name, data, opts }); h.queue.waiting += 1; return {}; }
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
vi.mock('../../core/logger', () => ({ logger: h.log, createLogger: () => h.log, default: h.log }));
vi.mock('../../core/db', async () => {
  const { makeFakeLogoDb } = await import('../helpers/fake-logo-db');
  h.fake.db = makeFakeLogoDb();
  return {
    default: {
      referenceLogo: {
        findMany: vi.fn(async () => [{ t3777Code: 'RECYCLABLE', fieldType: 'PackagingMarkedLabelAccreditationCode' }]),
        aggregate: vi.fn(async () => { if (h.pool.fail) throw new Error('db down'); return { _count: h.pool.count, _max: { createdAt: h.pool.max } }; }),
      },
      logoScan: h.fake.db.logoScan,
      logoCurrentImage: h.fake.db.logoCurrentImage,
    },
  };
});

import { logoScanRoutes } from '../../api/v1/logo-scans';
import { runLogoScanJob, LOGO_SCAN_MAX_MS } from '../../services/pipeline/logo-scan-flow';
import { mlClient } from '../../services/ml-client';

const URL = '/api/v1/pipeline/logo-scans';
const KEY = { 'x-api-key': 'test-key-1' };
const KEY2 = { 'x-api-key': 'test-key-2' };
const originalEnv = { ...process.env };
const db = () => h.fake.db;

async function app() {
  const server = Fastify();
  await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
  await server.register(logoScanRoutes, { prefix: '/api/v1' });
  return server;
}
const png = (color = '#fff') => sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer();
type Server = Awaited<ReturnType<typeof app>>;
function post(server: Server, image: Buffer, extra: Array<{ name: string; value: string }> = [], headers = KEY) {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const p of [...extra, { name: 'file', value: image as any, filename: 'a.png', type: 'image/png' } as any]) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ''}\r\n${p.type ? `Content-Type: ${p.type}\r\n` : ''}\r\n`));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return server.inject({ method: 'POST', url: URL, headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(chunks) });
}
const get = (server: Server, id: string, headers: Record<string, string> = KEY) => server.inject({ method: 'GET', url: `${URL}/${id}`, headers });
const P = (v = 'P1') => [{ name: 'productId', value: v }];
const field = (name: string, value: string) => ({ name, value });
const classified = () => ({ results: [{ bbox: { x: 0, y: 0, width: 32, height: 32 }, t3777_code: 'RECYCLABLE', confidence: 0.97, method: 'embedding', evidence: {}, reference_version: 'v1' }] });

/** POST + run the worker so the scan ends `done` (or failed when ML is broken). */
async function scan(server: Server, image: Buffer, extra = P(), headers = KEY) {
  const res = await post(server, image, extra, headers);
  const { scanId } = res.json();
  await runLogoScanJob({ scanId });
  return scanId as string;
}

beforeEach(() => {
  process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1,other:test-key-2';
  process.env.LOGO_MODEL_VERSION = 'model-1';
  h.redis.store.clear(); h.queue.jobs.length = 0; h.queue.waiting = 0; h.queue.active = 0; h.queue.failAdd = false;
  h.pool.count = 5; h.pool.max = new Date('2026-09-01T00:00:00Z'); h.pool.fail = false;
  db().scans.length = 0; db().current.length = 0; db().state.missingTable = false; db().state.calls.length = 0;
  Object.values(h.log).forEach(f => f.mockClear());
  vi.mocked(mlClient.localizeArtwork).mockReset().mockResolvedValue({ detections: [{ bbox: { x: 0, y: 0, width: 32, height: 32 } }], truncated: false } as any);
  vi.mocked(mlClient.classifyArtwork).mockReset().mockResolvedValue(classified() as any);
});
afterEach(() => { vi.useRealTimers(); process.env = { ...originalEnv }; });

describe('AC1 — deduplication of a done scan', () => {
  it('same product + image + versions after a done scan: same scanId, deduplicated true, no new job, fast', async () => {
    const server = await app(); const img = await png();
    const first = await scan(server, img);
    const jobs = h.queue.jobs.length;
    const t0 = Date.now();
    const res = await post(server, img, P());
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ scanId: first, deduplicated: true });
    expect(h.queue.jobs).toHaveLength(jobs);
    expect(db().scans).toHaveLength(1);
    expect((await get(server, first)).json().status).toBe('done');
    await server.close();
  });
  it('a first request carries no deduplicated flag (existing response unchanged)', async () => {
    const server = await app();
    expect((await post(server, await png())).json()).toEqual({ scanId: expect.any(String) });
    await server.close();
  });
  it('a pending scan is not reused (only done ones are)', async () => {
    const server = await app(); const img = await png();
    const a = (await post(server, img, P())).json().scanId;
    const b = (await post(server, img, P())).json();
    expect(b.scanId).not.toBe(a); expect(b.deduplicated).toBeUndefined();
    await server.close();
  });
  it('a new image hash starts a new scan', async () => {
    const server = await app();
    const a = await scan(server, await png('#fff'));
    const res = (await post(server, await png('#000'))).json();
    expect(res.scanId).not.toBe(a); expect(res.deduplicated).toBeUndefined();
    await server.close();
  });
  it('another product, another consumer, another model version, another reference pool: no reuse', async () => {
    const server = await app(); const img = await png();
    const a = await scan(server, img);
    expect((await post(server, img, P('P2'))).json().scanId).not.toBe(a);
    expect((await post(server, img, P(), KEY2)).json().scanId).not.toBe(a);
    process.env.LOGO_MODEL_VERSION = 'model-2';
    expect((await post(server, img)).json().deduplicated).toBeUndefined();
    process.env.LOGO_MODEL_VERSION = 'model-1';
    h.pool.count = 6;
    expect((await post(server, img)).json().deduplicated).toBeUndefined();
    await server.close();
  });
  it('no deduplication when the model version is unknown (cannot prove it is equal)', async () => {
    delete process.env.LOGO_MODEL_VERSION;
    const server = await app(); const img = await png();
    const a = await scan(server, img);
    expect((await post(server, img)).json().scanId).not.toBe(a);
    await server.close();
  });
  it('a done scan older than 24 hours is not reused', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = await app(); const img = await png();
    const a = await scan(server, img);
    vi.setSystemTime(Date.now() + 24 * 3600 * 1000 + 60000);
    const res = (await post(server, img)).json();
    expect(res.scanId).not.toBe(a); expect(res.deduplicated).toBeUndefined();
    await server.close();
  });
  it('without productId: no deduplication, no supersede, scan works as before', async () => {
    const server = await app(); const img = await png();
    const a = await scan(server, img, []);
    const b = (await post(server, img, [])).json();
    expect(b.scanId).not.toBe(a); expect(b.deduplicated).toBeUndefined();
    expect(db().current).toHaveLength(0);
    expect((await get(server, a)).json().status).toBe('done');
    await server.close();
  });
});

describe('AC2 — failed scans are never reused; rescan raises attempt', () => {
  it('a failed scan is not reused: the next identical request is a new attempt that really runs', async () => {
    const server = await app(); const img = await png();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new Error('ml down'));
    const a = await scan(server, img);
    expect((await get(server, a)).json().status).toBe('failed');
    const res = (await post(server, img, P())).json();
    expect(res.scanId).not.toBe(a); expect(res.deduplicated).toBeUndefined();
    expect(h.queue.jobs.at(-1)!.opts.jobId).toBe(res.scanId);
    expect(db().scans.map(r => r.attempt).sort()).toEqual([1, 2]);
    await server.close();
  });
  it('rescan=true after a done scan: new scanId, attempt + 1, the recognition runs again', async () => {
    const server = await app(); const img = await png();
    const a = await scan(server, img);
    const calls = vi.mocked(mlClient.localizeArtwork).mock.calls.length;
    const res = await post(server, img, [...P(), field('rescan', 'true')]);
    const { scanId, deduplicated } = res.json();
    expect(res.statusCode).toBe(202);
    expect(scanId).not.toBe(a); expect(deduplicated).toBeUndefined();
    await runLogoScanJob({ scanId });
    expect(vi.mocked(mlClient.localizeArtwork).mock.calls.length).toBe(calls + 1);
    expect(db().scans.find(r => r.scanId === scanId)!.attempt).toBe(2);
    expect((await get(server, scanId)).json().status).toBe('done');
    await server.close();
  });
  it('rescan needs a valid service key; any other value of rescan is no rescan', async () => {
    const server = await app(); const img = await png();
    const a = await scan(server, img);
    const unauth = await post(server, img, [...P(), field('rescan', 'true')], { 'x-api-key': 'wrong' });
    expect(unauth.statusCode).toBe(401);
    expect(h.queue.jobs).toHaveLength(1);
    const maybe = (await post(server, img, [...P(), field('rescan', 'yes')])).json();
    expect(maybe).toEqual({ scanId: a, deduplicated: true });
    await server.close();
  });
  it('rows are unique on (product, hash, model, reference, attempt); every attempt has its own jobId = scanId', async () => {
    const server = await app(); const img = await png();
    await scan(server, img);
    await scan(server, img, [...P(), field('rescan', 'true')]);
    await scan(server, img, [...P(), field('rescan', 'true')]);
    const keys = db().scans.map(r => [r.productId, r.imageHash, r.modelVersion, r.referenceVersion, r.attempt].join('|'));
    expect(new Set(keys).size).toBe(3);
    expect(db().scans.map(r => r.attempt).sort()).toEqual([1, 2, 3]);
    expect(h.queue.jobs.map(j => j.opts.jobId)).toEqual(db().scans.map(r => r.scanId));
    await server.close();
  });
});

describe('AC3 — current_image_hash only moves forward; older hash is superseded', () => {
  it('the first scan of a product sets its current image hash; no product, no row', async () => {
    const server = await app();
    await post(server, await png('#fff'), P('P1'));
    expect(db().current).toHaveLength(1);
    expect(db().current[0]).toMatchObject({ productId: 'P1', imageHash: db().scans[0].imageHash });
    await server.close();
  });
  it('a newer hash moves the pointer; the in-flight scan of the old hash becomes superseded and does not run', async () => {
    const server = await app();
    const a = (await post(server, await png('#fff'), P())).json().scanId;
    const b = (await post(server, await png('#000'), P())).json().scanId;
    expect(db().current[0].imageHash).toBe(db().scans.find(r => r.scanId === b)!.imageHash);
    await runLogoScanJob({ scanId: a });
    expect(vi.mocked(mlClient.localizeArtwork)).not.toHaveBeenCalled();
    const stateA = (await get(server, a)).json();
    expect(stateA.status).toBe('superseded');
    expect(db().scans.find(r => r.scanId === a)!.status).toBe('superseded');
    await runLogoScanJob({ scanId: b });
    expect((await get(server, b)).json().status).toBe('done');
    await server.close();
  });
  it('a request whose own requestedAt is older than the current one is superseded at once: no job', async () => {
    const server = await app();
    const now = Date.now();
    await post(server, await png('#000'), [...P(), field('requestedAt', new Date(now).toISOString())]);
    const jobs = h.queue.jobs.length;
    const res = await post(server, await png('#fff'), [...P(), field('requestedAt', new Date(now - 60000).toISOString())]);
    expect(res.statusCode).toBe(202);
    const { scanId } = res.json();
    expect(h.queue.jobs).toHaveLength(jobs);
    expect((await get(server, scanId)).json().status).toBe('superseded');
    expect(db().current[0].imageHash).toBe(db().scans[0].imageHash); // pointer stayed
    await server.close();
  });
  it('an unusable or far-future requestedAt is ignored (server time is used)', async () => {
    const server = await app();
    await post(server, await png('#000'), P());
    for (const bad of ['nonsense', new Date(Date.now() + 3600 * 1000).toISOString()]) {
      const res = await post(server, await png('#fff'), [...P(), field('requestedAt', bad)]);
      expect(res.statusCode).toBe(202);
      // Server time wins: this request is the newest one, so it is NOT superseded.
      expect((await get(server, res.json().scanId)).json().status).toBe('pending');
    }
    await server.close();
  });
  it('re-sending the current hash (rescan) does not move or supersede anything', async () => {
    const server = await app(); const img = await png();
    const a = await scan(server, img);
    const hash = db().current[0].imageHash;
    await post(server, img, [...P(), field('rescan', 'true')]);
    expect(db().current[0].imageHash).toBe(hash);
    expect((await get(server, a)).json().status).toBe('done');
    await server.close();
  });
});

describe('review findings — reuse, ties, ordering, failures', () => {
  it('a request with another signal word or category does not reuse the stored result', async () => {
    const server = await app(); const img = await png();
    const a = await scan(server, img, [...P(), field('signalWord', 'DANGER')]);
    expect((await post(server, img, [...P(), field('signalWord', 'WARNING')])).json().deduplicated).toBeUndefined();
    expect((await post(server, img, P())).json().deduplicated).toBeUndefined();
    expect((await post(server, img, [...P(), field('signalWord', 'DANGER'), field('gpcCategoryCode', '47000000')])).json().deduplicated).toBeUndefined();
    expect((await post(server, img, [...P(), field('signalWord', 'DANGER')])).json()).toEqual({ scanId: a, deduplicated: true });
    await server.close();
  });
  it('a request with the same requestedAt as the current one but another hash is superseded on arrival (existing stays)', async () => {
    const server = await app(); const at = new Date(Date.now() - 1000).toISOString();
    await post(server, await png('#000'), [...P(), field('requestedAt', at)]);
    const res = await post(server, await png('#fff'), [...P(), field('requestedAt', at)]);
    expect((await get(server, res.json().scanId)).json().status).toBe('superseded');
    await server.close();
  });
  it('two different images in the same millisecond keep their arrival order (server time strictly increases)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = await app();
    const a = (await post(server, await png('#000'), P())).json().scanId;
    const b = (await post(server, await png('#fff'), P())).json().scanId;
    expect(db().current[0].imageHash).toBe(db().scans.find(r => r.scanId === b)!.imageHash);
    expect(db().scans.find(r => r.scanId === a)!.status).toBe('superseded');
    await server.close();
  });
  it('GET reports superseded even while Redis still says pending (worker has not started)', async () => {
    const server = await app();
    const a = (await post(server, await png('#000'), P())).json().scanId;
    await post(server, await png('#fff'), P());
    expect((await get(server, a)).json().status).toBe('superseded');
    await server.close();
  });
  it('a scan superseded while it runs is stored and served as superseded, never as done', async () => {
    const server = await app();
    const a = (await post(server, await png('#000'), P())).json().scanId;
    vi.mocked(mlClient.localizeArtwork).mockImplementationOnce(async () => {
      await post(server, await png('#fff'), P()); // a newer image arrives mid-run
      return { detections: [{ bbox: { x: 0, y: 0, width: 32, height: 32 } }], truncated: false } as any;
    });
    await runLogoScanJob({ scanId: a });
    expect(db().scans.find(r => r.scanId === a)).toMatchObject({ status: 'superseded' });
    expect((await get(server, a)).json()).toMatchObject({ status: 'superseded' });
    await server.close();
  });
  it('a failed enqueue does not move the current image', async () => {
    const server = await app();
    h.queue.failAdd = true;
    expect((await post(server, await png(), P())).statusCode).toBe(503);
    expect(db().current).toHaveLength(0);
    await server.close();
  });
  it('a done result stored by the worker is not overwritten by a read-time timeout', async () => {
    const server = await app();
    const id = await scan(server, await png());
    const key = `logo-scan:state:${id}`;
    const st = JSON.parse(h.redis.store.get(key) as string);
    h.redis.store.set(key, JSON.stringify({ ...st, status: 'running', logoResults: undefined })); // Redis lags behind the table
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + LOGO_SCAN_MAX_MS + 5000);
    expect((await get(server, id)).json().status).toBe('done');
    await server.close();
  });
});

describe('AC4 — logo_scans keeps the outcome; GET reads Redis first, then the table', () => {
  it('a finished scan is stored with traceable fields and raw detections', async () => {
    const server = await app();
    const id = await scan(server, await png(), [...P(), field('pipelineId', 'pl-9')]);
    const row = db().scans.find(r => r.scanId === id)!;
    expect(row).toMatchObject({
      productId: 'P1', pipelineId: 'pl-9', consumer: 'n8n', status: 'done', attempt: 1, modelVersion: 'model-1',
    });
    expect(row.referenceVersion).toBeTruthy();
    expect(row.policyVersion).toBeTruthy();
    expect(row.logoResults.scanId).toBe(id);
    expect(row.logoResults.detections.length).toBeGreaterThan(0);
    await server.close();
  });
  it('a failed scan is stored too, with its reason', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new Error('ml down'));
    const id = await scan(server, await png());
    expect(db().scans.find(r => r.scanId === id)).toMatchObject({ status: 'failed', reason: 'recognition_unavailable' });
    await server.close();
  });
  it('GET falls back to the table when Redis has no state; other consumers still get 404', async () => {
    const server = await app();
    const id = await scan(server, await png());
    h.redis.store.clear();
    const res = await get(server, id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ scanId: id, status: 'done', logoResults: { scanId: id } });
    expect((await get(server, id, KEY2)).statusCode).toBe(404);
    expect((await get(server, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    await server.close();
  });
  it('a table row still pending past the maximum time reads as failed/timeout', async () => {
    const server = await app();
    const { scanId } = (await post(server, await png())).json();
    h.redis.store.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + LOGO_SCAN_MAX_MS + 5000);
    expect((await get(server, scanId)).json()).toMatchObject({ status: 'failed', reason: 'timeout' });
    await server.close();
  });
});

describe('tolerance — table missing (Prisma P2021) falls back to story 1.2 behaviour', () => {
  it('POST/GET keep working from Redis, no dedupe, no 500; exactly one warning', async () => {
    db().state.missingTable = true;
    const server = await app(); const img = await png();
    const a = await post(server, img, P());
    expect(a.statusCode).toBe(202);
    await runLogoScanJob({ scanId: a.json().scanId });
    expect((await get(server, a.json().scanId)).json().status).toBe('done');
    const b = await post(server, img, P());
    expect(b.statusCode).toBe(202);
    expect(b.json().scanId).not.toBe(a.json().scanId);
    expect(b.json().deduplicated).toBeUndefined();
    expect((await get(server, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    expect(h.log.warn.mock.calls.filter(c => /logo_scans|table/i.test(String(c[0])))).toHaveLength(1);
    expect(h.log.error).not.toHaveBeenCalledWith(expect.stringMatching(/logo_scans/i), expect.anything());
    await server.close();
  });
  it('any other database failure also falls back (no 500)', async () => {
    h.pool.fail = true;
    const server = await app();
    const res = await post(server, await png(), P());
    expect(res.statusCode).toBe(202);
    await server.close();
  });
});
