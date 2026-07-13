/**
 * Code → `field_type`/`gs1_field`-resolutie (Story 12.10, AC1-3).
 *
 * `reference_logos.t3777Code` (kolomnaam is historisch — het draagt in de praktijk
 * ELKE GS1-code die de bibliotheek herkent, niet uitsluitend T3777) draagt op ACC
 * grotendeels de schema-default `field_type` (`PackagingMarkedLabelAccreditationCode`,
 * migratie 0010/0011) — óók voor codes die feitelijk een ANDER GS1-declaratieveld
 * zijn (DietTypeCode/NutritionalScore/EU_consumerUsageLabelCodeList/
 * GHSSymbolDescriptionCode). Dat maakt automatische per-categorie-rapportage
 * onmogelijk zonder handmatige mapping (zie
 * `_bmad-output/implementation-artifacts/keurmerk-dekking-per-categorie-2026-07-12.md`).
 *
 * Deze module is de ÉÉN centrale resolutie (geen duplicatie): de backfill
 * (`scripts/backfill-reference-logo-field-type.ts`) en het registratie-pad
 * (`api/v1/reference-logos.ts`, `services/flywheel/promotion.ts`) roepen allebei
 * `resolveFieldType` aan.
 *
 * BRONNEN (autoritatief, per de story):
 *  - `t3777-declarations.ts` (`MARK_FIELDS`) — de vier platte declaratie-tags +
 *    het GS1-declaratieveld (`gs1Field`) per codelijst.
 *  - `tests/validation/codelist-veld-mapping.json` — per-codelijst metadata + de
 *    code-COUNTS (PackagingMarkedLabelAccreditationCode 894/T3777-default,
 *    NutritionalScore 5, DietTypeCode 34, EU_consumerUsageLabelCodeList 20,
 *    GHSSymbolDescriptionCode 10).
 *  - De daadwerkelijke CODE-per-codelijst-enumeratie (nodig om, gegeven een losse
 *    code-string, de codelijst te bepalen) leeft al in
 *    `apps/web/src/data/spoor-codes.ts` (`fieldTypeForCode`, Story 12.6
 *    relabel-picker) — de counts daar (34/10/20/5) sluiten EXACT aan op
 *    codelist-veld-mapping.json, dus dit is dezelfde GS1-Benelux-bron. Omdat
 *    apps/web (frontend/Vite) en apps/api (backend) geen gedeeld package hebben
 *    ingericht voor dit soort statische domeindata (packages/shared bestaat wel,
 *    maar wordt door geen enkele app gebruikt — dat zou een aparte, grotere
 *    workspace-wiring-wijziging zijn, buiten de scope van deze story), is de
 *    code-enumeratie hier bewust gespiegeld (NIET herberekend/geraden). Wijzigt
 *    spoor-codes.ts, werk dan deze vier lijsten in lock-step bij.
 */

/** GS1-codelijstnaam (`reference_logos.fieldType`) — de default/T3777-bak. */
export const DEFAULT_FIELD_TYPE = 'PackagingMarkedLabelAccreditationCode';
/** GS1-declaratieveld (`reference_logos.gs1Field`) voor de default-bak. */
export const DEFAULT_GS1_FIELD = 'packagingMarkedLabelAccreditationCode';

/** GS1-codelijstnaam → GS1-declaratieveld (1:1, migratie 0010/0011 + codelist-veld-mapping.json). */
export const GS1_FIELD_BY_FIELD_TYPE: Record<string, string> = {
  PackagingMarkedLabelAccreditationCode: DEFAULT_GS1_FIELD,
  NutritionalScore: 'nutritionalScore',
  DietTypeCode: 'dietTypeCode',
  // Casing letterlijk uit codelist-veld-mapping.json (`gHSSymbolDescriptionCode`).
  GHSSymbolDescriptionCode: 'gHSSymbolDescriptionCode',
  // Consumer-usage komt via de gescopete `enumerationValue`-parse (t3777-declarations.ts
  // CONSUMER_USAGE_FIELD_TYPE), niet via een eigen platte tag.
  EU_consumerUsageLabelCodeList: 'enumerationValue',
};

/** DietTypeCode — dieet/free-from claims (spiegelt apps/web/src/data/spoor-codes.ts). */
const DIET_TYPE_CODES = [
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

/** GHSSymbolDescriptionCode — GHS-gevaarpictogrammen (spiegelt spoor-codes.ts). */
const GHS_SYMBOL_CODES = [
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

/** EU_consumerUsageLabelCodeList — AISE/consumentenpictogrammen (spiegelt spoor-codes.ts). */
const CONSUMER_USAGE_CODES = [
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

/** NutritionalScore A-E (spiegelt spoor-codes.ts NUTRISCORE_CODES). */
const NUTRISCORE_CODES = ['NUTRISCORE_A', 'NUTRISCORE_B', 'NUTRISCORE_C', 'NUTRISCORE_D', 'NUTRISCORE_E'];

/**
 * Codes → lijst van specifieke (niet-default) fieldTypes waarin ze voorkomen.
 * Normaliter exact 1 entry per code; >1 zou een ONDERLINGE ambiguïteit tussen
 * twee specifieke codelijsten betekenen (vandaag niet aanwezig, zie
 * `classifyCode` voor de defensieve afhandeling).
 */
const SPECIFIC_FIELD_TYPES_BY_CODE: Record<string, string[]> = {};
function register(codes: string[], fieldType: string): void {
  for (const code of codes) {
    const list = SPECIFIC_FIELD_TYPES_BY_CODE[code] ?? [];
    list.push(fieldType);
    SPECIFIC_FIELD_TYPES_BY_CODE[code] = list;
  }
}
register(DIET_TYPE_CODES, 'DietTypeCode');
register(GHS_SYMBOL_CODES, 'GHSSymbolDescriptionCode');
register(CONSUMER_USAGE_CODES, 'EU_consumerUsageLabelCodeList');
register(NUTRISCORE_CODES, 'NutritionalScore');

/**
 * Codes die WEL in een specifieke codelijst zitten (hierboven) maar ALSO als
 * literal code voorkomen in het T3777-default-universum
 * (`apps/web/src/data/keurmerk-codes.ts`, 884 codes) — dit IS de ambiguïteit die
 * de story bedoelt (AC1/AC2): "een code komt voor in >1 codelijst/declaratieveld".
 *
 * Vastgesteld via een eenmalige intersectie-check (2026-07-13, read-only op de
 * checked-in bronbestanden, GEEN ACC-call):
 *   comm -12 <(sort keurmerk-codes.ts-codes) <(sort specifieke-codes-hierboven)
 *   → FODMAP, NUTRISCORE_A, NUTRISCORE_B, NUTRISCORE_C, NUTRISCORE_D, NUTRISCORE_E.
 * Regenereer deze set als keurmerk-codes.ts of de vier lijsten hierboven wijzigen.
 */
const DEFAULT_OVERLAP_CODES = new Set([
  'FODMAP',
  'NUTRISCORE_A',
  'NUTRISCORE_B',
  'NUTRISCORE_C',
  'NUTRISCORE_D',
  'NUTRISCORE_E',
]);

export type FieldTypeResolutionKind = 'default' | 'unique' | 'default-overlap-resolved' | 'unresolved';

export interface FieldTypeResolution {
  /** De genormaliseerde (trim + uppercase) code waarop is geresolved. */
  code: string;
  /** Geresolveerde fieldType, of `null` als de ambiguïteit NIET is opgelost (AC2). */
  fieldType: string | null;
  /** Bijbehorend GS1-declaratieveld, of `null` naast een niet-opgeloste fieldType. */
  gs1Field: string | null;
  /** True zodra de code in meer dan één codelijst voorkomt (opgelost of niet). */
  ambiguous: boolean;
  resolution: FieldTypeResolutionKind;
  /** Uitleg van de toegepaste regel/tiebreak, of de reden dat niet gezet is. */
  note: string | null;
}

/**
 * PURE classificatie (testbaar met geïnjecteerde lookups — zo is ook de
 * "twee specifieke codelijsten botsen"-tak (vandaag onbereikbaar met de echte
 * data) rechtstreeks te unit-testen zonder data te verzinnen die niet bestaat).
 */
export function classifyCode(
  code: string,
  specificFieldTypesFor: (code: string) => string[],
  isDefaultOverlap: (code: string) => boolean
): FieldTypeResolution {
  const specific = specificFieldTypesFor(code);

  if (specific.length === 0) {
    return {
      code,
      fieldType: DEFAULT_FIELD_TYPE,
      gs1Field: DEFAULT_GS1_FIELD,
      ambiguous: false,
      resolution: 'default',
      note: null,
    };
  }

  if (specific.length > 1) {
    return {
      code,
      fieldType: null,
      gs1Field: null,
      ambiguous: true,
      resolution: 'unresolved',
      note: `Code komt voor in meerdere specifieke codelijsten (${specific.join(', ')}) — handmatige beslissing nodig, niet gezet.`,
    };
  }

  const fieldType = specific[0];
  const gs1Field = GS1_FIELD_BY_FIELD_TYPE[fieldType] ?? null;

  if (isDefaultOverlap(code)) {
    return {
      code,
      fieldType,
      gs1Field,
      ambiguous: true,
      resolution: 'default-overlap-resolved',
      note:
        `Code komt ook voor in het T3777-default-universum (${DEFAULT_FIELD_TYPE}); ` +
        `primaire regel "specifieke codelijst wint van de generieke default" toegepast → ${fieldType}.`,
    };
  }

  return { code, fieldType, gs1Field, ambiguous: false, resolution: 'unique', note: null };
}

/** Resolve een losse code naar zijn `field_type`/`gs1_field` (echte statische data). */
export function resolveFieldType(code: string): FieldTypeResolution {
  const normalized = code.trim().toUpperCase();
  return classifyCode(
    normalized,
    (c) => SPECIFIC_FIELD_TYPES_BY_CODE[c] ?? [],
    (c) => DEFAULT_OVERLAP_CODES.has(c)
  );
}
