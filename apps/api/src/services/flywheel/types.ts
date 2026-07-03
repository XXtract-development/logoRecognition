/**
 * Gedeelde types voor de nachtelijke promotielus (Story 13.4).
 *
 * De `gateResults`-vorm is een contract (AD-13): elke poort-fase schrijft één
 * record onder zijn fasenaam. Crash-recovery (AD-12/AD-16) leunt hierop — een
 * fase met een afgerond record (`finishedAt` gezet) wordt bij hervatting
 * overgeslagen. De dashboard-stories 15.2/15.3 lezen deze records.
 */

/** De poort-fasen in volgorde. `regression` is 13.5-scope (hier `not-run`). */
export type GatePhase = 'threshold' | 'cap' | 'dedup' | 'outlier' | 'regression';

/** Uitkomst van één poort-fase. */
export type GatePhaseOutcome = 'passed' | 'rejected-some' | 'not-run' | 'error';

/** Zachte-afwijzingsreden (AD-12) — nooit een hard-negative. */
export type SoftRejectionReason = 'cap-bereikt' | 'duplicaat' | 'outlier';

/**
 * Eén poort-fase-record in `gateResults` (AD-13). `finishedAt !== null` markeert
 * de fase als afgerond (crash-recovery-idempotentie, AD-12).
 */
export interface GatePhaseResult {
  phase: GatePhase;
  startedAt: string;
  finishedAt: string | null;
  outcome: GatePhaseOutcome;
  /** Kandidaat-ids die in deze fase zacht zijn afgewezen. */
  rejectedCandidateIds: string[];
  /** Vrije fase-details (aantallen, drempels) voor de dashboards. */
  details: Record<string, unknown>;
}

/**
 * Story 14.2 (AC 3) — niet-blokkerende gold-set-dekkings-markering. Leeft naast
 * de poort-fasen in `gateResults` onder de sleutel `goldSetCoverage`; het is
 * bewust GEEN `GatePhase` zodat het de fase-idempotentie/crash-recovery en de
 * poort-beslissing niet raakt. Puur informatief (markeren ≠ blokkeren): een
 * klasse in de batch zonder enige actieve gold-set-dekking verschijnt hier,
 * maar de batch-uitkomst verandert er niet door.
 */
export interface GoldSetCoverageMarking {
  /** ISO-tijdstip van de markering. */
  markedAt: string;
  /** De onderscheiden klassen in de batch (uniek). */
  batchClasses: string[];
  /** De subset daarvan ZONDER enige actieve gold-set-dekking (leeg = alles gedekt). */
  classesWithoutCoverage: string[];
}

/**
 * De volledige `gateResults`-map: fasenaam → record, plus het niet-blokkerende
 * 14.2-dekkingsitem (`goldSetCoverage`). De fase-sleutels blijven exact de
 * `GatePhase`-namen; `goldSetCoverage` is een aparte, optionele sleutel.
 */
export type GateResults = Partial<Record<GatePhase, GatePhaseResult>> & {
  goldSetCoverage?: GoldSetCoverageMarking;
};

/** Batch-statussen (AD-16). `pending` = nog niet afgesloten. */
export type BatchStatus = 'pending' | 'passed' | 'quarantined' | 'rolled_back';

// ============================================
// Story 13.5 — regressie-meting + kwaliteitspoort
// ============================================

/** Eén per-sample-uitkomst van de regressie-eval (ml-service, AD-5). */
export interface RegressionSample {
  id: string;
  t3777Code: string;
  label: string;
  topSimilarity: number;
  recognized: boolean;
  correct: boolean;
}

/**
 * Volledige gold-set-meting (AD-5) zoals vastgelegd op `promotionBatch.
 * baselineMeasurement` (bij `passed`) en in `gateResults.regression.details`.
 * Historisch opvraagbaar (AC 5).
 */
export interface RegressionMeasurement {
  /** Precisie@drempel over de volledige (crop-niveau) gold-set. */
  precision: number;
  total: number;
  correct: number;
  threshold: number;
  /** Was dit een nulmeting (zonder schaduwset) of een schaduw-meting? */
  mode: 'nulmeting' | 'shadow';
  /** Per gold-set-klasse: total/correct/precision. */
  perClass: Record<string, { total: number; correct: number; precision: number }>;
  /** Per-sample-uitkomsten — nodig voor de "≥2 netto verslechterd"-vergelijking. */
  samples: RegressionSample[];
  measuredAt: string;
}

/** De poort-beslissing t.o.v. de baseline (AD-5). */
export type GateDecision = 'promote' | 'quarantine';

/** Reden waarom een batch gequarantaineerd is (AC 6/7). */
export type QuarantineReason = 'regressie' | 'systeem-fout';

// ============================================
// Story 13.6 — hard-negative-herkomst (AD-12, AC 6)
// ============================================

/**
 * De MENSELIJKE afkeuringsredenen waaronder een `hard_negatives`-rij mag
 * ontstaan (AD-12). UITSLUITEND deze twee categorieën komen door het
 * export-filter (AC 6). De waarden zijn een gedeeld contract: 14.1 (quarantaine-
 * afhandeling) en 15.3 (reviewstation-reject) MOETEN exact deze strings schrijven
 * als `hard_negatives.reason`, zodat de export ze herkent.
 *
 *   - `quarantaine-afkeuring`      — een datamanager keurt een gequarantaineerde
 *                                    batch/kandidaat af (14.1).
 *   - `reviewstation-geen-keurmerk`— een reviewer markeert een reviewitem als
 *                                    "geen keurmerk" (15.3).
 *
 * Zachte guardrail-afwijzingen (`cap-bereikt`/`duplicaat`/`outlier`, zie
 * `SoftRejectionReason`) ontstaan NOOIT als hard-negative (AD-12) en zitten dus
 * per definitie niet in de export — het filter is defensief, óók al hoort er geen
 * andere rij te bestaan.
 */
export const HUMAN_HARD_NEGATIVE_REASONS = [
  'quarantaine-afkeuring',
  'reviewstation-geen-keurmerk',
] as const;

/** Menselijke hard-negative-afkeuringsreden (AD-12, AC 6). */
export type HumanHardNegativeReason = (typeof HUMAN_HARD_NEGATIVE_REASONS)[number];

/** Is `reason` een menselijke afkeuring (komt door het export-filter, AC 6)? */
export function isHumanHardNegativeReason(
  reason: string
): reason is HumanHardNegativeReason {
  return (HUMAN_HARD_NEGATIVE_REASONS as readonly string[]).includes(reason);
}
