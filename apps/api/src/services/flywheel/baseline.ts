/**
 * Baseline-marker-abstractie voor de kwaliteitspoort (Story 13.5 leeskant + Story
 * 13.6 schrijfkant, AD-5).
 *
 * De poort vergelijkt een batch-meting met de baseline van de laatst gepasseerde
 * batch. Die baseline moet als VEROUDERD kunnen worden gemarkeerd zodra de
 * actieve referentieset buiten batch-promotie om muteert (handmatige curatie,
 * outlier-deactivatie, rollback, legacy-12.3-registratie) — dan begint de
 * eerstvolgende poortrun met een verse nulmeting op de actuele set (AC 3, AD-5).
 *
 * Story 13.5 leverde de LEESKANT (`isBaselineStale`) achter deze abstractie zodat
 * de poort al met een verouderde baseline kon omgaan vóór de bron bestond. Story
 * 13.6 levert nu de SCHRIJFKANT (`markBaselineStale`) + de `system_settings`-bron
 * en de RESET (`consumeBaselineStale`) die de poort ná de verse nulmeting
 * aanroept. De env-override `FLYWHEEL_BASELINE_STALE` blijft bestaan als
 * handmatig/test-forceermiddel; hij is géén productie-besturingskanaal.
 */

import { createLogger } from '../../core/logger';
import { getSetting, setSetting, SETTING_KEYS } from './system-settings';

const logger = createLogger('flywheel-baseline');

/** Vorm van de `flywheel.baselineStale`-waarde in system_settings (AD-5/AD-13). */
export interface BaselineStaleMarker {
  stale: boolean;
  reason: string;
  at: string;
  by: string | null;
}

/** De invalidatie-triggerpaden (AD-5) — puur documentair, voor logging/evidence. */
export type BaselineInvalidationReason =
  | 'rollback'
  | 'reference-curatie'
  | 'outlier-deactivatie'
  | 'legacy-12.3-registratie';

/**
 * Is de vergelijkings-baseline verouderd (AC 3, AD-5)? Bron = de
 * `flywheel.baselineStale`-marker in system_settings (Story 13.6). De env-override
 * `FLYWHEEL_BASELINE_STALE` forceert `true` (handmatig/test); anders telt de
 * DB-marker. Een leesfout valt fail-safe terug op `false` (geen valse verse
 * nulmeting).
 */
export async function isBaselineStale(): Promise<boolean> {
  const override = process.env.FLYWHEEL_BASELINE_STALE;
  if (override === 'true' || override === '1') {
    logger.info('Baseline gemarkeerd als verouderd via FLYWHEEL_BASELINE_STALE');
    return true;
  }

  const marker = await getSetting<BaselineStaleMarker>(SETTING_KEYS.BASELINE_STALE);
  return marker?.stale === true;
}

/**
 * Markeer de baseline als VEROUDERD (Story 13.6 schrijfkant, AD-5). Aan te roepen
 * op ELKE mutatie van de actieve referentieset buiten batch-promotie om:
 * rollback, handmatige curatie/upload, outlier-deactivatie en legacy-12.3-
 * registratie. Idempotent: nogmaals markeren overschrijft alleen de reden/tijd.
 *
 * Best-effort: een schrijffout mag de aanroepende mutatie (die al slaagde) niet
 * terugdraaien — de baseline-invalidatie is een observability-/veiligheidsmarker,
 * geen transactionele voorwaarde. Bij een gemiste markering valt de poort terug
 * op de bestaande baseline (conservatief, geen datacorruptie).
 */
export async function markBaselineStale(
  reason: BaselineInvalidationReason,
  by: string | null = null
): Promise<void> {
  const marker: BaselineStaleMarker = {
    stale: true,
    reason,
    at: new Date().toISOString(),
    by,
  };
  try {
    await setSetting(SETTING_KEYS.BASELINE_STALE, marker, by);
    logger.info('Baseline gemarkeerd als verouderd', { reason, by });
  } catch (err) {
    logger.error('Kon baseline-stale-marker niet schrijven (non-fataal)', {
      reason,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Lees én reset de baseline-stale-marker (Story 13.6). De poort roept dit aan ná
 * een verse nulmeting: hij consumeert de markering zodat een volgende run niet
 * onnodig opnieuw nul-meet. Retourneert of de baseline verouderd wás (zodat de
 * aanroeper kan loggen). De env-override wordt hier NIET gereset (die is een
 * bewust-permanent forceermiddel).
 *
 * Best-effort reset: een schrijffout laat de marker staan (de volgende run
 * nul-meet dan nogmaals — conservatief, nooit gevaarlijk).
 */
export async function consumeBaselineStale(): Promise<boolean> {
  const override = process.env.FLYWHEEL_BASELINE_STALE;
  const envForced = override === 'true' || override === '1';

  const marker = await getSetting<BaselineStaleMarker>(SETTING_KEYS.BASELINE_STALE, {
    fresh: true,
  });
  const wasStale = envForced || marker?.stale === true;

  if (marker?.stale === true) {
    const cleared: BaselineStaleMarker = {
      stale: false,
      reason: 'geconsumeerd na verse nulmeting',
      at: new Date().toISOString(),
      by: null,
    };
    try {
      await setSetting(SETTING_KEYS.BASELINE_STALE, cleared, null);
      logger.info('Baseline-stale-marker gereset na verse nulmeting');
    } catch (err) {
      logger.error('Kon baseline-stale-marker niet resetten (non-fataal)', {
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return wasStale;
}
