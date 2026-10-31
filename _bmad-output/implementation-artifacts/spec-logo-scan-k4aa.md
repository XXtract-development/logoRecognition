---
title: 'Scanroute K4-aa (Gemini 3.8 Flash + SigLIP 2-poort), schakelbaar per omgeving'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '36220150fb73b4245d475fc50b02063d9e512d30'
context:
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/logo-k4aa/_bmad-output/specs/spec-logo-scan-k4aa/SPEC.md'
  - '/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/logo-k4aa/_bmad-output/specs/spec-logo-scan-k4aa/ontwerp.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De huidige logo-scan vindt ±12% van de top-15-keurmerken; de spike wees K4-aa (Gemini 3.8 Flash vindt en benoemt, SigLIP 2 top-3-poort) aan als beste opzet, maar die bestaat alleen als spikecode.

**Werkmap:** alle paden in deze spec zijn relatief aan de worktree `/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/logo-k4aa` (tak `feat/logo-scan-k4aa`); niets in de hoofdmap aanraken. Niet committen.

**Approach:** Nieuwe route naast de bestaande, gekozen met `LOGO_SCAN_ROUTE` (standaard `legacy`): het hele K4-aa-pad draait in de ml-service als nieuw strict-runtime-endpoint; de API kiest de route bij de aanvraag, mapt de detecties naar het ongewijzigde `logoResults.v1` en houdt hergebruik per route gescheiden. Het volledige contract staat in SPEC.md + ontwerp.md (context) — die gaan vóór deze samenvatting.

## Boundaries & Constraints

**Always:** K1a-instructie/schema/referentieblad/vensters byte-gelijk aan de spike; `provider {zdr:true, data_collection:"deny"}` op elke aanroep, falen zonder terugval; alleen de 7 keurmerken zonder `twijfelachtig`, nooit `automatisch`; route vastgelegd bij de aanvraag; SigLIP alleen lui en alleen beeldtoren; tolerant zonder nieuwe tabel; legacy-gedrag en legacy-`stap1` byte-gelijk.

**Never:** migratie toepassen, containers/Coolify aanraken, PR/merge; torch/transformers upgraden; `reference_embeddings` wissen of wijzigen; `getThresholdForMethod` aanpassen; klantbeelden in repo of tests; sleutel/beeld/prompt/antwoord loggen; GHS of codes buiten de top 15 in deze route.

## I/O & Edge-Case Matrix

Zie SPEC CAP-1…CAP-8 en ontwerp.md (foutklassen, budget, dekking); de ATDD-tests coderen elk geval.

</frozen-after-approval>

## Code Map

- `apps/api/src/services/pipeline/logo-scan-flow.ts` -- `submitLogoScan` (reuseKey r.157-163, `tracked`, `base`), `recognize`, `runLogoScanJob`, `failedState`, `getLogoScan` time-out-pad; `foutklasse` hergebruiken; `Stap1`-type uitbreiden (optionele velden, legacy ongemoeid).
- `apps/api/src/services/pipeline/gs1-block.ts` -- `buildLogoResults`: reden `route_k4aa_niet_gevalideerd` + lokale drempel 0 voor methode `k4aa`.
- `apps/api/src/services/score-kinds.ts` -- `k4aa: 'uncalibrated-embedding-gate'`.
- `apps/api/src/services/ml-client.ts` -- nieuwe `scanK4aa(request, {timeoutMs})` → `/ml/artwork/scan-k4aa`, zelfde `handleError`.
- `apps/api/src/services/zoekruimte.ts` (`beperkSoorten`), `apps/api/src/api/legacy-detect.ts` (`validBox`) -- hergebruiken.
- `apps/api/prisma/schema.prisma` + `apps/api/prisma/migrations/0023_add_reference_embeddings_siglip2/{migration.sql,down.sql}` -- nieuw model/tabel; niet toepassen.
- `apps/ml-service/app/services/k4aa.py` -- NIEUW: constanten uit `fb_k1.py`, vensters (`artwork_proposals.tile_windows`), aanroepen, parse, poort, samenvoegen, embedder, referentiematrix, sync.
- `apps/ml-service/app/assets/k4aa/referentieblad.png` -- byte-kopie van het spikeblad (`~/.cache/logo-k4aa/work/referentieblad.png`, sha256 d39f1905…).
- `apps/ml-service/app/api/artwork.py` -- endpoints `scan-k4aa` (met `strict_runtime_endpoint`, `strict_blocking`) en `k4aa/reference-embeddings/sync`.
- `apps/ml-service/app/services/database.py` -- `get_siglip_references(model)`, `upsert_siglip_embedding(...)`; vectorformaat zoals `store_reference_embedding` (`str(list)`) en `_parse_pgvector`.
- `apps/ml-service/app/services/storage.py` -- `get_training_image(path)` voor referentiebestanden.
- `apps/ml-service/app/symbol_contract.py` -- `normalize_code`.
- `apps/ml-service/Dockerfile` -- bouwstap SigLIP-beeldtoren naar `/opt/siglip2-vision`, `HF_HUB_OFFLINE=1`.
- `apps/ml-service/scripts/k4aa_vergelijk.py` -- NIEUW lokaal vergelijk- en geheugenscript (geen productiecode).
- `versions.md` -- regel bovenaan (Nederlands, eindgebruiker).
- Niet aanraken: `similarity.rebuild_reference_embeddings`, `main.py` lifespan, `artwork-crosscheck.ts`, `verify-flow.ts`, `logoResults.v1.json`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/ml-service/app/services/k4aa.py` + asset + `database.py` + `artwork.py` -- ml-pad volgens ontwerp.md -- CAP-2/3/5/7.
- [x] `apps/ml-service/Dockerfile` -- gewichten in image -- geen download tijdens scan.
- [x] `apps/api/prisma/*` -- model + migratie 0023 (+ down) -- CAP-7.
- [x] `apps/api/src/services/{ml-client,score-kinds}.ts`, `pipeline/{logo-scan-flow,gs1-block}.ts` -- schakelaar, mapping, hergebruik, stap1 -- CAP-1/4/6/8.
- [x] `apps/ml-service/scripts/k4aa_vergelijk.py` -- lokale vergelijking + geheugen -- CAP-8.
- [x] `versions.md` -- regel.

**Acceptance Criteria:**
- Given de ATDD-tests (`tests/test_k4aa_atdd.py`, `logo-scans-k4aa.atdd.test.ts`), when de bouw klaar is, then alles groen en de bestaande suites ongewijzigd groen.
- Given `LOGO_SCAN_ROUTE` ontbreekt, when een scan loopt, then is gedrag en `stap1` gelijk aan vóór de wijziging.
- Given lokaal 20 meetsetetiketten, when het vergelijkscript draait, then gelden de drempels uit SPEC CAP-8 en het geheugen blijft onder de norm uit SPEC Constraints.

## Implementation Notes

Route-poort (step-02), feiten zoals nu:
- **Intent gaps:** één — GHS/lange staart vallen weg in `k4aa`. Beslist door het contract van de opdrachtgever (alleen top-15 via K1a; schakelaar standaard `legacy`); de vraag of ACC hem al aanzet blijft bij de hoofdsessie, niet nodig voor de bouw.
- **Irreversibles:** databasemigratie 0023 (geschreven, niet toegepast); nieuwe uitgaande aanroepen naar OpenRouter (alleen als de schakelaar aan staat).
- **Footprint:** ±12 bestanden in 2 diensten, nieuw ml-endpoint en nieuwe tabel waar andere code van afhangt.
- **Route:** `dispatch`. Checkpoint 1: goedkeuring vooraf in de opdracht (orchestrator); geen open vragen.

Bouw en review (31-10-2026):
- Implementatie door één verse subagent; reviewlagen Blind Hunter, Edge Case Hunter en Verification Gap parallel op `/tmp/k4aa-review-diff-1.diff`; 31 bevindingen: 26 patch (doorgevoerd door dezelfde subagent), 2 defer (B5, VG8), 2 verworpen (B3 lage impact, B13 bouwspec), geen bad_spec/intent_gap → geen loopback.
- Na patches: ml-service 821 geslaagd / 14 overgeslagen; API 1641 geslaagd / 2 overgeslagen; ruff/black/isort, tsc schoon.
- VERIFIED ACC (31-10 09:44 UTC, `docker stats`, alleen gelezen): ml-service 6,57 GiB van 8 GiB, 3 werkerprocessen met RSS 1,52 / 2,70 / 2,29 GB. De lokale norm (verse werker 1152 MB × 4 = 4,5 GB) onderschat de werkelijkheid: SigLIP (+±0,5 GB per werker) past daar niet zonder meer bij. Route aanzetten op ACC vraagt eerst een keuze (minder werkers, hogere limiet of één aparte werker).

## Spec Change Log

## Review Triage Log

| # | laag | bevinding | oordeel | bewijs / route |
|---|---|---|---|---|
| B1 | blind | pogingstime-out vóór de semafoor berekend | medium | 2 strict-taken × 6 vensters = 12 aanroepen op 6 plaatsen; wachten telt niet mee → patch |
| B2 | blind | SIGLIP-reserve 20 s te krap bij 64 uitsneden | low | 64 × 0,3–0,9 s > 20 s; directe correctie (constante) → patch |
| B3 | blind | elke scan haalt alle vectoren op vóór de cachesleutel | low | ±540×768 tekst parsen per scan (~0,1 s); fix vraagt extra query → verworpen (lage impact, extra complexiteit) |
| B4 | blind | één onleesbaar referentiebestand blokkeert de route zonder naam | low | fail-closed is bedoeld; ontbrekende logregel met referentie-id → patch |
| B5 | blind | `referencePoolVersion` mist pad-/wisselwijzigingen | medium | bestaat al voor legacy (count:max(createdAt)); niet door deze wijziging veroorzaakt → defer |
| B6 | blind | `calls` telt vensters, geen pogingen | low | kosten tellen pogingen; `attempts` toevoegen → patch |
| B7+E1+E2+E3+VG-other | blind/edge/vg | `remaining()` gooit 504, strict_blocking-timeouts en andere uitzonderingen ontsnappen ongeclassificeerd of als `image_invalid`/`siglip_references_incomplete` | medium | `StrictRuntimeControl.remaining` (artwork.py:57) gooit HTTPException; `budget_exhausted` onbereikbaar → patch |
| B8+E11 | blind/edge | sync laadt SigLIP ook zonder werk; `ontbrekend_rest` mengt mislukt | low | directe correctie → patch |
| B9/B10 | blind | testgaten ml/API | low | samengevoegd met VG1–VG7, VG9 → patch |
| B11 | blind | Dockerfile controleert de bewaarde toren niet | low | 4.38.2 initialiseert ontbrekende sleutels willekeurig met alleen een waarschuwing → patch (vormcontrole in RUN) |
| B12 | blind | versions.md overdrijft (cijfers vóór adjudicatie, "nauwkeuriger") | medium | BESLISRAPPORT §8: 144/158 na adjudicatie, 7 voorlopig → patch |
| B13 | blind | absolute worktree-paden in de bouwspec | false-route | fix is deze bouwspec bewerken → verworpen (regel) |
| E4 | edge | lege `image_b64` → cv2.error 500 | low | `cv2.imdecode` op lege buffer gooit → patch |
| E5 | edge | `message` geen dict → AttributeError | low | directe correctie → patch |
| E6 | edge | httpx RequestError buiten TransportError | low | DecodingError is RequestError → patch |
| E7 | edge | afronding geeft uitsnede van 0 px | low | round(1.5)=round(2.5)=2; spike zou crashen → patch (lege top) |
| E8 | edge | EXIF-oriëntatie cv2 vs PIL | low | API stuurt sharp `.rotate().png()`, dus alleen directe ml-aanroepers; directe correctie → patch |
| E9 | edge | `stateFromRow` verliest de route | low | `findScan` levert `modelVersion`; route af te leiden uit `/k4aa@` → patch |
| E10 | edge | zonder LOGO_MODEL_VERSION geen `/k4aa` in logoResults | low | `effectiveModelVersion` geeft undefined → patch (alleen weergave, hergebruik blijft uit) |
| E12 | edge | `inline_embedded` bij cachetreffer | low | geeft oude waarde terug → patch |
| E13 | edge | legacy-modelVersion nu getrimd | low | vroeger ruwe env-waarde; legacy moet byte-gelijk → patch |
| VG1 | vg | route ontbreekt in stap1 bij andere K4-aa-fouten: ongetoetst | gap | patch (test) |
| VG2 | vg | methode/zekerheid-guard ongetoetst | gap | patch (test) |
| VG3 | vg | cacheverversing ongetoetst | gap | patch (test) |
| VG4 | vg | kosten over pogingen / null ongetoetst | gap | patch (test) |
| VG5 | vg | budgetlogica ongetoetst | gap | patch (test) |
| VG6 | vg | multi-venster fail-closed ongetoetst | gap | patch (test) |
| VG7 | vg | sync overslaan-en-tellen ongetoetst | gap | patch (test) |
| VG8 | vg | SQL alleen via mocks | gap | defer (integratietest vraagt TEST_DATABASE_URL) |
| VG9 | vg | lazy-laadtest raakt lifespan niet | gap | patch (test) |

## Verification

**Commands:**
- `cd apps/ml-service && ~/.cache/logo-k4aa/venv/bin/python -m pytest tests/ -q` -- groen (nieuwe + bestaande).
- `cd apps/ml-service && ruff check app/ && black --check app/ && isort --check-only app/` -- schoon (versies uit requirements.txt).
- `cd apps/api && npx vitest run` -- groen; `npx tsc --noEmit` -- schoon.
