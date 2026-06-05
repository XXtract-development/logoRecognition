# Adversarial Review — Epic 9-voorwerk

**Datum:** 2026-06-05 · **Reviewer:** BMAD adversarial review (cynical mode)
**Scope:** Epic 9-definitie + story-specs 9.1–9.6 (epics.md), ATDD-checklist epic-8-9 (Epic 9-deel), testbestanden `training-pipeline-queue.test.ts`, `model-approval.routes.test.ts`, `pipeline-monitoring.spec.ts`
**Getoetst tegen:** PRD FR51–FR57/NFR's, de opgeleverde Epic 8-realiteit op `acc` (98af1d4), Prisma-schema, docker-compose-bestanden

## Verdict: NOT READY — voorwerk vereist correcties vóór story-creatie/implementatie

FR-dekking zelf is compleet (FR51→9.2, FR52→9.2, FR53→9.1, FR54→9.3, FR55→9.3, FR56→9.4, FR57→9.5) en het holdoutHash-contract in de tests sluit exact aan op de 7.2-implementatie (`sha256:<hex>`, trainer.py:303 → holdout-metrics.ts:24). Maar de onderstaande bevindingen — waarvan twee uit precies de foutklasse die de Epic 8-deploy braken — moeten in de story-files landen.

## Bevindingen

### 🔴 Critical

1. **Redis bestaat niet in de deployment-stack.** Story 9.1 opent met "Given de bestaande Redis-instantie", maar géén van de docker-compose-bestanden (acc/prod/dev/full/test) bevat een Redis-service; alleen een ongebruikte config-map `infrastructure/docker/redis/` en een optionele `REDIS_URL`-check in health.ts. BullMQ vereist Redis. Zonder expliciete taak (compose-wijzigingen + env + Coolify-deploy-verificatie) crasht Epic 9 bij de eerste deploy — identiek aan de gemiste Prisma-migratie die de Epic 8-deploy brak. Story 9.1 moet een infra-taak krijgen: Redis-service in alle relevante compose-files, persistent volume, healthcheck, `REDIS_URL` in build/runtime-env.

### 🟠 High

2. **Alle vier de ATDD-artifacts zijn ongetrackt** (`??`): de drie testbestanden én de checklist zijn nooit gecommit. Risico: verlies bij cleanup, en worktree-agents zien ze niet (de Epic 8-UI-agent concludeerde al foutief "pipeline-monitoring.spec.ts bestaat NIET in de repo"). Actie: committen vóór de implementatie start.
3. **De gedeferde 8.7-batch-hook ontbreekt in story 9.3's spec.** De deferral (build_synthetic_batch wiren in de build-batch-stap; besluit gebruiker 2026-06-04) staat in sprint-status en de 8.7-story-file, maar epics.md 9.3 noemt alleen "batch samenstellen" en er bestaat GEEN ATDD-test voor de synthetische tekort-aanvulling in de flow. Zonder expliciete story-taak + test herhaalt zich het 8.7-patroon: gebouwd maar nooit gewired.
4. **9.5's activatie-log heeft geen datamodel.** Het schema kent geen `auditLog` of `modelActivationLog`. De ATDD-test asserteert op `mockPrisma.auditLog?.create ?? mockPrisma.modelActivationLog?.create` — beide `undefined` → `expect(undefined).toHaveBeenCalledWith(...)` crasht hard in plaats van netjes te falen. De story-file moet (a) het datamodel-besluit vastleggen (eigen tabel + migratie + init.sql + GRANT — let op de 0006-les) en (b) de test volgens het 8.2-precedent corrigeren (gedocumenteerde testfout-correctie, intentie behouden).
5. **E2e Journey 4 (8.5) is gedrift t.o.v. de opgeleverde UI.** De test navigeert naar `/training`, maar de gebouwde review-UI leeft op `/artwork-review` (ArtworkReviewPage; testid `review-item-provenance` bestaat daar wél). Bovendien is story 8.5 inmiddels done — deze test hoort nú geüpdatet en ontskipt te worden, niet pas bij Epic 9.

### 🟡 Medium

6. **Geen champion-edgecase.** 9.4's AC's en alle drie de gate-tests veronderstellen een bestaande champion. Wat als er geen actief model is (eerste run, of actief model zonder holdout-metrics — modellen van vóór 7.2)? Gate-gedrag ongespecificeerd: auto-pass, auto-fail of blokkeren?
7. **Gate-failure-notificatiepad ongetest.** 9.4 AC2 (challenger faalt → wél registreren, niet aanbieden, notificatie met vergelijkingscijfers) heeft geen ATDD-test; alleen het verdict-object wordt getest.
8. **NFR8-KPI zonder bron of test.** 9.5 AC3 ("doorlooptijd feedback → actief model als KPI-meting") heeft geen test, geen datamodel-bron (welke timestamps?) en geen plek in het approval-contract. Onmeetbaar zoals gespecificeerd.
9. **E2e-tests Journey 1–3 zijn niet zelfstandig uitvoerbaar.** Geen arrange/seed-fase: ze vereisen toevallig aanwezige jobs, notificaties en gate-passing challengers in een live stack. Exact de fout die bij Epic 8's 8.1-tests in de adversarial-update gecorrigeerd is ("zelfstandig uitvoerbaar contract"). Seed-strategie (test-API of fixtures) moet in de story-files.
10. **Notificatie-persistentie ongespecificeerd.** 9.2 specificeert alleen een Socket.IO-emit (vluchtig), maar e2e Journey 2 verwacht een notificatie die zichtbaar is bij páginabezoek — dat impliceert persistente opslag (tabel? ongelezen-status?) die nergens gespecificeerd is. Offline datamanagers missen anders elke trigger.

### 🔵 Low

11. **`isServiceRequest`-test drukt geen echt contract af:** vergelijkt tegen `process.env.PIPELINE_SERVICE_KEY || 'test-service-key'` — bij ontbrekende env accepteert een triviale implementatie alles; niets over timing-safe vergelijking of key-beheer (waar leeft de key in Coolify?).
12. **Trainingsvenster-test is cosmetisch:** alleen `opts.window` toBeDefined — formaat noch gedrag ("start alleen binnen venster") wordt afgedwongen; concurrency=1 wel.
13. **Dedup-venster niet herstart-bestendig gespecificeerd:** de test verwacht in-memory dedup (2× aanroep → 1 emit); AC zegt "configureerbaar venster" maar of dedup een API-herstart moet overleven (Redis/DB) is open — relevant want NFR1 eist juist crash-bestendigheid.
14. **ATDD-checklist is op punten verouderd na Epic 8:** noemt `db_service.get_class_counts` als toe te voegen (bestaat sinds 8.7) en het Epic 8-deel als RED (is groen/opgeleverd). Checklist bijwerken vóór hergebruik als contract-bron.
15. **9.6's mini-dataset ("tientallen images in de repo") ongespecificeerd qua opslag:** binaire fixtures in git zonder afspraak over omvang/LFS; en de configureerbare gate-drempel (FR56 "configureerbare drempel") heeft nergens een test met een afwijkende drempelwaarde.

## Aanbevolen verwerking

1. Redis-infra als expliciete taak in story 9.1 (compose + env + deploy-verificatie) — **blocker**
2. ATDD-artifacts committen (aparte commit, vóór implementatie)
3. Batch-hook expliciet in story 9.3 + nieuwe ATDD-test (build-batch → build_synthetic_batch)
4. Datamodel-besluit activatie-log in story 9.5 + testcorrectie volgens 8.2-precedent
5. E2e Journey 4 nu updaten/ontskippen (route `/artwork-review`); Journeys 1–3 van seed-fase voorzien in story-files
6. Edgecases (geen champion, gate-failure-notificatie, NFR8-bron, notificatie-persistentie) als AC's/taken in de story-files 9.2/9.4/9.5
7. Checklist epic-8-9 actualiseren (Epic 8 = opgeleverd; get_class_counts bestaat)
