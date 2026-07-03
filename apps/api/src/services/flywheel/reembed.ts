/**
 * Her-embed-handler voor de versie-guard (Story 13.5 taak 3.1, AD-5/AD-16).
 *
 * De versie-guard (`gate.ts::enforceVersionGuard`) zet een kandidaat met een
 * embedding-modelversie ≠ de actieve modelversie terug (`in_batch → candidate`,
 * `promotionBatchId = null`) en enqueue-t een `flywheel-reembed`-taak op de
 * flywheel-queue. ZONDER een consument bleef die taak een no-op: de kandidaat
 * hield zijn verouderde embedding en viel bij elke volgende poortrun opnieuw door
 * de versie-guard (een livelock — hij kwam na een modelactivatie nooit vooruit).
 *
 * Deze handler sluit dat gat: hij herberekent de schaduw-embedding uit de crop
 * tegen de ACTIEVE modelversie en schrijft die versie in de evidence, zodat de
 * kandidaat bij de eerstvolgende poortrun de versie-guard passeert en gemeten
 * wordt.
 *
 * Draait UITSLUITEND in de flywheel-worker (concurrency 1, AD-6/AD-15) — nooit in
 * een HTTP-request-pad. Best-effort: een fout laat de kandidaat op `candidate`
 * staan; een volgende versie-guard-run enqueue-t opnieuw (idempotent, geen
 * half-record — de embedding-update is atomair per kandidaat).
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { mlClient } from '../ml-client';
import { downloadTrainingObject } from '../storage';
import { createLogger } from '../../core/logger';
import { getActiveModelVersion } from './gate';

const logger = createLogger('flywheel-reembed');

export interface ReembedJobData {
  candidateId: string;
}

export type ReembedOutcome =
  | { status: 'reembedded'; candidateId: string; modelVersion: string }
  | { status: 'skipped'; reason: string };

/**
 * Herbereken de schaduw-embedding van één kandidaat tegen de actieve modelversie
 * en leg die versie vast in de evidence (AD-5-versie-guard, taak 3.1).
 *
 * Overslaan (geen fout) bij: onbekende/afgehandelde kandidaat (status ≠
 * `candidate`), geen actief model (niets om tegen te embedden), crop niet in
 * opslag. Een ml-/embed-fout gooit → de worker markeert de job failed en BullMQ
 * retryt (defaultJobOptions); de kandidaat blijft ongewijzigd op `candidate`.
 */
export async function reembedCandidate(candidateId: string): Promise<ReembedOutcome> {
  const candidate = await prisma.referenceCandidate.findUnique({
    where: { id: candidateId },
    select: { id: true, status: true, cropPath: true, evidence: true },
  });

  // De versie-guard zette hem net op `candidate`. Is hij intussen alweer geclaimd
  // of afgehandeld, dan is her-embedden zinloos — idempotent overslaan.
  if (!candidate || candidate.status !== 'candidate') {
    return { status: 'skipped', reason: 'kandidaat-niet-candidate' };
  }
  if (!candidate.cropPath) {
    return { status: 'skipped', reason: 'geen-crop' };
  }

  const activeVersion = await getActiveModelVersion();
  if (!activeVersion) {
    // Geen actief model → niets om tegen te embedden (de versie-guard slaat dan
    // ook over). Overslaan; een latere activatie triggert opnieuw.
    return { status: 'skipped', reason: 'geen-actief-model' };
  }

  const buffer = await downloadTrainingObject(candidate.cropPath);
  if (!buffer) {
    return { status: 'skipped', reason: 'crop-niet-in-opslag' };
  }

  // Embed tegen de actieve modelversie (ml-service). Een fout propageert → retry.
  const embedding = await mlClient.generateEmbeddingFromBuffer(buffer);

  // Vervang de bestaande schaduw-embedding + leg de modelversie in evidence vast.
  // Één transactie zodat vector-update en evidence-update samen of niet gebeuren;
  // conditional op status `candidate` zodat een gelijktijdige claim niet
  // overschreven wordt (AD-16).
  const vectorLiteral = `[${embedding.join(',')}]`;
  const evidence = (candidate.evidence as Record<string, unknown>) ?? {};
  const transitions = Array.isArray(evidence.statusTransitions)
    ? (evidence.statusTransitions as unknown[])
    : [];
  transitions.push({
    from: 'candidate',
    to: 'candidate',
    reason: `her-embed tegen actieve modelversie ${activeVersion}`,
    at: new Date().toISOString(),
  });

  await prisma.$transaction(async (tx) => {
    // Guard: alleen doorgaan als de kandidaat nog `candidate` is (0 rows = laat de
    // rest van de transactie zinloos, dus we breken hier af via een gooi).
    const stillCandidate = await tx.referenceCandidate.findFirst({
      where: { id: candidateId, status: 'candidate' },
      select: { id: true },
    });
    if (!stillCandidate) {
      throw new ReembedRaceError(candidateId);
    }

    // Schaduw-embedding vervangen (kan meerdere rijen zijn; ruim eerst op).
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM candidate_embeddings WHERE reference_candidate_id = ${candidateId}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO candidate_embeddings (id, reference_candidate_id, embedding, created_at)
      VALUES (gen_random_uuid(), ${candidateId}::uuid, ${vectorLiteral}::vector, now())
    `);

    await tx.referenceCandidate.update({
      where: { id: candidateId },
      data: {
        evidence: {
          ...evidence,
          embeddingModelVersion: activeVersion,
          statusTransitions: transitions,
        } as Prisma.InputJsonValue,
      },
    });
  }).catch((err) => {
    if (err instanceof ReembedRaceError) {
      logger.info('Her-embed overgeslagen — kandidaat niet meer candidate', { candidateId });
      return;
    }
    throw err;
  });

  logger.info('Kandidaat her-geëmbed tegen actieve modelversie', {
    candidateId,
    modelVersion: activeVersion,
  });
  return { status: 'reembedded', candidateId, modelVersion: activeVersion };
}

/** Interne markering: de kandidaat was tijdens de transactie niet meer `candidate`. */
export class ReembedRaceError extends Error {
  constructor(candidateId: string) {
    super(`Kandidaat ${candidateId} was niet meer candidate — her-embed overgeslagen.`);
    this.name = 'ReembedRaceError';
  }
}

/** Worker-handler voor een `flywheel-reembed`-job (workers.ts routeert hierheen). */
export async function runReembedJob(data: ReembedJobData): Promise<void> {
  await reembedCandidate(data.candidateId);
}
