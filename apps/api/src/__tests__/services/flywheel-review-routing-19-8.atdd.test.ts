/**
 * Story 19.8 — Fase 1: bootstrap-crops uit lege klassen naar de review-wachtrij (ATDD).
 *
 * HERZIEN 2026-07-07 (correct-course). De eerste aanpak (herkomst `origin:'review'`)
 * bleek fout: `nominateCandidate(origin:'review')` schrijft in `reference_candidates`,
 * een pool zónder menselijke listing — de crops bereikten geen mens. De menselijke
 * review-wachtrij (`GET /artwork/review-queue`) leest `artworkReviewItem status:'open'`.
 *
 * Deze test dwingt het HERZIENE gedrag af: het lege-klasse-pad
 * (`searchAndQueueClassForReview`) legt een gevonden sub-0,90 crop voor als OPEN
 * `artworkReviewItem` — niet via `nominateCandidate` — en respecteert de hard-negative-
 * en dedup-guard (AC2). Bij accept doet de bestaande review-handler de gold-set-aanwas
 * + origin-`review`-nominatie (buiten deze test).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { resolveDeclaredMarks } from '../../services/t3777-declarations';
import { searchAndQueueClassForReview } from '../../services/flywheel/bootstrap-run';

vi.mock('../../services/t3777-declarations', () => ({
  resolveDeclaredMarks: vi.fn(),
}));

const mockMarks = resolveDeclaredMarks as unknown as ReturnType<typeof vi.fn>;
const mockMl = mlClient as unknown as {
  bootstrapSearch: ReturnType<typeof vi.fn>;
  computePhash: ReturnType<typeof vi.fn>;
};
const mockPrisma = prisma as unknown as {
  referenceLogo: { findFirst: ReturnType<typeof vi.fn> };
  artworkImport: { findFirst: ReturnType<typeof vi.fn> };
  artworkReviewItem: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  hardNegative: { findUnique: ReturnType<typeof vi.fn> };
};

const SEED = 'reference-logos/X/seed.png';
function opts() {
  return { remainingBudget: 10, deadline: Date.now() + 60_000 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.referenceLogo.findFirst.mockImplementation(({ where }: { where: { active?: boolean } }) =>
    Promise.resolve(where.active ? null : { storagePath: SEED })
  );
  mockPrisma.artworkImport.findFirst.mockImplementation(({ where }: { where: { gtin: string } }) =>
    Promise.resolve({ storagePath: `artwork/${where.gtin}/p.png` })
  );
  mockMl.bootstrapSearch.mockResolvedValue({
    seed_path: SEED,
    threshold: 0.6,
    matches: [
      {
        gtin: '111',
        bbox: { x: 1, y: 2, width: 3, height: 4 },
        seed_cosine: 0.7, // sub-0,90: zou nooit auto-promoten → moet naar review
        crop_path: 'artwork-crops/111/crop.png',
        source_file: 'artwork/111/p.png',
      },
    ],
    gtins_processed: 1,
    gtins_total: 1,
    timed_out: false,
    seed_leaks_skipped: 0,
  });
  mockMarks.mockResolvedValue({ marks: [{ code: 'X', fieldType: 'DietTypeCode' }], reason: 'ok' });
  mockMl.computePhash.mockResolvedValue({ content_hash: 'ch-1' });
  mockPrisma.hardNegative.findUnique.mockResolvedValue(null);
  mockPrisma.artworkReviewItem.findFirst.mockResolvedValue(null);
  mockPrisma.artworkReviewItem.create.mockResolvedValue({ id: 'ri-1' });
});

describe('Story 19.8 — lege-klasse-crops gaan als OPEN review-item naar de review-wachtrij', () => {
  it('legt de sub-0,90 bootstrap-crop voor als OPEN artworkReviewItem (niet via nominateCandidate)', async () => {
    const res = await searchAndQueueClassForReview('X', ['111'], opts());

    expect(mockPrisma.artworkReviewItem.create).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.artworkReviewItem.create.mock.calls[0][0];
    expect(data.status).toBe('open');
    expect(data.t3777Code).toBe('X');
    // Het ECHTE crop_path gaat mee — nooit het zaad/label (NFR-6).
    expect(data.cropPath).toBe('artwork-crops/111/crop.png');
    expect(data.cropPath).not.toBe(SEED);
    expect(res.queuedForReview).toBe(1);
  });

  it('legt een reeds mens-afgekeurde crop (hard-negative) NIET voor', async () => {
    mockPrisma.hardNegative.findUnique.mockResolvedValue({ contentHash: 'ch-1' });
    const res = await searchAndQueueClassForReview('X', ['111'], opts());
    expect(mockPrisma.artworkReviewItem.create).not.toHaveBeenCalled();
    expect(res.outcomes.skipped).toBe(1);
    expect(res.queuedForReview).toBe(0);
  });

  it('legt een crop die al in de review-wachtrij staat NIET nogmaals voor (dedup)', async () => {
    mockPrisma.artworkReviewItem.findFirst.mockResolvedValue({ id: 'bestaand' });
    const res = await searchAndQueueClassForReview('X', ['111'], opts());
    expect(mockPrisma.artworkReviewItem.create).not.toHaveBeenCalled();
    expect(res.queuedForReview).toBe(0);
  });
});
