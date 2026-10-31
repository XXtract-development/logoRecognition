// spec-logo-scan-k4aa — ATDD (written before the implementation). CAP-1, CAP-4, CAP-5 (API side), CAP-6, CAP-8 (stap1).
// Prisma, Redis, BullMQ and the ML client are mocked; no database, no network.
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
  const queue = { jobs: [] as Array<{ name: string; data: any; opts: any }>, waiting: 0, active: 0 };
  const fake = { db: null as any };
  const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { redis, queue, fake, log };
});

vi.mock('bullmq', () => ({
  Queue: class {
    async add(name: string, data: unknown, opts: unknown) { h.queue.jobs.push({ name, data, opts }); h.queue.waiting += 1; return {}; }
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
vi.mock('../../services/ml-client', () => ({ mlClient: { localizeArtwork: vi.fn(), classifyArtwork: vi.fn(), scanK4aa: vi.fn() } }));
vi.mock('../../core/logger', () => ({ logger: h.log, createLogger: () => h.log, default: h.log }));
vi.mock('../../core/db', async () => {
  const { makeFakeLogoDb } = await import('../helpers/fake-logo-db');
  h.fake.db = makeFakeLogoDb();
  return {
    default: {
      referenceLogo: {
        findMany: vi.fn(async () => [
          { t3777Code: 'WEIDEMELK', fieldType: 'PackagingMarkedLabelAccreditationCode' },
          { t3777Code: 'NUTRISCORE_B', fieldType: 'NutritionalScore' },
          { t3777Code: 'EU_ORGANIC_FARMING', fieldType: 'PackagingMarkedLabelAccreditationCode' },
        ]),
        aggregate: vi.fn(async () => ({ _count: 540, _max: { createdAt: new Date('2026-08-26T06:14:43Z') } })),
      },
      logoScan: h.fake.db.logoScan,
      logoCurrentImage: h.fake.db.logoCurrentImage,
    },
  };
});

import { logoScanRoutes } from '../../api/v1/logo-scans';
import { runLogoScanJob } from '../../services/pipeline/logo-scan-flow';
import { buildLogoResults, validateLogoResults, LOGO_RESULTS_SCHEMA_SHA256 } from '../../services/pipeline/gs1-block';
import { getThresholdForMethod } from '../../services/artwork-crosscheck';
import { resolveSoort } from '../../services/gs1-mapping';
import { mlClient } from '../../services/ml-client';
const mlError = (status: number, detail: string) => Object.assign(new Error(`ml: ${detail}`), { statusCode: status, detail });

const URL = '/api/v1/pipeline/logo-scans';
const KEY = { 'x-api-key': 'test-key-1' };
const originalEnv = { ...process.env };
const SHA_A = 'a'.repeat(40);
const db = () => h.fake.db;

async function app() {
  const server = Fastify();
  await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
  await server.register(logoScanRoutes, { prefix: '/api/v1' });
  return server;
}
type Server = Awaited<ReturnType<typeof app>>;
const png = (color = '#fff') => sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer();
function post(server: Server, image: Buffer, extra: Array<{ name: string; value: string }> = []) {
  const boundary = '----t' + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const p of [...extra, { name: 'file', value: image as any, filename: 'a.png', type: 'image/png' } as any]) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ''}\r\n${p.type ? `Content-Type: ${p.type}\r\n` : ''}\r\n`));
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(p.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return server.inject({ method: 'POST', url: URL, headers: { ...KEY, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat(chunks) });
}
const get = (server: Server, id: string) => server.inject({ method: 'GET', url: `${URL}/${id}`, headers: KEY });
const P = (v = 'P1') => [{ name: 'productId', value: v }];
async function scan(server: Server, image: Buffer, extra = P()) {
  const { scanId } = (await post(server, image, extra)).json();
  await runLogoScanJob({ scanId });
  return scanId as string;
}
const det = (code: string, x = 0, extra: Record<string, unknown> = {}) => ({
  bbox: { x, y: 0, width: 16, height: 16 }, t3777_code: code, confidence: 0.91, method: 'k4aa',
  uncertain: !['WEIDEMELK'].includes(code), requires_review: !['WEIDEMELK'].includes(code), ...extra,
});
const k4aaResponse = (detections = [det('WEIDEMELK', 0), det('EU_ORGANIC_FARMING', 20)]) => ({
  detections,
  stats: { calls: 6, attempts: 7, tokens_in: 12000, tokens_out: 300, cost_usd: 0.0121, providers: ['Google'], k1_meldingen: 3, na_poort: detections.length, dropped: 0, referenties: 540, inline_embedded: 0 },
});
const row = (scanId: string) => db().scans.find((r: any) => r.scanId === scanId);

beforeEach(() => {
  process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1';
  process.env.LOGO_MODEL_VERSION = 'model-1';
  process.env.LOGO_IMAGE_TAG = SHA_A;
  delete process.env.SOURCE_COMMIT;
  delete process.env.LOGO_SCAN_ROUTE;
  h.redis.store.clear(); h.queue.jobs.length = 0; h.queue.waiting = 0; h.queue.active = 0;
  db().scans.length = 0; db().current.length = 0; db().state.missingTable = false; db().state.calls.length = 0;
  Object.values(h.log).forEach(f => f.mockClear());
  vi.mocked(mlClient.localizeArtwork).mockReset().mockResolvedValue({ detections: [{ bbox: { x: 0, y: 0, width: 32, height: 32 } }], truncated: false } as any);
  vi.mocked(mlClient.classifyArtwork).mockReset().mockResolvedValue({ results: [{ bbox: { x: 0, y: 0, width: 32, height: 32 }, t3777_code: 'WEIDEMELK', confidence: 0.97, method: 'embedding', evidence: {}, reference_version: 'v1' }] } as any);
  vi.mocked((mlClient as any).scanK4aa).mockReset().mockResolvedValue(k4aaResponse());
});
afterEach(() => { process.env = { ...originalEnv }; });

describe('CAP-1 route switch', () => {
  it('[P0] without LOGO_SCAN_ROUTE the legacy route runs and K4-aa is never called', async () => {
    const server = await app();
    const id = await scan(server, await png());
    expect(mlClient.localizeArtwork).toHaveBeenCalledTimes(1);
    expect((mlClient as any).scanK4aa).not.toHaveBeenCalled();
    expect((await get(server, id)).json().status).toBe('done');
    await server.close();
  });
  it('[P0] an unknown value falls back to legacy (with a warning)', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k5';
    const server = await app();
    await scan(server, await png());
    expect((mlClient as any).scanK4aa).not.toHaveBeenCalled();
    expect(mlClient.localizeArtwork).toHaveBeenCalledTimes(1);
    expect(h.log.warn).toHaveBeenCalled();
    await server.close();
  });
  it('[P0] k4aa: scanK4aa is called with strict runtime and a budget <= 165 s; the answer is schema-valid', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app();
    const id = await scan(server, await png());
    expect(mlClient.localizeArtwork).not.toHaveBeenCalled();
    expect(mlClient.classifyArtwork).not.toHaveBeenCalled();
    const [req, opts] = vi.mocked((mlClient as any).scanK4aa).mock.calls[0] as any[];
    expect(req.strict_runtime).toBe(true);
    expect(typeof req.image_b64).toBe('string');
    expect(req.remaining_budget_ms).toBeGreaterThan(0);
    expect(req.remaining_budget_ms).toBeLessThanOrEqual(165000);
    expect(opts.timeoutMs).toBeLessThanOrEqual(165000);
    const body = (await get(server, id)).json();
    expect(body.status).toBe('done');
    expect(validateLogoResults(body.logoResults)).toEqual([]);
    expect(LOGO_RESULTS_SCHEMA_SHA256).toBe('3a9cb34efa69d3c10e4c63ddbb99062fbacae2df5d96af2ffce760d1f156a47c');
    expect(body.logoResults.items.map((i: any) => i.soort).sort()).toEqual(['EU_ORGANIC_FARMING', 'WEIDEMELK']);
    expect(body.logoResults).not.toHaveProperty('stap1');
    await server.close();
  });
  it('[P0] the route is fixed at intake: switching the variable while the scan is queued does not change it', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app();
    const { scanId } = (await post(server, await png(), P())).json();
    process.env.LOGO_SCAN_ROUTE = 'legacy';
    await runLogoScanJob({ scanId });
    expect((mlClient as any).scanK4aa).toHaveBeenCalledTimes(1);
    expect(mlClient.localizeArtwork).not.toHaveBeenCalled();
    expect((await get(server, scanId)).json().logoResults.modelVersion).toBe('model-1/k4aa');
    await server.close();
  });
  it('[P1] k4aa: an output box outside the image makes the scan result_invalid', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    vi.mocked((mlClient as any).scanK4aa).mockResolvedValue(k4aaResponse([det('WEIDEMELK', 60)]));
    const server = await app();
    const id = await scan(server, await png());
    const body = (await get(server, id)).json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('result_invalid');
    await server.close();
  });
  it('[P1] k4aa: zero detections is a done scan with no items', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    vi.mocked((mlClient as any).scanK4aa).mockResolvedValue(k4aaResponse([]));
    const server = await app();
    const body = (await get(server, await scan(server, await png()))).json();
    expect(body.status).toBe('done');
    expect(body.logoResults.items).toEqual([]);
    await server.close();
  });
});

describe('CAP-4 only 7 usable codes, nothing automatic', () => {
  it('[P0] every k4aa item is voorstel with route_k4aa_niet_gevalideerd; only codes outside the 7 carry twijfelachtig', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app();
    const body = (await get(server, await scan(server, await png()))).json();
    const items = Object.fromEntries(body.logoResults.items.map((i: any) => [i.soort, i]));
    for (const i of Object.values(items) as any[]) {
      expect(i.uitkomststand).toBe('voorstel');
      expect(i.bewijs.redenen).toContain('route_k4aa_niet_gevalideerd');
      expect(i.bewijs.methode).toBe('k4aa');
    }
    expect(items.WEIDEMELK.bewijs.redenen).not.toContain('twijfelachtig');
    expect(items.EU_ORGANIC_FARMING.bewijs.redenen).toContain('twijfelachtig');
    await server.close();
  });
  it('[P0] a mapping that says automatisch still yields voorstel for a k4aa detection (injected resolver)', () => {
    const automatic: typeof resolveSoort = (code, ctx) => {
      const r = resolveSoort(code, ctx); return r ? { ...r, stand: 'automatisch', ingesteld: 'automatisch', beperktDoor: null } : r;
    };
    const res = buildLogoResults({
      scanId: 's', imageHash: 'h', status: 'ok', modelVersion: 'model-1/k4aa', width: 64, height: 64,
      detections: [{ bbox: { x: 0, y: 0, width: 16, height: 16 }, t3777_code: 'WEIDEMELK', confidence: 0.99, method: 'k4aa', uncertain: false, requires_review: false }],
    }, automatic);
    expect(res.items[0].uitkomststand).toBe('voorstel');
    expect(res.items[0].bewijs.redenen).toEqual(['route_k4aa_niet_gevalideerd']);
    expect(res.items[0].bewijs.drempel).toBe(0);
    // control: the same detection through another method can become automatic
    const ctl = buildLogoResults({
      scanId: 's', imageHash: 'h', status: 'ok', modelVersion: 'm', width: 64, height: 64,
      detections: [{ bbox: { x: 0, y: 0, width: 16, height: 16 }, t3777_code: 'WEIDEMELK', confidence: 0.99, method: 'embedding', uncertain: false, requires_review: false }],
    }, automatic);
    expect(ctl.items[0].uitkomststand).toBe('automatisch');
  });
  it('[P1] the shared method threshold (verify-flow/crosscheck) does not know k4aa: strictest default, not 0', () => {
    expect(getThresholdForMethod('k4aa')).toBe(getThresholdForMethod(undefined));
    expect(getThresholdForMethod('k4aa')).toBeGreaterThan(0);
  });
  it('[P1] a product category excludes codes as in legacy and is recorded in zoekruimte', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    vi.mocked((mlClient as any).scanK4aa).mockResolvedValue(k4aaResponse([det('WEIDEMELK', 0), det('NUTRISCORE_B', 20)]));
    const server = await app();
    const id = await scan(server, await png(), [...P(), { name: 'gpcCategoryCode', value: '10000000' }]);
    expect((mlClient as any).scanK4aa).toHaveBeenCalledTimes(1);
    const body = (await get(server, id)).json();
    expect(body.logoResults.items.map((i: any) => i.soort)).toEqual(['WEIDEMELK']);
    expect(body.logoResults.zoekruimte).toMatchObject({ gpcCategoryCode: '10000000', beperkt: true });
    await server.close();
  });
});

describe('CAP-6 reuse never crosses routes', () => {
  it('[P0] legacy done → same request in k4aa is a new scan; k4aa twice → deduplicated; back to legacy reuses the legacy scan', async () => {
    const server = await app(); const img = await png();
    const legacy = await scan(server, img);
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const first = (await post(server, img, P())).json();
    expect(first.scanId).not.toBe(legacy); expect(first.deduplicated).toBeUndefined();
    await runLogoScanJob({ scanId: first.scanId });
    expect((await post(server, img, P())).json()).toEqual({ scanId: first.scanId, deduplicated: true });
    process.env.LOGO_SCAN_ROUTE = 'legacy';
    expect((await post(server, img, P())).json()).toEqual({ scanId: legacy, deduplicated: true });
    expect(row(legacy).modelVersion).toBe(`model-1@${SHA_A}`);
    expect(row(first.scanId).modelVersion).toBe(`model-1/k4aa@${SHA_A}`);
    await server.close();
  });
  it('[P1] k4aa with a product category is deduplicated too', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app(); const img = await png();
    const extra = [...P(), { name: 'gpcCategoryCode', value: '10000000' }];
    const a = await scan(server, img, extra);
    expect((await post(server, img, extra)).json()).toEqual({ scanId: a, deduplicated: true });
    expect((mlClient as any).scanK4aa).toHaveBeenCalledTimes(1);
    expect(row(a).modelVersion).toBe(`model-1/k4aa@${SHA_A}`);
    await server.close();
  });
});

describe('CAP-5 / CAP-8 failures and stap1', () => {
  it('[P0] an ML refusal without a zero-retention provider fails the scan with stap1.fout no_zdr_provider and modelVersion /k4aa', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    vi.mocked((mlClient as any).scanK4aa).mockRejectedValue(mlError(503, 'K4-aa recognition unavailable (no_zdr_provider)'));
    const server = await app();
    const id = await scan(server, await png());
    const body = (await get(server, id)).json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('recognition_unavailable');
    expect(body.logoResults.modelVersion).toBe('model-1/k4aa');
    expect(row(id).logoResults.stap1).toMatchObject({ route: 'k4aa', fout: 'no_zdr_provider' });
    expect(mlClient.localizeArtwork).not.toHaveBeenCalled(); // no fallback to the legacy route either
    await server.close();
  });
  it('[P0] a done k4aa scan stores calls, tokens, cost, providers and counts in stap1 (row only)', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app();
    const id = await scan(server, await png());
    expect(row(id).logoResults.stap1).toMatchObject({
      route: 'k4aa', aanroepen: 6, pogingen: 7, tokensIn: 12000, tokensUit: 300, kostenUsd: 0.0121, aanbieders: ['Google'],
      voorstellen: 3, vakjes: 2, referenties: 540, weggevallen: 0,
    });
    expect((await get(server, id)).json().logoResults).not.toHaveProperty('stap1');
    await server.close();
  });
  it('[P1] k4aa: an undecodable image in the worker stores stap1 with route k4aa and fout invalid_image', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app();
    const { scanId } = (await post(server, await png(), P())).json();
    h.redis.store.set(`logo-scan:image:${scanId}`, Buffer.from('not an image'));
    await runLogoScanJob({ scanId });
    const body = (await get(server, scanId)).json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('invalid_image');
    expect(row(scanId).logoResults.stap1).toMatchObject({ route: 'k4aa', fase: 'beeld', fout: 'invalid_image' });
    expect(body.logoResults.modelVersion).toBe('model-1/k4aa');
    await server.close();
  });
  it('[P1] k4aa: a read-time timeout stores stap1 with route k4aa and fout timeout', async () => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    const server = await app();
    const { scanId } = (await post(server, await png(), P())).json();
    const key = `logo-scan:state:${scanId}`;
    const state = JSON.parse(String(h.redis.store.get(key)));
    h.redis.store.set(key, JSON.stringify({ ...state, createdAt: Date.now() - 300000 }));
    const body = (await get(server, scanId)).json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('timeout');
    expect(body.logoResults.modelVersion).toBe('model-1/k4aa');
    expect(row(scanId).logoResults.stap1).toMatchObject({ route: 'k4aa', fase: 'wachtrij', fout: 'timeout' });
    await server.close();
  });
  it.each([
    ['a foreign method', { method: 'embedding' }],
    ['a confidence above 1', { confidence: 1.5 }],
  ])('[P1] k4aa: a detection with %s makes the scan result_invalid', async (_name, extra) => {
    process.env.LOGO_SCAN_ROUTE = 'k4aa';
    vi.mocked((mlClient as any).scanK4aa).mockResolvedValue(k4aaResponse([det('WEIDEMELK', 0, extra)]));
    const server = await app();
    const body = (await get(server, await scan(server, await png()))).json();
    expect(body.status).toBe('failed');
    expect(body.reason).toBe('result_invalid');
    await server.close();
  });
  it('[P1] a legacy scan keeps its stap1 unchanged (no route field)', async () => {
    const server = await app();
    const id = await scan(server, await png());
    expect(row(id).logoResults.stap1).not.toHaveProperty('route');
    await server.close();
  });
});
