/**
 * Story 13.4 — Flywheel queue/worker/scheduler-tests (AC2, AD-6).
 *
 * Dekt: queue `flywheel` in de fabriek · worker-concurrency 1 (AD-6) · job-routing
 * (flywheel-promotion → runPromotionLoop; flywheel-watchdog → runWatchdogCheck) ·
 * scheduler via upsertJobScheduler MÉT tz Europe/Amsterdam en cron-default 01:00,
 * en NIET via het gedeprecieerde repeat: { pattern }-patroon.
 *
 * BullMQ + ioredis worden globaal gemockt (setup.ts). De promotielus + watchdog
 * worden op module-grens gemockt zodat we de bedrading testen, niet de logica.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';

const runPromotionLoop = vi.fn();
const runWatchdogCheck = vi.fn();
vi.mock('../../services/flywheel/promotion-batch', () => ({
  runPromotionLoop: (...a: unknown[]) => runPromotionLoop(...a),
}));
vi.mock('../../services/flywheel/watchdog', () => ({
  runWatchdogCheck: (...a: unknown[]) => runWatchdogCheck(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FLYWHEEL_PROMOTION_CRON;
  runPromotionLoop.mockResolvedValue({ resumedBatchIds: [], newBatchId: null, bundledCandidates: 0 });
  runWatchdogCheck.mockResolvedValue({ stalled: false });
});

describe('createPipelineQueues (AC2 — queue flywheel)', () => {
  it('registreert de flywheel-queue naast training + artwork-detection', async () => {
    const { createPipelineQueues } = await import('../../services/pipeline/queue');
    const queues = createPipelineQueues();
    expect(queues.flywheel).toBeDefined();
    // Zelfde 9.1-defaults (retry/backoff).
    expect(queues.flywheel.defaultJobOptions.attempts).toBeGreaterThanOrEqual(3);
  });
});

describe('registerFlywheelWorker (AC2 — concurrency 1, AD-6)', () => {
  it('maakt de worker op de flywheel-queue met concurrency 1', async () => {
    const { registerFlywheelWorker, closePipelineWorkers } = await import(
      '../../services/pipeline/workers'
    );
    (Worker as unknown as ReturnType<typeof vi.fn>).mockClear();
    registerFlywheelWorker();
    const call = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('flywheel');
    expect(call[2]).toMatchObject({ concurrency: 1 });
    await closePipelineWorkers();
  });
});

describe('processFlywheelJob (AC2 — job-routing)', () => {
  it('routeert flywheel-promotion naar runPromotionLoop', async () => {
    const { processFlywheelJob } = await import('../../services/pipeline/workers');
    await processFlywheelJob({ name: 'flywheel-promotion' });
    expect(runPromotionLoop).toHaveBeenCalledTimes(1);
    expect(runWatchdogCheck).not.toHaveBeenCalled();
  });

  it('routeert flywheel-watchdog naar runWatchdogCheck', async () => {
    const { processFlywheelJob } = await import('../../services/pipeline/workers');
    await processFlywheelJob({ name: 'flywheel-watchdog' });
    expect(runWatchdogCheck).toHaveBeenCalledTimes(1);
    expect(runPromotionLoop).not.toHaveBeenCalled();
  });
});

describe('registerFlywheelSchedulers (AD-6 — upsertJobScheduler, geen repeat)', () => {
  it('gebruikt upsertJobScheduler met tz Europe/Amsterdam en cron-default 01:00', async () => {
    const { registerFlywheelSchedulers } = await import('../../services/flywheel/scheduler');
    await registerFlywheelSchedulers();

    const queueInstance = (Queue as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
    const upsert = queueInstance.upsertJobScheduler as ReturnType<typeof vi.fn>;

    // Drie schedulers: promotie + watchdog + wekelijkse outlier-audit (Story 14.3).
    expect(upsert).toHaveBeenCalledTimes(3);
    const promotionCall = upsert.mock.calls.find(
      (c) => (c[2] as { name?: string })?.name === 'flywheel-promotion'
    );
    expect(promotionCall).toBeDefined();
    expect(promotionCall![1]).toMatchObject({ pattern: '0 1 * * *', tz: 'Europe/Amsterdam' });

    // Story 14.3: de outlier-audit-scheduler is wekelijks (zondag 05:00) met tz.
    const outlierCall = upsert.mock.calls.find(
      (c) => (c[2] as { name?: string })?.name === 'flywheel-outlier-audit'
    );
    expect(outlierCall).toBeDefined();
    expect(outlierCall![1]).toMatchObject({ pattern: '0 5 * * 0', tz: 'Europe/Amsterdam' });

    // Nooit het gedeprecieerde add(..., { repeat: { pattern } })-pad.
    const add = queueInstance.add as ReturnType<typeof vi.fn>;
    for (const call of add.mock.calls) {
      expect(call[2]?.repeat).toBeUndefined();
    }
  });

  it('routeert flywheel-outlier-audit naar de audit-flow (Story 14.3)', async () => {
    // De worker-route roept runOutlierAudit aan; die leest de actieve klassen via
    // prisma. We bewijzen dat de route de audit-flow raakt (referenceLogo.findMany
    // met active-filter) i.p.v. een no-op default-tak.
    const { processFlywheelJob } = await import('../../services/pipeline/workers');
    const prisma = (await import('../../core/db')).default as unknown as {
      referenceLogo: { findMany: ReturnType<typeof vi.fn> };
    };
    prisma.referenceLogo.findMany.mockResolvedValueOnce([]);

    await processFlywheelJob({ name: 'flywheel-outlier-audit' } as never);

    expect(prisma.referenceLogo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } })
    );
  });

  it('respecteert FLYWHEEL_PROMOTION_CRON als die gezet is', async () => {
    process.env.FLYWHEEL_PROMOTION_CRON = '30 2 * * *';
    const { registerFlywheelSchedulers } = await import('../../services/flywheel/scheduler');
    await registerFlywheelSchedulers();
    const queueInstance = (Queue as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
    const upsert = queueInstance.upsertJobScheduler as ReturnType<typeof vi.fn>;
    const promotionCall = upsert.mock.calls.find(
      (c) => (c[2] as { name?: string })?.name === 'flywheel-promotion'
    );
    expect(promotionCall![1]).toMatchObject({ pattern: '30 2 * * *' });
  });
});
