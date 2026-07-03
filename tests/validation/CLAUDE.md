# tests/validation — AI-context

## Gold-set (Story 13.3, AD-4) — LEES DIT VOOR ELKE WIJZIGING

De bron van waarheid voor de goudstandaard is de PostgreSQL-tabel
**`gold_set_records`** (via `apps/api`), NIET de JSON-bestanden in deze map.

- `gold-set-oogstrun.json` en `declared-marks-goldset.json` zijn **bevroren,
  read-only legacy snapshots** — muteer ze NOOIT. Ze dienen enkel als
  eenmalige seed-input en als test-fixtures. Zie `README.md` in deze map.
- Wijzigingen aan de gold-set (toevoegen/vervangen) gaan uitsluitend via de
  service `apps/api/src/services/flywheel/gold-set.ts` (`replaceGoldSetRecord`;
  latere additieve functies zoals 14.1's `withdrawGoldSetRecord`). Records zijn
  immutable (AD-13, FR-10): geen update op inhoud, geen delete — de enige
  mutatie is `replacedById` op het oude record.
- Actieve set = `replacedById IS NULL` (één canonieke definitie, AD-4).
- Seed handmatig + idempotent + droge-run (`src/scripts/seed-gold-set.ts`),
  nooit automatisch bij deploy of migratie.
