/**
 * Story 19.16 — wijzigingen in de GEDEELDE declaratieservice.
 *
 * Deze service voedt óók twee LIVE paden (review-prior in artwork-pipeline en de
 * bootstrap-declaratieguard), dus AC10 eist bewijs dat die niet breken. Bewust
 * ZONDER mock op `catalogEnvTag`: dat is de kern van AC8 en moet echt getest worden.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

const redisStore = new Map<string, string>();
const redisGet = vi.fn(async (k: string) => redisStore.get(k) ?? null);
const redisSetex = vi.fn(async (k: string, _ttl: number, v: string) => {
  redisStore.set(k, v);
  return 'OK';
});

vi.mock('../../services/pipeline/queue', () => ({
  getRedisConnection: () => ({ get: redisGet, setex: redisSetex }),
}));
vi.mock('../../core/db', () => ({
  default: { artworkImport: { findFirst: vi.fn(async () => ({ gln: '8712345000000' })) } },
}));
vi.mock('../../services/pipeline/detection-flow', () => ({
  setDeclarationProvider: vi.fn(),
  emptyDeclarationProvider: {},
}));

import {
  catalogEnvTag,
  resolveDeclaredMarks,
  marksCacheStats,
  resetMarksCacheStats,
} from '../../services/t3777-declarations';
import prisma from '../../core/db';

const XML = `<x><packagingMarkedLabelAccreditationCode>GREEN_DOT</packagingMarkedLabelAccreditationCode></x>`;

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
  resetMarksCacheStats();
  process.env.CATALOG_API_KEY = 'k';
  process.env.CATALOG_API_BASE = 'https://catalog.stage.xxtract.com';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CATALOG_API_BASE;
});

describe('AC8 — omgevingsdimensie in de cachesleutel (ECHTE functie, niet gemockt)', () => {
  it('leidt de tag af uit de host', () => {
    expect(catalogEnvTag('https://catalog.stage.xxtract.com')).toBe('stage');
    expect(catalogEnvTag('https://catalog.acc.xxtract.com')).toBe('acc');
  });

  it('stage en acc krijgen VERSCHILLENDE tags — geen botsing', () => {
    expect(catalogEnvTag('https://catalog.stage.xxtract.com')).not.toBe(
      catalogEnvTag('https://catalog.acc.xxtract.com')
    );
  });

  it('valt terug op iets stabiels bij een rare URL', () => {
    expect(catalogEnvTag('niet-eens-een-url')).toBe('onbekend');
    expect(catalogEnvTag('http://localhost:3000')).toBeTruthy();
  });

  it('een stage-run schrijft onder een sleutel die een acc-run NIET terugleest', async () => {
    // De kern van AC8: zonder env-dimensie zou de ACC-lezer de stage-uitkomst als
    // ACC-waarheid teruglezen (24h), inclusief de live review-prior en de guard.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(XML, { status: 200 }))
    );
    await resolveDeclaredMarks('00000000000001', '8712345000000');
    const stageKeys = [...redisStore.keys()];
    expect(stageKeys.some((k) => k.includes(':stage:'))).toBe(true);

    process.env.CATALOG_API_BASE = 'https://catalog.acc.xxtract.com';
    await resolveDeclaredMarks('00000000000001', '8712345000000');
    const accKeys = [...redisStore.keys()].filter((k) => k.includes(':acc:'));
    expect(accKeys.length).toBe(1);
    expect(redisStore.size).toBe(2); // twee gescheiden entries, geen hergebruik
  });
});

describe('AC2 — de aborttimer dekt ook de BODY-read (het echte hang-scenario)', () => {
  it('een ECHTE server die headers stuurt en dan stilvalt, wordt afgebroken', async () => {
    // Bewust een échte HTTP-server + échte fetch: een nep-object reageert niet op
    // AbortController en zou dus niets bewijzen. Dit is exact de productie-hang —
    // headers komen binnen, daarna valt de server stil en `response.text()` blijft
    // wachten. Vóór 19.16 stond `clearTimeout` in de finally van de fetch, waardoor
    // die lezing buiten elke bovengrens viel (waargenomen: 25 min, 0:00 CPU).
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      res.write('<x>'); // headers + begin body, daarna NOOIT end()
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as import('net').AddressInfo).port;

    process.env.CATALOG_API_BASE = `http://127.0.0.1:${port}`;
    process.env.CATALOG_FETCH_TIMEOUT_MS = '600';

    try {
      const started = Date.now();
      const res = await resolveDeclaredMarks('00000000000002', '8712345000000');
      const elapsed = Date.now() - started;

      expect(res.reason).toBe('api-fout');
      expect(res.marks).toEqual([]);
      // Afgebroken door de timer, niet blijven hangen.
      expect(elapsed).toBeLessThan(5_000);
    } finally {
      delete process.env.CATALOG_FETCH_TIMEOUT_MS;
      server.closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 20_000);
});

describe('AC4 — cachegedrag', () => {
  it('telt hits en misses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(XML, { status: 200 })));
    await resolveDeclaredMarks('00000000000003', '8712345000000');
    expect(marksCacheStats.misses).toBe(1);
    expect(marksCacheStats.hits).toBe(0);

    await resolveDeclaredMarks('00000000000003', '8712345000000');
    expect(marksCacheStats.hits).toBe(1);
  });

  it('een TRANSIËNTE fout krijgt een korte TTL, geen etmaal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await resolveDeclaredMarks('00000000000004', '8712345000000');
    const ttl = redisSetex.mock.calls.at(-1)?.[1] as number;
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it('een 404 blijft wél lang gecached (stabiel antwoord)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await resolveDeclaredMarks('00000000000005', '8712345000000');
    const ttl = redisSetex.mock.calls.at(-1)?.[1] as number;
    expect(ttl).toBeGreaterThan(300);
  });
});

describe('AC6/AC10 — knownGln en geen regressie op de live paden', () => {
  it('met knownGln wordt de DB-lookup overgeslagen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(XML, { status: 200 })));
    await resolveDeclaredMarks('00000000000006', '8712345000000');
    expect((prisma as unknown as { artworkImport: { findFirst: ReturnType<typeof vi.fn> } })
      .artworkImport.findFirst).not.toHaveBeenCalled();
  });

  it('ZONDER knownGln blijft het oude gedrag intact (live paden roepen zo aan)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(XML, { status: 200 })));
    const res = await resolveDeclaredMarks('00000000000007');
    expect((prisma as unknown as { artworkImport: { findFirst: ReturnType<typeof vi.fn> } })
      .artworkImport.findFirst).toHaveBeenCalled();
    expect(res.reason).toBe('ok');
    expect(res.marks.length).toBeGreaterThan(0);
  });

  it('een lege knownGln valt terug op de lookup i.p.v. een kapotte URL te bouwen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(XML, { status: 200 })));
    await resolveDeclaredMarks('00000000000008', '');
    expect((prisma as unknown as { artworkImport: { findFirst: ReturnType<typeof vi.fn> } })
      .artworkImport.findFirst).toHaveBeenCalled();
  });

  it('een throwende parse breekt de "never throws"-belofte niet', async () => {
    // Een misvormde body mag nooit een hele indexrun omvergooien.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        headers: { get: () => null },
        text: async () => {
          throw new Error('stukke body');
        },
      }))
    );
    const res = await resolveDeclaredMarks('00000000000009', '8712345000000');
    expect(res.reason).toBe('api-fout');
    expect(res.marks).toEqual([]);
  });
});
