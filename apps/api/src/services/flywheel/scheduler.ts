/**
 * BullMQ Job Schedulers voor de flywheel-queue (Story 13.4, AD-6).
 *
 * Nieuwe repeatable jobs gebruiken de moderne Job Schedulers-API
 * (`queue.upsertJobScheduler`) — NIET het `repeat: { pattern }`-patroon van
 * `trigger.ts:registerRetrainingCronJob`, dat op de geïnstalleerde BullMQ 5.63
 * gedeprecieerd is (AD-6). Bestaande jobs blijven ongemoeid.
 *
 * Drie schedulers op de queue `flywheel` (worker-concurrency 1, dus serieel):
 *   1. `flywheel-promotion`     — nachtelijk, cadans `FLYWHEEL_PROMOTION_CRON`
 *      (default 01:00 Europe/Amsterdam, bewust vóór het harvest-venster ~03:23).
 *   2. `flywheel-watchdog`      — per uur; meldt stilstand als de laatste
 *      succesvolle run >26 uur oud is.
 *   3. `flywheel-outlier-audit` — wekelijks, cadans `FLYWHEEL_OUTLIER_AUDIT_CRON`
 *      (default zondag 05:00 Europe/Amsterdam, buiten promotielus + harvest-
 *      venster). Bibliotheek-brede outlier-signalering (Story 14.3, FR-8/AD-9).
 *
 * `upsertJobScheduler` is idempotent op de scheduler-id: bij herstart wordt de
 * bestaande scheduler bijgewerkt, niet gedupliceerd.
 */

import { Queue } from 'bullmq';
import { getRedisConnection } from '../pipeline/queue';
import { createLogger } from '../../core/logger';
import { getPromotionCron, getOutlierAuditCron, FLYWHEEL_PROMOTION_TZ } from './config';

const logger = createLogger('flywheel-scheduler');

const FLYWHEEL_QUEUE = 'flywheel';
const PROMOTION_JOB = 'flywheel-promotion';
const WATCHDOG_JOB = 'flywheel-watchdog';
const OUTLIER_AUDIT_JOB = 'flywheel-outlier-audit';

/** Cadans van de watchdog-check (per uur). */
const WATCHDOG_CRON = process.env.FLYWHEEL_WATCHDOG_CRON || '0 * * * *';

/**
 * Registreer de flywheel Job Schedulers (AD-6). Idempotent: herhaalde aanroep
 * werkt de bestaande schedulers bij zonder duplicaten. De worker die deze jobs
 * verwerkt is `registerFlywheelWorker` (workers.ts).
 */
export async function registerFlywheelSchedulers(): Promise<void> {
  const connection = getRedisConnection();
  const queue = new Queue(FLYWHEEL_QUEUE, { connection });

  try {
    const promotionCron = getPromotionCron();
    await queue.upsertJobScheduler(
      'flywheel-promotion-scheduler',
      { pattern: promotionCron, tz: FLYWHEEL_PROMOTION_TZ },
      { name: PROMOTION_JOB, data: {} },
    );

    await queue.upsertJobScheduler(
      'flywheel-watchdog-scheduler',
      { pattern: WATCHDOG_CRON, tz: FLYWHEEL_PROMOTION_TZ },
      { name: WATCHDOG_JOB, data: {} },
    );

    // Story 14.3: wekelijkse bibliotheek-outlier-audit (AD-6, Job Scheduler).
    const outlierAuditCron = getOutlierAuditCron();
    await queue.upsertJobScheduler(
      'flywheel-outlier-audit-scheduler',
      { pattern: outlierAuditCron, tz: FLYWHEEL_PROMOTION_TZ },
      { name: OUTLIER_AUDIT_JOB, data: {} },
    );

    logger.info('Flywheel Job Schedulers geregistreerd', {
      promotionCron,
      watchdogCron: WATCHDOG_CRON,
      outlierAuditCron,
      tz: FLYWHEEL_PROMOTION_TZ,
    });
  } finally {
    await queue.close();
  }
}
