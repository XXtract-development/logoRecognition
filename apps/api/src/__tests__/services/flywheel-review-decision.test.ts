/**
 * Story 14.1 — Reviewbeslissing → vliegwiel-aanwas (service-unit-tests).
 *
 * Dekt de bindende AC's op service-niveau:
 *   AC1  recordReviewDecision → exact één gold-set-insert; accept = ECHT.
 *   AC2  reject-splitsing: "geen keurmerk" → VALS + hard-negative (transactie);
 *        fail-closed bij /ml/phash-fout (geen partiële schrijf).
 *   AC3  undo → self-tombstone gold-record + hard-negative-delete op cropPath.
 *   AC4  correctie via replaceGoldSetRecord (13.3, hier hergebruikt).
 *   AD-12 GEEN poort-afwijzing in de gold-set: niet-menselijke bron wordt geweigerd.
 *
 * prisma + ml-client worden globaal gemockt in setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import {
  recordReviewDecision,
  withdrawGoldSetRecord,
  isHumanGoldSetSource,
  GoldSetSourceError,
  HUMAN_GOLD_SET_SOURCES,
} from '../../services/flywheel/gold-set';
import {
  recordAcceptDecision,
  recordRejectGeenKeurmerk,
  withdrawReviewDecision,
  isReviewRejectReason,
  PhashUnavailableError,
  REVIEWSTATION_GEEN_KEURMERK_REASON,
} from '../../services/flywheel/review-decision';
import { HUMAN_HARD_NEGATIVE_REASONS } from '../../services/flywheel/types';

const mockPrisma = prisma as unknown as {
  goldSetRecord: {
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  hardNegative: {
    upsert: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const mockMl = mlClient as unknown as {
  computePhash: ReturnType<typeof vi.fn>;
};

describe('Story 14.1 — review-decision service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.goldSetRecord.create.mockResolvedValue({ id: 'gold-1' });
    mockPrisma.goldSetRecord.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.goldSetRecord.findFirst.mockResolvedValue(null);
    mockPrisma.hardNegative.upsert.mockResolvedValue({ id: 'hn-1' });
    mockPrisma.hardNegative.deleteMany.mockResolvedValue({ count: 0 });
    mockMl.computePhash.mockResolvedValue({ content_hash: 'hash-abc', phash: 'p-abc' });
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  });

  // --- AC1: accept → exact één ECHT-record ---------------------------------

  it('recordReviewDecision maakt exact één gold-set-record (AC1)', async () => {
    await recordReviewDecision({
      label: 'ECHT',
      t3777Code: 'EU_ORGANIC_FARMING',
      cropPath: 'crops/a.png',
      source: 'review-accept',
      decidedBy: 'user-1',
    });
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'ECHT', source: 'review-accept' }),
      })
    );
  });

  it('recordAcceptDecision legt ECHT vast met bron review-accept/annotate (AC1)', async () => {
    await recordAcceptDecision({
      t3777Code: 'X',
      cropPath: 'crops/x.png',
      source: 'review-annotate',
      decidedBy: 'u',
    });
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'ECHT', source: 'review-annotate' }),
      })
    );
  });

  // --- AD-12: geen poort-afwijzing in de gold-set --------------------------

  it('recordReviewDecision WEIGERT een niet-menselijke bron (AD-12)', async () => {
    await expect(
      recordReviewDecision({
        label: 'VALS',
        t3777Code: 'X',
        cropPath: 'crops/x.png',
        source: 'cap-bereikt', // poort-afwijzing — nooit toegestaan
      })
    ).rejects.toBeInstanceOf(GoldSetSourceError);
    expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
  });

  it('isHumanGoldSetSource laat alleen de vier menselijke bronnen door', () => {
    expect(HUMAN_GOLD_SET_SOURCES).toContain('review-accept');
    expect(HUMAN_GOLD_SET_SOURCES).toContain('quarantaine');
    expect(isHumanGoldSetSource('review-reject')).toBe(true);
    expect(isHumanGoldSetSource('outlier')).toBe(false);
    expect(isHumanGoldSetSource('crosscheck')).toBe(false);
  });

  // --- AC2: reject-splitsing -----------------------------------------------

  it('reject "geen keurmerk" → VALS-record ÉN hard-negative in één transactie (AC2)', async () => {
    await recordRejectGeenKeurmerk({
      t3777Code: 'EU_ORGANIC_FARMING',
      cropPath: 'crops/a.png',
      decidedBy: 'user-1',
    });
    expect(mockMl.computePhash).toHaveBeenCalledWith('crops/a.png');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: 'VALS', source: 'review-reject' }) })
    );
    expect(mockPrisma.hardNegative.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentHash: 'hash-abc' },
        create: expect.objectContaining({
          contentHash: 'hash-abc',
          reason: REVIEWSTATION_GEEN_KEURMERK_REASON,
        }),
      })
    );
  });

  it('de hard-negative-reden is exact de gedeelde 13.6-enum-waarde (AC2)', () => {
    expect(REVIEWSTATION_GEEN_KEURMERK_REASON).toBe('reviewstation-geen-keurmerk');
    expect(HUMAN_HARD_NEGATIVE_REASONS).toContain(REVIEWSTATION_GEEN_KEURMERK_REASON);
  });

  it('isReviewRejectReason accepteert de twee redenen, weigert de rest', () => {
    expect(isReviewRejectReason('geen-keurmerk')).toBe(true);
    expect(isReviewRejectReason('onjuiste-locatie-verkeerde-code')).toBe(true);
    expect(isReviewRejectReason('anders')).toBe(false);
  });

  // --- AC2 fail-closed: phash onbereikbaar ---------------------------------

  it('reject "geen keurmerk" is FAIL-CLOSED: phash-fout → geen enkele schrijf (AC2)', async () => {
    mockMl.computePhash.mockRejectedValue(new Error('ml down'));
    await expect(
      recordRejectGeenKeurmerk({ t3777Code: 'X', cropPath: 'crops/x.png' })
    ).rejects.toBeInstanceOf(PhashUnavailableError);
    // Geen partiële schrijf: noch gold-set, noch hard-negative, en geen transactie.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.goldSetRecord.create).not.toHaveBeenCalled();
    expect(mockPrisma.hardNegative.upsert).not.toHaveBeenCalled();
  });

  // --- AC3: undo -----------------------------------------------------------

  it('withdrawGoldSetRecord doet een self-tombstone conditional update (AC3)', async () => {
    const n = await withdrawGoldSetRecord('gold-9');
    expect(mockPrisma.goldSetRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'gold-9', replacedById: null },
      data: { replacedById: 'gold-9' },
    });
    expect(n).toBe(1);
  });

  it('withdrawReviewDecision trekt het gold-record in ÉN verwijdert de hard-negative op cropPath (AC3)', async () => {
    mockPrisma.goldSetRecord.findFirst.mockResolvedValue({ id: 'gold-5' });
    mockPrisma.hardNegative.deleteMany.mockResolvedValue({ count: 1 });

    const out = await withdrawReviewDecision('crops/a.png');

    // Self-tombstone op het gevonden actieve record.
    expect(mockPrisma.goldSetRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'gold-5', replacedById: null },
      data: { replacedById: 'gold-5' },
    });
    // Hard-negative-delete op cropPath + de reviewstation-reden.
    expect(mockPrisma.hardNegative.deleteMany).toHaveBeenCalledWith({
      where: { cropPath: 'crops/a.png', reason: REVIEWSTATION_GEEN_KEURMERK_REASON },
    });
    expect(out).toEqual({ goldSetWithdrawn: 1, hardNegativesDeleted: 1 });
  });

  it('withdrawReviewDecision is idempotent: geen actief record en geen hard-negative → 0/0 (AC3)', async () => {
    mockPrisma.goldSetRecord.findFirst.mockResolvedValue(null);
    mockPrisma.hardNegative.deleteMany.mockResolvedValue({ count: 0 });
    const out = await withdrawReviewDecision('crops/none.png');
    expect(mockPrisma.goldSetRecord.updateMany).not.toHaveBeenCalled();
    expect(out).toEqual({ goldSetWithdrawn: 0, hardNegativesDeleted: 0 });
  });
});
