/**
 * Story 18.1 — GLN-dekkingsgraad-paneel (AC3, FR-21, UX-DR3).
 *
 * On-read sub-service met gemockte Prisma: percentage records-met-GLN, totalen,
 * uitval-verdeling per reden, en de deling-door-nul-rand (lege tabel).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getGlnCoveragePanel, GLN_COVERAGE_TARGET } from '../../services/flywheel/overview/gln-coverage';

type Mock = ReturnType<typeof vi.fn>;
async function db() {
  return (await import('../../core/db')).default as unknown as {
    artworkImport: { count: Mock; groupBy: Mock };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('glnCoverage (AC3) — dekkingsgraad + uitval-verdeling', () => {
  it('berekent percentage, totalen en aflopende uitval-verdeling per reden', async () => {
    const prisma = await db();
    // count(): eerst total, dan withGln (volgorde in Promise.all = declaratie-volgorde).
    prisma.artworkImport.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(92); // withGln
    prisma.artworkImport.groupBy.mockResolvedValueOnce([
      { glnBackfillReason: 'geen-tradeitem', _count: { _all: 5 } },
      { glnBackfillReason: 'meerdere-glns', _count: { _all: 2 } },
      { glnBackfillReason: null, _count: { _all: 1 } },
    ]);

    const panel = await getGlnCoveragePanel();

    expect(panel.available).toBe(true);
    expect(panel.total).toBe(100);
    expect(panel.withGln).toBe(92);
    expect(panel.withoutGln).toBe(8);
    expect(panel.percentage).toBeCloseTo(0.92, 5);
    expect(panel.target).toBe(GLN_COVERAGE_TARGET);
    expect(panel.targetMet).toBe(true); // 0,92 ≥ 0,90
    // Aflopend gesorteerd; null-reden mapt naar 'niet-verwerkt'.
    expect(panel.reasons).toEqual([
      { reason: 'geen-tradeitem', count: 5 },
      { reason: 'meerdere-glns', count: 2 },
      { reason: 'niet-verwerkt', count: 1 },
    ]);
  });

  it('markeert targetMet=false onder de ≥90%-lijn', async () => {
    const prisma = await db();
    prisma.artworkImport.count.mockResolvedValueOnce(100).mockResolvedValueOnce(80);
    prisma.artworkImport.groupBy.mockResolvedValueOnce([
      { glnBackfillReason: 'geen-tradeitem', _count: { _all: 20 } },
    ]);

    const panel = await getGlnCoveragePanel();
    expect(panel.percentage).toBeCloseTo(0.8, 5);
    expect(panel.targetMet).toBe(false);
  });

  it('geeft percentage=null bij een lege tabel (geen deling door nul)', async () => {
    const prisma = await db();
    prisma.artworkImport.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.artworkImport.groupBy.mockResolvedValueOnce([]);

    const panel = await getGlnCoveragePanel();
    expect(panel.total).toBe(0);
    expect(panel.percentage).toBeNull();
    expect(panel.targetMet).toBe(false);
    expect(panel.reasons).toEqual([]);
  });

  it('gooit bij een DB-fout zodat de composer het paneel sectie-lokaal afvangt', async () => {
    const prisma = await db();
    prisma.artworkImport.count.mockRejectedValueOnce(new Error('db down'));
    prisma.artworkImport.count.mockResolvedValueOnce(0);
    prisma.artworkImport.groupBy.mockResolvedValueOnce([]);

    await expect(getGlnCoveragePanel()).rejects.toThrow();
  });
});
