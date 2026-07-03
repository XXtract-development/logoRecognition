/**
 * Story 13.2 — Nominatie-service unit-tests.
 *
 * Dekt: drempel-per-methode, vlag-matrix (hoofd × kruischeck), hash-blokkades
 * (hard-negative + bestaande kandidaat), status-reset-pad, fail-closed bij
 * phash-fout (+ gemiste-nominatie-event), evidence-contract, transactionele
 * integriteit (kandidaat + embedding samen). prisma / mlClient / storage worden
 * globaal gemockt in setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';

const mockPrisma = prisma as unknown as {
  hardNegative: { findUnique: ReturnType<typeof vi.fn> };
  referenceCandidate: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
};

function baseDetection(overrides: Record<string, unknown> = {}) {
  return {
    t3777Code: 'GREEN_DOT',
    confidence: 0.95,
    method: 'template',
    cropPath: 'artwork-crops/123/a.png',
    sourceFile: 'artwork/123/x.png',
    bbox: { x: 1, y: 2, width: 3, height: 4 },
    ...overrides,
  };
}

describe('Story 13.2 — nominateCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    // Default: alle vlaggen aan zodat de happy path werkt tenzij een test 'm uitzet.
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE;
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING;
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER;

    mockPrisma.hardNegative.findUnique.mockResolvedValue(null);
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue(null);
    mockPrisma.referenceCandidate.create.mockResolvedValue({ id: 'cand-1' });
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.referenceCandidate.update.mockResolvedValue({});
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    (mlClient.computePhash as ReturnType<typeof vi.fn>).mockResolvedValue({
      content_hash: 'hash-abc',
      phash: 'p',
    });
    (mlClient.generateEmbeddingFromBuffer as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Array(512).fill(0.1)
    );
  });

  // AC 2 — happy path: exact één kandidaat + embedding, phash synchroon.
  it('nomineert exact één kandidaat met embedding en synchrone hash (AC2)', async () => {
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });

    expect(out).toEqual({ status: 'nominated', candidateId: 'cand-1', reused: false });
    expect(mlClient.computePhash).toHaveBeenCalledWith('artwork-crops/123/a.png');
    expect(mockPrisma.referenceCandidate.create).toHaveBeenCalledOnce();
    // Embedding-INSERT via raw in dezelfde transactie (kandidaat + embedding samen).
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
    const createArg = mockPrisma.referenceCandidate.create.mock.calls[0][0];
    expect(createArg.data.status).toBe('candidate');
    expect(createArg.data.origin).toBe('crosscheck');
    expect(createArg.data.contentHash).toBe('hash-abc');
  });

  // AC 2 — evidence-contract gevuld.
  it('vult het evidence-contract (bron-GTIN, bbox, methode, scores, hash) (AC2)', async () => {
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
      embeddingModelVersion: 'm-1',
    });
    const evidence = mockPrisma.referenceCandidate.create.mock.calls[0][0].data.evidence;
    expect(evidence.sourceGtin).toBe('123');
    expect(evidence.bbox).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(evidence.method).toBe('template');
    expect(evidence.scores).toEqual({ confidence: 0.95 });
    expect(evidence.contentHash).toBe('hash-abc');
    expect(evidence.embeddingModelVersion).toBe('m-1');
    expect(Array.isArray(evidence.statusTransitions)).toBe(true);
  });

  // AC 8 — onder de drempel → geen kandidaat.
  it('nomineert niet onder de promotiedrempel (AC8)', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE = '0.90';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection({ confidence: 0.89 }),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'onder-drempel' });
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });

  // AC 8 — precies op de drempel telt als ≥.
  it('nomineert precies op de drempel (0,90 grens) (AC8)', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE = '0.90';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection({ confidence: 0.9 }),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out.status).toBe('nominated');
  });

  // AC 8 — methode zonder mapping valt onder classifier-drempel (strengst).
  it('past de classifier-drempel toe bij ontbrekende methode (AC8)', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER = '0.95';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection({ method: undefined, confidence: 0.94 }),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'onder-drempel' });
  });

  // AC 8 — geen declaratie-bevestiging → geen kandidaat.
  it('nomineert niet zonder declaratie-bevestiging (AC8)', async () => {
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: [],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'geen-declaratie-bevestiging' });
  });

  // AC 8 — hash in hard_negatives → geblokkeerd.
  it('blokkeert een hash die al in hard_negatives staat (AC8, FR-9)', async () => {
    mockPrisma.hardNegative.findUnique.mockResolvedValue({ id: 'hn-1', contentHash: 'hash-abc' });
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'hard-negative' });
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });

  // AC 8 — bestaande kandidaat → idempotent, geen duplicaat.
  it('maakt geen duplicaat als er al een candidate-rij bestaat (AC8, NFR-4)', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      id: 'cand-existing',
      status: 'candidate',
      evidence: {},
    });
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'reeds-genomineerd' });
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });

  // AC 8 — status-reset: rejected + zachte reden → candidate, GEEN insert.
  it('reset een zacht afgewezen rij terug naar candidate zonder nieuwe insert (AC8, AD-12)', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      id: 'cand-rej',
      status: 'rejected',
      evidence: { rejectionReason: 'duplicaat' },
    });
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'nominated', candidateId: 'cand-rej', reused: true });
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cand-rej', status: 'rejected' }, data: { status: 'candidate' } })
    );
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });

  // AC 8 — rejected met HARDE reden → geen reset (blijft afgewezen).
  it('reset een hard afgewezen rij NIET (AC8, AD-12)', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      id: 'cand-hardrej',
      status: 'rejected',
      evidence: { rejectionReason: 'geen-keurmerk' },
    });
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'reeds-genomineerd' });
    expect(mockPrisma.referenceCandidate.updateMany).not.toHaveBeenCalled();
  });

  // AC 2 — fail-closed: phash onbereikbaar → refused + geen record.
  it('weigert fail-closed als /ml/phash faalt en registreert het event (AC2, AD-14, AC7)', async () => {
    (mlClient.computePhash as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ml down'));
    const missed = await import('../../services/flywheel/missed-nominations');
    const spy = vi.spyOn(missed, 'recordMissedNomination');
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'refused', reason: 'phash-onbereikbaar' });
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith('phash-onbereikbaar', expect.anything());
  });

  // AC 5 — vlag-matrix: kruischeck vereist BEIDE vlaggen.
  it('nomineert kruischeck NIET met alleen de hoofdvlag aan (AC5, AD-8)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'false';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'kruischeck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'vlag-uit' });
  });

  it('nomineert kruischeck WEL met beide vlaggen aan (AC4, AD-8)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'kruischeck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out.status).toBe('nominated');
  });

  // AC 8 — hoofdvlag uit → geen kandidaat.
  it('nomineert niet met de hoofdvlag uit (AC8)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection(),
      origin: 'crosscheck',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out).toEqual({ status: 'skipped', reason: 'vlag-uit' });
  });

  // AC 6 — review-herkomst is drempel-exempt (menselijke bevestiging).
  it('nomineert review ook onder de model-drempel (AC6)', async () => {
    process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE = '0.90';
    const { nominateCandidate } = await import('../../services/flywheel/nomination');
    const out = await nominateCandidate({
      detection: baseDetection({ confidence: 0.4 }),
      origin: 'review',
      gtin: '123',
      declared: ['GREEN_DOT'],
      embedding: new Array(512).fill(0.2),
    });
    expect(out.status).toBe('nominated');
    expect(mockPrisma.referenceCandidate.create.mock.calls[0][0].data.origin).toBe('review');
  });
});
