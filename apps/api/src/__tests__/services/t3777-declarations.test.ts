/**
 * T3777 declaration provider tests — Story 8-3D.
 *
 * Covers (AC5):
 *   - namespace-agnostic XML parse on local-name against a REAL-shaped ACC XML
 *     fixture (multiple codes/layers, union, dedup, trim, uppercase)
 *   - all FOUR distinct fail-safe paths (api-key / gln / 404 / api-fout) plus
 *     the lege-declaratie path — asserted on the returned reason
 *   - Redis cache: hit prevents a second fetch, negative caching of empties,
 *     Redis fault → still fetches without crashing
 *   - key-from-env: no CATALOG_API_KEY → empty, no DB call, no fetch
 *
 * fetch is mocked via vi.stubGlobal; ioredis + prisma are mocked in setup.ts.
 * The Redis singleton (getRedisConnection) is backed by a fresh Map per test so
 * the cache behaviour is deterministic and isolated.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import prisma from '../../core/db';
import { getRedisConnection } from '../../services/pipeline/queue';
import {
  resolveDeclarations,
  catalogDeclarationProvider,
  parseT3777Codes,
  parseDeclaredMarks,
  resolveDeclaredMarks,
} from '../../services/t3777-declarations';

const ACC_XML = readFileSync(
  path.join(__dirname, '../fixtures/tradeitem-acc.xml'),
  'utf8'
);

const GTIN = '08718989912451';

/** A 200 OK Response-like object for the mocked fetch. */
function okXml(body: string) {
  return {
    status: 200,
    headers: { get: () => null },
    text: async () => body,
  };
}

function status(code: number) {
  return {
    status: code,
    headers: { get: () => null },
    text: async () => '',
  };
}

/** Install a fresh Map-backed get/setex on the memoized Redis singleton. */
function installFreshRedisCache(): Map<string, string> {
  const store = new Map<string, string>();
  const redis = getRedisConnection() as unknown as {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
  };
  redis.get = vi.fn(async (key: string) => store.get(key) ?? null);
  redis.setex = vi.fn(async (key: string, _ttl: number, value: string) => {
    store.set(key, value);
    return 'OK';
  });
  return store;
}

describe('T3777 declaration provider (8-3D)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let cacheStore: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.CATALOG_API_KEY = 'test-catalog-key';
    process.env.CATALOG_API_BASE = 'https://catalog.acc.xxtract.com';
    process.env.T3777_TARGET_MARKET = '528';
    process.env.T3777_CACHE_TTL_S = '86400';

    // Default: a gln exists for the GTIN.
    (prisma.artworkImport.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      gln: '8718989000000',
    });

    cacheStore = installFreshRedisCache();

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // XML parse on local-name (AC5)
  // -------------------------------------------------------------------------
  describe('namespace-agnostic XML parse', () => {
    it('parses codes across layers/prefixes with union, dedup, trim, uppercase', () => {
      const codes = parseT3777Codes(ACC_XML);
      // gs1: NUTRISCORE_A + KEURMERK_BIO, market: beter_leven_1ster (lc→uc) +
      // KEURMERK_BIO (dup), no-prefix FAIRTRADE → 4 distinct after dedup.
      expect(codes.sort()).toEqual(
        ['BETER_LEVEN_1STER', 'FAIRTRADE', 'KEURMERK_BIO', 'NUTRISCORE_A'].sort()
      );
      // dedup: KEURMERK_BIO appears twice in the fixture but once in the result.
      expect(codes.filter((c) => c === 'KEURMERK_BIO')).toHaveLength(1);
    });

    it('resolveDeclarations returns the parsed set with reason ok', async () => {
      fetchMock.mockResolvedValue(okXml(ACC_XML));
      const result = await resolveDeclarations(GTIN);
      expect(result.reason).toBe('ok');
      expect(result.codes.sort()).toEqual(
        ['BETER_LEVEN_1STER', 'FAIRTRADE', 'KEURMERK_BIO', 'NUTRISCORE_A'].sort()
      );
      // the URL is gln-gtin-tm against the configured base
      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe(
        'https://catalog.acc.xxtract.com/api/tradeitemxml/8718989000000-08718989912451-528'
      );
      // the API key travels in the header, never in the URL
      const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
      expect(init.headers['X-API-Key']).toBe('test-catalog-key');
    });

    it('catalogDeclarationProvider exposes only the codes', async () => {
      fetchMock.mockResolvedValue(okXml(ACC_XML));
      const codes = await catalogDeclarationProvider(GTIN);
      expect(codes).toContain('KEURMERK_BIO');
      expect(Array.isArray(codes)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Four distinct fail-safe paths (+ lege-declaratie) — AC2 / AC5
  // -------------------------------------------------------------------------
  describe('fail-safe paths (distinct reasons, never throws)', () => {
    it('api-key-ontbreekt: no key → [] without DB or fetch', async () => {
      delete process.env.CATALOG_API_KEY;
      const result = await resolveDeclarations(GTIN);
      expect(result).toEqual({ codes: [], reason: 'api-key-ontbreekt' });
      expect(prisma.artworkImport.findFirst).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('gln-ontbreekt: no gln row → [] before forming a cache key or fetching', async () => {
      (prisma.artworkImport.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await resolveDeclarations(GTIN);
      expect(result).toEqual({ codes: [], reason: 'gln-ontbreekt' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('404-mogelijk-TM-mismatch: catalog 404 → distinct reason', async () => {
      fetchMock.mockResolvedValue(status(404));
      const result = await resolveDeclarations(GTIN);
      expect(result).toEqual({ codes: [], reason: '404-mogelijk-TM-mismatch' });
    });

    it('api-fout: status >= 400 (non-404) → api-fout', async () => {
      fetchMock.mockResolvedValue(status(500));
      const result = await resolveDeclarations(GTIN);
      expect(result).toEqual({ codes: [], reason: 'api-fout' });
    });

    it('api-fout: network/fetch error → api-fout, never throws', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(resolveDeclarations(GTIN)).resolves.toEqual({
        codes: [],
        reason: 'api-fout',
      });
    });

    it('lege-declaratie: 200 but no T3777 codes → distinct reason', async () => {
      fetchMock.mockResolvedValue(okXml('<tradeItem><gtin>x</gtin></tradeItem>'));
      const result = await resolveDeclarations(GTIN);
      expect(result).toEqual({ codes: [], reason: 'lege-declaratie' });
    });
  });

  // -------------------------------------------------------------------------
  // Redis cache behaviour (AC3 / AC5)
  // -------------------------------------------------------------------------
  describe('Redis cache', () => {
    it('cache hit prevents a second fetch', async () => {
      fetchMock.mockResolvedValue(okXml(ACC_XML));

      const first = await resolveDeclarations(GTIN);
      expect(first.reason).toBe('ok');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = await resolveDeclarations(GTIN);
      expect(second.codes.sort()).toEqual(first.codes.sort());
      // still 1 — the second call was served from the cache
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('negative caching: an empty result is cached and not re-fetched', async () => {
      fetchMock.mockResolvedValue(status(404));

      const first = await resolveDeclarations(GTIN);
      expect(first).toEqual({ codes: [], reason: '404-mogelijk-TM-mismatch' });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = await resolveDeclarations(GTIN);
      expect(second).toEqual({ codes: [], reason: '404-mogelijk-TM-mismatch' });
      expect(fetchMock).toHaveBeenCalledTimes(1); // negatively cached
    });

    it('writes the cache entry with the configured TTL', async () => {
      fetchMock.mockResolvedValue(okXml(ACC_XML));
      await resolveDeclarations(GTIN);
      const redis = getRedisConnection() as unknown as { setex: ReturnType<typeof vi.fn> };
      expect(redis.setex).toHaveBeenCalledWith(
        't3777:8718989000000:08718989912451:528',
        86400,
        expect.any(String)
      );
    });

    it('Redis fault on read → still fetches, no crash', async () => {
      const redis = getRedisConnection() as unknown as { get: ReturnType<typeof vi.fn> };
      redis.get = vi.fn().mockRejectedValue(new Error('redis down'));
      fetchMock.mockResolvedValue(okXml(ACC_XML));

      const result = await resolveDeclarations(GTIN);
      expect(result.reason).toBe('ok');
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('Redis fault on write → result still returned, no crash', async () => {
      const redis = getRedisConnection() as unknown as { setex: ReturnType<typeof vi.fn> };
      redis.setex = vi.fn().mockRejectedValue(new Error('redis down'));
      fetchMock.mockResolvedValue(okXml(ACC_XML));

      const result = await resolveDeclarations(GTIN);
      expect(result.reason).toBe('ok');
      expect(result.codes.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // key-from-env target market (AC5)
  // -------------------------------------------------------------------------
  describe('env-driven URL', () => {
    it('uses T3777_TARGET_MARKET and CATALOG_API_BASE from env', async () => {
      process.env.T3777_TARGET_MARKET = '276';
      process.env.CATALOG_API_BASE = 'https://catalog.staging.example.com/';
      fetchMock.mockResolvedValue(okXml(ACC_XML));

      await resolveDeclarations(GTIN);
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      // trailing slash on the base is stripped; tm comes from env
      expect(calledUrl).toBe(
        'https://catalog.staging.example.com/api/tradeitemxml/8718989000000-08718989912451-276'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Story 12.7 — declared GS1 marks (all sporen) as a label-prior
  // -------------------------------------------------------------------------
  describe('declared marks (12.7)', () => {
    const MARKS_XML = `
      <tradeItem xmlns:gs1="urn:gs1">
        <gs1:packagingMarkedLabelAccreditationCode>GREEN_DOT</gs1:packagingMarkedLabelAccreditationCode>
        <packagingMarkedLabelAccreditationCode> certified_b_corporation </packagingMarkedLabelAccreditationCode>
        <dietTypeCode>VEGAN</dietTypeCode>
        <dietTypeCode>lactose_free</dietTypeCode>
        <isDietTypeMarkedOnPackage>TRUE</isDietTypeMarkedOnPackage>
        <nutritionalScore>A</nutritionalScore>
      </tradeItem>`;

    it('parses every spoor with the right fieldType, trim/uppercase/dedup', () => {
      const marks = parseDeclaredMarks(MARKS_XML);
      expect(marks).toEqual(
        expect.arrayContaining([
          { code: 'GREEN_DOT', fieldType: 'PackagingMarkedLabelAccreditationCode' },
          { code: 'CERTIFIED_B_CORPORATION', fieldType: 'PackagingMarkedLabelAccreditationCode' },
          { code: 'VEGAN', fieldType: 'DietTypeCode' },
          { code: 'LACTOSE_FREE', fieldType: 'DietTypeCode' },
          { code: 'A', fieldType: 'NutritionalScore' },
        ])
      );
      expect(marks).toHaveLength(5);
    });

    it('resolveDeclaredMarks returns marks + reason ok and caches under marks:', async () => {
      fetchMock.mockResolvedValue(okXml(MARKS_XML));
      const result = await resolveDeclaredMarks(GTIN);
      expect(result.reason).toBe('ok');
      expect(result.marks.some((m) => m.code === 'LACTOSE_FREE' && m.fieldType === 'DietTypeCode')).toBe(true);
      // second call hits the cache (no second fetch) under a marks-namespaced key
      await resolveDeclaredMarks(GTIN);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect([...cacheStore.keys()].some((k) => k.startsWith('marks:'))).toBe(true);
    });

    it('empty declaration → marks=[] with reason lege-declaratie (never throws)', async () => {
      fetchMock.mockResolvedValue(okXml('<tradeItem></tradeItem>'));
      const result = await resolveDeclaredMarks(GTIN);
      expect(result.marks).toEqual([]);
      expect(result.reason).toBe('lege-declaratie');
    });

    it('missing API key → api-key-ontbreekt, no fetch', async () => {
      delete process.env.CATALOG_API_KEY;
      const result = await resolveDeclaredMarks(GTIN);
      expect(result).toEqual({ marks: [], reason: 'api-key-ontbreekt' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('catalog 404 → marks=[] with reason 404-mogelijk-TM-mismatch', async () => {
      fetchMock.mockResolvedValue(status(404));
      const result = await resolveDeclaredMarks(GTIN);
      expect(result.marks).toEqual([]);
      expect(result.reason).toBe('404-mogelijk-TM-mismatch');
    });
  });
});
