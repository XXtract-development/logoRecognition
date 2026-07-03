/**
 * Kandidaat-beslissing bij quarantaine-afhandeling (Story 15.3, AC2/AC3, FR-18,
 * AD-12/AD-13/AD-15/AD-16).
 *
 * De datamanager keurt per kandidaat van een AFGESLOTEN (gequarantaineerde) batch
 * af of geeft hem vrij. Drie beslissingen op één endpoint:
 *
 *   - `afkeuren`  → conditional update `in_batch → rejected`; `hard_negatives`-
 *                   INSERT met de BESTAANDE kandidaat-`contentHash` (AD-14 —
 *                   nooit zelf hashen); gold-set-aanwas via de HERBRUIKBARE
 *                   14.1-service (`recordReviewDecision`, bron `quarantaine`,
 *                   label VALS). Menselijke afkeuring = hard-negative (AD-12), met
 *                   de canonieke reden `quarantaine-afkeuring` (13.6-enum).
 *   - `vrijgeven` → conditional update `in_batch → candidate` + `promotionBatchId`
 *                   losgekoppeld (claim-semantiek AD-15). Het endpoint bundelt
 *                   NIETS en draait GEEN poortlogica — de eerstvolgende worker-run
 *                   pakt de vrijgegeven kandidaat op in een NIEUWE batch die de
 *                   volledige poort opnieuw doorloopt.
 *   - `undo`      → spiegelt de 14.1-undo: bij een afgekeurde kandidaat de hard-
 *                   negative verwijderen + het gold-set-record intrekken
 *                   (self-tombstone), status terug naar `in_batch`; bij een
 *                   vrijgegeven kandidaat `candidate → in_batch` terug — mits nog
 *                   niet door een worker-run geclaimd (anders conflict).
 *
 * KRITIEK — 409-regel (AD-16): beslissen kan ALLEEN op kandidaten van een batch
 * die NIET meer verwerkt wordt. Een kandidaat `in_batch` in een `pending`-batch is
 * "in verwerking" → `CandidateBatchProcessingError` (endpoint → HTTP 409). Zo
 * kunnen de dashboard-beslissing en de nachtelijke worker elkaars beslissing nooit
 * overschrijven. Alle status-overgangen zijn conditional updates (0 rows =
 * conflict, nooit blind overschrijven).
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { recordReviewDecision, withdrawGoldSetRecord } from './gold-set';

const logger = createLogger('flywheel-candidate-decision');

/** De canonieke `hard_negatives.reason` voor een quarantaine-afkeuring (13.6-enum, AD-12). */
export const QUARANTINE_REJECT_REASON = 'quarantaine-afkeuring';

/** De menselijke gold-set-bron voor quarantaine-aanwas (14.1 HUMAN_GOLD_SET_SOURCES). */
export const QUARANTINE_GOLD_SET_SOURCE = 'quarantaine';

/** De beslissingen die het endpoint accepteert. */
export const CANDIDATE_DECISIONS = ['afkeuren', 'vrijgeven', 'undo'] as const;
export type CandidateDecision = (typeof CANDIDATE_DECISIONS)[number];

/** Is `d` een geldige kandidaat-beslissing? */
export function isCandidateDecision(d: string): d is CandidateDecision {
  return (CANDIDATE_DECISIONS as readonly string[]).includes(d);
}

/** Fout: de kandidaat bestaat niet (endpoint → 404). */
export class CandidateNotFoundError extends Error {
  constructor(public candidateId: string) {
    super(`Kandidaat ${candidateId} niet gevonden`);
    this.name = 'CandidateNotFoundError';
  }
}

/**
 * Fout: de kandidaat zit in een batch die nog VERWERKT wordt (batch `pending`) —
 * beslissen mag pas op een afgesloten (gequarantaineerde) batch (AD-16). Endpoint
 * → HTTP 409.
 */
export class CandidateBatchProcessingError extends Error {
  constructor(public candidateId: string) {
    super(`Kandidaat ${candidateId} zit in een batch die nog verwerkt wordt`);
    this.name = 'CandidateBatchProcessingError';
  }
}

/**
 * Fout: de conditional statusovergang raakte 0 rijen — de kandidaat had niet de
 * verwachte status (parallelle beslissing of worker-claim). Endpoint → HTTP 409.
 */
export class CandidateConflictError extends Error {
  constructor(public candidateId: string, public expected: string, public actual: string) {
    super(`Kandidaat ${candidateId} niet in verwachte status ${expected} (was ${actual})`);
    this.name = 'CandidateConflictError';
  }
}

export interface CandidateDecisionInput {
  candidateId: string;
  decision: CandidateDecision;
  /** Wie de beslissing nam (auth-context) — beslisser in evidence + gold-set. */
  by: string | null;
}

export interface CandidateDecisionResult {
  candidateId: string;
  /** Nieuwe kandidaat-status na de beslissing. */
  status: string;
  decision: CandidateDecision;
}

/** Append-only status-overgang loggen in de kandidaat-evidence (AD-13). */
function appendTransition(
  evidence: Record<string, unknown>,
  from: string,
  to: string,
  reason: string,
  by: string | null
): Record<string, unknown> {
  const transitions = Array.isArray(evidence.statusTransitions)
    ? (evidence.statusTransitions as unknown[])
    : [];
  transitions.push({ from, to, reason, by, at: new Date().toISOString() });
  return { ...evidence, statusTransitions: transitions };
}

/**
 * Verwerk een kandidaat-beslissing (AC2/AC3). Gooit `CandidateNotFoundError`
 * (404), `CandidateBatchProcessingError`/`CandidateConflictError` (409). Draait
 * NOOIT poortlogica (AD-15).
 */
export async function decideCandidate(
  input: CandidateDecisionInput
): Promise<CandidateDecisionResult> {
  const { candidateId, decision, by } = input;

  const candidate = await prisma.referenceCandidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      status: true,
      t3777Code: true,
      cropPath: true,
      contentHash: true,
      evidence: true,
      promotionBatchId: true,
      promotionBatch: { select: { status: true } },
    },
  });
  if (!candidate) {
    throw new CandidateNotFoundError(candidateId);
  }

  // 409-regel (AD-16): een kandidaat `in_batch` in een `pending`-batch wordt nog
  // verwerkt — beslissen mag pas als de batch is afgesloten (status ≠ pending).
  if (candidate.status === 'in_batch' && candidate.promotionBatch?.status === 'pending') {
    throw new CandidateBatchProcessingError(candidateId);
  }

  const evidence = (candidate.evidence as Record<string, unknown>) ?? {};

  if (decision === 'afkeuren') {
    return afkeuren(candidate, evidence, by);
  }
  if (decision === 'vrijgeven') {
    return vrijgeven(candidate, evidence, by);
  }
  return undo(candidate, evidence, by);
}

/**
 * AFKEUREN (AC2): `in_batch → rejected` + hard-negative + gold-set-VALS-aanwas.
 * Alles in één transactie: de statusovergang (conditional), de hard-negative
 * (upsert op de bestaande `contentHash`, idempotent) en het VALS-record. De
 * gold-set-aanwas hergebruikt de 14.1-service (`recordReviewDecision`); de
 * hard-negative gebruikt de BESTAANDE kandidaat-hash (AD-14 — nooit opnieuw hashen).
 */
async function afkeuren(
  candidate: {
    id: string;
    status: string;
    t3777Code: string;
    cropPath: string | null;
    contentHash: string;
    promotionBatchId: string | null;
  },
  evidence: Record<string, unknown>,
  by: string | null
): Promise<CandidateDecisionResult> {
  if (candidate.status !== 'in_batch') {
    throw new CandidateConflictError(candidate.id, 'in_batch', candidate.status);
  }

  await prisma.$transaction(async (tx) => {
    // 1. Conditionele statusovergang in_batch → rejected (AD-16). 0 rows = race.
    const updated = await tx.referenceCandidate.updateMany({
      where: { id: candidate.id, status: 'in_batch' },
      data: {
        status: 'rejected',
        evidence: appendTransition(
          evidence,
          'in_batch',
          'rejected',
          QUARANTINE_REJECT_REASON,
          by
        ) as Prisma.InputJsonValue,
      },
    });
    if (updated.count === 0) {
      throw new CandidateConflictError(candidate.id, 'in_batch', 'gewijzigd');
    }

    // 2. Hard-negative met de BESTAANDE kandidaat-contentHash (AD-14). Idempotent
    //    (uniek op contentHash): een tweede afkeuring dupliceert niet.
    await tx.hardNegative.upsert({
      where: { contentHash: candidate.contentHash },
      create: {
        contentHash: candidate.contentHash,
        t3777Code: candidate.t3777Code,
        cropPath: candidate.cropPath,
        reason: QUARANTINE_REJECT_REASON,
        evidence: {
          source: 'quarantaine',
          candidateId: candidate.id,
          promotionBatchId: candidate.promotionBatchId,
          decidedBy: by,
        } as object,
      },
      update: {},
    });
  });

  // 3. Gold-set-VALS-aanwas via de HERBRUIKBARE 14.1-service (AC5, geen
  //    duplicaatlogica). Buiten de status-transactie: de aanwas is additief en
  //    mag de (gecommitte) afkeuring niet terugdraaien, maar hij is verplicht en
  //    wordt gelogd. Alleen zinvol met een crop-verwijzing (VALS-crop-record).
  if (candidate.cropPath) {
    await recordReviewDecision({
      label: 'VALS',
      t3777Code: candidate.t3777Code,
      cropPath: candidate.cropPath,
      source: QUARANTINE_GOLD_SET_SOURCE,
      decidedBy: by,
      evidence: {
        candidateId: candidate.id,
        contentHash: candidate.contentHash,
        rejectReason: QUARANTINE_REJECT_REASON,
      },
    });
  }

  logger.info('Kandidaat afgekeurd (quarantaine): rejected + hard-negative + VALS-aanwas', {
    candidateId: candidate.id,
    t3777Code: candidate.t3777Code,
  });

  return { candidateId: candidate.id, status: 'rejected', decision: 'afkeuren' };
}

/**
 * VRIJGEVEN (AC3): `in_batch → candidate` + `promotionBatchId` losgekoppeld. Het
 * endpoint bundelt NIETS en draait GEEN poortlogica (AD-15) — de nachtelijke
 * worker-run pakt de kandidaat op in een NIEUWE batch die de volledige poort
 * opnieuw doorloopt. Conditionele update (0 rows = race → conflict).
 */
async function vrijgeven(
  candidate: { id: string; status: string; t3777Code: string; promotionBatchId: string | null },
  evidence: Record<string, unknown>,
  by: string | null
): Promise<CandidateDecisionResult> {
  if (candidate.status !== 'in_batch') {
    throw new CandidateConflictError(candidate.id, 'in_batch', candidate.status);
  }

  // Bewaar de oorspronkelijke batch-id in de evidence zodat een undo de kandidaat
  // kan herkoppelen (de kolom-verwijzing wordt losgekoppeld conform AD-15).
  const evidenceWithBatchHint: Record<string, unknown> = {
    ...evidence,
    undoBatchId: candidate.promotionBatchId ?? readOriginalBatchId(evidence),
  };

  const updated = await prisma.referenceCandidate.updateMany({
    where: { id: candidate.id, status: 'in_batch' },
    data: {
      status: 'candidate',
      promotionBatchId: null,
      evidence: appendTransition(
        evidenceWithBatchHint,
        'in_batch',
        'candidate',
        'vrijgave',
        by
      ) as Prisma.InputJsonValue,
    },
  });
  if (updated.count === 0) {
    throw new CandidateConflictError(candidate.id, 'in_batch', 'gewijzigd');
  }

  logger.info('Kandidaat vrijgegeven (quarantaine): candidate, losgekoppeld — worker herbundelt', {
    candidateId: candidate.id,
    t3777Code: candidate.t3777Code,
  });

  return { candidateId: candidate.id, status: 'candidate', decision: 'vrijgeven' };
}

/**
 * UNDO (taak 4.3) — spiegel van het 14.1-undo-patroon. Neemt de laatste beslissing
 * op deze kandidaat terug:
 *   - afgekeurd (`rejected`): hard-negative verwijderen + gold-set-record
 *     intrekken (self-tombstone) + status `rejected → in_batch` (conditional).
 *   - vrijgegeven (`candidate`): status `candidate → in_batch` terug, MITS nog niet
 *     door een worker-run geclaimd (`promotionBatchId` nog leeg; anders conflict).
 *
 * Het terugkoppelen naar `in_batch` mag alleen als de kandidaat nog bij zijn
 * oorspronkelijke (gequarantaineerde) batch hoort — dat is bij afkeuren nog zo
 * (`promotionBatchId` bleef staan). Bij vrijgeven-undo koppelt undo hem opnieuw
 * aan die batch. Is er geen batch-verwijzing meer (worker heeft hem al opgepakt),
 * dan is undo een conflict.
 */
async function undo(
  candidate: {
    id: string;
    status: string;
    t3777Code: string;
    cropPath: string | null;
    contentHash: string;
    promotionBatchId: string | null;
  },
  evidence: Record<string, unknown>,
  by: string | null
): Promise<CandidateDecisionResult> {
  if (candidate.status === 'rejected') {
    // Afkeuring terugnemen: hard-negative weg, gold-set-record intrekken, status terug.
    await prisma.$transaction(async (tx) => {
      const reverted = await tx.referenceCandidate.updateMany({
        where: { id: candidate.id, status: 'rejected' },
        data: {
          status: 'in_batch',
          evidence: appendTransition(evidence, 'rejected', 'in_batch', 'undo-afkeuring', by) as Prisma.InputJsonValue,
        },
      });
      if (reverted.count === 0) {
        throw new CandidateConflictError(candidate.id, 'rejected', 'gewijzigd');
      }
      // Hard-negative van deze crop-inhoud verwijderen (de blokkade vervalt).
      await tx.hardNegative.deleteMany({
        where: { contentHash: candidate.contentHash, reason: QUARANTINE_REJECT_REASON },
      });
    });

    // Gold-set-record intrekken via self-tombstone (14.1-service). Buiten de
    // transactie: additief/immutable (AD-13), idempotent.
    if (candidate.cropPath) {
      const active = await prisma.goldSetRecord.findFirst({
        where: { cropPath: candidate.cropPath, replacedById: null, source: QUARANTINE_GOLD_SET_SOURCE },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (active) await withdrawGoldSetRecord(active.id);
    }

    logger.info('Afkeuring teruggenomen (undo): in_batch + hard-negative verwijderd + gold-set ingetrokken', {
      candidateId: candidate.id,
    });
    return { candidateId: candidate.id, status: 'in_batch', decision: 'undo' };
  }

  if (candidate.status === 'candidate') {
    // Vrijgave terugnemen — alleen als de worker de kandidaat nog niet opnieuw
    // geclaimd heeft (promotionBatchId nog leeg). Koppel hem terug aan zijn
    // oorspronkelijke batch. Zonder die verwijzing (worker was sneller) → conflict.
    if (candidate.promotionBatchId) {
      throw new CandidateConflictError(candidate.id, 'candidate (ongeclaimd)', 'reeds geclaimd');
    }
    const originalBatchId = readOriginalBatchId(evidence);
    if (!originalBatchId) {
      throw new CandidateConflictError(candidate.id, 'candidate (met batch)', 'geen batch-verwijzing');
    }

    const reverted = await prisma.referenceCandidate.updateMany({
      where: { id: candidate.id, status: 'candidate', promotionBatchId: null },
      data: {
        status: 'in_batch',
        promotionBatchId: originalBatchId,
        evidence: appendTransition(evidence, 'candidate', 'in_batch', 'undo-vrijgave', by) as Prisma.InputJsonValue,
      },
    });
    if (reverted.count === 0) {
      throw new CandidateConflictError(candidate.id, 'candidate (ongeclaimd)', 'reeds geclaimd');
    }

    logger.info('Vrijgave teruggenomen (undo): candidate → in_batch, herkoppeld aan batch', {
      candidateId: candidate.id,
      batchId: originalBatchId,
    });
    return { candidateId: candidate.id, status: 'in_batch', decision: 'undo' };
  }

  // Geen beslissing om terug te nemen (kandidaat staat al op in_batch e.d.).
  throw new CandidateConflictError(candidate.id, 'rejected|candidate', candidate.status);
}

/**
 * Vind de batch waar deze kandidaat oorspronkelijk in zat, uit de logged
 * status-overgangen (de vrijgave-overgang bewaart de batch niet expliciet, dus we
 * lezen de laatste bekende `promotionBatchId` uit de evidence-transitie of het
 * hard-negative-spoor). Bij vrijgave slaan we de batch-id niet apart op; daarom
 * gebruiken we de meest recente `undoBatchId`-hint als die bestaat.
 */
function readOriginalBatchId(evidence: Record<string, unknown>): string | null {
  const hint = evidence.undoBatchId;
  return typeof hint === 'string' ? hint : null;
}
