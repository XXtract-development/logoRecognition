# Story 13.4: Nachtelijke promotielus — batching en guardrails

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 13 / Story 13.4 + ARCHITECTURE-SPINE (AD-6, AD-9, AD-12, AD-13, AD-15, AD-16; ARCH-2, ARCH-4, ARCH-6). Vereist: 13.1 (/ml/phash) en 13.2 (kandidaat-tabellen) afgerond. -->

## Story

Als **datamanager**
wil ik **dat kandidaten nachtelijk gebundeld worden en eerst langs caps en ontdubbeling gaan**
zodat **alleen zinvolle, niet-dubbele kandidaten de dure regressietest bereiken**.

### Afbakening (kritiek)

- Deze story levert **batching + guardrail-fasen (drempel/cap/dedup/outlier) + crash-recovery + watchdog**. De regressietest, de promotie-transactie en quarantaine zijn Story 13.5 — een batch die hier alle guardrails passeert blijft `pending` met gevulde `gateResults` totdat 13.5 de poort afmaakt. De fase-structuur van `gateResults` moet die overdracht dragen.
- **Uitsluitend de flywheel-worker** instantieert batches en draait guardrails (AD-15). Geen poortlogica in enig HTTP-request-pad.
- De per-batch outlier-guardrail (via `/ml/outlier-audit`) is een ándere afnemer dan de wekelijkse bibliotheek-audit (Story 14.3) — het ml-endpoint wordt hier gebouwd en daar hergebruikt.

## Acceptatiecriteria

1. **Migratie met toestemming (ARCH-2).** Given de nieuwe Prisma-migratie voor `promotion_batches`, inclusief het alsnog toevoegen van de FK-constraint op `reference_candidates.promotionBatchId` (in 13.2 bewust als nullable kolom zonder constraint aangemaakt), when de migratie wordt voorbereid, then wordt deze ter expliciete goedkeuring voorgelegd, met gedocumenteerd terugdraaipad (down-script).
2. **Nachtelijke bundeling door uitsluitend de worker.** Given openstaande kandidaten (status `candidate`), when de repeatable job `flywheel-promotion` draait (nieuwe BullMQ-queue `flywheel`, worker-concurrency 1, aangemaakt via `queue.upsertJobScheduler` — Job Schedulers, niet het gedeprecieerde repeat-patroon; cadans `FLYWHEEL_PROMOTION_CRON`, default 01:00 Europe/Amsterdam — bewust vóór/buiten het bestaande harvest-venster ~03:23 om ml-service-CPU-concurrentie te vermijden, AD-6), then bundelt uitsluitend deze worker ze in een `promotion_batches`-rij en zet elke kandidaat via conditional update op `in_batch` met `promotionBatchId` (claim: hoogstens één niet-afgesloten batch per kandidaat) (FR-2, AD-6, AD-15, AD-16).
3. **Per-klasse cap.** Given een klasse waarvan het aantal actieve promotie-referenties de cap (`FLYWHEEL_CLASS_CAP`, default 10, geteld over actieve promotie-referenties — rollback en deactivatie geven ruimte terug) zou overschrijden, when de guardrail-fase draait, then worden kandidaten boven de cap afgewezen met reden `cap-bereikt`; handmatig gecureerde referenties tellen niet mee en worden nooit verdrongen (FR-6), **en** wordt de cap bovendien ín de promotie-transactie afgedwongen (AD-6; de transactie zelf is 13.5 — deze story levert de herbruikbare cap-check die daar in de transactie draait).
4. **Tweetraps-dedup incl. kloon-gat.** Given twee bijna-identieke kandidaten in één batch, of een kandidaat die visueel vrijwel samenvalt met een actieve referentie van dezelfde klasse, when de tweetraps-dedup draait (pHash-Hamming via `/ml/phash`-output; embedding-cosine ≥ 0,97 via pgvector), then overleeft hoogstens één; de rest wordt afgewezen met reden `duplicaat` (FR-7, AD-9), **en** checkt dedup trap 2 óók tegen ináctieve referenties van dezelfde klasse met herkomst `flywheel-promotion` of `review`, zodat een kloon van een zojuist gedeactiveerde slechte referentie niet opnieuw gepromoveerd wordt (kloon-gat; FR-6/FR-7).
5. **Zachte afwijzing — géén hard-negative.** Given elke door de guardrails zacht afgewezen kandidaat (reden `cap-bereikt`, `duplicaat` of `outlier`), when de afwijzing wordt vastgelegd, then krijgt de kandidaat status `rejected` mét reden (conditional update) en ontstaat er GÉÉN `hard_negatives`-rij — hard-negatives ontstaan uitsluitend bij menselijke afkeuring: quarantaine-afkeuring (15.3) en reviewstation-reject wegens "geen keurmerk" (14.1) (FR-9, AD-12, AD-16), **en** is hernominatie toegestaan via status-reset van de bestaande rij naar `candidate` — geen nieuwe insert, de `@@unique([contentHash, t3777Code])` blijft kloppen (AD-12, AD-16).
6. **Per-batch outlier-guardrail.** Given de kandidaten van een batch en het klasse-centroid van hun klasse, when de per-batch outlier-guardrail via `/ml/outlier-audit` de afstand van elke kandidaat tot het klasse-centroid bepaalt, then worden kandidaten boven de grens afgewezen met reden `outlier` (zachte afwijzing — géén hard-negative, AD-12) — daarmee zijn de PRD-glossary "guardrail-checks (caps, dedup, outlier)" en de G1-node in de spine-flowchart waar (FR-2, FR-9, AD-9).
7. **gateResults per fase.** Given een batch die de guardrail-fasen doorloopt, when elke poort-fase (drempel/cap/dedup/outlier/regressie) afrondt, then bewaart de batch per fase een uitkomst-record in `gateResults`, opvraagbaar voor de dashboard-stories 15.2/15.3 (FR-2, AD-13). *(De regressie-fase wordt in deze story als "nog niet uitgevoerd" gemarkeerd; 13.5 vult hem.)*
8. **Crash-recovery.** Given een worker-herstart terwijl een batch met status `pending` openstaat, when de job `flywheel-promotion` opnieuw start, then pakt hij éérst de bestaande `pending`-batch(es) op en hervat de poort idempotent per fase (via `gateResults`), pas daarna bundelt hij nieuwe kandidaten — de hangende batch wordt altijd afgerond en kandidaten raken nooit permanent vast in `in_batch` (AD-12, AD-16, NFR-4).
9. **Watchdog.** Given de nachtelijke run, when de job succesvol afrondt, faalt of uitblijft, then legt elke succesvolle run zijn tijdstempel vast ("laatste succesvolle run", opvraagbaar via de overview-API) en produceert een lichte repeatable check een notificatie via het bestaande RetrainingNotification-patroon zodra die laatste succesvolle run >26 uur oud is (watchdog; operationele envelope §4, ARCH-4).

## Tasks / Subtasks

- [ ] 1. **Prisma-migratie (EXPLICIETE TOESTEMMINGSTAAK, ARCH-2)** (AC: 1)
  - [ ] 1.1 Model `PromotionBatch` conform Structural Seed: id, status (pending/passed/quarantined/rolled_back, `String @db.VarChar(20)`), `gateResults Json @default("{}")`, `baselineMeasurement Json @default("{}")`, createdAt, closedAt nullable; `@@map("promotion_batches")`, index `createdAt(sort: Desc)` + index op status.
  - [ ] 1.2 FK-constraint op `reference_candidates.promotionBatchId` → `promotion_batches.id` alsnog toevoegen (13.2 liet de kolom bewust constraint-loos).
  - [ ] 1.3 Down-script (drop FK + drop tabel) schrijven en documenteren; migratie ter goedkeuring voorleggen; NOOIT zelf uitvoeren (handmatig `prisma migrate deploy` na akkoord).
- [ ] 2. Queue `flywheel` + worker (AC: 2)
  - [ ] 2.1 Queue toevoegen in `apps/api/src/services/pipeline/queue.ts` (patroon `createPipelineQueues` :98; queues `training` :103 / `artwork-detection` :108; zelfde `PIPELINE_JOB_OPTIONS` :44).
  - [ ] 2.2 Worker registreren in `apps/api/src/services/pipeline/workers.ts` met **concurrency 1** (volg het concurrency-1-patroon van `registerTrainingFlowWorker` :267–292); bootstrap-aanroep in `main.ts` naast :292–322; opnemen in `closePipelineWorkers` (:347).
  - [ ] 2.3 Scheduler via `queue.upsertJobScheduler(...)` met `FLYWHEEL_PROMOTION_CRON` (default `0 1 * * *`, tz Europe/Amsterdam). NIET het `repeat: { pattern }`-patroon van `trigger.ts:327` kopiëren — dat is op BullMQ 5.63 gedeprecieerd (AD-6); bestaande jobs ongemoeid laten.
- [ ] 3. Batching-service `apps/api/src/services/flywheel/promotion-batch.ts` (AC: 2, 8)
  - [ ] 3.1 Run-volgorde: (a) bestaande `pending`-batches hervatten (fase-idempotent via `gateResults`: afgeronde fasen overslaan), (b) daarna pas nieuwe kandidaten bundelen.
  - [ ] 3.2 Claim: batch-INSERT + kandidaat-updates in één transactie; kandidaat-overgang `candidate → in_batch` als conditional update (`WHERE status='candidate' AND promotion_batch_id IS NULL`); 0 rows = overslaan, nooit overschrijven (AD-16). Statusovergang loggen in evidence (AD-13).
- [ ] 4. Guardrail-fasen `apps/api/src/services/flywheel/guardrails.ts` (AC: 3, 4, 5, 6, 7)
  - [ ] 4.1 Drempel-fase: her-check confidence ≥ `FLYWHEEL_PROMOTION_THRESHOLD_<METHODE>` (config uit 13.2) — vangt drempelwijzigingen tussen nominatie en run.
  - [ ] 4.2 Cap-fase: telling actieve promotie-referenties per klasse = `ReferenceLogo WHERE active=true AND source='flywheel-promotion'` (gecureerde bronnen tellen niet mee); afwijzen boven `FLYWHEEL_CLASS_CAP` (default 10) met reden `cap-bereikt`. Exporteer de cap-check als losse functie mét `SELECT ... FOR UPDATE`-variant zodat 13.5 hem binnen de promotie-transactie kan afdwingen (AD-6).
  - [ ] 4.3 Dedup trap 1 (pHash-Hamming): pHash per kandidaat via `/ml/phash` (bij nominatie al opgehaald — sla hem in 13.2-evidence op en lees hier; anders alsnog via MLClient ophalen); Hamming-afstand-vergelijking binnen de batch én tegen referenties van dezelfde klasse; drempel als `FLYWHEEL_DEDUP_HAMMING_MAX` (env, "strak" conform AD-9 — startwaarde documenteren).
  - [ ] 4.4 Dedup trap 2 (embedding-cosine ≥ `FLYWHEEL_DEDUP_COSINE` default 0,97) via pgvector-query over `candidate_embeddings` × (`reference_embeddings` van actieve referenties van de klasse ∪ ináctieve referenties van dezelfde klasse met source `flywheel-promotion`/`review` [kloon-gat] ∪ batch-genoten). Berekening in SQL (pgvector) — géén cosine-loops in Node (AD-9-grens: pgvector-query's door de API zijn de gesanctioneerde route, zie AD-9 "pgvector-cosine").
  - [ ] 4.5 Outlier-fase: `/ml/outlier-audit` aanroepen via nieuwe `MLClient.outlierAudit(...)` — request: klasse + kandidaat-embedding-ids of -vectoren; response: afstand tot klasse-centroid + grenswaarde-oordeel; afwijzen met reden `outlier`.
  - [ ] 4.6 Zachte afwijzing: conditional update `in_batch → rejected` + reden; nooit een `hard_negatives`-insert vanuit dit pad (bewaak met test).
  - [ ] 4.7 `gateResults`-schrijver: per fase `{ phase, startedAt, finishedAt, outcome, rejectedCandidateIds, details }`; fase `regression` als `{ outcome: 'not-run' }` initialiseren.
- [ ] 5. ml-service `/ml/outlier-audit` (AC: 6)
  - [ ] 5.1 `apps/ml-service/app/services/outlier.py`: klasse-centroid uit embeddings + afstand per kandidaat; grens = absolute afstand én/of percentiel (parametriseerbaar — Story 14.3 hergebruikt dit met top-5%-percentiel, AD-9).
  - [ ] 5.2 Endpoint in `apps/ml-service/app/api/flywheel.py` (bestaat sinds 13.1); ml-service leest hiervoor hoogstens embeddings (read-only pad conform invariant "ML -.-> PG alleen lezen") of krijgt vectoren als payload — schrijft niets.
- [ ] 6. Watchdog (AC: 9)
  - [ ] 6.1 "Laatste succesvolle run"-tijdstempel persistent vastleggen (voorstel: op de laatst afgeronde batch-rij + apart opvraagbaar veld in de overview-API; `system_settings` bestaat pas na 13.6 — kies een bron die zonder die tabel werkt en documenteer).
  - [ ] 6.2 Lichte repeatable check (zelfde queue `flywheel`, eigen scheduler, bv. per uur): laatste succesvolle run >26h → notificatie via het bestaande RetrainingNotification-patroon (`trigger.ts:141 notifyRetrainingRecommended` als voorbeeld: persistente rij + Socket.IO + Redis-dedup — zelfde mechaniek, eigen reason-code `flywheel-promotion-stalled`).
  - [ ] 6.3 Overview-API (`api/v1/flywheel.ts`, skelet uit 13.2) uitbreiden met `lastSuccessfulPromotionRun`.
- [ ] 7. Tests (zie testrichtlijnen) (AC: 2–9)
- [ ] 8. versions.md zelfde commit; Engelse commit; ghcr-workflow vóór Coolify-deploy; deploy-volgorde ml-service → api (het `/ml/outlier-audit`-endpoint moet bestaan vóór de worker live gaat)

## Dev Notes — Developer Context

### Bindende AD's

| AD | Essentie voor deze story |
|---|---|
| **AD-6** | Promotielus = BullMQ repeatable job in de bestaande API-worker; Job Schedulers (`upsertJobScheduler`), niet het gedeprecieerde repeat-patroon; queue `flywheel` concurrency 1 (promotie/bootstrap/audit sluiten elkaar uit); cap bovendien ín de promotie-transactie (`SELECT ... FOR UPDATE` of equivalent); cadans default 01:00 Europe/Amsterdam, vóór het harvest-venster ~03:23. |
| **AD-9** | pHash/cosine/centroid in ml-service; drempels als env-config (dedup Hamming strak / cosine ≥ 0,97; outlier top-5%-percentiel). API beslist op geretourneerde scores. |
| **AD-12** | Zachte afwijzing (`cap-bereikt`/`duplicaat`/`outlier`) → `rejected` mét reden, GÉÉN hard-negative; hernominatie via status-reset van de bestaande rij. Crash-recovery: eerst `pending`-batches hervatten, fase-idempotent via `gateResults`. |
| **AD-13** | Poort-uitkomsten per batch in evidence/`gateResults` JSONB. |
| **AD-15** | Uitsluitend de flywheel-worker instantieert batches en draait de poort; claim-semantiek via `promotionBatchId` (hoogstens één niet-afgesloten batch per kandidaat; FK in dezelfde transactie als de toewijzing). |
| **AD-16** | Status-machine met conditional updates; batch afgesloten zodra status ≠ `pending`; 0 rows affected = overslaan. |
| **ARCH-2 / ARCH-4 / ARCH-6** | Migratie-toestemming + down-script; watchdog via RetrainingNotification-patroon; queue-/jobnamen conform seed (`flywheel`, `flywheel-promotion`). |

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Queue-fabriek + job-options | `apps/api/src/services/pipeline/queue.ts` — `PIPELINE_JOB_OPTIONS` :44, `createPipelineQueues` :98 | Queue `flywheel` hier toevoegen; zelfde retry/backoff-defaults. |
| Concurrency-1-workerpatroon | `apps/api/src/services/pipeline/workers.ts` — `registerTrainingFlowWorker` :267 (concurrency 1, :271–276), `registerDetectionWorker` :314, `closePipelineWorkers` :347 | Blauwdruk voor de flywheel-worker. |
| Worker-bootstrap | `apps/api/src/main.ts:292–322` (cron + workers achter env-checks) | Registratieplek voor worker + schedulers. |
| Gedeprecieerd repeat-patroon (NIET kopiëren) | `apps/api/src/services/pipeline/trigger.ts:318 registerRetrainingCronJob`, `:327 repeat: { pattern }` | Alleen als contrast: nieuwe jobs via `upsertJobScheduler` (AD-6); bestaande job ongemoeid. |
| Notificatie-patroon | `trigger.ts:141 notifyRetrainingRecommended` (Redis-dedup + persistente `RetrainingNotification`-rij, schema.prisma:478–487 + Socket.IO) | Watchdog-notificatie (AC 9) volgt exact deze mechaniek. |
| Kandidaat-tabellen + status-machine | Story 13.2: `reference_candidates` (met `@@unique([contentHash, t3777Code])`, `promotionBatchId` nullable zonder FK), `candidate_embeddings`, statusovergangen | Deze story voegt de FK toe en consumeert de status-machine. |
| pHash + inhouds-hash | Story 13.1: `MLClient.computePhash` → `/ml/phash` | Trap-1-dedup-input. |
| pgvector-embeddingtabellen | `schema.prisma`: `ReferenceEmbedding` :273–283 (`vector(512)`), `candidate_embeddings` (13.2) | Trap-2-dedup-query's; `ReferenceLogo.active`/`source` :243–266 voor cap-telling en kloon-gat. |
| Harvest-venster (CPU-concurrent) | `apps/ml-service/app/services/queue_harvest.py` (nachtelijke Coolify scheduled task in de ml-container, ~03:23) | Motiveert de 01:00-default (AD-6). |
| ml-router flywheel | Story 13.1: `apps/ml-service/app/api/flywheel.py` | `/ml/outlier-audit` hier toevoegen. |

### Wat er NIEUW is (de eigenlijke story)

1. Prisma-migratie `promotion_batches` + FK op `reference_candidates.promotionBatchId` (+ down-script; goedkeuringsflow).
2. Queue `flywheel` + worker (concurrency 1) + Job Scheduler `flywheel-promotion` + watchdog-scheduler.
3. `apps/api/src/services/flywheel/promotion-batch.ts` (bundeling, claim, crash-recovery) en `apps/api/src/services/flywheel/guardrails.ts` (drempel/cap/dedup/outlier + gateResults).
4. `apps/ml-service/app/services/outlier.py` + `/ml/outlier-audit`-endpoint + `MLClient.outlierAudit`.
5. Overview-API-velden `lastSuccessfulPromotionRun` (+ watchdog-notificatie-reason).

### Guardrails (voorkom bekende fouten)

- **Migratie = toestemmingsmoment (ARCH-2)**; down-script verplicht; nooit auto-migrate of `migrate` in container-tests.
- **Geen poortlogica in endpoints** (AD-15): ook geen "handige" admin-route die een batch handmatig door de guardrails jaagt. Endpoints muteren status en enqueue-en hoogstens.
- **Zachte afwijzing schrijft nooit `hard_negatives`** — dat onderscheid is het hart van FR-9; borg met een expliciete test.
- **Kloon-gat niet vergeten** (AC 4): trap 2 ook tegen inactieve `flywheel-promotion`/`review`-referenties van de klasse.
- **`upsertJobScheduler`, geen `repeat`** — het bestaande retraining-patroon is op BullMQ 5.63 gedeprecieerd; kopieer het niet.
- **ml-code onder `app/`** (constraint 2): `outlier.py` in `app/services/`, nooit `scripts/`.
- **Cadans respecteren**: default 01:00 Europe/Amsterdam vóór het harvest-venster; maak de tz expliciet in de scheduler-opts.
- **Regressie-fase niet "alvast" bouwen** — 13.5-scope; alleen de `not-run`-marker in `gateResults`.
- Commits Engels; versions.md zelfde commit; ghcr vóór Coolify; deploy ml → api; e2e buiten de stable-subset-gate.

### Testrichtlijnen

- **Unit (vitest, `apps/api/src/__tests__/services/`)**: claim-semantiek (conditional update; kandidaat al `in_batch` → overgeslagen); cap-telling (gecureerde referenties tellen niet mee; inactieve tellen niet mee); dedup-beslislogica op gemockte scores (Hamming-grens, cosine-grens 0,97, batch-intern "hoogstens één overleeft", kloon-gat-set); zachte afwijzing → `rejected`+reden, géén hard-negative-insert; status-reset `rejected → candidate`; gateResults-fase-idempotentie (afgeronde fase wordt overgeslagen bij hervatting); watchdog-drempel 26h.
- **Integratie (vitest)**: volledige run met gemockte MLClient — bundeling → guardrails → batch blijft `pending` met alle fasen in `gateResults` behalve `regression: not-run`; crash-recovery-scenario (pending batch + herstart → eerst hervatten, dan nieuw bundelen); patroon `training-pipeline-queue.test.ts` / `training-flow-workers.test.ts` voor queue/worker-tests.
- **Pytest (`apps/ml-service/tests/`)**: centroid-berekening (bekende vectoren → verwacht centroid); afstands-/grensoordeel (binnen/boven grens); leeg-klasse-randgeval (0 of 1 referentie → gedefinieerd antwoord, geen crash).
- E2E: buiten de stable-subset-gate.

### Project Structure Notes

- Conform spine source-tree: `apps/api/src/services/flywheel/` (promotion-batch.ts, guardrails.ts), `apps/api/src/services/pipeline/` (queue/worker-uitbreiding), `apps/ml-service/app/services/outlier.py`, `apps/ml-service/app/api/flywheel.py`.
- Variance: de "laatste succesvolle run"-persistentie heeft nog geen `system_settings` (13.6) — keuze (batch-rij/aparte bron) documenteren in het Dev Agent Record; migratie-loos oplossen.

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story 13.4]
- [Source: ARCHITECTURE-SPINE.md#AD-6, #AD-9, #AD-12, #AD-13, #AD-15, #AD-16, #Operationele envelope (§4, §5), #Structural Seed (promotion_batches, BullMQ jobs, /ml/outlier-audit)]
- [Source: prd.md#FR-2, #FR-6, #FR-7, #FR-9; #3 Glossary (guardrail-checks)]
- [Source: geheugen project_queue_harvester (harvest-venster + app/-only-les)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint epic-agent, worktree epic/vliegwiel-13).

### Debug Log References

- Migratie 0014 lokaal toegepast via `prisma migrate deploy` (DATABASE_URL localhost:5432 bevestigd); tabel + FK geverifieerd via `pg_constraint`.
- Raw SQL-vormen (cap FOR UPDATE, cosine-dedup incl. survivor-arm, candidate-embedding-loader) tegen de echte pgvector-DB geparsed/uitgevoerd.
- Volledige API-vitest-suite groen (377 passed / 2 skipped). ml-service pytest `test_outlier_service.py` 11 passed.

### Completion Notes List

- **Persistentie-keuze "laatste succesvolle run" (variance-documentatie):** `system_settings` bestaat pas na 13.6, dus migratie-loos opgelost via **Redis** (sleutel `flywheel:last-successful-promotion-run`, ISO-timestamp) op dezelfde ioredis-connectie als de BullMQ-queues. Overleeft container-herstart; alleen een Redis-flush zet 'm terug (dan meldt de watchdog correct "nog nooit gedraaid"). 13.6 mag dit naar `system_settings` migreren.
- **pHash in dedup:** 13.2 sloeg de pHash niet in evidence op; de dedup-fase haalt 'm daarom on-demand via `MLClient.computePhash(cropPath)` (de story stond dit expliciet toe).
- **Drempel-fase = vrijgave, geen zachte afwijzing:** een kandidaat die de (mogelijk aangescherpte) drempel niet haalt gaat `in_batch → candidate` (vrijgave, AD-16), niet `rejected` — hij is geen slechte kandidaat, de drempel schoof.
- **Regressie/promotie/quarantaine = 13.5-scope:** een batch die alle guardrails passeert blijft `pending` met `gateResults.regression = { outcome: 'not-run' }`. `assertClassCapWithinTx` (SELECT … FOR UPDATE) is geëxporteerd zodat 13.5 de cap ín de promotie-transactie afdwingt.
- **Deploy-volgorde (AC/task 8):** ml-service (`/ml/outlier-audit`) vóór api (de worker die 'm aanroept). ghcr-build vóór Coolify. Niet gedeployed binnen deze story.

### File List

**Nieuw (apps/api):**
- `src/services/flywheel/types.ts`
- `src/services/flywheel/guardrails.ts`
- `src/services/flywheel/promotion-batch.ts`
- `src/services/flywheel/watchdog.ts`
- `src/services/flywheel/scheduler.ts`
- `src/__tests__/services/flywheel-guardrails.test.ts`
- `src/__tests__/services/flywheel-promotion-batch.test.ts`
- `src/__tests__/services/flywheel-watchdog.test.ts`
- `src/__tests__/services/flywheel-worker-scheduler.test.ts`
- `prisma/migrations/0014_add_promotion_batches/migration.sql`
- `prisma/migrations/0014_add_promotion_batches/down.sql`

**Gewijzigd (apps/api):**
- `prisma/schema.prisma` (model `PromotionBatch` + FK-relatie op `ReferenceCandidate`)
- `src/services/flywheel/config.ts` (cap/dedup/cron/watchdog-config)
- `src/services/ml-client.ts` (`outlierAudit`)
- `src/services/pipeline/queue.ts` (queue `flywheel`)
- `src/services/pipeline/workers.ts` (flywheel-worker + job-routing + close)
- `src/main.ts` (worker + scheduler-bootstrap)
- `src/api/v1/flywheel.ts` (`lastSuccessfulPromotionRun` in overview)
- `src/__tests__/setup.ts` (`promotionBatch`-mock, `outlierAudit`-mock, `Prisma`-namespace-mock, `upsertJobScheduler`-mock)
- `src/__tests__/services/flywheel-config.test.ts` (13.4-config-tests)
- `src/__tests__/api/flywheel.routes.test.ts` (overview-veld-test)

**Nieuw/gewijzigd (apps/ml-service):**
- `app/services/outlier.py` (nieuw)
- `app/api/flywheel.py` (`/ml/outlier-audit`-endpoint)
- `app/services/database.py` (`get_reference_embeddings_for_class`)
- `tests/unit/test_outlier_service.py` (nieuw)

**Artefacten:**
- `_bmad-output/implementation-artifacts/review-13-4.md`
- `_bmad-output/implementation-artifacts/ac-trace-13-4.md`

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow); queue-/worker-/trigger-regelnummers geverifieerd; gedeprecieerd repeat-patroon bevestigd op trigger.ts:327.
