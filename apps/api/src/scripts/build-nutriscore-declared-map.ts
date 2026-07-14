/**
 * Nutri-Score-declaratie-map — Story 12.15 (declaratie-gedreven Nutri-Score-oogst).
 *
 * Bouwt een GTIN -> gedeclareerde-Nutri-Score-letter map (A-E) uit de bestaande
 * `resolveDeclaredMarks` (Story 12.7) — bouwt GEEN nieuw catalogus-uitleespad.
 * Gefilterd op fieldType `NutritionalScore` EN een exacte kale letter A-E: de
 * deployed `parseDeclaredMarks`-regex prefix-matcht ook
 * `nutritionalScoreProductCategoryCode` (categorie-codes zoals GENERAL_FOODS/
 * CHEESES lekken onder fieldType NutritionalScore — zie
 * `t3777-declarations.ts` MARK_FIELDS-docblock) — dit script verwerpt die hard
 * (de 12.7-regex-leak-guard). Deze story wijzigt de 12.7-parser zelf NIET; de
 * bredere fix is een losse follow-up.
 *
 * De map wordt geschreven naar een vaste MinIO-sleutel (TRAINING-bucket) zodat
 * de ml-service-oogst (`queue_harvest_nutriscore_declared.py`) hem kan lezen
 * via `storage_service.get_training_image` — dezelfde taalgrens-oversteek als
 * `VOLUME_INDEX_KEY` (Story 19.10) en `INDEX_OBJECT_KEY`
 * (`build-keurmerk-index.ts`, Story 19.3), waarvan dit script het patroon
 * (pure-core / injecteerbare deps / require.main-CLI-guard) rechtstreeks volgt.
 *
 * Architectuurkeuze (story Task 1 — "kies de aanpak met de minste
 * duplicatie"): `resolveDeclaredMarks` (Prisma-gln-lookup + Redis-cache +
 * catalog-XML-fetch) bestaat ALLEEN TS-side (apps/api); de vorm-detectie/crop
 * (region-proposer, embedding, pgvector-nearest-match) bestaat ALLEEN
 * ml-service-side (Python). Een vooraf-berekende GTIN->letter-map (deze
 * TS-stap, optie B uit de story) + een Python-oogst die de map leest heeft de
 * minste duplicatie: het alternatief (optie A, API-side orkestratie die per
 * GTIN een crop-detectie bij ml-service opvraagt) zou ofwel een nieuw
 * HTTP-crop-endpoint vergen (extra oppervlak, geen precedent) ofwel de
 * vorm-detectie in TS herbouwen (dubbele implementatie van iets dat al in
 * Python bestaat, Story 12.12). Optie B hergebruikt beide bouwstenen ONGEWIJZIGD
 * en voegt alleen een smalle, pure koppel-laag toe.
 *
 * Handmatig gestart, idempotent (vaste sleutel, herdraaien overschrijft met
 * dezelfde-vorm output), droge-run default UIT (--dry-run slaat de MinIO-write
 * over, net als build-keurmerk-index.ts) — NOOIT automatisch bij deploy/
 * migratie/startup (operationele envelope §3, ARCH-4).
 *
 *   DATABASE_URL=... CATALOG_API_KEY=... npx tsx src/scripts/build-nutriscore-declared-map.ts --dry-run
 *   DATABASE_URL=... CATALOG_API_KEY=... npx tsx src/scripts/build-nutriscore-declared-map.ts
 *
 * Dit bestand exporteert PURE helpers (classificatie + map-bouw) zodat de
 * unit-tests ze zonder `main()` kunnen importeren (`require.main`-guard
 * onderaan). De helpers doen GEEN I/O.
 */

import prisma from '../core/db';
import { resolveDeclaredMarks, type DeclaredMark } from '../services/t3777-declarations';
import { getStorageAdapter, BUCKETS } from '../services/storage';
import { createLogger } from '../core/logger';

const logger = createLogger('build-nutriscore-declared-map');

/** Vaste opslagsleutel in de TRAINING-bucket (MinIO) — precedent VOLUME_INDEX_KEY/INDEX_OBJECT_KEY. */
export const DECLARED_MAP_OBJECT_KEY = 'flywheel-index/nutriscore-declared-map.json';

/** De 5 geldige Nutri-Score-letters (kale, enkele karakters — de leak-guard). */
const VALID_LETTERS = new Set(['A', 'B', 'C', 'D', 'E']);

/** Story-scope: C/D eerst (AC2); A/B/E optioneel om te versterken. */
export const PRIORITY_LETTERS = ['C', 'D'] as const;

// ---------------------------------------------------------------------------
// Datamodellen
// ---------------------------------------------------------------------------

/** Uitkomst van de classificatie van één GTIN's gedeclareerde marks. */
export type LetterOutcome =
  | { kind: 'resolved'; letter: string }
  | { kind: 'geen-declaratie' }
  | { kind: 'ambigu'; letters: string[] }
  | { kind: 'fout'; error: string };

export interface GtinLetterResult {
  gtin: string;
  outcome: LetterOutcome;
}

export interface DeclaredMapSummary {
  gtinsProcessed: number;
  resolved: number;
  geenDeclaratie: number;
  ambigu: number;
  /** GTINs waarvoor de lookup zelf faalde (code-review-bevinding: nooit de
   * hele ~2000-GTIN-run laten afbreken op één falende lookup). */
  fout: number;
  perLetter: Record<string, number>;
}

export interface DeclaredMapResult {
  builtAt: string;
  /** gtin -> gedeclareerde letter (A-E), alleen ondubbelzinnig-resolved GTINs. */
  entries: Record<string, string>;
  summary: DeclaredMapSummary;
}

// ---------------------------------------------------------------------------
// PURE helpers (geen I/O — testbaar zonder main())
// ---------------------------------------------------------------------------

/**
 * Classificeer de gedeclareerde Nutri-Score-letter uit de marks van één GTIN.
 * Filtert hard op fieldType `NutritionalScore` EN een kale, enkele letter A-E
 * (uppercased) — verwerpt categorie-codes (GENERAL_FOODS/CHEESES/...) die via
 * de 12.7-regex-leak onder dezelfde fieldType meelekken (het zijn geen
 * één-letter-waarden, dus ze falen de lengte-1-check hieronder vanzelf).
 *
 * >1 DISTINCTE letter voor dezelfde GTIN -> `ambigu` (nooit gokken, AC3-geest:
 * geen fabricatie van een label bij tegenstrijdige input).
 */
export function classifyDeclaredLetter(marks: DeclaredMark[]): LetterOutcome {
  const letters = new Set<string>();
  for (const m of marks) {
    if (m.fieldType !== 'NutritionalScore') continue;
    const code = m.code.trim().toUpperCase();
    if (code.length === 1 && VALID_LETTERS.has(code)) {
      letters.add(code);
    }
  }
  if (letters.size === 0) return { kind: 'geen-declaratie' };
  if (letters.size > 1) return { kind: 'ambigu', letters: [...letters].sort() };
  return { kind: 'resolved', letter: [...letters][0] };
}

/**
 * Bouw de deterministische GTIN->letter map + samenvatting uit de per-GTIN
 * classificatie-resultaten. Puur: geen I/O. Sortering (gtin oplopend) maakt de
 * serialisatie idempotent (zelfde invoer -> byte-identieke output), net als
 * `build-keurmerk-index.ts`.
 */
export function buildDeclaredMap(results: GtinLetterResult[], now: Date = new Date()): DeclaredMapResult {
  const entries: Record<string, string> = {};
  const perLetter: Record<string, number> = {};
  let geenDeclaratie = 0;
  let ambigu = 0;
  let fout = 0;

  const sorted = [...results].sort((a, b) => a.gtin.localeCompare(b.gtin));
  for (const { gtin, outcome } of sorted) {
    if (outcome.kind === 'geen-declaratie') {
      geenDeclaratie += 1;
      continue;
    }
    if (outcome.kind === 'fout') {
      fout += 1;
      logger.warn('Nutri-Score-declaratie-lookup gefaald — GTIN overgeslagen (geen gok)', {
        gtin,
        error: outcome.error,
      });
      continue;
    }
    if (outcome.kind === 'ambigu') {
      ambigu += 1;
      logger.warn('Ambigue Nutri-Score-declaratie — GTIN overgeslagen (geen gok)', {
        gtin,
        letters: outcome.letters,
      });
      continue;
    }
    entries[gtin] = outcome.letter;
    perLetter[outcome.letter] = (perLetter[outcome.letter] ?? 0) + 1;
  }

  return {
    builtAt: now.toISOString(),
    entries,
    summary: {
      gtinsProcessed: results.length,
      resolved: Object.keys(entries).length,
      geenDeclaratie,
      ambigu,
      fout,
      perLetter,
    },
  };
}

/** Serialiseer deterministisch (gesorteerde entries-sleutels) voor idempotente opslag. */
export function serializeDeclaredMap(result: DeclaredMapResult): string {
  const sortedEntries: Record<string, string> = {};
  for (const gtin of Object.keys(result.entries).sort()) {
    sortedEntries[gtin] = result.entries[gtin];
  }
  return JSON.stringify({ ...result, entries: sortedEntries }, null, 2);
}

// ---------------------------------------------------------------------------
// Injecteerbare afhankelijkheden (mockbaar in tests — nooit prod in tests).
// ---------------------------------------------------------------------------

export interface DeclaredMapDeps {
  /** Unieke artwork-GTINs met een gevulde GLN (prerequisite voor de declaratie-lookup). */
  listGtins: () => Promise<string[]>;
  /** Gedeclareerde marks per GTIN (via resolveDeclaredMarks). */
  resolveMarks: (gtin: string) => Promise<DeclaredMark[]>;
}

/**
 * Orkestreer de per-GTIN classificatie sequentieel (klein universum, ~1.9k
 * GTINs — geen batch-state nodig).
 *
 * `resolveDeclaredMarks` zelf is fail-safe (nooit een throw — elke fout geeft
 * `{marks: [], reason}`), maar `deps.resolveMarks` is een geïnjecteerde
 * afhankelijkheid: een onverwachte fout daarin (of in een toekomstige andere
 * implementatie van `DeclaredMapDeps`) mag NOOIT de hele ~2000-GTIN-run laten
 * afbreken zonder enige output (code-review-bevinding, Story 12.15) — één
 * flaky lookup zou anders alle al-succesvol-geresolvede GTINs weggooien. Elke
 * GTIN wordt daarom individueel gevangen; een fout klassificeert als `fout`
 * (nooit gegokt, telt apart in de samenvatting) en de run gaat door.
 */
export async function collectDeclaredMap(deps: DeclaredMapDeps, now: Date = new Date()): Promise<DeclaredMapResult> {
  const gtins = await deps.listGtins();
  const results: GtinLetterResult[] = [];
  for (const gtin of gtins) {
    let outcome: LetterOutcome;
    try {
      const marks = await deps.resolveMarks(gtin);
      outcome = classifyDeclaredLetter(marks);
    } catch (err) {
      outcome = { kind: 'fout', error: err instanceof Error ? err.message : 'unknown' };
    }
    results.push({ gtin, outcome });
  }
  return buildDeclaredMap(results, now);
}

// ---------------------------------------------------------------------------
// Echte I/O-deps (alleen gebruikt door de CLI-entrypoint; nooit in tests).
// ---------------------------------------------------------------------------

/**
 * Conservatieve default-limiet op het aantal GTINs dat één run verwerkt
 * (elke GTIN kost een catalog-XML-fetch, gecached). Overschrijfbaar via env.
 * Default 2000 (ruim voor het huidige artwork-GTIN-universum, ~1.862 — zie
 * `nutriscore-declaratie-dekking-index-2026-07-13.md`).
 */
export function getGtinLimit(): number {
  const v = parseInt(process.env.NUTRISCORE_DECLARED_MAP_LIMIT ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 2000;
}

async function loadArtworkGtins(limit: number): Promise<string[]> {
  const rows = await prisma.artworkImport.findMany({
    where: { gln: { not: null } },
    distinct: ['gtin'],
    select: { gtin: true },
    orderBy: { gtin: 'asc' },
  });
  return rows.map((r) => r.gtin).slice(0, limit);
}

function createProdDeps(limit: number): DeclaredMapDeps {
  return {
    listGtins: () => loadArtworkGtins(limit),
    resolveMarks: async (gtin: string) => {
      const { marks } = await resolveDeclaredMarks(gtin);
      return marks;
    },
  };
}

function printPlan(result: DeclaredMapResult, dryRun: boolean): void {
  const { summary } = result;
  /* eslint-disable no-console */
  console.log('=== Nutri-Score-declaratie-map ===');
  console.log(`  Modus              : ${dryRun ? 'DROGE RUN (schrijft niets)' : 'ECHTE BOUW'}`);
  console.log(`  GTINs verwerkt     : ${summary.gtinsProcessed}`);
  console.log(`  Resolved (A-E)     : ${summary.resolved}`);
  console.log(`  Geen declaratie    : ${summary.geenDeclaratie}`);
  console.log(`  Ambigu (overgeslagen): ${summary.ambigu}`);
  console.log(`  Fout (overgeslagen): ${summary.fout}`);
  console.log('  Per letter         :');
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    const n = summary.perLetter[letter] ?? 0;
    const prio = (PRIORITY_LETTERS as readonly string[]).includes(letter) ? ' (prioriteit)' : '';
    console.log(`    ${letter}${prio.padEnd(14)} ${n}`);
  }
  /* eslint-enable no-console */
}

async function writeDeclaredMap(result: DeclaredMapResult): Promise<void> {
  const body = Buffer.from(serializeDeclaredMap(result), 'utf-8');
  const adapter = getStorageAdapter();
  await adapter.putObject(BUCKETS.TRAINING, DECLARED_MAP_OBJECT_KEY, body, body.length, {
    'Content-Type': 'application/json',
  });
  logger.info('Nutri-Score-declaratie-map weggeschreven', {
    bucket: BUCKETS.TRAINING,
    key: DECLARED_MAP_OBJECT_KEY,
    bytes: body.length,
    resolved: result.summary.resolved,
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limit = getGtinLimit();

  // Eén GTIN-ophaal via de geïnjecteerde deps (collectDeclaredMap) — dezelfde
  // orkestratie als de tests, geen dubbele/losstaande main()-only kopie.
  const deps: DeclaredMapDeps = createProdDeps(limit);
  const result = await collectDeclaredMap(deps);

  printPlan(result, dryRun);

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log('Droge run — er is niets naar de opslag geschreven.');
    return;
  }

  await writeDeclaredMap(result);
  // eslint-disable-next-line no-console
  console.log(
    `Map gebouwd: ${result.summary.resolved} GTINs met een resolved letter -> ${DECLARED_MAP_OBJECT_KEY}`
  );
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Nutri-Score-declaratie-map-bouw faalde:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
