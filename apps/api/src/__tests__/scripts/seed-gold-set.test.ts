/**
 * Story 13.3 — Gold-set seed-import unit-tests (AC 2).
 *
 * Dekt: parsing van beide bronformaten (91 crops + 74 GTINs → 212 (gtin,code)),
 * label-mapping, GTIN→records-uitwaaiering per code; idempotentie (tweede run
 * plant 0 inserts); dedup-sleutel-spiegeling; en dat de plan-bouw puur is (geen
 * writes). De --dry-run-garantie (0 writes) volgt uit het feit dat de dry-run
 * enkel `buildImportPlan` + print aanroept en `writePlan` nooit raakt.
 *
 * Pure helpers only — importeren draait main() NIET (require.main-guard).
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  planOogstrunRecords,
  planDeclaredMarks,
  buildImportPlan,
  oogstrunDedupKey,
  declaredDedupKey,
  dedupKeyForExisting,
  resolveSourcePaths,
  SOURCE_OOGSTRUN,
  SOURCE_DECLARED,
  type OogstrunFile,
  type DeclaredMarksEntry,
} from '../../scripts/seed-gold-set';

function loadRealSources(): { oogstrun: OogstrunFile; declared: DeclaredMarksEntry[] } {
  const paths = resolveSourcePaths();
  return {
    oogstrun: JSON.parse(fs.readFileSync(paths.oogstrun, 'utf-8')),
    declared: JSON.parse(fs.readFileSync(paths.declared, 'utf-8')),
  };
}

describe('Story 13.3 — seed-gold-set helpers (AC2)', () => {
  it('resolveSourcePaths wijst naar de twee bevroren snapshots die bestaan', () => {
    const paths = resolveSourcePaths();
    expect(fs.existsSync(paths.oogstrun)).toBe(true);
    expect(fs.existsSync(paths.declared)).toBe(true);
  });

  it('parseert 91 oogstrun-records met crop-niveau (cropPath gevuld, label ECHT/VALS)', () => {
    const { oogstrun } = loadRealSources();
    const planned = planOogstrunRecords(oogstrun);
    expect(planned).toHaveLength(91);
    expect(planned.every((p) => p.source === SOURCE_OOGSTRUN)).toBe(true);
    expect(planned.every((p) => p.cropPath !== null && p.cropPath.length > 0)).toBe(true);
    expect(planned.every((p) => p.label === 'ECHT' || p.label === 'VALS')).toBe(true);
    // Evidence bewaart de bron-id + volledige context (AD-13).
    expect(planned[0].evidence).toHaveProperty('sourceRecordId');
    expect(planned[0].evidence).toHaveProperty('bbox');
  });

  it('waait 74 GTINs uit naar 212 GTIN-niveau records (cropPath NULL, label ECHT)', () => {
    const { declared } = loadRealSources();
    const planned = planDeclaredMarks(declared);
    const totalPairs = declared.reduce((n, d) => n + d.codes.length, 0);
    expect(planned).toHaveLength(totalPairs);
    expect(totalPairs).toBe(212);
    expect(planned.every((p) => p.source === SOURCE_DECLARED)).toBe(true);
    expect(planned.every((p) => p.cropPath === null)).toBe(true);
    expect(planned.every((p) => p.label === 'ECHT')).toBe(true);
    expect(planned[0].evidence).toHaveProperty('gtin');
  });

  it('buildImportPlan tegen lege DB plant alle 91 + 212 = 303 records', () => {
    const { oogstrun, declared } = loadRealSources();
    const plan = buildImportPlan(oogstrun, declared, new Set());
    expect(plan.summary.toInsert).toBe(303);
    expect(plan.summary.alreadyPresent).toBe(0);
    expect(plan.summary.perSource[SOURCE_OOGSTRUN]).toBe(91);
    expect(plan.summary.perSource[SOURCE_DECLARED]).toBe(212);
    expect(plan.summary.perLabel.VALS).toBeGreaterThan(0);
    expect(plan.summary.perLabel.ECHT).toBeGreaterThan(0);
  });

  it('idempotentie: een tweede run met alle sleutels aanwezig plant 0 inserts (AC2)', () => {
    const { oogstrun, declared } = loadRealSources();
    // Eerste run: verzamel alle geplande dedup-sleutels.
    const first = buildImportPlan(oogstrun, declared, new Set());
    const allKeys = new Set(first.planned.map((p) => p.dedupKey));
    // Tweede run met die sleutels als "bestaand".
    const second = buildImportPlan(oogstrun, declared, allKeys);
    expect(second.summary.toInsert).toBe(0);
    expect(second.summary.alreadyPresent).toBe(303);
    expect(second.planned).toHaveLength(0);
  });

  it('dedupKeyForExisting spiegelt de plan-sleutels voor beide bronnen (herkent bestaande rijen)', () => {
    // oogstrun: sleutel op evidence.sourceRecordId
    const oKey = dedupKeyForExisting({
      source: SOURCE_OOGSTRUN,
      t3777Code: 'GREEN_DOT',
      evidence: { sourceRecordId: 'abc-123' },
    });
    expect(oKey).toBe(oogstrunDedupKey('abc-123'));

    // declared: sleutel op (gtin, code)
    const dKey = dedupKeyForExisting({
      source: SOURCE_DECLARED,
      t3777Code: 'TRIMAN',
      evidence: { gtin: '04001724023845' },
    });
    expect(dKey).toBe(declaredDedupKey('04001724023845', 'TRIMAN'));
  });

  it('duplicaten BINNEN dezelfde run worden ook maar één keer gepland', () => {
    const oogstrun: OogstrunFile = {
      meta: {},
      records: [
        { id: 'dup', label: 'ECHT', t3777Code: 'X', cropPath: 'a.png' },
        { id: 'dup', label: 'ECHT', t3777Code: 'X', cropPath: 'a.png' },
      ],
    };
    const plan = buildImportPlan(oogstrun, [], new Set());
    expect(plan.summary.toInsert).toBe(1);
    expect(plan.summary.alreadyPresent).toBe(1);
  });

  it('round-trip: alle geplande oogstrun-sleutels worden door dedupKeyForExisting herkend', () => {
    const { oogstrun } = loadRealSources();
    const planned = planOogstrunRecords(oogstrun);
    for (const p of planned) {
      const existingKey = dedupKeyForExisting({
        source: p.source,
        t3777Code: p.t3777Code,
        evidence: p.evidence,
      });
      expect(existingKey).toBe(p.dedupKey);
    }
  });
});
