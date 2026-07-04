/**
 * Story 18.2 — Restant-route via mediaserver-re-import (FR-21, AD-7 route (b)).
 *
 * GEDOSEERD, HANDMATIG gestart driver-script (geen job, geen scheduler). Het pakt
 * het GLN-restant dat NA Story 18.1 overblijft — `artwork_imports`-records met
 * `gln IS NULL` én een gezette `glnBackfillReason` — en voert dat alsnog via het
 * BESTAANDE 8-3O-re-importmechanisme (artwork-pipeline.ts) van een GLN. Er wordt
 * GEEN nieuw mechanisme gebouwd: het script stuurt uitsluitend het bestaande
 * `runImportLoop` per batch aan (delta-strategie, `force:false`), dat voor een
 * al-geïmporteerde media alleen de ontbrekende GLN bijschrijft ("re-import is the
 * documented repair path", artwork-pipeline.ts:250–266).
 *
 * CPU-getemperd (NFR-3, les 2026-06-15: ongetemperde bulk deed de frontend-
 * health-check timeouten): batch-grootte en pauze-interval zijn configureerbaar via
 * `FLYWHEEL_GLN_REIMPORT_BATCH_SIZE` (default 25) en `FLYWHEEL_GLN_REIMPORT_PAUSE_MS`
 * (default 30000 ms). Elke batch draait als één import-run; het script WACHT op
 * afronding vóór de volgende batch en pauzeert ertussen.
 *
 * Uitvalreden-bijwerking (geen stille uitval, FR-21): ná elke batch krijgt elk
 * verwerkt GTIN een actuele reden — gevuld → `glnBackfillReason = NULL`; nog steeds
 * geen GLN → `mediaserver-geen-gln` (discovery leverde media maar geen afleidbare
 * GLN) of `mediaserver-geen-media` (discovery leverde niets voor deze GTIN).
 *
 * Dekkingsgraad-hermeting (AC2): het 18.1-paneel `glnCoverage` rekent on-read, dus
 * de bijgewerkte dekking + het definitieve restant met redenen verschijnen vanzelf
 * in het dashboard. Het script print de dekking vóór/ná als samenvatting (bewijs).
 *
 * Idempotent/hervatbaar: bij herstart worden alleen nog-openstaande restant-GTINs
 * geselecteerd; al-gevulde records vallen door de dedup-skip vanzelf weg.
 *
 * Usage:
 *   # veilig plan (default), schrijft niets — toont GTIN-aantal + batch-indeling:
 *   npx tsx scripts/gln-reimport-restant.ts --dry-run
 *   # echte run (stuurt het bestaande import-mechanisme aan, off-peak):
 *   npx tsx scripts/gln-reimport-restant.ts --apply
 */

import prisma from '../src/core/db';
import { createLogger } from '../src/core/logger';
import {
  getGlnReimportBatchSize,
  getGlnReimportPauseMs,
} from '../src/services/flywheel/config';

const logger = createLogger('gln-reimport-restant');

/**
 * Nieuwe uitvalredenen voor het definitieve restant ná re-import (stringwaarden in
 * de bestaande `gln_backfill_reason`-kolom — GEEN schemawijziging).
 */
export type ReimportReason = 'mediaserver-geen-gln' | 'mediaserver-geen-media';

/** Uitkomst per GTIN ná een re-import-batch (puur; geen I/O). */
export type ReimportOutcome =
  | { gtin: string; kind: 'opgelost' } // heeft nu een GLN → reden gewist
  | { gtin: string; kind: 'uitval'; reason: ReimportReason };

/** Samenvatting van een plan- of apply-run. */
export interface ReimportSummary {
  /** Aantal restant-GTINs (18.1-uitval) dat verwerkt is. */
  gtinsProcessed: number;
  /** Aantal batches waarin dat verdeeld is. */
  batches: number;
  /** GTINs die ná re-import een GLN kregen (reden gewist). */
  resolved: number;
  /** Definitief restant per nieuwe reden. */
  byReason: Record<ReimportReason, number>;
  /** Dekkingsgraad (fractie records-met-GLN) vóór de run. */
  coverageBefore: number | null;
  /** Dekkingsgraad ná de run (bij dry-run gelijk aan vóór — er wordt niets gevuld). */
  coverageAfter: number | null;
  /** Aantal PG-reden-updates (0 bij dry-run). */
  writes: number;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// PURE KERN — geen I/O, volledig testbaar.
// ---------------------------------------------------------------------------

/**
 * Deel een lijst GTINs op in batches van `size`. Robuust: `size < 1` valt terug op
 * één batch met alles (defensief — de config-getter garandeert al ≥ 1).
 */
export function chunkIntoBatches<T>(items: T[], size: number): T[][] {
  if (size < 1) return items.length > 0 ? [items] : [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * Bepaal de reden voor een GTIN dat ná re-import nog steeds geen GLN heeft. Basis
 * is wat de mediaserver-discovery opleverde:
 *   - discovery leverde geen enkel media-item → `mediaserver-geen-media`;
 *   - discovery leverde media, maar geen enkel item droeg een afleidbare GLN →
 *     `mediaserver-geen-gln`.
 */
export function reasonForUnresolved(discovery: {
  mediaCount: number;
  glnCount: number;
}): ReimportReason {
  if (discovery.mediaCount === 0) return 'mediaserver-geen-media';
  return 'mediaserver-geen-gln';
}

/** Lege reden-teller. */
function emptyByReason(): Record<ReimportReason, number> {
  return { 'mediaserver-geen-gln': 0, 'mediaserver-geen-media': 0 };
}

// ---------------------------------------------------------------------------
// Injecteerbare afhankelijkheden (mockbaar in tests — nooit prod/mediaserver in tests).
// ---------------------------------------------------------------------------

/** Wat de mediaserver-discovery voor een GTIN opleverde (voor de reden-keuze). */
export interface DiscoverySignal {
  mediaCount: number;
  glnCount: number;
}

/** Deps die de orkestratie injecteert; tests geven mocks, prod de echte I/O. */
export interface ReimportDeps {
  /** Unieke restant-GTINs: `gln IS NULL` én een gezette `glnBackfillReason` (18.1). */
  listRestantGtins: () => Promise<string[]>;
  /** Totaal-tellingen voor de dekkingsgraad (hergebruikt het 18.1-paneel-cijfer). */
  coverageTotals: () => Promise<{ total: number; withGln: number }>;
  /**
   * Draai het BESTAANDE import-mechanisme voor één batch GTINs (delta/force:false)
   * en wacht tot de run klaar is. Geen eigen loop — dit is `runImportLoop`.
   */
  runImportBatch: (gtins: string[]) => Promise<void>;
  /** Heeft dit GTIN NU (ná re-import) minstens één record mét GLN? */
  hasGln: (gtin: string) => Promise<boolean>;
  /** Wat leverde de mediaserver-discovery op (voor de reden bij definitieve uitval)? */
  discoverySignal: (gtin: string) => Promise<DiscoverySignal>;
  /** Wis de uitvalreden voor een opgelost GTIN (records met nu een GLN). #rijen. */
  clearReason: (gtin: string) => Promise<number>;
  /** Zet de nieuwe uitvalreden voor het definitieve restant (`gln IS NULL`). #rijen. */
  setReason: (gtin: string, reason: ReimportReason) => Promise<number>;
  /** Pauzeer tussen batches (getemperd). Injecteerbaar zodat tests fake timers gebruiken. */
  sleep: (ms: number) => Promise<void>;
}

export interface ReimportOptions {
  dryRun: boolean;
  batchSize: number;
  pauseMs: number;
}

// ---------------------------------------------------------------------------
// Orkestratie — dry-run doet GEEN import-run, GEEN write, GEEN pauze.
// ---------------------------------------------------------------------------

/**
 * Kern-orkestratie van de terugval-route. Selecteert het 18.1-restant, verdeelt het
 * in batches, en verwerkt (alleen bij apply) elke batch via het bestaande
 * import-mechanisme — gevolgd door de reden-bijwerking en een getemperde pauze.
 *
 * Bij `dryRun` wordt NOOIT `runImportBatch`, `clearReason`, `setReason` of `sleep`
 * aangeroepen — alleen het plan (aantal restant-GTINs + batch-indeling) telt.
 */
export async function runReimport(
  deps: ReimportDeps,
  opts: ReimportOptions
): Promise<ReimportSummary> {
  const restant = await deps.listRestantGtins();
  const before = await deps.coverageTotals();
  const batches = chunkIntoBatches(restant, opts.batchSize);

  const byReason = emptyByReason();
  let resolved = 0;
  let writes = 0;

  const coverageBefore = before.total === 0 ? null : before.withGln / before.total;

  if (opts.dryRun) {
    // Nul writes, nul import-runs, nul pauzes — alleen het plan.
    return {
      gtinsProcessed: restant.length,
      batches: batches.length,
      resolved: 0,
      byReason,
      coverageBefore,
      coverageAfter: coverageBefore,
      writes: 0,
      dryRun: true,
    };
  }

  for (let b = 0; b < batches.length; b += 1) {
    const batch = batches[b];

    // Één import-run voor de hele batch (bestaand mechanisme, force:false).
    await deps.runImportBatch(batch);

    // Reden-bijwerking per GTIN: gevuld → reden wissen; anders nieuwe reden.
    for (const gtin of batch) {
      if (await deps.hasGln(gtin)) {
        writes += await deps.clearReason(gtin);
        resolved += 1;
      } else {
        const signal = await deps.discoverySignal(gtin);
        const reason = reasonForUnresolved(signal);
        writes += await deps.setReason(gtin, reason);
        byReason[reason] += 1;
      }
    }

    // Getemperde pauze tussen batches (niet ná de laatste).
    if (b < batches.length - 1 && opts.pauseMs > 0) {
      await deps.sleep(opts.pauseMs);
    }
  }

  const after = await deps.coverageTotals();
  const coverageAfter = after.total === 0 ? null : after.withGln / after.total;

  return {
    gtinsProcessed: restant.length,
    batches: batches.length,
    resolved,
    byReason,
    coverageBefore,
    coverageAfter,
    writes,
    dryRun: false,
  };
}

// ---------------------------------------------------------------------------
// Echte I/O-deps (alleen gebruikt door de CLI-entrypoint; nooit in tests).
// ---------------------------------------------------------------------------

/** Standaard pauze-implementatie (echte wall-clock; tests injecteren een fake). */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prod-deps rondom Prisma + het bestaande import-mechanisme + de mediaserver. */
function createProdDeps(): ReimportDeps {
  return {
    listRestantGtins: async () => {
      // Het 18.1-restant: geen GLN én een gezette uitvalreden. Records zonder reden
      // zijn (nog) niet door 18.1 gezien en vallen buiten deze terugval-route.
      const rows = await prisma.artworkImport.findMany({
        where: { gln: null, glnBackfillReason: { not: null } },
        distinct: ['gtin'],
        select: { gtin: true },
      });
      return rows.map((r) => r.gtin);
    },
    coverageTotals: async () => {
      const [total, withGln] = await Promise.all([
        prisma.artworkImport.count(),
        prisma.artworkImport.count({ where: { gln: { not: null } } }),
      ]);
      return { total, withGln };
    },
    runImportBatch: async (gtins) => {
      // Hergebruik het BESTAANDE mechanisme: maak een run + draai runImportLoop tot
      // afronding. force:false is impliciet — de delta-strategie skipt de al-
      // geïmporteerde media en triggert precies de goedkope gln-backfill-tak.
      const { runImportLoop, markStaleRuns } = await import('../src/api/v1/artwork-pipeline');
      await markStaleRuns();
      const run = await prisma.artworkImportRun.create({
        data: { status: 'running', gtins, heartbeatAt: new Date() },
      });
      logger.info('Re-import-batch gestart', { runId: run.id, gtins: gtins.length });
      await runImportLoop(run.id, gtins);
      logger.info('Re-import-batch afgerond', { runId: run.id });
    },
    hasGln: async (gtin) => {
      const withGln = await prisma.artworkImport.count({
        where: { gtin, gln: { not: null } },
      });
      return withGln > 0;
    },
    discoverySignal: async (gtin) => {
      // Read-only mediaserver-discovery om de definitieve uitvalreden te bepalen:
      // wél media maar geen afleidbare GLN vs. helemaal geen media.
      const { mediaServerClient, deriveGlnFromPreviewUrl } = await import(
        '../src/services/mediaserver-client'
      );
      try {
        const items = await mediaServerClient.discoverArtwork(gtin);
        const glnCount = items.filter(
          (it) => it.gln ?? deriveGlnFromPreviewUrl(it.previewUrl)
        ).length;
        return { mediaCount: items.length, glnCount };
      } catch {
        // Discovery-fout: behandel als "geen media afleidbaar" — het record houdt
        // een actuele reden (geen stille uitval).
        return { mediaCount: 0, glnCount: 0 };
      }
    },
    clearReason: async (gtin) => {
      // Alleen records die nu een GLN hebben; hun 18.1-reden is achterhaald.
      const res = await prisma.artworkImport.updateMany({
        where: { gtin, gln: { not: null } },
        data: { glnBackfillReason: null },
      });
      return res.count;
    },
    setReason: async (gtin, reason) => {
      // Alleen het definitieve restant (`gln IS NULL`) krijgt de nieuwe reden.
      const res = await prisma.artworkImport.updateMany({
        where: { gtin, gln: null },
        data: { glnBackfillReason: reason },
      });
      return res.count;
    },
    sleep: realSleep,
  };
}

// ---------------------------------------------------------------------------
// CLI-entrypoint.
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { dryRun: boolean } {
  const has = (flag: string) => argv.includes(flag);
  // Default = dry-run (veilig). `--apply` is nodig om echt te draaien.
  const apply = has('--apply');
  return { dryRun: has('--dry-run') || !apply };
}

function formatPct(v: number | null): string {
  return v === null ? 'n.v.t. (lege tabel)' : `${(v * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const batchSize = getGlnReimportBatchSize();
  const pauseMs = getGlnReimportPauseMs();

  logger.info('GLN-restant-re-import gestart', { dryRun, batchSize, pauseMs });
  if (dryRun) {
    logger.info(
      'DRY-RUN: er wordt NIETS geschreven en GEEN import-run gestart — alleen het plan.'
    );
  }

  const deps = createProdDeps();
  try {
    const summary = await runReimport(deps, { dryRun, batchSize, pauseMs });

    logger.info('GLN-restant-re-import samenvatting', {
      dryRun: summary.dryRun,
      restantGtins: summary.gtinsProcessed,
      batches: summary.batches,
      batchSize,
      pauseMs,
      resolved: summary.resolved,
      geenGln: summary.byReason['mediaserver-geen-gln'],
      geenMedia: summary.byReason['mediaserver-geen-media'],
      writes: summary.writes,
      coverageBefore: formatPct(summary.coverageBefore),
      coverageAfter: formatPct(summary.coverageAfter),
      target: '≥90%',
    });

    if (dryRun) {
      logger.info('Plan gereed. Herhaal met --apply om de terugval-route echt uit te voeren.');
    } else {
      logger.info(
        'Klaar. Het dashboard-paneel `glnCoverage` (18.1) toont on-read de bijgewerkte ' +
          'dekking en het definitieve restant met redenen.'
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Alleen draaien als dit bestand het entrypoint is (niet bij import in tests).
if (require.main === module) {
  main().catch((err) => {
    logger.error('GLN-restant-re-import onverwacht gefaald', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    process.exitCode = 1;
  });
}
