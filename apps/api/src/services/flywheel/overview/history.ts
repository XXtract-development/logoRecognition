/**
 * Overview-paneel `history` (Story 15.2, AC5) — de batchhistorie voor de
 * Historie-tab in de batch-card.
 *
 * Gepasseerde én teruggedraaide batches (nieuwste boven), met de meting, of het
 * al teruggedraaid is (badge `teruggedraaid`) en de rollback-context
 * (wie/wanneer/waarom uit `gateResults.rollback`, AD-13). De rollback-actie zelf
 * loopt via het bestaande endpoint `batches/:id/rollback` (13.6); dit paneel
 * levert alleen de leesdata.
 *
 * Modulariteit (coördinatie-noot epics): één sub-service-aanroep in de route.
 * ON-READ, geen job. Best-effort: bij een leesfout een leeg paneel.
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';

const logger = createLogger('flywheel-history');

/** Eén batch in de historie. */
export interface HistoryRow {
  batchId: string;
  createdAt: string;
  closedAt: string | null;
  /** `passed` of `rolled_back`. */
  status: string;
  /** Gemeten gold-set-precisie (0–1) of null. */
  precision: number | null;
  /** True als de batch al teruggedraaid is (badge `teruggedraaid`). */
  rolledBack: boolean;
  /** Rollback-context (wie/wanneer/waarom), alleen bij rolled_back. */
  rollback: { by: string; reason: string; at: string } | null;
}

/** Het `history`-paneel. */
export interface HistoryPanel {
  rows: HistoryRow[];
  count: number;
}

const MAX_ROWS = 100;

interface RollbackRecord {
  by?: string;
  reason?: string;
  at?: string;
}

/**
 * Bouw het `history`-paneel (AC5): gepasseerde en teruggedraaide batches,
 * nieuwste boven. Een teruggedraaide batch draagt de rollback-context.
 */
export async function getHistoryPanel(): Promise<HistoryPanel> {
  let batches: Array<{
    id: string;
    status: string;
    createdAt: Date;
    closedAt: Date | null;
    baselineMeasurement: unknown;
    gateResults: unknown;
  }> = [];
  try {
    batches = await prisma.promotionBatch.findMany({
      where: { status: { in: ['passed', 'rolled_back'] } },
      orderBy: { closedAt: 'desc' },
      take: MAX_ROWS,
      select: {
        id: true,
        status: true,
        createdAt: true,
        closedAt: true,
        baselineMeasurement: true,
        gateResults: true,
      },
    });
  } catch (err) {
    logger.error('Kon batchhistorie niet lezen (best-effort leeg)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { rows: [], count: 0 };
  }

  const rows: HistoryRow[] = batches.map((b) => {
    const measurement = (b.baselineMeasurement as { precision?: number } | null) ?? null;
    const gate = (b.gateResults as { rollback?: RollbackRecord } | null) ?? null;
    const rolledBack = b.status === 'rolled_back';
    const rb = gate?.rollback ?? null;
    return {
      batchId: b.id,
      createdAt: b.createdAt.toISOString(),
      closedAt: b.closedAt?.toISOString() ?? null,
      status: b.status,
      precision: typeof measurement?.precision === 'number' ? measurement.precision : null,
      rolledBack,
      rollback:
        rolledBack && rb
          ? { by: rb.by ?? 'onbekend', reason: rb.reason ?? '', at: rb.at ?? '' }
          : null,
    };
  });

  logger.info('Historie-paneel opgevraagd', { count: rows.length });
  return { rows, count: rows.length };
}
