# Story 7.1: Holdout-markering op trainingsdata

Status: ready-for-dev

## Story

As a datamanager,
I want trainingsafbeeldingen kunnen markeren als onderdeel van de vaste holdout-set,
so that er een stabiel, beschermd meetpunt ontstaat waarop alle modelversies eerlijk vergeleken kunnen worden.

## Acceptance Criteria

1. **Holdout markeren/demarkeren:** Given een bestaande trainingsafbeelding, When ik deze markeer als holdout (via API en via de bestaande beheer-UI), Then krijgt het record een persistente holdout-vlag in `TrainingData` And is de wijziging zichtbaar in de bibliotheekweergave.
2. **Query-level uitsluiting (NFR3):** Given een trainingsrun wordt gestart, When de trainer de dataset samenstelt (`get_training_images`), Then worden holdout-records op query-niveau uitgesloten van training én augmentatie And faalt de run met duidelijke foutmelding als de holdout-set leeg is of onder een configureerbaar minimum zakt.
3. **Initiële stratificatie:** Given een initiële holdout-selectie is nodig, When de migratie draait, Then wordt een gestratificeerde steekproef (per keurmerk-klasse, configureerbaar percentage, default 15%) van bestaande gevalideerde data als holdout gemarkeerd.

## Tasks / Subtasks

- [ ] Task 1: Datamodel-uitbreiding (AC: 1, 3)
  - [ ] `holdout Boolean @default(false) @map("holdout")` + `@@index([holdout])` toevoegen aan `TrainingData` in `apps/api/prisma/schema.prisma:44-61`
  - [ ] Prisma-migratie LOKAAL genereren (`prisma migrate dev`) — ⛔ NOOIT `migrate` op containers draaien (teamregel); deployment via bestaand migratieproces
  - [ ] `infrastructure/docker/postgres/init.sql` synchroon bijwerken (ML-service leest via asyncpg raw SQL, niet via Prisma)
  - [ ] Eenmalig stratificatie-script: per `label` 15% (config via env `HOLDOUT_PERCENTAGE`) van `validated=true` records markeren; alleen draaien als 0 holdout-records bestaan (idempotent)
- [ ] Task 2: API-endpoints in `apps/api/src/api/v1/training.ts` (AC: 1, 2)
  - [ ] `PATCH /api/v1/training/data/:id/holdout` body `{ holdout: boolean }` → 200 `{ id, holdout }` (camelCase response), 404 bij onbekend id (Prisma P2025)
  - [ ] `GET /api/v1/training/data?holdout=true` → `{ data: [...] }` gefilterd (bestaande lijst-conventie met pagination volgen)
  - [ ] Guard in bestaande `POST /training/start` (regels 36-111): vóór `mlClient.startTraining()` → `prisma.trainingData.count({ where: { holdout: true, validated: true } })`; bij 0 of < `HOLDOUT_MINIMUM` (env, default 25) → **422** met error-tekst die "holdout" bevat
- [ ] Task 3: ML-service query-level uitsluiting (AC: 2)
  - [ ] `get_training_images()` in `apps/ml-service/app/services/database.py:344-374`: `AND td.holdout = false` toevoegen aan BEIDE query-varianten (validated_only true/false)
  - [ ] Nieuw: `get_holdout_images()` (alleen `td.holdout = true AND td.validated = true`) en `count_holdout_images()`
  - [ ] `HoldoutSetTooSmallError` exception + check in `TrainerService.start_training()` (`apps/ml-service/app/services/trainer.py`, vóór de async task start rond regel 142)
  - [ ] Augmentatie-garantie: holdout kan `build_augmented_dataset`/duplicatielogica (trainer.py regels 214-217) nooit bereiken — afgedwongen doordat de bron-query al filtert; expliciete assert toevoegen
- [ ] Task 4: Frontend (AC: 1)
  - [ ] Holdout-toggle + badge op afbeeldingskaart (bestaande image library in `apps/web/src/pages/TrainingPage.tsx` + `apps/web/src/stores/trainingStore.ts`)
  - [ ] Batch-picker bij training-start sluit holdout-afbeeldingen uit
  - [ ] **data-testid-contract (verplicht, uit ATDD):** `image-card`, `holdout-toggle`, `holdout-badge`, `batch-image-picker` + `data-image-id` attribuut op kaarten
- [ ] Task 5: Tests groen maken (alle ACs)
  - [ ] `.skip` verwijderen van de 5 tests in `apps/api/src/__tests__/api/holdout.routes.test.ts` (Story 7.1-gedeelte) → groen
  - [ ] `@pytest.mark.skip` verwijderen van de 4 Story 7.1-tests in `tests/test_holdout_trainer.py` → groen
  - [ ] `test.skip` verwijderen van de 2 e2e-tests in `tests/e2e/holdout-management.spec.ts` (Journey 1) → groen
  - [ ] `mock-data.ts` uitbreiden waar Prisma-mocks het holdout-veld nodig hebben (bestaande mocks niet wijzigen)

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **De ATDD-tests zijn het contract.** Paden, statuscodes en response-vormen staan vast in `apps/api/src/__tests__/api/holdout.routes.test.ts`, `tests/test_holdout_trainer.py` en `tests/e2e/holdout-management.spec.ts`. Implementeer daarnaartoe; wijzig tests alleen bij aantoonbare testfout (en documenteer dat).
- **422-error-format:** de ATDD-test verwacht `JSON.parse(body).error` als string die /holdout/i matcht — volg het bestaande route-level format van training.ts (`{ error: "...", message: "..." }`), NIET het globale error-handler-format. (Bekende, gedocumenteerde inconsistentie — architecture.md "Bekende inconsistentie".)
- **Dubbele schema-bron:** Prisma (API) én raw SQL/init.sql (ML-service via asyncpg). Beide bijwerken, anders crasht `get_training_images` op de nieuwe kolomverwijzing in prod-achtige omgevingen.
- **Request/response casing:** requests `snake_case`, responses `camelCase` (architecture.md Naming Patterns). `holdout` is casing-neutraal.

### Bestaande code die je aanraakt (gelezen — huidige staat)

| Bestand | Huidige staat | Wijziging |
|---------|--------------|-----------|
| `apps/api/prisma/schema.prisma:44-61` | `TrainingData`: id, imageId, label, confidence, validated, validationDate, validatedBy, createdAt; indexes op imageId/label/validated | + holdout veld + index |
| `apps/ml-service/app/services/database.py:344-374` | `get_training_images(batch_id, validated_only=True)` — JOIN logo_images×training_data, filter alleen `td.validated`; **batch_id-parameter wordt genegeerd in de query** (bestaand gedrag, niet fixen in deze story) | + `td.holdout = false` in beide varianten; + 2 nieuwe functies |
| `apps/api/src/api/v1/training.ts:36-111` | `POST /training/start` valideert input, roept mlClient, 202 + Socket.IO notify | + holdout-guard vóór mlClient-call |
| `apps/ml-service/app/services/trainer.py:121-145` | `start_training()` maakt job-record en start `asyncio.create_task` | + holdout-count-check → raise HoldoutSetTooSmallError |
| `tests/e2e/models-page.spec.ts` | referentiepatroon voor e2e (BASE_URL, waitForPageStability) | n.v.t. (patroon volgen) |

**Wat behouden moet blijven:** bestaand gedrag van `POST /training/start` (202, Socket.IO-notificatie), bestaande filters in lijst-endpoints, bestaande mocks in `__tests__/helpers/mock-data.ts`.

### Architectuur-compliance (verplicht)

- Fastify 4 + Prisma 5; tests in `__tests__/` parallel aan source (Vitest, `vi.Mock`)
- React: `PascalCase.tsx`, `React.memo()`, named exports; Zustand `devtools → persist → immer`
- Ant Design 5-componenten voor toggle/badge; XXtract-kleuren (Navy #2F5A7A, Teal #54949E, Groen #B7D945)
- Geen nieuwe libraries nodig — alles met bestaande stack

### Project Structure Notes

- Nieuwe endpoints horen IN het bestaande `training.ts` (zelfde resource); géén nieuw routebestand
- Stratificatie-script: `apps/api/scripts/` of Prisma seed-conventie — check bestaande scripts-map eerst
- Conflict-check: geen — kolomnaam `holdout` botst nergens (gegrept)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/test-artifacts/atdd-checklist-epic-7.md — API-contract + DoD]
- [Source: _bmad-output/planning-artifacts/research/technical-automatiseren-modeltraining-research-2026-06-03.md#Data-architectuur: de ontbrekende hoeksteen]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
