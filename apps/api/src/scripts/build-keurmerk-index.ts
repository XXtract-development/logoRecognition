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
import {
  resolveDeclaredMarks,
  catalogEnvTag,
  catalogFetchRetries,
  marksCacheStats,
  snapshotStats,
  snapshotAgeDays,
  SNAPSHOT_MAX_AGE_DAYS,
  type DeclaredMark,
} from '../services/t3777-declarations';
import { TRADEITEM_SNAPSHOT_META } from '../services/tradeitem-declaration-snapshot';
import { mediaServerClient } from '../services/mediaserver-client';
import { getStorageAdapter, BUCKETS, downloadTrainingObject } from '../services/storage';
import { closeRedisConnection } from '../services/pipeline/queue';
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
  /**
   * Story 19.16 — op WELKE declaratiebron is deze index gebouwd (host-tag, bv.
   * `stage` of `acc`). Besluit 2026-07-25: we bouwen op stage-declaraties omdat de
   * ACC-catalog niets teruggeeft. Zonder deze vermelding is later niet herleidbaar
   * welke bron aan een index ten grondslag lag. Optioneel: indexen van vóór 19.16
   * missen het veld.
   */
  declarationSource?: string;
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
export function buildIndex(
  data: GtinData[],
  now: Date = new Date(),
  declarationSource?: string
): KeurmerkIndex {
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
    ...(declarationSource ? { declarationSource } : {}),
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
export interface GtinUniverse {
  /** De (mogelijk door de limiet afgekapte) lijst die deze run verwerkt. */
  entries: GtinUniverseEntry[];
  /**
   * Het VOLLEDIGE aantal unieke GTINs met gevulde gln, vóór de limiet. Story 19.16:
   * zonder dit getal was de afkap door `KEURMERK_INDEX_LIMIT` onzichtbaar voor de
   * kwaliteitspoort — een run over 500 van 1862 GTINs meldde zich als "volledig",
   * passeerde 7d én 7c (500 GTINs leveren ruim meer dan de 32 bestaande sleutels)
   * en overschreef de goede index met exitcode 0. Precies het gat waarvoor 7d
   * bestaat, maar binnengekomen via de limiet.
   */
  total: number;
  /** Aantal GTINs dat door de limiet buiten deze run valt. */
  truncated: number;
}

export async function loadGtinUniverse(limit: number): Promise<GtinUniverse> {
  const rows = await prisma.artworkImport.findMany({
    where: { gln: { not: null } },
    select: { gtin: true, gln: true },
    orderBy: { gtin: 'asc' },
  });
  const seen = new Set<string>();
  const all: GtinUniverseEntry[] = [];
  for (const r of rows) {
    if (!r.gln) continue;
    if (seen.has(r.gtin)) continue;
    seen.add(r.gtin);
    all.push({ gtin: r.gtin, gln: r.gln });
  }
  const entries = all.slice(0, limit);
  return { entries, total: all.length, truncated: all.length - entries.length };
}

/** Story 19.16 — env-instellingen voor budget, parallellisme en voortgang. */
function envInt(name: string, fallback: number, max?: number): number {
  const v = parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return max ? Math.min(v, max) : v;
}
export const getGtinTimeoutMs = (): number => envInt('KEURMERK_INDEX_GTIN_TIMEOUT_MS', 30_000);
export const getConcurrency = (): number => envInt('KEURMERK_INDEX_CONCURRENCY', 3, 8);
export const getMaxRuntimeMs = (): number => envInt('KEURMERK_INDEX_MAX_RUNTIME_MS', 20 * 60_000);
export const getProgressEvery = (): number => envInt('KEURMERK_INDEX_PROGRESS_EVERY', 25);
export const getMaxErrorRate = (): number => {
  const v = parseFloat(process.env.KEURMERK_INDEX_MAX_ERROR_RATE ?? '');
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.05;
};

/**
 * Waarom een GTIN wel/niet bijdroeg. `ok`/`404`/`lege-declaratie` horen bij het
 * normale beeld; `api-fout`/`timeout` zijn TECHNISCHE fouten (AC7b) en
 * `niet-verwerkt` betekent dat de deadline toesloeg vóór deze GTIN (AC7d).
 */
export type CollectReason =
  | 'ok'
  | '404'
  | 'geen-tradeitem-bestand'
  | 'lege-declaratie'
  | 'api-fout'
  | 'timeout'
  | 'api-key-ontbreekt'
  | 'gln-ontbreekt'
  | 'niet-verwerkt'
  // Story 20.19 (AC2/AC7): declaratie uit de bevroren momentopname. Hoort bij het
  // NORMALE beeld en valt buiten `technical` (AC7b), net als 404 en lege-declaratie.
  | 'uit-momentopname';

export type ReasonCounts = Record<CollectReason, number>;

export function emptyReasonCounts(): ReasonCounts {
  return {
    ok: 0,
    '404': 0,
    'geen-tradeitem-bestand': 0,
    'lege-declaratie': 0,
    'api-fout': 0,
    timeout: 0,
    'api-key-ontbreekt': 0,
    'gln-ontbreekt': 0,
    'niet-verwerkt': 0,
    'uit-momentopname': 0,
  };
}

export interface CollectOutcome {
  data: GtinData[];
  reasons: ReasonCounts;
  /** True zodra de globale deadline (AC9) de run heeft afgekapt. */
  deadlineHit: boolean;
}

/** Map de reden van de declaratielaag naar onze telling. */
function mapDeclarationReason(reason: string): CollectReason {
  switch (reason) {
    case 'ok':
      return 'ok';
    case '404-mogelijk-TM-mismatch':
      return '404';
    case 'geen-tradeitem-bestand':
      // Normaal beeld, GEEN technische fout: het product heeft simpelweg geen
      // trade-item-bestand in de catalog.
      return 'geen-tradeitem-bestand';
    case 'lege-declaratie':
      return 'lege-declaratie';
    case 'uit-momentopname':
      // Story 20.19 (AC7): EXPLICIET, niet via `default`. Die geeft `api-fout`, en
      // met 442 van 1870 producten (23,7%) tegen een drempel van 5% zou de
      // kwaliteitspoort van deze bouwer omvallen op een normale uitkomst.
      return 'uit-momentopname';
    case 'api-key-ontbreekt':
      return 'api-key-ontbreekt';
    case 'gln-ontbreekt':
      return 'gln-ontbreekt';
    default:
      return 'api-fout';
  }
}

/** Verstrijkt het budget vóór `p`, dan wint deze race met een `timeout`-uitkomst. */
function withBudget<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      }
    );
  });
}

/**
 * Haal per GTIN de declaraties (5/5 velden) + labels (previewUrls) op.
 *
 * Story 19.16:
 *  - **AC2** elke GTIN krijgt een TOTAALBUDGET. De onderliggende services hebben
 *    weliswaar eigen timeouts, maar niet alles viel daarbinnen (body-read) en
 *    ioredis-commando's rejecteren met `maxRetriesPerRequest: null` nooit. Eén
 *    `Promise.race` per GTIN dekt álle stappen, ongeacht waar het blijft hangen.
 *  - **AC9** begrensde parallellisatie (chunked, zoals artwork-pipeline) + een
 *    globale deadline; resterende GTINs tellen als `niet-verwerkt` (AC7d).
 *  - **AC6** de al bekende gln gaat mee, zodat de index-gln en de opgehaalde gln
 *    gelijk zijn én ~1862 DB-queries vervallen.
 *  - **AC5** voortgang wordt periodiek geflusht.
 */
export async function collectGtinData(
  universe: GtinUniverseEntry[],
  opts: {
    concurrency?: number;
    gtinTimeoutMs?: number;
    maxRuntimeMs?: number;
    progressEvery?: number;
    onProgress?: (line: string) => void;
  } = {}
): Promise<CollectOutcome> {
  const concurrency = opts.concurrency ?? getConcurrency();
  const gtinTimeoutMs = opts.gtinTimeoutMs ?? getGtinTimeoutMs();
  const maxRuntimeMs = opts.maxRuntimeMs ?? getMaxRuntimeMs();
  const progressEvery = opts.progressEvery ?? getProgressEvery();
  const emit = opts.onProgress ?? ((line: string) => process.stdout.write(line + '\n'));

  const out: GtinData[] = [];
  const reasons = emptyReasonCounts();
  const startedAt = Date.now();
  let processed = 0;
  let deadlineHit = false;

  for (let i = 0; i < universe.length; i += concurrency) {
    if (Date.now() - startedAt >= maxRuntimeMs) {
      deadlineHit = true;
      reasons['niet-verwerkt'] += universe.length - i;
      emit(
        `[deadline] ${maxRuntimeMs}ms verstreken na ${processed}/${universe.length} GTINs — ` +
          `${universe.length - i} niet verwerkt; de index wordt NIET overschreven (AC7d).`
      );
      break;
    }

    const chunk = universe.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(({ gtin, gln }) =>
        // GEEN herkansing op dit niveau. Die zat hier eerst, maar was in productie
        // een no-op: de herkansing riep `resolveDeclaredMarks` opnieuw aan, kreeg de
        // zojuist gecachete `api-fout` terug en bereikte de bron nooit. Bovendien
        // herhaalde hij de HELE samengestelde stap terwijl de vorige poging niet
        // geannuleerd wordt — tot 3x zoveel gelijktijdige mediaserver-verzoeken, en
        // een per-GTIN worst case van ~91s i.p.v. 30s. De herkansing zit nu ONDER de
        // cache, in de transportlaag (`fetchTradeItemXmlWithRetry`).
        withBudget(
          (async (): Promise<{ entry: GtinData; reason: CollectReason }> => {
            const [marksResult, mediaItems] = await Promise.all([
              // Story 20.19 (AC1): deelnemer aan de momentopname — dit is de ingang
              // die de beoordeelwachtrij vult, het doel van die story.
              resolveDeclaredMarks(gtin, gln, { useSnapshot: true }),
              mediaServerClient.discoverArtwork(gtin).catch(() => []),
            ]);
            const labels = mediaItems.map((m) => m.previewUrl).filter((u): u is string => !!u);
            return {
              entry: { gtin, gln, marks: marksResult.marks, labels },
              reason: mapDeclarationReason(marksResult.reason),
            };
          })(),
          gtinTimeoutMs,
          { entry: { gtin, gln, marks: [], labels: [] }, reason: 'timeout' as CollectReason }
        )
      )
    );

    for (const r of results) {
      out.push(r.entry);
      reasons[r.reason] += 1;
      processed += 1;
    }

    if (processed % progressEvery < concurrency || processed === universe.length) {
      const elapsed = Date.now() - startedAt;
      const perItem = elapsed / Math.max(processed, 1);
      const etaS = Math.round(((universe.length - processed) * perItem) / 1000);
      emit(
        `[voortgang] ${processed}/${universe.length} · ${Math.round(elapsed / 1000)}s verstreken · ` +
          `ETA ~${etaS}s · ok=${reasons.ok} 404=${reasons['404']} leeg=${reasons['lege-declaratie']} ` +
          `geen-bestand=${reasons['geen-tradeitem-bestand']} momentopname=${reasons['uit-momentopname']} ` +
          `api-fout=${reasons['api-fout']} timeout=${reasons.timeout}`
      );
    }
  }

  return { data: out, reasons, deadlineHit };
}

// ---------------------------------------------------------------------------
// Kwaliteitspoort (AC7) — beschermt de bestaande index tegen een slechte run
// ---------------------------------------------------------------------------

export interface GateInput {
  reasons: ReasonCounts;
  /** Aantal GTINs dat deze run daadwerkelijk moest verwerken (na de limiet). */
  universeSize: number;
  /**
   * Het VOLLEDIGE universum. Wijkt dit af van `universeSize`, dan is de run per
   * definitie onvolledig — ook zonder deadline — en blokkeert 7d.
   */
  universeTotal: number;
  deadlineHit: boolean;
  /** Samenvatting van de BESTAANDE index; null = niet aanwezig/onleesbaar. */
  existing: { distinctKeys: number; gtinsWithData: number } | null;
  fresh: { distinctKeys: number; gtinsWithData: number };
  allowShrink: boolean;
  allowPartial: boolean;
  maxErrorRate: number;
}

export interface GateVerdict {
  ok: boolean;
  /** Machineleesbare redenen waarom de write geblokkeerd is (leeg = doorgang). */
  blockers: string[];
  errorRate: number;
}

/**
 * Vier onafhankelijke voorwaarden; élke overtreding blokkeert het overschrijven.
 * De bouw schrijft naar één vaste sleutel zonder versie of back-up, dus een
 * slechte run zou een goede index stilzwijgend vervangen.
 */
export function evaluateGate(input: GateInput): GateVerdict {
  const blockers: string[] = [];
  const { reasons, universeSize } = input;

  // 7a — configuratiefout is fataal, NIET "geen fout". Zonder API-sleutel keert de
  // declaratielaag terug vóór elk netwerkverkeer: 0 technische fouten, 0 data. Zonder
  // deze regel passeert een LEGE index de poort en overschrijft hij de goede.
  if (reasons['api-key-ontbreekt'] > 0) {
    blockers.push(`api-key-ontbreekt bij ${reasons['api-key-ontbreekt']} GTIN(s) — configuratiefout`);
  }
  if (universeSize === 0) {
    blockers.push('leeg GTIN-universum — niets te indexeren');
  }

  // 7b — technische foutratio (404/lege-declaratie tellen NIET mee: normaal beeld).
  // Noemer = de DAADWERKELIJK verwerkte GTINs, niet het universum: bij een afgekapte
  // run zou 90% fouten op 100 verwerkte van 1862 anders als 4,8% meten en de poort
  // passeren.
  const technical = reasons['api-fout'] + reasons.timeout;
  const processed = universeSize - reasons['niet-verwerkt'];
  const errorRate = processed > 0 ? technical / processed : 0;
  if (errorRate > input.maxErrorRate) {
    blockers.push(
      `technische foutratio ${(errorRate * 100).toFixed(1)}% > ${(input.maxErrorRate * 100).toFixed(1)}% ` +
        `(${technical} van ${processed} verwerkt)`
    );
  }

  // 7d — volledigheid. Bewust vóór 7c: een onvolledige run kan MÉÉR sleutels hebben
  // dan de (kleine) bestaande index en zou de krimptoets dus gewoon passeren.
  // Twee bronnen van onvolledigheid, allebei blokkerend:
  //   a) de deadline sloeg toe   → reasons['niet-verwerkt'] > 0
  //   b) KEURMERK_INDEX_LIMIT kapte het universum af → universeSize < universeTotal
  // (b) was aanvankelijk onzichtbaar en liet een run over 27% van de corpus als
  // "volledig" door.
  const notProcessed = reasons['niet-verwerkt'];
  const cutByLimit = Math.max(0, input.universeTotal - universeSize);
  if ((input.deadlineHit || notProcessed > 0 || cutByLimit > 0) && !input.allowPartial) {
    const parts: string[] = [];
    if (notProcessed > 0) parts.push(`${notProcessed} niet verwerkt (deadline)`);
    if (cutByLimit > 0) parts.push(`${cutByLimit} buiten de limiet (${universeSize}/${input.universeTotal})`);
    blockers.push(
      `onvolledige run: ${parts.join(' + ')} — gebruik --allow-partial om toch te schrijven`
    );
  }

  // 7c — krimpbeveiliging t.o.v. de vorige stand. Niet van toepassing als er geen
  // leesbare bestaande index is; dat wordt expliciet gelogd door de aanroeper.
  if (input.existing && !input.allowShrink) {
    if (input.fresh.distinctKeys < input.existing.distinctKeys) {
      blockers.push(
        `krimp: ${input.fresh.distinctKeys} sleutels < bestaand ${input.existing.distinctKeys} (gebruik --allow-shrink)`
      );
    }
    if (input.fresh.gtinsWithData < input.existing.gtinsWithData) {
      blockers.push(
        `krimp: ${input.fresh.gtinsWithData} GTINs met data < bestaand ${input.existing.gtinsWithData} (gebruik --allow-shrink)`
      );
    }
  }

  return { ok: blockers.length === 0, blockers, errorRate };
}

/**
 * Lees de bestaande index voor de krimpvergelijking (7c). Nooit fataal: geen index,
 * onleesbare JSON of ontbrekende samenvatting → `null`, waarna 7c niet van toepassing
 * is en 7a/7b/7d alleen beslissen (de aanroeper logt dat expliciet).
 */
export async function readExistingSummary(): Promise<{
  distinctKeys: number;
  gtinsWithData: number;
} | null> {
  try {
    const buf = await downloadTrainingObject(INDEX_OBJECT_KEY);
    if (!buf) return null;
    const parsed = JSON.parse(buf.toString('utf8')) as KeurmerkIndex;
    const s = parsed?.summary;
    if (!s || typeof s.distinctKeys !== 'number' || typeof s.gtinsWithData !== 'number') return null;
    return { distinctKeys: s.distinctKeys, gtinsWithData: s.gtinsWithData };
  } catch {
    return null;
  }
}

function printPlan(
  index: KeurmerkIndex,
  dryRun: boolean,
  universeSize: number,
  reasons?: ReasonCounts,
  universeTotal?: number
): void {
  const { summary } = index;
  /* eslint-disable no-console */
  console.log('=== Keurmerk→etiket-index ===');
  console.log(`  Modus              : ${dryRun ? 'DROGE RUN (schrijft niets)' : 'ECHTE BOUW'}`);
  console.log(`  Declaratiebron     : ${index.declarationSource ?? 'onbekend'}`);
  console.log(
    `  GTIN-universum     : ${universeSize}${universeTotal && universeTotal !== universeSize ? `/${universeTotal}` : ''}` +
      ` (gln gevuld, limiet ${getIndexLimit()})`
  );
  if (reasons) {
    console.log(
      `  Reden-verdeling    : ok=${reasons.ok} 404=${reasons['404']} leeg=${reasons['lege-declaratie']} ` +
        `geen-bestand=${reasons['geen-tradeitem-bestand']} ` +
        `momentopname=${reasons['uit-momentopname']} ` +
        `api-fout=${reasons['api-fout']} timeout=${reasons.timeout} ` +
        `niet-verwerkt=${reasons['niet-verwerkt']} api-key-ontbreekt=${reasons['api-key-ontbreekt']} ` +
        `gln-ontbreekt=${reasons['gln-ontbreekt']}`
    );
  }
  // Story 20.19 (AC9) — de momentopname is bevroren en veroudert. Dat moet bij elke
  // run afleesbaar zijn, met een EIGEN telregel: `lege-declaratie` bevat al de
  // producten uit de XML-route, dus die twee bronnen zijn daar niet te scheiden.
  const leeftijd = snapshotAgeDays();
  console.log(
    `  Momentopname       : geoogst ${TRADEITEM_SNAPSHOT_META.harvestedAt} ` +
      `(${Number.isFinite(leeftijd) ? `${leeftijd} dagen oud` : 'ouderdom onbekend'}, ` +
      `doelmarkt ${TRADEITEM_SNAPSHOT_META.targetMarket}, ${TRADEITEM_SNAPSHOT_META.keys} sleutels)`
  );
  console.log(
    `  Momentopname-inzet : met keurmerk=${snapshotStats.withMarks} leeg=${snapshotStats.empty} ` +
      `niet-geoogst=${snapshotStats.notInSnapshot} verouderde-cache=${snapshotStats.staleCacheDropped}`
  );
  if (snapshotStats.notInSnapshot > 0) {
    console.log(
      `  LET OP             : ${snapshotStats.notInSnapshot} GTIN(s) liepen op 'geen bestand' ` +
        'en zijn niet in de momentopname gevonden. Dat is een BOVENGRENS voor een verse ' +
        'oogst: een GTIN met meerdere gln\'s kan hier ook staan omdat de gekozen gln ' +
        'afwijkt van de gln waarmee geoogst is, niet omdat hij nooit geoogst is.'
    );
  }
  if (Number.isFinite(leeftijd) && leeftijd > SNAPSHOT_MAX_AGE_DAYS) {
    console.log(
      `  WAARSCHUWING       : de momentopname is ${leeftijd} dagen oud (grens ${SNAPSHOT_MAX_AGE_DAYS}). ` +
        'Een bevroren sleutel schaduwt zijn product voor onbepaalde tijd, ook als de declaratie ' +
        'op productie verandert — de XML-route komt er immers nooit aan toe. Opnieuw oogsten met ' +
        'apps/api/scripts/harvest-tradeitem-snapshot.ts.'
    );
  }
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
  const allowShrink = process.argv.includes('--allow-shrink');
  const allowPartial = process.argv.includes('--allow-partial');
  const limit = getIndexLimit();
  const envTag = catalogEnvTag(process.env.CATALOG_API_BASE || 'https://catalog.acc.xxtract.com');

  const { entries: universe, total: universeTotal, truncated } = await loadGtinUniverse(limit);
  /* eslint-disable no-console */
  console.log(
    `Start: ${universe.length}/${universeTotal} GTINs · bron=${envTag} · concurrency=${getConcurrency()} · ` +
      `budget/GTIN=${getGtinTimeoutMs()}ms · transport-retries=${catalogFetchRetries()} · ` +
      `deadline=${Math.round(getMaxRuntimeMs() / 1000)}s`
  );
  if (truncated > 0) {
    console.log(
      `  Let op: KEURMERK_INDEX_LIMIT=${limit} kapt ${truncated} GTIN(s) af — de run is dus ONVOLLEDIG ` +
        `en de kwaliteitspoort (7d) zal het overschrijven blokkeren zonder --allow-partial.`
    );
  }
  /* eslint-enable no-console */

  const { data, reasons, deadlineHit } = await collectGtinData(universe);
  const index = buildIndex(data, new Date(), envTag);

  printPlan(index, dryRun, universe.length, reasons, universeTotal);

  // De poort oordeelt in BEIDE modi, zodat een droge run hetzelfde verdict toont
  // als de echte bouw zou krijgen. Alleen de write hangt aan `dryRun`.
  const existing = await readExistingSummary();
  if (!existing) {
    // eslint-disable-next-line no-console
    console.log('  Let op: geen leesbare bestaande index — krimpbeveiliging (7c) niet van toepassing.');
  }
  const verdict = evaluateGate({
    reasons,
    universeSize: universe.length,
    universeTotal,
    deadlineHit,
    existing,
    fresh: { distinctKeys: index.summary.distinctKeys, gtinsWithData: index.summary.gtinsWithData },
    allowShrink,
    allowPartial,
    maxErrorRate: getMaxErrorRate(),
  });

  /* eslint-disable no-console */
  if (existing) {
    console.log(
      `  Vergelijking       : sleutels ${existing.distinctKeys} → ${index.summary.distinctKeys}, ` +
        `GTINs met data ${existing.gtinsWithData} → ${index.summary.gtinsWithData}`
    );
  }
  console.log(`  Technische fouten  : ${(verdict.errorRate * 100).toFixed(1)}% (grens ${(getMaxErrorRate() * 100).toFixed(1)}%)`);
  console.log(`  Declaratie-cache   : ${marksCacheStats.hits} hits / ${marksCacheStats.misses} misses`);

  if (!verdict.ok) {
    console.error('KWALITEITSPOORT BLOKKEERT — de bestaande index blijft ongewijzigd:');
    for (const b of verdict.blockers) console.error(`  - ${b}`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('Droge run — er is niets naar de opslag geschreven. Poort: DOORGANG.');
    return;
  }
  /* eslint-enable no-console */

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
      // Story 19.16 (AC3): sluit ALLE lang-levende handles, anders blijft dit script
      // na afloop hangen tot een externe kill — de ioredis-singleton hield de
      // event-loop open. Geen process.exit(): dat zou de MinIO-write kunnen afkappen.
      await prisma.$disconnect();
      closeRedisConnection();
    });
}
