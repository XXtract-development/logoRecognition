# Validatie-datasets — read-only legacy snapshots

## Gold-set: bron van waarheid is nu PostgreSQL (Story 13.3, AD-4)

Vanaf Story 13.3 is de **beheerde gold-set-tabel `gold_set_records` (PostgreSQL,
via `apps/api`) de enige bron van waarheid** voor de goudstandaard van de
regressietest (13.5).

De volgende twee bestanden zijn **BEVROREN, READ-ONLY LEGACY SNAPSHOTS** — niet
langer de bron, niet muteren:

| Bestand | Niveau | Rol na 13.3 |
|---|---|---|
| `gold-set-oogstrun.json` | crop-niveau (91 samples, `cropPath` gevuld) | Eenmalige seed-input → `gold_set_records`. De 13.5-eval consumeert de tabel, niet dit bestand. |
| `declared-marks-goldset.json` | GTIN-niveau (74 GTINs → 212 (gtin,code)-paren) | Eenmalige seed-input → `gold_set_records` als declaratie-anker (label ECHT, `cropPath` NULL). |

### Waarom bevroren

- Ze zijn tevens test-fixtures elders in de suite; muteren zou die tests breken.
- Immutability van de gold-set (AD-13, FR-10) leeft in de tabel, niet in JSON —
  correcties/vervangingen gebeuren uitsluitend in `gold_set_records`
  (`replacedById` op het oude record; zie `services/flywheel/gold-set.ts`).

### Seeden vanuit deze snapshots

Handmatig, idempotent, met droge-run (nooit automatisch bij deploy/migratie —
operationele envelope §3):

```bash
# eerst het plan bekijken zonder te schrijven:
DATABASE_URL=... npx tsx src/scripts/seed-gold-set.ts --dry-run
# daarna de echte import (tweede run voegt niets toe — idempotent):
DATABASE_URL=... npx tsx src/scripts/seed-gold-set.ts
```

(uit te voeren vanuit `apps/api`).

### Actieve set opvragen

De actieve gold-set = uitsluitend records met `replacedById IS NULL` (AD-4, één
canonieke definitie, geen keten-traversal). Geresolved in `apps/api`
(`services/flywheel/gold-set.ts`, `getActiveGoldSet()`); de ml-service leest de
tabel nooit zelf en krijgt de set als request-payload.
