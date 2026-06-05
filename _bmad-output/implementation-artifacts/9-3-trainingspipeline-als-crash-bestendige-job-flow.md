# Story 9.3: Trainingspipeline als crash-bestendige job-flow

Status: ready-for-review

## Story

As a datamanager,
I want dat een volledige trainingsronde als automatische job-flow draait,
so that van feedback-incorporatie tot evaluatie geen enkele handmatige tussenstap meer nodig is.

## Acceptance Criteria

1. **Volledige flow (FR54):** Given een retraining-trigger (automatisch of handmatig gestart), When de flow draait, Then voert deze achtereenvolgens uit: incorporate-feedback → build-batch → train-model → evaluate-model And is elke stap afzonderlijk retryable zonder de hele flow te herhalen (BullMQ FlowProducer-graf).

2. **Crash-detectie (FR55, NFR1):** Given de ML-service crasht tijdens een training, When de flow de jobstatus controleert via `checkTrainingStep`, Then detecteert deze de afgebroken training (state=failed, retryable=true) And is de flow-state zelf nooit kwijt (persistente BullMQ-state in Redis).

3. **Trainingsvenster en concurrency (NFR2):** Given het geconfigureerde trainingsvenster, When een train-model-stap gepland wordt, Then levert `getTrainingJobOptions()` een concurrency=1 en een venster-object (minimaal `{ start, end }` in HH:MM-formaat, configureerbaar via env `TRAINING_WINDOW_START`/`TRAINING_WINDOW_END`), And draait er nooit meer dan één training tegelijk.

4. **Synthetische tekort-aanvulling gewired (8.7-batch-hook, deferred AC):** Given een build-batch-stap in de flow, When de batch wordt samengesteld, Then wordt `build_synthetic_batch` (uit `apps/ml-service/app/services/synthesis.py`, getest in 8.7) aangeroepen via REST naar de ML-service voor klassen onder het configureerbare minimum, En worden tekort-klassen aangevuld richting `min_per_class` begrensd door `SYNTHETIC_RATIO` (conflictresolutie: ratio-plafond wint, shortfall gerapporteerd op batch-niveau).

## Tasks / Subtasks

- [x] Task 1: Training-flow module `apps/api/src/services/pipeline/training-flow.ts` (AC: 1, 2, 3)
  - [x] **ATDD-contract (training-pipeline-queue.test.ts — exact, 3 tests):** alle drie groen (niet meer geskipt)
    - `buildTrainingFlow({ triggerId })` → flow-namen bevatten `['incorporate-feedback', 'build-batch', 'train-model', 'evaluate-model']`
    - `checkTrainingStep({ mlJobId, startedAt })` → `{ state: 'failed', retryable: true }` bij ontbrekende/gestorven ML-job
    - `getTrainingJobOptions()` → `{ concurrency: 1, window: defined }`
  - [x] `buildTrainingFlow`: BullMQ `FlowProducer`-graf — parent `evaluate-model` → child `train-model` → child `build-batch` → child `incorporate-feedback`; elke stap heeft eigen job-options (retries, backoff)
  - [x] `checkTrainingStep`: vraagt ML-service job-status op via `mlClient`; bij HTTP 404 of timeout > startedAt+drempel → `{ state: 'failed', retryable: true }`
  - [x] `getTrainingJobOptions`: leest `TRAINING_WINDOW_START` (default `22:00`) en `TRAINING_WINDOW_END` (default `06:00`) uit env; retourneert `{ concurrency: 1, window: { start, end } }` — formaat: 24-uurs `HH:MM`. **AC3-handhaving**: `concurrency` is een *Worker*-optie (niet job-optie) en wordt afgedwongen in `registerTrainingFlowWorker()` (workers.ts) + een `getActiveTrainingFlowJobId()` guard.

- [x] Task 2: build-batch-stap met synthetische tekort-aanvulling (AC: 4)
  - [x] Worker voor de `build-batch`-stap (`processBuildBatch`) roept `executeBuildBatchStep` → `mlClient.buildSyntheticBatch({ minPerClass, ratio })` aan
  - [x] `POST /ml/pipeline/build-synthetic-batch` op de ML-service — **nieuw** `apps/ml-service/app/api/pipeline.py`, geregistreerd in `main.py`; wrapper om bestaande `build_synthetic_batch` (compute-only, `persist=False`)
  - [x] ML-service levert `{ batches: [...], shortfall_reported: { klassenaam: n } }` terug (flat planner-output → gesplitst in batches vs shortfall-map); de batch-stap logt het shortfall-rapport op job-niveau
  - [x] Batch-samenstelling: het ratio-plafond wint van `min_per_class` (afgedwongen binnen `build_synthetic_batch`, getest in 8.7-pytest)

- [x] Task 3: Nieuwe ATDD-test voor de batch-hook (AC: 4)
  - [x] Batch-hook-test aanwezig in `training-pipeline-queue.test.ts` (Training flow describe, `executeBuildBatchStep` → `shortfall_reported`); aanvullend de echte worker-test in `training-flow-workers.test.ts`

- [x] Task 4: Incorporate-feedback stap (AC: 1)
  - [x] Worker voor `incorporate-feedback`-stap (`processIncorporateFeedback`) roept de gedeelde service-laag direct aan (`incorporatePendingFeedback`, geëxtraheerd uit de route — geen HTTP self-call)
  - [x] Bij failure: throw → BullMQ markeert de stap failed, parent stappen wachten op child completion (flow stopt bij deze stap)

- [x] Task 5: Handmatige start-route (AC: 1)
  - [x] `POST /api/v1/pipeline/training/start` (auth: JWT, `requireRole('ADMIN')`) → `submitTrainingFlow`; retourneert `{ flowId, jobIds }` (202)
  - [x] Idempotentie: 409 met de actieve jobId als er al een training-flow loopt (concurrency=1)

- [x] Task 6: Tests groen (alle ACs)
  - [x] De 3 bestaande flow-tests + de batch-hook-test in `training-pipeline-queue.test.ts` zijn groen
  - [x] 11 nieuwe worker-tests (`training-flow-workers.test.ts`) + 3 nieuwe pytest-cases (`test_pipeline_endpoint.py`)
  - [x] Geen e2e voor 9.3 (Journey 1 dekt pipeline-jobs-panel via 9.1)

## Dev Notes

### ⚠️ Epic 8-learnings (verplicht toepassen)

1. **Dubbele schema-bron:** elke datamodel-wijziging in ZOWEL Prisma-schema ALS `infrastructure/docker/postgres/init.sql` (+ GRANT).
2. **Deploy-realiteit:** Docker-build draait `prisma generate` + `tsc` — lokale gates missen dat zonder gegenereerde client.
3. **Monorepo-worktrees:** node_modules root + per-app symlinken.
4. **ML-service blijft REST:** BullMQ-flow roept ML via REST aan; geen directe Python-imports.
5. **8.7-batch-hook deferrral:** `build_synthetic_batch` bestaat en is getest (synthesis.py); de wiring in het trainingspad ontbrak bewust (besluit gebruiker 2026-06-04). Deze story maakt de wiring af. **Zie 8.7 Completion Notes** voor de `persist=False`-default (compute-only; de gewired generatie loopt via `synthesize_for_class` → `POST /ml/artwork/synthesize` → 8.6-registratiepad).

### Trainingsvenster-gedrag concreet

- Venster in HH:MM 24-uurs formaat: start `22:00`, end `06:00` (over middernacht).
- De BullMQ-job-scheduler controleert via de `getTrainingJobOptions().window` of een nieuwe `train-model`-stap gestart mag worden.
- Als een trainingsstap buiten het venster wordt aangevraagd: delayed job tot de volgende venster-start.
- Concurrency=1: als er al een `train-model`-job in staat active/waiting, wordt een nieuwe `build-batch`-stap niet verder gezet (concurrency-check in de flow-worker).

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/ml-service/app/services/synthesis.py` | `build_synthetic_batch` (bestaat, getest) — contract voor de REST-wrapper |
| `apps/api/src/services/ml-client.ts` | ML-client-patroon (axios, timeout, MLServiceError-equivalent) |
| `apps/api/src/api/v1/feedback.ts` | bestaand incorporate-endpoint |
| `apps/api/src/__tests__/services/` | service-test-opzet met vi.mock |

### References

- [Source: epics.md#Story 9.3] · [Source: atdd-checklist-epic-8-9.md — flow-contract] · [Source: review-epic-9-voorwerk.md bevinding #3, #12] · [Source: 8-7-synthetische-trainingsdata-generatie.md — DEFERRED-sectie] · [Source: PRD FR54, FR55, NFR-A1, NFR-A2]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (remediatie-agent, 2026-06-05) — afgemaakt nadat de epic-agent alleen flow-DEFINITIES had geschreven.

### Completion Notes List

De drie gaten (definities zonder uitvoering) gedicht:

1. **ML-endpoint `POST /ml/pipeline/build-synthetic-batch`** (`apps/ml-service/app/api/pipeline.py`, geregistreerd in `app/main.py`). Thin REST-wrapper om de bestaande `build_synthetic_batch`.
   - **Persistentie-keuze: compute-only (`persist=False`).** Dit volgt Dev Notes #5 en de orphan-PNG-waarschuwing in de synthesis.py-docstring: een plannings-call mag nooit weesPNG's schrijven die niets registreert. De wrapper berekent het ECHTE ratio-begrensde plan (getest in 8.7-pytest) — geen facade. De daadwerkelijke generatie + MinIO-persistentie + 8.6-registratie loopt buiten deze story via `synthesize_for_class` → `POST /ml/artwork/synthesize` → 8.6-pad.
   - De flat planner-output (crop-descriptors + shortfall-entries door elkaar) wordt gesplitst: `shortfall_reported: True`-entries → `shortfall_reported` map (label→residual), de rest → `batches`. Dat matcht het contract dat `mlClient.buildSyntheticBatch` verwacht.

2. **Vier step-workers** (`apps/api/src/services/pipeline/workers.ts`):
   - `processIncorporateFeedback` → gedeelde `incorporatePendingFeedback`-service (geëxtraheerd uit de route in `feedback-incorporation.ts`; route hergebruikt hem nu). Geen HTTP self-call.
   - `processBuildBatch` → `executeBuildBatchStep` → `mlClient.buildSyntheticBatch`. Synthetische fill is **niet-kritiek** (bewuste keuze): bij ML-falen logt de stap en levert een leeg plan zodat training op echte data doorgaat. De worker-test assert dit gedrag expliciet.
   - `processTrainModel` → `mlClient.startTraining` + `checkTrainingStep`-polling tot completed/failed. Een failed/afgebroken ML-job → **throw** zodat BullMQ de stap retried (AC2).
   - `processEvaluateModel` → leest de nieuwste niet-actieve `modelVersion` (de challenger die de ML-service zojuist registreerde met `metrics.holdout`), draait `evaluateGate` tegen de actieve champion. **Pass** → persisteert `metrics.gate` (+ behoudt `holdout` + `triggerReasons`) op de modelVersion zodat de 9.5 approval-queue (`metrics.gate.passed === true`) hem oppakt. **Fail** → `emitGateFailure` met vergelijkingscijfers (9.4 AC6).
   - `registerTrainingFlowWorker()` met **Worker-concurrency=1** (AC3 — BullMQ-concurrency is een Worker-optie, niet job-optie). Geregistreerd bij API-opstart in `main.ts`.
   - **Eén consumer op de 'training'-queue (kritieke fix):** BullMQ partitioneert consumers NIET per job-naam — elke job gaat naar precies één worker. Twee workers op dezelfde queue (de oude trigger-cron-worker + de nieuwe flow-worker) zouden elkaars jobs stilletjes no-oppen (een `train-model`-job opgepakt door de cron-worker → `return` → ACK zonder werk). Daarom is `registerRetrainingCronJob()` nu alléén het inplannen van de repeatable job; de verwerking loopt via `processTrainingJob`'s switch die `retraining-check` naar `runRetrainingCheck()` routeert. Eén queue, één worker, alle namen in één switch.

3. **Productiecallers**:
   - **Auto-start**: `autoStartTrainingFlow(trigger)` in `trigger.ts` start de flow bij `shouldRetrain`, gededupliceerd op dezelfde `triggerId` als de notificatie (Redis-key, overleeft restart) én overgeslagen als er al een flow actief is. Aangeroepen vanuit de bestaande retraining-check-worker.
   - **Handmatig**: `POST /api/v1/pipeline/training/start` gehard met `requireRole('ADMIN')` + 409-bij-actieve-flow (AC3-idempotentie). NB: de codebase kent geen aparte `DATA_MANAGER`-rol (enum = ADMIN/USER/VIEWER); ADMIN is het data-manager-equivalent, conform `POST /feedback/incorporate`.

**Tests**: api-vitest 238 passed / 2 skipped (was 225/2; +13 worker-tests). tsc schoon (na `prisma generate`). pytest (cleanly-runnable ML-service-pad in de kale venv): **gemeten** baseline op epic-HEAD = 33 passed (`test_artwork_processing.py` 21 + `test_crop_classification.py` 12); na deze story = 36 passed (+3 nieuw `test_pipeline_endpoint.py`). Andere pytest-bestanden (`test_holdout_trainer.py`, `test_batch_processing.py`, `test_security.py`, e.a.) collecten niet in de kale venv (vereisen `torch`/`redis`/`requests`/oud `backend/`-layout) — pre-existing, niet door deze story veroorzaakt of beïnvloed.

### File List

**Nieuw:**
- `apps/ml-service/app/api/pipeline.py`
- `apps/api/src/services/pipeline/workers.ts`
- `apps/api/src/services/pipeline/feedback-incorporation.ts`
- `apps/api/src/__tests__/services/training-flow-workers.test.ts`
- `tests/test_pipeline_endpoint.py`

**Gewijzigd:**
- `apps/ml-service/app/main.py` (router-registratie)
- `apps/api/src/services/pipeline/training-flow.ts` (`getActiveTrainingFlowJobId`, `triggerReasons`-passthrough, `TRAINING_STEP_NAMES`)
- `apps/api/src/services/pipeline/trigger.ts` (`autoStartTrainingFlow`, export `computeTriggerId`)
- `apps/api/src/api/v1/pipeline.ts` (RBAC + 409 op de manual-start route)
- `apps/api/src/api/v1/feedback.ts` (route hergebruikt gedeelde incorporate-service)
- `apps/api/src/main.ts` (registreert training-flow-worker bij opstart)
