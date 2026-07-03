# Story 16.2: Gedeclareerd-niet-gevonden wordt werkvoorraad

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-02. Epic 16 — Mismatch-stromen als brandstof en datakwaliteitssignaal. -->

## Story

As a **datamanager**,
I want **dat structurele gedeclareerd-niet-gevonden-patronen automatisch werkvoorraad worden**,
So that **de zwaktes van de bibliotheek zichzelf agenderen**.

### Afbakening

- Deze story levert de **vertaling van events naar zichtbare werkvoorraad** (FR-15): aggregatie over `mismatch_events` (Story 16.1) → `bootstrap_queue`-vulling (lege klassen) of aanvul-signaal (zwakke klassen). **Epic 17 automatiseert de verwerking** (17.1 draait de runs, 17.2 levert prioritering + beheer-UI); deze story maakt de werkvoorraad zichtbaar en herleidbaar.
- De migratie voor `bootstrap_queue` is bewust hiér belegd (epics: "deze story introduceert de wachtrij-data, Story 17.2 verwijst ernaar").
- **Afhankelijkheid:** Story 16.1 (`mismatch_events` bestaat en wordt gevuld). Zonder events is de aggregatie leeg maar werkend.

## Acceptatiecriteria

1. **Migratie ter goedkeuring (ARCH-2).**
   **Given** de nieuwe Prisma-migratie voor `bootstrap_queue` (conform Structural Seed; deze story introduceert de wachtrij-data, Story 17.2 verwijst ernaar)
   **When** de migratie wordt voorbereid
   **Then** wordt deze ter expliciete goedkeuring voorgelegd — nooit automatisch uitgevoerd, en mét een gedocumenteerd terugdraaipad (down-script).
   Tabel conform Structural Seed: `id, t3777Code (uniek), declarationFrequency, status (wachtend/gedraaid/gevuld/leeg/uitgesloten), priorityOverride?, excluded bool, lastRunAt?, createdAt` — eigenaar `apps/api` (AD-2); conventies: snake_case `@@map`, status als `String @db.VarChar(20)` (géén Prisma-enum), `@db.Timestamptz`.

2. **Structureel-drempel → werkvoorraad.**
   **Given** een code met ≥10 declared-not-found-events over ≥5 verschillende GTINs (configureerbaar)
   **When** de aggregatie draait
   **Then** verschijnt de klasse automatisch in de bootstrap-wachtrij (klassen zonder actieve referenties) of als aanvul-signaal (klassen met zwakke dekking) (FR-15)
   **And** is de wachtrij-/signaaldata zichtbaar in het dashboard-paneel (Epic 17 automatiseert de verwerking; deze story levert de zichtbare werkvoorraad).
   Configuratie: `FLYWHEEL_STRUCTURAL_N` (default 10, aantal declared-not-found-events) en `FLYWHEEL_STRUCTURAL_M` (default 5, aantal verschillende GTINs) — PRD-assumptie §4.5 FR-15.

3. **Herleidbaarheid naar GTINs.**
   **Given** een werkvoorraad-item
   **When** de datamanager doorklikt
   **Then** zijn de onderliggende GTINs en verwerkingen opvraagbaar (herleidbaarheid, FR-15, NFR-1) — via de `mismatch_events`-rijen (runId/herkomst) die het item deden ontstaan.

4. **Tests.**
   - Unit (vitest, apps/api): drempellogica-randgevallen (9 events/5 GTINs → niets; 10/4 → niets; 10/5 → item; events van meerdere codes vermengd), routering lege-klasse→wachtrij vs. zwakke-klasse→aanvul-signaal, idempotentie (tweede aggregatie-run maakt geen duplicaat — `t3777Code` uniek, status-update i.p.v. insert).
   - Integratie: geseede `mismatch_events` → verwachte `bootstrap_queue`-rijen + signaaldata; doorklik-endpoint levert de onderliggende GTINs.
   - E2E: NIET aan de stable-subset-gate toevoegen.

## Tasks / Subtasks

- [ ] 1. Prisma-migratie `bootstrap_queue` voorbereiden + down-script documenteren; **expliciete goedkeuring aan Friso vragen vóór `prisma migrate deploy`** (AC: 1)
- [ ] 2. Aggregatie-service `apps/api/src/services/flywheel/mismatch-workload.ts` (AC: 2)
  - [ ] 2.1 Query: declared-not-found-events per code, `COUNT(*)` + `COUNT(DISTINCT gtin)` tegen `FLYWHEEL_STRUCTURAL_N`/`_M`. Filter op reguliere herkomst; cohort-herkomst (`cohort-*`, Story 16.4) uitsluiten uit deze aggregatie.
  - [ ] 2.2 Routering: code zonder actieve referenties (`reference_logos WHERE active=true`) → upsert `bootstrap_queue` (status `wachtend`, `excluded=false`); code mét actieve referenties → aanvul-signaal (onderdeel van de overview-payload, geen aparte tabel)
  - [ ] 2.3 Uitvoeringsmoment: on-read bij de overview-aanroep óf als stap in een bestaande flywheel-job — keuze documenteren in Dev Agent Record; GEEN nieuwe scheduler/queue introduceren (AD-6: wie de state bezit, bezit de orkestratie; 14.2-precedent voor on-read is toegestaan)
- [ ] 3. Doorklik-/herleidbaarheids-endpoint: onderliggende GTINs + verwerkingen per werkvoorraad-item (sectie op `/api/v1/flywheel/*`, leesroute) (AC: 3)
- [ ] 4. Dashboard-paneel-data via overview-sub-service `apps/api/src/services/flywheel/overview-bootstrap-queue.ts` (paneel-UI zelf komt uit 15.2/17.2; lege staat is geldig) (AC: 2)
- [ ] 5. Unit-/integratietests (AC: 4)
- [ ] 6. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy

## Dev Notes — Developer Context

### Wat er AL bestaat (geverifieerd 2026-07-02, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Eventbron | `mismatch_events` (Story 16.1) — type `declared-not-found`, met gtin/gln/code/runId | De enige input van de aggregatie. Geen tweede registratie bouwen. |
| Actieve-klassen-bepaling | `reference_logos WHERE active=true` — Prisma-model `ReferenceLogo` (`apps/api/prisma/schema.prisma` :243–267, `active` :256) | Splitst lege klasse (→ wachtrij) van zwakke klasse (→ aanvul-signaal). |
| Frequentie-context | `tests/validation/keurmerk-declaratie-frequentie.md` (76 regels, top-30 + universum) | Achtergrond voor `declarationFrequency`-kolom; de initiële universum-vulling is Story 17.2 — deze story vult alléén vanuit FR-15-events (frequentie mag hier 0/null-equivalent starten, 17.2 verrijkt). |
| Overview-conventie | Modulaire sub-services per paneel (coördinatie-noot epics); routebestand `apps/api/src/api/v1/flywheel.ts` (spine) | Aanvul-signaal + wachtrij-paneel-data als eigen sub-service naast `overview-mismatch.ts` (16.1). |
| v1-routepatroon | `apps/api/src/api/v1/` (12 bestaande routebestanden) | Leesroutes volgen het bestaande registratiepatroon in de server-bootstrap. |
| Endpoint-eigenaar wachtrij-mutaties | Spine: `bootstrap-queue` (GET + mutaties) onder `/api/v1/flywheel/` | Mutaties (override/uitsluiten/toevoegen) zijn Story 17.2 — hier alléén de leeskant. |

### Wat er NIEUW is

1. Prisma-model `BootstrapQueue` → `@@map("bootstrap_queue")` + migratie + down-script (AC1).
2. `apps/api/src/services/flywheel/mismatch-workload.ts` — drempel-aggregatie + routering (pure drempellogica apart en unit-testbaar).
3. Herleidbaarheids-leesroute (werkvoorraad-item → GTINs/verwerkingen).
4. Overview-sub-service voor het wachtrij-/signaal-paneel.

### Bindende AD's

- **AD-2** — `bootstrap_queue` is API-eigendom; ml-service leest/schrijft hem nooit.
- **AD-6** — geen nieuwe scheduler; aggregatie on-read of meeliftend op een bestaande flywheel-job (queue `flywheel`, concurrency 1) zodra die er is.
- **AD-13 / NFR-1** — herleidbaarheid: van werkvoorraad-item terug naar de events (GTINs, runId's) zonder tussenstappen te verzinnen.
- **AD-16-analogie** — statusveld `bootstrap_queue.status` heeft een vaste waardenset (wachtend/gedraaid/gevuld/leeg/uitgesloten); overgangen `gedraaid`/`gevuld`/`leeg` zet Story 17.1, `uitgesloten` zet 17.2 — deze story zet alleen `wachtend`.

### Guardrails (voorkom bekende fouten)

- **Migratie-toestemming (ARCH-2/teamregel):** alléén na expliciete toestemming per geval; handmatig `prisma migrate deploy`; down-script verplicht; nooit auto-migrate.
- **`t3777Code` uniek:** aggregatie upsert, nooit dubbele wachtrij-rijen bij herhaalde runs (NFR-4-idempotentie).
- **Uitgesloten blijft uitgesloten:** een klasse met `excluded=true` (17.2) mag door de aggregatie nooit terug op `wachtend` gezet worden — check in de upsert.
- **Geen verwerking starten:** deze story triggert geen bootstrap-runs; agenderen ≠ uitvoeren (Epic 17).
- Deploy-volgorde ml → api → web (hier alleen api); ghcr-workflow laten slagen vóór Coolify-deploy.
- Commits/PRs Engels; `versions.md` (NL) in DEZELFDE commit.
- E2E buiten de stable-subset-gate.

### Testrichtlijnen

- Drempel-randgevallen als tabel-test (N×M-matrix rond de defaults, env-overrides).
- Idempotentie: tweemaal aggregeren over dezelfde events ⇒ identieke tabel-inhoud.
- Excluded-guard: rij met `excluded=true` blijft onaangeroerd.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 16.2 (AC-bron) + Epic 17-afbakening.
- `ARCHITECTURE-SPINE.md` — AD-2, AD-6, AD-13, Structural Seed `bootstrap_queue`.
- PRD §4.5 FR-15 (structureel-drempel N=10/M=5 assumptie) + §9 (assumption-register).
- `_bmad-output/implementation-artifacts/16-1-mismatch-registratie-en-aggregatie.md` — eventcontract.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic/vliegwiel-16 worktree).

### Debug Log References

- Live-DB-integratiecheck van de HAVING-aggregatiequery (12 declared-not-found-
  events over 6 GTINs + 1 cohort-event) → 12 events/6 GTINs geteld, cohort-event
  correct uitgesloten. Migratie 0019 lokaal toegepast op localhost:5432; kolommen +
  indexen geverifieerd tegen information_schema.

### Completion Notes

- **Uitvoeringsmoment (taak 2.3):** ON-READ bij de overview-aanroep gekozen
  (AD-6: geen nieuwe scheduler/queue; 14.2-precedent). `runMismatchWorkloadAggregation()`
  is de ene ingang; de overview-sub-service roept hem aan en upsert de wachtrij
  idempotent. Later kan Epic 17 dezelfde functie op een bestaande flywheel-job laten
  meeliften zonder API-wijziging.
- **Diff-drift bij de migratie:** `prisma migrate diff` produceerde naast de nieuwe
  tabel een ongerelateerde `retraining_notifications ALTER … DROP DEFAULT` (pre-
  bestaande schema/DB-mismatch). Die is handmatig weggelaten zodat 0019 additief en
  16.2-only is.
- **Routering-afweging:** de DB doet COUNT(*)+COUNT(DISTINCT) met HAVING (geen volle
  event-tabel in het geheugen); de pure `aggregateDeclaredNotFound()` blijft de
  canonieke, los geteste drempel-/routeringslogica.
- **Excluded-guard:** een klasse met `excluded=true` (17.2) wordt nooit opnieuw
  geupsert of terug op `wachtend` gezet.
- AC4 (afstemming) n.v.t. voor 16.2; de wachtrij-mutaties (17.2) zijn bewust NIET
  gebouwd — hier alleen de leeskant + de tabel.

### File List

Nieuw:
- `apps/api/prisma/migrations/0019_add_bootstrap_queue/migration.sql`
- `apps/api/prisma/migrations/0019_add_bootstrap_queue/down.sql`
- `apps/api/src/services/flywheel/mismatch-workload.ts`
- `apps/api/src/services/flywheel/overview/overview-bootstrap-queue.ts`
- `apps/api/src/__tests__/services/flywheel-workload.test.ts`
- `apps/api/src/__tests__/api/flywheel-workload-traceability.routes.test.ts`
- `_bmad-output/implementation-artifacts/review-16-2.md`
- `_bmad-output/implementation-artifacts/ac-trace-16-2.md`

Gewijzigd:
- `apps/api/prisma/schema.prisma` (model `BootstrapQueue`)
- `apps/api/src/services/flywheel/config.ts` (`getStructuralN`/`getStructuralM`)
- `apps/api/src/services/flywheel/overview/index.ts` (bootstrapQueue via echte sub-service)
- `apps/api/src/services/flywheel/overview/empty-panels.ts` (stub verwijderd)
- `apps/api/src/api/v1/flywheel.ts` (herleidbaarheids-endpoint)
- `apps/api/src/__tests__/setup.ts` (bootstrapQueue-mock)
- `apps/api/src/__tests__/services/flywheel-overview-compose.test.ts` + `flywheel-overview-panels.test.ts` (stub-asserts bijgewerkt)

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Story 16.2, ARCHITECTURE-SPINE (bootstrap_queue-seed) en PRD FR-15.
