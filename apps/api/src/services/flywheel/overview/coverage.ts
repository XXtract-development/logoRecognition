/**
 * Overview-paneel `coverage` (Story 12.10, AC4) — automatische per-categorie
 * (`field_type`) dekkingsteller: vakken gevuld, codes ≥3-echt (herkenning-klaar),
 * gids-only-wachtend, en het gedeclareerde universe uit de MinIO-keurmerk-index.
 *
 * Ontwerpbeslissing (gemotiveerd, story Task 4): sub-service op het bestaande
 * vliegwiel-overzicht (`GET /api/v1/flywheel/overview`), precedent
 * `overview/cohort-trend.ts` (Story 16.4) — GEEN los `GET /api/v1/flywheel/coverage`-
 * endpoint en GEEN apart script. Consistent met het bestaande "elke epic levert
 * een paneel"-patroon (`overview/index.ts`): geen nieuwe route/auth-oppervlak,
 * hergebruik van de bestaande overview-caching/ophaal-conventie aan de
 * frontend-kant, en sectie-lokale degradatie (best-effort) net als de andere
 * panelen — een falende index-read hoeft de rest van het dashboard niet te breken.
 *
 * Bronnen (read-only, GEEN writes):
 *  - `reference_logos` (active, per fieldType/t3777Code) — `REAL_CROP_SOURCES`
 *    (Story 19.9, `bootstrap-run.ts`) bepaalt "echt" vs "gids".
 *  - `flywheel-index/keurmerk-etiket-index.json` (MinIO TRAINING-bucket,
 *    `build-keurmerk-index.ts`) — het gedeclareerde universe per fieldType/code
 *    (`summary.perKey`-sleutels `fieldType/code`).
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';
import { downloadTrainingObject } from '../../storage';
import { REAL_CROP_SOURCES } from '../bootstrap-run';
import { INDEX_OBJECT_KEY } from '../../../scripts/build-keurmerk-index';

const logger = createLogger('flywheel-coverage-overview');

/** Aggregaat per `field_type` (AC4). */
export interface FieldTypeCoverageRow {
  fieldType: string;
  /** Codes met ≥1 actieve referentie ("vakken gevuld"). */
  filledCodes: number;
  /** Codes met ≥3 actieve ECHTE refs (conditie C, herkenning-klaar). */
  readyCodes: number;
  /** Codes met ≥1 actieve ref maar 0 echte crops (gids-only, wacht op review). */
  guideOnlyCodes: number;
  /** Gedeclareerd universe uit de MinIO-index; `null` als de index niet leesbaar was. */
  declaredUniverseCodes: number | null;
}

export interface CoveragePanel {
  available: true;
  generatedAt: string;
  /** Alfabetisch op fieldType, zodat de output deterministisch is. */
  byFieldType: FieldTypeCoverageRow[];
  /** False als de MinIO-index niet gelezen kon worden (declaredUniverseCodes blijft dan null). */
  indexAvailable: boolean;
}

function emptyPanel(): CoveragePanel {
  return { available: true, generatedAt: new Date().toISOString(), byFieldType: [], indexAvailable: false };
}

/** Ruwe per-(fieldType, code) telling — total_active + real_active (source ∈ REAL_CROP_SOURCES). */
export interface RawCoverageRow {
  fieldType: string;
  t3777Code: string;
  totalActive: number;
  realActive: number;
}

/**
 * PURE aggregatie (testbaar zonder DB/MinIO): bouw de per-fieldType-rijen uit de
 * ruwe per-code-tellingen + het gedeclareerde universe (of `null` als de index
 * niet beschikbaar was). FieldTypes die alleen in het universe voorkomen (bv.
 * GHSSymbolDescriptionCode: 0 refs, wél gedeclareerd) verschijnen ook — met 0
 * gevulde/klare/gids-only-codes.
 */
export function buildCoverageByFieldType(
  rows: RawCoverageRow[],
  declaredUniverseByFieldType: Record<string, number> | null
): FieldTypeCoverageRow[] {
  const byFieldType = new Map<string, { filled: number; ready: number; guideOnly: number }>();
  for (const r of rows) {
    const entry = byFieldType.get(r.fieldType) ?? { filled: 0, ready: 0, guideOnly: 0 };
    if (r.totalActive >= 1) entry.filled += 1;
    if (r.realActive >= 3) entry.ready += 1;
    if (r.totalActive >= 1 && r.realActive === 0) entry.guideOnly += 1;
    byFieldType.set(r.fieldType, entry);
  }

  const fieldTypes = new Set<string>(byFieldType.keys());
  if (declaredUniverseByFieldType) {
    for (const ft of Object.keys(declaredUniverseByFieldType)) fieldTypes.add(ft);
  }

  return Array.from(fieldTypes)
    .sort((a, b) => a.localeCompare(b))
    .map((fieldType) => {
      const entry = byFieldType.get(fieldType) ?? { filled: 0, ready: 0, guideOnly: 0 };
      return {
        fieldType,
        filledCodes: entry.filled,
        readyCodes: entry.ready,
        guideOnlyCodes: entry.guideOnly,
        declaredUniverseCodes: declaredUniverseByFieldType ? declaredUniverseByFieldType[fieldType] ?? 0 : null,
      };
    });
}

/** Vorm van de gelezen index-JSON (subset — alleen wat dit paneel nodig heeft). */
interface KeurmerkIndexSummary {
  summary?: {
    perKey?: Record<string, unknown>;
  };
}

/**
 * Lees `summary.perKey` uit de MinIO-index en tel de DISTINCT codes per
 * fieldType (sleutel-formaat `${fieldType}/${code}`, zelfde canonieke ruimte als
 * `reference_logos.fieldType` + code). `null` bij elke leesfout/ontbrekend
 * bestand/corrupte JSON (best-effort — geen index is geen crash).
 */
async function loadDeclaredUniverseByFieldType(): Promise<Record<string, number> | null> {
  let buffer: Buffer | null;
  try {
    buffer = await downloadTrainingObject(INDEX_OBJECT_KEY);
  } catch (err) {
    logger.warn('Keurmerk-index kon niet gelezen worden (best-effort: universe wordt null)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
  if (!buffer) return null;

  let parsed: KeurmerkIndexSummary;
  try {
    parsed = JSON.parse(buffer.toString('utf-8')) as KeurmerkIndexSummary;
  } catch (err) {
    logger.warn('Keurmerk-index is geen geldige JSON (best-effort: universe wordt null)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }

  const perKey = parsed.summary?.perKey;
  if (!perKey || typeof perKey !== 'object') return null;

  const counts: Record<string, number> = {};
  for (const key of Object.keys(perKey)) {
    const slash = key.indexOf('/');
    if (slash <= 0) continue; // onverwacht sleutel-formaat — negeren (defensief)
    const fieldType = key.slice(0, slash);
    counts[fieldType] = (counts[fieldType] ?? 0) + 1;
  }
  return counts;
}

/**
 * Bouw het `coverage`-paneel (AC4). Aggregeert `reference_logos` (active) per
 * (fieldType, t3777Code) via twee `groupBy`'s (totaal vs echt-alleen) en
 * verrijkt met het gedeclareerde universe uit de MinIO-index. Best-effort: bij
 * een leesfout een leeg-maar-available paneel (State Patterns, net als
 * `cohort-trend.ts`).
 */
export async function getCoveragePanel(): Promise<CoveragePanel> {
  try {
    const [totals, reals, declaredUniverseByFieldType] = await Promise.all([
      prisma.referenceLogo.groupBy({
        by: ['fieldType', 't3777Code'],
        where: { active: true },
        _count: { _all: true },
      }),
      prisma.referenceLogo.groupBy({
        by: ['fieldType', 't3777Code'],
        where: { active: true, source: { in: [...REAL_CROP_SOURCES] } },
        _count: { _all: true },
      }),
      loadDeclaredUniverseByFieldType(),
    ]);

    const realByKey = new Map<string, number>();
    for (const r of reals as Array<{ fieldType: string; t3777Code: string; _count: { _all: number } }>) {
      realByKey.set(`${r.fieldType}/${r.t3777Code}`, r._count._all);
    }

    const rows: RawCoverageRow[] = (
      totals as Array<{ fieldType: string; t3777Code: string; _count: { _all: number } }>
    ).map((t) => ({
      fieldType: t.fieldType,
      t3777Code: t.t3777Code,
      totalActive: t._count._all,
      realActive: realByKey.get(`${t.fieldType}/${t.t3777Code}`) ?? 0,
    }));

    const byFieldType = buildCoverageByFieldType(rows, declaredUniverseByFieldType);

    logger.info('Coverage-paneel opgevraagd', {
      fieldTypes: byFieldType.length,
      indexAvailable: declaredUniverseByFieldType !== null,
    });

    return {
      available: true,
      generatedAt: new Date().toISOString(),
      byFieldType,
      indexAvailable: declaredUniverseByFieldType !== null,
    };
  } catch (err) {
    logger.error('Kon coverage-paneel niet lezen (best-effort leeg paneel)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return emptyPanel();
  }
}
