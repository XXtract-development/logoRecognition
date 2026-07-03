/**
 * Story 15.3 — Kandidaat-beslissing bij quarantaine-afhandeling (service-unit-tests).
 *
 * Dekt de bindende AC's op service-niveau:
 *   AC2  afkeuren → conditional update in_batch→rejected + hard-negative (BESTAANDE
 *        contentHash, geen /ml/phash) + gold-set-VALS-aanwas via de 14.1-service.
 *   AC3  vrijgeven → in_batch→candidate, losgekoppeld; GEEN poortlogica (assert:
 *        geen ml-client-calls) + 409 op een kandidaat in een batch in verwerking.
 *   4.3  undo → afkeuring terugnemen (hard-negative weg + gold-set self-tombstone +
 *        in_batch); vrijgave terugnemen (candidate→in_batch, herkoppeld).
 *   AD-16 conditional-update-race (0 rows → conflict), 404 onbekende kandidaat.
 *
 * prisma + ml-client zijn globaal gemockt in setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import {
  decideCandidate,
  isCandidateDecision,
  CandidateNotFoundError,
  CandidateBatchProcessingError,
  CandidateConflictError,
  QUARANTINE_REJECT_REASON,
  QUARANTINE_GOLD_SET_SOURCE,
} from '../../services/flywheel/candidate-decision';
import { HUMAN_HARD_NEGATIVE_REASONS } from '../../services/flywheel/types';
import { HUMAN_GOLD_SET_SOURCES } from '../../services/flywheel/gold-set';

const mockPrisma = prisma as unknown as {
  referenceCandidate: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  hardNegative: { upsert: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  goldSetRecord: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockMl = mlClient as unknown as {
  computePhash: ReturnType<typeof vi.fn>;
  reloadTemplates: ReturnType<typeof vi.fn>;
};

const CAND = {
  id: 'cand-9',
  status: 'in_batch',
  t3777Code: 'RAINFOREST_ALLIANCE',
  cropPath: 'candidates/cand-9.png',
  contentHash: 'abc123',
  evidence: { scores: { confidence: 0.94 }, statusTransitions: [] },
  promotionBatchId: 'batch-7',
  promotionBatch: { status: 'quarantined' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.hardNegative.upsert.mockResolvedValue({ id: 'hn-1' });
  mockPrisma.hardNegative.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.goldSetRecord.create.mockResolvedValue({ id: 'gold-1' });
  mockPrisma.goldSetRecord.updateMany.mockResolvedValue({ count: 1 });
});

describe('isCandidateDecision', () => {
  it('accepteert de drie beslissingen en weigert onbekende', () => {
    expect(isCandidateDecision('afkeuren')).toBe(true);
    expect(isCandidateDecision('vrijgeven')).toBe(true);
    expect(isCandidateDecision('undo')).toBe(true);
    expect(isCandidateDecision('verwijderen')).toBe(false);
  });
});

describe('contract-constanten (13.6-enum / 14.1-bronnen)', () => {
  it('QUARANTINE_REJECT_REASON is een menselijke hard-negative-reden', () => {
    expect(QUARANTINE_REJECT_REASON).toBe('quarantaine-afkeuring');
    expect(HUMAN_HARD_NEGATIVE_REASONS).toContain(QUARANTINE_REJECT_REASON);
  });
  it('QUARANTINE_GOLD_SET_SOURCE is een toegestane menselijke gold-set-bron', () => {
    expect(QUARANTINE_GOLD_SET_SOURCE).toBe('quarantaine');
    expect(HUMAN_GOLD_SET_SOURCES).toContain(QUARANTINE_GOLD_SET_SOURCE);
  });
});

describe('decideCandidate — 404 / 409-poort (AD-16)', () => {
  it('onbekende kandidaat → CandidateNotFoundError', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue(null);
    await expect(decideCandidate({ candidateId: 'x', decision: 'afkeuren', by: 'u1' })).rejects.toBeInstanceOf(
      CandidateNotFoundError
    );
  });

  it('kandidaat in een batch IN VERWERKING (pending) → CandidateBatchProcessingError (409)', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      ...CAND,
      promotionBatch: { status: 'pending' },
    });
    await expect(decideCandidate({ candidateId: CAND.id, decision: 'afkeuren', by: 'u1' })).rejects.toBeInstanceOf(
      CandidateBatchProcessingError
    );
    expect(mockPrisma.referenceCandidate.updateMany).not.toHaveBeenCalled();
  });
});

describe('decideCandidate — afkeuren (AC2)', () => {
  beforeEach(() => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({ ...CAND });
  });

  it('zet in_batch→rejected via conditional update, schrijft hard-negative met de BESTAANDE contentHash', async () => {
    const res = await decideCandidate({ candidateId: CAND.id, decision: 'afkeuren', by: 'u1' });
    expect(res.status).toBe('rejected');

    // Conditional update: WHERE status='in_batch'.
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CAND.id, status: 'in_batch' },
        data: expect.objectContaining({ status: 'rejected' }),
      })
    );

    // Hard-negative met de bestaande hash + canonieke reden — GEEN nieuwe /ml/phash.
    expect(mockPrisma.hardNegative.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentHash: 'abc123' },
        create: expect.objectContaining({ contentHash: 'abc123', reason: QUARANTINE_REJECT_REASON }),
      })
    );
    expect(mockMl.computePhash).not.toHaveBeenCalled();
  });

  it('roept de HERBRUIKBARE 14.1-aanwasservice aan (gold-set VALS, bron quarantaine)', async () => {
    await decideCandidate({ candidateId: CAND.id, decision: 'afkeuren', by: 'u1' });
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'VALS', source: QUARANTINE_GOLD_SET_SOURCE, t3777Code: CAND.t3777Code }),
      })
    );
  });

  it('conditional-update-race (0 rows) → CandidateConflictError (geen blind overschrijven)', async () => {
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 0 });
    await expect(decideCandidate({ candidateId: CAND.id, decision: 'afkeuren', by: 'u1' })).rejects.toBeInstanceOf(
      CandidateConflictError
    );
  });

  it('afkeuren op een niet-in_batch kandidaat → CandidateConflictError', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({ ...CAND, status: 'candidate', promotionBatch: null });
    await expect(decideCandidate({ candidateId: CAND.id, decision: 'afkeuren', by: 'u1' })).rejects.toBeInstanceOf(
      CandidateConflictError
    );
  });
});

describe('decideCandidate — vrijgeven (AC3): GEEN poortlogica', () => {
  beforeEach(() => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({ ...CAND });
  });

  it('zet in_batch→candidate en koppelt de batch los (promotionBatchId=null)', async () => {
    const res = await decideCandidate({ candidateId: CAND.id, decision: 'vrijgeven', by: 'u1' });
    expect(res.status).toBe('candidate');
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CAND.id, status: 'in_batch' },
        data: expect.objectContaining({ status: 'candidate', promotionBatchId: null }),
      })
    );
  });

  it('draait GEEN poortlogica: geen ml-client-, hard-negative- of gold-set-schrijf', async () => {
    await decideCandidate({ candidateId: CAND.id, decision: 'vrijgeven', by: 'u1' });
    expect(mockMl.computePhash).not.toHaveBeenCalled();
    expect(mockMl.reloadTemplates).not.toHaveBeenCalled();
    expect(mockPrisma.hardNegative.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
  });

  it('vrijgave-race (0 rows) → CandidateConflictError', async () => {
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 0 });
    await expect(decideCandidate({ candidateId: CAND.id, decision: 'vrijgeven', by: 'u1' })).rejects.toBeInstanceOf(
      CandidateConflictError
    );
  });
});

describe('decideCandidate — undo (taak 4.3)', () => {
  it('afkeuring terugnemen: rejected→in_batch, hard-negative verwijderd, gold-set ingetrokken', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      ...CAND,
      status: 'rejected',
      promotionBatch: { status: 'quarantined' },
    });
    mockPrisma.goldSetRecord.findFirst.mockResolvedValue({ id: 'gold-1' });

    const res = await decideCandidate({ candidateId: CAND.id, decision: 'undo', by: 'u1' });
    expect(res.status).toBe('in_batch');
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CAND.id, status: 'rejected' } })
    );
    expect(mockPrisma.hardNegative.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contentHash: 'abc123', reason: QUARANTINE_REJECT_REASON } })
    );
    // Gold-set self-tombstone (withdrawGoldSetRecord → updateMany replacedById=id).
    expect(mockPrisma.goldSetRecord.updateMany).toHaveBeenCalled();
  });

  it('vrijgave terugnemen: candidate→in_batch, herkoppeld aan de oorspronkelijke batch', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      ...CAND,
      status: 'candidate',
      promotionBatchId: null,
      promotionBatch: null,
      evidence: { statusTransitions: [], undoBatchId: 'batch-7' },
    });
    const res = await decideCandidate({ candidateId: CAND.id, decision: 'undo', by: 'u1' });
    expect(res.status).toBe('in_batch');
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CAND.id, status: 'candidate', promotionBatchId: null },
        data: expect.objectContaining({ status: 'in_batch', promotionBatchId: 'batch-7' }),
      })
    );
  });

  it('vrijgave-undo terwijl de worker de kandidaat al claimde → CandidateConflictError', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      ...CAND,
      status: 'candidate',
      promotionBatchId: 'batch-nieuw',
      promotionBatch: { status: 'pending' },
    });
    // 409-poort vangt dit al (in_batch? nee — status candidate), dus we belanden in undo
    // met een reeds geclaimde kandidaat → conflict.
    await expect(decideCandidate({ candidateId: CAND.id, decision: 'undo', by: 'u1' })).rejects.toBeInstanceOf(
      CandidateConflictError
    );
  });
});
