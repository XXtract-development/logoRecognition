/**
 * Verhaal 1.5 — GS1-blok bouwen (AD-6, FR-5..FR-8): ruwe classificatie-uitkomsten + omzettabel (1.4) -> logoResults v1.
 * Pure functie; geen netwerk, geen database. Waarden komen uitsluitend uit de omzettabel.
 */
import Ajv from 'ajv';
import schema from '../../schemas/logoResults.v1.json';
import { SCORE_KINDS } from '../score-kinds';
import { getThresholdForMethod } from '../artwork-crosscheck';
import { policyVersion, resolveSoort } from '../gs1-mapping';
import { isGhsCode, normalizeReferenceCode } from '../field-type-mapping';

/** sha256 van logoResults.v1.json; consumenten pinnen deze (zie logoResults.v1.sha256 en de API-specificatie). */
export const LOGO_RESULTS_SCHEMA_SHA256 = '75d9e51839a310a6ecb549375a212f00fa16200e25f13fede0610429eb18abd7';

export type Stand = 'automatisch' | 'voorstel' | 'afgewezen';
export interface RawDetection {
  bbox: { x: number; y: number; width: number; height: number };
  t3777_code: string; confidence: number; method: string;
  uncertain?: boolean; requires_review?: boolean; reference_version?: string | null;
  [k: string]: unknown;
}
export interface LogoItem {
  soort: string; uitkomststand: Stand; zekerheid: number; bbox: [number, number, number, number];
  gs1: { module: string; pad: string; veld: string; waarde: string }[]; groep?: string;
  bewijs: {
    methode: string; zekerheidssoort?: string; drempel: number; referentieversie: string | null;
    detectie: number; redenen: string[]; markeringen: string[];
  };
}
export interface LogoResults {
  schemaVersion: '1'; scanId: string; productId?: string; imageHash: string;
  status: 'ok' | 'partial' | 'failed' | 'skipped'; reason?: string;
  modelVersion: string; referenceVersion: string; policyVersion: string; signaalwoord?: 'DANGER' | 'WARNING';
  detections: RawDetection[]; items: LogoItem[];
}
export interface BuildInput {
  scanId: string; productId?: string; imageHash: string; status: LogoResults['status']; reason?: string;
  modelVersion?: string | null; signalWord?: string; width: number; height: number; detections: RawDetection[];
}
type Resolver = typeof resolveSoort;

const UNKNOWN = 'unknown';
const validate = new Ajv({ strict: true }).compile(schema);

/** Lege lijst = geldig. */
export function validateLogoResults(value: unknown): string[] {
  return validate(value) ? [] : (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}`);
}

export function buildLogoResults(input: BuildInput, resolve: Resolver = resolveSoort): LogoResults {
  const { width, height } = input;
  // Canonical order (zekerheid desc, then box and code) so the same set of detections always gives the same bytes.
  const detections = [...input.detections].sort((a, b) =>
    b.confidence - a.confidence || a.bbox.x - b.bbox.x || a.bbox.y - b.bbox.y || a.bbox.width - b.bbox.width ||
    a.bbox.height - b.bbox.height || (a.t3777_code < b.t3777_code ? -1 : a.t3777_code > b.t3777_code ? 1 : 0));
  const modelVersion = input.modelVersion || null;
  const signaalwoord = input.signalWord === 'DANGER' || input.signalWord === 'WARNING' ? input.signalWord : undefined;
  const refs = [...new Set(detections.map(d => d.reference_version).filter((v): v is string => !!v))].sort();

  // Per soort de beste detectie (hoogste zekerheid; bij gelijke zekerheid de eerste in invoervolgorde).
  const best = new Map<string, { item: LogoItem; groepen: Map<string, string> }>();
  detections.forEach((d, index) => {
    const code = normalizeReferenceCode(d.t3777_code);
    const r = resolve(code, { modelVersion, referenceVersion: d.reference_version ?? null });
    if (!r || r.stand === 'uit') return; // buiten de tabel of uit: alleen ruwe detectie
    const prev = best.get(r.soort);
    if (prev && prev.item.zekerheid >= d.confidence) return;
    const drempel = getThresholdForMethod(d.method);
    const redenen: string[] = [];
    if (r.ingesteld === 'voorstel') redenen.push('tabelstand_voorstel');
    if (r.beperktDoor === 'ghs') redenen.push('ghs_plafond');
    if (r.beperktDoor === 'versie') redenen.push('versie_wijkt_af');
    if (d.confidence < drempel) redenen.push('onder_drempel');
    if (d.uncertain === true || d.requires_review === true) redenen.push('twijfelachtig');
    // A missed region may have held a contradicting logo, so nothing in a partial scan is automatic.
    if (input.status === 'partial') redenen.push('classificatie_onvolledig');
    const markeringen = isGhsCode(r.soort) && !signaalwoord ? ['signaalwoord ontbreekt'] : [];
    const item: LogoItem = {
      soort: r.soort,
      uitkomststand: r.stand === 'automatisch' && !redenen.some(x => x !== 'tabelstand_voorstel') ? 'automatisch' : 'voorstel',
      zekerheid: d.confidence,
      bbox: [d.bbox.x / width, d.bbox.y / height, (d.bbox.x + d.bbox.width) / width, (d.bbox.y + d.bbox.height) / height],
      gs1: r.gs1.map(({ module, pad, veld, waarde }) => ({ module, pad, veld, waarde })),
      bewijs: { methode: d.method, drempel, referentieversie: d.reference_version ?? null, detectie: index, redenen, markeringen },
    };
    const kind = SCORE_KINDS[d.method];
    if (kind) item.bewijs.zekerheidssoort = kind;
    const groep = r.gs1.find(g => g.groep)?.groep;
    if (groep) item.groep = groep;
    best.set(r.soort, { item, groepen: new Map(r.gs1.filter(g => g.groep).map(g => [`${g.groep}|${g.veld}`, g.waarde])) });
  });

  const items = [...best.values()].sort((a, b) => (a.item.soort < b.item.soort ? -1 : a.item.soort > b.item.soort ? 1 : 0));
  // Tegenstrijdig: dezelfde groep en hetzelfde veld met een andere waarde (bijv. twee Nutri-Score-letters).
  for (const a of items) {
    for (const b of items) {
      if (a === b) continue;
      for (const [key, waarde] of a.groepen) {
        const other = b.groepen.get(key);
        if (other !== undefined && other !== waarde && !a.item.bewijs.redenen.includes('tegenstrijdig')) {
          a.item.bewijs.redenen.push('tegenstrijdig');
          a.item.uitkomststand = 'voorstel';
        }
      }
    }
  }

  const out: LogoResults = {
    schemaVersion: '1', scanId: input.scanId, imageHash: input.imageHash, status: input.status,
    modelVersion: modelVersion ?? UNKNOWN, referenceVersion: refs.join(',') || UNKNOWN, policyVersion: policyVersion(),
    detections, items: items.map(x => x.item),
  };
  if (input.productId) out.productId = input.productId;
  if (input.reason) out.reason = input.reason;
  if (signaalwoord) out.signaalwoord = signaalwoord;
  return out;
}
