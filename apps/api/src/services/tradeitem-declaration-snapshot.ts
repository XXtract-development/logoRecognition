/**
 * Momentopname van keurmerkdeclaraties uit de trade-item-database (story 20.19).
 *
 * GEGENEREERD BESTAND — niet met de hand bewerken.
 * Opnieuw genereren: `apps/api/scripts/harvest-tradeitem-snapshot.ts` (handmatig,
 * met een leesverbinding, nooit automatisch).
 *
 * Een lege lijst betekent "gemeten, declareert niets"; een ontbrekende sleutel
 * betekent "niet gemeten". Die twee mogen niet op een hoop.
 *
 * Bewerkingen bij het oogsten, gelijk aan `parseDeclaredMarks`: trim, uppercase,
 * ontdubbeld per (fieldType, code), lege waarden overgeslagen, uitsluitend `value`
 * (nooit `oldValue`), `enumerationValue` uitsluitend binnen `consumerUsageLabelCode`.
 *
 * Deze momentopname veroudert: producten die na de oogstdatum binnenkomen staan er
 * niet in. Loopt de beoordeelwachtrij opnieuw leeg, dan is opnieuw oogsten stap een.
 */

export interface SnapshotMark {
  /** Canonieke `reference_logos.fieldType`, gelijk aan MARK_FIELDS in t3777-declarations.ts. */
  fieldType: string;
  /** Declaratiecode, getrimd en in hoofdletters. */
  code: string;
}

export const TRADEITEM_SNAPSHOT_META = {
  harvestedAt: '2026-08-19',
  source: 'application.tradeItems (productie), opgezocht op _id = {gln}-{gtin}-{targetMarket}',
  targetMarket: '528',
  keys: 442,
  keysWithMarks: 238,
  markInstances: 475,
  instancesByFieldType: {
    PackagingMarkedLabelAccreditationCode: 292,
    AdditionalPackagingMarkingsCode: 0,
    DietTypeCode: 89,
    NutritionalScore: 61,
    EU_consumerUsageLabelCodeList: 33,
  },
} as const;

/** Sleutel: `{gln}-{gtin}-{targetMarket}`, dezelfde vorm als `_id` in de database. */
export const TRADEITEM_SNAPSHOT: Readonly<Record<string, readonly SnapshotMark[]>> = {
  '5000171000002-05000171002808-528': [],
  '5000171000002-05000171010209-528': [],
  '5000171000002-05000171030696-528': [],
  '5000171000002-05000171062550-528': [],
  '5410371029602-05410371982273-528': [
    { fieldType: 'DietTypeCode', code: 'HALAL' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '5410371029602-05410371999080-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '5488888005778-00000050160167-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'LEAPING_BUNNY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOIL_COSMOS_NATURAL' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'VEGAN_SOCIETY_VEGAN_LOGO' },
  ],
  '8710267000027-00000087288735-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8710267000027-08710267750014-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
  ],
  '8710314000000-08710314012126-528': [],
  '8710314000000-08719587111185-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'E' },
  ],
  '8710466000019-04000521004569-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
  ],
  '8710466000019-04000521021894-528': [{ fieldType: 'NutritionalScore', code: 'C' }],
  '8710466000019-04000521038588-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8710466000019-04000521038670-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8710466000019-04000521661205-528': [{ fieldType: 'NutritionalScore', code: 'C' }],
  '8710466000019-04000521661403-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
  ],
  '8710466000019-04001724023784-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724023814-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724023845-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724023876-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724023906-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724023937-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724026594-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724043393-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724044901-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724046790-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724048350-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8710466000019-04001724048381-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8710466000019-04001724050124-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724050155-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8710466000019-04001724050650-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724050681-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-04001724050711-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710466000019-08710466294029-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8710466000019-08710466302120-528': [
    { fieldType: 'NutritionalScore', code: 'B' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8710466000019-08710466304728-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8710466000019-08710466327321-528': [
    { fieldType: 'NutritionalScore', code: 'E' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8710466000019-08710466327420-528': [
    { fieldType: 'NutritionalScore', code: 'E' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8710466000019-08710466327529-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CROSSED_GRAIN_SYMBOL' },
  ],
  '8710466000019-08710466327628-528': [
    { fieldType: 'NutritionalScore', code: 'D' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8710624010003-00000087295504-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8710624010003-08710624370602-528': [],
  '8710873999999-08710401889808-528': [],
  '8710873999999-08710873002088-528': [
    { fieldType: 'DietTypeCode', code: 'ORGANIC' },
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710873999999-08710873011271-528': [
    { fieldType: 'DietTypeCode', code: 'ORGANIC' },
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710873999999-08710873993775-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SUSTAINABLE_PALM_OIL_RSPO' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710873999999-08710873993812-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SUSTAINABLE_PALM_OIL_RSPO' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8710873999999-08710873993874-528': [
    { fieldType: 'DietTypeCode', code: 'ORGANIC' },
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711200030002-03011360014344-528': [],
  '8711200030002-08710522832202-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGETARIAN' },
  ],
  '8711200030002-08711200368068-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGAN' },
  ],
  '8711200030002-08711327471436-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGETARIAN' },
  ],
  '8711200030002-08711327471610-528': [{ fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' }],
  '8711200030002-08711327472099-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGETARIAN' },
  ],
  '8711200030002-08720182810007-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGAN' },
  ],
  '8711200030002-08722700482093-528': [],
  '8711200030002-08722700482451-528': [],
  '8711200030002-08722700482710-528': [],
  '8711200030002-08722700483168-528': [],
  '8711200030002-09000143235650-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8711700400008-08711327532359-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327585782-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8711700400008-08711327606081-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327606234-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327607569-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327608207-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327608665-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327608887-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327609419-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327609716-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327611924-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711700400008-08711327611931-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
  ],
  '8711700400008-08711327614949-528': [],
  '8711700400008-08711327615649-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
  ],
  '8711700400008-08711327616707-528': [],
  '8711700400008-08711327616783-528': [],
  '8711700400008-08711327616998-528': [],
  '8711700400008-08711327617186-528': [],
  '8711700400008-08720181440014-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'AISE_2020_BRAND' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8711700400008-08720182814401-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGAN' },
  ],
  '8711744998752-04103040120267-528': [],
  '8711744998752-05701943100264-528': [],
  '8711744998752-05701943102527-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'VEGAN_SOCIETY_VEGAN_LOGO' },
  ],
  '8711744998752-05701943102879-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ALLERGYCERTIFIED' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ECOSUN_PASS' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'VEGAN_SOCIETY_VEGAN_LOGO' },
  ],
  '8711744998752-08711744040529-528': [],
  '8711744998752-08711744047450-528': [],
  '8711744998752-08711744051860-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CONFORMITE_EUROPEENNE' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711744998752-08711744053581-528': [],
  '8711744998752-08711744056803-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8711744998752-08711744056865-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8711744998752-08711744056896-528': [],
  '8711744998752-08711744056919-528': [],
  '8711744998752-08711744056933-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
  ],
  '8711744998752-08711744057053-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8711744998752-08711744057077-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8711744998752-08711744057404-528': [],
  '8711744998752-08711744057435-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
  ],
  '8711744998752-08711744057459-528': [],
  '8711744998752-08711744057558-528': [],
  '8711744998752-08711744057800-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8711744998752-08712172864084-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8711744998752-08713091021473-528': [],
  '8711744998752-08713304103026-528': [],
  '8711744998752-08713304103644-528': [],
  '8711744998752-08713304942175-528': [],
  '8711744998752-08713304944476-528': [],
  '8711744998752-08713304944506-528': [],
  '8711744998752-08713304948573-528': [],
  '8711744998752-08713304955953-528': [],
  '8711744998752-08718885372137-528': [],
  '8711744998752-08718885372144-528': [],
  '8712000950019-00000087179354-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-04002103249559-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712000950019-08712000057633-528': [],
  '8712000950019-08712000059996-528': [],
  '8712000950019-08712000060213-528': [],
  '8712000950019-08712000060664-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-08712000060688-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-08712000060701-528': [],
  '8712000950019-08712000061081-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-08712000061449-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-08712000062194-528': [],
  '8712000950019-08712000062248-528': [],
  '8712000950019-08712000071011-528': [],
  '8712000950019-08712000071127-528': [],
  '8712000950019-08717903630068-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'MINIMUM_DRINKING_AGE_18_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-08723200102801-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'PREGNANCY_WARNING' },
  ],
  '8712000950019-08728600001075-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'MINIMUM_DRINKING_AGE_18_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712075000008-00031200013231-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RETURNABLE_PET_BOTTLE_NL' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712075000008-00031200456991-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RETURNABLE_PET_BOTTLE_NL' },
  ],
  '8712092000005-08710871409131-528': [{ fieldType: 'NutritionalScore', code: 'D' }],
  '8712092000005-08710871409179-528': [{ fieldType: 'NutritionalScore', code: 'C' }],
  '8712092000005-08712092000081-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092000210-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092000272-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092000340-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092000357-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092000401-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092003143-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092003167-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092003174-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092005604-528': [],
  '8712092000005-08712092033256-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092033270-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092033294-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092033300-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092033645-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092033652-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092800001-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08712092802364-528': [],
  '8712092000005-08712092810017-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'WEIDEMELK' },
  ],
  '8712092000005-08718989067397-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'D' },
  ],
  '8712092000005-08718989067410-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'D' },
  ],
  '8712092000005-08718989067434-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
  ],
  '8712092000005-08718989067458-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'D' },
  ],
  '8712092000005-08718989067472-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'NutritionalScore', code: 'D' },
  ],
  '8712423007765-03221580054833-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'MINIMUM_DRINKING_AGE_18_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423008007-00061243710651-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'OU_KOSHER_DAIRY' },
  ],
  '8712423008007-00061243710958-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'OU_KOSHER_DAIRY' },
  ],
  '8712423008007-00061243711559-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'OU_KOSHER_DAIRY' },
  ],
  '8712423008007-00061243718206-528': [],
  '8712423008007-05010265000689-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712423008007-05010265002201-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712423008007-08437022182209-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
  ],
  '8712423008007-08716496561346-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423008007-08716496561360-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
  ],
  '8712423017535-00008500002456-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712423026537-03012992422002-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712423026537-03147697720303-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712423026537-03192200003190-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712423026537-05410293141017-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423026537-05410293241014-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423026537-05410293752077-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8712423026537-08720892260260-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423030572-08436048966053-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423030572-08436551190167-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EUROPEAN_V_LABEL_VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423030572-08710871402828-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
  ],
  '8712423030572-08718989061586-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'RAINFOREST_ALLIANCE_PEOPLE_NATURE',
    },
  ],
  '8712423030572-08718989962036-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'E' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FAIRTRADE_COCOA' },
  ],
  '8712423032132-07611480007873-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423032132-07611480011566-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423032132-07611480011641-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423032132-07611480011696-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423032774-06009678814661-528': [],
  '8712423033887-08000146029059-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423033887-08000146029349-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423033887-08000146031229-528': [],
  '8712423033887-08000146036071-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423033887-08000146040214-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712423033887-08000146102073-528': [],
  '8712423033887-08000146943119-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712423033894-07317400015811-528': [],
  '8712423033894-07317400015842-528': [],
  '8712423033894-07350121255975-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ISCC_SUPPORTING_THE_BIOECONOMY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423033894-07350121256019-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ISCC_SUPPORTING_THE_BIOECONOMY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423033894-07350121256057-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ISCC_SUPPORTING_THE_BIOECONOMY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423033894-07350121256095-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ISCC_SUPPORTING_THE_BIOECONOMY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423033894-07350121256132-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ISCC_SUPPORTING_THE_BIOECONOMY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712423035539-08720812671756-528': [],
  '8712423036383-08719244867707-528': [],
  '8712444000004-08710442476326-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'E' },
  ],
  '8712444000004-08710871408806-528': [],
  '8712444000004-08712444011178-528': [],
  '8712444000004-08712444011215-528': [],
  '8712444000004-08718452628315-528': [],
  '8712444000004-08718452853915-528': [],
  '8712444000004-08718452890927-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8712444000004-08718452890934-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8712444000004-08718989048013-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8712444000004-08718989923952-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
  ],
  '8712631008875-08712631994420-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712631008875-08712631997506-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'PLANT_BASED' },
  ],
  '8712671000006-08712671302537-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8712738000000-08712738028912-528': [],
  '8712738000000-08712738028974-528': [],
  '8712738000000-08712738379526-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
  ],
  '8712738000000-08712738839211-528': [],
  '8712941000002-05411219000029-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712941000002-05411219020164-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8712941000002-08712941330482-528': [],
  '8712941000002-08712941331564-528': [],
  '8712941000002-08712941611482-528': [],
  '8712941000002-08712941614575-528': [],
  '8712941000002-08712941617101-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8712941000002-08718452933631-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
  ],
  '8712941000002-08718452933648-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
  ],
  '8712941000002-08718452933655-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
  ],
  '8712941000002-08719587146095-528': [
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'NutritionalScore', code: 'C' },
  ],
  '8713014000004-08033954123145-528': [],
  '8713014000004-08426723320119-528': [],
  '8713014000004-08436538088401-528': [],
  '8713014000004-08710624995898-528': [],
  '8713014000004-08710871416139-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ON_THE_WAY_TO_PLANETPROOF' },
  ],
  '8713014000004-08712426027623-528': [],
  '8713014000004-08713014403393-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ON_THE_WAY_TO_PLANETPROOF' },
  ],
  '8713014000004-08713014468682-528': [],
  '8713014000004-08713014515836-528': [],
  '8713014000004-08713014516109-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ON_THE_WAY_TO_PLANETPROOF' },
  ],
  '8713014000004-08713014516642-528': [],
  '8713014000004-08713014516796-528': [],
  '8713014000004-08713014516802-528': [],
  '8713014000004-08713014517199-528': [],
  '8713014000004-08718983001090-528': [],
  '8713014000004-08718983003520-528': [],
  '8713014000004-08718989804619-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ON_THE_WAY_TO_PLANETPROOF' },
  ],
  '8713975000013-08445291847736-528': [],
  '8713975000013-08713975502210-528': [],
  '8713975000013-08714439533696-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8713975000013-08714439533764-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8713975000013-08714439562863-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8713975000013-08714439574934-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8713975000013-08715687705187-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8713975000013-08715687802206-528': [
    { fieldType: 'DietTypeCode', code: 'VEGAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8714024228853-08714024341507-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ONE_PERCENT_FOR_THE_PLANET' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'PEFC_CERTIFIED' },
  ],
  '8714252029307-00031655644295-528': [],
  '8714684000004-08710803052053-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'HALAL' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
  ],
  '8714684000004-08714684000486-528': [{ fieldType: 'DietTypeCode', code: 'HALAL' }],
  '8714684000004-08714684005290-528': [{ fieldType: 'DietTypeCode', code: 'HALAL' }],
  '8714684000004-08714684005313-528': [{ fieldType: 'DietTypeCode', code: 'HALAL' }],
  '8714684000004-08714684005337-528': [{ fieldType: 'DietTypeCode', code: 'HALAL' }],
  '8714684000004-08714684005610-528': [],
  '8715509000001-08715509333871-528': [],
  '8715509000001-08718989060213-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'BETER_LEVEN_2_STER' },
  ],
  '8715509000001-08720326093518-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'BETER_LEVEN_1_STER' },
  ],
  '8715538000003-08715538005664-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
  ],
  '8715538000003-08715538008689-528': [{ fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' }],
  '8715538000003-08715538008702-528': [{ fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' }],
  '8715675999918-08715675101809-528': [
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FAIRTRADE_COCOA' },
  ],
  '8716109000002-03049614232626-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8716109000002-03245990329404-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'MINIMUM_DRINKING_AGE_18_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8716109000002-03245991478408-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
  ],
  '8716109000002-03245999924310-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'VEGETARIAN' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716109000002-05010494990300-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'DO_NOT_DRINK_AND_DRIVE_WARNING' },
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716109000002-05901867816641-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'OU_KOSHER' },
  ],
  '8716109000002-05901867817037-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'PREGNANCY_WARNING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'OU_KOSHER' },
  ],
  '8716401999998-08716401203897-528': [],
  '8716401999998-08716401203910-528': [],
  '8716401999998-08716401203927-528': [],
  '8716401999998-08716401203934-528': [],
  '8716401999998-08716401203941-528': [],
  '8716401999998-08716401203958-528': [],
  '8716401999998-08716401203965-528': [],
  '8716401999998-08716401203972-528': [],
  '8716401999998-08716401203989-528': [],
  '8716401999998-08716401203996-528': [],
  '8716401999998-08716401204009-528': [],
  '8716401999998-08716401204085-528': [{ fieldType: 'NutritionalScore', code: 'B' }],
  '8716401999998-08716401204092-528': [],
  '8716401999998-08716401204108-528': [],
  '8716401999998-08716401930052-528': [],
  '8716769999999-08719033207615-528': [],
  '8716769999999-08719033207639-528': [],
  '8716769999999-09501295571394-528': [],
  '8716769999999-09502663457715-528': [],
  '8716769999999-09503219881213-528': [],
  '8716769999999-09503227662750-528': [],
  '8716769999999-09503678731876-528': [],
  '8716769999999-09504139384228-528': [],
  '8716769999999-09506392337287-528': [],
  '8716769999999-09506567814711-528': [],
  '8716769999999-09506829789962-528': [],
  '8716769999999-09507488198188-528': [],
  '8716769999999-09507638224927-528': [],
  '8716769999999-09509376589238-528': [],
  '8716893000004-07312930002201-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'HALAL' },
    { fieldType: 'DietTypeCode', code: 'KOSHER' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CROSSED_GRAIN_SYMBOL' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SUSTAINABLE_PALM_OIL_RSPO' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716893000004-07312930008975-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CROSSED_GRAIN_SYMBOL' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SUSTAINABLE_PALM_OIL_RSPO' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716893000004-08716893023720-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
  ],
  '8716893000004-08716893026189-528': [],
  '8716893000004-08716893026202-528': [
    { fieldType: 'NutritionalScore', code: 'A' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8716893000004-08716893026226-528': [
    { fieldType: 'NutritionalScore', code: 'A' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8716893000004-08716893026240-528': [
    { fieldType: 'NutritionalScore', code: 'A' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8716893000004-08720326106690-528': [
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'MARINE_STEWARDSHIP_COUNCIL_LABEL',
    },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716893000004-09001442221900-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716893000004-09001442225700-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8716893000004-09001442225977-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'TRIMAN' },
  ],
  '8717200001301-08710871305129-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8717278600000-00649674072458-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
  ],
  '8717278600000-00731509553611-528': [],
  '8717278600000-00731509659924-528': [],
  '8717278600000-00731509838343-528': [],
  '8717278600000-00731509876055-528': [],
  '8717278600000-00731509913996-528': [],
  '8717278600000-00731509914023-528': [],
  '8717278600000-00731509914047-528': [],
  '8717278600000-00731509914085-528': [],
  '8717278600000-00731509915839-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8717278600000-00731509919004-528': [],
  '8717278600000-00731509926866-528': [],
  '8717278600000-00731509926873-528': [],
  '8717278600000-00731509932942-528': [],
  '8717278600000-00731509932966-528': [],
  '8717278600000-00731509972597-528': [],
  '8717278600000-00731509972894-528': [],
  '8717591220008-08717591221418-528': [],
  '8717591319993-05011428000294-528': [
    { fieldType: 'DietTypeCode', code: 'KOSHER' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8717591560005-04008455491110-528': [
    { fieldType: 'EU_consumerUsageLabelCodeList', code: 'AISE_1' },
  ],
  '8717600000003-08710401711284-528': [],
  '8717600000003-08720326045470-528': [],
  '8717600000003-08720326088897-528': [],
  '8717600000003-08720326088910-528': [],
  '8717600000003-08720326088934-528': [],
  '8717600000003-08720326088958-528': [],
  '8717600000003-08720326088972-528': [],
  '8717600000003-08720326088996-528': [],
  '8717600000003-08720326089030-528': [],
  '8717600000003-08720326089054-528': [],
  '8717600000003-08720326089078-528': [],
  '8717624890000-08720326096366-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8717624890000-08720326096380-528': [{ fieldType: 'NutritionalScore', code: 'E' }],
  '8717677119998-08717677117765-528': [],
  '8717677119998-08717677117789-528': [],
  '8717677119998-08717677117802-528': [],
  '8717677119998-08717677117826-528': [],
  '8717677119998-08717677118151-528': [],
  '8717677119998-08717677118168-528': [],
  '8717677119998-08717677118175-528': [],
  '8717677119998-08717677118199-528': [],
  '8717677119998-08717677118366-528': [],
  '8717677119998-08717677118403-528': [],
  '8717677119998-08720812673606-528': [],
  '8717931020008-08712076949917-528': [],
  '8717931020008-08717931024921-528': [],
  '8717931020008-08717931024938-528': [],
  '8717931020008-08717931024945-528': [],
  '8717931020008-08717931025010-528': [],
  '8717931020008-08717931025027-528': [],
  '8717931020008-08717931025034-528': [],
  '8717931020008-08718989906757-528': [
    { fieldType: 'NutritionalScore', code: 'E' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FAIRTRADE_COCOA' },
  ],
  '8717931020008-08718989906771-528': [
    { fieldType: 'NutritionalScore', code: 'E' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FAIRTRADE_COCOA' },
  ],
  '8717931020008-08718989940287-528': [{ fieldType: 'NutritionalScore', code: 'C' }],
  '8717931020008-08718989940300-528': [
    { fieldType: 'NutritionalScore', code: 'C' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FAIRTRADE_COCOA' },
  ],
  '8717931780001-08008560005796-528': [],
  '8717953233509-08720600622908-528': [],
  '8717953233509-08720600622960-528': [],
  '8717953233509-08720600623042-528': [],
  '8717953233509-08720600664809-528': [],
  '8717953233509-08720600664816-528': [],
  '8717953233509-08720600664830-528': [],
  '8717953233509-08720600666759-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8717953233509-08721271100931-528': [],
  '8717953233509-08721271100955-528': [],
  '8717953233509-08721271100962-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8717953233509-08721271101204-528': [],
  '8718347630003-08711334121003-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'HALAL_QUALITY_CONTROL' },
  ],
  '8718503360003-08718503366074-528': [],
  '8718503360003-08718503366081-528': [],
  '8718503360003-08718503367224-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'LACTOSE_FREE' },
    { fieldType: 'DietTypeCode', code: 'ORGANIC' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
  ],
  '8718503360003-08718503367248-528': [
    { fieldType: 'DietTypeCode', code: 'FREE_FROM_GLUTEN' },
    { fieldType: 'DietTypeCode', code: 'ORGANIC' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'EU_ORGANIC_FARMING' },
  ],
  '8718774032890-08718774012021-528': [],
  '8718774032890-08718774017132-528': [],
  '8718774032890-08718774052188-528': [],
  '8718774032890-08718774053949-528': [],
  '8718774032890-08718774053956-528': [],
  '8718774032890-08718774053963-528': [],
  '8718774032890-08718774053970-528': [],
  '8718774032890-08718774054175-528': [],
  '8718774032890-08718774054212-528': [],
  '8718774032890-08718774054229-528': [],
  '8718774032890-08718774054533-528': [],
  '8718774032890-08718774054540-528': [],
  '8718774032890-08718774054557-528': [],
  '8718774032890-08718774054748-528': [],
  '8718774032890-08718774054755-528': [],
  '8718774032890-08718774055578-528': [],
  '8718774032890-08718774055592-528': [],
  '8718774032890-08718774055806-528': [],
  '8718774032890-08718774055813-528': [],
  '8718774032890-08718774055820-528': [],
  '8718781030001-00000096202272-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CRUELTY_FREE_PETA' },
  ],
  '8718781030001-05060152827790-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CRUELTY_FREE_PETA' },
  ],
  '8718781030001-05060152828865-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CRUELTY_FREE_PETA' },
  ],
  '8718858450008-08718858450336-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'ON_THE_WAY_TO_PLANETPROOF' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SOCIETY_PLASTICS_INDUSTRY' },
  ],
  '8718885960075-08718885960532-528': [{ fieldType: 'DietTypeCode', code: 'HALAL' }],
  '8718885960075-08718885965308-528': [],
  '8718969140003-08718969141871-528': [],
  '8718969140003-08718969141895-528': [],
  '8718969140003-08718969141918-528': [],
  '8718969140003-08718969141932-528': [],
  '8718969140003-08718969141970-528': [],
  '8719189106985-08720254181059-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8719189106985-08720254181073-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8719189106985-08720254181080-528': [{ fieldType: 'DietTypeCode', code: 'VEGAN' }],
  '8719324134996-08717333988494-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
  ],
  '8719324134996-08719324134125-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'GREEN_DOT' },
    {
      fieldType: 'PackagingMarkedLabelAccreditationCode',
      code: 'PLASTIC_IN_PRODUCT_WIPES_SANITARY_PADS',
    },
  ],
  '8719324134996-08720674236193-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CONFORMITE_EUROPEENNE' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SEPARATE_COLLECTION' },
  ],
  '8719324134996-08720674236278-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SEPARATE_COLLECTION' },
  ],
  '8719324134996-08720674236315-528': [],
  '8719324134996-08720674236339-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'CONFORMITE_EUROPEENNE' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SEPARATE_COLLECTION' },
  ],
  '8719324134996-08720674236353-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
  ],
  '8719324134996-08720674236391-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'FOREST_STEWARDSHIP_COUNCIL_MIX' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'SEPARATE_COLLECTION' },
  ],
  '8719326061405-08721082421003-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8719326061405-08721082421584-528': [
    { fieldType: 'NutritionalScore', code: 'A' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8719326061405-08721082421638-528': [
    { fieldType: 'NutritionalScore', code: 'A' },
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
  '8719328024019-00000087332643-528': [],
  '8719328024019-08710871404686-528': [],
  '8719328024019-08718907972369-528': [],
  '8719333010274-08718546950018-528': [],
  '8719333037202-08710871188685-528': [],
  '8719333047874-08720589339002-528': [],
  '8719747060001-08710871402248-528': [{ fieldType: 'NutritionalScore', code: 'C' }],
  '8720256109006-08720256109020-528': [
    { fieldType: 'PackagingMarkedLabelAccreditationCode', code: 'RECYCLABLE_GENERAL_CLAIM' },
  ],
};
