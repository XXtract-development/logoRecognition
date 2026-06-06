# Story 8.3: Keurmerk-lokalisatie op artwork

Status: ready-for-dev

## Story

As a datamanager,
I want dat het systeem keurmerk-kandidaten lokaliseert op artwork via template-matching en tiling,
so that ook kleine logo's op grote etiketbestanden gevonden worden zonder dat daar een getraind model voor nodig is.

## Acceptance Criteria

1. **Tiling + template-matching (FR46):** Given een gerasterized artworkbestand en de referentiebibliotheek (7.3), When de lokalisatie draait, Then wordt het bestand in overlappende tegels verwerkt (configureerbare grootte/overlap) And levert multi-scale template-matching kandidaat-regio's met bounding box en match-score And worden overlappende kandidaten over tegelgrenzen samengevoegd (non-max suppression).
2. **Baseline-meting:** Given de ~3.460 pilot-crops (logo_detection-collectie, prod-Mongo), When de lokalisatie gevalideerd wordt, Then is de recall op een **menselijk gevalideerde** steekproef gemeten en gerapporteerd. **Beslismoment (readiness-issue 4):** rapporteer aan de PO; recall ≥ 0,80 = doorgaan op template-matching; lager = detector-spoor (8.3b, aparte story). Geen harde gate in CI.

## Tasks / Subtasks

- [ ] Task 1: Python-module `apps/ml-service/app/services/localization.py` (AC: 1)
  - [ ] **ATDD-contract (test_artwork_processing.py — exact):**
    - `tile_image(image: np.ndarray, tile_size=640, overlap=0.2) -> list[dict]` — elk: `{ "image": ndarray ≤ tile_size, "x_offset": int, "y_offset": int }`; meerdere tegels bij 2000×3000-input
    - `match_templates(tile, templates: [{t3777_code, image}], min_score=0.8) -> list[dict]` — elk: `{ "t3777_code", "bbox": {x,y,width,height}, "score" }`; locatie-tolerantie ±5px (test plakt 100×100-blok op (100,150))
    - `merge_detections(detections, iou_threshold=0.5) -> list` — NMS, hoogste score wint, dedup over tegelgrenzen (offsets al teruggerekend naar bronbeeld-coördinaten vóór merge)
  - [ ] Implementatie: OpenCV `cv2.matchTemplate` (TM_CCOEFF_NORMED) multi-scale (template schalen 0.5×–2.0×, stappen 1.25); cv2 zit al in requirements (architecture: OpenCV ≥4.8)
  - [ ] **Variance-guard (verplicht, ATDD-test aanwezig):** TM_CCOEFF_NORMED geeft beruchte false positives op lage-variantie-regio's (wit-op-wit). Weiger matches wanneer de stddev van template óf kandidaat-regio onder `LOCALIZE_MIN_VARIANCE` (default 12) ligt — `test_template_matching_rejects_low_variance_regions` dwingt dit af
  - [ ] **Kalibratie-stap:** `min_score=0.8` is een startwaarde, geen waarheid. Zodra referentie-PNG's beschikbaar zijn: kalibreer per keurmerk-klasse op 10 echte artwork-voorbeelden (score-distributie loggen, drempel per klasse opslaan in ReferenceLogo-metadata of env-override). De synthetische tests bewijzen het mechanisme, niet de drempel — vermeld dit in het meetrapport van Task 3
  - [ ] Referenties laden uit de bibliotheek (7.3): MinIO-prefix `reference-logos/{t3777Code}/` via storage_service; alleen actieve varianten (DB-filter), PNG's; cache in-memory per proces
- [ ] Task 2: Endpoint + flow-integratie (AC: 1)
  - [ ] `POST /ml/artwork/localize` (app/api/artwork.py uit 8.2): body `{ storage_path, tile_size?, overlap?, min_score? }` → `{ detections: [{t3777_code, bbox, score}] }` — bronbeeld-coördinaten
  - [ ] Defaults via env: `LOCALIZE_TILE_SIZE=640`, `LOCALIZE_OVERLAP=0.2`, `LOCALIZE_MIN_SCORE=0.8`
- [ ] Task 3: Baseline-meting (AC: 2)
  - [ ] Script `apps/ml-service/scripts/measure_localization_recall.py`: leest een steekproef (n=100) uit `application.logo_detection` (prod-Mongo, ALLEEN-LEZEN), haalt de bronbestanden op, draait lokalisatie, rapporteert recall per klasse + totaal naar stdout/markdown
  - [ ] **Ground-truth-validatie (verplicht):** pilot-detecties zijn óngevalideerde machine-output (gem. confidence 0,72-0,95) — recall meten tegen machine-labels meet overeenstemming, geen correctheid. De steekproef van 100 wordt daarom éérst menselijk gevalideerd (crops + boxes visueel checken, fout-gelabelde items uitsluiten); pas de gevalideerde subset is ground truth
  - [ ] **Uitsluiten:** records met placeholder `file_id='xxxx'` (bronbestand onvindbaar — kwamen voor in de pilot-data) en records waarvan het bronbestand niet meer ophaalbaar is; rapporteer het uitvalspercentage
  - [ ] ⚠️ Vereist gevulde referentiebibliotheek voor de gemeten klassen — zonder PNG's geen meting; rapporteer expliciet welke klassen niet meetbaar waren
  - [ ] **Throughput-realisme:** log per bestand de verwerkingstijd (tiles × refs × schalen); extrapoleer in het meetrapport naar de 39k-voorraad zodat de PO een doorlooptijd-beeld heeft vóór de bulk-run gepland wordt
- [ ] Task 4: Tests groen
  - [ ] `@pytest.mark.skip` weg: **4** lokalisatie-tests (tiling/template-match/variance-guard/NMS) — puur synthetisch, geen externe deps

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Vereist 7.3 (referentiebibliotheek, done) en 8.2 (gerasterde beelden)** voor de echte flow; de drie ATDD-tests zijn synthetisch en kunnen direct groen
- **Domeinvoordeel (research):** artwork is vlak en onvervormd — template-matching is hier ongewoon betrouwbaar; rotatie hoeft NIET ondersteund (drukwerk staat recht), alleen schaal
- **Coördinaten-discipline:** match in tegel-ruimte + offsets → ALTIJD terugrekenen naar bronbeeld vóór NMS en vóór opslag; de ATDD-NMS-test voedt al bronbeeld-coördinaten
- **Performance:** templates één keer per run laden/schalen, niet per tegel; grijswaarden-matching is 3× sneller en voor logo's voldoende als eerste pass (kleur-verificatie kan in 8.4)
- **Open input (geen blocker voor de code):** top-20 referentie-PNG's nog niet aangeleverd (seed-map `apps/api/seeds/reference-logos/` is leeg) — Task 1/2/4 kunnen af; Task 3 wacht op PNG's

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/ml-service/app/ml/detector.py` | OpenCV/np-conventies in deze codebase |
| `apps/api/src/api/v1/reference-logos.ts` + ReferenceLogo-model | waar de actieve varianten + storagePaths vandaan komen |
| Research-addendum "multi-logo artwork" | SAHI-tiling-rationale + bronnen |

### References

- [Source: epics.md#Story 8.3] · [Source: atdd-checklist-epic-8-9.md — localization-contract] · [Source: implementation-readiness-report issue 4 — beslismoment baseline] · [Source: research-addendum — SAHI + template-matching op drukwerk]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
