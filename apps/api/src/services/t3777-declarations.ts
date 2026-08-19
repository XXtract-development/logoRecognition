/**
 * T3777 declaration provider (Story 8-3D) — the real catalog-API declaration
 * source for the artwork crosscheck.
 *
 * It plugs into the pluggable declaration-provider interface from 8-3O
 * (detection-flow.ts: setDeclarationProvider / emptyDeclarationProvider). For a
 * GTIN it resolves the declared T3777 codes (the GS1
 * `packagingMarkedLabelAccreditationCode` set) so the crosscheck can
 * auto-accept matching detections instead of routing everything to review.
 *
 * Pipeline (frozen design decisions 0–5):
 *   gln-lookup (artwork_imports.gln, decision 0 prerequisite)
 *     → Redis cache read (decision 4)
 *     → catalog-API fetch  GET {base}/api/tradeitemxml/{gln}-{gtin}-{tm}  (decision 1)
 *     → namespace-agnostic XML parse on local-name (decision 2)
 *     → Redis cache write (incl. negative caching of empty results)
 *
 * Fail-safe (decision 3): EVERY failure mode returns [] and NEVER throws, each
 * with a DISTINCT reason so a silent fail-safe never looks like "it worked":
 *   - api-key-ontbreekt        CATALOG_API_KEY not configured
 *   - gln-ontbreekt            no gln on any import row for this GTIN
 *   - 404-mogelijk-TM-mismatch catalog 404 (likely the targetMarket is wrong)
 *   - geen-tradeitem-bestand   catalog 500 met "File not found at path" — de catalog
 *     meldt een ONTBREKEND trade-item-bestand met een 500 i.p.v. een 404. Semantisch
 *     is dat "niet gevonden", geen storing: stabiel, zinloos om te herhalen, en het
 *     hoort NIET mee te tellen als technische fout (Story 19.16; live gemeten op ACC:
 *     129 van 129 500-responses hadden exact deze body).
 *   - api-fout                 any other status >= 400 OR a network/fetch error
 *   - lege-declaratie          fetched + parsed but no T3777 codes present
 *   - ok                       at least one code resolved
 *
 * Secrets (decision 5): the API key comes from CATALOG_API_KEY and is NEVER
 * logged or defaulted in code.
 */

import { getRedisConnection } from './pipeline/queue';
import {
  setDeclarationProvider,
  emptyDeclarationProvider,
  DeclarationProvider,
} from './pipeline/detection-flow';
import prisma from '../core/db';
import {
  TRADEITEM_SNAPSHOT,
  TRADEITEM_SNAPSHOT_META,
} from './tradeitem-declaration-snapshot';
import { createLogger } from '../core/logger';

const logger = createLogger('t3777-declarations');

/** Distinct, log-stable reasons (decision 3). */
export type DeclarationReason =
  | 'ok'
  | 'api-key-ontbreekt'
  | 'gln-ontbreekt'
  | '404-mogelijk-TM-mismatch'
  | 'geen-tradeitem-bestand'
  | 'api-fout'
  | 'lege-declaratie'
  // Story 20.19 (AC2/AC3) — de declaratie komt uit de bevroren momentopname
  // `tradeitem-declaration-snapshot.ts` in plaats van uit de catalogus-XML.
  // MAG NOOIT `ok` zijn: `bootstrap-run.ts` laat alleen `ok` de klasse-zoektocht
  // in die referenties oplevert, en besluit 2 sluit die route juist uit.
  | 'uit-momentopname';

export interface DeclarationResult {
  codes: string[];
  reason: DeclarationReason;
}

/** Hard cap on the response body we will buffer/parse (self-review: huge XML). */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * fetch timeout (self-review: a hung catalog must not stall the worker).
 *
 * Story 19.16: deze timer dekt nu de HELE uitwisseling (headers + body), niet
 * alleen de headers. Dat is strenger dan voorheen en raakt ook de twee live paden,
 * dus is hij instelbaar gemaakt: een trage-maar-gezonde grote body (tot 5 MiB) mag
 * niet ineens afgebroken worden. Default blijft 10s.
 */
function fetchTimeoutMs(): number {
  const v = parseInt(process.env.CATALOG_FETCH_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 10_000;
}

/**
 * Env is read lazily INSIDE the resolver (never at import time) so (a) there are
 * no import-time side-effects and (b) tests can set process.env before calling.
 */
function readEnv() {
  return {
    apiKey: process.env.CATALOG_API_KEY, // no default — missing key is a fail-safe path
    baseUrl: (process.env.CATALOG_API_BASE || 'https://catalog.acc.xxtract.com').replace(/\/+$/, ''),
    targetMarket: process.env.T3777_TARGET_MARKET || '528',
    cacheTtlS: parseInt(process.env.T3777_CACHE_TTL_S || '86400', 10),
  };
}

/**
 * Namespace-agnostic parse on local-name: collect the text of every element
 * whose local-name is `packagingMarkedLabelAccreditationCode`, regardless of
 * namespace prefix (GS1 XML is heavily namespaced — decision 2). Union over all
 * packaging layers, trim, uppercase, dedup.
 */
export function parseT3777Codes(xml: string): string[] {
  // (?=[\s/>]) = tag-grens: zonder die grens matcht de tag ook langere
  // GS1-veldnamen met deze naam als prefix (12.16, zie parseDeclaredMarks).
  const re = /<(?:[\w.-]+:)?packagingMarkedLabelAccreditationCode(?=[\s/>])[^>]*>([^<]+)</g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const code = m[1].trim().toUpperCase();
    if (code) set.add(code);
  }
  return [...set];
}

/** Cache key per (gln, gtin, tm) — decision 4. */
function cacheKey(gln: string, gtin: string, tm: string): string {
  return `t3777:${gln}:${gtin}:${tm}`;
}

/** Transport-level outcome of a trade-item XML fetch (before any parsing). */
type FetchXmlReason = 'ok' | '404-mogelijk-TM-mismatch' | 'geen-tradeitem-bestand' | 'api-fout';

/**
 * Fetch the raw trade-item XML. Distinguishes 404 (likely TM mismatch) from any
 * other error so the reasons stay separate. Returns the body on success, never
 * throws. Shared by the T3777 crosscheck (parseT3777Codes) and the label-prior
 * (parseDeclaredMarks) so both go through one cached, fail-safe catalog path.
 */
/**
 * Story 19.16 (AC9) — herkansingen bij een TRANSIËNTE transportfout, met
 * exponentiële wachttijd (500ms, 1s, 2s).
 *
 * Bewust HIER en niet in de indexbouwer. Een herkansing op scriptniveau roept
 * `resolveDeclaredMarks` opnieuw aan, en die leest éérst de cache — waar de zojuist
 * geschreven `api-fout` staat. De herkansing kreeg dan een cache-hit en bereikte de
 * bron nooit; hij werkte alleen als Redis stuk was, precies wanneer je hem niet
 * nodig hebt. Onder de cache retryen lost dat op, én voorkomt dat de samengestelde
 * stap (inclusief de mediaserver-aanroep) onnodig wordt herhaald.
 */
export function catalogFetchRetries(): number {
  const v = parseInt(process.env.CATALOG_FETCH_RETRIES ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 5) : 2;
}

async function fetchTradeItemXmlWithRetry(
  baseUrl: string,
  apiKey: string,
  gln: string,
  gtin: string,
  tm: string
): Promise<{ xml: string | null; reason: FetchXmlReason }> {
  const attempts = catalogFetchRetries();
  let last = await fetchTradeItemXml(baseUrl, apiKey, gln, gtin, tm);
  for (let i = 0; i < attempts && last.reason === 'api-fout'; i++) {
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    last = await fetchTradeItemXml(baseUrl, apiKey, gln, gtin, tm);
  }
  return last;
}

async function fetchTradeItemXml(
  baseUrl: string,
  apiKey: string,
  gln: string,
  gtin: string,
  tm: string
): Promise<{ xml: string | null; reason: FetchXmlReason }> {
  const url = `${baseUrl}/api/tradeitemxml/${gln}-${gtin}-${tm}`;
  const controller = new AbortController();
  // Story 19.16 (AC2): de timer dekt de HELE uitwisseling — headers ÉN body. Hij
  // werd voorheen in de `finally` van de fetch gewist, waardoor `response.text()`
  // hieronder buiten elke bovengrens viel: een server die headers stuurt en dan
  // stilvalt liet de run oneindig hangen (waargenomen: 25 min, 0:00 CPU).
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs());

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
      signal: controller.signal,
    });
  } catch (err) {
    // network error / timeout (AbortError) — never throw, never log the key/URL
    clearTimeout(timer);
    logger.warn('Catalog declaration fetch failed', {
      reason: 'api-fout',
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { xml: null, reason: 'api-fout' };
  }

  // Vanaf hier is de timer nog ACTIEF (19.16/AC2) — hij dekt ook de body-read.
  // Elke uitgang hieronder loopt daarom door de `finally` die hem wist.
  try {
    if (response.status === 404) {
      logger.info('Catalog declaration not found', { reason: '404-mogelijk-TM-mismatch', gtin, tm });
      return { xml: null, reason: '404-mogelijk-TM-mismatch' };
    }

    if (response.status >= 400) {
      // De catalog geeft een ONTBREKEND trade-item-bestand terug als 500 met een
      // JSON-body "File not found at path: tradeItems/...". Dat is inhoudelijk een
      // 404. Zonder deze herkenning telt zo'n GTIN als technische fout, wordt hij
      // (zinloos) opnieuw geprobeerd en kort gecached — op ACC ging dat om 26% van
      // het hele corpus, genoeg om de kwaliteitspoort te laten blokkeren.
      const peek = await response.text().catch(() => '');
      if (response.status === 500 && /File not found at path/i.test(peek)) {
        logger.info('Catalog: geen trade-item-bestand', {
          reason: 'geen-tradeitem-bestand',
          gtin,
          tm,
        });
        return { xml: null, reason: 'geen-tradeitem-bestand' };
      }
      logger.warn('Catalog declaration error status', { reason: 'api-fout', gtin, status: response.status });
      return { xml: null, reason: 'api-fout' };
    }

    // Guard against pathologically large bodies before buffering the whole thing.
    const declaredLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      logger.warn('Catalog declaration response too large', { reason: 'api-fout', gtin, bytes: declaredLength });
      return { xml: null, reason: 'api-fout' };
    }

    let xml: string;
    try {
      xml = await response.text();
    } catch (err) {
      // Ook een abort door de timer landt hier (AbortError) → fail-safe, geen throw.
      logger.warn('Catalog declaration body read failed', {
        reason: 'api-fout',
        gtin,
        error: err instanceof Error ? err.message : 'unknown',
      });
      return { xml: null, reason: 'api-fout' };
    }

    if (xml.length > MAX_RESPONSE_BYTES) {
      // Streaming-less guard for servers that omit content-length.
      logger.warn('Catalog declaration body too large', { reason: 'api-fout', gtin, bytes: xml.length });
      return { xml: null, reason: 'api-fout' };
    }

    return { xml, reason: 'ok' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch + parse the T3777 declaration. Behaviour (and the returned reasons) are
 * unchanged from the original inline implementation; only the transport step is
 * factored out into fetchTradeItemXml so the label-prior can reuse it.
 */
async function fetchDeclaration(
  baseUrl: string,
  apiKey: string,
  gln: string,
  gtin: string,
  tm: string
): Promise<DeclarationResult> {
  const { xml, reason } = await fetchTradeItemXml(baseUrl, apiKey, gln, gtin, tm);
  if (reason !== 'ok' || xml == null) {
    return { codes: [], reason };
  }

  const codes = parseT3777Codes(xml);
  if (codes.length === 0) {
    logger.info('Catalog declaration empty', { reason: 'lege-declaratie', gtin });
    return { codes: [], reason: 'lege-declaratie' };
  }

  return { codes, reason: 'ok' };
}

/**
 * Resolve the declared T3777 codes for a GTIN. Returns codes + a distinct
 * reason; NEVER throws. Exported so tests can assert on the reason directly
 * (the closure-captured logger mock is fresh per createLogger() call and thus
 * brittle to assert on).
 *
 * Order is load-bearing (each branch = one distinct fail-safe path):
 *   1. api-key check FIRST   → no DB, no fetch, no cache when the key is unset
 *   2. gln lookup            → no gln → return before forming a cache key
 *   3. cache read            → hit (incl. negatively-cached empties) short-circuits
 *   4. fetch                 → 404 / >=400 / network distinguished inside fetchDeclaration
 *   5. cache write           → ALL results cached, incl. empties (negative caching)
 */
/**
 * Resolveer de GLN (informatieleverancier) van een GTIN uit `artwork_imports.gln`
 * — de ENIGE gln-lookup-implementatie, gedeeld door de declaratie-resolutie én de
 * mismatch-registratie (Story 16.1, Dev Notes 2.2). Fail-safe: een DB-fout of een
 * ontbrekende gln levert `null` (nooit een throw), net als in de crosscheck-keten.
 */
export async function resolveGln(gtin: string): Promise<string | null> {
  try {
    const row = await prisma.artworkImport.findFirst({
      where: { gtin, gln: { not: null } },
      select: { gln: true },
    });
    return row?.gln ?? null;
  } catch (err) {
    // A DB error here is treated as "no gln" — still a fail-safe, never a throw.
    logger.warn('gln lookup failed', {
      reason: 'gln-ontbreekt',
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

export async function resolveDeclarations(gtin: string): Promise<DeclarationResult> {
  const { apiKey, baseUrl, targetMarket, cacheTtlS } = readEnv();

  // 1. Missing API key — fail safe before touching the DB or the network.
  if (!apiKey) {
    logger.warn('Catalog API key not configured', { reason: 'api-key-ontbreekt', gtin });
    return { codes: [], reason: 'api-key-ontbreekt' };
  }

  // 2. gln lookup (decision 0 prerequisite). No gln → cannot form a URL/key.
  const gln = await resolveGln(gtin);
  if (!gln) {
    logger.info('No gln for GTIN — declaration lookup skipped', { reason: 'gln-ontbreekt', gtin });
    return { codes: [], reason: 'gln-ontbreekt' };
  }

  const key = cacheKey(gln, gtin, targetMarket);

  // 3. Cache read (Redis-fault = proceed without cache, never crash).
  const cached = await cacheRead(key, gtin);
  if (cached) return cached;

  // 4. Fetch + parse.
  const result = await fetchDeclaration(baseUrl, apiKey, gln, gtin, targetMarket);

  // 5. Cache write (negative caching: empties cached with the same TTL too).
  await cacheWrite(key, result, cacheTtlS, gtin);

  return result;
}

/** Cache read; a Redis fault (or corrupt entry) is treated as a miss. */
async function cacheRead(key: string, gtin: string): Promise<DeclarationResult | null> {
  let raw: string | null = null;
  try {
    raw = await getRedisConnection().get(key);
  } catch (err) {
    logger.warn('Redis cache read failed — proceeding without cache', {
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeclarationResult;
    if (parsed && Array.isArray(parsed.codes)) {
      return { codes: parsed.codes, reason: parsed.reason ?? 'ok' };
    }
  } catch {
    // corrupt cache entry → treat as a miss
  }
  return null;
}

/** Cache write; a Redis fault is logged and swallowed (never crashes the job). */
async function cacheWrite(
  key: string,
  result: DeclarationResult,
  ttlS: number,
  gtin: string
): Promise<void> {
  try {
    await getRedisConnection().setex(key, ttlS, JSON.stringify(result));
  } catch (err) {
    logger.warn('Redis cache write failed — result not cached', {
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * The provider exposed to the detection flow: returns only the codes (the
 * crosscheck contract). The reason is logged inside resolveDeclarations.
 */
export const catalogDeclarationProvider: DeclarationProvider = async (gtin: string) => {
  const { codes } = await resolveDeclarations(gtin);
  return codes;
};

// ---------------------------------------------------------------------------
// Story 12.7 — declared GS1 marks as a label-prior for the relabel UI.
//
// Same catalog source/cache/fail-safe as the T3777 crosscheck, but extracts ALL
// recognised sporen (not only T3777) so the review UI can pin/flag a detection
// against what the GTIN actually declares on-pack. Spike-verified: the live
// catalog XML carries packagingMarkedLabelAccreditationCode AND dietTypeCode.
// ---------------------------------------------------------------------------

/** A declared mark = a code plus its GS1 codelist name (= reference_logos.fieldType). */
export interface DeclaredMark {
  code: string;
  fieldType: string;
}

export interface DeclaredMarksResult {
  marks: DeclaredMark[];
  reason: DeclarationReason;
  /**
   * Story 20.19 (AC8) — alleen gezet bij `uit-momentopname` en `lege-declaratie`
   * uit de momentopname. Staat in de cache zodat een VERSE momentopname zichzelf
   * oppikt: een hit met een afwijkende oogstdatum wordt als miss behandeld. Zonder
   * dit veld zou een nieuwe oogst 24 uur lang niet doorkomen.
   */
  snapshotHarvestedAt?: string;
}

/**
 * GS1 declaration element (XML local-name) → GS1 codelist name (fieldType).
 *
 * Story 19.2 (FR-22): volledige 5/5 keurmerkveld-dekking. Vier van de vijf velden
 * hebben een SPECIFIEKE local-name en worden hier plat gematcht; het vijfde
 * (`enumerationValue`, Logo-gebruiksinformatie) is te generiek voor platte matching
 * en wordt apart, gescopet binnen `consumerUsageLabelCode`, geparsed (zie hieronder).
 */
export const MARK_FIELDS: Array<{ tag: string; fieldType: string }> = [
  { tag: 'packagingMarkedLabelAccreditationCode', fieldType: 'PackagingMarkedLabelAccreditationCode' },
  { tag: 'localPackagingMarkedLabelAccreditationCodeReference', fieldType: 'AdditionalPackagingMarkingsCode' },
  { tag: 'dietTypeCode', fieldType: 'DietTypeCode' },
  { tag: 'nutritionalScore', fieldType: 'NutritionalScore' },
];

/**
 * fieldType voor de gescopete consumerUsageLabelCode/…/enumerationValue-parse
 * (Logo-gebruiksinformatie). Waarde MOET de canonieke `reference_logos.fieldType`
 * zijn zodat gematchte marks tegen een logo koppelen: de frontend-bron
 * (`apps/web/src/data/spoor-codes.ts`, `fieldTypeForCode`) gebruikt hiervoor
 * `EU_consumerUsageLabelCodeList` (AISE/NIX18-pictogrammen).
 */
export const CONSUMER_USAGE_FIELD_TYPE = 'EU_consumerUsageLabelCodeList';

/**
 * Namespace-agnostic parse on local-name for every recognised mark element.
 * Union over all layers, trim, uppercase, dedup per (fieldType, code).
 *
 * De vier specifieke velden lopen via MARK_FIELDS (platte local-name-match). De
 * Logo-gebruiksinformatie zit als `consumerUsageLabelCode/enumerationValueInformation/
 * enumerationValue`: de leaf-tag `enumerationValue` is generiek in GDSN (komt ook in
 * andere modules voor en botst met `enumerationValueInformation`), dus die extractie
 * wordt bewust gescopet binnen elk `consumerUsageLabelCode`-blok.
 */
export function parseDeclaredMarks(xml: string): DeclaredMark[] {
  const seen = new Set<string>();
  const out: DeclaredMark[] = [];
  const push = (fieldType: string, raw: string): void => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    const k = `${fieldType}:${code}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ code, fieldType });
  };

  for (const { tag, fieldType } of MARK_FIELDS) {
    // (?=[\s/>]) = tag-grens (12.16): `nutritionalScore` mag niet ook
    // `nutritionalScoreProductCategoryCode` matchen — na de tagnaam moet
    // direct whitespace (attributen), '/' of '>' volgen.
    const re = new RegExp(`<(?:[\\w.-]+:)?${tag}(?=[\\s/>])[^>]*>([^<]+)<`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      push(fieldType, m[1]);
    }
  }

  // Gescopete parse: alleen `enumerationValue`-waarden BINNEN een
  // `consumerUsageLabelCode`-blok tellen (voorkomt matchen van niet-gerelateerde
  // enumerationValues elders en van `enumerationValueInformation`).
  const blockRe =
    /<(?:[\w.-]+:)?consumerUsageLabelCode\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?consumerUsageLabelCode>/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(xml)) !== null) {
    const valRe = /<(?:[\w.-]+:)?enumerationValue\b[^>]*>([^<]+)</g;
    let v: RegExpExecArray | null;
    while ((v = valRe.exec(block[1])) !== null) {
      push(CONSUMER_USAGE_FIELD_TYPE, v[1]);
    }
  }

  return out;
}

/**
 * Story 19.16 (AC8) — de cachesleutel draagt een OMGEVINGSDIMENSIE, afgeleid van de
 * catalog-host. Zonder die dimensie schrijft een index-run tegen `catalog.stage…`
 * entries die de LIVE ACC-paden (review-prior in artwork-pipeline, bootstrap-
 * declaratieguard) daarna als ACC-waarheid teruglezen. Besluit 2026-07-25: we bouwen
 * de index op stage-declaraties, dus die scheiding is een harde voorwaarde.
 *
 * Sleutels van vóór 19.16 (zonder env-segment) worden hierdoor niet meer gelezen;
 * ze verlopen vanzelf binnen de TTL. Dat is gewenst: hun herkomst is onbekend.
 */
export function catalogEnvTag(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    // catalog.stage.xxtract.com -> stage ; catalog.acc.xxtract.com -> acc
    const parts = host.split('.');
    return parts.length >= 3 ? parts[1] : host.replace(/[^a-z0-9]/g, '');
  } catch {
    return 'onbekend';
  }
}

/**
 * Story 19.16 (AC4) — teller voor cache-hits/-misses, zodat een lange indexrun kan
 * aantonen dat de cache daadwerkelijk werkt (en een tweede run goedkoop is).
 * Procesbreed en bewust simpel; alleen scripts lezen hem uit.
 */
export const marksCacheStats = { hits: 0, misses: 0 };

/**
 * Story 20.19 (AC9) — gebruik van de momentopname, met een EIGEN teller. Niet via
 * de redenentellers: `lege-declaratie` bevat al 429 producten uit de XML-route, en
 * dan zijn de twee bronnen niet meer te scheiden.
 *
 * `notInSnapshot` is een BOVENGRENS voor een verse oogst, geen exact getal: het telt
 * producten die op `geen-tradeitem-bestand` lopen en niet in de momentopname gevonden
 * zijn. Daar zit ook een GTIN tussen waarvan de gekozen gln afwijkt van de gln
 * waarmee geoogst is — die is wél geoogst, alleen onder een andere sleutel.
 *
 * `staleCacheDropped` telt hits die wij bewust laten vallen. Let op: die tellen NIET
 * mee in `marksCacheStats`, dus `hits + misses` is sinds deze story niet meer gelijk
 * aan het aantal aanroepen. Dat is met opzet — een bewust genegeerde hit is geen miss
 * en zou de cache-statistiek van 19.16 vertekenen.
 */
export const snapshotStats = { withMarks: 0, empty: 0, notInSnapshot: 0, staleCacheDropped: 0 };

/**
 * Zet de procesbrede tellers terug aan het begin van een run.
 *
 * Doet BEWUST iets meer dan de naam suggereert: ook de eenmalige
 * doelmarkt-waarschuwing gaat terug op scherp. Een nieuwe run hoort die melding
 * opnieuw te geven — anders zou een tweede run in hetzelfde proces stil blijven over
 * een instelling die al zijn opzoekingen laat mislukken.
 */
export function resetSnapshotStats(): void {
  doelmarktGewaarschuwd = false;
  snapshotStats.withMarks = 0;
  snapshotStats.empty = 0;
  snapshotStats.notInSnapshot = 0;
  snapshotStats.staleCacheDropped = 0;
}

/** Ouderdom van de momentopname in dagen, op een meegegeven peildatum. */
export function snapshotAgeDays(now: Date = new Date()): number {
  const harvested = Date.parse(`${TRADEITEM_SNAPSHOT_META.harvestedAt}T00:00:00Z`);
  if (!Number.isFinite(harvested)) return Number.NaN;
  return Math.floor((now.getTime() - harvested) / 86_400_000);
}

/**
 * Story 20.19 (AC9) — boven deze grens wordt de indexbouwer luidruchtig. Zonder
 * grens schaduwt een bevroren sleutel een product voor onbepaalde tijd, ook als de
 * declaratie op productie verandert: de XML-route komt er immers nooit aan toe.
 */
export const SNAPSHOT_MAX_AGE_DAYS = 180;

/** Procesbreed: de doelmarkt-waarschuwing hoort één keer per run te klinken, niet per GTIN. */
let doelmarktGewaarschuwd = false;

export function resetMarksCacheStats(): void {
  marksCacheStats.hits = 0;
  marksCacheStats.misses = 0;
}

/**
 * Separate cache namespace from the T3777-only crosscheck cache.
 *
 * Story 20.19 — het momentopname-pad krijgt een EIGEN sleutel (`:snap`). Zonder dat
 * onderscheid deelt het zijn uitkomst met alle andere aanroepers: een aanroep mét
 * de terugval schreef `uit-momentopname` inclusief marks weg, en de eerstvolgende
 * aanroep ZONDER de terugval kreeg die gewoon terug uit de cache. De vlag beschermde
 * de aanroep, niet de sleutel — en `verify-flow.ts` kijkt alleen naar de marks, niet
 * naar de reden, dus de bevroren Nutri-Score-letters liepen alsnog door naar
 * `nominateFromKruischeck`. Precies wat besluit 2 uitsluit.
 *
 * Beide paden draaien in hetzelfde proces (de API-server bedient zowel het
 * beoordeelscherm-endpoint als de detectiestroom), dus dit was geen theoretisch lek.
 */
function marksCacheKey(
  gln: string,
  gtin: string,
  tm: string,
  envTag: string,
  useSnapshot = false
): string {
  return `marks:${envTag}:${gln}:${gtin}:${tm}${useSnapshot ? ':snap' : ''}`;
}

/**
 * Story 19.16 (AC4) — TTL voor NEGATIEVE uitkomsten die transiënt kunnen zijn.
 * `api-fout` dekt 5xx, netwerkfouten en timeouts; die 24h vasthouden betekent dat
 * één slechte upstream-minuut een etmaal doorwerkt in élke consument. 404 en
 * lege-declaratie zijn wél stabiele uitspraken en houden de normale TTL.
 */
const TRANSIENT_CACHE_TTL_S = 300;

function ttlForReason(reason: DeclarationReason, normalTtlS: number): number {
  return reason === 'api-fout' ? Math.min(TRANSIENT_CACHE_TTL_S, normalTtlS) : normalTtlS;
}

async function marksCacheRead(key: string, gtin: string): Promise<DeclaredMarksResult | null> {
  let raw: string | null = null;
  try {
    raw = await getRedisConnection().get(key);
  } catch (err) {
    logger.warn('Redis marks cache read failed — proceeding without cache', {
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeclaredMarksResult;
    if (parsed && Array.isArray(parsed.marks)) {
      return {
        marks: parsed.marks,
        reason: parsed.reason ?? 'ok',
        ...(parsed.snapshotHarvestedAt ? { snapshotHarvestedAt: parsed.snapshotHarvestedAt } : {}),
      };
    }
  } catch {
    // corrupt cache entry → treat as a miss
  }
  return null;
}

async function marksCacheWrite(
  key: string,
  result: DeclaredMarksResult,
  ttlS: number,
  gtin: string
): Promise<void> {
  try {
    await getRedisConnection().setex(key, ttlS, JSON.stringify(result));
  } catch (err) {
    logger.warn('Redis marks cache write failed — result not cached', {
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * 12.27 — Nutri-Score-declaraties voor de kruischeck: de GS1-`nutritionalScore`-
 * declaratie is een KALE letter (A-E) in een apart veld, geen T3777-code. Map
 * alleen kale enkele letters naar de canonieke `NUTRISCORE_<letter>`-codes;
 * categorie-waarden die hetzelfde veld gebruiken (GENERAL_FOODS, CHEESES, …)
 * en andere sporen (DietType etc.) tellen NIET mee (zelfde leak-guard als de
 * 12.15-map-bouw en de 12.18-frontend-normalisatie). Pure functie.
 */
export function nutriscoreDeclaredCodes(
  marks: Array<{ code: string; fieldType: string }>
): string[] {
  const letters = new Set<string>();
  for (const m of marks) {
    const code = (m.code || '').trim().toUpperCase();
    if (m.fieldType === 'NutritionalScore' && /^[A-E]$/.test(code)) {
      letters.add(`NUTRISCORE_${code}`);
    }
  }
  return [...letters].sort();
}

/**
 * Story 20.19 (AC8) — een cache-hit die de terugval in de weg staat, wordt als miss
 * behandeld. Twee gevallen, allebei nodig:
 *
 *  1. `geen-tradeitem-bestand` staat 24 uur in de cache en wordt VOOR de aanroep
 *     gelezen. Zonder deze regel bereikt de terugval de 442 producten pas een dag
 *     na uitrol, en is de voor/na-meting onmogelijk.
 *  2. `uit-momentopname` van een OUDERE oogst. Zo pikt een verse momentopname
 *     zichzelf op, zonder dat iemand een schakelaar hoeft te onthouden.
 *
 * "De cachelees overslaan" kan niet: je moet lezen om de reden te kennen.
 */
export function shouldTreatCacheHitAsMiss(
  cached: DeclaredMarksResult,
  useSnapshot: boolean,
  /**
   * Punt 4 uit de code review: begrens de omzeiling tot sleutels die daadwerkelijk
   * in de momentopname staan. Anders gaat elk NIET-geoogst product permanent langs
   * de cache — en die groep groeit met elk nieuw product, dus dat zou stilaan de hele
   * cachewinst opeten en per run 442+ extra catalogus-verzoeken kosten.
   */
  staatInMomentopname = true
): boolean {
  if (useSnapshot && cached.reason === 'geen-tradeitem-bestand') {
    return staatInMomentopname;
  }

  // TWEEDE GRENDEL op besluit 2, naast de eigen cachesleutel hierboven. Komt een
  // uitkomst uit de momentopname en vraagt de aanroeper er niet om, dan krijgt hij
  // hem niet — ook niet als een oude sleutel, een handmatige schrijfactie of een
  // toekomstige wijziging de twee naamruimtes ooit weer laat overlappen.
  const uitMomentopname =
    cached.reason === 'uit-momentopname' || cached.snapshotHarvestedAt !== undefined;
  if (uitMomentopname && !useSnapshot) return true;

  // Een uitkomst uit een ANDERE oogst dan de huidige: als miss behandelen, zodat een
  // verse momentopname zichzelf oppikt. Een `uit-momentopname` zónder datum is een
  // entry van vóór deze story of een handmatige — die telt ook als verlopen.
  if (cached.reason === 'uit-momentopname' && cached.snapshotHarvestedAt === undefined) {
    return true;
  }
  if (
    cached.snapshotHarvestedAt !== undefined &&
    cached.snapshotHarvestedAt !== TRADEITEM_SNAPSHOT_META.harvestedAt
  ) {
    return true;
  }
  return false;
}

/**
 * Story 20.19 (AC2) — de opzoeking in de momentopname. Drie uitkomsten, en het
 * onderscheid tussen de laatste twee is met opzet:
 *
 *   sleutel afwezig        -> null; de aanroeper houdt `geen-tradeitem-bestand`.
 *                             Dat betekent "NIET gemeten" en is precies de
 *                             hoeveelheid werk voor een verse oogst.
 *   sleutel met lege lijst -> `lege-declaratie`. Betekent "gemeten, declareert
 *                             niets" (204 van de 442).
 *   sleutel met codes      -> `uit-momentopname` (238 van de 442).
 *
 * De momentopname is al genormaliseerd bij het oogsten (trim, uppercase,
 * ontdubbeld per (fieldType, code)); hier gebeurt dat NIET nog eens — AC5.
 */
export function lookupSnapshot(
  gln: string,
  gtin: string,
  targetMarket: string
): DeclaredMarksResult | null {
  // Story 20.19 (AC10) — de momentopname is doelmarkt-gebonden. Zou T3777_TARGET_MARKET
  // op iets anders staan, dan mist ELKE opzoeking zonder foutmelding en zonder
  // verschil met "niet gemeten". Dat moet luid zijn, niet stil.
  if (targetMarket !== TRADEITEM_SNAPSHOT_META.targetMarket) {
    // Punt 10 uit de code review: één keer per proces. Dit is een instellingsfout die
    // voor ELKE GTIN geldt; per product waarschuwen levert 1870 identieke regels op
    // en verdrinkt precies het signaal dat je wilde zien.
    if (!doelmarktGewaarschuwd) {
      doelmarktGewaarschuwd = true;
      logger.warn('Momentopname overgeslagen: andere doelmarkt dan geoogst', {
        gevraagd: targetMarket,
        geoogst: TRADEITEM_SNAPSHOT_META.targetMarket,
        gevolg: 'de terugval levert niets op zolang dit verschil bestaat',
      });
    }
    return null;
  }

  const marks = TRADEITEM_SNAPSHOT[`${gln}-${gtin}-${targetMarket}`];
  if (marks === undefined) {
    snapshotStats.notInSnapshot += 1;
    return null;
  }

  const harvestedAt = TRADEITEM_SNAPSHOT_META.harvestedAt;
  if (marks.length === 0) {
    snapshotStats.empty += 1;
    return { marks: [], reason: 'lege-declaratie', snapshotHarvestedAt: harvestedAt };
  }

  snapshotStats.withMarks += 1;
  return {
    marks: marks.map((m) => ({ code: m.code, fieldType: m.fieldType })),
    reason: 'uit-momentopname',
    snapshotHarvestedAt: harvestedAt,
  };
}

/**
 * Resolve the declared GS1 marks for a GTIN (all sporen). Mirrors
 * resolveDeclarations' fail-safe order; NEVER throws. Returns marks + a distinct
 * reason so an empty prior never silently looks like "no data".
 */
export async function resolveDeclaredMarks(
  gtin: string,
  /**
   * Story 19.16 (AC6) — optioneel de AL BEKENDE gln meegeven. De indexbouwer kent
   * die uit het universum; zonder deze parameter deed deze functie een eigen
   * `findFirst` zónder `orderBy`, wat twee problemen gaf: ~1862 overbodige queries
   * per volledige run, én een gln die kon afwijken van de gln in de index wanneer
   * een GTIN meerdere GLN's heeft. Weglaten = ongewijzigd oud gedrag.
   */
  knownGln?: string,
  /**
   * Story 20.19 (AC1) — de momentopname-terugval staat STANDAARD UIT en wordt per
   * aanroep aangezet. Dit is een gedeelde dienst met vijf aanroepers, waarvan twee
   * schrijven: via `pipeline/verify-flow.ts` lopen Nutri-Score-letters door naar
   * `runFlywheelHooks` → `nominateFromKruischeck` (kandidaat-referenties), en
   * `scripts/build-nutriscore-declared-map.ts` schrijft naar MinIO. Besluit 2 van
   * 2026-08-19 sluit beide uit: de geoogste, bevroren gegevens gaan uitsluitend
   * naar de beoordeelwachtrij.
   *
   * Aan (bewust): `scripts/build-keurmerk-index.ts` (vult de wachtrij) en
   * `api/v1/artwork-pipeline.ts` (leest alleen, voedt het beoordeelscherm).
   * Uit: verify-flow, bootstrap-run, build-nutriscore-declared-map.
   *
   * Een zesde aanroeper krijgt zo vanzelf het veilige gedrag.
   */
  options?: { useSnapshot?: boolean }
): Promise<DeclaredMarksResult> {
  const useSnapshot = options?.useSnapshot === true;
  const { apiKey, baseUrl, targetMarket, cacheTtlS } = readEnv();

  if (!apiKey) {
    logger.warn('Catalog API key not configured', { reason: 'api-key-ontbreekt', gtin });
    return { marks: [], reason: 'api-key-ontbreekt' };
  }

  let gln: string | null = knownGln ?? null;
  try {
    if (!gln) {
      // Story 20.19 (AC11): mét orderBy. NEVENEFFECT, bewust aanvaard: voor een GTIN
      // met meerdere gln's kan de gekozen gln nu een ANDERE zijn dan voorheen, en
      // daarmee ook een andere cachesleutel. Die producten doen dus één keer een
      // verse catalogus-aanroep; de oude entry verloopt vanzelf binnen zijn TTL.
      // Zonder was de keuze bij een GTIN met
      // meerdere gln's niet gegarandeerd dezelfde als de gln waarmee geoogst is —
      // de sleutel wijkt dan af en de opzoeking mist stilzwijgend. Fail-open blijft
      // het gedrag, maar nu is het tenminste herhaalbaar.
      const row = await prisma.artworkImport.findFirst({
        where: { gtin, gln: { not: null } },
        select: { gln: true },
        orderBy: [{ gln: 'asc' }],
      });
      gln = row?.gln ?? null;
    }
  } catch (err) {
    logger.warn('gln lookup failed', {
      reason: 'gln-ontbreekt',
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { marks: [], reason: 'gln-ontbreekt' };
  }
  if (!gln) {
    logger.info('No gln for GTIN — declared-marks lookup skipped', { reason: 'gln-ontbreekt', gtin });
    return { marks: [], reason: 'gln-ontbreekt' };
  }

  const inMomentopname = TRADEITEM_SNAPSHOT[`${gln}-${gtin}-${targetMarket}`] !== undefined;
  // Alleen sleutels die ECHT geoogst zijn krijgen de eigen naamruimte. De eerste
  // versie gaf hem aan elk product met de vlag aan, en dat kostte een tweede
  // catalogus-aanroep plus een tweede cachesleutel voor de HELE populatie (~1870) —
  // om 442 te beschermen. Gemeten: 2 aanroepen en 2 sleutels voor een gewoon werkend
  // product. Veilig, want een momentopname-uitkomst kán alleen ontstaan voor een
  // sleutel die in de momentopname staat; de rest deelt dus niets gevaarlijks.
  const key = marksCacheKey(
    gln,
    gtin,
    targetMarket,
    catalogEnvTag(baseUrl),
    useSnapshot && inMomentopname
  );
  const cached = await marksCacheRead(key, gtin);
  if (cached && !shouldTreatCacheHitAsMiss(cached, useSnapshot, inMomentopname)) {
    marksCacheStats.hits += 1;
    return cached;
  }
  if (cached) {
    // Punt 7 uit de code review: dit was een HIT die wij bewust laten vallen. Hem als
    // miss tellen vervuilt de cache-statistiek waarmee 19.16 aantoont dat de cache
    // werkt; hij krijgt daarom een eigen teller.
    snapshotStats.staleCacheDropped += 1;
  } else {
    marksCacheStats.misses += 1;
  }

  const { xml, reason } = await fetchTradeItemXmlWithRetry(baseUrl, apiKey, gln, gtin, targetMarket);
  let result: DeclaredMarksResult;
  if (reason !== 'ok' || xml == null) {
    result = { marks: [], reason };
    // Story 20.19 (AC1/AC4) — de terugval, en UITSLUITEND na deze ene reden. De 848
    // werkende producten komen hier nooit langs: die hebben reden `ok`.
    if (reason === 'geen-tradeitem-bestand' && useSnapshot) {
      result = lookupSnapshot(gln, gtin, targetMarket) ?? result;
    }
  } else {
    // 19.16: parseDeclaredMarks is de enige aanroep die kán throwen (alle andere
    // paden zijn fail-safe). Zonder deze guard breekt één misvormde XML de
    // "NEVER throws"-belofte van deze functie — en daarmee een hele indexrun.
    let marks: DeclaredMark[] = [];
    try {
      marks = parseDeclaredMarks(xml);
    } catch (err) {
      logger.warn('Declaration parse failed', {
        reason: 'api-fout',
        gtin,
        error: err instanceof Error ? err.message : 'unknown',
      });
      result = { marks: [], reason: 'api-fout' };
      await marksCacheWrite(key, result, ttlForReason(result.reason, cacheTtlS), gtin);
      return result;
    }
    result = marks.length === 0 ? { marks: [], reason: 'lege-declaratie' } : { marks, reason: 'ok' };
  }

  await marksCacheWrite(key, result, ttlForReason(result.reason, cacheTtlS), gtin);
  return result;
}

/**
 * Wire the catalog provider as the detection-flow default — ONLY when a
 * CATALOG_API_KEY is configured. Without a key the empty provider stays the
 * default (every detection routes to review, the existing safe behaviour) and a
 * startup notice is logged. Lazy and side-effect-free at import time: call this
 * from the startup path (main.ts). Tests can still override via
 * setDeclarationProvider regardless of this.
 */
export function installCatalogDeclarationProvider(): void {
  if (process.env.CATALOG_API_KEY) {
    setDeclarationProvider(catalogDeclarationProvider);
    logger.info('Catalog T3777 declaration provider installed');
  } else {
    setDeclarationProvider(emptyDeclarationProvider);
    logger.warn('CATALOG_API_KEY not set — keeping empty declaration provider (all detections to review)');
  }
}
