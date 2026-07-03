/**
 * Story 13.4 — Promotie-batch-service tests.
 *
 * Dekt: bundeling + claim-semantiek (conditional update candidate → in_batch,
 * hoogstens één niet-afgesloten batch, AC2) · crash-recovery (eerst pending
 * hervatten, dan bundelen, AC8) · fase-idempotentie (afgeronde fase overslaan,
 * AC8) · regressie-placeholder not-run (AC7) · lege bundeling (geen lege batch).
 *
 * De guardrail-fasen + watchdog worden op module-grens gemockt zodat deze suite
 * de ORKESTRATIE test (volgorde, claim, idempotentie), niet de poortlogica zelf.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock de guardrail-fasen (orkestratie-test) ------------------------------
const runThresholdPhase = vi.fn();
const runCapPhase = vi.fn();
const runDedupPhase = vi.fn();
const runOutlierPhase = vi.fn();

function phaseRecord(phase: string) {
  return {
    record: {
      phase,
      startedAt: 'now',
      finishedAt: 'now',
      outcome: 'passed',
      rejectedCandidateIds: [],
      details: {},
    },
    survivors: [],
  };
}

vi.mock('../../services/flywheel/guardrails', async () => {
  const actual = await vi.importActual<typeof import('../../services/flywheel/guardrails')>(
    '../../services/flywheel/guardrails'
  );
  return {
    ...actual,
    runThresholdPhase: (...a: unknown[]) => runThresholdPhase(...a),
    runCapPhase: (...a: unknown[]) => runCapPhase(...a),
    runDedupPhase: (...a: unknown[]) => runDedupPhase(...a),
    runOutlierPhase: (...a: unknown[]) => runOutlierPhase(...a),
  };
});

// --- Mock de watchdog (markPromotionRunSuccess) ------------------------------
const markPromotionRunSuccess = vi.fn();
vi.mock('../../services/flywheel/watchdog', () => ({
  markPromotionRunSuccess: (...a: unknown[]) => markPromotionRunSuccess(...a),
}));

// --- Mock de regressie-poort (Story 13.5) ------------------------------------
// Deze suite test de ORKESTRATIE (volgorde/claim/idempotentie), niet de poort
// zelf; de regressie-fase (meten/promoveren/quarantaineren) heeft eigen tests
// (flywheel-gate.test.ts). Hier verifiëren we alleen dát processBatch de poort
// aanroept ná de guardrails.
const runRegressionGate = vi.fn();
vi.mock('../../services/flywheel/gate', () => ({
  runRegressionGate: (...a: unknown[]) => runRegressionGate(...a),
}));

import prisma from '../../core/db';
import {
  runPromotionLoop,
  bundleNewCandidates,
  processBatch,
} from '../../services/flywheel/promotion-batch';

const mockPrisma = prisma as unknown as {
  promotionBatch: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  referenceCandidate: {
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  runThresholdPhase.mockResolvedValue(phaseRecord('threshold'));
  runCapPhase.mockResolvedValue(phaseRecord('cap'));
  runDedupPhase.mockResolvedValue(phaseRecord('dedup'));
  runOutlierPhase.mockResolvedValue(phaseRecord('outlier'));
  markPromotionRunSuccess.mockResolvedValue(undefined);
  runRegressionGate.mockResolvedValue(undefined);

  mockPrisma.promotionBatch.findMany.mockResolvedValue([]);
  mockPrisma.promotionBatch.findUnique.mockResolvedValue({
    id: 'batch-1',
    status: 'pending',
    gateResults: {},
  });
  mockPrisma.promotionBatch.create.mockResolvedValue({ id: 'batch-new' });
  mockPrisma.promotionBatch.update.mockResolvedValue({});
  mockPrisma.promotionBatch.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.referenceCandidate.findMany.mockResolvedValue([]);
  mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
});

// ── AC2: bundeling + claim ──────────────────────────────────────────────────
describe('bundleNewCandidates (AC2 — claim-semantiek)', () => {
  it('claimt candidate-kandidaten via conditional update naar in_batch met batch-id', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 2 });

    const res = await bundleNewCandidates();
    expect(res).toEqual({ batchId: 'batch-new', count: 2 });
    // Conditional update: alleen status=candidate & ongeclaimd gaan over.
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] }, status: 'candidate', promotionBatchId: null },
      data: { status: 'in_batch', promotionBatchId: 'batch-new' },
    });
  });

  it('maakt GEEN batch als er geen openstaande kandidaten zijn', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([]);
    const res = await bundleNewCandidates();
    expect(res).toBeNull();
    expect(mockPrisma.promotionBatch.create).not.toHaveBeenCalled();
  });

  it('sluit een lege batch weer als de claim-race alles wegkaapte (0 rows)', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([{ id: 'a' }]);
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 0 });
    const res = await bundleNewCandidates();
    expect(res).toBeNull();
    // De lege batch wordt rolled_back gesloten (geen wees-batch).
    expect(mockPrisma.promotionBatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'batch-new', status: 'pending' },
      data: { status: 'rolled_back', closedAt: expect.any(Date) },
    });
  });
});

// ── AC8: crash-recovery ─────────────────────────────────────────────────────
describe('runPromotionLoop (AC8 — crash-recovery)', () => {
  it('hervat eerst bestaande pending-batches, dan pas bundelt hij nieuw', async () => {
    const order: string[] = [];
    mockPrisma.promotionBatch.findMany.mockImplementation(async (arg: { where: { status: string } }) => {
      if (arg.where.status === 'pending') return [{ id: 'pending-1' }];
      return [];
    });
    mockPrisma.promotionBatch.findUnique.mockImplementation(async (arg: { where: { id: string } }) => {
      order.push(`process:${arg.where.id}`);
      return { id: arg.where.id, status: 'pending', gateResults: {} };
    });
    // Nieuwe bundeling levert één kandidaat.
    mockPrisma.referenceCandidate.findMany.mockImplementation(async (arg: { where: { status?: string } }) => {
      // bundleNewCandidates zoekt status=candidate; loadBatchCandidates zoekt in_batch.
      if (arg.where.status === 'candidate') {
        order.push('bundle-query');
        return [{ id: 'new-a' }];
      }
      return [];
    });

    const res = await runPromotionLoop();
    // pending-1 verwerkt vóór de nieuwe bundeling.
    expect(order.indexOf('process:pending-1')).toBeLessThan(order.indexOf('bundle-query'));
    expect(res.resumedBatchIds).toEqual(['pending-1']);
    expect(markPromotionRunSuccess).toHaveBeenCalledTimes(1);
  });

  it('legt de laatste succesvolle run vast (watchdog, AC9)', async () => {
    await runPromotionLoop();
    expect(markPromotionRunSuccess).toHaveBeenCalledTimes(1);
  });
});

// ── AC7/AC8: fase-idempotentie + regressie-placeholder ──────────────────────
describe('processBatch (AC7/AC8 — fase-idempotentie)', () => {
  it('slaat een afgeronde fase over bij hervatting (crash-recovery)', async () => {
    // threshold al afgerond → mag niet opnieuw draaien; de rest wel.
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'pending',
      gateResults: {
        threshold: { phase: 'threshold', startedAt: 'x', finishedAt: 'x', outcome: 'passed', rejectedCandidateIds: [], details: {} },
      },
    });
    await processBatch('batch-1');
    expect(runThresholdPhase).not.toHaveBeenCalled();
    expect(runCapPhase).toHaveBeenCalledTimes(1);
    expect(runDedupPhase).toHaveBeenCalledTimes(1);
    expect(runOutlierPhase).toHaveBeenCalledTimes(1);
  });

  it('roept de regressie-poort aan ná de guardrails (Story 13.5)', async () => {
    await processBatch('batch-1');
    // De vier guardrails draaiden, daarna de regressie-poort.
    expect(runThresholdPhase).toHaveBeenCalledTimes(1);
    expect(runOutlierPhase).toHaveBeenCalledTimes(1);
    // De poort (meten/promoveren/quarantaineren) is aangeroepen met de batch-id.
    expect(runRegressionGate).toHaveBeenCalledWith('batch-1', expect.any(Object));
  });

  it('slaat de regressie-poort over als de fase al afgerond is (crash-recovery)', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({
      id: 'batch-1',
      status: 'pending',
      gateResults: {
        threshold: { phase: 'threshold', startedAt: 'x', finishedAt: 'x', outcome: 'passed', rejectedCandidateIds: [], details: {} },
        cap: { phase: 'cap', startedAt: 'x', finishedAt: 'x', outcome: 'passed', rejectedCandidateIds: [], details: {} },
        dedup: { phase: 'dedup', startedAt: 'x', finishedAt: 'x', outcome: 'passed', rejectedCandidateIds: [], details: {} },
        outlier: { phase: 'outlier', startedAt: 'x', finishedAt: 'x', outcome: 'passed', rejectedCandidateIds: [], details: {} },
        regression: { phase: 'regression', startedAt: 'x', finishedAt: 'x', outcome: 'passed', rejectedCandidateIds: [], details: {} },
      },
    });
    await processBatch('batch-1');
    expect(runRegressionGate).not.toHaveBeenCalled();
  });

  it('slaat een batch over die niet (meer) pending is', async () => {
    mockPrisma.promotionBatch.findUnique.mockResolvedValue({ id: 'batch-1', status: 'passed', gateResults: {} });
    await processBatch('batch-1');
    expect(runThresholdPhase).not.toHaveBeenCalled();
  });
});
