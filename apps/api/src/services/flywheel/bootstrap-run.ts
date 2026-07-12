/**
 * Bootstrap-run per lege klasse — referentie-vliegwiel (Story 17.1, FR-12).
 *
 * Een lege klasse (T3777-code zonder actieve referenties) vult zichzelf met ECHTE
 * crops uit declarerende producten. De job `flywheel-bootstrap` (queue `flywheel`,
 * concurrency 1, AD-6) verwerkt wachtende klassen uit `bootstrap_queue` (Story 16.2)
 * on-demand/gequeued.
 *
 * Orkestratie (deze module) — het beeld-/vectorwerk leeft in ml-service (AD-9):
 *   1. job-start-guards: hoofdvlag (AD-8) + pauze (AD-11). Uit/gepauzeerd → niets.
 *   2. wachtende klasse(n) uit `bootstrap_queue` (excluded nooit; 17.2).
 *   3. per klasse: zaad (gids-logo) resolven uit de referentiebibliotheek-opslag
 *      (ook inactief). Geen zaad → run `leeg`, reden `geen-zaad`, terug in wachtrij.
 *   4. kandidaat-GTINs: distinct GTINs uit de declared-not-found-events (16.1).
 *   5. HARDE declaratie-guard per GTIN (AC1): `resolveDeclaredMarks` (5/5-velden,
 *      Story 19.5) reason `ok` én code ∈ gedeclareerde marks — niet-declarerende
 *      GTINs worden overgeslagen, geteld,
 *      gelogd (een GTIN-lijst uit events is een KANDIDATENlijst, geen vrijbrief).
 *   6. ml-service zaad-zoektocht (cosine tegen de zaad-embedding, matches ≥ drempel).
 *   7. vondsten als OPEN `artworkReviewItem` in de bestaande review-wachtrij
 *      plaatsen (Story 19.8, herzien): bootstrap-crops matchen het gids-zaad op
 *      cosine 0,60–0,74 en halen de 0,90-auto-promotie-drempel nooit → auto-
 *      nominatie levert 0. In plaats daarvan gaan ze naar `/artwork/review-queue`
 *      waar een mens ze ECHT/VALS keurt; bij accept doet de bestaande handler
 *      (`artwork-pipeline.ts`) de gold-set-ECHT-aanwas + origin-`review`-nominatie.
 *      Guard vóór het voorleggen: hard-negative (inhouds-hash ∈ `hard_negatives`)
 *      + dedup (crop al open/geaccepteerd review-item of actieve referentie).
 *   8. status: `gedraaid` bij start; `gevuld` (≥1 bevestigde echte brandstof:
 *      mens-ECHT-crop of actieve promotie-referentie) of `leeg` bij einde;
 *      `lastRunAt` gezet. Run-budget (GTINs) + time-box begrenzen de kosten;
 *      afgekapt restant blijft `wachtend`.
 *
 * NFR-6 (KRITIEK): het gids-zaad is UITSLUITEND zoekinstrument. Deze module
 * nomineert nooit het zaad — enkel de ECHTE crops die de ml-service oplevert
 * (`artwork-crops/{gtin}/...`). De ml-service borgt bovendien dat het zaadbeeld
 * nooit in de output-crops verschijnt.
 */

import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import prisma from '../../core/db';
import { createLogger } from '../../core/logger';
import { mlClient } from '../ml-client';
import { getRedisConnection, PIPELINE_JOB_OPTIONS } from '../pipeline/queue';
import { resolveDeclaredMarks } from '../t3777-declarations';
import { countActivePromotionReferences } from './guardrails';
import { isNominationEnabled } from './config';
import { shouldSkipForPause } from './pause';
import {
  getBootstrapThreshold,
  getBootstrapRunBudget,
  getBootstrapMaxSeconds,
  getRankingMinRefs,
  getRankingThreshold,
  getRankingMaxRefs,
} from './config';

const logger = createLogger('flywheel-bootstrap-run');

/** Queue + jobnaam van de bootstrap-run (queue `flywheel`, concurrency 1, AD-6). */
const FLYWHEEL_QUEUE = 'flywheel';
const BOOTSTRAP_JOB = 'flywheel-bootstrap';

/** Uitkomst-status van één klasse-run (afgeleid van `bootstrap_queue.status`). */
export type BootstrapClassStatus = 'gevuld' | 'leeg';

/** Reden waarom een run `leeg` eindigde (logging/transparantie). */
export type BootstrapEmptyReason =
  | 'geen-zaad'
  | 'geen-kandidaat-gtins'
  | 'geen-vondsten'
  // Story 19.8 (herzien): er ZIJN crops gevonden en als review-item voorgelegd,
  // maar (nog) geen bevestigde echte brandstof → klasse nog niet `gevuld`, blijft
  // bootstrapbaar (voorkomt "leeg-maar-gevuld"-vastloper).
  | 'wacht-op-review'
  // De run werd door budget/time-box afgekapt vóór hij de kandidaten uitputte.
  | 'afgekapt';

/** Resultaat van één verwerkte klasse. */
export interface BootstrapClassResult {
  t3777Code: string;
  status: BootstrapClassStatus;
  /** Alleen gezet als `status==='leeg'`. */
  emptyReason?: BootstrapEmptyReason;
  /** Aantal GTINs dat als declarerend geverifieerd is en doorzocht werd. */
  declaredGtins: number;
  /** Aantal kandidaat-GTINs dat op de declaratie-guard afviel (AC1). */
  skippedNonDeclaring: number;
  /** Aantal ml-matches (vondsten ≥ drempel). */
  matches: number;
  /** Aantal crops dat als OPEN review-item is voorgelegd (Story 19.8, herzien). */
  queuedForReview: number;
}

/** Resultaat van de hele job-run (kan meerdere klassen omvatten). */
export interface BootstrapRunResult {
  /** `true` als de job niet draaide (vlag uit of pauze) — geen enkele mutatie. */
  skipped: boolean;
  skipReason?: 'vlag-uit' | 'pauze';
  classesProcessed: BootstrapClassResult[];
  /** GTINs die door het run-budget/time-box afvielen — klasse blijft `wachtend`. */
  budgetTruncated: boolean;
}

/** Optionele beperking tot één specifieke klasse (on-demand enqueue per code). */
export interface BootstrapJobData {
  t3777Code?: string;
}

/**
 * Resolveer het gids-zaad (storage-path) van een klasse uit de
 * referentiebibliotheek-opslag — ook als de rij inactief is (12.3-real-ref-pivot:
 * guide-referenties kunnen inactief zijn). Het zaad is UITSLUITEND zoekinstrument
 * (NFR-6); deze lookup registreert of promoveert nooit iets. Kiest de nieuwste
 * `reference_logos`-rij met een storage-path, ongeacht `active`.
 */
export async function resolveSeedPath(t3777Code: string): Promise<string | null> {
  const row = await prisma.referenceLogo.findFirst({
    where: { t3777Code, storagePath: { not: '' } },
    orderBy: { createdAt: 'desc' },
    select: { storagePath: true },
  });
  return row?.storagePath ?? null;
}

/**
 * Kandidaat-GTINs voor een code: distinct GTINs uit de declared-not-found-events
 * (Story 16.1), nieuwste eerst, begrensd op het run-budget zodat de query nooit een
 * onbegrensde lijst laadt. Cohort-herkomst uitgesloten (spiegelt de werkvoorraad-
 * aggregatie). Dit is een KANDIDATENlijst — de declaratie wordt per GTIN nog hard
 * geverifieerd (AC1).
 */
export async function candidateGtinsForCode(
  t3777Code: string,
  limit: number
): Promise<string[]> {
  const rows = await prisma.mismatchEvent.findMany({
    where: {
      t3777Code,
      type: 'declared-not-found',
      NOT: { origin: { startsWith: 'cohort-' } },
    },
    select: { gtin: true },
    orderBy: { createdAt: 'desc' },
    // Ruim nemen zodat na dedup nog ≥ limit distinct GTINs overblijven.
    take: limit * 5,
  });
  const seen = new Set<string>();
  const gtins: string[] = [];
  for (const r of rows) {
    if (seen.has(r.gtin)) continue;
    seen.add(r.gtin);
    gtins.push(r.gtin);
    if (gtins.length >= limit) break;
  }
  return gtins;
}

/**
 * Resolveer per declarerende GTIN de te doorzoeken artwork-pagina (nieuwste
 * import met een storage-path). Retourneert de gtin→pageKey-paren die de
 * ml-service moet doorzoeken. GTINs zonder artwork-pagina vallen stil af (niets
 * te doorzoeken).
 */
async function resolveArtworkPage(gtin: string): Promise<string | null> {
  const row = await prisma.artworkImport.findFirst({
    where: { gtin, storagePath: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { storagePath: true },
  });
  return row?.storagePath ?? null;
}

/** Reason-tag waarmee lege-klasse-bootstrap-crops in de review-wachtrij herkenbaar zijn. */
const BOOTSTRAP_REVIEW_REASON = 'bootstrap-lege-klasse';
/** Menselijke review-bronnen die een crop als ECHT bevestigen (Story 14.1). */
const HUMAN_ECHT_SOURCES = ['review-accept', 'review-annotate'] as const;
/**
 * Story 19.9 — `reference_logos.source`-waarden die een ECHTE (niet-gids)
 * referentie-crop markeren: menselijk bevestigd via review (`review-confirmed`,
 * 12.3-pivot), de RECYCLABLE-POC-herstelset (`realref-live-poc`, 19.13) en de
 * flywheel-auto-promotie (`flywheel-promotion`). Gids-seeds dragen een ANDER
 * source-patroon (`seed:...`) en vallen hier bewust buiten — conditie C rankt
 * uitsluitend tegen ECHTE crops, nooit tegen het gids-logo zelf.
 */
const REAL_CROP_SOURCES = ['review-confirmed', 'realref-live-poc', 'flywheel-promotion'] as const;

/** Eén ml-zaad-match (de ECHTE crop-regio in de artwork). */
interface BootstrapMatch {
  gtin: string;
  bbox: { x: number; y: number; width: number; height: number };
  seed_cosine: number;
  /** Story 19.9 — hoogste cosine over de echte crop-refs; `null` als conditie C niet actief was. */
  ranking_cosine: number | null;
  crop_path: string;
  source_file: string;
}

/**
 * Story 19.8 (herzien) — leg één gevonden crop voor aan de MENSELIJKE review-
 * wachtrij als OPEN `artworkReviewItem`, i.p.v. auto-nominatie. Bootstrap-crops
 * matchen het gids-zaad op 0,60–0,74 en zouden nooit auto-promoten; een mens keurt
 * ze ECHT/VALS in `/artwork/review-queue`, en de bestaande accept-handler doet dan
 * de gold-set-aanwas + origin-`review`-nominatie. Kleppen vóór het voorleggen (AC2):
 *   - hard-negative: een eerder door een mens afgekeurde crop (inhouds-hash ∈
 *     `hard_negatives`) wordt NOOIT opnieuw voorgelegd.
 *   - dedup: een crop die voor DEZE keurmerkcode al ooit is voorgelegd (welke status
 *     dan ook, incl. rejected) of al een actieve referentie is, wordt overgeslagen.
 * Fail-closed: kan de inhouds-hash niet berekend worden → niet voorleggen (`refused`).
 */
async function queueCropForReview(
  t3777Code: string,
  m: BootstrapMatch
): Promise<'queued' | 'skipped' | 'refused'> {
  // Inhouds-hash synchroon (AD-14) voor de hard-negative-check (fail-closed).
  let contentHash: string;
  try {
    const res = await mlClient.computePhash(m.crop_path);
    contentHash = res.content_hash;
  } catch (err) {
    logger.warn('Review-voorlegging: /ml/phash onbereikbaar — crop niet voorgelegd', {
      t3777Code,
      cropPath: m.crop_path,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 'refused';
  }

  // Hard-negative-blokkade (AD-12/FR-9): mens-afgekeurde inhoud niet heropvoeren.
  const hardNegative = await prisma.hardNegative.findUnique({ where: { contentHash } });
  if (hardNegative) return 'skipped';

  // Dedup PER (crop, keurmerkklasse): is deze crop voor DEZE code al ooit voorgelegd
  // (in welke status dan ook — open/accepted/registered/rejected), leg 'm niet opnieuw
  // voor. Bewust op `t3777Code` gefilterd zodat een ANDERE klasse dezelfde crop-regio
  // wél voor háár code mag voorleggen (cross-class-onafhankelijk); en INCLUSIEF alle
  // statussen zodat een al mens-beoordeelde crop (ook een reject zónder hard-negative,
  // bv. reden "onjuiste-locatie") niet bij elke re-queue opnieuw terugkomt.
  const existingItem = await prisma.artworkReviewItem.findFirst({
    where: { cropPath: m.crop_path, t3777Code },
    select: { id: true },
  });
  if (existingItem) return 'skipped';
  // Of de crop is voor deze code al een actieve referentie → niet opnieuw voorleggen.
  const existingRef = await prisma.referenceLogo.findFirst({
    where: { t3777Code, storagePath: m.crop_path, active: true },
    select: { id: true },
  });
  if (existingRef) return 'skipped';

  // Voorleggen als OPEN review-item — dezelfde vorm als de crosscheck (12.x), met een
  // eigen reason-tag zodat de review-UI de bootstrap-kandidaten kan filteren.
  //
  // Story 19.9 code-review-fix: `confidence` bepaalt de sorteervolgorde van de
  // review-wachtrij (hoogste eerst, `/artwork/review-queue`). Een conditie-C-match
  // kan een LAGE `seed_cosine` hebben (dat is precies het punt van AC1 — hij matcht
  // via de echte-crop-ranking, niet via het gids-zaad) terwijl `ranking_cosine` hoog
  // is. Zonder deze fix zou zo'n vondst — hoewel een sterke match — onderaan de
  // wachtrij zakken. `confidence` wordt daarom het HOOGSTE van de twee signalen.
  const confidence = Math.max(m.seed_cosine, m.ranking_cosine ?? 0);

  await prisma.artworkReviewItem.create({
    data: {
      gtin: m.gtin,
      t3777Code,
      bbox: (m.bbox ?? {}) as Prisma.InputJsonValue,
      confidence,
      method: 'embedding',
      reason: BOOTSTRAP_REVIEW_REASON,
      cropPath: m.crop_path,
      sourceFile: m.source_file,
      status: 'open',
    },
  });
  return 'queued';
}

/**
 * Story 19.8 AC5 — heeft de klasse ≥1 bevestigde ECHTE brandstof? De klasse is pas
 * écht `gevuld` (uit de bootstrap-wachtrij) als er bruikbare referentie-brandstof is,
 * NIET zodra er (review-pending) crops zijn voorgelegd. Twee bronnen tellen:
 *   (a) ≥1 door een mens als ECHT bevestigde crop — een gold-set-record `label:'ECHT'`
 *       uit een review-bron (`review-accept`/`review-annotate`), `replacedById:null`;
 *   (b) ≥1 actieve `flywheel-promotion`-referentie (`countActivePromotionReferences`)
 *       — vangt een klasse die (theoretisch ≥0,90) auto-gepromoveerd is.
 * Louter voorgelegde review-items tellen NIET (voorkomt de "leeg-maar-gevuld"-val:
 * een klasse waar de review alles afwijst mag niet uit de wachtrij verdwijnen).
 */
async function classHasConfirmedRealFuel(t3777Code: string): Promise<boolean> {
  const echt = await prisma.goldSetRecord.count({
    where: {
      t3777Code,
      label: 'ECHT',
      replacedById: null,
      source: { in: [...HUMAN_ECHT_SOURCES] },
    },
  });
  if (echt > 0) return true;
  const promoted = await countActivePromotionReferences(t3777Code);
  return promoted > 0;
}

/**
 * Uitkomst van het crop-producerende zoek-/nominatiekernpad voor één klasse. Bevat
 * ALLE informatie die zowel de bootstrap-run (queue-status-orkestratie) als de
 * gebalanceerde sampler (Story 19.4) nodig heeft — zonder queue-status-writes.
 */
export interface ClassSearchResult {
  /** `false` = geen zaad voor de klasse (kon niet zoeken; caller slaat over). */
  hadSeed: boolean;
  /** Aantal GTINs dat als declarerend geverifieerd is en doorzocht werd. */
  declaredGtins: number;
  /** Aantal kandidaat-GTINs dat op de declaratie-guard afviel (AC1). */
  skippedNonDeclaring: number;
  /** Aantal ml-matches (vondsten ≥ drempel). */
  matches: number;
  /** Aantal crops dat als OPEN review-item is voorgelegd (Story 19.8, herzien). */
  queuedForReview: number;
  /** Voorleg-uitkomsten per status (queued/skipped/refused) — voor de sampler. */
  outcomes: { queued: number; skipped: number; refused: number };
  /** Aantal GTINs dat tegen het budget verbruikt is (declaratie-checks). */
  budgetSpent: number;
  /** `true` als het budget/de time-box de kandidatenlijst afkapte, of ml time-boxte. */
  truncated: boolean;
}

/**
 * DE gedeelde crop-producerende kern (Story 17.1 bootstrap + Story 19.4 sampler,
 * Story 19.8 herzien: crops → review-wachtrij i.p.v. auto-nominatie; Story 19.9:
 * schakelmoment naar nearest-reference-ranking bij ≥ k echte crop-referenties).
 *
 * Neemt een EXPLICIETE kandidaat-GTIN-lijst voor één keurmerkklasse en legt de
 * ECHTE crops voor aan de menselijke review-wachtrij:
 *   1. zaad (gids-logo) resolven → geen zaad = niets doen (`hadSeed:false`).
 *   2. per GTIN de HARDE declaratie-guard (`resolveDeclaredMarks` 5/5-velden, reason
 *      `ok` én code ∈ gedeclareerde marks) + de artwork-pagina; niet-declarerende/artwork-loze GTINs
 *      vallen af (geteld). Elke GTIN telt tegen het budget.
 *   3. `mlClient.bootstrapSearch({ seedPath, gtinPages, ... })` → de ECHTE crops
 *      (`crop_path`) in de artwork met `seed_cosine` per match (≥ drempel). Heeft
 *      de klasse ≥ k (`getRankingMinRefs`) actieve ECHTE referentie-crops
 *      (`REAL_CROP_SOURCES`), dan gaan die crop-paden mee als `realRefPaths` —
 *      de ml-service schakelt dan (ALS AANVULLING op het gids-pad) naar
 *      nearest-reference-ranking (conditie C, Story 19.9). Onder k: kaal
 *      aanroepen, ongewijzigd gids-drempel-pad.
 *   4. per match `queueCropForReview` → OPEN `artworkReviewItem` in `/artwork/review-queue`
 *      (na hard-negative + dedup-guard) — nooit het label/zaad zelf als crop (NFR-6).
 *
 * Deze functie doet GEEN bootstrap_queue-status-writes; de bootstrap-run wikkelt er de
 * statusovergangen omheen, de sampler roept 'm kaal aan.
 */
export async function searchAndQueueClassForReview(
  t3777Code: string,
  candidateGtins: string[],
  opts: { remainingBudget: number; deadline: number }
): Promise<ClassSearchResult> {
  const { remainingBudget, deadline } = opts;
  const empty: ClassSearchResult = {
    hadSeed: true,
    declaredGtins: 0,
    skippedNonDeclaring: 0,
    matches: 0,
    queuedForReview: 0,
    outcomes: { queued: 0, skipped: 0, refused: 0 },
    budgetSpent: 0,
    truncated: false,
  };

  // 1. Zaad resolven. Geen zaad → niets te doorzoeken (caller slaat de klasse over).
  const seedPath = await resolveSeedPath(t3777Code);
  if (!seedPath) {
    logger.info('Klasse-zoektocht: geen zaad — overgeslagen', { t3777Code });
    return { ...empty, hadSeed: false };
  }

  if (candidateGtins.length === 0) {
    return empty;
  }

  // 2. HARDE declaratie-guard per GTIN (AC1) + artwork-pagina resolven. Elke GTIN
  //    telt tegen het budget (ook een niet-declarerende, want de check kostte werk).
  const gtinPages: Array<{ gtin: string; pageKey: string }> = [];
  let skippedNonDeclaring = 0;
  let budgetSpent = 0;
  let truncated = false;

  for (const gtin of candidateGtins) {
    if (budgetSpent >= remainingBudget) {
      truncated = true;
      break;
    }
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    budgetSpent += 1;

    // 5/5-declaratie-guard (Story 19.5): de keurmerk→etiket-index (19.3) is gebouwd
    // met `resolveDeclaredMarks` (alle 5 GDSN-keurmerkvelden). De guard MOET dezelfde
    // woordenschat hanteren, anders vallen codes uit dietType/nutritionalScore/
    // enumerationValue/localPackagingMarkedReference (VEGAN/HALAL/PREGNANCY_WARNING…)
    // onterecht af. `resolveDeclaredMarks` is een superset van het oude T3777-only
    // `resolveDeclarations` (packagingMarkedLabelAccreditationCode zit in MARK_FIELDS),
    // dus accreditatie-declarerende GTINs (bootstrap 17.1) passeren ongewijzigd. De
    // guard blijft hard: reason `ok` én de code moet in enig veld gedeclareerd zijn.
    const decl = await resolveDeclaredMarks(gtin);
    if (decl.reason !== 'ok' || !decl.marks.some((m) => m.code === t3777Code)) {
      // Niet-declarerende GTIN: overslaan, tellen, loggen (AC1-contract).
      skippedNonDeclaring += 1;
      logger.info('Klasse-zoektocht: GTIN declareert de code niet — overgeslagen', {
        t3777Code,
        gtin,
        reason: decl.reason,
      });
      continue;
    }

    const pageKey = await resolveArtworkPage(gtin);
    if (!pageKey) continue; // geen artwork-pagina → niets te doorzoeken
    gtinPages.push({ gtin, pageKey });
  }

  // Geen enkele declarerende GTIN met artwork → niets te doorzoeken.
  if (gtinPages.length === 0) {
    return { ...empty, skippedNonDeclaring, budgetSpent, truncated };
  }

  // 3. ml-service zaad-zoektocht (cosine tegen zaad-embedding, matches ≥ drempel).
  const threshold = getBootstrapThreshold();
  const maxSeconds = Math.max(1, Math.round((deadline - Date.now()) / 1000));

  // Story 19.9 — schakelmoment: ≥ k actieve ECHTE-crop-referenties van de klasse
  // schakelen het matchsignaal naar nearest-reference-ranking (conditie C,
  // ml-side). Onder k: kaal aanroepen (geen realRefPaths) — ml-service blijft
  // ongewijzigd op het gids-drempel-pad (AC2). `take: getRankingMaxRefs()`
  // (code-review-fix): een lange-staart-klasse met tientallen refs (bv.
  // RECYCLABLE) mag de ml-embed-kosten niet onbegrensd optrekken — de nieuwste
  // refs wegen het zwaarst (`orderBy: createdAt desc`).
  const minRefs = getRankingMinRefs();
  const realRefRows = await prisma.referenceLogo.findMany({
    where: { t3777Code, active: true, source: { in: [...REAL_CROP_SOURCES] } },
    orderBy: { createdAt: 'desc' },
    select: { storagePath: true },
    take: getRankingMaxRefs(),
  });
  // Defensieve seed/ref-scheiding (code-review-fix): mocht het zaad ooit per
  // ongeluk met een ECHTE-crop-source getagd zijn, dan mag het nooit als
  // "echte referentie" tegen zichzelf ranken.
  const realRefPaths = realRefRows.map((r) => r.storagePath).filter((p) => p !== seedPath);

  let search;
  try {
    search = await mlClient.bootstrapSearch({
      seedPath,
      gtinPages,
      threshold,
      maxSeconds,
      ...(realRefPaths.length >= minRefs
        ? { realRefPaths, rankingThreshold: getRankingThreshold(), minRefs }
        : {}),
    });
    if (search.ranking_active) {
      logger.info('Klasse-zoektocht: conditie C actief (nearest-reference-ranking)', {
        t3777Code,
        realRefsUsed: search.real_refs_used,
        matches: search.matches.length,
      });
    }
  } catch (err) {
    // ml-zoektocht mislukt (zaad onleesbaar/ml onbereikbaar). Fail-closed: geen
    // nominaties. De caller mag de klasse in een volgende run opnieuw oppakken.
    logger.warn('Klasse-zoektocht: ml-zoektocht mislukt — geen nominaties', {
      t3777Code,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return {
      ...empty,
      declaredGtins: gtinPages.length,
      skippedNonDeclaring,
      budgetSpent,
      truncated,
    };
  }

  // 4. Vondsten voorleggen aan de menselijke review-wachtrij (Story 19.8, herzien).
  //    Elke vondst passeert eerst de hard-negative- + dedup-guard; het ECHTE
  //    `crop_path` uit de ml-search gaat mee, nooit het label/zaad zelf (NFR-6).
  //    Per vondst onafhankelijk.
  const outcomes = { queued: 0, skipped: 0, refused: 0 };
  for (const m of search.matches) {
    const outcome = await queueCropForReview(t3777Code, m as BootstrapMatch);
    outcomes[outcome] += 1;
  }

  return {
    hadSeed: true,
    declaredGtins: gtinPages.length,
    skippedNonDeclaring,
    matches: search.matches.length,
    queuedForReview: outcomes.queued,
    outcomes,
    budgetSpent,
    truncated: truncated || search.timed_out,
  };
}

/**
 * Verwerk één lege klasse: zaad → declaratie-geverifieerde GTINs → ml-zoektocht →
 * nominatie. Zet de wachtrij-status (`gevuld`/`leeg`) + `lastRunAt`.
 *
 * `remainingBudget` is het aantal GTINs dat deze klasse nog mag verwerken (gedeeld
 * budget over de run). Retourneert het klasse-resultaat + het resterende budget.
 */
async function processClass(
  t3777Code: string,
  remainingBudget: number,
  deadline: number
): Promise<{ result: BootstrapClassResult; remainingBudget: number; truncated: boolean }> {
  // Status → `gedraaid` bij start (statusovergang wachtend→gedraaid).
  await prisma.bootstrapQueue.update({
    where: { t3777Code },
    data: { status: 'gedraaid' },
  });

  const base: BootstrapClassResult = {
    t3777Code,
    status: 'leeg',
    declaredGtins: 0,
    skippedNonDeclaring: 0,
    matches: 0,
    queuedForReview: 0,
  };

  // Kandidaat-GTINs (begrensd op het resterende budget) — vóór de gedeelde kern,
  // zodat een lege kandidatenlijst een eigen reden krijgt (`geen-kandidaat-gtins`).
  const candidateGtins = await candidateGtinsForCode(t3777Code, remainingBudget);
  if (candidateGtins.length === 0) {
    // Zaad-status apart houden voor de juiste reden: eerst kijken of er zaad is.
    const seedPath = await resolveSeedPath(t3777Code);
    await finalizeClass(t3777Code, 'leeg');
    if (!seedPath) {
      logger.info('Bootstrap: geen zaad voor klasse — run leeg', { t3777Code });
      return {
        result: { ...base, status: 'leeg', emptyReason: 'geen-zaad' },
        remainingBudget,
        truncated: false,
      };
    }
    logger.info('Bootstrap: geen kandidaat-GTINs voor klasse — run leeg', { t3777Code });
    return {
      result: { ...base, status: 'leeg', emptyReason: 'geen-kandidaat-gtins' },
      remainingBudget,
      truncated: false,
    };
  }

  // De gedeelde crop-producerende kern (zaad + declaratie-guard + ml-search +
  // crops als OPEN review-item voorleggen, Story 19.8 herzien).
  const res = await searchAndQueueClassForReview(t3777Code, candidateGtins, {
    remainingBudget,
    deadline,
  });

  const remainingAfter = remainingBudget - res.budgetSpent;

  // Geen zaad → `leeg`, reden `geen-zaad`, terug in wachtrij.
  if (!res.hadSeed) {
    await finalizeClass(t3777Code, 'leeg');
    logger.info('Bootstrap: geen zaad voor klasse — run leeg', { t3777Code });
    return {
      result: { ...base, status: 'leeg', emptyReason: 'geen-zaad' },
      remainingBudget: remainingAfter,
      truncated: res.truncated,
    };
  }

  // Story 19.8 AC5: `gevuld` betekent "≥1 bevestigde echte brandstof", NIET "≥1
  // voorgelegde review-crop". De voorgelegde crops zijn review-pending; ze worden
  // pas brandstof als een mens ze bevestigt. Zou `queuedForReview > 0 ? 'gevuld'`
  // een klasse met louter pending crops uit de wachtrij halen (leeg-maar-`gevuld`-
  // vastloper). De klasse blijft bootstrapbaar tot de brandstof bevestigd is (of
  // wordt her-gequeued door de 16.2-aggregatie als de review alles afwijst).
  const status: BootstrapClassStatus = (await classHasConfirmedRealFuel(t3777Code))
    ? 'gevuld'
    : 'leeg';
  await finalizeClass(t3777Code, status);

  // Reden bij `leeg`: onderscheid afgekapt / "crops in review" / "niets gevonden".
  const emptyReason: BootstrapEmptyReason | undefined =
    status === 'gevuld'
      ? undefined
      : res.queuedForReview > 0
        ? 'wacht-op-review'
        : res.truncated
          ? 'afgekapt'
          : 'geen-vondsten';

  logger.info('Bootstrap-run voor klasse voltooid', {
    t3777Code,
    declaredGtins: res.declaredGtins,
    skippedNonDeclaring: res.skippedNonDeclaring,
    matches: res.matches,
    queuedForReview: res.queuedForReview,
    status,
    emptyReason,
  });

  return {
    result: {
      t3777Code,
      status,
      emptyReason,
      declaredGtins: res.declaredGtins,
      skippedNonDeclaring: res.skippedNonDeclaring,
      matches: res.matches,
      queuedForReview: res.queuedForReview,
    },
    remainingBudget: remainingAfter,
    truncated: res.truncated,
  };
}

/** Zet de eind-status + `lastRunAt` op de wachtrij-rij (statusovergang → gevuld|leeg). */
async function finalizeClass(t3777Code: string, status: BootstrapClassStatus): Promise<void> {
  await prisma.bootstrapQueue.update({
    where: { t3777Code },
    data: { status, lastRunAt: new Date() },
  });
}

/**
 * DE job-handler van `flywheel-bootstrap` (queue `flywheel`, concurrency 1).
 *
 * Job-start-guards (volgorde: goedkoop eerst):
 *   - hoofdvlag `FLYWHEEL_NOMINATION_ENABLED` uit (AD-8) → niets draaien/nomineren.
 *   - pauze actief (AD-11) → niets draaien.
 * Daarna: wachtende klasse(n) uit `bootstrap_queue` (excluded nooit), begrensd op
 * het run-budget (GTINs, gedeeld over klassen) + time-box. Het restant blijft
 * `wachtend`.
 */
export async function runBootstrap(data: BootstrapJobData = {}): Promise<BootstrapRunResult> {
  // Guard 1 — hoofdvlag (AD-8). Uit → geen enkele mutatie, geen nominatie.
  if (!isNominationEnabled()) {
    logger.info('Bootstrap overgeslagen: hoofdvlag uit (AD-8)');
    return { skipped: true, skipReason: 'vlag-uit', classesProcessed: [], budgetTruncated: false };
  }

  // Guard 2 — pauze (AD-11, gedeelde job-start-check).
  if (await shouldSkipForPause(BOOTSTRAP_JOB)) {
    return { skipped: true, skipReason: 'pauze', classesProcessed: [], budgetTruncated: false };
  }

  const budget = getBootstrapRunBudget();
  const deadline = Date.now() + getBootstrapMaxSeconds() * 1000;

  // Wachtende, niet-uitgesloten klasse(n). On-demand: één specifieke klasse als
  // `data.t3777Code` gezet is (mits wachtend en niet uitgesloten).
  const where = data.t3777Code
    ? { t3777Code: data.t3777Code, status: 'wachtend', excluded: false }
    : { status: 'wachtend', excluded: false };

  const queued = await prisma.bootstrapQueue.findMany({
    where,
    orderBy: [{ priorityOverride: 'desc' }, { declarationFrequency: 'desc' }, { createdAt: 'asc' }],
    select: { t3777Code: true },
  });

  const classesProcessed: BootstrapClassResult[] = [];
  let remainingBudget = budget;
  let budgetTruncated = false;

  for (const { t3777Code } of queued) {
    if (remainingBudget <= 0 || Date.now() >= deadline) {
      // Budget/time-box op — resterende klassen blijven `wachtend` (niet aangeraakt).
      budgetTruncated = true;
      break;
    }
    const { result, remainingBudget: rem, truncated } = await processClass(
      t3777Code,
      remainingBudget,
      deadline
    );
    classesProcessed.push(result);
    remainingBudget = rem;
    if (truncated) budgetTruncated = true;
  }

  logger.info('Bootstrap-job voltooid', {
    classes: classesProcessed.length,
    budgetTruncated,
    remainingBudget,
  });

  return { skipped: false, classesProcessed, budgetTruncated };
}

/**
 * Enqueue een bootstrap-run op de queue `flywheel` (on-demand, AD-6). Zonder
 * `t3777Code` verwerkt de handler alle wachtende klassen (budget-begrensd); mét
 * een code beperkt hij tot die ene klasse. De flag-/pauze-guards leven in de
 * handler zelf, zodat een enqueue tijdens pauze/vlag-uit simpelweg een no-op-run
 * oplevert. Best-effort: een queueing-fout mag de aanroeper niet breken.
 */
export async function enqueueBootstrapRun(t3777Code?: string): Promise<void> {
  const connection = getRedisConnection();
  const queue = new Queue(FLYWHEEL_QUEUE, { connection });
  try {
    await queue.add(
      BOOTSTRAP_JOB,
      (t3777Code ? { t3777Code } : {}) as BootstrapJobData,
      { ...PIPELINE_JOB_OPTIONS }
    );
  } catch (err) {
    logger.error('Kon bootstrap-run niet enqueue-en (non-fataal)', {
      t3777Code: t3777Code ?? '(alle wachtende)',
      error: err instanceof Error ? err.message : 'unknown',
    });
  } finally {
    await queue.close();
  }
}
