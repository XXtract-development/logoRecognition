# Spike 19.1 — Dekkingsrapport keurmerken (2026-07-05)

Meting via de nu-live Route A (ACC-app → `catalog.stage.xxtract.com`), 5/5-veld-parser (replica van Story 19.2). Steekproef: **400 willekeurige artwork-GTINs** uit ACC `artwork_imports` (gln+gtin gevuld, hadden artwork) — een sample van de corpus, extrapoleerbaar, geen volledige census.

## Kerncijfers

| Metriek | Waarde |
|---|---|
| Steekproef (artwork-GTINs) | 400 |
| Declaratie beschikbaar (catalog HTTP 200) | 254 (**64%**) |
| Geen declaratie (500/404 = geen XML-bestand) | 146 (36%) |
| **Producten mét ≥1 keurmerk** | **163 (40%)** ← de dubbel-bevestigbare brandstof |
| Unieke keurmerkcodes in de steekproef | 58 |

## Per veld (aantal producten dat ≥1 code in dat veld declareert)

| GDSN-veld | # producten | Opmerking |
|---|---|---|
| PackagingMarkedLabelAccreditationCode | 124 | domineert (890 van 951 codes) |
| DietTypeCode | 53 | |
| **EU_consumerUsageLabelCodeList** | **27** | **nieuw veld (19.2)** — was onzichtbaar voor de oude 3-veld-parser |
| NutritionalScore | 19 | |
| AdditionalPackagingMarkingsCode | 0 | codes verlopen (zoals voorspeld) |

## Top-15 keurmerkcodes (aantal producten)

RECYCLABLE_GENERAL_CLAIM (40) · TRIMAN (40) · PREGNANCY_WARNING (25) · GREEN_DOT (21) · NutritionalScore/GENERAL_FOODS (18) · VEGETARIAN (17) · DO_NOT_DRINK_AND_DRIVE_WARNING (16) · FREE_FROM_GLUTEN (15) · VEGAN (15) · SOCIETY_PLASTICS_INDUSTRY (15) · NutritionalScore/E (12) · VEGAN_SOCIETY_VEGAN_LOGO (11) · FOREST_STEWARDSHIP_COUNCIL_MIX (11) · MINIMUM_DRINKING_AGE_18_WARNING (10) · EU_ORGANIC_FARMING (8)

(Volledige top-30: `scratchpad/cov-result.json`.)

## Conclusies (go/no-go-input voor 19.3/19.4)

1. **Brandstof is reëel:** ~40% van de artwork-producten draagt een gedeclareerd keurmerk → ruim voldoende om de bibliotheek te vullen. Op ~12.526 corpus-GTINs geëxtrapoleerd: grofweg ~5.000 dubbel-bevestigbare producten.
2. **Sterk scheef:** een kop (RECYCLABLE/TRIMAN/GREEN_DOT) domineert, met een lange staart. Dit **bevestigt de noodzaak van de gebalanceerde sampler (19.4)** — zonder balanceren zouden de gangbare merken de leerset overspoelen en zeldzame keurmerken leeg blijven.
3. **De 5/5-parser betaalt zich uit:** het nieuwe `EU_consumerUsageLabelCodeList`-veld levert 27/400 producten (NIX18/zwangerschap/verkeers-pictogrammen) die de oude parser miste.
4. **Declaratie-dekking is partieel:** 36% van de artwork-GTINs heeft géén catalog-XML → die vallen vanzelf buiten de dubbele bevestiging (by design, fail-safe).
5. **Universum-benutting:** 58 unieke codes in 400 producten; geëxtrapoleerd wellicht 100-200+ van de 951, met veel zeldzame accreditatiecodes nauwelijks of niet vertegenwoordigd — de sampler moet dus vooral de midden/staart beschermen.
