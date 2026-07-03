/**
 * Baseline-marker-abstractie voor de kwaliteitspoort (Story 13.5, AD-5).
 *
 * De poort vergelijkt een batch-meting met de baseline van de laatst gepasseerde
 * batch. Die baseline moet als VEROUDERD kunnen worden gemarkeerd zodra de
 * actieve referentieset buiten batch-promotie om muteert (handmatige curatie,
 * outlier-deactivatie, rollback, legacy-12.3-registratie) — dan begint de
 * eerstvolgende poortrun met een verse nulmeting op de actuele set (AC 3, AD-5).
 *
 * VOLGORDE-ONTKOPPELING (Project Structure variance, gedocumenteerd in het Dev
 * Agent Record): de INVALIDATIE-TRIGGERS zijn Story 13.6 (die koppelt de bron aan
 * `system_settings`). Deze story implementeert het GEDRAG (verse nulmeting bij
 * een verouderde baseline) achter deze leesbare marker-abstractie, zodat 13.5 en
 * 13.6 los van elkaar landen. Tot 13.6 de bron levert is de marker altijd
 * "niet verouderd" (default false) — het gedrag is dan byte-gelijk aan "geen
 * invalidatie", en 13.6 hoeft alleen `isBaselineStale` een echte bron te geven.
 */

import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-baseline');

/**
 * Is de vergelijkings-baseline verouderd (AC 3, AD-5)? Bron wordt in Story 13.6
 * `system_settings`; tot die tijd default `false` (geen invalidatie).
 *
 * De signatuur is bewust async zodat 13.6 een DB-lezing kan inschuiven zonder de
 * aanroeper (`gate.ts`) te wijzigen. De env-override `FLYWHEEL_BASELINE_STALE`
 * bestaat uitsluitend om het gedrag testbaar/handmatig-forceerbaar te maken vóór
 * 13.6 er is; hij is géén productie-besturingskanaal.
 */
export async function isBaselineStale(): Promise<boolean> {
  const override = process.env.FLYWHEEL_BASELINE_STALE;
  if (override === 'true' || override === '1') {
    logger.info('Baseline gemarkeerd als verouderd via FLYWHEEL_BASELINE_STALE');
    return true;
  }
  return false;
}
