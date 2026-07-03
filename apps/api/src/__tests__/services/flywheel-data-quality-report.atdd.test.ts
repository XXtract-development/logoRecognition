/**
 * Story 16.3 — Datakwaliteitsrapport "gevonden-niet-gedeclareerd" (FR-16).
 *
 * AC→test-mapping (zie ac-trace-16-3.md):
 *   AC1 → describe 'buildDataQualityReport (groepering per GLN + periode + filter)'
 *         (groepering, GLN=null → "onbekend", per-geval-velden, half-open periode,
 *         GLN-filter, cohort-uitsluiting-argument, lege respons) +
 *         'toDataQualityCsv (serialisatie)' (velden, quoting, lege export).
 *   AC2 → describe 'NFR-6 bronrestrictie' (een reference-logos/-pad lekt niet in
 *         de payload) — samen met flywheel-reference-path-guard.test.ts.
 *
 * Bindend: GEEN tweede confidence-drempel (16.1 filtert al); cohort uitgesloten.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import {
  buildDataQualityReport,
  toDataQualityCsv,
  DATA_QUALITY_CSV_HEADER,
  UNKNOWN_GLN_LABEL,
} from '../../services/flywheel/data-quality-report';

const mockPrisma = prisma as unknown as Record<string, any>;

/** Bouw een ruwe found-not-declared event-rij (zoals findMany select 'm teruggeeft). */
function ev(
  overrides: Partial<{
    gtin: string;
    gln: string | null;
    t3777Code: string;
    confidence: number | null;
    runId: string | null;
  }> = {}
) {
  return {
    gtin: overrides.gtin ?? '08710400012345',
    // null is een geldige (bewuste) waarde → niet naar de default vallen.
    gln: 'gln' in overrides ? overrides.gln : '8710400000001',
    t3777Code: overrides.t3777Code ?? 'E-1',
    confidence: 'confidence' in overrides ? overrides.confidence : 0.91,
    runId: 'runId' in overrides ? overrides.runId : 'run-1',
  };
}

describe('Story 16.3 AC1 — buildDataQualityReport (groepering per GLN + periode + filter)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groepeert per GLN; GLN=null → groep "onbekend"; per geval GTIN/code/confidence/bronbestand', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      ev({ gln: 'GLN-A', gtin: 'G1', t3777Code: 'E-1', confidence: 0.9 }),
      ev({ gln: 'GLN-A', gtin: 'G2', t3777Code: 'E-2', confidence: 0.95 }),
      ev({ gln: null, gtin: 'G3', t3777Code: 'E-3', confidence: 0.88 }),
    ]);

    const report = await buildDataQualityReport();

    expect(report.totalCases).toBe(3);
    expect(report.groups.map((g) => g.gln)).toEqual(['GLN-A', UNKNOWN_GLN_LABEL]);

    const groupA = report.groups.find((g) => g.gln === 'GLN-A')!;
    expect(groupA.cases).toHaveLength(2);
    expect(groupA.cases[0]).toMatchObject({
      gtin: 'G1',
      code: 'E-1',
      confidence: 0.9,
      sourceFile: 'artwork-crops/G1/',
      runId: 'run-1',
    });

    const unknown = report.groups.find((g) => g.gln === UNKNOWN_GLN_LABEL)!;
    expect(unknown.cases[0]).toMatchObject({ gtin: 'G3', code: 'E-3' });
  });

  it('vraagt alleen found-not-declared, cohort uitgesloten (query-argument)', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    await buildDataQualityReport();
    const arg = mockPrisma.mismatchEvent.findMany.mock.calls[0][0];
    expect(arg.where.type).toBe('found-not-declared');
    expect(arg.where.NOT).toEqual({ origin: { startsWith: 'cohort-' } });
  });

  it('periode is half-open [from, to): from→gte, to→lt', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-31T00:00:00.000Z');
    const report = await buildDataQualityReport({ from, to });

    const arg = mockPrisma.mismatchEvent.findMany.mock.calls[0][0];
    expect(arg.where.createdAt).toEqual({ gte: from, lt: to });
    expect(report.from).toBe(from.toISOString());
    expect(report.to).toBe(to.toISOString());
  });

  it('optionele GLN-filter wordt doorgezet naar de query en het rapportmodel', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    const report = await buildDataQualityReport({ gln: 'GLN-X' });
    const arg = mockPrisma.mismatchEvent.findMany.mock.calls[0][0];
    expect(arg.where.gln).toBe('GLN-X');
    expect(report.gln).toBe('GLN-X');
  });

  it('zonder periode/gln bevat de where geen createdAt/gln (geen onbedoelde filters)', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    await buildDataQualityReport();
    const arg = mockPrisma.mismatchEvent.findMany.mock.calls[0][0];
    expect(arg.where.createdAt).toBeUndefined();
    expect(arg.where.gln).toBeUndefined();
  });

  it('lege periode (geen events) → geldige lege respons', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([]);
    const report = await buildDataQualityReport({ from: new Date('2026-01-01') });
    expect(report.totalCases).toBe(0);
    expect(report.groups).toEqual([]);
  });

  it('leest ALLE found-not-declared-events (geen tweede confidence-drempel hier)', async () => {
    // Een laag-confidence-event zou 16.1 nooit hebben geschreven; als het tóch in
    // de tabel staat, filtert dit rapport het NIET opnieuw (één drempel-impl.).
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      ev({ confidence: 0.1, gtin: 'G9' }),
    ]);
    const report = await buildDataQualityReport();
    expect(report.totalCases).toBe(1);
    expect(report.groups[0].cases[0].confidence).toBe(0.1);
  });
});

describe('Story 16.3 AC2 — NFR-6 bronrestrictie (geen gidsbeeld in de payload)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('afgeleid bronbestand is altijd een eigen crop-pad (artwork-crops/), nooit reference-logos/', async () => {
    mockPrisma.mismatchEvent.findMany.mockResolvedValue([
      ev({ gtin: 'GX' }),
      ev({ gtin: 'GY', gln: null }),
    ]);
    const report = await buildDataQualityReport();
    const allPaths = report.groups.flatMap((g) => g.cases.map((c) => c.sourceFile ?? ''));
    for (const p of allPaths) {
      expect(p.startsWith('artwork-crops/')).toBe(true);
      expect(p.includes('reference-logos/')).toBe(false);
    }
  });
});

describe('Story 16.3 AC1 — toDataQualityCsv (serialisatie)', () => {
  it('kopregel + één rij per geval, GLN als eerste kolom', () => {
    const csv = toDataQualityCsv({
      from: null,
      to: null,
      gln: null,
      totalCases: 2,
      groups: [
        {
          gln: 'GLN-A',
          cases: [
            { gtin: 'G1', code: 'E-1', confidence: 0.9, sourceFile: 'artwork-crops/G1/', runId: 'r1' },
          ],
        },
        {
          gln: UNKNOWN_GLN_LABEL,
          cases: [
            { gtin: 'G3', code: 'E-3', confidence: null, sourceFile: null, runId: null },
          ],
        },
      ],
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe(DATA_QUALITY_CSV_HEADER.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('GLN-A,G1,E-1,0.9,artwork-crops/G1/,r1');
    // null-velden → lege cellen
    expect(lines[2]).toBe('onbekend,G3,E-3,,,');
  });

  it('quoteert velden met komma of quote (delimiter-randgeval)', () => {
    const csv = toDataQualityCsv({
      from: null,
      to: null,
      gln: null,
      totalCases: 1,
      groups: [
        {
          gln: 'GLN,MET,KOMMA',
          cases: [
            { gtin: 'G"1', code: 'E-1', confidence: 0.5, sourceFile: 'artwork-crops/G1/', runId: 'r1' },
          ],
        },
      ],
    });
    const dataLine = csv.split('\n')[1];
    expect(dataLine).toContain('"GLN,MET,KOMMA"');
    expect(dataLine).toContain('"G""1"');
  });

  it('leeg rapport → enkel de kopregel (geldige lege export)', () => {
    const csv = toDataQualityCsv({ from: null, to: null, gln: null, totalCases: 0, groups: [] });
    expect(csv).toBe(DATA_QUALITY_CSV_HEADER.join(','));
  });
});
