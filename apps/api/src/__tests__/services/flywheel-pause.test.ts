/**
 * Story 13.6 — Persistente pauze + automatische stilstand (pause.ts) tests.
 *
 * Dekt:
 *  - AC 4: K=2-detectie (1 quarantaine → geen pauze; 2 opeenvolgend → pauze +
 *          notificatie; passed ertussen reset de reeks via resetQuarantineStreak);
 *  - AC 4: pauze-stand PERSISTENT in system_settings (upsert), teller persistent;
 *  - AC 5: resume logt gebruiker+tijd en reset de teller;
 *  - pauze-scope-hulp: shouldSkipForPause geeft true wanneer gepauzeerd.
 *
 * De settings-store wordt op zijn prisma-grens getest via de gemockte
 * `systemSetting`-delegate; de read-cache wordt per test gewist.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import prisma from '../../core/db';
import {
  isPaused,
  pause,
  resume,
  getPauseState,
  registerQuarantine,
  resetQuarantineStreak,
  getQuarantineStreak,
  shouldSkipForPause,
  getAutoPauseK,
} from '../../services/flywheel/pause';
import { clearSettingsCache, SETTING_KEYS } from '../../services/flywheel/system-settings';

const mockPrisma = prisma as unknown as {
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  retrainingNotification: { create: ReturnType<typeof vi.fn> };
};

/** In-memory system_settings-store zodat opeenvolgende lees/schrijf klopt. */
let store: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSettingsCache();
  delete process.env.FLYWHEEL_AUTO_PAUSE_K;
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
  mockPrisma.retrainingNotification.create.mockResolvedValue({ id: 'n1' });
});

// ── persistente pauze (AC 4/5) ───────────────────────────────────────────────
describe('persistente pauze (AC 4/5)', () => {
  it('isPaused default false zonder stand', async () => {
    expect(await isPaused()).toBe(false);
  });

  it('pause() persisteert paused=true met reden/tijd/gebruiker in system_settings', async () => {
    await pause('handmatig', 'user-1');
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: SETTING_KEYS.PAUSED },
        create: expect.objectContaining({
          key: SETTING_KEYS.PAUSED,
          value: expect.objectContaining({ paused: true, reason: 'handmatig', by: 'user-1' }),
        }),
      })
    );
    clearSettingsCache();
    expect(await isPaused()).toBe(true);
    const state = await getPauseState();
    expect(state.paused).toBe(true);
    expect(state.since).toBeTruthy();
  });

  it('resume() zet paused=false, logt gebruiker en reset de teller (AC 5)', async () => {
    await pause('handmatig', 'user-1');
    // vul een lopende teller
    store[SETTING_KEYS.AUTO_PAUSE_STREAK] = { count: 1, batchIds: ['b1'] };
    clearSettingsCache();

    const state = await resume('user-2');
    expect(state.paused).toBe(false);
    expect(state.by).toBe('user-2');
    clearSettingsCache();
    expect(await isPaused()).toBe(false);
    const streak = await getQuarantineStreak();
    expect(streak.count).toBe(0);
  });
});

// ── automatische stilstand K=2 (AC 4) ────────────────────────────────────────
describe('automatische stilstand K=2 (AC 4)', () => {
  it('één quarantaine → geen pauze, teller op 1', async () => {
    const paused = await registerQuarantine('b1');
    expect(paused).toBe(false);
    clearSettingsCache();
    expect(await isPaused()).toBe(false);
    const streak = await getQuarantineStreak();
    expect(streak.count).toBe(1);
  });

  it('twee opeenvolgende quarantaines → zelf-pauze + notificatie (AC 4)', async () => {
    await registerQuarantine('b1');
    clearSettingsCache();
    const paused = await registerQuarantine('b2');
    expect(paused).toBe(true);
    clearSettingsCache();
    expect(await isPaused()).toBe(true);
    // Notificatie via RetrainingNotification-patroon met reason-code flywheel-auto-paused.
    expect(mockPrisma.retrainingNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggerId: expect.stringContaining('flywheel-auto-paused'),
          status: 'unread',
        }),
      })
    );
    const reasons = mockPrisma.retrainingNotification.create.mock.calls[0][0].data.reasons as string[];
    expect(reasons[0]).toContain('b1');
    expect(reasons[0]).toContain('b2');
  });

  it('passed ertussen reset de reeks — geen pauze na de tweede losse quarantaine', async () => {
    await registerQuarantine('b1');
    clearSettingsCache();
    await resetQuarantineStreak(); // passed-batch doorbreekt de reeks
    clearSettingsCache();
    const paused = await registerQuarantine('b2');
    expect(paused).toBe(false);
    clearSettingsCache();
    expect(await isPaused()).toBe(false);
  });

  it('K instelbaar via FLYWHEEL_AUTO_PAUSE_K', async () => {
    process.env.FLYWHEEL_AUTO_PAUSE_K = '3';
    expect(getAutoPauseK()).toBe(3);
    await registerQuarantine('b1');
    clearSettingsCache();
    await registerQuarantine('b2');
    clearSettingsCache();
    expect(await isPaused()).toBe(false); // nog niet bij 2
    const paused = await registerQuarantine('b3');
    expect(paused).toBe(true);
  });
});

// ── pauze-scope-hulp ─────────────────────────────────────────────────────────
describe('shouldSkipForPause (pauze-scope AD-11)', () => {
  it('false wanneer niet gepauzeerd', async () => {
    expect(await shouldSkipForPause('flywheel-promotion')).toBe(false);
  });

  it('true wanneer gepauzeerd', async () => {
    await pause('handmatig', 'user-1');
    clearSettingsCache();
    expect(await shouldSkipForPause('flywheel-promotion')).toBe(true);
  });
});
