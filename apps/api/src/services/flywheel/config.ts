/**
 * Referentie-vliegwiel — vlaggen en drempels (Story 13.2, AD-8/AD-9).
 *
 * Alle vliegwiel-config leeft achter de `FLYWHEEL_`-prefix (Consistency
 * Conventions) en staat bewust APART van de bestaande `CROSSCHECK_THRESHOLD_*`
 * (artwork-crosscheck.ts): de crosscheck-drempels bepalen auto-accept; de
 * promotiedrempels hier zijn een strengere tweede horde bovenop auto-accept
 * (alle default 0,90, PRD FR-5).
 *
 * Vlag-splitsing is hard (AD-8):
 *   - FLYWHEEL_NOMINATION_ENABLED (hoofdvlag, default false) bestuurt de
 *     crosscheck/import- én de reviewstation-herkomst.
 *   - FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED (default false) bestuurt aanvullend
 *     de kruischeck-herkomst en VEREIST óók de hoofdvlag.
 * Beide default uit = gedrag byte-gelijk aan vandaag.
 *
 * De env wordt per aanroep uitgelezen (geen module-level cache) zodat tests de
 * vlag-matrix kunnen doorlopen zonder module-herimport.
 */

/** Detectiemethode waarvoor een promotiedrempel geldt. */
export type NominationMethod = 'template' | 'embedding' | 'classifier';

/** Herkomst van een kandidaat-nominatie (AD-13 evidence-enum). */
export type NominationOrigin = 'crosscheck' | 'kruischeck' | 'bootstrap' | 'review';

/** Reden waarom een nominatie geweigerd/overgeslagen is (AC 7 teller-enum). */
export type MissedNominationReason = 'phash-onbereikbaar' | 'pauze' | 'vlag-uit';

const DEFAULT_PROMOTION_THRESHOLD = 0.9;

function parseBoolFlag(raw: string | undefined): boolean {
  return raw === 'true' || raw === '1';
}

function parseThreshold(raw: string | undefined): number {
  const v = parseFloat(raw ?? '');
  return Number.isFinite(v) ? v : DEFAULT_PROMOTION_THRESHOLD;
}

/** Hoofdvlag: nominatie uit crosscheck/import + reviewstation (AD-8). */
export function isNominationEnabled(): boolean {
  return parseBoolFlag(process.env.FLYWHEEL_NOMINATION_ENABLED);
}

/**
 * Kruischeck-nominatie vereist BEIDE vlaggen (AD-8). Met de hoofdvlag uit gaat
 * kruischeck-nominatie nooit aan, ook niet als de kruischeck-vlag toevallig aan
 * staat.
 */
export function isKruischeckNominationEnabled(): boolean {
  return (
    isNominationEnabled() &&
    parseBoolFlag(process.env.FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED)
  );
}

/** De per-methode-drempels die het dashboard afzonderlijk toont (FR-5). */
export const PROMOTION_METHODS: readonly NominationMethod[] = [
  'template',
  'embedding',
  'classifier',
] as const;

/** De default per-methode-drempel (env ?? 0,90), gedeeld met de resolver. */
export const PROMOTION_THRESHOLD_DEFAULT = DEFAULT_PROMOTION_THRESHOLD;

/**
 * Normaliseer een (optionele) detectiemethode naar één van de drie bekende
 * methoden. Detecties zonder methode vallen — net als in de crosscheck — onder
 * de strengste (classifier). Dit is de ENIGE plek waar die val-terug leeft, zowel
 * voor env als voor de system_settings-override.
 */
export function normalizeMethod(method?: string | null): NominationMethod {
  switch (method) {
    case 'template':
    case 'embedding':
    case 'classifier':
      return method;
    default:
      return 'classifier';
  }
}

/**
 * De env-drempel per methode (env ?? 0,90) — de BASISWAARDE zonder de
 * system_settings-override. Blijft synchroon zodat env-only callers (en tests)
 * hem zonder DB kunnen lezen. De effectieve waarde (inclusief UI-override) loopt
 * via `resolvePromotionThreshold` (async).
 */
export function getPromotionThresholdForMethod(method?: string): number {
  switch (normalizeMethod(method)) {
    case 'template':
      return parseThreshold(process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE);
    case 'embedding':
      return parseThreshold(process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING);
    case 'classifier':
    default:
      return parseThreshold(process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER);
  }
}

// ============================================
// Story 13.4 — guardrail-config (batch/cap/dedup/outlier/watchdog)
// ============================================

/**
 * Cadans van de nachtelijke promotielus (AD-6). Default 01:00 Europe/Amsterdam —
 * bewust vóór/buiten het harvest-venster (~03:23) om ml-service-CPU-concurrentie
 * te vermijden. De tijdzone wordt in de scheduler-opts expliciet gezet.
 */
export const FLYWHEEL_PROMOTION_CRON_DEFAULT = '0 1 * * *';
export const FLYWHEEL_PROMOTION_TZ = 'Europe/Amsterdam';

export function getPromotionCron(): string {
  const raw = process.env.FLYWHEEL_PROMOTION_CRON;
  return raw && raw.trim().length > 0 ? raw : FLYWHEEL_PROMOTION_CRON_DEFAULT;
}

/** Per-klasse cap op cumulatieve, actieve promotie-referenties (FR-6). Default 10. */
export function getClassCap(): number {
  const v = parseInt(process.env.FLYWHEEL_CLASS_CAP ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

/**
 * Dedup trap 1 — maximale pHash-Hamming-afstand waaronder twee crops als
 * duplicaat gelden ("strak" conform AD-9). Startwaarde 6 (op 64-bit pHash, ~9%
 * bitverschil) — documenteren zodat 14.x hem kan bijstellen.
 */
export function getDedupHammingMax(): number {
  const v = parseInt(process.env.FLYWHEEL_DEDUP_HAMMING_MAX ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 6;
}

/** Dedup trap 2 — cosine-drempel waarboven twee embeddings als duplicaat gelden (AD-9). Default 0,97. */
export function getDedupCosine(): number {
  const v = parseFloat(process.env.FLYWHEEL_DEDUP_COSINE ?? '');
  return Number.isFinite(v) ? v : 0.97;
}

/**
 * Watchdog-drempel: aantal uren zonder een succesvolle promotielus-run waarna de
 * watchdog een stilstand-notificatie stuurt (AD-11/ARCH-4). Default 26 uur — één
 * gemiste nacht plus marge.
 */
export function getWatchdogStaleHours(): number {
  const v = parseFloat(process.env.FLYWHEEL_WATCHDOG_STALE_HOURS ?? '');
  return Number.isFinite(v) && v > 0 ? v : 26;
}

// ============================================
// Story 13.5 — regressie-gate-config (drempel + tolerantie)
// ============================================

/**
 * Matchdrempel (cosine) voor de gold-set-regressie-eval (AD-5). Default 0,90 —
 * de PRD-promotiedrempel; documenteren zodat de eerste draai-weken hem kunnen
 * kalibreren (PRD OQ-1). Bewust los van de per-methode-promotiedrempels: dit is
 * de drempel waarmee de POORT meet, niet waarmee een detectie auto-accept haalt.
 */
export function getRegressionThreshold(): number {
  const v = parseFloat(process.env.FLYWHEEL_REGRESSION_THRESHOLD ?? '');
  return Number.isFinite(v) ? v : 0.9;
}

/**
 * Sample-gebaseerde tolerantie zolang de actieve gold-set klein is (AD-5): bij
 * ≥ `getRegressionMinWorsened()` netto verslechterde gold-set-samples t.o.v. de
 * baseline → quarantaine. Default 2.
 */
export function getRegressionMinWorsened(): number {
  const v = parseInt(process.env.FLYWHEEL_REGRESSION_MIN_WORSENED ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 2;
}

/**
 * Grootte-omschakelpunt (AD-5): vanaf een actieve gold-set van dit aantal samples
 * geldt de precisie-percentagepunt-drempel i.p.v. de sample-telling. Default 200.
 */
export function getRegressionSampleSwitch(): number {
  const v = parseInt(process.env.FLYWHEEL_REGRESSION_SAMPLE_SWITCH ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 200;
}

/**
 * Precisie-tolerantie in procentpunten (AD-5, PRD) — geldt pas vanaf ≥
 * `getRegressionSampleSwitch()` samples: een precisie-daling > dit aantal pp
 * t.o.v. de baseline → quarantaine. Default 1pp.
 */
export function getRegressionTolerancePp(): number {
  const v = parseFloat(process.env.FLYWHEEL_REGRESSION_TOLERANCE_PP ?? '');
  return Number.isFinite(v) && v >= 0 ? v : 1;
}

// ============================================
// Story 14.2 — gold-set-samenstellingsbewaking (scheefgroei-drempels)
// ============================================

/**
 * Maximaal aandeel (fractie 0–1) dat één klasse van de actieve gold-set mag
 * beslaan vóór er een scheefgroei-signaal ontstaat (FR-11, PRD-assumptie §9).
 * Default 0,20 (20%). Startwaarde uit de PRD-assumptie — env-configureerbaar
 * zodat de eerste draai-weken hem kunnen bijstellen, geen hardcode.
 *
 * De grens is INCLUSIEF: een klasse op exact het aandeel (> is de test, niet ≥)
 * telt nog niet als scheef — zie `computeGoldSetComposition`.
 */
export function getGoldSetClassShareMax(): number {
  const v = parseFloat(process.env.FLYWHEEL_GOLDSET_CLASS_SHARE_MAX ?? '');
  return Number.isFinite(v) && v > 0 ? v : 0.2;
}

/**
 * Onder- en bovengrens (fractie 0–1) van het gezonde ECHT-aandeel in de actieve
 * gold-set (FR-11, PRD-assumptie §9). Buiten [min, max] → scheefgroei-signaal.
 * Defaults 0,60 / 0,90. De grenzen zijn INCLUSIEF: een ECHT-aandeel op exact
 * 0,60 of 0,90 is nog gezond (< / > is de test).
 */
export function getGoldSetEchtMin(): number {
  const v = parseFloat(process.env.FLYWHEEL_GOLDSET_ECHT_MIN ?? '');
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.6;
}

export function getGoldSetEchtMax(): number {
  const v = parseFloat(process.env.FLYWHEEL_GOLDSET_ECHT_MAX ?? '');
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.9;
}

// ============================================
// Story 14.3 — wekelijkse outlier-audit-config (cadans + drempels)
// ============================================

/**
 * Cadans van de wekelijkse bibliotheek-outlier-audit (AD-6/AD-9). Default zondag
 * 05:00 Europe/Amsterdam — bewust BUITEN kantooruren, buiten het harvest-venster
 * (~03:23) én de promotielus (01:00), zodat de drie flywheel-jobs (concurrency 1)
 * elkaar niet in de weg zitten. De tijdzone wordt in de scheduler-opts expliciet
 * gezet (`FLYWHEEL_PROMOTION_TZ`).
 */
export const FLYWHEEL_OUTLIER_AUDIT_CRON_DEFAULT = '0 5 * * 0';

export function getOutlierAuditCron(): string {
  const raw = process.env.FLYWHEEL_OUTLIER_AUDIT_CRON;
  return raw && raw.trim().length > 0 ? raw : FLYWHEEL_OUTLIER_AUDIT_CRON_DEFAULT;
}

/**
 * Percentiel-drempel (0..1) waarboven een referentie een outlier-melding krijgt
 * (FR-8, AD-9 "bovenste 5%-percentiel"). Default 0,95 — de ml-service levert per
 * referentie een percentiel-rang (fractie referenties met afstand ≤ deze); een
 * rang ≥ deze drempel = bovenste (1−p)·100%. Startwaarde PRD, kalibreerbaar.
 */
export function getOutlierPercentile(): number {
  const v = parseFloat(process.env.FLYWHEEL_OUTLIER_PERCENTILE ?? '');
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.95;
}

/**
 * Absolute cosine-afstandsgrens (AD-9): een referentie boven deze afstand tot het
 * klasse-centroid is óók een outlier-melding, ongeacht percentiel — zo vangt de
 * audit een klasse waar de hele set ver van het centroid ligt (percentiel alleen
 * zou daar niets markeren). Default 0,45 — bewust ruimer dan de per-batch
 * guardrail (0,35, DEFAULT_OUTLIER_DISTANCE in de ml-service) omdat een
 * bestaande, actieve referentie meer marge verdient dan een verse kandidaat.
 * Startwaarde PRD, kalibreerbaar.
 */
export function getOutlierAbsDistance(): number {
  const v = parseFloat(process.env.FLYWHEEL_OUTLIER_ABS_DISTANCE ?? '');
  return Number.isFinite(v) && v > 0 ? v : 0.45;
}

/**
 * Minimaal aantal actieve referenties in een klasse vóór het percentiel-pad
 * betekenis heeft (AD-9-verduidelijking uit de story-testrichtlijn): bij < dit
 * aantal levert "top 5%" altijd minstens één "outlier" op een te kleine set —
 * dus onder deze grens telt ALLEEN de absolute-afstandsgrens, nooit het
 * percentiel. Default 3.
 */
export function getOutlierMinClassSize(): number {
  const v = parseInt(process.env.FLYWHEEL_OUTLIER_MIN_CLASS_SIZE ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

// ============================================
// Story 16.2 — structureel-drempel (declared-not-found → werkvoorraad, FR-15)
// ============================================

/**
 * Structureel-drempel N: minimaal aantal declared-not-found-events dat een
 * T3777-code moet hebben vóór hij werkvoorraad wordt (FR-15, PRD-assumptie §4.5).
 * Default 10. Samen met M (verschillende GTINs) voorkomt dit dat een incidentele
 * mis of één afwijkende GTIN al een klasse agendeert.
 */
export function getStructuralN(): number {
  const v = parseInt(process.env.FLYWHEEL_STRUCTURAL_N ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 10;
}

/**
 * Structureel-drempel M: minimaal aantal VERSCHILLENDE GTINs waarover die
 * declared-not-found-events verdeeld moeten zijn (FR-15, PRD-assumptie §4.5).
 * Default 5. Voorkomt dat N herverwerkingen van dezelfde GTIN de drempel halen —
 * pas een patroon over meerdere producten is structureel.
 */
export function getStructuralM(): number {
  const v = parseInt(process.env.FLYWHEEL_STRUCTURAL_M ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

// ============================================
// Story 16.4 — controle-cohort (maandelijkse herverwerkings-job, AD-6)
// ============================================

/**
 * Cadans van de maandelijkse controle-cohort-herverwerking (AD-6, Story 16.4).
 * Default: de 1e van de maand om 03:23 Europe/Amsterdam — bewust NA de nachtelijke
 * promotielus (01:00) en samenvallend met het harvest-venster-tijdstip maar op
 * één dag per maand, zodat de ~45–50 min cohortrun de dagelijkse stromen op de
 * overige dagen niet raakt. De tijdzone wordt in de scheduler-opts expliciet gezet
 * (`FLYWHEEL_PROMOTION_TZ`, gedeeld). Overschrijfbaar via `FLYWHEEL_COHORT_CRON`.
 */
export const FLYWHEEL_COHORT_CRON_DEFAULT = '23 3 1 * *';

export function getCohortCron(): string {
  const raw = process.env.FLYWHEEL_COHORT_CRON;
  return raw && raw.trim().length > 0 ? raw : FLYWHEEL_COHORT_CRON_DEFAULT;
}

/**
 * Time-box (wall-clock seconden) voor één cohortrun (Story 16.4, NFR-3/NFR-7).
 * Conservatieve default 3600s (1 uur) — ~100 GTINs × ~28s lokalisatie ≈ 45–50 min
 * plus marge. Bij overschrijding stopt de run netjes en registreert de tot dan
 * verwerkte GTINs; de resterende GTINs vallen als uitval in deze run (gelogd),
 * de cohort-definitie blijft ongewijzigd. Overschrijfbaar via
 * `FLYWHEEL_COHORT_MAX_SECONDS`.
 */
export function getCohortMaxSeconds(): number {
  const v = parseInt(process.env.FLYWHEEL_COHORT_MAX_SECONDS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 3600;
}

/**
 * Tempering: pauze (ms) tussen twee opeenvolgende GTIN-herverwerkingen binnen een
 * cohortrun (Story 16.4, NFR-3). Voorkomt dat de cohortrun de detectie-worker/ML
 * ononderbroken bezet houdt; de live-detectie en nachtelijke harvest houden lucht.
 * Default 0 (geen extra pauze — de verwerking loopt al serieel op de flywheel-
 * worker, concurrency 1). Overschrijfbaar via `FLYWHEEL_COHORT_GTIN_DELAY_MS`.
 */
export function getCohortGtinDelayMs(): number {
  const v = parseInt(process.env.FLYWHEEL_COHORT_GTIN_DELAY_MS ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

// ============================================
// Story 17.1 — bootstrap-run-config (drempel + run-budget + time-box)
// ============================================

/**
 * Bootstrap-cosine-drempel tegen de zaad-embedding (AD-9). Een regio matcht het
 * gids-zaad pas als de cosine ≥ deze drempel; alleen zulke vondsten worden
 * genomineerd (herkomst `bootstrap`). Default **0,60** — herkalibreerd (Story 19.6)
 * op de gemeten werkelijkheid: echte keurmerk-matches toppen op ~0,60–0,74 (de oude
 * 0,93 leverde 0 vondsten; investigate flywheel-ml-search-0-matches). De guard (19.5,
 * alleen declarerende producten), gold-set-regressie, dedup en class-cap blijven het
 * precisie-vangnet. Kalibreerbaar via `FLYWHEEL_BOOTSTRAP_THRESHOLD` (omkeerbaar:
 * `=0.93` herstelt het oude gedrag) — PRD FR-12.
 */
export function getBootstrapThreshold(): number {
  const v = parseFloat(process.env.FLYWHEEL_BOOTSTRAP_THRESHOLD ?? '');
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.6;
}

/**
 * Run-budget: maximaal aantal GTINs dat één bootstrap-run verwerkt (AD-6/NFR-3).
 * Beschermt tegen de ~28s/beeld-lokalisatiekosten — 200 GTINs × ~28s ≈ 1,5 uur.
 * Het restant blijft `wachtend` in `bootstrap_queue` voor een volgende run.
 * Default 200 (PRD FR-12). Overschrijfbaar via `FLYWHEEL_BOOTSTRAP_RUN_BUDGET`.
 */
export function getBootstrapRunBudget(): number {
  const v = parseInt(process.env.FLYWHEEL_BOOTSTRAP_RUN_BUDGET ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 200;
}

/**
 * Time-box (wall-clock seconden) voor één bootstrap-run (NFR-3, patroon
 * `HARVEST_MAX_SECONDS`/`getCohortMaxSeconds`). Bij overschrijding stopt de run
 * netjes; de niet-verwerkte klasse(n) blijven `wachtend`. Default 1800s (30 min).
 * Overschrijfbaar via `FLYWHEEL_BOOTSTRAP_MAX_SECONDS`.
 */
export function getBootstrapMaxSeconds(): number {
  const v = parseInt(process.env.FLYWHEEL_BOOTSTRAP_MAX_SECONDS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 1800;
}

// ============================================
// Story 18.2 — restant-route via mediaserver-re-import (dosering, NFR-3)
// ============================================

// ============================================
// Story 19.4 — gebalanceerde sampler (N per keurmerk, FR-22)
// ============================================

/**
 * Aantal etiketten (labels) dat de sampler per keurmerkklasse maximaal selecteert
 * (Story 19.4, AC1/AC2). GEBALANCEERD: eerst één label per GTIN (spreiding over
 * producten), daarna pas aanvullen, zodat een klasse niet uit varianten van één
 * product bestaat. Conservatieve default 50 — ruim boven de promotie-class-cap (10,
 * die downstream door de poort blijft gelden), zodat er genoeg gebalanceerde
 * kandidaten door de poort kunnen vóór de cap bijt. Overschrijfbaar via
 * `FLYWHEEL_SAMPLE_PER_CLASS`.
 */
export function getSamplePerClass(): number {
  const v = parseInt(process.env.FLYWHEEL_SAMPLE_PER_CLASS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 50;
}

// ============================================
// Story 19.9 — fase 2: nearest-reference-ranking-config (schakelmoment k + drempel)
// ============================================

/**
 * Schakelmoment-drempel k (Story 19.9, AC1/AC2): minimaal aantal actieve, door
 * mensen bevestigde ECHTE referentie-crops dat een keurmerkklasse moet hebben
 * vóórdat de bootstrap-zoektocht van de absolute gids-drempel naar nearest-
 * reference-ranking (conditie C) tegen die echte crops schakelt (als aanvulling
 * op het gids-pad, niet als vervanging). Onder k blijft het bestaande gids-
 * drempel-pad (19.6+19.8) exact gelden — geen gedragswijziging. Startwaarde uit
 * de 19.7-spike (k=3, leave-one-GTIN-out 44%->100%). Kalibreerbaar via
 * `FLYWHEEL_RANKING_MIN_REFS`.
 */
export function getRankingMinRefs(): number {
  const v = parseInt(process.env.FLYWHEEL_RANKING_MIN_REFS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 3;
}

/**
 * Nearest-reference-cosine-drempel (Story 19.9, conditie C): een regio matcht
 * via ranking zodra de HOOGSTE cosine over de actieve echte referentie-crops ≥
 * deze drempel is (het gids-zaad-pad blijft daarnaast beschikbaar als fallback).
 * Startwaarde bewust GELIJK aan `getBootstrapThreshold()` (0,60, Story 19.6):
 * zonder de eval-reproductie (Task 6, permission-gated, AC5) is er geen gemeten
 * optimum voor de ranking-drempel — echte crops clusteren naar verwachting
 * strakker dan het gids-zaad (19.7-spike: 44%->100%), dus deze startwaarde is
 * een conservatieve ondergrens, geen eindwaarde. Kalibreerbaar via
 * `FLYWHEEL_RANKING_THRESHOLD`.
 */
export function getRankingThreshold(): number {
  const v = parseFloat(process.env.FLYWHEEL_RANKING_THRESHOLD ?? '');
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : getBootstrapThreshold();
}

/**
 * Maximaal aantal actieve ECHTE-crop-referenties dat één klasse aan de
 * ranking meegeeft (code-review-fix, Story 19.9): zonder cap kan een lange-
 * staart-klasse (bv. RECYCLABLE met 26 `realref-live-poc`-refs, zie de
 * story-dev-notes) ONBEGRENSD veel refs naar de ml-service sturen — elke ref
 * wordt daar apart geëmbed, wat de time-box onnodig zwaar belast. De nieuwste
 * refs (query `orderBy: createdAt desc`) wegen het zwaarst. Ruim boven het
 * default-k (3) zodat een normale klasse nooit geraakt wordt. Default 25
 * (spiegelt `per_code_cap` elders in dit domein). Overschrijfbaar via
 * `FLYWHEEL_RANKING_MAX_REFS`.
 */
export function getRankingMaxRefs(): number {
  const v = parseInt(process.env.FLYWHEEL_RANKING_MAX_REFS ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 25;
}

/**
 * Batch-grootte (aantal GTINs per re-import-run) voor de gedoseerde terugval-route
 * op het GLN-restant (Story 18.2, AD-7 route (b), NFR-3). Elke batch draait als één
 * import-run (het bestaande 8-3O-mechanisme) en het script wacht op afronding vóór
 * de volgende batch — zo raakt de live-verwerking niet verzadigd. Conservatieve
 * default 25; verlaag bij twijfel. Overschrijfbaar via
 * `FLYWHEEL_GLN_REIMPORT_BATCH_SIZE`.
 */
export function getGlnReimportBatchSize(): number {
  const v = parseInt(process.env.FLYWHEEL_GLN_REIMPORT_BATCH_SIZE ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : 25;
}

/**
 * Pauze (ms) tussen twee opeenvolgende re-import-batches van de terugval-route
 * (Story 18.2, NFR-3 — de les van 2026-06-15: ongetemperde bulk deed de frontend-
 * health-check timeouten). CPU-getemperd: de import-worker en de live-detectie
 * krijgen tussen de batches lucht. Conservatieve default 30000 (30s); verhoog om
 * de live-stromen nóg meer ruimte te geven. Overschrijfbaar via
 * `FLYWHEEL_GLN_REIMPORT_PAUSE_MS`.
 */
export function getGlnReimportPauseMs(): number {
  const v = parseInt(process.env.FLYWHEEL_GLN_REIMPORT_PAUSE_MS ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : 30000;
}
