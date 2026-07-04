/**
 * Declaratiefrequentie-bron voor de bootstrap-wachtrij (Story 17.2, FR-13, AC1).
 *
 * De rangschikkingsbron voor de initiële vulling is de universum-meting van
 * 2026-06-09 op de prod `application.tradeItems` van de 131 Benelux-artwork-
 * leveranciers (143.962 tradeItems, 26.247 declarerend), vastgelegd in
 * `tests/validation/keurmerk-declaratie-frequentie.md` §3 (top-30 met aantallen).
 *
 * Deze module encodeert die top-30 als een canonieke, herleidbare frequentietabel
 * (herkomst + meetdatum in `FREQUENCY_SOURCE`), zodat een latere hermeting de
 * tabel herleidbaar vervangt (taak 1.1). Codes buiten de top-30 (de lange staart)
 * krijgen frequentie 0 als startwaarde — conform de story-keuze "staart aanvullen
 * vanuit dezelfde meting óf 0"; 0 is de conservatieve, deterministische startwaarde
 * (de code komt onderaan de wachtrij tot een verse universum-telling hem verrijkt).
 *
 * NIET-VISUELE CODES (frequentiedoc §5.4): pictogrammen/waarschuwingen die geen
 * detecteerbaar keurmerk-logo zijn. De seed mag deze direct `uitgesloten` zetten
 * (gedocumenteerd) — ze horen niet in het bootstrap-zoekpad thuis.
 *
 * Puur data + pure helpers (geen I/O) zodat de seed-idempotentie- en
 * frequentie-rangschikking-tests deze module los kunnen importeren.
 */

/** Herkomst + meetdatum van de frequentietabel (herleidbaarheid, taak 1.1). */
export const FREQUENCY_SOURCE =
  'keurmerk-declaratie-frequentie.md §3 — prod application.tradeItems, ' +
  '131 Benelux-artwork-GLNs, meting 2026-06-09 (143.962 items, 26.247 declarerend)';

/**
 * De canonieke declaratiefrequentie per T3777-code (universum-telling §3, top-30).
 * De aantallen zijn de exacte declaratie-frequenties uit de meting; codes buiten
 * deze tabel krijgen 0 (lange staart, verse hermeting vult ze aan).
 */
export const DECLARATION_FREQUENCY: Readonly<Record<string, number>> = Object.freeze({
  GREEN_DOT: 11169,
  RECYCLABLE_GENERAL_CLAIM: 8643,
  TRIMAN: 3886,
  SOCIETY_PLASTICS_INDUSTRY: 2972,
  FOREST_STEWARDSHIP_COUNCIL_MIX: 2423,
  EU_ORGANIC_FARMING: 1664,
  BETER_LEVEN_1_STER: 988,
  EUROPEAN_V_LABEL_VEGAN: 835,
  RAINFOREST_ALLIANCE_PEOPLE_NATURE: 752,
  AISE_2020_COMPANY: 614,
  SEPARATE_COLLECTION: 522,
  ON_THE_WAY_TO_PLANETPROOF: 472,
  WEIDEMELK: 456,
  FAIRTRADE_COCOA: 443,
  EUROPEAN_V_LABEL_VEGETARIAN: 443,
  CERTIFIED_B_CORPORATION: 418,
  PREGNANCY_WARNING: 401,
  RAINFOREST_ALLIANCE: 379,
  VEGAN_SOCIETY_VEGAN_LOGO: 354,
  CONFORMITE_EUROPEENNE: 307,
  ALUMINIUM_GDA: 303,
  MARINE_STEWARDSHIP_COUNCIL: 292,
  FAIR_TRADE_MARK: 265,
  RETURNABLE_PET_BOTTLE_NL: 252,
  HALAL_CORRECT: 246,
  CRUELTY_FREE_PETA: 240,
  EKO: 218,
  PEFC_CERTIFIED: 202,
  OU_KOSHER: 188,
  BETER_LEVEN_2_STER: 184,
});

/**
 * Niet-visuele codes (frequentiedoc §5.4): pictogrammen / wettelijke
 * waarschuwingen die geen detecteerbaar keurmerk-logo dragen. De seed zet deze
 * direct op `uitgesloten` — ze horen niet in het bootstrap-zoekpad (het zaad is er
 * geen keurmerk-logo voor). Gedocumenteerd zodat de uitsluiting herleidbaar is.
 *   - PREGNANCY_WARNING, NIX18       — wettelijke leeftijds-/zwangerschapswaarschuwing
 *   - GHS-signaalwoorden (DANGER/WARNING) — tekst, geen logo
 *   - SEPARATE_COLLECTION            — afval-scheidingspictogram (frequentiedoc §3-noot)
 */
export const NON_VISUAL_CODES: ReadonlySet<string> = new Set([
  'PREGNANCY_WARNING',
  'NIX18',
  'GHS_SIGNAL_WORD_DANGER',
  'GHS_SIGNAL_WORD_WARNING',
  'SEPARATE_COLLECTION',
]);

/** Is een code niet-visueel (→ seed zet direct `uitgesloten`)? */
export function isNonVisualCode(code: string): boolean {
  return NON_VISUAL_CODES.has(code);
}

/** Declaratiefrequentie voor een code (0 als hij niet in de top-30-tabel staat). */
export function frequencyForCode(code: string): number {
  return DECLARATION_FREQUENCY[code] ?? 0;
}

/**
 * De codes uit de frequentiebron (top-30) — het startuniversum van bekende,
 * gedeclareerde T3777-codes. De seed voegt hier de codes uit de reeds bestaande
 * werkvoorraad (FR-15-events, 16.2) aan toe.
 */
export function knownFrequencyCodes(): string[] {
  return Object.keys(DECLARATION_FREQUENCY);
}
