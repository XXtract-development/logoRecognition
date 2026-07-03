/**
 * Watchdog voor de nachtelijke promotielus (Story 13.4, AC 9 / AD-11 / ARCH-4).
 *
 * Twee verantwoordelijkheden:
 *   1. "Laatste succesvolle run" persistent vastleggen zodra de promotielus
 *      succesvol afrondt (opvraagbaar via de overview-API).
 *   2. Een lichte repeatable check die een notificatie stuurt zodra de laatste
 *      succesvolle run ouder is dan de drempel (default 26 uur) — een stil
 *      gestorven promotielus wordt zo zichtbaar buiten het dashboard om.
 *
 * PERSISTENTIE-KEUZE (gedocumenteerd — Project Structure variance):
 *   `system_settings` bestaat pas ná Story 13.6. Deze story lost de persistentie
 *   daarom migratie-loos op via **Redis** (dezelfde ioredis-connectie als de
 *   BullMQ-queues, `getRedisConnection`). De sleutel `flywheel:last-successful-
 *   promotion-run` bewaart een ISO-timestamp. Redis-state overleeft een
 *   API-container-herstart (net als de BullMQ-jobstate); alleen een volledige
 *   Redis-flush zet 'm terug — dan meldt de watchdog "nog nooit gedraaid", wat
 *   correct is. 13.6 mag dit desgewenst naar `system_settings` migreren.
 *
 * De notificatie volgt exact het bestaande `RetrainingNotification`-patroon
 * (Story 9.2, `trigger.ts:notifyRetrainingRecommended`): Redis-dedup + persistente
 * rij + Socket.IO, met een eigen reason-code `flywheel-promotion-stalled`.
 */

import prisma from '../../core/db';
import { getRedisConnection } from '../pipeline/queue';
import { socketIOManager } from '../socket-io-manager';
import { createLogger } from '../../core/logger';
import { getWatchdogStaleHours } from './config';

const logger = createLogger('flywheel-watchdog');

/** Redis-sleutel voor de laatste succesvolle promotielus-run (ISO-timestamp). */
const LAST_RUN_KEY = 'flywheel:last-successful-promotion-run';

/** Reason-code van de stilstand-notificatie (uniek per etmaal-dedup). */
const STALLED_REASON = 'flywheel-promotion-stalled';

/** Dedup-venster van de stilstand-notificatie (uren) — hoogstens één per venster. */
const STALLED_DEDUP_HOURS = 24;

/**
 * Leg de "laatste succesvolle run" vast op nu (AC 9). Best-effort: een
 * Redis-fout mag de zojuist geslaagde promotielus-run niet doen falen.
 */
export async function markPromotionRunSuccess(at: Date = new Date()): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(LAST_RUN_KEY, at.toISOString());
    logger.info('Laatste succesvolle promotielus-run vastgelegd', { at: at.toISOString() });
  } catch (err) {
    logger.warn('Kon laatste succesvolle promotielus-run niet vastleggen (non-fataal)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Lees de laatste succesvolle promotielus-run (voor de overview-API). `null` =
 * nog nooit succesvol gedraaid (of Redis-state gewist).
 */
export async function getLastSuccessfulPromotionRun(): Promise<string | null> {
  try {
    const redis = getRedisConnection();
    return await redis.get(LAST_RUN_KEY);
  } catch (err) {
    logger.warn('Kon laatste succesvolle promotielus-run niet lezen', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

/**
 * Watchdog-check (lichte repeatable job): notificeer als de laatste succesvolle
 * run ouder is dan de drempel (default 26 uur). Nooit-gedraaid (`null`) telt NIET
 * als stilstand — de watchdog gaat pas na de eerste succesvolle run melden,
 * anders spamt hij een verse omgeving direct. Retourneert of er genotificeerd is.
 */
export async function runWatchdogCheck(now: Date = new Date()): Promise<{ stalled: boolean }> {
  const staleHours = getWatchdogStaleHours();
  const last = await getLastSuccessfulPromotionRun();

  if (!last) {
    logger.info('Watchdog: nog geen succesvolle run — nog niets te melden');
    return { stalled: false };
  }

  const ageMs = now.getTime() - new Date(last).getTime();
  const ageHours = ageMs / (60 * 60 * 1000);

  if (ageHours <= staleHours) {
    return { stalled: false };
  }

  await notifyPromotionStalled(ageHours, last);
  return { stalled: true };
}

/**
 * Stuur de stilstand-notificatie via het bestaande RetrainingNotification-patroon
 * (Redis-dedup + persistente rij + Socket.IO). Idempotent binnen het
 * dedup-venster — hoogstens één melding per dag.
 */
export async function notifyPromotionStalled(ageHours: number, lastRunIso: string): Promise<void> {
  // Dedup-sleutel per etmaal-venster zodat de uurcheck niet 24× meldt.
  const windowBucket = Math.floor(Date.now() / (STALLED_DEDUP_HOURS * 3600 * 1000));
  const triggerId = `${STALLED_REASON}:${windowBucket}`;
  const dedupKey = `flywheel:watchdog:dedup:${triggerId}`;

  const redis = getRedisConnection();
  const existing = await redis.get(dedupKey);
  if (existing) {
    logger.info('Watchdog-stilstand-notificatie gededupliceerd — overslaan', { triggerId });
    return;
  }
  await redis.setex(dedupKey, STALLED_DEDUP_HOURS * 3600, '1');

  const reasons = [
    `De nachtelijke promotielus draaide voor het laatst succesvol ${ageHours.toFixed(1)} uur geleden (${lastRunIso}) — mogelijk gestopt.`,
  ];

  try {
    await prisma.retrainingNotification.create({
      data: { triggerId, reasons, status: 'unread' },
    });
  } catch (error: unknown) {
    const isUniqueViolation =
      error instanceof Error && error.message.includes('Unique constraint');
    if (!isUniqueViolation) {
      // Rol de dedup-sleutel terug zodat een volgende check opnieuw kan proberen.
      await redis.del(dedupKey);
      throw error;
    }
    logger.info('Watchdog-notificatie bestond al (gelijktijdige insert)', { triggerId });
    return;
  }

  socketIOManager.broadcastAll('flywheel_promotion_stalled', {
    triggerId,
    reasons,
    lastSuccessfulRun: lastRunIso,
    timestamp: new Date().toISOString(),
  });

  logger.warn('Watchdog: promotielus-stilstand gemeld', { triggerId, ageHours });
}
