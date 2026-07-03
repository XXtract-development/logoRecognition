/**
 * Overview-paneel `kpi` (Story 15.2, AC7) — de KPI-tegelrij.
 *
 * Vijf tegels (DESIGN.md): gold-set-precisie, nieuwe referenties (promoties),
 * batches in quarantaine (+ ouderdom, SM-5), klassen aan cap, GLN-dekkingsgraad
 * (stub — Epic 18). Plus de teller "gemiste nominaties" per reden (13.2-events)
 * en "laatste succesvolle run" van de promotielus (watchdog) — die twee stuurt
 * de route al mee; de KPI-sub-service voegt precisie, promoties, quarantaine-
 * ouderdom en cap-telling toe.
 *
 * Modulariteit (coördinatie-noot epics): één sub-service-aanroep in de route.
 * ON-READ, geen job. Best-effort per veld: een leesfout degradeert dat veld naar
 * een neutrale waarde in plaats van de hele overview te breken.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';
import { getClassCap } from '../config';

const logger = createLogger('flywheel-kpi');

/** Venster (dagen) waarover "nieuwe referenties" en promotiebatches tellen. */
const PROMOTION_WINDOW_DAYS = 7;

/** De KPI-tegelrij-payload. */
export interface KpiPanel {
  /** Laatste gemeten gold-set-precisie (0–1) of null. */
  goldSetPrecision: number | null;
  /** Nieuwe actieve referenties in het venster + spreiding over klassen. */
  newReferences: {
    count: number;
    classCount: number;
    windowDays: number;
    /** Aantal gepasseerde promotiebatches in het venster. */
    passedBatches: number;
  };
  /** Openstaande quarantaines + ouderdom (SM-5). */
  quarantine: {
    count: number;
    /** ISO-tijdstempel van de oudste openstaande quarantainebatch, of null. */
    oldestAt: string | null;
    /** Ouderdom van de oudste in uren (afgerond), of null. */
    oldestAgeHours: number | null;
  };
  /** Klassen die hun per-klasse cap bereikt hebben. */
  classesAtCap: {
    count: number;
    cap: number;
  };
}

/**
 * Bereken de KPI-tegelrij (AC7). Elk deelveld is best-effort: een leesfout op één
 * bron degradeert alleen dat veld (de overige tegels blijven correct).
 */
export async function getKpiPanel(): Promise<KpiPanel> {
  const [precision, newRefs, quarantine, classesAtCap] = await Promise.all([
    getGoldSetPrecision(),
    getNewReferences(),
    getQuarantineKpi(),
    getClassesAtCap(),
  ]);

  logger.info('KPI-paneel opgevraagd', {
    precision,
    newReferences: newRefs.count,
    quarantineCount: quarantine.count,
    classesAtCap: classesAtCap.count,
  });

  return { goldSetPrecision: precision, newReferences: newRefs, quarantine, classesAtCap };
}

/** Laatste gemeten gold-set-precisie: de baseline-meting van de laatst gepasseerde batch. */
async function getGoldSetPrecision(): Promise<number | null> {
  try {
    const lastPassed = await prisma.promotionBatch.findFirst({
      where: { status: 'passed', baselineMeasurement: { not: Prisma.DbNull } },
      orderBy: { closedAt: 'desc' },
      select: { baselineMeasurement: true },
    });
    const measurement = lastPassed?.baselineMeasurement as { precision?: number } | null;
    return typeof measurement?.precision === 'number' ? measurement.precision : null;
  } catch (err) {
    logger.error('Kon gold-set-precisie niet lezen (best-effort null)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}

/** Nieuwe actieve referenties + klassen-spreiding + gepasseerde batches in het venster. */
async function getNewReferences(): Promise<KpiPanel['newReferences']> {
  const since = new Date(Date.now() - PROMOTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  try {
    const [refs, passedBatches] = await Promise.all([
      prisma.referenceLogo.findMany({
        where: { active: true, createdAt: { gte: since } },
        select: { t3777Code: true },
      }),
      prisma.promotionBatch.count({
        where: { status: 'passed', closedAt: { gte: since } },
      }),
    ]);
    const classCount = new Set(refs.map((r) => r.t3777Code)).size;
    return { count: refs.length, classCount, windowDays: PROMOTION_WINDOW_DAYS, passedBatches };
  } catch (err) {
    logger.error('Kon nieuwe-referenties-telling niet lezen (best-effort 0)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { count: 0, classCount: 0, windowDays: PROMOTION_WINDOW_DAYS, passedBatches: 0 };
  }
}

/** Openstaande quarantaines + ouderdom van de oudste (SM-5). */
async function getQuarantineKpi(): Promise<KpiPanel['quarantine']> {
  try {
    const [count, oldest] = await Promise.all([
      prisma.promotionBatch.count({ where: { status: 'quarantined', closedAt: null } }),
      prisma.promotionBatch.findFirst({
        where: { status: 'quarantined', closedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const oldestAt = oldest?.createdAt ?? null;
    const oldestAgeHours =
      oldestAt !== null
        ? Math.round((Date.now() - oldestAt.getTime()) / (60 * 60 * 1000))
        : null;
    return { count, oldestAt: oldestAt?.toISOString() ?? null, oldestAgeHours };
  } catch (err) {
    logger.error('Kon quarantaine-KPI niet lezen (best-effort 0)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { count: 0, oldestAt: null, oldestAgeHours: null };
  }
}

/** Aantal klassen dat de per-klasse cap bereikt heeft (actieve promotie-referenties). */
async function getClassesAtCap(): Promise<KpiPanel['classesAtCap']> {
  const cap = getClassCap();
  try {
    const grouped = await prisma.referenceLogo.groupBy({
      by: ['t3777Code'],
      where: { active: true },
      _count: { _all: true },
    });
    const count = grouped.filter((g) => g._count._all >= cap).length;
    return { count, cap };
  } catch (err) {
    logger.error('Kon klassen-aan-cap niet lezen (best-effort 0)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { count: 0, cap };
  }
}
