/**
 * Batch-afsluiten bij quarantaine-afhandeling (Story 15.3, AC4, taak 6.2).
 *
 * Zet `closedAt` op een gequarantaineerde batch zodra ÁLLE kandidaten beoordeeld
 * zijn (geen enkele meer `in_batch`). De batch-status BLIJFT `quarantined` voor
 * herleidbaarheid; `closedAt` markeert enkel de afhandeling — daardoor verdwijnt
 * de batch uit de openstaande-quarantainetabel (`closedAt IS NULL`-filter, 15.2).
 *
 * GÉÉN poortlogica (AD-15): dit muteert alleen `closedAt`. De afgekeurde
 * kandidaten zijn al `rejected` + hard-negative; de vrijgegeven kandidaten staan
 * al op `candidate` en worden door de eerstvolgende worker-run in een nieuwe batch
 * gebundeld. Deze actie start of forceert dat niet.
 *
 * Conditioneel (AD-16): `closedAt` wordt alleen gezet als de batch `quarantined`
 * én nog niet afgesloten is; anders een conflict.
 */

import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('flywheel-batch-close');

/** Fout: de batch bestaat niet (endpoint → 404). */
export class BatchCloseNotFoundError extends Error {
  constructor(public batchId: string) {
    super(`Promotiebatch ${batchId} niet gevonden`);
    this.name = 'BatchCloseNotFoundError';
  }
}

/** Fout: niet alle kandidaten zijn beoordeeld (endpoint → 409). */
export class BatchNotFullyReviewedError extends Error {
  constructor(public batchId: string, public pending: number) {
    super(`Batch ${batchId} heeft nog ${pending} onbeoordeelde kandidaten`);
    this.name = 'BatchNotFullyReviewedError';
  }
}

/** Fout: de batch is niet afsluitbaar (geen quarantained of al afgesloten) → 409. */
export class BatchNotCloseableError extends Error {
  constructor(public batchId: string, public status: string, public alreadyClosed: boolean) {
    super(`Batch ${batchId} niet afsluitbaar (status ${status}, closed ${alreadyClosed})`);
    this.name = 'BatchNotCloseableError';
  }
}

export interface BatchCloseResult {
  batchId: string;
  closedAt: string;
  /** Aantal afgekeurde kandidaten (→ hard-negative). */
  rejected: number;
  /** Aantal vrijgegeven kandidaten (→ nieuwe batch, opnieuw door de poort). */
  released: number;
}

/**
 * Sluit een gequarantaineerde batch af (AC4). Gooit `BatchCloseNotFoundError`
 * (404), `BatchNotCloseableError`/`BatchNotFullyReviewedError` (409). Draait GEEN
 * poortlogica (AD-15).
 */
export async function closeBatch(batchId: string): Promise<BatchCloseResult> {
  const batch = await prisma.promotionBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, closedAt: true },
  });
  if (!batch) {
    throw new BatchCloseNotFoundError(batchId);
  }
  if (batch.status !== 'quarantined' || batch.closedAt !== null) {
    throw new BatchNotCloseableError(batchId, batch.status, batch.closedAt !== null);
  }

  // Tel de kandidaat-statussen. Nog `in_batch` = onbeoordeeld → mag niet afsluiten.
  const grouped = await prisma.referenceCandidate.groupBy({
    by: ['status'],
    where: { promotionBatchId: batchId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;

  // Vrijgegeven kandidaten hebben `promotionBatchId` losgekoppeld en verschijnen
  // dus NIET meer in bovenstaande groepering. Tel ze via de gelogde vrijgave in de
  // evidence: eenvoudiger is het aantal afgekeurde (rejected, nog gekoppeld) direct
  // te tellen en de vrijgegeven af te leiden uit de oorspronkelijke batchgrootte.
  const pending = counts['in_batch'] ?? 0;
  if (pending > 0) {
    throw new BatchNotFullyReviewedError(batchId, pending);
  }

  const rejected = counts['rejected'] ?? 0;
  // Vrijgegeven = kandidaten die deze batch ooit claimde maar nu losgekoppeld zijn.
  // We tellen ze via de status-transitie-log (bron `vrijgave` met undoBatchId===batchId).
  const released = await countReleasedFromBatch(batchId);

  const closedAt = new Date();
  const updated = await prisma.promotionBatch.updateMany({
    where: { id: batchId, status: 'quarantined', closedAt: null },
    data: { closedAt },
  });
  if (updated.count === 0) {
    // Race: iemand sloot de batch net af.
    throw new BatchNotCloseableError(batchId, batch.status, true);
  }

  logger.info('Quarantainebatch afgesloten (closedAt gezet, status blijft quarantined)', {
    batchId,
    rejected,
    released,
  });

  return { batchId, closedAt: closedAt.toISOString(), rejected, released };
}

/**
 * Tel de vrijgegeven kandidaten die oorspronkelijk bij deze batch hoorden. Na
 * vrijgave staan ze op `candidate` met `promotionBatchId = null`, maar hun
 * evidence draagt `undoBatchId === batchId`. Prisma kan niet direct op een JSON-
 * sleutel filteren over alle providers heen; we lezen de losgekoppelde recente
 * kandidaten en tellen de match. Best-effort (alleen voor de samenvattingstekst).
 */
async function countReleasedFromBatch(batchId: string): Promise<number> {
  const rows = await prisma.referenceCandidate.findMany({
    where: { status: 'candidate', promotionBatchId: null },
    select: { evidence: true },
  });
  let n = 0;
  for (const r of rows) {
    const ev = (r.evidence as Record<string, unknown>) ?? {};
    if (ev.undoBatchId === batchId) n += 1;
  }
  return n;
}
