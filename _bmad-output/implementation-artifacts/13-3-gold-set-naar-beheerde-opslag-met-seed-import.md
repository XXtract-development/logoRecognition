# Story 13.3: Gold-set naar beheerde opslag met seed-import

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 13 / Story 13.3 + ARCHITECTURE-SPINE (AD-4; ARCH-2, ARCH-4). Onafhankelijk van 13.2 uitvoerbaar (eigen migratie). -->

## Story

Als **datamanager**
wil ik **de goudstandaard in een beheerde gegevensopslag met een eenduidige actieve-set-definitie**
zodat **de regressietest (13.5) een reproduceerbaar en groeibaar meetinstrument heeft**.

### Afbakening (kritiek)

- Deze story levert **opslag + seed + actieve-set-resolutie**. De regressietest zelf is 13.5; de gold-set-áánwas uit reviewbeslissingen is Story 14.1 (die hergebruikt de service-functies van hier).
- **Immutability is het contract**: records worden nooit ge-update of verwijderd; de enige toegestane mutatie is het zetten van `replacedById` op het oude record bij vervanging (AD-4, FR-10).
- De seed is een **handmatig gestart, idempotent script met droge-run** — nooit automatisch bij deploy of migratie (ARCH-4 / operationele envelope §3).

## Acceptatiecriteria

1. **Migratie met toestemming (ARCH-2).** Given de nieuwe Prisma-migratie voor `gold_set_records` (immutable, `replacedById` self-FK), when de migratie wordt voorbereid, then wordt deze ter expliciete goedkeuring voorgelegd (met gedocumenteerd terugdraaipad/down-script).
2. **Idempotente seed-import met droge-run.** Given de bestaande bestanden `tests/validation/gold-set-oogstrun.json` (91 samples) en `declared-marks-goldset.json` (74 GTINs), when het idempotente seed-importscript draait (met `--dry-run`-optie die niets schrijft maar het importplan toont), then staan alle records in `gold_set_records` met label, code, crop-verwijzing en herkomst; een tweede run voegt niets toe (ARCH-4), **en** zijn de repo-bestanden gemarkeerd als read-only legacy met verwijzing naar de tabel (AD-4).
3. **Vervanging en actieve-set-resolutie.** Given een gold-set-record dat vervangen wordt, when de vervanging plaatsvindt, then blijft het oude record bestaan met `replacedById` gezet (enige toegestane mutatie) en bestaat de actieve set uitsluitend uit records met `replacedById IS NULL`, geresolved in `apps/api` (AD-4, FR-10-immutabiliteit).

## Tasks / Subtasks

- [ ] 1. **Prisma-migratie (EXPLICIETE TOESTEMMINGSTAAK, ARCH-2)** (AC: 1)
  - [ ] 1.1 Model `GoldSetRecord` conform Structural Seed: id, label (ECHT/VALS, `String @db.VarChar(20)` — géén enum), t3777Code, cropPath (**nullable** — zie 1.2), source, decidedBy, `replacedById` self-FK nullable, createdAt; conventies: `@@map("gold_set_records")`, snake_case-kolommen, `@db.Uuid`/`gen_random_uuid()`, `@db.Timestamptz`, index `createdAt(sort: Desc)` + index op `replacedById` (actieve-set-query) + index op `t3777Code`.
  - [ ] 1.2 Ontwerpbeslissing vastleggen in de migratie-docblock: de 91 oogstrun-records zijn crop-niveau (cropPath gevuld); de 74 declared-marks-records zijn GTIN-niveau (per (GTIN, code) één record ECHT, `cropPath NULL`, source `declared-marks-goldset`). De 13.5-regressie-eval consumeert uitsluitend crop-records; GTIN-records dienen als declaratie-anker. Extra evidence (gtin, confidence, method, sourceFile, bbox uit de bron-JSON) meenemen in een `evidence Json @default("{}")`-kolom zodat niets van de bron verloren gaat.
  - [ ] 1.3 Down-script schrijven en documenteren; migratie ter goedkeuring voorleggen; NOOIT zelf uitvoeren (handmatig `prisma migrate deploy` na akkoord — operationele envelope §2). Migratie-noot: geen constraint die `replaced_by_id = id` blokkeert (14.1-self-tombstone-undo steunt hierop).
- [ ] 2. Actieve-set-resolutie `apps/api/src/services/flywheel/gold-set.ts` (AC: 3)
  - [ ] 2.1 `getActiveGoldSet()`: uitsluitend records met `replacedById IS NULL` (AD-4 — geen keten-traversal; de resolutie is per definitie één WHERE-clausule). Optioneel filter crop-only (voor 13.5).
  - [ ] 2.2 `replaceGoldSetRecord(oldId, newData)`: transactie — INSERT nieuw record + `UPDATE oldRecord SET replacedById = new.id` als conditional update (`WHERE replaced_by_id IS NULL`; 0 rows = al vervangen → fout, nooit overschrijven). Dit is de service-functie die 14.1 hergebruikt.
  - [ ] 2.3 Geen andere update-/delete-paden: geen Prisma-`update` op inhoudskolommen en geen `delete` — bewaak dit met een unit-test op de service-API; latere additieve functies (zoals 14.1's `withdrawGoldSetRecord`) zijn toegestaan.
- [ ] 3. Seed-importscript (AC: 2)
  - [ ] 3.1 Locatie: `apps/api/src/scripts/seed-gold-set.ts` (er is al een scripts-testpatroon: `apps/api/src/__tests__/scripts/seed-reference-logos-from-guide.test.ts` — volg die opzet). Handmatig te starten; nooit gekoppeld aan deploy/migratie/startup.
  - [ ] 3.2 `--dry-run`: toont het importplan (aantallen per bron, per label, per code; welke al bestaan) en schrijft niets.
  - [ ] 3.3 Idempotentie: natuurlijke sleutel per bron bepalen en checken vóór insert — oogstrun-records hebben een `id`-veld in de JSON (bewaar als bron-id in evidence en dedup daarop); declared-marks dedupt op (gtin, code, source). Tweede run → 0 inserts (expliciet AC).
  - [ ] 3.4 Bronstructuur (geverifieerd): `gold-set-oogstrun.json` = `{ meta: {total: 91, echt: 75, vals: 16, ...}, records: [{id, label: "ECHT"|"VALS", t3777Code, confidence, gtin, method, cropPath, sourceFile, bbox}] }`; `declared-marks-goldset.json` = lijst van 74 × `{_id: <gtin>, codes: [<t3777-code>, ...]}`.
  - [ ] 3.5 Na geslaagde seed: beide JSON-bestanden bovenaan markeren als read-only legacy — JSON kent geen comments, dus: `meta.legacyNote` toevoegen in het oogstrun-bestand is een mutatie van een testbestand; kies in plaats daarvan een `README.md`-blok in `tests/validation/` + verwijzing in `tests/validation/CLAUDE.md` dat `gold_set_records` (PostgreSQL) vanaf nu de bron van waarheid is en de JSON-bestanden bevroren snapshots zijn. Documenteer de keuze in het Dev Agent Record.
- [ ] 4. Tests (zie testrichtlijnen) (AC: 2, 3)
- [ ] 5. versions.md zelfde commit; Engelse commit; ghcr-workflow vóór Coolify-deploy (alleen api-image geraakt); seed op ACC pas draaien ná goedgekeurde en uitgevoerde migratie — eerst `--dry-run`-output in het Dev Agent Record plakken, dan echte run

## Dev Notes — Developer Context

### Bindende AD's

| AD | Essentie voor deze story |
|---|---|
| **AD-4** | Gold-set-opslag is PostgreSQL (`gold_set_records`), eenmalige seed van 91 samples + 74 GTINs; repo-bestanden worden read-only legacy met verwijzing. Ketenresolutie: actieve set = uitsluitend records zónder opvolger (`replacedById IS NULL`); vervanging zet `replacedById` op het oude record — de enige toegestane mutatie. Resolutie in `apps/api` (`services/flywheel/gold-set.ts`); ml-service ontvangt de geresolvede set als request-payload (13.5) en leest de tabellen nooit zelf. |
| **AD-2** | API bezit alle vliegwiel-state — seed en resolutie leven in `apps/api`, nergens anders. |
| **AD-13** | Records immutable; herleidbaarheid via source/decidedBy/evidence. |
| **ARCH-2** | Migratie alleen na expliciete toestemming, down-script verplicht, nooit auto-migrate. |
| **ARCH-4 / envelope §3** | Eenmalige seeds zijn idempotente, handmatig gestarte scripts met droge-run; nooit automatisch bij deploy of migratie. |

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Gold-set bron 1 (crops) | `tests/validation/gold-set-oogstrun.json` — dict met `meta` (total 91, echt 75, vals 16) + `records[91]` (velden: id, label, t3777Code, confidence, gtin, method, cropPath, sourceFile, bbox) | Seed-input; structuur geverifieerd 2026-07-02. |
| Gold-set bron 2 (declaraties) | `tests/validation/declared-marks-goldset.json` — lijst van 74 × `{_id: gtin, codes: [...]}` | Seed-input; GTIN-niveau, geen crops. |
| Self-FK + immutable-patroon | geen bestaand voorbeeld in schema.prisma — `replacedById` is de eerste self-FK | Conventies (naming, Uuid, Timestamptz) wél overal aanwezig; volg `ArtworkReviewItem` (:506–523) voor status/velden-stijl. |
| Scripts-met-test-patroon | `apps/api/src/__tests__/scripts/seed-reference-logos-from-guide.test.ts` | Bestaand voorbeeld van een geteste seed-flow — zelfde opzet voor `seed-gold-set`. |
| Prisma-transacties met conditional update | patroon beschreven in AD-16; bestaand gebruik in `artwork-registration.ts:57` (`registerCropsTx`) | Voor `replaceGoldSetRecord` (taak 2.2). |

### Wat er NIEUW is (de eigenlijke story)

1. Prisma-migratie `gold_set_records` (+ down-script; goedkeuringsflow).
2. `apps/api/src/services/flywheel/gold-set.ts` — actieve-set-resolutie + vervangings-service (herbruikt door 13.5 en 14.1).
3. `apps/api/src/scripts/seed-gold-set.ts` — idempotent, `--dry-run`, handmatig.
4. Legacy-markering van de twee JSON-bestanden (README-verwijzing).

### Guardrails (voorkom bekende fouten)

- **Migratie = toestemmingsmoment (ARCH-2)**: voorbereiden mag, uitvoeren alleen Friso; down-script verplicht; nooit `migrate` in tests tegen containers.
- **Seed nooit automatisch** — niet in container-startup, niet in een migratie, niet in CI. Handmatig, idempotent, eerst droge-run (envelope §3; geheugen-les: auto-migrate/auto-seed is bij dit team een harde overtreding).
- **Immutability niet "voor het gemak" versoepelen**: geen update-endpoints, geen delete. Correctie = nieuw record + `replacedById`. Twee resolutie-definities (tombstone-traversal vs. nieuwste-per-sleutel) was precies het adversarial-finding dat AD-4 voorkomt — er is er exact één: `replacedById IS NULL`.
- **ml-service blijft eraf**: geen ml-side gold-set-reads; 13.5 stuurt de set als payload (AD-4). Deze story raakt ml-service in het geheel niet.
- **JSON-bronbestanden niet muteren** (het zijn bevroren snapshots én test-fixtures elders); markering via README/CLAUDE.md-verwijzing.
- Commits Engels; versions.md zelfde commit; e2e buiten de stable-subset-gate.

### Testrichtlijnen

- **Unit (vitest, `apps/api/src/__tests__/services/`)**: `getActiveGoldSet` filtert vervangen records uit; `replaceGoldSetRecord` — happy path (oud record behouden + verwijzing gezet), dubbele vervanging → fout (conditional update 0 rows), transactionaliteit (INSERT en UPDATE samen of geen van beide).
- **Script-test (vitest, `apps/api/src/__tests__/scripts/`)**: parsing van beide bronformaten (91 + 74, label-mapping, GTIN→records-uitwaaiering per code); idempotentie (tweede run plant 0 inserts); `--dry-run` schrijft niets (gemockte Prisma bewijst 0 writes).
- **Pytest**: n.v.t. (ml-service ongewijzigd).
- E2E: n.v.t.; in elk geval buiten de stable-subset-gate.

### Project Structure Notes

- Conform spine source-tree: `apps/api/src/services/flywheel/gold-set.ts` (spine noemt dit pad letterlijk in AD-4).
- Variance 1: `cropPath` nullable + `evidence`-kolom zijn story-niveau-invullingen van de seed-tabel (spine fixeert "sleutel-kolommen en relaties, meer niet") — gemotiveerd door de twee bronformaten; vastleggen in de migratie-docblock.
- Variance 2: scriptlocatie `apps/api/src/scripts/` (api-side, want Prisma) — dit is géén ml-service-`scripts/`-map, dus constraint 2 (Docker kopieert alleen `app/`) is niet van toepassing.

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story 13.3]
- [Source: ARCHITECTURE-SPINE.md#AD-4, #AD-13, #Constraints, #Operationele envelope (§2, §3), #Structural Seed (gold_set_records)]
- [Source: prd.md#FR-3 (fundament), #FR-10 (immutabiliteit + vervangingsverwijzing)]
- [Source: tests/validation/gold-set-oogstrun.json (meta geverifieerd: 91/75/16), tests/validation/declared-marks-goldset.json (74 GTINs)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic/vliegwiel-13 worktree).

### Debug Log References

- DB-veiligheid: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/logo_recognition` — geverifieerd localhost:5432, geen remote-token, vóór elke prisma-actie.
- Migratie 0013 lokaal toegepast via `prisma migrate deploy` (localhost); `prisma migrate status` = up to date; `prisma validate` + `prisma generate` groen.
- Dry-run: plan 303 (91 oogstrun + 212 declared), labels ECHT=287/VALS=16, 25 codes; count bleef 0 (niets geschreven).
- Echte seed E2E lokaal: run 1 = 303 inserts, run 2 = 0 (idempotent). getActiveGoldSet = 303 (cropOnly 91). Vervanging: actief blijft 303 (oud getombstoned); double-replace → GoldSetReplacementError. Daarna tabel getruncate om de lokale DB schoon achter te laten.

### Completion Notes List

- **AC1**: migratie `0013_add_gold_set_records` (migration.sql + down.sql) voorbereid en lokaal toegepast; docblock legt de variance (cropPath nullable + evidence-kolom) en het 14.1-afstempunt (géén `replaced_by_id = id`-constraint) vast. Uitvoering op ACC/PROD blijft een expliciet toestemmingsmoment.
- **AC2**: `src/scripts/seed-gold-set.ts` — handmatig, idempotent, `--dry-run`. Dedup: oogstrun op bron-id (in evidence), declared-marks op (gtin, code, source). Legacy-markering via NIEUWE `tests/validation/README.md` + `tests/validation/CLAUDE.md` — de JSON-bronbestanden zijn NIET gemuteerd (keuze conform Task 3.5: JSON kent geen comments én is fixture elders).
- **AC3**: `src/services/flywheel/gold-set.ts` — `getActiveGoldSet` (replacedById IS NULL, optioneel cropOnly) + `replaceGoldSetRecord` (transactie: create + conditionele tombstone-update, 0 rijen → fout). Immutability-guard-test bewaakt: geen update-op-inhoud, geen delete.
- **Variance vastgelegd**: cropPath nullable (GTIN-records hebben geen crop) + evidence JSONB (volledige bron-context, AD-13). Scriptlocatie `apps/api/src/scripts/` (api-side, Prisma) — niet ml-service `scripts/`.
- Volledige apps/api vitest-suite groen: 335 passed / 2 skipped (337), +17 nieuw.
- Review + AC-trace: zie `apps/api/review-13-3.md` (verdict PASS) en `apps/api/ac-trace-13-3.md`.

### File List

- `apps/api/prisma/schema.prisma` (model GoldSetRecord)
- `apps/api/prisma/migrations/0013_add_gold_set_records/migration.sql` (nieuw)
- `apps/api/prisma/migrations/0013_add_gold_set_records/down.sql` (nieuw)
- `apps/api/src/services/flywheel/gold-set.ts` (nieuw)
- `apps/api/src/scripts/seed-gold-set.ts` (nieuw)
- `apps/api/src/__tests__/services/flywheel-gold-set.test.ts` (nieuw)
- `apps/api/src/__tests__/scripts/seed-gold-set.test.ts` (nieuw)
- `apps/api/src/__tests__/setup.ts` (goldSetRecord-mock toegevoegd)
- `apps/api/src/__tests__/__mocks__/prisma.ts` (goldSetRecord-mock toegevoegd)
- `tests/validation/README.md` (nieuw, legacy-markering)
- `tests/validation/CLAUDE.md` (nieuw, AI-context legacy-markering)
- `apps/api/review-13-3.md`, `apps/api/ac-trace-13-3.md` (review-artefacten)
- `versions.md` (release-notitie)

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow); bronbestand-structuren geverifieerd (91 records met meta echt=75/vals=16; 74 GTIN-records met codes-array).
