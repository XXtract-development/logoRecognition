/**
 * Verhaal 1.7 — zoekruimte beperken op productcategorie (FR-4, AD-2). ATDD: geschreven vóór de implementatie.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

vi.mock('../../core/db', () => ({ default: {} }));

import { getGs1Mapping, validateMapping, type Gs1MappingFile } from '../../services/gs1-mapping';
import { beperkSoorten, isGpcCode } from '../../services/zoekruimte';
import { buildLogoResults, validateLogoResults, LOGO_RESULTS_SCHEMA_SHA256 } from '../../services/pipeline/gs1-block';
import { GHS_REFERENCE_PAIRS } from '../../api/legacy-detect';
import { createHash } from 'node:crypto';

const entries = getGs1Mapping().entries;
const diet = entries.filter((e) => e.gs1[0].veld === 'dietTypeCode');
const nutri = entries.filter((e) => e.gs1[0].veld === 'nutritionalScore');
const ghs = entries.filter((e) => e.gs1[0].veld === 'gHSSymbolDescriptionCode');
const ALL = [...new Set(entries.map((e) => e.soort))];
const FOOD = '50200000';
const NON_FOOD = '47000000';

describe('AC1 — gevulde categorieen in de omzettabel (alleen wat zeker is)', () => {
  it('Nutri-Score (5) en dieetsoorten (34) hebben ["50"]', () => {
    expect(nutri).toHaveLength(5);
    expect(diet).toHaveLength(34);
    for (const e of [...nutri, ...diet]) expect(e.categorieen, e.soort).toEqual(['50']);
  });
  it('alles overig, inclusief GHS, Green Dot, FSC en recycling, blijft leeg (= overal)', () => {
    const gevuld = new Set([...nutri, ...diet].map((e) => e.soort));
    for (const e of entries) if (!gevuld.has(e.soort)) expect(e.categorieen, e.soort).toEqual([]);
    expect(ghs.length).toBeGreaterThan(0);
    for (const e of ghs) expect(e.categorieen, e.soort).toEqual([]);
  });
  it('de generator maakt het bestand byte-gelijk en leest categorieen-overrides.json', () => {
    const { text } = require('../../../scripts/generate-gs1-mapping.js');
    expect(text).toBe(readFileSync(resolvePath(__dirname, '../../services/gs1-mapping.json'), 'utf8'));
    expect(JSON.parse(readFileSync(resolvePath(__dirname, '../../../scripts/gs1-mapping-sources/categorieen-overrides.json'), 'utf8'))).toBeTruthy();
  });
  it('validatie weigert een ongeldige prefix en een gevulde lijst bij een gevaarsymbool', () => {
    const f = JSON.parse(JSON.stringify(getGs1Mapping())) as Gs1MappingFile;
    f.entries.find((e) => e.soort === nutri[0].soort)!.categorieen = ['5x'];
    expect(validateMapping(f).join(' ')).toMatch(/categorieen/);
    const g = JSON.parse(JSON.stringify(getGs1Mapping())) as Gs1MappingFile;
    g.entries.find((e) => e.soort === ghs[0].soort)!.categorieen = ['50'];
    expect(validateMapping(g).join(' ')).toMatch(/categorieen/);
  });
});

describe('AC2 — beperken op gpcCategoryCode', () => {
  it('isGpcCode: precies 8 cijfers', () => {
    expect(isGpcCode('50200000')).toBe(true);
    for (const x of ['5020000', '502000000', 'abcdefgh', '5020 000', '']) expect(isGpcCode(x)).toBe(false);
  });
  it('zonder code: volledige set, beperkt false', () => {
    const r = beperkSoorten(ALL, undefined);
    expect(r.codes).toEqual(ALL);
    expect(r.zoekruimte).toEqual({ beperkt: false, aantalSoorten: ALL.length });
  });
  it.each(['abc', '123', '5020000X', '  '])('ongeldige code %j: volledige set', (c) => {
    const r = beperkSoorten(ALL, c);
    expect(r.codes).toEqual(ALL);
    expect(r.zoekruimte.beperkt).toBe(false);
  });
  it('voedselcode: Nutri-Score en dieet blijven, GHS blijft', () => {
    const r = beperkSoorten([...ALL, ...GHS_REFERENCE_PAIRS.map((p) => p.t3777Code)], FOOD);
    for (const e of [...nutri, ...diet]) expect(r.codes).toContain(e.soort);
    for (const e of ghs) expect(r.codes).toContain(e.soort);
    expect(r.zoekruimte).toEqual({ gpcCategoryCode: FOOD, beperkt: false, aantalSoorten: r.codes.length });
  });
  it('niet-voedselcode: Nutri-Score en dieet vallen af; keurmerken en GHS blijven', () => {
    const r = beperkSoorten(ALL, NON_FOOD);
    for (const e of [...nutri, ...diet]) expect(r.codes).not.toContain(e.soort);
    for (const e of entries.filter((x) => x.categorieen.length === 0)) expect(r.codes, e.soort).toContain(e.soort);
    expect(r.zoekruimte).toEqual({ gpcCategoryCode: NON_FOOD, beperkt: true, aantalSoorten: ALL.length - 39 });
  });
  it('een soort met lege categorieen valt nooit af, ook niet bij een willekeurige code', () => {
    for (const gpc of ['10000000', '47000000', '99999999', '50200000']) {
      const r = beperkSoorten(['FSC', 'RECYCLABLE', 'GREEN_DOT', 'FLAME'], gpc);
      expect(r.codes).toEqual(['FSC', 'RECYCLABLE', 'GREEN_DOT', 'FLAME']);
    }
  });
  it('een code die niet in de omzettabel staat valt nooit af', () => {
    expect(beperkSoorten(['ONBEKENDE_SOORT'], NON_FOOD).codes).toEqual(['ONBEKENDE_SOORT']);
  });
  it.each([['50', FOOD, true], ['5020', FOOD, true], ['502000', FOOD, true], ['50200000', FOOD, true],
    ['5021', FOOD, false], ['502100', FOOD, false], ['50200001', FOOD, false], ['51', FOOD, false]])(
    'prefix %s tegen %s: zinvol=%s (segment/family/class/brick)', (prefix, gpc, zinvol) => {
      const r = beperkSoorten(['PROEF'], gpc, () => ({ ...entries[0], soort: 'PROEF', categorieen: [prefix] }));
      expect(r.codes.includes('PROEF')).toBe(zinvol);
    });
});

describe('AC3 — zoekruimte in logoResults en schema', () => {
  const base = { scanId: 's1', imageHash: 'h'.repeat(64), status: 'ok' as const, modelVersion: 'm1', width: 100, height: 100, detections: [] };
  it('buildLogoResults neemt zoekruimte over en het resultaat valideert', () => {
    const z = { gpcCategoryCode: NON_FOOD, beperkt: true, aantalSoorten: 10 };
    const r = buildLogoResults({ ...base, zoekruimte: z } as any);
    expect(r.zoekruimte).toEqual(z);
    expect(r.schemaVersion).toBe('1');
    expect(validateLogoResults(r)).toEqual([]);
  });
  it('zonder zoekruimte blijft het veld weg (optioneel, schemaVersion 1)', () => {
    expect(buildLogoResults(base as any)).not.toHaveProperty('zoekruimte');
  });
  it('schema weigert een zoekruimte met onbekend veld of verkeerd type', () => {
    const ok = buildLogoResults({ ...base, zoekruimte: { beperkt: false, aantalSoorten: 3 } } as any);
    expect(validateLogoResults({ ...ok, zoekruimte: { beperkt: 'ja', aantalSoorten: 3 } })).not.toEqual([]);
    expect(validateLogoResults({ ...ok, zoekruimte: { beperkt: false, aantalSoorten: 3, extra: 1 } })).not.toEqual([]);
    expect(validateLogoResults({ ...ok, zoekruimte: { beperkt: false } })).not.toEqual([]);
  });
  it('schema weigert een gpcCategoryCode die geen 8 cijfers is', () => {
    const ok = buildLogoResults({ ...base, zoekruimte: { gpcCategoryCode: '47000000', beperkt: true, aantalSoorten: 3 } } as any);
    expect(validateLogoResults(ok)).toEqual([]);
    expect(validateLogoResults({ ...ok, zoekruimte: { gpcCategoryCode: '4700', beperkt: true, aantalSoorten: 3 } })).not.toEqual([]);
  });
  it('sha256-bestand en constante volgen het uitgebreide schema', () => {
    const bytes = readFileSync(resolvePath(__dirname, '../../schemas/logoResults.v1.json'));
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(LOGO_RESULTS_SCHEMA_SHA256).toBe(sha);
    expect(readFileSync(resolvePath(__dirname, '../../schemas/logoResults.v1.sha256'), 'utf8').split(/\s+/)[0]).toBe(sha);
    expect(JSON.parse(bytes.toString()).properties.zoekruimte).toBeTruthy();
  });
});
