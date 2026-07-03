/**
 * Datakwaliteitsrapport "gevonden-niet-gedeclareerd" (Story 16.3, FR-16).
 *
 * Leesprojectie over de `found-not-declared`-events uit Story 16.1: keurmerken
 * die WÉL op een verpakking zijn gevonden maar NIET gedeclareerd zijn. Een
 * datamanager gebruikt dit om leveranciers gericht op declaratie-omissies te
 * wijzen (intern rapport — geen automatische communicatie, PRD §5-non-goal).
 *
 * ONTWERPKEUZES (bindend):
 *   - GEEN tweede confidence-drempel: de FR-16-voorwaarde (confidence ≥
 *     promotiedrempel) is al afgedwongen bij de REGISTRATIE in Story 16.1
 *     (`mapMismatchEvents`). Hier opnieuw filteren zou registratiefouten
 *     maskeren en twee drempel-implementaties laten driften. Wij lezen enkel.
 *   - COHORT-uitsluiting (Story 16.4): reguliere aggregatie sluit cohort-
 *     herkomst uit (`origin NOT LIKE 'cohort-%'`), consistent met
 *     mismatch-workload.ts en overview/mismatch-trends.ts.
 *   - GEEN schemawijziging (ARCH-2): `mismatch_events` draagt geen crop-/
 *     bronbestand-kolom. Het "bronbestand" per geval wordt DETERMINISTISCH
 *     afgeleid uit de eigen-crop-conventie `artwork-crops/{gtin}/` — een
 *     verwijzing naar eigen verwerkingsdata, nooit een gidsbeeld. Het runId
 *     (AD-13) reist mee voor herleidbaarheid naar de verwerking.
 *   - NFR-6 (hard): elk bronbestand/crop-pad passeert de reference-path-guard;
 *     een (kunstmatig) `reference-logos/`-gidspad wordt geweigerd en logt een
 *     waarschuwing — het verschijnt aantoonbaar niet in de payload.
 *
 * Bindende AD's: AD-2 (rapport leeft in apps/api; ml-service niet betrokken),
 * AD-13 (elk geval herleidbaar naar zijn event via runId).
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { sanitizeSourcePath } from './reference-path-guard';

const logger = createLogger('flywheel-data-quality-report');

/** Groepslabel voor events zonder GLN (bestaan tot Epic 18 het archief dekt). */
export const UNKNOWN_GLN_LABEL = 'onbekend';

/** Eén geval in het rapport — voldoende voor menselijke verificatie (FR-16). */
export interface DataQualityCase {
  gtin: string;
  /** T3777-keurmerkcode die wél gevonden maar niet gedeclareerd is. */
  code: string;
  /** Confidence van de vondst (≥ promotiedrempel, afgedwongen in 16.1). */
  confidence: number | null;
  /**
   * Bronbestand: eigen crop-verwijzing (`artwork-crops/{gtin}/...`), NOOIT een
   * gidsbeeld (NFR-6-guard). `null` wanneer de guard een gidspad onderschept.
   */
  sourceFile: string | null;
  /** Herleidbaarheid naar de verwerking (AD-13). */
  runId: string | null;
}

/** Eén GLN-groep in het rapport. */
export interface DataQualityGroup {
  /** GLN, of `UNKNOWN_GLN_LABEL` wanneer het event geen GLN droeg. */
  gln: string;
  cases: DataQualityCase[];
}

/** Volledig rapportmodel (JSON-weergave voor het dashboard). */
export interface DataQualityReport {
  /** Periode-ondergrens (ISO, inclusief) of null wanneer niet opgegeven. */
  from: string | null;
  /** Periode-bovengrens (ISO, exclusief) of null wanneer niet opgegeven. */
  to: string | null;
  /** Optionele GLN-filter die is toegepast, of null. */
  gln: string | null;
  totalCases: number;
  groups: DataQualityGroup[];
}

/** Parameters voor het rapport (periode + optionele GLN-filter). */
export interface DataQualityReportParams {
  /**
   * Periode-ondergrens, INCLUSIEF (`createdAt >= from`). Ongeldig/afwezig ⇒
   * geen ondergrens.
   */
  from?: Date | null;
  /**
   * Periode-bovengrens, EXCLUSIEF (`createdAt < to`). Half-open interval
   * `[from, to)` zodat aangrenzende periodes niet dubbeltellen. Ongeldig/
   * afwezig ⇒ geen bovengrens.
   */
  to?: Date | null;
  /** Optionele GLN-filter (exacte match). */
  gln?: string | null;
}

/** Eén ruwe DB-rij (found-not-declared, cohort al uitgesloten in de query). */
interface RawEventRow {
  gtin: string;
  gln: string | null;
  t3777Code: string;
  confidence: number | null;
  runId: string | null;
}

/**
 * Leid het bronbestand (eigen crop-verwijzing) af uit de stabiele event-velden.
 * De eigen crops leven onder `artwork-crops/{gtin}/` (conventie, o.a.
 * `queue_harvest.py`, `artwork-pipeline.ts`). Dit is per definitie een eigen-
 * crop-pad — nooit een gidsbeeld. De guard blijft niettemin defensief toegepast
 * (NFR-6 afdwingen, niet aannemen).
 */
function deriveSourceFile(row: RawEventRow): string | null {
  const candidate = `artwork-crops/${row.gtin}/`;
  return sanitizeSourcePath(candidate, {
    gtin: row.gtin,
    t3777Code: row.t3777Code,
    runId: row.runId,
  });
}

/**
 * Bouw het rapport op: query → groepeer per GLN → mappe naar het rapportmodel.
 *
 * Filtert op DB-niveau (type, periode, cohort-uitsluiting, optioneel GLN) zodat
 * er nooit onnodige rijen in het geheugen komen. Groepen zijn gesorteerd op GLN
 * (deterministisch; `UNKNOWN_GLN_LABEL` sorteert mee als gewone string).
 */
export async function buildDataQualityReport(
  params: DataQualityReportParams = {}
): Promise<DataQualityReport> {
  const from = params.from ?? null;
  const to = params.to ?? null;
  const gln = params.gln ?? null;

  const createdAt: { gte?: Date; lt?: Date } = {};
  if (from) createdAt.gte = from;
  if (to) createdAt.lt = to;

  const rows = (await prisma.mismatchEvent.findMany({
    where: {
      type: 'found-not-declared',
      // Cohort-herkomst uitsluiten (Story 16.4) — reguliere aggregatie.
      NOT: { origin: { startsWith: 'cohort-' } },
      ...(from || to ? { createdAt } : {}),
      ...(gln ? { gln } : {}),
    },
    orderBy: [{ gln: 'asc' }, { createdAt: 'asc' }],
    select: {
      gtin: true,
      gln: true,
      t3777Code: true,
      confidence: true,
      runId: true,
    },
  })) as RawEventRow[];

  const groupsByGln = new Map<string, DataQualityCase[]>();
  for (const row of rows) {
    const key = row.gln ?? UNKNOWN_GLN_LABEL;
    let cases = groupsByGln.get(key);
    if (!cases) {
      cases = [];
      groupsByGln.set(key, cases);
    }
    cases.push({
      gtin: row.gtin,
      code: row.t3777Code,
      confidence: row.confidence,
      sourceFile: deriveSourceFile(row),
      runId: row.runId,
    });
  }

  const groups: DataQualityGroup[] = [...groupsByGln.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((glnKey) => ({ gln: glnKey, cases: groupsByGln.get(glnKey)! }));

  logger.info('Datakwaliteitsrapport samengesteld', {
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    gln,
    groups: groups.length,
    totalCases: rows.length,
  });

  return {
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    gln,
    totalCases: rows.length,
    groups,
  };
}

/** CSV-veld-escape: velden met `"`, `,` of newline worden gequote/verdubbeld. */
function csvEscape(value: string | number | null): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Kolomkop van de CSV-export (stabiel contract voor het dashboard). */
export const DATA_QUALITY_CSV_HEADER = [
  'gln',
  'gtin',
  'code',
  'confidence',
  'sourceFile',
  'runId',
] as const;

/**
 * Serialiseer het rapport naar CSV — streaming-vriendelijk (rij-voor-rij, geen
 * volledige set opnieuw in het geheugen). Eén rij per geval, met de GLN-groep
 * als eerste kolom zodat de platte CSV per GLN gesorteerd blijft. Een leeg
 * rapport levert enkel de kopregel (geldige lege export).
 */
export function toDataQualityCsv(report: DataQualityReport): string {
  const lines: string[] = [DATA_QUALITY_CSV_HEADER.join(',')];
  for (const group of report.groups) {
    for (const c of group.cases) {
      lines.push(
        [
          csvEscape(group.gln),
          csvEscape(c.gtin),
          csvEscape(c.code),
          csvEscape(c.confidence),
          csvEscape(c.sourceFile),
          csvEscape(c.runId),
        ].join(',')
      );
    }
  }
  return lines.join('\n');
}
