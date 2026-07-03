# AC→test-mapping — Story 13.4

Elk acceptatiecriterium met de dekkende geautomatiseerde test(s). Suites draaien
groen: API vitest 377 passed / 2 skipped (31 files); ml-service pytest
`test_outlier_service.py` 11 passed.

| AC | Kern | Dekkende test(s) |
|----|------|------------------|
| **1** — Migratie + FK, toestemming + down-script | `apps/api/prisma/migrations/0014_add_promotion_batches/migration.sql` (tabel + FK op `reference_candidates.promotion_batch_id`) + `down.sql` (drop FK + drop tabel). Lokaal toegepast (localhost:5432 bevestigd); tabel + FK geverifieerd via `pg_constraint`. Schema-model `PromotionBatch` typechekt. | Migratie-toepassing + FK-verificatie (handmatig, in het implement-verslag); `npx tsc --noEmit` groen op het nieuwe model. |
| **2** — Nachtelijke bundeling door uitsluitend de worker; queue `flywheel`, concurrency 1, `upsertJobScheduler`, cron 01:00; claim `candidate → in_batch` conditioneel | Queue-fabriek + worker + scheduler + claim | `flywheel-worker-scheduler.test.ts` (queue flywheel · worker concurrency 1 · job-routing · upsertJobScheduler + tz + cron-default · geen repeat) · `flywheel-promotion-batch.test.ts` (claim via conditional update, hoogstens één batch) |
| **3** — Per-klasse cap; gecureerde tellen niet mee; ook ín de transactie afdwingbaar | `runCapPhase` + `countActivePromotionReferences` + `assertClassCapWithinTx` (FOR UPDATE, voor 13.5) | `flywheel-guardrails.test.ts` → `cap-fase (AC3)` (telling `active + source=flywheel-promotion`; afwijzen boven cap met reden `cap-bereikt`; ruime cap laat door) · `flywheel-config.test.ts` (cap default 10) |
| **4** — Tweetraps-dedup + kloon-gat | `runDedupPhase` (Hamming trap 1 + cosine trap 2), `hammingDistanceHex`, `hasCosineDuplicate` (SQL incl. inactieve flywheel/review-refs) | `flywheel-guardrails.test.ts` → `Hamming-afstand` + `dedup-fase (AC4)` (batch-intern hoogstens één overleeft; trap 2 cosine-match; kloon-gat-set in de SQL; geen valse afwijzing) |
| **5** — Zachte afwijzing → `rejected` + reden, GÉÉN hard-negative; hernominatie via reset | `softRejectCandidate` (conditional update + `evidence.rejectionReason`, nooit `hardNegative`) | `flywheel-guardrails.test.ts` → `softRejectCandidate (AC5)` (rejected + reden; **geen** hard_negatives-insert; idempotent 0 rows). Hernominatie-reset zelf leeft in `nomination.ts` (13.2) en is daar getest. |
| **6** — Per-batch outlier via `/ml/outlier-audit` | `runOutlierPhase` + `MLClient.outlierAudit` + ml `outlier.py`/endpoint + `get_reference_embeddings_for_class` | `flywheel-guardrails.test.ts` → `outlier-fase (AC6)` (is_outlier → zacht afgewezen; klasse zonder embeddings ongemoeid) · pytest `test_outlier_service.py` (centroid, afstand, grens, leeg-klasse, percentiel-pad) |
| **7** — gateResults per fase | `startPhaseRecord` / `isPhaseComplete` / per-fase-record + regressie-placeholder | `flywheel-guardrails.test.ts` → `gateResults-fase-records (AC7)` · `flywheel-promotion-batch.test.ts` (regressie not-run, batch blijft pending) |
| **8** — Crash-recovery (eerst pending hervatten, fase-idempotent) | `runPromotionLoop` + `processBatch` | `flywheel-promotion-batch.test.ts` → `runPromotionLoop (AC8)` (hervat vóór bundelen) + `processBatch (AC7/AC8)` (afgeronde fase overslaan; niet-pending overslaan) |
| **9** — Watchdog (laatste succesvolle run + >26h notificatie) | `watchdog.ts` (`markPromotionRunSuccess` / `getLastSuccessfulPromotionRun` / `runWatchdogCheck`) + overview-veld | `flywheel-watchdog.test.ts` (vastleggen/lezen · <26h geen melding · >26h notificatie via RetrainingNotification + Socket.IO · custom drempel · dedup · nooit-gedraaid) · `flywheel.routes.test.ts` (overview ontsluit `lastSuccessfulPromotionRun`) |

## Expliciet getest: concurrency / idempotentie / transactie-atomiciteit
- **Claim-atomiciteit + conditional update** — `bundleNewCandidates` in één `$transaction`; 0-rows-race → lege batch gesloten (`flywheel-promotion-batch.test.ts`).
- **Fase-idempotentie bij hervatting** — afgeronde fase (`finishedAt`) overgeslagen (`processBatch` test).
- **Worker-concurrency 1** — asserted op de Worker-constructie (`flywheel-worker-scheduler.test.ts`).
- **Zachte-afwijzing-idempotentie** — 0 rows affected → geen dubbele evidence-schrijf.
- **Cap ín de transactie** — `assertClassCapWithinTx` levert de `SELECT … FOR UPDATE`-variant voor 13.5 (SQL-vorm tegen de echte DB geverifieerd).
