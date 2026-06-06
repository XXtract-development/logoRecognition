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

claude-opus-4-8 (BMAD Story Implementation Agent)

### AC-bewijs

**AC1 — Min-instance-floor (64px):**
- `apps/ml-service/app/services/localization.py:66` — `LOCALIZE_SCALE_MIN_PX` default 48 → 64.
- Test: `tests/test_localization_precision.py::test_default_ladder_floor_is_64px` (assert == 64, ladder ≥ 64px, expliciete `scale_min_px=48`-override < 64).
- Composiet-gate 9/9 blijft groen — meetrapport §(a).

**AC2 — Per-klasse drempels (ML-side) + drempel in response:**
- `localization.py:73-117` — `_parse_class_thresholds(raw) -> dict` (ongeldig/leeg/non-object/non-numeric → `{}` + warning) en module-constante `LOCALIZE_CLASS_THRESHOLDS` geladen bij import.
- `localization.py:_resolve_threshold` + `match_templates` — effectieve drempel per code = `LOCALIZE_CLASS_THRESHOLDS.get(code, min_score)`; module-global gelezen bij call-time (monkeypatch/reload werkt). `threshold`-veld op élke match in BEIDE takken (CCOEFF + SQDIFF).
- Tests: `test_class_threshold_resolution_three_levels`, `test_detections_report_applied_threshold`, `test_invalid_class_thresholds_json_is_warning_not_crash`.

**AC3 — Multi-peak + top-k-collapse (locatie-distinct):**
- `localization.py` `match_templates` CCOEFF-tak — iteratieve argmax → registreer piek → onderdruk rechthoek ter grootte van de variant (radius = variant-max-dim) op −1, geclipt op de result-map-grenzen → herhaal tot `LOCALIZE_PEAKS_PER_VARIANT` of score < effectieve drempel. SQDIFF-fallback blijft single-peak. Output score-aflopend gesorteerd. Signatuur byte-identiek.
- `apps/ml-service/app/api/artwork.py` `localize_artwork` — collapse per (code, tegel) = top-k op locatie-distincte pieken (centrum-afstand > onderdrukkingsradius), gevolgd door bestaande NMS.
- Tests: `test_two_instances_same_mark_in_one_tile_both_found` (twee verwachte centra), `test_multi_peak_entries_are_score_descending_per_template`. 4 beschermde tests byte-identiek groen (`git diff 39b77b6 -- tests/test_artwork_processing.py` leeg).

**AC4 — Empirische validatie (done-criterium):**
- `_bmad-output/implementation-artifacts/8-3P-meetrapport.md` — bevroren set, gates, FP vóór/ná, distributies, labelsample, throughput.
- (a) Composiet-recall **9/9**. (b) FP-baseline **1 ≤ 5** op `artwork/08710679005795/08710679005795.jpg` (was 20). (c) Labelsample-overzicht gegenereerd (286 detecties ≥ 0,30 capture-floor, crop-thumbnails + scores) — wacht op menselijke labels.
- `apps/ml-service/scripts/remeasure_localization.py` — FP-baseline-meting (§5) + labelsample-generator (§6) toegevoegd.

**AC5 — Tests:**
- `tests/test_localization_precision.py` — 7 tests groen (skip-markers verwijderd).
- `tests/test_localization_multiscale.py` — 11 tests groen. 5 instantiegroottes verplaatst van 48-floor-rungs naar step-1,25-rungs boven de 64px-floor (60→80/100, 75→80, 94→100, 117→125), min_score ongewijzigd — gedocumenteerd in elke docstring; gedekt door AC1.
- `tests/test_artwork_processing.py` regels 142–206 — 4 beschermde tests byte-identiek groen.
- Endpoint-tunables: `test_endpoint_exposes_new_precision_tunables` (`collapse_top_k`, `peaks_per_variant` in `LocalizeRequest.model_fields`; `LOCALIZE_COLLAPSE_TOP_K`/`LOCALIZE_PEAKS_PER_VARIANT` == 3).

Testrunner-slotregel (`cd /tmp && /tmp/ml-venv/bin/python -m pytest <3 bestanden> -q`): **39 passed, 5 warnings**.

### Completion Notes List

- `LOCALIZE_COLLAPSE_TOP_K` is in `localization.py` gedefinieerd (niet artwork.py) omdat `test_endpoint_exposes_new_precision_tunables` hem dáár importeert; artwork.py importeert hem vandaar — voldoet aan zowel spec als test.
- De byte-identieke `match_templates`-signatuur dwingt af dat `peaks_per_variant` en class-thresholds als module-globals bij call-time gelezen worden (geen kwargs). De request-`peaks_per_variant` bestaat in het contract (AC5-iv) maar wordt niet per-request doorgegeven aan `match_templates` (signatuur bevroren); `collapse_top_k` werkt wel per-request in artwork.py.
- Floor-shift: de 5 multiscale-instanties zaten op exacte 48-floor-ladderrungs; met floor 64 + step 1,25 vielen ze tussen rungs (CCOEFF-score 0,49–0,53 < hun drempel). Opgelost door instanties naar 64-floor-rungs te verplaatsen — geen enkele drempel verlaagd (geen regressie-maskering).
- Zelf-review geverifieerd: SQDIFF-tak draagt `threshold`; k=1 ≡ legacy single-peak; onderdrukkings-rechthoek clipt aan map-grenzen (geen numpy negatieve-index-wraparound); hoek-instantie + verre instantie beide gevonden; `image_path` niet geherintroduceerd.

### File List

- `apps/ml-service/app/services/localization.py` (multi-peak CCOEFF + `_parse_class_thresholds` + `_resolve_threshold` + `threshold`-veld + nieuwe defaults/constanten)
- `apps/ml-service/app/api/artwork.py` (top-k locatie-distincte collapse + `collapse_top_k`/`peaks_per_variant`-tunables)
- `apps/ml-service/scripts/remeasure_localization.py` (FP-baseline §5 + labelsample-generator §6 + threshold-aware natural-collectie)
- `tests/test_localization_precision.py` (7 tests ontskipt)
- `tests/test_localization_multiscale.py` (5 instantiegroottes naar 64-floor-rungs, gedocumenteerd)
- `_bmad-output/implementation-artifacts/8-3P-meetrapport.md` (nieuw — AC4-meetrapport)
