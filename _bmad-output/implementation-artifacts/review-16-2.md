# Adversarial self-review — Story 16.2 (Gedeclareerd-niet-gevonden wordt werkvoorraad)

reviewed_commit: (zie eind-commit epic/vliegwiel-16)
verdict: PASS
scope: apps/api (migratie 0019 + mismatch-workload-service + overview-sub-service + herleidbaarheids-endpoint + tests)

## Checklist (protocol §3 C)

- Alle AC geïmplementeerd? Ja — zie ac-trace-16-2.md (AC1 migratie+down, AC2 drempel/routering/idempotentie/excluded-guard, AC3 herleidbaarheid, AC4 tests).
- Architectuur-patterns gevolgd? Ja — AD-2 (API-eigendom bootstrap_queue), AD-6 (geen nieuwe scheduler; on-read bij overview), AD-13/NFR-1 (herleidbaarheid uit mismatch_events), AD-16-analogie (status vaste waardenset, alleen `wachtend` gezet). VarChar-status (geen Prisma-enum), snake_case @@map/@map, @db.Timestamptz — conform Structural Seed en het MismatchEvent-precedent (16.1).
- Graceful degradation correct? Ja — de overview-sub-service faalt sectie-lokaal (leeg-maar-available paneel); het endpoint geeft 404/500 i.p.v. te crashen. Getest.
- Security/secrets? Geen — endpoint is ADMIN-only (REQUIRE_ADMIN), read-only, geen geheimen.
- Dode code / debug-statements? Nee — de vervangen stub `getBootstrapQueuePanel()` is verwijderd; geen console-logs (createLogger).

## Bevindingen per severity

### Critical
- Geen.

### High
- H1 (opgelost): de aggregatie moet cohort-herkomst uitsluiten (16.4-vervuiling) én uitsluitend `type='declared-not-found'` tellen — niet alle mismatch-typen. Bevestigd in de query (`WHERE type='declared-not-found' AND origin NOT LIKE 'cohort-%'`) + test "filtert op declared-not-found + sluit cohort uit" + live-DB-integratiecheck (12 events/6 GTINs, cohort-event correct uitgesloten).
- H2 (opgelost): excluded-guard mag een uitgesloten klasse (17.2) nooit terug op `wachtend` zetten. `loadExcludedClasses()` leest `excluded=true` en de upsert-lus slaat die codes over (`skippedExcluded`). Test "excluded-guard" + "gemengde run" dekken dit.

### Medium
- M1 (opgelost): idempotentie — `t3777Code` UNIEK + `upsert` (create/update naar status `wachtend`) i.p.v. insert. Twee runs → twee upsert-calls op dezelfde where-sleutel, geen duplicaat. Test "idempotent".
- M2 (opgelost): drempel-randgevallen (≥ INCLUSIEF). 9/5→niets, 10/4→niets, 10/5→item. Pure functie los getest (N×M-matrix) + env-override-pad.
- M3 (afweging, geaccepteerd): `runMismatchWorkloadAggregation()` past de routeringsregel (actieve-klasse → signaal, anders queue) inline toe op de reeds DB-getelde codes i.p.v. de pure `aggregateDeclaredNotFound()` opnieuw over ruwe events te draaien. Reden: de DB doet COUNT(*)+COUNT(DISTINCT) met HAVING zodat er nooit een volledige event-tabel in het geheugen komt (performance/schaalbaarheid). De pure functie blijft de canonieke, los geteste drempel-/routeringslogica; de routeringsregel is identiek en apart getest in de run-tests. Geen gedragsdivergentie.

### Low
- L1 (opgelost): begrenzing — wachtrij-paneel `take: MAX_ROWS=200`, herleidbaarheid `take: MAX_TRACE_EVENTS=500`; geen onbegrensde reads.
- L2 (opgelost): 404-semantiek — een code zonder onderliggende declared-not-found-events is geen werkvoorraad → endpoint 404 (getest), i.p.v. een lege 200 die "bestaat" suggereert.
- L3 (opgelost): deterministische sortering (events desc, dan code) zodat tests + UI stabiel zijn.

## Migratie (AC1)
- 0019_add_bootstrap_queue/migration.sql — uitsluitend 16.2-DDL (tabel + UNIQUE index t3777_code + status-index). Diff-drift (ongerelateerde `retraining_notifications ALTER … DROP DEFAULT` uit een pre-bestaande schema/DB-mismatch) is bewust weggelaten zodat de migratie additief en 16.2-only is.
- down.sql — `DROP TABLE IF EXISTS "bootstrap_queue"` (terugdraaipad).
- Lokaal toegepast op localhost:5432 (bevestigd), `prisma migrate status` = up to date. Kolommen + indexen geverifieerd tegen information_schema.
- Deploy op ACC/PROD vereist expliciete toestemming per geval (teamregel/ARCH-2) — NIET onderdeel van deze story.

Alle bevindingen (critical t/m low) opgelost of expliciet als afweging gedocumenteerd (M3). Volledige apps/api vitest groen: 660 passed / 2 skipped / 33 todo.
