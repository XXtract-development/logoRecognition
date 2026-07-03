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
import { createLogger } from '../core/logger';

const logger = createLogger('t3777-declarations');

/** Distinct, log-stable reasons (decision 3). */
export type DeclarationReason =
  | 'ok'
  | 'api-key-ontbreekt'
  | 'gln-ontbreekt'
  | '404-mogelijk-TM-mismatch'
  | 'api-fout'
  | 'lege-declaratie';

export interface DeclarationResult {
  codes: string[];
  reason: DeclarationReason;
}

/** Hard cap on the response body we will buffer/parse (self-review: huge XML). */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MiB

/** fetch timeout (self-review: a hung catalog must not stall the worker). */
const FETCH_TIMEOUT_MS = 10_000;

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
  const re = /<(?:[\w.-]+:)?packagingMarkedLabelAccreditationCode[^>]*>([^<]+)</g;
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
type FetchXmlReason = 'ok' | '404-mogelijk-TM-mismatch' | 'api-fout';

/**
 * Fetch the raw trade-item XML. Distinguishes 404 (likely TM mismatch) from any
 * other error so the reasons stay separate. Returns the body on success, never
 * throws. Shared by the T3777 crosscheck (parseT3777Codes) and the label-prior
 * (parseDeclaredMarks) so both go through one cached, fail-safe catalog path.
 */
async function fetchTradeItemXml(
  baseUrl: string,
  apiKey: string,
  gln: string,
  gtin: string,
  tm: string
): Promise<{ xml: string | null; reason: FetchXmlReason }> {
  const url = `${baseUrl}/api/tradeitemxml/${gln}-${gtin}-${tm}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
      signal: controller.signal,
    });
  } catch (err) {
    // network error / timeout (AbortError) — never throw, never log the key/URL
    logger.warn('Catalog declaration fetch failed', {
      reason: 'api-fout',
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { xml: null, reason: 'api-fout' };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    logger.info('Catalog declaration not found', { reason: '404-mogelijk-TM-mismatch', gtin, tm });
    return { xml: null, reason: '404-mogelijk-TM-mismatch' };
  }

  if (response.status >= 400) {
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
}

/** GS1 declaration element (XML local-name) → GS1 codelist name (fieldType). */
const MARK_FIELDS: Array<{ tag: string; fieldType: string }> = [
  { tag: 'packagingMarkedLabelAccreditationCode', fieldType: 'PackagingMarkedLabelAccreditationCode' },
  { tag: 'dietTypeCode', fieldType: 'DietTypeCode' },
  { tag: 'nutritionalScore', fieldType: 'NutritionalScore' },
];

/**
 * Namespace-agnostic parse on local-name for every recognised mark element.
 * Union over all layers, trim, uppercase, dedup per (fieldType, code).
 */
export function parseDeclaredMarks(xml: string): DeclaredMark[] {
  const seen = new Set<string>();
  const out: DeclaredMark[] = [];
  for (const { tag, fieldType } of MARK_FIELDS) {
    const re = new RegExp(`<(?:[\\w.-]+:)?${tag}[^>]*>([^<]+)<`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const code = m[1].trim().toUpperCase();
      if (!code) continue;
      const k = `${fieldType}:${code}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ code, fieldType });
    }
  }
  return out;
}

/** Separate cache namespace from the T3777-only crosscheck cache. */
function marksCacheKey(gln: string, gtin: string, tm: string): string {
  return `marks:${gln}:${gtin}:${tm}`;
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
      return { marks: parsed.marks, reason: parsed.reason ?? 'ok' };
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
 * Resolve the declared GS1 marks for a GTIN (all sporen). Mirrors
 * resolveDeclarations' fail-safe order; NEVER throws. Returns marks + a distinct
 * reason so an empty prior never silently looks like "no data".
 */
export async function resolveDeclaredMarks(gtin: string): Promise<DeclaredMarksResult> {
  const { apiKey, baseUrl, targetMarket, cacheTtlS } = readEnv();

  if (!apiKey) {
    logger.warn('Catalog API key not configured', { reason: 'api-key-ontbreekt', gtin });
    return { marks: [], reason: 'api-key-ontbreekt' };
  }

  let gln: string | null = null;
  try {
    const row = await prisma.artworkImport.findFirst({
      where: { gtin, gln: { not: null } },
      select: { gln: true },
    });
    gln = row?.gln ?? null;
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

  const key = marksCacheKey(gln, gtin, targetMarket);
  const cached = await marksCacheRead(key, gtin);
  if (cached) return cached;

  const { xml, reason } = await fetchTradeItemXml(baseUrl, apiKey, gln, gtin, targetMarket);
  let result: DeclaredMarksResult;
  if (reason !== 'ok' || xml == null) {
    result = { marks: [], reason };
  } else {
    const marks = parseDeclaredMarks(xml);
    result = marks.length === 0 ? { marks: [], reason: 'lege-declaratie' } : { marks, reason: 'ok' };
  }

  await marksCacheWrite(key, result, cacheTtlS, gtin);
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
