/**
 * Story 18.1 — GLN-backfill via batch-export (FR-21, AD-7 route (a)).
 *
 * Eenmalig, HANDMATIG gestart, idempotent script met `--dry-run` (default). Het
 * leidt per uniek GTIN (van de `artwork_imports`-records zónder GLN) de GLN af uit
 * de prod-MongoDB `application.tradeItems` (`_id` = `{gln}-{gtin}-{targetMarket}`,
 * TM 528 — zelfde conventie als t3777-declarations.ts) en vult
 * `artwork_imports.gln`. Records zonder vaststelbare GLN krijgen een gemarkeerde
 * uitvalreden in `glnBackfillReason` (geen stille uitval).
 *
 * NOOIT automatisch bij deploy of migratie (operationele envelope §3, ARCH-4). De
 * echte read-only prod-export is een aparte, door de mens afgetrapte operationele
 * stap; governance-akkoord is gegeven op 2026-07-04 (AC1, ARCH-8).
 *
 * Randvoorwaarden:
 *   - READ-ONLY op prod-Mongo, off-peak; `_id`/GLN per GTIN, geen mutaties.
 *   - Nooit een bestaande niet-lege GLN overschrijven (zelfde regel als de
 *     8-3O-upsert "Never clobber a previously stored gln").
 *   - Bij >1 GLN voor TM 528: NIET gokken → uitvalreden `meerdere-glns`.
 *   - `--dry-run` schrijft NIETS (geen PG, geen Redis) — toont alleen het plan.
 *   - Herdraaien voegt niets toe (alleen `gln IS NULL`-records worden aangeraakt).
 *
 * Verbindingsgegevens komen uit env (`TRADEITEMS_MONGO_URI`), nooit hardcoded of
 * gecommit. De `mongodb`-driver wordt LAZY (dynamisch) geïmporteerd zodat de
 * kernlogica testbaar is zonder de driver en dry-run/tests hem nooit nodig hebben.
 *
 * Usage:
 *   # veilig plan (default), schrijft niets:
 *   TRADEITEMS_MONGO_URI=... npx tsx scripts/backfill-gln-from-tradeitems.ts --dry-run
 *   # echte run (schrijft PG + warmt Redis):
 *   TRADEITEMS_MONGO_URI=... CATALOG_API_KEY=... npx tsx scripts/backfill-gln-from-tradeitems.ts --apply
 *   # zonder declaratie-preload:
 *   ... --apply --skip-preload
 */

import prisma from '../src/core/db';
import { createLogger } from '../src/core/logger';

const logger = createLogger('backfill-gln');

/** Target market van de tradeItems-sleutel (zelfde conventie als t3777). */
const TARGET_MARKET = process.env.T3777_TARGET_MARKET || '528';

/** Uitvalredenen (ruimte voor extra redenen; 18.2 kan `mediaserver-restant` toevoegen). */
export type BackfillReason = 'geen-tradeitem' | 'meerdere-glns';

/** Uitkomst per GTIN (het "plan" — puur, geen writes). */
export type GtinOutcome =
  | { gtin: string; kind: 'vulbaar'; gln: string }
  | { gtin: string; kind: 'uitval'; reason: BackfillReason };

/** Samenvatting van een plan- of apply-run. */
export interface BackfillSummary {
  /** Aantal unieke GTINs zonder GLN dat verwerkt is. */
  gtinsProcessed: number;
  /** GTINs waarvoor een GLN is vastgesteld. */
  fillable: number;
  /** Uitval per reden. */
  byReason: Record<BackfillReason, number>;
  /** Dekkingsgraad vóór de run (fractie records-met-GLN). */
  coverageBefore: number | null;
  /**
   * Verwachte dekkingsgraad ná de run (fractie). Bij dry-run is dit de projectie;
   * bij apply de daadwerkelijk gemeten waarde.
   */
  coverageAfter: number | null;
  /** Aantal PG-updates dat is uitgevoerd (0 bij dry-run). */
  writes: number;
  /** Aantal declaraties dat is voorgewarmd (0 bij dry-run of --skip-preload). */
  preloaded: number;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// PURE KERN — geen I/O, volledig testbaar.
// ---------------------------------------------------------------------------

/**
 * Parse de GLN uit een tradeItems-`_id` van de vorm `{gln}-{gtin}-{tm}`, gegeven
 * de bekende gtin en tm. Robuust tegen GLN's met koppeltekens: we ankeren op het
 * `-{gtin}-{tm}`-achtervoegsel in plaats van naïef op '-' te splitsen.
 *
 * Retourneert de GLN (niet-lege prefix) of `null` als het id niet matcht of de
 * prefix leeg is.
 */
export function parseGlnFromId(id: string, gtin: string, tm: string): string | null {
  const suffix = `-${gtin}-${tm}`;
  if (!id.endsWith(suffix)) return null;
  const gln = id.slice(0, id.length - suffix.length);
  return gln.length > 0 ? gln : null;
}

/**
 * Bepaal de uitkomst voor één GTIN uit de verzameling kandidaat-GLN's die de
 * tradeItems-bron voor TM 528 opleverde. Nul → `geen-tradeitem`; precies één →
 * vulbaar; meer dan één DISTINCTE GLN → `meerdere-glns` (niet gokken).
 */
export function decideOutcome(gtin: string, candidateGlns: string[]): GtinOutcome {
  const distinct = [...new Set(candidateGlns.filter((g) => g && g.length > 0))];
  if (distinct.length === 0) return { gtin, kind: 'uitval', reason: 'geen-tradeitem' };
  if (distinct.length > 1) return { gtin, kind: 'uitval', reason: 'meerdere-glns' };
  return { gtin, kind: 'vulbaar', gln: distinct[0] };
}

/** Lege uitval-teller. */
function emptyByReason(): Record<BackfillReason, number> {
  return { 'geen-tradeitem': 0, 'meerdere-glns': 0 };
}

/**
 * Projecteer de samenvatting uit de per-GTIN-uitkomsten + de dekkingsgraad-cijfers.
 * Puur: geen I/O. `writes`/`preloaded` worden door de caller ingevuld.
 */
export function summarize(
  outcomes: GtinOutcome[],
  totals: { total: number; withGlnBefore: number },
  dryRun: boolean
): Omit<BackfillSummary, 'writes' | 'preloaded'> {
  const byReason = emptyByReason();
  let fillable = 0;
  for (const o of outcomes) {
    if (o.kind === 'vulbaar') fillable += 1;
    else byReason[o.reason] += 1;
  }
  const coverageBefore = totals.total === 0 ? null : totals.withGlnBefore / totals.total;
  const coverageAfter =
    totals.total === 0 ? null : (totals.withGlnBefore + fillable) / totals.total;
  return {
    gtinsProcessed: outcomes.length,
    fillable,
    byReason,
    coverageBefore,
    coverageAfter,
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// Injecteerbare afhankelijkheden (mockbaar in tests — nooit prod in tests).
// ---------------------------------------------------------------------------

/** Levert de kandidaat-GLN's voor een GTIN (uit tradeItems, TM 528). */
export type GlnLookup = (gtin: string) => Promise<string[]>;

/** Deps die de orkestratie injecteert; tests geven mocks, prod de echte I/O. */
export interface BackfillDeps {
  /** Unieke GTINs van de `gln IS NULL`-records. */
  listNullGlnGtins: () => Promise<string[]>;
  /** Totaal-tellingen voor de dekkingsgraad. */
  coverageTotals: () => Promise<{ total: number; withGln: number }>;
  /** GLN-bron (tradeItems). */
  lookupGlns: GlnLookup;
  /** PG-update van één GTIN → GLN (alleen `gln IS NULL`-rijen). Retourneert #rijen. */
  fillGln: (gtin: string, gln: string) => Promise<number>;
  /** PG-update van de uitvalreden voor een GTIN (alleen `gln IS NULL`-rijen). */
  markReason: (gtin: string, reason: BackfillReason) => Promise<number>;
  /** Declaratie-preload voor een (gevulde) GTIN; retourneert of het lukte. */
  preload?: (gtin: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Orkestratie — dry-run doet GEEN enkele write/preload.
// ---------------------------------------------------------------------------

export interface RunOptions {
  dryRun: boolean;
  skipPreload: boolean;
}

/**
 * Kern-orkestratie. Bepaalt per GTIN de uitkomst, en (alleen bij apply) schrijft
 * die weg + warmt de declaraties. Bij `dryRun` wordt NOOIT `fillGln`, `markReason`
 * of `preload` aangeroepen — nul writes, nul preloads (expliciet getest).
 */
export async function runBackfill(deps: BackfillDeps, opts: RunOptions): Promise<BackfillSummary> {
  const gtins = await deps.listNullGlnGtins();
  const before = await deps.coverageTotals();

  const outcomes: GtinOutcome[] = [];
  let writes = 0;
  let preloaded = 0;

  for (const gtin of gtins) {
    const candidateGlns = await deps.lookupGlns(gtin);
    const outcome = decideOutcome(gtin, candidateGlns);
    outcomes.push(outcome);

    if (opts.dryRun) continue; // dry-run: nul writes, nul preloads.

    if (outcome.kind === 'vulbaar') {
      writes += await deps.fillGln(gtin, outcome.gln);
      if (!opts.skipPreload && deps.preload) {
        const ok = await deps.preload(gtin).catch(() => false);
        if (ok) preloaded += 1;
      }
    } else {
      writes += await deps.markReason(gtin, outcome.reason);
    }
  }

  const base = summarize(outcomes, { total: before.total, withGlnBefore: before.withGln }, opts.dryRun);

  // Bij apply: meet de dekkingsgraad opnieuw (bevestigt de projectie); bij dry-run
  // blijft de projectie staan.
  let coverageAfter = base.coverageAfter;
  if (!opts.dryRun) {
    const after = await deps.coverageTotals();
    coverageAfter = after.total === 0 ? null : after.withGln / after.total;
  }

  return { ...base, coverageAfter, writes, preloaded };
}

// ---------------------------------------------------------------------------
// Echte I/O-deps (alleen gebruikt door de CLI-entrypoint; nooit in tests).
// ---------------------------------------------------------------------------

/**
 * Bouw een `GlnLookup` bovenop de prod-MongoDB. De `mongodb`-driver wordt LAZY
 * dynamisch geïmporteerd: importeer dit alleen op de uitvoerende machine met de
 * driver + `TRADEITEMS_MONGO_URI` gezet. Read-only: alleen een `find` op `_id`.
 */
export async function createMongoGlnLookup(uri: string, tm: string): Promise<{
  lookup: GlnLookup;
  close: () => Promise<void>;
}> {
  // Lazy/dynamische import zodat de driver geen harde build-/test-dependency is.
  const { MongoClient } = (await import('mongodb')) as typeof import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const collection = client.db('application').collection('tradeItems');

  const lookup: GlnLookup = async (gtin: string) => {
    // Read-only: alle tradeItems waarvan `_id` op `-{gtin}-{tm}` eindigt.
    const suffix = `-${gtin}-${tm}`;
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cursor = collection.find(
      { _id: { $regex: `${escaped}$` } as unknown as string },
      { projection: { _id: 1 } }
    );
    const glns: string[] = [];
    for await (const doc of cursor) {
      const gln = parseGlnFromId(String((doc as { _id: unknown })._id), gtin, tm);
      if (gln) glns.push(gln);
    }
    return glns;
  };

  return { lookup, close: () => client.close() };
}

/** Prod-deps rondom Prisma + de declaratie-provider (alleen in de echte run). */
function createProdDeps(lookup: GlnLookup): BackfillDeps {
  return {
    listNullGlnGtins: async () => {
      const rows = await prisma.artworkImport.findMany({
        where: { gln: null },
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
    lookupGlns: lookup,
    fillGln: async (gtin, gln) => {
      // Nooit een bestaande niet-lege GLN overschrijven: filter op `gln: null`.
      // Tegelijk een eerder gezette uitvalreden opruimen nu er wél een GLN is.
      const res = await prisma.artworkImport.updateMany({
        where: { gtin, gln: null },
        data: { gln, glnBackfillReason: null },
      });
      return res.count;
    },
    markReason: async (gtin, reason) => {
      const res = await prisma.artworkImport.updateMany({
        where: { gtin, gln: null },
        data: { glnBackfillReason: reason },
      });
      return res.count;
    },
    preload: async (gtin) => {
      // Warmt de declaratie-cache via de bestaande provider (gln-lookup → cache →
      // catalog → cache-write). Fail-safe: nooit crashen, reason wordt intern gelogd.
      const { resolveDeclarations } = await import('../src/services/t3777-declarations');
      const { reason } = await resolveDeclarations(gtin);
      return reason === 'ok';
    },
  };
}

// ---------------------------------------------------------------------------
// CLI-entrypoint.
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): RunOptions {
  const has = (flag: string) => argv.includes(flag);
  // Default = dry-run (veilig). `--apply` is nodig om echt te schrijven.
  const apply = has('--apply');
  const dryRun = has('--dry-run') || !apply;
  return { dryRun, skipPreload: has('--skip-preload') };
}

function formatPct(v: number | null): string {
  return v === null ? 'n.v.t. (lege tabel)' : `${(v * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  logger.info('GLN-backfill gestart', { dryRun: opts.dryRun, skipPreload: opts.skipPreload });
  if (opts.dryRun) {
    logger.info('DRY-RUN: er wordt NIETS geschreven (geen PostgreSQL, geen Redis) — alleen het plan.');
  }

  const uri = process.env.TRADEITEMS_MONGO_URI;
  if (!uri) {
    logger.error('TRADEITEMS_MONGO_URI ontbreekt — zet de read-only prod-Mongo-URI in de omgeving.');
    process.exitCode = 1;
    return;
  }

  const { lookup, close } = await createMongoGlnLookup(uri, TARGET_MARKET);
  try {
    const deps = createProdDeps(lookup);
    const summary = await runBackfill(deps, opts);

    logger.info('GLN-backfill samenvatting', {
      dryRun: summary.dryRun,
      gtinsProcessed: summary.gtinsProcessed,
      fillable: summary.fillable,
      geenTradeitem: summary.byReason['geen-tradeitem'],
      meerdereGlns: summary.byReason['meerdere-glns'],
      writes: summary.writes,
      preloaded: summary.preloaded,
      coverageBefore: formatPct(summary.coverageBefore),
      coverageAfter: formatPct(summary.coverageAfter),
      target: '≥90%',
    });

    if (opts.dryRun) {
      logger.info('Plan gereed. Herhaal met --apply om de backfill echt uit te voeren.');
    } else if (!opts.skipPreload) {
      logger.info(
        'Let op: de Redis-preload is een WARME start, geen permanente cache ' +
          `(TTL ${process.env.T3777_CACHE_TTL_S || '86400'}s).`
      );
    }
  } finally {
    await close();
    await prisma.$disconnect();
  }
}

// Alleen draaien als dit bestand het entrypoint is (niet bij import in tests).
if (require.main === module) {
  main().catch((err) => {
    logger.error('GLN-backfill onverwacht gefaald', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    process.exitCode = 1;
  });
}
