# Story 14.2: Gold-set-samenstellingsbewaking

Status: done

<!-- Aangemaakt door create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 14 / Story 14.2. -->

## Story

Als **datamanager**
wil ik **zicht op de omvang en scheefgroei van de goudstandaard**
zodat **ik weet of de regressietest nog op een gezond meetinstrument draait** (FR-11).

### Afbakening (kritiek)

- **On-read, geen job.** De samenstellingsbewaking wordt berekend bij de overview-aanroep — er is géén aparte BullMQ-job of scheduler (raakt AD-6 dus niet). Geen caching-laag bouwen tenzij de query aantoonbaar te traag is (meet eerst; de set is ~100–300 records).
- **Signaleren, nooit blokkeren.** Klasse-zonder-gold-set-dekking wordt bij promotie gemarkeerd in de batch-poort-uitkomsten, niet geblokkeerd (blokkeren zou de bootstrap van nieuwe klassen onmogelijk maken — PRD §4.3-assumptie).
- Géén migratie in deze story: alles wordt gelezen uit `gold_set_records` (Story 13.3) en `promotion_batches.gateResults` (Story 13.4).

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 14.2)*

1. **Given** de actuele gold-set
   **When** de samenstellingsdata wordt opgevraagd (API voor het dashboard)
   **Then** zijn omvang, ECHT/VALS-verdeling en de top-5 meest/minst vertegenwoordigde klassen beschikbaar (FR-11).

2. **Given** een klasse die >20% van de set uitmaakt of een ECHT-aandeel buiten 60–90%
   **When** de bewaking draait
   **Then** wordt het scheefgroei-signaal geregistreerd en via de overview-API ontsloten (FR-11).

3. **Given** promotie van een klasse zonder enige gold-set-dekking
   **When** de poort die batch verwerkt
   **Then** wordt dit gemarkeerd (niet geblokkeerd) in de batch-poort-uitkomsten (FR-11).

4. **Given** het bewakingsmechanisme
   **When** de overview-aanroep binnenkomt
   **Then** wordt de samenstellingsbewaking on-read berekend bij die aanroep — er is geen aparte job (raakt AD-6 dus niet) (FR-11).

## Tasks / Subtasks

- [ ] 1. Sub-service `apps/api/src/services/flywheel/gold-set-composition.ts` (AC: 1, 2, 4)
  - [ ] Pure, testbare functie over de **actieve** gold-set (`replacedById IS NULL`, resolver uit 13.3 `services/flywheel/gold-set.ts` hergebruiken — niet herimplementeren): omvang, ECHT/VALS-verdeling (aantallen + ratio), klasse-verdeling, top-5 meest/minst vertegenwoordigde klassen.
  - [ ] Scheefgroei-signalen: klasse >20% van de set; ECHT-aandeel buiten 60–90%. Drempels als env-config met deze defaults (`FLYWHEEL_GOLDSET_CLASS_SHARE_MAX` = 0.20, `FLYWHEEL_GOLDSET_ECHT_MIN`/`_MAX` = 0.60/0.90) — startwaarden uit de PRD-assumptie, geen hardcode.
  - [ ] Signalen als gestructureerde lijst (`{ type, klasse?, waarde, drempel }`) zodat het 15.2-paneel ze 1-op-1 kan tonen.
- [ ] 2. Ontsluiting via de overview-API (AC: 1, 2, 4) — paneel-sleutel `goldSetComposition` in `/api/v1/flywheel/overview`. Conform de coördinatie-noot in epics-vliegwiel.md is de overview modulair (één sub-service per paneel): bestaat `apps/api/src/api/v1/flywheel.ts` nog niet (Epic 13/15 nog niet geland), maak dan het minimale routebestand aan conform spine-conventie en registreer alleen dit paneel — geen monoliet-handler.
- [ ] 3. Dekkings-markering in de poort (AC: 3) — kleine, geïsoleerde check-functie `hasGoldSetCoverage(t3777Code)` in de sub-service; aanroep in de 13.4/13.5-poortfase die `gateResults` schrijft: per batch-klasse zonder dekking een niet-blokkerend `gold-set-dekking-ontbreekt`-item in `gateResults`. Coördineer met de 13.4/13.5-implementatie (zie Afhankelijkheden).
- [ ] 4. Tests (vitest, apps/api): compositie-berekening op fixtures (verdeling, top-5, randgevallen: lege set, één klasse, precies-op-drempel), signaal-drempels uit env, actieve-set-resolutie (vervangen records tellen niet mee), poort-markering niet-blokkerend, overview-integratie.
- [ ] 5. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy (alleen api geraakt; dashboard-weergave is Story 15.2).

## Dev Notes — Developer Context

### Bindende architectuurbeslissingen

- **AD-4** — actieve gold-set = records met `replacedById IS NULL`; resolutie uitsluitend in `apps/api` (`services/flywheel/gold-set.ts`). Deze story leest via die ene resolver.
- **AD-6** — orkestratie via BullMQ; deze story voegt bewust GÉÉN job toe (on-read, AC4).
- **AD-13** — batch-poort-uitkomsten in `promotion_batches.gateResults` (JSONB); de dekkings-markering is daar een extra, niet-blokkerend item.
- **AD-2** — API bezit de state; geen ml-service-werk in deze story.

### Wat er AL bestaat (geverifieerd, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Gold-set-bronbestanden (referentie voor fixtures) | `tests/validation/gold-set-oogstrun.json` (91 records; meta 75 ECHT / 16 VALS; velden label, t3777Code, cropPath, …) | Realistische verdelings-fixture voor tests; de tabel zelf komt uit 13.3. |
| v1-route-patroon | `apps/api/src/api/v1/` (13 routebestanden, bv. `artwork-pipeline.ts`, `stats.ts`) | Registratiewijze en auth-preHandlers overnemen voor `flywheel.ts` (read-endpoint: `authMiddleware`, geen ADMIN nodig voor lezen — volg het GET-patroon van `GET /artwork-import/runs/:runId`, artwork-pipeline.ts:554). |
| Logger-patroon | `createLogger('<module>')` in `apps/api/src/core/logger` (patroon in t3777-declarations.ts:41) | Gebruiken voor de sub-service. |
| Env-conventie | Spine Consistency Conventions: `FLYWHEEL_`-prefix | Signaal-drempels. |

### Wat er NIEUW is (de eigenlijke story)

1. `apps/api/src/services/flywheel/gold-set-composition.ts` — compositie + signalen + `hasGoldSetCoverage`.
2. Paneel `goldSetComposition` in `/api/v1/flywheel/overview` (routebestand `apps/api/src/api/v1/flywheel.ts` aanmaken als het nog niet bestaat; anders paneel toevoegen).
3. Niet-blokkerende dekkings-markering in de poortfase (raakt 13.4/13.5-code minimaal — alleen een extra `gateResults`-item).

### Afhankelijkheden

- **Story 13.3** (blokkerend): `gold_set_records`-tabel + actieve-set-resolver.
- **Story 13.4/13.5** (alleen voor AC3): de poort die `gateResults` schrijft. Als 14.2 eerder landt dan 13.4/13.5: lever `hasGoldSetCoverage` als exporteerbare functie mét test, en documenteer in het Dev Agent Record dat de poort-aanroep (AC3) bij 13.4/13.5-integratie wordt aangesloten — AC3 is dan pas op ACC aantoonbaar zodra de poort bestaat.
- **Story 15.2** (afnemer, niet blokkerend): het gold-set-samenstellingspaneel in de UI leest dit paneel; de payload-structuur hier bepaalt dat contract — houd sleutels stabiel en documenteer ze in de route-docblock.

### Guardrails (voorkom bekende fouten)

- **Geen job, geen scheduler, geen migratie.** AC4 is expliciet; elke `upsertJobScheduler`/cron voor dit werk is een review-finding. Ook geen nieuwe tabellen/kolommen (migratie-toestemming per geval, teamregel).
- **Eén resolutie van "actief".** Nooit een eigen `replacedById`-query naast de 13.3-resolver (adversarial-les AD-4: twee resoluties maken de meting niet-reproduceerbaar).
- **Markeren ≠ blokkeren** (AC3): de poortcheck mag de batch-uitkomst nooit beïnvloeden — alleen een informatief `gateResults`-item.
- Overview modulair houden (coördinatie-noot): vijf epics leveren panelen; geen gedeelde monoliet-handler aanraken.
- E2E buiten de stable-subset-gate; commits Engels + `versions.md` (NL) in DEZELFDE commit; ghcr-workflow vóór Coolify-deploy.

### Testrichtlijnen

- Vitest (apps/api), unit: compositieberekening deterministisch op in-memory fixtures (o.a. drempel-randgevallen: klasse op exact 20%, ECHT op exact 60%/90% — leg vast of de grens inclusief is en test dat), lege gold-set (geen deling door nul, signaal "set leeg" i.p.v. crash).
- Integratie: overview-route retourneert het paneel; vervangen records (replacedById gezet, incl. self-tombstone uit 14.1) tellen niet mee.
- Geen pytest, geen e2e-gate-wijziging.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 14.2 (AC-bron) + coördinatie-noot overview-endpoint.
- `_bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md` — AD-4, AD-6, AD-13; Consistency Conventions (routebestand, env-prefix).
- `_bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md` — §4.3 FR-11 + assumptie-index (§9: >20%-klasse, ECHT 60–90%, markeren-niet-blokkeren).
- `_bmad-output/implementation-artifacts/14-1-gold-set-aanwas-uit-reviewbeslissingen.md` — aanwas-route + self-tombstone-semantiek (bepaalt wat "actief" is).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, epic/vliegwiel-14 worktree).

### Debug Log References

- Volledige apps/api vitest-suite groen tegen lokale DATABASE_URL (localhost:5432): 492 passed / 2 skipped / 16 todo.
- Migratie-vrij: `GoldSetCoverageMarking` leeft in de bestaande `promotion_batches.gateResults` (JSONB, AD-13); geen schema-/migratie-wijziging.

### Completion Notes

- Sub-service `gold-set-composition.ts`: pure `computeGoldSetComposition` (omvang, ECHT/VALS + ratio, klasse-verdeling, top-5 meest/minst, scheefgroei-signalen) + on-read `getGoldSetComposition` (via de ENE 13.3-resolver `getActiveGoldSet`, AD-4) + `findClassesWithoutGoldSetCoverage` (AC3-dekkings-check).
- Drempels als env-config (`FLYWHEEL_GOLDSET_CLASS_SHARE_MAX`=0.20, `FLYWHEEL_GOLDSET_ECHT_MIN`/`_MAX`=0.60/0.90) in `config.ts` — geen hardcode. Grenzen INCLUSIEF (exact op de drempel = nog gezond).
- Paneel `goldSetComposition` toegevoegd aan `GET /api/v1/flywheel/overview` — één modulaire sub-service-aanroep, geen monoliet-handler (coördinatie-noot).
- AC3: niet-blokkerende dekkings-markering in `processBatch` (promotion-batch.ts) → `gateResults.goldSetCoverage`. Draait vóór de guardrails, best-effort (try/catch), idempotent (alleen als het item nog ontbreekt), muteert nooit de batch-status. De poort/13.4/13.5 bestond al, dus AC3 is volledig ingehaakt (geen uitgestelde koppeling nodig).
- AC4: geen job/scheduler/cron — on-read bij de overview-aanroep (AD-6 ongeraakt).
- Randgevallen getest: lege set (geen deling door nul, expliciet `set-leeg`-signaal), één klasse, grens-inclusiviteit (klasse exact 20%, ECHT exact 60%/90%).

### File List

- NEW: `apps/api/src/services/flywheel/gold-set-composition.ts`
- EDIT: `apps/api/src/services/flywheel/config.ts`
- EDIT: `apps/api/src/services/flywheel/types.ts`
- EDIT: `apps/api/src/api/v1/flywheel.ts`
- EDIT: `apps/api/src/services/flywheel/promotion-batch.ts`
- NEW: `apps/api/src/__tests__/services/flywheel-gold-set-composition.test.ts`
- EDIT: `apps/api/src/__tests__/services/flywheel-promotion-batch.test.ts`
- EDIT: `apps/api/src/__tests__/api/flywheel.routes.test.ts`
- DOCS: `_bmad-output/implementation-artifacts/review-14-2.md`, `ac-trace-14-2.md`

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Epic 14, spine-AD's en PRD FR-11.
- 2026-07-03: Geïmplementeerd (implement-sprint). On-read samenstellingsbewaking + niet-blokkerende dekkings-markering; migratie-vrij; 4/4 AC's gedekt; volledige apps/api-suite groen (492).
