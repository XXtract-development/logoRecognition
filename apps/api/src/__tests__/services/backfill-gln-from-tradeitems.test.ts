/**
 * Story 18.1 — GLN-backfill-script (AC2, FR-21, AD-7).
 *
 * Tests op de PURE kern + de orkestratie met VOLLEDIG gemockte deps (Mongo/prisma/
 * redis nooit echt aangeroepen — geen prod, geen ACC). Gedekt:
 *   - `_id`-parse `{gln}-{gtin}-{tm}` incl. randgevallen (GLN met koppelteken),
 *   - uitvalreden-toekenning (geen-tradeitem / meerdere-glns, niet gokken),
 *   - nooit-overschrijven-regel (alleen `gln IS NULL`-rijen),
 *   - idempotentie (tweede run zonder nieuwe null-GTINs = 0 writes),
 *   - dry-run schrijft NIETS (0 prisma-updates, 0 preloads),
 *   - dekkingsgraad-projectie vóór/ná.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseGlnFromId,
  decideOutcome,
  summarize,
  runBackfill,
  type BackfillDeps,
  type GtinOutcome,
} from '../../../scripts/backfill-gln-from-tradeitems';

const TM = '528';

/** Bouw een deps-object met spy-mocks; overrides per test. */
function makeDeps(overrides: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    listNullGlnGtins: vi.fn().mockResolvedValue([]),
    coverageTotals: vi.fn().mockResolvedValue({ total: 0, withGln: 0 }),
    lookupGlns: vi.fn().mockResolvedValue([]),
    fillGln: vi.fn().mockResolvedValue(1),
    markReason: vi.fn().mockResolvedValue(1),
    preload: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('parseGlnFromId — _id-parse {gln}-{gtin}-{tm}', () => {
  it('haalt de GLN uit een standaard-id', () => {
    expect(parseGlnFromId('8710400000006-08718989912451-528', '08718989912451', TM)).toBe(
      '8710400000006'
    );
  });

  it('ankert op het -{gtin}-{tm}-achtervoegsel, ook bij een GLN met koppelteken', () => {
    // Onwaarschijnlijk maar veilig: naïef splitsen op "-" zou hier breken.
    expect(parseGlnFromId('87-104-00000006-08718989912451-528', '08718989912451', TM)).toBe(
      '87-104-00000006'
    );
  });

  it('geeft null bij een verkeerde targetMarket', () => {
    expect(parseGlnFromId('8710400000006-08718989912451-826', '08718989912451', TM)).toBeNull();
  });

  it('geeft null bij een verkeerde gtin', () => {
    expect(parseGlnFromId('8710400000006-99999999999999-528', '08718989912451', TM)).toBeNull();
  });

  it('geeft null bij een lege GLN-prefix', () => {
    expect(parseGlnFromId('-08718989912451-528', '08718989912451', TM)).toBeNull();
  });
});

describe('decideOutcome — uitvalreden-toekenning', () => {
  it('vulbaar bij precies één GLN', () => {
    expect(decideOutcome('g1', ['8710400000006'])).toEqual({
      gtin: 'g1',
      kind: 'vulbaar',
      gln: '8710400000006',
    });
  });

  it('geen-tradeitem bij nul kandidaten', () => {
    expect(decideOutcome('g1', [])).toEqual({ gtin: 'g1', kind: 'uitval', reason: 'geen-tradeitem' });
  });

  it('meerdere-glns bij >1 DISTINCTE GLN (niet gokken)', () => {
    expect(decideOutcome('g1', ['8710400000006', '8710400000013'])).toEqual({
      gtin: 'g1',
      kind: 'uitval',
      reason: 'meerdere-glns',
    });
  });

  it('behandelt duplicaten van dezelfde GLN als vulbaar (geen valse meerdere-glns)', () => {
    expect(decideOutcome('g1', ['8710400000006', '8710400000006'])).toEqual({
      gtin: 'g1',
      kind: 'vulbaar',
      gln: '8710400000006',
    });
  });
});

describe('summarize — projectie dekkingsgraad + telling', () => {
  it('telt vulbaar/uitval en projecteert de dekkingsgraad', () => {
    const outcomes: GtinOutcome[] = [
      { gtin: 'a', kind: 'vulbaar', gln: 'x' },
      { gtin: 'b', kind: 'vulbaar', gln: 'y' },
      { gtin: 'c', kind: 'uitval', reason: 'geen-tradeitem' },
    ];
    const s = summarize(outcomes, { total: 10, withGlnBefore: 5 }, true);
    expect(s.fillable).toBe(2);
    expect(s.byReason['geen-tradeitem']).toBe(1);
    expect(s.coverageBefore).toBeCloseTo(0.5, 5);
    expect(s.coverageAfter).toBeCloseTo(0.7, 5); // (5+2)/10
  });

  it('geeft null-dekkingsgraad bij een lege tabel', () => {
    const s = summarize([], { total: 0, withGlnBefore: 0 }, true);
    expect(s.coverageBefore).toBeNull();
    expect(s.coverageAfter).toBeNull();
  });
});

describe('runBackfill — dry-run schrijft NIETS', () => {
  it('roept geen fillGln/markReason/preload aan en rapporteert 0 writes/preloads', async () => {
    const deps = makeDeps({
      listNullGlnGtins: vi.fn().mockResolvedValue(['gA', 'gB']),
      coverageTotals: vi.fn().mockResolvedValue({ total: 10, withGln: 4 }),
      lookupGlns: vi.fn(async (gtin: string) => (gtin === 'gA' ? ['8710400000006'] : [])),
    });

    const summary = await runBackfill(deps, { dryRun: true, skipPreload: false });

    // GEEN enkele write of preload in dry-run.
    expect(deps.fillGln).not.toHaveBeenCalled();
    expect(deps.markReason).not.toHaveBeenCalled();
    expect(deps.preload).not.toHaveBeenCalled();
    expect(summary.writes).toBe(0);
    expect(summary.preloaded).toBe(0);
    expect(summary.dryRun).toBe(true);
    // Wel het plan: gA vulbaar, gB geen-tradeitem.
    expect(summary.fillable).toBe(1);
    expect(summary.byReason['geen-tradeitem']).toBe(1);
    // Projectie: (4+1)/10 = 0,5.
    expect(summary.coverageAfter).toBeCloseTo(0.5, 5);
  });
});

describe('runBackfill — apply schrijft alleen gln-null-rijen + preload', () => {
  it('vult vulbare GTINs, markeert uitval, warmt declaraties', async () => {
    const deps = makeDeps({
      listNullGlnGtins: vi.fn().mockResolvedValue(['gA', 'gB', 'gC']),
      // coverageTotals: eerst before, dan after.
      coverageTotals: vi
        .fn()
        .mockResolvedValueOnce({ total: 4, withGln: 1 })
        .mockResolvedValueOnce({ total: 4, withGln: 2 }),
      lookupGlns: vi.fn(async (gtin: string) => {
        if (gtin === 'gA') return ['8710400000006'];
        if (gtin === 'gB') return []; // geen-tradeitem
        return ['8710400000006', '8710400000013']; // gC: meerdere-glns
      }),
    });

    const summary = await runBackfill(deps, { dryRun: false, skipPreload: false });

    // Alleen gA is vulbaar → fillGln met (gtin, gln).
    expect(deps.fillGln).toHaveBeenCalledTimes(1);
    expect(deps.fillGln).toHaveBeenCalledWith('gA', '8710400000006');
    // gB + gC krijgen een uitvalreden.
    expect(deps.markReason).toHaveBeenCalledWith('gB', 'geen-tradeitem');
    expect(deps.markReason).toHaveBeenCalledWith('gC', 'meerdere-glns');
    // Preload alleen voor de gevulde GTIN.
    expect(deps.preload).toHaveBeenCalledTimes(1);
    expect(deps.preload).toHaveBeenCalledWith('gA');
    expect(summary.preloaded).toBe(1);
    // coverageAfter komt uit de HERMETING, niet de projectie.
    expect(summary.coverageAfter).toBeCloseTo(0.5, 5);
  });

  it('respecteert --skip-preload (geen preload-aanroep)', async () => {
    const deps = makeDeps({
      listNullGlnGtins: vi.fn().mockResolvedValue(['gA']),
      coverageTotals: vi.fn().mockResolvedValue({ total: 2, withGln: 1 }),
      lookupGlns: vi.fn().mockResolvedValue(['8710400000006']),
    });

    const summary = await runBackfill(deps, { dryRun: false, skipPreload: true });
    expect(deps.fillGln).toHaveBeenCalledTimes(1);
    expect(deps.preload).not.toHaveBeenCalled();
    expect(summary.preloaded).toBe(0);
  });

  it('is idempotent: zonder null-GLN-GTINs gebeurt er niets (0 writes)', async () => {
    const deps = makeDeps({
      listNullGlnGtins: vi.fn().mockResolvedValue([]), // tweede run: niks meer null
      coverageTotals: vi.fn().mockResolvedValue({ total: 4, withGln: 4 }),
    });

    const summary = await runBackfill(deps, { dryRun: false, skipPreload: false });
    expect(deps.lookupGlns).not.toHaveBeenCalled();
    expect(deps.fillGln).not.toHaveBeenCalled();
    expect(deps.markReason).not.toHaveBeenCalled();
    expect(summary.writes).toBe(0);
    expect(summary.gtinsProcessed).toBe(0);
    expect(summary.coverageAfter).toBeCloseTo(1, 5);
  });
});
