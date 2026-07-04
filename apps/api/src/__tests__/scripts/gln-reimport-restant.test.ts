/**
 * Story 18.2 — GLN-restant-re-import (terugval-route, AC1+AC2, FR-21, AD-7).
 *
 * Tests op de PURE kern + de orkestratie met VOLLEDIG gemockte deps (mediaserver/
 * prisma/import-loop nooit echt aangeroepen — geen prod, geen ACC). Gedekt:
 *   - terugval-SELECTIE: alleen het 18.1-restant (`gln IS NULL` + gezette reden),
 *   - batch-INDELING + pauze-RESPECT (fake timers, tempering NFR-3),
 *   - reden-BIJWERKING beide paden (gevuld → reden gewist; niet-gevuld → nieuwe reden),
 *   - dekkingsgraad-HERMETING (vóór/ná via coverageTotals),
 *   - dry-run-NUL-writes (geen import-run, geen write, geen pauze),
 *   - idempotente HERSTART (leeg restant = niets).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chunkIntoBatches,
  reasonForUnresolved,
  runReimport,
  type ReimportDeps,
} from '../../../scripts/gln-reimport-restant';

/** Bouw een deps-object met spy-mocks; overrides per test. */
function makeDeps(overrides: Partial<ReimportDeps> = {}): ReimportDeps {
  return {
    listRestantGtins: vi.fn().mockResolvedValue([]),
    coverageTotals: vi.fn().mockResolvedValue({ total: 0, withGln: 0 }),
    runImportBatch: vi.fn().mockResolvedValue(undefined),
    hasGln: vi.fn().mockResolvedValue(true),
    discoverySignal: vi.fn().mockResolvedValue({ mediaCount: 0, glnCount: 0 }),
    clearReason: vi.fn().mockResolvedValue(1),
    setReason: vi.fn().mockResolvedValue(1),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('chunkIntoBatches — batch-indeling', () => {
  it('deelt op in batches van de gevraagde grootte', () => {
    expect(chunkIntoBatches(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });

  it('geeft één batch als size ≥ lengte', () => {
    expect(chunkIntoBatches(['a', 'b'], 25)).toEqual([['a', 'b']]);
  });

  it('geeft geen batches bij een lege lijst', () => {
    expect(chunkIntoBatches([], 25)).toEqual([]);
  });

  it('valt defensief terug op één batch bij size < 1 (niet-lege lijst)', () => {
    expect(chunkIntoBatches(['a', 'b'], 0)).toEqual([['a', 'b']]);
  });
});

describe('reasonForUnresolved — reden-keuze bij definitief restant', () => {
  it('mediaserver-geen-media als discovery niets opleverde', () => {
    expect(reasonForUnresolved({ mediaCount: 0, glnCount: 0 })).toBe('mediaserver-geen-media');
  });

  it('mediaserver-geen-gln als er wél media was maar geen afleidbare GLN', () => {
    expect(reasonForUnresolved({ mediaCount: 3, glnCount: 0 })).toBe('mediaserver-geen-gln');
  });
});

describe('runReimport — dry-run doet NIETS', () => {
  it('start geen import-run, schrijft niet, pauzeert niet — toont alleen het plan', async () => {
    const deps = makeDeps({
      listRestantGtins: vi.fn().mockResolvedValue(['g1', 'g2', 'g3']),
      coverageTotals: vi.fn().mockResolvedValue({ total: 10, withGln: 4 }),
    });

    const summary = await runReimport(deps, { dryRun: true, batchSize: 2, pauseMs: 30000 });

    expect(deps.runImportBatch).not.toHaveBeenCalled();
    expect(deps.clearReason).not.toHaveBeenCalled();
    expect(deps.setReason).not.toHaveBeenCalled();
    expect(deps.sleep).not.toHaveBeenCalled();
    expect(summary.writes).toBe(0);
    expect(summary.dryRun).toBe(true);
    // Wel het plan: 3 GTINs verdeeld over 2 batches (2 + 1).
    expect(summary.gtinsProcessed).toBe(3);
    expect(summary.batches).toBe(2);
    // Dekkingsgraad: dry-run vult niets → ná == vóór.
    expect(summary.coverageBefore).toBeCloseTo(0.4, 5);
    expect(summary.coverageAfter).toBeCloseTo(0.4, 5);
  });
});

describe('runReimport — selectie: alleen het 18.1-restant', () => {
  it('verwerkt precies de GTINs die listRestantGtins levert (gln-null + gezette reden)', async () => {
    const listRestantGtins = vi.fn().mockResolvedValue(['r1', 'r2']);
    const deps = makeDeps({
      listRestantGtins,
      coverageTotals: vi.fn().mockResolvedValue({ total: 4, withGln: 2 }),
      hasGln: vi.fn().mockResolvedValue(true),
    });

    await runReimport(deps, { dryRun: false, batchSize: 25, pauseMs: 0 });

    expect(listRestantGtins).toHaveBeenCalledTimes(1);
    // De import-run wordt met exact het geselecteerde restant aangestuurd.
    expect(deps.runImportBatch).toHaveBeenCalledWith(['r1', 'r2']);
  });
});

describe('runReimport — reden-bijwerking beide paden', () => {
  it('gevuld → reden wissen; niet-gevuld → nieuwe reden (geen-gln/geen-media)', async () => {
    const deps = makeDeps({
      listRestantGtins: vi.fn().mockResolvedValue(['okGtin', 'geenGlnGtin', 'geenMediaGtin']),
      coverageTotals: vi
        .fn()
        .mockResolvedValueOnce({ total: 6, withGln: 3 }) // before
        .mockResolvedValueOnce({ total: 6, withGln: 4 }), // after
      hasGln: vi.fn(async (gtin: string) => gtin === 'okGtin'),
      discoverySignal: vi.fn(async (gtin: string) =>
        gtin === 'geenGlnGtin'
          ? { mediaCount: 2, glnCount: 0 } // media zonder GLN
          : { mediaCount: 0, glnCount: 0 } // geen media
      ),
    });

    const summary = await runReimport(deps, { dryRun: false, batchSize: 25, pauseMs: 0 });

    // Opgeloste GTIN → reden gewist.
    expect(deps.clearReason).toHaveBeenCalledTimes(1);
    expect(deps.clearReason).toHaveBeenCalledWith('okGtin');
    // Definitief restant → nieuwe redenen.
    expect(deps.setReason).toHaveBeenCalledWith('geenGlnGtin', 'mediaserver-geen-gln');
    expect(deps.setReason).toHaveBeenCalledWith('geenMediaGtin', 'mediaserver-geen-media');
    expect(summary.resolved).toBe(1);
    expect(summary.byReason['mediaserver-geen-gln']).toBe(1);
    expect(summary.byReason['mediaserver-geen-media']).toBe(1);
    // Hermeting: ná == 4/6 uit de tweede coverageTotals (niet de projectie).
    expect(summary.coverageAfter).toBeCloseTo(4 / 6, 5);
  });
});

describe('runReimport — batch-dosering + pauze-respect (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('draait één import-run per batch en pauzeert TUSSEN batches, niet na de laatste', async () => {
    const gtins = ['a', 'b', 'c', 'd', 'e']; // 3 batches bij size 2: [a,b][c,d][e]
    // Echte pauze-belofte zodat we het tussen-batch-wachten kunnen observeren.
    const sleep = vi.fn((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deps = makeDeps({
      listRestantGtins: vi.fn().mockResolvedValue(gtins),
      coverageTotals: vi.fn().mockResolvedValue({ total: 5, withGln: 5 }),
      hasGln: vi.fn().mockResolvedValue(true),
      sleep,
    });

    const promise = runReimport(deps, { dryRun: false, batchSize: 2, pauseMs: 30000 });
    // Laat de microtasks + timers volledig aflopen.
    await vi.runAllTimersAsync();
    const summary = await promise;

    // 3 batches → 3 import-runs.
    expect(deps.runImportBatch).toHaveBeenCalledTimes(3);
    expect(deps.runImportBatch).toHaveBeenNthCalledWith(1, ['a', 'b']);
    expect(deps.runImportBatch).toHaveBeenNthCalledWith(2, ['c', 'd']);
    expect(deps.runImportBatch).toHaveBeenNthCalledWith(3, ['e']);
    // Pauze TUSSEN de 3 batches = 2 keer, met het geconfigureerde interval.
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(30000);
    expect(summary.batches).toBe(3);
  });

  it('pauzeert niet als pauseMs 0 is', async () => {
    const deps = makeDeps({
      listRestantGtins: vi.fn().mockResolvedValue(['a', 'b', 'c']),
      coverageTotals: vi.fn().mockResolvedValue({ total: 3, withGln: 3 }),
      hasGln: vi.fn().mockResolvedValue(true),
    });

    await runReimport(deps, { dryRun: false, batchSize: 1, pauseMs: 0 });
    expect(deps.sleep).not.toHaveBeenCalled();
  });
});

describe('runReimport — idempotente herstart', () => {
  it('leeg restant → geen import-run, geen write, 0 GTINs', async () => {
    const deps = makeDeps({
      listRestantGtins: vi.fn().mockResolvedValue([]),
      coverageTotals: vi.fn().mockResolvedValue({ total: 4, withGln: 4 }),
    });

    const summary = await runReimport(deps, { dryRun: false, batchSize: 25, pauseMs: 30000 });

    expect(deps.runImportBatch).not.toHaveBeenCalled();
    expect(deps.clearReason).not.toHaveBeenCalled();
    expect(deps.setReason).not.toHaveBeenCalled();
    expect(summary.gtinsProcessed).toBe(0);
    expect(summary.batches).toBe(0);
    expect(summary.writes).toBe(0);
    expect(summary.coverageAfter).toBeCloseTo(1, 5);
  });
});
