/**
 * Story 13.4 — Watchdog-tests (AC9).
 *
 * Dekt: "laatste succesvolle run" vastleggen/lezen (Redis) · watchdog-drempel
 * 26h (binnen/boven) · nooit-gedraaid → geen melding · dedup binnen het venster
 * · notificatie via het RetrainingNotification-patroon (persistente rij + Socket.IO).
 *
 * De Redis-connectie en Socket.IO worden op module-grens gemockt; prisma globaal.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mock de Redis-connectie (via pipeline/queue.getRedisConnection) ----------
const redisStore = new Map<string, string>();
const redisGet = vi.fn(async (k: string) => redisStore.get(k) ?? null);
const redisSet = vi.fn(async (k: string, v: string) => { redisStore.set(k, v); return 'OK'; });
const redisSetex = vi.fn(async (k: string, _ttl: number, v: string) => { redisStore.set(k, v); return 'OK'; });
const redisDel = vi.fn(async (k: string) => { redisStore.delete(k); return 1; });

vi.mock('../../services/pipeline/queue', () => ({
  getRedisConnection: () => ({ get: redisGet, set: redisSet, setex: redisSetex, del: redisDel }),
}));

// --- Mock Socket.IO ----------------------------------------------------------
const broadcastAll = vi.fn();
vi.mock('../../services/socket-io-manager', () => ({
  socketIOManager: { broadcastAll: (...a: unknown[]) => broadcastAll(...a) },
}));

import prisma from '../../core/db';
import {
  markPromotionRunSuccess,
  getLastSuccessfulPromotionRun,
  runWatchdogCheck,
} from '../../services/flywheel/watchdog';

const mockPrisma = prisma as unknown as {
  retrainingNotification: { create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
  delete process.env.FLYWHEEL_WATCHDOG_STALE_HOURS;
  mockPrisma.retrainingNotification.create.mockResolvedValue({ id: 'n1' });
});

describe('markPromotionRunSuccess / getLastSuccessfulPromotionRun', () => {
  it('legt een ISO-timestamp vast en leest die weer terug', async () => {
    const at = new Date('2026-07-03T01:00:00.000Z');
    await markPromotionRunSuccess(at);
    expect(await getLastSuccessfulPromotionRun()).toBe(at.toISOString());
  });

  it('geeft null als er nog nooit een succesvolle run was', async () => {
    expect(await getLastSuccessfulPromotionRun()).toBeNull();
  });
});

describe('runWatchdogCheck (AC9)', () => {
  it('meldt NIET als er nog nooit een run was (verse omgeving)', async () => {
    const res = await runWatchdogCheck();
    expect(res.stalled).toBe(false);
    expect(mockPrisma.retrainingNotification.create).not.toHaveBeenCalled();
  });

  it('meldt NIET als de laatste run binnen de drempel valt (<26h)', async () => {
    const now = new Date('2026-07-03T12:00:00.000Z');
    await markPromotionRunSuccess(new Date('2026-07-03T01:00:00.000Z')); // 11h oud
    const res = await runWatchdogCheck(now);
    expect(res.stalled).toBe(false);
    expect(broadcastAll).not.toHaveBeenCalled();
  });

  it('meldt stilstand als de laatste run ouder is dan 26h (persistente rij + Socket.IO)', async () => {
    const now = new Date('2026-07-04T12:00:00.000Z');
    await markPromotionRunSuccess(new Date('2026-07-03T01:00:00.000Z')); // ~35h oud
    const res = await runWatchdogCheck(now);
    expect(res.stalled).toBe(true);
    expect(mockPrisma.retrainingNotification.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.retrainingNotification.create.mock.calls[0][0];
    expect(createArg.data.triggerId).toContain('flywheel-promotion-stalled');
    expect(createArg.data.status).toBe('unread');
    expect(broadcastAll).toHaveBeenCalledWith('flywheel_promotion_stalled', expect.any(Object));
  });

  it('respecteert een aangepaste drempel via FLYWHEEL_WATCHDOG_STALE_HOURS', async () => {
    process.env.FLYWHEEL_WATCHDOG_STALE_HOURS = '2';
    const now = new Date('2026-07-03T12:00:00.000Z');
    await markPromotionRunSuccess(new Date('2026-07-03T09:00:00.000Z')); // 3h oud > 2h
    const res = await runWatchdogCheck(now);
    expect(res.stalled).toBe(true);
  });

  it('dedupliceert binnen het venster: tweede check meldt niet opnieuw', async () => {
    const now = new Date('2026-07-04T12:00:00.000Z');
    await markPromotionRunSuccess(new Date('2026-07-03T01:00:00.000Z'));
    await runWatchdogCheck(now);
    await runWatchdogCheck(now);
    expect(mockPrisma.retrainingNotification.create).toHaveBeenCalledTimes(1);
  });
});
