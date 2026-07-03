/**
 * Nominatie-service — referentie-vliegwiel (Story 13.2).
 *
 * Kernpoort van het vliegwiel: een dubbel bevestigde detectie wordt een
 * kandidaat-referentie (`reference_candidates`, status `candidate`) met zijn
 * schaduw-embedding (`candidate_embeddings`). Deze story levert UITSLUITEND
 * nominatie — batching, guardrails en promotie zijn 13.4/13.5.
 *
 * Bindende AD's:
 *   AD-14  De inhouds-hash komt SYNCHROON uit /ml/phash (MLClient.computePhash,
 *          Story 13.1) vóór de INSERT. Onbereikbaar/faalt → nominatie geweigerd
 *          (fail-closed); geen Node-fallback-hash, geen half-record.
 *   AD-12  Uniciteit op (contentHash, t3777Code). Blokkades: hash in
 *          `hard_negatives`, bestaande kandidaat op dezelfde sleutel. Zachte
 *          afwijzing (`rejected` + zachte reden) → status-reset naar `candidate`
 *          (conditional update, GEEN tweede insert).
 *   AD-16  Statusovergangen als conditional update; overgang gelogd in evidence.
 *   AD-13  Evidence-contract: bron-GTIN, bronbestand, bbox, methode, scores,
 *          declaratie-uitkomst, embedding-modelversie.
 *
 * Transactionele integriteit: kandidaat-rij én schaduw-embedding ontstaan samen
 * of niet (één Prisma-transactie). De embedding-vector is een pgvector(512) en
 * wordt via `$executeRaw` met een vector-literal geschreven (Prisma kent het
 * `Unsupported`-type niet in de generated create-API).
 *
 * Deze module draait uitsluitend in het pipeline-worker-pad (BullMQ), nooit
 * inline in het live-API-request-pad (NFR-3/NFR-7). De crosscheck-hook en de
 * review-ombuiging borgen dat door op het request-pad te enqueue-en.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { mlClient } from '../ml-client';
import { downloadTrainingObject } from '../storage';
import { createLogger } from '../../core/logger';
import { recordMissedNomination } from './missed-nominations';
import {
  isNominationEnabled,
  isKruischeckNominationEnabled,
  getPromotionThresholdForMethod,
  NominationOrigin,
} from './config';

const logger = createLogger('flywheel-nomination');

/** Zachte afwijzingsredenen die hernominatie via status-reset toestaan (AD-12). */
const SOFT_REJECTION_REASONS = new Set(['cap-bereikt', 'duplicaat', 'outlier']);

/** Eén detectie die genomineerd kan worden. */
export interface NominationDetection {
  t3777Code: string;
  confidence: number;
  method?: string;
  cropPath?: string;
  sourceFile?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface NominateCandidateInput {
  detection: NominationDetection;
  origin: NominationOrigin;
  gtin: string;
  /** GS1-declaratie van de GTIN (leeg = geen bevestiging → geen kandidaat). */
  declared: string[];
  /**
   * Optionele vooraf-berekende embedding (vector(512)). Ontbreekt deze, dan
   * berekent de service er zelf één uit de crop via de ml-service.
   */
  embedding?: number[];
  /** Modelversie van de embedding (evidence, AD-3-vooruitwijzing). */
  embeddingModelVersion?: string;
}

export type NominationOutcome =
  | { status: 'nominated'; candidateId: string; reused: boolean }
  | { status: 'skipped'; reason: string }
  | { status: 'refused'; reason: string };

/**
 * Nomineer één detectie als kandidaat-referentie.
 *
 * Volgorde (fail-fast, goedkoop → duur):
 *   1. vlagcheck (hoofdvlag; kruischeck-herkomst vereist óók de kruischeck-vlag)
 *   2. declaratie-bevestiging aanwezig?
 *   3. drempelcheck per methode
 *   4. SYNCHROON /ml/phash (fail-closed bij fout)
 *   5. blokkade-checks: hard_negatives, bestaande kandidaat
 *   6. status-reset-pad óf INSERT kandidaat + embedding (transactie)
 */
export async function nominateCandidate(
  input: NominateCandidateInput
): Promise<NominationOutcome> {
  const { detection, origin, gtin, declared } = input;

  // 1. Vlagcheck (AD-8). Hoofdvlag stuurt crosscheck/import + review; de
  //    kruischeck-herkomst vereist bovendien de kruischeck-vlag.
  const enabled =
    origin === 'kruischeck' ? isKruischeckNominationEnabled() : isNominationEnabled();
  if (!enabled) {
    await recordMissedNomination('vlag-uit', {
      origin,
      gtin,
      t3777Code: detection.t3777Code,
    });
    return { status: 'skipped', reason: 'vlag-uit' };
  }

  // 2. Veiligheidsregel: zonder declaratie-bevestiging geen kandidaat (FR-1).
  if (!declared || declared.length === 0 || !declared.includes(detection.t3777Code)) {
    return { status: 'skipped', reason: 'geen-declaratie-bevestiging' };
  }

  // 3. Promotiedrempel per methode (FR-5) — strengere tweede horde bovenop
  //    de crosscheck-auto-accept. UITZONDERING: bij herkomst `review` is de
  //    menselijke bevestiging zélf de dubbele bevestiging; de model-confidence
  //    (die het item juist naar review stuurde) gate't dan niet.
  if (origin !== 'review') {
    const threshold = getPromotionThresholdForMethod(detection.method);
    if (detection.confidence < threshold) {
      return { status: 'skipped', reason: 'onder-drempel' };
    }
  }

  // Een kandidaat zonder crop kan nooit een referentie worden (geen hash, geen
  // embedding). Overslaan i.p.v. weigeren — dit is geen brandstofverlies.
  if (!detection.cropPath) {
    return { status: 'skipped', reason: 'geen-crop' };
  }

  // 4. Canonieke inhouds-hash SYNCHROON vóór de INSERT (AD-14). Fail-closed:
  //    onbereikbaar/faalt → weigeren + gemiste-nominatie-event, geen fallback.
  let contentHash: string;
  try {
    const res = await mlClient.computePhash(detection.cropPath);
    contentHash = res.content_hash;
  } catch (err) {
    await recordMissedNomination('phash-onbereikbaar', {
      origin,
      gtin,
      t3777Code: detection.t3777Code,
      detail: err instanceof Error ? err.message : 'unknown',
    });
    return { status: 'refused', reason: 'phash-onbereikbaar' };
  }

  // 5a. Hard-negative-blokkade (AD-12 / FR-9): een menselijk afgekeurd beeld
  //     wordt nooit opnieuw genomineerd.
  const hardNegative = await prisma.hardNegative.findUnique({
    where: { contentHash },
  });
  if (hardNegative) {
    return { status: 'skipped', reason: 'hard-negative' };
  }

  // 5b. Bestaande kandidaat op (contentHash, t3777Code) — idempotentie (AD-12).
  const existing = await prisma.referenceCandidate.findUnique({
    where: { contentHash_t3777Code: { contentHash, t3777Code: detection.t3777Code } },
  });

  if (existing) {
    // Zacht afgewezen rij mag via status-reset opnieuw `candidate` worden — géén
    // nieuwe insert (AD-12/AD-16). Alle andere statussen: idempotent overslaan.
    const softReason =
      typeof (existing.evidence as Record<string, unknown>)?.rejectionReason === 'string'
        ? ((existing.evidence as Record<string, unknown>).rejectionReason as string)
        : undefined;

    if (existing.status === 'rejected' && softReason && SOFT_REJECTION_REASONS.has(softReason)) {
      const reset = await prisma.referenceCandidate.updateMany({
        where: { id: existing.id, status: 'rejected' },
        data: { status: 'candidate' },
      });
      if (reset.count > 0) {
        await appendStatusTransition(existing.id, 'rejected', 'candidate', 'hernominatie-reset');
        return { status: 'nominated', candidateId: existing.id, reused: true };
      }
    }
    // Bestaat al als candidate/in_batch/promoted (of hard-rejected): geen duplicaat.
    return { status: 'skipped', reason: 'reeds-genomineerd' };
  }

  // 6. Embedding bepalen (schaduw-embedding, AD-5). Meegegeven vector heeft
  //    voorrang; anders uit de crop via de ml-service.
  let embedding = input.embedding;
  if (!embedding || embedding.length === 0) {
    try {
      const buffer = await downloadTrainingObject(detection.cropPath);
      if (!buffer) {
        return { status: 'skipped', reason: 'crop-niet-in-opslag' };
      }
      embedding = await mlClient.generateEmbeddingFromBuffer(buffer);
    } catch (err) {
      // De embedding is nodig voor de schaduwmeting; zonder embedding geen
      // half-record. Weigeren (fail-closed) + event.
      await recordMissedNomination('phash-onbereikbaar', {
        origin,
        gtin,
        t3777Code: detection.t3777Code,
        detail: `embedding: ${err instanceof Error ? err.message : 'unknown'}`,
      });
      return { status: 'refused', reason: 'embedding-onbereikbaar' };
    }
  }

  const evidence = buildEvidence(input, contentHash);

  // 7. Kandidaat + schaduw-embedding SAMEN of niet (transactionele integriteit).
  const candidateId = await prisma.$transaction(async (tx) => {
    const candidate = await tx.referenceCandidate.create({
      data: {
        t3777Code: detection.t3777Code,
        status: 'candidate',
        origin,
        contentHash,
        cropPath: detection.cropPath,
        evidence: evidence as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // pgvector-literal via raw: '[v1,v2,...]'::vector — Prisma's Unsupported-type
    // is niet schrijfbaar via de generated create-API.
    const vectorLiteral = `[${(embedding as number[]).join(',')}]`;
    await tx.$executeRaw`
      INSERT INTO candidate_embeddings (id, reference_candidate_id, embedding, created_at)
      VALUES (gen_random_uuid(), ${candidate.id}::uuid, ${vectorLiteral}::vector, now())
    `;

    return candidate.id;
  });

  logger.info('Kandidaat genomineerd', {
    candidateId,
    origin,
    gtin,
    t3777Code: detection.t3777Code,
  });

  return { status: 'nominated', candidateId, reused: false };
}

/** Bouw het evidence-contract (AD-13). */
function buildEvidence(
  input: NominateCandidateInput,
  contentHash: string
): Record<string, unknown> {
  const { detection, origin, gtin } = input;
  return {
    origin,
    sourceGtin: gtin,
    sourceFile: detection.sourceFile ?? null,
    bbox: detection.bbox ?? null,
    method: detection.method ?? null,
    scores: { confidence: detection.confidence },
    contentHash,
    declarationOutcome: 'confirmed',
    embeddingModelVersion: input.embeddingModelVersion ?? null,
    statusTransitions: [
      { from: null, to: 'candidate', reason: 'nominatie', at: new Date().toISOString() },
    ],
  };
}

/**
 * Log een statusovergang in de evidence van een bestaande kandidaat (AD-13/16).
 * Append-only op `evidence.statusTransitions`. Best-effort: een logfout mag de
 * (al geslaagde) statusreset niet terugdraaien.
 */
async function appendStatusTransition(
  candidateId: string,
  from: string,
  to: string,
  reason: string
): Promise<void> {
  try {
    const row = await prisma.referenceCandidate.findUnique({
      where: { id: candidateId },
      select: { evidence: true },
    });
    const evidence = (row?.evidence as Record<string, unknown>) ?? {};
    const transitions = Array.isArray(evidence.statusTransitions)
      ? (evidence.statusTransitions as unknown[])
      : [];
    transitions.push({ from, to, reason, at: new Date().toISOString() });
    await prisma.referenceCandidate.update({
      where: { id: candidateId },
      data: {
        evidence: { ...evidence, statusTransitions: transitions } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn('Kon statusovergang niet loggen in evidence (non-fataal)', {
      candidateId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}
