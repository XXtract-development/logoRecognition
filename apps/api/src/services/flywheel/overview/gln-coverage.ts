/**
 * Overview-paneel `glnCoverage` (Story 18.1, AC3 / FR-21 / UX-DR3).
 *
 * On-read dekkingsgraad van de GLN-backfill over `artwork_imports`:
 *   - percentage records mét GLN (doel ≥90%),
 *   - totaal-aantallen (met / zonder GLN),
 *   - uitval-verdeling per `glnBackfillReason` voor de records zónder GLN.
 *
 * Vervangt de lege-staat-stub (`empty-panels.ts`) nu Epic 18 landt: `available`
 * gaat naar `true`. De client (KPI-tegel "GLN-dekking", Story 15.2) leest dezelfde
 * sleutels.
 *
 * Best-effort/sectie-lokaal: gooit deze sub-service, dan markeert de composer het
 * paneel `{ error }` (de rest van het dashboard blijft bruikbaar). Deling-door-nul
 * bij een lege tabel levert `percentage: null` — geen NaN.
 *
 * Modulariteit (coördinatie-noot epics): één sub-service-aanroep in de route.
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';

const logger = createLogger('flywheel-gln-coverage');

/** Doel-dekkingsgraad (fractie 0–1) — FR-21: ≥90% van het 39k-archief. */
export const GLN_COVERAGE_TARGET = 0.9;

/** Één uitvalreden + het aantal records dat die reden draagt. */
export interface GlnBackfillReasonCount {
  reason: string;
  count: number;
}

/** Het GLN-dekkingsgraad-paneel. */
export interface GlnCoveragePanel {
  /** Bron-epic gebouwd — altijd true zodra deze sub-service actief is. */
  available: true;
  /** Totaal aantal artwork-imports (noemer van de dekkingsgraad). */
  total: number;
  /** Records met een niet-lege GLN. */
  withGln: number;
  /** Records zonder GLN (`total - withGln`). */
  withoutGln: number;
  /**
   * Dekkingsgraad als fractie 0–1, of `null` bij een lege tabel (geen
   * deling-door-nul). De client formatteert naar procenten.
   */
  percentage: number | null;
  /** Doel-dekkingsgraad (fractie) zodat de client de ≥90%-lijn kan tonen. */
  target: number;
  /** Is het doel gehaald? `false` zolang de tabel leeg is. */
  targetMet: boolean;
  /**
   * Uitval-verdeling per reden over de records ZONDER GLN, aflopend gesorteerd.
   * Records zonder GLN én zonder reden (nog niet door de backfill gezien) vallen
   * onder de pseudo-reden `niet-verwerkt` — geen stille uitval in de UI.
   */
  reasons: GlnBackfillReasonCount[];
}

/** Pseudo-reden voor records zonder GLN die (nog) geen backfill-reden dragen. */
const UNPROCESSED_REASON = 'niet-verwerkt';

/**
 * Bereken de GLN-dekkingsgraad on-read (AC3). Eén enkele tabel; drie goedkope
 * aggregaties. Gooit bij een DB-fout — de composer vangt dat sectie-lokaal af.
 */
export async function getGlnCoveragePanel(): Promise<GlnCoveragePanel> {
  const [total, withGln, grouped] = await Promise.all([
    prisma.artworkImport.count(),
    prisma.artworkImport.count({ where: { gln: { not: null } } }),
    // Uitval-verdeling: alleen records ZONDER GLN tellen mee per reden.
    prisma.artworkImport.groupBy({
      by: ['glnBackfillReason'],
      where: { gln: null },
      _count: { _all: true },
    }),
  ]);

  const withoutGln = total - withGln;
  const percentage = total === 0 ? null : withGln / total;
  const targetMet = percentage !== null && percentage >= GLN_COVERAGE_TARGET;

  const reasons: GlnBackfillReasonCount[] = grouped
    .map((g) => ({
      reason: g.glnBackfillReason ?? UNPROCESSED_REASON,
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  logger.info('GLN-dekkingsgraad-paneel opgevraagd', {
    total,
    withGln,
    withoutGln,
    percentage,
    targetMet,
  });

  return {
    available: true,
    total,
    withGln,
    withoutGln,
    percentage,
    target: GLN_COVERAGE_TARGET,
    targetMet,
    reasons,
  };
}
