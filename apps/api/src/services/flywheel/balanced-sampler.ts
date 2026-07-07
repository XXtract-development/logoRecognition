/**
 * Gebalanceerde sampler — referentie-vliegwiel Epic 19, Story 19.4 (FR-22).
 *
 * Leest de keurmerk→etiket-index (Story 19.3) en selecteert per keurmerkklasse tot
 * N etiketten, GEBALANCEERD gespreid over verschillende GTINs/producten. De
 * geselecteerde GTINs lopen per klasse door het CROP-PRODUCERENDE bootstrap-pad
 * (`searchAndQueueClassForReview`): het gids-zaad zoekt in de ARTWORK van elke GTIN de
 * ECHTE keurmerk-crops, en enkel die uitgesneden crops gaan door het BESTAANDE
 * nominatie-/kwaliteitspad (13.2-poort) — nooit rechtstreeks in `reference_logos`/
 * `reference_candidates`.
 *
 * KRITIEK (defect-fix Story 19.4): een referentie-logo MOET een uitgesneden
 * keurmerk-regio zijn. De sampler biedt daarom NOOIT het hele etiketbestand
 * (previewUrl van de verpakking) als "crop" aan de poort aan — dat is semantisch
 * fout (vervuilt de kandidaten) of een no-op (een PDF-previewUrl is geen
 * hash-/embedbaar beeld). De localisatie (zaad → artwork-search → crop) gebeurt in
 * `searchAndQueueClassForReview`; de sampler levert alleen de gebalanceerde GTIN-set aan.
 *
 * Bindende randvoorwaarden:
 *   AD-8   Alles achter `isNominationEnabled()` (`FLYWHEEL_NOMINATION_ENABLED`, default
 *          uit). Vlag UIT = de sampler doet GEEN writes/nominaties; hoogstens een
 *          dry-run-plan (selectie + tellingen).
 *   AD-1/2 De sampler voegt enkel een BRON van kandidaten toe. Story 19.8 (herzien):
 *          de gevonden crops worden als OPEN `artworkReviewItem` aan de bestaande
 *          menselijke review-wachtrij voorgelegd (hard-negative + dedup-guard). Deze
 *          module bouwt GEEN nieuwe promotieroute en schrijft nooit direct in de
 *          referentietabellen; bij accept doet de bestaande review-handler de rest.
 *   NFR-5  Selectie-cap per klasse bij N: overschot wordt geregistreerd als
 *          overgeslagen mét reden (`class-cap-bereikt`) — geen stille brandstofverliezen.
 *
 * De sampler-class-cap (N, `FLYWHEEL_SAMPLE_PER_CLASS`) is een SELECTIE-plafond op de
 * kandidatenstroom; de PROMOTIE-class-cap (10, `getClassCap`) is een aparte, strengere
 * horde die de poort/promotielus downstream handhaaft. N ≥ promotie-cap zodat er genoeg
 * gebalanceerde kandidaten door de poort gaan vóór de promotie-cap bijt.
 *
 * Dit bestand exporteert een PURE selectie-helper (`selectBalanced`) zodat de balans/cap/
 * overschot-logica zonder I/O getest kan worden.
 */

import { createLogger } from '../../core/logger';
import { searchAndQueueClassForReview } from './bootstrap-run';
import {
  isNominationEnabled,
  getSamplePerClass,
  getBootstrapRunBudget,
  getBootstrapMaxSeconds,
} from './config';

const logger = createLogger('flywheel-balanced-sampler');

/** Eén etiket-vermelding uit de 19.3-index (fieldType/code → [{gtin,gln,labels}]). */
export interface IndexLabelEntry {
  gtin: string;
  gln: string;
  labels: string[];
}

/** De ingelezen 19.3-index (alleen de velden die de sampler nodig heeft). */
export interface KeurmerkIndexInput {
  /** sleutel `${fieldType}/${code}` → etiket-vermeldingen. */
  entries: Record<string, IndexLabelEntry[]>;
}

/**
 * Eén geselecteerd etiket-label. Het `label` (previewUrl/opslagpad van de
 * verpakking) identificeert het etiket in de 19.3-index; het is NIET de crop die
 * genomineerd wordt — de crop wordt uit de ARTWORK van de GTIN gesneden door
 * `searchAndQueueClassForReview`. De GTIN is de eenheid die het crop-pad in gaat.
 */
export interface SelectedLabel {
  gtin: string;
  gln: string;
  /** Het etiketbestand (previewUrl/opslagpad) uit de 19.3-index — index-identiteit. */
  label: string;
}

/** Selectie-resultaat per keurmerkklasse (één indexsleutel). */
export interface ClassSelection {
  /** De samengestelde indexsleutel `${fieldType}/${code}`. */
  key: string;
  /** De GS1-code (deel na de eerste '/'). */
  code: string;
  /** Het GS1-veld (deel vóór de eerste '/'). */
  fieldType: string;
  /** De gebalanceerd geselecteerde labels (≤ N). */
  selected: SelectedLabel[];
  /** Aantal labels dat door de cap N is overgeslagen (overschot, NFR-5). */
  skippedOverCap: number;
  /** Aantal beschikbare labels in deze klasse (vóór de cap). */
  available: number;
}

// ---------------------------------------------------------------------------
// PURE balans-selectie (geen I/O)
// ---------------------------------------------------------------------------

/**
 * Splits een indexsleutel `${fieldType}/${code}` in zijn twee delen. De fieldType
 * (GS1-codelijstnaam) bevat geen '/', dus de eerste '/' scheidt de twee.
 */
export function splitKey(key: string): { fieldType: string; code: string } {
  const i = key.indexOf('/');
  if (i < 0) return { fieldType: '', code: key };
  return { fieldType: key.slice(0, i), code: key.slice(i + 1) };
}

/**
 * Selecteer tot `n` labels uit één klasse, GEBALANCEERD over de GTINs.
 *
 * Algoritme (deterministisch → stabiel bij herhaling):
 *   1. Round-robin over de GTINs (invoervolgorde): neem beurtelings het volgende
 *      nog niet-geselecteerde label van elke GTIN. Zo krijgt elk product eerst één
 *      label vóór een product een tweede krijgt (spreiding).
 *   2. Stop zodra `n` bereikt is. Alle resterende (niet-geselecteerde) labels tellen
 *      als overschot (skippedOverCap) — geen stille verliezen (NFR-5).
 *
 * De labels binnen een vermelding worden in invoervolgorde gebruikt (de 19.3-index
 * levert ze al gesorteerd + gededupt aan).
 */
export function selectBalanced(entries: IndexLabelEntry[], n: number): {
  selected: SelectedLabel[];
  available: number;
  skippedOverCap: number;
} {
  // Bouw per GTIN een cursor over zijn labels (invoervolgorde behouden).
  const buckets = entries.map((e) => ({
    gtin: e.gtin,
    gln: e.gln,
    labels: e.labels,
    cursor: 0,
  }));
  const available = buckets.reduce((sum, b) => sum + b.labels.length, 0);
  const cap = Math.max(0, n);

  const selected: SelectedLabel[] = [];
  let progressed = true;
  while (selected.length < cap && progressed) {
    progressed = false;
    for (const b of buckets) {
      if (selected.length >= cap) break;
      if (b.cursor < b.labels.length) {
        selected.push({ gtin: b.gtin, gln: b.gln, label: b.labels[b.cursor] });
        b.cursor += 1;
        progressed = true;
      }
    }
  }

  return {
    selected,
    available,
    skippedOverCap: Math.max(0, available - selected.length),
  };
}

/**
 * Bouw het volledige selectieplan uit de index: per klasse gebalanceerd tot N,
 * overschot geteld. PUUR (geen I/O) — het dry-run-plan én de echte run gebruiken dit.
 * Sleutels alfabetisch zodat het plan deterministisch is.
 */
export function buildSelectionPlan(
  index: KeurmerkIndexInput,
  n: number
): ClassSelection[] {
  const plan: ClassSelection[] = [];
  const keys = Object.keys(index.entries).sort();
  for (const key of keys) {
    const entries = index.entries[key] ?? [];
    const { selected, available, skippedOverCap } = selectBalanced(entries, n);
    const { fieldType, code } = splitKey(key);
    plan.push({ key, code, fieldType, selected, skippedOverCap, available });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Nominatie-aansluiting (achter de vlag)
// ---------------------------------------------------------------------------

/** Uitkomst van één sampler-run. */
export interface SamplerRunResult {
  /** `true` = vlag uit: geen enkele nominatie/write (hoogstens het plan berekend). */
  skipped: boolean;
  skipReason?: 'vlag-uit';
  /** Het (altijd berekende) selectieplan per klasse. */
  plan: ClassSelection[];
  /**
   * Aantal GTINs dat daadwerkelijk het crop-producerende pad in ging (declaratie-
   * check verbruikt). NIET het aantal labels: de eenheid is de GTIN, want de crop
   * wordt uit de artwork van de GTIN gesneden.
   */
  offered: number;
  /** Voorleg-uitkomsten per status over de ECHTE crops (queued/skipped/refused). */
  outcomes: { queued: number; skipped: number; refused: number };
  /** Totaal overschot over alle klassen (NFR-5). */
  totalSkippedOverCap: number;
  /** Aantal klassen dat overgeslagen is omdat er geen gids-zaad was (net als bootstrap). */
  classesSkippedNoSeed: number;
}

/**
 * Leid de gebalanceerd geselecteerde, DISTINCTE GTINs van een klasse af, in
 * selectievolgorde (spreiding over producten blijft behouden). De crop-eenheid is
 * de GTIN — meerdere geselecteerde labels van dezelfde GTIN leiden tot één
 * artwork-zoektocht, want de crops komen uit de artwork van de GTIN, niet uit het
 * losse etiketbestand.
 */
export function distinctGtins(cls: ClassSelection): string[] {
  const seen = new Set<string>();
  const gtins: string[] = [];
  for (const sel of cls.selected) {
    if (seen.has(sel.gtin)) continue;
    seen.add(sel.gtin);
    gtins.push(sel.gtin);
  }
  return gtins;
}

/**
 * Voer één sampler-run uit.
 *
 *   - Bereken ALTIJD het selectieplan (puur, geen writes).
 *   - Vlag UIT (`isNominationEnabled()` false) → STOP: retourneer het plan als
 *     dry-run, geen enkele nominatie/write (AD-8).
 *   - Vlag AAN → voer per klasse de gebalanceerd geselecteerde GTINs door het
 *     CROP-PRODUCERENDE bootstrap-pad (`searchAndQueueClassForReview` — crops naar de
 *     `bootstrap`): dat resolveert het gids-zaad, verifieert de declaratie per GTIN
 *     hard, laat de ml-service de ECHTE keurmerk-crops in de artwork vinden en biedt
 *     ALLEEN die uitgesneden crops aan de bestaande 13.2-poort aan (gate, tweetraps-
 *     dedup, promotie-class-cap downstream). NOOIT het hele etiketbestand als crop,
 *     nooit een directe referentie-write. Klassen zonder zaad worden overgeslagen
 *     (geteld), net als in de bootstrap-run — geen brandstofverlies-nominatie.
 *
 * `dryRun` forceert het plan-only-pad óók met de vlag aan (voor operationeel
 * vooraf-inzicht zonder te schrijven).
 */
export async function runBalancedSampler(
  index: KeurmerkIndexInput,
  opts: { dryRun?: boolean; n?: number } = {}
): Promise<SamplerRunResult> {
  const n = opts.n ?? getSamplePerClass();
  const plan = buildSelectionPlan(index, n);
  const totalSkippedOverCap = plan.reduce((sum, c) => sum + c.skippedOverCap, 0);

  const emptyOutcomes = { queued: 0, skipped: 0, refused: 0 };

  // AD-8: hoofdvlag uit → geen writes/nominaties, alleen het plan (dry-run-vorm).
  if (!isNominationEnabled()) {
    logger.info('Sampler overgeslagen: hoofdvlag uit (AD-8) — plan-only', {
      classes: plan.length,
      totalSkippedOverCap,
    });
    return {
      skipped: true,
      skipReason: 'vlag-uit',
      plan,
      offered: 0,
      outcomes: emptyOutcomes,
      totalSkippedOverCap,
      classesSkippedNoSeed: 0,
    };
  }

  // Expliciete dry-run (vlag aan maar geen writes gewenst).
  if (opts.dryRun) {
    logger.info('Sampler dry-run (vlag aan, geen writes)', {
      classes: plan.length,
      totalSkippedOverCap,
    });
    return {
      skipped: false,
      plan,
      offered: 0,
      outcomes: emptyOutcomes,
      totalSkippedOverCap,
      classesSkippedNoSeed: 0,
    };
  }

  // Vlag aan → per klasse de gebalanceerde GTIN-set door het crop-producerende
  // bootstrap-pad. Story 19.8 (herzien): de gevonden crops worden als OPEN
  // `artworkReviewItem` aan de menselijke review-wachtrij voorgelegd (met hard-
  // negative + dedup-guard). We schrijven NOOIT zelf in de referentietabellen en
  // bieden nooit het label zelf als crop aan. Budget/time-box worden per klasse
  // opnieuw uit de bootstrap-config gelezen (elke klasse mag tot het volledige
  // run-budget aan GTINs verwerken; de sampler-cap N begrenst de selectie al
  // bovenstrooms).
  let offered = 0;
  let classesSkippedNoSeed = 0;
  const outcomes = { queued: 0, skipped: 0, refused: 0 };
  for (const cls of plan) {
    const gtins = distinctGtins(cls);
    if (gtins.length === 0) continue;

    const budget = getBootstrapRunBudget();
    const deadline = Date.now() + getBootstrapMaxSeconds() * 1000;
    const res = await searchAndQueueClassForReview(cls.code, gtins, {
      remainingBudget: budget,
      deadline,
    });

    if (!res.hadSeed) {
      // Geen gids-zaad voor de klasse → niets te lokaliseren; overslaan (geteld).
      classesSkippedNoSeed += 1;
      logger.info('Sampler: klasse zonder zaad overgeslagen', { code: cls.code });
      continue;
    }

    offered += res.budgetSpent;
    outcomes.queued += res.outcomes.queued;
    outcomes.skipped += res.outcomes.skipped;
    outcomes.refused += res.outcomes.refused;
  }

  logger.info('Sampler-run voltooid', {
    classes: plan.length,
    offered,
    outcomes,
    totalSkippedOverCap,
    classesSkippedNoSeed,
  });

  return {
    skipped: false,
    plan,
    offered,
    outcomes,
    totalSkippedOverCap,
    classesSkippedNoSeed,
  };
}
