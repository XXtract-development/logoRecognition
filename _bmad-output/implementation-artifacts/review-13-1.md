# Adversarial self-review — Story 13.1 (Canonieke inhouds-hash-service)

Reviewed op branch `epic/vliegwiel-13`. Scope: `app/services/phash.py`,
`app/api/flywheel.py`, `main.py`-registratie, `requirements.txt`-pin,
`ml-client.ts::computePhash`, unit-tests.

## Bevindingen per severity

### Critical — 0
Geen.

### High — 0
Geen. (Gecontroleerd: geen tweede/Node-inhouds-hash; fail-closed foutpad; geen
migratie/schemawijziging conform afbakening.)

### Medium — 1 (gefixt)
- **M1 — Eager package-init blokkeert unit-import.** `app/services/__init__.py`
  importeert eager de hele service-keten (database→asyncpg, similarity→torch,
  trainer instantieert bij import en doet `mkdir /app/models`). Daardoor trok
  `from app.services import phash` de volledige runtime binnen. *Beslissing:* dit
  is een pre-existing structurele koppeling, NIET binnen de scope van 13.1 (geen
  refactor van bestaande package-init in een fundament-slice). Opgelost voor de
  testrun door de CI-conforme env-overrides (`MODEL_PATH` e.d. naar een
  schrijfbaar pad); torch wordt lazy geïmporteerd, dus het model_manager-pad
  laadt zonder torch. In echte CI (`pip install -r requirements.txt`, `/app`
  aanwezig) resolvet de keten sowieso. Genoteerd als aandachtspunt voor latere
  flywheel-stories (13.4/13.5 die dezelfde router uitbreiden).

### Low — 2 (gefixt)
- **L1 — Formaat-invariantie waarborg.** content_hash moet gelijk zijn voor
  PNG vs. BMP van dezelfde pixels. Getest en groen
  (`test_..._zelfde_pixels_ander_formaat_zelfde_content_hash`).
- **L2 — RGBA→RGB normalisatie.** Een opake RGBA-bron moet gelijk hashen aan zijn
  RGB-equivalent. Getest en groen (`test_..._rgba_bron_normaliseert_naar_rgb`).

## Checklist
- Alle AC geïmplementeerd? **Ja** (zie AC→test-mapping).
- Architectuur-patterns gevolgd? **Ja** — router-registratie exact als
  `main.py:138-143` (`prefix="/ml"`, tags `["Flywheel"]`); crop-laden via
  `storage_service.get_training_image` (zelfde route als artwork/similarity);
  `crop_path` takes precedence over `image_b64` (artwork-conventie); router dun
  (parsing + service-aanroep). Alle nieuwe Python-code onder `app/` (Constraint 2).
- Graceful degradation / fail-closed (AD-14)? **Ja** — storage-fout → HTTP 422,
  ongeldige b64 → 400, onleesbaar beeld → 422, geen bron → 422. Nooit een
  fallback-hash; `load_image_from_bytes` gooit `ValueError` i.p.v. een dummy-hash.
- Geen dode code / debug-prints? **Ja** — gescand op `print/TODO/FIXME/pdb/
  breakpoint`: geen treffers. Alle imports gebruikt.
- Geen secrets? **Ja** — geen credentials/tokens in de diff.
- Geen migratie? **Ja** — Prisma-schema ongemoeid; geen "alvast"-schemawijziging.
- Normalisatie als contract vastgelegd? **Ja** — `NORMALIZE_MODE/SIZE/RESAMPLE`
  + `PHASH_SIZE` als module-constantes met docstring die expliciet waarschuwt dat
  wijziging ALLE bestaande hashes invalideert. Pillow/ImageHash gepind.
- AC4 grep-sweep? **Ja** — de bestaande `sha256Hash` (bron-bestandsbytes, AD-12)
  is expliciet als ándere sleutel gedocumenteerd in de `computePhash`-docblock en
  de guard-test allowt hem.

## AC → test-mapping (C-trace)

| AC | Omschrijving | Dekkende test(s) |
|----|--------------|------------------|
| **AC1** | `/ml/phash` retourneert content_hash + phash in één response | `tests/unit/test_flywheel_phash_endpoint.py::test_13_1_ac1_endpoint_retourneert_content_hash_en_phash`; `::test_13_1_ac1_crop_path_laadt_via_storage_service` (crop_path uit MinIO-route) |
| **AC2** | Determinisme — zelfde crop → byte-identieke hashes | `tests/unit/test_phash_service.py::test_13_1_ac2_content_hash_is_deterministisch`; `::test_13_1_ac2_perceptual_hash_is_deterministisch`; `tests/unit/test_flywheel_phash_endpoint.py::test_13_1_ac2_endpoint_is_deterministisch` |
| **AC3** | `ImageHash==4.3.2` gepind + code onder `app/` (services/phash.py, api/flywheel.py prefix /ml) | `tests/unit/test_phash_service.py::test_13_1_ac3_imagehash_gepind_op_4_3_2`; `::test_13_1_ac3_nieuwe_code_staat_onder_app`; `::test_13_1_ac3_normalisatie_constantes_zijn_vastgelegd` |
| **AC4** | Geen Node-inhouds-hash; MLClient de enige route | `tests/unit/test_no_node_content_hash.py::test_13_1_ac4_geen_node_crop_content_hash_implementatie`; `::test_13_1_ac4_mlclient_computephash_delegeert_naar_ml_phash` |

Aanvullende dekking (testrichtlijnen story): normalisatie/formaat-invariantie,
RGBA→RGB, onderscheidend vermogen, foutpad (ValueError + HTTP 422/400) — allemaal
groen.

**AC-count: 4 / 4 gedekt.** Elk AC heeft minstens één dekkende, geautomatiseerde,
groene test.

## Testuitslag
`pytest tests/unit/ tests/test_flywheel_atdd.py` → **17 passed, 13 skipped, 0 failed**
(skips = ATDD-scaffold: 4 vervangen 13.1-stubs + 9 toekomstige-story-stubs).
