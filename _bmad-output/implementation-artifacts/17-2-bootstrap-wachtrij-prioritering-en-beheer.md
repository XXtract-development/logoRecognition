# Story 17.2: Bootstrap-wachtrij — prioritering en beheer

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Epic 17 — Seed-bootstrap voor lege klassen. -->

## Story

As a **datamanager**,
I want **de bootstrap-wachtrij op declaratiefrequentie geprioriteerd zien en kunnen bijsturen**,
So that **de meest voorkomende ongedekte keurmerken het eerst gevuld worden**.

### Afbakening

- De tabel `bootstrap_queue` is gemigreerd in Story 16.2; deze story migreert **niets** (mocht een kolom ontbreken → stoppen, ARCH-2-toestemming + down-script, niet omheen werken).
- Story 17.1 verwerkt de wachtrij; deze story levert **initiële vulling, prioritering, beheer (override/uitsluiten/toevoegen) en de zichtbaarheid** (paneel + "nieuw geactiveerde klasse").
- **Afhankelijkheden:** Story 16.2 (tabel + FR-15-vulling), Story 17.1 (run-statussen), Epic 15 (dashboard-fundament: route /flywheel, theming, overview; batch-detail 15.3 voor de doorklik).

## Acceptatiecriteria

1. **Initiële vulling op declaratiefrequentie.**
   **Given** de tabel `bootstrap_queue` (migratie belegd in Story 16.2)
   **When** de wachtrij initieel gevuld wordt
   **Then** bevat hij **álle klassen zonder actieve referenties**, gerangschikt op declaratiefrequentie over het GTIN-universum; FR-15-events zijn een aanvullende bron (FR-13).
   Concreet: eenmalig idempotent seed-script met `--dry-run` (ARCH-4-patroon) dat per T3777-code zonder actieve `reference_logos`-rij een `bootstrap_queue`-rij upsert met `declarationFrequency` uit de universum-telling (prod tradeItems-meting; snapshot `tests/validation/keurmerk-declaratie-frequentie.md` §3 als startbron — 894-code-universe, top-30 geteld, staart aanvullen vanuit dezelfde meting of 0). Bestaande FR-15-rijen (16.2) worden verrijkt met frequentie, nooit overschreven qua status; niet-visuele codes (PREGNANCY_WARNING, NIX18, GHS-signaalwoorden — frequentiedoc §5.4) mogen bij de seed direct `uitgesloten` krijgen, gedocumenteerd.

2. **Paneel + beheer via endpoint.**
   **Given** de wachtrij (gevoed door de initiële vulling, FR-15-werkvoorraad en handmatige toevoeging)
   **When** het dashboard-paneel laadt
   **Then** toont het per klasse: declaratiefrequentie, status (wachtend/gedraaid/gevuld/leeg/uitgesloten), gesorteerd op frequentie (FR-13)
   **And** kan de datamanager via endpoint `bootstrap-queue` de volgorde overrulen, klassen uitsluiten en klassen toevoegen (FR-13).
   Concreet: `GET/POST/PATCH /api/v1/flywheel/bootstrap-queue` (spine-endpointset): GET = gesorteerde lijst (effectieve volgorde = `priorityOverride` eerst, dan frequentie aflopend); mutaties: override zetten/wissen, `excluded` togglen (status `uitgesloten`), klasse toevoegen. Elke mutatie gelogd met gebruiker + tijdstempel (NFR-5/AD-13). Uitgesloten klassen worden door 17.1 nooit verwerkt.

3. **Nieuw geactiveerde klasse.**
   **Given** een geslaagde bootstrap (klasse van 0 naar ≥1 actieve referentie na poort-passage)
   **When** het overzicht ververst
   **Then** verschijnt de klasse als "nieuw geactiveerde klasse" (FR-13, UX-DR8).
   Bepaling read-side: klasse met wachtrij-status `gevuld` én ≥1 actieve `ReferenceLogo` met `source='flywheel-promotion'` en kandidaat-herkomst `bootstrap` — geen aparte notificatie-tabel; melding conform UX-DR8-statepattern, verversing via refresh-on-load/verversknop (geen polling).

4. **Doorklik naar bewijs.**
   **Given** een "nieuw geactiveerde klasse"-melding
   **When** de datamanager doorklikt
   **Then** toont de batch-detail-weergave (Story 15.3) de gepromoveerde referenties met hun evidence-contract (herkomst `bootstrap`) (FR-13, NFR-1).

5. **Tests.**
   - Unit (vitest, apps/api): sorteerlogica (override > frequentie; gelijke frequentie deterministisch), seed-idempotentie (tweede run wijzigt niets), status-guard (seed/aggregatie zet `uitgesloten` nooit terug), "nieuw geactiveerde klasse"-bepaling (wel/niet actieve promotie-referentie met bootstrap-herkomst).
   - Integratie: endpoint-CRUD met auth; mutatie-logging aantoonbaar; GET-sortering.
   - Web (bestaand test-patroon `apps/web/src/pages/*.test.tsx`): paneel rendert statussen + sortering; doorklik-navigatie naar `/flywheel/batches/:id`; lege staat (UX-DR8); NL-teksten via i18next-keys (UX-DR10).
   - E2E: NIET aan de stable-subset-gate toevoegen.

## Tasks / Subtasks

- [ ] 1. Seed-script initiële vulling (idempotent, `--dry-run`): alle klassen zonder actieve referenties × declaratiefrequentie; uitsluitlijst niet-visuele codes gedocumenteerd (AC: 1)
  - [ ] 1.1 Frequentiebron vastleggen in het script (herkomst + meetdatum in een kolomwaarde/evidence-notitie), zodat een latere hermeting herleidbaar vervangt
- [ ] 2. Wachtrij-service `apps/api/src/services/flywheel/bootstrap-queue.ts`: effectieve-volgorde-berekening + mutaties (override/uitsluiten/toevoegen) met logging (AC: 2)
- [ ] 3. Endpoint `bootstrap-queue` (GET + mutaties) in `apps/api/src/api/v1/flywheel.ts` (AC: 2)
- [ ] 4. Overview-koppeling: paneel-data (reeds gestart in 16.2-sub-service) uitbreiden met effectieve volgorde + "nieuw geactiveerde klasse"-bepaling (AC: 2, 3)
- [ ] 5. Web: wachtrij-paneel op FlywheelPage (statusbadges conform UX-DR5-semantiek: amber=wachtend, groen=gevuld; `uitgesloten`/`leeg` neutraal) + "nieuw geactiveerde klasse"-melding + doorklik naar FlywheelBatchDetailPage (AC: 2, 3, 4)
- [ ] 6. 17.1-koppelvlak verifiëren: job slaat `uitgesloten` over en respecteert de effectieve volgorde (regressietest op het gedeelde contract) (AC: 2)
- [ ] 7. Unit-/integratie-/webtests (AC: 5)
- [ ] 8. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy; volgorde api → web

## Dev Notes — Developer Context

### Wat er AL bestaat (geverifieerd 2026-07-02, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Wachtrij-tabel + FR-15-vulling | `bootstrap_queue` (Story 16.2-migratie) — kolommen conform Structural Seed: `t3777Code` uniek, `declarationFrequency`, status, `priorityOverride?`, `excluded`, `lastRunAt?` | Alles wat deze story beheert bestaat al als schema; alleen data + gedrag toevoegen. |
| Frequentiedata | `tests/validation/keurmerk-declaratie-frequentie.md` (76 regels): §3 top-30 met aantallen (GREEN_DOT 11169 … BETER_LEVEN_2_STER 184 + staart), §5.4 niet-visuele codes, meting 2026-06-09 prod tradeItems (143.962 items, 26.247 declarerend) | De rangschikkingsbron. Voor de staart voorbij top-30: zelfde meting herhalen (prod MongoDB read-only) óf 0 als startwaarde — keuze documenteren; een verse universum-telling vergt géén nieuw governance-akkoord als hij read-only en off-peak is, maar meld het vooraf (patroon ARCH-8-voorzichtigheid). |
| Actieve-klassen-bepaling | `ReferenceLogo` (`apps/api/prisma/schema.prisma` :243–267, `active` :256, `source` :247) | "Zonder actieve referenties" (seed-filter) én "nieuw geactiveerde klasse" (AC3: `source='flywheel-promotion'`). |
| Run-statussen | Story 17.1 zet `gedraaid`/`gevuld`/`leeg` + `lastRunAt` | Deze story toont ze en beheert `wachtend`/`uitgesloten` + volgorde. |
| Evidence/herkomst voor de doorklik | `reference_candidates.origin='bootstrap'` + evidence JSONB (13.2/AD-13); batch-detail = Story 15.3 (`/flywheel/batches/:id`) | AC4 is een navigatie + bestaand scherm; geen nieuwe bewijsweergave bouwen. |
| Dashboard-fundament | Epic 15: route `/flywheel`, `FlywheelPage.tsx` (flat-page-conventie, vgl. bestaande `apps/web/src/pages/*.tsx`), antd 5 ConfigProvider-scoped theming, i18next NL-keys | Paneel volgt UX-DR3/UX-DR5/UX-DR8/UX-DR10; geen polling. |
| Seed-scriptpatroon | ARCH-4/operationele envelope: idempotent, handmatig gestart, `--dry-run`; voorbeeld gold-set-import (13.3) en `apps/api/scripts/seed-reference-logos.ts` (7.3) | Zelfde discipline voor de wachtrij-seed. |
| Mutatie-logging-patroon | `threshold_changes` / `model_activation_logs`-patroon (AD-13) | Override/uitsluit-mutaties loggen met gebruiker + tijdstempel; hergebruik het bestaande flat-audit-patroon, geen generiek mechanisme verzinnen. |

### Wat er NIEUW is

1. Seed-script initiële vulling (universum-frequenties, uitsluitlijst niet-visuele codes).
2. `apps/api/src/services/flywheel/bootstrap-queue.ts` (volgorde + mutaties + logging).
3. Endpoint-sectie `bootstrap-queue` (GET + mutaties) op `/api/v1/flywheel/`.
4. Web: wachtrij-paneel + "nieuw geactiveerde klasse"-melding + doorklik (FlywheelPage; detail is 15.3).
5. Geen migratie, geen nieuwe env-vars (sortering is datalogica, geen drempel).

### Bindende AD's

- **AD-2** — wachtrij-state uitsluitend in `apps/api`; web muteert alleen via het endpoint, ml-service raakt de tabel nooit.
- **AD-15-analogie** — het endpoint muteert alleen wachtrij-rijen en enqueue-t hoogstens werk (een override kan een 17.1-run agenderen); het draait nooit zelf bootstrap- of poortlogica in het request-pad.
- **AD-13 / NFR-5** — elke handmatige bijsturing (override, uitsluiten, toevoegen) gelogd en opvraagbaar.
- **AD-10 / UX-DR3, UX-DR5, UX-DR8, UX-DR10** — paneel binnen de bestaande SPA, statuskleuren-semantiek (géén fout-rood voor `leeg`), lege staat, NL-only i18next, refresh-on-load zonder polling.
- **NFR-1** — doorklik toont het volledige evidence-contract (herkomst `bootstrap`), via 15.3.

### Guardrails (voorkom bekende fouten)

- **Geen schemawijziging** — tabel is 16.2-eigendom; ontbreekt iets: ARCH-2-route (toestemming + down-script), nooit een work-around-kolom elders.
- **Status-eigendom respecteren:** seed en beheer zetten nooit run-statussen (`gedraaid`/`gevuld`/`leeg` zijn van 17.1); `uitgesloten` wint altijd van automatische vulling (16.2-guard geldt ook hier).
- **Seed idempotent en niet-destructief:** bestaande statussen en overrides blijven staan bij herhaalde runs; alleen frequentie mag verversen (herleidbaar).
- **Gidsbeelden niet in het paneel:** de wachtrij toont codes en frequenties — geen GS1-gidslogo-thumbnails in API-responses of UI (NFR-6; het zaad blijft in het 17.1-zoekpad).
- **Geen eigen notificatie-infra voor AC3:** read-side bepaling + UX-DR8-melding; het RetrainingNotification-patroon is voor stilstand/watchdog, niet hiervoor.
- Deploy-volgorde api → web (endpoint vóór paneel); ghcr-workflow laten slagen vóór Coolify-deploy.
- Commits/PRs Engels; `versions.md` (NL) in DEZELFDE commit.
- E2E buiten de stable-subset-gate.

### Testrichtlijnen

- Sorteer- en bepaal-functies puur testen (tabel-tests: override/frequentie/status-combinaties).
- Endpoint-integratie met auth + logging-asserts.
- Webtests conform bestaand patroon (`ArtworkReviewPage.test.tsx` e.d.): render, sortering, statusbadges, doorklik, lege staat.
- Contract-regressietest 17.1×17.2: uitgesloten klasse komt nooit in een run-selectie.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 17.2 (AC-bron), UX-DR3/5/8/10, coördinatie-noot overview.
- `ARCHITECTURE-SPINE.md` — Structural Seed `bootstrap_queue`, endpointset (`bootstrap-queue`), AD-2, AD-13, AD-15, operationele envelope (seeds).
- PRD §4.4 FR-13 (+ consequences: statusset, "nieuw geactiveerde klasse").
- `tests/validation/keurmerk-declaratie-frequentie.md` — frequentiebron + niet-visuele-codes-kanttekening.
- `_bmad-output/implementation-artifacts/16-2-gedeclareerd-niet-gevonden-wordt-werkvoorraad.md` en `17-1-bootstrap-run-per-lege-klasse.md` — gedeelde tabel- en statuscontracten.

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Story 17.2, PRD FR-13 en de frequentiemeting van 2026-06-09 als rangschikkingsbron.
