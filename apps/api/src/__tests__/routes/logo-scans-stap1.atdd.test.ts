/**
 * spec-logo-scan-robustness — CAP-3 (stap 1 meetbaar per scan in logo_scans), CAP-4 (poolversie uit de staat),
 * CAP-5 (geen 0,99 naar classify). ATDD: geschreven vóór de implementatie. Prisma en Redis gemockt; geen database, geen netwerk.
 */
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
  const pool = { count: 541, max: new Date('2026-10-12T10:38:04Z') as Date | null, fail: false };
  const fake = { db: null as any };
  const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { redis, pool, fake, log };
});

vi.mock('bullmq', () => ({
  Queue: class { async add() { return {}; } async getWaitingCount() { return 0; } async getActiveCount() { return 0; } async close() {} },
  Worker: class { on() { return this; } async close() {} },
}));
vi.mock('../../services/pipeline/queue', async (orig) => ({ ...(await orig<typeof import('../../services/pipeline/queue')>()), getRedisConnection: () => h.redis }));
vi.mock('../../services/ml-client', async (orig) => ({
  ...(await orig<typeof import('../../services/ml-client')>()),
  mlClient: { localizeArtwork: vi.fn(), classifyArtwork: vi.fn() },
}));
vi.mock('../../core/logger', () => ({ logger: h.log, createLogger: () => h.log, default: h.log }));
vi.mock('../../core/db', async () => {
  const { makeFakeLogoDb } = await import('../helpers/fake-logo-db');
  h.fake.db = makeFakeLogoDb();
  return {
    default: {
      referenceLogo: {
        findMany: vi.fn(async () => [{ t3777Code: 'EU_ORGANIC_FARMING', fieldType: 'PackagingMarkedLabelAccreditationCode' }]),
        aggregate: vi.fn(async () => { if (h.pool.fail) throw new Error('db down'); return { _count: h.pool.count, _max: { createdAt: h.pool.max } }; }),
      },
      logoScan: h.fake.db.logoScan,
      logoCurrentImage: h.fake.db.logoCurrentImage,
    },
  };
});

import { logoScanRoutes } from '../../api/v1/logo-scans';
import { runLogoScanJob } from '../../services/pipeline/logo-scan-flow';
import { validateLogoResults } from '../../services/pipeline/gs1-block';
import { mlClient, MLServiceError } from '../../services/ml-client';

const URL = '/api/v1/pipeline/logo-scans';
const KEY = { 'x-api-key': 'test-key-1' };
const POOL = '541:2026-10-12T10:38:04.000Z';
const originalEnv = { ...process.env };
const db = () => h.fake.db;
const BOX = { x: 0, y: 0, width: 32, height: 32 };

async function app() {
  const server = Fastify();
  await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } });
  await server.register(logoScanRoutes, { prefix: '/api/v1' });
  return server;
}
type Server = Awaited<ReturnType<typeof app>>;
async function post(server: Server) {
  const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } }).png().toBuffer();
  const b = '----t1';
  const chunks = [
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="productId"\r\n\r\nP1\r\n`),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), img, Buffer.from(`\r\n--${b}--\r\n`),
  ];
  const r = await server.inject({ method: 'POST', url: URL, headers: { ...KEY, 'content-type': `multipart/form-data; boundary=${b}` }, payload: Buffer.concat(chunks) });
  return r.json().scanId as string;
}
const get = async (server: Server, id: string) => (await server.inject({ method: 'GET', url: `${URL}/${id}`, headers: KEY })).json();
async function scan(server: Server) { const id = await post(server); await runLogoScanJob({ scanId: id }); return id; }
const row = (id: string) => db().scans.find((r: any) => r.scanId === id)!;
const localized = (proposals?: { raw: number; refined: number; ghs: number } | null, detections = [{ bbox: BOX }]) =>
  ({ detections, truncated: false, ...(proposals === undefined ? {} : { proposals }) });
const classified = (over: Record<string, unknown> = {}) =>
  ({ results: [{ bbox: BOX, t3777_code: 'EU_ORGANIC_FARMING', confidence: 0.97, method: 'embedding', evidence: {}, ...over }] });

beforeEach(() => {
  process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1';
  process.env.LOGO_MODEL_VERSION = 'model-1';
  h.redis.store.clear(); h.pool.fail = false;
  db().scans.length = 0; db().current.length = 0; db().state.missingTable = false;
  vi.mocked(mlClient.localizeArtwork).mockReset().mockResolvedValue(localized({ raw: 3, refined: 2, ghs: 0 }) as any);
  vi.mocked(mlClient.classifyArtwork).mockReset().mockResolvedValue(classified() as any);
});
afterEach(() => { vi.useRealTimers(); process.env = { ...originalEnv }; });

describe('AC-3.2/3.4 — stap 1 van een geslaagde scan', () => {
  it('de rij draagt stap1 met de tellingen; het antwoord niet, en valideert', async () => {
    const server = await app();
    const id = await scan(server);
    expect(row(id).status).toBe('done');
    expect(row(id).logoResults.stap1).toEqual({ voorstellen: 3, verfijnd: 2, ghs: 0, vakjes: 1, aanroepen: null, tokensIn: null, tokensUit: null, overgeslagen: null, weggevallen: null, onverfijnd: null });
    const out = await get(server, id);
    expect(out.status).toBe('done');
    expect(out.logoResults).not.toHaveProperty('stap1');
    expect(validateLogoResults(out.logoResults)).toEqual([]);
    await server.close();
  });
  it('tabelpad (Redis leeg) stript stap1 en blijft schema-geldig', async () => {
    const server = await app();
    const id = await scan(server);
    h.redis.store.clear();
    const out = await get(server, id);
    expect(out.status).toBe('done');
    expect(out.logoResults).not.toHaveProperty('stap1');
    expect(validateLogoResults(out.logoResults)).toEqual([]);
    await server.close();
  });
  it('ml-respons zonder proposals (oudere ml-image): tellingen null, vakjes wel geteld', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized(undefined) as any);
    const id = await scan(server);
    expect(row(id).logoResults.stap1).toEqual({ voorstellen: null, verfijnd: null, ghs: null, vakjes: 1, aanroepen: null, tokensIn: null, tokensUit: null, overgeslagen: null, weggevallen: null, onverfijnd: null });
    await server.close();
  });
  it('lege lokalisatie: vakjes 0, classify niet aangeroepen', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized({ raw: 0, refined: 0, ghs: 0 }, []) as any);
    const id = await scan(server);
    expect(row(id).status).toBe('done');
    expect(row(id).logoResults.stap1).toEqual({ voorstellen: 0, verfijnd: 0, ghs: 0, vakjes: 0, aanroepen: null, tokensIn: null, tokensUit: null, overgeslagen: null, weggevallen: null, onverfijnd: null });
    expect(mlClient.classifyArtwork).not.toHaveBeenCalled();
    await server.close();
  });
  it('een oude rij zonder stap1 leest ongewijzigd', async () => {
    const server = await app();
    const id = await scan(server);
    delete row(id).logoResults.stap1;
    h.redis.store.clear();
    const out = await get(server, id);
    expect(out.status).toBe('done');
    expect(validateLogoResults(out.logoResults)).toEqual([]);
    await server.close();
  });
});

describe('AC-3.3 — stap 1 van een mislukte scan', () => {
  it('ml-503 met foutklasse: fase lokalisatie + geparste klasse; antwoord zonder stap1 en geldig', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(
      new MLServiceError('Artwork localization failed: Visual localization unavailable (proposal_parse_error)', 503, 'Visual localization unavailable (proposal_parse_error)'));
    const id = await scan(server);
    expect(row(id)).toMatchObject({ status: 'failed', reason: 'recognition_unavailable' });
    expect(row(id).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'proposal_parse_error' });
    const out = await get(server, id);
    expect(out.status).toBe('failed');
    expect(out.logoResults).not.toHaveProperty('stap1');
    expect(validateLogoResults(out.logoResults)).toEqual([]);
    await server.close();
  });
  it('ml-fout zonder klasse: ml_status_<n>; gewone fout: afgekapte boodschap', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new MLServiceError('ML Service is not available', 503, 'Service unavailable'));
    const a = await scan(server);
    expect(row(a).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'ml_status_503' });
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new Error('x'.repeat(300)));
    const b = await scan(server);
    expect(row(b).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'x'.repeat(100) });
    await server.close();
  });
  it('classify faalt: fase classificatie, tellingen van stap 1 blijven erbij', async () => {
    const server = await app();
    vi.mocked(mlClient.classifyArtwork).mockRejectedValueOnce(new MLServiceError('Artwork classification failed: Required classification backend unavailable', 503, 'Required classification backend unavailable'));
    const id = await scan(server);
    expect(row(id).logoResults.stap1).toEqual({ fase: 'classificatie', fout: 'ml_status_503', voorstellen: 3, verfijnd: 2, ghs: 0, vakjes: 1, aanroepen: null, tokensIn: null, tokensUit: null, overgeslagen: null, weggevallen: null, onverfijnd: null });
    await server.close();
  });
  it('onbruikbare regio\'s en ongeldig resultaat krijgen hun eigen fout', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized({ raw: 2, refined: 0, ghs: 0 }, [{ bbox: BOX }, { bbox: BOX }]) as any);
    const a = await scan(server);
    expect(row(a).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'unusable_regions', voorstellen: 2, verfijnd: 0, ghs: 0, vakjes: 2 });
    vi.mocked(mlClient.classifyArtwork).mockResolvedValueOnce({ results: [{ bbox: { x: 1, y: 1, width: 2, height: 2 }, t3777_code: 'EU_ORGANIC_FARMING', confidence: 0.9, method: 'embedding' }] } as any);
    const b = await scan(server);
    expect(row(b).logoResults.stap1).toMatchObject({ fase: 'classificatie', fout: 'malformed_results' });
    await server.close();
  });
});

describe('AC-4.1/4.3/4.4 — poolversie uit de staat', () => {
  it('done-scan zonder detectieversies: referenceVersion is de poolversie', async () => {
    const server = await app();
    const id = await scan(server);
    const out = await get(server, id);
    expect(out.logoResults.referenceVersion).toBe(POOL);
    expect(out.logoResults.items[0].bewijs.referentieversie).toBe(POOL);
    expect(row(id).referenceVersion).toBe(POOL);
    await server.close();
  });
  it('mislukte scan draagt de poolversie ook', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(new Error('ml down'));
    const id = await scan(server);
    expect((await get(server, id)).logoResults.referenceVersion).toBe(POOL);
    await server.close();
  });
  it('database uit bij toelating: gedrag van vandaag (unknown)', async () => {
    const server = await app();
    h.pool.fail = true;
    const id = await scan(server);
    expect((await get(server, id)).logoResults.referenceVersion).toBe('unknown');
    await server.close();
  });
});

describe('AC-5.1 — geen kunstmatige drempel naar classify', () => {
  it('classifyArtwork wordt zonder confidence_threshold aangeroepen', async () => {
    const server = await app();
    await scan(server);
    const call = vi.mocked(mlClient.classifyArtwork).mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('confidence_threshold');
    expect(call).toMatchObject({ strict_runtime: true, persist_crops: false });
    await server.close();
  });
});

describe('review ronde 1 — stap1 bij tijdslimieten, onverwachte ml-klassen en lege vakjes', () => {
  it('ml-klasse met hoofdletters (unexpected_OSError) blijft herkenbaar', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(
      new MLServiceError('x', 503, 'Visual localization unavailable (unexpected_OSError)'));
    const id = await scan(server);
    expect(row(id).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'unexpected_OSError' });
    await server.close();
  });
  it('verlopen in de wachtrij: fase wachtrij, fout timeout', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = await app();
    const id = await post(server);
    vi.setSystemTime(Date.now() + 240000 + 1000);
    await runLogoScanJob({ scanId: id });
    expect(row(id).logoResults.stap1).toEqual({ fase: 'wachtrij', fout: 'timeout' });
    await server.close();
  });
  it('lokalisatie hangt tot de deadline: fase lokalisatie, fout timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const server = await app();
    const id = await post(server);
    vi.mocked(mlClient.localizeArtwork).mockImplementationOnce(() => new Promise(() => {}));
    const run = runLogoScanJob({ scanId: id });
    // sharp runs on real threads: jump the clock only once this job's localize is the one that hangs; otherwise the job
    // outlives the test and its late localize/classify calls consume the next test's mocks.
    for (let i = 0; i < 2000 && !vi.mocked(mlClient.localizeArtwork).mock.calls.length; i++) await new Promise(r => setImmediate(r));
    expect(mlClient.localizeArtwork).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240000 + 1000);
    await run;
    expect(row(id).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'timeout' });
    await server.close();
  });
  it('classificatie hangt tot de deadline: fase classificatie, tellingen van stap 1 blijven', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const server = await app();
    const id = await post(server);
    vi.mocked(mlClient.classifyArtwork).mockImplementationOnce(() => new Promise(() => {}));
    const run = runLogoScanJob({ scanId: id });
    // sharp runs on real threads: let it finish before jumping the fake clock past the deadline.
    for (let i = 0; i < 2000 && !vi.mocked(mlClient.classifyArtwork).mock.calls.length; i++) await new Promise(r => setImmediate(r));
    expect(mlClient.classifyArtwork).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(240000 + 1000);
    await run;
    expect(row(id).logoResults.stap1).toEqual({ fase: 'classificatie', fout: 'timeout', voorstellen: 3, verfijnd: 2, ghs: 0, vakjes: 1, aanroepen: null, tokensIn: null, tokensUit: null, overgeslagen: null, weggevallen: null, onverfijnd: null });
    await server.close();
  });
  it('tijdslimiet bij lezen van een wachtende scan: fase wachtrij', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = await app();
    const id = await post(server);
    vi.setSystemTime(Date.now() + 240000 + 1000);
    expect((await get(server, id)).status).toBe('failed');
    expect(row(id).logoResults.stap1).toEqual({ fase: 'wachtrij', fout: 'timeout' });
    await server.close();
  });
  it('AC-1.6 — een blank_crop-resultaat maakt de scan niet partial', async () => {
    const server = await app();
    const second = { x: 32, y: 0, width: 32, height: 32 };
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized({ raw: 2, refined: 0, ghs: 0 }, [{ bbox: BOX }, { bbox: second }]) as any);
    vi.mocked(mlClient.classifyArtwork).mockResolvedValueOnce({ results: [
      classified().results[0],
      { bbox: second, t3777_code: 'UNKNOWN', confidence: 0, method: 'embedding', uncertain: true, evidence: { reason: 'blank_crop' } },
    ] } as any);
    const id = await scan(server);
    const out = await get(server, id);
    expect(out.status).toBe('done');
    expect(out.logoResults.status).toBe('ok');
    expect(out.logoResults.items).toHaveLength(1);
    expect(out.logoResults.detections).toHaveLength(2);
    expect(out.logoResults.detections.find((d: any) => d.t3777_code === 'UNKNOWN')).toMatchObject({ confidence: 0, evidence: { reason: 'blank_crop' } });
    await server.close();
  });
});

describe('spec-stap1-localization-recall CAP-3 — aanroepen en tokens per scan in stap1', () => {
  const full = { raw: 4, refined: 1, ghs: 0, calls: 5, tokens_in: 19000, tokens_out: 380, skipped: 1, dropped: 2, unrefined: 0 };
  it('geslaagde lokalisatie: stap1 draagt aanroepen, tokens, overgeslagen en weggevallen', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized(full as any) as any);
    const id = await scan(server);
    expect(row(id).status).toBe('done');
    expect(row(id).logoResults.stap1).toEqual({
      voorstellen: 4, verfijnd: 1, ghs: 0, vakjes: 1,
      aanroepen: 5, tokensIn: 19000, tokensUit: 380, overgeslagen: 1, weggevallen: 2, onverfijnd: 0,
    });
    const out = await get(server, id);
    expect(out.logoResults).not.toHaveProperty('stap1');
    expect(validateLogoResults(out.logoResults)).toEqual([]);
    await server.close();
  });
  it('onbekende tokens: null', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized({ ...full, tokens_in: null, tokens_out: null } as any) as any);
    const a = await scan(server);
    expect(row(a).logoResults.stap1).toMatchObject({ aanroepen: 5, tokensIn: null, tokensUit: null });
    await server.close();
  });
  it('ml-image zonder de nieuwe velden: null', async () => {
    // Own test: a second identical upload after a done scan reuses the first result.
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockResolvedValueOnce(localized({ raw: 3, refined: 2, ghs: 0 }) as any);
    const b = await scan(server);
    expect(row(b).logoResults.stap1).toEqual({
      voorstellen: 3, verfijnd: 2, ghs: 0, vakjes: 1,
      aanroepen: null, tokensIn: null, tokensUit: null, overgeslagen: null, weggevallen: null, onverfijnd: null,
    });
    await server.close();
  });
  it('mislukte lokalisatie: de nieuwe velden ontbreken', async () => {
    const server = await app();
    vi.mocked(mlClient.localizeArtwork).mockRejectedValueOnce(
      new MLServiceError('Artwork localization failed: Visual localization unavailable (provider_status_429)', 503, 'Visual localization unavailable (provider_status_429)'));
    const id = await scan(server);
    expect(row(id).logoResults.stap1).toEqual({ fase: 'lokalisatie', fout: 'provider_status_429' });
    await server.close();
  });
});
