/**
 * Crosscheck → nominatie-hook (Story 13.2, taak 3).
 *
 * Eén instrumentatiepunt op de `autoAccepted`-uitkomst van `crosscheckDetections`
 * ("dubbele bevestiging" = gedeclareerd + confidence ≥ crosscheck-drempel). De
 * nominatie-service legt daar bovenop nog haar eigen (strengere) promotiedrempel.
 *
 * Twee aanroeppaden (NFR-3/NFR-7):
 *   - Worker-pad (detection-flow.ts, BullMQ-detection-worker): nominatie mag
 *     SYNCHROON in de job → `nominateAutoAccepted`.
 *   - Request-pad (artwork-pipeline.ts crosscheck-route): NOOIT inline; alleen
 *     ENQUEUE-en op de bestaande artwork-detection-queue → `enqueueNominations`.
 *     De detection-worker verwerkt die job later via `runNominationJob`.
 *
 * De hook staat NAAST de bestaande trainingsdata-registratie (Story 8.6), nooit
 * erin — die blijft byte-voor-byte ongewijzigd.
 */

import { Queue } from 'bullmq';
import { getRedisConnection, PIPELINE_JOB_OPTIONS } from '../pipeline/queue';
import { createLogger } from '../../core/logger';
import { nominateCandidate, NominationDetection, NominationOutcome } from './nomination';
import { isNominationEnabled, NominationOrigin } from './config';

const logger = createLogger('flywheel-crosscheck-hook');

// Naam van de bestaande artwork-detection-queue (spiegelt
// detection-flow.ts::DETECTION_QUEUE). Bewust als lokale const i.p.v. import,
// zodat er geen circulaire module-afhankelijkheid ontstaat tussen detection-flow
// (dat deze hook synchroon aanroept) en deze hook (die alleen op het request-pad
// de queue nodig heeft).
const DETECTION_QUEUE = 'artwork-detection';

/** BullMQ-jobnaam voor een geënqueue-de nominatie op de detection-queue. */
export const NOMINATION_JOB_NAME = 'nominate-crosscheck';

export interface NominationJobData {
  gtin: string;
  origin: NominationOrigin;
  declared: string[];
  detections: NominationDetection[];
}

/**
 * SYNCHRONE nominatie van auto-accepted detecties (worker-pad). Per detectie
 * onafhankelijk: een fout op één crop mag de andere niet blokkeren, en mag de
 * bestaande detection-job niet laten falen (nominatie is aanvullend werk).
 */
export async function nominateAutoAccepted(
  gtin: string,
  autoAccepted: NominationDetection[],
  declared: string[],
  origin: NominationOrigin = 'crosscheck'
): Promise<NominationOutcome[]> {
  // Vlag uit → gedrag byte-gelijk aan vandaag: geen enkele nominatie-actie,
  // geen /ml/phash-aanroep. (De teller-registratie voor 'vlag-uit' zit in de
  // nominatie-service zelf; hier voorkomen we onnodig werk op het hete pad.)
  if (!isNominationEnabled()) return [];

  const outcomes: NominationOutcome[] = [];
  for (const detection of autoAccepted) {
    try {
      outcomes.push(
        await nominateCandidate({ detection, origin, gtin, declared })
      );
    } catch (err) {
      // Nominatie is aanvullend — een onverwachte fout mag de detection-job niet
      // laten falen. Log en ga door met de volgende crop.
      logger.error('Nominatie faalde onverwacht (non-fataal voor detectie-job)', {
        gtin,
        t3777Code: detection.t3777Code,
        origin,
        error: err instanceof Error ? err.message : 'unknown',
      });
      outcomes.push({ status: 'refused', reason: 'onverwachte-fout' });
    }
  }
  return outcomes;
}

/**
 * ENQUEUE nominaties (request-pad). Voert NOOIT /ml/phash of een INSERT inline
 * uit — het request-pad mag geen vliegwiel-latency dragen (NFR-3/NFR-7). De
 * detection-worker pikt de job op en draait `runNominationJob`.
 *
 * Best-effort: een queueing-fout mag de crosscheck-response niet breken.
 */
export async function enqueueNominations(
  gtin: string,
  autoAccepted: NominationDetection[],
  declared: string[],
  origin: NominationOrigin = 'crosscheck'
): Promise<void> {
  if (!isNominationEnabled()) return;
  if (autoAccepted.length === 0) return;

  const connection = getRedisConnection();
  const queue = new Queue(DETECTION_QUEUE, { connection });
  try {
    await queue.add(
      NOMINATION_JOB_NAME,
      { gtin, origin, declared, detections: autoAccepted } as NominationJobData,
      { ...PIPELINE_JOB_OPTIONS },
    );
  } catch (err) {
    logger.error('Kon nominatie-job niet enqueue-en (non-fataal)', {
      gtin,
      origin,
      error: err instanceof Error ? err.message : 'unknown',
    });
  } finally {
    await queue.close();
  }
}

/**
 * Worker-handler voor een geënqueue-de nominatie-job. Draait in de
 * detection-worker (worker-pad), dus hier mag /ml/phash synchroon.
 */
export async function runNominationJob(data: NominationJobData): Promise<void> {
  await nominateAutoAccepted(data.gtin, data.detections, data.declared, data.origin);
}
