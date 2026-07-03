/**
 * Story 15.2 — outlier-beoordelingsbeslissing (AC6, FR-8/AD-5).
 *
 * `behouden` markeert de finding; `deactiveren` zet de referentie soft-delete
 * (active=false), markeert de finding gedeactiveerd ÉN roept KRITIEK
 * markBaselineStale aan (AD-5). Een tweede beslissing op een reeds beoordeelde
 * finding wordt geweigerd (idempotentie).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de baseline-invalidatie zodat we de verplichte AD-5-aanroep kunnen asserten.
vi.mock('../../services/flywheel/baseline', () => ({
  markBaselineStale: vi.fn().mockResolvedValue(undefined),
}));

import {
  decideOutlier,
  OutlierFindingNotFoundError,
  OutlierFindingAlreadyDecidedError,
} from '../../services/flywheel/outlier-decision';
import { markBaselineStale } from '../../services/flywheel/baseline';

type Mock = ReturnType<typeof vi.fn>;
async function db() {
  return (await import('../../core/db')).default as unknown as {
    outlierFinding: { findUnique: Mock; updateMany: Mock };
    referenceLogo: { updateMany: Mock };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('decideOutlier — behouden (AC6)', () => {
  it('markeert de finding als behouden zonder de referentie te deactiveren of baseline te muteren', async () => {
    const prisma = await db();
    prisma.outlierFinding.findUnique.mockResolvedValueOnce({
      id: 'f1',
      status: 'open',
      referenceLogoId: 'r1',
    });
    prisma.outlierFinding.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await decideOutlier({ findingId: 'f1', decision: 'behouden', by: 'u1' });

    expect(result.status).toBe('behouden');
    expect(result.deactivated).toBe(false);
    expect(prisma.referenceLogo.updateMany).not.toHaveBeenCalled();
    expect(markBaselineStale).not.toHaveBeenCalled();
  });
});

describe('decideOutlier — deactiveren (AC6, AD-5 KRITIEK)', () => {
  it('zet de referentie op active=false (soft-delete) en markeert de baseline als verouderd', async () => {
    const prisma = await db();
    prisma.outlierFinding.findUnique.mockResolvedValueOnce({
      id: 'f1',
      status: 'open',
      referenceLogoId: 'r1',
    });
    prisma.outlierFinding.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.referenceLogo.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await decideOutlier({ findingId: 'f1', decision: 'deactiveren', by: 'u1' });

    expect(result.status).toBe('gedeactiveerd');
    expect(result.deactivated).toBe(true);
    // SOFT-DELETE: active=false, nooit delete.
    expect(prisma.referenceLogo.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { active: false } })
    );
    // KRITIEK (AD-5): baseline verouderd markeren met de outlier-reden.
    expect(markBaselineStale).toHaveBeenCalledWith('outlier-deactivatie', 'u1');
  });
});

describe('decideOutlier — foutpaden', () => {
  it('onbekende finding → OutlierFindingNotFoundError', async () => {
    const prisma = await db();
    prisma.outlierFinding.findUnique.mockResolvedValueOnce(null);
    await expect(
      decideOutlier({ findingId: 'nope', decision: 'behouden', by: 'u1' })
    ).rejects.toBeInstanceOf(OutlierFindingNotFoundError);
  });

  it('reeds beoordeelde finding → OutlierFindingAlreadyDecidedError (idempotentie)', async () => {
    const prisma = await db();
    prisma.outlierFinding.findUnique.mockResolvedValueOnce({
      id: 'f1',
      status: 'behouden',
      referenceLogoId: 'r1',
    });
    await expect(
      decideOutlier({ findingId: 'f1', decision: 'deactiveren', by: 'u1' })
    ).rejects.toBeInstanceOf(OutlierFindingAlreadyDecidedError);
    // Geen mutatie, geen baseline-stale.
    expect(markBaselineStale).not.toHaveBeenCalled();
  });
});
