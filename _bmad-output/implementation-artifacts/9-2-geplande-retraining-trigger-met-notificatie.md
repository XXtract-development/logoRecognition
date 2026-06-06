# Story 9.2: Geplande retraining-trigger met notificatie

Status: ready-for-dev

## Story

As a datamanager,
I want automatisch bericht krijgen wanneer hertrainen zinvol is, met de reden erbij,
so that ik nooit meer zelf hoef te bedenken wanneer het tijd is voor een nieuwe trainingsronde.

## Acceptance Criteria

1. **Configureerbare condities (FR51):** Given de bestaande `checkRetrainingConditions()`-logica, When de repeatable trigger-job draait (default dagelijks, cron via env `RETRAINING_CRON`), Then worden de condities geëvalueerd met configureerbare drempels (`minFeedbackCount`, `minUnincorporatedRatio`, `lowAccuracyThreshold`) in plaats van hardcoded constanten.

2. **Concrete notificatie (FR52):** Given een trigger-conditie is bereikt, When de check positief uitvalt, Then ontvang ik een Socket.IO-event `retraining_recommended` met de concrete reden als tekst ("512 nieuwe gevalideerde annotaties sinds laatste training") — niet een generiek bericht.

3. **Persistente notificatie (FR52):** Given een trigger is gefired, When ik de UI open op een later moment (paginabezoek, niet real-time), Then is de notificatie nog steeds zichtbaar omdat deze in een `RetrainingNotification`-tabel is opgeslagen met status `unread/read`. Offline datamanagers missen nooit een trigger.

4. **Dedup — crash-bestendig (NFR1):** Given een trigger al is gemeld en er is nog geen training gestart, When de check opnieuw draait (ook na API-herstart), Then wordt geen duplicaatnotificatie verstuurd. De dedup-state is opgeslagen in Redis (niet in-memory) zodat een herstart geen dedup-venster wist. Dedup-venster is configureerbaar via `RETRAINING_DEDUP_HOURS` (default 24).

## Tasks / Subtasks

- [ ] Task 1: Datamodel `RetrainingNotification` (AC: 3, 4)
  - [ ] Prisma-model: id, triggerId (uniek dedup-sleutel), reasons (String[]), status (`unread` | `read`), createdAt, readAt?; index op status + createdAt
  - [ ] Migratie `0007_add_retraining_notifications` + `infrastructure/docker/postgres/init.sql` synchroon bijwerken + GRANT (les Epic 7: `GRANT SELECT, INSERT, UPDATE ON TABLE retraining_notifications TO logorecognition;`)
  - [ ] `triggerId` = `sha256(reasons.join('|') + datetrum-venster)` — zelfde triggers binnen het venster krijgen hetzelfde triggerId

- [ ] Task 2: Trigger-service `apps/api/src/services/pipeline/trigger.ts` (AC: 1, 2, 4)
  - [ ] **ATDD-contract (training-pipeline-queue.test.ts — exact, 3 tests):**
    - `evaluateRetrainingTrigger({ minFeedbackCount, minUnincorporatedRatio, lowAccuracyThreshold })` → `{ shouldRetrain: boolean, reasons: string[] }`
    - `notifyRetrainingRecommended(trigger, { emit })` → `emit` aangeroepen met event-naam matching `/retraining/` en `{ reasons: [...] }`
    - `notifyRetrainingRecommended` tweemaal → `emit` slechts 1× aangeroepen (dedup)
  - [ ] `evaluateRetrainingTrigger`: lees drempels uit configuratie-object (meegegeven of uit env); vergelijk met huidige tellingen uit de DB (ongeïncorporeerd feedback-count, accuracy-trend)
  - [ ] `notifyRetrainingRecommended`: sla notificatie op in `RetrainingNotification` (Prisma) vóór de Socket.IO-emit; sla dedup-sleutel op in Redis met TTL gelijk aan `RETRAINING_DEDUP_HOURS × 3600`
  - [ ] Redis-dedup-sleutel: `retraining:dedup:{triggerId}` — via `ioredis` (dezelfde verbinding als BullMQ uit 9.1)
  - [ ] Socket.IO-event: `retraining_recommended` (naam volgt architectuur-conventie `snake_case` met type-prefix)

- [ ] Task 3: Cron-scheduler registratie (AC: 1)
  - [ ] BullMQ-repeatable job `retraining-check` met cron `RETRAINING_CRON` (default `0 6 * * *` — dagelijks 06:00)
  - [ ] Registratie in de queue-setup (9.1 createPipelineQueues of aparte init-functie in trigger.ts)
  - [ ] Worker verwerkt de job via `evaluateRetrainingTrigger` + `notifyRetrainingRecommended`

- [ ] Task 4: Notificatie-API en UI (AC: 3)
  - [ ] `GET /api/v1/pipeline/notifications` → lijst van `RetrainingNotification`-records (status=unread bovenaan)
  - [ ] `PATCH /api/v1/pipeline/notifications/:id/read` → zet status op `read`, vult `readAt`
  - [ ] Frontend: `data-testid="retraining-notification"` op de notificatie-banner/component; toon ook bij koud paginabezoek door de API te pollen (TanStack Query met `refetchOnMount`)
  - [ ] Notificatie bevat concrete reden-tekst met getal (e2e-test verwacht `/\d+/`)

- [ ] Task 5: E2E seed-strategie Journey 2 (AC: 2, 3)
  - [ ] Arrange-fase in `pipeline-monitoring.spec.ts` Journey 2 (vóór `.skip` verwijderen): maak een test-`RetrainingNotification` aan via `POST /api/v1/pipeline/notifications/seed-test` (test-only endpoint, of via DB-fixture in playwright.config) zodat de notificatie zichtbaar is bij paginabezoek
  - [ ] De notificatie moet `reasons` bevatten met een getal (e.g. "42 nieuwe annotaties")

- [ ] Task 6: Tests groen (alle ACs)
  - [ ] `.skip` weg: **3 service-tests** in `training-pipeline-queue.test.ts` (Scheduled retraining trigger describe: alle drie)
  - [ ] `.skip` weg: **1 e2e-test** in `pipeline-monitoring.spec.ts` Journey 2 (na seed-strategie van Task 5)
  - [ ] mock-data.ts uitbreiden met retrainingNotification-mock; `prisma generate` na schema-wijziging

## Dev Notes

### ⚠️ Epic 8-learnings (verplicht toepassen)

1. **Dubbele schema-bron:** Prisma-schema ÉN `infrastructure/docker/postgres/init.sql` beide bijwerken — de ML-service leest via asyncpg raw SQL. GRANT niet vergeten.
2. **Deploy-realiteit:** Docker-build draait `prisma generate` + `tsc` — lokale gates missen dat zonder gegenereerde client.
3. **Monorepo-worktrees:** node_modules root + per-app symlinken.
4. **ML-service blijft REST:** pipeline-orkestratie is volledig op de Node/API-kant.
5. **ATDD = contract:** response-shapes exact volgens testbestand; foutafhandeling via `{ error: '...' }` op route-niveau.

### Notificatie-persistentie: waarom een eigen tabel

De e2e-test (Journey 2) navigeert naar `/` en verwacht een zichtbare notificatie. Socket.IO-emit is vluchtig — een offline datamanager of een browserrefresh na de emit mist de trigger. Eigen `RetrainingNotification`-tabel + poll-op-mount waarborgt de eis. De tabel is ook de databron voor de dedup-check (naast Redis): dubbele borging.

### Dedup herstart-bestendigheid

De test verwacht dat 2× `notifyRetrainingRecommended` aanroepen resulteren in 1× emit. Dit werkt in-memory voor de unit-test (Redis gemockt). De productie-implementatie MOET Redis gebruiken voor de dedup-sleutel (`SETEX retraining:dedup:{triggerId} {ttl} 1`) omdat een API-herstart anders het in-memory venster wist — wat in strijd is met NFR1.

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/services/socket-io-manager.ts` | Socket.IO-emit-patroon + event-naming |
| `apps/api/src/api/v1/feedback.ts` | bestaande checkRetrainingConditions()-logica |
| `apps/api/src/api/v1/reference-logos.ts` (Epic 7) | routebestand-registratie-patroon |
| `apps/api/src/__tests__/services/` | bestaande service-test-conventies |

### References

- [Source: epics.md#Story 9.2] · [Source: atdd-checklist-epic-8-9.md — trigger-contract] · [Source: review-epic-9-voorwerk.md bevinding #10, #13, #9] · [Source: PRD FR51, FR52]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
