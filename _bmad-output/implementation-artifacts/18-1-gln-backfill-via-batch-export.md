# Story 18.1: GLN-backfill via batch-export

Status: done

<!-- Aangemaakt door create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 18 / Story 18.1. -->

## Story

Als **datamanager**
wil ik **dat historische artwork-records hun GLN krijgen via een eenmalige export uit de productbron**
zodat **het 39k-archief declaratie-lookup en dubbele bevestiging kan krijgen** (FR-21).

### Afbakening (kritiek)

- **EERSTE taak is een go/no-go.** De eenmalige read-only MongoDB-export op prod tradeItems vereist expliciet governance-akkoord (ARCH-8, spine Open Question 1). **Zonder akkoord stopt deze story hier** — geen "alvast bouwen tegen ACC", geen gedeeltelijke uitvoering; de story gaat terug naar de backlog met de weigerreden genoteerd.
- **Eenmalig, handmatig, idempotent.** Het exportscript is een handmatig gestart script met `--dry-run`, conform operationele envelope §3 — nooit automatisch bij deploy of migratie, geen job, geen scheduler.
- De 39k-bulk-verwerking zelf (detectie-run) is expliciet buiten scope (PRD §5); deze story levert uitsluitend de GLN-dekking die hem zinvol maakt. Het restant zonder GLN is Story 18.2 (mediaserver-re-importroute).

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 18.1)*

1. **Given** het go/no-go-moment
   **When** de story start
   **Then** wordt eerst expliciet governance-akkoord gevraagd voor de eenmalige read-only MongoDB-export op prod tradeItems (off-peak); zonder akkoord stopt de story hier (AD-7, ARCH-8).

2. **Given** akkoord en het idempotente exportscript (met `--dry-run` die alleen het plan toont)
   **When** de backfill draait
   **Then** worden `artwork_imports.gln`-waarden gevuld vanuit de export + Redis-preload van declaraties, zonder bestaande niet-lege GLN's te overschrijven (FR-21, AD-7)
   **And** krijgt elk record zonder vaststelbare GLN een gemarkeerde uitvalreden — geen stille uitval (FR-21).

3. **Given** de afgeronde run
   **When** het dashboard de dekkingsgraad toont
   **Then** is het percentage records-met-GLN zichtbaar (doel ≥90%) inclusief uitval-verdeling per reden (FR-21, UX-DR3).

## Tasks / Subtasks

- [ ] 0. **GO/NO-GO — governance-akkoord prod-read (AC: 1) — BLOKKEREND, EERST**
  - [ ] Vraag Friso expliciet akkoord voor één read-only export op de prod-MongoDB `application.tradeItems`, off-peak, met: doel (GLN-dekking 39k-archief), leespatroon (alleen `_id`/GLN-veld per GTIN, geen mutaties), tijdvenster, en de toegangsroute (bestaande read-only prod-verbinding; nooit nieuwe schrijf-creds).
  - [ ] Akkoord + voorwaarden noteren in het Dev Agent Record. **Geen akkoord → story stoppen, status terug naar backlog met reden.**
- [ ] 1. Prisma-migratie: uitvalreden-kolom (AC: 2) — **EXPLICIETE GOEDKEURINGSTAAK (ARCH-2)**
  - [ ] `artwork_imports` + nullable kolom `glnBackfillReason` (`@map("gln_backfill_reason") @db.VarChar(50)`) — record-niveau markering "geen stille uitval" vergt een kolom; hergebruik van `failureReason` is verboden (dat veld is import-status-semantiek, artwork-pipeline.ts:456/schema.prisma:456).
  - [ ] Ter expliciete goedkeuring voorleggen, handmatig `prisma migrate deploy` na akkoord; down-script meeleveren (`ALTER TABLE artwork_imports DROP COLUMN gln_backfill_reason;`).
- [ ] 2. Idempotent exportscript `apps/api/scripts/backfill-gln-from-tradeitems.ts` (AC: 2)
  - [ ] Input: alle `artwork_imports`-records met `gln IS NULL` (geaggregeerd per uniek GTIN). Bron: prod tradeItems, `_id`-formaat `{gln}-{gtin}-{targetMarket}` (targetMarket 528, zelfde conventie als t3777-declarations.ts) — per GTIN de GLN afleiden.
  - [ ] `--dry-run` (default aanbevolen in de usage-tekst): toont uitsluitend het plan — aantallen per uitkomst (vulbaar / geen-tradeitem / meerdere-glns), schrijft NIETS (geen PG, geen Redis).
  - [ ] Schrijfgedrag: alleen `gln IS NULL`-records updaten — bestaande niet-lege GLN's NOOIT overschrijven (zelfde regel als de 8-3O-upsert: "Never clobber a previously stored gln", artwork-pipeline.ts:~296). Herdraaien voegt niets toe (idempotent).
  - [ ] Uitvalredenen per record zonder vaststelbare GLN in `glnBackfillReason`, minimaal: `geen-tradeitem` (GTIN niet in prod tradeItems), `meerdere-glns` (GTIN bij >1 GLN voor TM 528 — niet gokken), en laat ruimte voor extra redenen. Records die 18.2 later vult: reden wordt daar bijgewerkt.
  - [ ] Throttling/off-peak: batchgewijs lezen (cursor), bescheiden tempo; het script logt voortgang en eindigt met een samenvatting (gevuld / per-reden-uitval / dekkingsgraad vóór en ná).
- [ ] 3. Redis-preload declaraties (AC: 2)
  - [ ] Ná de GLN-vulling (zelfde script, aparte fase, ook onder `--dry-run`-guard): per gevulde (gln, gtin) de bestaande declaratieprovider aanroepen (`apps/api/src/services/t3777-declarations.ts` — gln-lookup → cache → catalog-API → cache-write incl. negative caching) zodat de eerste vliegwiel-verwerking cache-hits heeft. Throttled (sequentieel of kleine concurrency), fail-safe van de provider respecteren (reasons loggen, nooit crashen op `api-fout`).
  - [ ] Let op TTL: `T3777_CACHE_TTL_S` default 86400 (1 dag) — vermeld in de scriptoutput dat de preload een warme start is, geen permanente cache; optioneel `--skip-preload`.
- [ ] 4. Dekkingsgraad naar het dashboard (AC: 3) — overview-paneel `glnCoverage` in `/api/v1/flywheel/overview` (modulaire sub-service `apps/api/src/services/flywheel/gln-coverage.ts`, on-read): percentage `gln IS NOT NULL` over alle `artwork_imports`, totaal-aantallen en uitval-verdeling per `glnBackfillReason`. Routebestand `apps/api/src/api/v1/flywheel.ts` aanmaken als het nog niet bestaat (spine-conventie; coördinatie-noot: één sub-service per paneel).
- [ ] 5. Tests (vitest, apps/api): export-mapping (`_id`-parse `{gln}-{gtin}-{tm}` incl. randgevallen), nooit-overschrijven-regel, idempotentie (tweede run = 0 writes), uitvalreden-toekenning, dry-run schrijft niets (assert 0 prisma/redis-calls), gln-coverage-paneel. MongoDB en catalog-API gemockt — tests raken NOOIT prod.
- [ ] 6. Uitvoering + bewijs: off-peak draaien (eerst `--dry-run`, plan in Dev Agent Record plakken, dan echt); dekkingsgraad vóór/ná + uitval-verdeling in het Dev Agent Record; ≥90%-doel toetsen — restant is input voor Story 18.2.
- [ ] 7. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-workflow afwachten vóór Coolify-deploy (api geraakt door paneel + script); migratie handmatig na expliciete toestemming.

## Dev Notes — Developer Context

### Bindende architectuurbeslissingen

- **AD-7** — route (a): eenmalige batch-export GTIN→GLN uit prod tradeItems (MongoDB read-only, off-peak) naar `artwork_imports.gln` + Redis-preload van declaraties; terugval (b) = Story 18.2. Per-GTIN externe API-lookups als primaire route zijn expliciet verboden (traag, belastend).
- **ARCH-8** — governance-akkoord prod-read is een go/no-go-moment ín deze story; niet uit code of documenten te beantwoorden.
- **ARCH-4 / operationele envelope §3** — eenmalige seeds zijn idempotente, handmatig gestarte scripts met droge-run; nooit automatisch bij deploy of migratie.
- **ARCH-2** — de uitvalreden-kolom is een migratie: expliciete toestemming per geval + down-script.
- **AD-2** — API bezit de state; het script leeft in `apps/api` en schrijft via Prisma.

### Wat er AL bestaat (geverifieerd, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| `artwork_imports.gln` | `apps/api/prisma/schema.prisma:445–469` (model ArtworkImport; `gln String? @db.VarChar(50)` op :448; `@@unique([mediaId])`, indexen op gtin/status) | Doelkolom; nullable — precies de records die deze story vult. |
| Nooit-overschrijven-regel | `apps/api/src/api/v1/artwork-pipeline.ts:250–260` (dedup-skip-backfill "re-import is the documented repair path") en de upsert-update ("Never clobber a previously stored gln") | Bestaande semantiek — het script volgt exact dezelfde regel. |
| Declaratieprovider + Redis-cache | `apps/api/src/services/t3777-declarations.ts` — pipeline gln-lookup → cache-read (:246) → catalog-fetch `GET {base}/api/tradeitemxml/{gln}-{gtin}-{tm}` → cache-write incl. negative caching (:253); cacheKey `t3777:{gln}:{gtin}:{tm}` (:93); env `CATALOG_API_KEY`, `CATALOG_API_BASE`, `T3777_TARGET_MARKET=528`, `T3777_CACHE_TTL_S=86400` (:67–74); reasons `ok/api-key-ontbreekt/gln-ontbreekt/404-mogelijk-TM-mismatch/api-fout/lege-declaratie` | De preload roept déze provider aan (of de onderliggende fetch+cache-write) — geen eigen cache-namespace of tweede fetch-implementatie bouwen. |
| Redis-verbinding | `getRedisConnection` uit `apps/api/src/services/pipeline/queue.ts` (import-patroon t3777-declarations.ts:31) | Voor de preload-fase. |
| Script-precedent | `apps/api/scripts/` — `seed-reference-logos.ts`, `stratify-holdout.ts`, `populate-review-queue-12-6.js` | Locatie- en aanroepconventie (tsx/ts-node vanuit apps/api) voor het exportscript. Let op: de app/-only-constraint geldt voor ml-service, niet voor apps/api/scripts. |
| tradeItems-sleutelconventie | Teampraktijk: MongoDB baseline `_id` = `{gln}-{gtin}-{targetMarket}` in `application.tradeItems` (prod); zelfde triplet als de catalog-API-URL | Basis voor de export-query (regex/aggregatie op `_id`-suffix `-{gtin}-528` of op losse velden indien aanwezig — verifieer het schema met één sample-read ná akkoord, vóór de bulk). |
| Dekkingsgraad-afnemer | Story 15.2 / UX-DR3: KPI-tegel "GLN-dekking" in het vliegwiel-overzicht | Deze story levert de API-data (paneel `glnCoverage`); de UI-tegel is 15.2. |

### Wat er NIEUW is (de eigenlijke story)

1. Migratie `gln_backfill_reason` op `artwork_imports` (+ down-script) — de enige schemawijziging.
2. `apps/api/scripts/backfill-gln-from-tradeitems.ts` (export + preload, `--dry-run`, idempotent).
3. `apps/api/src/services/flywheel/gln-coverage.ts` + paneel `glnCoverage` in `/api/v1/flywheel/overview`.

### Operationele randvoorwaarden

- **Prod-MongoDB-toegang:** uitsluitend read-only, off-peak, na akkoord (taak 0). Verbindingsgegevens komen uit de bestaande operationele registries (ssh/coolify-registry) — NOOIT hardcoden of committen; het script leest een env-var (bv. `TRADEITEMS_MONGO_URI`) die alleen op de uitvoerende machine gezet wordt.
- **Databaseveiligheid (teamregel):** geen enkele migrate-variant op containers; de migratie draait als handmatige `prisma migrate deploy` na expliciete toestemming. Het script muteert uitsluitend `artwork_imports.gln`/`gln_backfill_reason` via gerichte updates — geen deletes, geen andere tabellen.
- **Deploy-volgorde:** alleen api geraakt; ghcr-workflow "Build and Push Docker Images" afwachten vóór Coolify-deploy (ACC draait pre-built images). Het script zelf draait buiten de deploy om.

### Guardrails (voorkom bekende fouten)

- **Go/no-go is hard** (AC1): geen regel code tegen prod vóór akkoord. Sample-read voor schema-verificatie valt óók onder het akkoord.
- **Nooit bestaande GLN's overschrijven** — ook niet "corrigeren" bij mismatch tussen export en bestaande waarde; log zulke gevallen als bevinding, raak ze niet aan.
- **Meerdere GLN's per GTIN niet gokken**: uitvalreden `meerdere-glns`, menselijke opvolging of 18.2.
- **Geen per-GTIN catalog-API-lookups als GLN-bron** (AD-7-verbod) — de catalog-API-aanroep in de preload-fase is declaratie-warming op een al-bekende (gln, gtin), geen GLN-bepaling.
- **Dry-run betekent NUL writes** — ook geen Redis; test dit expliciet.
- E2E buiten de stable-subset-gate; commits Engels + `versions.md` (NL) in DEZELFDE commit.

### Testrichtlijnen

- Vitest met gemockte Mongo-cursor/prisma/redis: mapping, idempotentie, nooit-overschrijven, uitvalredenen, dry-run-nul-writes, coverage-paneel (verdeling per reden, deling-door-nul bij lege tabel).
- Geen test raakt prod of ACC-Mongo; de echte run is een gecontroleerde handmatige uitvoering met bewijs in het Dev Agent Record (AC-bewijsvoering: dekkingsgraad vóór/ná, uitval-verdeling, ≥90%-toets).

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 18.1 (AC-bron), Epic 18-inleiding.
- `_bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md` — AD-7, ARCH-8 (Open Questions), operationele envelope §2/§3, Capability Map FR-21.
- `_bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md` — §4.7 FR-21 (+ assumpties ≥90%-doel, restant gemarkeerd), §5 non-goal 39k-bulk.
- `_bmad-output/implementation-artifacts/8-3O-server-side-detectie-orkestratie.md` — gln-sourcing-historie (punt 8: records vóór gln-sourcing blijven NULL tot her-import).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) via /implement-sprint (epic/vliegwiel-18 worktree).

### Governance (AC1) — vervuld

Friso heeft op **2026-07-04** EXPLICIET akkoord gegeven op de eenmalige read-only
prod-MongoDB-export op `application.tradeItems` (off-peak, alleen `_id`/GLN per GTIN,
geen mutaties, via de bestaande read-only prod-verbinding). AC1 is dus vervuld en
gedocumenteerd; het is een go/no-go-moment, geen geautomatiseerde test.

Binnen deze implementatie-run is NOOIT de echte prod-export gedraaid: alle tests
mocken MongoDB + catalog-API. De echte read-only export is een aparte operationele
stap die de mens (Friso) los aftrapt met dit script (`--dry-run` eerst, dan `--apply`).

### Debug Log References

- Migratie 0020 lokaal toegepast op `postgresql://postgres:postgres@localhost:5432/logo_recognition`
  (localhost bevestigd vóór `prisma migrate deploy`). Additief: één nullable kolom
  `gln_backfill_reason VARCHAR(50)`. Down-script meegeleverd.
- Diff-drift-noot: `prisma migrate diff` toonde ook een niet-gerelateerde
  `retraining_notifications.reasons DROP DEFAULT` (pre-existing schema/DB-discrepantie
  uit een eerdere migratie). Die is BEWUST NIET in migratie 0020 opgenomen — 0020
  bevat uitsluitend de 18.1-DDL.
- vitest: 3 nieuwe/aangepaste testbestanden, 26 tests groen; volledige api-suite groen.

### Completion Notes

1. **Migratie 0020** (`add_gln_backfill_reason`): `artwork_imports.gln_backfill_reason`
   nullable VARCHAR(50) + `down.sql`. `failureReason` NIET hergebruikt (andere semantiek).
2. **Exportscript** `apps/api/scripts/backfill-gln-from-tradeitems.ts`: idempotent,
   `--dry-run` default (schrijft NIETS — 0 PG, 0 Redis), `--apply` voor de echte run,
   `--skip-preload` optioneel. Pure kern (`parseGlnFromId`/`decideOutcome`/`summarize`/
   `runBackfill`) is I/O-vrij en injecteerbaar; de MongoDB-driver wordt lazy dynamisch
   geïmporteerd zodat tests/dry-run hem nooit nodig hebben. Nooit-overschrijven: PG-update
   filtert op `gln: null`. >1 GLN → `meerdere-glns` (niet gokken); 0 → `geen-tradeitem`.
3. **Redis-preload** (apply-fase): roept de bestaande `resolveDeclarations`-provider aan
   (gln-lookup → cache → catalog → cache-write incl. negative caching); fail-safe.
4. **GLN-dekkingspaneel** `apps/api/src/services/flywheel/overview/gln-coverage.ts`:
   on-read percentage records-met-GLN (doel ≥90%), totalen, uitval-verdeling per reden
   (null → `niet-verwerkt`), deling-door-nul → `percentage: null`. Vervangt de
   lege-staat-stub (`empty-panels.ts` verwijderd; `index.ts` en het 15.2-paneeltest
   bijgewerkt).
5. **Tests** (vitest, gemockt Mongo/prisma/redis): `_id`-parse incl. randgevallen,
   uitvalreden-toekenning, nooit-overschrijven, idempotentie, dry-run-nul-writes,
   coverage-paneel + lege-tabel-rand.

De echte dekkingsgraad vóór/ná (≥90%-toets) volgt uit de aparte operationele run
(taak 6) die Friso los aftrapt; die is buiten scope van /implement-sprint.

### File List

- `apps/api/prisma/schema.prisma` (M — kolom `glnBackfillReason`)
- `apps/api/prisma/migrations/0020_add_gln_backfill_reason/migration.sql` (A)
- `apps/api/prisma/migrations/0020_add_gln_backfill_reason/down.sql` (A)
- `apps/api/scripts/backfill-gln-from-tradeitems.ts` (A)
- `apps/api/src/services/flywheel/overview/gln-coverage.ts` (A)
- `apps/api/src/services/flywheel/overview/index.ts` (M — echte glnCoverage-sub-service)
- `apps/api/src/services/flywheel/overview/empty-panels.ts` (D — stub vervallen)
- `apps/api/src/__tests__/setup.ts` (M — artworkImport groupBy/updateMany mock)
- `apps/api/src/__tests__/services/gln-coverage.test.ts` → `flywheel-gln-coverage.test.ts` (A)
- `apps/api/src/__tests__/services/backfill-gln-from-tradeitems.test.ts` (A)
- `apps/api/src/__tests__/services/flywheel-overview-panels.test.ts` (M — stale stub-test vervangen)

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Epic 18, AD-7/ARCH-8 en codebase-verificatie (schema.prisma ArtworkImport, t3777-declarations.ts, artwork-pipeline.ts gln-regels, scripts-precedent).
