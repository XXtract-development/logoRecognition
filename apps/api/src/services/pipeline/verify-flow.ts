/**
 * Declared-values verification flow (Story 12.8 — kruischeck-endpoint voor n8n).
 *
 * The verify-flow confirms ONLY what a GTIN declares (GS1 T3777) on its own
 * artwork — the "optie A: kruischeck" shadow-mode counterpart of the open
 * detection pipeline (8-3O). It reuses the existing building blocks and adds no
 * new detector, no model training and no side-effects on the live detection
 * pipeline:
 *
 *   import-check (delta)                        artwork-pipeline.ts import flow
 *     → declarations (T3777)                    t3777-declarations.resolveDeclarations
 *     → alias → active-class filter             t3777-aliases + reference_logos
 *     → targeted localize (codes-filter, 4b)    ml-client.localizeArtwork({ codes })
 *     → classify the located regions            ml-client.classifyArtwork
 *     → verdicts via crosscheck THRESHOLDS      artwork-crosscheck.getThresholdForMethod
 *     → shadow-log to recognition_logs/_results (AC7, no migration)
 *     → CONFIRMED → flywheel kruischeck hook    kruischeck-hook.nominateFromKruischeck
 *                                               + mismatch-events (16.1), both
 *                                               behind FLYWHEEL_KRUISCHECK_… (default off)
 *
 * HARD SHADOW-MODE RULES (AC8): this flow NEVER creates artwork_review_items and
 * NEVER registers training data. It deliberately does NOT call
 * `crosscheckDetections` (which persists review items); it reuses only the pure
 * per-method THRESHOLD logic from that module so verdict boundaries stay
 * byte-identical to the crosscheck without its write side-effects.
 *
 * Run-state lives in Redis (AC7): no new Prisma model, no migration. The job
 * runs on the existing BullMQ pipeline queue (AC8) so parallel n8n calls do not
 * starve the live API.
 */

import { Queue } from 'bullmq';
import { getRedisConnection, PIPELINE_JOB_OPTIONS } from './queue';
import { mlClient } from '../ml-client';
import { getThresholdForMethod } from '../artwork-crosscheck';
import {
  resolveDeclarations,
  resolveDeclaredMarks,
  nutriscoreDeclaredCodes,
  resolveGln,
  DeclarationReason,
} from '../t3777-declarations';
import { aliasDeclaredCodes } from '../t3777-aliases';
import { nominateFromKruischeck } from '../flywheel/kruischeck-hook';
import {
  registerKruischeckMismatchEvents,
  UndeclaredFinding,
} from '../flywheel/mismatch-events';
import { listTrainingObjectKeys } from '../storage';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';

const logger = createLogger('verify-flow');

/** BullMQ queue name — the existing pipeline queue set (queue.ts). */
export const VERIFY_QUEUE = 'artwork-detection';

/** Redis key prefix + TTL for the run-state (no DB, AC7). */
const RUN_STATE_PREFIX = 'verify-declared:run:';
const RUN_STATE_TTL_S = parseInt(process.env.VERIFY_RUN_STATE_TTL_S || '86400', 10);

// ============================================
// Types
// ============================================

export type VerifyRunStatus = 'running' | 'done' | 'no-artwork' | 'failed';

export type VerifyVerdict = 'CONFIRMED' | 'UNCERTAIN' | 'NOT_FOUND' | 'UNSUPPORTED';

export interface VerifyCodeResult {
  /** The declared code (trimmed/uppercased, as declared in GS1). */
  declaredCode: string;
  /** The canonical reference-class code after alias mapping. */
  code: string;
  /** Which alias was applied to reach the reference class, or null. */
  alias: string | null;
  verdict: VerifyVerdict;
  confidence: number | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  /** Artwork object key the (best) detection came from, or null. */
  sourceFile: string | null;
  /** Detection method that produced the (best) hit (classify method), or null. */
  method: string | null;
}

export interface VerifyRunState {
  status: VerifyRunStatus;
  gtin: string;
  declaration: { reason: DeclarationReason; codes: string[] };
  verdicts: VerifyCodeResult[];
  processingTimeMs: number | null;
  startedAt: string;
  /** Present when status === 'failed'. */
  error?: string;
}

export interface VerifyJobData {
  runId: string;
  gtin: string;
}

// ============================================
// Run-state (Redis, AC7)
// ============================================

function runStateKey(runId: string): string {
  return `${RUN_STATE_PREFIX}${runId}`;
}

/** Persist the run-state to Redis with a TTL. Best-effort logs on a Redis fault. */
export async function writeRunState(runId: string, state: VerifyRunState): Promise<void> {
  try {
    await getRedisConnection().setex(
      runStateKey(runId),
      RUN_STATE_TTL_S,
      JSON.stringify(state)
    );
  } catch (err) {
    logger.warn('Verify run-state write failed', {
      runId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/** Read the run-state from Redis. Returns null for an unknown/expired runId. */
export async function readRunState(runId: string): Promise<VerifyRunState | null> {
  let raw: string | null = null;
  try {
    raw = await getRedisConnection().get(runStateKey(runId));
  } catch (err) {
    logger.warn('Verify run-state read failed', {
      runId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerifyRunState;
  } catch {
    return null;
  }
}

// ============================================
// Artwork resolution (delta import-check)
// ============================================

interface ArtworkImage {
  storagePath: string;
}

/**
 * Collect the artwork IMAGES to verify for a GTIN from the already-imported
 * `artwork_imports` rows (delta: imported items are reused, never re-fetched
 * from the mediaserver in this shadow flow). JPG/PNG → the storagePath; PDF →
 * one image per rasterized page (`pages.pages[].imagePath`), mirroring
 * enqueueDetectionForImport. Returns [] when nothing is imported yet.
 */
export async function resolveArtworkImages(gtin: string): Promise<ArtworkImage[]> {
  const imports = await prisma.artworkImport.findMany({
    where: { gtin, status: 'imported' },
    select: { storagePath: true, mimeType: true, fileName: true, pages: true },
  });

  const images: ArtworkImage[] = [];
  for (const imp of imports) {
    if (!imp.storagePath) continue;
    const isPdf =
      (imp.mimeType ?? '').toLowerCase() === 'application/pdf' ||
      imp.storagePath.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      const pages = (imp.pages ?? null) as {
        pages?: Array<{ page: number; imagePath: string }>;
      } | null;
      for (const p of pages?.pages ?? []) {
        if (p.imagePath) images.push({ storagePath: p.imagePath });
      }
    } else {
      images.push({ storagePath: imp.storagePath });
    }
  }
  return images;
}

/**
 * Fallback: some artwork lands in storage under the `artwork/{gtin}/` convention
 * without a queryable import row (or the row predates the pages relation). When
 * the DB yields no images, list storage keys directly so a real, present artwork
 * is still verified instead of falsely reporting `no-artwork`.
 */
async function resolveArtworkImagesWithStorageFallback(
  gtin: string
): Promise<ArtworkImage[]> {
  const fromDb = await resolveArtworkImages(gtin);
  if (fromDb.length > 0) return fromDb;

  try {
    const keys = (await listTrainingObjectKeys(`artwork/${gtin}/`)).filter((k) =>
      /\.(png|jpe?g)$/i.test(k)
    );
    return keys.map((storagePath) => ({ storagePath }));
  } catch (err) {
    logger.warn('Storage artwork listing failed', {
      gtin,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return [];
  }
}

// ============================================
// Verdict mapping (reuses crosscheck THRESHOLDS, no review-item writes)
// ============================================

/** A single located+classified detection carried through the verify-flow. */
export interface VerifyDetection {
  code: string;
  confidence: number;
  method?: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  sourceFile: string;
}

/**
 * PURE verdict mapping (AC5) — no DB. For every declared (alias-mapped) code:
 *   - not in the active-class set        → UNSUPPORTED (AC3)
 *   - best detection ≥ method threshold  → CONFIRMED
 *   - best detection < method threshold  → UNCERTAIN (confidence carried)
 *   - no detection at all                → NOT_FOUND
 *
 * The threshold is the EXISTING per-method crosscheck threshold
 * (getThresholdForMethod) — no new threshold logic. A detection without a method
 * falls under the strictest (classifier), identical to the crosscheck.
 *
 * @param aliased        declared codes already alias-mapped + de-duplicated
 * @param activeClasses  set of canonical codes with an active reference class
 * @param detections     all located+classified detections for this GTIN
 */
export function mapVerdicts(
  aliased: ReturnType<typeof aliasDeclaredCodes>,
  activeClasses: Set<string>,
  detections: VerifyDetection[]
): VerifyCodeResult[] {
  // Beste detectie per canonieke code — gekozen op MARGE boven de eigen
  // methode-drempel, niet op rauwe confidence (12.27 adversarial-review M1):
  // methodes hebben uiteenlopende drempels (embedding 0.85, nutriscore-head
  // 0.80, nutriscore-a2 0.50); een 0.84-embedding zou anders een geldige
  // 0.80-head-treffer wegdrukken naar UNCERTAIN in multi-crop-gevallen.
  // Bij één detectie per code is dit byte-identiek aan het oude gedrag.
  const bestByCode = new Map<string, VerifyDetection>();
  const margin = (d: VerifyDetection) => d.confidence - getThresholdForMethod(d.method);
  for (const d of detections) {
    const prev = bestByCode.get(d.code);
    if (!prev || margin(d) > margin(prev)) bestByCode.set(d.code, d);
  }

  return aliased.map(({ declared, canonical, alias }): VerifyCodeResult => {
    if (!activeClasses.has(canonical)) {
      return {
        declaredCode: declared,
        code: canonical,
        alias,
        verdict: 'UNSUPPORTED',
        confidence: null,
        bbox: null,
        sourceFile: null,
        method: null,
      };
    }

    const best = bestByCode.get(canonical);
    if (!best) {
      return {
        declaredCode: declared,
        code: canonical,
        alias,
        verdict: 'NOT_FOUND',
        confidence: null,
        bbox: null,
        sourceFile: null,
        method: null,
      };
    }

    const threshold = getThresholdForMethod(best.method);
    const verdict: VerifyVerdict =
      best.confidence >= threshold ? 'CONFIRMED' : 'UNCERTAIN';
    return {
      declaredCode: declared,
      code: canonical,
      alias,
      verdict,
      confidence: best.confidence,
      bbox: best.bbox,
      sourceFile: best.sourceFile,
      method: best.method ?? null,
    };
  });
}

/** Set of canonical codes that have an active reference class (AC3 UNSUPPORTED source). */
async function loadActiveClassesFor(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true, t3777Code: { in: codes } },
    select: { t3777Code: true },
    distinct: ['t3777Code'],
  });
  return new Set(rows.map((r) => r.t3777Code));
}

// ============================================
// Shadow-logging (AC7 — recognition_logs / recognition_results)
// ============================================

/**
 * Shadow-log a finished run to the EXISTING recognition tables (AC7): one
 * recognition_logs row (requestId = runId, detectionCount = CONFIRMED count,
 * processingTimeMs) + one recognition_results row per CONFIRMED verdict (label,
 * confidence, bbox). No new model, no migration. Best-effort: a logging failure
 * never fails the run (mirrors recognition.ts logRecognitionResult).
 */
export async function shadowLogRun(
  runId: string,
  verdicts: VerifyCodeResult[],
  processingTimeMs: number
): Promise<void> {
  try {
    const confirmed = verdicts.filter((v) => v.verdict === 'CONFIRMED');
    const log = await prisma.recognitionLog.create({
      data: {
        requestId: runId,
        processingTimeMs,
        detectionCount: confirmed.length,
        // The crosscheck classifier threshold is the strictest verdict floor.
        confidenceThreshold: getThresholdForMethod('classifier'),
      },
    });

    if (confirmed.length > 0) {
      await prisma.recognitionResult.createMany({
        data: confirmed.map((v) => ({
          logId: log.id,
          category: 'keurmerk',
          value: v.code,
          confidence: v.confidence ?? 0,
          x: v.bbox?.x ?? 0,
          y: v.bbox?.y ?? 0,
          width: v.bbox?.width ?? 0,
          height: v.bbox?.height ?? 0,
        })),
      });
    }
  } catch (err) {
    logger.warn('Verify shadow-log failed (non-fatal)', {
      runId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ============================================
// Core run
// ============================================

/**
 * Execute the full declared-values verification for one GTIN and persist the
 * final run-state to Redis. Returns the final state (also handy for tests).
 * Never throws for a "no artwork" situation (AC1): that is a terminal
 * `no-artwork` status, not an error. A genuine failure (ML down mid-run) marks
 * the run `failed` with a reason.
 *
 * `opts.skipFlywheelHooks` (Story 16.4): suppress the kruischeck nomination +
 * mismatch-event hooks entirely — used by the control-cohort rerun, which is a
 * MEASUREMENT instrument and must never create nominations or kruischeck-origin
 * events (it registers its OWN cohort-origin events separately). Without this the
 * cohort would leak side-effects whenever FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED
 * is on in production (guardrail "geen nominaties/registraties vanuit de cohortrun").
 */
export async function runVerifyDeclared(
  runId: string,
  gtin: string,
  opts: { skipFlywheelHooks?: boolean } = {}
): Promise<VerifyRunState> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const base: VerifyRunState = {
    status: 'running',
    gtin,
    declaration: { reason: 'ok', codes: [] },
    verdicts: [],
    processingTimeMs: null,
    startedAt,
  };
  await writeRunState(runId, base);

  try {
    // 1. Artwork present? (delta import-check; no re-fetch in shadow mode.)
    const images = await resolveArtworkImagesWithStorageFallback(gtin);
    if (images.length === 0) {
      const state: VerifyRunState = {
        ...base,
        status: 'no-artwork',
        processingTimeMs: Date.now() - startMs,
      };
      await writeRunState(runId, state);
      logger.info('Verify run: no artwork for GTIN', { runId, gtin });
      return state;
    }

    // 2. Declarations (T3777) — reason carried 1:1 (AC2).
    // 12.27 — Nutri-Score wordt in het APARTE GS1-veld `nutritionalScore`
    // gedeclareerd (kale letter), niet in T3777; zonder deze stap kreeg elk
    // NS-product "lege-declaratie" (ontdekt bij de eerste echte API-runs).
    // Beide resolvers PARALLEL (eigen caches; cold-cache anders 2×10s
    // sequentiële catalog-timeout, review-L); een marks-fout is fail-open
    // (T3777-pad blijft byte-identiek).
    const [declaration, marksSettled] = await Promise.all([
      resolveDeclarations(gtin),
      resolveDeclaredMarks(gtin).then(
        (m) => ({ ok: true as const, marks: m.marks }),
        (err: unknown) => ({ ok: false as const, err })
      ),
    ]);
    let nsCodes: string[] = [];
    try {
      if (marksSettled.ok) {
        nsCodes = nutriscoreDeclaredCodes(marksSettled.marks);
      } else {
        throw marksSettled.err;
      }
    } catch (err) {
      logger.warn('Nutri-Score-declaratie-resolutie faalde (fail-open)', {
        runId,
        gtin,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
    const declaredCodes = [...new Set([...declaration.codes, ...nsCodes])];
    // Adversarial-review M2: alléén 'lege-declaratie' mag naar 'ok' kantelen
    // (T3777 geparsed maar leeg + NS-letter bestaat = er IS een declaratie).
    // Harde faalredenen (api-fout, 404-mogelijk-TM-mismatch, …) blijven staan —
    // de T3777-toestand is dan onbekend en dat mag nooit als "ok" ogen; de
    // NS-letters worden wél gewoon geverifieerd (extra kennis gooien we niet weg).
    if (nsCodes.length > 0 && declaration.reason === 'lege-declaratie') {
      declaration.reason = 'ok';
    }
    declaration.codes = declaredCodes;
    const aliased = aliasDeclaredCodes(declaration.codes);

    // No declared codes → done with empty verdicts, reason preserved (AC2:
    // a fail-safe empty declaration must never look like "verified, nothing
    // found"). Still shadow-logs the (empty) run.
    if (aliased.length === 0) {
      const state: VerifyRunState = {
        ...base,
        status: 'done',
        declaration: { reason: declaration.reason, codes: declaration.codes },
        verdicts: [],
        processingTimeMs: Date.now() - startMs,
      };
      await shadowLogRun(runId, [], state.processingTimeMs ?? 0);
      await writeRunState(runId, state);
      logger.info('Verify run: no declared codes', {
        runId,
        gtin,
        reason: declaration.reason,
      });
      return state;
    }

    // 3. Active-class filter (canonical codes) — the UNSUPPORTED source (AC3).
    const canonicalCodes = aliased.map((a) => a.canonical);
    const activeClasses = await loadActiveClassesFor(canonicalCodes);
    // Only run detection for codes that HAVE an active reference class — the
    // candidate shrink that carries the latency budget (AC4). Unsupported codes
    // are decided without any ML call.
    const detectableCodes = canonicalCodes.filter((c) => activeClasses.has(c));

    // 4. Targeted localize → classify per artwork image, ONLY for the declared
    //    (alias-mapped, active) codes (AC4, option 4b codes-filter).
    const detections: VerifyDetection[] = [];
    if (detectableCodes.length > 0) {
      for (const img of images) {
        const localizeResult = await mlClient.localizeArtwork({
          storage_path: img.storagePath,
          codes: detectableCodes,
        });
        const localized = localizeResult.detections ?? [];
        if (localized.length === 0) continue;

        const crops = localized
          .map((d) => d.bbox as VerifyDetection['bbox'] | undefined)
          .filter(
            (b): b is { x: number; y: number; width: number; height: number } =>
              !!b && typeof b === 'object'
          );

        const classifyResult = await mlClient.classifyArtwork({
          storage_path: img.storagePath,
          crops,
        });
        for (const r of classifyResult.results ?? []) {
          if (!r.t3777_code || r.t3777_code === 'UNKNOWN') continue;
          // Defensive: only keep classifications for the declared codes (the
          // localize codes-filter already narrows this, but classify may map a
          // region to a neighbouring class).
          if (!detectableCodes.includes(r.t3777_code)) continue;
          detections.push({
            code: r.t3777_code,
            confidence: r.confidence,
            method: r.method,
            bbox: r.bbox ?? null,
            sourceFile: img.storagePath,
          });
        }
      }
    }

    // 5. Verdict per declared code (AC5) — pure mapping over the crosscheck
    //    thresholds; UNSUPPORTED for codes without an active class.
    const verdicts = mapVerdicts(aliased, activeClasses, detections);
    const processingTimeMs = Date.now() - startMs;

    const state: VerifyRunState = {
      status: 'done',
      gtin,
      declaration: { reason: declaration.reason, codes: declaration.codes },
      verdicts,
      processingTimeMs,
      startedAt,
    };

    // 6. Shadow-log (AC7) — recognition_logs/_results, no migration.
    await shadowLogRun(runId, verdicts, processingTimeMs);

    // 7. Persist the FINAL verdict-response FIRST so the flywheel hooks below can
    //    never alter the n8n-facing contract (AD-8 shadow invariant): the
    //    response is written before any nomination/mismatch work.
    await writeRunState(runId, state);

    // 8. Flywheel kruischeck hooks (Story 13.2 + 16.1) — behind
    //    FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED (which also requires the main
    //    flag; both default OFF → zero side-effects, AC8 stays intact). This runs
    //    in the WORKER (synchronous nomination allowed) and is best-effort: a
    //    hook failure never fails the run and never touches the response above.
    //    The declared codes are passed CANONICAL (alias-mapped) so the mismatch
    //    mapper compares declared/confirmed/detected in one code space (C1 fix).
    //    Story 16.4: the control-cohort rerun passes skipFlywheelHooks so it never
    //    creates nominations/kruischeck-origin events (measurement-only).
    if (!opts.skipFlywheelHooks) {
      const canonicalDeclared = aliased.map((a) => a.canonical);
      await runFlywheelHooks(gtin, canonicalDeclared, verdicts, detections, runId);
    }

    logger.info('Verify run complete', {
      runId,
      gtin,
      declared: declaration.codes.length,
      confirmed: verdicts.filter((v) => v.verdict === 'CONFIRMED').length,
      processingTimeMs,
    });
    return state;
  } catch (err) {
    const state: VerifyRunState = {
      ...base,
      status: 'failed',
      processingTimeMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : 'unknown',
    };
    await writeRunState(runId, state);
    logger.error('Verify run failed', {
      runId,
      gtin,
      error: state.error,
    });
    return state;
  }
}

/**
 * Wire the CONFIRMED verdicts into the flywheel (nomination + mismatch events),
 * both gated behind FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED inside the callees.
 * Called AFTER the verdict-response is persisted so the response stays byte-equal
 * regardless of the flag (schaduwmodus). Best-effort per hook.
 *
 * `declared` here is the CANONICAL (alias-mapped) declared-code set so that
 * declared / confirmedCodes / detected all live in one code space — the 16.1
 * mismatch mapper keys `not-supported`/`declared-not-found` on `declared \
 * confirmedCodes` and the active-class set, all canonical (C1 fix).
 */
async function runFlywheelHooks(
  gtin: string,
  declared: string[],
  verdicts: VerifyCodeResult[],
  detections: VerifyDetection[],
  runId: string
): Promise<void> {
  const confirmed = verdicts.filter((v) => v.verdict === 'CONFIRMED');

  // Nomination (13.2): each CONFIRMED verdict becomes a candidate reference. The
  // worker path allows synchronous nomination (enqueue:false). The flag check
  // lives inside nominateCandidate (via nominateFromKruischeck).
  for (const v of confirmed) {
    try {
      await nominateFromKruischeck({
        gtin,
        t3777Code: v.code,
        confidence: v.confidence ?? 1,
        method: v.method ?? undefined,
        sourceFile: v.sourceFile ?? undefined,
        bbox: v.bbox ?? undefined,
        declared,
        enqueue: false,
      });
    } catch (err) {
      logger.warn('Kruischeck nomination failed (non-fatal)', {
        runId,
        code: v.code,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // Mismatch-events (16.1): confirmed/declared-not-found/not-supported per
  // declared code + found-not-declared for high-confidence non-declared finds.
  // The flag check lives inside registerKruischeckMismatchEvents (which requires
  // FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED); with the flag off this writes NOTHING.
  try {
    const declaredSet = new Set(declared.map((c) => c.trim().toUpperCase()));
    const undeclaredFindings: UndeclaredFinding[] = detections
      .filter((d) => !declaredSet.has(d.code))
      .map((d) => ({ t3777Code: d.code, confidence: d.confidence, method: d.method }));

    const gln = await resolveGln(gtin);
    await registerKruischeckMismatchEvents({
      gtin,
      gln,
      declared,
      confirmedCodes: confirmed.map((v) => v.code),
      undeclaredFindings,
      runId,
    });
  } catch (err) {
    logger.warn('Kruischeck mismatch registration failed (non-fatal)', {
      runId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ============================================
// Enqueue + worker (BullMQ pipeline queue, AC8)
// ============================================

/** BullMQ job name for a verify-declared run. */
export const VERIFY_JOB_NAME = 'verify-declared';

/**
 * Enqueue a verify-declared run on the existing pipeline queue (AC8) so parallel
 * n8n calls do not starve the live API. Writes the initial `running` run-state
 * first so a poll immediately after the 202 sees a valid run.
 */
export async function enqueueVerifyDeclared(gtin: string, runId: string): Promise<void> {
  await writeRunState(runId, {
    status: 'running',
    gtin,
    declaration: { reason: 'ok', codes: [] },
    verdicts: [],
    processingTimeMs: null,
    startedAt: new Date().toISOString(),
  });

  const connection = getRedisConnection();
  const queue = new Queue(VERIFY_QUEUE, { connection });
  try {
    await queue.add(
      VERIFY_JOB_NAME,
      { runId, gtin } as VerifyJobData,
      // 12.26: BullMQ verbiedt ':' in custom job-ids (Redis-key-delimiter) —
      // 'verify:<runId>' faalde op ACC met "Custom Id cannot contain :" en
      // blokkeerde ELKE verify-declared-start. Dispatch gaat op job-NAAM, dus
      // het id-formaat is verder nergens aan gekoppeld.
      { ...PIPELINE_JOB_OPTIONS, jobId: `verify-${runId}` }
    );
  } finally {
    await queue.close();
  }
}

/**
 * Job handler for a verify-declared job on the shared detection queue (AC8). The
 * existing detection worker (workers.ts) routes jobs by name and calls this for
 * VERIFY_JOB_NAME — no second worker on the same queue (which would compete for
 * jobs). Exported so tests can drive the handler without a live Worker/Redis.
 */
export async function runVerifyJob(data: VerifyJobData): Promise<VerifyRunState> {
  return runVerifyDeclared(data.runId, data.gtin);
}
