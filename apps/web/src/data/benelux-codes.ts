// Benelux-relevant keurmerk codes for the visual indicator (Story 12.6).
// Basis: declaration frequency on 131 Benelux artwork-suppliers (top-declared,
// keurmerk-declaratie-frequentie.md) + known NL/BE-origin schemes (Beter Leven,
// Weidemelk, PlanetProof, EKO, Halal Correct, ...) + name-based NL markers +
// the consumer free-from / Nutri-Score categories prevalent in the Benelux market.
// Refinable with a full prod-Mongo declaration pull. Editable list.
export const BENELUX_CODES = new Set<string>([
"AISE_2020_COMPANY",
"ALLERGYCERTIFIED",
"BETER_LEVEN_1_STER",
"BETER_LEVEN_2_STER",
"BETER_LEVEN_3_STER",
"CCA_GLUTEN_FREE",
"CERTIFIED_B_CORPORATION",
"CONFORMITE_EUROPEENNE",
"CROSSED_GRAIN_SYMBOL",
"CRUELTY_FREE_PETA",
"DZG_GLUTEN_FREE",
"EKO",
"EUROPEAN_V_LABEL_VEGAN",
"EUROPEAN_V_LABEL_VEGETARIAN",
"EU_ORGANIC_FARMING",
"FAIRTRADE_COCOA",
"FAIR_TRADE_MARK",
"FOREST_STEWARDSHIP_COUNCIL_MIX",
"GREEN_DOT",
"HALAL_CORRECT",
"MARINE_STEWARDSHIP_COUNCIL_LABEL",
"MILIEUKEUR",
"NSF_GLUTEN_FREE",
"NUTRISCORE_A",
"NUTRISCORE_B",
"NUTRISCORE_C",
"NUTRISCORE_D",
"NUTRISCORE_E",
"ON_THE_WAY_TO_PLANETPROOF",
"OU_KOSHER",
"PEFC_CERTIFIED",
"RAINFOREST_ALLIANCE",
"RAINFOREST_ALLIANCE_PEOPLE_NATURE",
"RECYCLABLE_GENERAL_CLAIM",
"RETURNABLE_CAN_NL",
"RETURNABLE_PET_BOTTLE_NL",
"SEPARATE_COLLECTION",
"TRIMAN",
"VEGAN_SOCIETY_VEGAN_LOGO",
"WEIDEMELK"
]);

export function isBeneluxCode(code: string): boolean {
  return BENELUX_CODES.has(code);
}
