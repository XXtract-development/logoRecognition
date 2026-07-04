# Story 18.2: Restant-route via mediaserver-re-import

Status: ready-for-dev

<!-- Aangemaakt door create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 18 / Story 18.2. -->

## Story

Als **datamanager**
wil ik **dat het restant zonder GLN via de bestaande re-importroute alsnog gedekt wordt**
zodat **de dekkingsgraad richting het doel kruipt zonder nieuwe mechanismen** (FR-21).

### Afbakening (kritiek)

- **Geen nieuw mechanisme.** De GLN-vulling zelf is het bestáánde 8-3O-backfill-pad: een re-import-run herkent al-geïmporteerde media (dedup op `mediaId`) en vult dan alléén de ontbrekende GLN bij ("re-import is the documented repair path", artwork-pipeline.ts:250–260). Deze story bouwt uitsluitend de gedoseerde aansturing eromheen.
- **CPU-getemperd is een harde eis** (NFR-3): batch-grootte en pauze-interval via `FLYWHEEL_`-envvars met conservatieve defaults — de les van 2026-06-15 (ongetemperde bulk deed de frontend-health-check timeouten) geldt onverkort.
- Vereist Story 18.1 (uitvalredenen + dekkingsgraad-paneel); deze story werkt het restant en de redenen bíj, en hermeet de dekking.

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 18.2)*

1. **Given** records met uitvalreden na Story 18.1
   **When** de terugval-route draait (bestaand mediaserver-backfill-mechanisme, 8-3O)
   **Then** worden resterende GLN's per re-import gevuld en de uitvalreden bijgewerkt (FR-21, AD-7)
   **And** blijft de verwerking batch-gewijs en CPU-getemperd — batch-grootte en pauze-interval zijn configureerbaar via envvars (`FLYWHEEL_`-prefix) met conservatieve defaults — zodat de live-verwerking er geen last van heeft (NFR-3).

2. **Given** de afgeronde terugval-run
   **When** de dekkingsgraad opnieuw gemeten wordt
   **Then** toont het dashboard de bijgewerkte dekking en het definitieve restant met redenen (FR-21).

## Tasks / Subtasks

- [ ] 1. Driver-script `apps/api/scripts/gln-reimport-restant.ts` (AC: 1)
  - [ ] Selectie: unieke GTINs van `artwork_imports`-records met `gln IS NULL` en een gezette `glnBackfillReason` (18.1-restant). `--dry-run`: toont alleen het plan (aantal GTINs, batch-indeling), schrijft niets.
  - [ ] Batch-gewijze aansturing van het bestaande re-importmechanisme: per batch een import-run voor die GTINs (via `runImportLoop`/het `POST /artwork-import/runs`-pad, artwork-pipeline.ts:513 — hergebruik de bestaande functie, herbouw de loop niet) en wachten tot de run klaar is vóór de volgende batch start.
  - [ ] Dosering via envvars met conservatieve defaults: `FLYWHEEL_GLN_REIMPORT_BATCH_SIZE` (default 25 GTINs per batch) en `FLYWHEEL_GLN_REIMPORT_PAUSE_MS` (default 30000 ms tussen batches). Defaults documenteren in het env-voorbeeldbestand van apps/api en in de script-usage.
  - [ ] Handmatig gestart, hervatbaar/idempotent: bij herstart worden alleen nog-openstaande restant-GTINs geselecteerd (de dedup-skip van het importpad maakt herverwerking van al-gevulde records vanzelf een no-op).
- [ ] 2. Uitvalreden bijwerken (AC: 1)
  - [ ] Ná elke batch: records die nu een GLN hebben → `glnBackfillReason = NULL` (opgelost); records die ook na re-import geen GLN hebben → reden bijwerken naar `mediaserver-geen-gln` (de mediaserver-discovery leverde geen afleidbare GLN — `deriveGlnFromPreviewUrl`, mediaserver-client.ts:54) of `mediaserver-geen-media` (discovery leverde niets voor deze GTIN). Geen stille uitval: elk restant-record houdt een actuele reden.
- [ ] 3. Dekkingsgraad-hermeting (AC: 2) — geen nieuw werk in het dashboard: het 18.1-paneel `glnCoverage` rekent on-read, dus de bijgewerkte dekking en de definitieve restant-verdeling verschijnen vanzelf. Het script print de dekking vóór/ná als samenvatting; vóór/ná + definitieve restant-verdeling in het Dev Agent Record plakken (bewijs).
- [ ] 4. Tests (vitest, apps/api): selectie (alleen 18.1-restant), batch-indeling + pauze-respect (fake timers), reden-bijwerking beide paden (gevuld → NULL; niet-gevuld → nieuwe reden), dry-run-nul-writes, idempotente her-start, envvar-defaults. Mediaserver/prisma gemockt; de bestaande importloop-tests (8-3O) blijven ongemoeid en groen.
- [ ] 5. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-workflow "Build and Push Docker Images" afwachten vóór Coolify-deploy; daarna gecontroleerde handmatige uitvoering off-peak.

## Dev Notes — Developer Context

### Bindende architectuurbeslissingen

- **AD-7** — terugval (b): re-import via mediaserver-backfill voor het restant van de batch-export (a, Story 18.1). Dit ís de gekozen architectuurroute — geen derde mechanisme (externe lookups) introduceren.
- **NFR-3 / feature-NFR §4.1** — geen impact op de live-verwerking: batch-gewijs, getemperd, off-peak draaien.
- **ARCH-4 §3** — handmatig gestart, idempotent, met droge-run (zelfde envelope als 18.1).
- **Spine-conventie env** — `FLYWHEEL_`-prefix voor de doseringsvariabelen.
- **Geen migratie** in deze story: de reden-kolom bestaat na 18.1 (ARCH-2 raakt deze story dus niet — mocht de dev tóch een schemawijziging nodig achten: expliciete toestemming per geval + down-script, teamregel).

### Wat er AL bestaat (geverifieerd — dit is het mechanisme, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Import-run-endpoint + loop | `apps/api/src/api/v1/artwork-pipeline.ts:513–545` (`POST /artwork-import/runs`, accepteert `{ gtins: [...] }`, 202 + achtergrondloop `runImportLoop`); status-poll `GET /artwork-import/runs/:runId` (:554) | De motor die het script per batch aanstuurt; delta-strategie skipt al-geïmporteerde media standaard. |
| GLN-backfill in de dedup-skip | `apps/api/src/api/v1/artwork-pipeline.ts:244–266` — bestaand record met `status='imported'` en lege gln krijgt `item.gln` bijgeschreven zónder her-download van het bestand | Hét 8-3O-reparatiepad: een re-import van een bestaande GTIN vult alleen de GLN. Dit maakt de restant-route goedkoop — geen nieuwe downloads/rasterisatie voor al-geïmporteerde media. |
| Nooit-clobberen-regel | zelfde bestand, upsert-update ("Never clobber a previously stored gln with NULL on re-import") | Bestaande GLN's blijven onaangetast — ook door deze story. |
| GLN-bron per media-item | `apps/api/src/services/mediaserver-client.ts` — `deriveGlnFromPreviewUrl:54`, `discoverArtwork:121` (levert `gln` per item), `downloadFile:173`, singleton `mediaServerClient:202` | Verklaart wanneer re-import wél/níet een GLN oplevert → basis voor de twee bijgewerkte uitvalredenen. |
| Uitvalreden-kolom + coverage-paneel | Story 18.1: `artwork_imports.gln_backfill_reason` (migratie 18.1) en `services/flywheel/gln-coverage.ts` (on-read paneel `glnCoverage`) | Deze story leest/actualiseert de reden en leunt op het paneel voor AC2 — niets dupliceren. |
| Script-precedent + dry-run-patroon | `apps/api/scripts/` (o.a. `stratify-holdout.ts`); 18.1-script `backfill-gln-from-tradeitems.ts` | Zelfde locatie, zelfde `--dry-run`-conventie, zelfde samenvattings-output. |
| Run-heartbeat/stale-marking | `markStaleRuns()` (artwork-pipeline.ts:518) + `heartbeatAt` op runs | Het script hoeft geen eigen crash-administratie: hangende runs worden door het bestaande mechanisme als stale gemarkeerd. |

### Wat er NIEUW is (de eigenlijke story)

1. `apps/api/scripts/gln-reimport-restant.ts` — selectie, batch-dosering, run-poll, reden-bijwerking, samenvatting.
2. Twee envvars `FLYWHEEL_GLN_REIMPORT_BATCH_SIZE` / `FLYWHEEL_GLN_REIMPORT_PAUSE_MS` (+ documentatie in het env-voorbeeldbestand).
3. Nieuwe uitvalreden-waarden `mediaserver-geen-gln` / `mediaserver-geen-media` (stringwaarden in de bestaande kolom — geen schemawijziging).

### Afhankelijkheden

- **Story 18.1 (blokkerend):** reden-kolom, restant-selectie en het coverage-paneel bestaan pas na 18.1. De governance-vraag (ARCH-8) geldt alleen 18.1 (prod-Mongo); deze story raakt geen prod-bron — alleen de eigen mediaserver + eigen database.
- **Onafhankelijk van Epics 13–17**: kan parallel (epics-volgorde-noot: Epic 18 is onafhankelijk).

### Guardrails (voorkom bekende fouten)

- **Temperen is niet optioneel** (les 2026-06-15: ongetemperde bulk → frontend-health-check-timeouts): conservatieve defaults, sequentiële batches, wachten op run-afronding vóór de volgende batch, off-peak draaien. Bij twijfel batch kleiner, pauze langer.
- **Mechanisme hergebruiken, niet forken:** geen kopie van `runImportLoop`, geen eigen mediaserver-loop; wijzigingen aan het importpad zelf horen niet in deze story (het pad werkt al — 8-3O).
- **`force: true` NIET gebruiken** op de import-run tenzij aantoonbaar nodig: de default delta-strategie skipt al-geïmporteerde media en triggert precies de goedkope gln-backfill-tak; force her-controleert alles en kost mediaserver-verkeer.
- **Definitief restant blijft gemarkeerd** — een record zonder GLN zonder actuele reden is een bug (FR-21 "geen stille uitval").
- Containers nooit herstarten/stoppen zonder expliciete bevestiging (teamregel); het script draait als proces, niet als container-ingreep.
- E2E buiten de stable-subset-gate; commits Engels + `versions.md` (NL) in DEZELFDE commit; ghcr-build vóór Coolify-deploy (ACC draait pre-built images).

### Testrichtlijnen

- Vitest, volledig gemockt (mediaserver, prisma, timers): batch-dosering respecteert size/pause-envvars; reden-overgangen (18.1-reden → NULL bij vulling; → `mediaserver-geen-gln`/`-geen-media` bij definitieve uitval); idempotente herstart (tweede run selecteert alleen het overgebleven restant); dry-run = nul writes.
- Regressie: bestaande artwork-pipeline-tests (importloop, gln-upsert-gedrag) blijven byte-gelijk groen — deze story wijzigt dat pad niet.
- Bewijs op ACC (Dev Agent Record): dry-run-plan, dekkingsgraad vóór/ná uit het `glnCoverage`-paneel, definitieve restant-verdeling per reden.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 18.2 (AC-bron), Epic 18-inleiding.
- `_bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md` — AD-7 (terugval b), operationele envelope §1/§3/§5, NFR-3.
- `_bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md` — §4.7 FR-21 (uitvalredenen, dekkingsdoel), §5 non-goal 39k-bulk.
- `_bmad-output/implementation-artifacts/8-3O-server-side-detectie-orkestratie.md` — het herbruikte backfill-mechanisme (gln-sourcing punt 8, re-import als gedocumenteerd reparatiepad).
- `_bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md` — reden-kolom, coverage-paneel, script-conventies.

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Epic 18, AD-7 en codebase-verificatie (artwork-pipeline.ts importloop + gln-backfill-tak, mediaserver-client.ts).
