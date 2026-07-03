/**
 * Story 13.5 — Kwaliteitspoort (gate.ts) tests.
 *
 * Dekt:
 *  - AC1: schaduw-meting roept regressionEval met de in_batch-schaduwset (mode shadow).
 *  - AC2: geen passed-batch → nulmeting als initiële baseline.
 *  - AC3: verouderde baseline → verse nulmeting.
 *  - AC4: versie-guard → conditional update in_batch → candidate + her-embed.
 *  - AC5: binnen tolerantie → promotie + batch passed + baselineMeasurement.
 *  - AC5-grens: tolerantie-beslissing (1 verslechterd door; 2 netto verslechterd
 *    quarantaine; verbeterde samples compenseren; 200-switch → 1pp-regel).
 *  - AC6: boven tolerantie → quarantined + delta + meest getroffen klassen + notificatie.
 *  - AC7: niet-uitvoerbare meting (ml-fout / lege gold-set) → fail-closed systeem-fout.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de promotie-module zodat de gate-orkestratie los van de transactie test.
const promoteBatchCandidates = vi.fn();
vi.mock('../../services/flywheel/promotion', () => ({
  promoteBatchCandidates: (...a: unknown[]) => promoteBatchCandidates(...a),
}));

// Mock de gold-set-resolutie (payload-bron).
const getActiveGoldSet = vi.fn();
vi.mock('../../services/flywheel/gold-set', () => ({
  getActiveGoldSet: (...a: unknown[]) => getActiveGoldSet(...a),
}));

// Mock de baseline-marker.
const isBaselineStale = vi.fn();
const consumeBaselineStale = vi.fn();
vi.mock('../../services/flywheel/baseline', () => ({
  isBaselineStale: (...a: unknown[]) => isBaselineStale(...a),
  consumeBaselineStale: (...a: unknown[]) => consumeBaselineStale(...a),
}));

// Mock de pauze-service (Story 13.6): de gate registreert quarantaines voor de
// K=2-stilstand en reset de reeks bij een passed-batch. Hier gemockt zodat deze
// suite de POORT test, niet de stilstand-logica (die heeft flywheel-pause.test.ts).
const registerQuarantine = vi.fn();
const resetQuarantineStreak = vi.fn();
vi.mock('../../services/flywheel/pause', () => ({
  registerQuarantine: (...a: unknown[]) => registerQuarantine(...a),
  resetQuarantineStreak: (...a: unknown[]) => resetQuarantineStreak(...a),
}));

import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import {
  runRegressionGate,
  decideTolerance,
  mostAffectedClasses,
  enforceVersionGuard,
  resolveBaseline,
  parseVectorText,
} from '../../services/flywheel/gate';
import type { RegressionMeasurement } from '../../services/flywheel/types';

const mockPrisma = prisma as unknown as {
  promotionBatch: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  referenceCandidate: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  modelVersion: { findFirst: ReturnType<typeof vi.fn> };
  retrainingNotification: { create: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

const mockMl = mlClient as unknown as {
  regressionEval: ReturnType<typeof vi.fn>;
  reloadTemplates: ReturnType<typeof vi.fn>;
};

function measurement(overrides: Partial<RegressionMeasurement> = {}): RegressionMeasurement {
  return {
    precision: 1,
    total: 5,
    correct: 5,
    threshold: 0.9,
    mode: 'shadow',
    perClass: {},
    samples: [],
    measuredAt: 'now',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_REGRESSION_SAMPLE_SWITCH;
  delete process.env.FLYWHEEL_REGRESSION_MIN_WORSENED;
  delete process.env.FLYWHEEL_REGRESSION_TOLERANCE_PP;

  isBaselineStale.mockResolvedValue(false);
  consumeBaselineStale.mockResolvedValue(true);
  registerQuarantine.mockResolvedValue(false);
  resetQuarantineStreak.mockResolvedValue(undefined);
  getActiveGoldSet.mockResolvedValue([
    { id: 'g1', cropPath: 'crops/g1.jpg', label: 'ECHT', t3777Code: 'A', evidence: { contentHash: 'H1' } },
  ]);
  promoteBatchCandidates.mockResolvedValue({ promoted: [{ candidateId: 'c1', referenceLogoId: 'r1', variantLabel: 'auto-x-1' }], capRejected: [], skipped: [] });

  mockMl.regressionEval.mockResolvedValue({ precision: 1, total: 5, correct: 5, per_class: {}, samples: [] });
  mockMl.reloadTemplates.mockResolvedValue(undefined);

  mockPrisma.promotionBatch.findFirst.mockResolvedValue(null);
  mockPrisma.promotionBatch.update.mockResolvedValue({});
  mockPrisma.referenceCandidate.findMany.mockResolvedValue([]);
  mockPrisma.referenceCandidate.findUnique.mockResolvedValue({ evidence: {} });
  mockPrisma.referenceCandidate.update.mockResolvedValue({});
  mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.modelVersion.findFirst.mockResolvedValue(null);
  mockPrisma.retrainingNotification.create.mockResolvedValue({});
  mockPrisma.$queryRaw.mockResolvedValue([]);
});

// ── AC5-grens: tolerantie-beslissing (pure) ─────────────────────────────────
describe('decideTolerance (AC5 — sample-tolerantie-grens)', () => {
  it('1 verslechterd sample → promote (onder de grens van 2)', () => {
    const baseline = measurement({ samples: [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
    ] });
    const now = measurement({ samples: [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.5, recognized: false, correct: false },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
    ] });
    const d = decideTolerance(baseline, now);
    expect(d.decision).toBe('promote');
    expect(d.delta).toBe(1);
  });

  it('2 netto verslechterde samples → quarantine (op de grens)', () => {
    const baseline = measurement({ samples: [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
    ] });
    const now = measurement({ samples: [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.5, recognized: false, correct: false },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.5, recognized: false, correct: false },
    ] });
    expect(decideTolerance(baseline, now).decision).toBe('quarantine');
  });

  it('verbeterde samples compenseren (netto = verslechterd − verbeterd)', () => {
    const baseline = measurement({ samples: [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
      { id: 's3', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.5, recognized: false, correct: false },
    ] });
    const now = measurement({ samples: [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.5, recognized: false, correct: false }, // −
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.5, recognized: false, correct: false }, // −
      { id: 's3', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },     // +
    ] });
    // 2 verslechterd − 1 verbeterd = netto 1 → promote.
    const d = decideTolerance(baseline, now);
    expect(d.delta).toBe(1);
    expect(d.decision).toBe('promote');
  });

  it('≥200 samples → 1pp-regel i.p.v. sample-telling', () => {
    process.env.FLYWHEEL_REGRESSION_SAMPLE_SWITCH = '200';
    const baseline = measurement({ total: 200, precision: 0.95 });
    const worse = measurement({ total: 200, precision: 0.93 }); // 2pp daling > 1pp
    expect(decideTolerance(baseline, worse).decision).toBe('quarantine');
    const ok = measurement({ total: 200, precision: 0.945 }); // 0,5pp daling < 1pp
    expect(decideTolerance(baseline, ok).decision).toBe('promote');
  });
});

describe('mostAffectedClasses (AC6)', () => {
  it('sorteert klassen op precisie-daling aflopend, alleen dalers', () => {
    const baseline = measurement({ perClass: { A: { total: 2, correct: 2, precision: 1 }, B: { total: 2, correct: 2, precision: 1 } } });
    const now = measurement({ perClass: { A: { total: 2, correct: 1, precision: 0.5 }, B: { total: 2, correct: 0, precision: 0 } } });
    expect(mostAffectedClasses(baseline, now)).toEqual(['B', 'A']);
  });
});

describe('parseVectorText', () => {
  it('parseert een pgvector-text', () => {
    expect(parseVectorText('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    expect(parseVectorText(null)).toEqual([]);
    expect(parseVectorText('[]')).toEqual([]);
  });
});

// ── AC2/AC3: baseline-resolutie ─────────────────────────────────────────────
describe('resolveBaseline (AC2/AC3)', () => {
  it('geen passed-batch → nulmeting (mode nulmeting, geen schaduwset)', async () => {
    mockPrisma.promotionBatch.findFirst.mockResolvedValue(null);
    await resolveBaseline('batch-1');
    expect(mockMl.regressionEval).toHaveBeenCalledWith(
      expect.objectContaining({ includeShadow: false })
    );
  });

  it('verouderde baseline → verse nulmeting ook al is er een passed-batch', async () => {
    isBaselineStale.mockResolvedValue(true);
    mockPrisma.promotionBatch.findFirst.mockResolvedValue({ baselineMeasurement: measurement() });
    await resolveBaseline('batch-1');
    // Verouderd → nulmeting draaien (regressionEval aangeroepen met includeShadow=false),
    // niet de opgeslagen baseline gebruiken.
    expect(mockMl.regressionEval).toHaveBeenCalledWith(
      expect.objectContaining({ includeShadow: false })
    );
  });

  it('recente passed-batch (niet verouderd) → gebruik de opgeslagen baseline (geen meting)', async () => {
    mockPrisma.promotionBatch.findFirst.mockResolvedValue({ baselineMeasurement: measurement({ precision: 0.8 }) });
    const result = await resolveBaseline('batch-1');
    expect(result.precision).toBe(0.8);
    expect(mockMl.regressionEval).not.toHaveBeenCalled();
  });
});

// ── AC4: versie-guard ───────────────────────────────────────────────────────
describe('enforceVersionGuard (AC4)', () => {
  it('zet kandidaten met afwijkende modelversie terug naar candidate', async () => {
    mockPrisma.modelVersion.findFirst.mockResolvedValue({ version: 'v2' });
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { id: 'c1', evidence: { embeddingModelVersion: 'v1' } }, // mismatch
      { id: 'c2', evidence: { embeddingModelVersion: 'v2' } }, // klopt
    ]);
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });

    const reverted = await enforceVersionGuard('batch-1');
    expect(reverted).toEqual(['c1']);
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'in_batch' },
      data: { status: 'candidate', promotionBatchId: null },
    });
  });

  it('geen actief model → guard overgeslagen', async () => {
    mockPrisma.modelVersion.findFirst.mockResolvedValue(null);
    const reverted = await enforceVersionGuard('batch-1');
    expect(reverted).toEqual([]);
    expect(mockPrisma.referenceCandidate.updateMany).not.toHaveBeenCalled();
  });
});

// ── AC1/AC5: schaduw-meting + promotie ──────────────────────────────────────
describe('runRegressionGate (AC1/AC5 — meten en promoveren)', () => {
  it('binnen tolerantie → promotie + batch passed + baselineMeasurement', async () => {
    await runRegressionGate('batch-1', {});
    expect(promoteBatchCandidates).toHaveBeenCalledWith('batch-1');
    const updateCall = mockPrisma.promotionBatch.update.mock.calls.at(-1)![0];
    expect(updateCall.data.status).toBe('passed');
    expect(updateCall.data.baselineMeasurement).toBeDefined();
    expect(updateCall.data.closedAt).toBeInstanceOf(Date);
  });

  it('passed doorbreekt de quarantaine-reeks — resetQuarantineStreak aangeroepen (AC 4)', async () => {
    await runRegressionGate('batch-1', {});
    expect(resetQuarantineStreak).toHaveBeenCalledTimes(1);
    expect(registerQuarantine).not.toHaveBeenCalled();
  });

  it('schaduw-meting draait met includeShadow=true (AC1)', async () => {
    await runRegressionGate('batch-1', {});
    // De schaduw-meting (na de nulmeting-baseline) is de laatste regressionEval-aanroep.
    const shadowCall = mockMl.regressionEval.mock.calls.find((c) => c[0].includeShadow === true);
    expect(shadowCall).toBeDefined();
  });
});

// ── AC6: quarantaine boven tolerantie ───────────────────────────────────────
describe('runRegressionGate (AC6 — quarantaine)', () => {
  it('boven tolerantie → quarantined + delta + notificatie, niets gepromoveerd', async () => {
    // Baseline (nulmeting) perfect; schaduw-meting verslechtert 2 samples.
    const baselineSamples = [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 1, recognized: true, correct: true },
    ];
    const worseSamples = [
      { id: 's1', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.1, recognized: false, correct: false },
      { id: 's2', t3777Code: 'A', label: 'ECHT', topSimilarity: 0.1, recognized: false, correct: false },
    ];
    mockMl.regressionEval
      .mockResolvedValueOnce({ precision: 1, total: 2, correct: 2, per_class: { A: { total: 2, correct: 2, precision: 1 } }, samples: baselineSamples }) // baseline nulmeting
      .mockResolvedValueOnce({ precision: 0, total: 2, correct: 0, per_class: { A: { total: 2, correct: 0, precision: 0 } }, samples: worseSamples }); // schaduw-meting

    await runRegressionGate('batch-1', {});

    expect(promoteBatchCandidates).not.toHaveBeenCalled();
    const updateCall = mockPrisma.promotionBatch.update.mock.calls.at(-1)![0];
    expect(updateCall.data.status).toBe('quarantined');
    expect(mockPrisma.retrainingNotification.create).toHaveBeenCalled();
    // Story 13.6 (AC 4): een quarantaine registreert de reeks voor de K=2-stilstand.
    expect(registerQuarantine).toHaveBeenCalledWith('batch-1');
  });
});

// ── AC7: fail-closed ────────────────────────────────────────────────────────
describe('runRegressionGate (AC7 — fail-closed)', () => {
  it('ml-service-fout in de meetketen → quarantined met reden systeem-fout', async () => {
    mockMl.regressionEval.mockRejectedValue(new Error('ml-service down'));
    await runRegressionGate('batch-1', {});
    const updateCall = mockPrisma.promotionBatch.update.mock.calls.at(-1)![0];
    expect(updateCall.data.status).toBe('quarantined');
    const reg = (updateCall.data.gateResults as Record<string, { details: { reason: string } }>).regression;
    expect(reg.details.reason).toBe('systeem-fout');
    expect(promoteBatchCandidates).not.toHaveBeenCalled();
  });

  it('lege gold-set → fail-closed quarantaine (systeem-fout)', async () => {
    getActiveGoldSet.mockResolvedValue([]);
    await runRegressionGate('batch-1', {});
    const updateCall = mockPrisma.promotionBatch.update.mock.calls.at(-1)![0];
    expect(updateCall.data.status).toBe('quarantined');
  });
});
