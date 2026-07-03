# AC→test-traceability — Story 16.1 (Mismatch-registratie en -aggregatie)

Branch: `epic/vliegwiel-16`. Testbestand tenzij anders vermeld:
`apps/api/src/__tests__/services/flywheel-mismatch.test.ts`.

| AC | Inhoud (kort) | Dekkende test(s) | Status |
|----|---------------|------------------|--------|
| AC1 | Prisma-migratie `mismatch_events` conform Structural Seed (kolommen, VarChar-type, Timestamptz, indexen createdAt desc + t3777Code + gln) + down-script; alleen na expliciete goedkeuring | Niet-code-AC. Geverifieerd via `apps/api/prisma/migrations/0018_add_mismatch_events/migration.sql` + `down.sql` en `prisma migrate status` (up to date, 18 migraties, lokale DB). Migratie al toegepast door vorige agent na goedkeuring. Schema-model `MismatchEvent` in `schema.prisma`. | Gedekt (bewijs-artefact) |
| AC2 | Per gedeclareerde code confirmed/declared-not-found/not-supported; per hoogbetrouwbare niet-gedeclareerde vondst found-not-declared; drempel per methode | `mapMismatchEvents (pure typeset)` (6 tests, incl. volledige typeset in één verwerking) + `found-not-declared drempel per methode` (7 randgevallen: op/onder/boven drempel, per methode + geen-methode) + `crosscheckResultToRegisterInput` (2) | Gedekt |
| AC3 | Vlag-scoping AD-8: crosscheck onder `FLYWHEEL_NOMINATION_ENABLED`, kruischeck onder `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`; kruischeck-uit = 0 rijen; beide default false | `vlag-scoping (AD-8, 4 vlag×pad-combinaties)` (5 tests: crosscheck aan/uit, kruischeck aan/uit, kruischeck-aan-maar-hoofdvlag-uit) | Gedekt |
| AC4 | Afstemmoment n8n/12.8 + vlag-gedrag in 12.8-API-docs | Niet-code-AC. Vastgelegd in het Dev Agent Record (Story-taak) + koppel-klare `registerKruischeckMismatchEvents` met docblock die het aansluitcontract beschrijft. Menselijke afstemtaak genoteerd. | Gedekt (documentair; menselijke taak open) |
| AC5 | Aggregatie ratio bevestigd/niet-gevonden per T3777-code én per GLN + trend via overview-API; cohort (`cohort-*`) uitgesloten; paneel-lege-staat zolang 15.2 ontbreekt | `confirmedRatio` (2) + `getMismatchTrends` (3 tests: aggregatie per code+GLN+trend met ratio, cohort-uitsluiting via WHERE, leesfout→leeg-available-paneel) + `flywheel-overview-compose.test.ts` (mismatchTrends available:true in de compositie) | Gedekt |
| AC6 | Tests: type-mapping, drempel-randgevallen, vlag-matrix, aggregatie, idempotentie gedocumenteerd | Alle bovenstaande + `register: per-run-observaties + fail-safe` (3 tests: herverwerking schrijft opnieuw = geen dedup, DB-fout non-fataal, lege invoer = geen persist) | Gedekt |

## Testtelling
- Nieuw testbestand: 29 tests, alle groen.
- Bijgewerkte bestaande tests (regressie door interface-wijziging): `flywheel-overview-panels.test.ts` (mismatch-stub-assertie verwijderd), `flywheel-overview-compose.test.ts` (mismatchTrends → available:true).
- Volledige apps/api-suite: 632 passed / 0 failed. apps/web: 115 passed / 0 failed.

## Niet-code-AC-verantwoording
AC1 en AC4 zijn geen puur-geautomatiseerd-testbare ACs. AC1 = migratie-artefact + `migrate status`-bewijs (geen throwaway-test die de DDL herhaalt). AC4 = menselijke afstemtaak + docblock-contract. Beide expliciet gemarkeerd, geen stille "visueel geverifieerd"-waiver.
