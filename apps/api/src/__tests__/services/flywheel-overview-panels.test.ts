/**
 * Story 15.2 — modulaire overview-sub-services (AC1/AC4/AC5/AC7).
 *
 * Unit-tests per paneel-sub-service met gemockte Prisma. Elke sub-service is
 * ON-READ en best-effort: een leesfout degradeert het paneel (leeg/null), nooit
 * een throw naar de compositie.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getPrecisionTrend } from '../../services/flywheel/overview/precision-trend';
import { getQuarantinePanel } from '../../services/flywheel/overview/quarantine';
import { getKpiPanel } from '../../services/flywheel/overview/kpi';
import { getClassCapsPanel } from '../../services/flywheel/overview/class-caps';
import { getHistoryPanel } from '../../services/flywheel/overview/history';
import {
  getBootstrapQueuePanel,
  getGlnCoveragePanel,
} from '../../services/flywheel/overview/empty-panels';

type Mock = ReturnType<typeof vi.fn>;
async function db() {
  return (await import('../../core/db')).default as unknown as {
    promotionBatch: { findMany: Mock; findFirst: Mock; count: Mock };
    referenceLogo: { findMany: Mock; groupBy: Mock };
    referenceCandidate: { groupBy: Mock };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('precisionTrend (AC1) — één meetpunt per afgesloten batch', () => {
  it('markeert een gequarantaineerde batch als regressie-punt met caption', async () => {
    const prisma = await db();
    prisma.promotionBatch.findMany.mockResolvedValueOnce([
      {
        id: 'b1',
        status: 'passed',
        closedAt: new Date('2026-06-20T00:00:00Z'),
        createdAt: new Date('2026-06-20T00:00:00Z'),
        baselineMeasurement: { precision: 0.97 },
        gateResults: {},
      },
      {
        id: 'b2',
        status: 'quarantined',
        closedAt: new Date('2026-06-24T00:00:00Z'),
        createdAt: new Date('2026-06-24T00:00:00Z'),
        baselineMeasurement: null,
        gateResults: {
          regression: { details: { mode: 'pp', delta: 1.8, measurement: { precision: 0.955 } } },
        },
      },
    ]);

    const panel = await getPrecisionTrend();
    expect(panel.points).toHaveLength(2);
    const reg = panel.points.find((p) => p.batchId === 'b2')!;
    expect(reg.regression).toBe(true);
    expect(reg.precision).toBeCloseTo(0.955, 5);
    expect(reg.caption).toContain('1.8 pt');
    // Laatste GEMETEN punt is b2 (0,955); delta t.o.v. b1 (0,97) = -1,5 pt.
    expect(panel.latestPrecision).toBeCloseTo(0.955, 5);
    expect(panel.latestDeltaPp).toBeCloseTo(-1.5, 1);
    expect(panel.tolerancePp).toBe(1);
  });

  it('faalt best-effort naar een leeg paneel bij een leesfout', async () => {
    const prisma = await db();
    prisma.promotionBatch.findMany.mockRejectedValueOnce(new Error('db down'));
    const panel = await getPrecisionTrend();
    expect(panel.points).toEqual([]);
    expect(panel.latestPrecision).toBeNull();
  });
});

describe('quarantine (AC1/AC3) — faalreden als tekst + poort-uitkomsten', () => {
  it('toont de faalreden als tekst en levert gateResults voor de drawer', async () => {
    const prisma = await db();
    prisma.promotionBatch.findMany.mockResolvedValueOnce([
      {
        id: 'q1',
        status: 'quarantined',
        createdAt: new Date('2026-06-28T03:04:00Z'),
        gateResults: {
          regression: {
            details: {
              mode: 'pp',
              delta: 1.8,
              mostAffectedClasses: ['EU_ORGANIC', 'RAINFOREST_ALLIANCE'],
            },
          },
        },
        _count: { candidates: 8 },
      },
    ]);

    const panel = await getQuarantinePanel();
    expect(panel.count).toBe(1);
    const row = panel.rows[0];
    expect(row.candidateCount).toBe(8);
    expect(row.failReason).toContain('precisiedaling');
    expect(row.failReason).toContain('1.8 pt');
    expect(row.mostAffectedClasses).toEqual(['EU_ORGANIC', 'RAINFOREST_ALLIANCE']);
    expect(row.gateResults).toBeDefined();
  });

  it('valt best-effort terug op leeg bij een leesfout', async () => {
    const prisma = await db();
    prisma.promotionBatch.findMany.mockRejectedValueOnce(new Error('db down'));
    const panel = await getQuarantinePanel();
    expect(panel).toEqual({ rows: [], count: 0 });
  });
});

describe('kpi (AC7) — precisie, promoties, quarantaine-ouderdom, cap', () => {
  it('bevat de openstaande quarantaines met ouderdom (SM-5)', async () => {
    const prisma = await db();
    // getGoldSetPrecision
    prisma.promotionBatch.findFirst
      .mockResolvedValueOnce({ baselineMeasurement: { precision: 0.97 } })
      // getQuarantineKpi oldest
      .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) });
    // getNewReferences refs
    prisma.referenceLogo.findMany.mockResolvedValueOnce([
      { t3777Code: 'A' },
      { t3777Code: 'B' },
    ]);
    // getNewReferences passedBatches + getQuarantineKpi count
    prisma.promotionBatch.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    // getClassesAtCap groupBy
    prisma.referenceLogo.groupBy.mockResolvedValueOnce([
      { t3777Code: 'A', _count: { _all: 10 } },
      { t3777Code: 'B', _count: { _all: 4 } },
    ]);

    const panel = await getKpiPanel();
    expect(panel.goldSetPrecision).toBeCloseTo(0.97, 5);
    expect(panel.newReferences.count).toBe(2);
    expect(panel.newReferences.classCount).toBe(2);
    expect(panel.quarantine.count).toBe(1);
    expect(panel.quarantine.oldestAgeHours).toBe(5);
    expect(panel.classesAtCap.count).toBe(1); // alleen A ≥ cap 10
    expect(panel.classesAtCap.cap).toBe(10);
  });
});

describe('classCaps (AC1) — klassen aan cap + geweigerde nominaties', () => {
  it('toont alleen klassen op/boven de cap met hun geweigerde nominaties', async () => {
    const prisma = await db();
    prisma.referenceLogo.groupBy.mockResolvedValueOnce([
      { t3777Code: 'RECYCLABLE', _count: { _all: 10 } },
      { t3777Code: 'GREEN_DOT', _count: { _all: 10 } },
      { t3777Code: 'FSC_MIX', _count: { _all: 3 } },
    ]);
    prisma.referenceCandidate.groupBy.mockResolvedValueOnce([
      { t3777Code: 'RECYCLABLE', _count: { _all: 14 } },
      { t3777Code: 'GREEN_DOT', _count: { _all: 6 } },
    ]);

    const panel = await getClassCapsPanel();
    expect(panel.classes).toHaveLength(2);
    // Aflopend op geweigerde nominaties: RECYCLABLE (14) boven GREEN_DOT (6).
    expect(panel.classes[0].t3777Code).toBe('RECYCLABLE');
    expect(panel.classes[0].rejectedNominations).toBe(14);
    expect(panel.classes[1].t3777Code).toBe('GREEN_DOT');
  });
});

describe('history (AC5) — gepasseerde + teruggedraaide batches', () => {
  it('markeert een teruggedraaide batch met rollback-context', async () => {
    const prisma = await db();
    prisma.promotionBatch.findMany.mockResolvedValueOnce([
      {
        id: 'h1',
        status: 'rolled_back',
        createdAt: new Date('2026-06-21T00:00:00Z'),
        closedAt: new Date('2026-06-22T00:00:00Z'),
        baselineMeasurement: { precision: 0.96 },
        gateResults: { rollback: { by: 'u1', reason: 'foute promotie', at: '2026-06-22T00:00:00Z' } },
      },
      {
        id: 'h2',
        status: 'passed',
        createdAt: new Date('2026-06-20T00:00:00Z'),
        closedAt: new Date('2026-06-20T00:00:00Z'),
        baselineMeasurement: { precision: 0.97 },
        gateResults: {},
      },
    ]);

    const panel = await getHistoryPanel();
    expect(panel.count).toBe(2);
    const rolled = panel.rows.find((r) => r.batchId === 'h1')!;
    expect(rolled.rolledBack).toBe(true);
    expect(rolled.rollback).toMatchObject({ by: 'u1', reason: 'foute promotie' });
    const passed = panel.rows.find((r) => r.batchId === 'h2')!;
    expect(passed.rolledBack).toBe(false);
    expect(passed.rollback).toBeNull();
  });
});

describe('lege-staat-panelen (UX-DR8) — bron-epic nog niet gebouwd', () => {
  it('bootstrap/gln geven expliciete lege staat', () => {
    // mismatch-trends is per Story 16.1 een echte sub-service (zie
    // flywheel-mismatch.test.ts) en geen lege-staat-stub meer.
    expect(getBootstrapQueuePanel()).toEqual({ available: false, sourceEpic: 'epic-17', items: [] });
    expect(getGlnCoveragePanel()).toEqual({ available: false, sourceEpic: 'epic-18', items: [] });
  });
});
