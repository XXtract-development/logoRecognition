---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-06-03'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md (Epic 8 + 9)
  - _bmad-output/test-artifacts/atdd-checklist-epic-7.md (conventie-referentie)
  - _bmad-output/planning-artifacts/architecture.md
story_id: epic-8-9
tdd_phase: red
executionMode: sequential
---

# ATDD Checklist — Epic 8 (Trainingsdata uit Artwork) + Epic 9 (Automatische Retraining)

> **Status-update 2026-06-05:** Epic 8 is volledig OPGELEVERD (branch gemerged naar acc, 98af1d4; alle Epic 8-tests groen/ontskipt). Het Epic 9-deel blijft RED. Verouderd in dit document na Epic 8: `db_service.get_class_counts` bestaat inmiddels (story 8.7) en e2e Journey 4 (8.5) is ontskipt en gecorrigeerd naar route `/artwork-review`. Zie ook de adversarial review van het Epic 9-voorwerk: `_bmad-output/implementation-artifacts/review-epic-9-voorwerk.md` (15 bevindingen, te verwerken in de story-files 9.1-9.6).


**TDD-fase:** 🔴 RED — alle tests beschrijven verwacht gedrag en zijn geskipt tot de bijbehorende story geïmplementeerd is.

## Teststrategie (stap 3)

| Scenario | Story | Niveau | Prioriteit |
|----------|-------|--------|-----------|
| Import-run starten, per-item fouten, hash-cache | 8.1 | API | P0 |
| PDF-rasterization (per pagina, corrupt-PDF zacht falen) | 8.2 | Unit (ML) | P0 |
| Tiling met overlap + offsets, template-match-locatie, NMS over tegelgrenzen | 8.3 | Unit (ML) | P0 |
| Crop-classificatie (label+confidence, uncertain-markering) | 8.4 | Unit (ML) | P0 |
| Kruischeck: auto-accept bij match, beide discrepantie-routes, geen declaratie = geen auto-accept | 8.5 | API | P0 |
| Provenance-registratie + bulk-deactivatie per bronbestand | 8.6 | API | P0 |
| Synthese: label/bbox gratis, tekort-aanvulling, nooit holdout | 8.7 | Unit (ML) | P1 |
| Queue-defaults (retries/backoff), jobstatus + failedReason, service-auth | 9.1 | Unit (API-service) | P0 |
| Trigger met configureerbare drempels, notificatie met reden, dedup | 9.2 | Unit (API-service) | P0 |
| Flow-stappen, afgebroken training = retryable, venster + concurrency 1 | 9.3 | Unit (API-service) | P0 |
| Gate: pass/fail/verschillende-holdout-weigering | 9.4 | Unit (API-service) | P0 |
| Approval-queue met evaluatierapport, 403 voor service-accounts, activatie-logging | 9.5 | API | P0 |
| Jobs zichtbaar+herstartbaar, notificatie, goedkeuringsflow, review-herkomst | 9.1-9.5, 8.5 | E2E | P0/P1 |

**Bewust uitgesloten:** Story 9.6 (CI-smoke-test) — die story ís zelf een test-deliverable; ATDD ervoor zou circulair zijn.

## Gegenereerde testbestanden (RED)

| Bestand | Niveau | Tests | Dekt | Status |
|---------|--------|-------|------|--------|
| `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` | API (Vitest) | 11 | 8.1, 8.5, 8.6 | ✅ laadt, 11 skipped |
| `tests/test_artwork_processing.py` | Unit (pytest) | 11 | 8.2, 8.3, 8.4, 8.7 | ✅ py_compile OK |
| `apps/api/src/__tests__/services/training-pipeline-queue.test.ts` | Unit (Vitest) | 12 | 9.1, 9.2, 9.3, 9.4 | ✅ laadt, 12 skipped |
| `apps/api/src/__tests__/api/model-approval.routes.test.ts` | API (Vitest) | 4 | 9.5 | ✅ laadt, 4 skipped |
| `tests/e2e/pipeline-monitoring.spec.ts` | E2E (Playwright) | 6 | 9.1/9.2/9.5 + 8.5 | ✅ in test-list |

**Totaal: 44 acceptatietests** (P0: 40 · P1: 4)

> **Adversarial-review-update (2026-06-04):** 4 tests toegevoegd (8.1: 404-runId + 403-RBAC; 8.3: variance-guard wit-op-wit; 8.7: ratio-plafond-conflictresolutie), de 8.1-tests herschreven met arrange-fase (zelfstandig uitvoerbaar contract, dedup vóór fetch op mediaId), fixture-paden 8.2 gecorrigeerd + fixtures aangemaakt (`tests/fixtures/two-page-label.pdf`, `corrupt.pdf`), en de test-app mockt nu rol ADMIN (RBAC-contract). DoD per story: 8.1 = 5 tests · 8.3 = 4 · 8.7 = 3.

Verificatie (2026-06-03): `vitest run` → 25 skipped, 0 failed · `playwright --list` → 6 unieke tests · `py_compile` → OK. Pyright-meldingen over onbekende modules zijn verwacht (red phase — de modules zijn het te bouwen contract).

## Module-contract voor de developer (uit de tests)

**Node (apps/api/src/services/pipeline/):** `queue.ts` (createPipelineQueues, getJobStatus, isServiceRequest), `trigger.ts` (evaluateRetrainingTrigger, notifyRetrainingRecommended + dedup), `training-flow.ts` (buildTrainingFlow met stappen incorporate-feedback → build-batch → train-model → evaluate-model; checkTrainingStep; getTrainingJobOptions), `quality-gate.ts` (evaluateGate — weigert vergelijking bij ongelijke holdoutHash!)

**Node routes:** `api/v1/artwork-pipeline.ts` (artworkPipelineRoutes: import-runs, crosscheck, register-training-data, deactivate-by-source), uitbreiding `training.ts` (approval-queue, 403-guard op activate voor service-accounts + activatie-log)

**Python (apps/ml-service/app/services/):** `artwork.py` (rasterize_pdf), `localization.py` (tile_image, match_templates, merge_detections), `classification.py` (classify_crop), `synthesis.py` (compose_synthetic, build_synthetic_batch) + `db_service.get_class_counts`

**data-testid's (e2e):** pipeline-jobs-panel, pipeline-job-row, retraining-notification, approval-queue-page, evaluation-report, activate-model-button, review-item-provenance

## Definition of Done (green phase, per story)

- [ ] **8.1**: 3 API-tests groen · **8.2**: 2 pytest · **8.3**: 3 pytest · **8.4**: 2 pytest · **8.5**: 4 API + 1 e2e · **8.6**: 2 API · **8.7**: 2 pytest
- [ ] **9.1**: 3 service-tests + 2 e2e · **9.2**: 3 service-tests + 1 e2e · **9.3**: 3 service-tests · **9.4**: 3 service-tests · **9.5**: 4 API + 2 e2e
- [ ] Mock-data uitgebreid waar Prisma nieuwe modellen/velden krijgt (provenance, auditLog); bestaande mocks ongewijzigd
- [ ] NFR-borging in tests gerespecteerd: NFR2 (venster/concurrency, 9.3-test), NFR3 (synthese nooit holdout, 8.7-test), NFR5 (403 service-account, 9.5-test), NFR6 (service-key-auth, 9.1-test)

## Vervolg

- Epic 10-ATDD just-in-time zodra Epic 9 richting done gaat (monitoring/rollback bouwt op 9.5-activatielog)
- Story-files voor Epic 8/9 aanmaken via create-story zodra Epic 7 vordert (volgorde: 7 → 8/9 parallel)
