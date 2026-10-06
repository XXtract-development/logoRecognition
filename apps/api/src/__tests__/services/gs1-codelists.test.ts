/**
 * Verhaal 1.6 — Codes tegen de GS1-lijst (FR-12, AD-10, AR-1). ATDD: geschreven vóór de implementatie.
 * De CI toetst tegen het gecommitte afgeleide bestand, niet tegen de xlsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import codelists from '../../services/gs1-codelists/gs1-codelists-3.1.37.1.json';
import {
  GS1_RELEASE,
  GS1_SOURCE_SHA256,
  GS1_FIELD_LISTS,
  getCodelist,
  isValidGs1Value,
} from '../../services/gs1-codelists';
import { getGs1Mapping, findGs1Entry } from '../../services/gs1-mapping';
import { aliasT3777Code } from '../../services/t3777-aliases';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../core/db', () => ({ default: {} }));
vi.mock('../../core/logger', () => ({
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildLogoResults } from '../../services/pipeline/gs1-block';

const entries = getGs1Mapping().entries;

describe('AC1 — vastgepinde lijst met versienummer en hash', () => {
  it('bestand draagt release, bronhash, tijdstip en alleen codewaarden', () => {
    expect(codelists.release).toBe('3.1.37.1');
    expect(codelists.bronSha256).toBe('16151350f71a47be2c6b65f6c370752c05cfbe4f3198feb6558ba507aa0f562e');
    expect(codelists.gegenereerdOp).toMatch(/^\d{4}-\d{2}-\d{2}/);
    for (const lijst of Object.values(codelists.lijsten) as unknown[]) {
      expect(Array.isArray(lijst)).toBe(true);
      for (const c of lijst as unknown[]) expect(typeof c).toBe('string'); // geen omschrijvingen
    }
  });
  it('aantallen komen overeen met de release', () => {
    const n = (k: string) => (codelists.lijsten as Record<string, string[]>)[k].length;
    expect(n('PackagingMarkedLabelAccreditationCode')).toBe(919);
    expect(n('DietTypeCode')).toBe(35);
    expect(n('GHSSymbolDescriptionCode')).toBe(10);
    expect(n('EU_consumerUsageLabelCodeList')).toBe(20);
    expect(n('NutritionalProgramCode')).toBe(10);
    for (const k of Object.keys(codelists.lijsten)) {
      const l = (codelists.lijsten as Record<string, string[]>)[k];
      expect(new Set(l).size).toBe(l.length);
    }
  });
  it('de runtimeconstanten verwijzen naar dezelfde release en hash', () => {
    expect(GS1_RELEASE).toBe(codelists.release);
    expect(GS1_SOURCE_SHA256).toBe(codelists.bronSha256);
  });
  it('Nutri-Score-waarden staan als aparte constante met bronverwijzing', () => {
    expect(codelists.nutritionalScore.waarden).toEqual(['A', 'B', 'C', 'D', 'E', 'EXEMPT']);
    expect(codelists.nutritionalScore.bron).toMatch(/Attributen rij 411/);
    expect(codelists.nutritionalScore.bron).toMatch(/NutritionalProgramCode rij 4963/);
    expect(getCodelist('NutritionalProgramCode')).toContain('8');
  });
});

describe('AC1 — elke niet-uit-regel heeft alleen geldige GS1-waarden', () => {
  it('geen enkele waarde van een actieve regel wijkt af van de lijst', () => {
    const afwijkend: string[] = [];
    for (const e of entries.filter((x) => x.opnamestand !== 'uit')) {
      for (const g of e.gs1) if (!isValidGs1Value(g.veld, g.waarde)) afwijkend.push(`${e.soort}:${g.veld}=${g.waarde}`);
    }
    expect(afwijkend).toEqual([]);
  });
  it('elk veld in de tabel heeft een bekende lijst (geen stil overslaan)', () => {
    for (const e of entries) for (const g of e.gs1) {
      if (g.veld === 'isDietTypeMarkedOnPackage') continue;
      expect(GS1_FIELD_LISTS, g.veld).toHaveProperty(g.veld);
    }
  });
  it('de controle slaat aan bij een afwijking (negatieve test)', () => {
    expect(isValidGs1Value('packagingMarkedLabelAccreditationCode', 'NOT_A_REAL_CODE')).toBe(false);
    expect(isValidGs1Value('gHSSymbolDescriptionCode', 'GHS02')).toBe(false);
    expect(isValidGs1Value('nutritionalScore', 'NUTRISCORE_A')).toBe(false);
    expect(isValidGs1Value('nutritionalScore', 'F')).toBe(false);
    expect(isValidGs1Value('onbekendVeld', 'x')).toBe(false);
  });
  it('uit-regels zonder reden vallen op (beleid) en elke uit-regel heeft een reden', () => {
    for (const e of entries.filter((x) => x.opnamestand === 'uit')) expect(e.reden, e.soort).toBeTruthy();
  });
});

describe('Aanvullend — dekking van de lijsten', () => {
  it('EXEMPT is een geldige nutritionalScore', () => {
    expect(isValidGs1Value('nutritionalScore', 'EXEMPT')).toBe(true);
  });
  it('elke enumerationValue-regel hoort bij de gebruikslabel-lijst', () => {
    const regels = entries.flatMap((e) => e.gs1).filter((g) => g.veld === 'enumerationValue');
    expect(regels.length).toBe(20);
    for (const g of regels) expect(getCodelist('EU_consumerUsageLabelCodeList')).toContain(g.waarde);
  });
  it('GHS: 9 symbolen gemapt, NO_PICTOGRAM bewust niet (uitgesloten, geen symbool)', () => {
    const gemapt = entries.flatMap((e) => e.gs1).filter((g) => g.veld === 'gHSSymbolDescriptionCode').map((g) => g.waarde);
    expect(new Set(gemapt).size).toBe(9);
    expect(gemapt).not.toContain('NO_PICTOGRAM');
    expect(getCodelist('GHSSymbolDescriptionCode')).toContain('NO_PICTOGRAM');
  });
});

describe('AC2 — de 52 afwijkende keurmerkcodes staan op uit', () => {
  const bron = JSON.parse(
    readFileSync(resolve(__dirname, '../../../scripts/gs1-mapping-sources/gs1-not-in-codelist-31371.json'), 'utf8'),
  ).codes as string[];
  it('er zijn er 52, ze staan niet in de GS1-lijst en staan op uit met reden', () => {
    expect(bron).toHaveLength(52);
    for (const c of bron) {
      expect(isValidGs1Value('packagingMarkedLabelAccreditationCode', c), c).toBe(false);
      const e = entries.find((x) => x.soort === c)!;
      expect(e, c).toBeTruthy();
      expect(e.opnamestand, c).toBe('uit');
      expect(e.reden, c).toMatch(/GS1/);
    }
    for (const c of ['CMA', 'ELVI', 'HALAL_AHF']) expect(bron).toContain(c);
  });
});

describe('AC3 — omzetting en aliassen', () => {
  const waarden = (soort: string) => findGs1Entry(soort)!.gs1.map((g) => g.waarde);
  it('NUTRISCORE_A..E worden A..E', () => {
    for (const l of ['A', 'B', 'C', 'D', 'E']) expect(findGs1Entry(`NUTRISCORE_${l}`)!.gs1.find((g) => g.veld === 'nutritionalScore')!.waarde).toBe(l);
  });
  it('GHS02 wordt FLAME en elk GHS-symbool is een GS1-waarde', () => {
    expect(waarden('GHS02')).toEqual(['FLAME']);
    for (const e of entries.filter((x) => /^GHS0\d$/.test(x.soort))) {
      expect(isValidGs1Value('gHSSymbolDescriptionCode', e.gs1[0].waarde), e.soort).toBe(true);
    }
  });
  it('MARINE_STEWARDSHIP_COUNCIL (alias) landt op de GS1-waarde ..._LABEL', () => {
    expect(aliasT3777Code('MARINE_STEWARDSHIP_COUNCIL')).toBe('MARINE_STEWARDSHIP_COUNCIL_LABEL');
    expect(isValidGs1Value('packagingMarkedLabelAccreditationCode', 'MARINE_STEWARDSHIP_COUNCIL')).toBe(false);
    expect(isValidGs1Value('packagingMarkedLabelAccreditationCode', 'MARINE_STEWARDSHIP_COUNCIL_LABEL')).toBe(true);
    expect(findGs1Entry('MARINE_STEWARDSHIP_COUNCIL')!.gs1[0].waarde).toBe('MARINE_STEWARDSHIP_COUNCIL_LABEL');
  });
  it('interne klassecodes komen nooit voor als waarde', () => {
    for (const e of entries) for (const g of e.gs1) expect(g.waarde, `${e.soort}/${g.veld}`).not.toMatch(/^(NUTRISCORE_|GHS0\d$)/);
  });
  it('isDietTypeMarkedOnPackage is true of false', () => {
    const regels = entries.flatMap((e) => e.gs1).filter((g) => g.veld === 'isDietTypeMarkedOnPackage');
    expect(regels.length).toBeGreaterThan(0);
    for (const g of regels) expect(['true', 'false']).toContain(g.waarde);
    expect(isValidGs1Value('isDietTypeMarkedOnPackage', 'true')).toBe(true);
    expect(isValidGs1Value('isDietTypeMarkedOnPackage', 'false')).toBe(true);
    expect(isValidGs1Value('isDietTypeMarkedOnPackage', 'TRUE')).toBe(false);
    expect(isValidGs1Value('isDietTypeMarkedOnPackage', '')).toBe(false);
  });
  it('nutritionalProgramCode 8 is geldig, 99 niet', () => {
    expect(isValidGs1Value('nutritionalProgramCode', '8')).toBe(true);
    expect(isValidGs1Value('nutritionalProgramCode', '99')).toBe(false);
  });
});

describe('Runtime — de GS1-blokbouwer weigert ongeldige waarden (weglaten en loggen)', () => {
  const det = (code: string) => ({
    bbox: { x: 100, y: 50, width: 200, height: 100 }, t3777_code: code, confidence: 0.97, method: 'embedding',
    reference_version: 'r1',
  });
  const base = { scanId: 's1', imageHash: 'h'.repeat(64), status: 'ok' as const, modelVersion: 'm1', width: 1000, height: 500 };
  const bad = (waarde: string) => (code: string) => ({
    soort: code, stand: 'voorstel' as const, ingesteld: 'voorstel' as const, beperktDoor: null, policyVersion: 'p',
    gs1: [{ module: 'm', pad: 'p', veld: 'packagingMarkedLabelAccreditationCode', waarde }],
  });
  it('een ongeldige waarde wordt weggelaten, de detectie blijft en er wordt gelogd', () => {
    warn.mockClear();
    const r = buildLogoResults({ ...base, detections: [det('X')] } as any, bad('NOT_A_REAL_CODE') as any);
    expect(r.items).toHaveLength(0);
    expect(r.detections).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain('ongeldige_gs1_waarde');
    // dezelfde afwijking nogmaals: geen tweede waarschuwing (geen log-vloed)
    buildLogoResults({ ...base, detections: [det('X')] } as any, bad('NOT_A_REAL_CODE') as any);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('een geldige waarde komt er gewoon door', () => {
    warn.mockClear();
    const r = buildLogoResults({ ...base, detections: [det('X')] } as any, bad('FOREST_STEWARDSHIP_COUNCIL_MIX') as any);
    expect(r.items).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });
  it('een groep met één ongeldige waarde wordt als geheel weggelaten', () => {
    const resolver = (code: string) => ({
      soort: code, stand: 'voorstel' as const, ingesteld: 'voorstel' as const, beperktDoor: null, policyVersion: 'p',
      gs1: [
        { module: 'm', pad: 'p', veld: 'nutritionalScore', waarde: 'A', groep: 'g' },
        { module: 'm', pad: 'p', veld: 'nutritionalProgramCode', waarde: '99', groep: 'g' },
      ],
    });
    expect(buildLogoResults({ ...base, detections: [det('X')] } as any, resolver as any).items).toHaveLength(0);
  });
});
