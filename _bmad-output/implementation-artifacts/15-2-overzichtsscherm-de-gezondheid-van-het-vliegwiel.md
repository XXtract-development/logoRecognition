# Story 15.2: Overzichtsscherm — de gezondheid van het vliegwiel in één oogopslag

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 15. -->

## Story

As a **datamanager**,
I want **één overzicht van precisietrend, promoties, quarantaines, caps, outliers, wachtrijen en dekkingsgraad**,
so that **ik maandagochtend in tien minuten weet of het vliegwiel gezond draait (UJ-1)**.

### Afbakening (kritiek)

- **Coördinatie-noot (bindend, epics §Epic List):** het endpoint `/api/v1/flywheel/overview` wordt **modulair per dashboard-paneel** opgebouwd — per paneel een eigen sub-service — omdat **vijf epics (13 t/m 17)** er panelen aan leveren. Zo blijft elke epic zelfstandig integreerbaar zonder merge-conflicten op één monoliet-handler. Deze story legt die modulaire structuur vast; latere epics haken hun sub-service in.
- Panelen waarvan de bron-epic nog niet gebouwd is (bootstrap-wachtrij → Epic 17, mismatch-trends → Epic 16, GLN-dekking → Epic 18) tonen hun **lege staat** — geen kale vlakken, geen fouten.
- De batch-detailpagina zelf is Story 15.3; drempelbeheer en pauze zijn Story 15.4. Het rollback-**endpoint** (`batches/:id/rollback`) bestaat al uit Story 13.6 — deze story levert er de UI voor.

## Acceptatiecriteria

_(1-op-1 uit epics-vliegwiel.md, Story 15.2)_

1. **Given** het endpoint `/api/v1/flywheel/overview`
   **When** FlywheelPage laadt
   **Then** toont het scherm conform mock-overzicht.html: KPI-tegelrij, gold-set-precisietrend met tolerantielijn en één meetpunt per gepasseerde batch (regressies visueel herkenbaar), quarantainetabel met faalreden, en panelen voor klassen-aan-cap, outlier-meldingen, bootstrap-wachtrij, mismatch-trends en GLN-dekkingsgraad (FR-17, UX-DR3) — panelen waarvan de bron-epic nog niet gebouwd is tonen hun lege staat (UX-DR8).

2. **Given** de statussemantiek
   **When** statussen worden getoond
   **Then** is groen=gepasseerd/gepromoveerd, amber=quarantaine/wachtend, rood uitsluitend regressie-alarm en automatische stilstand (UX-DR5).

3. **Given** een batch in de quarantainetabel
   **When** de datamanager erop klikt
   **Then** opent de batch-detailpagina (Story 15.3-route; tot die er is: detail-drawer met poort-uitkomsten uit de overview-data) (FR-17).

4. **Given** de gold-set-samenstellingsdata (Story 14.2)
   **When** het overzicht laadt
   **Then** toont een gold-set-samenstellingspaneel omvang, ECHT/VALS-verdeling, de top-5 meest/minst vertegenwoordigde klassen en scheefgroei-signalen (FR-11, UX-DR3).

5. **Given** de batch-card
   **When** de datamanager de Historie-tab opent
   **Then** ziet hij gepasseerde batches met een rollback-actie achter een bevestigingsmodal met verplicht redenveld (endpoint `batches/:id/rollback`); een teruggedraaide batch krijgt badge `teruggedraaid` en het baseline-herstel is zichtbaar in de precisietrend (FR-4 UI, UX-DR11).

6. **Given** een openstaande outlier-melding in het outlier-paneel
   **When** de datamanager doorklikt
   **Then** opent een vergelijkingsweergave (referentie naast klasse-genoten) met acties Behouden/Deactiveren, waarbij Deactiveren `active=false` zet (soft-delete, gelogd) via endpoint `outliers/:id/decision` (FR-8, UX-DR12).

7. **Given** de KPI-tegelrij
   **When** het overzicht laadt
   **Then** bevat die een element met het aantal openstaande quarantaines en hun ouderdom (SM-5)
   **And** toont het overzicht een teller "gemiste nominaties" mét reden (phash-onbereikbaar / pauze / vlag-uit), gevoed door de 13.2-events, en de "laatste succesvolle run" van de promotielus (NFR-5).

8. **Given** de data-verversing
   **When** de datamanager het scherm gebruikt
   **Then** is er een verversknop en refresh-on-load, géén polling; bij verouderde data verschijnt een "verouderde data"-melding met handmatig vernieuwen (UX-DR8).

## Tasks / Subtasks

- [ ] 1. Overview-endpoint modulair uitbouwen (AC: 1, 4, 7)
  - [ ] 1.1 `apps/api/src/services/flywheel/overview/` met één sub-service-module per paneel: `precision-trend.ts`, `quarantine.ts`, `kpi.ts`, `class-caps.ts`, `outliers.ts`, `gold-set-composition.ts` (delegatie naar Story 14.2-service), `bootstrap-queue.ts` / `mismatch-trends.ts` / `gln-coverage.ts` (stubs die de lege-staat-payload teruggeven tot Epics 17/16/18 landen).
  - [ ] 1.2 `GET /api/v1/flywheel/overview` (bestand `apps/api/src/api/v1/flywheel.ts`, uit 15.1) componeert de sub-services; elk paneel faalt sectie-lokaal (per-paneel `{ error }` in de payload i.p.v. 500 op het geheel — EXPERIENCE.md State Patterns "Fout bij laden").
  - [ ] 1.3 KPI-data: precisie (laatste baseline-meting), nieuwe referenties/promoties, openstaande quarantaines **mét ouderdom** (oudste `quarantined`-batch zonder `closedAt`), klassen aan cap, GLN-dekking (stub). Plus: teller "gemiste nominaties" per reden (13.2-events: `phash-onbereikbaar`/`pauze`/`vlag-uit`) en "laatste succesvolle run" van `flywheel-promotion` (13.4 legt dit tijdstempel vast).
  - [ ] 1.4 Response bevat een server-tijdstempel t.b.v. de "verouderde data"-melding client-side.
- [ ] 2. Overzichtsscherm-layout conform mock-overzicht.html (AC: 1, 2)
  - [ ] 2.1 KPI-tegelrij (5 tegels, antd Card stat-card-patroon, DESIGN.md `{components.kpi-tile}`); **klik op een tegel navigeert/scrolt naar de bijbehorende sectie** (Component Patterns, bindend — quarantaine-tegel → quarantainetabel).
  - [ ] 2.2 Precisietrend: @ant-design/plots `Line`, één meetpunt per gepasseerde batch, tolerantie-ondergrens als gestippelde referentielijn, regressiepunt in rood mét afwijkende marker-vorm én tekstuele annotatie (kleur nooit als enige kanaal); subregel met gold-set-omvang en ECHT/VALS-verdeling; tekstueel alternatief (laatste meting + delta als caption) en data als tabel opvraagbaar (Accessibility Floor).
  - [ ] 2.3 Quarantainetabel (antd Table, `{components.batch-table}`): kolommen batch, datum, kandidaten, faalreden (altijd als tekst, badge is aanvullend), status, actie "Openen"; hele rij klikbaar; sorteren op datum, nieuwste boven; paginering (geen infinite scroll). Positieve empty state (groen icoon): "Alle batches passeerden de kwaliteitspoort."
  - [ ] 2.4 Signaalpanelen rechts: klassen-aan-cap (T3777-codes + amber `cap-bereikt`-badge + aantal geweigerde nominaties), outlier-meldingen, bootstrap-wachtrij (lege staat), mismatch-trends (lege staat), GLN-dekkingsgraad (lege staat). 2/3–1/3 hoofdgrid vanaf 1280px; daaronder stapelen.
- [ ] 3. Batch-klik → detail (AC: 3)
  - [ ] 3.1 Rijklik/"Openen" navigeert naar `/flywheel/batches/:id` (Story 15.3). Zolang 15.3 niet gemerged is: antd Drawer met poort-uitkomsten (`gateResults`) uit de overview-data. Documenteer in het Dev Agent Record welke variant geleverd is.
- [ ] 4. Gold-set-samenstellingspaneel (AC: 4)
  - [ ] 4.1 Paneel met omvang, ECHT/VALS-verdeling, top-5 meest/minst vertegenwoordigde klassen, scheefgroei-signalen (>20%-klasse of ECHT-aandeel buiten 60–90%, uit Story 14.2 on-read-berekening) — signalen amber, informatief geformuleerd.
- [ ] 5. Historie-tab met rollback-UI (AC: 5)
  - [ ] 5.1 Historie-tab in de batch-card (secundaire tab — het enige tab-gebruik op het overzicht, EXPERIENCE.md IA): gepasseerde én teruggedraaide batches.
  - [ ] 5.2 Rollback-actie → bevestigingsmodal met **verplicht redenveld** (opslaan disabled zolang leeg) → `POST /api/v1/flywheel/batches/:id/rollback` (bestaand endpoint uit 13.6; payload: reden + ingelogde gebruiker voor het evidence-contract wie/wanneer/waarom).
  - [ ] 5.3 Na rollback: neutrale badge `teruggedraaid` (géén rood), toast-bevestiging, baseline-herstel zichtbaar in de precisietrend (caption bij het trendpunt; de baseline valt server-side terug op de laatst overgebleven `passed`-batch, AD-5).
- [ ] 6. Outlier-beoordelingsflow (AC: 6)
  - [ ] 6.1 Doorklik op een melding opent de vergelijkingsweergave: de gemarkeerde referentie naast klasse-genoten (vergelijkingsdata uit `outlier_findings`, Story 14.3), `{components.evidence-panel}`-stijl.
  - [ ] 6.2 Nieuw endpoint `POST /api/v1/flywheel/outliers/:id/decision` (`{ decision: 'behouden' | 'deactiveren' }`): `behouden` → `outlier_findings.status='behouden'` + decidedBy/decidedAt; `deactiveren` → `ReferenceLogo.active=false` (soft-delete, schema.prisma:256 — nooit DELETE) + `outlier_findings.status='gedeactiveerd'` + decidedBy/decidedAt, gelogd.
  - [ ] 6.3 **Verplicht bij deactiveren:** de baseline als verouderd markeren (13.6-mechanisme `markBaselineStale` — outlier-deactivatie is een mutatie van de actieve referentieset buiten batch-promotie om, AD-5). Ontbreekt deze aanroep, dan meet de eerstvolgende poortrun tegen een valse baseline.
- [ ] 7. Verversing (AC: 8)
  - [ ] 7.1 Refresh-on-load + handmatige verversknop (TanStack Query refetch); **géén polling, géén auto-reload**.
  - [ ] 7.2 "Verouderde data"-melding (rustig, EXPERIENCE.md State Patterns): verschijnt wanneer de getoonde snapshot ouder is dan een drempel of een refetch wijzigingen vond — met knop "Vernieuwen".
- [ ] 8. Tests (zie Testrichtlijnen)
  - [ ] 8.1 API: sub-service-tests per paneel (gemockte Prisma); overview-compositie met één falend paneel → sectie-lokale fout, rest intact; outlier-decision-endpoint (behouden/deactiveren, soft-delete-assertie, baseline-stale-aanroep).
  - [ ] 8.2 Web: FlywheelPage-test met gemockte overview-payload — alle panelen renderen, lege staten voor 16/17/18-panelen, KPI-klik-navigatie, rollback-modal blokkeert zonder reden, kleursemantiek-asserties (amber quarantainebadge, geen rood buiten regressie/stilstand).
- [ ] 9. versions.md (NL) in DEZELFDE commit; Engelse commitmessage.

## Dev Notes — Developer Context

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Casco: route, theming, nav-badge, minimale overview-read | Story 15.1 (`apps/web/src/pages/FlywheelPage.tsx`, `apps/api/src/api/v1/flywheel.ts`, `services/flywheel/`) | Deze story vult het casco; het overview-endpoint groeit van losse velden (missedNominations, lastSuccessfulPromotionRun, quarantineCount) naar modulaire compositie. |
| Rollback-service + endpoint `batches/:id/rollback` | Story 13.6 (`apps/api/src/services/flywheel/`) | UI-only in deze story: modal + reden + aanroep. Rollback zelf is een toegestane, gelogde statusmutatie (AD-15-verduidelijking) — géén poortlogica herbouwen. |
| Baseline-invalidatie (`markBaselineStale`-mechanisme) | Story 13.6 (AD-5-implementatie) | Verplicht aanroepen bij outlier-deactivatie (taak 6.3). |
| Gold-set-samenstellingsberekening (on-read) | Story 14.2 (API-service) | Sub-service `gold-set-composition.ts` delegeert; niet herberekenen in de route. |
| `outlier_findings` (status open/behouden/gedeactiveerd, decidedBy?, decidedAt?, vergelijkingsdata) | Story 14.3-migratie, conform Structural Seed | Bron voor het outlier-paneel; 14.3 levert expliciet alléén signalering+persistentie — de beslissingsflow (endpoint `outliers/:id/decision`) is déze story. |
| Gemiste-nominaties-events + "laatste succesvolle run" | Story 13.2 (weiger-events mét reden) en 13.4 (run-tijdstempel) | Alleen ontsluiten via de overview-API; registratie bestaat al. |
| `promotion_batches` (`gateResults` Json, `baselineMeasurement` Json, status, `closedAt?`) | Story 13.4/13.5-migraties | Bron voor trend (één punt per `passed`-batch), quarantainetabel en drawer. |
| `ReferenceLogo.active` soft-delete | `apps/api/prisma/schema.prisma:243-256` (`active Boolean @default(true)`, `source String?`) | Deactiveren = `active=false`; matcher-queries filteren hier al op (AD-3). |
| Chart-library | `apps/web/package.json:25` — `@ant-design/plots ^2.3.3` | `Line` voor precisietrend, `Column` voor mismatch (later), gestapelde `Column` voor promoties per klasse. Geen nieuwe chart-lib. |
| Data-fetch + refetch-patroon | `apps/web/src/services/apiClient.ts`, TanStack Query (`App.tsx:19`), voorbeeld `RetrainingNotificationBanner.tsx` | Query-hooks met refetchOnMount; verversknop = handmatige `refetch()`. |
| Audit-identiteit (userId) | `apps/api/src/middleware/auth.ts:70,126` (`request.user`) | decidedBy/rollback-wie uit de ingelogde gebruiker. |

### Wat er NIEUW is (de eigenlijke story)

1. Modulaire overview-compositie: `apps/api/src/services/flywheel/overview/*` + uitgebouwde `GET /overview`-handler.
2. Endpoint `POST /api/v1/flywheel/outliers/:id/decision` (Behouden/Deactiveren, soft-delete, baseline-stale).
3. Het volledige overzichtsscherm in `FlywheelPage.tsx`: KPI-rij, precisietrend, quarantainetabel, signaalpanelen, gold-set-samenstellingspaneel, Historie-tab + rollback-modal, outlier-vergelijkingsweergave, verversknop + verouderde-data-melding.
4. `flywheelService.ts`-uitbreiding (overview, rollback, outlier-decision) + i18next-keys.

**Géén nieuwe Prisma-migratie in deze story** — alle tabellen komen uit Epics 13/14 (ARCH-2 niet van toepassing; elke schemawijziging hier is een review-finding).

### Bindende UX-gedragsregels (DESIGN.md + EXPERIENCE.md)

- **Kleursemantiek (UX-DR5):** amber = quarantaine/wachtend/aan-cap/openstaande outliers — **géén fout**; rood uitsluitend het regressie-meetpunt in de trend en de stilstand-banner (15.4). Afkeur-/deactiveer-knoppen zijn in ruststand nooit rood; `teruggedraaid`-badge is neutraal.
- **KPI-klik-navigatie:** klik op een KPI-tegel navigeert naar de bijbehorende sectie (Component Patterns) — geen dode tegels.
- **Verversing:** waarden verversen bij paginabezoek + handmatige verversknop; geen live-polling; verouderde data → rustige "Bijgewerkt — vernieuwen"-melding, nooit auto-reload.
- **Secties boven tabs:** het overzicht is één scrollbare pagina; alleen de batchhistorie zit achter een secundaire tab — geen enkel FR-17-signaal mag achter een niet-geopende tab verdwijnen (EXPERIENCE.md IA).
- **Toon (Voice and Tone):** "1 batch wacht op jouw beoordeling", "Kwaliteitspoort: precisiedaling −1,8 pt boven tolerantie" — nooit "GEFAALD", geen emoji, geen uitroeptekens.
- **Accessibility Floor (UX-DR9):** statusmeldingen `aria-live="polite"`; status nooit via kleur alleen (dot/icoon + tekst); grafieken met tekstueel alternatief én data-als-tabel; focus-states teal-ring op elk interactief element, ook tabelrijen; contrast: amber-tekst altijd `#92600A` op `#FDF6E3`.
- **State Patterns:** skeleton bij laden; sectie-lokale foutkaart met "Opnieuw proberen" (rest bruikbaar); positieve empty state bij lege quarantainetabel; "nieuw geactiveerde klasse" verschijnt later (Epic 17) als groene badge-regel in het promoties-paneel — layout er nu al op voorbereiden.

### Guardrails (voorkom bekende fouten)

- **Monoliet-handler is een review-finding** — de coördinatie-noot (5 epics leveren panelen) is bindend: per paneel een sub-service, de route componeert alleen.
- **Geen poortlogica in endpoints** (AD-15): rollback en outlier-decision muteren status en loggen; ze draaien nooit guardrails/regressietest.
- **Baseline-stale niet vergeten** bij outlier-deactivatie (AD-5) — dit is het makkelijkst te missen kritieke punt van deze story.
- **Soft-delete only**: nooit `DELETE` op `ReferenceLogo`; `active=false`.
- **Verplicht redenveld** bij rollback is hard (UX-DR11): opslaan zonder reden kan niet, ook niet via de API-payload (server-side valideren).
- **Glossary exact** (PRD §3); faalredenen uit de poort 1-op-1 tonen, niet herformuleren.
- **Geen polling**; geen nieuwe migraties; e2e buiten de stable-subset-gate.
- Commits Engels; `versions.md` (NL) in DEZELFDE commit.

### Testrichtlijnen

- Web: vitest + jsdom (`apps/web/vitest.config.ts`, colocated `FlywheelPage.test.tsx`), patroon `DashboardPage.test.tsx`: gemockte service-laag, asserties op zichtbare NL-tekst, data-testids per paneel. Charts: mock `@ant-design/plots` (jsdom rendert geen canvas) en assert op het tekstuele alternatief.
- API: vitest (`apps/api/src/__tests__/`): per sub-service unit-tests; integratietest overview-compositie; decision-endpoint incl. autorisatie en dubbele-beslissing-idempotentie (tweede beslissing op zelfde finding → 409 of no-op, documenteer keuze).

### Project Structure Notes

- Sub-services onder `apps/api/src/services/flywheel/overview/`; route blijft `apps/api/src/api/v1/flywheel.ts` (Consistency Conventions).
- Web-panelen als losse componenten in `apps/web/src/components/flywheel/` (bijv. `PrecisionTrendCard.tsx`, `QuarantineTable.tsx`, `OutlierPanel.tsx`) zodat 15.3/15.4 en latere epics er los aan kunnen bouwen.

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story-15.2] — AC's; #Epic-List coördinatie-noot overview-endpoint (bindend).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/EXPERIENCE.md#Information-Architecture] — de acht FR-17-onderdelen met vaste plek; #Component-Patterns (KPI-klik, batchtabel, outlier-beoordeling); #State-Patterns; #Accessibility-Floor; #Key-Flows Flow 1 (UJ-1).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/DESIGN.md#Components] — kpi-tile, trend-chart, batch-table, evidence-panel, status-badge.
- Visuele referentie: `_bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/mockups/mock-overzicht.html`.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md#AD-5] — baseline-eigenaarschap en -invalidatie; #AD-10 (SPA + read-endpoints); #AD-13 (herleidbaarheid); #AD-15 (geen poort in request-pad; rollback-verduidelijking); #Nieuwe-API-endpoints.
- Story-afhankelijkheden: 13.2 (events), 13.4 (batches, run-tijdstempel), 13.5 (metingen), 13.6 (rollback, baseline-stale), 14.2 (samenstelling), 14.3 (outlier_findings).

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) uit epics-vliegwiel.md Epic 15, geverifieerd tegen prisma/schema.prisma, package.json en de UX-spines.
