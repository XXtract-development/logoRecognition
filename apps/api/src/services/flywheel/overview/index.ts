/**
 * Modulaire /overview-compositie (Story 15.2, coördinatie-noot epics).
 *
 * Vijf epics (13 t/m 18) leveren panelen aan `GET /api/v1/flywheel/overview`.
 * Om te voorkomen dat één monoliet-handler een merge-magneet wordt, is elk paneel
 * één sub-service-module; deze composer roept ze aan en bouwt de payload. Elk
 * paneel faalt SECTIE-LOKAAL: een sub-service die gooit levert `{ error }` voor
 * dat paneel in plaats van een 500 op het geheel (EXPERIENCE.md State Patterns
 * "Fout bij laden" — de rest van het dashboard blijft bruikbaar).
 *
 * De route (`api/v1/flywheel.ts`) componeert alleen; hier zit geen HTTP-logica.
 */

import { createLogger } from '../../../core/logger';
import { getMissedNominationCounts } from '../missed-nominations';
import { getLastSuccessfulPromotionRun } from '../watchdog';
import { getPauseState } from '../pause';
import { getStandstillPanel } from './standstill';
import { isNominationEnabled } from '../config';
import { getGoldSetComposition } from '../gold-set-composition';
import { getOutliersPanel } from '../outliers-overview';
import { getQuarantineCount } from '../quarantine-count';
import { getPrecisionTrend } from './precision-trend';
import { getQuarantinePanel } from './quarantine';
import { getKpiPanel } from './kpi';
import { getClassCapsPanel } from './class-caps';
import { getHistoryPanel } from './history';
import { getMismatchTrends } from './mismatch-trends';
import { getCohortTrend } from './cohort-trend';
import { getBootstrapQueueOverview } from './overview-bootstrap-queue';
import { getGlnCoveragePanel } from './empty-panels';

const logger = createLogger('flywheel-overview-compose');

/** Sectie-lokale foutmarkering voor een paneel dat niet geladen kon worden. */
export interface PanelError {
  error: string;
}

/** True als een panel-waarde een sectie-lokale fout is. */
export function isPanelError(v: unknown): v is PanelError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

/**
 * Voer een paneel-sub-service uit; vang een fout sectie-lokaal af naar
 * `{ error }`. Zo breekt één falend paneel de overige panelen niet (State
 * Patterns). De naam gaat mee in de log zodat een falend paneel herleidbaar is.
 */
async function panel<T>(name: string, fn: () => Promise<T> | T): Promise<T | PanelError> {
  try {
    return await fn();
  } catch (err) {
    logger.error('Overview-paneel faalde sectie-lokaal', {
      panel: name,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { error: `Paneel ${name} kon niet geladen worden` };
  }
}

/**
 * Componeer het volledige overzicht. Alle panelen parallel; elk paneel faalt
 * sectie-lokaal. De response bevat een server-tijdstempel (`generatedAt`) voor de
 * client-side "verouderde data"-melding (AC8).
 */
export async function composeOverview() {
  const [
    missedNominations,
    lastSuccessfulPromotionRun,
    pauseState,
    standstill,
    goldSetComposition,
    outliers,
    quarantineCount,
    precisionTrend,
    quarantine,
    kpi,
    classCaps,
    history,
    mismatchTrends,
    cohortTrend,
    bootstrapQueue,
  ] = await Promise.all([
    panel('missedNominations', getMissedNominationCounts),
    panel('lastSuccessfulPromotionRun', getLastSuccessfulPromotionRun),
    panel('pause', getPauseState),
    panel('standstill', getStandstillPanel),
    panel('goldSetComposition', getGoldSetComposition),
    panel('outliers', getOutliersPanel),
    panel('quarantineCount', getQuarantineCount),
    panel('precisionTrend', getPrecisionTrend),
    panel('quarantine', getQuarantinePanel),
    panel('kpi', getKpiPanel),
    panel('classCaps', getClassCapsPanel),
    panel('history', getHistoryPanel),
    panel('mismatchTrends', getMismatchTrends),
    panel('cohortTrend', getCohortTrend),
    panel('bootstrapQueue', getBootstrapQueueOverview),
  ]);

  const missedNominationsTotal = isPanelError(missedNominations)
    ? 0
    : Object.values(missedNominations).reduce((sum, n) => sum + n, 0);

  const paused = !isPanelError(pauseState) && pauseState.paused === true;

  return {
    generatedAt: new Date().toISOString(),
    // Story 14.1: hoofdvlag voor de reviewstation-redenkeuze-UI.
    nominationEnabled: isNominationEnabled(),
    // Story 13.2: gemiste-nominatie-teller per reden + totaal.
    missedNominations,
    missedNominationsTotal,
    // Story 13.4: laatste succesvolle promotielus-run (watchdog).
    lastSuccessfulPromotionRun,
    // Story 13.6: pauze-stand.
    paused,
    // Story 15.4: pauze-/stilstandstatus (amber pauzebanner vs. rode stilstand-
    // banner met batch-links).
    standstill,
    pause: pauseState,
    // Story 14.2: gold-set-samenstelling.
    goldSetComposition,
    // Story 14.3: open outlier-meldingen + laatste audit-run.
    outliers,
    // Story 15.1: aantal openstaande quarantainebatches (nav-badge).
    quarantineCount,
    // Story 15.2: dashboard-panelen.
    precisionTrend,
    quarantine,
    kpi,
    classCaps,
    history,
    // Story 16.1: mismatch-aggregatie (ratio per code + per GLN + trend).
    mismatchTrends,
    // Story 16.4: CONFIRMED-ratio-trend van het vaste controle-cohort (SM-3),
    // één meetpunt per cohort-run (herkomst cohort-<runId>) — telt UITSLUITEND in
    // deze trendlijn, nergens in de reguliere aggregaties.
    cohortTrend,
    // Story 16.2: structurele werkvoorraad (bootstrap-wachtrij + aanvul-signalen,
    // on-read geaggregeerd uit declared-not-found-events, FR-15).
    bootstrapQueue,
    // Panelen waarvan de bron-epic nog niet gebouwd is (lege staat, UX-DR8).
    glnCoverage: getGlnCoveragePanel(),
  };
}
