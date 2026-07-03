/**
 * Batch-rollback-service (Story 13.6, AD-3/AD-5/AD-13/AD-15).
 *
 * Rollback is een TOEGESTANE, GELOGDE STATUSMUTATIE via endpoint — GÉÉN poort-
 * executie (AD-15-verduidelijking). In één transactie:
 *   1. alle gepromoveerde `ReferenceLogo`-referenties van de batch (via
 *      `reference_candidates.referenceLogoId`, status `promoted`) → `active=false`
 *      (SOFT-DELETE; nooit DELETE — het bestaande `active`-filter in de matcher-
 *      query's ml-side én API-side zorgt dat er niets meer tegen matcht, AD-3);
 *   2. batch-status `passed → rolled_back` als conditional update (0 rows = geen
 *      passed-batch → afbreken, 409 in het endpoint);
 *   3. een rollback-record (wie/wanneer/waarom — verplicht redenveld) in de
 *      batch-evidence (`gateResults.rollback`), herleidbaar (AD-13).
 *
 * Baseline-terugval (AD-5): geen aparte actie — de poort selecteert de baseline
 * als "meest recente `passed`-batch" en `rolled_back` telt nooit mee, dus de
 * baseline valt automatisch terug op de laatst overgebleven passed-batch. Wél
 * markeren we de baseline als VEROUDERD (de actieve set muteerde), zodat de
 * eerstvolgende poortrun een verse nulmeting draait.
 *
 * Her-promotie na rollback (AD-3): een latere batch die dezelfde kandidaat
 * opnieuw promoveert krijgt een NIEUW variantLabel (`auto-{batchShortId}-{seq}`
 * met een andere batch-id) — botst dus nooit met de inactieve rijen op
 * `@@unique([t3777Code, variantLabel])`. Dit is inherent aan de bestaande
 * `promotion.ts`-naamconventie; rollback hoeft er niets extra's voor te doen.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { mlClient } from '../ml-client';
import { markBaselineStale } from './baseline';
import type { GateResults } from './types';

const logger = createLogger('flywheel-rollback');

/** Fout: de batch bestaat niet (endpoint → 404). */
export class BatchNotFoundError extends Error {
  constructor(public batchId: string) {
    super(`Batch ${batchId} niet gevonden`);
    this.name = 'BatchNotFoundError';
  }
}

/** Fout: de batch is niet `passed` en kan dus niet teruggedraaid worden (endpoint → 409). */
export class BatchNotRollbackableError extends Error {
  constructor(public batchId: string, public status: string) {
    super(`Batch ${batchId} heeft status ${status} — alleen een passed-batch kan teruggedraaid worden`);
    this.name = 'BatchNotRollbackableError';
  }
}

export interface RollbackInput {
  batchId: string;
  /** Verplicht redenveld (AD-13-herleidbaarheid). */
  reason: string;
  /** Wie de rollback uitvoerde (userId), voor het evidence-record. */
  by: string;
}

export interface RollbackResult {
  batchId: string;
  /** Aantal gedeactiveerde ReferenceLogo-referenties. */
  deactivatedReferences: number;
  /** De kandidaat-ids waarvan de referentie is gedeactiveerd. */
  candidateIds: string[];
}

/**
 * Draai een gepasseerde batch als geheel terug (AD-3/AD-13/AD-15). Gooit
 * `BatchNotFoundError` (onbekende batch) of `BatchNotRollbackableError` (status ≠
 * `passed`) — het endpoint vertaalt die naar 404/409. Bij succes: alle
 * referenties inactief, batch `rolled_back`, rollback-record in de evidence.
 *
 * Best-effort ná de transactie: baseline-invalidatie (AD-5) + ml-cache-verversing
 * (zodat gedeactiveerde referenties direct uit de detectie verdwijnen). Een fout
 * daarin draait de (gecommitte) rollback niet terug.
 */
export async function rollbackBatch(input: RollbackInput): Promise<RollbackResult> {
  const { batchId, reason, by } = input;

  if (!reason || reason.trim().length === 0) {
    throw new Error('Rollback vereist een reden (AD-13-herleidbaarheid).');
  }

  const batch = await prisma.promotionBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, gateResults: true },
  });
  if (!batch) {
    throw new BatchNotFoundError(batchId);
  }
  if (batch.status !== 'passed') {
    throw new BatchNotRollbackableError(batchId, batch.status);
  }

  // De gepromoveerde kandidaten van deze batch — hun ReferenceLogo's worden
  // gedeactiveerd (AD-3). Buiten de transactie geselecteerd; de statusmutatie
  // binnen de transactie is conditioneel (passed → rolled_back).
  const promoted = await prisma.referenceCandidate.findMany({
    where: { promotionBatchId: batchId, status: 'promoted', referenceLogoId: { not: null } },
    select: { id: true, referenceLogoId: true },
  });
  const referenceLogoIds = promoted
    .map((c) => c.referenceLogoId)
    .filter((id): id is string => id !== null);
  const candidateIds = promoted.map((c) => c.id);

  const existingGateResults = (batch.gateResults as GateResults) ?? {};
  const rollbackRecord = {
    by,
    reason,
    at: new Date().toISOString(),
    deactivatedReferenceLogoIds: referenceLogoIds,
    deactivatedCandidateIds: candidateIds,
  };

  const result = await prisma.$transaction(async (tx) => {
    // 1. Batch-status passed → rolled_back als CONDITIONAL update. Een race
    //    (batch intussen al gemuteerd) raakt 0 rijen → afbreken, geen soft-delete.
    const statusUpdate = await tx.promotionBatch.updateMany({
      where: { id: batchId, status: 'passed' },
      data: {
        status: 'rolled_back',
        closedAt: new Date(),
        gateResults: {
          ...existingGateResults,
          rollback: rollbackRecord,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (statusUpdate.count === 0) {
      // Iemand anders heeft de batch net gemuteerd — behandel als niet-rollbackbaar.
      throw new BatchNotRollbackableError(batchId, 'gewijzigd');
    }

    // 2. SOFT-DELETE: alle gepromoveerde referenties van de batch active=false
    //    (nooit DELETE — herleidbaarheid + @@unique-garantie voor her-promotie).
    let deactivated = 0;
    if (referenceLogoIds.length > 0) {
      const deact = await tx.referenceLogo.updateMany({
        where: { id: { in: referenceLogoIds }, active: true },
        data: { active: false },
      });
      deactivated = deact.count;
    }

    return { deactivated };
  });

  logger.warn('Batch teruggedraaid (soft-delete + rolled_back)', {
    batchId,
    by,
    reason,
    deactivatedReferences: result.deactivated,
    candidates: candidateIds.length,
  });

  // 3. Baseline-invalidatie (AD-5): de actieve set muteerde → de eerstvolgende
  //    poortrun draait een verse nulmeting. Baseline-terugval naar de laatst
  //    overgebleven passed-batch gebeurt vanzelf (rolled_back telt niet mee).
  await markBaselineStale('rollback', by);

  // 4. ml-cache-verversing zodat gedeactiveerde referenties direct uit de
  //    detectie verdwijnen (best-effort, non-fataal).
  try {
    await mlClient.reloadTemplates();
  } catch (err) {
    logger.warn('Kon ml-templates niet verversen na rollback (non-fataal)', {
      batchId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  return {
    batchId,
    deactivatedReferences: result.deactivated,
    candidateIds,
  };
}
