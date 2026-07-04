# AC → test-traceability — Story 18.1

| AC | Omschrijving | Dekkende test(s) | Status |
|----|--------------|------------------|--------|
| AC1 | Go/no-go governance-akkoord prod-read vóór start | GEEN test — governance-moment, akkoord gegeven 2026-07-04, gedocumenteerd in Dev Agent Record (§Governance). Expliciet vervuld. | vervuld/gedocumenteerd |
| AC2 (vullen zonder overschrijven) | `artwork_imports.gln` vullen uit export, bestaande niet-lege GLN's nooit overschrijven | `backfill-gln-from-tradeitems.test.ts`: "apply schrijft alleen gln-null-rijen" (fillGln met (gtin,gln)); prod-dep `fillGln`/`markReason` filteren `where gln: null` | gedekt |
| AC2 (_id-mapping) | GLN afleiden uit `{gln}-{gtin}-528` | `backfill...test.ts` › `parseGlnFromId` (5 cases: standaard, GLN-met-koppelteken, verkeerde TM, verkeerde GTIN, lege prefix) | gedekt |
| AC2 (uitvalreden, geen stille uitval) | elk record zonder GLN krijgt een reden | `backfill...test.ts` › `decideOutcome` (geen-tradeitem / meerdere-glns / duplicaten); apply-test markeert gB/gC | gedekt |
| AC2 (idempotent) | herdraaien voegt niets toe | `backfill...test.ts` › "is idempotent: zonder null-GLN-GTINs 0 writes" | gedekt |
| AC2 (dry-run toont plan, schrijft niets) | `--dry-run` = 0 PG + 0 Redis | `backfill...test.ts` › "dry-run schrijft NIETS" (fillGln/markReason/preload not called, writes=0, preloaded=0) | gedekt |
| AC2 (Redis-preload declaraties) | preload na vulling, throttled/fail-safe | `backfill...test.ts` › apply-test (preload alleen voor gevulde GTIN, preloaded=1); `--skip-preload` respecteren | gedekt |
| AC3 | dashboard toont percentage records-met-GLN (≥90%) + uitval-verdeling per reden | `flywheel-gln-coverage.test.ts` (percentage/totalen/verdeling aflopend, targetMet ≥/<0,9, lege-tabel null, DB-fout gooit) | gedekt |

## Volledige suite

- api vitest: zie IMPLEMENT_SPRINT_EPIC_RESULT (volledige `vitest run`).
- Migratie 0020 lokaal toegepast (localhost:5432 bevestigd), additief + down.sql.
