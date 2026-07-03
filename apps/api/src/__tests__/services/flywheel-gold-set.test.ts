/**
 * Story 13.3 — Gold-set-service unit-tests (AC 3 + immutability-guard).
 *
 * Dekt:
 *   - getActiveGoldSet: filtert vervangen records uit (replacedById IS NULL),
 *     optioneel crop-only.
 *   - replaceGoldSetRecord: happy path (oud record behouden + verwijzing gezet),
 *     dubbele vervanging → fout (conditional update 0 rijen), transactionaliteit
 *     (INSERT en UPDATE samen of geen van beide).
 *   - Immutability-guard: de service biedt GEEN update op inhoudskolommen en
 *     GEEN delete.
 *
 * prisma wordt globaal gemockt in setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import prisma from '../../core/db';
import {
  getActiveGoldSet,
  replaceGoldSetRecord,
  GoldSetReplacementError,
} from '../../services/flywheel/gold-set';
import * as goldSetModule from '../../services/flywheel/gold-set';

const mockPrisma = prisma as unknown as {
  goldSetRecord: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('Story 13.3 — gold-set-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.goldSetRecord.findMany.mockResolvedValue([]);
    mockPrisma.goldSetRecord.create.mockResolvedValue({ id: 'new-1' });
    mockPrisma.goldSetRecord.updateMany.mockResolvedValue({ count: 1 });
    // Interactive transaction: hand the same mock client back as tx.
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  });

  // --- AC 3: actieve-set-resolutie ---------------------------------------

  it('getActiveGoldSet vraagt uitsluitend records met replacedById IS NULL op (AC3)', async () => {
    mockPrisma.goldSetRecord.findMany.mockResolvedValue([{ id: 'a', replacedById: null }]);
    const out = await getActiveGoldSet();
    expect(mockPrisma.goldSetRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ replacedById: null }) })
    );
    expect(out).toHaveLength(1);
  });

  it('getActiveGoldSet met cropOnly filtert GTIN-niveau records (cropPath NULL) uit (AC3)', async () => {
    await getActiveGoldSet({ cropOnly: true });
    expect(mockPrisma.goldSetRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ replacedById: null, cropPath: { not: null } }),
      })
    );
  });

  it('getActiveGoldSet zonder cropOnly filtert NIET op cropPath (AC3)', async () => {
    await getActiveGoldSet();
    const arg = mockPrisma.goldSetRecord.findMany.mock.calls[0][0];
    expect(arg.where).not.toHaveProperty('cropPath');
  });

  // --- AC 3: vervanging ---------------------------------------------------

  it('replaceGoldSetRecord maakt nieuw record aan en zet replacedById op het oude (AC3)', async () => {
    mockPrisma.goldSetRecord.create.mockResolvedValue({ id: 'new-99' });
    mockPrisma.goldSetRecord.updateMany.mockResolvedValue({ count: 1 });

    const out = await replaceGoldSetRecord('old-1', {
      label: 'ECHT',
      t3777Code: 'GREEN_DOT',
      cropPath: 'artwork-crops/x/y.png',
      source: 'review',
      decidedBy: 'reviewer@x',
    });

    // INSERT nieuw record
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'ECHT', t3777Code: 'GREEN_DOT' }),
      })
    );
    // Conditionele UPDATE op het oude record: alleen als nog actief.
    expect(mockPrisma.goldSetRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'old-1', replacedById: null },
      data: { replacedById: 'new-99' },
    });
    expect(out.id).toBe('new-99');
  });

  it('replaceGoldSetRecord gooit GoldSetReplacementError bij dubbele vervanging (0 rijen) (AC3)', async () => {
    mockPrisma.goldSetRecord.create.mockResolvedValue({ id: 'new-2' });
    mockPrisma.goldSetRecord.updateMany.mockResolvedValue({ count: 0 }); // al vervangen

    await expect(
      replaceGoldSetRecord('old-2', { label: 'VALS', t3777Code: 'TRIMAN', source: 'review' })
    ).rejects.toBeInstanceOf(GoldSetReplacementError);
  });

  it('replaceGoldSetRecord draait INSERT + UPDATE binnen één transactie (AC3)', async () => {
    await replaceGoldSetRecord('old-3', { label: 'ECHT', t3777Code: 'AISE', source: 'review' });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('bij 0-rijen-vervanging faalt de transactie zodat de insert terugrolt (transactionaliteit)', async () => {
    // De throw gebeurt BINNEN de transactie-callback; $transaction propageert 'm.
    mockPrisma.goldSetRecord.updateMany.mockResolvedValue({ count: 0 });
    let threw = false;
    try {
      await replaceGoldSetRecord('old-4', { label: 'ECHT', t3777Code: 'X', source: 'review' });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // create is aangeroepen binnen de tx; de fout zorgt dat de tx niet commit
    // (in echte DB rollt de insert terug — hier verifiëren we dat de fout
    // binnen de tx-callback ontstaat, niet erna).
    expect(mockPrisma.goldSetRecord.create).toHaveBeenCalled();
  });

  // --- Immutability-guard (Task 2.3) -------------------------------------

  it('de gold-set-service exporteert GEEN update-op-inhoud of delete-functie (immutability)', () => {
    const exported = Object.keys(goldSetModule);
    // Alleen deze functies/klassen zijn toegestaan; geen updateRecord/deleteRecord.
    expect(exported).toContain('getActiveGoldSet');
    expect(exported).toContain('replaceGoldSetRecord');
    expect(exported).not.toContain('updateGoldSetRecord');
    expect(exported).not.toContain('deleteGoldSetRecord');
    // Geen enkele export mag 'delete' of 'update' (op inhoud) heten.
    for (const name of exported) {
      expect(name.toLowerCase()).not.toMatch(/^(delete|update)goldset/);
    }
  });

  it('replaceGoldSetRecord gebruikt NOOIT prisma.goldSetRecord.delete of .update (alleen create + updateMany-tombstone)', async () => {
    await replaceGoldSetRecord('old-5', { label: 'ECHT', t3777Code: 'Y', source: 'review' });
    expect(mockPrisma.goldSetRecord.delete).not.toHaveBeenCalled();
    // .update (single, op inhoud) mag niet — alleen updateMany voor de tombstone.
    expect(mockPrisma.goldSetRecord.update).not.toHaveBeenCalled();
  });
});
