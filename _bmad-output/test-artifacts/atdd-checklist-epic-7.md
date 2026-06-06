---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-06-03'
inputDocuments:
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/research/technical-automatiseren-modeltraining-research-2026-06-03.md
  - apps/api/src/__tests__/api/feedback.routes.test.ts (conventie-referentie)
  - tests/e2e/models-page.spec.ts (conventie-referentie)
story_id: epic-7
tdd_phase: red
executionMode: sequential (fallback na subagent-verbindingsfout)
---

# ATDD Checklist — Epic 7: Betrouwbaar Evaluatiefundament

**TDD-fase:** 🔴 RED — alle tests beschrijven verwacht gedrag en zijn geskipt (`it.skip` / `test.skip` / `@pytest.mark.skip`) tot de bijbehorende story geïmplementeerd is.

## Stap 1 — Preflight

- Stack: **fullstack** (Fastify/Vitest API + React/Playwright e2e + FastAPI/pytest ML-service)
- Frameworks aanwezig: `playwright.config.ts` (root), Vitest (apps/api), pytest (tests/)
- Stories met heldere ACs: Epic 7 (7.1, 7.2, 7.3) uit `_bmad-output/planning-artifacts/epics.md`
- Kennisfragmenten: data-factories, test-quality, test-levels-framework, selector-resilience (tea-index core tier)

## Stap 2 — Generatiemodus

**AI-generatie** — ACs helder; features bestaan nog niet, dus browser-recording is per definitie niet mogelijk (red phase).

## Stap 3 — Teststrategie

| Scenario | Story | Niveau | Prioriteit |
|----------|-------|--------|-----------|
| Holdout markeren/demarkeren (persistente vlag) | 7.1 | API | P0 |
| Holdout-filter in lijst-endpoint | 7.1 | API | P0 |
| Training weigert bij lege/te kleine holdout-set (422) | 7.1 | API | P0 |
| Query-level uitsluiting in trainer (`get_training_images`) | 7.1 | Unit (ML) | P0 |
| Augmentatie raakt holdout nooit | 7.1 | Unit (ML) | P0 |
| Holdout-badge + uitsluiting in batch-picker | 7.1 | E2E | P0 |
| Holdout-metrics geregistreerd bij modelversie (incl. size/hash) | 7.2 | Unit (ML) | P0 |
| Stabiele holdout-hash (zelfde set ⇒ zelfde hash) | 7.2 | Unit (ML) | P0 |
| `GET /models/:id` bevat holdoutMetrics | 7.2 | API | P0 |
| Model-comparison bevat holdout-metrics per versie | 7.2 | API | P1 |
| Holdout-metrics zichtbaar op models-pagina + vergelijking | 7.2 | E2E | P1 |
| Referentie-upload (T3777-code, variant, bron) | 7.3 | API | P1 |
| Lijst per code incl. inactieve varianten (historie) | 7.3 | API | P1 |
| Deactiveren = soft delete | 7.3 | API | P1 |
| Formaat-/resolutievalidatie | 7.3 | API | P2 |
| Bibliotheek-UI: upload, overzicht, deactiveren, foutmelding | 7.3 | E2E | P1 |

Geen duplicaatdekking: API test contracten/logica, E2E test alleen de drie user journeys, ML-unit test de trainer-garanties die via de API niet bewijsbaar zijn.

## Stap 4 — Gegenereerde testbestanden (RED)

| Bestand | Niveau | Tests | Status |
|---------|--------|-------|--------|
| `apps/api/src/__tests__/api/holdout.routes.test.ts` | API (Vitest) | 8 | ✅ laadt, 8 skipped |
| `apps/api/src/__tests__/api/reference-logos.routes.test.ts` | API (Vitest) | 6 | ✅ laadt, 6 skipped |
| `tests/e2e/holdout-management.spec.ts` | E2E (Playwright) | 4 | ✅ in test-list |
| `tests/e2e/reference-library.spec.ts` | E2E (Playwright) | 4 | ✅ in test-list |
| `tests/test_holdout_trainer.py` | Unit (pytest) | 6 | ✅ py_compile OK |

**Totaal: 28 acceptatietests** (P0: 16 · P1: 10 · P2: 2)

Verificatie uitgevoerd (2026-06-03): `vitest run` → 14 skipped, 0 failed · `playwright --list` → 8 unieke tests herkend · `python3 -m py_compile` → OK. CI blijft groen tot de skips verwijderd worden — exact de bedoeling van deze red phase.

## data-testid-contract voor de developer

Vastgelegd in de spec-headers: `holdout-toggle`, `holdout-badge`, `batch-image-picker`, `holdout-metrics-panel`, `model-comparison-table`, `holdout-set-id`, `reference-library-page`, `reference-library-upload`, `reference-code-group`, `reference-variant-card`, `reference-variant-deactivate`, `reference-variant-inactive`.

## API-contract voor de developer

- `PATCH /api/v1/training/data/:id/holdout` `{holdout: boolean}` → 200/404
- `GET /api/v1/training/data?holdout=true` → gefilterde lijst
- `POST /api/v1/training/start` → **422** bij lege/te kleine holdout-set
- `GET /api/v1/models/:id` → `holdoutMetrics {accuracy, precision, recall, f1, holdoutSize, holdoutHash}`
- `GET /api/v1/feedback/model-comparison` → `comparisons[].holdoutMetrics`
- `POST /api/v1/reference-logos` (multipart) → 201 · validatie 400 · `GET ?code=` · `PATCH /:id/deactivate`
- ML-service: `get_holdout_images()`, `count_holdout_images()`, `HoldoutSetTooSmallError`, `build_augmented_dataset()` (holdout-proof), `compute_holdout_hash()`, holdout-blok in `create_model_version(metrics=...)`

## Definition of Done (green phase, per story)

- [ ] **Story 7.1**: verwijder `.skip` van de 5 API-tests + 2 e2e-tests + 4 pytest-markers → alles groen
- [ ] **Story 7.2**: verwijder `.skip` van de 2 API-tests + 2 e2e-tests + 2 pytest-markers → alles groen
- [ ] **Story 7.3**: verwijder `.skip` van de 6 API-tests + 4 e2e-tests → alles groen; fixture `tests/e2e/fixtures/reference-logo-sample.png` + `invalid-reference.txt` toevoegen
- [ ] Geen test gewijzigd om te laten slagen zonder dat de AC-intentie behouden blijft (test-quality regel)
- [ ] Mock-data uitgebreid in `__tests__/helpers/mock-data.ts` waar de Prisma-mocks nieuwe modellen vereisen (`referenceLogo`, holdout-veld op `trainingData`)

## Vervolg

- ATDD voor Epic 8-10: zelfde workflow per epic zodra Epic 7 groen is (aanbevolen: per story just-in-time)
- De CI-smoke-test van de volledige pipeline is bewust GEEN onderdeel van deze checklist — dat is Story 9.6 zelf
