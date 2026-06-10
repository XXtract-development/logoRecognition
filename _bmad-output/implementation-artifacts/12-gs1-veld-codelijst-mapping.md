# GS1-veld ↔ codelijst ↔ logo-mapping (welke categorieën zijn visueel herkenbaar?)

Datum 2026-06-10. Gecontroleerd tegen het **GS1-Benelux-datamodel** (`benelux-fmcg-data-model-
31353-nederlands.xlsx`, tab *Codelijsten*, **123 codelijsten**). Doel: per categorie bepalen of
**visuele herkenning** zinvol is (staat er een gestandaardiseerd logo op de verpakking?) en op welk
GS1-veld + `fieldType` het resultaat hoort te worden opgeslagen.

> **`reference_logos.fieldType` = de GS1-codelijstnaam (1:1 met GS1; migratie 0010/0011)** —
> `PackagingMarkedLabelAccreditationCode | NutritionalScore | DietTypeCode |
> GHSSymbolDescriptionCode | EU_consumerUsageLabelCodeList`. Daarnaast `gs1_field` = het
> GS1-declaratieveld (XML-element) voor de crosscheck. **Let op:** Nutri-Score A–E zit in
> codelijst `NutritionalScore` (waarden A–E), níét in `NutritionalProgramCode` (program-id 1–10).

## Herkenbaar (gestandaardiseerd logo/pictogram → zinvol om te detecteren)

| Codelijst (GS1) | #codes | `fieldType` | Logo? | In systeem | Voorbeelden |
|---|---:|---|---|---|---|
| **PackagingMarkedLabelAccreditationCode** (T3777) | 894 | `PackagingMarkedLabelAccreditationCode` | ✅ gestandaardiseerde keurmerk-logo's | ✅ geseed (top-N + free-from + halal) | GREEN_DOT, FSC, EU_ORGANIC, CROSSED_GRAIN (glutenvrij), HALAL_CORRECT, TRIMAN, BETER_LEVEN |
| **NutritionalScore** | 5 | `NutritionalScore` | ✅ Nutri-Score A–E (vaste vorm) | 🔄 synthetische bootstrap geseed | NUTRISCORE_A…E (codelijst-waarden A–E) |
| **GHSSymbolDescriptionCode** | 10 | `GHSSymbolDescriptionCode` | ✅ GHS-gevaarpictogrammen (ruit-symbolen) | ❌ nog niet | vlam, doodshoofd, corrosief |
| **EU_consumerUsageLabelCodeList** | 20 | `EU_consumerUsageLabelCodeList` | ✅ AISE-consumentenpictogrammen | ❌ nog niet | wasvoorschrift-achtige iconen |

## Deels herkenbaar (varieert / geen vaste mark)

| Codelijst | #codes | `fieldType` | Logo? | Opmerking |
|---|---:|---|---|---|
| **DietTypeCode** | 34 | `DietTypeCode` | ⚠️ deels — generieke/merk-iconen, géén vaste mark | LACTOSE_FREE, FREE_FROM_GLUTEN, VEGAN, VEGETARIAN, HALAL, KOSHER, ORGANIC, KETO… De *logo*-variant zit vaak in T3777 (bv. glutenvrij = CROSSED_GRAIN, halal = HALAL_CORRECT); de DietType is de **data-claim**. **Lactosevrij hééft geen T3777-logo** → alleen generiek icoon. |
| **PackagingRecyclingSchemeCode** | 39 | (recycling) | ⚠️ deels | overlapt met T3777 (Green Dot, Triman zitten in T3777) |
| **GHSSignalWordsCode** | 4 | (tekst) | ❌ tekst | DANGER / WARNING — tekst, geen pictogram |

## Niet visueel — data/claim/tekst (géén logo-herkenning)

Deze codelijsten zijn **declaratie-data**, geen marks op de verpakking → niet zinvol om te
"herkennen", wél relevant voor de **crosscheck** (vergelijken met wat herkend is):

- **ClaimTypeCode** (61) + **ClaimElementCode** (292) — "vrij van"-claims (FREE_FROM + LACTOSE/
  PEANUTS/…). Meestal **tekst** op de verpakking.
- **AllergenTypeCode** (276) — allergenen (ML = lactose, …). Data, geen logo.
- **NutrientTypeCode** (250), **OrganicClaimAgencyCode** (40), **SustainabilityProgramCode** (3),
  **NutritionalScoreProductCategoryCode** (5), **NutritionalProgramStatusCode** (3) — metadata.
- De overige ~110 codelijsten (OriginOfWineCode, MeasurementUnitCode, CountryCode, BatteryTypeCode,
  ADR/SEVESO, …) zijn **niet logo-gerelateerd**.

## Conclusies

1. **Visuele herkenning is zinvol voor 4 velden:** `PackagingMarkedLabelAccreditationCode` (T3777, kern — gedaan),
   `NutritionalScore` (Nutri-Score A–E — bootstrap), `GHSSymbolDescriptionCode` (gevaarpictogrammen — nieuw spoor),
   `EU_consumerUsageLabelCodeList` (AISE-pictogrammen — nieuw spoor). Elk = een **veld-spoor** (referenties seeden +
   declaratie-parser + crosscheck-routing op `fieldType`), zoals besproken.
2. **DietTypeCode (lactosevrij, vegan, keto…) is grotendeels data, geen vaste mark.** Waar wél een
   logo bestaat, zit dat meestal in **T3777** (glutenvrij, halal, kosher, organic). **Lactosevrij is
   de uitzondering: geen gestandaardiseerd logo** — alleen generieke free-from-iconen → herkenning is
   fuzzy en levert lage zekerheid. Beter via **data-declaratie** (`DietTypeCode=LACTOSE_FREE`) +
   eventueel een grove "free-from-icoon"-detector.
3. **Claims/allergenen = nooit logo-herkenning**, wél bruikbaar in de crosscheck.

## Opslag-consistentie (GS1)
Elk herkend resultaat hoort als **(GS1-veld via `fieldType`, codewaarde)** te worden opgeslagen.
T3777 doet dit al; de andere velden krijgen hun eigen declaratie-koppeling. Zo blijft alles binnen
het GS1-datamodel — ongeacht of de bron T3777, NUTRITIONAL, GHS of CONSUMER_USAGE is.

## Kanttekening over de bron
Gecontroleerd tegen het Benelux-datamodel-xlsx (de autoritaire GS1-Benelux-codelijst). De Mongo
`codes`-collectie kon ik niet direct queryen (ACC zonder connectiestring, prod time-out); die spiegelt
naar verwachting dit datamodel. 1-op-1-verificatie tegen de collectie kan zodra Mongo bereikbaar is.
