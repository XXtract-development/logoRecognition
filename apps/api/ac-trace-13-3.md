# AC→test-traceability — Story 13.3

Elke acceptatiecriterium → de geautomatiseerde test(s) die het gedrag assert.
Alle tests staan in de epic-diff.

## AC 1 — Migratie met toestemming (ARCH-2)

Aard: proces/artefact (migratie voorgelegd + down-script). Niet-uitvoerbaar als
unit-test; verantwoord via artefact-bewijs (geen agent-"visueel geverifieerd"):

- `apps/api/prisma/migrations/0013_add_gold_set_records/migration.sql` — de
  voorbereide migratie met docblock (variance-motivatie + 14.1-afstempunt).
- `apps/api/prisma/migrations/0013_add_gold_set_records/down.sql` — het verplichte
  terugdraaipad (DROP TABLE ... CASCADE).
- Lokaal toegepast tegen `localhost:5432` via `prisma migrate deploy`
  (DB-veiligheid geverifieerd: geen remote host); `prisma migrate status` =
  "up to date". Uitvoering op ACC/PROD blijft een expliciet toestemmingsmoment
  (nooit auto-migrate) — buiten story-scope.

Structuur-borging in code: `schema.prisma` `GoldSetRecord` (snake_case @@map,
@db.Uuid/gen_random_uuid, @db.Timestamptz, zelf-FK `replacedById`, indexen op
replacedById/t3777Code/createdAt). `prisma validate` groen; `prisma generate`
groen; typecheck (`tsc --noEmit`) zonder gold-set-fouten.

## AC 2 — Idempotente seed-import met droge-run

`src/__tests__/scripts/seed-gold-set.test.ts`:
- "parseert 91 oogstrun-records met crop-niveau" → 91 crop-records, label
  ECHT/VALS, cropPath gevuld, evidence bewaart bron-id + bbox.
- "waait 74 GTINs uit naar 212 GTIN-niveau records" → 212 (gtin,code)-paren,
  cropPath NULL, label ECHT.
- "buildImportPlan tegen lege DB plant alle 91 + 212 = 303 records" → plan-telling
  per bron/label.
- "idempotentie: een tweede run ... plant 0 inserts (AC2)" → tweede run 0 inserts,
  303 al aanwezig.
- "dedupKeyForExisting spiegelt de plan-sleutels" + "round-trip" → dedup herkent
  bestaande rijen (bewijst idempotentie tegen de DB, niet enkel binnen de run).
- "duplicaten BINNEN dezelfde run worden ook maar één keer gepland".
- "resolveSourcePaths ... bestanden bestaan" → legacy-snapshots vindbaar.

Droge-run (0 writes): de dry-run-tak roept enkel `buildImportPlan` + print aan en
raakt `writePlan` nooit — E2E bevestigd tegen `localhost` (count bleef 0 na
dry-run; daarna echte run 303, tweede run 0).

Legacy-markering (AC2, deel 2): `tests/validation/README.md` +
`tests/validation/CLAUDE.md` verwijzen naar `gold_set_records` als bron van
waarheid; de JSON-bestanden zijn NIET gemuteerd (git status bevestigt).

## AC 3 — Vervanging en actieve-set-resolutie

`src/__tests__/services/flywheel-gold-set.test.ts`:
- "getActiveGoldSet vraagt uitsluitend records met replacedById IS NULL op" (AC3).
- "getActiveGoldSet met cropOnly filtert GTIN-niveau records uit" (AC3).
- "getActiveGoldSet zonder cropOnly filtert NIET op cropPath" (AC3).
- "replaceGoldSetRecord maakt nieuw record aan en zet replacedById op het oude"
  (AC3) — oud record behouden + conditionele tombstone-update.
- "replaceGoldSetRecord gooit GoldSetReplacementError bij dubbele vervanging"
  (AC3) — 0 rijen → fout, nooit overschrijven.
- "replaceGoldSetRecord draait INSERT + UPDATE binnen één transactie" (AC3).
- "bij 0-rijen-vervanging faalt de transactie zodat de insert terugrolt".
- Immutability-guard: "exporteert GEEN update-op-inhoud of delete" +
  "gebruikt NOOIT prisma.goldSetRecord.delete of .update".

E2E lokaal bevestigd: seed 303 → getActiveGoldSet 303 (cropOnly 91) → na
vervanging nog steeds 303 actief (oud getombstoned) → double-replace geweigerd.

## Samenvatting
AC's: 3 · gedekt: 3 (AC1 via artefact + structuurborging; AC2/AC3 via 17
geautomatiseerde tests). Geen ongedekte AC's, geen waivers.
