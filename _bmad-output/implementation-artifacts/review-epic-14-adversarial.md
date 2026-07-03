# Post-implementation adversarial review — Epic 14 (meegroeiend meetinstrument + outlier-audits)

reviewed_commit: 4c2ef26
verdict: PASS

Base: `9ef977d` (acc + Epic 13). Reviewed epic-HEAD vóór fixes: `87132b7`. Werkmap:
`/private/tmp/logoRecognition-implement-sprint/epic-14`, branch `epic/vliegwiel-14`.
DB-verificatie uitsluitend lokaal (`postgresql://postgres:postgres@localhost:5432/logo_recognition`).

## Diff-scope (per repo-onderdeel)

Eén repo (monorepo). 45 bestanden, +3806/−51. Kern-flywheel-bestanden:

- `apps/api/src/services/flywheel/` — `gold-set.ts` (14.1 aanwas/undo), `review-decision.ts` (14.1 orchestratie), `gold-set-composition.ts` (14.2), `outlier-audit.ts` + `outliers-overview.ts` (14.3), `config.ts`/`types.ts`/`scheduler.ts` (uitbreidingen).
- `apps/api/src/api/v1/artwork-pipeline.ts` (accept/annotate/reject/reopen-hooks), `flywheel.ts` (overview-panelen `goldSetComposition`, `outliers`, vlag `nominationEnabled`).
- `apps/api/src/services/pipeline/workers.ts` (job-route), `ml-client.ts` (`outlierAuditLibrary`).
- `apps/api/prisma/` — migratie `0016_add_outlier_findings` (+ down.sql), `schema.prisma` (`OutlierFinding`).
- `apps/ml-service/app/` — `services/outlier.py` (`audit_reference_library`), `api/flywheel.py` (library-modus), `services/database.py` (read-helper).
- `apps/web/src/` — `MobileReviewDeck.tsx` (redenkeuze-modal achter vlag), `artworkReviewService.ts` (`rejectReviewItem(reason?)`, `fetchNominationEnabled`).
- Tests (vitest + pytest), story-md's, ac-traces, per-story reviews, `versions.md`.

## Bevindingen per severity

### Critical — geen

### High — geen

### Medium

- **M1 — dubbele VALS gold-set-rij bij herhaalde reject "geen keurmerk".** `artwork-pipeline.ts:~1350` (reject-handler) — De 14.1-review accepteerde dit als waiver (narrow: register-ok/status-fail-retry). Herbeoordeling: het reject-pad had GEEN `item.status`-guard, dus élke dubbelklik/retry (niet alleen de retry-race) voedde de registers opnieuw. De hard-negative is idempotent (`upsert` op `contentHash`), maar de gold-set-VALS is append-only → een tweede `goldSetRecord.create`. Dat scheeft aantoonbaar de 14.2-samenstellingsbewaking (`gold-set-composition.ts:105/113/116` — `size`/`vals`/`echtRatio` tellen elke `replacedById IS NULL`-rij) én de 13.5-regressiemeting. Dit is een echt meetinstrument-risico. **GEFIXT** (zie M1-uitkomst). `severity: medium`.

### Low

- **L1 — dode code in ml-service.** `apps/ml-service/app/services/database.py:526` — `get_active_reference_classes()` toegevoegd maar nergens aangeroepen: `runOutlierAudit` (`outlier-audit.ts:141`) haalt de actieve klassen via Prisma op (AD-2: API bezit state). Ongebruikte read-helper. **GEFIXT** (verwijderd). `severity: low`.

## Herbeoordeling review-dimensies (geen bevinding = expliciet bevestigd)

1. **Cross-story-consistentie (gold-set-service 13.3/14.1/14.2).** Eén resolver voor de actieve set: `getActiveGoldSet()` (`gold-set.ts:72`, WHERE `replacedById IS NULL`) — 14.2 (`gold-set-composition.ts:209/240`) en 14.1-undo (`review-decision.ts:199`) leunen erop; geen divergente `replacedById`-query elders (geverifieerd via grep). Reden-enum: `REVIEWSTATION_GEEN_KEURMERK_REASON = 'reviewstation-geen-keurmerk'` is compile-time geborgd tegen `HUMAN_HARD_NEGATIVE_REASONS` (13.6-enum, `review-decision.ts:58`). Overview-endpoint (`flywheel.ts`): modulair — elk paneel één sub-service-aanroep (`goldSetComposition`, `outliers`), geen monoliet-handler; bestaande panelen (`missedNominations`, `pause`, watchdog) ongemoeid.
2. **Migratie 0016.** Additief (alleen `CREATE TABLE outlier_findings` + 3 indexen + FK). FK → `reference_logos(id)` `ON DELETE CASCADE` correct. `down.sql` aanwezig (`DROP TABLE IF EXISTS ... CASCADE`). `prisma migrate status` lokaal: "up to date" (16 migraties). Geen drift-DDL meegelekt (geen `retraining_notifications`-regel in 0016; handmatig geweerd, bevestigd door lezing).
3. **Concurrency/idempotentie.** Outlier-job: queue `flywheel`, concurrency 1 (`scheduler.ts`/`workers.ts`), `upsertJobScheduler` (Job Scheduler, geen deprecated `repeat`). Findings-dedup: check-then-insert op (`referenceLogoId`, status `open`) — niet atomair, maar concurrency 1 + elke referentie hoogstens één klasse per run maakt een intra-run-dubbel onmogelijk; acceptabel binnen AD-6. On-read gold-set-compositie: puur, geen job, geen cache (AD-6 ongeraakt), één query per overview.
4. **AD-naleving.** AD-4: gold-set immutable, geen `update` op inhoudskolommen / geen `delete` in `gold-set.ts`; self-tombstone undo (`replaced_by_id = id`, conditional) valt uit de actieve set. AD-6: Job Scheduler, geen deprecated repeat. AD-9: centroid/cosine/percentiel uitsluitend in ml-service (`outlier.py`); API past drempels toe. AD-11: outlier-audit doet BEWUST geen pauze-check (code-comment `outlier-audit.ts:24`), draait door bij pauze, deactiveert niets — enige writes zijn `outlier_findings`-inserts (geen write op `reference_logos`, testbewezen). AD-13: `auditRunAt`/evidence vastgelegd; herkomst/beslisser in gold-set-records.
5. **Integratiegrenzen.** Reviewstation accept/reject/undo-hooks staan achter `isNominationEnabled()`; vlag-uit = byte-gelijk legacy (regressietests). MobileReviewDeck-redenkeuze correct achter de vlag (`fetchNominationEnabled`, fail-safe → false). Alle ml-toevoegingen onder `apps/ml-service/app/` (constraint 2).
6. **Security/secrets, dode code, debug-prints.** Geen secrets/hardcoded creds. Logging via `createLogger`, geen `console.log`/`print`-debug. Dode code L1 gefixt.
7. **AC6 van 14.1 (menselijke afstemtaak).** Correct als OPEN MENSELIJKE TAAK gedocumenteerd (story `Completion Notes` + `review-14-1.md`); bewust geen codepad. Geen actie nodig — bevestigd.

## M1-uitkomst (expliciet, verplicht)

**GEFIXT.** Cheapest correct fix conform de task-hint ("dezelfde transactie / idempotente insert op natuurlijke sleutel"): een idempotentie-guard op de reject-handler die het register-voedende pad overslaat als `item.status === 'rejected'` (`artwork-pipeline.ts`, na de reden-parse). Spiegelt de bestaande `status === 'registered'`-guard van het accept-pad. Gevolg: een herhaalde reject-"geen keurmerk" (retry/dubbelklik) voedt de registers niet nog een keer — geen tweede VALS-`create`, geen tweede phash-call — terwijl de status-update byte-gelijk legacy blijft draaien (blijft 200 `rejected`). Geen migratie, geen kunstmatige unique-constraint die AD-4's append-only-model zou doorbreken. Regressietest toegevoegd (`artwork-pipeline.routes.test.ts`: "reject 'geen-keurmerk' op een AL afgewezen item → GEEN tweede VALS").

## Acceptance-audit per story

- **14.1** — AC1–AC5 gedekt (`ac-trace-14-1.md`), assertieve tests in de diff. AC6 = open menselijke taak (geen code, correct). M1-waiver hersteld naar echte fix. **PASS.**
- **14.2** — AC1–AC4 gedekt (`ac-trace-14-2.md`), 4/4 assertief. On-read, geen job, geen migratie; markeren-niet-blokkeren in `gateResults.goldSetCoverage`. **PASS.**
- **14.3** — AC1–AC5 gedekt (`ac-trace-14-3.md`), 5/5. Migratie 0016 + down-script, library-modus ml-service, wekelijkse Job Scheduler, read-only/deactiveert-niets. **PASS.**

## Testuitslag (na fixes, tegen 4c2ef26)

- apps/api vitest (volledige suite, DATABASE_URL lokaal): **508 passed / 2 skipped / 16 todo** (was 507; +1 M1-regressietest).
- ml-service pure pytests (`tests/unit/test_outlier_service.py`, anaconda-python numpy 1.26.4): **16 passed**.
- `tsc --noEmit` (apps/api): schoon (exit 0). `prisma migrate status` lokaal: up to date.

## Fix-log

| # | Bevinding | Fix | Commit |
|---|-----------|-----|--------|
| M1 | Dubbele VALS bij herhaalde reject | Idempotentie-guard `item.status === 'rejected'` op reject-register-pad + regressietest | 4c2ef26 |
| L1 | Dode `get_active_reference_classes` | Verwijderd uit `database.py` | 4c2ef26 |

## Conclusie

Twee bevindingen (1 medium herbeoordeeld uit de 14.1-waiver, 1 low), beide gefixt. Geen critical/high. De epic-diff is cross-story-consistent, migratie additief + reversibel, AD-naleving intact, integratiegrenzen achter de vlag byte-gelijk legacy. Volledige suite + pytests groen na de laatste fix. **Verdict: PASS.**
