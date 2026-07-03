/**
 * Story 13.6 — Batch-rollback-service (rollback.ts) tests.
 *
 * Dekt (AC 2, AD-3/AD-5/AD-13/AD-15):
 *  - alle gepromoveerde referenties van de batch → active=false (SOFT-DELETE);
 *  - batch-status passed → rolled_back als conditional update;
 *  - rollback-record (wie/wanneer/waarom) in de batch-evidence (gateResults.rollback);
 *  - onbekende batch → BatchNotFoundError; status ≠ passed → BatchNotRollbackableError;
 *  - reason verplicht;
 *  - baseline-invalidatie (markBaselineStale) + ml-cache-reload aangeroepen;
 *  - her-promotie-variantLabel: buildVariantLabel per batch is uniek (geen botsing
 *    met inactieve rijen op @@unique([t3777Code, variantLabel])).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de baseline-invalidatie (schrijfkant) — hier verifiëren we alleen de aanroep.
const markBaselineStale = vi.fn();
vi.mock('../../services/flywheel/baseline', () => ({
  markBaselineStale: (...a: unknown[]) => markBaselineStale(...a),
}));

import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import {
  rollbackBatch,
  BatchNotFoundError,
  BatchNotRollbackableError,
} from '../../services/flywheel/rollback';
import { buildVariantLabel } from '../../services/flywheel/promotion';

const mockPrisma = prisma as unknown as {
  promotionBatch: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  referenceCandidate: { findMany: ReturnType<typeof vi.fn> };
  referenceLogo: { updateMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockMl = mlClient as unknown as { reloadTemplates: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.promotionBatch.findUnique.mockResolvedValue({
    id: 'batch-1',
    status: 'passed',
    gateResults: { regression: { phase: 'regression', outcome: 'passed' } },
  });
  mockPrisma.referenceCandidate.findMany.mockResolvedValue([
    { id: 'c1', referenceLogoId: 'ref-1' },
    { id: 'c2', referenceLogoId: 'ref-2' },
  ]);
  mockPrisma.promotionBatch.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.referenceLogo.updateMany.mockResolvedValue({ count: 2 });
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  markBaselineStale.mockResolvedValue(undefined);
  mockMl.reloadTemplates.mockResolvedValue(undefined);
});

describe('rollbackBatch happy path (AC 2)', () => {
  it('deactiveert alle referenties (soft-delete, active=false) — nooit DELETE', async () => {
    const res = await rollbackBatch({ batchId: 'batch-1', reason: 'foute promotie', by: 'user-1' });
    expect(res.deactivatedReferences).toBe(2);
    expect(res.candidateIds).toEqual(['c1', 'c2']);
    expect(mockPrisma.referenceLogo.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ref-1', 'ref-2'] }, active: true },
        data: { active: false },
      })
    );
  });

  it('zet batch passed → rolled_back als conditional update', async () => {
    await rollbackBatch({ batchId: 'batch-1', reason: 'foute promotie', by: 'user-1' });
    expect(mockPrisma.promotionBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1', status: 'passed' },
        data: expect.objectContaining({ status: 'rolled_back' }),
      })
    );
  });

  it('schrijft een rollback-record (wie/wanneer/waarom) in de evidence (AD-13)', async () => {
    await rollbackBatch({ batchId: 'batch-1', reason: 'foute promotie', by: 'user-1' });
    const call = mockPrisma.promotionBatch.updateMany.mock.calls[0][0];
    const gateResults = call.data.gateResults as { rollback: Record<string, unknown> };
    expect(gateResults.rollback).toMatchObject({ by: 'user-1', reason: 'foute promotie' });
    expect(gateResults.rollback.at).toBeTruthy();
    // De bestaande gateResults blijven behouden (regression-record).
    expect((gateResults as Record<string, unknown>).regression).toBeDefined();
  });

  it('markeert de baseline verouderd (AD-5) en ververst de ml-cache (AD-3)', async () => {
    await rollbackBatch({ batchId: 'batch-1', reason: 'foute promotie', by: 'user-1' });
    expect(markBaselineStale).toHaveBeenCalledWith('rollback', 'user-1');
    expect(mockMl.reloadTemplates).toHaveBeenCalledTimes(1);
  });
});

describe('rollbackBatch fouten (AC 2)', () => {
  it('onbekende batch → BatchNotFoundError (endpoint 404)', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue(null);
    await expect(
      rollbackBatch({ batchId: 'x', reason: 'r', by: 'u' })
    ).rejects.toBeInstanceOf(BatchNotFoundError);
  });

  it('status ≠ passed → BatchNotRollbackableError (endpoint 409)', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'quarantined',
      gateResults: {},
    });
    await expect(
      rollbackBatch({ batchId: 'batch-1', reason: 'r', by: 'u' })
    ).rejects.toBeInstanceOf(BatchNotRollbackableError);
    expect(mockPrisma.referenceLogo.updateMany).not.toHaveBeenCalled();
  });

  it('conditional update raakt 0 rijen (race) → BatchNotRollbackableError', async () => {
    mockPrisma.promotionBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      rollbackBatch({ batchId: 'batch-1', reason: 'r', by: 'u' })
    ).rejects.toBeInstanceOf(BatchNotRollbackableError);
  });

  it('lege reden → fout (AD-13-herleidbaarheid)', async () => {
    await expect(
      rollbackBatch({ batchId: 'batch-1', reason: '  ', by: 'u' })
    ).rejects.toThrow(/reden/i);
  });
});

describe('her-promotie na rollback (AD-3, variantLabel-uniciteit)', () => {
  it('een latere batch krijgt een ander variantLabel — geen botsing met inactieve rijen', () => {
    // De gerollbackte batch promoveerde met deze labels...
    const oldLabel = buildVariantLabel('aaaaaaaa-0000-0000-0000-000000000000', 1);
    // ...een her-promotie in een NIEUWE batch krijgt een ander batchShortId-prefix.
    const newLabel = buildVariantLabel('bbbbbbbb-0000-0000-0000-000000000000', 1);
    expect(oldLabel).not.toBe(newLabel);
    // Zelfde @@unique([t3777Code, variantLabel]) botst dus nooit met de inactieve rij.
  });
});
