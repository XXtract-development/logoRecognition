# Adversarial self-review — Story 13.4 (Nachtelijke promotielus: batching + guardrails)

reviewed_commit: (pre-commit; HEAD na commit hieronder)
verdict: PASS
scope: apps/api (queue/worker/scheduler + flywheel services + overview-route + migratie 0014) · apps/ml-service (outlier-service + /ml/outlier-audit + db-helper)

## Severity-bevindingen (critical → low) — allemaal gefixt

### Critical
- **C1 — Migratie-diff bevatte niet-gerelateerde drift.** `prisma migrate diff` genereerde
  óók `ALTER TABLE retraining_notifications ALTER COLUMN reasons DROP DEFAULT` (bestaande
  DB-drift, buiten 13.4-scope). **Fix:** die regel uit `0014/migration.sql` verwijderd; de
  migratie bevat uitsluitend de batch-tabel + FK + indexen. Geverifieerd tegen de live DB
  (localhost:5432): tabel + FK aanwezig, geen andere wijziging.
- **C2 — Zachte afwijzing mocht nooit een hard-negative schrijven (FR-9-kern).** **Borging:**
  expliciete test `softRejectCandidate … schrijft GÉÉN hard_negatives-rij`; `softRejectCandidate`
  raakt `hardNegative` nergens aan (grep-geverifieerd). Hard-negatives blijven exclusief
  menselijke-afkeuring-scope (13.6/14.1/15.3).

### High
- **H1 — Claim moet conditioneel + atomair (AD-15/AD-16).** `bundleNewCandidates` doet
  batch-INSERT + `updateMany(WHERE status='candidate' AND promotionBatchId IS NULL)` in één
  `$transaction`; 0 rows → lege batch wordt `rolled_back` gesloten (geen wees-batch). Getest.
- **H2 — Kloon-gat (AC4).** Trap-2-cosine-query test óók tegen INACTIEVE referenties van de
  klasse met source `flywheel-promotion`/`review`. In SQL geborgd
  (`rl.active=false AND rl.source = ANY(...)`); SQL-vorm tegen de echte DB geverifieerd.
- **H3 — Crash-recovery-volgorde + idempotentie (AC8).** `runPromotionLoop` verwerkt éérst alle
  `pending`-batches (oudste eerst), dán pas nieuwe bundeling; `processBatch` slaat een fase met
  `finishedAt !== null` over. Beide met test geborgd (volgorde-assert + fase-skip-assert).

### Medium
- **M1 — Deprecated repeat-patroon vermeden (AD-6).** Scheduler gebruikt
  `queue.upsertJobScheduler(...)` met `tz: 'Europe/Amsterdam'`; test asserteert dat er NOOIT
  `add(..., { repeat })` gebruikt wordt en dat de cron-default `0 1 * * *` is.
- **M2 — Worker-concurrency 1 (AD-6/AD-15).** `registerFlywheelWorker` construeert de Worker met
  `concurrency: 1`; test asserteert dat. Zo instantieert/vordert alléén deze worker een batch.
- **M3 — Watchdog migratie-loos (Project Structure variance).** `system_settings` bestaat pas na
  13.6; "laatste succesvolle run" leeft in Redis (`flywheel:last-successful-promotion-run`),
  gedocumenteerd in de watchdog-module-docstring en het Dev Agent Record. Nooit-gedraaid → geen
  valse stilstand-melding (test).
- **M4 — Regressie-fase niet "alvast" gebouwd (13.5-scope).** `processBatch` schrijft alleen de
  placeholder `gateResults.regression = { outcome: 'not-run' }` en laat de batch `pending`. Test
  asserteert not-run + dat de status nooit uit pending gehaald wordt.

### Low
- **L1 — ml-code onder `app/` (Constraint 2).** `outlier.py` staat in `app/services/`, endpoint in
  `app/api/flywheel.py`; niets in `scripts/`.
- **L2 — Leeg-klasse-randgeval outlier.** Klasse zonder actieve referentie → `centroid=None` →
  geen enkele kandidaat outlier (blokkeert niet op een lege klasse). Pytest-geborgd.
- **L3 — Self-match in dedup trap 2.** De kandidaat sluit zichzelf uit in de survivor-arm
  (`id !== candidateId`), zodat hij nooit tegen zichzelf matcht.
- **L4 — pgvector-cosine in SQL, geen Node-loops (AD-9-grens).** Trap 2 + centroid-afstand
  gebeuren in pgvector/numpy; Node draait geen cosine-loops.

## Graceful degradation
- pHash-ophalen faalt in dedup → trap 1 wordt overgeslagen (warn-log), trap 2 loopt door.
- `markPromotionRunSuccess` / Redis-reads zijn best-effort (warn-log, non-fataal).
- Watchdog-notificatie: Redis-dedup + unique-constraint-tolerantie zoals het 9.2-patroon.

## Dode code / debug
- Geen `console.log`/debug-statements; geen ongebruikte exports (cap-check `assertClassCapWithinTx`
  is bewust geëxporteerd voor 13.5, gedocumenteerd).

## DB-veiligheid
- Enige DB = `postgresql://postgres:postgres@localhost:5432/logo_recognition` (localhost bevestigd
  vóór elke prisma-actie). Migratie via `prisma migrate deploy` lokaal. Geen remote host geraakt.
