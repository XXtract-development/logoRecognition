/**
 * Story 13.6 — Baseline-invalidatie schrijfkant (baseline.ts) tests.
 *
 * Dekt (AC 3, AD-5):
 *  - markBaselineStale schrijft de stale-marker in system_settings;
 *  - isBaselineStale leest de DB-marker (true na markeren);
 *  - consumeBaselineStale leest én reset de marker (verse nulmeting-cyclus);
 *  - env-override FLYWHEEL_BASELINE_STALE forceert stale zonder DB-marker.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import prisma from '../../core/db';
import {
  markBaselineStale,
  isBaselineStale,
  consumeBaselineStale,
} from '../../services/flywheel/baseline';
import { clearSettingsCache, SETTING_KEYS } from '../../services/flywheel/system-settings';

const mockPrisma = prisma as unknown as {
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

let store: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  delete process.env.FLYWHEEL_BASELINE_STALE;
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
});

afterEach(() => {
  delete process.env.FLYWHEEL_BASELINE_STALE;
});

describe('markBaselineStale (AC 3)', () => {
  it('schrijft de stale-marker in system_settings met reden + gebruiker', async () => {
    await markBaselineStale('rollback', 'user-1');
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: SETTING_KEYS.BASELINE_STALE },
        create: expect.objectContaining({
          value: expect.objectContaining({ stale: true, reason: 'rollback', by: 'user-1' }),
        }),
      })
    );
  });

  it('isBaselineStale true na markeren', async () => {
    expect(await isBaselineStale()).toBe(false);
    await markBaselineStale('reference-curatie', null);
    clearSettingsCache();
    expect(await isBaselineStale()).toBe(true);
  });
});

describe('consumeBaselineStale (AC 3 — verse-nulmeting-cyclus)', () => {
  it('leest true en reset de marker naar stale=false', async () => {
    await markBaselineStale('legacy-12.3-registratie', null);
    clearSettingsCache();

    const was = await consumeBaselineStale();
    expect(was).toBe(true);
    clearSettingsCache();
    // Na consumeren is de baseline niet meer verouderd.
    expect(await isBaselineStale()).toBe(false);
  });

  it('geeft false wanneer er geen marker staat (niets te consumeren)', async () => {
    expect(await consumeBaselineStale()).toBe(false);
  });
});

describe('env-override FLYWHEEL_BASELINE_STALE', () => {
  it('forceert stale zonder DB-marker', async () => {
    process.env.FLYWHEEL_BASELINE_STALE = 'true';
    expect(await isBaselineStale()).toBe(true);
  });
});
