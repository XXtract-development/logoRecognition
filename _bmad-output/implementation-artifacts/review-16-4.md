# Adversarial self-review — Story 16.4 (Controle-cohort voor de bevestigingsgraad-trend)

reviewed_commit: (epic/vliegwiel-16 HEAD na 16.4-implementatie)
verdict: PASS
migratie: NEE (system_settings + mismatch_events volstaan — bestaande contracten)

## Scope van de diff
- NIEUW `apps/api/src/services/flywheel/control-cohort.ts` — cohort-resolutie, pure ratio-berekening, de maandelijkse `runCohortRerun`-job (pauze-check → resolve → per-GTIN 12.8-verify → cohort-events → time-box/tempering).
- NIEUW `apps/api/src/services/flywheel/overview/cohort-trend.ts` — CONFIRMED-ratio-trend per cohort-run (`origin LIKE 'cohort-%'`), overview-sub-service.
- NIEUW `apps/api/src/scripts/seed-control-cohort.ts` — idempotente, `--dry-run`-bare seed die de cohort-definitie in `system_settings` vastlegt.
- GEWIJZIGD `mismatch-events.ts` — publieke `registerCohortMismatchEvents` (herkomst `cohort-<runId>`, GEEN vlag: meetinstrument).
- GEWIJZIGD `verify-flow.ts` — `runVerifyDeclared(..., { skipFlywheelHooks })` zodat de cohortrun nooit nominaties/kruischeck-events maakt (isolatie).
- GEWIJZIGD `scheduler.ts` — 4e Job Scheduler `flywheel-cohort-rerun` (upsertJobScheduler, `FLYWHEEL_COHORT_CRON`, tz Europe/Amsterdam).
- GEWIJZIGD `workers.ts` — flywheel-worker routeert `flywheel-cohort-rerun` → `runCohortRerun`.
- GEWIJZIGD `config.ts` — `getCohortCron`/`getCohortMaxSeconds`/`getCohortGtinDelayMs` + defaults.
- GEWIJZIGD `overview/index.ts` — `cohortTrend`-paneel opgenomen (sectie-lokaal).
- GEWIJZIGD `.env.example` — FLYWHEEL_COHORT_* gedocumenteerd.
- Tests: nieuw `flywheel-control-cohort.atdd.test.ts` (RED-scaffold vervangen door 21 GREEN-tests); +1 isolatie-test in `verify-flow.test.ts`; `flywheel-worker-scheduler.test.ts` bijgewerkt (3→4 schedulers + cohort-assert).

## Bevindingen per severity

### Critical
- Geen.

### High
- **H1 — Side-effect-lek via de kruischeck-vlag (GEFIXT).** `runCohortRerun` roept de 12.8-`runVerifyDeclared` aan, wiens flywheel-hooks (nominatie + kruischeck-mismatch-events) achter `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` staan. Staat die vlag in productie AAN (het doel van de live kruischeck), dan zou de cohortrun nominaties én kruischeck-herkomst-events maken — die laatste worden NIET uit de reguliere aggregaties gefilterd → vervuiling + schending van het meetinstrument-principe (guardrail "geen nominaties/registraties vanuit de cohortrun").
  Fix: `runVerifyDeclared` kreeg `{ skipFlywheelHooks?: boolean }`; de cohort-default geeft `true`. Getest in `verify-flow.test.ts` ("skipFlywheelHooks: no nomination/mismatch writes even with the flags ON").

### Medium
- **M1 — Run-id-granulariteit (geaccepteerd).** `newCohortRunId` gebruikt secondegranulariteit. Twee runs in dezelfde seconde zouden in één trendpunt vallen. Voor een maandelijkse job op een concurrency-1-queue is dat praktisch onmogelijk; bewust simpel gehouden (geen extra state).
- **M2 — Dubbele `resolveGln` (geaccepteerd).** De cohortrun resolvet gln los per GTIN voor het event; de verify-flow deed dat intern al. Eén extra, best-effort, nullable lookup per GTIN — verwaarloosbaar bij ~100 GTINs/maand; houdt de cohort-registratie ontkoppeld van de verify-interne staat.

### Low
- **L1 — `sleep(delayMs)` na de laatste GTIN (geaccepteerd).** Default 0; verwaarloosbaar.
- **L2 — eslint `no-console`-directives in de seed (geaccepteerd).** Identiek patroon als het bestaande `seed-gold-set.ts` (warning, geen error) — consistentie boven micro-churn.

## Checklist
- Alle AC geïmplementeerd? Ja (zie ac-trace-16-4.md).
- Architectuur-patterns gevolgd (AD-6 upsertJobScheduler, AD-11 pauze-scope, NFR-3 worker-pad/time-box, AD-13 herleidbaarheid via `cohort-<runId>`)? Ja.
- Cohort-stabiliteit (SM-3): runs muteren de definitie nooit — getest ("definitie ongemoeid", upsert niet aangeroepen). Ja.
- Cohort-uitsluiting uit reguliere aggregaties (16.1/16.2/16.3, `origin NOT LIKE 'cohort-%'`): pre-existing + geregresseerd getest. Ja.
- Graceful degradation: per-GTIN fail-safe (uitval ≠ declared-not-found), best-effort event-registratie, sectie-lokaal overview-paneel. Ja.
- Security/secrets: geen. Geen dode code/debug-statements.
- Migratie: NEE — DB-veiligheid: enige DB = localhost:5432/logo_recognition (geverifieerd), tests volledig gemockt (geen echte writes).

## Fix-log
- H1 gefixt: `skipFlywheelHooks`-optie + cohort-default + isolatie-test. Alle bevindingen t/m low afgehandeld of expliciet geaccepteerd met reden.

## Testuitslag
- apps/api vitest: 736 passed | 2 skipped | 27 todo (765). Baseline was 714 → +22 (21 cohort + 1 verify-flow isolatie).
- web: niet geraakt (overview-API krijgt een extra `cohortTrend`-veld dat de frontend negeert tot er een paneel op gebouwd wordt; story vraagt server-side trend via de overview-API).
