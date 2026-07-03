/**
 * Overview-paneel `quarantine` (Story 15.2, AC1/AC3/AC7) — de quarantainetabel.
 *
 * Openstaande quarantainebatches (`status='quarantined'`, `closedAt IS NULL`) met
 * hun faalreden (uit `gateResults.regression.details`), het aantal kandidaten en
 * de poort-uitkomsten voor de detail-drawer (AC3, zolang 15.3 niet gemerged is).
 * De ouderdom van de oudste openstaande batch voedt de KPI (SM-5, AC7) — die
 * berekent de KPI-sub-service; dit paneel levert de rijen.
 *
 * Modulariteit (coördinatie-noot epics): één sub-service-aanroep in de route.
 * ON-READ, geen job. Best-effort: bij een leesfout een leeg paneel (geen crash).
 */

import prisma from '../../../core/db';
import { createLogger } from '../../../core/logger';

const logger = createLogger('flywheel-quarantine-panel');

/** Eén rij in de quarantainetabel. */
export interface QuarantineRow {
  batchId: string;
  /** ISO-tijdstempel waarop de batch aangemaakt werd (kolom datum). */
  createdAt: string;
  /** Aantal kandidaten in de batch. */
  candidateCount: number;
  /** Faalreden als tekst (altijd gevuld — badge is aanvullend). */
  failReason: string;
  /** Meest getroffen klassen (subtekst), leeg als onbekend. */
  mostAffectedClasses: string[];
  /** Status (altijd `quarantined` in dit paneel). */
  status: string;
  /** Poort-uitkomsten per fase voor de detail-drawer (AC3). */
  gateResults: unknown;
}

/** Het `quarantine`-paneel. */
export interface QuarantinePanel {
  rows: QuarantineRow[];
  count: number;
}

/** Hoeveel rijen het paneel maximaal meestuurt (paginering client-side). */
const MAX_ROWS = 100;

interface RegressionDetails {
  decision?: string;
  reason?: string;
  delta?: number | null;
  mode?: string;
  mostAffectedClasses?: string[];
  error?: string;
}

/**
 * Zet de regressie-details om in één menselijke faalreden-tekst. De poort-
 * faalredenen worden 1-op-1 getoond, niet geherformuleerd (glossary-eis).
 */
function formatFailReason(details: RegressionDetails | null): string {
  if (!details) return 'Kwaliteitspoort: batch in quarantaine';
  if (details.reason === 'systeem-fout') {
    return 'Kwaliteitspoort: systeemfout tijdens de regressietest';
  }
  if (details.mode === 'pp' && typeof details.delta === 'number') {
    return `Gold-set-regressietest: precisiedaling −${details.delta.toFixed(1)} pt`;
  }
  if (details.mode === 'sample' && typeof details.delta === 'number') {
    return `Gold-set-regressietest: ${details.delta} netto verslechterde samples`;
  }
  return 'Gold-set-regressietest: precisiedaling boven tolerantie';
}

/**
 * Bouw het `quarantine`-paneel (AC1/AC3): openstaande quarantainebatches met
 * faalreden, kandidaataantal en poort-uitkomsten. Nieuwste boven.
 */
export async function getQuarantinePanel(): Promise<QuarantinePanel> {
  let batches: Array<{
    id: string;
    status: string;
    createdAt: Date;
    gateResults: unknown;
    _count: { candidates: number };
  }> = [];
  try {
    batches = await prisma.promotionBatch.findMany({
      where: { status: 'quarantined', closedAt: null },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
      select: {
        id: true,
        status: true,
        createdAt: true,
        gateResults: true,
        _count: { select: { candidates: true } },
      },
    });
  } catch (err) {
    logger.error('Kon quarantaine-paneel niet lezen (best-effort leeg)', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return { rows: [], count: 0 };
  }

  const rows: QuarantineRow[] = batches.map((b) => {
    const gate = (b.gateResults as { regression?: { details?: RegressionDetails } } | null) ?? null;
    const details = gate?.regression?.details ?? null;
    return {
      batchId: b.id,
      createdAt: b.createdAt.toISOString(),
      candidateCount: b._count.candidates,
      failReason: formatFailReason(details),
      mostAffectedClasses: Array.isArray(details?.mostAffectedClasses)
        ? details!.mostAffectedClasses!.slice(0, 5)
        : [],
      status: b.status,
      gateResults: b.gateResults,
    };
  });

  logger.info('Quarantaine-paneel opgevraagd', { count: rows.length });

  return { rows, count: rows.length };
}
