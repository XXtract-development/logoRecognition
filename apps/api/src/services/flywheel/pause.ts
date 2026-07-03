/**
 * Persistente pauze-service + automatische stilstand (Story 13.6, AD-11).
 *
 * De pauze-stand is PERSISTENT in `system_settings` (`flywheel.paused`): een
 * herstart heft de pauze NIET op (de bron is de database, nooit process-/env-
 * state). Deze story levert ALLEEN de service — het HTTP-endpoint
 * `POST /api/v1/flywheel/pause`/`resume` en de `threshold_changes`-logging zijn
 * eigendom van Story 15.4, die op deze service bouwt.
 *
 * PAUZE-SCOPE (AD-11, precies): de pauze blokkeert nominatie-inserts én batch-
 * verwerking (`flywheel-promotion` en de latere `flywheel-bootstrap`, check bij
 * job-start). Read-only werk draait door: live-detectie, trainingsdata-
 * registratie, outlier-audit (14.3, read-only) en dashboard-reads.
 *
 * AUTOMATISCHE STILSTAND (AC 4): K=2 opeenvolgende gequarantaineerde batches →
 * het systeem pauzeert zichzelf (persistent) + een notificatie via het bestaande
 * RetrainingNotification-patroon (Story 9.2) met de aanleiding. De teller staat
 * óók in `system_settings` zodat een herstart de reeks niet vergeet.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { socketIOManager } from '../socket-io-manager';
import { getSetting, setSetting, SETTING_KEYS } from './system-settings';

const logger = createLogger('flywheel-pause');

/** Reason-code van de auto-pauze-notificatie (RetrainingNotification, AD-11). */
const AUTO_PAUSE_REASON_CODE = 'flywheel-auto-paused';

/**
 * K — aantal opeenvolgende gequarantaineerde batches waarna het systeem zichzelf
 * pauzeert (AC 4). Env-config `FLYWHEEL_AUTO_PAUSE_K`, default 2.
 */
export function getAutoPauseK(): number {
  const v = parseInt(process.env.FLYWHEEL_AUTO_PAUSE_K ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 2;
}

/** Vorm van de `flywheel.paused`-waarde in system_settings (AD-11/AD-13). */
export interface PauseState {
  paused: boolean;
  reason: string | null;
  since: string | null;
  by: string | null;
}

const NOT_PAUSED: PauseState = { paused: false, reason: null, since: null, by: null };

/**
 * Is het vliegwiel gepauzeerd (AD-11)? Leest de persistente stand uit
 * `system_settings` (met de korte read-cache van de settings-store — pauze landt
 * binnen enkele seconden). Een leesfout valt fail-safe terug op "niet gepauzeerd"
 * zodat een DB-hapering het vliegwiel niet stilzet.
 */
export async function isPaused(): Promise<boolean> {
  const state = await getSetting<PauseState>(SETTING_KEYS.PAUSED);
  return state?.paused === true;
}

/** Lees de volledige pauze-stand (voor de overview-response, AC/15.4). */
export async function getPauseState(): Promise<PauseState> {
  const state = await getSetting<PauseState>(SETTING_KEYS.PAUSED);
  return state ?? NOT_PAUSED;
}

/**
 * Gedeelde job-start-pauzecheck (AD-11, pauze-scope) — het CONTRACT voor élke
 * batch-verwerkende flywheel-job. De job roept dit als éérste aan; is het
 * vliegwiel gepauzeerd, dan slaat de job zijn run over (geen batch-werk) i.p.v.
 * te draaien. Gebruikt door `flywheel-promotion` (Story 13.6) en — bij zijn
 * geboorte — door `flywheel-bootstrap` (Story 17.1: die hoeft enkel deze functie
 * bij job-start aan te roepen en de run over te slaan bij `true`).
 *
 * NIET aanroepen vanuit read-only werk (outlier-audit 14.3, dashboard-reads,
 * live-detectie, trainingsdata-registratie) — dat blijft draaien tijdens pauze.
 */
export async function shouldSkipForPause(jobName: string): Promise<boolean> {
  const paused = await isPaused();
  if (paused) {
    logger.info('Flywheel-job overgeslagen wegens pauze (AD-11)', { jobName });
  }
  return paused;
}

/**
 * Pauzeer het vliegwiel persistent (AD-11). Idempotent: nogmaals pauzeren
 * overschrijft alleen reden/tijd/gebruiker. Aan te roepen door 15.4 (handmatig)
 * en door de automatische stilstand (AC 4).
 */
export async function pause(reason: string, by: string | null = null): Promise<PauseState> {
  const state: PauseState = {
    paused: true,
    reason,
    since: new Date().toISOString(),
    by,
  };
  await setSetting(SETTING_KEYS.PAUSED, state, by);
  logger.warn('Vliegwiel gepauzeerd', { reason, by });
  return state;
}

/**
 * Hervat het vliegwiel (AD-11). Hervatting is een EXPLICIETE actie, gelogd met
 * gebruiker + tijdstempel (AC 5). Reset óók de auto-pauze-teller: na een bewuste
 * hervatting begint de quarantaine-reeks weer bij nul.
 */
export async function resume(by: string | null = null): Promise<PauseState> {
  const state: PauseState = {
    paused: false,
    reason: null,
    since: null,
    by,
  };
  await setSetting(SETTING_KEYS.PAUSED, state, by);
  await resetQuarantineStreak();
  logger.info('Vliegwiel hervat', { by, at: new Date().toISOString() });
  return state;
}

// ============================================
// Automatische stilstand (K=2, AC 4)
// ============================================

/**
 * Registreer dat een batch is gequarantaineerd en beslis over automatische
 * stilstand (AC 4). Verhoogt de opeenvolgende-quarantaine-teller; bij het
 * bereiken van K pauzeert het systeem zichzelf (persistent) en stuurt een
 * notificatie met de aanleiding (batch-ids). Retourneert of er gepauzeerd is.
 *
 * Aangeroepen door de poort (`gate.ts`) NADAT een batch `quarantined` is gezet.
 * Een `passed`-batch reset de reeks (zie `resetQuarantineStreak`), zodat alleen
 * ÉCHT opeenvolgende quarantaines meetellen.
 */
export async function registerQuarantine(batchId: string): Promise<boolean> {
  const k = getAutoPauseK();

  const streak = await getQuarantineStreak();
  const nextIds = [...streak.batchIds, batchId].slice(-k);
  const nextCount = streak.count + 1;

  await setSetting(
    SETTING_KEYS.AUTO_PAUSE_STREAK,
    { count: nextCount, batchIds: nextIds },
    null
  );

  logger.info('Quarantaine geregistreerd voor auto-stilstand', {
    batchId,
    streak: nextCount,
    k,
  });

  if (nextCount < k) {
    return false;
  }

  // K bereikt → zelf-pauze (persistent) + notificatie met aanleiding.
  const reason = `automatische stilstand: ${k} opeenvolgende quarantaines`;
  const alreadyPaused = await isPaused();
  if (!alreadyPaused) {
    await pause(reason, 'system');
  }
  await notifyAutoPause(nextIds, k);

  // Reset de teller ná de stilstand zodat een volgende reeks vers begint (de
  // pauze zélf blokkeert intussen nieuwe batch-verwerking, AD-11).
  await resetQuarantineStreak();
  return true;
}

interface QuarantineStreak {
  count: number;
  batchIds: string[];
}

/** Lees de opeenvolgende-quarantaine-teller (persistent, AC 4). */
export async function getQuarantineStreak(): Promise<QuarantineStreak> {
  const s = await getSetting<QuarantineStreak>(SETTING_KEYS.AUTO_PAUSE_STREAK, {
    fresh: true,
  });
  return {
    count: typeof s?.count === 'number' ? s.count : 0,
    batchIds: Array.isArray(s?.batchIds) ? (s!.batchIds as string[]) : [],
  };
}

/**
 * Reset de opeenvolgende-quarantaine-teller (AC 4). Aangeroepen wanneer een batch
 * PASSED (de reeks is doorbroken) en na een bewuste hervatting.
 */
export async function resetQuarantineStreak(): Promise<void> {
  await setSetting(SETTING_KEYS.AUTO_PAUSE_STREAK, { count: 0, batchIds: [] }, null);
}

/**
 * Notificeer de automatische stilstand via het bestaande RetrainingNotification-
 * patroon (Story 9.2: persistente rij + Socket.IO), reason-code
 * `flywheel-auto-paused`, mét de aanleiding (batch-ids). Idempotent op de
 * trigger-id (de laatste batch die de stilstand veroorzaakte).
 */
export async function notifyAutoPause(batchIds: string[], k: number): Promise<void> {
  const lastBatch = batchIds[batchIds.length - 1] ?? 'onbekend';
  const triggerId = `${AUTO_PAUSE_REASON_CODE}:${lastBatch}`;
  const reasonText =
    `Automatische stilstand: ${k} opeenvolgende gequarantaineerde batches ` +
    `(${batchIds.join(', ')}). Het vliegwiel is gepauzeerd tot handmatige hervatting.`;

  try {
    await prisma.retrainingNotification.create({
      data: { triggerId, reasons: [reasonText], status: 'unread' },
    });
  } catch (error: unknown) {
    const isUniqueViolation =
      error instanceof Error && error.message.includes('Unique constraint');
    if (!isUniqueViolation) {
      logger.warn('Kon auto-pauze-notificatie niet schrijven (non-fataal)', {
        lastBatch,
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  socketIOManager.broadcastAll('flywheel_auto_paused', {
    triggerId,
    batchIds,
    k,
    timestamp: new Date().toISOString(),
  });
}
