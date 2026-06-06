# Story 8.4: Crop-classificatie van gelokaliseerde regio's

Status: done

## Story

As a datamanager,
I want dat elke gelokaliseerde regio automatisch geclassificeerd wordt naar een keurmerk,
so that het systeem weet wélk keurmerk op welke plek staat.

## Acceptance Criteria

1. **Classificatie (FR47):** Given een kandidaat-regio uit de lokalisatie, When de classificatie draait, Then wordt de crop geclassificeerd via embedding-similarity tegen de referentiebibliotheek (pgvector) en, indien beschikbaar, de bestaande crop-classifier And levert dit een T3777-label met confidence-score op.
2. **Uncertain-markering:** Given een crop met confidence onder de drempel, Then wordt deze gemarkeerd als 'onzeker' (input voor de 8.5-routing).

## Tasks / Subtasks

- [x] Task 1: Python-module `apps/ml-service/app/services/classification.py` (AC: 1, 2)
  - [x] **ATDD-contract (test_artwork_processing.py — exact):**
    - `async classify_crop(crop: np.ndarray, confidence_threshold=...) -> dict` → `{ "t3777_code": str, "confidence": float ∈ [0,1], "method": "embedding"|"classifier", "uncertain": bool? }` — classification.py:220-276 (classify_crop); contract-resultaat samengesteld in _classify_via_embedding (classification.py:101-149) en _classify_via_classifier (classification.py:152-217)
    - Random-noise-crop met threshold 0.99 → `uncertain: True` — test_artwork_processing.py:228-237 (groen) + classification.py:241,260 (expliciete drempel wint, markeert uncertain)
  - [x] Embedding-route (primair): hergebruik de bestaande embedding-backbone (model_manager.generate_embedding, "ONNX detection + PyTorch embeddings"); pgvector cosine tegen referentie-embeddings (GEEN Python-vectorzoek); confidence = similarity beste match — classification.py:101-149; db_service.find_similar_references database.py:453-498
  - [x] Referentie-embeddings: bij opstart/refresh één embedding per actieve referentievariant in **eigen tabel `reference_embeddings`** (id, reference_logo_id FK→reference_logos, embedding vector(512), created_at) — Prisma migratie 0005 (apps/api/prisma/migrations/0005_add_reference_embeddings/migration.sql) + model schema.prisma:260-279; init.sql:90-106 (CREATE vóór de GRANT op alle tabellen, regel ~307); rebuild similarity.py:239-290; startup-wiring main.py:56-66
  - [x] Classifier-route (secundair, alleen indien actief model bestaat): actieve ONNX-classifier (get_active_model + labels uit config), build_eval_transform-preprocessing, softmax — classification.py:152-217; geen actief model ⇒ return None ⇒ alleen embedding-route, geen fout (classification.py:159-160)
- [x] Task 2: Endpoint + flow (AC: 1)
  - [x] `POST /ml/artwork/classify` body `{ storage_path | image_b64 | crops: [bbox...] }` → per crop het classify-resultaat — artwork.py:315-388 (classify_artwork), schema's 278-313; router al geregistreerd in main.py:102
  - [x] **Per-methode-drempels:** Envs `CLASSIFY_THRESHOLD_EMBEDDING` (default 0.75) en `CLASSIFY_THRESHOLD_CLASSIFIER` (default 0.85) — classification.py:58-63; resultaat draagt altijd `method` (classification.py:145,213); expliciete `confidence_threshold` overschrijft de per-methode-default (classification.py:239,241,260)
- [x] Task 3: Tests groen
  - [x] `@pytest.mark.skip` weg: de 2 classificatie-tests dragen GEEN skip-marker (test_artwork_processing.py:214-237) en zijn groen via de fail-closed echte route. Backbone gemockt in nieuwe tests (test_crop_classification.py) volgens het AsyncMock-patroon

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Vereist 7.3 (referenties) + 8.3 (crops)**; module zelf is met mocks testbaar zonder beide
- **Epic 7-learning #2 hergebruiken:** `get_training_images(include_holdout=True)`-les — embedding-/similarity-consumers mogen NOOIT holdout-gefilterd worden; de referentie-embeddings staan los van trainingsdata, dus hier geen holdout-interactie. Wel: similarity.py's `rebuild_embeddings` bestaat al — NIET dupliceren; voeg een `rebuild_reference_embeddings()` ernaast met hetzelfde patroon
- **Preprocessing:** gebruik `build_eval_transform()` uit trainer.py (Epic 7, gedeelde canonieke constanten) voor classifier-route-crops — zelfde 224×224+normalisatie als training, anders zijn classifier-confidences betekenisloos
- **uncertain is een markering, geen filter** — de crop gaat mét resultaat door naar 8.5; daar beslist de kruischeck de routing
- **pgvector-similarity bestaat al** (database.py find_similar_logos, init.sql similarity_search) — bouw daarop, geen eigen vectorzoek-implementatie

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/ml-service/app/services/similarity.py` | embedding-generatie + rebuild-patroon |
| `apps/ml-service/app/services/database.py:292-342` | store_embedding / find_similar_logos (pgvector) |
| `apps/ml-service/app/services/trainer.py` (kop) | build_eval_transform + canonieke constanten (Epic 7) |
| `apps/ml-service/app/ml/model_manager.py` | actieve-model-toegang voor classifier-route |

### References

- [Source: epics.md#Story 8.4] · [Source: atdd-checklist-epic-8-9.md — classification-contract] · [Source: architecture.md#ML Model Deployment] · [Source: Epic 7 code-review-fixes — include_holdout & gedeelde transforms]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (remediation agent) — bouwde de ECHTE primaire route die een eerdere implementatie alleen had gemockt.

### Completion Notes List

- **Primaire route nu echt gebouwd:** embedding-similarity tegen de referentiebibliotheek via pgvector (`db_service.find_similar_references`), géén Python-side vectorzoek meer. De vorige `_extract_simple_embedding` + `_cosine_similarity`-facade is volledig verwijderd.
- **Eigen tabel `reference_embeddings`** toegevoegd in beide schema-paden: Prisma-migratie 0005 + `ReferenceEmbedding`-model én `init.sql` (CREATE vóór de blanket-GRANT zodat de privileges meedekken). Bewust NIET in `logo_embeddings` (model_id NOT NULL + zou find_similar_logos vervuilen).
- **`rebuild_reference_embeddings`** naast het bestaande `rebuild_embeddings` (niet gedupliceerd): één embedding per actieve referentievariant, tabel eerst geleegd (idempotent), gewired in de startup-lifespan. Géén holdout-filtering (referentie-embeddings staan los van de train/holdout-split).
- **Classifier-route secundair en optioneel:** alleen wanneer er een actief model bestaat (ONNX uit storage + labels uit `model_versions.config`), met `build_eval_transform` (gedeelde canonieke 224×224+normalisatie) en softmax. Geen actief model = stil overslaan, geen fout.
- **Per-methode-drempels** (`CLASSIFY_THRESHOLD_EMBEDDING` 0.75, `CLASSIFY_THRESHOLD_CLASSIFIER` 0.85); resultaat draagt altijd `method`. Expliciete `confidence_threshold` overschrijft de default (test 0.99 → uncertain). Confidence geklemd in [0,1].
- **Fail-closed:** elke DB-/model-/backbone-fout ⇒ `UNKNOWN / 0.0 / method="embedding" / uncertain=True`. Nooit een verzonnen T3777-label.
- **`get_reference_embeddings`** behouden als diagnostiek/inspectie-accessor (niet de hot path; gedocumenteerd in de docstring).
- **Tests:** pytest `tests/test_artwork_processing.py` 14/14 groen (de 2 classificatie-tests dragen geen skip-marker en draaien via de echte fail-closed route). 12 nieuwe tests in `tests/test_crop_classification.py` testen de ECHTE functies (find_similar_references query-vorm + threshold + clamp, get_reference_embeddings parsing, rebuild één-per-actieve-variant, classify_crop routing/thresholds/fail-closed, endpoint per-crop dispatch). Vitest apps/api: 175 passed, 0 failures. Pillow toegevoegd aan de venv (zat al in requirements.txt) zodat de echte PIL-route draait.
- **Classifier-happy-path (ONNX-load → softmax → label-map) is per inspectie gevalideerd, niet door een draaiende CI-test:** torch/onnxruntime ontbreken in CI, en de echte ONNX-inferentie + `isinstance(tensor, torch.Tensor)` werkt alleen met echte torch. De classifier-tests dekken de routing-contracten (geen actief model ⇒ stil overslaan; embedding wint bij confidence). De inferentie-tak zelf draait pas runtime met een geactiveerd model.
- **Startup-rebuild kanttekening:** `rebuild_reference_embeddings` leegt de tabel vóór de herbouw. Een transiënte MinIO/backbone-hapering bij boot kan de index leeg achterlaten tot de volgende schone herstart (alle crops vallen dan fail-closed naar UNKNOWN). Binnen scope acceptabel ("bij opstart/refresh"); een build-then-swap zou veiliger zijn — genoteerd als mogelijke vervolgverbetering.
- **Bekend (buiten scope):** `tests/test_holdout_trainer.py` (6) en `tests/test_sprint01_a_plus_plus.py` (8) faalden al vóór deze story (echte-DB-afhankelijkheid resp. cwd-/path-asserties); beide pre-existing, geen regressie, ongewijzigd gelaten.
- **versions.md / Zoho / sprint-status:** bewust niet aangeraakt — de remediatie-opdracht sluit deze ceremonie expliciet uit.

### File List

- apps/ml-service/app/services/classification.py (herschreven)
- apps/ml-service/app/services/database.py (reference-embedding-operaties + `_parse_pgvector`)
- apps/ml-service/app/services/similarity.py (`rebuild_reference_embeddings`)
- apps/ml-service/app/api/artwork.py (`POST /ml/artwork/classify`)
- apps/ml-service/app/main.py (startup-rebuild van de referentie-embedding-index)
- apps/api/prisma/schema.prisma (`ReferenceEmbedding`-model + relatie)
- apps/api/prisma/migrations/0005_add_reference_embeddings/migration.sql (nieuw)
- infrastructure/docker/postgres/init.sql (`reference_embeddings`-tabel + indexen)
- tests/test_crop_classification.py (nieuw, 12 tests)
