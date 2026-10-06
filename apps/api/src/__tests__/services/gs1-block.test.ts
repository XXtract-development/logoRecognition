/**
 * Verhaal 1.5 — GS1-blok in het antwoord (FR-5..FR-8, AD-6). ATDD: geschreven vóór de implementatie.
 * Bij elke test de AC waar hij op slaat.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

vi.mock('../../core/db', () => ({ default: {} }));

import { buildLogoResults, validateLogoResults, LOGO_RESULTS_SCHEMA_SHA256 } from '../../services/pipeline/gs1-block';
import { effectiveStand, getGs1Mapping, resolveSoort } from '../../services/gs1-mapping';

const W = 1000;
const H = 500;
type Det = Parameters<typeof buildLogoResults>[0]['detections'][number];
const det = (code: string, over: Partial<Det> = {}): Det => ({
  bbox: { x: 100, y: 50, width: 200, height: 100 }, t3777_code: code, confidence: 0.97, method: 'embedding',
  evidence: {}, reference_version: 'r1', ...over,
} as Det);
const base = { scanId: 's1', imageHash: 'h'.repeat(64), status: 'ok' as const, modelVersion: 'm1', width: W, height: H };
const build = (detections: Det[], extra: Record<string, unknown> = {}) => buildLogoResults({ ...base, detections, ...extra } as any);

// Alleen voor de drempel-/stand-logica: een tabel waarin de soort wél automatisch is.
const automatisch = (code: string) => {
  const r = resolveSoort(code, { modelVersion: 'm1', referenceVersion: 'r1' })!;
  return { ...r, stand: 'automatisch' as const, ingesteld: 'automatisch' as const, beperktDoor: null };
};

describe('AC1 — NUTRISCORE_C geeft één groep zonder interne code', () => {
  it('nutritionalScore C + nutritionalProgramCode 8 in één groep', () => {
    const r = build([det('NUTRISCORE_C')]);
    expect(r.items).toHaveLength(1);
    const it0 = r.items[0];
    expect(it0.soort).toBe('NUTRISCORE_C');
    expect(it0.groep).toBe('nutritionalProgram');
    expect(it0.gs1.map((g) => [g.veld, g.waarde])).toEqual([['nutritionalScore', 'C'], ['nutritionalProgramCode', '8']]);
    expect(JSON.stringify(it0.gs1)).not.toContain('NUTRISCORE');
  });
  it('geen enkele omgezette waarde is een interne klassecode', () => {
    for (const e of getGs1Mapping().entries.filter((x) => x.opnamestand !== 'uit')) {
      const r = build([det(e.soort)]);
      for (const g of r.items.flatMap((i) => i.gs1)) expect(g.waarde).not.toMatch(/^(NUTRISCORE_|GHS\d)/);
    }
  });
});

describe('AC2 — EU_ORGANIC_FARMING en GHS02', () => {
  it('EU_ORGANIC_FARMING geeft packagingMarkedLabelAccreditationCode met de GS1-waarde', () => {
    const r = build([det('EU_ORGANIC_FARMING')]);
    expect(r.items[0].gs1).toEqual([{ module: 'packagingMarkingModule', pad: 'packagingMarking', veld: 'packagingMarkedLabelAccreditationCode', waarde: 'EU_ORGANIC_FARMING' }]);
    expect(r.items[0].groep).toBeUndefined();
  });
  it('GHS02 geeft FLAME', () => {
    const r = build([det('GHS02', { method: 'ghs-specialist' })]);
    expect(r.items[0].gs1[0].waarde).toBe('FLAME');
  });
});

describe('AC3 — soort buiten de tabel of uit: geen item, wel ruwe detectie', () => {
  it('onbekende soort', () => {
    const r = build([det('BESTAAT_NIET_XYZ')]);
    expect(r.items).toEqual([]);
    expect(r.detections).toHaveLength(1);
  });
  it('soort met stand uit', () => {
    const uit = getGs1Mapping().entries.find((e) => e.opnamestand === 'uit')!;
    const r = build([det(uit.soort)]);
    expect(r.items).toEqual([]);
    expect(r.detections).toHaveLength(1);
  });
});

describe('AC4 — drempel per methode, twijfel en GHS', () => {
  const cases: Array<[string, number, number]> = [
    ['template', 0.85, 0.84], ['embedding', 0.8, 0.79], ['classifier', 0.9, 0.89],
    ['nutriscore-head', 0.8, 0.79], ['nutriscore-a2', 0.5, 0.49],
  ];
  for (const [method, drempel, onder] of cases) {
    it(`${method}: ${onder} voorstel, ${drempel} automatisch`, () => {
      const dep = automatisch;
      const lo = buildLogoResults({ ...base, detections: [det('EU_ORGANIC_FARMING', { method, confidence: onder })] } as any, dep);
      const hi = buildLogoResults({ ...base, detections: [det('EU_ORGANIC_FARMING', { method, confidence: drempel })] } as any, dep);
      expect(lo.items[0].uitkomststand).toBe('voorstel');
      expect(hi.items[0].uitkomststand).toBe('automatisch');
    });
  }
  it('uncertain of requires_review geeft voorstel, ook boven de drempel', () => {
    for (const flag of [{ uncertain: true }, { requires_review: true }]) {
      const r = buildLogoResults({ ...base, detections: [det('EU_ORGANIC_FARMING', { confidence: 0.99, ...flag })] } as any, automatisch);
      expect(r.items[0].uitkomststand).toBe('voorstel');
    }
  });
  it('GHS blijft op 0,99 voorstel', () => {
    const r = build([det('GHS02', { method: 'ghs-specialist', confidence: 0.99 })]);
    expect(r.items[0].uitkomststand).toBe('voorstel');
  });
  it('andere modelversie dan validFor… geeft voorstel met reden versie_wijkt_af (echte omzettabel)', () => {
    const e = { ...getGs1Mapping().entries.find((x) => x.soort === 'EU_ORGANIC_FARMING')!, opnamestand: 'automatisch' as const, rapportverwijzing: 'r.md', validForModelVersion: 'm1', validForReferenceVersion: 'r1' };
    const stub = (c: string, ctx: { modelVersion: string | null; referenceVersion: string | null }) =>
      ({ soort: e.soort, gs1: e.gs1, ...effectiveStand(e, ctx) }) as ReturnType<typeof resolveSoort>;
    const same = buildLogoResults({ ...base, detections: [det('EU_ORGANIC_FARMING')] } as any, stub);
    const other = buildLogoResults({ ...base, modelVersion: 'oud', detections: [det('EU_ORGANIC_FARMING')] } as any, stub);
    expect(same.items[0].uitkomststand).toBe('automatisch');
    expect(other.items[0].uitkomststand).toBe('voorstel');
    expect(other.items[0].bewijs.redenen).toContain('versie_wijkt_af');
    // zonder stub, met de echte tabel: nooit automatisch bij een onbekende versie
    expect(build([det('EU_ORGANIC_FARMING')], { modelVersion: undefined }).items[0].uitkomststand).toBe('voorstel');
  });
  it('partial: geen enkel item is automatisch (een gemiste regio kan tegenspreken)', () => {
    const r = buildLogoResults({ ...base, status: 'partial', reason: 'classification_incomplete', detections: [det('EU_ORGANIC_FARMING')] } as any, automatisch);
    expect(r.items[0].uitkomststand).toBe('voorstel');
    expect(r.items[0].bewijs.redenen).toContain('classificatie_onvolledig');
  });
  it('zekerheid en bbox (genormaliseerd x1,y1,x2,y2) en bewijs staan op het item', () => {
    const r = build([det('EU_ORGANIC_FARMING')]);
    expect(r.items[0].zekerheid).toBe(0.97);
    expect(r.items[0].bbox).toEqual([0.1, 0.1, 0.3, 0.3]);
    expect(r.items[0].bewijs).toMatchObject({ methode: 'embedding', detectie: 0 });
    expect(Array.isArray(r.items[0].bewijs.redenen)).toBe(true);
  });
});

describe('AC5 — tegenstrijdige items en dubbele detecties', () => {
  it('twee Nutri-Score-letters geven allemaal voorstel', () => {
    const r = buildLogoResults({ ...base, detections: [
      det('NUTRISCORE_A', { bbox: { x: 0, y: 0, width: 50, height: 50 } }), det('NUTRISCORE_C', { bbox: { x: 100, y: 0, width: 50, height: 50 } }),
    ] } as any, (c) => ({ ...automatisch(c) }));
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.uitkomststand)).toEqual(['voorstel', 'voorstel']);
    expect(r.items[0].bewijs.redenen).toContain('tegenstrijdig');
  });
  it('dezelfde soort op twee plekken: één item met de hoogste zekerheid, beide in detections', () => {
    const r = build([
      det('EU_ORGANIC_FARMING', { confidence: 0.91, bbox: { x: 0, y: 0, width: 10, height: 10 } }),
      det('EU_ORGANIC_FARMING', { confidence: 0.95, bbox: { x: 500, y: 0, width: 10, height: 10 } }),
    ]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].zekerheid).toBe(0.95);
    expect(r.items[0].bewijs.detectie).toBe(0); // detections staan op zekerheid aflopend
    expect(r.detections).toHaveLength(2);
  });
  it('twee verschillende keurmerken (geen gedeelde groep) blijven los', () => {
    const r = build([det('EU_ORGANIC_FARMING'), det('GHS02', { method: 'ghs-specialist', bbox: { x: 400, y: 0, width: 50, height: 50 } })]);
    expect(r.items).toHaveLength(2);
  });
});

describe('AC6 — signaalwoord (alleen uit de OCR)', () => {
  it('DANGER en WARNING komen ongewijzigd in logoResults.signaalwoord', () => {
    expect(build([], { signalWord: 'DANGER' }).signaalwoord).toBe('DANGER');
    expect(build([], { signalWord: 'WARNING' }).signaalwoord).toBe('WARNING');
  });
  it('ander of ontbrekend signaalwoord wordt weggelaten', () => {
    for (const v of ['danger', 'CAUTION', '', undefined]) expect('signaalwoord' in build([], { signalWord: v })).toBe(false);
  });
  it('GHS-item zonder signaalwoord krijgt de markering; mét signaalwoord niet; niet-GHS nooit', () => {
    const g = (extra = {}) => build([det('GHS02', { method: 'ghs-specialist' })], extra).items[0].bewijs.markeringen;
    expect(g()).toContain('signaalwoord ontbreekt');
    expect(g({ signalWord: 'DANGER' })).not.toContain('signaalwoord ontbreekt');
    expect(build([det('EU_ORGANIC_FARMING')]).items[0].bewijs.markeringen).not.toContain('signaalwoord ontbreekt');
  });
  it('het signaalwoord wordt niet uit het symbool afgeleid', () => {
    expect(build([det('GHS02', { method: 'ghs-specialist' })]).signaalwoord).toBeUndefined();
  });
});

describe('AC7 — schema logoResults.v1.json en validatie', () => {
  const schemaPath = resolvePath(__dirname, '../../schemas/logoResults.v1.json');
  it('schema staat in de repo met schemaVersion 1 en een vastgelegde sha256', () => {
    const bytes = readFileSync(schemaPath);
    const sha = createHash('sha256').update(bytes).digest('hex');
    expect(JSON.parse(bytes.toString()).properties.schemaVersion.const).toBe('1');
    expect(LOGO_RESULTS_SCHEMA_SHA256).toBe(sha);
    expect(readFileSync(resolvePath(__dirname, '../../schemas/logoResults.v1.sha256'), 'utf8').split(/\s+/)[0]).toBe(sha);
  });
  it('een geldig resultaat valideert; kopvelden en versies staan erin', () => {
    const r = build([det('NUTRISCORE_C'), det('GHS02', { method: 'ghs-specialist', bbox: { x: 400, y: 0, width: 50, height: 50 } })], { productId: 'P1', signalWord: 'DANGER' });
    expect(validateLogoResults(r)).toEqual([]);
    expect(r).toMatchObject({ schemaVersion: '1', scanId: 's1', productId: 'P1', status: 'ok', modelVersion: 'm1', referenceVersion: 'r1' });
    expect(r.policyVersion).toMatch(/^[0-9a-f]{64}$/);
  });
  it('een ongeldig resultaat valideert niet (onbekende hoofdversie, interne waarde, ontbrekend veld)', () => {
    const ok = build([det('EU_ORGANIC_FARMING')]);
    expect(validateLogoResults({ ...ok, schemaVersion: '2' }).length).toBeGreaterThan(0);
    expect(validateLogoResults({ ...ok, items: [{ ...ok.items[0], uitkomststand: 'zeker' }] }).length).toBeGreaterThan(0);
    expect(validateLogoResults({ ...ok, items: [{ ...ok.items[0], bbox: [0, 0, 2, 1] }] }).length).toBeGreaterThan(0);
    const { imageHash: _h, ...zonder } = ok as any;
    expect(validateLogoResults(zonder).length).toBeGreaterThan(0);
    expect(validateLogoResults({ ...ok, status: 'partial' }).length).toBeGreaterThan(0); // partial vraagt een reden
    expect(validateLogoResults({ ...ok, detections: [{ t3777_code: 'X', confidence: 1, method: 'm', bbox: {} }] }).length).toBeGreaterThan(0);
  });
  it('status failed met reden en lege items valideert', () => {
    const r = buildLogoResults({ ...base, status: 'failed', reason: 'timeout', detections: [] } as any);
    expect(validateLogoResults(r)).toEqual([]);
    expect(r).toMatchObject({ status: 'failed', reason: 'timeout', items: [] });
  });
});

describe('AC8 — deterministisch', () => {
  it('herhaald bouwen en een andere invoervolgorde geven byte-gelijke uitvoer', () => {
    const a = det('EU_ORGANIC_FARMING', { bbox: { x: 0, y: 0, width: 10, height: 10 } });
    const b = det('NUTRISCORE_C', { bbox: { x: 100, y: 0, width: 10, height: 10 } });
    const one = JSON.stringify(build([a, b]));
    expect(JSON.stringify(build([a, b]))).toBe(one);
    expect(JSON.stringify(build([b, a]))).toBe(one); // ook bij een andere invoervolgorde
  });
});
