# Investigation — RGBA gold-set-crop breekt regression-eval (vliegwiel-promotie geblokkeerd)

**Datum:** 2026-07-21 · **Status:** afgerond, fixrichting bepaald → BMAD-story · **Ernst:** hoog (vliegwiel promoveert niets) · **Type:** ml-service embedding-robustheid + data
**Aanleiding:** direct ná deploy van story 13.7 (uuid=text-fix) bleek batch `12e27fbc` niet gepromoveerd maar **fail-closed gequarantaineerd** op een systeem-fout. Read-only gediagnosticeerd op ACC (`ssh vanilla`, containers `app-`/`ml-service-qsookwow8koko0kwg00g0cwk-*`).

## Symptoom (exact)

`gate_results.regression` van batch `12e27fbc`:
```
outcome: error   decision: quarantine   reason: systeem-fout
error: "Regression eval failed: Kon gold-set-crop niet embedden:
        artwork-crops/03059946164960/annot_7d6b6c2c-75b1-4d1b-ae01-6f33e7dd297f.png:
        The size of tensor a (4) must match the size of tensor b (3) at non-singleton dimension 0"
```
Job `flywheel-promotion` (id 572) zelf: `completed` (géén crash) — de uuid-fix werkt; de meting faalt op de embedding-stap.

## Root cause (bevestigd, code-niveau)

`apps/ml-service/app/ml/model_manager.py::generate_embedding` (rond r.156–190) doet:
```python
preprocess = transforms.Compose([
    transforms.Resize(256), transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),  # 3-kanaals
])
input_tensor = preprocess(image).unsqueeze(0)
```
`ToTensor()` op een **RGBA**-beeld levert een 4-kanaals tensor; `Normalize` met 3-waarden-mean/std eist 3 kanalen → *"tensor a (4) must match tensor b (3)"*. `generate_embedding` **converteert niet naar RGB** vóór preprocessing.

**Asymmetrie die de bug verklaart:** de directe endpoints doen de conversie zélf vóór de aanroep — `detection.py:205` en `similarity.py:273` (`if image.mode != "RGB": image.convert("RGB")`). De **regression-eval-gold-set-crop-inbedding** doet dat NIET: `flywheel.py:391-393` laadt via `phash_service.load_image_from_bytes(data)` (behoudt de originele mode) en roept meteen `generate_embedding(image)` aan. Dus RGBA-crops bereiken ongeconverteerd de preprocessing.

## Waarom nu pas zichtbaar

Vóór story 13.7 crashte de promotielus deterministisch al eerder (dedup/outlier, `uuid=text` 42883) — hij bereikte de regressiepoort nooit. Nu de guardrail-fasen doorlopen, komt de eval voor het eerst sinds 8 juli tot de gold-set-embedding, en daar staat de RGBA-crop.

## Scope / impact (gemeten, read-only op ACC)

Actieve gold-set (`replacedById IS NULL`): **462 records**. De regressie-eval gebruikt alléén crop-niveau (`getActiveGoldSet({cropOnly:true})` → `gold-set.ts:78` filtert `cropPath NOT NULL`); de 212 records met `cropPath = NULL` zijn **bedoelde GTIN-niveau declaratie-ankers** en doen NIET mee (geen bug). Payload = **250 crop-records**:

| Mode | Aantal | Herkomst |
|---|---|---|
| RGB | 235 | machine-crops (`12_12_NUTRISCORE…`, `17_1_bootstrap…`, `route_a_…`) |
| **RGBA** | **15** | **alle** menselijk-geannoteerde `annot_*.png` (review-UI-tekeningen; opgeslagen mét alfakanaal) |

De 15 RGBA-crops zijn de énige blokkade: elke eval faalt fail-closed (AD-11/NFR-2) op de eerste onembed-bare crop → **elke batch wordt gequarantaineerd → het vliegwiel promoveert niets**, deterministisch, tot dit is opgelost.

## Fixrichting (structureel, één plek — VIA BMAD-story, niet ad-hoc)

**Primair:** maak `generate_embedding` zelf RGB-veilig — `if image.mode != "RGB": image = image.convert("RGB")` bovenaan, vóór `preprocess`. Dat dekt **alle** aanroepers in één klap (regression-eval, `similarity.py:42/159/365`, `bootstrap_search.py`, `queue_harvest.py`, `detection.py`) en heft de hele foutklasse op i.p.v. per-caller een pleister (die callers nu deels wél, deels niet plakken). Sluit aan op het al bestaande defensieve patroon.

**Overwegingen voor de story:**
- **Geen crop-regeneratie nodig** om te deblokkeren: de fix maakt de 15 RGBA-crops embed-baar bij eval-tijd. (Optioneel apart: onderzoeken waaróm de review-UI RGBA opslaat en of dat upstream RGB moet worden — losse verbetering, niet blokkerend.)
- **Alfakanaal-semantiek:** `convert("RGB")` platslaat transparantie op zwart/wit afhankelijk van de bron; voor een keurmerk-crop is dat acceptabel (het logo zelf is het signaal). Bevestigen dat dit de similariteit niet materieel verschuift (spot-check).
- **Test (ATDD):** een pytest die `generate_embedding` op een synthetische RGBA-`PIL.Image` aanroept en een 512-vector zonder error verwacht (reproduceert de bug: pre-fix `RuntimeError` tensor 4≠3, post-fix groen). Dit gat bestond omdat geen test `generate_embedding` met een niet-RGB-beeld voedde.
- **Deblokkeren-nazorg:** de 5 resterende `in_batch`-kandidaten van batch `12e27fbc` zitten na de quarantaine in een **gesloten** batch; `runPromotionLoop` hervat alleen `pending`. Na de fix reprocessen ze niet vanzelf — de story/opvolging moet bepalen of ze her-genomineerd of de batch heropend moet worden (los van de embedding-fix).

## Evidence-locaties
- `apps/ml-service/app/ml/model_manager.py:156` (`generate_embedding`, ontbrekende RGB-cast)
- `apps/ml-service/app/api/flywheel.py:391-393` (ongeguarde gold-set-crop-embedding)
- `apps/ml-service/app/api/detection.py:205`, `app/services/similarity.py:273` (wél-geconverteerde aanroepers — het contrast)
- `apps/api/src/services/flywheel/gate.ts:314` + `gold-set.ts:78` (cropOnly-filter → 212 null-path anchors uitgesloten)
- ACC gate_results batch `12e27fbc`; mode-telling 462 records (235 RGB / 15 RGBA / 212 null-crop) via read-only PIL-check in de ml-container.
- Zie geheugen [[project_flywheel_rgba_goldset_blocker]], [[project_flywheel_two_findings_20260721]], [[project_embedding_rebuild_pitfall]].
