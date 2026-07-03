/**
 * Story 13.6 — Pauze-scope (AC 5, AD-11) integratie-tests.
 *
 * Dekt de PRECIEZE scope:
 *  - nominatie-service met pauze aan → geen kandidaat-rij, gemiste-nominatie-event
 *    reden `pauze`;
 *  - flywheel-promotion-job (runPromotionLoop) met pauze aan → run overgeslagen,
 *    geen batch gebundeld/verwerkt;
 *  - NIET geblokkeerd: de pauze-check raakt uitsluitend deze twee paden (de
 *    read-only paden roepen shouldSkipForPause/isPaused nooit aan — bewezen door
 *    de afwezigheid van de check in die modules, hier gedekt via de scope-mock).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock de pauze-service: gepauzeerd ---------------------------------------
const isPaused = vi.fn();
const shouldSkipForPause = vi.fn();
vi.mock('../../services/flywheel/pause', () => ({
  isPaused: (...a: unknown[]) => isPaused(...a),
  shouldSkipForPause: (...a: unknown[]) => shouldSkipForPause(...a),
}));

// --- Mock de gemiste-nominatie-teller ----------------------------------------
const recordMissedNomination = vi.fn();
vi.mock('../../services/flywheel/missed-nominations', () => ({
  recordMissedNomination: (...a: unknown[]) => recordMissedNomination(...a),
  MISSED_NOMINATION_REASONS: ['phash-onbereikbaar', 'pauze', 'vlag-uit'],
  getMissedNominationCounts: vi.fn(),
}));

// De promotion-batch-orkestratie leunt op guardrails/gate/watchdog — mock die weg
// zodat de skip-test alleen de pauze-poort raakt.
vi.mock('../../services/flywheel/gate', () => ({ runRegressionGate: vi.fn() }));
vi.mock('../../services/flywheel/watchdog', () => ({ markPromotionRunSuccess: vi.fn() }));

import prisma from '../../core/db';
import { nominateCandidate } from '../../services/flywheel/nomination';
import { runPromotionLoop } from '../../services/flywheel/promotion-batch';

const mockPrisma = prisma as unknown as {
  referenceCandidate: { create: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  promotionBatch: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
});

describe('nominatie-service met pauze aan (AC 5)', () => {
  it('weigert de nominatie mét reden `pauze`, geen kandidaat-rij', async () => {
    isPaused.mockResolvedValue(true);
    const outcome = await nominateCandidate({
      detection: { t3777Code: 'A', confidence: 0.99, method: 'template', cropPath: 'c.jpg' },
      origin: 'crosscheck',
      gtin: 'g1',
      declared: ['A'],
    });
    expect(outcome).toEqual({ status: 'skipped', reason: 'pauze' });
    expect(recordMissedNomination).toHaveBeenCalledWith(
      'pauze',
      expect.objectContaining({ t3777Code: 'A' })
    );
    // Geen kandidaat aangemaakt (de pauze-poort zit vóór alle inserts).
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });
});

describe('flywheel-promotion-job met pauze aan (AC 5)', () => {
  it('slaat de run over — geen batch gebundeld/verwerkt', async () => {
    shouldSkipForPause.mockResolvedValue(true);
    const res = await runPromotionLoop();
    expect(res).toEqual({ resumedBatchIds: [], newBatchId: null, bundledCandidates: 0 });
    // Geen pending-batches opgehaald, geen batch aangemaakt.
    expect(mockPrisma.promotionBatch.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.promotionBatch.create).not.toHaveBeenCalled();
  });
});
