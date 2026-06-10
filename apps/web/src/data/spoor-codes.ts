// GS1 sporen (codelists) beyond T3777, for the relabel picker (Story 12.6).
//
// The relabel dropdown must offer EVERY code that GS1 knows for the fields/sporen
// we recognise against — not only the T3777 keurmerk-logo's. These lists are
// sourced 1-op-1 from the GS1-Benelux `code` document in Mongo
// (application.code, _id="code", pulled 2026-06-10):
//   BENELUX_GDSN_DietTypeCode                 (34)  → LACTOSE_FREE, VEGAN, HALAL…
//   BENELUX_GDSN_GHSSymbolDescriptionCode     (10)  → hazard pictogrammen
//   BENELUX_GDSN_EU_consumerUsageLabelCodeList(20)  → AISE / NIX18 pictogrammen
//
// T3777 (PackagingMarkedLabelAccreditationCode, ~884) lives in keurmerk-codes.ts
// and is the DEFAULT spoor; Nutri-Score (NUTRISCORE_A…E) is also seeded there.
// `fieldTypeForCode` resolves a code → its GS1-codelijstnaam (= reference_logos.fieldType).
//
// Why lactosevrij was missing before: it has NO T3777-keurmerklogo. In GS1 it is
// a data-claim in DietTypeCode (LACTOSE_FREE = "Vrij van lactose"), so it never
// appeared in the T3777-only picker. It is now selectable via this list.

/** DietTypeCode — dieet/free-from claims (GS1-veld dietTypeCode). */
export const DIET_TYPE_CODES = [
  'COELIAC',
  'DIABETIC',
  'DIETETIC',
  'FREE_FROM_GLUTEN',
  'GRAIN_FREE',
  'HALAL',
  'HIGH_CARB',
  'HIGH_PROTEIN',
  'INFANT_FORMULA',
  'KETO',
  'KOSHER',
  'LACTASE_ENZYME',
  'LACTOSE_FREE',
  'LOW_CALORIE',
  'LOW_CARB',
  'LOW_FAT',
  'LOW_PROTEIN',
  'LOW_SALT',
  'MEAL_REPLACEMENT',
  'MOTHERS_MILK_SUBSTITUTE',
  'NUTRITION_SUPPLEMENT',
  'ORGANIC',
  'PALEO',
  'PESCATARIAN',
  'PLANT_BASED',
  'POLLOTARIAN',
  'PROBIOTICS',
  'RAW',
  'TOTAL_DIET_REPLACEMENT',
  'VEGAN',
  'VEGETARIAN',
  'WITHOUT_BEEF',
  'WITHOUT_PORK',
  'FODMAP',
];

/** GHSSymbolDescriptionCode — GHS-gevaarpictogrammen (ruit-symbolen). */
export const GHS_SYMBOL_CODES = [
  'CORROSION',
  'ENVIRONMENT',
  'EXCLAMATION_MARK',
  'EXPLODING_BOMB',
  'FLAME',
  'FLAME_OVER_CIRCLE',
  'GAS_CYLINDER',
  'HEALTH_HAZARD',
  'NO_PICTOGRAM',
  'SKULL_AND_CROSSBONES',
];

/** EU_consumerUsageLabelCodeList — AISE / consumenten-waarschuwingspictogrammen. */
export const CONSUMER_USAGE_CODES = [
  'AISE_1',
  'AISE_2',
  'AISE_3',
  'AISE_4',
  'AISE_5',
  'AISE_6',
  'AISE_7',
  'AISE_8',
  'AISE_9',
  'AISE_10',
  'AISE_11',
  'AISE_12',
  'AISE_13',
  'AISE_14',
  'DO_NOT_DRINK_AND_DRIVE_WARNING',
  'DO_NOT_FLUSH',
  'MINIMUM_DRINKING_AGE_18_WARNING',
  'NIX18',
  'POULTRY_MEAT_WARNING',
  'PREGNANCY_WARNING',
];

/** Nutri-Score codes seeded under keurmerk-codes.ts (kept here for fieldType resolution). */
const NUTRISCORE_CODES = ['NUTRISCORE_A', 'NUTRISCORE_B', 'NUTRISCORE_C', 'NUTRISCORE_D', 'NUTRISCORE_E'];

/** GS1-codelijstnaam (= reference_logos.fieldType) → korte, leesbare spoor-naam. */
export const SPOOR_LABEL: Record<string, string> = {
  PackagingMarkedLabelAccreditationCode: 'Keurmerk',
  NutritionalScore: 'Nutri-Score',
  DietTypeCode: 'Dieet / free-from',
  GHSSymbolDescriptionCode: 'GHS-pictogram',
  EU_consumerUsageLabelCodeList: 'Consumentenpictogram',
};

const FIELD_TYPE_BY_CODE: Record<string, string> = {};
for (const c of DIET_TYPE_CODES) FIELD_TYPE_BY_CODE[c] = 'DietTypeCode';
for (const c of GHS_SYMBOL_CODES) FIELD_TYPE_BY_CODE[c] = 'GHSSymbolDescriptionCode';
for (const c of CONSUMER_USAGE_CODES) FIELD_TYPE_BY_CODE[c] = 'EU_consumerUsageLabelCodeList';
// Nutri-Score A–E live in the GS1 codelist NutritionalScore (gs1Field nutritionalScore).
for (const c of NUTRISCORE_CODES) FIELD_TYPE_BY_CODE[c] = 'NutritionalScore';

/** Non-T3777 codes from our other GS1 sporen — merged into the relabel picker. */
export const EXTRA_SPOOR_CODES = [...DIET_TYPE_CODES, ...GHS_SYMBOL_CODES, ...CONSUMER_USAGE_CODES];

/** GS1-codelijstnaam (fieldType) voor een code; default = T3777 (keurmerk). */
export function fieldTypeForCode(code: string): string {
  return FIELD_TYPE_BY_CODE[code] ?? 'PackagingMarkedLabelAccreditationCode';
}

/** Korte spoor-naam voor weergave in de UI (bijv. "Dieet / free-from"). */
export function spoorLabelForCode(code: string): string {
  return SPOOR_LABEL[fieldTypeForCode(code)] ?? 'Keurmerk';
}
