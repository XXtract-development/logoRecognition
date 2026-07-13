/**
 * Story 13.5 — Atomaire promotie (promotion.ts) tests.
 *
 * Dekt (AC5):
 *  - atomiciteit: alle drie de stappen of geen (embedding-kopie faalt na de
 *    ReferenceLogo-INSERT → gooit → transactie rolt terug, geen promotie);
 *  - variantLabel-conventie auto-{batchShortId}-{seq} (botsingsvrij per kandidaat);
 *  - cap-in-transactie: cap vol → kandidaat afgewezen, GEEN INSERT;
 *  - conditional-update-race: kandidaat niet meer in_batch → overslaan (skipped).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de cap-check zodat de transactie-logica los getest wordt.
const assertClassCapWithinTx = vi.fn();
vi.mock('../../services/flywheel/guardrails', async () => {
  const actual = await vi.importActual<typeof import('../../services/flywheel/guardrails')>(
    '../../services/flywheel/guardrails'
  );
  return { ...actual, assertClassCapWithinTx: (...a: unknown[]) => assertClassCapWithinTx(...a) };
});

import prisma from '../../core/db';
import {
  promoteOne,
  promoteBatchCandidates,
  buildVariantLabel,
  batchShortId,
} from '../../services/flywheel/promotion';

const mockPrisma = prisma as unknown as {
  referenceLogo: { create: ReturnType<typeof vi.fn> };
  referenceCandidate: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  $executeRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  assertClassCapWithinTx.mockResolvedValue(true); // ruimte
  mockPrisma.referenceLogo.create.mockResolvedValue({ id: 'ref-1' });
  mockPrisma.$executeRaw.mockResolvedValue(1); // één embedding gekopieerd
  mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.referenceCandidate.findMany.mockResolvedValue([]);
  // Interactieve transactie: geef dezelfde mock terug als tx.
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
});

const candidate = { id: 'c1', t3777Code: 'A', cropPath: 'crops/c1.jpg', embeddingModelVersion: 'v1' };

// ── variantLabel-conventie ──────────────────────────────────────────────────
describe('variantLabel-conventie (AC5)', () => {
  it('bouwt auto-{batchShortId}-{seq} letterlijk', () => {
    expect(batchShortId('abcd1234-5678-90ab-cdef-000000000000')).toBe('abcd1234');
    expect(buildVariantLabel('abcd1234-5678-90ab-cdef-000000000000', 3)).toBe('auto-abcd1234-3');
  });
});

// ── atomiciteit ─────────────────────────────────────────────────────────────
describe('promoteOne (AC5 — atomiciteit)', () => {
  it('promoveert: ReferenceLogo + embedding-kopie + status→promoted', async () => {
    const out = await promoteOne(candidate, 'auto-x-1');
    expect(out).toEqual({ status: 'promoted', referenceLogoId: 'ref-1' });
    expect(mockPrisma.referenceLogo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: true, source: 'flywheel-promotion', variantLabel: 'auto-x-1', t3777Code: 'A' }),
      })
    );
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1); // embedding gekopieerd
    expect(mockPrisma.referenceCandidate.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'in_batch' },
      data: { status: 'promoted', referenceLogoId: 'ref-1' },
    });
  });

  // Story 12.10 (AC3) — promotie zet field_type/gs1_field expliciet uit de
  // code-mapping, niet de schema-default.
  it('zet field_type/gs1_field uit de code-mapping op de promotie-INSERT (AC3)', async () => {
    const nutriCandidate = { ...candidate, t3777Code: 'NUTRISCORE_A' };
    await promoteOne(nutriCandidate, 'auto-x-1');
    expect(mockPrisma.referenceLogo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          t3777Code: 'NUTRISCORE_A',
          fieldType: 'NutritionalScore',
          gs1Field: 'nutritionalScore',
        }),
      })
    );
  });

  it('geen kopieerbare embedding (0 rows) → gooit → geen promotie (rollback)', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(0);
    await expect(promoteOne(candidate, 'auto-x-1')).rejects.toThrow(/geen kopieerbare embedding/i);
    // status wordt niet op promoted gezet.
    expect(mockPrisma.referenceCandidate.updateMany).not.toHaveBeenCalled();
  });

  it('cap vol → cap-rejected, GEEN ReferenceLogo-INSERT', async () => {
    assertClassCapWithinTx.mockResolvedValue(false);
    const out = await promoteOne(candidate, 'auto-x-1');
    expect(out).toEqual({ status: 'cap-rejected' });
    expect(mockPrisma.referenceLogo.create).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('conditional-update-race (0 rows) → skipped', async () => {
    mockPrisma.referenceCandidate.updateMany.mockResolvedValue({ count: 0 });
    const out = await promoteOne(candidate, 'auto-x-1');
    expect(out).toEqual({ status: 'skipped' });
  });
});

// ── batch-niveau ────────────────────────────────────────────────────────────
describe('promoteBatchCandidates (AC5)', () => {
  it('promoveert elke in_batch-kandidaat met een uniek volgnummer', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { id: 'c1', t3777Code: 'A', cropPath: 'p1', evidence: { embeddingModelVersion: 'v1' } },
      { id: 'c2', t3777Code: 'A', cropPath: 'p2', evidence: { embeddingModelVersion: 'v1' } },
    ]);
    const res = await promoteBatchCandidates('abcd1234-0000-0000-0000-000000000000');
    expect(res.promoted).toHaveLength(2);
    expect(res.promoted[0].variantLabel).toBe('auto-abcd1234-1');
    expect(res.promoted[1].variantLabel).toBe('auto-abcd1234-2');
  });

  it('een gefaalde kandidaat-transactie stopt de batch niet (rest gaat door)', async () => {
    mockPrisma.referenceCandidate.findMany.mockResolvedValue([
      { id: 'c1', t3777Code: 'A', cropPath: 'p1', evidence: {} },
      { id: 'c2', t3777Code: 'A', cropPath: 'p2', evidence: {} },
    ]);
    // Eerste kandidaat: embedding-INSERT gooit (infra); tweede: normaal.
    mockPrisma.$executeRaw
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(1);
    const res = await promoteBatchCandidates('abcd1234-0000-0000-0000-000000000000');
    expect(res.failed).toEqual(['c1']);
    expect(res.promoted.map((p) => p.candidateId)).toEqual(['c2']);
  });
});
