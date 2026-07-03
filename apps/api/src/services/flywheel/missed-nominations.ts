/**
 * Gemiste-nominatie-teller (Story 13.2, AC 7, NFR-5).
 *
 * Wanneer een nominatie geweigerd of overgeslagen wordt om een reden die
 * "brandstofverlies" betekent (phash-onbereikbaar, pauze, vlag-uit), tellen we
 * dat mee zodat het dashboard (Story 15.2) het zichtbaar kan maken — geen stille
 * verliezen.
 *
 * Spine-variance (Dev Notes / ARCH-5): het gemiste-nominatie-event heeft GÉÉN
 * eigen tabel in de Structural Seed. Daarom persistente Redis-tellers
 * (`INCR` per reden, zonder TTL) via de bestaande BullMQ-Redis-connectie, plus
 * een gestructureerde logregel als bron van waarheid. Bewust restrisico: bij een
 * Redis-flush verdwijnen de tellers; de teller is indicatief, de logregels zijn
 * de canonieke administratie. De teller-ophaal faalt nooit hard (best-effort
 * observability mag de nominatieflow niet breken).
 */

import { getRedisConnection } from '../pipeline/queue';
import { createLogger } from '../../core/logger';
import type { MissedNominationReason } from './config';

const logger = createLogger('flywheel-missed-nominations');

/** Redis-sleutel per reden. Herstartbestendig (geen TTL). */
const REDIS_KEY_PREFIX = 'flywheel:missed-nominations:';

/** Alle geldige redenen — vormt óók de vaste keyset van de teller-response. */
export const MISSED_NOMINATION_REASONS: readonly MissedNominationReason[] = [
  'phash-onbereikbaar',
  'pauze',
  'vlag-uit',
] as const;

/**
 * Registreer één gemiste nominatie: verhoog de Redis-teller voor de reden en
 * log gestructureerd. De log is de bron van waarheid; de Redis-INCR is
 * best-effort (een Redis-fout mag de aanroeper niet breken).
 */
export async function recordMissedNomination(
  reason: MissedNominationReason,
  context: {
    origin?: string;
    gtin?: string;
    t3777Code?: string;
    detail?: string;
  } = {}
): Promise<void> {
  logger.warn('Gemiste nominatie', { reason, ...context });
  try {
    await getRedisConnection().incr(`${REDIS_KEY_PREFIX}${reason}`);
  } catch (err) {
    logger.error('Kon gemiste-nominatie-teller niet ophogen (best-effort)', {
      reason,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Lees de tellers per reden. Ontbrekende sleutels tellen als 0, zodat de
 * response altijd de volledige keyset bevat (dashboard-vriendelijk). Faalt de
 * Redis-lees, dan geven we nullen terug i.p.v. te breken.
 */
export async function getMissedNominationCounts(): Promise<
  Record<MissedNominationReason, number>
> {
  const zero = Object.fromEntries(
    MISSED_NOMINATION_REASONS.map((r) => [r, 0])
  ) as Record<MissedNominationReason, number>;

  try {
    const redis = getRedisConnection();
    const values = await Promise.all(
      MISSED_NOMINATION_REASONS.map((r) => redis.get(`${REDIS_KEY_PREFIX}${r}`))
    );
    const result = { ...zero };
    MISSED_NOMINATION_REASONS.forEach((reason, i) => {
      const n = parseInt(values[i] ?? '0', 10);
      result[reason] = Number.isFinite(n) ? n : 0;
    });
    return result;
  } catch (err) {
    logger.error('Kon gemiste-nominatie-tellers niet lezen (best-effort)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return zero;
  }
}
