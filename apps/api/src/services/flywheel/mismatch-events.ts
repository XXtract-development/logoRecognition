/**
 * Mismatch-registratie-service — referentie-vliegwiel (Story 16.1, FR-14).
 *
 * Legt per verwerking-met-declaratie de uitkomst van elke gedeclareerde code vast
 * plus elke hoogbetrouwbare niet-gedeclareerde vondst. Twee waardevolste
 * datastromen van het vliegwiel die anders verdampen (Story 16.1).
 *
 * Ontwerp:
 *   - `mapMismatchEvents()` is een PURE functie (declared[], crosscheck-uitkomst,
 *     actieve-klassen-set, drempel-resolver → event-rijen). Unit-testbaar zonder
 *     DB en zonder side-effects (AC2/AC6).
 *   - `registerCrosscheckMismatchEvents()` en `registerKruischeckMismatchEvents()`
 *     zijn de persist-functies, elk achter zijn eigen vlag (AD-8, AC3).
 *
 * BINDENDE AD's:
 *   AD-2   `apps/api` is exclusief eigenaar van `mismatch_events`.
 *   AD-8   Vlag-scoping: crosscheck-pad onder `FLYWHEEL_NOMINATION_ENABLED`;
 *          kruischeck-pad onder `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` — met die
 *          vlag uit schrijft het kruischeck-pad NIETS.
 *   AD-13  Herleidbaarheid: elk event draagt `origin`/`runId`.
 *
 * De registratie hangt AAN de bestaande crosscheck-uitkomst — ze herberekent geen
 * vergelijking (guardrail "één instrumentatiepunt"). `crosscheckDetections` blijft
 * byte-gelijk (8-3O-erfenis); dit is aanvullend, best-effort werk.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import {
  isNominationEnabled,
  isKruischeckNominationEnabled,
} from './config';
import { resolvePromotionThreshold } from './thresholds';
import type { CrosscheckResult } from '../artwork-crosscheck';

const logger = createLogger('flywheel-mismatch-events');

/** De volledige uitkomst-typeset (Structural Seed). Vaste-waardenset (VarChar). */
export type MismatchEventType =
  | 'confirmed'
  | 'declared-not-found'
  | 'not-supported'
  | 'found-not-declared';

/** Eén te schrijven mismatch-event (pure-mapping-output; nog geen DB-rij). */
export interface MismatchEventRow {
  gtin: string;
  gln: string | null;
  t3777Code: string;
  type: MismatchEventType;
  /** Alleen gezet voor vondsten (confirmed/found-not-declared); anders null. */
  confidence: number | null;
  origin: string;
  runId: string | null;
}

/**
 * Een niet-gedeclareerde vondst zoals die uit de crosscheck komt (reviewItem-reden
 * "gevonden maar niet verwacht"). Draagt de confidence + methode zodat de
 * `found-not-declared`-drempelcheck per methode kan gebeuren.
 */
export interface UndeclaredFinding {
  t3777Code: string;
  confidence: number;
  method?: string;
}

/** Invoer voor de pure mapping (geen DB, geen env-reads binnenin). */
export interface MapMismatchInput {
  gtin: string;
  gln: string | null;
  /** De GS1-declaratie (codes) van de GTIN — leeg = niets te registreren. */
  declared: string[];
  /**
   * Bevestigde codes: gedeclareerd én met voldoende-vertrouwen gevonden
   * (crosscheck `autoAccepted`, of kruischeck CONFIRMED). Subset van `declared`.
   */
  confirmedCodes: string[];
  /**
   * Niet-gedeclareerde hoogbetrouwbare vondsten (crosscheck "gevonden maar niet
   * verwacht"). Elk telt alléén als `confidence ≥ promotiedrempel<methode>`.
   */
  undeclaredFindings: UndeclaredFinding[];
  /**
   * Set van T3777-codes waarvoor een ACTIEVE referentieklasse bestaat
   * (`reference_logos WHERE active=true`). Een gedeclareerde code die hier NIET in
   * zit → `not-supported` (het model kan die klasse niet detecteren).
   */
  activeClasses: Set<string>;
  origin: string;
  runId: string | null;
  /**
   * Effectieve promotiedrempel per methode (gedeelde resolver, async). Wordt buiten
   * de pure functie geresolved zodat de mapping puur blijft. `undefined` methode
   * valt onder de strengste (classifier), afgehandeld in de resolver.
   */
  thresholdFor: (method?: string) => number;
}

/**
 * PURE mapping: van declaratie + crosscheck-uitkomst naar mismatch-event-rijen.
 *
 * Per gedeclareerde code exact één uitkomst:
 *   - bevestigd (in `confirmedCodes`)                    → `confirmed`
 *   - niet bevestigd, geen actieve referentieklasse      → `not-supported`
 *   - niet bevestigd, wél een actieve referentieklasse   → `declared-not-found`
 * Plus per niet-gedeclareerde vondst boven de methode-drempel → `found-not-declared`.
 *
 * `not-supported` gaat vóór `declared-not-found`: een code die het model
 * überhaupt niet kan herkennen is geen "niet gevonden", maar "niet ondersteund"
 * (zo blijft de FR-14-ratio bevestigd/niet-gevonden zuiver).
 */
export function mapMismatchEvents(input: MapMismatchInput): MismatchEventRow[] {
  const {
    gtin,
    gln,
    declared,
    confirmedCodes,
    undeclaredFindings,
    activeClasses,
    origin,
    runId,
    thresholdFor,
  } = input;

  const rows: MismatchEventRow[] = [];
  const confirmedSet = new Set(confirmedCodes);

  // Per gedeclareerde code exact één uitkomst.
  for (const code of declared) {
    if (confirmedSet.has(code)) {
      rows.push({ gtin, gln, t3777Code: code, type: 'confirmed', confidence: null, origin, runId });
    } else if (!activeClasses.has(code)) {
      rows.push({ gtin, gln, t3777Code: code, type: 'not-supported', confidence: null, origin, runId });
    } else {
      rows.push({ gtin, gln, t3777Code: code, type: 'declared-not-found', confidence: null, origin, runId });
    }
  }

  // Per hoogbetrouwbare niet-gedeclareerde vondst → found-not-declared.
  // Drempelcheck per methode: alleen confidence ≥ promotiedrempel telt (FR-16-
  // voorwaarde). Lage-confidence-vondsten produceren GEEN rij.
  const declaredSet = new Set(declared);
  for (const finding of undeclaredFindings) {
    // Defensief: een vondst die tóch gedeclareerd is hoort hier niet (dubbeltelling).
    if (declaredSet.has(finding.t3777Code)) continue;
    if (finding.confidence < thresholdFor(finding.method)) continue;
    rows.push({
      gtin,
      gln,
      t3777Code: finding.t3777Code,
      type: 'found-not-declared',
      confidence: finding.confidence,
      origin,
      runId,
    });
  }

  return rows;
}

/** Set van T3777-codes met een actieve referentieklasse (`not-supported`-bron). */
export async function loadActiveClasses(): Promise<Set<string>> {
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true },
    select: { t3777Code: true },
    distinct: ['t3777Code'],
  });
  return new Set(rows.map((r) => r.t3777Code));
}

/**
 * Resolveer de effectieve promotiedrempel voor elke methode die in de
 * niet-gedeclareerde vondsten voorkomt (gedeelde resolver, incl. UI-override) en
 * geef een synchrone lookup terug voor de pure mapping. Detecties zonder methode
 * en onbekende methoden vallen via de resolver onder de strengste (classifier).
 */
async function buildThresholdLookup(
  findings: UndeclaredFinding[]
): Promise<(method?: string) => number> {
  const methods = new Set<string | undefined>(findings.map((f) => f.method));
  const resolved = new Map<string | undefined, number>();
  for (const m of methods) {
    resolved.set(m, await resolvePromotionThreshold(m));
  }
  const fallback = await resolvePromotionThreshold(undefined);
  return (method?: string) => resolved.get(method) ?? fallback;
}

/** Persisteer de rijen (createMany, geen dedup — per-run-observaties, AD-13). */
async function persistRows(rows: MismatchEventRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await prisma.mismatchEvent.createMany({
    data: rows.map((r) => ({
      gtin: r.gtin,
      gln: r.gln,
      t3777Code: r.t3777Code,
      type: r.type,
      confidence: r.confidence,
      origin: r.origin,
      runId: r.runId,
    })),
  });
  return result.count;
}

/** Gedeelde invoer voor beide registratie-paden. */
export interface RegisterMismatchInput {
  gtin: string;
  gln: string | null;
  declared: string[];
  confirmedCodes: string[];
  undeclaredFindings: UndeclaredFinding[];
  runId?: string | null;
}

/**
 * Interne registratie: resolve actieve klassen + drempels, map, persist. Gedeeld
 * door beide paden — de vlagcheck en de herkomst zitten in de publieke wrappers.
 */
async function register(
  input: RegisterMismatchInput,
  origin: string
): Promise<number> {
  // Zonder declaratie is er niets te registreren (een lege declaratie door een
  // fail-safe-fout is géén "alles niet-gevonden" — guardrail 8-3D/12.8-AC2).
  // De aanroeper levert `declared` alleen bij reason `ok`/`lege-declaratie`; een
  // lege lijst hier betekent simpelweg geen gedeclareerde codes.
  if (input.declared.length === 0 && input.undeclaredFindings.length === 0) {
    return 0;
  }

  const [activeClasses, thresholdFor] = await Promise.all([
    loadActiveClasses(),
    buildThresholdLookup(input.undeclaredFindings),
  ]);

  const rows = mapMismatchEvents({
    gtin: input.gtin,
    gln: input.gln,
    declared: input.declared,
    confirmedCodes: input.confirmedCodes,
    undeclaredFindings: input.undeclaredFindings,
    activeClasses,
    origin,
    runId: input.runId ?? null,
    thresholdFor,
  });

  const count = await persistRows(rows);
  logger.info('Mismatch-events geregistreerd', {
    gtin: input.gtin,
    origin,
    runId: input.runId ?? null,
    written: count,
  });
  return count;
}

/**
 * Leid de registratie-invoer af uit een bestaande `crosscheckDetections`-uitkomst
 * — hergebruikt de reeds-berekende vergelijking (guardrail "één
 * instrumentatiepunt"), herberekent niets.
 *
 *   autoAccepted                             → confirmedCodes
 *   reviewItems "gevonden maar niet verwacht" → undeclaredFindings (drempel later)
 * "verwacht maar niet gevonden" en "onder drempel" leiden we NIET uit de
 * reviewItem-redenen af; de mapping bepaalt declared-not-found/not-supported
 * rechtstreeks uit `declared \ confirmedCodes` + de actieve-klassen-set. Dat is
 * robuuster dan reden-strings parsen.
 */
export function crosscheckResultToRegisterInput(
  gtin: string,
  gln: string | null,
  declared: string[],
  result: CrosscheckResult,
  runId?: string | null
): RegisterMismatchInput {
  const declaredSet = new Set(declared);
  const undeclaredFindings: UndeclaredFinding[] = result.reviewItems
    .filter(
      (item) =>
        typeof item.confidence === 'number' && !declaredSet.has(item.t3777Code)
    )
    .map((item) => ({
      t3777Code: item.t3777Code,
      confidence: item.confidence as number,
      method: item.method,
    }));

  return {
    gtin,
    gln,
    declared,
    confirmedCodes: result.autoAccepted.map((d) => d.t3777Code),
    undeclaredFindings,
    runId: runId ?? null,
  };
}

/**
 * CROSSCHECK-pad — registreer onder de HOOFDvlag (`FLYWHEEL_NOMINATION_ENABLED`,
 * AD-8). Vlag uit → nul writes (byte-gelijk aan vandaag). Best-effort: een fout
 * hier mag de detectie-job niet laten falen (registratie is aanvullend werk).
 */
export async function registerCrosscheckMismatchEvents(
  input: RegisterMismatchInput
): Promise<number> {
  if (!isNominationEnabled()) return 0;
  try {
    return await register(input, 'crosscheck');
  } catch (err) {
    logger.error('Mismatch-registratie (crosscheck) faalde (non-fataal)', {
      gtin: input.gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 0;
  }
}

/**
 * KRUISCHECK-pad — registreer onder `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`
 * (die óók de hoofdvlag eist, AD-8). Met die vlag uit schrijft dit pad NIETS en
 * blijft het 12.8-verdict-responsecontract ongewijzigd (AC3).
 *
 * KOPPEL-KLAAR: Story 12.8 (verify-flow) bestaat nog niet op deze branch. Roep
 * deze functie aan NÁ het samenstellen van de verdict-response (nooit ervóór — de
 * response mag niet van de registratie afhangen). Verdict→confirmedCodes-mapping
 * aan de aanroeperskant: CONFIRMED-verdicts → `confirmedCodes`; de niet-bevestigde
 * gedeclareerde codes komen automatisch als declared-not-found/not-supported uit
 * de mapping. Zie het Dev Agent Record van Story 16.1 (taak 4/5).
 */
export async function registerKruischeckMismatchEvents(
  input: RegisterMismatchInput
): Promise<number> {
  if (!isKruischeckNominationEnabled()) return 0;
  try {
    return await register(input, 'kruischeck');
  } catch (err) {
    logger.error('Mismatch-registratie (kruischeck) faalde (non-fataal)', {
      gtin: input.gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 0;
  }
}

/**
 * COHORT-pad (Story 16.4) — registreer de uitkomst van één cohort-GTIN met de
 * herkomst `cohort-<runId>`. GEEN vlag: het controle-cohort IS het meetinstrument
 * (SM-3), dus de events MOETEN geschreven worden ongeacht de nominatie-vlaggen —
 * anders is er niets te meten. De `cohort-`-prefix zorgt dat alle reguliere
 * aggregaties (16.1-trend, 16.2-werkvoorraad, 16.3-rapport) deze events via hun
 * `origin NOT LIKE 'cohort-%'`-filter uitsluiten, zodat een maandelijkse cohortrun
 * de reguliere stromen niet vervuilt (guardrail "cohort-events scheiden").
 *
 * Best-effort: een fout hier mag de cohortrun niet laten falen (de run gaat door
 * met de volgende GTIN; deze GTIN telt als uitval, niet als "alles niet-gevonden").
 *
 * `runId` is verplicht (de cohort-run-id): elk meetpunt is herleidbaar naar zijn
 * run (AD-13). De volledige herkomst wordt `cohort-<runId>`.
 */
export async function registerCohortMismatchEvents(
  input: RegisterMismatchInput & { runId: string }
): Promise<number> {
  const origin = `cohort-${input.runId}`;
  try {
    return await register({ ...input, runId: input.runId }, origin);
  } catch (err) {
    logger.error('Mismatch-registratie (cohort) faalde (non-fataal)', {
      gtin: input.gtin,
      runId: input.runId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 0;
  }
}
