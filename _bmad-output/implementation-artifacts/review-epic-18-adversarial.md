# BMAD post-implementation adversarial review — Epic 18 (GLN-backfill)

reviewed_commit: 9379d72f8c6847944328c92964fa3b14c1bfcbb4
epic_head: eb92bd8d570edd2794a1231435117071f74aef18
verdict: PASS
reviewer: adversarial (BMAD fase F), severity critical → low
date: 2026-07-04

> `reviewed_commit` is de laatste CODE-dragende commit (18.2-feat `9379d72`). De
> epic-HEAD `eb92bd8` is een doc-only chore (herpint enkel `review-18-2.md`'s
> `reviewed_commit`); hij wijzigt geen code. Deze review voegde geen code-fixes toe,
> dus de code-dragende HEAD blijft `9379d72`. Beide per-story-reviews pinnen hun eigen
> code-commit (18.1 → `4ce6d21`, 18.2 → `9379d72`).

## Diff-scope (f6fde84..eb92bd8, één repo: logoRecognition/apps/api + artefacten)

| Bestand | Type |
|---|---|
| `apps/api/prisma/schema.prisma` | M — kolom `glnBackfillReason` (nullable VARCHAR(50)) |
| `apps/api/prisma/migrations/0020_add_gln_backfill_reason/{migration,down}.sql` | A — additief + terugdraai |
| `apps/api/scripts/backfill-gln-from-tradeitems.ts` | A — 18.1 exportscript |
| `apps/api/scripts/gln-reimport-restant.ts` | A — 18.2 driver-script |
| `apps/api/src/services/flywheel/config.ts` | M — 2 doseringsgetters (18.2) |
| `apps/api/src/services/flywheel/overview/gln-coverage.ts` | A — on-read paneel (18.1) |
| `apps/api/src/services/flywheel/overview/empty-panels.ts` | D — stub vervallen |
| `apps/api/src/services/flywheel/overview/index.ts` | M — echte glnCoverage-sub-service |
| `apps/api/src/api/v1/artwork-pipeline.ts` | M — `runImportLoop`/`markStaleRuns` geëxporteerd (2 regels, geen gedrag) |
| `.env.example` | M — 2 doseringsvariabelen |
| tests: `gln-reimport-restant.test.ts` (A), `backfill-gln-from-tradeitems.test.ts` (A), `flywheel-gln-coverage.test.ts` (A), `flywheel-config.test.ts` (M), `flywheel-overview-{compose,panels}.test.ts` (M), `setup.ts` (M) | |
| artefacten: story-files 18.1/18.2, ac-trace-18-{1,2}, review-18-{1,2}, sprint-status.yaml, versions.md | |

Geen `node_modules`, `.env`, `vendor` of snapshots in de diff (geverifieerd).

## Bevindingen per severity

### CRITICAL — geen

- **Geen ongewenste prod-toegang (dimensie 2).** Beide scripts leggen alléén een echte
  verbinding achter `require.main === module` + expliciete `--apply` (default = dry-run).
  De MongoDB-driver in 18.1 wordt LAZY dynamisch geïmporteerd (`createMongoGlnLookup`,
  `await import('mongodb')`) — geen top-level import, geen auto-run. `main()` leest
  `TRADEITEMS_MONGO_URI` uit env (nooit hardcoded/gecommit) en stopt met exitcode 1 als
  die ontbreekt. 18.2 raakt geen prod-Mongo — alleen de eigen DB + de bestaande
  mediaserver-client, óók lazy geïmporteerd binnen de prod-deps. Geen enkele test
  importeert de prod-deps; alle tests draaien op de I/O-vrije pure kern met gemockte deps.
  Geverifieerd: `git grep` toont geen top-level `MongoClient`/`connect`/`resolveDeclarations`
  buiten de guarded prod-dep-factories.

### HIGH — geen

- **Cross-story-consistentie 18.1↔18.2 (dimensie 1) — sluitend.** 18.1-uitval zet
  `glnBackfillReason` (`geen-tradeitem`/`meerdere-glns`) op `gln IS NULL`-rijen. 18.2
  selecteert exact `{ gln: null, glnBackfillReason: { not: null } }` (script:249) — precies
  de 18.1-uitval, geen overlap met al-gevulde records en geen gat: records zónder reden
  (nog niet door 18.1 gezien) vallen bewust buiten 18.2. Reden-overgangen sluiten: gevuld →
  `clearReason` (reden NULL, alleen `gln: { not: null }`-rijen); definitief restant →
  `setReason` (nieuwe reden, alleen `gln: null`-rijen). De filters op de tegengestelde
  gln-toestand voorkomen dat een gemengd-GTIN beide updates op dezelfde rij toepast.
- **Nooit-overschrijven + idempotentie (dimensie 4) — afgedwongen.** 18.1 `fillGln`/
  `markReason` filteren `where: { gtin, gln: null }`; een bestaande niet-lege GLN wordt
  nooit geraakt. Tweede run: `listNullGlnGtins` levert leeg → 0 writes (getest). 18.2
  hergebruikt `runImportLoop` ongewijzigd; `force` komt nergens voor → delta-strategie
  (dedup-skip) triggert alleen de goedkope gln-backfill-tak; herstart selecteert alleen het
  resterende restant (getest). CPU-tempering echt afgedwongen: sequentiële batches, `await`
  op run-afronding vóór de volgende, pauze TUSSEN batches (niet na de laatste) — getest met
  fake timers (2 pauzes bij 3 batches).

### MEDIUM — geen

- **Migratie 0020 (dimensie 3).** Additief: één nullable kolom, geen NOT NULL/backfill,
  `down.sql` aanwezig. `prisma migrate status` lokaal (localhost:5432): "up to date", 20
  migraties, geen drift. Bewust géén niet-gerelateerde `retraining_notifications DROP
  DEFAULT` meegenomen (pre-existing DB/schema-discrepantie, gedocumenteerd in het Dev Agent
  Record). 18.2 is migratie-vrij (hergebruikt de kolom; nieuwe redenen zijn stringwaarden
  binnen VARCHAR(50) — passen ruim).
- **Regressie: stub-vervanging (dimensie 5).** `empty-panels.ts` (enige consumer: `index.ts`
  + 2 tests) verwijderd; `getGlnCoveragePanel` nu de echte on-read sub-service. Composer
  blijft modulair (één sub-service-aanroep, sectie-lokale fout-afvang via `panel()`).
  Compose-test bijgewerkt naar `available: true`; stale stub-test verwijderd. Volledige suite
  groen — geen verzwakte tests.
- **Return-shape-integriteit.** `preload` toetst `resolveDeclarations(...).reason === 'ok'`
  (`ok` ∈ `DeclarationReason`); `ArtworkImportRun.create` in 18.2 gebruikt geldige velden
  (`status`/`gtins:Json`/`heartbeatAt`). Geverifieerd tegen `t3777-declarations.ts:237` en
  `schema.prisma:460`.

### LOW — geen open (2 geaccepteerd, uit de story-reviews)

- **L1 — `glnCount` in `DiscoverySignal` is informatief, niet discriminerend** (18.2).
  `reasonForUnresolved` beslist op `mediaCount`; `glnCount` is een zelf-documenterend
  contract-veld, geen dode logica in het beslispad. Geaccepteerd (geen gedragsimpact).
- **L2 — Discovery-fout → `mediaserver-geen-media`** (18.2). Bij een discovery-exception valt
  de reden veilig terug (`{mediaCount:0}`); het record houdt altijd een actuele reden
  (FR-21 "geen stille uitval"). Geaccepteerd.
- **Security/secrets/dode code/debug.** Geen creds in code; env-driven URI's, catalog-key via
  de bestaande provider (nooit gelogd). Geen debug-statements (logging via `createLogger`).
  Geen resterende imports naar de verwijderde stub. AD-7-verbod gerespecteerd: de
  catalog-API-aanroep zit uitsluitend in declaratie-warming op een al-bekende (gln, gtin),
  nooit als GLN-bron.

## Acceptance-audit per story

### Story 18.1
| AC | Verdict | Bewijs |
|----|---------|--------|
| AC1 — governance go/no-go prod-read | vervuld/gedocumenteerd | Akkoord Friso 2026-07-04 (Dev Agent Record §Governance). Go/no-go-moment, geen geautomatiseerde test — conform C-trace-waiver met expliciete gebruikerstoestemming. |
| AC2 — vullen zonder overschrijven + uitvalreden + dry-run | gedekt | `backfill-gln-from-tradeitems.test.ts` (parse, decideOutcome, nooit-overschrijven, idempotent, dry-run-nul-writes, preload) |
| AC3 — dashboard-dekkingsgraad + verdeling per reden | gedekt | `flywheel-gln-coverage.test.ts` (percentage/totalen/verdeling/targetMet/lege-tabel-null/DB-fout gooit) |

### Story 18.2
| AC | Verdict | Bewijs |
|----|---------|--------|
| AC1 — terugval vult GLN's + reden-bijwerking + CPU-getemperd via `FLYWHEEL_`-env | gedekt | `gln-reimport-restant.test.ts` (selectie 18.1-restant, batch-indeling, pauze-respect fake timers, reden beide paden, dry-run-nul-I/O, herstart) + `flywheel-config.test.ts` (defaults 25/30000, override, ongeldig→default) |
| AC2 — dashboard toont bijgewerkte dekking + definitief restant met redenen | gedekt | hermeting via tweede `coverageTotals` (getest); leunt op het ongewijzigde on-read `glnCoverage`-paneel (18.1) |

Geen AC zonder dekkende test behalve AC1-18.1 (governance-waiver met expliciete toestemming).

## Volledige test-suite (na review, geen fixes nodig)

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/logo_recognition npx vitest run`
  in `apps/api`: **72 passed | 5 skipped (77 files)**, **825 passed | 2 skipped | 37 todo (864)**.
  Groen tegen de code-dragende HEAD `9379d72` (== epic-HEAD op codeniveau; `eb92bd8` is doc-only).

## Fix-log

- Geen fixes nodig. Geen critical/high/medium bevindingen; de twee low-notes zijn bewust
  geaccepteerd (geen gedragsimpact, voldoen aan FR-21). Verdict PASS op de actuele
  code-dragende HEAD zonder wijzigingen.
