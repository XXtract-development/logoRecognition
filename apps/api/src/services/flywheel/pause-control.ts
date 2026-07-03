/**
 * Pauzebediening (Story 15.4, FR-19, AD-11/AD-13) — de HTTP-eigen laag bovenop de
 * 13.6-pauze-service (`pause.ts`).
 *
 * 13.6 leverde de PERSISTENTE pauze-service (`pause`/`resume`/`isPaused` +
 * `system_settings`-persistentie en de pauze-scope in hooks/jobs). 15.4 levert de
 * BEDIENING: het endpoint `POST /api/v1/flywheel/pause` roept deze module aan,
 * die elke overgang (pauze én hervat) via het `threshold_changes`-patroon logt
 * met gebruiker + tijdstempel (AD-13, `thresholdKey='flywheel.paused'`,
 * oldValue/newValue `'true'`/`'false'`), en die bij hervatten de openstaande
 * quarantaines als WAARSCHUWING teruggeeft zonder de hervatting te blokkeren
 * (FR-19).
 *
 * De pauze-semantiek zelf (welke hooks/jobs stoppen) is 13.6-gedrag en wordt hier
 * NIET herbouwd — deze module schakelt en logt alleen.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { pause as pauseFlywheel, resume as resumeFlywheel, getPauseState } from './pause';
import { getQuarantineCount } from './quarantine-count';

const logger = createLogger('flywheel-pause-control');

/** De `thresholdKey` waaronder pauze/hervat-overgangen gelogd worden (AD-13). */
export const PAUSE_THRESHOLD_KEY = 'flywheel.paused';

export interface PauseControlResult {
  paused: boolean;
  reason: string | null;
  since: string | null;
  by: string | null;
  /**
   * Bij hervatten: het aantal openstaande quarantainebatches als waarschuwing
   * (FR-19). Blokkeert niet — puur informatief voor de hervat-modal. `null` bij
   * een pauze-actie (niet relevant).
   */
  openQuarantines: number | null;
}

/**
 * Log een pauze/hervat-overgang in `threshold_changes` (AD-13). Non-fataal: een
 * mislukte auditschrijf mag de pauze/hervat-actie zelf niet terugdraaien (de
 * bron van waarheid is `system_settings`, niet de audittrail).
 */
async function logPauseTransition(
  wasPaused: boolean,
  nowPaused: boolean,
  by: string,
  reason: string | null
): Promise<void> {
  try {
    await prisma.thresholdChange.create({
      data: {
        thresholdKey: PAUSE_THRESHOLD_KEY,
        oldValue: String(wasPaused),
        newValue: String(nowPaused),
        reason,
        userId: by,
      },
    });
  } catch (err) {
    logger.warn('Kon pauze-overgang niet loggen (non-fataal)', {
      by,
      wasPaused,
      nowPaused,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Pauzeer het vliegwiel via de 13.6-service en log de overgang (AC 3). Idempotent:
 * pauzeren terwijl al gepauzeerd overschrijft reden/tijd/gebruiker (13.6-gedrag)
 * en logt de (handmatige) overgang opnieuw — herleidbaar wie wanneer pauzeerde.
 */
export async function pauseFlywheelControlled(
  by: string,
  reason: string | null = null
): Promise<PauseControlResult> {
  const before = await getPauseState();
  const effectiveReason = reason?.trim() || 'handmatige pauze via dashboard';
  const state = await pauseFlywheel(effectiveReason, by);
  await logPauseTransition(before.paused, true, by, effectiveReason);
  logger.info('Vliegwiel handmatig gepauzeerd via endpoint', { by });
  return {
    paused: state.paused,
    reason: state.reason,
    since: state.since,
    by: state.by,
    openQuarantines: null,
  };
}

/**
 * Hervat het vliegwiel via de 13.6-service en log de overgang met gebruiker +
 * tijdstempel (AC 4). Geeft het aantal openstaande quarantaines terug als
 * WAARSCHUWING (FR-19) — de hervatting blokkeert NOOIT op openstaande
 * quarantaines: de batches blijven veilig in quarantaine, niets ervan is actief.
 */
export async function resumeFlywheelControlled(by: string): Promise<PauseControlResult> {
  const before = await getPauseState();
  const state = await resumeFlywheel(by);
  await logPauseTransition(before.paused, false, by, null);
  const openQuarantines = await getQuarantineCount();
  logger.info('Vliegwiel hervat via endpoint', { by, openQuarantines });
  return {
    paused: state.paused,
    reason: state.reason,
    since: state.since,
    by: state.by,
    openQuarantines,
  };
}
