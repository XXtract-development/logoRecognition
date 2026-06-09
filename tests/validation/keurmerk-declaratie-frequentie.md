# Te detecteren logo's/keurmerken — scope, universe en declaratie-frequentie

Bepaald vanuit de productdata (prod MongoDB `application.tradeItems`) van de leveranciers waarvan we
PACKAGING_ARTWORK-etiketten hebben (131 GLN's, prod `xxtractdbmedia.media`). Datum 2026-06-09.

## 1. De te detecteren types komen uit 6 GS1-velden

| GS1-veld (gdsn) | Codelijst (xlsx) | # codes in lijst | Op artwork-producten vastgelegd? |
|---|---|---|---|
| `packagingMarkedLabelAccreditationCode` (T3777) | PackagingMarkedLabelAccreditationCode | **894** | ja, dominant |
| `dietTypeCode` (+ `isDietTypeMarkedOnPackage`) | DietTypeCode | 34 | ja (vaak met "op verpakking"-vlag) |
| `nutritionalScore` / `nutritionalProgramCode` | NutritionalProgramCode | 10 | ja (Nutri-Score A–E) |
| `gHSSymbolDescriptionCode` | GHSSymbolDescriptionCode | 10 | ja (GHS-pictogrammen) |
| `gHSSignalWordsCode` | GHSSignalWordsCode | 4 | ja (DANGER/WARNING — tekst) |
| `enumerationValue` (logo-gebruik) | EU_consumerUsageLabelCodeList | 20 | n.t.b. (AISE-pictogrammen e.d.) |

Bron codelijsten: `benelux-fmcg-data-model-31353-nederlands.xlsx`, tabblad *Codelijsten*.

**Universe ≈ 970+ codes** (waarvan T3777 alleen al 894). Het systeem modelleert er nu **5**.

## 2. Relatieve frequentie per veld (5000-sample, niet-leeg)

`packagingMarkedLabelAccreditationCode` 1622 · `dietTypeCode` 457 (waarvan 371 *op verpakking*) ·
`nutritionalProgramCode`/`nutritionalScore` 186 · `gHSSymbolDescriptionCode` 115 · `gHSSignalWordsCode` 112.

→ T3777 is veruit het grootst; diettype + Nutri-Score + GHS vormen kleinere, goed afgebakende sets.

## 3. Top T3777-keurmerken op de artwork-producten (131 GLN's)

Van 143.962 tradeItems declareert **26.247 (18,2%)** ≥1 T3777-keurmerk. Top (declaratie-frequentie):

| # | Code | Decl. | Gemodelleerd? | | # | Code | Decl. | Gemodelleerd? |
|---|---|---|---|---|---|---|---|---|
| 1 | GREEN_DOT | 11169 | ✅ | | 16 | CERTIFIED_B_CORPORATION | 418 | ❌ |
| 2 | RECYCLABLE_GENERAL_CLAIM | 8643 | ❌ | | 17 | PREGNANCY_WARNING* | 401 | n.v.t. |
| 3 | TRIMAN | 3886 | ❌ | | 18 | RAINFOREST_ALLIANCE (oud) | 379 | ✅ |
| 4 | SOCIETY_PLASTICS_INDUSTRY | 2972 | ❌ | | 19 | VEGAN_SOCIETY_VEGAN_LOGO | 354 | ❌ |
| 5 | FOREST_STEWARDSHIP_COUNCIL_MIX | 2423 | ✅ | | 20 | CONFORMITE_EUROPEENNE (CE) | 307 | ❌ |
| 6 | EU_ORGANIC_FARMING | 1664 | ✅ | | 21 | ALUMINIUM_GDA | 303 | ❌ |
| 7 | BETER_LEVEN_1_STER | 988 | ❌ | | 22 | MARINE_STEWARDSHIP_COUNCIL (MSC) | 292 | ❌ |
| 8 | EUROPEAN_V_LABEL_VEGAN | 835 | ✅ | | 23 | FAIR_TRADE_MARK | 265 | ❌ |
| 9 | RAINFOREST_ALLIANCE_PEOPLE_NATURE (nieuw) | 752 | ❌ | | 24 | RETURNABLE_PET_BOTTLE_NL | 252 | ❌ |
| 10 | AISE_2020_COMPANY | 614 | ❌ | | 25 | HALAL_CORRECT | 246 | ❌ |
| 11 | SEPARATE_COLLECTION | 522 | ❌ | | 26 | CRUELTY_FREE_PETA | 240 | ❌ |
| 12 | ON_THE_WAY_TO_PLANETPROOF | 472 | ❌ | | 27 | EKO | 218 | ❌ |
| 13 | WEIDEMELK | 456 | ❌ | | 28 | PEFC_CERTIFIED | 202 | ❌ |
| 14 | FAIRTRADE_COCOA | 443 | ❌ | | 29 | OU_KOSHER | 188 | ❌ |
| 15 | EUROPEAN_V_LABEL_VEGETARIAN | 443 | ❌ | | 30 | BETER_LEVEN_2_STER | 184 | ❌ |

…lange staart (80+ codes): ASC, SVANEN, SOIL_ASSOCIATION, PDO/PGI, EU_ECO_LABEL, RSPO, UTZ, NATRUE,
CROSSED_GRAIN (glutenvrij), DOLPHIN_SAFE, NIX18, diverse KOSHER/HALAL-varianten, enz.
*PREGNANCY_WARNING/NIX18/SEPARATE_COLLECTION = pictogram/waarschuwing, geen keurmerk-logo.

## 4. Referentie-afbeeldingen: GS1 Packaging Label Guide

`nieuwe keurmerken.pdf` (GS1 Packaging Label Guide) koppelt **per exacte T3777-code een officieel
referentielogo-plaatje** + definitie + land/type/functie (bv. CLIMATE_ACTIVATOR, COSC, EKO_1/2/3,
GENEVA_SEAL, MOSA, NRW_CERTIFIED_QUALITY, OK_CONDOMS, ORIGIN_MARK_GERMANY, QM_MILCH_PLUS_PLUS,
QUALITE_FLEURIER, SUSTAINABLE_WINEGROWING_PORTUGAL, SWISS_MADE, VIPER_SEAL, WFCF_ORGANIC).
Dit is de **autoritaire bron** om de referentiebibliotheek mee te vullen — per code het juiste logo,
los van detectie/labeling.

## 5. Strategische consequentie

De huidige aanpak ("detecteer crops → mens labelt → referentie") schaalt niet naar ~900 codes.
Beter, met deze bronnen:
1. **Referentiebibliotheek seeden uit de officiële GS1-logo's** (Packaging Label Guide / GS1-codelijst),
   per exacte T3777-code (+ de andere 5 velden waar relevant).
2. **Prioriteren op declaratie-frequentie** op onze artwork-producten (sectie 3) — eerst de top ~20–30
   visuele keurmerken die we nog niet dekken.
3. **Valideren op echt artwork** met de gold-set-loop (detectie + menselijke check) per nieuw toegevoegd logo.
4. Niet-visuele/waarschuwings-codes (PREGNANCY_WARNING, NIX18, GHS-signaalwoorden) uitsluiten of apart behandelen.

**Kanttekening:** een declaratie zegt dát een product een keurmerk claimt, niet wáár het op het etiket staat,
en slechts ~18% declareert (bevestigd-FSC-product zónder FSC-declaratie gezien). Declaratie = prioriterings-
en ground-truth-signaal, niet de trainingsset zelf.
