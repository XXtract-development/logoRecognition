/**
 * Overview-paneel `mismatchTrends` (Story 16.1, AC5, FR-14) — de mismatch-
 * aggregatie: verhouding bevestigd/niet-gevonden per T3777-code én per
 * informatieleverancier (GLN), plus de trend over tijd.
 *
 * Bron: `mismatch_events` (Story 16.1-registratie). Modulariteit (coördinatie-noot
 * epics): één sub-service-aanroep in de `/overview`-route; geen logica in de route.
 * ON-READ, geen job.
 *
 * COHORT-FILTER (AC5, Story 16.4): reguliere aggregaties sluiten cohort-herkomst
 * (`origin LIKE 'cohort-%'`) uit — cohort-metingen hebben hun eigen trendlijn en
 * mogen de reguliere per-code/per-GLN-ratio niet vervuilen.
 *
 * De ratio bevestigd/niet-gevonden telt uitsluitend de declaratie-uitkomsten:
 * `confirmed` in de teller, `confirmed + declared-not-found` in de noemer.
 * `not-supported` en `found-not-declared` tellen NIET mee in deze ratio (een niet-
 * ondersteunde klasse is geen "niet gevonden", en een niet-gedeclareerde vondst is
 * geen declaratie-uitkomst) — ze worden wel apart geteld voor context.
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';

const logger = createLogger('flywheel-mismatch-trends');

/** Placeholder-sleutel voor events zonder GLN (Epic 18 vult het archief pas). */
export const UNKNOWN_GLN = 'onbekend';

/** Aantallen per uitkomst-type binnen één groep (code of GLN). */
export interface MismatchCounts {
  confirmed: number;
  declaredNotFound: number;
  notSupported: number;
  foundNotDeclared: number;
}

/** Eén aggregatie-rij (per code óf per GLN) met de bevestigingsratio. */
export interface MismatchRatioRow {
  /** T3777-code (per-code-view) of GLN (per-GLN-view). */
  key: string;
  counts: MismatchCounts;
  /**
   * Bevestigd / (bevestigd + niet-gevonden). `null` als de noemer 0 is (geen
   * declaratie-uitkomsten voor deze groep) — de client toont dan "n.v.t.".
   */
  confirmedRatio: number | null;
}

/** Eén trendpunt (per periode) over alle reguliere events. */
export interface MismatchTrendPoint {
  /** Periode-bucket (ISO-datum, dag-granulariteit). */
  period: string;
  counts: MismatchCounts;
  confirmedRatio: number | null;
}

export interface MismatchTrendsPanel {
  /** Bron-epic gebouwd — nu true (verving de lege stub). */
  available: true;
  byCode: MismatchRatioRow[];
  byGln: MismatchRatioRow[];
  trend: MismatchTrendPoint[];
}

/** Zolang de aggregatie faalt: sectie-lokaal een lege-maar-available paneel. */
function emptyPanel(): MismatchTrendsPanel {
  return { available: true, byCode: [], byGln: [], trend: [] };
}

/** Ruwe grouped-count-rij uit de aggregatie-query. */
interface RawGroupCount {
  key: string;
  type: string;
  n: bigint | number;
}

/** Ruwe trend-rij (per dag + type). */
interface RawTrendCount {
  period: Date;
  type: string;
  n: bigint | number;
}

/** Aantal aggregatiegroepen dat het paneel maximaal meestuurt (chart-vriendelijk). */
const MAX_GROUPS = 200;
/** Aantal trend-dagen dat het paneel maximaal meestuurt. */
const MAX_TREND_DAYS = 90;

/** Lege telling. */
function zeroCounts(): MismatchCounts {
  return { confirmed: 0, declaredNotFound: 0, notSupported: 0, foundNotDeclared: 0 };
}

/** Tel één (type, n) op in een MismatchCounts. */
function addToCounts(counts: MismatchCounts, type: string, n: number): void {
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
 * noemer 0 is (geen declaratie-uitkomsten). not-supported en found-not-declared
 * tellen bewust NIET mee (gedocumenteerde keuze, zie module-docblock).
 */
export function confirmedRatio(counts: MismatchCounts): number | null {
  const denom = counts.confirmed + counts.declaredNotFound;
  if (denom === 0) return null;
  return Number((counts.confirmed / denom).toFixed(4));
}

/** Groepeer ruwe (key,type,n)-rijen naar MismatchRatioRow[] (gesorteerd op noemer desc). */
function groupToRatioRows(raw: RawGroupCount[]): MismatchRatioRow[] {
  const byKey = new Map<string, MismatchCounts>();
  for (const r of raw) {
    const counts = byKey.get(r.key) ?? zeroCounts();
    addToCounts(counts, r.type, Number(r.n));
    byKey.set(r.key, counts);
  }
  const rows: MismatchRatioRow[] = Array.from(byKey.entries()).map(([key, counts]) => ({
    key,
    counts,
    confirmedRatio: confirmedRatio(counts),
  }));
  // Sorteer op omvang van de declaratie-uitkomsten (relevantie eerst).
  rows.sort(
    (a, b) =>
      b.counts.confirmed +
      b.counts.declaredNotFound -
      (a.counts.confirmed + a.counts.declaredNotFound)
  );
  return rows.slice(0, MAX_GROUPS);
}

/**
 * Bouw het `mismatchTrends`-paneel (AC5). Drie parallelle aggregaties over de
 * reguliere events (cohort uitgesloten): per code, per GLN, en per dag (trend).
 * Best-effort: bij een leesfout een leeg-maar-available paneel (sectie-lokale
 * degradatie, State Patterns).
 */
export async function getMismatchTrends(): Promise<MismatchTrendsPanel> {
  try {
    const [byCodeRaw, byGlnRaw, trendRaw] = await Promise.all([
      prisma.$queryRaw<RawGroupCount[]>`
        SELECT t3777_code AS key, type, COUNT(*)::bigint AS n
        FROM mismatch_events
        WHERE origin NOT LIKE 'cohort-%'
        GROUP BY t3777_code, type
      `,
      prisma.$queryRaw<RawGroupCount[]>`
        SELECT COALESCE(gln, ${UNKNOWN_GLN}) AS key, type, COUNT(*)::bigint AS n
        FROM mismatch_events
        WHERE origin NOT LIKE 'cohort-%'
        GROUP BY COALESCE(gln, ${UNKNOWN_GLN}), type
      `,
      prisma.$queryRaw<RawTrendCount[]>`
        SELECT date_trunc('day', created_at) AS period, type, COUNT(*)::bigint AS n
        FROM mismatch_events
        WHERE origin NOT LIKE 'cohort-%'
        GROUP BY date_trunc('day', created_at), type
        ORDER BY period ASC
      `,
    ]);

    const byCode = groupToRatioRows(byCodeRaw);
    const byGln = groupToRatioRows(byGlnRaw);

    // Trend: groepeer per dag.
    const byDay = new Map<string, MismatchCounts>();
    for (const r of trendRaw) {
      const period = r.period.toISOString().slice(0, 10);
      const counts = byDay.get(period) ?? zeroCounts();
      addToCounts(counts, r.type, Number(r.n));
      byDay.set(period, counts);
    }
    const trend: MismatchTrendPoint[] = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-MAX_TREND_DAYS)
      .map(([period, counts]) => ({
        period,
        counts,
        confirmedRatio: confirmedRatio(counts),
      }));

    logger.info('Mismatch-trends-paneel opgevraagd', {
      codes: byCode.length,
      glns: byGln.length,
      trendPoints: trend.length,
    });

    return { available: true, byCode, byGln, trend };
  } catch (err) {
    logger.error('Kon mismatch-trends niet lezen (best-effort leeg paneel)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return emptyPanel();
  }
}
