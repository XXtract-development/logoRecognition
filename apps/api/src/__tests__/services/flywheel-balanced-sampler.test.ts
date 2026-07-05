/**
 * Story 19.4 — gebalanceerde sampler + nominatie-aansluiting.
 *
 * AC1 (per keurmerk N gebalanceerd, door het BESTAANDE nominatie-/poortpad, nooit
 *      direct in reference_logos): balans-spreiding over GTINs + aanbieden aan
 *      `nominateCandidate` (herkomst bootstrap, code als declared-bevestiging).
 * AC2 (cap bij N + overschot-telling mét reden, geen stille verliezen): selectBalanced
 *      capt bij N en telt het overschot; buildSelectionPlan aggregeert per klasse.
 * AC3 (achter de bestaande nominatie-vlag, default uit): vlag UIT = geen writes/
 *      nominaties (plan-only); vlag AAN = roept de poort aan.
 *
 * `nominateCandidate` is gemockt zodat de sampler geen echte poort/DB/ml raakt en
 * er GEEN live writes gebeuren. De vlag stuurt via process.env (geen module-mock).
 * AC→test-mapping: _bmad-output/implementation-artifacts/ac-trace-19-4.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nominateCandidate } from '../../services/flywheel/nomination';
import {
  selectBalanced,
  buildSelectionPlan,
  splitKey,
  runBalancedSampler,
  type KeurmerkIndexInput,
  type IndexLabelEntry,
} from '../../services/flywheel/balanced-sampler';

vi.mock('../../services/flywheel/nomination', () => ({
  nominateCandidate: vi.fn(),
}));

const mockNominate = nominateCandidate as unknown as ReturnType<typeof vi.fn>;

function entry(gtin: string, labels: string[], gln = '111'): IndexLabelEntry {
  return { gtin, gln, labels };
}

/** Bouw een minimale 19.3-index-input met één klasse-sleutel. */
function indexOf(key: string, entries: IndexLabelEntry[]): KeurmerkIndexInput {
  return { entries: { [key]: entries } };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_NOMINATION_ENABLED;
  delete process.env.FLYWHEEL_SAMPLE_PER_CLASS;
  mockNominate.mockResolvedValue({ status: 'nominated', candidateId: 'c1', reused: false });
});

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

describe('Story 19.4 — buildSelectionPlan + splitKey', () => {
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
});

describe('Story 19.4 — runBalancedSampler (AC3: vlag-scoping)', () => {
  const index = indexOf('DietTypeCode/VEGAN', [entry('A', ['a1', 'a2']), entry('B', ['b1'])]);

  it('vlag UIT (default) → geen enkele nominatie/write, alleen het plan', async () => {
    // FLYWHEEL_NOMINATION_ENABLED niet gezet = uit.
    const res = await runBalancedSampler(index, { n: 50 });
    expect(res.skipped).toBe(true);
    expect(res.skipReason).toBe('vlag-uit');
    expect(res.offered).toBe(0);
    expect(mockNominate).not.toHaveBeenCalled();
    // Het plan is wél berekend (dry-run-inzicht).
    expect(res.plan).toHaveLength(1);
    expect(res.plan[0].selected).toHaveLength(3);
  });

  it('vlag AAN → biedt elk geselecteerd label aan de bestaande poort aan (herkomst bootstrap)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    const res = await runBalancedSampler(index, { n: 50 });
    expect(res.skipped).toBe(false);
    expect(res.offered).toBe(3); // a1, a2, b1
    expect(mockNominate).toHaveBeenCalledTimes(3);
    // De code gaat als declared-bevestiging mee; herkomst = bootstrap (bestaande poort).
    const firstCall = mockNominate.mock.calls[0][0];
    expect(firstCall).toMatchObject({
      origin: 'bootstrap',
      declared: ['VEGAN'],
      detection: { t3777Code: 'VEGAN', cropPath: 'a1' },
    });
    expect(res.outcomes.nominated).toBe(3);
  });

  it('expliciete dry-run met vlag AAN → geen writes (plan-only)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    const res = await runBalancedSampler(index, { n: 50, dryRun: true });
    expect(res.skipped).toBe(false);
    expect(res.offered).toBe(0);
    expect(mockNominate).not.toHaveBeenCalled();
    expect(res.plan[0].selected).toHaveLength(3);
  });
});

describe('Story 19.4 — cap + overschot in de run (AC2, NFR-5)', () => {
  it('rapporteert het totale overschot over klassen met de cap actief', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    const index: KeurmerkIndexInput = {
      entries: {
        'DietTypeCode/VEGAN': [entry('A', ['a1', 'a2', 'a3'])], // 3 beschikbaar
        'PackagingMarkedLabelAccreditationCode/BIO': [entry('B', ['b1', 'b2'])], // 2 beschikbaar
      },
    };
    const res = await runBalancedSampler(index, { n: 1 });
    // Per klasse 1 gekozen → 2 + 1 = 3 overschot; 2 aangeboden.
    expect(res.offered).toBe(2);
    expect(res.totalSkippedOverCap).toBe(3);
    expect(res.plan.find((c) => c.code === 'VEGAN')!.skippedOverCap).toBe(2);
    expect(res.plan.find((c) => c.code === 'BIO')!.skippedOverCap).toBe(1);
  });

  it('poort-uitkomsten (skipped/refused) worden geteld, niet als nominatie', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    mockNominate
      .mockResolvedValueOnce({ status: 'nominated', candidateId: 'c1', reused: false })
      .mockResolvedValueOnce({ status: 'skipped', reason: 'reeds-genomineerd' })
      .mockResolvedValueOnce({ status: 'refused', reason: 'phash-onbereikbaar' });
    const index = indexOf('DietTypeCode/VEGAN', [entry('A', ['a1', 'a2', 'a3'])]);
    const res = await runBalancedSampler(index, { n: 50 });
    expect(res.outcomes).toEqual({ nominated: 1, skipped: 1, refused: 1 });
  });
});
