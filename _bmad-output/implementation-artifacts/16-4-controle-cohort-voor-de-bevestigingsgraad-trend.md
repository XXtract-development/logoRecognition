# Story 16.4: Controle-cohort voor de bevestigingsgraad-trend

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Epic 16 — Mismatch-stromen als brandstof en datakwaliteitssignaal. -->

## Story

As a **datamanager**,
I want **een vast controle-cohort (~100 GTINs) dat maandelijks herverwerkt wordt**,
So that **de stijging van de CONFIRMED-ratio aantoonbaar toe te schrijven is aan referentiegroei en niet aan een veranderde productmix (SM-3)**.

### Afbakening

- Dit is een **meetinstrument**, geen verwerkingsfeature: de herverwerking produceert mismatch-events (bron voor de ratio) en verder níets — geen review-items, geen nominaties, geen trainingsdata-registratie.
- Geen schemawijziging: cohort-definitie in `system_settings` (Story 13.6-tabel), meetuitkomsten als `mismatch_events` met eigen herkomst — beide bestaande contracten.
- **Afhankelijkheden:** Story 16.1 (mismatch-events als meetregistratie), Story 13.6 (`system_settings` + pauze-mechanisme), Epic 13 (queue `flywheel` bestaat). Het 12.8-verify-pad is de aanbevolen herverwerkingsmotor (schaduwmodus zonder neveneffecten).

## Acceptatiecriteria

1. **Cohort-definitie stabiel vastgelegd.**
   **Given** het controle-cohort
   **When** het wordt vastgelegd
   **Then** is de cohort-definitie (~100 GTINs) expliciet vastgelegd en stabiel over runs heen (SM-3).
   Concreet: de GTIN-lijst staat in `system_settings` (key `flywheel.control-cohort`, value Json: lijst + vastlegdatum + selectiecriterium) en wordt eenmalig samengesteld met een idempotent script met `--dry-run` (ARCH-4-seedpatroon). Selectie: GTINs mét artwork én mét declaratie (reason `ok`), gespreid over veel-gedeclareerde codes (frequentiedoc als spreidingscheck). Runs wijzigen de lijst nooit; wijziging kan alleen bewust (nieuwe settings-waarde, gelogd) en start een nieuwe trendlijn.

2. **Maandelijkse herverwerkings-job.**
   **Given** de maandelijkse cadans
   **When** de herverwerkings-job draait (queue `flywheel`, via Job Scheduler)
   **Then** wordt het cohort herverwerkt en de CONFIRMED-ratio per cohort-run vastgelegd (SM-3).
   Concreet: repeatable job `flywheel-cohort-rerun` op de bestaande queue `flywheel` (concurrency 1), aangemaakt via `queue.upsertJobScheduler` (Job Schedulers, niet het gedeprecieerde repeat-patroon; AD-6), cadans `FLYWHEEL_COHORT_CRON` (default maandelijks, nachtelijk buiten het harvest-venster ~03:23). Per GTIN draait het verify-/kruischeck-pad (12.8-flow: declaraties → gerichte detectie → verdicts) en worden de uitkomsten als `mismatch_events` met herkomst/runId `cohort-<runId>` geregistreerd; de ratio = confirmed / (confirmed + declared-not-found) per run.

3. **Trend opvraagbaar.**
   **Given** de vastgelegde cohort-runs
   **When** het dashboard de trend opvraagt
   **Then** is de ratio-trend per cohort-run opvraagbaar via de overview-API (SM-3, FR-17) — één meetpunt per cohort-run, berekend over de events met die run-herkomst.

4. **Pauze-scope en isolatie.**
   **Given** de pauzestand of de live-detectiestroom
   **When** de herverwerking draait
   **Then** respecteert die de pauze-scope (AD-11) en de isolatie-eis: geen impact op de live-detectiestroom (NFR-3).
   Concreet: de job checkt de persistente pauze bij start en draait dan niet (meting hoort bij de vliegwiel-verwerking, niet bij read-only werk); de verwerking loopt via de BullMQ-worker (nooit het live-API-request-pad) en is getemperd/time-boxed zodat parallelle live-verwerking en de nachtelijke harvest er geen last van hebben.

5. **Tests.**
   - Unit (vitest, apps/api): ratio-berekening (randgevallen: 0 confirmed, 0 events, UNSUPPORTED telt niet mee in de noemer — gedocumenteerde keuze), cohort-resolutie uit `system_settings`, pauze-check bij job-start (gepauzeerd ⇒ geen verwerking, gelogde skip).
   - Integratie: job-run met gemockte verify-flow ⇒ events met `cohort-<runId>`-herkomst + trend-endpoint levert het meetpunt; stabiliteit: tweede run gebruikt exact dezelfde GTIN-lijst.
   - E2E: NIET aan de stable-subset-gate toevoegen.

## Tasks / Subtasks

- [ ] 1. Cohort-samenstellingsscript (idempotent, `--dry-run`) + vastlegging in `system_settings` key `flywheel.control-cohort` (AC: 1)
- [ ] 2. Job `flywheel-cohort-rerun` op queue `flywheel` via `upsertJobScheduler`, env `FLYWHEEL_COHORT_CRON` (AC: 2)
  - [ ] 2.1 Per GTIN: hergebruik het 12.8-verify-pad (declaraties → alias → gerichte localize/classify → verdicts) — géén detection-flow (die maakt review-items + registraties aan)
  - [ ] 2.2 Uitkomsten registreren als `mismatch_events` met herkomst/runId `cohort-<runId>` (16.1-service hergebruiken, aparte herkomst zodat cohort-metingen de reguliere trend niet vervuilen — aggregaties 16.1/16.2/16.3 sluiten cohort-herkomst uit dan wel filteren erop, gedocumenteerd)
  - [ ] 2.3 Time-box + tempering (budget-env met conservatieve default; ~100 GTINs × ~28s lokalisatie ≈ 45–50 min — binnen het nachtvenster houden)
- [ ] 3. Pauze-check bij job-start (persistente pauze uit `system_settings`, 13.6) (AC: 4)
- [ ] 4. Overview-sub-service `apps/api/src/services/flywheel/overview-cohort.ts`: CONFIRMED-ratio per cohort-run (AC: 3)
- [ ] 5. Unit-/integratietests (AC: 5)
- [ ] 6. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy

## Dev Notes — Developer Context

### Wat er AL bestaat (geverifieerd 2026-07-02, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Herverwerkingsmotor zonder neveneffecten | 12.8-verify-flow (`_bmad-output/implementation-artifacts/12-8-kruischeck-endpoint-n8n.md`; per 2026-07-02 ready-for-dev) — schaduwmodus: geen review-items, geen registraties | Precies wat een meetinstrument nodig heeft. Is 12.8 bij aanvang nog niet gemerged: blokkade melden i.p.v. terugvallen op detection-flow (die vervuilt de review-queue). |
| Meetregistratie | `mismatch_events` + registratie-service (Story 16.1, `apps/api/src/services/flywheel/mismatch-events.ts`) | Ratio-bron; herkomst/runId-veld draagt `cohort-<runId>`. Geen nieuwe meettabel. |
| Persistente pauze + settings | `system_settings` (Story 13.6, AD-11) | Cohort-definitie (key/value Json) én pauze-check. Geen migratie in deze story. |
| Queue + Job Scheduler-patroon | `apps/api/src/services/pipeline/queue.ts` (198 regels) — `createPipelineQueues()` :98, queues `training` :103 / `artwork-detection` :108; queue `flywheel` komt uit Epic 13 (AD-6) | Job aanhaken op de bestaande flywheel-queue (concurrency 1); `upsertJobScheduler`, niet `repeat:{pattern}` (gedeprecieerd op BullMQ 5.63). |
| Declaratieprovider | `apps/api/src/services/t3777-declarations.ts` (468 regels) — `resolveDeclarations()` :213, reason-codes | Cohort-selectie (reason `ok`) en herverwerking. Fail-safe-reasons: GTIN met `api-fout` in een run telt níet als declared-not-found — run-uitval per GTIN loggen, niet maskeren. |
| Time-box/tempering-patroon | `apps/ml-service/app/services/queue_harvest.py` :41–47, :120 (`MAX_SECONDS`, budget-envs) | Zelfde discipline Node-zijde: budget-env + wall-clock-check. |
| Spreidings-/frequentiecontext | `tests/validation/keurmerk-declaratie-frequentie.md` (top-30 declaraties) | Cohort-samenstelling: spreiding over veel-gedeclareerde codes. |

### Wat er NIEUW is

1. Cohort-samenstellingsscript (idempotent, dry-run) + settings-vastlegging.
2. Job `flywheel-cohort-rerun` (worker-registratie in `services/pipeline/` conform spine: "queue 'flywheel' + workers toevoegen").
3. `apps/api/src/services/flywheel/overview-cohort.ts` + overview-sectie (trendpunt per run).
4. Env: `FLYWHEEL_COHORT_CRON` (+ budget-env) — `FLYWHEEL_`-prefix-conventie, documenteren in het env-voorbeeldbestand.

### Bindende AD's

- **AD-6** — geen nieuwe scheduler; queue `flywheel`, concurrency 1, Job Schedulers; cadans buiten het harvest-venster.
- **AD-11** — pauze-scope: cohort-herverwerking is vliegwiel-verwerking en stopt bij pauze; dashboard-reads (de trend) blijven werken.
- **AD-2 / AD-13** — API bezit de meetdata; elk meetpunt herleidbaar naar zijn run en events (NFR-1).
- **NFR-3 / NFR-7** — isolatie: worker-pad, getemperd, nooit het live-API-request-pad; bestaande latency onaangetast.
- **SM-3** — de bestaansreden: vaste-cohort-attributie (stijging = referentiegroei, niet productmix). Cohort-stabiliteit is daarom een harde eis, geen nice-to-have.

### Guardrails (voorkom bekende fouten)

- **Geen migratie in deze story** — `system_settings` + `mismatch_events` volstaan; blijkt tóch schema nodig → stoppen en toestemming vragen (ARCH-2), inclusief down-script.
- **Cohort nooit stil muteren:** verdwenen artwork/GTIN in een run ⇒ als uitval loggen mét reden, GTIN blijft in de definitie (anders sluipt productmix-drift terug in de meting).
- **Cohort-events scheiden van reguliere stromen:** herkomst-filter in 16.1-aggregatie, 16.2-werkvoorraad en 16.3-rapport — een maandelijkse cohortrun mag geen kunstmatige "structurele patronen" of rapportregels genereren; expliciet getest.
- **28s/beeld-lokalisatiekosten bewaken:** budget + time-box; nooit het hele cohort ongebudgetteerd door de localize-keten jagen.
- **Geen review-items/nominaties/registraties** vanuit de cohortrun (meetinstrument-principe; vgl. 12.8-AC8).
- Deploy-volgorde ml → api → web (hier alleen api); ghcr-workflow laten slagen vóór Coolify-deploy.
- Commits/PRs Engels; `versions.md` (NL) in DEZELFDE commit.
- E2E buiten de stable-subset-gate.

### Testrichtlijnen

- Ratio-functie puur testen (teller/noemer-definitie incl. UNSUPPORTED- en uitval-behandeling vastleggen in de test als contract).
- Job-integratie met gemockte verify-flow en gemockte klok; pauze-pad; stabiliteits-assert op de GTIN-lijst.
- Herkomst-scheiding: cohort-events verschijnen niet in de 16.2-drempeltelling (regressietest).

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 16.4 (AC-bron).
- `ARCHITECTURE-SPINE.md` — AD-6, AD-11, operationele envelope (Job Schedulers, seeds met dry-run).
- PRD §7 SM-3 (meetmethode + cohort-assumptie ~100 GTINs, maandelijks).
- `_bmad-output/implementation-artifacts/12-8-kruischeck-endpoint-n8n.md` — verify-pad (herverwerkingsmotor), schaduwmodus-principes.

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Story 16.4, PRD SM-3 en de spine-orkestratieregels (AD-6/AD-11).
