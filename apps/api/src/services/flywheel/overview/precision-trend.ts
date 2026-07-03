/**
 * Overview-paneel `precisionTrend` (Story 15.2, AC1) — de gold-set-precisietrend.
 *
 * Eén meetpunt per AFGESLOTEN promotiebatch met een `baselineMeasurement`
 * (dat zijn de `passed`- en `rolled_back`-batches; 13.5 schrijft de meting bij
 * het passeren). Regressies zijn visueel herkenbaar: een `quarantined`-batch
 * heeft geen baseline-meting maar de poort legde de daling vast in
 * `gateResults.regression` — die punten markeren we als `regression`.
 *
 * Modulariteit (coördinatie-noot epics): dit is één sub-service-aanroep in de
 * `/overview`-route, geen logica in de route. ON-READ, geen job.
 *
 * De tolerantie-ondergrens (baseline − N pt) komt uit de config (13.5); de
 * client tekent daar de gestippelde referentielijn.
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';
import { getRegressionTolerancePp } from '../config';

const logger = createLogger('flywheel-precision-trend');

/** Eén meetpunt in de precisietrend. */
export interface PrecisionTrendPoint {
  batchId: string;
  /** ISO-tijdstempel waarop de batch afgesloten werd (x-as). */
  at: string;
  /** Gemeten gold-set-precisie (0–1), of null als de batch quarantaine inging zonder meting. */
  precision: number | null;
  /** Batch-status: passed | quarantined | rolled_back. */
  status: string;
  /** True als dit punt een regressie-alarm is (rood + afwijkende marker). */
  regression: boolean;
  /** Optionele caption (bv. baseline-herstel na rollback of de faaltekst). */
  caption: string | null;
}

/** Het `precisionTrend`-paneel. */
export interface PrecisionTrendPanel {
  points: PrecisionTrendPoint[];
  /** Laatste meting (0–1) of null bij geen meetpunt — tekstueel alternatief. */
  latestPrecision: number | null;
  /** Delta t.o.v. het vorige gemeten punt (pt), of null. */
  latestDeltaPp: number | null;
  /** De tolerantie-ondergrens in procentpunten (baseline − tolerancePp). */
  tolerancePp: number;
}

/** Hoeveel meetpunten het paneel maximaal meestuurt (chart-vriendelijk). */
const MAX_POINTS = 60;

interface RegressionResult {
  outcome?: string;
  details?: {
    decision?: string;
    /** In pp-modus de precisie-daling in procentpunten; in sample-modus netto-samples. */
    delta?: number | null;
    mode?: string;
    measurement?: { precision?: number } | null;
  };
}

interface BaselineMeasurement {
  precision?: number;
}

/**
 * Bouw het `precisionTrend`-paneel (AC1): één punt per afgesloten batch met een
 * meting, plus de gequarantaineerde batches als regressie-punt. Oplopend op
 * afsluittijd zodat de chart chronologisch loopt. Best-effort: bij een leesfout
 * een leeg paneel (geen crash — sectie-lokale degradatie).
 */
export async function getPrecisionTrend(): Promise<PrecisionTrendPanel> {
  const tolerancePp = getRegressionTolerancePp();

  let batches: Array<{
    id: string;
    status: string;
    closedAt: Date | null;
    createdAt: Date;
    baselineMeasurement: unknown;
    gateResults: unknown;
  }> = [];
  try {
    batches = await prisma.promotionBatch.findMany({
      where: { status: { in: ['passed', 'quarantined', 'rolled_back'] } },
      orderBy: [{ closedAt: 'asc' }, { createdAt: 'asc' }],
      take: MAX_POINTS,
      select: {
        id: true,
        status: true,
        closedAt: true,
        createdAt: true,
        baselineMeasurement: true,
        gateResults: true,
      },
    });
  } catch (err) {
    logger.error('Kon precisietrend niet lezen (best-effort leeg paneel)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { points: [], latestPrecision: null, latestDeltaPp: null, tolerancePp };
  }

  const points: PrecisionTrendPoint[] = batches.map((b) => {
    const baseline = (b.baselineMeasurement as BaselineMeasurement | null) ?? null;
    const gate = (b.gateResults as { regression?: RegressionResult } | null) ?? null;
    const regressionRec = gate?.regression ?? null;

    // Gemeten precisie: bij een gepasseerde batch uit de baseline-meting; bij een
    // gequarantaineerde batch uit de regressie-meting (die de daling vastlegde).
    const regDetails = regressionRec?.details ?? null;
    const measuredPrecision =
      typeof baseline?.precision === 'number'
        ? baseline.precision
        : typeof regDetails?.measurement?.precision === 'number'
          ? regDetails.measurement.precision
          : null;

    const isRegression = b.status === 'quarantined';

    let caption: string | null = null;
    if (isRegression && regDetails?.mode === 'pp' && typeof regDetails.delta === 'number') {
      caption = `−${regDetails.delta.toFixed(1)} pt → quarantaine`;
    } else if (isRegression) {
      caption = 'regressie → quarantaine';
    } else if (b.status === 'rolled_back') {
      caption = 'teruggedraaid — baseline hersteld';
    }

    return {
      batchId: b.id,
      at: (b.closedAt ?? b.createdAt).toISOString(),
      precision: measuredPrecision,
      status: b.status,
      regression: isRegression,
      caption,
    };
  });

  // Laatste meting + delta: over de punten mét een gemeten precisie.
  const measured = points.filter((p) => p.precision !== null);
  const latestPrecision = measured.length > 0 ? measured[measured.length - 1].precision : null;
  const prevPrecision =
    measured.length > 1 ? measured[measured.length - 2].precision : null;
  const latestDeltaPp =
    latestPrecision !== null && prevPrecision !== null
      ? Number(((latestPrecision - prevPrecision) * 100).toFixed(2))
      : null;

  logger.info('Precisietrend-paneel opgevraagd', {
    points: points.length,
    latestPrecision,
    tolerancePp,
  });

  return { points, latestPrecision, latestDeltaPp, tolerancePp };
}
