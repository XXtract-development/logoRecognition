/**
 * Nachtelijke promotie-batch-service (Story 13.4).
 *
 * Orkestreert één run van de `flywheel-promotion`-job (AD-6, AD-15):
 *   1. CRASH-RECOVERY (AD-12/AD-16): hervat éérst bestaande `pending`-batches,
 *      fase-idempotent via `gateResults` (afgeronde fasen overslaan).
 *   2. BUNDELING: bundel daarna pas nieuwe `candidate`-kandidaten in een nieuwe
 *      `pending`-batch en claim ze via conditional update `candidate → in_batch`
 *      met `promotionBatchId` (claim: hoogstens één niet-afgesloten batch).
 *
 * Uitsluitend deze worker instantieert batches en draait de poort (AD-15) — geen
 * poortlogica in enig HTTP-request-pad. De promotie-transactie (INSERT
 * ReferenceLogo + embedding-kopie) en de regressie-fase zijn 13.5: een batch die
 * hier alle guardrails passeert blijft `pending` met `gateResults.regression =
 * { outcome: 'not-run' }`, klaar voor 13.5.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import {
  runThresholdPhase,
  runCapPhase,
  runDedupPhase,
  runOutlierPhase,
  isPhaseComplete,
  type GuardrailCandidate,
} from './guardrails';
import { markPromotionRunSuccess } from './watchdog';
import { runRegressionGate } from './gate';
import { shouldSkipForPause } from './pause';
import { findClassesWithoutGoldSetCoverage } from './gold-set-composition';
import type { GatePhase, GatePhaseResult, GateResults } from './types';

const logger = createLogger('flywheel-promotion-batch');

/** Maximum kandidaten per batch (voorkomt onbegrensde nachtelijke run). */
const MAX_BATCH_SIZE = parseInt(process.env.FLYWHEEL_MAX_BATCH_SIZE || '500', 10);

/** De guardrail-fasen in uitvoeringsvolgorde (regressie = 13.5, hier not-run). */
const PHASE_ORDER: Array<{
  phase: Exclude<GatePhase, 'regression'>;
  run: (c: GuardrailCandidate[]) => Promise<{ record: GatePhaseResult; survivors: GuardrailCandidate[] }>;
}> = [
  { phase: 'threshold', run: runThresholdPhase },
  { phase: 'cap', run: runCapPhase },
  { phase: 'dedup', run: runDedupPhase },
  { phase: 'outlier', run: runOutlierPhase },
];

export interface PromotionRunResult {
  resumedBatchIds: string[];
  newBatchId: string | null;
  bundledCandidates: number;
}

/**
 * Draai één volledige promotielus-run (AD-6). Idempotent bij herstart: eerst
 * hervatten, dan bundelen. Legt bij succes de "laatste succesvolle run" vast
 * (watchdog, AC 9).
 */
export async function runPromotionLoop(): Promise<PromotionRunResult> {
  const resumedBatchIds: string[] = [];

  // 0. PAUZE-CHECK bij job-start (Story 13.6, AD-11): met het vliegwiel
  //    gepauzeerd wordt er GEEN batch verwerkt en niets gebundeld — de run wordt
  //    overgeslagen (geen batch-werk). De pauze is persistent (system_settings),
  //    dus een herstart hervat de pauze niet stilzwijgend. De watchdog-markering
  //    slaan we hier bewust over: een overgeslagen-wegens-pauze-run telt niet als
  //    "succesvolle promotielus".
  if (await shouldSkipForPause('flywheel-promotion')) {
    logger.info('Promotielus overgeslagen — vliegwiel gepauzeerd (AD-11)');
    return { resumedBatchIds: [], newBatchId: null, bundledCandidates: 0 };
  }

  // 1. CRASH-RECOVERY: hervat alle openstaande pending-batches, oudste eerst.
  const pending = await prisma.promotionBatch.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  for (const b of pending) {
    await processBatch(b.id);
    resumedBatchIds.push(b.id);
  }

  // 2. BUNDELING: nieuwe kandidaten in een verse batch.
  const bundle = await bundleNewCandidates();
  if (bundle) {
    await processBatch(bundle.batchId);
  }

  // Watchdog: markeer deze run als succesvol afgerond (AC 9).
  await markPromotionRunSuccess();

  return {
    resumedBatchIds,
    newBatchId: bundle?.batchId ?? null,
    bundledCandidates: bundle?.count ?? 0,
  };
}

/**
 * Bundel openstaande `candidate`-kandidaten in een nieuwe `pending`-batch en
 * claim ze (AD-15/AD-16). Batch-INSERT + kandidaat-claims in één transactie.
 * Claim = conditional update `WHERE status='candidate' AND promotion_batch_id IS
 * NULL`; 0 rows = niets te bundelen (geen lege batch).
 *
 * Retourneert `{ batchId, count }` of `null` als er geen kandidaten waren.
 */
export async function bundleNewCandidates(): Promise<{ batchId: string; count: number } | null> {
  // Kandidaat-ids die nog niet geclaimd zijn (buiten de transactie geselecteerd;
  // de claim binnen de transactie is conditioneel, dus een race verliest netjes).
  const open = await prisma.referenceCandidate.findMany({
    where: { status: 'candidate', promotionBatchId: null },
    orderBy: { createdAt: 'asc' },
    take: MAX_BATCH_SIZE,
    select: { id: true },
  });

  if (open.length === 0) {
    logger.info('Geen openstaande kandidaten om te bundelen');
    return null;
  }

  const candidateIds = open.map((c) => c.id);

  const result = await prisma.$transaction(async (tx) => {
    const batch = await tx.promotionBatch.create({
      data: {
        status: 'pending',
        gateResults: {} as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    // Claim: conditional update. Alleen kandidaten die NOG candidate + ongeclaimd
    // zijn gaan over naar in_batch (AD-16). Een parallelle claim verliest hier.
    const claimed = await tx.referenceCandidate.updateMany({
      where: {
        id: { in: candidateIds },
        status: 'candidate',
        promotionBatchId: null,
      },
      data: { status: 'in_batch', promotionBatchId: batch.id },
    });

    return { batchId: batch.id, count: claimed.count };
  });

  // Geen enkele kandidaat geclaimd (allemaal weggekaapt door een race): de lege
  // batch weer sluiten zodat er geen wees-batch blijft hangen.
  if (result.count === 0) {
    await prisma.promotionBatch.updateMany({
      where: { id: result.batchId, status: 'pending' },
      data: { status: 'rolled_back', closedAt: new Date() },
    });
    logger.info('Bundeling leeg na claim-race — lege batch gesloten', { batchId: result.batchId });
    return null;
  }

  logger.info('Nieuwe promotie-batch gebundeld', {
    batchId: result.batchId,
    claimed: result.count,
  });
  return { batchId: result.batchId, count: result.count };
}

/**
 * Verwerk één batch door de guardrail-fasen, fase-idempotent (AD-12). Een fase
 * met een afgerond record in `gateResults` wordt overgeslagen (crash-recovery).
 * Na de vier fasen initialiseert hij `gateResults.regression = { not-run }` en
 * laat de batch `pending` — 13.5 maakt de poort af.
 */
export async function processBatch(batchId: string): Promise<void> {
  const batch = await prisma.promotionBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, gateResults: true },
  });
  if (!batch || batch.status !== 'pending') {
    logger.info('Batch niet (meer) pending — overslaan', { batchId, status: batch?.status });
    return;
  }

  const gateResults: GateResults = (batch.gateResults as GateResults) ?? {};

  // Story 14.2 (AC 3): niet-blokkerende gold-set-dekkings-markering. Per
  // batch-klasse zonder ENIGE actieve gold-set-dekking schrijven we één
  // informatief item in `gateResults.goldSetCoverage` — puur signalerend
  // (markeren ≠ blokkeren, PRD §4.3): het beïnvloedt de poort-uitkomst NOOIT,
  // draait vóór de guardrails en verandert geen enkele fase-beslissing. Blokkeren
  // zou de bootstrap van nieuwe klassen onmogelijk maken. Idempotent: alleen
  // berekenen als het item nog ontbreekt (crash-recovery-vriendelijk).
  if (!gateResults.goldSetCoverage) {
    try {
      await markGoldSetCoverage(batchId, gateResults);
      await persistGateResults(batchId, gateResults);
    } catch (err) {
      // Best-effort: een dekkings-markering die faalt mag de poort nooit breken.
      logger.error('Gold-set-dekkings-markering overgeslagen (best-effort, AC3)', {
        batchId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  for (const { phase, run } of PHASE_ORDER) {
    if (isPhaseComplete(gateResults, phase)) {
      logger.info('Fase al afgerond — overslaan (crash-recovery)', { batchId, phase });
      continue;
    }

    // De overlevende kandidaten van de fase = de in_batch-kandidaten van de batch.
    const survivors = await loadBatchCandidates(batchId);
    const { record } = await run(survivors);
    gateResults[phase] = record;
    await persistGateResults(batchId, gateResults);
  }

  // Regressie-fase (Story 13.5): meet, beslis, promoveer of quarantaineer. Deze
  // fase muteert de batch-status zelf (passed/quarantined) — fase-idempotent via
  // `finishedAt` (crash-recovery, AD-12). Fail-closed: elke fout in de meetketen
  // wordt intern een quarantaine (AD-11), dus `runRegressionGate` gooit niet.
  if (!isPhaseComplete(gateResults, 'regression')) {
    await runRegressionGate(batchId, gateResults);
    logger.info('Regressie-poort afgerond', { batchId });
    return;
  }

  logger.info('Regressie-fase al afgerond — batch al beslist (crash-recovery)', { batchId });
}

/** Laad de nog-in-batch-kandidaten (survivors) van een batch als guardrail-input. */
export async function loadBatchCandidates(batchId: string): Promise<GuardrailCandidate[]> {
  const rows = await prisma.referenceCandidate.findMany({
    where: { promotionBatchId: batchId, status: 'in_batch' },
    select: { id: true, t3777Code: true, cropPath: true, evidence: true },
  });

  return rows.map((r) => {
    const evidence = (r.evidence as Record<string, unknown>) ?? {};
    const scores = (evidence.scores as Record<string, unknown> | undefined) ?? {};
    const confidence =
      typeof scores.confidence === 'number' ? (scores.confidence as number) : null;
    const method = typeof evidence.method === 'string' ? (evidence.method as string) : null;
    return {
      id: r.id,
      t3777Code: r.t3777Code,
      cropPath: r.cropPath,
      confidence,
      method,
    };
  });
}

/**
 * Story 14.2 (AC 3) — schrijf de niet-blokkerende gold-set-dekkings-markering in
 * `gateResults.goldSetCoverage`. Verzamelt de onderscheiden batch-klassen, vraagt
 * de sub-service welke daarvan ZONDER actieve gold-set-dekking zijn en legt dat
 * informatief vast. Muteert NOOIT de batch-status en verandert geen fase-
 * uitkomst (markeren ≠ blokkeren, PRD §4.3). Muteert alleen het in-memory
 * `gateResults`-object; de aanroeper persisteert.
 */
async function markGoldSetCoverage(
  batchId: string,
  gateResults: GateResults
): Promise<void> {
  const candidates = await loadBatchCandidates(batchId);
  const batchClasses = Array.from(new Set(candidates.map((c) => c.t3777Code)));
  const classesWithoutCoverage = await findClassesWithoutGoldSetCoverage(batchClasses);

  gateResults.goldSetCoverage = {
    markedAt: new Date().toISOString(),
    batchClasses,
    classesWithoutCoverage,
  };

  if (classesWithoutCoverage.length > 0) {
    logger.warn('Batch-klassen zonder gold-set-dekking gemarkeerd (niet-blokkerend, AC3)', {
      batchId,
      classesWithoutCoverage,
    });
  }
}

/** Schrijf de bijgewerkte gateResults terug op de batch (AD-13). */
async function persistGateResults(batchId: string, gateResults: GateResults): Promise<void> {
  await prisma.promotionBatch.update({
    where: { id: batchId },
    data: { gateResults: gateResults as Prisma.InputJsonValue },
  });
}
