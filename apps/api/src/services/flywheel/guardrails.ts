/**
 * Guardrail-fasen van de nachtelijke promotielus (Story 13.4).
 *
 * Vier poort-fasen draaien serieel op een `pending`-batch (AD-6, AD-16):
 *   1. drempel  — her-check confidence ≥ promotiedrempel (drempelwijziging tussen
 *                 nominatie en run).
 *   2. cap      — per-klasse cap op cumulatieve, actieve promotie-referenties
 *                 (FR-6). Gecureerde referenties tellen niet mee.
 *   3. dedup    — tweetraps: pHash-Hamming (trap 1) + embedding-cosine (trap 2),
 *                 binnen de batch, tegen actieve referenties, én tegen inactieve
 *                 flywheel-promotion/review-referenties van de klasse (kloon-gat).
 *   4. outlier  — afstand tot klasse-centroid via /ml/outlier-audit.
 *
 * Elke zachte afwijzing (cap-bereikt/duplicaat/outlier) zet de kandidaat via
 * conditional update `in_batch → rejected` mét reden en schrijft NOOIT een
 * `hard_negatives`-rij (AD-12/FR-9). Hard-negatives komen uitsluitend van
 * menselijke afkeuring (13.6/14.1/15.3).
 *
 * Elke fase schrijft één record in `gateResults` (AD-13). Een fase met een
 * afgerond record (`finishedAt` gezet) wordt bij crash-recovery overgeslagen.
 *
 * De promotie-transactie zelf (INSERT ReferenceLogo + embedding-kopie) is 13.5.
 * Deze module levert wél de herbruikbare cap-check mét `SELECT ... FOR UPDATE`
 * (`assertClassCapWithinTx`) die 13.5 ín die transactie afdwingt (AD-6).
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { mlClient } from '../ml-client';
import { createLogger } from '../../core/logger';
import {
  getClassCap,
  getDedupHammingMax,
  getDedupCosine,
} from './config';
import { resolvePromotionThreshold } from './thresholds';
import type {
  GatePhase,
  GatePhaseResult,
  GateResults,
  SoftRejectionReason,
} from './types';

const logger = createLogger('flywheel-guardrails');

/** Bron-waarde van een gepromoveerde referentie (cap-telling + kloon-gat). */
const PROMOTION_SOURCE = 'flywheel-promotion';
/** Herkomsten waarvan inactieve referenties de kloon-gat-dedup voeden. */
const CLONE_GAP_SOURCES = ['flywheel-promotion', 'review'];

/** Eén kandidaat zoals de guardrails 'm nodig hebben. */
export interface GuardrailCandidate {
  id: string;
  t3777Code: string;
  cropPath: string | null;
  /** Confidence uit de evidence-scores (drempel-fase). */
  confidence: number | null;
  /** Detectiemethode uit de evidence (drempel-per-methode). */
  method: string | null;
  /** Herkomst van de kandidaat (Story 19.11: `review` omzeilt de promotie-drempel). */
  origin: string | null;
}

// ============================================
// Zachte afwijzing (AD-12) — conditional update, nooit hard-negative
// ============================================

/**
 * Wijs een kandidaat zacht af: `in_batch → rejected` mét reden, als conditional
 * update (AD-16). Schrijft de reden in `evidence.rejectionReason` (het
 * nominatie-pad leest die voor het hernominatie-reset-slot) en logt de overgang.
 * Schrijft NOOIT een `hard_negatives`-rij (AD-12/FR-9).
 *
 * Retourneert true als de rij daadwerkelijk overging (1 row affected); false bij
 * 0 rows (al afgehandeld) — idempotent bij crash-recovery.
 */
export async function softRejectCandidate(
  candidateId: string,
  reason: SoftRejectionReason,
  tx?: Prisma.TransactionClient
): Promise<boolean> {
  const client = tx ?? prisma;

  // Lees de bestaande evidence zodat we de reden + statusovergang append-en
  // zonder de rest te verliezen.
  const row = await client.referenceCandidate.findUnique({
    where: { id: candidateId },
    select: { evidence: true, status: true },
  });
  if (!row || row.status !== 'in_batch') {
    return false;
  }

  const evidence = (row.evidence as Record<string, unknown>) ?? {};
  const transitions = Array.isArray(evidence.statusTransitions)
    ? (evidence.statusTransitions as unknown[])
    : [];
  transitions.push({
    from: 'in_batch',
    to: 'rejected',
    reason,
    at: new Date().toISOString(),
  });

  const updated = await client.referenceCandidate.updateMany({
    where: { id: candidateId, status: 'in_batch' },
    data: { status: 'rejected' },
  });
  if (updated.count === 0) {
    return false;
  }

  // Reden + transitie apart wegschrijven (updateMany kan geen JSON mergen).
  await client.referenceCandidate.update({
    where: { id: candidateId },
    data: {
      evidence: {
        ...evidence,
        rejectionReason: reason,
        statusTransitions: transitions,
      } as Prisma.InputJsonValue,
    },
  });

  logger.info('Kandidaat zacht afgewezen', { candidateId, reason });
  return true;
}

// ============================================
// gateResults-schrijver (AD-13)
// ============================================

/** Start een fase-record (nog niet afgerond). */
export function startPhaseRecord(phase: GatePhase): GatePhaseResult {
  return {
    phase,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    outcome: 'passed',
    rejectedCandidateIds: [],
    details: {},
  };
}

/**
 * Is een fase al afgerond in de gegeven gateResults? (crash-recovery-idempotentie,
 * AD-12). Een record met `finishedAt !== null` telt als afgerond.
 */
export function isPhaseComplete(gateResults: GateResults, phase: GatePhase): boolean {
  const rec = gateResults[phase];
  return !!rec && rec.finishedAt !== null;
}

// ============================================
// Fase 1 — drempel
// ============================================

/**
 * Her-check de promotiedrempel per methode (vangt drempelwijzigingen tussen
 * nominatie en run). Onder-drempel → zacht afgewezen met reden `outlier`? Nee —
 * de drempel-fase is geen zachte-afwijzingsreden uit de AD-12-set; een kandidaat
 * die de (mogelijk aangescherpte) drempel niet haalt wordt teruggezet naar
 * `candidate` (vrijgave), niet `rejected`: hij is geen slechte kandidaat, de
 * drempel schoof. Dat is de `in_batch → candidate`-vrijgave-overgang (AD-16).
 */
export async function runThresholdPhase(
  candidates: GuardrailCandidate[]
): Promise<{ record: GatePhaseResult; survivors: GuardrailCandidate[] }> {
  const record = startPhaseRecord('threshold');
  const survivors: GuardrailCandidate[] = [];
  const released: string[] = [];

  for (const c of candidates) {
    // Story 19.11: een MENS-bevestigde kandidaat (herkomst `review`, uit een
    // reviewstation-accept) omzeilt de promotie-drempel — precies zoals `review` de
    // nominatie-drempel omzeilt (nomination.ts): de menselijke bevestiging IS de
    // dubbele check. Zo wordt een bevestigde keurmerk-crop (cosine 0,60–0,74) een
    // ACTIEVE referentie i.p.v. eeuwig vrijgegeven onder de 0,90-lat. De overige
    // fasen (cap/dedup/outlier/regressie) blijven wél gelden.
    if (c.origin === 'review') {
      survivors.push(c);
      continue;
    }
    // Effectieve drempel via de gedeelde resolver (override ?? env ?? default).
    const threshold = await resolvePromotionThreshold(c.method ?? undefined);
    if (c.confidence === null || c.confidence < threshold) {
      await releaseCandidate(c.id, 'onder-drempel');
      released.push(c.id);
    } else {
      survivors.push(c);
    }
  }

  record.finishedAt = new Date().toISOString();
  record.outcome = released.length > 0 ? 'rejected-some' : 'passed';
  record.details = { releasedCandidateIds: released, evaluated: candidates.length };
  return { record, survivors };
}

/**
 * Vrijgave-overgang `in_batch → candidate` (AD-16): de kandidaat verlaat de
 * batch en wordt opnieuw beschikbaar (geen zachte afwijzing, geen reden-vlag).
 */
export async function releaseCandidate(
  candidateId: string,
  reason: string,
  tx?: Prisma.TransactionClient
): Promise<boolean> {
  const client = tx ?? prisma;
  const updated = await client.referenceCandidate.updateMany({
    where: { id: candidateId, status: 'in_batch' },
    data: { status: 'candidate', promotionBatchId: null },
  });
  if (updated.count === 0) return false;
  logger.info('Kandidaat vrijgegeven uit batch', { candidateId, reason });
  return true;
}

// ============================================
// Fase 2 — cap
// ============================================

/**
 * Tel de cumulatieve, actieve promotie-referenties van een klasse (FR-6).
 * Uitsluitend `active=true AND source='flywheel-promotion'` — gecureerde bronnen
 * (NULL/andere source) tellen NIET mee en worden nooit verdrongen.
 */
export async function countActivePromotionReferences(
  t3777Code: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;
  return client.referenceLogo.count({
    where: { t3777Code, active: true, source: PROMOTION_SOURCE },
  });
}

/**
 * Cap-fase: wijs kandidaten boven de per-klasse cap zacht af (reden
 * `cap-bereikt`). De cap geldt op cumulatieve, actieve promotie-referenties plus
 * de al-in-deze-fase-goedgekeurde kandidaten van dezelfde klasse (zodat één run
 * de cap niet overschrijdt).
 */
export async function runCapPhase(
  candidates: GuardrailCandidate[]
): Promise<{ record: GatePhaseResult; survivors: GuardrailCandidate[] }> {
  const record = startPhaseRecord('cap');
  const cap = getClassCap();
  const survivors: GuardrailCandidate[] = [];
  const rejected: string[] = [];

  // Beginstand per klasse = huidige actieve promotie-referenties.
  const runningCount = new Map<string, number>();
  for (const c of candidates) {
    if (!runningCount.has(c.t3777Code)) {
      runningCount.set(c.t3777Code, await countActivePromotionReferences(c.t3777Code));
    }
  }

  for (const c of candidates) {
    const current = runningCount.get(c.t3777Code) ?? 0;
    if (current >= cap) {
      const ok = await softRejectCandidate(c.id, 'cap-bereikt');
      if (ok) rejected.push(c.id);
    } else {
      runningCount.set(c.t3777Code, current + 1);
      survivors.push(c);
    }
  }

  record.finishedAt = new Date().toISOString();
  record.outcome = rejected.length > 0 ? 'rejected-some' : 'passed';
  record.details = { cap, rejectedCandidateIds: rejected, evaluated: candidates.length };
  return { record, survivors };
}

/**
 * Herbruikbare cap-check MÉT rij-lock voor de promotie-transactie (13.5, AD-6).
 * Telt binnen de gegeven transactie de actieve promotie-referenties met een
 * `SELECT ... FOR UPDATE` op de bestaande rijen van de klasse, zodat een parallelle
 * promotie de cap niet kan breken. Retourneert `true` als er nog RUIMTE is (huidig
 * < cap); `false` als de cap al bereikt is. 13.5 roept dit vlak vóór de
 * ReferenceLogo-INSERT aan en breekt af bij `false`.
 */
export async function assertClassCapWithinTx(
  tx: Prisma.TransactionClient,
  t3777Code: string
): Promise<boolean> {
  const cap = getClassCap();
  // FOR UPDATE op de bestaande actieve promotie-referentie-rijen van de klasse:
  // vergrendelt ze zodat een gelijktijdige transactie serieel wacht (AD-6).
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM reference_logos
    WHERE t3777_code = ${t3777Code}
      AND active = true
      AND source = ${PROMOTION_SOURCE}
    FOR UPDATE
  `);
  return rows.length < cap;
}

// ============================================
// Fase 3 — tweetraps-dedup
// ============================================

/** Hamming-afstand tussen twee gelijk-lange hex-strings (pHash). */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) {
    // Ongelijke lengte → niet vergelijkbaar; maximaal ver (nooit duplicaat).
    return Number.POSITIVE_INFINITY;
  }
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const na = parseInt(a[i], 16);
    const nb = parseInt(b[i], 16);
    if (Number.isNaN(na) || Number.isNaN(nb)) return Number.POSITIVE_INFINITY;
    let xor = na ^ nb;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Tweetraps-dedup (AC 4). Per kandidaat:
 *   trap 1 — pHash-Hamming ≤ `FLYWHEEL_DEDUP_HAMMING_MAX` tegen batch-genoten die
 *            al overleefden (binnen de batch "hoogstens één overleeft").
 *   trap 2 — embedding-cosine ≥ `FLYWHEEL_DEDUP_COSINE` (pgvector) tegen:
 *            (a) actieve referenties van de klasse,
 *            (b) inactieve flywheel-promotion/review-referenties van de klasse
 *                (kloon-gat), en
 *            (c) al-overlevende batch-genoten.
 * Een match → zacht afgewezen met reden `duplicaat`.
 *
 * De pHash haalt deze fase op via `mlClient.computePhash(cropPath)` (13.2 sloeg
 * 'm niet in evidence op — de story staat toe 'm hier alsnog op te halen). Een
 * kandidaat zonder crop/pHash slaat trap 1 over maar loopt trap 2 wél.
 */
export async function runDedupPhase(
  candidates: GuardrailCandidate[]
): Promise<{ record: GatePhaseResult; survivors: GuardrailCandidate[] }> {
  const record = startPhaseRecord('dedup');
  const hammingMax = getDedupHammingMax();
  const cosineThreshold = getDedupCosine();
  const survivors: GuardrailCandidate[] = [];
  const survivorPhashes: Array<{ id: string; phash: string | null }> = [];
  const rejected: string[] = [];

  for (const c of candidates) {
    // pHash ophalen (trap 1). Faalt/ontbreekt → geen trap-1-oordeel, ga door.
    let phash: string | null = null;
    if (c.cropPath) {
      try {
        const res = await mlClient.computePhash(c.cropPath);
        phash = res.phash;
      } catch (err) {
        logger.warn('pHash ophalen faalde in dedup — trap 1 overgeslagen', {
          candidateId: c.id,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }
    }

    // Trap 1: Hamming tegen al-overlevende batch-genoten.
    let isDuplicate = false;
    if (phash) {
      for (const s of survivorPhashes) {
        if (s.phash && hammingDistanceHex(phash, s.phash) <= hammingMax) {
          isDuplicate = true;
          break;
        }
      }
    }

    // Trap 2: embedding-cosine tegen referentie-set (actief ∪ kloon-gat) ∪
    // overlevende batch-genoten. Alleen als trap 1 nog geen duplicaat vond.
    if (!isDuplicate) {
      isDuplicate = await hasCosineDuplicate(
        c.id,
        c.t3777Code,
        cosineThreshold,
        survivors.map((s) => s.id)
      );
    }

    if (isDuplicate) {
      const ok = await softRejectCandidate(c.id, 'duplicaat');
      if (ok) rejected.push(c.id);
    } else {
      survivors.push(c);
      survivorPhashes.push({ id: c.id, phash });
    }
  }

  record.finishedAt = new Date().toISOString();
  record.outcome = rejected.length > 0 ? 'rejected-some' : 'passed';
  record.details = {
    hammingMax,
    cosineThreshold,
    rejectedCandidateIds: rejected,
    evaluated: candidates.length,
  };
  return { record, survivors };
}

/**
 * Trap-2-cosine-check via pgvector (AD-9: cosine in SQL, geen Node-loops). Vraagt
 * of de kandidaat-embedding cosine ≥ drempel matcht met:
 *   (a) actieve reference_embeddings van de klasse,
 *   (b) inactieve flywheel-promotion/review-reference_embeddings van de klasse
 *       (kloon-gat), of
 *   (c) candidate_embeddings van de opgegeven overlevende batch-genoten.
 * Cosine-similariteit = 1 - (a <=> b) (pgvector `<=>` = cosine-afstand).
 */
export async function hasCosineDuplicate(
  candidateId: string,
  t3777Code: string,
  cosineThreshold: number,
  survivorIds: string[]
): Promise<boolean> {
  // Trap-2-arm tegen overlevende batch-genoten (alleen als er zijn). De kandidaat
  // zélf mag nooit tegen zichzelf matchen — daarom uitsluiten op id.
  const otherSurvivors = survivorIds.filter((id) => id !== candidateId);
  const survivorArm =
    otherSurvivors.length > 0
      ? Prisma.sql`
          UNION ALL
          SELECT (1 - (ce.embedding <=> (SELECT embedding FROM cand))) AS similarity
          FROM candidate_embeddings ce
          WHERE ce.reference_candidate_id IN (${Prisma.join(otherSurvivors)})
            AND ce.embedding IS NOT NULL
        `
      : Prisma.empty;

  // Eén query, twee armen: (1) referentie-embeddings (actief ∪ kloon-gat),
  // (2) overlevende batch-genoten. `cand` = de kandidaat-embedding; ontbreekt die
  // dan levert de CTE 0 rijen en is er per definitie geen duplicaat.
  const rows = await prisma.$queryRaw<Array<{ similarity: number | null }>>(Prisma.sql`
    WITH cand AS (
      SELECT embedding
      FROM candidate_embeddings
      WHERE reference_candidate_id = ${candidateId}::uuid
        AND embedding IS NOT NULL
      LIMIT 1
    )
    SELECT (1 - (re.embedding <=> (SELECT embedding FROM cand))) AS similarity
    FROM reference_embeddings re
    JOIN reference_logos rl ON re.reference_logo_id = rl.id
    WHERE (SELECT embedding FROM cand) IS NOT NULL
      AND rl.t3777_code = ${t3777Code}
      AND re.embedding IS NOT NULL
      AND (
        rl.active = true
        OR (rl.active = false AND rl.source = ANY(${CLONE_GAP_SOURCES}))
      )
    ${survivorArm}
  `);

  return rows.some(
    (r) => r.similarity !== null && Number(r.similarity) >= cosineThreshold
  );
}

// ============================================
// Fase 4 — outlier
// ============================================

/**
 * Outlier-fase: vraag /ml/outlier-audit per klasse de afstand tot het
 * klasse-centroid en wijs `is_outlier`-kandidaten zacht af (reden `outlier`).
 * Kandidaten zonder embedding worden overgeslagen (geen vector = geen oordeel).
 */
export async function runOutlierPhase(
  candidates: GuardrailCandidate[]
): Promise<{ record: GatePhaseResult; survivors: GuardrailCandidate[] }> {
  const record = startPhaseRecord('outlier');
  const survivors: GuardrailCandidate[] = [];
  const rejected: string[] = [];

  // Groepeer per klasse en haal de embedding-vectoren op.
  const byClass = new Map<string, GuardrailCandidate[]>();
  for (const c of candidates) {
    const list = byClass.get(c.t3777Code) ?? [];
    list.push(c);
    byClass.set(c.t3777Code, list);
  }

  for (const [t3777Code, group] of byClass) {
    const withEmbeddings = await loadCandidateEmbeddings(group.map((c) => c.id));
    const auditCandidates = group
      .map((c) => {
        const emb = withEmbeddings.get(c.id);
        return emb ? { id: c.id, embedding: emb } : null;
      })
      .filter((x): x is { id: string; embedding: number[] } => x !== null);

    // Geen enkele kandidaat met embedding → allemaal door (niets te meten).
    if (auditCandidates.length === 0) {
      survivors.push(...group);
      continue;
    }

    const audit = await mlClient.outlierAudit({ t3777_code: t3777Code, candidates: auditCandidates });
    const outlierIds = new Set(
      audit.results.filter((r) => r.is_outlier).map((r) => r.id)
    );

    for (const c of group) {
      if (outlierIds.has(c.id)) {
        const ok = await softRejectCandidate(c.id, 'outlier');
        if (ok) rejected.push(c.id);
      } else {
        survivors.push(c);
      }
    }
  }

  record.finishedAt = new Date().toISOString();
  record.outcome = rejected.length > 0 ? 'rejected-some' : 'passed';
  record.details = { rejectedCandidateIds: rejected, evaluated: candidates.length };
  return { record, survivors };
}

/** Lees de embedding-vectoren van kandidaten (pgvector → number[]). */
export async function loadCandidateEmbeddings(
  candidateIds: string[]
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (candidateIds.length === 0) return result;

  const rows = await prisma.$queryRaw<
    Array<{ reference_candidate_id: string; embedding_text: string | null }>
  >(Prisma.sql`
    SELECT reference_candidate_id, embedding::text AS embedding_text
    FROM candidate_embeddings
    WHERE reference_candidate_id IN (${Prisma.join(candidateIds)})
      AND embedding IS NOT NULL
  `);

  for (const row of rows) {
    const text = (row.embedding_text ?? '').trim();
    if (text.startsWith('[') && text.endsWith(']')) {
      const nums = text
        .slice(1, -1)
        .split(',')
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n));
      if (nums.length > 0) result.set(row.reference_candidate_id, nums);
    }
  }
  return result;
}
