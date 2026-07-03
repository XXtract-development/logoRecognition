# Story 14.3: Wekelijkse outlier-audit op de referentiebibliotheek

Status: ready-for-dev

<!-- Aangemaakt door create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 14 / Story 14.3. -->

## Story

Als **datamanager**
wil ik **dat afwijkende referenties (ook handmatig gecureerde) wekelijks gesignaleerd worden**
zodat **een RECYCLABLE-achtig incident voortaan vooraf gevangen wordt** (FR-8).

### Afbakening (kritiek)

- **Signalering en persistentie, méér niet.** De audit deactiveert niets automatisch (FR-8). De beoordelingsacties (Behouden/Deactiveren) verlopen via de dashboard-flow van Story 15.2 (endpoint `outliers/:id/decision`) — buiten deze story.
- De audit dekt de **volledige actieve referentiebibliotheek** per klasse — dus óók handmatig gecureerde referenties (het RECYCLABLE-incident betrof een handmatig geplaatste referentie).
- **Read-only werk:** de audit draait door bij pauzestand (AD-11 pauze-scope) en muteert nooit referenties.

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 14.3)*

1. **Given** de nieuwe Prisma-migratie voor `outlier_findings` (conform Structural Seed)
   **When** de migratie wordt voorbereid
   **Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

2. **Given** alle actieve referenties van een klasse
   **When** de repeatable job `flywheel-outlier-audit` (wekelijks, queue `flywheel`) via `/ml/outlier-audit` centroid-afstanden berekent
   **Then** worden referenties in het bovenste 5%-percentiel of boven de absolute grens gemarkeerd als outlier-melding met vergelijkingsdata (FR-8, AD-9)
   **And** dekt de audit óók handmatig gecureerde referenties (FR-8)
   **And** deactiveert de audit zelf niets (FR-8).

3. **Given** een afgeronde audit-run
   **When** het resultaat wordt vastgelegd
   **Then** is het persistent in `outlier_findings` (status `open`) en opvraagbaar via de overview-API (herstart-bestendig), inclusief run-tijdstempel (NFR-5).

4. **Given** een openstaande outlier-melding
   **When** de datamanager wil beoordelen
   **Then** verlopen de beoordelingsacties (Behouden/Deactiveren) via de dashboard-flow van Story 15.2 (endpoint `outliers/:id/decision`) — deze story levert uitsluitend signalering en persistentie.

5. **Given** de pauzestand actief
   **When** de audit draait
   **Then** draait die gewoon door (read-only; AD-11 pauze-scope).

## Tasks / Subtasks

- [ ] 1. Prisma-migratie `outlier_findings` (AC: 1) — **EXPLICIETE GOEDKEURINGSTAAK**
  - [ ] Model conform Structural Seed: `id, auditRunAt, referenceLogoId FK, distance, percentile, status (open/behouden/gedeactiveerd — String @db.VarChar(20)), decidedBy?, decidedAt?, createdAt` + `@@map("outlier_findings")`, snake_case kolommen, `@db.Timestamptz`, index `createdAt(sort: Desc)` en index op `status`.
  - [ ] Migratie voorbereiden, ter goedkeuring aan de gebruiker voorleggen, NOOIT zelf uitvoeren (ook niet lokaal auto-migrate); uitvoering handmatig `prisma migrate deploy` na akkoord (operationele envelope §2).
  - [ ] Gedocumenteerd terugdraaipad meeleveren: down-script (`DROP TABLE outlier_findings;` + eventuele indexen) als bestand naast de migratie of in de migratie-README.
- [ ] 2. ml-service `/ml/outlier-audit` — bibliotheek-brede modus (AC: 2)
  - [ ] Nieuwe/uitgebreide route in `apps/ml-service/app/api/flywheel.py` (prefix `/ml`, registreren in `main.py`); rekenlogica in `apps/ml-service/app/services/outlier.py` — **uitsluitend onder `app/`** (constraint 2, Docker kopieert alleen `app/`).
  - [ ] Per klasse: centroid over de actieve `reference_embeddings` (read-only PG-toegang is toegestaan voor eval, spine-invariant), cosine-afstand per referentie, percentiel binnen de klasse. Respons: per referentie `{ referenceLogoId, t3777Code, distance, percentile }` + klasse-samenvatting.
  - [ ] Let op samenloop met Story 13.4 (per-batch outlier-guardrail gebruikt hetzelfde endpoint voor kandidaten): één endpoint, twee modi (kandidaat-set als payload vs. bibliotheek-breed per klasse) — bestaat de 13.4-versie al, breid uit; anders bouw jij hem en sluit 13.4 later aan. Documenteer het request-contract in de docblock.
- [ ] 3. MLClient-methode (AC: 2) — `apps/api/src/services/ml-client.ts`: `outlierAudit(...)` conform bestaand methodenpatroon (localizeArtwork:360, classifyArtwork:386); ml-aanroepen uitsluitend via MLClient (spine-conventie).
- [ ] 4. Job `flywheel-outlier-audit` (AC: 2, 3, 5)
  - [ ] Queue `flywheel` (worker-concurrency 1) — bestaat de queue al (Story 13.4), hergebruik; anders aanmaken naast `training`/`artwork-detection` in `apps/api/src/services/pipeline/queue.ts` (patroon `createPipelineQueues`, :98–108).
  - [ ] Repeatable via **Job Schedulers** (`queue.upsertJobScheduler`) — NIET het gedeprecieerde `repeat:{pattern}`-patroon (AD-6, BullMQ 5.63). Cadans `FLYWHEEL_OUTLIER_AUDIT_CRON`, default wekelijks buiten kantooruren én buiten het harvest-venster (~03:23) en de promotielus (01:00) — bv. zondag 05:00 Europe/Amsterdam.
  - [ ] Verwerkerslogica in `apps/api/src/services/flywheel/outlier-audit.ts`: alle actieve klassen → MLClient → drempels toepassen (`FLYWHEEL_OUTLIER_PERCENTILE` default 0.95, `FLYWHEEL_OUTLIER_ABS_DISTANCE` als absolute grens; startwaarden PRD, kalibreerbaar) → per treffer een `outlier_findings`-rij status `open`, mét `auditRunAt` (run-tijdstempel, één waarde per run).
  - [ ] Idempotent per run: her-run van dezelfde week vervangt geen open findings maar voegt geen duplicaten toe voor dezelfde (referenceLogoId, nog-open) melding — dedup op `referenceLogoId` + status `open`.
  - [ ] Pauzestand: GEEN pauze-check bij job-start — de audit is read-only en valt buiten de pauze-scope (AD-11, AC5). Leg dit vast in een code-comment zodat een latere "consistentie-fix" hem niet per ongeluk onder de pauze hangt.
- [ ] 5. Ontsluiting via de overview-API (AC: 3) — paneel-sleutel `outliers` in `/api/v1/flywheel/overview` (modulaire sub-service, coördinatie-noot epics): open findings + laatste `auditRunAt`. Beoordelings-endpoint NIET bouwen (Story 15.2).
- [ ] 6. Tests
  - [ ] Pytest (ml-service): centroid/afstand/percentiel deterministisch op synthetische vectoren; klasse met 1 referentie (percentiel-randgeval — geen outlier op zichzelf); lege klasse.
  - [ ] Vitest (apps/api): drempel-toepassing (percentiel- én absolute-grens-pad), dedup open findings, persistentie + run-tijdstempel, gecureerde referenties (source ≠ flywheel-promotion) worden meegenomen, audit muteert `reference_logos` niet (assert geen update-calls), overview-paneel.
- [ ] 7. versions.md (NL) in DEZELFDE commit; Engelse commit; deploy-volgorde **ml-service → api** (endpoint vóór aanroeper, envelope §5); ghcr-workflow "Build and Push Docker Images" afwachten vóór Coolify-deploy; migratie handmatig na expliciete toestemming.

## Dev Notes — Developer Context

### Bindende architectuurbeslissingen

- **AD-9** — beeld-/vectorberekeningen (centroid, cosine) uitsluitend in ml-service; API beslist op geretourneerde scores; drempels als env-config (outlier: top-5%-percentiel of absolute grens).
- **AD-6** — orkestratie via BullMQ in de bestaande API-worker; queue `flywheel`, concurrency 1; Job Schedulers, niet het deprecated repeat-patroon.
- **AD-11** — pauze-scope: audit is read-only en draait dóór bij pauze.
- **AD-2** — API schrijft `outlier_findings`; ml-service leest hoogstens embeddings (eval-uitzondering) en schrijft nooit vliegwiel-tabellen.
- **ARCH-2** — migratie alleen na expliciete toestemming per geval, mét down-script. **ARCH-3/constraint 2** — ml-code uitsluitend onder `apps/ml-service/app/`. **ARCH-6** — endpointnaam `/ml/outlier-audit`, jobnaam `flywheel-outlier-audit`, queue `flywheel`.

### Wat er AL bestaat (geverifieerd, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Queue-fabriek + Redis | `apps/api/src/services/pipeline/queue.ts:98–108` (`createPipelineQueues`; queues `training`, `artwork-detection`), `getRedisConnection` | Patroon voor de `flywheel`-queue en de worker-registratie (`workers.ts` in dezelfde map). |
| MLClient | `apps/api/src/services/ml-client.ts:137` (class), `:360` localizeArtwork, `:386` classifyArtwork, `:447` registerReference | Methodenpatroon voor `outlierAudit`. |
| ml-service embeddings/similarity | `apps/ml-service/app/services/similarity.py` (o.a. `store_logo_embedding:141`, `rebuild_reference_embeddings:244`, `register_crop_as_reference:316`, near-dup cosine 0.97) | Embedding-toegang, pgvector-queries en DB-connectiepatroon (`db_service.get_connection`) om op voort te bouwen; er bestaat nog GÉÉN centroid-functie — die is nieuw in `outlier.py`. |
| ml-router-registratie | `apps/ml-service/app/api/` (artwork.py, detection.py, …) + `main.py` | Registratiepatroon voor `flywheel.py` met prefix `/ml`. |
| Notificatie-/audit-tabelpatroon | `apps/api/prisma/schema.prisma` — `RetrainingNotification:478–488`, `ModelActivationLog:492–503` | Prisma-conventies (Timestamptz, VarChar-status, index Desc) voor het `outlier_findings`-model. Notificaties zijn hier NIET nodig (audit signaleert via dashboard, geen stilstand). |
| Soft-delete-patroon referenties | `apps/api/src/api/v1/artwork-pipeline.ts:1240–1244` (`referenceLogo.updateMany … active:false`) | Ter referentie: zó doet 15.2 straks "Deactiveren" — deze story raakt dat pad niet. |

### Wat er NIEUW is (de eigenlijke story)

1. Prisma-model + migratie `outlier_findings` (+ down-script) — de enige schemawijziging.
2. `apps/ml-service/app/services/outlier.py` + route in `apps/ml-service/app/api/flywheel.py`.
3. MLClient-methode `outlierAudit`.
4. `apps/api/src/services/flywheel/outlier-audit.ts` + job-registratie (queue `flywheel`, Job Scheduler) in `services/pipeline/`.
5. Overview-paneel `outliers` (sub-service, mergebaar naast de panelen van 14.2/15.2).

### Afhankelijkheden en samenloop

- **Story 13.4** deelt `/ml/outlier-audit` (per-batch guardrail-modus) en de queue `flywheel`. Geen harde blokkade: wie het eerst landt bouwt endpoint/queue, de ander sluit aan. Stem het request-contract af (kandidaat-payload-modus vs. bibliotheek-modus) en noteer de keuze in het Dev Agent Record.
- **Story 15.2** consumeert `outlier_findings` (vergelijkingsweergave + `outliers/:id/decision`). De status-waardenset `open/behouden/gedeactiveerd` is het contract — niet wijzigen zonder 15.2-afstemming.
- Geen afhankelijkheid van 13.1/13.2/13.3 (geen phash, geen kandidaten, geen gold-set).

### Guardrails (voorkom bekende fouten)

- **Migratie-toestemming is een story-taak, geen formaliteit:** migratie voorbereiden → expliciet akkoord van Friso → pas dan handmatig draaien. Down-script verplicht meeleveren. NOOIT auto-migrate of migrate in container-startup (teamregel databaseveiligheid).
- **ml-code onder `app/`** — het queue-harvester-incident: Docker kopieert alleen `app/`; code in `scripts/` draait op ACC simpelweg niet.
- **Audit deactiveert niets** — geen enkele write op `reference_logos`; de enige writes zijn `outlier_findings`-inserts.
- **Geen tweede scheduler** — geen Coolify scheduled task, geen cron in ml-service (AD-6-les).
- Deploy-volgorde ml-service → api (endpoint vóór aanroeper); ghcr-build vóór Coolify (ACC draait pre-built images — anders draait oude code).
- E2E buiten de stable-subset-gate; commits Engels + `versions.md` (NL) in DEZELFDE commit.

### Testrichtlijnen

- Pytest: rekenkern puur en deterministisch (synthetische embeddings, bekende afstanden); randgevallen klein-N (1–2 referenties per klasse: definieer en test expliciet dat een klasse met <3 referenties geen percentiel-outliers oplevert, alleen absolute-grens-treffers — anders is 1 van de 2 altijd "top 5%").
- Vitest: job-flow met gemockte MLClient/prisma; herstart-bestendigheid (findings persistent, her-run dedupt open findings); pauze-scenario (pauze aan → audit draait tóch).
- Integratie op ACC (bewijs, Dev Agent Record): één handmatige job-trigger, `outlier_findings`-rijen + overview-respons plakken.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 14.3 (AC-bron), Story 13.4 (gedeeld endpoint), Story 15.2 (beoordelingsflow).
- `_bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md` — AD-2, AD-6, AD-9, AD-11; Structural Seed `outlier_findings`; ARCH-6-namen; operationele envelope §1/§2/§5.
- `_bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md` — §4.2 FR-8 (incl. assumpties wekelijks / top-5% / absolute grens; RECYCLABLE-incident-context).

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Epic 14, spine-AD's en codebase-verificatie (queue.ts, ml-client.ts, similarity.py, schema.prisma).
