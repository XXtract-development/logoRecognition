/**
 * Story 19.4 — gebalanceerde sampler + nominatie-aansluiting (defect-fix).
 *
 * AC1 (per keurmerk N gebalanceerd, door het BESTAANDE nominatie-/poortpad, nooit
 *      direct in reference_logos): balans-spreiding over GTINs; de geselecteerde
 *      GTINs lopen per klasse door het CROP-PRODUCERENDE bootstrap-pad
 *      (`searchAndNominateClass`): gids-zaad → ml-artwork-search → ECHTE crops →
 *      `nominateCandidate` met het ECHTE crop_path (herkomst bootstrap).
 * AC2 (cap bij N + overschot-telling mét reden, geen stille verliezen): selectBalanced
 *      capt bij N en telt het overschot; buildSelectionPlan aggregeert per klasse.
 * AC3 (achter de bestaande nominatie-vlag, default uit): vlag UIT = geen writes/
 *      nominaties (plan-only); vlag AAN = roept het crop-pad + de poort aan.
 *
 * DEFECT-GAT (waarom de vorige mock het miste): de oude test mockte
 * `nominateCandidate` en verifieerde `cropPath: sel.label` — precies het rauwe
 * etiketbestand dat het defect als "crop" doorgaf. Die assert bevroor het foute
 * gedrag. Deze suite mockt `nominateCandidate` NIET om het label te billijken, maar
 * laat `searchAndNominateClass` echt draaien (met gemockte ml-search + declaraties +
 * prisma) en bewijst dat `nominateCandidate` UITSLUITEND met een ECHT crop_path uit
 * de ml-search wordt aangeroepen — NOOIT met het rauwe label. Zo faalt de suite op
 * het oude gedrag (dat de ml-search nooit aanriep en het label als crop meegaf).
 *
 * `nominateCandidate` is gemockt zodat de sampler geen echte poort/DB raakt en er
 * GEEN live writes gebeuren. De vlag stuurt via process.env (geen module-mock).
 * `mlClient` + prisma zijn globaal gemockt (setup.ts); `resolveDeclarations` hier.
 * AC→test-mapping: inline hieronder + de 19.4-story Change Log.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { nominateCandidate } from '../../services/flywheel/nomination';
import { resolveDeclarations } from '../../services/t3777-declarations';
import {
  selectBalanced,
  buildSelectionPlan,
  splitKey,
  distinctGtins,
  runBalancedSampler,
  type KeurmerkIndexInput,
  type IndexLabelEntry,
  type ClassSelection,
} from '../../services/flywheel/balanced-sampler';

vi.mock('../../services/flywheel/nomination', () => ({
  nominateCandidate: vi.fn(),
}));
vi.mock('../../services/t3777-declarations', () => ({
  resolveDeclarations: vi.fn(),
}));

const mockNominate = nominateCandidate as unknown as ReturnType<typeof vi.fn>;
const mockDecl = resolveDeclarations as unknown as ReturnType<typeof vi.fn>;
const mockMl = mlClient as unknown as { bootstrapSearch: ReturnType<typeof vi.fn> };
const mockPrisma = prisma as unknown as {
  referenceLogo: { findFirst: ReturnType<typeof vi.fn> };
  artworkImport: { findFirst: ReturnType<typeof vi.fn> };
};

function entry(gtin: string, labels: string[], gln = '111'): IndexLabelEntry {
  return { gtin, gln, labels };
}

/** Bouw een minimale 19.3-index-input met één klasse-sleutel. */
function indexOf(key: string, entries: IndexLabelEntry[]): KeurmerkIndexInput {
  return { entries: { [key]: entries } };
}

/** Bouw één ml-match met een ECHT (uitgesneden) crop_path uit de artwork. */
function match(gtin: string, cropPath: string, cosine = 0.97) {
  return {
    gtin,
    bbox: { x: 1, y: 2, width: 3, height: 4 },
    seed_cosine: cosine,
    crop_path: cropPath,
    source_file: `artwork/${gtin}/converted-0.png`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_NOMINATION_ENABLED;
  delete process.env.FLYWHEEL_SAMPLE_PER_CLASS;
  delete process.env.FLYWHEEL_BOOTSTRAP_RUN_BUDGET;
  delete process.env.FLYWHEEL_BOOTSTRAP_MAX_SECONDS;

  // Gelukkig pad voor het crop-producerende bootstrap-pad:
  // - elke klasse heeft een gids-zaad (ook inactief mogelijk),
  // - elke GTIN heeft een artwork-pagina,
  // - elke GTIN declareert de code,
  // - de ml-search levert één ECHTE crop per doorzochte GTIN.
  mockPrisma.referenceLogo.findFirst.mockResolvedValue({
    storagePath: 'reference-logos/VEGAN/seed.png',
  });
  mockPrisma.artworkImport.findFirst.mockImplementation(
    ({ where }: { where: { gtin: string } }) =>
      Promise.resolve({ storagePath: `artwork/${where.gtin}/converted-0.png` })
  );
  mockDecl.mockResolvedValue({ codes: ['VEGAN'], reason: 'ok' });
  mockMl.bootstrapSearch.mockImplementation(
    ({ gtinPages }: { gtinPages: Array<{ gtin: string }> }) =>
      Promise.resolve({
        seed_path: 'reference-logos/VEGAN/seed.png',
        threshold: 0.93,
        matches: gtinPages.map((p) => match(p.gtin, `artwork-crops/${p.gtin}/crop.png`)),
        gtins_processed: gtinPages.length,
        gtins_total: gtinPages.length,
        timed_out: false,
        seed_leaks_skipped: 0,
      })
  );
  mockNominate.mockResolvedValue({ status: 'nominated', candidateId: 'c1', reused: false });
});

// ---------------------------------------------------------------------------
// PURE selectie (balans + cap/overschot) — ongewijzigd t.o.v. de 19.4-basis.
// ---------------------------------------------------------------------------

describe('Story 19.4 — selectBalanced (AC1 balans + AC2 cap/overschot)', () => {
  it('spreidt eerst één label per GTIN vóór een tweede label van een GTIN', () => {
    const entries = [
      entry('A', ['a1', 'a2', 'a3']),
      entry('B', ['b1']),
      entry('C', ['c1', 'c2']),
    ];
    // n=4: round-robin A,B,C dan A → a1,b1,c1,a2 (elk product eerst één).
    const { selected } = selectBalanced(entries, 4);
    expect(selected.map((s) => s.label)).toEqual(['a1', 'b1', 'c1', 'a2']);
    // De eerste drie komen elk van een andere GTIN (spreiding bewezen).
    expect(new Set(selected.slice(0, 3).map((s) => s.gtin))).toEqual(new Set(['A', 'B', 'C']));
  });

  it('capt bij N en telt het overschot (available - selected)', () => {
    const entries = [entry('A', ['a1', 'a2']), entry('B', ['b1', 'b2'])];
    const res = selectBalanced(entries, 2);
    expect(res.selected).toHaveLength(2);
    expect(res.available).toBe(4);
    expect(res.skippedOverCap).toBe(2); // 4 beschikbaar, 2 gekozen → 2 overschot
  });

  it('selecteert alles zonder overschot als N ≥ beschikbaar', () => {
    const entries = [entry('A', ['a1']), entry('B', ['b1'])];
    const res = selectBalanced(entries, 50);
    expect(res.selected).toHaveLength(2);
    expect(res.skippedOverCap).toBe(0);
  });

  it('N=0 selecteert niets en telt alles als overschot', () => {
    const res = selectBalanced([entry('A', ['a1', 'a2'])], 0);
    expect(res.selected).toHaveLength(0);
    expect(res.skippedOverCap).toBe(2);
  });
});

describe('Story 19.4 — buildSelectionPlan + splitKey + distinctGtins', () => {
  it('splitst de samengestelde sleutel in fieldType en code', () => {
    expect(splitKey('DietTypeCode/VEGAN')).toEqual({ fieldType: 'DietTypeCode', code: 'VEGAN' });
  });

  it('bouwt een plan per klasse met code/fieldType/overschot', () => {
    const index: KeurmerkIndexInput = {
      entries: {
        'DietTypeCode/VEGAN': [entry('A', ['a1', 'a2'])],
        'PackagingMarkedLabelAccreditationCode/BIO': [entry('B', ['b1'])],
      },
    };
    const plan = buildSelectionPlan(index, 1);
    // Sleutels alfabetisch (Diet... < Packaging...) → deterministisch.
    expect(plan.map((c) => c.key)).toEqual([
      'DietTypeCode/VEGAN',
      'PackagingMarkedLabelAccreditationCode/BIO',
    ]);
    expect(plan[0]).toMatchObject({ code: 'VEGAN', fieldType: 'DietTypeCode', skippedOverCap: 1 });
    expect(plan[1]).toMatchObject({ code: 'BIO', skippedOverCap: 0 });
  });

  it('distinctGtins levert de gebalanceerde GTINs in selectievolgorde, gededupt', () => {
    const cls: ClassSelection = {
      key: 'DietTypeCode/VEGAN',
      code: 'VEGAN',
      fieldType: 'DietTypeCode',
      selected: [
        { gtin: 'A', gln: '1', label: 'a1' },
        { gtin: 'B', gln: '1', label: 'b1' },
        { gtin: 'A', gln: '1', label: 'a2' }, // tweede label van A → geen tweede GTIN
      ],
      skippedOverCap: 0,
      available: 3,
    };
    expect(distinctGtins(cls)).toEqual(['A', 'B']);
  });
});

// ---------------------------------------------------------------------------
// AC3 — vlag-scoping (geen writes met de vlag uit / dry-run).
// ---------------------------------------------------------------------------

describe('Story 19.4 — runBalancedSampler (AC3: vlag-scoping)', () => {
  const index = indexOf('DietTypeCode/VEGAN', [entry('A', ['a1', 'a2']), entry('B', ['b1'])]);

  it('vlag UIT (default) → geen enkele nominatie/write, geen ml-search, alleen het plan', async () => {
    // FLYWHEEL_NOMINATION_ENABLED niet gezet = uit.
    const res = await runBalancedSampler(index, { n: 50 });
    expect(res.skipped).toBe(true);
    expect(res.skipReason).toBe('vlag-uit');
    expect(res.offered).toBe(0);
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(mockNominate).not.toHaveBeenCalled();
    // Het plan is wél berekend (dry-run-inzicht).
    expect(res.plan).toHaveLength(1);
    expect(res.plan[0].selected).toHaveLength(3);
  });

  it('expliciete dry-run met vlag AAN → geen writes (plan-only), geen ml-search', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    const res = await runBalancedSampler(index, { n: 50, dryRun: true });
    expect(res.skipped).toBe(false);
    expect(res.offered).toBe(0);
    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(mockNominate).not.toHaveBeenCalled();
    expect(res.plan[0].selected).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// AC1 — DEFECT-GAT: het crop-producerende pad, nooit het rauwe label als crop.
// ---------------------------------------------------------------------------

describe('Story 19.4 — vlag AAN loopt door het crop-zoekpad (defect-fix, AC1)', () => {
  const index = indexOf('DietTypeCode/VEGAN', [entry('A', ['a1', 'a2']), entry('B', ['b1'])]);

  it('roept mlClient.bootstrapSearch aan met de gebalanceerde GTINs (localisatie, geen label-crop)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    await runBalancedSampler(index, { n: 50 });

    // Het crop-zoekpad IS aangeroepen — de sampler lokaliseert nu i.p.v. het label
    // rechtstreeks te nomineren.
    expect(mockMl.bootstrapSearch).toHaveBeenCalledTimes(1);
    const searchArg = mockMl.bootstrapSearch.mock.calls[0][0];
    // De distincte, gebalanceerde GTINs (A vóór B) gaan als zoek-set mee.
    expect(searchArg.gtinPages.map((p: { gtin: string }) => p.gtin)).toEqual(['A', 'B']);
    // Het gids-zaad is het zoekinstrument.
    expect(searchArg.seedPath).toBe('reference-logos/VEGAN/seed.png');
  });

  it('nomineert UITSLUITEND ECHTE crop_paths uit de ml-search — NOOIT het rauwe label', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    await runBalancedSampler(index, { n: 50 });

    // Twee doorzochte GTINs → twee ECHTE crops → twee nominaties.
    expect(mockNominate).toHaveBeenCalledTimes(2);

    const cropPaths = mockNominate.mock.calls.map((c) => c[0].detection.cropPath);
    // Elke nominatie draagt een ECHT, uitgesneden crop_path (artwork-crops/...).
    expect(cropPaths).toEqual([
      'artwork-crops/A/crop.png',
      'artwork-crops/B/crop.png',
    ]);
    // KRITIEK (het defect): NOOIT het rauwe etiketbestand (label) als crop.
    for (const cp of cropPaths) {
      expect(cp.startsWith('artwork-crops/')).toBe(true);
      expect(['a1', 'a2', 'b1']).not.toContain(cp);
      expect(cp).not.toBe('reference-logos/VEGAN/seed.png'); // ook nooit het zaad
    }

    // Herkomst bootstrap, code als declared-bevestiging, de ECHTE cosine als confidence.
    const first = mockNominate.mock.calls[0][0];
    expect(first).toMatchObject({
      origin: 'bootstrap',
      gtin: 'A',
      declared: ['VEGAN'],
      detection: { t3777Code: 'VEGAN', method: 'embedding', confidence: 0.97 },
    });
  });

  it('respecteert de declaratie-guard: een niet-declarerende GTIN gaat niet de ml-search in', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    // GTIN A declareert VEGAN, GTIN B niet (reason ok maar code ontbreekt).
    mockDecl.mockImplementation((gtin: string) =>
      gtin === 'A'
        ? Promise.resolve({ codes: ['VEGAN'], reason: 'ok' })
        : Promise.resolve({ codes: ['OTHER'], reason: 'ok' })
    );

    await runBalancedSampler(index, { n: 50 });

    // Alleen de declarerende GTIN A komt in de ml-zoek-set.
    const searchArg = mockMl.bootstrapSearch.mock.calls[0][0];
    expect(searchArg.gtinPages.map((p: { gtin: string }) => p.gtin)).toEqual(['A']);
    // En dus alleen A's crop wordt genomineerd.
    expect(mockNominate).toHaveBeenCalledTimes(1);
    expect(mockNominate.mock.calls[0][0].gtin).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// AC1 — klasse zonder zaad wordt overgeslagen (net als bootstrap, geen nominatie).
// ---------------------------------------------------------------------------

describe('Story 19.4 — klasse zonder zaad overgeslagen (AC1)', () => {
  it('geen gids-zaad → geen ml-search, geen nominatie, klasse geteld als overgeslagen', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    mockPrisma.referenceLogo.findFirst.mockResolvedValue(null); // geen zaad

    const index = indexOf('DietTypeCode/VEGAN', [entry('A', ['a1'])]);
    const res = await runBalancedSampler(index, { n: 50 });

    expect(mockMl.bootstrapSearch).not.toHaveBeenCalled();
    expect(mockNominate).not.toHaveBeenCalled();
    expect(res.classesSkippedNoSeed).toBe(1);
    expect(res.offered).toBe(0);
    expect(res.outcomes).toEqual({ nominated: 0, skipped: 0, refused: 0 });
    // Het plan blijft berekend (transparantie), enkel de nominatie is overgeslagen.
    expect(res.plan[0].selected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC2 — cap + overschot-telling blijven gelden in de run (NFR-5).
// ---------------------------------------------------------------------------

describe('Story 19.4 — cap + overschot in de run (AC2, NFR-5)', () => {
  it('rapporteert het totale overschot over klassen met de cap actief', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    const index: KeurmerkIndexInput = {
      entries: {
        'DietTypeCode/VEGAN': [entry('A', ['a1', 'a2', 'a3'])], // 3 beschikbaar, 1 GTIN
        'PackagingMarkedLabelAccreditationCode/BIO': [entry('B', ['b1', 'b2'])], // 2 beschikbaar
      },
    };
    // Zaad voor beide codes.
    mockPrisma.referenceLogo.findFirst.mockResolvedValue({
      storagePath: 'reference-logos/X/seed.png',
    });
    // Beide GTINs declareren de code van hun eigen klasse (A→VEGAN, B→BIO).
    mockDecl.mockImplementation((gtin: string) =>
      gtin === 'A'
        ? Promise.resolve({ codes: ['VEGAN'], reason: 'ok' })
        : Promise.resolve({ codes: ['BIO'], reason: 'ok' })
    );
    const res = await runBalancedSampler(index, { n: 1 });
    // Per klasse 1 label gekozen → 2 + 1 = 3 overschot.
    expect(res.totalSkippedOverCap).toBe(3);
    expect(res.plan.find((c) => c.code === 'VEGAN')!.skippedOverCap).toBe(2);
    expect(res.plan.find((c) => c.code === 'BIO')!.skippedOverCap).toBe(1);
    // Elk plan koos 1 label → 1 distincte GTIN per klasse → 2 GTINs het crop-pad in.
    expect(res.offered).toBe(2);
    expect(mockMl.bootstrapSearch).toHaveBeenCalledTimes(2);
  });

  it('poort-uitkomsten (skipped/refused) worden geteld, niet als nominatie', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    // Drie GTINs → drie crops; de poort geeft per crop een andere uitkomst.
    mockNominate
      .mockResolvedValueOnce({ status: 'nominated', candidateId: 'c1', reused: false })
      .mockResolvedValueOnce({ status: 'skipped', reason: 'reeds-genomineerd' })
      .mockResolvedValueOnce({ status: 'refused', reason: 'phash-onbereikbaar' });
    const index = indexOf('DietTypeCode/VEGAN', [
      entry('A', ['a1']),
      entry('B', ['b1']),
      entry('C', ['c1']),
    ]);
    const res = await runBalancedSampler(index, { n: 50 });
    expect(res.outcomes).toEqual({ nominated: 1, skipped: 1, refused: 1 });
  });
});
