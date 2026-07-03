# Post-implementation adversarial review — Epic 16 (16.1–16.4) + Story 12.8

reviewed_commit: c0333546000cb8f6e19c4679907cdc24ac0e8e47  (== code-dragende HEAD na fixes; zie fix-log)
base: 75f7bd4 (acc met Epics 13+14+15)
verdict: PASS
reviewer: adversarial review-agent (post-stall herstel), 2026-07-03
DB-veiligheid: enige DB = DATABASE_URL=postgresql://postgres:postgres@localhost:5432/logo_recognition (lokaal, geverifieerd via `prisma migrate status`); geen remote geraakt.

## Diff-scope (75f7bd4..c0333546000cb8f6e19c4679907cdc24ac0e8e47)
Eén repo (logoRecognition), alleen apps/api + apps/ml-service + apps/web-typedef + docs.
- apps/api services/flywheel: `mismatch-events.ts`, `mismatch-workload.ts`, `data-quality-report.ts`, `control-cohort.ts`, `reference-path-guard.ts`, `config.ts`, `scheduler.ts`, `overview/{index,mismatch-trends,cohort-trend,overview-bootstrap-queue,empty-panels}.ts`
- apps/api pipeline: `verify-flow.ts` (nieuw), `workers.ts`, `detection-flow.ts`
- apps/api: `api/v1/{verify-declared,flywheel}.ts`, `main.ts`, `services/{ml-client,t3777-aliases,t3777-declarations}.ts`, `scripts/seed-control-cohort.ts`
- Prisma: schema (`MismatchEvent`, `BootstrapQueue`) + migraties 0018 + 0019 (elk met down.sql)
- apps/ml-service: `app/api/artwork.py` (`filter_templates_by_codes` + `LocalizeRequest.codes`) + pure pytest
- apps/web: `flywheelService.ts` + `SignalPanels.tsx` (type-verruiming, paneel toont lege staat)
- `.env.example`, `versions.md`, tests (12 test-/atdd-bestanden), ac-trace + review-docs per story

## Review-dimensies — uitkomst

1. **Cross-story mismatch-typeset-consistentie — SOLIDE.** De vier typen (`confirmed`/`declared-not-found`/`not-supported`/`found-not-declared`) worden identiek gebruikt in 16.1-registratie (`mapMismatchEvents`), 16.1-trend (`overview/mismatch-trends.addToCounts`), 16.2-werkvoorraad (`type = 'declared-not-found'`), 16.3-rapport (`type = 'found-not-declared'`) en 16.4-cohorttrend (`addToCounts`). Cohort-uitsluiting (`origin NOT LIKE 'cohort-%'` / `NOT startsWith 'cohort-'`) aanwezig in ÁLLE 6 reguliere read-sites (mismatch-trends ×3, mismatch-workload `loadCandidateCounts` + `getWorkloadItemTraceability`, data-quality-report); cohort-trend gebruikt de inverse `LIKE 'cohort-%'`. Geverifieerd via grep over alle `mismatch_events`-queries + de regressietests in `flywheel-mismatch.test.ts` (`getMismatchTrends … cohort uitgesloten`) en `flywheel-workload.test.ts`.

2. **Meetinstrument-isolatie (KRITIEK) — DEFENSIEF EN GETEST.** `runCohortRerun` roept `runVerifyDeclared(..., { skipFlywheelHooks: true })`. In `verify-flow.ts` slaat die vlag het gehele `runFlywheelHooks`-blok over (nominatie 13.2 + kruischeck-mismatch-events 16.1). Test `verify-flow.test.ts:310` zet BEIDE vlaggen (`FLYWHEEL_NOMINATION_ENABLED` + `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`) op `true`, draait met `skipFlywheelHooks: true`, en assert dat `mismatchEvent.createMany`, `artworkReviewItem.createMany` én `trainingData.create` NIET aangeroepen worden. Self-feeding meetinstrument is daarmee aantoonbaar uitgesloten. De cohort registreert zijn eigen events los via `registerCohortMismatchEvents` (herkomst `cohort-<runId>`, GEEN vlag — correct, want zonder writes is er niets te meten).

3. **12.8-integratie — CORRECT.** AC8 (geen review-items/trainingsdata): de verify-flow roept bewust NIET `crosscheckDetections` aan; hergebruikt alleen de pure `getThresholdForMethod`. Getest (`AC8: never creates review items or training data`). Vliegwiel-haakjes alleen bij CONFIRMED (`runFlywheelHooks` filtert `verdict === 'CONFIRMED'`), achter `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` die óók de hoofdvlag eist (`config.isKruischeckNominationEnabled`) — default uit → verdict-response byte-gelijk (response wordt in stap 7 weggeschreven vóór de haakjes in stap 8). Alias-canonicalisatie (C1-fix): `runFlywheelHooks` krijgt canonieke declared-codes (`aliased.map(a => a.canonical)`); `declaredSet` voor `undeclaredFindings` en `confirmedCodes` leven in dezelfde canonieke ruimte. Vlag-scoping AD-8 met de 4×combinatie-matrix getest in `flywheel-mismatch.test.ts:200`.

4. **Migraties 0018 + 0019 — ADDITIEF, VEILIG.** Beide `CREATE TABLE` (nieuw), elk met `down.sql` (`DROP TABLE IF EXISTS`). `prisma migrate status` lokaal: "Database schema is up to date", 19 migraties, geen drift. Schema.prisma matcht de SQL (VarChar-typeset i.p.v. Prisma-enum, `@db.Timestamptz`, DESC-index op createdAt, indexen op t3777Code/gln; bootstrap_queue UNIQUE op t3777_code + status-index). Geen DDL buiten de twee tabellen.

5. **Concurrency/idempotentie — CORRECT.** `bootstrap_queue`-upsert op unieke `t3777Code` (status → `wachtend`), met excluded-guard vóór de upsert (`if (excluded.has(...)) skip`) — een `excluded=true`-rij wordt nooit teruggezet. Mismatch-events per-run (`createMany`, geen dedup — bewust, AD-13 per-run-observaties; getest "herverwerking … schrijft opnieuw"). Cohort-scheduler: 4e Job Scheduler op queue `flywheel` (worker concurrency 1), `upsertJobScheduler` (idempotent, niet het gedeprecieerde repeat-patroon), pauze-check bij start (`shouldSkipForPause`), wall-clock time-box (`getCohortMaxSeconds`, default 3600s) met resterende GTINs als uitval. AD-6/AD-11/NFR-3 gerespecteerd.

6. **Security / NFR-6 — AFGEDWONGEN.** 16.3-rapport leidt `sourceFile` deterministisch af uit de eigen-crop-conventie (`artwork-crops/{gtin}/`) en laat élk pad door `sanitizeSourcePath` (reference-path-guard). Guard weigert `reference-logos/`-paden (incl. `./`- en `/`-prefix) → `null` + gelogde waarschuwing; getest in `flywheel-reference-path-guard.test.ts` (10 tests, incl. de gelogde warning + eigen-pad-passthrough). verify-declared-auth: hergebruikt bestaande `apiKeyAuth` (x-api-key) OF `authMiddleware` (JWT); expliciete 401 zonder credential (getest `AC9: returns 401 without any auth`). data-quality + alle flywheel-routes: `REQUIRE_ADMIN`. Geen secrets in de diff; geen gelekte gidsbeelden.

7. **Dode code / debug / AC-afwijkingen — SCHOON.** Geen `console.log`/`debugger`/`.only`/TODO/FIXME in de nieuwe bronbestanden (seed-`console.log` is bewuste CLI-uitvoer, identiek patroon `seed-gold-set.ts`). Gedocumenteerde variances correct afgehandeld: 12.8-AC10 (ACC-bewijs) = post-deploy operationeel (buiten implement-sprint, genoteerd); 16.3 dashboard-exportknop uitgesteld naar 15.x (CSV-serializer wél geleverd + getest). AC-trace 12.8 + 16.1–16.4 aanwezig, elk AC → een test die in de diff staat.

## Bevindingen per severity

### Critical — geen.
### High — geen.
### Medium — geen.

### Low
- **L1 (GEFIXT) — `.env.example`: nieuwe/relevante Epic 16- + 12.8-env-vars ontbraken.** `.env.example:57` — alleen de 16.4-cohort-vars stonden gedocumenteerd; `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` (16.1, AD-8 tweede vlag), `FLYWHEEL_STRUCTURAL_N`/`_M` (16.2) en `VERIFY_RUN_STATE_TTL_S` (12.8) ontbraken — afwijking van de story-guardrail "documenteer nieuwe env vars in het env-voorbeeldbestand". Geen runtime-impact (alle drie hebben veilige code-defaults), daarom Low. FIX: blokken toegevoegd aan `.env.example` (16.1-vlag, 16.2-drempels, 12.8-TTL) met defaults + toelichting.

### Observaties (geen bevinding — bewuste ontwerpkeuzes, genoteerd voor volledigheid)
- **O1 — on-read write op `/flywheel/overview`.** `getBootstrapQueueOverview` draait `runMismatchWorkloadAggregation` (upsert bootstrap_queue) op het GET-overview-pad. Bewuste 16.2-keuze (AD-6 "geen nieuwe scheduler", 14.2-precedent); pad is ADMIN-only dashboard, niet het hete live-detectie-pad → NFR-3 ongeschonden. Best-effort (fout → leeg paneel).
- **O2 — `runMismatchWorkloadAggregation` herimplementeert de routeringsregel inline** i.p.v. de pure `aggregateDeclaredNotFound` aan te roepen (het heeft de DB-tellingen al). Regel is één ternary (`activeClasses.has(code) ? 'aanvul-signaal' : 'bootstrap-queue'`), identiek aan de pure functie die apart getest is. Verwaarloosbare DRY-nuance.
- **O3 — doc-drift, geen code-defect.** `review-16-4.md` heeft een placeholder `reviewed_commit` (geen hash); `ac-trace-12-8.md` noemt "5 tests" waar `test_localize_codes_filter.py` er 6 heeft. Cosmetisch.

## Acceptance-audit per story

| Story | AC's | Automatisch gedekt | Waivers |
|-------|------|--------------------|---------|
| 12.8 | 10 | 9/9 (AC1–AC9); AC10 = post-deploy operationeel (ACC-bewijs, buiten implement-sprint) | AC10 (operationeel, gedocumenteerd) |
| 16.1 | 6 | 6/6 (AC5 aggregatie + AC3 4-vlag-matrix + typeset-randgevallen); AC4 = menselijke afstemtaak (koppel-klare functie + docblock geleverd) | AC4 (menselijke taak, genoteerd) |
| 16.2 | — | werkvoorraad-aggregatie + traceability-route + idempotente upsert + excluded-guard getest (`flywheel-workload.test.ts`, `flywheel-workload-traceability.routes.test.ts`) | geen |
| 16.3 | — | rapport + CSV + NFR-6-guard getest (`flywheel-data-quality-report.*`) | dashboard-exportknop → 15.x (variance genoteerd) |
| 16.4 | 5 | 5/5 (ratio-randgevallen, cohort-resolutie, pauze-check, isolatie, cohort-uitsluiting-regressie) | geen |

## Fix-log
- L1: `.env.example` uitgebreid met `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`, `FLYWHEEL_STRUCTURAL_N`/`_M`, `VERIFY_RUN_STATE_TTL_S` (+ toelichting). Commit: c0333546000cb8f6e19c4679907cdc24ac0e8e47.

## Testuitslag ná fix (tegen c0333546000cb8f6e19c4679907cdc24ac0e8e47)
- apps/api vitest (`npx vitest run`, DATABASE_URL lokaal): **736 passed | 2 skipped | 27 todo** (65 files passed, 4 skipped).
- ml-service pure pytest (`test_localize_codes_filter.py`): schoon overgeslagen op deze box (numpy/cv2 afwezig — de test `pytest.importorskip`t bewust; draait op CI/ml-image). De pure `filter_templates_by_codes`-logica komt exact overeen met de 6 test-assumpties.

## Eindoordeel
verdict: **PASS** op c0333546000cb8f6e19c4679907cdc24ac0e8e47. Eén Low-bevinding (env-documentatie) gevonden en gefixt; geen critical/high/medium. De kritieke meetinstrument-isolatie (skipFlywheelHooks) en de vlag-scoping (AD-8, byte-gelijke n8n-response) zijn correct geïmplementeerd én met gerichte tests afgedekt. De mismatch-keten is cross-story consistent, de cohort-uitsluiting is overal aanwezig, de migraties zijn additief met down-scripts en er is geen schema-drift.
