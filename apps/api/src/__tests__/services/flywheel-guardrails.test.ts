/**
 * Story 13.4 — Guardrail-fasen unit-tests.
 *
 * Dekt: zachte afwijzing (in_batch → rejected + reden, GÉÉN hard-negative,
 * AC5) · cap-telling incl. gecureerde/inactieve uitsluiting (AC3) · Hamming-
 * en cosine-dedup-beslislogica incl. "hoogstens één overleeft" + kloon-gat (AC4)
 * · outlier-afwijzing (AC6) · gateResults-fase-records (AC7) · vrijgave-overgang.
 *
 * prisma / mlClient worden globaal gemockt in setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import {
  softRejectCandidate,
  releaseCandidate,
  runThresholdPhase,
  runCapPhase,
  runDedupPhase,
  runOutlierPhase,
  countActivePromotionReferences,
  hammingDistanceHex,
  isPhaseComplete,
  startPhaseRecord,
  type GuardrailCandidate,
} from '../../services/flywheel/guardrails';

const mockPrisma = prisma as unknown as {
  referenceCandidate: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  referenceLogo: { count: ReturnType<typeof vi.fn> };
  hardNegative: { create: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

function cand(overrides: Partial<GuardrailCandidate> = {}): GuardrailCandidate {
  return {
    id: 'c1',
    t3777Code: 'GREEN_DOT',
    cropPath: 'crops/c1.png',
    confidence: 0.95,
    method: 'template',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_CLASS_CAP;
  delete process.env.FLYWHEEL_DEDUP_HAMMING_MAX;
  delete process.env.FLYWHEEL_DEDUP_COSINE;
  delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE;

  mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
    evidence: {},
    status: 'in_batch',
  });
  mockPrisma.referenceCandidate.update.mockResolvedValue({});
  mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.referenceLogo.count.mockResolvedValue(0);
  mockPrisma.$queryRaw.mockResolvedValue([]);
  (mlClient.computePhash as ReturnType<typeof vi.fn>).mockResolvedValue({
    content_hash: 'h',
    phash: '0000000000000000',
  });
  (mlClient.outlierAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
    t3777_code: 'GREEN_DOT',
    centroid_size: 3,
    threshold: 0.35,
    results: [],
  });
});

// ── AC5: zachte afwijzing schrijft NOOIT een hard-negative ──────────────────
describe('softRejectCandidate (AC5)', () => {
  it('zet in_batch → rejected + reden, en schrijft GÉÉN hard_negatives-rij', async () => {
    const ok = await softRejectCandidate('c1', 'cap-bereikt');
    expect(ok).toBe(true);
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'in_batch' },
      data: { status: 'rejected' },
    });
    // De reden komt in evidence.rejectionReason (hernominatie-slot).
    const updArg = mockPrisma.referenceCandidate.update.mock.calls[0][0];
    expect(updArg.data.evidence.rejectionReason).toBe('cap-bereikt');
    // Kritisch: geen hard-negative-insert vanuit dit pad.
    expect(mockPrisma.hardNegative.create).not.toHaveBeenCalled();
  });

  it('is idempotent: 0 rows affected → false, geen evidence-schrijf', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({ evidence: {}, status: 'rejected' });
    const ok = await softRejectCandidate('c1', 'duplicaat');
    expect(ok).toBe(false);
    expect(mockPrisma.referenceCandidate.updateMany).not.toHaveBeenCalled();
  });
});

describe('releaseCandidate (in_batch → candidate vrijgave)', () => {
  it('geeft de kandidaat vrij en wist promotionBatchId', async () => {
    const ok = await releaseCandidate('c1', 'onder-drempel');
    expect(ok).toBe(true);
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'in_batch' },
      data: { status: 'candidate', promotionBatchId: null },
    });
  });
});

// ── AC3: per-klasse cap ─────────────────────────────────────────────────────
describe('cap-fase (AC3)', () => {
  it('telt uitsluitend actieve flywheel-promotion-referenties (gecureerde tellen niet mee)', async () => {
    await countActivePromotionReferences('GREEN_DOT');
    expect(mockPrisma.referenceLogo.count).toHaveBeenCalledWith({
      where: { t3777Code: 'GREEN_DOT', active: true, source: 'flywheel-promotion' },
    });
  });

  it('wijst kandidaten boven de cap zacht af met reden cap-bereikt', async () => {
    process.env.FLYWHEEL_CLASS_CAP = '1';
    mockPrisma.referenceLogo.count.mockResolvedValue(0);
    const { record, survivors } = await runCapPhase([
      cand({ id: 'a' }),
      cand({ id: 'b' }),
    ]);
    // cap=1, start 0: 'a' past (running→1), 'b' zit op de cap → afgewezen.
    expect(survivors.map((s) => s.id)).toEqual(['a']);
    expect(record.details.rejectedCandidateIds).toEqual(['b']);
    expect(record.outcome).toBe('rejected-some');
  });

  it('laat alle kandidaten door als de cap ruim is', async () => {
    process.env.FLYWHEEL_CLASS_CAP = '10';
    const { survivors, record } = await runCapPhase([cand({ id: 'a' }), cand({ id: 'b' })]);
    expect(survivors).toHaveLength(2);
    expect(record.outcome).toBe('passed');
  });
});

// ── AC4: tweetraps-dedup ────────────────────────────────────────────────────
describe('Hamming-afstand (dedup trap 1)', () => {
  it('is 0 voor identieke hashes en telt bit-verschillen', () => {
    expect(hammingDistanceHex('ffff', 'ffff')).toBe(0);
    expect(hammingDistanceHex('0000', '0001')).toBe(1); // 0x1 = 1 bit
    expect(hammingDistanceHex('0000', '000f')).toBe(4); // 0xf = 4 bits
  });
  it('geeft oneindig bij ongelijke lengte (niet vergelijkbaar)', () => {
    expect(hammingDistanceHex('ff', 'ffff')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('dedup-fase (AC4)', () => {
  it('binnen de batch overleeft hoogstens één van twee identieke pHashes (trap 1)', async () => {
    process.env.FLYWHEEL_DEDUP_HAMMING_MAX = '2';
    // Beide kandidaten krijgen dezelfde pHash → tweede is duplicaat van eerste.
    (mlClient.computePhash as ReturnType<typeof vi.fn>).mockResolvedValue({
      content_hash: 'h',
      phash: 'aaaaaaaaaaaaaaaa',
    });
    mockPrisma.$queryRaw.mockResolvedValue([]); // trap 2 vindt niets
    const { survivors, record } = await runDedupPhase([cand({ id: 'a' }), cand({ id: 'b' })]);
    expect(survivors.map((s) => s.id)).toEqual(['a']);
    expect(record.details.rejectedCandidateIds).toEqual(['b']);
  });

  it('trap 2 wijst een kandidaat af die cosine-matcht met de referentie-set (incl. kloon-gat)', async () => {
    process.env.FLYWHEEL_DEDUP_COSINE = '0.97';
    // Verschillende pHashes → trap 1 laat door; trap 2 vindt een match ≥ 0,97.
    (mlClient.computePhash as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ content_hash: 'h', phash: '0000000000000000' });
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ similarity: 0.99 }]);
    const { survivors, record } = await runDedupPhase([cand({ id: 'a' })]);
    expect(survivors).toHaveLength(0);
    expect(record.details.rejectedCandidateIds).toEqual(['a']);
  });

  it('laat een kandidaat door als noch trap 1 noch trap 2 een duplicaat vindt', async () => {
    process.env.FLYWHEEL_DEDUP_COSINE = '0.97';
    mockPrisma.$queryRaw.mockResolvedValue([{ similarity: 0.5 }]);
    const { survivors } = await runDedupPhase([cand({ id: 'a' })]);
    expect(survivors.map((s) => s.id)).toEqual(['a']);
  });
});

// ── AC6: per-batch outlier ──────────────────────────────────────────────────
describe('outlier-fase (AC6)', () => {
  it('wijst is_outlier-kandidaten zacht af met reden outlier', async () => {
    // Embedding aanwezig voor beide.
    mockPrisma.$queryRaw.mockResolvedValue([
      { reference_candidate_id: 'a', embedding_text: '[0.1,0.2]' },
      { reference_candidate_id: 'b', embedding_text: '[0.3,0.4]' },
    ]);
    (mlClient.outlierAudit as ReturnType<typeof vi.fn>).mockResolvedValue({
      t3777_code: 'GREEN_DOT',
      centroid_size: 3,
      threshold: 0.35,
      results: [
        { id: 'a', distance: 0.1, is_outlier: false },
        { id: 'b', distance: 0.8, is_outlier: true },
      ],
    });
    const { survivors, record } = await runOutlierPhase([cand({ id: 'a' }), cand({ id: 'b' })]);
    expect(survivors.map((s) => s.id)).toEqual(['a']);
    expect(record.details.rejectedCandidateIds).toEqual(['b']);
  });

  it('laat een klasse zonder embeddings ongemoeid door (niets te meten)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]); // geen embeddings
    const { survivors } = await runOutlierPhase([cand({ id: 'a' })]);
    expect(survivors.map((s) => s.id)).toEqual(['a']);
    expect(mlClient.outlierAudit).not.toHaveBeenCalled();
  });
});

// ── AC7: gateResults per fase ───────────────────────────────────────────────
describe('gateResults-fase-records (AC7)', () => {
  it('startPhaseRecord maakt een onafgerond record; isPhaseComplete detecteert afronding', () => {
    const rec = startPhaseRecord('cap');
    expect(rec.finishedAt).toBeNull();
    expect(isPhaseComplete({ cap: rec }, 'cap')).toBe(false);
    rec.finishedAt = new Date().toISOString();
    expect(isPhaseComplete({ cap: rec }, 'cap')).toBe(true);
  });

  it('elke fase levert een record met phase + finishedAt + details', async () => {
    const { record } = await runThresholdPhase([cand()]);
    expect(record.phase).toBe('threshold');
    expect(record.finishedAt).not.toBeNull();
    expect(record.details).toHaveProperty('evaluated', 1);
  });
});

// ── drempel-fase: vrijgave onder drempel ────────────────────────────────────
describe('drempel-fase', () => {
  it('geeft een kandidaat onder de drempel vrij (in_batch → candidate), geen zachte afwijzing', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE = '0.99';
    const { survivors, record } = await runThresholdPhase([cand({ confidence: 0.9 })]);
    expect(survivors).toHaveLength(0);
    expect(record.details.releasedCandidateIds).toEqual(['c1']);
    // Vrijgave = updateMany naar candidate, geen rejected.
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'in_batch' },
      data: { status: 'candidate', promotionBatchId: null },
    });
  });
});
