/**
 * Mismatch-werkvoorraad-service — referentie-vliegwiel (Story 16.2, FR-15).
 *
 * Vertaalt de declared-not-found-events (Story 16.1, `mismatch_events`) naar
 * zichtbare, herleidbare werkvoorraad:
 *   - een code die de structureel-drempel haalt (≥N events over ≥M verschillende
 *     GTINs) én GEEN actieve referenties heeft  → bootstrap-wachtrij-rij
 *     (`bootstrap_queue`, status `wachtend`);
 *   - een code die de drempel haalt maar WÉL actieve referenties heeft (zwakke
 *     dekking)                                    → aanvul-signaal (overview-payload,
 *     geen aparte tabel).
 *
 * Ontwerp (unit-testbaarheid, guardrail "pure drempellogica apart"):
 *   - `aggregateDeclaredNotFound()` is een PURE functie (ruwe (code,gtin)-events +
 *     N/M + actieve-klassen-set → geroutede werkvoorraad-items). Geen DB, geen env.
 *   - `runMismatchWorkloadAggregation()` leest de events, resolvet de actieve
 *     klassen + de bestaande excluded-set, roept de pure functie aan en upsert de
 *     wachtrij-rijen idempotent (excluded-guard).
 *
 * BINDENDE AD's:
 *   AD-2   `apps/api` is exclusief eigenaar van `bootstrap_queue`.
 *   AD-6   GEEN nieuwe scheduler/queue — de aggregatie draait ON-READ bij de
 *          overview-aanroep (14.2-precedent), of later meeliftend op een bestaande
 *          flywheel-job. `runMismatchWorkloadAggregation()` is die ene ingang.
 *   AD-13  Herleidbaarheid: elk werkvoorraad-item is terug te voeren op de
 *          onderliggende `mismatch_events`-rijen (GTINs + runId's) — zie
 *          `getWorkloadItemTraceability()`.
 *   AD-16-analogie  `bootstrap_queue.status` heeft een vaste waardenset; deze
 *          story zet uitsluitend `wachtend`.
 *
 * IDEMPOTENTIE (NFR-4): `t3777Code` is uniek; de aggregatie upsert (status-update
 * i.p.v. insert) zodat een tweede run over dezelfde events geen duplicaat maakt.
 * EXCLUDED-GUARD: een klasse met `excluded=true` (17.2) wordt nooit opnieuw
 * toegevoegd of terug op `wachtend` gezet.
 *
 * COHORT-FILTER (Story 16.4): reguliere aggregatie sluit cohort-herkomst
 * (`origin LIKE 'cohort-%'`) uit — cohort-metingen mogen de werkvoorraad niet
 * vervuilen (spiegelt `overview/mismatch-trends.ts`).
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { getStructuralN, getStructuralM } from './config';

const logger = createLogger('flywheel-mismatch-workload');

/**
 * Eén ruwe declared-not-found-observatie (per event) — de PURE-functie-invoer.
 * Meerdere rijen met dezelfde (t3777Code, gtin) tellen als ÉÉN GTIN maar N events.
 */
export interface DeclaredNotFoundEvent {
  t3777Code: string;
  gtin: string;
}

/** Routering van een code die de structureel-drempel haalt. */
export type WorkloadRoute = 'bootstrap-queue' | 'aanvul-signaal';

/** Eén geroutede werkvoorraad-code (pure-functie-output; nog geen DB-rij). */
export interface WorkloadItem {
  t3777Code: string;
  /** Totaal aantal declared-not-found-events voor deze code (≥N). */
  eventCount: number;
  /** Aantal verschillende GTINs waarover die events verdeeld zijn (≥M). */
  distinctGtins: number;
  /**
   * `bootstrap-queue` = geen actieve referenties (lege klasse → wachtrij);
   * `aanvul-signaal` = wél actieve referenties (zwakke dekking → signaal).
   */
  route: WorkloadRoute;
}

/** De pure-functie-drempels (buiten de functie geresolved zodat ze puur blijft). */
export interface StructuralThresholds {
  /** Minimaal aantal declared-not-found-events (FLYWHEEL_STRUCTURAL_N, default 10). */
  n: number;
  /** Minimaal aantal verschillende GTINs (FLYWHEEL_STRUCTURAL_M, default 5). */
  m: number;
}

/**
 * PURE aggregatie: van ruwe declared-not-found-events naar geroutede werkvoorraad.
 *
 * Per code: tel de events + de verschillende GTINs. Haalt de code ZOWEL ≥N events
 * ALS ≥M verschillende GTINs, dan wordt hij werkvoorraad; anders niets. Routering
 * op de actieve-klassen-set: geen actieve referentie → `bootstrap-queue`, wél een
 * actieve referentie → `aanvul-signaal`. Excluded-codes worden hier NIET gefilterd
 * (dat is een DB-guard bij de upsert) — de pure functie kent de excluded-staat niet.
 *
 * De drempels zijn INCLUSIEF (≥): exact N events en exact M GTINs telt als gehaald.
 */
export function aggregateDeclaredNotFound(
  events: DeclaredNotFoundEvent[],
  activeClasses: Set<string>,
  thresholds: StructuralThresholds
): WorkloadItem[] {
  // Per code: eventteller + set van GTINs.
  const byCode = new Map<string, { count: number; gtins: Set<string> }>();
  for (const ev of events) {
    let agg = byCode.get(ev.t3777Code);
    if (!agg) {
      agg = { count: 0, gtins: new Set<string>() };
      byCode.set(ev.t3777Code, agg);
    }
    agg.count += 1;
    agg.gtins.add(ev.gtin);
  }

  const items: WorkloadItem[] = [];
  for (const [t3777Code, agg] of byCode.entries()) {
    const distinctGtins = agg.gtins.size;
    // BEIDE drempels moeten gehaald worden (≥N events EN ≥M GTINs).
    if (agg.count < thresholds.n || distinctGtins < thresholds.m) continue;
    items.push({
      t3777Code,
      eventCount: agg.count,
      distinctGtins,
      route: activeClasses.has(t3777Code) ? 'aanvul-signaal' : 'bootstrap-queue',
    });
  }

  // Deterministische volgorde (meeste events eerst) — stabiel voor tests + UI.
  items.sort((a, b) => b.eventCount - a.eventCount || a.t3777Code.localeCompare(b.t3777Code));
  return items;
}

/** Ruwe grouped-count-rij uit de events-aggregatiequery. */
interface RawWorkloadCount {
  t3777_code: string;
  event_count: bigint | number;
  distinct_gtins: bigint | number;
}

/**
 * Lees de declared-not-found-events geaggregeerd per code (cohort uitgesloten) en
 * geef alleen de codes terug die de structureel-drempel halen. Doet het tellen in
 * de DB (COUNT(*) + COUNT(DISTINCT gtin)) zodat er nooit een volledige event-tabel
 * in het geheugen komt; de HAVING filtert al op de drempel.
 */
async function loadCandidateCounts(
  thresholds: StructuralThresholds
): Promise<Map<string, { count: number; gtins: number }>> {
  const raw = await prisma.$queryRaw<RawWorkloadCount[]>`
    SELECT t3777_code,
           COUNT(*)::bigint AS event_count,
           COUNT(DISTINCT gtin)::bigint AS distinct_gtins
    FROM mismatch_events
    WHERE type = 'declared-not-found'
      AND origin NOT LIKE 'cohort-%'
    GROUP BY t3777_code
    HAVING COUNT(*) >= ${thresholds.n}
       AND COUNT(DISTINCT gtin) >= ${thresholds.m}
  `;
  const map = new Map<string, { count: number; gtins: number }>();
  for (const r of raw) {
    map.set(r.t3777_code, {
      count: Number(r.event_count),
      gtins: Number(r.distinct_gtins),
    });
  }
  return map;
}

/** Set van T3777-codes met een actieve referentieklasse (`reference_logos WHERE active`). */
async function loadActiveClasses(): Promise<Set<string>> {
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true },
    select: { t3777Code: true },
    distinct: ['t3777Code'],
  });
  return new Set(rows.map((r) => r.t3777Code));
}

/** Set van T3777-codes die uitgesloten zijn (`bootstrap_queue.excluded=true`, 17.2). */
async function loadExcludedClasses(): Promise<Set<string>> {
  const rows = await prisma.bootstrapQueue.findMany({
    where: { excluded: true },
    select: { t3777Code: true },
  });
  return new Set(rows.map((r) => r.t3777Code));
}

/** Eén aanvul-signaal (zwakke-dekking-code) voor de overview-payload. */
export interface RefillSignal {
  t3777Code: string;
  eventCount: number;
  distinctGtins: number;
}

/** Uitkomst van één aggregatie-run (voor logging + de overview-sub-service). */
export interface WorkloadAggregationResult {
  /** Codes zonder actieve referenties die naar `bootstrap_queue` zijn geupsert. */
  queued: WorkloadItem[];
  /** Codes met actieve referenties (zwakke dekking) — aanvul-signalen. */
  refillSignals: RefillSignal[];
  /** Codes die de drempel haalden maar uitgesloten zijn (overgeslagen, guard). */
  skippedExcluded: string[];
}

/**
 * DE aggregatie-ingang (AD-6: on-read of meeliftend, GEEN nieuwe scheduler).
 *
 * Leest de drempel-halende codes, resolvet actieve + uitgesloten klassen, routeert
 * (pure functie) en upsert de wachtrij-rijen idempotent met excluded-guard. Geeft
 * de queue + de aanvul-signalen terug zodat de overview-sub-service ze kan tonen.
 *
 * Idempotent: `t3777Code` uniek → upsert (status weer op `wachtend`, tenzij
 * excluded). Een klasse die intussen actieve referenties kreeg verschuift automatisch
 * van queue naar aanvul-signaal (en wordt niet opnieuw geupsert).
 */
export async function runMismatchWorkloadAggregation(): Promise<WorkloadAggregationResult> {
  const thresholds: StructuralThresholds = { n: getStructuralN(), m: getStructuralM() };

  const [counts, activeClasses, excluded] = await Promise.all([
    loadCandidateCounts(thresholds),
    loadActiveClasses(),
    loadExcludedClasses(),
  ]);

  // Rehydrateer de pure-functie-invoer uit de DB-tellingen (al drempel-gefilterd):
  // we hebben de exacte counts al, dus routeer direct zonder de ruwe events opnieuw
  // te laden. De pure `aggregateDeclaredNotFound` blijft de canonieke, los geteste
  // drempel-/routeringslogica; hier passen we dezelfde routeringsregel toe op de
  // reeds-getelde codes.
  const items: WorkloadItem[] = Array.from(counts.entries())
    .map(([t3777Code, c]) => ({
      t3777Code,
      eventCount: c.count,
      distinctGtins: c.gtins,
      route: activeClasses.has(t3777Code)
        ? ('aanvul-signaal' as const)
        : ('bootstrap-queue' as const),
    }))
    .sort((a, b) => b.eventCount - a.eventCount || a.t3777Code.localeCompare(b.t3777Code));

  const queued: WorkloadItem[] = [];
  const refillSignals: RefillSignal[] = [];
  const skippedExcluded: string[] = [];

  for (const item of items) {
    if (item.route === 'aanvul-signaal') {
      refillSignals.push({
        t3777Code: item.t3777Code,
        eventCount: item.eventCount,
        distinctGtins: item.distinctGtins,
      });
      continue;
    }
    // bootstrap-queue-route: excluded-guard vóór de upsert (uitgesloten blijft uitgesloten).
    if (excluded.has(item.t3777Code)) {
      skippedExcluded.push(item.t3777Code);
      continue;
    }
    // Idempotente upsert: bestaat de rij, dan status → `wachtend` (opnieuw agenderen);
    // bestaat hij niet, dan invoegen. `excluded`-rijen zijn hierboven al uitgefilterd.
    await prisma.bootstrapQueue.upsert({
      where: { t3777Code: item.t3777Code },
      create: { t3777Code: item.t3777Code, status: 'wachtend' },
      update: { status: 'wachtend' },
    });
    queued.push(item);
  }

  logger.info('Mismatch-werkvoorraad geaggregeerd', {
    n: thresholds.n,
    m: thresholds.m,
    queued: queued.length,
    refillSignals: refillSignals.length,
    skippedExcluded: skippedExcluded.length,
  });

  return { queued, refillSignals, skippedExcluded };
}

/** Eén onderliggend mismatch-event achter een werkvoorraad-item (herleidbaarheid). */
export interface WorkloadTraceabilityEvent {
  gtin: string;
  gln: string | null;
  origin: string;
  runId: string | null;
  createdAt: Date;
}

/** Herleidbaarheids-uitkomst voor één werkvoorraad-item (AD-13, NFR-1). */
export interface WorkloadTraceability {
  t3777Code: string;
  /** Aantal verschillende onderliggende GTINs. */
  distinctGtins: number;
  /** De verschillende GTINs (gesorteerd). */
  gtins: string[];
  /** De onderliggende verwerkingen (events), nieuwste eerst — begrensd. */
  events: WorkloadTraceabilityEvent[];
}

/** Maximaal aantal event-rijen dat de herleidbaarheids-lookup meestuurt. */
const MAX_TRACE_EVENTS = 500;

/**
 * Herleidbaarheid (AC3, FR-15/NFR-1): van één werkvoorraad-item (T3777-code) terug
 * naar de onderliggende declared-not-found-events — de GTINs + verwerkingen (runId/
 * herkomst) die het item deden ontstaan. Geen tussenstappen verzinnen: puur de
 * `mismatch_events`-rijen die de aggregatie telde (zelfde WHERE: declared-not-found,
 * cohort uitgesloten).
 */
export async function getWorkloadItemTraceability(
  t3777Code: string
): Promise<WorkloadTraceability> {
  const rows = await prisma.mismatchEvent.findMany({
    where: {
      t3777Code,
      type: 'declared-not-found',
      NOT: { origin: { startsWith: 'cohort-' } },
    },
    select: { gtin: true, gln: true, origin: true, runId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_TRACE_EVENTS,
  });

  const gtins = Array.from(new Set(rows.map((r) => r.gtin))).sort();

  return {
    t3777Code,
    distinctGtins: gtins.length,
    gtins,
    events: rows.map((r) => ({
      gtin: r.gtin,
      gln: r.gln,
      origin: r.origin,
      runId: r.runId,
      createdAt: r.createdAt,
    })),
  };
}
