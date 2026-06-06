# Story 9.1: Persistente job-queue-infrastructuur

Status: ready-for-dev

## Story

As a datamanager,
I want dat geautomatiseerde taken in een persistente queue draaien met zichtbare status,
so that een crash nooit leidt tot verloren werk en ik altijd kan zien wat het systeem doet.

## Acceptance Criteria

1. **Queue-defaults en retries (FR53, NFR1):** Given de BullMQ-infrastructuur toegevoegd aan de Fastify-API, When een job wordt aangemaakt, Then heeft de queue configureerbare retry-defaults (minimaal 3 pogingen) met exponential backoff And worden jobs nooit automatisch verwijderd uit de job-historie (removeOnComplete niet true — zichtbaarheid vereist).

2. **Jobstatus met foutreden (FR53):** Given een job die na alle retries is mislukt, When de jobstatus wordt opgevraagd, Then bevat het statusobject de foutreden (failedReason) en een retryable-vlag zodat de operator de job handmatig kan herstarten.

3. **Service-account-authenticatie (NFR6):** Given een geautomatiseerde caller (scheduler of worker), When deze een beveiligd endpoint aanroept met een x-api-key-header die overeenkomt met `PIPELINE_SERVICE_KEY` (uit de environment, geen fallback-default), Then authenticeert de caller succesvol And weigert het systeem bij een ontbrekende of onjuiste key And wordt de vergelijking timing-safe uitgevoerd (crypto.timingSafeEqual) om timing-aanvallen te voorkomen.

4. **Crash-bestendigheid (NFR1):** Given lopende of geplande jobs, When de API-container herstart, Then overleven alle jobs de herstart omdat BullMQ-state in Redis is opgeslagen.

5. **Jobstatus zichtbaar in UI (FR53):** Given het pipeline-jobs-panel in de TrainingPipelinePage, When ik het bekijk, Then zie ik alle pipeline-jobs met hun huidige status (waiting/active/completed/failed) And tonen mislukte rijen de foutreden en een herstart-actie.

## Tasks / Subtasks

- [ ] Task 1: Redis-infra toevoegen aan deployment-stack (AC: 4) ⚠️ BLOCKER
  - [ ] **ATDD-contract (training-pipeline-queue.test.ts — exact, 3 tests):**
    - `createPipelineQueues()` → queues.training.defaultJobOptions.attempts ≥ 3, backoff defined, removeOnComplete !== true
    - `getJobStatus('job-failed-1')` → `{ id, state, failedReason, retryable: true }` bij state=failed
    - `isServiceRequest({ headers: { 'x-api-key': ... } })` → true bij correcte key, false bij ontbrekende key
  - [ ] Redis-service toevoegen aan `docker-compose.yml` (development): image redis:7-alpine, port 6379, restart always
  - [ ] Redis-service toevoegen aan `docker-compose.acc.yml`: image redis:7-alpine, persistent volume (`redis-data:/data`), healthcheck (`redis-cli ping`), restart always
  - [ ] Redis-service toevoegen aan `docker-compose.full.yml` (productie-referentie): zelfde config als acc
  - [ ] `REDIS_URL` toevoegen aan `.env.example` (default `redis://localhost:6379`) én aan de Docker Compose environment-secties
  - [ ] Coolify deploy-verificatie als expliciete deploystap: na merge bevestigen dat Redis-service draait (`redis-cli -u $REDIS_URL ping` → PONG) vóór de API-container de BullMQ-verbinding probeert
  - [ ] Documenteer in deploy-notes dat `redis-data` volume géén LFS of backup-verplichting heeft (queue-state, niet databron)

- [ ] Task 2: BullMQ-infrastructuur module `apps/api/src/services/pipeline/queue.ts` (AC: 1, 2, 3)
  - [ ] `createPipelineQueues()`: Queue + QueueScheduler voor `training` met defaultJobOptions `{ attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: false, removeOnFail: false }`; Redis-verbinding via `REDIS_URL` env
  - [ ] `getJobStatus(jobId: string)`: haalt job op via BullMQ, retourneert `{ id, state, failedReason?, retryable, progress?, data }` — `failedReason` gevuld bij state=failed, `retryable: true` bij failed
  - [ ] `isServiceRequest(request)`: vergelijkt x-api-key header met `process.env.PIPELINE_SERVICE_KEY` via `crypto.timingSafeEqual` — **geen fallback-default**; retourneert false als PIPELINE_SERVICE_KEY niet geconfigureerd is
  - [ ] `PIPELINE_SERVICE_KEY` documenteren in `.env.example` (minimaal 32 tekens willekeurige string); Coolify-instelling vastleggen in deploy-notes

- [ ] Task 3: Job-status-endpoint `GET /api/v1/pipeline/jobs/:jobId` (AC: 2)
  - [ ] Route in nieuw bestand `apps/api/src/api/v1/pipeline.ts`; registreren in main.ts (patroon: reference-logos.ts)
  - [ ] Retourneert het volledige statusobject van `getJobStatus`
  - [ ] 404 bij onbekend jobId; auth vereist (bestaande JWT-middleware)

- [ ] Task 4: Frontend pipeline-jobs-panel (AC: 5)
  - [ ] `data-testid="pipeline-jobs-panel"` aan TrainingPipelinePage toevoegen (of nieuwe subcomponent `PipelineJobsPanel.tsx`)
  - [ ] `data-testid="pipeline-job-row"` per job-rij met status-tekst
  - [ ] Mislukte rijen: foutreden tonen + herstart-knop (roept job-retry-endpoint aan)
  - [ ] Socket.IO-event `pipeline_job_update` afhandelen voor live-status-updates (event-naam volgt architectuur-conventie `snake_case` met type-prefix)

- [ ] Task 5: E2E seed-strategie Journey 1 (AC: 5)
  - [ ] Arrange-fase toevoegen in `pipeline-monitoring.spec.ts` Journey 1 (vóór `.skip` verwijderen): maak een test-job aan via een test-API-call (`POST /api/v1/pipeline/jobs/seed-test`) zodat het panel niet leeg is
  - [ ] Alternatief: `PLAYWRIGHT_SEED_PIPELINE_JOB=1` env-flag die een gefaalde job injecteert via BullMQ bull-board of test-fixture

- [ ] Task 6: Tests groen (alle ACs)
  - [ ] `.skip` weg: **3 service-tests** in `training-pipeline-queue.test.ts` (Queue infrastructure describe: alle drie)
  - [ ] `.skip` weg: **2 e2e-tests** in `pipeline-monitoring.spec.ts` Journey 1 (na seed-strategie van Task 5)
  - [ ] mock-data.ts uitbreiden met pipeline-job-mock indien nodig; `prisma generate` als schema wijzigt

## Dev Notes

### ⚠️ Epic 8-learnings (verplicht toepassen)

1. **Redis-infra is de blocker:** "Given de bestaande Redis-instantie" uit de epics-spec is aspirationeel — Redis bestaat NIET in de huidige docker-compose-bestanden. Dit is exact het patroon dat de Epic 8-deploy brak (gemiste Prisma-migratie). Behandel Task 1 als deploy-blocker.
2. **Dubbele schema-bron:** elke datamodel-wijziging in ZOWEL Prisma-schema ALS `infrastructure/docker/postgres/init.sql` (+ GRANT). Zie Epic 7/8-les.
3. **Deploy-realiteit:** Docker-build draait `prisma generate` + `tsc` — lokale gates missen dat zonder gegenereerde client; gebruik gemockte Prisma-client in tests (bestaand patroon).
4. **Monorepo-worktrees:** node_modules root + per-app symlinken; voer `pnpm install` uit vanuit de root.
5. **ML-service blijft REST:** BullMQ/pipeline-orkestratie is volledig op de Node/API-kant; de ML-service wordt alleen via REST-endpoints aangeroepen.

### isServiceRequest — timing-safe contract

- **Geen permissive default:** als `PIPELINE_SERVICE_KEY` ontbreekt in de env, retourneert `isServiceRequest` altijd false (veilig). Geen `|| 'test-service-key'` fallback in productie.
- **crypto.timingSafeEqual** vereist gelijke buffer-lengte; bij ongelijke lengte altijd false retourneren zonder vergelijking.
- Coolify-instelling: `PIPELINE_SERVICE_KEY` als secret env var, nooit plaintext in compose-files.

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/api/v1/reference-logos.ts` (Epic 7) | nieuw routebestand + registratie-patroon in main.ts |
| `apps/api/src/services/storage.ts` | ioredis-verbinding als referentie (Redis-config-patroon) |
| `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` | test-opzet met Fastify-instantie en mock-data |
| `infrastructure/docker/redis/` | bestaande (ongebruikte) Redis-config-map — gebruik als startpunt |

### References

- [Source: epics.md#Story 9.1] · [Source: atdd-checklist-epic-8-9.md — queue-contract] · [Source: review-epic-9-voorwerk.md bevinding #1, #11, #9] · [Source: architecture.md#Infrastructure]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
