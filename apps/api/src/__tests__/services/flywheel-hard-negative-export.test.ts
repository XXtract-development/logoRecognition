/**
 * Story 13.6 — Hard-negative-export (hard-negative-export.ts) tests.
 *
 * Dekt (AC 6, AD-12):
 *  - DB-filter op uitsluitend de menselijke reden-enum (quarantaine-afkeuring,
 *    reviewstation-geen-keurmerk);
 *  - defensieve tweede filterlaag: een kunstmatig geïnjecteerde zachte-reden-rij
 *    (outlier) komt er NIET doorheen;
 *  - export bevat eigen crop-paden, geen gids-beelden (crop-paden uit de rij);
 *  - CSV-serialisatie (kop + rijen, quoting).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import prisma from '../../core/db';
import {
  getHardNegativeExport,
  toCsv,
} from '../../services/flywheel/hard-negative-export';
import { HUMAN_HARD_NEGATIVE_REASONS } from '../../services/flywheel/types';

const mockPrisma = prisma as unknown as {
  hardNegative: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getHardNegativeExport (AC 6)', () => {
  it('bevraagt de DB met het menselijke reden-filter', async () => {
    mockPrisma.hardNegative.findMany.mockResolvedValue([]);
    await getHardNegativeExport();
    expect(mockPrisma.hardNegative.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reason: { in: [...HUMAN_HARD_NEGATIVE_REASONS] } },
      })
    );
  });

  it('laat menselijke redenen door (quarantaine + reviewstation)', async () => {
    mockPrisma.hardNegative.findMany.mockResolvedValue([
      {
        contentHash: 'h1',
        t3777Code: 'A',
        cropPath: 'artwork-crops/1.png',
        reason: 'quarantaine-afkeuring',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        contentHash: 'h2',
        t3777Code: 'B',
        cropPath: 'artwork-crops/2.png',
        reason: 'reviewstation-geen-keurmerk',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);
    const rows = await getHardNegativeExport();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.reason).sort()).toEqual(
      ['quarantaine-afkeuring', 'reviewstation-geen-keurmerk'].sort()
    );
    // Eigen crop-paden, geen gids-beelden.
    expect(rows.every((r) => r.cropPath?.startsWith('artwork-crops/'))).toBe(true);
  });

  it('defensief filter: een zachte-reden-rij (outlier) komt er niet doorheen', async () => {
    // Kunstmatig geïnjecteerd — mocht een rij met verkeerde reden bestaan, de
    // tweede filterlaag verwerpt hem (AD-12: die hoort er niet te zijn).
    mockPrisma.hardNegative.findMany.mockResolvedValue([
      {
        contentHash: 'h1',
        t3777Code: 'A',
        cropPath: 'artwork-crops/1.png',
        reason: 'quarantaine-afkeuring',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        contentHash: 'h3',
        t3777Code: 'C',
        cropPath: 'artwork-crops/3.png',
        reason: 'outlier',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      },
    ]);
    const rows = await getHardNegativeExport();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('quarantaine-afkeuring');
    expect(rows.find((r) => r.reason === 'outlier')).toBeUndefined();
  });
});

describe('toCsv', () => {
  it('serialiseert kop + rijen', () => {
    const csv = toCsv([
      {
        contentHash: 'h1',
        t3777Code: 'A',
        cropPath: 'artwork-crops/1.png',
        reason: 'quarantaine-afkeuring',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('contentHash,t3777Code,cropPath,reason,createdAt');
    expect(lines[1]).toContain('h1');
    expect(lines[1]).toContain('quarantaine-afkeuring');
  });
});
