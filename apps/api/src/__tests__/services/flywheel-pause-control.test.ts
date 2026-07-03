/**
 * Story 15.4 — Pauzebediening (pause-control.ts) tests.
 *
 * Dekt:
 *  - AC 3: pauzeren muteert de persistente pauze-stand (system_settings) én logt
 *          een `threshold_changes`-overgang met gebruiker;
 *  - AC 4: hervatten logt gebruiker + tijdstempel (patroon threshold_changes) en
 *          BLOKKEERT NIET op openstaande quarantaines — geeft het aantal terug
 *          als waarschuwing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import prisma from '../../core/db';
import {
  pauseFlywheelControlled,
  resumeFlywheelControlled,
  PAUSE_THRESHOLD_KEY,
} from '../../services/flywheel/pause-control';
import { clearSettingsCache, SETTING_KEYS } from '../../services/flywheel/system-settings';

const mockPrisma = prisma as unknown as {
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  thresholdChange: { create: ReturnType<typeof vi.fn> };
  promotionBatch: { count: ReturnType<typeof vi.fn> };
};

let store: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  store = {};

  mockPrisma.systemSetting.findUnique.mockImplementation(
    async ({ where }: { where: { key: string } }) =>
      where.key in store ? { key: where.key, value: store[where.key] } : null
  );
  mockPrisma.systemSetting.upsert.mockImplementation(
    async ({ where, create }: { where: { key: string }; create: { value: unknown } }) => {
      store[where.key] = create.value;
      return { key: where.key, value: create.value };
    }
  );
  mockPrisma.thresholdChange.create.mockResolvedValue({ id: 'tc-1' });
  mockPrisma.promotionBatch.count.mockResolvedValue(0);
});

describe('pauseFlywheelControlled (AC 3)', () => {
  it('persisteert paused=true in system_settings met gebruiker', async () => {
    const result = await pauseFlywheelControlled('sanne', 'handmatig');
    expect(result.paused).toBe(true);
    expect((store[SETTING_KEYS.PAUSED] as { paused: boolean }).paused).toBe(true);
  });

  it('logt de pauze-overgang in threshold_changes (false → true) met gebruiker', async () => {
    await pauseFlywheelControlled('sanne', 'handmatig');
    expect(mockPrisma.thresholdChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thresholdKey: PAUSE_THRESHOLD_KEY,
          oldValue: 'false',
          newValue: 'true',
          userId: 'sanne',
        }),
      })
    );
  });
});

describe('resumeFlywheelControlled (AC 4)', () => {
  beforeEach(() => {
    // Start vanuit een gepauzeerde stand.
    store[SETTING_KEYS.PAUSED] = { paused: true, reason: 'x', since: 's', by: 'sanne' };
  });

  it('logt de hervat-overgang (true → false) met gebruiker + tijdstempel', async () => {
    await resumeFlywheelControlled('sanne');
    expect(mockPrisma.thresholdChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thresholdKey: PAUSE_THRESHOLD_KEY,
          oldValue: 'true',
          newValue: 'false',
          userId: 'sanne',
        }),
      })
    );
    expect((store[SETTING_KEYS.PAUSED] as { paused: boolean }).paused).toBe(false);
  });

  it('BLOKKEERT NIET op openstaande quarantaines maar geeft het aantal als waarschuwing', async () => {
    mockPrisma.promotionBatch.count.mockResolvedValue(2);
    const result = await resumeFlywheelControlled('sanne');
    // Hervatting is doorgegaan (paused=false), quarantaines alleen als waarschuwing.
    expect(result.paused).toBe(false);
    expect(result.openQuarantines).toBe(2);
  });
});
