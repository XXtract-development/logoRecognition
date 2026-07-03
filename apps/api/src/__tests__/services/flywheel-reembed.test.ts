/**
 * Story 13.5 — Her-embed-handler van de versie-guard (reembed.ts) tests.
 *
 * Adversarial-review-fix M1: de versie-guard enqueue-t `flywheel-reembed` maar er
 * bestond geen consument — de kandidaat stagneerde na een modelactivatie
 * (livelock). Deze tests borgen dat de handler:
 *  - de embedding herberekent tegen de ACTIEVE modelversie en die versie in
 *    evidence zet (Story 13.5 taak 3.1);
 *  - overslaat wanneer de kandidaat niet (meer) `candidate` is (idempotent/AD-16),
 *    geen crop heeft, of er geen actief model is (niets om tegen te embedden).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { downloadTrainingObject } from '../../services/storage';
import { reembedCandidate } from '../../services/flywheel/reembed';

const mockPrisma = prisma as unknown as {
  referenceCandidate: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  modelVersion: { findFirst: ReturnType<typeof vi.fn> };
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
    id: 'c1',
    status: 'candidate',
    cropPath: 'crops/c1.jpg',
    evidence: { embeddingModelVersion: 'v1', statusTransitions: [] },
  });
  mockPrisma.referenceCandidate.findFirst.mockResolvedValue({ id: 'c1' });
  mockPrisma.referenceCandidate.update.mockResolvedValue({});
  mockPrisma.modelVersion.findFirst.mockResolvedValue({ version: 'v2' }); // actieve versie
  mockPrisma.$executeRaw.mockResolvedValue(1);
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  (downloadTrainingObject as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    Buffer.from('img')
  );
  (mlClient.generateEmbeddingFromBuffer as unknown as ReturnType<typeof vi.fn>) = vi
    .fn()
    .mockResolvedValue(new Array(512).fill(0.2));
});

describe('reembedCandidate (versie-guard her-embed, M1-fix)', () => {
  it('herberekent de embedding tegen de actieve modelversie en zet die in evidence', async () => {
    const outcome = await reembedCandidate('c1');

    expect(outcome).toEqual({ status: 'reembedded', candidateId: 'c1', modelVersion: 'v2' });
    // Oude vector verwijderd + nieuwe geïnsert (twee raw statements).
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    // Evidence bijgewerkt met de nieuwe modelversie.
    const updateArg = mockPrisma.referenceCandidate.update.mock.calls[0][0];
    expect(updateArg.data.evidence.embeddingModelVersion).toBe('v2');
  });

  it('slaat over als de kandidaat niet meer candidate is (AD-16, idempotent)', async () => {
    mockPrisma.referenceCandidate.findUnique.mockResolvedValueOnce({
      id: 'c1',
      status: 'in_batch',
      cropPath: 'crops/c1.jpg',
      evidence: {},
    });
    const outcome = await reembedCandidate('c1');
    expect(outcome).toEqual({ status: 'skipped', reason: 'kandidaat-niet-candidate' });
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('slaat over zonder actief model (niets om tegen te embedden)', async () => {
    mockPrisma.modelVersion.findFirst.mockResolvedValueOnce(null);
    const outcome = await reembedCandidate('c1');
    expect(outcome).toEqual({ status: 'skipped', reason: 'geen-actief-model' });
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('slaat over als de crop niet in opslag staat', async () => {
    (downloadTrainingObject as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const outcome = await reembedCandidate('c1');
    expect(outcome).toEqual({ status: 'skipped', reason: 'crop-niet-in-opslag' });
  });
});
