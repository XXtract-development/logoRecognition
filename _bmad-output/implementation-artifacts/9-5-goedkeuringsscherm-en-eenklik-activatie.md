# Story 9.5: Goedkeuringsscherm en éénklik-activatie

Status: ready-for-dev

## Story

As a datamanager,
I want een goedkeuringsscherm met het volledige challenger-vs-champion-rapport en één activatieknop,
so that mijn enige handeling per modelversie een geïnformeerde goedkeuring is (KPI: ≤ 1 handeling).

## Acceptance Criteria

1. **Goedkeurings-queue met evaluatierapport (FR57):** Given challengers die de gate haalden, When ik `GET /api/v1/models/approval-queue` opvraag, Then retourneert het endpoint een lijst met per challenger een `evaluationReport` met: `challenger` (holdoutAccuracy), `champion` (holdoutAccuracy), `diff` (verschil per metric), `datasetGrowth` (aanwas annotaties sinds vorige training), en `triggerReasons`.

2. **Alleen gate-passing challengers (FR57):** Given challengers die de gate NIET haalden, When ik de approval-queue opvraag, Then zijn die modellen niet in de lijst (metrics.gate.passed !== true filtert ze weg).

3. **Weigering service-accounts (NFR5, NFR6):** Given welke geautomatiseerde flow of agent dan ook, When activatie zonder menselijke bevestiging wordt geprobeerd (x-api-key header aanwezig = service-account), Then weigert `POST /api/v1/models/:modelId/activate` met HTTP 403 En bevat de foutboodschap een tekst die match op `/menselijke|human|goedkeuring|approval/i`.

4. **Activatie-logging (NFR6, FR60-voorloper):** Given een succesvolle activatie door een menselijke gebruiker, When `POST /api/v1/models/:modelId/activate` slaagt, Then wordt een `ModelActivationLog`-record aangemaakt met `userId`, `modelVersionId`, `activatedAt` en `triggeredBy` ('manual-approval').

5. **Activatie-UI met één handeling (FR57):** Given een challenger in de goedkeurings-queue, When ik de goedkeuringspagina bezoek (`/models` uitgebreid of `/models/approval`), Then zie ik het rapport (challenger vs champion, holdout-metrics naast elkaar, verschil per metric, datasetgroei, trigger-reden) And activeert de bestaande activatieflow (hot-reload) het model bij mijn bevestiging.

6. **KPI-meting doorlooptijd (NFR-A8):** Given een afgeronde activatie, When ik het overzicht bekijk, Then is de doorlooptijd feedback → actief model meetbaar via de tijdstempels: `earliestIncorporatedFeedback` (oudste feedback-record in de training-batch) en `activatedAt` (activatie-log). De UI toont dit als "Doorlooptijd: X dagen" op het goedkeuringsscherm.

## Tasks / Subtasks

- [ ] Task 1: Datamodel `ModelActivationLog` (AC: 4, 6)
  - [ ] Prisma-model: id, modelVersionId (FK → ModelVersion), userId (FK → User), activatedAt (DateTime @default(now())), triggeredBy (String — 'manual-approval' | toekomstig 'auto-rollback'), batchId (optioneel, voor traceabiliteit naar training-batch)
  - [ ] **Migratie `0008_add_model_activation_log`** + `infrastructure/docker/postgres/init.sql` synchroon bijwerken
  - [ ] **GRANT:** `GRANT SELECT, INSERT ON TABLE model_activation_logs TO logorecognition;` — deploy-les Epic 7 (migratie-historie ÉN init.sql allebei; handmatig op Cherry na merge)
  - [ ] **Testcorrectie `model-approval.routes.test.ts`:** de bestaande test asserteert op `mockPrisma.auditLog?.create ?? mockPrisma.modelActivationLog?.create` — beide `undefined` bij ontbrekende Prisma-modellen → `expect(undefined).toHaveBeenCalledWith(...)` crasht hard. Correctie conform het **8.2-precedent**: vervang de `??`-constructie door directe mock op het gekozen model (`mockPrisma.modelActivationLog.create` of expliciete vi.spyOn na schema-definitie). Intentie behouden: test verifieert dat logging plaatsvindt met `userId`. **Documenteer de correctie in de Completion Notes.**

- [ ] Task 2: Approval-queue endpoint `GET /api/v1/models/approval-queue` (AC: 1, 2)
  - [ ] **ATDD-contract (model-approval.routes.test.ts — exact, 2 tests):**
    - Gate-passing challenger → response.data.length=1, item.evaluationReport met `{ challenger, champion, diff, triggerReasons }`
    - Geen gate-passing challengers → response.data.length=0
  - [ ] Filter: `modelVersion.findMany` waar `metrics.gate.passed === true AND isActive === false AND pendingApproval === true` (JSONB-filter via Prisma's `path`-syntax — let op `json.dumps`-les Epic 7)
  - [ ] `datasetGrowth`: bereken aanwas gevalideerde annotaties tussen `previousTrainingBatch.createdAt` en `currentTrainingBatch.createdAt`
  - [ ] `triggerReasons`: ophalen uit de `RetrainingNotification` die de training triggerde (join via triggerId op de training-batch)

- [ ] Task 3: Activatie-endpoint uitbreiding `POST /api/v1/models/:modelId/activate` (AC: 3, 4)
  - [ ] **ATDD-contract (model-approval.routes.test.ts — exact, 2 tests):**
    - Service-account (x-api-key header) → 403, body.error match `/menselijke|human|goedkeuring|approval/i`
    - Menselijke gebruiker → activatie + `mockPrisma.modelActivationLog.create` aangeroepen met `{ data: { userId: mockUser.id, ... } }`
  - [ ] Vóór bestaande activatielogica: controleer `isServiceRequest(request)` (9.1); als true → 403
  - [ ] Na succesvolle activatie: `prisma.modelActivationLog.create({ data: { userId, modelVersionId, triggeredBy: 'manual-approval' } })`
  - [ ] `route: apps/api/src/api/v1/training.ts` (bestaand bestand, uitbreiding)

- [ ] Task 4: Frontend goedkeuringsscherm (AC: 5, 6)
  - [ ] `data-testid="approval-queue-page"` op de goedkeuringspagina-component
  - [ ] `data-testid="evaluation-report"` per challenger-kaart met teksten "challenger" en "champion|actief model" en "holdout"
  - [ ] `data-testid="activate-model-button"` — één activatieknop per challenger (bevestigingsdialoog: destructieve-actie-patroon)
  - [ ] KPI-display: "Doorlooptijd: X dagen" berekend uit `earliestIncorporatedFeedback` (uit batch-metadata) en `activatedAt` (uit ModelActivationLog)
  - [ ] Route `/models` uitbreiden met approval-tab of aparte route `/models/approval` — keuze consistent met bestaand ModelsPage-patroon

- [ ] Task 5: E2E seed-strategie Journey 3 (AC: 5)
  - [ ] Arrange-fase in `pipeline-monitoring.spec.ts` Journey 3 (vóór `.skip` verwijderen): seed een gate-passing challenger via test-API (`POST /api/v1/pipeline/seed-approval-item` of via Prisma test-fixture) zodat de approval-queue niet leeg is
  - [ ] De challenger moet een `evaluationReport` hebben met "challenger", "champion" en "holdout" tekst

- [ ] Task 6: Tests groen (alle ACs)
  - [ ] `.skip` weg: **4 API-tests** in `model-approval.routes.test.ts` (alle vier)
  - [ ] `.skip` weg: **2 e2e-tests** in `pipeline-monitoring.spec.ts` Journey 3 (na seed-strategie van Task 5)
  - [ ] mock-data.ts uitbreiden met modelActivationLog-mock; `prisma generate` na schema-wijziging

## Dev Notes

### ⚠️ Epic 8-learnings (verplicht toepassen)

1. **Dubbele schema-bron:** Prisma-schema ÉN `infrastructure/docker/postgres/init.sql` beide bijwerken — de ML-service leest via asyncpg raw SQL. GRANT niet vergeten (les Epic 7: deployment faalde eerst door ontbrekende GRANT).
2. **Deploy-realiteit:** Docker-build draait `prisma generate` + `tsc` — lokale gates missen dat zonder gegenereerde client. Na merge: migratie handmatig op Cherry + GRANT.
3. **Monorepo-worktrees:** node_modules root + per-app symlinken.
4. **ML-service blijft REST:** activatieflow (hot-reload) is al geïmplementeerd op de Node/API-kant.
5. **ATDD = contract:** response-shapes exact; testcorrectie is noodzakelijk vóór de tests groen kunnen worden.

### Activatielog-keuze en 8.2-testcorrectie

De test in `model-approval.routes.test.ts` regel 121 gebruikt `mockPrisma.auditLog?.create ?? mockPrisma.modelActivationLog?.create` — een optionele-chain constructie die bij ontbrekende Prisma-modellen `undefined` retourneert, waarna `expect(undefined).toHaveBeenCalledWith(...)` hard crasht (niet "netjes faalt als RED-test"). Besluit: **eigen tabel `ModelActivationLog`** (niet een generieke auditLog). Correctie: vervang de `??`-constructie door directe vi.spyOn op `mockPrisma.modelActivationLog.create` na het `prisma generate` voor de nieuwe tabel. **Documenteer deze correctie expliciet in de Completion Notes** (zelfde patroon als 8.2-precedent in 8.2's Completion Notes).

### NFR8-KPI meting concreet

KPI-bron: twee timestamps in bestaande/nieuwe tabellen:
- **Start-tijdstip:** `earliestIncorporatedFeedback` = `MIN(feedback.createdAt)` van alle feedback-records in de training-batch die geleid heeft tot deze challenger. Deze timestamp zit in de batch-metadata (of te herleiden via de job-data).
- **Eind-tijdstip:** `activatedAt` in de nieuwe `ModelActivationLog`.
- **Berekening:** `(activatedAt - earliestIncorporatedFeedback)` in dagen, afgerond op 1 decimaal.
- **Display:** "Doorlooptijd: X.X dagen" op het goedkeuringsscherm. Doelstelling: < 7 (PRD NFR-A8 "< 1 week").

### Menselijke goedkeuring als harde eis (NFR5)

De 403-guard op het activate-endpoint is niet optioneel. Elke service-account (x-api-key header) wordt geweigerd, ongeacht de aanroepcontext. De foutmelding moet expliciet verwijzen naar menselijke goedkeuring zodat een developer die per ongeluk de pipeline-key gebruikt een duidelijke foutmelding krijgt.

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/api/v1/training.ts` | bestaand activate-endpoint + hot-reload-flow |
| `apps/web/src/pages/ModelsPage.tsx` | bestaand modellen-overzicht — uitbreidingspunt voor approval-tab |
| `apps/api/src/services/pipeline/quality-gate.ts` (9.4) | gate-verdict lezen voor evaluatierapport |
| `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` | 8.2-precedent mock-patroon |

### References

- [Source: epics.md#Story 9.5] · [Source: atdd-checklist-epic-8-9.md — approval-contract] · [Source: review-epic-9-voorwerk.md bevinding #4, #8, #9] · [Source: PRD FR57, NFR-A5, NFR-A6, NFR-A8]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
