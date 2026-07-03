/**
 * Story 14.2 — gold-set-samenstellingsbewaking (gold-set-composition.ts).
 *
 * Dekt:
 *  - AC1: omvang, ECHT/VALS-verdeling, top-5 meest/minst vertegenwoordigde klassen.
 *  - AC2: scheefgroei-signalen (klasse >20%; ECHT-aandeel buiten 60–90%) uit env-drempels.
 *  - AC3: `findClassesWithoutGoldSetCoverage` — dekkings-check (niet-blokkerend elders).
 *  - AC4: `getGoldSetComposition` berekent on-read via de ENE 13.3-resolver (AD-4);
 *         vervangen records (replacedById gezet) doen niet mee.
 *  - Randgevallen: lege set (geen deling door nul, expliciet 'set-leeg'-signaal),
 *    één klasse, grens-inclusiviteit (klasse exact op 20%, ECHT exact 60%/90%).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock de ENE actieve-set-resolver (AD-4) — de sub-service resolvet nooit zelf.
const getActiveGoldSet = vi.fn();
vi.mock('../../services/flywheel/gold-set', () => ({
  getActiveGoldSet: (...a: unknown[]) => getActiveGoldSet(...a),
}));

import {
  computeGoldSetComposition,
  getGoldSetComposition,
  findClassesWithoutGoldSetCoverage,
} from '../../services/flywheel/gold-set-composition';

/** Standaard-drempels (env-defaults) voor de pure-functie-tests. */
const T = { classShareMax: 0.2, echtMin: 0.6, echtMax: 0.9 };

/** Helper: n records van (label, klasse). */
function rec(label: string, t3777Code: string) {
  return { label, t3777Code };
}

describe('Story 14.2 — computeGoldSetComposition (pure, AC1/AC2)', () => {
  it('AC1: berekent omvang, ECHT/VALS-verdeling en ratio', () => {
    const records = [
      rec('ECHT', 'A'),
      rec('ECHT', 'A'),
      rec('ECHT', 'B'),
      rec('VALS', 'B'),
    ];
    const c = computeGoldSetComposition(records, T);
    expect(c.size).toBe(4);
    expect(c.labelDistribution.echt).toBe(3);
    expect(c.labelDistribution.vals).toBe(1);
    expect(c.labelDistribution.other).toBe(0);
    expect(c.labelDistribution.echtRatio).toBeCloseTo(0.75, 5);
  });

  it('AC1: top-5 meest en minst vertegenwoordigde klassen (aflopend/oplopend, deterministisch)', () => {
    // 3xA, 2xB, 1xC, 1xD, 1xE, 1xF → top: A,B dan alfabetisch; bottom: alfabetisch bij gelijk.
    const records = [
      ...Array(3).fill(0).map(() => rec('ECHT', 'A')),
      ...Array(2).fill(0).map(() => rec('ECHT', 'B')),
      rec('ECHT', 'C'),
      rec('ECHT', 'D'),
      rec('ECHT', 'E'),
      rec('VALS', 'F'),
    ];
    const c = computeGoldSetComposition(records, T);
    expect(c.classCount).toBe(6);
    expect(c.topClasses.map((x) => x.t3777Code)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(c.topClasses[0].count).toBe(3);
    expect(c.bottomClasses.map((x) => x.t3777Code)).toEqual(['C', 'D', 'E', 'F', 'B']);
    expect(c.bottomClasses[0].count).toBe(1);
  });

  it('AC1: shares tellen op tot 1 en zijn correct per klasse', () => {
    const records = [rec('ECHT', 'A'), rec('ECHT', 'A'), rec('VALS', 'B'), rec('VALS', 'B')];
    const c = computeGoldSetComposition(records, T);
    const a = c.topClasses.find((x) => x.t3777Code === 'A')!;
    expect(a.share).toBeCloseTo(0.5, 5);
  });

  it('AC2: klasse boven de share-max levert een scheefgroei-signaal', () => {
    // A = 3/5 = 60% > 20% → signaal; B = 2/5 = 40% > 20% → signaal.
    const records = [
      rec('ECHT', 'A'),
      rec('ECHT', 'A'),
      rec('ECHT', 'A'),
      rec('VALS', 'B'),
      rec('VALS', 'B'),
    ];
    const c = computeGoldSetComposition(records, T);
    const klasseSignals = c.skewSignals.filter((s) => s.type === 'klasse-oververtegenwoordigd');
    expect(klasseSignals.map((s) => s.klasse).sort()).toEqual(['A', 'B']);
    expect(klasseSignals.find((s) => s.klasse === 'A')!.waarde).toBeCloseTo(0.6, 5);
    expect(klasseSignals.find((s) => s.klasse === 'A')!.drempel).toBe(0.2);
  });

  it('AC2: klasse EXACT op de share-max is nog gezond (grens inclusief, > is de test)', () => {
    // 5 records, A = 1 → 20% exact. Geen enkele klasse > 20% (rest verspreid).
    const records = [
      rec('ECHT', 'A'),
      rec('ECHT', 'B'),
      rec('ECHT', 'C'),
      rec('ECHT', 'D'),
      rec('VALS', 'E'),
    ];
    const c = computeGoldSetComposition(records, T);
    expect(c.skewSignals.filter((s) => s.type === 'klasse-oververtegenwoordigd')).toHaveLength(0);
  });

  it('AC2: ECHT-aandeel onder de ondergrens levert een band-signaal', () => {
    // 5 records, 2 ECHT → 40% < 60%.
    const records = [
      rec('ECHT', 'A'),
      rec('ECHT', 'B'),
      rec('VALS', 'C'),
      rec('VALS', 'D'),
      rec('VALS', 'E'),
    ];
    const c = computeGoldSetComposition(records, T);
    const band = c.skewSignals.find((s) => s.type === 'echt-aandeel-buiten-band')!;
    expect(band).toBeDefined();
    expect(band.waarde).toBeCloseTo(0.4, 5);
    expect(band.drempel).toBe(0.6);
  });

  it('AC2: ECHT-aandeel boven de bovengrens levert een band-signaal met de max-drempel', () => {
    // 10 records, 10 ECHT → 100% > 90%. Klassen verspreid zodat er geen klasse-signaal is.
    const records = Array(10)
      .fill(0)
      .map((_, i) => rec('ECHT', `C${i}`));
    const c = computeGoldSetComposition(records, T);
    const band = c.skewSignals.find((s) => s.type === 'echt-aandeel-buiten-band')!;
    expect(band).toBeDefined();
    expect(band.waarde).toBeCloseTo(1, 5);
    expect(band.drempel).toBe(0.9);
  });

  it('AC2: ECHT-aandeel EXACT op 60% en op 90% is nog gezond (grenzen inclusief)', () => {
    // 10 records, 6 ECHT → 60% exact. Klassen verspreid (geen klasse-signaal).
    const at60 = [
      ...Array(6).fill(0).map((_, i) => rec('ECHT', `E${i}`)),
      ...Array(4).fill(0).map((_, i) => rec('VALS', `V${i}`)),
    ];
    expect(
      computeGoldSetComposition(at60, T).skewSignals.filter(
        (s) => s.type === 'echt-aandeel-buiten-band'
      )
    ).toHaveLength(0);

    // 10 records, 9 ECHT → 90% exact.
    const at90 = [
      ...Array(9).fill(0).map((_, i) => rec('ECHT', `E${i}`)),
      rec('VALS', 'V0'),
    ];
    expect(
      computeGoldSetComposition(at90, T).skewSignals.filter(
        (s) => s.type === 'echt-aandeel-buiten-band'
      )
    ).toHaveLength(0);
  });

  it('randgeval: lege set → geen crash, geen deling door nul, expliciet set-leeg-signaal', () => {
    const c = computeGoldSetComposition([], T);
    expect(c.size).toBe(0);
    expect(c.labelDistribution.echtRatio).toBe(0);
    expect(c.classCount).toBe(0);
    expect(c.topClasses).toEqual([]);
    expect(c.bottomClasses).toEqual([]);
    expect(c.skewSignals).toEqual([{ type: 'set-leeg', waarde: 0, drempel: 0 }]);
  });

  it('randgeval: één klasse die 100% beslaat → klasse-signaal, top==bottom', () => {
    const records = [rec('ECHT', 'A'), rec('ECHT', 'A'), rec('ECHT', 'A')];
    const c = computeGoldSetComposition(records, T);
    expect(c.classCount).toBe(1);
    expect(c.topClasses).toHaveLength(1);
    expect(c.bottomClasses).toHaveLength(1);
    expect(c.skewSignals.some((s) => s.type === 'klasse-oververtegenwoordigd' && s.klasse === 'A')).toBe(
      true
    );
  });

  it('drempels komen uit de meegegeven config (geen hardcode)', () => {
    // Met een ruime share-max (0.99) is 60%-klasse niet meer scheef.
    const records = [rec('ECHT', 'A'), rec('ECHT', 'A'), rec('ECHT', 'A'), rec('VALS', 'B'), rec('VALS', 'B')];
    const c = computeGoldSetComposition(records, { classShareMax: 0.99, echtMin: 0, echtMax: 1 });
    expect(c.skewSignals).toHaveLength(0);
    expect(c.thresholds).toEqual({ classShareMax: 0.99, echtMin: 0, echtMax: 1 });
  });
});

describe('Story 14.2 — getGoldSetComposition (on-read, AC4)', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FLYWHEEL_GOLDSET_CLASS_SHARE_MAX;
    delete process.env.FLYWHEEL_GOLDSET_ECHT_MIN;
    delete process.env.FLYWHEEL_GOLDSET_ECHT_MAX;
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('AC4: resolvet on-read via getActiveGoldSet (de ENE resolver, AD-4)', async () => {
    getActiveGoldSet.mockResolvedValue([
      rec('ECHT', 'A'),
      rec('ECHT', 'A'),
      rec('VALS', 'B'),
    ]);
    const c = await getGoldSetComposition();
    expect(getActiveGoldSet).toHaveBeenCalledTimes(1);
    // Bewust de VOLLEDIGE set (geen cropOnly): geen argument dat crop filtert.
    expect(getActiveGoldSet).toHaveBeenCalledWith();
    expect(c.size).toBe(3);
    expect(c.labelDistribution.echt).toBe(2);
  });

  it('AC4: gebruikt env-drempels (scheef bij strengere env-config)', async () => {
    process.env.FLYWHEEL_GOLDSET_ECHT_MIN = '0.8';
    getActiveGoldSet.mockResolvedValue([rec('ECHT', 'A'), rec('VALS', 'B')]); // 50% ECHT
    const c = await getGoldSetComposition();
    expect(c.skewSignals.some((s) => s.type === 'echt-aandeel-buiten-band')).toBe(true);
    expect(c.thresholds.echtMin).toBe(0.8);
  });
});

describe('Story 14.2 — findClassesWithoutGoldSetCoverage (AC3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AC3: retourneert de batch-klassen zonder enige actieve gold-set-dekking', async () => {
    getActiveGoldSet.mockResolvedValue([rec('ECHT', 'A'), rec('VALS', 'B')]);
    const missing = await findClassesWithoutGoldSetCoverage(['A', 'B', 'C', 'D']);
    expect(missing).toEqual(['C', 'D']);
  });

  it('AC3: alle klassen gedekt → lege lijst', async () => {
    getActiveGoldSet.mockResolvedValue([rec('ECHT', 'A'), rec('VALS', 'B')]);
    expect(await findClassesWithoutGoldSetCoverage(['A', 'B'])).toEqual([]);
  });

  it('AC3: lege input vraagt de resolver niet en geeft lege lijst', async () => {
    expect(await findClassesWithoutGoldSetCoverage([])).toEqual([]);
    expect(getActiveGoldSet).not.toHaveBeenCalled();
  });

  it('AC3: dedupliceert dubbele batch-klassen', async () => {
    getActiveGoldSet.mockResolvedValue([rec('ECHT', 'A')]);
    expect(await findClassesWithoutGoldSetCoverage(['B', 'B', 'A', 'A'])).toEqual(['B']);
  });
});
