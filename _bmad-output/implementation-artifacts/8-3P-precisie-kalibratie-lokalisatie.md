# Story 8-3P: Precisie-kalibratie lokalisatie (FP-reductie op echt artwork)

Status: ready-for-dev (adversarial review verwerkt — zie `review-8-3POD-voorwerk.md`, bevindingen P1–P5/S1)

## Story

As a datamanager,
I want dat de keurmerk-lokalisatie op echt artwork vrijwel alleen échte keurmerken meldt,
so that de review-queue bruikbaar blijft en bulk-detectie over de 39k-voorraad verantwoord wordt.

## Waarom (bewijs uit 8-3R-meetrapport, 2026-06-06)

- De 8-3R-engine herstelde de **recall** (gate 9/9, eerste signaal op echt artwork), maar de **precisie is niet productierijp**: op één Theunisse-artwork blijven bij drempel 0,55 twintig RAINFOREST-detecties over (≥19 FP's), vrijwel allemaal op de kleinste ladder-schaal (48×35…77×57 px).
- Oorzaak gemeten: 48px-varianten bevatten te weinig detail en correleren op groene textuur. Det valide composiet-plants scoren 0,55–0,87; de FP-staart reikt tot ~0,68 — één globale drempel kan dit niet scheiden.
- Reeds besloten kalibratie-output (8-3R): `LOCALIZE_SCALE_STEP=1.10` als default.

## Ontwerpbeslissingen (te bevriezen ná adversarial review)

1. **Minimum-instantiegrootte (P3-fix):** GÉÉN nieuwe env-var — de bestaande `LOCALIZE_SCALE_MIN_PX` gaat als kalibratie-parameter van default 48 → **64** (één bron van waarheid; expliciete lagere request-waarden blijven mogelijk voor tests/metingen). Rationale: de FP-fabriek zit onder 64px; echte ACC-instanties zijn ~110px. De hermeting valideert de waarde.
2. **Per-klasse drempels — UITSLUITEND ML-side env-map (P1/S1-fix):** `LOCALIZE_CLASS_THRESHOLDS` (JSON, bv. `{"RAINFOREST_ALLIANCE":0.65}`), geresolved ín de ML-service: per-klasse waarde → request-`min_score` → env `LOCALIZE_MIN_SCORE`. Géén ReferenceLogo-veld (bestaat niet; zou migratie vergen), géén body-map (overleeft 8-3O's ML-side template-loading niet). De localize-response vermeldt per detectie de toegepaste drempel. UI-/DB-beheer van drempels = later, apart besluit.
3. **Echte multi-peak-extractie (P2-fix):** per variant-resultaatmap worden tot `LOCALIZE_PEAKS_PER_VARIANT` (default **3**) lokale maxima ≥ drempel geëxtraheerd met een onderdrukkingsradius van de variant-max-dim rond elke piek (geen minMaxLoc-single-peak meer in de CCOEFF-tak; de degenerate-SQDIFF-fallback blijft single-peak). De collapse per (t3777_code, tegel) wordt top-k op LOCATIE-DISTINCTE pieken (default k=3, `LOCALIZE_COLLAPSE_TOP_K`), gevolgd door bestaande NMS. `match_templates`-signatuur blijft byte-identiek (retourneert al een lijst; extra peaks = extra entries, score-aflopend — de 4 beschermde tests blijven geldig).
4. **Herkalibratie is het done-criterium** (zelfde discipline als 8-3R AC4): hermeting op ACC via `remeasure_localization.py` (uitgebreid), mét een menselijk gelabeld natuurlijk sample. Traceerbaarheid (P5): top-k/multi-peak was in 8-3R als 8.3O-kandidaat gemarkeerd en is bewust naar deze precisie-story getrokken.

## Acceptance Criteria

1. **Min-instance-floor:** Given de ladder-generatie met default-instellingen, When `LOCALIZE_SCALE_MIN_PX=64` (nieuwe default) actief is, Then worden geen varianten < 64px max-dim gegenereerd And blijft een expliciete lagere request-waarde werken (tests/metingen) And blijft de composiet-gate (9/9, instanties ≥110px) groen.
2. **Per-klasse drempels (ML-side):** Given `LOCALIZE_CLASS_THRESHOLDS={"X":0.65}` als env, When de localize-flow draait, Then geldt 0,65 voor code X en de bestaande resolutie voor andere codes And vermeldt elke detectie de toegepaste drempel in de response And is ongeldig JSON in de env een opstart-warning + leeg-map-gedrag (geen crash).
3. **Multi-peak + top-k-collapse (locatie-distinct):** Given twee instanties van hetzelfde keurmerk in ÉÉN tegel, When de flow draait met k≥2, Then overleven beide als detecties met aantoonbaar verschillende centra (afstand > onderdrukkingsradius; de test asserteert de twee verwachte posities, niet alleen count≥2) And dedupliceert NMS zoals bestaand And blijven de 4 beschermde tests byte-identiek groen.
4. **Empirische validatie (done-criterium):** Given de gefixte engine, When de hermeting draait op ACC (read-only), Then:
   - (a) composiet-gate blijft **9/9**;
   - (b) **FP-baseline gepind (P4-fix):** op `artwork/08710679005795/08710679005795.jpg` (het 8-3R-referentie-artwork, GTIN 08710679005795) ≤ **5** detecties — gemeten met een VOORAF bevroren instellingenset (floor/drempels/k worden vóór deze meting vastgelegd in het rapport; daarna niet meer bijgesteld zonder her-run van a+b);
   - (c) **gelabeld natuurlijk sample:** het script genereert een compact label-overzicht (crops + scores) van alle overgebleven detecties op de 11 ACC-artworks; een menselijke beoordelaar labelt echt/vals; precision (en recall waar beoordeelbaar) in het rapport. Beslismoment PO: precisie voldoende voor 8-3O-bulk → doorgaan; anders volgende kalibratie-iteratie.
   - Rapport: `8-3P-meetrapport.md` + reproduceerbaar script; onafhankelijk geverifieerd.
5. **Tests:** bestaande 32 lokalisatie-gerelateerde tests blijven groen (4 beschermde byte-identiek); nieuwe tests: (i) floor filtert varianten, (ii) per-klasse drempelresolutie (3 niveaus), (iii) top-k laat dubbele instantie door, (iv) endpoint-doorgifte nieuwe tunables.

## Expliciet buiten scope

- Server-side orkestratie → 8-3O · declaratie-bron → 8-3D · HNSW/detector-spoor (8.3b uit origineel) → later beslismoment

## Dev Notes

- Wijzigingen beperkt tot `localization.py` (multi-peak-extractie + class-thresholds-resolutie + nieuwe defaults), `artwork.py` (top-k-collapse + drempel-in-response), `remeasure_localization.py` (FP-baseline + labelsample-generator). Geen DB, geen migraties, geen Node-wijzigingen.
- Multi-peak: extraheer pieken uit de CCOEFF-map met iteratieve max + onderdrukking (rechthoek ter grootte van de variant rond elke piek op −∞); stop bij k pieken of score < drempel
- Labelsample-flow (AC4c): script genereert een markdown/HTML-overzicht met crops; Friso's oordeel komt terug als simpele lijst — geen UI-werk in deze story

### Referenties

- `8-3R-meetrapport.md` (FP-kwantificatie §4, kalibratie §3) · `8-3R`-story (ontwerpbeslissingen + bekende beperkingen) · `apps/ml-service/app/services/localization.py` · `apps/ml-service/scripts/remeasure_localization.py`

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
