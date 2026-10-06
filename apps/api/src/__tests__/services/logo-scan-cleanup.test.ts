// Story 1.3 AC4 — raw detections are kept 12 months; a scheduled task removes older rows (AD-4).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fake: { db: null as any },
  schedulers: [] as Array<{ id: string; repeat: any; template: any }>,
  processors: [] as Array<(job: any) => Promise<unknown>>,
  queueNames: [] as string[],
}));

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string) { h.queueNames.push(name); }
    async upsertJobScheduler(id: string, repeat: any, template: any) { h.schedulers.push({ id, repeat, template }); }
    async close() {}
  },
  Worker: class {
    constructor(_name: string, processor: (job: any) => Promise<unknown>) { h.processors.push(processor); }
    on() { return this; } async close() {}
  },
}));
vi.mock('../../services/pipeline/queue', () => ({ getRedisConnection: () => ({}) }));
vi.mock('../../core/db', async () => {
  const { makeFakeLogoDb } = await import('../helpers/fake-logo-db');
  h.fake.db = makeFakeLogoDb();
  return { default: { logoScan: h.fake.db.logoScan, logoCurrentImage: h.fake.db.logoCurrentImage } };
});

import { purgeExpiredLogoScans, registerLogoScanCleanup } from '../../services/pipeline/logo-scan-cleanup';

const NOW = new Date('2026-10-06T12:00:00Z');
const monthsAgo = (m: number) => { const d = new Date(NOW); d.setUTCMonth(d.getUTCMonth() - m); return d; };
const seed = (scanId: string, createdAt: Date) => h.fake.db.scans.push({ scanId, createdAt, requestedAt: createdAt, status: 'done' });

beforeEach(() => { h.fake.db.scans.length = 0; h.fake.db.state.missingTable = false; h.schedulers.length = 0; h.processors.length = 0; h.queueNames.length = 0; });

describe('purgeExpiredLogoScans', () => {
  it('deletes only rows older than 12 months and reports the count', async () => {
    seed('old', monthsAgo(13)); seed('edge-old', new Date(monthsAgo(12).getTime() - 1000));
    seed('edge-new', new Date(monthsAgo(12).getTime() + 1000)); seed('young', monthsAgo(1)); seed('today', NOW);
    expect(await purgeExpiredLogoScans(NOW)).toBe(2);
    expect(h.fake.db.scans.map((r: any) => r.scanId).sort()).toEqual(['edge-new', 'today', 'young']);
  });
  it('stale current-image pointers go with the scans', async () => {
    h.fake.db.current.push({ productId: 'old', imageHash: 'x', requestedAt: monthsAgo(14) }, { productId: 'new', imageHash: 'y', requestedAt: monthsAgo(1) });
    await purgeExpiredLogoScans(NOW);
    expect(h.fake.db.current.map((r: any) => r.productId)).toEqual(['new']);
  });
  it('a database failure other than a missing table fails the job instead of reading as 0', async () => {
    const spy = vi.spyOn(h.fake.db.logoScan, 'deleteMany').mockRejectedValueOnce(new Error('connection lost'));
    await expect(purgeExpiredLogoScans(NOW)).rejects.toThrow('connection lost');
    spy.mockRestore();
  });
  it('an empty table is fine; a missing table is a quiet zero, not a crash', async () => {
    expect(await purgeExpiredLogoScans(NOW)).toBe(0);
    h.fake.db.state.missingTable = true;
    expect(await purgeExpiredLogoScans(NOW)).toBe(0);
  });
});

describe('registerLogoScanCleanup', () => {
  it('registers one daily scheduler on its own queue, idempotent by scheduler id, and a worker that purges', async () => {
    seed('old', monthsAgo(14)); seed('young', monthsAgo(2));
    await registerLogoScanCleanup();
    expect(h.schedulers).toHaveLength(1);
    expect(h.schedulers[0].repeat).toEqual({ pattern: '40 3 * * *', tz: 'Europe/Amsterdam' });
    expect(h.schedulers[0].id).toContain('logo-scan-cleanup');
    expect(h.queueNames).not.toContain('logo-scan'); // never mixed into the scan queue
    expect(h.processors).toHaveLength(1);
    await h.processors[0]({ data: {} });
    expect(h.fake.db.scans.map((r: any) => r.scanId)).toEqual(['young']);
  });
});
