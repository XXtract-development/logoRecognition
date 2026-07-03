/**
 * Story 13.2 — kruischeck-hook (AC4/AC5).
 *
 * Koppel-klare service-functie voor de 12.8-CONFIRMED-verdict-plek. Dekt: dubbele
 * vlag (alleen true×true nomineert), enqueue-variant voor het request-pad, en dat
 * de functie geen verdict-response aanraakt (ze retourneert alleen de
 * nominatie-uitkomst / null).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { downloadTrainingObject } from '../../services/storage';

const mockPrisma = prisma as unknown as Record<string, any>;

const input = {
  gtin: '123',
  t3777Code: 'GREEN_DOT',
  confidence: 0.95,
  method: 'template',
  cropPath: 'c.png',
  sourceFile: 'x.png',
  bbox: { x: 1, y: 2, width: 3, height: 4 },
  declared: ['GREEN_DOT'],
};

describe('Story 13.2 — nominateFromKruischeck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'true';
    mockPrisma.hardNegative.findUnique.mockResolvedValue(null);
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue(null);
    mockPrisma.referenceCandidate.create.mockResolvedValue({ id: 'cand-1' });
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    (downloadTrainingObject as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('crop'));
    (mlClient.computePhash as ReturnType<typeof vi.fn>).mockResolvedValue({
      content_hash: 'hash-abc',
      phash: 'p',
    });
    (mlClient.generateEmbeddingFromBuffer as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Array(512).fill(0.1)
    );
  });

  it('nomineert synchroon met beide vlaggen aan (AC4)', async () => {
    const { nominateFromKruischeck } = await import('../../services/flywheel/kruischeck-hook');
    const out = await nominateFromKruischeck({ ...input, enqueue: false });
    expect(out?.status).toBe('nominated');
    expect(mockPrisma.referenceCandidate.create.mock.calls[0][0].data.origin).toBe('kruischeck');
  });

  it('nomineert NIET met alleen de hoofdvlag aan (AC5, default-uit)', async () => {
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'false';
    const { nominateFromKruischeck } = await import('../../services/flywheel/kruischeck-hook');
    const out = await nominateFromKruischeck({ ...input, enqueue: false });
    expect(out?.status).toBe('skipped');
    expect(out?.reason).toBe('vlag-uit');
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });

  it('enqueue-t op het request-pad i.p.v. inline te nomineren (NFR-3/NFR-7)', async () => {
    const bullmq = await import('bullmq');
    const addSpy = vi.fn().mockResolvedValue({ id: 'job-1' });
    (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      add: addSpy,
      close: vi.fn().mockResolvedValue(undefined),
    }));
    const { nominateFromKruischeck } = await import('../../services/flywheel/kruischeck-hook');
    const out = await nominateFromKruischeck({ ...input, enqueue: true });
    expect(out).toBeNull();
    expect(addSpy).toHaveBeenCalledOnce();
    expect(addSpy.mock.calls[0][1].origin).toBe('kruischeck');
    expect(mlClient.computePhash).not.toHaveBeenCalled();
  });
});
