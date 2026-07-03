/**
 * Story 15.3 — batch-detail- + batch-close-service (unit-tests).
 *
 * Dekt:
 *   AC1  getBatchDetail bouwt de kop (faalreden, poort-uitkomsten, delta) +
 *        kandidaten (evidence-contract, crop/referentie-flag); 404 onbekende id.
 *   AC4  closeBatch zet closedAt zodra alle kandidaten beoordeeld zijn (geen
 *        in_batch); status blijft quarantined; 409 bij onbeoordeelde kandidaten /
 *        niet-afsluitbaar; 404 onbekend. GEEN poortlogica.
 *
 * prisma is globaal gemockt (setup.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import {
  getBatchDetail,
  BatchDetailNotFoundError,
} from '../../services/flywheel/batch-detail';
import {
  closeBatch,
  BatchCloseNotFoundError,
  BatchNotFullyReviewedError,
  BatchNotCloseableError,
} from '../../services/flywheel/batch-close';

const mockPrisma = prisma as unknown as {
  promotionBatch: { findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  referenceCandidate: {
    findMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  referenceLogo: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe('getBatchDetail (AC1)', () => {
  it('gooit BatchDetailNotFoundError bij een onbekende batch', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue(null);
    await expect(getBatchDetail('nope')).rejects.toBeInstanceOf(BatchDetailNotFoundError);
  });

  it('bouwt de kop met faalreden + poort-uitkomsten en de kandidaten met evidence', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'quarantined',
      createdAt: new Date('2026-06-28T03:04:00.000Z'),
      closedAt: null,
      gateResults: {
        cap: { outcome: 'passed' },
        dedup: { outcome: 'passed' },
        regression: {
          outcome: 'rejected-some',
          details: { decision: 'quarantine', mode: 'pp', delta: 1.8, mostAffectedClasses: ['EU_ORGANIC'] },
        },
      },
    });
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      {
        id: 'c1',
        t3777Code: 'RAINFOREST_ALLIANCE',
        status: 'in_batch',
        origin: 'crosscheck',
        cropPath: 'candidates/c1.png',
        evidence: {
          scores: { confidence: 0.94 },
          method: 'embedding',
          sourceGtin: '8712345000048',
          sourceFile: 'pack.tif',
          bbox: { x: 1, y: 2, width: 412, height: 398 },
          declarationOutcome: 'confirmed',
          gln: '8712345000000',
        },
      },
    ]);
    mockPrisma.referenceLogo.findMany.mockResolvedValue([{ t3777Code: 'RAINFOREST_ALLIANCE' }]);

    const detail = await getBatchDetail('b1');

    expect(detail.batch.failReason).toContain('precisiedaling');
    expect(detail.batch.deltaPp).toBe(1.8);
    expect(detail.batch.mostAffectedClasses).toEqual(['EU_ORGANIC']);

    // Poort-uitkomsten: cap/dedup gepasseerd, regressie geblokkeerd.
    const regression = detail.batch.gateOutcomes.find((g) => g.phase === 'regression');
    expect(regression?.blocked).toBe(true);
    const cap = detail.batch.gateOutcomes.find((g) => g.phase === 'cap');
    expect(cap?.blocked).toBe(false);

    // Kandidaat evidence + crop/referentie-flags.
    const c = detail.candidates[0];
    expect(c.confidence).toBe(0.94);
    expect(c.method).toBe('embedding');
    expect(c.sourceGtin).toBe('8712345000048');
    expect(c.hasCrop).toBe(true);
    expect(c.hasReference).toBe(true);
    expect(detail.promotionThresholds.embedding).toBeTypeOf('number');
  });
});

describe('closeBatch (AC4)', () => {
  it('gooit BatchCloseNotFoundError bij een onbekende batch', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue(null);
    await expect(closeBatch('nope')).rejects.toBeInstanceOf(BatchCloseNotFoundError);
  });

  it('weigert met 409 als de batch niet quarantined is of al afgesloten', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({ id: 'b1', status: 'passed', closedAt: null });
    await expect(closeBatch('b1')).rejects.toBeInstanceOf(BatchNotCloseableError);

    mockPrisma.promotionBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'quarantined',
      closedAt: new Date(),
    });
    await expect(closeBatch('b1')).rejects.toBeInstanceOf(BatchNotCloseableError);
  });

  it('weigert met 409 als er nog in_batch-kandidaten zijn (onbeoordeeld)', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({ id: 'b1', status: 'quarantined', closedAt: null });
    mockPrisma.referenceCandidate.groupBy.mockResolvedValue([
      { status: 'in_batch', _count: { _all: 2 } },
      { status: 'rejected', _count: { _all: 1 } },
    ]);
    await expect(closeBatch('b1')).rejects.toBeInstanceOf(BatchNotFullyReviewedError);
  });

  it('zet closedAt zodra alles beoordeeld is; status blijft quarantined; telt afgekeurd/vrijgegeven', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({ id: 'b1', status: 'quarantined', closedAt: null });
    mockPrisma.referenceCandidate.groupBy.mockResolvedValue([{ status: 'rejected', _count: { _all: 3 } }]);
    // Vrijgegeven kandidaten (losgekoppeld) met undoBatchId === b1.
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { evidence: { undoBatchId: 'b1' } },
      { evidence: { undoBatchId: 'b1' } },
      { evidence: { undoBatchId: 'andere' } },
    ]);
    mockPrisma.promotionBatch.updateMany.mockResolvedValue({ count: 1 });

    const res = await closeBatch('b1');
    expect(res.rejected).toBe(3);
    expect(res.released).toBe(2);
    // closedAt-update is conditioneel op quarantined + closedAt null (status blijft).
    expect(mockPrisma.promotionBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1', status: 'quarantined', closedAt: null },
        data: expect.objectContaining({ closedAt: expect.any(Date) }),
      })
    );
  });
});
