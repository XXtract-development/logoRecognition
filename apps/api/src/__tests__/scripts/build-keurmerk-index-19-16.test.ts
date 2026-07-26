/**
 * Story 19.16 — volledige-corpus-run van de keurmerk-index.
 *
 * Dekt de gedragingen die de bestaande 19.3-suite NIET raakt: die test uitsluitend
 * pure helpers (buildIndex/serializeIndex/indexKey/dedupSorted) en geen enkele regel
 * van de I/O-laag die deze story wijzigt.
 *
 * AC2  per-GTIN totaalbudget (ook als de hang in de body-read of in Redis zit)
 * AC5  voortgangsregels
 * AC6  parallellisatie verandert de uitkomst niet; gln gaat mee
 * AC7  kwaliteitspoort 7a/7b/7c/7d
 * AC9  globale deadline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const resolveDeclaredMarks = vi.fn();
const discoverArtwork = vi.fn();

vi.mock('../../services/t3777-declarations', () => ({
  resolveDeclaredMarks: (...args: unknown[]) => resolveDeclaredMarks(...args),
  catalogEnvTag: (base: string) => (base.includes('stage') ? 'stage' : 'acc'),
}));
vi.mock('../../services/mediaserver-client', () => ({
  mediaServerClient: { discoverArtwork: (...a: unknown[]) => discoverArtwork(...a) },
}));
vi.mock('../../services/storage', () => ({
  getStorageAdapter: () => ({ putObject: vi.fn() }),
  BUCKETS: { TRAINING: 'training-images' },
  downloadTrainingObject: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../services/pipeline/queue', () => ({ closeRedisConnection: vi.fn() }));
vi.mock('../../core/db', () => ({ default: { artworkImport: { findMany: vi.fn() }, $disconnect: vi.fn() } }));

import {
  collectGtinData,
  evaluateGate,
  emptyReasonCounts,
  buildIndex,
  type GtinUniverseEntry,
} from '../../scripts/build-keurmerk-index';

const universe = (n: number): GtinUniverseEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    gtin: String(i + 1).padStart(14, '0'),
    gln: '8712345000000',
  }));

beforeEach(() => {
  vi.clearAllMocks();
  resolveDeclaredMarks.mockResolvedValue({ marks: [{ code: 'GREEN_DOT', fieldType: 'X' }], reason: 'ok' });
  discoverArtwork.mockResolvedValue([{ previewUrl: '/a.pdf' }]);
});

describe('AC2 — per-GTIN totaalbudget', () => {
  it('een GTIN die NOOIT antwoordt blokkeert de run niet en telt als timeout', async () => {
    // Simuleert exact de waargenomen productie-hang: de belofte lost nooit op
    // (body-read buiten de timer / ioredis dat met maxRetriesPerRequest:null
    // eeuwig wacht). Zonder budget zou deze test vastlopen i.p.v. falen.
    resolveDeclaredMarks.mockImplementationOnce(() => new Promise(() => {}));

    const res = await collectGtinData(universe(3), {
      concurrency: 1,
      gtinTimeoutMs: 40,
      maxRuntimeMs: 60_000,
      onProgress: () => {},
    });

    expect(res.reasons.timeout).toBe(1);
    expect(res.reasons.ok).toBe(2);
    expect(res.data).toHaveLength(3);
  });

  it('een hangende MEDIASERVER-aanroep valt ook binnen het budget', async () => {
    discoverArtwork.mockImplementationOnce(() => new Promise(() => {}));
    const res = await collectGtinData(universe(2), {
      concurrency: 1,
      gtinTimeoutMs: 40,
      onProgress: () => {},
    });
    expect(res.reasons.timeout).toBe(1);
  });

  it('een throw (bv. misvormde XML) laat de run doorgaan', async () => {
    resolveDeclaredMarks.mockRejectedValueOnce(new Error('parse kapot'));
    const res = await collectGtinData(universe(2), { concurrency: 1, onProgress: () => {} });
    expect(res.data).toHaveLength(2);
    expect(res.reasons.timeout + res.reasons['api-fout']).toBeGreaterThanOrEqual(1);
  });
});

describe('AC6 — parallellisatie verandert de uitkomst niet', () => {
  it('concurrency 1 en 5 geven dezelfde verzameling', async () => {
    const a = await collectGtinData(universe(10), { concurrency: 1, onProgress: () => {} });
    const b = await collectGtinData(universe(10), { concurrency: 5, onProgress: () => {} });
    const norm = (d: typeof a.data) => [...d].map((e) => e.gtin).sort();
    expect(norm(a.data)).toEqual(norm(b.data));
    expect(a.data).toHaveLength(10);
    expect(b.data).toHaveLength(10);
  });

  it('de bekende gln gaat mee naar de declaratielaag (spaart de DB-lookup)', async () => {
    await collectGtinData(universe(1), { concurrency: 1, onProgress: () => {} });
    expect(resolveDeclaredMarks).toHaveBeenCalledWith('00000000000001', '8712345000000');
  });
});

describe('AC9 — globale deadline', () => {
  it('kapt af, telt de rest als niet-verwerkt en meldt dat', async () => {
    resolveDeclaredMarks.mockImplementation(
      () => new Promise((r) => setTimeout(() => r({ marks: [], reason: 'ok' }), 30))
    );
    const lines: string[] = [];
    const res = await collectGtinData(universe(50), {
      concurrency: 1,
      gtinTimeoutMs: 5_000,
      maxRuntimeMs: 90,
      onProgress: (l) => lines.push(l),
    });

    expect(res.deadlineHit).toBe(true);
    expect(res.reasons['niet-verwerkt']).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes('[deadline]'))).toBe(true);
  });
});

describe('AC5 — voortgang', () => {
  it('schrijft periodiek een voortgangsregel met tellingen', async () => {
    const lines: string[] = [];
    await collectGtinData(universe(6), {
      concurrency: 2,
      progressEvery: 2,
      onProgress: (l) => lines.push(l),
    });
    const p = lines.filter((l) => l.includes('[voortgang]'));
    expect(p.length).toBeGreaterThan(0);
    expect(p[p.length - 1]).toMatch(/6\/6/);
    expect(p[p.length - 1]).toMatch(/ok=/);
  });
});

describe('AC7 — kwaliteitspoort', () => {
  const base = {
    universeSize: 100,
    deadlineHit: false,
    existing: { distinctKeys: 32, gtinsWithData: 70 },
    fresh: { distinctKeys: 40, gtinsWithData: 90 },
    allowShrink: false,
    allowPartial: false,
    maxErrorRate: 0.05,
  };

  it('laat een gezonde run door', () => {
    const v = evaluateGate({ ...base, reasons: { ...emptyReasonCounts(), ok: 100 } });
    expect(v.ok).toBe(true);
    expect(v.blockers).toEqual([]);
  });

  it('7a — ontbrekende API-sleutel blokkeert, ook al zijn er 0 technische fouten', () => {
    // Dit is het gat dat de review blootlegde: zonder API-sleutel keert de
    // declaratielaag terug vóór elk netwerkverkeer. Foutratio blijft 0% en de
    // index is LEEG — zonder 7a zou die de goede index overschrijven.
    const v = evaluateGate({
      ...base,
      reasons: { ...emptyReasonCounts(), 'api-key-ontbreekt': 100 },
      fresh: { distinctKeys: 0, gtinsWithData: 0 },
    });
    expect(v.ok).toBe(false);
    expect(v.errorRate).toBe(0);
    expect(v.blockers.join(' ')).toContain('api-key-ontbreekt');
  });

  it('7b — technische foutratio boven de grens blokkeert', () => {
    const v = evaluateGate({
      ...base,
      reasons: { ...emptyReasonCounts(), ok: 70, 'api-fout': 20, timeout: 10 },
    });
    expect(v.ok).toBe(false);
    expect(v.blockers.join(' ')).toContain('foutratio');
  });

  it('7b — 404 en lege-declaratie tellen NIET als technische fout', () => {
    const v = evaluateGate({
      ...base,
      reasons: { ...emptyReasonCounts(), ok: 10, '404': 80, 'lege-declaratie': 10 },
    });
    expect(v.ok).toBe(true);
    expect(v.errorRate).toBe(0);
  });

  it('7c — krimp t.o.v. de bestaande index blokkeert, tenzij toegestaan', () => {
    const shrink = { ...base, fresh: { distinctKeys: 20, gtinsWithData: 40 } };
    expect(evaluateGate({ ...shrink, reasons: { ...emptyReasonCounts(), ok: 100 } }).ok).toBe(false);
    expect(
      evaluateGate({ ...shrink, allowShrink: true, reasons: { ...emptyReasonCounts(), ok: 100 } }).ok
    ).toBe(true);
  });

  it('7c — geen bestaande index: krimptoets vervalt, run mag door', () => {
    const v = evaluateGate({
      ...base,
      existing: null,
      fresh: { distinctKeys: 1, gtinsWithData: 1 },
      reasons: { ...emptyReasonCounts(), ok: 100 },
    });
    expect(v.ok).toBe(true);
  });

  it('7d — een AFGEKAPTE run wordt geblokkeerd, ook al is hij GROTER dan de bestaande index', () => {
    // De kern van de derde reviewronde: 7c kijkt naar omvang, niet naar
    // volledigheid. Bestaand=32 sleutels; een halve run levert er 40 → 7c laat
    // door. Alleen 7d vangt dit.
    const v = evaluateGate({
      ...base,
      deadlineHit: true,
      reasons: { ...emptyReasonCounts(), ok: 60, 'niet-verwerkt': 40 },
      fresh: { distinctKeys: 40, gtinsWithData: 90 },
    });
    expect(v.ok).toBe(false);
    expect(v.blockers.join(' ')).toContain('onvolledige run');

    const forced = evaluateGate({
      ...base,
      deadlineHit: true,
      allowPartial: true,
      reasons: { ...emptyReasonCounts(), ok: 60, 'niet-verwerkt': 40 },
    });
    expect(forced.ok).toBe(true);
  });

  it('leeg universum blokkeert', () => {
    const v = evaluateGate({
      ...base,
      universeSize: 0,
      fresh: { distinctKeys: 0, gtinsWithData: 0 },
      reasons: emptyReasonCounts(),
    });
    expect(v.ok).toBe(false);
    expect(v.blockers.join(' ')).toContain('leeg GTIN-universum');
  });
});

describe('Besluit 2026-07-25 — bronvermelding in de index', () => {
  it('legt de declaratiebron vast', () => {
    const idx = buildIndex(
      [{ gtin: '1', gln: '2', marks: [{ code: 'X', fieldType: 'F' } as never], labels: ['/a.pdf'] }],
      new Date('2026-07-26T00:00:00Z'),
      'stage'
    );
    expect(idx.declarationSource).toBe('stage');
  });

  it('laat het veld weg als er geen bron is (indexen van vóór 19.16)', () => {
    const idx = buildIndex([], new Date('2026-07-26T00:00:00Z'));
    expect(idx.declarationSource).toBeUndefined();
  });
});
