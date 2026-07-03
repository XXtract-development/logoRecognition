/**
 * Hard-negative-export voor gate-trainingsmateriaal (Story 13.6, AD-12, AC 6).
 *
 * Exporteert de `hard_negatives`-verzameling als trainingsmateriaal voor de gate,
 * GEFILTERD op uitsluitend de MENSELIJKE afkeuringscategorieën
 * (`quarantaine-afkeuring`, `reviewstation-geen-keurmerk` — zie
 * `HUMAN_HARD_NEGATIVE_REASONS`). Zachte guardrail-afwijzingen
 * (cap/duplicaat/outlier) krijgen per AD-12 nooit een hard-negative-rij en zitten
 * er dus per definitie niet in; het filter is niettemin DEFENSIEF, óók al hoort
 * er geen andere rij te bestaan.
 *
 * De export bevat UITSLUITEND eigen crop-paden — nooit GS1-gidsbeelden
 * (NFR-6/conventie): de bron is `hard_negatives.cropPath`, dat altijd naar een
 * eigen crop wijst.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { HUMAN_HARD_NEGATIVE_REASONS, isHumanHardNegativeReason } from './types';

const logger = createLogger('flywheel-hard-negative-export');

/** Eén geëxporteerde hard-negative-rij (gate-trainingsmateriaal, AC 6). */
export interface HardNegativeExportRow {
  contentHash: string;
  t3777Code: string;
  cropPath: string | null;
  reason: string;
  createdAt: string;
}

/**
 * Haal de exporteerbare hard-negatives op (AC 6). Filtert op DB-niveau op de
 * menselijke reden-enum en past daarna een defensieve tweede filterlaag toe
 * (mocht een rij met een onverwachte reden zijn geschreven). Aflopend op
 * createdAt (nieuwste eerst).
 */
export async function getHardNegativeExport(): Promise<HardNegativeExportRow[]> {
  const rows = await prisma.hardNegative.findMany({
    where: { reason: { in: [...HUMAN_HARD_NEGATIVE_REASONS] } },
    orderBy: { createdAt: 'desc' },
    select: {
      contentHash: true,
      t3777Code: true,
      cropPath: true,
      reason: true,
      createdAt: true,
    },
  });

  const filtered = rows.filter((r) => isHumanHardNegativeReason(r.reason));

  if (filtered.length !== rows.length) {
    logger.warn('Hard-negative-export: defensief filter verwierp niet-menselijke redenen', {
      opgehaald: rows.length,
      doorgelaten: filtered.length,
    });
  }

  return filtered.map((r) => ({
    contentHash: r.contentHash,
    t3777Code: r.t3777Code,
    cropPath: r.cropPath,
    reason: r.reason,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
  }));
}

/** Serialiseer de export naar CSV (kop + rijen). Velden met komma's worden gequote. */
export function toCsv(rows: HardNegativeExportRow[]): string {
  const header = ['contentHash', 't3777Code', 'cropPath', 'reason', 'createdAt'];
  const escape = (v: string | null): string => {
    const s = v ?? '';
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.contentHash, r.t3777Code, r.cropPath, r.reason, r.createdAt].map(escape).join(',')
    );
  }
  return lines.join('\n');
}
