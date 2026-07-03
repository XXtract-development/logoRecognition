/**
 * Story 15.4 — Stilstand-paneel (overview/standstill.ts) + stilstand-record tests.
 *
 * Dekt (AC 5):
 *  - automatische stilstand (K bereikt) persisteert de betrokken batch-ids in een
 *    stilstand-record (los van de gereset teller) zodat de rode banner batch-links
 *    heeft;
 *  - getStandstillPanel: `auto` bij system-pauze + record (rode banner, batch-ids),
 *    `manual` bij handmatige pauze (amber banner), `running` zonder pauze;
 *  - een bewuste hervatting wist de stilstand-record (banner verdwijnt).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import prisma from '../../core/db';
import {
  registerQuarantine,
  resume,
  getStandstillRecord,
} from '../../services/flywheel/pause';
import { getStandstillPanel } from '../../services/flywheel/overview/standstill';
import { clearSettingsCache, SETTING_KEYS } from '../../services/flywheel/system-settings';

const mockPrisma = prisma as unknown as {
  systemSetting: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  retrainingNotification: { create: ReturnType<typeof vi.fn> };
};

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

describe('automatische stilstand persisteert de betrokken batches (AC 5)', () => {
  it('K=2: na twee opeenvolgende quarantaines staat er een stilstand-record met beide batch-ids', async () => {
    await registerQuarantine('batch-a');
    await registerQuarantine('batch-b');
    const record = await getStandstillRecord();
    expect(record).not.toBeNull();
    expect(record!.batchIds).toEqual(['batch-a', 'batch-b']);
    expect(record!.k).toBe(2);
  });
});

describe('getStandstillPanel (AC 5)', () => {
  it('mode=running zonder pauze', async () => {
    const panel = await getStandstillPanel();
    expect(panel.mode).toBe('running');
    expect(panel.paused).toBe(false);
  });

  it('mode=auto bij automatische stilstand (system-pauze + record) met batch-links', async () => {
    await registerQuarantine('batch-a');
    await registerQuarantine('batch-b');
    const panel = await getStandstillPanel();
    expect(panel.mode).toBe('auto');
    expect(panel.paused).toBe(true);
    expect(panel.by).toBe('system');
    expect(panel.batchIds).toEqual(['batch-a', 'batch-b']);
  });

  it('mode=manual bij handmatige pauze (geen record) — amber, geen batch-links', async () => {
    store[SETTING_KEYS.PAUSED] = { paused: true, reason: 'handmatig', since: 's', by: 'sanne' };
    const panel = await getStandstillPanel();
    expect(panel.mode).toBe('manual');
    expect(panel.batchIds).toEqual([]);
  });
});

describe('bewuste hervatting wist de stilstand-record (AC 5)', () => {
  it('resume() verwijdert de record zodat de rode banner verdwijnt', async () => {
    await registerQuarantine('batch-a');
    await registerQuarantine('batch-b');
    expect(await getStandstillRecord()).not.toBeNull();

    await resume('sanne');
    expect(await getStandstillRecord()).toBeNull();
    const panel = await getStandstillPanel();
    expect(panel.mode).toBe('running');
  });
});
