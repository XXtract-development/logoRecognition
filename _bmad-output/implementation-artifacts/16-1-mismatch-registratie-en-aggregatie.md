# Story 16.1: Mismatch-registratie en -aggregatie

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Epic 16 — Mismatch-stromen als brandstof en datakwaliteitssignaal. -->

## Story

As a **datamanager**,
I want **dat elke verwerking vastlegt welke gedeclareerde codes bevestigd, niet gevonden of niet ondersteund waren én welke vondsten niet gedeclareerd waren**,
So that **de twee waardevolste datastromen van het vliegwiel niet langer verdampen**.

### Afbakening

- Deze story levert de **registratie + aggregatie** (FR-14). De vervolgstromen zijn aparte stories: werkvoorraad (16.2, FR-15) en datakwaliteitsrapport (16.3, FR-16) lezen uit dezelfde tabel — één gedeeld contract (Structural Seed `mismatch_events`).
- Geen wijziging aan het gedrag van `crosscheckDetections` zelf (review-items, auto-accepts) en geen wijziging aan het 12.8-verdict-responsecontract richting n8n. Registratie is een bij-effect, nooit een gedragswijziging.
- **Afhankelijkheden:** Story 13.2 levert de hook-plek-instrumentatie en de vlag `FLYWHEEL_NOMINATION_ENABLED` + promotiedrempels; Story 12.8 levert het kruischeck-pad (per 2026-07-02 ready-for-dev, nog niet geïmplementeerd — zie coördinatietaak AC4). Deze story kan het crosscheck-pad al volledig leveren en het kruischeck-pad als voorbereide aansluiting.

## Acceptatiecriteria

1. **Migratie ter goedkeuring (ARCH-2).**
   **Given** de nieuwe Prisma-migratie voor `mismatch_events`
   **When** de migratie wordt voorbereid
   **Then** wordt deze ter expliciete goedkeuring voorgelegd — nooit automatisch uitgevoerd, en mét een gedocumenteerd terugdraaipad (down-script).
   Tabel conform Structural Seed: `id, gtin, gln, t3777Code, type (confirmed/declared-not-found/not-supported/found-not-declared), confidence, origin/runId, createdAt` — eigenaar `apps/api` (AD-2); conventies: snake_case `@@map`, status/type als `String @db.VarChar(...)` (géén Prisma-enum), `@db.Timestamptz`, index `createdAt(sort: Desc)` + indexen op `(t3777Code)` en `(gln)` voor de aggregatie.

2. **Registratie per verwerking (volledige typeset).**
   **Given** een verwerking met declaratie (crosscheck- of kruischeck-pad)
   **When** de flow afrondt
   **Then** ontstaat per gedeclareerde code een `mismatch_events`-record met type `confirmed`, `declared-not-found` of `not-supported`, en per hoogbetrouwbare niet-gedeclareerde vondst een record met type `found-not-declared` (volledige typeset conform Structural Seed, zodat de FR-14-ratio bevestigd/niet-gevonden berekenbaar is), met GTIN, GLN, code, confidence en herkomst/runId (FR-14)
   **And** telt voor `found-not-declared` alleen confidence ≥ promotiedrempel van de gebruikte methode (`FLYWHEEL_PROMOTION_THRESHOLD_<METHODE>`, Story 13.2 / FR-5) — lage-confidence-vondsten produceren géén record (FR-16-voorwaarde).

3. **Vlag-scoping (AD-8 — kritiek).**
   **Given** de vlag-scoping van de registratie
   **When** een verwerking afrondt
   **Then** registreert het crosscheck-pad mismatch-events onder de hoofdvlag `FLYWHEEL_NOMINATION_ENABLED`, en valt mismatch-registratie op het kruischeck-pad onder `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` — **met die vlag uit schrijft het kruischeck-pad NIETS** en blijft het verdict-pad contract-conform (het 12.8-responsecontract richting n8n verandert op geen enkele wijze) (AD-8)
   **And** staan beide vlaggen default op `false` (verse deploy registreert niets).

4. **Story-taak: afstemmoment n8n/12.8.** Kort afstemmoment met het n8n-/12.8-werk over de contractuitbreiding — het vlag-gedrag (kruischeck-registratie alleen bij `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED=true`, verdict-response ongewijzigd) wordt gedocumenteerd in de 12.8-API-docs (route-docblock/OpenAPI van `verify-declared`). Vastleggen in het Dev Agent Record wie/wanneer.

5. **Aggregatie en trend.**
   **Given** geaggregeerde events
   **When** het dashboard de mismatch-trend opvraagt
   **Then** zijn verhouding bevestigd/niet-gevonden per klasse (T3777-code) én per informatieleverancier (GLN) en de trend over tijd beschikbaar via de overview-API (`/api/v1/flywheel/overview`, modulaire sub-service — coördinatie-noot epics), en vult het mismatch-paneel uit Story 15.2 zich (FR-14, UX-DR3). Zolang 15.2 nog niet bestaat is de sub-service + endpoint-sectie zelfstandig testbaar (het paneel toont dan zijn lege staat, UX-DR8). Filter op reguliere herkomst; cohort-herkomst (`cohort-*`, Story 16.4) uitsluiten uit deze aggregatie.

6. **Tests.**
   - Unit (vitest, apps/api): type-mapping per uitkomst (confirmed / declared-not-found / not-supported / found-not-declared), promotiedrempel-randgevallen voor found-not-declared (op, net onder, net boven de drempel; per methode), vlag-scoping (beide vlaggen × beide paden = 4 combinaties, kruischeck-uit schrijft 0 rijen).
   - Integratie: crosscheck-verwerking met declaratie → verwachte rijen in `mismatch_events`; idempotentie-gedrag gedocumenteerd (herverwerking van dezelfde GTIN: events zijn per-run-observaties met runId — géén dedup-eis, wel herleidbaar per run).
   - Aggregatie-query: ratio + trend correct over een geseede eventset.
   - E2E: NIET aan de stable-subset-gate toevoegen.

## Tasks / Subtasks

- [ ] 1. Prisma-migratie `mismatch_events` voorbereiden + down-script documenteren; **expliciete goedkeuring aan Friso vragen vóór `prisma migrate deploy`** (AC: 1)
- [ ] 2. Registratie-service `apps/api/src/services/flywheel/mismatch-events.ts`: pure mapping (declared[], detecties, actieve-klassen-set, drempels → event-rijen) + persist-functie (AC: 2)
  - [ ] 2.1 `not-supported`-bepaling: gedeclareerde code zonder actieve referentieklasse (zelfde bron als 12.8-AC3: `SELECT DISTINCT t3777_code FROM reference_logos WHERE active=true`, na alias-mapping `t3777-aliases.ts` zodra 12.8 die levert)
  - [ ] 2.2 GLN-bron: `artwork_imports.gln` (schema.prisma:448) via de gln-lookup die `t3777-declarations.ts` al doet — geen tweede lookup-implementatie
- [ ] 3. Crosscheck-pad aanhaken op de 13.2-hook-plek (detection-flow.ts rond de `crosscheckDetections`-aanroep, :252) onder `FLYWHEEL_NOMINATION_ENABLED` (AC: 2, 3)
- [ ] 4. Kruischeck-pad aanhaken (12.8 verify-flow) onder `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`; als 12.8 nog niet gemerged is: aansluitpunt + tests klaarzetten en dit expliciet in het Dev Agent Record noteren (AC: 2, 3)
- [ ] 5. Afstemmoment n8n/12.8 + vlag-gedrag documenteren in de 12.8-API-docs (AC: 4)
- [ ] 6. Overview-sub-service `apps/api/src/services/flywheel/overview-mismatch.ts` (ratio per code + per GLN, trend per periode) + sectie in `/api/v1/flywheel/overview` (AC: 5)
- [ ] 7. Unit-/integratietests (AC: 6)
- [ ] 8. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy

## Dev Notes — Developer Context

### Wat er AL bestaat (geverifieerd 2026-07-02, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Crosscheck-service (de hook-plek) | `apps/api/src/services/artwork-crosscheck.ts` (188 regels) — `crosscheckDetections()` :95, drempels :27–35, `getThresholdForMethod()` :52 | Levert per verwerking exact de vier uitkomsten die de typeset nodig heeft: autoAccepted (→`confirmed`), "verwacht maar niet gevonden" :153–160 (→`declared-not-found`), "gevonden maar niet verwacht" :137–148 (→`found-not-declared`-kandidaat). Coördinatie-noot epics: **Story 16.1 hergebruikt exact de 13.2-hook-plek — één instrumentatiepunt, twee afnemers.** |
| Aanroepsite in de worker | `apps/api/src/services/pipeline/detection-flow.ts` :243 (`activeDeclarationProvider(gtin)`), :252–256 (`crosscheckDetections`-aanroep) | Hier (of in de 13.2-hook zelf) landt de registratie — in het worker-pad, nooit in een HTTP-request-pad (NFR-3). |
| Declaratieprovider + GLN-lookup | `apps/api/src/services/t3777-declarations.ts` (468 regels) — `resolveDeclarations()` :213, reason-codes :46 e.v., gln-lookup op `artwork_imports.gln` | Bron van `declared[]` én van de GLN per GTIN. Fail-safe-reasons: bij `api-fout`/`gln-ontbreekt` is er géén declaratie — dan géén mismatch-events schrijven (een lege declaratie door een fout is geen "alles niet-gevonden"). |
| GLN-kolom | `apps/api/prisma/schema.prisma` :448 (`ArtworkImport.gln`) | GLN-veld voor het event. Kan `null` zijn (Epic 18 vult het archief pas) — kolom nullable, aggregatie per GLN groepeert dan op "onbekend". |
| Actieve-klassen-set | `reference_logos WHERE active=true` (patroon: `apps/ml-service/app/services/queue_harvest.py` :109–113) | Bepaalt `not-supported`. Node-zijde via Prisma, niet via ml-service. |
| Kruischeck-pad | `_bmad-output/implementation-artifacts/12-8-kruischeck-endpoint-n8n.md` — verify-flow, verdicts CONFIRMED/UNCERTAIN/NOT_FOUND/UNSUPPORTED | Tweede afnemer. Verdict→type-mapping: CONFIRMED→`confirmed`, NOT_FOUND→`declared-not-found`, UNSUPPORTED→`not-supported`; UNCERTAIN produceert géén event (onder drempel — geen van de typeset-betekenissen). Per 2026-07-02 nog niet geïmplementeerd (geen `verify-declared`-bestand in `apps/api/src/api/v1/`). |
| v1-route- en overview-conventie | `apps/api/src/api/v1/` (bestaande routebestanden); spine: nieuw `apps/api/src/api/v1/flywheel.ts` | Overview is modulair per paneel (coördinatie-noot epics); deze story levert alléén de mismatch-sub-service + sectie. |

### Wat er NIEUW is

1. Prisma-model `MismatchEvent` → `@@map("mismatch_events")` + migratie + down-script (AC1).
2. `apps/api/src/services/flywheel/mismatch-events.ts` — mapping + persist (pure mapping apart houden: unit-testbaar zonder DB).
3. Hook-aanroepen in het crosscheck-pad (13.2-hook-plek) en voorbereid in het kruischeck-pad, elk onder de juiste vlag (AD-8).
4. `apps/api/src/services/flywheel/overview-mismatch.ts` + overview-sectie (spine source-tree: `services/flywheel/`, routebestand `api/v1/flywheel.ts`).

### Bindende AD's

- **AD-8 (vlag-scoping)** — de kern van deze story: crosscheck-registratie onder hoofdvlag, kruischeck-registratie onder de aparte kruischeck-vlag; kruischeck-vlag uit ⇒ nul writes op dat pad; verdict-response byte-gelijk (12.8-contract).
- **AD-2** — `apps/api` is exclusieve eigenaar van `mismatch_events`; ml-service schrijft er nooit in.
- **AD-13** — herleidbaarheid: elk event draagt herkomst/runId zodat 16.2 (werkvoorraad→GTINs) en 16.3 (rapport→bronbestand via runId/verwerking) kunnen herleiden.
- **NFR-3/NFR-7** — registratie draait in het bestaande worker-pad; geen extra latency op live-API-requests.

### Guardrails (voorkom bekende fouten)

- **Migratie-toestemming (ARCH-2/teamregel):** migratie alléén na expliciete toestemming per geval; handmatig `prisma migrate deploy`; NOOIT auto-migrate of migrate in container-startup; down-script verplicht meegeleverd.
- **Gedrag van crosscheck niet wijzigen:** `crosscheckDetections` blijft byte-gelijk (8-3O-erfenis: "byte-for-byte behaviour"); registratie hangt eráán, niet erín — instrumenteer op de hook-plek, herbereken geen uitkomsten.
- **Fail-safe nooit maskeren:** declaratie-reason ≠ `ok`/`lege-declaratie` ⇒ geen declaratie-events fabriceren (patroon 8-3D/12.8-AC2).
- **Eén instrumentatiepunt:** niet een tweede crosscheck-vergelijking bouwen voor de events; de uitkomsten van de bestaande vergelijking hergebruiken (review-finding anders).
- Deploy-volgorde bij meerdere apps: ml → api → web (hier alleen api); ghcr-workflow "Build and Push Docker Images" laten slagen vóór Coolify-deploy (ACC draait pre-built images).
- Commits/PRs in het Engels; `versions.md` (NL, eindgebruikerstaal) in DEZELFDE commit.
- E2E buiten de stable-subset-gate houden.

### Testrichtlijnen

- Vitest, apps/api. Mapping-functie puur testen (geen DB): alle vier typen, drempel-randgevallen per methode, UNCERTAIN-verdicts → geen event, fail-safe-reasons → geen events.
- Vlag-matrix als tabel-test: (hoofdvlag, kruischeck-vlag) × (crosscheck-pad, kruischeck-pad) → verwacht aantal writes.
- Integratie met gemockte declaratieprovider; assert op rijen incl. gln=null-pad.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 16.1 (AC-bron) + coördinatie-noot overview/hook.
- `ARCHITECTURE-SPINE.md` — AD-2, AD-8, AD-13, Structural Seed `mismatch_events`, Consistency Conventions.
- PRD §4.5 FR-14 (+ FR-16-voorwaarde in FR-16 consequences).
- `_bmad-output/implementation-artifacts/12-8-kruischeck-endpoint-n8n.md` — kruischeck-contract (AC4-afstemming).

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Story 16.1, ARCHITECTURE-SPINE (AD-8-vlag-scoping, mismatch_events-typeset) en codebase-verificatie van de crosscheck-hook-plek.
