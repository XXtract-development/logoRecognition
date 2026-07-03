/**
 * Kwaliteitspoort — regressie-fase, tolerantie-beslissing, promotie/quarantaine
 * (Story 13.5, AD-3/AD-4/AD-5/AD-11/AD-16).
 *
 * Dit is de laatste poort-fase van de nachtelijke promotielus (na de vier
 * guardrails van 13.4). `runRegressionGate` wordt aangeroepen door
 * `promotion-batch.ts:processBatch` en vervangt de 13.4-`not-run`-placeholder.
 *
 * Flow (AD-5):
 *   1. VERSIE-GUARD (AD-5/AD-16): kandidaten met embedding-modelversie ≠ de
 *      actieve modelversie worden niet gemeten → conditional update `in_batch →
 *      candidate` + her-embed-taak. Ze doen niet mee in deze batch.
 *   2. BASELINE-RESOLUTIE (AD-5): vergelijkings-baseline = `baselineMeasurement`
 *      van de meest recente `passed`-batch (`rolled_back` telt nooit). Geen enkele
 *      `passed`-batch → eenmalige NULMETING draaien en als baseline gebruiken (AC
 *      2). Baseline verouderd (AC 3, via `baseline.ts`) → verse nulmeting.
 *   3. METING (AD-5): gold-set (cropOnly) resolven → `MLClient.regressionEval`
 *      met de schaduwset (in_batch-kandidaten van déze batch). Fout/onbereikbaar
 *      → fail-closed-quarantaine (AC 7, AD-11).
 *   4. TOLERANTIE (AD-5): < `SAMPLE_SWITCH` samples → quarantaine bij ≥
 *      `MIN_WORSENED` netto verslechterde samples; ≥ `SAMPLE_SWITCH` → 1pp-daling.
 *   5. BINNEN TOLERANTIE → atomaire promotie (`promotion.ts`) + batch `passed` +
 *      `baselineMeasurement` = deze meting + `closedAt` (AC 5). BOVEN TOLERANTIE
 *      → quarantaine met delta + meest getroffen klassen + notificatie (AC 6).
 *
 * FAIL-CLOSED (AD-11): elke exception in de meetketen → `quarantined`/`systeem-
 * fout`; nooit doorpromoveerd, nooit stil ge-skipped.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { socketIOManager } from '../socket-io-manager';
import { mlClient } from '../ml-client';
import { getRedisConnection } from '../pipeline/queue';
import { getActiveGoldSet } from './gold-set';
import { isBaselineStale } from './baseline';
import { promoteBatchCandidates } from './promotion';
import {
  getRegressionThreshold,
  getRegressionMinWorsened,
  getRegressionSampleSwitch,
  getRegressionTolerancePp,
} from './config';
import { startPhaseRecord } from './guardrails';
import type {
  GateResults,
  GatePhaseResult,
  RegressionMeasurement,
  RegressionSample,
} from './types';

const logger = createLogger('flywheel-gate');

const FLYWHEEL_QUEUE = 'flywheel';
const REEMBED_JOB = 'flywheel-reembed';
const QUARANTINE_REASON_CODE = 'flywheel-batch-quarantined';

/**
 * Draai de regressie-fase + poort-beslissing voor een batch (AD-5). Muteert de
 * batch-status naar `passed` (promotie) of `quarantined` (fail-closed of
 * regressie) en werkt `gateResults.regression` bij. Fail-closed: elke fout → de
 * batch wordt gequarantaineerd met reden `systeem-fout` (AD-11).
 */
export async function runRegressionGate(
  batchId: string,
  gateResults: GateResults
): Promise<void> {
  const record = startPhaseRecord('regression');

  // FASE A — MEETKETEN (fail-closed, AD-11). Elke fout tot en met de
  // tolerantie-beslissing → quarantaine `systeem-fout`. Promotie zit BEWUST
  // buiten deze try: een infra-fout ná een reeds-gecommitte, atomaire promotie
  // (AD-3) mag de batch niet alsnog naar quarantaine flippen terwijl er al
  // actieve referenties zijn.
  let measurement: RegressionMeasurement;
  let baseline: RegressionMeasurement;
  try {
    // 1. VERSIE-GUARD (AD-5/AD-16) — vóór de meting.
    await enforceVersionGuard(batchId);

    // 2. BASELINE-RESOLUTIE (AD-5).
    baseline = await resolveBaseline(batchId);

    // 3. METING (AD-5) — schaduw-meting met de in_batch-kandidaten van deze batch.
    measurement = await measureBatch(batchId, 'shadow');
  } catch (err) {
    // FAIL-CLOSED (AD-11): elke fout in de meetketen → quarantaine `systeem-fout`.
    logger.error('Regressie-poort faalde — fail-closed-quarantaine (systeem-fout)', {
      batchId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    await quarantineBatch(batchId, gateResults, record, {
      reason: 'systeem-fout',
      measurement: null,
      baseline: null,
      delta: null,
      worsenedSamples: [],
      mostAffectedClasses: [],
      errorMessage: err instanceof Error ? err.message : 'onbekende fout',
    });
    return;
  }

  // 4. TOLERANTIE (AD-5).
  const decision = decideTolerance(baseline, measurement);

  if (decision.decision === 'quarantine') {
    await quarantineBatch(batchId, gateResults, record, {
      reason: 'regressie',
      measurement,
      baseline,
      delta: decision.delta,
      worsenedSamples: decision.worsenedSampleIds,
      mostAffectedClasses: decision.mostAffectedClasses,
    });
    return;
  }

  // 5. BINNEN TOLERANTIE → atomaire promotie (AD-3) + batch afsluiten (AC 5).
  // Buiten de fail-closed-try: per-kandidaat-promoties zijn al atomair
  // gecommit; een fout hier wordt gelogd, niet ge-quarantaineerd.
  await promoteAndClose(batchId, gateResults, record, measurement);
}

// ============================================
// 1. Versie-guard (AD-5/AD-16)
// ============================================

/**
 * Bepaal de actieve embedding-modelversie: de `version` van het model met
 * `isActive=true`. Geen actief model → `null` (dan wordt de versie-guard
 * overgeslagen: er is geen versie om tegen te vergelijken).
 */
export async function getActiveModelVersion(): Promise<string | null> {
  const active = await prisma.modelVersion.findFirst({
    where: { isActive: true },
    select: { version: true },
    orderBy: { createdAt: 'desc' },
  });
  return active?.version ?? null;
}

/**
 * Versie-guard (AD-5/AD-16): kandidaten waarvan de embedding-modelversie ≠ de
 * actieve modelversie gaan niet mee in de meting. Conditional update `in_batch →
 * candidate` (0 rows = overslaan) + her-embed-taak enqueue-en zodat de kandidaat
 * met een verse embedding terugkeert. Retourneert de teruggezette kandidaat-ids.
 */
export async function enforceVersionGuard(batchId: string): Promise<string[]> {
  const activeVersion = await getActiveModelVersion();
  if (!activeVersion) {
    logger.info('Geen actief model — versie-guard overgeslagen', { batchId });
    return [];
  }

  const candidates = await prisma.referenceCandidate.findMany({
    where: { promotionBatchId: batchId, status: 'in_batch' },
    select: { id: true, evidence: true },
  });

  const reverted: string[] = [];
  for (const c of candidates) {
    const evidence = (c.evidence as Record<string, unknown>) ?? {};
    const candidateVersion =
      typeof evidence.embeddingModelVersion === 'string'
        ? (evidence.embeddingModelVersion as string)
        : null;
    if (candidateVersion === activeVersion) {
      continue; // versie klopt → meten
    }

    // Conditional update in_batch → candidate (AD-16), losgekoppeld van de batch.
    const updated = await prisma.referenceCandidate.updateMany({
      where: { id: c.id, status: 'in_batch' },
      data: { status: 'candidate', promotionBatchId: null },
    });
    if (updated.count === 0) {
      continue; // al afgehandeld
    }
    await appendVersionGuardTransition(c.id, candidateVersion, activeVersion);
    await enqueueReembed(c.id);
    reverted.push(c.id);
  }

  if (reverted.length > 0) {
    logger.info('Versie-guard: kandidaten teruggezet naar candidate + her-embed', {
      batchId,
      count: reverted.length,
      activeVersion,
    });
  }
  return reverted;
}

/** Enqueue een her-embed-taak op de flywheel-queue (best-effort, non-fataal). */
async function enqueueReembed(candidateId: string): Promise<void> {
  try {
    const { Queue } = await import('bullmq');
    const queue = new Queue(FLYWHEEL_QUEUE, { connection: getRedisConnection() });
    try {
      await queue.add(REEMBED_JOB, { candidateId });
    } finally {
      await queue.close();
    }
  } catch (err) {
    logger.warn('Kon her-embed-taak niet enqueue-en (non-fataal)', {
      candidateId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/** Log de versie-guard-overgang in de kandidaat-evidence (AD-13). */
async function appendVersionGuardTransition(
  candidateId: string,
  from: string | null,
  activeVersion: string
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
    transitions.push({
      from: 'in_batch',
      to: 'candidate',
      reason: `versie-guard: embedding-modelversie ${from ?? 'onbekend'} ≠ actief ${activeVersion}`,
      at: new Date().toISOString(),
    });
    await prisma.referenceCandidate.update({
      where: { id: candidateId },
      data: {
        evidence: { ...evidence, statusTransitions: transitions } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn('Kon versie-guard-overgang niet loggen (non-fataal)', {
      candidateId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ============================================
// 2. Baseline-resolutie (AD-5)
// ============================================

/**
 * Resolveer de vergelijkings-baseline (AD-5): de `baselineMeasurement` van de
 * meest recente `passed`-batch. Geen `passed`-batch → eenmalige NULMETING (AC 2).
 * Verouderde baseline (AC 3, `baseline.ts`) → verse nulmeting op de actuele set.
 */
export async function resolveBaseline(
  batchId: string
): Promise<RegressionMeasurement> {
  const stale = await isBaselineStale();

  if (!stale) {
    const lastPassed = await prisma.promotionBatch.findFirst({
      where: { status: 'passed', baselineMeasurement: { not: Prisma.DbNull } },
      orderBy: { closedAt: 'desc' },
      select: { baselineMeasurement: true },
    });
    if (lastPassed?.baselineMeasurement) {
      return lastPassed.baselineMeasurement as unknown as RegressionMeasurement;
    }
    // Geen enkele passed-batch → eenmalige nulmeting (AC 2).
    logger.info('Geen passed-batch — eenmalige nulmeting als initiële baseline (AC 2)', {
      batchId,
    });
  } else {
    logger.info('Baseline verouderd — verse nulmeting op de actuele set (AC 3)', {
      batchId,
    });
  }

  // Nulmeting: uitsluitend de actieve set (geen schaduwset).
  return measureBatch(batchId, 'nulmeting');
}

// ============================================
// 3. Meting (AD-5)
// ============================================

/**
 * Meet precisie@drempel via ml-service (AD-5). `mode='nulmeting'` = zonder
 * schaduwset (AC 2/3); `mode='shadow'` = met de in_batch-kandidaten van deze
 * batch. Een lege gold-set of ml-fout gooit → de aanroeper quarantaineert
 * fail-closed (AD-11).
 */
export async function measureBatch(
  batchId: string,
  mode: 'nulmeting' | 'shadow'
): Promise<RegressionMeasurement> {
  const threshold = getRegressionThreshold();

  // Gold-set resolven (AD-4) — uitsluitend crop-niveau (de eval consumeert die).
  const goldSet = await getActiveGoldSet({ cropOnly: true });
  if (goldSet.length === 0) {
    throw new Error('Lege gold-set — regressie-eval niet uitvoerbaar (fail-closed).');
  }

  const goldSetPayload = goldSet.map((g) => ({
    id: g.id,
    cropPath: g.cropPath as string,
    label: g.label,
    t3777Code: g.t3777Code,
    contentHash: readContentHash(g.evidence),
  }));

  const shadowCandidates =
    mode === 'shadow' ? await loadShadowCandidates(batchId) : [];

  const result = await mlClient.regressionEval({
    goldSet: goldSetPayload,
    shadowCandidates,
    threshold,
    includeShadow: mode === 'shadow',
  });

  return {
    precision: result.precision,
    total: result.total,
    correct: result.correct,
    threshold,
    mode,
    perClass: result.per_class,
    samples: result.samples as RegressionSample[],
    measuredAt: new Date().toISOString(),
  };
}

/** Lees de contentHash uit de gold-set-record-evidence (voor de self-match-guard). */
function readContentHash(evidence: Record<string, unknown>): string | null {
  const ch = evidence?.contentHash;
  return typeof ch === 'string' ? ch : null;
}

/**
 * Laad de schaduwset: uitsluitend de `in_batch`-kandidaten van DEZE batch (AD-5),
 * met hun embedding-kopie (uit candidate_embeddings) + contentHash + klasse. Eén
 * raw query omdat de vector een Unsupported-kolom is.
 */
export async function loadShadowCandidates(
  batchId: string
): Promise<Array<{ id: string; embedding: number[]; t3777Code: string; contentHash: string | null }>> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; t3777_code: string; content_hash: string | null; embedding_text: string | null }>
  >(Prisma.sql`
    SELECT rc.id, rc.t3777_code, rc.content_hash, ce.embedding::text AS embedding_text
    FROM reference_candidates rc
    JOIN candidate_embeddings ce ON ce.reference_candidate_id = rc.id
    WHERE rc.promotion_batch_id = ${batchId}::uuid
      AND rc.status = 'in_batch'
      AND ce.embedding IS NOT NULL
  `);

  const out: Array<{ id: string; embedding: number[]; t3777Code: string; contentHash: string | null }> = [];
  for (const r of rows) {
    const embedding = parseVectorText(r.embedding_text);
    if (embedding.length === 0) continue;
    out.push({
      id: r.id,
      embedding,
      t3777Code: r.t3777_code,
      contentHash: r.content_hash,
    });
  }
  return out;
}

/** Parse een pgvector-text (`[0.1,0.2,...]`) naar een number[]. */
export function parseVectorText(text: string | null): number[] {
  if (!text) return [];
  const trimmed = text.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (trimmed.length === 0) return [];
  return trimmed.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

// ============================================
// 4. Tolerantie-beslissing (AD-5)
// ============================================

export interface ToleranceDecision {
  decision: 'promote' | 'quarantine';
  /** Netto verslechterde samples (sample-modus) of precisie-daling in pp (pp-modus). */
  delta: number;
  worsenedSampleIds: string[];
  mostAffectedClasses: string[];
  mode: 'sample' | 'pp';
}

/**
 * Beslis promotie vs. quarantaine t.o.v. de baseline (AD-5).
 *
 * < `SAMPLE_SWITCH` samples (kleine gold-set): tel de NETTO verslechterde samples
 * — een sample dat in de baseline `correct` was en nu niet telt +1; een sample
 * dat nu `correct` is maar in de baseline niet telt −1 (verbeterde samples
 * compenseren). ≥ `MIN_WORSENED` netto verslechterd → quarantaine.
 *
 * ≥ `SAMPLE_SWITCH` samples: 1pp-regel — een precisie-daling > `TOLERANCE_PP`
 * procentpunten → quarantaine.
 *
 * De baseline-samples worden op `id` gematcht; een sample dat niet in de baseline
 * voorkomt (nieuw gold-set-record) telt als verslechterd als het nu fout is
 * (er was geen "beter" om vanaf te dalen — conservatief, fail-closed-geest).
 */
export function decideTolerance(
  baseline: RegressionMeasurement,
  measurement: RegressionMeasurement
): ToleranceDecision {
  const sampleSwitch = getRegressionSampleSwitch();

  if (measurement.total >= sampleSwitch) {
    // pp-modus.
    const tolerancePp = getRegressionTolerancePp();
    const dropPp = (baseline.precision - measurement.precision) * 100;
    const worsenedClasses = mostAffectedClasses(baseline, measurement);
    return {
      decision: dropPp > tolerancePp ? 'quarantine' : 'promote',
      delta: dropPp,
      worsenedSampleIds: [],
      mostAffectedClasses: worsenedClasses,
      mode: 'pp',
    };
  }

  // Sample-modus: netto verslechterde samples.
  const minWorsened = getRegressionMinWorsened();
  const baselineById = new Map<string, RegressionSample>();
  for (const s of baseline.samples ?? []) {
    baselineById.set(s.id, s);
  }

  let worsened = 0;
  let improved = 0;
  const worsenedIds: string[] = [];
  for (const s of measurement.samples ?? []) {
    const prev = baselineById.get(s.id);
    const wasCorrect = prev ? prev.correct : true; // afwezig in baseline → verwacht correct
    if (wasCorrect && !s.correct) {
      worsened += 1;
      worsenedIds.push(s.id);
    } else if (!wasCorrect && s.correct) {
      improved += 1;
    }
  }
  const net = worsened - improved;
  return {
    decision: net >= minWorsened ? 'quarantine' : 'promote',
    delta: net,
    worsenedSampleIds: worsenedIds,
    mostAffectedClasses: mostAffectedClasses(baseline, measurement),
    mode: 'sample',
  };
}

/**
 * Bepaal de meest getroffen klassen (AC 6): klassen waarvan de precisie het
 * sterkst daalde t.o.v. de baseline, aflopend. Alleen klassen met een daling.
 */
export function mostAffectedClasses(
  baseline: RegressionMeasurement,
  measurement: RegressionMeasurement
): string[] {
  const drops: Array<{ code: string; drop: number }> = [];
  for (const [code, cur] of Object.entries(measurement.perClass ?? {})) {
    const base = baseline.perClass?.[code];
    const basePrecision = base ? base.precision : 1;
    const drop = basePrecision - cur.precision;
    if (drop > 0) {
      drops.push({ code, drop });
    }
  }
  drops.sort((a, b) => b.drop - a.drop);
  return drops.map((d) => d.code);
}

// ============================================
// 5. Promotie + batch afsluiten (AD-3, AC 5)
// ============================================

async function promoteAndClose(
  batchId: string,
  gateResults: GateResults,
  record: GatePhaseResult,
  measurement: RegressionMeasurement
): Promise<void> {
  const promotion = await promoteBatchCandidates(batchId);

  record.finishedAt = new Date().toISOString();
  record.outcome = 'passed';
  record.details = {
    decision: 'promote',
    measurement,
    promoted: promotion.promoted,
    capRejected: promotion.capRejected,
    skipped: promotion.skipped,
    failed: promotion.failed,
  };
  gateResults.regression = record;

  try {
    await prisma.promotionBatch.update({
      where: { id: batchId },
      data: {
        status: 'passed',
        gateResults: gateResults as Prisma.InputJsonValue,
        baselineMeasurement: measurement as unknown as Prisma.InputJsonValue,
        closedAt: new Date(),
      },
    });
  } catch (err) {
    // De per-kandidaat-promoties zijn al atomair gecommit (AD-3). Als het
    // afsluiten van de batch faalt (infra), blijft de batch `pending` — de
    // crash-recovery van de volgende run (fase-idempotent via `gateResults`)
    // pakt 'm weer op. Nooit alsnog quarantaineren: er staan al actieve
    // referenties. Loggen en doorgaan.
    logger.error('Kon batch niet afsluiten na promotie (blijft pending voor crash-recovery)', {
      batchId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return;
  }

  // Template-/embedding-cache ml-side verversen zodat nieuwe referenties direct
  // meedoen in detectie (best-effort, non-fataal).
  try {
    await mlClient.reloadTemplates();
  } catch (err) {
    logger.warn('Kon ml-templates niet verversen na promotie (non-fataal)', {
      batchId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  logger.info('Batch gepromoveerd en afgesloten (passed)', {
    batchId,
    promoted: promotion.promoted.length,
    precision: measurement.precision,
  });
}

// ============================================
// 6/7. Quarantaine (AD-11, AC 6/7)
// ============================================

async function quarantineBatch(
  batchId: string,
  gateResults: GateResults,
  record: GatePhaseResult,
  info: {
    reason: 'regressie' | 'systeem-fout';
    measurement: RegressionMeasurement | null;
    baseline: RegressionMeasurement | null;
    delta: number | null;
    worsenedSamples: string[];
    mostAffectedClasses: string[];
    errorMessage?: string;
  }
): Promise<void> {
  record.finishedAt = new Date().toISOString();
  record.outcome = 'error';
  record.details = {
    decision: 'quarantine',
    reason: info.reason,
    delta: info.delta,
    worsenedSamples: info.worsenedSamples,
    mostAffectedClasses: info.mostAffectedClasses,
    measurement: info.measurement,
    ...(info.errorMessage ? { error: info.errorMessage } : {}),
  };
  gateResults.regression = record;

  // Kandidaten blijven in_batch (afhandeling is 15.3); niets wordt actief.
  await prisma.promotionBatch.update({
    where: { id: batchId },
    data: {
      status: 'quarantined',
      gateResults: gateResults as Prisma.InputJsonValue,
      closedAt: new Date(),
    },
  });

  await notifyBatchQuarantined(batchId, info.reason, info.delta, info.mostAffectedClasses);

  logger.warn('Batch gequarantaineerd', {
    batchId,
    reason: info.reason,
    delta: info.delta,
    mostAffectedClasses: info.mostAffectedClasses,
  });
}

/**
 * Notificeer een gequarantaineerde batch via het bestaande RetrainingNotification-
 * patroon (AD-11/ARCH-4): persistente rij + Socket.IO, eigen reason-code
 * `flywheel-batch-quarantined`. Idempotent op de per-batch trigger-id.
 */
export async function notifyBatchQuarantined(
  batchId: string,
  reason: 'regressie' | 'systeem-fout',
  delta: number | null,
  mostAffectedClasses: string[]
): Promise<void> {
  const triggerId = `${QUARANTINE_REASON_CODE}:${batchId}`;
  const reasonText =
    reason === 'systeem-fout'
      ? `De kwaliteitspoort kon batch ${batchId} niet meten (systeem-fout) — fail-closed gequarantaineerd.`
      : `Batch ${batchId} verslechterde de gold-set-regressie (delta ${delta ?? '?'}) — gequarantaineerd.` +
        (mostAffectedClasses.length > 0
          ? ` Meest getroffen klassen: ${mostAffectedClasses.join(', ')}.`
          : '');

  try {
    await prisma.retrainingNotification.create({
      data: { triggerId, reasons: [reasonText], status: 'unread' },
    });
  } catch (error: unknown) {
    const isUniqueViolation =
      error instanceof Error && error.message.includes('Unique constraint');
    if (!isUniqueViolation) {
      logger.warn('Kon quarantaine-notificatie niet schrijven (non-fataal)', {
        batchId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return;
    }
  }

  socketIOManager.broadcastAll('flywheel_batch_quarantined', {
    triggerId,
    batchId,
    reason,
    delta,
    mostAffectedClasses,
    timestamp: new Date().toISOString(),
  });
}
