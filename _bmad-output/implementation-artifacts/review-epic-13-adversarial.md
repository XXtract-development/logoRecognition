# Adversarial review — Epic 13 (Referentie-vliegwiel fundament)

reviewed_commit: b223097   # code-dragende fix-commit; dit rapport is de docs-commit direct erboven (epic-HEAD)
verdict: PASS
epic_head: b27951e     # HEAD van deze docs-commit (report zelf)
pre_fix_commit: d1a84b6 (pre-fix state = FAIL: H1 test-regressie + M1 livelock)
base: a54be87
branch: epic/vliegwiel-13
reviewer: post-implementation adversarial (BMAD fase F)
db: lokaal (postgresql://postgres@localhost:5432/logo_recognition) — migrate status up-to-date, 15 migraties

## Samenvatting bevindingen

| Severity | Aantal | Gefixt |
|----------|--------|--------|
| Critical | 0 | — |
| High     | 1 | 1 |
| Medium   | 1 | 1 |
| Low      | 2 | 2 |
| **Totaal** | **4** | **4** |

Geen kritieke cross-story-fricties. De code respecteert de status-machine, de
atomaire promotie (AD-3), de fail-closed-poort (AD-11), de pauze-scope en de
idempotentie/conditional-updates consistent over 13.2–13.6. De hard-negative-enum,
de content-hash-herkomst (AD-14) en de baseline-abstractie (13.5 leest / 13.6
schrijft) sluiten sluitend aan. De twee inhoudelijke bevindingen zijn (1) een
over-brede guard-test uit 13.1 die op legitiem downstream-gebruik faalt en (2) een
ontbrekende `flywheel-reembed`-handler waardoor de versie-guard (AD-5) een
kandidaat na modelactivatie niet kan laten terugkeren.

## Bevindingen

### High

- **H1 — `apps/ml-service/tests/unit/test_no_node_content_hash.py:36` — De AD-14-guard
  faalt op de VOLLEDIGE epic-diff (regex te breed).** De guard verbiedt élke
  `.ts` (behalve `ml-client.ts`) die de string `content[_-]?hash` bevat. 13.1 was
  groen omdat alleen `ml-client.ts` de term noemde; 13.2/13.5/13.6 refereren nu
  legitiem het *veld* `contentHash` (opslag/lezen — géén berekening). Overtreders
  bevatten geen enkele `crypto`/`createHash`/`sha256` (grep-geverifieerd): de
  AD-14-invariant (één hash-implementatie, in ml-service) is NIET geschonden — de
  test is fout. Gevolg: de epic kon geen eerlijke groene ml-service-suite claimen;
  de story-rapporten draaiden alleen `regression_eval`+`outlier` en misten deze
  regressie. **Fix:** de guard matcht nu daadwerkelijke Node-hash-*berekening*
  (een hash-API dicht bij een content-hash-referentie), niet kale veldreferenties
  — docstring-intentie behouden.

### Medium

- **M1 — `apps/api/src/services/flywheel/gate.ts:203` + `workers.ts:processFlywheelJob`
  — Enqueued `flywheel-reembed`-job heeft geen handler (versie-guard livelock,
  AD-5).** De versie-guard zet een kandidaat met afwijkende embedding-modelversie
  terug (`in_batch → candidate`) en enqueue-t een `flywheel-reembed`-job op de
  flywheel-queue. `processFlywheelJob` kent alleen `flywheel-promotion` en
  `flywheel-watchdog`; de `default`-tak retourneert `undefined` → de job "slaagt"
  zonder iets te doen. De kandidaat wordt dus nooit her-geëmbed en valt bij elke
  volgende poortrun opnieuw door de versie-guard — hij komt na een modelactivatie
  nooit meer vooruit. Story 13.5 taak 3.1 vereist expliciet dat de her-embed-taak
  "de embedding herberekent en de nieuwe modelversie in evidence zet". Geen
  datacorruptie/geen foutieve promotie (de kandidaat stagneert enkel).
  **Fix:** `flywheel-reembed`-handler toegevoegd (`reembed.ts`) die de
  candidate-embedding herberekent tegen de actieve modelversie en die versie in
  evidence schrijft; `processFlywheelJob` routeert de job.

### Low

- **L1 — `test_no_node_content_hash.py` draaide niet in de epic-groene-claim.**
  Symptoom van H1: de story-rapporten (13.5/13.6) claimen "ml-service pytest 23
  passed" — uitsluitend `regression_eval`(12)+`outlier`(11). De `tests/unit/`-map
  bevat óók phash-endpoint- en guard-tests die niet in dat getal zaten. Na de
  H1-fix draait de volledige `tests/unit/` groen (zie test-uitslag). Procesnoot,
  geen aparte code-fix bovenop H1.

- **L2 — `apps/api/src/services/flywheel/guardrails.ts:174` — `runThresholdPhase`
  release-reden-string niet in de zachte-reden-enum (geen bug, cosmetisch).** De
  drempel-fase gebruikt `releaseCandidate(id, 'onder-drempel')` (vrijgave →
  `candidate`), bewust géén `softRejectCandidate`; correct per AD-16 (de drempel
  schoof, de kandidaat is niet slecht). De reden-string `'onder-drempel'` is
  vrije loggingtekst, geen enum-waarde — consistent bedoeld. Geverifieerd als
  correct gedrag; geen fix nodig (opgenomen voor volledigheid van de audit).

## Acceptance-audit per story

Alle AC→test-mappings bestaan op de branch en de genoemde tests staan in de diff
en asserten het AC-gedrag. Zelf nagelopen tegen de code:

- **13.1 (canonieke content-hash)** — AC gedekt: `content_hash`/`perceptual_hash`
  met gepind normalisatie-contract (Pillow/ImageHash gepind), fail-closed load,
  `/ml/phash`-endpoint, MLClient-delegatie, AD-14-guard. **Kanttekening H1:** de
  guard-test zelf was te breed (nu gefixt).
- **13.2 (nominatie)** — AC gedekt: vlag-splitsing (hoofd+kruischeck), declaratie-
  bevestiging, per-methode-drempel, synchrone `/ml/phash` fail-closed, hard-negative-
  blokkade, `@@unique`-idempotentie, zachte-reden-reset, transactionele
  kandidaat+embedding, crosscheck/kruischeck/review-hooks, gemiste-teller.
- **13.3 (gold-set)** — AC gedekt: `gold_set_records` + immutability-guard
  (replacedById-only), actieve-set = `replacedById IS NULL`, idempotente seed met
  droge-run (91 crop + 212 GTIN-records), evidence-behoud.
- **13.4 (promotielus/guardrails)** — AC gedekt: queue `flywheel` concurrency 1,
  `upsertJobScheduler` cron 01:00 Europe/Amsterdam, conditional claim, per-klasse
  cap (+`FOR UPDATE`-variant), tweetraps-dedup incl. kloon-gat, outlier-audit,
  zachte-afwijzing zonder hard-negative, gateResults per fase, crash-recovery,
  watchdog >26u.
- **13.5 (kwaliteitspoort)** — AC gedekt: schaduw-eval (actief UNION schaduwset,
  self-match-guard, klasse-scoping), nulmeting-baseline, verse nulmeting bij stale,
  tolerantie (sample <200 / 1pp ≥200), atomaire promotie (INSERT ReferenceLogo +
  embedding-kopie + status→promoted, cap ín tx), quarantaine + delta + meest
  getroffen klassen + notificatie, fail-closed. **Kanttekening M1:** versie-guard
  zet terug + enqueue, maar de reembed-consument ontbrak (nu gefixt).
- **13.6 (rollback/pauze/stilstand)** — AC gedekt: `system_settings` + down,
  rollback (soft-delete + `passed→rolled_back` conditioneel + rollback-record +
  baseline-stale + ml-reload; 404/409/400/403), baseline-invalidatie op alle vier
  triggerpaden (rollback/curatie/legacy-12.3/outlier-marker), auto-stilstand K=2,
  pauze-scope (nominatie + batch-verwerking; read-only draait door),
  hard-negative-export (menselijke categorie, CSV, ADMIN).

## Dimensie-checks (spine)

1. **Cross-story-consistentie:** status-machine `candidate/in_batch/promoted/
   rejected` + terugkeer-overgangen consistent toegepast in nomination(13.2),
   guardrails/promotion-batch(13.4), gate/promotion(13.5), rollback(13.6). Alle
   overgangen zijn conditional updates (`updateMany WHERE status=…`; 0 rows =
   overslaan). Hard-negative-enum (`HUMAN_HARD_NEGATIVE_REASONS`) gedeeld contract
   in `types.ts`, gelezen door de export. contentHash-herkomst (AD-14) overal via
   `/ml/phash`. Baseline-abstractie sluit (13.5 `isBaselineStale`/`consumeBaselineStale`
   ← 13.6 `markBaselineStale`).
2. **Migratievolgorde 0012→0015:** FK's kloppen — `promotionBatchId` nullable
   zonder FK in 0012, FK toegevoegd in 0014; geen destructieve mutatie van
   bestaande tabellen (0014 voegt alleen index + FK toe); elke migratie heeft
   `down.sql`; `prisma migrate status` = up-to-date tegen de lokale DB (15
   migraties).
3. **Concurrency/idempotentie:** worker-concurrency 1 (flywheel-queue);
   cap-in-transactie met `SELECT … FOR UPDATE`; conditional updates overal;
   crash-recovery hervat `pending`-batches fase-idempotent via `gateResults`;
   `@@unique([contentHash,t3777Code])` dedupt. Geen dubbele-promotie-race gevonden.
4. **AD-naleving:** AD-1 (12.3-ombuiging achter hoofdvlag; legacy-pad met vlag uit
   ongewijzigd) ✔; AD-3 (atomaire promotie incl. embedding-KOPIE, geen
   herberekening; 0-row/geen-embedding → hele tx terug) ✔; AD-5 (schaduwset alleen
   `in_batch`, self-match-guard, versie-guard [zie M1], baseline-invalidatie op 4
   paden) ✔ (na M1-fix volledig); AD-8 (twee vlaggen, kruischeck vereist beide) ✔;
   AD-9 (pgvector-cosine + centroid in ml-service) ✔; AD-11 (fail-closed
   quarantaine, persistente pauze, pauze-scope) ✔; AD-14 (canonieke hash alleen
   ml-service, Node delegeert) ✔ (H1 was testfout, geen code-schending); AD-15
   (endpoints muteren alleen status/enqueue; poort alleen in worker; rollback is
   toegestane statusmutatie) ✔; AD-16 (409 op in_batch/pending decision — endpoint
   nog niet in 13.x-scope, status-machine wél) ✔.
5. **Integratiegrenzen:** hooks staan NAAST de 8.6-trainingsdata-registratie
   (ongewijzigd); verdict-pad (kruischeck) contractueel ongemoeid; ml-service-
   additties onder `app/` (constraint 2) — `phash.py`/`outlier.py`/`regression_eval.py`
   in `app/services/`, endpoints in `app/api/flywheel.py`; MLClient enige ml-route.
6. **Security/secrets:** geen hardcoded secrets; raw pgvector-queries volledig
   geparametriseerd (`Prisma.sql`/`$queryRaw` met bind-params, `Prisma.join` voor
   id-lijsten); env-vlaggen default veilig (nominatie + kruischeck default `false`
   → gedrag byte-gelijk aan vandaag).
7. **Deployment-volgorde:** stories raken api+ml-service; uitrol ml-service → api
   (nieuwe `/ml/phash`, `/ml/outlier-audit`, `/ml/regression-eval` moeten live zijn
   vóór de API ze aanroept). Gedocumenteerd in de operationele envelope §5. Met de
   hoofdvlag default uit is er geen live-risico bij een versievolgorde-afwijking
   (de API roept de nieuwe endpoints pas aan zodra de vlag aan gaat) — restrisico
   laag, expliciet benoemd.
8. **Dode code/exports/debug:** geen `console.log`/debug-prints; alle `logger.*`
   is productie-logging. Geen ongebruikte exports gevonden behalve de (nu
   gefixte) reembed-loze enqueue (M1).

## Diff-scope

Eén repo (`logoRecognition`, monorepo). 115 bestanden, +15338/−32.
- `apps/api/`: 15 flywheel-services + `flywheel.ts`-routes + 4 migraties
  (0012–0015) + schema (6 modellen) + integratie in workers/detection-flow/
  queue/main/artwork-pipeline/reference-logos + seed-script + ml-client-methoden;
  tests.
- `apps/ml-service/app/`: `phash.py`, `outlier.py`, `regression_eval.py`,
  `database.py`-accessors, `api/flywheel.py`; tests. requirements +ImageHash.
- `_bmad-output/`: planningsset (PRD/UX/architecture/epics) + story-files +
  ac-traces + reviews.

## Fix-log

Fixes (Engelse commit-messages, Co-Authored-By Claude Opus 4.8):
- `b223097` — H1 + M1 in één commit:
  - H1 — hardened AD-14 guard test (`test_no_node_content_hash.py`) to match Node
    hash *computation* (crypto/createHash/sha256/hashlib/imagehash/digest near een
    content-hash-referentie), niet kale veldreferenties.
  - M1 — added `flywheel-reembed` handler (`apps/api/src/services/flywheel/
    reembed.ts`) + routing in `processFlywheelJob` (`workers.ts`); version-mismatched
    candidates now re-embed against the active model version and record it in
    evidence (Story 13.5 taak 3.1). Coverage: `flywheel-reembed.test.ts` (4 tests).
- `5b3edbb561f90929044c899181ea7e8fafee6d3c` — dit reviewrapport op de branch.

Na fixes: apps/api vitest volledig groen; ml-service `tests/unit/` volledig groen.
