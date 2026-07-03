/**
 * Overview-paneel `cohortTrend` (Story 16.4, AC3, SM-3/FR-17) — de CONFIRMED-
 * ratio-trend van het VASTE controle-cohort, één meetpunt per cohort-run.
 *
 * Bron: `mismatch_events` WAAR `origin LIKE 'cohort-%'` — precies het spiegelbeeld
 * van de reguliere aggregaties (16.1/16.2/16.3), die cohort-herkomst juist
 * UITSLUITEN (`origin NOT LIKE 'cohort-%'`). Zo telt het controle-cohort mee in
 * ZIJN eigen trendlijn en nergens anders (guardrail "cohort-events scheiden").
 *
 * Elke cohort-run heeft een unieke herkomst `cohort-<runId>`; per herkomst is er
 * één meetpunt. De ratio = confirmed / (confirmed + declared-not-found), identiek
 * aan de 16.1-definitie: `not-supported` telt NIET in de noemer (een niet-
 * ondersteunde klasse is geen "niet gevonden"). ON-READ, geen job.
 *
 * Best-effort: bij een leesfout een leeg-maar-available paneel (sectie-lokale
 * degradatie, State Patterns — de rest van het dashboard blijft bruikbaar).
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';

const logger = createLogger('flywheel-cohort-trend');

/** Aantallen per uitkomst-type binnen één cohort-run. */
export interface CohortTrendCounts {
  confirmed: number;
  declaredNotFound: number;
  notSupported: number;
  foundNotDeclared: number;
}

/** Eén meetpunt (per cohort-run) met de bevestigingsratio. */
export interface CohortTrendPoint {
  /** De volledige herkomst van de run (`cohort-<runId>`). */
  origin: string;
  /** De run-id zonder de `cohort-`-prefix (SM-3-meetpunt-sleutel). */
  runId: string;
  /** Eerste event-tijdstip van de run (ISO), als run-tijdstempel. */
  runAt: string;
  counts: CohortTrendCounts;
  /** confirmed / (confirmed + declared-not-found); `null` als de noemer 0 is. */
  confirmedRatio: number | null;
}

export interface CohortTrendPanel {
  available: true;
  /** Chronologisch (oudste eerst) — de stijgende SM-3-trendlijn. */
  runs: CohortTrendPoint[];
}

/** Zolang de aggregatie faalt: een leeg-maar-available paneel. */
function emptyPanel(): CohortTrendPanel {
  return { available: true, runs: [] };
}

/** Ruwe grouped-count-rij uit de aggregatie-query. */
interface RawCohortRow {
  origin: string;
  type: string;
  n: bigint | number;
  run_at: Date;
}

/** Maximaal aantal cohort-runs dat het paneel meestuurt (chart-vriendelijk). */
const MAX_RUNS = 120;

/** Lege telling. */
function zeroCounts(): CohortTrendCounts {
  return { confirmed: 0, declaredNotFound: 0, notSupported: 0, foundNotDeclared: 0 };
}

/** Tel één (type, n) op in een CohortTrendCounts. */
function addToCounts(counts: CohortTrendCounts, type: string, n: number): void {
  switch (type) {
    case 'confirmed':
      counts.confirmed += n;
      break;
    case 'declared-not-found':
      counts.declaredNotFound += n;
      break;
    case 'not-supported':
      counts.notSupported += n;
      break;
    case 'found-not-declared':
      counts.foundNotDeclared += n;
      break;
    // onbekend type: negeren (defensief).
  }
}

/**
 * Bevestigingsratio: confirmed / (confirmed + declared-not-found). `null` als de
 * noemer 0 is. `not-supported` en `found-not-declared` tellen bewust NIET mee
 * (gedeelde definitie met 16.1 en control-cohort.cohortConfirmedRatio).
 */
export function cohortRunRatio(counts: CohortTrendCounts): number | null {
  const denom = counts.confirmed + counts.declaredNotFound;
  if (denom === 0) return null;
  return Number((counts.confirmed / denom).toFixed(4));
}

/** Strip de `cohort-`-prefix van een herkomst → de kale run-id. */
export function runIdFromOrigin(origin: string): string {
  return origin.startsWith('cohort-') ? origin.slice('cohort-'.length) : origin;
}

/**
 * Bouw de cohort-trend uit ruwe (origin, type, n, run_at)-rijen (PURE, testbaar).
 * Groepeert per herkomst (= per cohort-run), berekent de ratio en sorteert
 * chronologisch op het run-tijdstempel (oudste eerst → de stijgende trendlijn).
 */
export function buildCohortTrend(raw: RawCohortRow[]): CohortTrendPoint[] {
  const byOrigin = new Map<string, { counts: CohortTrendCounts; runAt: Date }>();
  for (const r of raw) {
    const entry =
      byOrigin.get(r.origin) ?? { counts: zeroCounts(), runAt: r.run_at };
    addToCounts(entry.counts, r.type, Number(r.n));
    // Vroegste tijdstip als run-tijdstempel.
    if (r.run_at < entry.runAt) entry.runAt = r.run_at;
    byOrigin.set(r.origin, entry);
  }

  const points: CohortTrendPoint[] = Array.from(byOrigin.entries()).map(
    ([origin, { counts, runAt }]) => ({
      origin,
      runId: runIdFromOrigin(origin),
      runAt: runAt.toISOString(),
      counts,
      confirmedRatio: cohortRunRatio(counts),
    })
  );

  points.sort((a, b) => a.runAt.localeCompare(b.runAt));
  return points.slice(-MAX_RUNS);
}

/**
 * Bouw het `cohortTrend`-paneel (AC3). Aggregeert uitsluitend de cohort-events
 * (`origin LIKE 'cohort-%'`) per herkomst + type, met het vroegste event-tijdstip
 * per run als run-tijdstempel. Best-effort: bij een leesfout een leeg paneel.
 */
export async function getCohortTrend(): Promise<CohortTrendPanel> {
  try {
    const raw = await prisma.$queryRaw<RawCohortRow[]>`
      SELECT origin, type, COUNT(*)::bigint AS n, MIN(created_at) AS run_at
      FROM mismatch_events
      WHERE origin LIKE 'cohort-%'
      GROUP BY origin, type
    `;

    const runs = buildCohortTrend(raw);

    logger.info('Cohort-trend-paneel opgevraagd', { runs: runs.length });
    return { available: true, runs };
  } catch (err) {
    logger.error('Kon cohort-trend niet lezen (best-effort leeg paneel)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return emptyPanel();
  }
}
