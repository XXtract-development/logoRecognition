/**
 * Atomaire promotie van gepasseerde kandidaten (Story 13.5, AD-3/AD-6/AD-16).
 *
 * Promoveert per kandidaat in ÉÉN Prisma-transactie (zonder alle stappen geen
 * promotie, AD-3):
 *   1. Cap-afdwinging ín de transactie (`assertClassCapWithinTx`, `SELECT ... FOR
 *      UPDATE`, AD-6) — cap vol → kandidaat afgewezen, GEEN INSERT.
 *   2. INSERT `ReferenceLogo` (`active=true`, `source='flywheel-promotion'`,
 *      `variantLabel = auto-{batchShortId}-{seq}` — botsingsvrij binnen
 *      `@@unique([t3777Code, variantLabel])`).
 *   3. INSERT `ReferenceEmbedding` als KOPIE van de `candidate_embeddings`-vector
 *      (géén herberekening, AD-3) — de poort meet exact wat live gaat.
 *   4. Conditional update kandidaat `in_batch → promoted` met `referenceLogoId`
 *      (AD-16; 0 rows = kandidaat overslaan, nooit overschrijven).
 *
 * De promotie draait UITSLUITEND vanuit de flywheel-worker-poort (AD-15) — nooit
 * in een HTTP-request-pad. De embedding-modelversie van de kandidaat wordt in de
 * ReferenceLogo-evidence-annotatie meegegeven (via `source` + de batch-context in
 * `gateResults`); de vector-kopie zelf is model-onafhankelijk (AD-3).
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { assertClassCapWithinTx } from './guardrails';
import { resolveFieldType } from '../field-type-mapping';

const logger = createLogger('flywheel-promotion');

/** Bron-waarde van een gepromoveerde referentie (cap-telling + kloon-gat, AD-3). */
const PROMOTION_SOURCE = 'flywheel-promotion';

export interface PromotionCandidate {
  id: string;
  t3777Code: string;
  cropPath: string | null;
  /** Embedding-modelversie uit de evidence (AD-3: vastleggen in evidence). */
  embeddingModelVersion: string | null;
}

export interface PromotionResult {
  promoted: Array<{ candidateId: string; referenceLogoId: string; variantLabel: string }>;
  /** Kandidaten die de cap-check binnen de transactie tegenhield (geen INSERT). */
  capRejected: string[];
  /** Kandidaten waarvan de conditional update 0 rijen raakte (al afgehandeld). */
  skipped: string[];
  /** Kandidaten waarvan de transactie faalde (rolde atomair terug, AD-3); blijven in_batch. */
  failed: string[];
}

/**
 * Korte, botsingsvrije batch-id voor het variantLabel (AD-3-naamconventie). De
 * eerste 8 tekens van de batch-UUID volstaan als onderscheider binnen een klasse;
 * het volgnummer maakt hem uniek per kandidaat binnen de batch.
 */
export function batchShortId(batchId: string): string {
  return batchId.replace(/-/g, '').slice(0, 8);
}

/**
 * Bouw het variantLabel letterlijk uit korte batch-id + volgnummer (AD-3-noot:
 * `{batchShortId}`/`{seq}` zijn naamconventie-placeholders, GEEN template-tokens).
 */
export function buildVariantLabel(batchId: string, seq: number): string {
  return `auto-${batchShortId(batchId)}-${seq}`;
}

/**
 * Promoveer alle nog-`in_batch`-kandidaten van een batch atomair per kandidaat
 * (AD-3). Retourneert wat gepromoveerd/afgewezen/overgeslagen is. Muteert NIET de
 * batch-status — dat doet de poort-orkestratie na een geslaagde meting (samen met
 * `baselineMeasurement`, AC 5).
 */
export async function promoteBatchCandidates(
  batchId: string
): Promise<PromotionResult> {
  const candidates = await loadPromotableCandidates(batchId);
  const result: PromotionResult = { promoted: [], capRejected: [], skipped: [], failed: [] };

  let seq = 0;
  for (const candidate of candidates) {
    seq += 1;
    const variantLabel = buildVariantLabel(batchId, seq);

    try {
      const outcome = await promoteOne(candidate, variantLabel);
      if (outcome.status === 'promoted') {
        result.promoted.push({
          candidateId: candidate.id,
          referenceLogoId: outcome.referenceLogoId,
          variantLabel,
        });
      } else if (outcome.status === 'cap-rejected') {
        result.capRejected.push(candidate.id);
      } else {
        result.skipped.push(candidate.id);
      }
    } catch (err) {
      // Een mislukte kandidaat-transactie rolde ATOMAIR terug (AD-3: zonder alle
      // drie de stappen geen promotie) — er blijft geen wees-ReferenceLogo over.
      // De kandidaat blijft `in_batch` en wordt bij een volgende run opnieuw
      // geprobeerd (idempotent). De rest van de batch draait door: één infra-fout
      // mag reeds atomair gepromoveerde kandidaten niet ongedaan maken.
      logger.error('Promotie-transactie faalde voor kandidaat — overslaan, batch gaat door', {
        batchId,
        candidateId: candidate.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
      result.failed.push(candidate.id);
    }
  }

  logger.info('Batch-promotie afgerond', {
    batchId,
    promoted: result.promoted.length,
    capRejected: result.capRejected.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
  });
  return result;
}

/** Laad de nog-te-promoveren kandidaten (in_batch) van een batch met hun evidence. */
export async function loadPromotableCandidates(
  batchId: string
): Promise<PromotionCandidate[]> {
  const rows = await prisma.referenceCandidate.findMany({
    where: { promotionBatchId: batchId, status: 'in_batch' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, t3777Code: true, cropPath: true, evidence: true },
  });

  return rows.map((r) => {
    const evidence = (r.evidence as Record<string, unknown>) ?? {};
    const embeddingModelVersion =
      typeof evidence.embeddingModelVersion === 'string'
        ? (evidence.embeddingModelVersion as string)
        : null;
    return {
      id: r.id,
      t3777Code: r.t3777Code,
      cropPath: r.cropPath,
      embeddingModelVersion,
    };
  });
}

type PromoteOneOutcome =
  | { status: 'promoted'; referenceLogoId: string }
  | { status: 'cap-rejected' }
  | { status: 'skipped' };

/**
 * Promoveer één kandidaat in één transactie (AD-3). Zonder alle drie de stappen
 * (ReferenceLogo + embedding-kopie + status→promoted) geen promotie — een fout of
 * 0-row-update rolt de hele transactie terug.
 */
export async function promoteOne(
  candidate: PromotionCandidate,
  variantLabel: string
): Promise<PromoteOneOutcome> {
  return prisma.$transaction(async (tx) => {
    // 1. Cap ín de transactie (SELECT ... FOR UPDATE, AD-6). Vol → geen INSERT.
    const hasRoom = await assertClassCapWithinTx(tx, candidate.t3777Code);
    if (!hasRoom) {
      logger.info('Cap bereikt binnen transactie — kandidaat niet gepromoveerd', {
        candidateId: candidate.id,
        t3777Code: candidate.t3777Code,
      });
      return { status: 'cap-rejected' as const };
    }

    // 2. INSERT ReferenceLogo (active=true, source=flywheel-promotion).
    // Story 12.10 (AC3): field_type/gs1_field expliciet afleiden uit de code
    // (zelfde resolutie als de curatie-upload) i.p.v. de schema-default te laten
    // staan. Onopgeloste ambiguïteit → schema-default blijft het vangnet.
    const resolvedFieldType = resolveFieldType(candidate.t3777Code);
    if (resolvedFieldType.resolution === 'unresolved') {
      logger.warn('Ambigue code bij promotie — schema-default field_type toegepast', {
        t3777Code: candidate.t3777Code,
        note: resolvedFieldType.note,
      });
    }

    const referenceLogo = await tx.referenceLogo.create({
      data: {
        t3777Code: candidate.t3777Code,
        variantLabel,
        source: PROMOTION_SOURCE,
        storagePath: candidate.cropPath ?? '',
        active: true,
        ...(resolvedFieldType.fieldType ? { fieldType: resolvedFieldType.fieldType } : {}),
        ...(resolvedFieldType.gs1Field ? { gs1Field: resolvedFieldType.gs1Field } : {}),
      },
      select: { id: true },
    });

    // 3. INSERT ReferenceEmbedding als KOPIE van de candidate_embeddings-vector
    // (géén herberekening, AD-3). De Unsupported vector-kolom vergt raw SQL: kopieer
    // de vector rechtstreeks van candidate_embeddings naar reference_embeddings.
    const copied = await tx.$executeRaw(Prisma.sql`
      INSERT INTO reference_embeddings (id, reference_logo_id, embedding, created_at)
      SELECT gen_random_uuid(), ${referenceLogo.id}::uuid, ce.embedding, now()
      FROM candidate_embeddings ce
      JOIN reference_candidates rc ON ce.reference_candidate_id = rc.id
      WHERE rc.id = ${candidate.id}::uuid
        AND ce.embedding IS NOT NULL
    `);
    if (copied === 0) {
      // Geen embedding om te kopiëren → de promotie is niet compleet (AD-3): gooi
      // zodat de transactie (incl. de ReferenceLogo-INSERT) terugrolt.
      throw new Error(
        `Kandidaat ${candidate.id} heeft geen kopieerbare embedding — promotie afgebroken (AD-3).`
      );
    }

    // 4. Conditional update kandidaat in_batch → promoted (AD-16). 0 rows = de
    // kandidaat is intussen afgehandeld → hele transactie terugrollen (geen
    // wees-ReferenceLogo).
    const updated = await tx.referenceCandidate.updateMany({
      where: { id: candidate.id, status: 'in_batch' },
      data: { status: 'promoted', referenceLogoId: referenceLogo.id },
    });
    if (updated.count === 0) {
      throw new PromotionRaceError(
        `Kandidaat ${candidate.id} was niet meer in_batch — promotie teruggerold.`
      );
    }

    logger.info('Kandidaat gepromoveerd', {
      candidateId: candidate.id,
      referenceLogoId: referenceLogo.id,
      variantLabel,
    });
    return { status: 'promoted' as const, referenceLogoId: referenceLogo.id };
  }).catch((err) => {
    // Een verloren race (0-row-update) is geen fout maar "overslaan" — de rest van
    // de batch draait door. Alle andere fouten propageren.
    if (err instanceof PromotionRaceError) {
      logger.info('Kandidaat overgeslagen (niet meer in_batch)', {
        candidateId: candidate.id,
      });
      return { status: 'skipped' as const };
    }
    throw err;
  });
}

/** Interne markering voor een verloren conditional-update-race (0 rows). */
export class PromotionRaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromotionRaceError';
  }
}
