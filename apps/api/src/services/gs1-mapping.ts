/**
 * Verhaal 1.4 — omzettabel en soortbeleid (AD-2, AD-5, FR-9..FR-11).
 * Eén versiebeheerd bestand `gs1-mapping.json` (gegenereerd door scripts/generate-gs1-mapping.js):
 * per soort de GS1-velden/waarden en de opnamestand. Waarden zijn GS1-codelijstwaarden, geen interne codes.
 */
import { createHash } from 'node:crypto';
import raw from './gs1-mapping.json';
import { isGhsCode, normalizeReferenceCode } from './field-type-mapping';
import { aliasT3777Code } from './t3777-aliases';

export type Opnamestand = 'automatisch' | 'voorstel' | 'uit';

export interface Gs1Item {
  module: string;
  pad: string;
  veld: string;
  waarde: string;
  groep?: string;
}

export interface Gs1MappingEntry {
  soort: string;
  gs1: Gs1Item[];
  /** GPC-prefixen (2/4/6/8 cijfers: segment/family/class/brick) waar de soort zinvol is; leeg = overal. */
  categorieen: string[];
  opnamestand: Opnamestand;
  /** Stand waarmee de regel is gestart; afwijken vraagt een rapportverwijzing. */
  startstand: Opnamestand;
  reden?: string;
  bron: string;
  validForModelVersion: string | null;
  validForReferenceVersion: string | null;
  besluitdatum: string;
  rapportverwijzing: string | null;
}

export interface Gs1MappingFile {
  schemaVersion: number;
  entries: Gs1MappingEntry[];
  uitgesloten: { soort: string; reden: string }[];
}

export interface StandContext {
  modelVersion: string | null;
  referenceVersion: string | null;
}

export interface EffectiveStand {
  stand: Opnamestand;
  ingesteld: Opnamestand;
  /** Waarom de effectieve stand lager is dan de ingestelde, anders null. */
  beperktDoor: 'ghs' | 'versie' | null;
  policyVersion: string;
}

const file = raw as unknown as Gs1MappingFile;
const STANDEN: readonly string[] = ['uit', 'voorstel', 'automatisch'];

/** Beleidscontrole (CI): lege lijst = in orde. Ook bruikbaar op een kapot voorbeeld. */
export function validateMapping(f: Gs1MappingFile): string[] {
  const fouten: string[] = [];
  if (f.schemaVersion !== 1) fouten.push(`schemaVersion ${f.schemaVersion} onbekend`);
  for (const e of f.entries) {
    if (!STANDEN.includes(e.opnamestand)) fouten.push(`${e.soort}: onbekende opnamestand ${e.opnamestand}`);
    if (e.startstand !== 'voorstel' && e.startstand !== 'uit') fouten.push(`${e.soort}: startstand moet voorstel of uit zijn`);
    if (e.categorieen.some((c) => !/^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(c))) fouten.push(`${e.soort}: categorieen moet prefixen van 2, 4, 6 of 8 cijfers bevatten`);
    if (e.categorieen.length && isGhsCode(e.soort)) fouten.push(`${e.soort}: categorieen van een gevaarsymbool moet leeg blijven`);
    if (e.opnamestand === 'uit' && !e.reden) fouten.push(`${e.soort}: uit zonder reden`);
    if (e.opnamestand === 'automatisch' && !e.rapportverwijzing) fouten.push(`${e.soort}: automatisch zonder rapportverwijzing`);
    if (e.opnamestand !== e.startstand && !e.rapportverwijzing) fouten.push(`${e.soort}: standwijziging zonder rapportverwijzing`);
  }
  return fouten;
}
const problemen = validateMapping(file);
if (problemen.length) throw new Error(`gs1-mapping.json ongeldig: ${problemen.slice(0, 5).join('; ')}`);

const index = new Map(file.entries.map((e) => [e.soort, e]));
const RANG: Record<Opnamestand, number> = { uit: 0, voorstel: 1, automatisch: 2 };
const lager = (a: Opnamestand, b: Opnamestand): Opnamestand => (RANG[a] <= RANG[b] ? a : b);

export const getGs1Mapping = (): Gs1MappingFile => file;

/** Hash van de inhoud (whitespace-onafhankelijk): welke versie van het beleid een antwoord gebruikte. */
const POLICY_VERSION = createHash('sha256').update(JSON.stringify(file)).digest('hex');
export const policyVersion = (): string => POLICY_VERSION;

/** Zoek de regel van een soort; kent GHS0n-aliassen en de T3777-aliassen. Onbekend = null. */
export function findGs1Entry(code: string): Gs1MappingEntry | null {
  if (typeof code !== 'string' || !code.trim()) return null;
  const c = normalizeReferenceCode(code);
  return index.get(c) ?? index.get(aliasT3777Code(c)) ?? null;
}

/** Bewust uitgesloten soort (bv. NO_PICTOGRAM), te onderscheiden van een onbekende soort. */
export function findUitsluiting(code: string): { soort: string; reden: string } | null {
  if (typeof code !== 'string') return null;
  return file.uitgesloten.find((u) => u.soort === normalizeReferenceCode(code)) ?? null;
}

export function effectiveStand(entry: Gs1MappingEntry, ctx: StandContext): EffectiveStand {
  const ingesteld = entry.opnamestand;
  let stand = ingesteld;
  let beperktDoor: EffectiveStand['beperktDoor'] = null;
  if (stand !== 'uit') {
    // Gevaarsymbolen: in code vastgezet op maximaal voorstel, ongeacht het bestand.
    if (isGhsCode(entry.soort) && RANG[stand] > RANG.voorstel) {
      stand = 'voorstel';
      beperktDoor = 'ghs';
    }
    const versieKlopt =
      !!entry.validForModelVersion &&
      !!entry.validForReferenceVersion &&
      entry.validForModelVersion === ctx.modelVersion &&
      entry.validForReferenceVersion === ctx.referenceVersion;
    if (!versieKlopt) {
      stand = lager(stand, 'voorstel');
      beperktDoor ??= 'versie';
    }
  }
  return { stand, ingesteld, beperktDoor, policyVersion: POLICY_VERSION };
}

/** Regel + effectieve stand voor een soort, of null als de soort buiten de omzettabel valt. */
export function resolveSoort(code: string, ctx: StandContext) {
  const entry = findGs1Entry(code);
  if (!entry) return null;
  return { soort: entry.soort, gs1: entry.gs1, ...effectiveStand(entry, ctx) };
}
