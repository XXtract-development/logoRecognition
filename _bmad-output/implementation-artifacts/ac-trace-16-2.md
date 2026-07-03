# AC→test-traceability — Story 16.2 (Gedeclareerd-niet-gevonden wordt werkvoorraad)

Elk acceptatiecriterium met de dekkende geautomatiseerde test(s). Alle tests in
`apps/api` (vitest), gedraaid met de lokale DB (localhost:5432).

## AC1 — Migratie ter goedkeuring (ARCH-2) + terugdraaipad

Niet-code-AC (migratie-artefact). Geverifieerd via:
- `apps/api/prisma/migrations/0019_add_bootstrap_queue/migration.sql` — tabel
  `bootstrap_queue` conform Structural Seed: id uuid, `t3777_code` VARCHAR(100)
  UNIEK, `declaration_frequency` int default 0, `status` VARCHAR(20) default
  'wachtend' (géén Prisma-enum), `priority_override` int?, `excluded` bool default
  false, `last_run_at` timestamptz?, `created_at` timestamptz. Indexen: UNIQUE
  t3777_code + status.
- `apps/api/prisma/migrations/0019_add_bootstrap_queue/down.sql` — `DROP TABLE`.
- Prisma-model `BootstrapQueue` (`@@map("bootstrap_queue")`, snake_case @map).
- Lokaal toegepast (localhost:5432 bevestigd) via `prisma migrate deploy`;
  `prisma migrate status` = up to date; kolommen + indexen geverifieerd tegen
  information_schema. Deploy op ACC/PROD vereist expliciete toestemming per geval.

## AC2 — Structureel-drempel → werkvoorraad (FR-15)

Bestand: `src/__tests__/services/flywheel-workload.test.ts`

| Aspect | Test |
|---|---|
| Drempel-randgeval 9 events/5 GTINs → niets | `9 events / 5 GTINs → niets (onder N)` |
| Drempel-randgeval 10 events/4 GTINs → niets | `10 events / 4 GTINs → niets (onder M)` |
| Drempel-randgeval 10 events/5 GTINs → item (≥ inclusief) | `10 events / 5 GTINs → precies de drempel gehaald → item` |
| Routering lege klasse → bootstrap-queue | `code ZONDER actieve referenties → bootstrap-queue` + `runMismatchWorkloadAggregation … lege klasse boven drempel → upsert` |
| Routering zwakke klasse → aanvul-signaal | `code MET actieve referenties → aanvul-signaal` + `zwakke klasse (actieve ref) … → aanvul-signaal, GEEN upsert` |
| Events van meerdere codes vermengd | `events van meerdere codes vermengd → per code apart geteld + gerouted` |
| Dubbele events zelfde GTIN tellen als 1 GTIN | `dubbele events op dezelfde GTIN tellen als 1 GTIN maar N events` |
| Idempotente upsert (2e run geen duplicaat) | `idempotent: tweede run over dezelfde events upsert opnieuw` |
| Excluded-guard (uitgesloten blijft uitgesloten) | `excluded-guard: een uitgesloten code wordt NIET opnieuw geupsert` + `gemengde run` |
| Config-defaults N=10/M=5 + env-override | `structureel-drempel config (env-defaults + overrides)` (3 tests) |
| Query filtert declared-not-found + cohort uit | `de aggregatie-query filtert op declared-not-found + sluit cohort uit` (+ live-DB-integratiecheck) |
| Paneel wachtrij + signalen zichtbaar (dashboard-data) | `getBootstrapQueueOverview … levert de actuele wachtrij + signalen` |
| Paneel sectie-lokale degradatie | `een fout in de aggregatie → leeg-maar-available paneel` |

Compositie-integratie: `src/__tests__/services/flywheel-overview-compose.test.ts`
— `overview.bootstrapQueue` is nu `available: true` (verving de lege stub).

## AC3 — Herleidbaarheid naar GTINs (FR-15/NFR-1/AD-13)

Service: `src/__tests__/services/flywheel-workload.test.ts`
- `levert de onderliggende GTINs (uniek, gesorteerd) + verwerkingen`
- `query beperkt zich tot declared-not-found + sluit cohort uit`
- `geen onderliggende events → lege traceability`

Endpoint: `src/__tests__/api/flywheel-workload-traceability.routes.test.ts`
- `happy path → 200 met GTINs + verwerkingen`
- `geen onderliggende events → 404`
- `servicefout → 500`
- `USER (niet-admin) → 403` (ADMIN-only)

## AC4 — Tests

Unit: drempellogica-randgevallen (N×M-matrix), routering lege-vs-zwakke klasse,
idempotentie, excluded-guard — allemaal hierboven onder AC2.
Integratie (mock-driven + live-DB HAVING-check): geseede events → verwachte queue/
signaal-routering; herleidbaarheids-endpoint levert de onderliggende GTINs.
E2E: NIET aan de stable-subset-gate toegevoegd (conform story).

## Samenvatting

- AC's totaal: 4 (AC1 migratie-artefact, AC2/AC3/AC4 code).
- Code-AC's gedekt door geautomatiseerde tests: 3/3.
- AC1 gedekt via migratiebestanden + lokale `migrate deploy`/`migrate status`.
- Nieuwe tests: 28 (24 service + 4 endpoint). Volledige apps/api-suite: 660 passed /
  2 skipped / 33 todo.
