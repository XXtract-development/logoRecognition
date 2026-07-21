/**
 * Postgres-niveau regressietest voor Story 13.7 (AC 3).
 *
 * Reproduceert en verifieert de fix van de `uuid = text`-typefout (Postgres
 * 42883) in de promotielus-guardrailquery's. Draait tegen een ÉCHTE Postgres
 * (pgvector) — niet tegen de gemockte Prisma van de standaard-suite, want die
 * stubt `$queryRaw` en parseert de SQL nooit (juist dat mock-gat verborg de bug).
 *
 * Deze test bewijst twee kanten van de regressie:
 *   1. De PRE-fix-vorm (`IN (${Prisma.join(ids)})`, uuid-kolom ↔ text-params)
 *      gooit op deze engine daadwerkelijk 42883 — de test kán de bug vangen.
 *   2. De gefixte functies (`hasCosineDuplicate` survivor-arm en
 *      `loadCandidateEmbeddings`, beide met `= ANY(${ids}::uuid[])`) draaien
 *      foutloos en leveren de verwachte rijen.
 *
 * Lifecycle van de test-Postgres (container + `prisma migrate deploy` +
 * DATABASE_URL) wordt beheerd door `scripts/run-pg-integration-tests.sh`.
 */
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '../../core/db';
import {
  hasCosineDuplicate,
  loadCandidateEmbeddings,
} from '../../services/flywheel/guardrails';

// Klasse-code exclusief voor deze test, zodat seed/cleanup niets anders raakt.
const T3777_CODE = 'ITEST_137_UUID_CAST';
const EMBED_DIM = 512;

// Identieke 512-dim vector voor kandidaat + survivors → cosine-similariteit 1,0,
// zodat de survivor-arm van hasCosineDuplicate aantoonbaar meedraait én matcht.
const VECTOR_LITERAL = `[${Array(EMBED_DIM).fill(0.0123).join(',')}]`;

const candidateId = randomUUID();
const survivorId1 = randomUUID();
const survivorId2 = randomUUID();

async function seedCandidate(id: string, hashSuffix: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO reference_candidates (id, t3777_code, status, origin, content_hash)
    VALUES (${id}::uuid, ${T3777_CODE}, 'in_batch', 'review', ${'itest137-' + hashSuffix})
  `);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO candidate_embeddings (reference_candidate_id, embedding)
    VALUES (${id}::uuid, ${VECTOR_LITERAL}::vector)
  `);
}

describe('flywheel guardrails — uuid=text-regressie (Story 13.7)', () => {
  beforeAll(async () => {
    // Idempotent: ruim eventuele restanten van een vorige run op.
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM reference_candidates WHERE t3777_code = ${T3777_CODE}
    `);
    await seedCandidate(candidateId, 'cand');
    await seedCandidate(survivorId1, 's1');
    await seedCandidate(survivorId2, 's2');
  });

  afterAll(async () => {
    // Cascade verwijdert de candidate_embeddings mee.
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM reference_candidates WHERE t3777_code = ${T3777_CODE}
    `);
    await prisma.$disconnect();
  });

  it('PRE-fix: de uncast IN (${Prisma.join(ids)})-vorm gooit 42883 op Postgres', async () => {
    // Exact het antipatroon dat de bug was: uuid-kolom ↔ text-parameters.
    const preFixQuery = prisma.$queryRaw(Prisma.sql`
      SELECT reference_candidate_id
      FROM candidate_embeddings
      WHERE reference_candidate_id IN (${Prisma.join([survivorId1, survivorId2])})
        AND embedding IS NOT NULL
    `);
    await expect(preFixQuery).rejects.toThrow(
      /operator does not exist: uuid = text|42883/
    );
  });

  it('POST-fix: hasCosineDuplicate survivor-arm draait zonder 42883 en matcht', async () => {
    // survivorIds bevat de kandidaat zelf + 2 batch-genoten → otherSurvivors = 2
    // → de survivor-arm (`= ANY(${otherSurvivors}::uuid[])`) draait daadwerkelijk.
    const result = await hasCosineDuplicate(candidateId, T3777_CODE, 0.9, [
      candidateId,
      survivorId1,
      survivorId2,
    ]);
    expect(typeof result).toBe('boolean');
    // Identieke embeddings → cosine 1,0 ≥ 0,9 → duplicaat gevonden via survivor-arm.
    expect(result).toBe(true);
  });

  it('POST-fix: loadCandidateEmbeddings draait zonder 42883 en levert de rijen', async () => {
    const map = await loadCandidateEmbeddings([survivorId1, survivorId2]);
    expect(map.size).toBe(2);
    expect(map.get(survivorId1)).toHaveLength(EMBED_DIM);
    expect(map.get(survivorId2)).toHaveLength(EMBED_DIM);
  });
});
