# Retrospective — Epic 13: Zelfvullende referentiebibliotheek (promotielus)

**Datum:** 2026-07-03 · **Branch:** `epic/vliegwiel-13` · **HEAD:** `8c76506` · **Base:** `a54be87`
**Stories:** 13.1–13.6 (6/6 done) · **Diff:** 115 bestanden, ~15.3k regels · **Migraties:** 0012–0015

## Wat ging goed

- **Lokale-DB-gating werkte veilig.** Alle vier de migraties (0012–0015) draaiden uitsluitend tegen de geïsoleerde `pgvector/pg16`-container op localhost:5432, vóór elke `prisma`-actie geverifieerd op de host-string. Geen enkele actie raakte ACC/prod (Cherry 10.0.0.6). De databaseveiligheidsregel is door de hele run gehandhaafd.
- **Per-story worktree-discipline + onafhankelijke git-verificatie.** Elke story kreeg status-lock-step (story-`.md` + sprint-status), meegecommit met de code; de orchestrator verifieerde elke `done` met een verse `git show` + zelf-gedraaide vitest — nooit op de self-report vertrouwd. De testtelling klopte elke keer.
- **De adversarial gate ving twee echte gaten** die de story-agenten misten: een te brede AD-14-guardtest die de epic-groene-claim ondermijnde (H1), en een versie-guard-livelock (M1: `flywheel-reembed`-job zonder handler → kandidaten met verouderde modelversie werden eeuwig teruggezet, nooit her-geëmbed). Beide zijn gedicht en getest. Zonder de epic-brede review waren beide pas in productie zichtbaar geworden.
- **De baseline-abstractie ontkoppelde 13.5 en 13.6 netjes** (13.5 leest de stale-marker, 13.6 levert de schrijfkant + `system_settings`-bron), zodat de stories sequentieel maar onafhankelijk gebouwd konden worden.

## Wat brak / lastig was

- **`prisma migrate dev` werkt niet non-interactief.** Uitgeweken naar `migrate diff` + `migrate deploy`; de shadow-DB vereiste eenmalig de rol `logorecognition` in de container. Gedocumenteerd, maar kostte iteraties.
- **ml-service pytest kon niet volledig lokaal draaien** (torch/asyncpg/minio in de zware `app.services.__init__`-keten). De pure-functie-tests (phash, outlier, regression_eval) draaien via een importlib-/pad-omweg; de endpoint-pytests die de volledige runtime vereisen zijn lokaal niet uitgevoerd. In CI met de volledige requirements draaien ze via het normale importpad.
- **Diff-drift bij migratie-generatie.** `migrate diff` pikte tweemaal een ongerelateerde default op (`retraining_notifications`); handmatig uit de migratie verwijderd zodat elke migratie uitsluitend zijn eigen DDL bevat.

## Patronen / afspraken hieruit

1. **Migratie-fasering van FK's over stories** werkt: nullable kolom in de story die 'm introduceert (0012 `promotionBatchId`), FK-constraint in de story die de doeltabel maakt (0014 `promotion_batches`). Aanhouden voor latere epics.
2. **De AD-14-guardtest moet op *hash-berekening* filteren, niet op het *veld* `contentHash`** — anders faalt hij op legitiem lezen/opslaan. Als sjabloon voor soortgelijke "alleen-hier-toegestaan"-guards in latere stories.
3. **Elke enqueue heeft een handler nodig** — de M1-livelock ontstond doordat een job wél gepland maar niet verwerkt werd. Bij latere jobs (14.3 outlier-audit, 16.4 cohort, 17.1 bootstrap): handler + no-op-test verplicht.
4. **De epic-brede adversarial review moet de guard-/gate-tests tegen de volledige merge draaien**, niet alleen de story-eigen subset — daar zat H1.

## Openstaand richting latere epics (geen blocker voor Epic 13)

- Kruischeck-nominatie (13.2) is koppel-klaar maar wacht op de 12.8-verify-flow (niet-blokkerend, achter aparte vlag default uit).
- De watchdog "laatste succesvolle run" leeft nu migratie-loos (Redis); bij Epic 15/dashboard eventueel naar `system_settings` verplaatsen.
- Gemiste-nominatie-tellers zijn Redis-indicatief (restrisico bij Redis-flush gedocumenteerd in 13.2).
