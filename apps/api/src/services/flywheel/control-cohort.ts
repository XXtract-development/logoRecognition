/**
 * Controle-cohort voor de bevestigingsgraad-trend (Story 16.4, SM-3, FR-17).
 *
 * Een VAST cohort van ~100 GTINs wordt maandelijks herverwerkt zodat de stijging
 * van de CONFIRMED-ratio aantoonbaar toe te schrijven is aan REFERENTIEGROEI en
 * niet aan een veranderende productmix (SM-3). Cohort-stabiliteit is daarom een
 * HARDE eis: runs wijzigen de GTIN-lijst nooit — dat kan alleen bewust via een
 * nieuwe `system_settings`-waarde (gelogd), wat een nieuwe trendlijn start.
 *
 * MEETINSTRUMENT, geen verwerkingsfeature (vgl. 12.8-AC8): de herverwerking
 * produceert UITSLUITEND `mismatch_events` met herkomst `cohort-<runId>` — geen
 * review-items, geen nominaties, geen trainingsdata-registratie. De 12.8-verify-
 * flow (`runVerifyDeclared`) is de motor; zijn flywheel-hooks staan achter
 * `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` (default uit) en worden hier NIET
 * gebruikt — de cohortrun registreert zijn eigen events los, met de cohort-
 * herkomst, via `registerCohortMismatchEvents` (16.1-service).
 *
 * BINDENDE AD's:
 *   AD-6   geen nieuwe scheduler; queue `flywheel`, concurrency 1, Job Schedulers;
 *          cadans `FLYWHEEL_COHORT_CRON`, maandelijks nachtelijk.
 *   AD-11  pauze-scope: cohort-herverwerking is vliegwiel-verwerking; de job checkt
 *          de persistente pauze bij start en slaat de run over als gepauzeerd.
 *   AD-2/AD-13  API bezit de meetdata; elk meetpunt herleidbaar naar zijn run
 *          (`cohort-<runId>`) en zijn events.
 *   NFR-3/NFR-7  isolatie: draait op de BullMQ-worker, getemperd + time-boxed,
 *          nooit in het live-API-request-pad.
 */

import { createLogger } from '../../core/logger';
import { getSetting } from './system-settings';
import { shouldSkipForPause } from './pause';
import { registerCohortMismatchEvents } from './mismatch-events';
import { resolveGln } from '../t3777-declarations';
import { aliasDeclaredCodes } from '../t3777-aliases';
import {
  runVerifyDeclared,
  type VerifyRunState,
  type VerifyCodeResult,
} from '../pipeline/verify-flow';
import { getCohortMaxSeconds, getCohortGtinDelayMs } from './config';

const logger = createLogger('flywheel-control-cohort');

/** system_settings-sleutel voor de cohort-definitie (Story 16.4, key/value Json). */
export const CONTROL_COHORT_SETTING_KEY = 'flywheel.control-cohort';

/** BullMQ job-naam voor de maandelijkse cohort-herverwerking (queue `flywheel`). */
export const COHORT_RERUN_JOB = 'flywheel-cohort-rerun';

// ============================================
// Cohort-definitie (system_settings, AC1)
// ============================================

/**
 * Vorm van de `flywheel.control-cohort`-waarde in system_settings (AC1). De
 * `capturedAt` + `selectionCriterion` maken de definitie herleidbaar; `gtins` is
 * de bevroren lijst. Een bewuste wijziging schrijft een NIEUWE waarde (nieuwe
 * `capturedAt`) en start daarmee een nieuwe trendlijn.
 */
export interface ControlCohortDefinition {
  gtins: string[];
  capturedAt: string;
  selectionCriterion: string;
}

/**
 * Lees de cohort-definitie uit system_settings, defensief genormaliseerd. Geeft
 * `null` als de key ontbreekt of geen geldige GTIN-lijst bevat — de job logt dan
 * een skip i.p.v. te crashen (de definitie hoort eenmalig geseed te zijn).
 */
export async function resolveControlCohort(): Promise<ControlCohortDefinition | null> {
  const raw = await getSetting<Partial<ControlCohortDefinition>>(
    CONTROL_COHORT_SETTING_KEY
  );
  if (!raw || !Array.isArray(raw.gtins)) return null;

  // Dedup + trim; behoud volgorde (stabiel over runs). Lege/rare waarden weg.
  const seen = new Set<string>();
  const gtins: string[] = [];
  for (const g of raw.gtins) {
    if (typeof g !== 'string') continue;
    const t = g.trim();
    if (t.length === 0 || seen.has(t)) continue;
    seen.add(t);
    gtins.push(t);
  }
  if (gtins.length === 0) return null;

  return {
    gtins,
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : '',
    selectionCriterion:
      typeof raw.selectionCriterion === 'string' ? raw.selectionCriterion : '',
  };
}

// ============================================
// Ratio-berekening (PURE, AC2/AC5)
// ============================================

/** Aantallen per uitkomst-type binnen één cohort-run. */
export interface CohortRunCounts {
  confirmed: number;
  declaredNotFound: number;
  notSupported: number;
  /** GTINs die deze run niet verwerkt konden worden (API-fout/no-artwork/time-box). */
  skipped: number;
}

/**
 * Bevestigingsratio van een cohort-run: confirmed / (confirmed + declared-not-
 * found). `null` als de noemer 0 is (geen declaratie-uitkomsten in de run).
 *
 * GEDOCUMENTEERDE KEUZE (AC5): `not-supported` telt NIET mee in de noemer — een
 * code die het model niet kan detecteren is geen "niet gevonden", en zou de ratio
 * kunstmatig verlagen. Identiek aan de 16.1-ratio-definitie
 * (overview/mismatch-trends.confirmedRatio), zodat cohort- en reguliere trend
 * dezelfde meetlat gebruiken. GTIN-uitval (`skipped`) telt evenmin mee: een
 * niet-verwerkte GTIN levert geen declaratie-uitkomst.
 */
export function cohortConfirmedRatio(counts: {
  confirmed: number;
  declaredNotFound: number;
}): number | null {
  const denom = counts.confirmed + counts.declaredNotFound;
  if (denom === 0) return null;
  return Number((counts.confirmed / denom).toFixed(4));
}

/**
 * Leid uit één afgeronde verify-run de per-code-uitkomst-telling af (PURE, geen
 * DB). Mapt de 12.8-verdicts op de 16.1-eventtypes:
 *   CONFIRMED             → confirmed
 *   UNSUPPORTED           → not-supported (geen actieve referentieklasse)
 *   NOT_FOUND / UNCERTAIN → declared-not-found (gedeclareerd, niet bevestigd)
 *
 * `UNCERTAIN` (onder de drempel) telt als `declared-not-found`: de code is
 * gedeclareerd maar niet met voldoende vertrouwen bevestigd — hetzelfde als de
 * 16.1-mapping (`declared \ confirmedCodes` met actieve klasse).
 */
export function verdictsToCohortCounts(verdicts: VerifyCodeResult[]): {
  confirmed: number;
  declaredNotFound: number;
  notSupported: number;
} {
  let confirmed = 0;
  let declaredNotFound = 0;
  let notSupported = 0;
  for (const v of verdicts) {
    switch (v.verdict) {
      case 'CONFIRMED':
        confirmed += 1;
        break;
      case 'UNSUPPORTED':
        notSupported += 1;
        break;
      case 'NOT_FOUND':
      case 'UNCERTAIN':
        declaredNotFound += 1;
        break;
    }
  }
  return { confirmed, declaredNotFound, notSupported };
}

// ============================================
// Registratie-invoer uit een verify-run (AC2)
// ============================================

/**
 * Bouw de 16.1-registratie-invoer uit een afgeronde verify-run. De codes zijn
 * CANONISCH (alias-mapped) — gelijk aan hoe de verify-flow zijn eigen flywheel-
 * hooks voedt (C1-conventie) — zodat declared/confirmed in één code-ruimte staan.
 *
 * `declared` = de canonieke gedeclareerde codes van de run; `confirmedCodes` = de
 * canonieke codes met een CONFIRMED-verdict. `undeclaredFindings` is LEEG: de
 * cohortrun draait het verify-pad (alleen gedeclareerde codes gericht gelokaliseerd)
 * — er zijn per definitie geen niet-gedeclareerde vondsten (meetinstrument-scope).
 */
export function buildCohortRegisterInput(
  state: VerifyRunState,
  gln: string | null
): {
  gtin: string;
  gln: string | null;
  declared: string[];
  confirmedCodes: string[];
  undeclaredFindings: [];
} {
  const declared = aliasDeclaredCodes(state.declaration.codes).map((a) => a.canonical);
  const confirmedCodes = state.verdicts
    .filter((v) => v.verdict === 'CONFIRMED')
    .map((v) => v.code);
  return {
    gtin: state.gtin,
    gln,
    declared,
    confirmedCodes,
    undeclaredFindings: [],
  };
}

// ============================================
// De cohort-herverwerkings-job (AC2/AC4)
// ============================================

/** Resultaat van één cohort-run (voor logging/tests). */
export interface CohortRunResult {
  /** `skipped-paused` als de run wegens pauze niet draaide; `skipped-empty` als er
   *  geen cohort-definitie was; anders `ran`. */
  status: 'ran' | 'skipped-paused' | 'skipped-empty';
  runId: string | null;
  cohortSize: number;
  processed: number;
  counts: CohortRunCounts;
  confirmedRatio: number | null;
}

/** Genereer een run-id (datum-gebonden, herleidbaar, sorteerbaar). */
function newCohortRunId(now: Date): string {
  // ISO zonder scheidingstekens tot op de seconde: 20260703T032300Z.
  const iso = now.toISOString().replace(/[-:.]/g, '').slice(0, 15);
  return `${iso}Z`;
}

const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve();

/**
 * Voer één maandelijkse cohort-herverwerking uit (AC2/AC4).
 *
 * 1. PAUZE-CHECK bij start (AD-11): is het vliegwiel gepauzeerd, dan draait de
 *    run NIET (cohort-meting is vliegwiel-verwerking, geen read-only werk).
 * 2. Resolveer de vaste cohort-definitie (system_settings). Ontbreekt die, skip.
 * 3. Per GTIN: draai het 12.8-verify-pad (`runVerifyDeclared`) — declaraties →
 *    gerichte lokalisatie/classificatie → verdicts, ZONDER neveneffecten. Leid de
 *    uitkomst-telling af en registreer de events met herkomst `cohort-<runId>`.
 * 4. TIME-BOX (NFR-3): stopt netjes bij overschrijding van `FLYWHEEL_COHORT_MAX_
 *    SECONDS`; resterende GTINs vallen als uitval (gelogd), de definitie blijft.
 *
 * De GTIN-lijst wordt NOOIT gemuteerd (SM-3): verdwenen artwork/GTIN in een run
 * telt als uitval (no-artwork/failed → skipped), niet als lijst-wijziging.
 *
 * @param opts.runVerify  injecteerbaar voor tests (default: de echte verify-flow
 *                        MÉT `skipFlywheelHooks` — zie hieronder).
 * @param opts.now        injecteerbare klok (default: `new Date()`).
 */
export async function runCohortRerun(opts?: {
  runVerify?: (runId: string, gtin: string) => Promise<VerifyRunState>;
  now?: () => Date;
}): Promise<CohortRunResult> {
  // ISOLATIE (meetinstrument): de cohortrun draait het verify-pad MÉT
  // `skipFlywheelHooks`, zodat het NOOIT nominaties of kruischeck-herkomst-events
  // aanmaakt — ook niet als FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED live aanstaat.
  // De cohortrun registreert zijn eigen events los, met de cohort-herkomst.
  const runVerify =
    opts?.runVerify ??
    ((runId: string, gtin: string) =>
      runVerifyDeclared(runId, gtin, { skipFlywheelHooks: true }));
  const nowFn = opts?.now ?? (() => new Date());

  const emptyCounts: CohortRunCounts = {
    confirmed: 0,
    declaredNotFound: 0,
    notSupported: 0,
    skipped: 0,
  };

  // 1. Pauze-scope (AD-11): gepauzeerd → geen verwerking, gelogde skip.
  if (await shouldSkipForPause(COHORT_RERUN_JOB)) {
    return {
      status: 'skipped-paused',
      runId: null,
      cohortSize: 0,
      processed: 0,
      counts: emptyCounts,
      confirmedRatio: null,
    };
  }

  // 2. Vaste cohort-definitie.
  const cohort = await resolveControlCohort();
  if (!cohort || cohort.gtins.length === 0) {
    logger.warn('Cohort-run overgeslagen: geen cohort-definitie in system_settings', {
      key: CONTROL_COHORT_SETTING_KEY,
    });
    return {
      status: 'skipped-empty',
      runId: null,
      cohortSize: 0,
      processed: 0,
      counts: emptyCounts,
      confirmedRatio: null,
    };
  }

  const startedAt = nowFn();
  const runId = newCohortRunId(startedAt);
  const maxMs = getCohortMaxSeconds() * 1000;
  const delayMs = getCohortGtinDelayMs();

  logger.info('Cohort-run gestart', {
    runId,
    cohortSize: cohort.gtins.length,
    capturedAt: cohort.capturedAt,
    maxSeconds: getCohortMaxSeconds(),
  });

  const counts: CohortRunCounts = { ...emptyCounts };
  let processed = 0;
  let timedOut = false;

  for (let i = 0; i < cohort.gtins.length; i++) {
    const gtin = cohort.gtins[i];

    // Time-box (NFR-3): stop netjes; de rest van het cohort valt als uitval.
    if (nowFn().getTime() - startedAt.getTime() > maxMs) {
      timedOut = true;
      const remaining = cohort.gtins.length - i;
      counts.skipped += remaining;
      logger.warn('Cohort-run getime-boxed — resterende GTINs vallen als uitval', {
        runId,
        processed,
        remaining,
        maxSeconds: getCohortMaxSeconds(),
      });
      break;
    }

    // Per-GTIN-run-id zodat de verify-flow zijn eigen (schaduw-)state/logs kan
    // schrijven; de mismatch-events dragen de COHORT-run-id (`cohort-<runId>`).
    const verifyRunId = `${runId}:${gtin}`;
    let state: VerifyRunState;
    try {
      state = await runVerify(verifyRunId, gtin);
    } catch (err) {
      // Een harde fout in één GTIN mag de hele run niet stoppen (fail-safe per
      // GTIN, guardrail): tel als uitval, log, ga door.
      counts.skipped += 1;
      logger.warn('Cohort-GTIN faalde (uitval, non-fataal)', {
        runId,
        gtin,
        error: err instanceof Error ? err.message : 'unknown',
      });
      await sleep(delayMs);
      continue;
    }

    // Uitval-behandeling (guardrail: run-uitval NIET maskeren als declared-not-
    // found). Geen artwork / harde fout / een fail-safe-declaratiereden → skip.
    if (state.status !== 'done') {
      counts.skipped += 1;
      logger.info('Cohort-GTIN niet verwerkt (uitval)', {
        runId,
        gtin,
        status: state.status,
      });
      await sleep(delayMs);
      continue;
    }
    // Een declaratie die door een fail-safe-fout leeg is, is GEEN meetuitkomst
    // (guardrail 8-3D/12.8-AC2): alleen `ok`/`lege-declaratie` zijn echte
    // declaratie-uitkomsten. `api-fout`/`api-key-ontbreekt`/`gln-ontbreekt`/
    // `404-mogelijk-TM-mismatch` → uitval, niet "alles niet-gevonden".
    const reason = state.declaration.reason;
    if (reason !== 'ok' && reason !== 'lege-declaratie') {
      counts.skipped += 1;
      logger.info('Cohort-GTIN uitval wegens declaratie-reden (niet gemaskeerd)', {
        runId,
        gtin,
        reason,
      });
      await sleep(delayMs);
      continue;
    }

    // Tel de per-code-uitkomsten voor de run-ratio.
    const c = verdictsToCohortCounts(state.verdicts);
    counts.confirmed += c.confirmed;
    counts.declaredNotFound += c.declaredNotFound;
    counts.notSupported += c.notSupported;
    processed += 1;

    // Registreer de events met de cohort-herkomst (16.1-service, best-effort).
    try {
      const gln = await resolveGln(gtin);
      const input = buildCohortRegisterInput(state, gln);
      await registerCohortMismatchEvents({ ...input, runId });
    } catch (err) {
      logger.warn('Cohort-eventregistratie faalde (non-fataal)', {
        runId,
        gtin,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }

    await sleep(delayMs);
  }

  const ratio = cohortConfirmedRatio(counts);
  logger.info('Cohort-run voltooid', {
    runId,
    processed,
    cohortSize: cohort.gtins.length,
    confirmed: counts.confirmed,
    declaredNotFound: counts.declaredNotFound,
    notSupported: counts.notSupported,
    skipped: counts.skipped,
    confirmedRatio: ratio,
    timedOut,
  });

  return {
    status: 'ran',
    runId,
    cohortSize: cohort.gtins.length,
    processed,
    counts,
    confirmedRatio: ratio,
  };
}
