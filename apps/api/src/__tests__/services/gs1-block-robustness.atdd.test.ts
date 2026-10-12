/**
 * spec-logo-scan-robustness — CAP-4 (referenceVersion uit de poolversie), CAP-5 (twijfelachtig selectief),
 * CAP-1 (blank_crop-detectie levert geen item en maakt de scan niet onbruikbaar). ATDD: geschreven vóór de implementatie.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../core/db', () => ({ default: {} }));

import { buildLogoResults, validateLogoResults } from '../../services/pipeline/gs1-block';
import { effectiveStand, findGs1Entry } from '../../services/gs1-mapping';

const W = 1000;
const H = 500;
type Input = Parameters<typeof buildLogoResults>[0];
type Det = Input['detections'][number];
const det = (code: string, over: Partial<Det> = {}): Det => ({
  bbox: { x: 100, y: 50, width: 200, height: 100 }, t3777_code: code, confidence: 0.97, method: 'embedding', evidence: {}, ...over,
} as Det);
const base = { scanId: 's1', imageHash: 'h'.repeat(64), status: 'ok' as const, modelVersion: 'm1', width: W, height: H };
const build = (detections: Det[], extra: Partial<Input> = {}) => buildLogoResults({ ...base, detections, ...extra } as Input);
const POOL = '541:2026-10-12T10:38:04.000Z';

describe('AC-4.2/4.3 — referenceVersion valt terug op de poolversie', () => {
  it('embedding-detectie zonder eigen versie: item en top-level dragen de poolversie', () => {
    const r = build([det('EU_ORGANIC_FARMING')], { referenceVersion: POOL });
    expect(r.referenceVersion).toBe(POOL);
    expect(r.items[0].bewijs.referentieversie).toBe(POOL);
    expect(validateLogoResults(r)).toEqual([]);
  });
  it('detectie met eigen versie houdt die; top-level is de gesorteerde unie met de poolversie', () => {
    const r = build([det('GHS02', { method: 'ghs-specialist', reference_version: 'ghs-7' })], { referenceVersion: POOL });
    expect(r.items[0].bewijs.referentieversie).toBe('ghs-7');
    expect(r.referenceVersion).toBe([POOL, 'ghs-7'].sort().join(','));
  });
  it('zonder poolversie en zonder detectieversies blijft het unknown (gedrag van vandaag)', () => {
    expect(build([det('EU_ORGANIC_FARMING')]).referenceVersion).toBe('unknown');
    expect(build([det('EU_ORGANIC_FARMING')], { referenceVersion: null }).referenceVersion).toBe('unknown');
  });
  it('een mislukte scan zonder detecties draagt de poolversie', () => {
    const r = build([], { status: 'failed', reason: 'recognition_unavailable', referenceVersion: POOL });
    expect(r.referenceVersion).toBe(POOL);
    expect(validateLogoResults(r)).toEqual([]);
  });
  it('AC-4.2 — de omzettabel krijgt per detectie de poolversie als er geen eigen versie is', () => {
    const seen: Array<string | null> = [];
    const stub = (code: string, ctx: { modelVersion: string | null; referenceVersion: string | null }) => {
      seen.push(ctx.referenceVersion);
      const e = findGs1Entry(code)!;
      return { soort: e.soort, gs1: e.gs1, ...effectiveStand(e, ctx) };
    };
    buildLogoResults({ ...base, detections: [det('EU_ORGANIC_FARMING'), det('GHS02', { method: 'ghs-specialist', reference_version: 'ghs-7' })], referenceVersion: POOL } as Input, stub);
    expect(seen).toEqual([POOL, 'ghs-7']);
  });
});

describe('AC-4.5 — de versiecontrole kan slagen met de poolversie', () => {
  it('validFor model + pool gelijk aan de scan: niet meer beperkt door versie', () => {
    const e = { ...findGs1Entry('EU_ORGANIC_FARMING')!, opnamestand: 'automatisch' as const, validForModelVersion: 'm1', validForReferenceVersion: POOL };
    const ok = effectiveStand(e, { modelVersion: 'm1', referenceVersion: POOL });
    expect(ok.stand).toBe('automatisch');
    expect(ok.beperktDoor).toBeNull();
    const nee = effectiveStand(e, { modelVersion: 'm1', referenceVersion: 'unknown' });
    expect(nee.stand).toBe('voorstel');
    expect(nee.beperktDoor).toBe('versie');
  });
});

describe('AC-5.2 — twijfelachtig alleen bij echte twijfel', () => {
  it('embedding 0,85 zonder uncertain/requires_review: geen twijfelachtig en geen onder_drempel', () => {
    const r = build([det('EU_ORGANIC_FARMING', { confidence: 0.85 })]);
    expect(r.items[0].bewijs.redenen).not.toContain('twijfelachtig');
    expect(r.items[0].bewijs.redenen).not.toContain('onder_drempel');
    expect(r.items[0].bewijs.drempel).toBe(0.8);
  });
  it('requires_review (GHS) blijft twijfelachtig geven', () => {
    const r = build([det('GHS02', { method: 'ghs-specialist', requires_review: true })]);
    expect(r.items[0].bewijs.redenen).toContain('twijfelachtig');
  });
});

describe('AC-1.6 — blank_crop-detectie', () => {
  it('UNKNOWN met evidence blank_crop en zekerheid 0: geen item, ruwe detectie met evidence bewaard, schema geldig', () => {
    const blank = det('UNKNOWN', { confidence: 0, uncertain: true, evidence: { reason: 'blank_crop' } });
    const r = build([det('EU_ORGANIC_FARMING'), blank]);
    expect(r.items).toHaveLength(1);
    expect(r.detections.find(d => d.t3777_code === 'UNKNOWN')).toMatchObject({ confidence: 0, evidence: { reason: 'blank_crop' } });
    expect(validateLogoResults(r)).toEqual([]);
  });
});
