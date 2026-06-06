# Story 8.7: Synthetische trainingsdata-generatie

Status: done

## Story

As a datamanager,
I want dat het systeem synthetische trainingsvoorbeelden genereert door referentie-keurmerken op artwork-achtergronden te composeren,
so that er ook voor zeldzame keurmerken voldoende trainingsdata is, zonder annotatiewerk.

## Acceptance Criteria

1. **Composits met gratis labels (FR50):** Given de referentiebibliotheek en gecachete artwork-achtergronden, When de synthese draait voor een klasse, Then worden composits gegenereerd met random transformaties (schaal, rotatie, kleurvariatie, blur) op realistische posities And worden labels en bounding boxes automatisch vastgelegd met methode 'synthetic'.
2. **Tekort-aanvulling, nooit holdout (NFR3):** Given een klasse onder het configureerbare minimum aan echte voorbeelden, When de trainingsdataset wordt samengesteld, Then wordt het tekort aangevuld met synthetische voorbeelden tot een configureerbare ratio echt:synthetisch And komen synthetische voorbeelden nooit in de holdout-set.

## Tasks / Subtasks

- [x] Task 1: Python-module `apps/ml-service/app/services/synthesis.py` (AC: 1)
  - [x] **ATDD-contract (test_artwork_processing.py — exact):**
    - `compose_synthetic(background: np.ndarray, reference: {t3777_code, image}, seed=...) -> dict` → `{ "label", "method": "synthetic", "bbox": {x,y,width,height} }`; bbox valt VOLLEDIG binnen het achtergrondbeeld (test: 800×600-achtergrond)
    - `async build_synthetic_batch(min_per_class=20, real_synthetic_ratio=0.5) -> list[dict]` — vult klassen onder het minimum aan; alle aanvullingen method='synthetic'; **geen enkel item `holdout: True`**
    - Tests patchen `db_service.get_class_counts` → die functie toevoegen aan database.py: `SELECT label, COUNT(*) FROM training_data WHERE validated=true AND holdout=false AND active=true GROUP BY label`
  - [x] Transformaties (deterministisch via seed — np.random.RandomState(seed)): schaal 0.3–1.0× van de korte achtergrondzijde, rotatie ±10° (drukwerk staat vrijwel recht — research), HSV-jitter ±10%, gaussian blur 0–1.5px; alpha-compositing als referentie-PNG transparantie heeft
  - [x] Positionering: uniform random binnen marges zodat bbox volledig past (ATDD-grens); vermijd overlap met eerder geplakte marks bij multi-paste (later; nu één mark per composit)
- [x] Task 2: Persistentie + integratie (AC: 1, 2)
  - [x] Composit-PNG naar MinIO (`synthetic/{t3777Code}/{seed}.png`), registratie via het 8.6-endpoint met method='synthetic' (provenance.sourceFile = achtergrond-bestand) — hergebruik, geen tweede registratiepad
  - [ ] **DEFERRED → Epic 9 (story 9.3 build-batch-stap; besluit gebruiker 2026-06-04):** de hook zelf in het trainingspad ontbreekt nog — `build_synthetic_batch` is gebouwd en getest maar heeft geen productiecaller (trainer.py gebruikt get_training_images zonder aanvulling). Epic 9's formele trainingsflow (incorporate-feedback → build-batch → train-model) is de architectonisch juiste plek voor de wiring. Batch-samenstelling: hook in de batch-stap — tekort per klasse aanvullen richting `min_per_class`, begrensd door ratio `SYNTHETIC_RATIO` (default 0.5). **Conflictresolutie (vastgelegd, ATDD-test aanwezig): het ratio-plafond WINT van min_per_class** — kwaliteit boven kwantiteit. Klasse met 3 echte voorbeelden en ratio 0.5 krijgt max 3 synthetics (1:1), wordt dus NIET tot 20 opgepompt; het resterende tekort wordt expliciet gerapporteerd (`shortfall_reported` op batch-niveau + log) zodat de datamanager weet dat die klasse meer échte voorbeelden nodig heeft
  - [x] Endpoint `POST /ml/artwork/synthesize` body `{ t3777_code, count, seed? }` voor handmatige/agent-gestuurde aanvulling
- [x] Task 3: Holdout-bescherming (AC: 2)
  - [x] Dubbele borging: (a) registratie zet holdout=false (8.6-default), (b) de 8.6-guard in het holdout-PATCH-endpoint weigert synthetic-records — verifieer dat die guard er is (8.6 Task-lijst) of voeg hem hier toe als 8.6 hem miste
  - [x] Stratify-script (Epic 7): `WHERE provenance->>'method' IS DISTINCT FROM 'synthetic'`-uitsluiting toevoegen zodat een her-run nooit synthetics de holdout intrekt
- [x] Task 4: Tests groen
  - [x] `@pytest.mark.skip` weg: **3** synthese-tests (compose / tekort-aanvulling-nooit-holdout / **ratio-plafond-wint**); AsyncMock-patroon voor get_class_counts staat al in de tests

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Vereist 7.3 (referenties met transparante PNG's bij voorkeur) en 8.1 (achtergronden)**; compose_synthetic zelf is puur en direct testbaar
- **Determinisme is een feature:** seed in, zelfde composit uit — reproduceerbare datasets (PRD-eis modelreproduceerbaarheid). Geen `random`/`np.random` global state; alles via RandomState(seed)
- **Realisme boven volume (research/Adobe-patroon):** achtergronden = échte etiket-rasters uit 8.1/8.2 (zelfde domein als productie) — geen stockfoto's; start synthetisch, verfijn iteratief met echte data
- **Open input:** zonder referentie-PNG's (seed-map leeg) genereert dit niets — zelfde gate als 8.3 Task 3; code + tests kunnen volledig af
- **Trainer telt synthetics gewoon mee als trainingsdata** (holdout-evaluatie blijft 100% echt — dat is precies de bedoeling van NFR3)

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/ml-service/app/services/localization.py` (8.3) | np/OpenCV-conventies, referenties laden |
| 8.6-registratie-endpoint | persistentiepad (hergebruik!) |
| `apps/api/scripts/stratify-holdout.ts` (Epic 7) | uit te breiden met synthetic-uitsluiting |
| Research-addendum Route 1 + bronnen (Adobe, SCL) | synthese-rationale en parameters |

### References

- [Source: epics.md#Story 8.7] · [Source: atdd-checklist-epic-8-9.md — synthesis-contract] · [Source: research-addendum — synthetische datageneratie] · [Source: PRD-addendum NFR-A3]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (remediation pass — branch `story/8-7-remediation`, merged to `feature/epic-8-artwork-trainingsdata`).

### Completion Notes List

Eerdere "done"-status was een facade: `compose_synthetic` deed alleen schaal+plaatsing, `build_synthetic_batch` composeerde placeholder-nullen (laadde nooit echte referentie-PNG's), er was geen MinIO-opslag, geen `/synthesize`-endpoint en geen 8.6-registratie. Deze remediatie maakt elke AC/Task aantoonbaar af:

- **Echte composities (Task 1):** `compose_synthetic` (synthesis.py:182-282) laadt nu de echte referentie-RGBA, composeert met **alpha-compositing** op een echte achtergrond. `_load_references_by_class` + `_load_backgrounds` (synthesis.py:288-360) halen referentie-PNG's en gecachete artwork-achtergronden uit de TRAINING-bucket (prefixes `reference-logos/` en `artwork/`).
- **Determinisme-bug gefixt:** de oude code zaaide met Python's `hash()` (PYTHONHASHSEED-gesalt, niet reproduceerbaar across processes). Alle randomness loopt nu via `np.random.RandomState(seed)`; class-seed via `int.from_bytes(label…)` (synthesis.py:464). Test `test_compose_synthetic_is_deterministic_and_alters_background` bewijst byte-identieke output per seed.
- **Transformaties (Task 1):** schaal 0.30–1.0× korte zijde, rotatie ±10°, HSV-jitter ±10%, gaussian blur 0–1.5px — synthesis.py:88-180, 203-244.
- **bbox vs rotatie:** containment **by construction** — rotatiehoek eerst getrokken, dan schaal afgetopt op `short_side / (cos|θ|+sin|θ|)`; de bbox omsluit het GEROTEERDE (zichtbare) logo via `_tight_bbox_from_alpha`. De bestaande test (containment-assertie) bleef ongewijzigd groen; `test_compose_synthetic_bbox_fits_across_many_seeds_and_scales` test 40 seeds. **Geen testfout-correctie nodig** — de bestaande compose-test checkt containment (niet bbox-grootte) en blijft correct.
- **MinIO-opslag (Task 2):** `synthesize_for_class` schrijft elke composit naar `synthetic/{t3777Code}/{seed}.png` via `storage_service.put_training_image` (synthesis.py:402-409).
- **Registratie via het 8.6-pad (Task 2):** ml-service `POST /ml/artwork/synthesize` (artwork.py:387-475) retourneert crop-descriptors; apps/api `POST /artwork/synthesize` (artwork-pipeline.ts:1007-1095) registreert ze via `registerCropsTx` met method='synthetic'. **Eén registratiepad** — geen tweede DB-writer in Python (ml computes, apps/api persists; zelfde invariant als rasterize). `mlClient.synthesizeArtwork` (ml-client.ts:330-356).
- **Dubbele holdout-borging (Task 3):** (a) `registerCropsTx` zet `holdout: false`; (b) de 422-guard in PATCH `/training/data/:id/holdout` (training.ts:239-258) weigert synthetic-records — geverifieerd én vastgelegd met nieuwe test `should refuse to mark a synthetic record as holdout (422)`.
- **Stratify-script (Task 3):** synthetic-uitsluiting toegevoegd (stratify-holdout.ts). Bewust een **JS-filter** i.p.v. Prisma JSON-`not`, omdat Prisma's JSON-`not` rijen zónder `provenance.method` zou droppen (echte data mist die key vaak) — dat zou de holdout stilletjes verkleinen. `provenance?.method !== 'synthetic'` behoudt alle niet-synthetic records inclusief method-null.

### File List

- apps/ml-service/app/services/synthesis.py (herschreven: echte composities, RandomState-determinisme, alpha, rotatie-bbox, MinIO, batch)
- apps/ml-service/app/api/artwork.py (POST /ml/artwork/synthesize endpoint)
- apps/api/src/services/ml-client.ts (synthesizeArtwork + types)
- apps/api/src/api/v1/artwork-pipeline.ts (POST /artwork/synthesize → registerCropsTx 8.6-pad)
- apps/api/scripts/stratify-holdout.ts (synthetic-uitsluiting)
- apps/api/src/__tests__/setup.ts (mlClient.synthesizeArtwork mock)
- tests/test_artwork_processing.py (7 nieuwe pytest-tests: determinisme/alpha/bbox-fit/per-class-persist/batch-aanvulling-echt/open-gate/endpoint)
- apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts (3 synthesize-route-tests)
- apps/api/src/__tests__/api/holdout.routes.test.ts (synthetic-422-guard-test)

### Test Results

- pytest: 33 passed (26 basis + 7 nieuw) — `tests/test_artwork_processing.py tests/test_crop_classification.py`
- vitest (apps/api): 187 passed, 2 skipped, 0 failures (was 183/2; +4 nieuwe tests)

**Belangrijke nuance (`build_synthetic_batch`):** deze functie is het batch-plannings-entrypoint en heeft (bewust) geen productiecaller; alleen ATDD-tests roepen hem aan. Daarom is `persist` default **False** (compute-only) zodat een planning-call nooit weesachtige MinIO-PNG's schrijft die niemand registreert. De gewired generatie+persistentie+registratie loopt via `synthesize_for_class` → `POST /ml/artwork/synthesize` → apps/api 8.6-registratiepad. Test `test_build_synthetic_batch_generates_real_samples_for_shortage` raakt de echte generatie-tak (loaders gemockt) en bewijst dat een tekort daadwerkelijk met composit-descriptors wordt aangevuld (niet enkel een shortfall-entry).
