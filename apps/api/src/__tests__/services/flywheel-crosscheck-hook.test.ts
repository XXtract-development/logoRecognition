/**
 * Story 13.2 — crosscheck-hook integratie-tests.
 *
 * Dekt: worker-pad nomineert synchroon (exact één kandidaat + embedding);
 * herverwerking zelfde GTIN → geen duplicaat; request-pad enqueue-t i.p.v.
 * inline; vlag uit → geen actie (byte-gelijk aan vandaag).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { downloadTrainingObject } from '../../services/storage';

const mockPrisma = prisma as unknown as Record<string, any>;

describe('Story 13.2 — nominateAutoAccepted (worker-pad)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED = 'false';
    delete process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE;
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

  const autoAccepted = [
    {
      t3777Code: 'GREEN_DOT',
      confidence: 0.95,
      method: 'template',
      cropPath: 'artwork-crops/123/a.png',
      sourceFile: 'artwork/123/x.png',
      bbox: { x: 1, y: 2, width: 3, height: 4 },
    },
  ];

  it('nomineert exact één kandidaat + embedding uit auto-accepted (AC2)', async () => {
    const { nominateAutoAccepted } = await import('../../services/flywheel/crosscheck-hook');
    const out = await nominateAutoAccepted('123', autoAccepted, ['GREEN_DOT'], 'crosscheck');
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('nominated');
    expect(mockPrisma.referenceCandidate.create).toHaveBeenCalledOnce();
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('levert geen duplicaat bij herverwerking zelfde GTIN (NFR-4)', async () => {
    // Tweede run: de kandidaat bestaat al op (contentHash, t3777Code).
    mockPrisma.referenceCandidate.findUnique.mockResolvedValue({
      id: 'cand-1',
      status: 'candidate',
      evidence: {},
    });
    const { nominateAutoAccepted } = await import('../../services/flywheel/crosscheck-hook');
    const out = await nominateAutoAccepted('123', autoAccepted, ['GREEN_DOT'], 'crosscheck');
    expect(out[0]).toEqual({ status: 'skipped', reason: 'reeds-genomineerd' });
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });

  it('doet niets met de vlag uit — byte-gelijk aan vandaag (AC8)', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    const { nominateAutoAccepted } = await import('../../services/flywheel/crosscheck-hook');
    const out = await nominateAutoAccepted('123', autoAccepted, ['GREEN_DOT'], 'crosscheck');
    expect(out).toEqual([]);
    expect(mlClient.computePhash).not.toHaveBeenCalled();
    expect(mockPrisma.referenceCandidate.create).not.toHaveBeenCalled();
  });
});

describe('Story 13.2 — enqueueNominations (request-pad, NFR-3/NFR-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'true';
    (mlClient.computePhash as ReturnType<typeof vi.fn>).mockResolvedValue({
      content_hash: 'hash-abc',
      phash: 'p',
    });
  });

  it('enqueue-t i.p.v. inline te nomineren op het request-pad', async () => {
    const bullmq = await import('bullmq');
    const addSpy = vi.fn().mockResolvedValue({ id: 'job-1' });
    (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      add: addSpy,
      close: vi.fn().mockResolvedValue(undefined),
    }));

    const { enqueueNominations } = await import('../../services/flywheel/crosscheck-hook');
    await enqueueNominations(
      '123',
      [{ t3777Code: 'GREEN_DOT', confidence: 0.95, cropPath: 'c.png' }],
      ['GREEN_DOT'],
      'crosscheck'
    );

    expect(addSpy).toHaveBeenCalledOnce();
    // Geen inline phash/insert op het request-pad.
    expect(mlClient.computePhash).not.toHaveBeenCalled();
    const [jobName, jobData] = addSpy.mock.calls[0];
    expect(jobName).toBe('nominate-crosscheck');
    expect(jobData.origin).toBe('crosscheck');
    expect(jobData.detections).toHaveLength(1);
  });

  it('enqueue-t niets met de vlag uit', async () => {
    process.env.FLYWHEEL_NOMINATION_ENABLED = 'false';
    const bullmq = await import('bullmq');
    const addSpy = vi.fn();
    (bullmq.Queue as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      add: addSpy,
      close: vi.fn().mockResolvedValue(undefined),
    }));
    const { enqueueNominations } = await import('../../services/flywheel/crosscheck-hook');
    await enqueueNominations('123', [{ t3777Code: 'X', confidence: 1, cropPath: 'c.png' }], ['X']);
    expect(addSpy).not.toHaveBeenCalled();
  });
});
