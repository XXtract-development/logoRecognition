# Epic 17 — Post-implementation adversarial review (seed-bootstrap voor lege klassen)

reviewed_commit: 6c8f2921f86a1a13d0ec1a3a06f6a3bc064691c1   # == code-dragende HEAD na fixes
base: 5c922a0 (acc, Epics 13-16 + 12.8)
verdict: PASS

Scope: de volledige epic-diff `5c922a0..HEAD` — Story 17.1 (bootstrap-run per lege
klasse: ml-service zaad-zoektocht + API-job) en Story 17.2 (wachtrij-prioritering,
beheer-endpoint, paneel). Jacht op échte defecten die de story-agenten samen
introduceerden; geen stijlkritiek.

---

## Diff-scope (per component)

| Component | Bestanden (nieuw/gewijzigd) |
|---|---|
| ml-service (17.1) | `app/services/bootstrap_search.py` (nieuw), `app/api/flywheel.py` (+`/ml/bootstrap-search`), `tests/unit/test_bootstrap_search_service.py` (nieuw) |
| API (17.1) | `services/flywheel/bootstrap-run.ts` (nieuw), `services/flywheel/config.ts` (+3 env), `services/ml-client.ts` (+`bootstrapSearch`), `services/pipeline/workers.ts` (job-route), `.env.example` (+3) |
| API (17.2) | `services/flywheel/bootstrap-queue.ts` (nieuw), `services/flywheel/bootstrap-frequency.ts` (nieuw), `scripts/seed-bootstrap-queue.ts` (nieuw), `api/v1/flywheel.ts` (+ bootstrap-queue GET/POST/PATCH) |
| Web (17.2) | `components/flywheel/BootstrapQueuePanel.tsx` (nieuw), `services/flywheelService.ts` (+bootstrap), `components/flywheel/SignalPanels.tsx` (stub verwijderd), `pages/FlywheelPage.tsx` (import-swap) |
| Tests | api: bootstrap-run/queue/routes/seed + `setup.ts`-mock; web: BootstrapQueuePanel + FlywheelPage; ml: pytest |

---

## Bevindingen per severity

### Critical — geen

### High

- **H1 — `BootstrapQueuePanel.tsx:222` (was): AC4-doorklik navigeerde naar
  `/flywheel/batches/{t3777Code}` — een gegarandeerde 404.** De batch-detail-route
  (`getBatchDetail`, `services/flywheel/batch-detail.ts:163`) resolvet uitsluitend op
  het **promotie-batch-id (UUID)** (`promotionBatch.findUnique({ where: { id } })`).
  Een T3777-code (bv. `GREEN_DOT`) als id levert altijd `BatchDetailNotFoundError` →
  404. AC4 ("doorklik toont de gepromoveerde referenties met hun evidence-contract")
  werd dus nooit gehaald; de web-test (`BootstrapQueuePanel.test.tsx:154`) codeerde het
  foute contract (`navigate('/flywheel/batches/ACTIVATED')`) hard en de ac-trace
  bestempelde het als "AC4 = navigatie" — de bug werd door de eigen test bevestigd i.p.v.
  gevangen. **GEFIXT** (zie fix-log F1): de read-side levert nu per nieuw-geactiveerde
  code het promotie-batch-id (`determineNewlyActivatedCodes` → `Map<code, batchId>`,
  nieuwste batch wint), de view draagt `activatedBatchId`, en het paneel navigeert op
  dat id (en schakelt de doorklik uit als er geen batch-id is). Tests bijgewerkt om het
  batch-id-contract af te dwingen i.p.v. de code.

### Medium — geen open

### Low

- **L1 — overview levert nog een `bootstrapQueue`-paneelpayload (16.2) die de
  FlywheelPage niet meer consumeert.** `services/flywheel/overview/overview-bootstrap-queue.ts`
  vult `data.bootstrapQueue`; sinds 17.2 haalt het paneel zijn data zelf op
  (`/flywheel/bootstrap-queue`) en gebruikt `FlywheelPage.tsx` `data.bootstrapQueue`
  nergens meer. Geen regressie (16.2 bezit dat paneel + eigen tests; de overview-response
  blijft geldig), enkel een nu-onbenut veld. **Geen fix** — verwijderen valt buiten Epic
  17-scope en zou 16.2-tests raken; genoteerd voor een 16.2-opruimstory.

---

## Reviewdimensies (expliciet afgelopen)

1. **Cross-story-consistentie 17.1 ↔ 17.2.** Statusset gedeeld en consistent:
   17.1 schrijft `gedraaid`/`gevuld`/`leeg` + `lastRunAt` (`bootstrap-run.ts:169,342`);
   17.2 leest die en beheert `wachtend`/`uitgesloten` + override. `enqueueBootstrapRun`
   (17.1) wordt door het 17.2-paneel via `POST …/bootstrap-queue {action:'enqueue'}`
   hergebruikt — geen tweede enqueue-pad. Run-selectie (`runBootstrap`,
   `bootstrap-run.ts:376-384`) filtert `excluded:false` en sorteert op dezelfde
   effectieve volgorde (override → frequentie → createdAt) die 17.2 toont — geen
   divergente prioritering. Prioriteringsbron consistent met 16.2: de seed verrijkt
   bestaande FR-15-rijen enkel qua frequentie, overschrijft status nooit
   (`seed-bootstrap-queue.ts:108-115`, race-veilige upsert `:197-208`).

2. **NFR-6 (zaad nooit referentie/export/rapport) — KRITIEK, dubbel geborgd.**
   - ml-service: het zaad wordt enkel geëmbed, nooit `put_training_image`
     (`bootstrap_search.py:130-135`); een als artwork-regio meegelifte kopie van het zaad
     wordt via inhouds-digest-guard uit de output geweerd (`:205-211`, `seed_leaks_skipped`).
     Getest: `test_zaadbeeld_verschijnt_nooit_in_output_crops` (+ assert dat het zaadpad
     nooit als crop geüpload wordt).
   - API: nomineert uitsluitend de door de ml-service teruggegeven ECHTE crop-paden
     (`artwork-crops/{gtin}/…`) via de 13.2-service; geen directe referentie-writes
     (`bootstrap-run.ts:295-312`). Een geslaagde bootstrap promoveert dus alleen echte
     crops, nooit het zaad. Het 17.2-paneel toont enkel codes/frequenties/status — geen
     gids-logo-thumbnails.

3. **AD-naleving.**
   - AD-6: job op queue `flywheel` (concurrency 1, gedeeld met promotie/harvest/audit),
     on-demand enqueue, geen nieuwe scheduler (`bootstrap-run.ts:48-50,422-439`;
     `workers.ts` route). Run-budget (`FLYWHEEL_BOOTSTRAP_RUN_BUDGET`=200) + time-box
     (`FLYWHEEL_BOOTSTRAP_MAX_SECONDS`=1800s) hard afgedwongen: budget telt per GTIN incl.
     niet-declarerende (`:214-240`), deadline gecheckt in de klasse-lus én de job-lus
     (`:219,391`).
   - AD-8: hoofdvlag-guard bij job-start (`runBootstrap:361`) → skip `vlag-uit`, geen
     mutatie/nominatie. Getest.
   - AD-9: alle beeld/vector (regio's, embeddings, cosine) in ml-service; API beslist op
     scores.
   - AD-11: pauze-guard bij job-start (`shouldSkipForPause`, `:367`); wachtrij-reads
     (`getBootstrapQueue`) checken géén pauze — reads draaien door tijdens pauze. Correct.
   - AD-13: elke wachtrij-mutatie (override/uitsluiten/toevoegen) gelogd in
     `threshold_changes` met userId + reden, atomair in dezelfde transactie als de mutatie
     (`bootstrap-queue.ts:217-246,260-274,300-314,346-352`). Getest incl. userId-assert.

4. **Kwaliteitspoort-hergebruik.** Bootstrap-vondsten lopen via exact dezelfde
   `nominateCandidate` (13.2) als reguliere kandidaten — enkel `origin:'bootstrap'`
   verschilt (`bootstrap-run.ts:298-310`). Zelfde vlag/pauze/declaratie/drempel/pHash/
   hard-negative-poort (`nomination.ts:91-169`); geen afgezwakt pad. Herkomst `bootstrap`
   zit in de evidence-enum (`config.ts:25`).

5. **Regressies.** Overview modulair uitgebreid; de dode lege-staat-stub
   `BootstrapQueuePanel` in `SignalPanels.tsx` correct verwijderd (import-swap in
   `FlywheelPage.tsx`), `EmptyPanel`/`useTranslation` blijven in gebruik door andere
   panelen. Geen bestaand `/flywheel`-endpoint of -scherm gebroken; volledige api- en
   web-suite groen (geen verzwakte asserts). tsc api schoon; de enige web-tsc-melding
   (`MobileReviewDeck.test.tsx:14` unused React) is pre-existing op base 5c922a0, buiten
   de epic-diff.

6. **Security / dode code / debug.** Alle bootstrap-endpoints `requireRole('ADMIN')`.
   Geen secrets, geen `console.*`-debug in productiepaden (seed-script `console.log` is
   bewuste CLI-uitvoer met eslint-disable). Geen `git add .`-vervuiling.

---

## Acceptance-audit per story

### Story 17.1 — Bootstrap-run per lege klasse

| AC | Oordeel | Bewijs |
|----|---------|--------|
| AC1 Gerichte zoektocht binnen declarerende GTINs (harde per-GTIN declaratie-guard) | PASS | `bootstrap-run.ts:225-235` (reason `ok` én code ∈ declaratie, anders overgeslagen/geteld/gelogd); tests in `flywheel-bootstrap-run.test.ts` |
| AC2 Zaad wordt nooit referentie (NFR-6) | PASS | ml-service seed-guard + API nomineert enkel echte crops; pytest `test_zaadbeeld_verschijnt_nooit_in_output_crops` |
| AC3 Lege run → terug in wachtrij | PASS | `finalizeClass('leeg')` + `lastRunAt`; klasse blijft `wachtend`-opneembaar |
| AC4 Run-budget + time-box | PASS | `getBootstrapRunBudget`/`getBootstrapMaxSeconds`; budget+deadline in beide lussen |
| AC5 Pauze-scope | PASS | `shouldSkipForPause` bij job-start |
| AC6 Hoofdvlag-scope (AD-8) | PASS | `isNominationEnabled()`-guard bij job-start |
| AC7 Tests (unit/pytest/integratie) | PASS | api-vitest + pytest (pytest lokaal niet herdraaibaar — geen numpy; story-record 9 passed) |

### Story 17.2 — Bootstrap-wachtrij: prioritering en beheer

| AC | Oordeel | Bewijs |
|----|---------|--------|
| AC1 Initiële vulling op declaratiefrequentie (idempotent seed, --dry-run, status-guard) | PASS | `seed-bootstrap-queue.ts` + `bootstrap-frequency.ts`; `seed-bootstrap-queue.test.ts` |
| AC2 Paneel + beheer-endpoint (override/uitsluiten/toevoegen, elke mutatie gelogd, uitgesloten nooit verwerkt) | PASS | `bootstrap-queue.ts` + `api/v1/flywheel.ts`; service-/route-/web-tests |
| AC3 Nieuw geactiveerde klasse (read-side) | PASS | `determineNewlyActivatedCodes` (origin=bootstrap + actieve flywheel-promotion-referentie); tests |
| AC4 Doorklik naar bewijs (batch-detail 15.3) | PASS **na fix H1** | doorklik navigeert nu op promotie-batch-id (UUID); `activatedBatchId` in de view; web-/service-tests dwingen het batch-id-contract af |
| AC5 Tests (unit/integratie/web/contract-regressie) | PASS | volledige api+web-suite groen |

---

## Fix-log

| ID | Bevinding | Fix | Bestanden | Commit |
|----|-----------|-----|-----------|--------|
| F1 | H1 — AC4-doorklik naar T3777-code i.p.v. promotie-batch-id (404) | Read-side levert per code het promotie-batch-id (nieuwste batch wint); view-veld `activatedBatchId`; paneel navigeert op batch-id + disabled zonder id; tests dwingen batch-id-contract af | `services/flywheel/bootstrap-queue.ts`, `web/services/flywheelService.ts`, `web/components/flywheel/BootstrapQueuePanel.tsx`, `api/__tests__/services/flywheel-bootstrap-queue.test.ts`, `web/components/flywheel/BootstrapQueuePanel.test.tsx` | 6c8f2921f86a1a13d0ec1a3a06f6a3bc064691c1 |

---

## Testuitslag na fixes (tegen HEAD)

- **apps/api vitest** (DATABASE_URL lokaal): 792 passed | 2 skipped | 37 todo (74 files).
- **apps/web vitest**: 125 passed | 16 todo (22 files, 1 skipped).
- **apps/ml-service pytest**: lokaal niet herdraaibaar in deze omgeving (numpy ontbreekt);
  ongewijzigd door de fix (fix raakt alleen API+web); story-record: 9 passed.
- tsc: api schoon; web enige melding pre-existing buiten epic-diff.

verdict: PASS
