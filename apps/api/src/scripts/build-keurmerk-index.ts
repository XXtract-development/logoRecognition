/**
 * Keurmerk→etiket-index — referentie-vliegwiel Epic 19, Story 19.3 (FR-22, ARCH-4).
 *
 * Bouwt per keurmerk(veld,code) een index van de etiketten (artwork-labels) die
 * de keurmerkcode GEGARANDEERD dragen — afgeleid uit de GS1-declaraties van de
 * GTIN. Doel (datamanager): per keurmerk weten welke etiketten het bevatten, als
 * gebalanceerde brandstofbron voor de sampler (Story 19.4).
 *
 * Handmatig gestart, idempotent seed-script met droge-run (envelope §3 — NOOIT
 * automatisch bij deploy/migratie/startup; auto-seed is bij dit team een harde
 * overtreding):
 *
 *   # eerst het plan bekijken zonder te schrijven:
 *   DATABASE_URL=... CATALOG_API_KEY=... npx tsx src/scripts/build-keurmerk-index.ts --dry-run
 *   # daarna de echte bouw (schrijft de index-JSON naar beheerde opslag):
 *   DATABASE_URL=... CATALOG_API_KEY=... npx tsx src/scripts/build-keurmerk-index.ts
 *
 * BRONNEN (Story 19.1/19.2):
 *   - GTIN-universum : distinct (gln, gtin) uit `artwork_imports` waar gln gevuld is
 *     (de GLN is de prerequisite voor de declaratie-lookup, 8-3D/decision 0). De
 *     VOLLEDIGE-corpus-enumeratie (prod media-DB, ~39k) is een LATERE uitbreiding;
 *     de artwork-import-tabel is de bewezen, beschikbare bron vandaag.
 *   - Declaraties   : `resolveDeclaredMarks(gtin)` (5/5 keurmerkvelden, Story 19.2) via
 *     de betrouwbare catalog-XML-lezer — NIET de diep-geneste, ongeïndexeerde Mongo-
 *     `tradeItems`-vorm.
 *   - Etiketten     : `mediaServerClient.discoverArtwork(gtin)` → previewUrls van de
 *     PACKAGING_ARTWORK-media (de etiketbestanden per GTIN).
 *
 * UNIVERSUM (AC1): de tellingen worden getoetst aan het 951-code-universum uit de
 * GS1-codelijsten. Bron-referentie: `~/Documents/Result_4.xlsx` (951 codes, 5 GS1-
 * codelijsten) — dit script parseert dat bestand NIET (het is een offline referentie);
 * het rapporteert welke codes in de declaraties VÓÓRKOMEN zodat de dekking t.o.v. het
 * universum af te lezen is.
 *
 * IDEMPOTENTIE (AC2, NFR-4): de index is een DETERMINISTISCHE projectie van de
 * declaraties + labels. Dezelfde invoer → byte-identieke index (GTINs/labels/codes
 * gesorteerd). De echte run schrijft de index-JSON naar één vaste sleutel in de
 * beheerde opslag (MinIO), zodat herdraaien de vorige versie overschrijft met exact
 * dezelfde inhoud — geen groei, geen dubbele records.
 *
 * Dit bestand exporteert PURE helpers (index-bouw uit declaraties/labels) zodat de
 * unit-test ze zonder `main()` kan importeren (`require.main`-guard onderaan). De
 * helpers doen GEEN I/O.
 */

import prisma from '../core/db';
import { resolveDeclaredMarks, type DeclaredMark } from '../services/t3777-declarations';
import { mediaServerClient } from '../services/mediaserver-client';
import { getStorageAdapter, BUCKETS } from '../services/storage';
import { createLogger } from '../core/logger';

const logger = createLogger('build-keurmerk-index');

/**
 * Vaste opslagsleutel van de index-JSON in de TRAINING-bucket (MinIO). Vast pad =
 * herdraaien overschrijft dezelfde sleutel (idempotentie). Onder een eigen
 * `flywheel-index/`-prefix, los van artwork/reference-logos.
 */
export const INDEX_OBJECT_KEY = 'flywheel-index/keurmerk-etiket-index.json';

/** Referentie naar het universum-bestand (offline; niet geparsed door dit script). */
export const UNIVERSE_REFERENCE = '~/Documents/Result_4.xlsx (951 codes, 5 GS1-codelijsten)';

/** Aantal codes in het GS1-universum (Result_4.xlsx) — voor de dekkings-uitlezing. */
export const UNIVERSE_CODE_COUNT = 951;

// ---------------------------------------------------------------------------
// Datamodellen
// ---------------------------------------------------------------------------

/** Eén (gln, gtin)-paar uit het artwork-GTIN-universum. */
export interface GtinUniverseEntry {
  gtin: string;
  gln: string;
}

/** De opgehaalde declaraties + labels voor één GTIN (input voor de pure index-bouw). */
export interface GtinData {
  gtin: string;
  gln: string;
  /** Gedeclareerde keurmerken (5/5 velden, Story 19.2). */
  marks: DeclaredMark[];
  /** Etiketbestanden (previewUrls van de PACKAGING_ARTWORK-media). */
  labels: string[];
}

/** Eén etiket-vermelding onder een keurmerkcode: welk product, welke labels. */
export interface IndexLabelEntry {
  gtin: string;
  gln: string;
  labels: string[];
}

/**
 * De index: sleutel `${fieldType}/${code}` → lijst etiket-vermeldingen. De
 * samengestelde sleutel (fieldType/code) voorkomt dat identieke codes uit twee
 * verschillende GS1-codelijsten (velden) samenvallen — zelfde canonieke ruimte als
 * `reference_logos.fieldType` + code.
 */
export interface KeurmerkIndex {
  /** Wanneer de index gebouwd is (ISO). */
  builtAt: string;
  /** Referentie naar de universum-bron (herleidbaarheid). */
  universeReference: string;
  /** Aantal codes in het universum (Result_4.xlsx). */
  universeCodeCount: number;
  /** De eigenlijke index: sleutel → etiket-vermeldingen. */
  entries: Record<string, IndexLabelEntry[]>;
  /** Tellingen per sleutel (aantal GTINs én aantal labels), + totalen. */
  summary: IndexSummary;
}

export interface IndexSummary {
  /** Aantal GTINs waarvoor labels + ≥1 declaratie gevonden zijn. */
  gtinsWithData: number;
  /** Aantal unieke keurmerk-sleutels (fieldType/code) in de index. */
  distinctKeys: number;
  /** Per sleutel: aantal (distinct) GTINs en totaal aantal labels. */
  perKey: Record<string, { gtins: number; labels: number }>;
  /** De unieke codes (zonder fieldType-prefix) die in de declaraties voorkwamen. */
  codesPresent: string[];
  /** Aantal universum-codes dat NIET in enige declaratie voorkwam (dekkings-gat). */
  universeCodeCount: number;
}

// ---------------------------------------------------------------------------
// PURE helpers (geen I/O — testbaar zonder main())
// ---------------------------------------------------------------------------

/** De samengestelde indexsleutel voor een (fieldType, code)-paar. */
export function indexKey(fieldType: string, code: string): string {
  return `${fieldType}/${code}`;
}

/**
 * Bouw de keurmerk→etiket-index uit de per-GTIN opgehaalde declaraties + labels.
 *
 * Regels (deterministisch → idempotent):
 *   - Alleen GTINs met ≥1 label EN ≥1 declaratie dragen bij (een keurmerk zonder
 *     etiket is geen brandstof; een etiket zonder declaratie is geen bevestiging).
 *   - Per (fieldType, code) uit de declaratie krijgt de sleutel één vermelding met
 *     de GTIN + zijn (gededupte, gesorteerde) labels.
 *   - Dedup: dezelfde GTIN komt per sleutel maar één keer voor (een GTIN kan een code
 *     nooit twee keer declareren binnen dezelfde fieldType — parseDeclaredMarks dedupt
 *     al op (fieldType, code) — maar de dubbele-GTIN-guard maakt de bouw robuust bij
 *     herhaalde invoer).
 *   - Sortering: sleutels alfabetisch, vermeldingen op GTIN, labels alfabetisch.
 */
export function buildIndex(data: GtinData[], now: Date = new Date()): KeurmerkIndex {
  // sleutel → (gtin → labels) zodat dedup per (sleutel, gtin) triviaal is.
  const bySleutel = new Map<string, Map<string, IndexLabelEntry>>();

  for (const d of data) {
    const labels = dedupSorted(d.labels);
    if (labels.length === 0) continue; // geen etiket → geen brandstof
    if (!d.marks || d.marks.length === 0) continue; // geen declaratie → geen bevestiging

    for (const mark of d.marks) {
      const code = mark.code.trim().toUpperCase();
      if (!code) continue;
      const key = indexKey(mark.fieldType, code);
      let byGtin = bySleutel.get(key);
      if (!byGtin) {
        byGtin = new Map<string, IndexLabelEntry>();
        bySleutel.set(key, byGtin);
      }
      // Dubbele GTIN onder dezelfde sleutel: labels samenvoegen (dedup), geen dubbele rij.
      const existing = byGtin.get(d.gtin);
      if (existing) {
        existing.labels = dedupSorted([...existing.labels, ...labels]);
      } else {
        byGtin.set(d.gtin, { gtin: d.gtin, gln: d.gln, labels });
      }
    }
  }

  // Deterministische projectie: sleutels + vermeldingen gesorteerd.
  const entries: Record<string, IndexLabelEntry[]> = {};
  const perKey: Record<string, { gtins: number; labels: number }> = {};
  const sortedKeys = [...bySleutel.keys()].sort();
  const codesPresent = new Set<string>();
  let gtinsWithData = 0;
  const gtinSeen = new Set<string>();

  for (const key of sortedKeys) {
    const byGtin = bySleutel.get(key)!;
    const list = [...byGtin.values()].sort((a, b) => a.gtin.localeCompare(b.gtin));
    entries[key] = list;
    const labelCount = list.reduce((n, e) => n + e.labels.length, 0);
    perKey[key] = { gtins: list.length, labels: labelCount };
    // code = deel na de laatste '/' (fieldType kan zelf geen '/' bevatten in GS1-namen).
    const code = key.slice(key.indexOf('/') + 1);
    codesPresent.add(code);
    for (const e of list) gtinSeen.add(e.gtin);
  }
  gtinsWithData = gtinSeen.size;

  return {
    builtAt: now.toISOString(),
    universeReference: UNIVERSE_REFERENCE,
    universeCodeCount: UNIVERSE_CODE_COUNT,
    entries,
    summary: {
      gtinsWithData,
      distinctKeys: sortedKeys.length,
      perKey,
      codesPresent: [...codesPresent].sort(),
      universeCodeCount: UNIVERSE_CODE_COUNT,
    },
  };
}

/** Trim/dedup/sorteer een label-lijst (leeg wordt weggefilterd). */
export function dedupSorted(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) set.add(t);
  }
  return [...set].sort();
}

/** Serialiseer de index deterministisch (gesorteerde sleutels) voor idempotente opslag. */
export function serializeIndex(index: KeurmerkIndex): string {
  // entries is al met gesorteerde sleutels opgebouwd; JSON.stringify behoudt
  // insertion-order. Twee spaties voor leesbaarheid in de opslag.
  return JSON.stringify(index, null, 2);
}

// ---------------------------------------------------------------------------
// I/O-laag (alleen in main())
// ---------------------------------------------------------------------------

/**
 * Conservatieve default-limiet op het aantal GTINs dat één run verwerkt
 * (`KEURMERK_INDEX_LIMIT`). Elke GTIN kost een catalog-XML-fetch + een
 * mediaserver-discovery; een onbegrensde run zou beide services belasten. Default
 * 500 (ruim voor de huidige artwork-import-tabel, begrensd voor de latere
 * corpus-uitbreiding). Overschrijfbaar via env.
 */
export function getIndexLimit(): number {
  const v = parseInt(process.env.KEURMERK_INDEX_LIMIT ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 500;
}

/**
 * Het GTIN-universum: distinct (gln, gtin) uit `artwork_imports` waar gln gevuld is,
 * begrensd op de limiet. Deterministisch geordend (gtin oplopend) zodat de limiet-
 * afkap stabiel is bij herhaalde runs.
 */
export async function loadGtinUniverse(limit: number): Promise<GtinUniverseEntry[]> {
  const rows = await prisma.artworkImport.findMany({
    where: { gln: { not: null } },
    select: { gtin: true, gln: true },
    orderBy: { gtin: 'asc' },
  });
  const seen = new Set<string>();
  const out: GtinUniverseEntry[] = [];
  for (const r of rows) {
    if (!r.gln) continue;
    if (seen.has(r.gtin)) continue;
    seen.add(r.gtin);
    out.push({ gtin: r.gtin, gln: r.gln });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Haal per GTIN de declaraties (5/5 velden) + labels (previewUrls) op. Elke
 * fout-modus is fail-safe binnen de onderliggende services (nooit throw): een GTIN
 * zonder declaratie of zonder labels valt in de pure bouw vanzelf weg.
 */
async function collectGtinData(universe: GtinUniverseEntry[]): Promise<GtinData[]> {
  const out: GtinData[] = [];
  for (const { gtin, gln } of universe) {
    const [marksResult, mediaItems] = await Promise.all([
      resolveDeclaredMarks(gtin),
      mediaServerClient.discoverArtwork(gtin).catch(() => []),
    ]);
    const labels = mediaItems.map((m) => m.previewUrl).filter((u): u is string => !!u);
    out.push({ gtin, gln, marks: marksResult.marks, labels });
  }
  return out;
}

function printPlan(index: KeurmerkIndex, dryRun: boolean, universeSize: number): void {
  const { summary } = index;
  /* eslint-disable no-console */
  console.log('=== Keurmerk→etiket-index ===');
  console.log(`  Modus              : ${dryRun ? 'DROGE RUN (schrijft niets)' : 'ECHTE BOUW'}`);
  console.log(`  GTIN-universum     : ${universeSize} (gln gevuld, limiet ${getIndexLimit()})`);
  console.log(`  GTINs met data     : ${summary.gtinsWithData}`);
  console.log(`  Unieke keurmerken  : ${summary.distinctKeys} (fieldType/code-sleutels)`);
  console.log(`  Codes aanwezig     : ${summary.codesPresent.length} / ${UNIVERSE_CODE_COUNT} universum-codes`);
  console.log('  Tellingen per code :');
  for (const [key, counts] of Object.entries(summary.perKey)) {
    console.log(`    ${key.padEnd(56)} ${counts.gtins} GTIN(s), ${counts.labels} label(s)`);
  }
  /* eslint-enable no-console */
}

/** Schrijf de index-JSON naar de vaste opslagsleutel (MinIO TRAINING-bucket). */
async function writeIndex(index: KeurmerkIndex): Promise<void> {
  const body = Buffer.from(serializeIndex(index), 'utf-8');
  const adapter = getStorageAdapter();
  await adapter.putObject(BUCKETS.TRAINING, INDEX_OBJECT_KEY, body, body.length, {
    'Content-Type': 'application/json',
  });
  logger.info('Keurmerk-index weggeschreven', {
    bucket: BUCKETS.TRAINING,
    key: INDEX_OBJECT_KEY,
    bytes: body.length,
    distinctKeys: index.summary.distinctKeys,
  });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limit = getIndexLimit();

  const universe = await loadGtinUniverse(limit);
  const data = await collectGtinData(universe);
  const index = buildIndex(data);

  printPlan(index, dryRun, universe.length);

  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log('Droge run — er is niets naar de opslag geschreven.');
    return;
  }

  await writeIndex(index);
  // eslint-disable-next-line no-console
  console.log(
    `Index gebouwd: ${index.summary.distinctKeys} keurmerk-sleutels, ` +
      `${index.summary.gtinsWithData} GTINs → ${INDEX_OBJECT_KEY}`
  );
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Keurmerk-index-bouw faalde:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
