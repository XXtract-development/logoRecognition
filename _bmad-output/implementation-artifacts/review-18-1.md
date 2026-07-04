# Adversarial self-review — Story 18.1 (GLN-backfill via batch-export)

reviewed_commit: 4ce6d21
verdict: PASS
reviewer: self (adversarial), severity critical → low

## Scope

- `apps/api/prisma/schema.prisma` (+ migratie 0020 + down.sql)
- `apps/api/scripts/backfill-gln-from-tradeitems.ts`
- `apps/api/src/services/flywheel/overview/gln-coverage.ts` + `index.ts` (glnCoverage-paneel)
- verwijderde stub `overview/empty-panels.ts`
- tests: `flywheel-gln-coverage.test.ts`, `backfill-gln-from-tradeitems.test.ts`,
  `flywheel-overview-panels.test.ts` (M), `setup.ts` (M)

## Bevindingen per severity

### CRITICAL — geen

- **Prod-toegang in tests?** Nee. De scriptkern is I/O-vrij; de MongoDB-driver wordt
  lazy dynamisch geïmporteerd (`createMongoGlnLookup`) en NOOIT vanuit de tests
  aangeroepen. `main()` draait alleen achter `require.main === module`. Geen enkele
  test raakt prod/ACC-Mongo of de echte catalog-API.
- **Dry-run schrijft echt niets?** Ja, expliciet getest: in `runBackfill` met
  `dryRun: true` worden `fillGln`/`markReason`/`preload` nooit aangeroepen
  (`not.toHaveBeenCalled()`), `writes===0`, `preloaded===0`. Default = dry-run
  (`--apply` vereist om te schrijven).
- **Bestaande GLN overschrijven?** Nee. Beide PG-updates filteren op `gln: null`
  (`updateMany where gtin, gln: null`) — een niet-lege GLN wordt nooit geraakt,
  net als de 8-3O-upsert-regel.

### HIGH — geen

- **>1 GLN gokken?** Nee. `decideOutcome` dedupliceert en levert `meerdere-glns`
  bij >1 DISTINCTE GLN; duplicaten van dezelfde GLN blijven vulbaar (getest).
- **_id-parse robuustheid.** `parseGlnFromId` ankert op het `-{gtin}-{tm}`-achtervoegsel
  i.p.v. naïef splitsen op `-`, zodat GLN's met koppeltekens correct blijven
  (randgeval getest). Verkeerde TM/GTIN en lege prefix → `null` (getest).
- **Migratie-scope-drift.** `prisma migrate diff` bevatte ook een niet-gerelateerde
  `retraining_notifications DROP DEFAULT`; die is BEWUST uit 0020 gehouden. 0020 =
  uitsluitend `ADD COLUMN gln_backfill_reason`. Additief, lokaal toegepast, down.sql.

### MEDIUM — geen open

- **Deling-door-nul in het paneel.** Lege tabel → `percentage: null` (geen NaN),
  `targetMet: false` (getest).
- **Sectie-lokale fout.** `getGlnCoveragePanel` gooit bij een DB-fout; de composer
  (`overview/index.ts`) vangt dat via `panel(...)` af naar `{ error }` — de rest van
  het dashboard blijft bruikbaar (getest dat de sub-service gooit).
- **Preload fail-safe.** `preload` roept `resolveDeclarations` aan (nooit throwt) en
  is bovendien in `runBackfill` in een `.catch(() => false)` gewikkeld; een
  catalog-fout stopt de backfill niet.

### LOW — geen open

- **Dode code.** De stub `empty-panels.ts` is verwijderd (was de enige consumer
  `index.ts` + één test, beide bijgewerkt). Geen resterende imports (geverifieerd
  met grep). Geen debug-statements; logging via `createLogger`.
- **Secrets.** Geen creds in code; `TRADEITEMS_MONGO_URI` uit env, catalog-key via de
  bestaande provider (`CATALOG_API_KEY`, nooit gelogd). Niets gecommit.
- **AD-7-verbod.** De catalog-API-aanroep zit uitsluitend in de preload-fase op een
  al-bekende (gln, gtin) — declaratie-warming, geen GLN-bepaling. GLN-bron is
  uitsluitend tradeItems.

## Type-check & tests

- `tsc --noEmit` op apps/api: 0 errors.
- 26 nieuwe/geraakte tests groen; volledige api-suite groen (zie ac-trace-18-1.md).
