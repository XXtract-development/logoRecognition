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

/**
 * Promotiedrempel per methode (FR-5). Detecties zonder methode vallen — net als
 * in de crosscheck — onder de strengste (classifier).
 */
export function getPromotionThresholdForMethod(method?: string): number {
  switch (method) {
    case 'template':
      return parseThreshold(process.env.FLYWHEEL_PROMOTION_THRESHOLD_TEMPLATE);
    case 'embedding':
      return parseThreshold(process.env.FLYWHEEL_PROMOTION_THRESHOLD_EMBEDDING);
    case 'classifier':
      return parseThreshold(process.env.FLYWHEEL_PROMOTION_THRESHOLD_CLASSIFIER);
    default:
      // Geen methode → strengste drempel (classifier).
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
