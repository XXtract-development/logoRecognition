/**
 * Verhaal 1.4 — Omzettabel en soortbeleid (AD-2, AD-5, FR-9..FR-11).
 * ATDD: geschreven vóór de implementatie. Bij elke test de AC waar hij op slaat.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import mapping from '../../services/reference-code-mapping.json';
import {
  getGs1Mapping,
  findGs1Entry,
  effectiveStand,
  resolveSoort,
  policyVersion,
  validateMapping,
  findUitsluiting,
  type Gs1MappingFile,
  type Gs1MappingEntry,
} from '../../services/gs1-mapping';

const CTX = { modelVersion: 'm1', referenceVersion: 'r1' };
const file = getGs1Mapping();
const entries = file.entries;
const byCode = (c: string): Gs1MappingEntry => {
  const e = findGs1Entry(c);
  if (!e) throw new Error(`geen regel voor ${c}`);
  return e;
};
const GHS = mapping.categories.GHSSymbolDescriptionCode.codes.filter((c) => c !== 'NO_PICTOGRAM');

function t3777Codes(): string[] {
  const src = readFileSync(resolve(__dirname, '../../../../web/src/data/keurmerk-codes.ts'), 'utf8');
  const codes = [...src.matchAll(/^"([^"]*)",?\s*$/gm)].map((m) => m[1]);
  // elke regel die met een aanhalingsteken begint moet een code opleveren (vangt een gemiste laatste regel)
  expect(codes.length).toBe(src.split('\n').filter((l) => l.startsWith('"')).length);
  return codes;
}
const entry = (over: Partial<Gs1MappingEntry> = {}): Gs1MappingEntry => ({
  soort: 'TEST',
  gs1: [],
  categorieen: [],
  opnamestand: 'automatisch',
  startstand: 'voorstel',
  validForModelVersion: 'm1',
  validForReferenceVersion: 'r1',
  besluitdatum: '2026-10-06',
  rapportverwijzing: 'rapport/x.md',
  bron: 'test',
  ...over,
});

describe('AC1 — elke soort heeft een regel of is bewust uitgesloten', () => {
  it('dekt alle codes uit reference-code-mapping.json', () => {
    const all = new Set(Object.values(mapping.categories).flatMap((c) => c.codes));
    const missing = [...all].filter((c) => !findGs1Entry(c) && !file.uitgesloten.some((u) => u.soort === c));
    expect(missing).toEqual([]);
  });
  it('dekt alle T3777-codes uit keurmerk-codes.ts', () => {
    const missing = t3777Codes().filter((c) => !findGs1Entry(c) && !file.uitgesloten.some((u) => u.soort === c));
    expect(missing).toEqual([]);
  });
  it('elke uitsluiting heeft een reden', () => {
    expect(file.uitgesloten.length).toBeGreaterThan(0);
    for (const u of file.uitgesloten) expect(u.reden.length).toBeGreaterThan(3);
  });
  it('soorten zijn uniek', () => {
    const codes = entries.map((e) => e.soort);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('AC2 — verplichte velden per regel', () => {
  it('elke regel heeft alle velden', () => {
    for (const e of entries) {
      for (const k of ['soort', 'gs1', 'categorieen', 'opnamestand', 'validForModelVersion', 'validForReferenceVersion', 'besluitdatum', 'rapportverwijzing']) {
        expect(e, `${e.soort}.${k}`).toHaveProperty(k);
      }
      expect(e.gs1.length, e.soort).toBeGreaterThan(0);
      for (const g of e.gs1) for (const k of ['module', 'pad', 'veld', 'waarde']) expect(g, `${e.soort}.${k}`).toHaveProperty(k);
      expect(e.besluitdatum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
  it('een uit-regel heeft een reden', () => {
    for (const e of entries.filter((x) => x.opnamestand === 'uit')) expect(e.reden, e.soort).toBeTruthy();
  });
});

describe('AC3 — startstand en gevaarsymbolen', () => {
  it('geen enkele regel staat op automatisch bij de start', () => {
    for (const e of entries) {
      expect(['voorstel', 'uit'], e.soort).toContain(e.startstand);
      expect(e.opnamestand, e.soort).not.toBe('automatisch');
    }
  });
  it('gevaarsymbolen: effectieve stand is nooit hoger dan voorstel, ook als het bestand automatisch zegt', () => {
    const hacked = entry({ soort: 'FLAME', opnamestand: 'automatisch' });
    expect(effectiveStand(hacked, CTX).stand).toBe('voorstel');
  });
  it('alle benoemde GHS-klassen hebben een regel met veld gHSSymbolDescriptionCode', () => {
    for (const c of GHS) {
      const e = byCode(c);
      expect(e.gs1[0].veld).toBe('gHSSymbolDescriptionCode');
      expect(e.gs1[0].module).toBe('safetyDataSheetModule');
      expect(e.gs1[0].pad).toBe('safetyDataSheetInformation/gHSDetail');
      expect(e.gs1[0].waarde).toBe(c);
    }
  });
  it('GHS0n-alias en GHS-regels zijn niet automatisch', () => {
    expect(byCode('GHS02').soort).toBe('FLAME');
  });
});

describe('AC4 — CI faalt bij een stand zonder rapportverwijzing', () => {
  it('automatisch zonder rapportverwijzing is een overtreding', () => {
    for (const e of entries) {
      if (e.opnamestand === 'automatisch') expect(e.rapportverwijzing, e.soort).toBeTruthy();
    }
  });
  it('een afwijking van de startstand zonder rapportverwijzing is een overtreding', () => {
    for (const e of entries) {
      if (e.opnamestand !== e.startstand) expect(e.rapportverwijzing, e.soort).toBeTruthy();
    }
  });
});

describe('AC5 — andere versie geeft effectieve stand voorstel en policyVersion', () => {
  it('gelijke versies: ingestelde stand blijft gelden', () => {
    expect(effectiveStand(entry(), CTX).stand).toBe('automatisch');
  });
  it('andere modelversie of referentieversie: voorstel', () => {
    expect(effectiveStand(entry(), { ...CTX, modelVersion: 'm2' }).stand).toBe('voorstel');
    expect(effectiveStand(entry(), { ...CTX, referenceVersion: 'r2' }).stand).toBe('voorstel');
  });
  it('ontbrekende validFor of ontbrekende context: voorstel', () => {
    expect(effectiveStand(entry({ validForModelVersion: null }), CTX).stand).toBe('voorstel');
    expect(effectiveStand(entry(), { modelVersion: null, referenceVersion: 'r1' }).stand).toBe('voorstel');
  });
  it('nooit hoger dan ingesteld: voorstel blijft voorstel, uit blijft uit', () => {
    expect(effectiveStand(entry({ opnamestand: 'voorstel' }), CTX).stand).toBe('voorstel');
    expect(effectiveStand(entry({ opnamestand: 'uit', reden: 'x' }), { ...CTX, modelVersion: 'm2' }).stand).toBe('uit');
    expect(effectiveStand(entry({ opnamestand: 'uit', reden: 'x' }), CTX).stand).toBe('uit');
  });
  it('de uitkomst toont policyVersion (hash van het bestand) en de reden van de terugval', () => {
    const r = effectiveStand(entry(), { ...CTX, modelVersion: 'm2' });
    expect(r.policyVersion).toBe(policyVersion());
    expect(policyVersion()).toMatch(/^[0-9a-f]{64}$/);
    expect(r.beperktDoor).toBe('versie');
  });
});

describe('AC6 — deterministische omzetting', () => {
  it('dezelfde invoer geeft byte-gelijke uitvoer', () => {
    const a = JSON.stringify(resolveSoort('NUTRISCORE_C', CTX));
    const b = JSON.stringify(resolveSoort('NUTRISCORE_C', CTX));
    expect(a).toBe(b);
    expect(JSON.stringify(getGs1Mapping())).toBe(JSON.stringify(getGs1Mapping()));
  });
});

describe('FR-9..FR-11 — omzetting naar GS1-codelijstwaarden', () => {
  it('Nutri-Score: letter + programmacode 8 in één groep', () => {
    const e = byCode('NUTRISCORE_C');
    expect(e.gs1).toEqual([
      { module: 'healthRelatedInformationModule', pad: 'healthRelatedInformation/nutritionalProgram', veld: 'nutritionalScore', waarde: 'C', groep: 'nutritionalProgram' },
      { module: 'healthRelatedInformationModule', pad: 'healthRelatedInformation/nutritionalProgram', veld: 'nutritionalProgramCode', waarde: '8', groep: 'nutritionalProgram' },
    ]);
    for (const l of 'ABCDE') expect(byCode(`NUTRISCORE_${l}`).gs1[0].waarde).toBe(l);
  });
  it('keurmerk: packagingMarkedLabelAccreditationCode met de code zelf', () => {
    const e = byCode('EU_ORGANIC_FARMING');
    expect(e.gs1).toEqual([{ module: 'packagingMarkingModule', pad: 'packagingMarking', veld: 'packagingMarkedLabelAccreditationCode', waarde: 'EU_ORGANIC_FARMING' }]);
  });
  it('dieet: dietTypeCode + isDietTypeMarkedOnPackage true, groep per dieetsoort', () => {
    const e = byCode('VEGAN');
    expect(e.gs1.map((g) => [g.veld, g.waarde])).toEqual([
      ['dietTypeCode', 'VEGAN'],
      ['isDietTypeMarkedOnPackage', 'true'],
    ]);
    expect(e.gs1.every((g) => g.module === 'dietInformationModule' && g.pad === 'dietInformation/dietTypeInformation')).toBe(true);
    expect(new Set(e.gs1.map((g) => g.groep)).size).toBe(1);
    expect(byCode('HALAL').gs1[0].groep).not.toBe(e.gs1[0].groep);
  });
  it('gebruikslabel: enumerationValue', () => {
    const e = byCode('AISE_1');
    expect(e.gs1).toEqual([{ module: 'consumerInstructionsModule', pad: 'consumerInstructions/consumerUsageLabelCode/enumerationValueInformation', veld: 'enumerationValue', waarde: 'AISE_1' }]);
  });
  it('interne klassecodes komen niet als waarde voor bij Nutri-Score', () => {
    for (const g of byCode('NUTRISCORE_A').gs1) expect(g.waarde).not.toMatch(/NUTRISCORE/);
  });
  it('alias MARINE_STEWARDSHIP_COUNCIL → _LABEL', () => {
    expect(findGs1Entry('MARINE_STEWARDSHIP_COUNCIL')?.soort).toBe('MARINE_STEWARDSHIP_COUNCIL_LABEL');
  });
  it('onbekende soort geeft null (geen GS1-blok)', () => {
    expect(findGs1Entry('IETS_ONBEKENDS')).toBeNull();
    expect(resolveSoort('IETS_ONBEKENDS', CTX)).toBeNull();
  });
});

describe('Soortbeleid — startstanden uit de bronnen', () => {
  const logodekking = JSON.parse(
    readFileSync(resolve(__dirname, '../../../scripts/gs1-mapping-sources/logodekking-2026-10-02-actieve-codes.json'), 'utf8')
  ) as { codes: string[] };
  const notInGs1 = JSON.parse(
    readFileSync(resolve(__dirname, '../../../scripts/gs1-mapping-sources/gs1-not-in-codelist-31371.json'), 'utf8')
  ) as { codes: string[] };

  it('de 52 keurmerkcodes buiten GS1 staan op uit met reden', () => {
    expect(notInGs1.codes).toHaveLength(52);
    for (const c of notInGs1.codes) {
      const e = byCode(c);
      expect(e.opnamestand, c).toBe('uit');
      expect(e.reden).toBe('niet in GS1-codelijst 3.1.37.1');
    }
  });
  it('de 61 codes met actieve referenties staan op voorstel (tenzij niet in GS1)', () => {
    expect(logodekking.codes).toHaveLength(61);
    for (const c of logodekking.codes) {
      if (notInGs1.codes.includes(c)) continue;
      expect(byCode(c).opnamestand, c).toBe('voorstel');
    }
  });
  it('T3777-codes zonder actieve referentie staan op uit met reden', () => {
    const active = new Set(logodekking.codes);
    const bad = new Set(notInGs1.codes);
    const rest = t3777Codes().filter((c) => !active.has(c) && !bad.has(c) && !c.startsWith('NUTRISCORE') && !/\s/.test(c));
    expect(rest.length).toBeGreaterThan(700);
    for (const c of rest) {
      const e = findGs1Entry(c);
      if (!e) continue;
      expect(e.opnamestand, c).toBe('uit');
      expect(e.reden).toBe('geen actieve referenties');
    }
  });
});

describe('Review-bevindingen — generator, validatie en randgevallen', () => {
  const load = (): Gs1MappingFile => JSON.parse(JSON.stringify(getGs1Mapping()));

  it('AC6: het ingecheckte bestand is byte-gelijk aan de uitvoer van het script', () => {
    const gen = createRequire(__filename)('../../../scripts/generate-gs1-mapping.js') as { text: string };
    const onDisk = readFileSync(resolve(__dirname, '../../services/gs1-mapping.json'), 'utf8');
    expect(gen.text).toBe(onDisk);
  });
  it('elke code uit keurmerk-codes.ts, ook de laatste regel, heeft een regel of uitsluiting', () => {
    expect(t3777Codes()).toContain('ZERO_WASTE_BUSINESS_COUNCIL_CERTIFIED');
    expect(findGs1Entry('ZERO_WASTE_BUSINESS_COUNCIL_CERTIFIED')).not.toBeNull();
  });
  it('AC4: het echte bestand is geldig, een kapot bestand wordt afgekeurd', () => {
    expect(validateMapping(file)).toEqual([]);
    const a = load();
    a.entries[0].opnamestand = 'automatisch';
    expect(validateMapping(a).join()).toMatch(/automatisch zonder rapportverwijzing/);
    const b = load();
    const v = b.entries.find((e) => e.opnamestand === 'uit')!;
    v.opnamestand = 'voorstel';
    expect(validateMapping(b).join()).toMatch(/standwijziging zonder rapportverwijzing/);
    v.rapportverwijzing = 'rapport/x.md';
    expect(validateMapping(b)).toEqual([]);
    const c = load();
    (c.entries[0] as { opnamestand: string }).opnamestand = 'automatich';
    expect(validateMapping(c).join()).toMatch(/onbekende opnamestand/);
    const d = load();
    d.entries[0].startstand = 'automatisch';
    expect(validateMapping(d).join()).toMatch(/startstand/);
  });
  it('AC3: de echte GHS-regels staan op voorstel en blijven dat bij passende versies', () => {
    for (const c of GHS) {
      const e = byCode(c);
      expect(e.opnamestand).toBe('voorstel');
      expect(resolveSoort(c, { modelVersion: e.validForModelVersion, referenceVersion: e.validForReferenceVersion })?.stand).toBe('voorstel');
    }
  });
  it('een voorstel met afwijkende of ontbrekende versie meldt beperktDoor versie', () => {
    expect(effectiveStand(entry({ opnamestand: 'voorstel' }), { ...CTX, modelVersion: 'm2' }).beperktDoor).toBe('versie');
    expect(effectiveStand(entry({ opnamestand: 'voorstel', validForModelVersion: null }), CTX).beperktDoor).toBe('versie');
  });
  it('alias RAINFOREST_ALLIANCE_PEOPLE_NATURE: eigen regel gaat vóór de alias', () => {
    const e = findGs1Entry('RAINFOREST_ALLIANCE_PEOPLE_NATURE');
    expect(e).not.toBeNull();
    expect(e!.gs1[0].waarde).toBe(e!.soort);
  });
  it('uitgesloten soort is te onderscheiden van onbekende soort; slechte invoer geeft null', () => {
    expect(findGs1Entry('NO_PICTOGRAM')).toBeNull();
    expect(findUitsluiting('NO_PICTOGRAM')?.reden).toBeTruthy();
    expect(findUitsluiting('IETS_ONBEKENDS')).toBeNull();
    expect(findGs1Entry('')).toBeNull();
    expect(findGs1Entry(undefined as unknown as string)).toBeNull();
  });
});
