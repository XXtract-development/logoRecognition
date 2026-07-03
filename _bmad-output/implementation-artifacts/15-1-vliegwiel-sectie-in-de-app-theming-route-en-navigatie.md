# Story 15.1: Vliegwiel-sectie in de app — theming, route en navigatie

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 15. -->

## Story

As a **datamanager**,
I want **een Vliegwiel-onderdeel in de bestaande applicatie in de XXtract-huisstijl**,
so that **ik het vliegwiel vind waar ik al werk**.

### Afbakening (kritiek)

- De theming is **gescopeerd**: een antd 5 `ConfigProvider`-wrapper uitsluitend rond de /flywheel-pagina's. Een **app-brede retheme is expliciet buiten scope** — die volgt als aparte latere story (UX-DR1, PRD §5-non-goal). De bestaande app-brede ConfigProvider in `App.tsx` (colorPrimary `#007AFF`, fontSize 16) blijft byte-voor-byte ongewijzigd.
- Deze story levert het **casco**: theming, route(s), navigatie-item met badge, lege/ladende staten en de i18next-basis. De inhoudelijke dashboard-panelen komen in Story 15.2; de batch-detailpagina in 15.3.

## Acceptatiecriteria

_(1-op-1 uit epics-vliegwiel.md, Story 15.1)_

1. **Given** de bestaande SPA
   **When** de theming-setup landt
   **Then** is antd 5 via een ConfigProvider-wrapper uitsluitend rond de /flywheel-pagina's gethemed met de XXtract-tokens uit DESIGN.md (navy primair, teal links, groen succes, statuskleuren conform de UX-DR5-semantiek, Inter 14px) zonder visuele regressie op bestaande schermen (UX-DR1, UX-DR5, AD-10)
   **And** is een app-brede retheme expliciet buiten scope — die volgt als aparte latere story (UX-DR1, PRD §5-non-goal).

2. **Given** de navigatie
   **When** de gebruiker het nieuwe item "Vliegwiel" (icoon `autorenew`, met badge die het aantal openstaande quarantainebatches toont) naast Review kiest
   **Then** landt hij op route `/flywheel` (FlywheelPage.tsx, flat-page-conventie) met een correcte lege/ladende staat zolang er geen data is (UX-DR2, UX-DR8)
   **And** zijn alle teksten NL via i18next-keys met glossary-termen exact conform PRD §3 (UX-DR10).

## Tasks / Subtasks

- [ ] 1. Gescopeerde theming (AC: 1)
  - [ ] 1.1 `apps/web/src/components/flywheel/FlywheelThemeProvider.tsx`: geneste antd `ConfigProvider` met XXtract-token-mapping uit de DESIGN.md-frontmatter — `colorPrimary: '#2F5A7A'` (navy), `colorSuccess: '#B7D945'`, `colorWarning: '#E6A817'`, `colorError: '#D64545'`, `colorLink: '#54949E'` (teal), `colorText: '#1E293B'`, `colorBorder: '#E2E8F0'`, `fontFamily: 'Inter'`, `fontSize: 14`, `borderRadius: 8`; component-token `Card.borderRadius: 12` (DESIGN.md §Shapes). Antd 5 ondersteunt geneste ConfigProviders — de wrapper erft en overschrijft alleen binnen zijn subtree.
  - [ ] 1.2 Wrapper uitsluitend binnen de /flywheel-pagina's toepassen (in FlywheelPage zelf of via een layout-route-element rond de flywheel-children) — NIET in `RootLayout` of `AppLayout`.
  - [ ] 1.3 Inter-font en Material Symbols Outlined beschikbaar maken voor de flywheel-subtree (zelf-gehost of via `apps/web/index.html`; let op: Material Symbols is nu nérgens in de app geladen — verifieer bundelimpact en documenteer de keuze in het Dev Agent Record). Terugvaloptie voor antd-interne iconen: @ant-design/icons blijft toegestaan waar antd-componenten die zelf leveren (DESIGN.md §Typography).
  - [ ] 1.4 Visuele-regressiecheck: bestaande schermen (Home, Review, Dashboard) renderen pixel-ongewijzigd — de bestaande ConfigProvider-token-set in `App.tsx:49-57` is niet aangeraakt.
- [ ] 2. Route + pagina-casco (AC: 2)
  - [ ] 2.1 `apps/web/src/pages/FlywheelPage.tsx` (flat-page-conventie, lazy import in `App.tsx` conform regel 22-31) + route `flywheel` als child van `AppLayout` (App.tsx:100-141).
  - [ ] 2.2 Route-stub `flywheel/batches/:id` alvast registreren richting een placeholder (Story 15.3 vult de pagina in) — of bewust weglaten en in 15.3 toevoegen; keuze documenteren.
  - [ ] 2.3 Lege/ladende staten conform EXPERIENCE.md State Patterns: skeleton-tegels en -tabelrijen in de verwachte layout (géén spinner-op-wit); empty state per sectie met richting ("Nog geen promotiebatches — het vliegwiel nomineert bij de volgende verwerking.").
- [ ] 3. Navigatie-item met quarantaine-badge (AC: 2)
  - [ ] 3.1 In `AppLayout.tsx` `getNavigationItems` (regel 36-85): item `key: '/flywheel'`, label `t('nav.flywheel', { defaultValue: 'Vliegwiel' })`, icoon `autorenew` (Material Symbols; zie taak 1.3), positie direct naast `/artwork-review` (EXPERIENCE.md IA: tussen Review en Dashboard).
  - [ ] 3.2 `getSelectedKey` (AppLayout.tsx:116) uitbreiden: `path.startsWith('/flywheel')` → `/flywheel` (zodat ook de batch-detailroute het nav-item actief houdt).
  - [ ] 3.3 Badge met het aantal openstaande quarantainebatches (antd `Badge`, al geïmporteerd in AppLayout.tsx:6): gevoed via het bestaande overview-endpoint `GET /api/v1/flywheel/overview` in `apps/api/src/api/v1/flywheel.ts` (aangemaakt in 13.2, uitgebreid in 13.4) — deze story breidt de response uit met `quarantineCount` (Prisma-count op `promotion_batches` met status `quarantined` en `closedAt IS NULL`). **Coördinatie:** Story 15.2 bouwt ditzelfde endpoint modulair uit — houd de handler nu al dun (aparte sub-service-functie, geen logica in de route).
  - [ ] 3.4 Badge-data via TanStack Query met refetch-on-mount (patroon `RetrainingNotificationBanner.tsx`), géén polling.
- [ ] 4. i18next NL (AC: 2)
  - [ ] 4.1 Nieuwe keys onder een `flywheel.*`-namespace in `apps/web/src/i18n/locales/nl.json` (+ Engelse defaults in de overige locales conform bestaand patroon met `defaultValue`).
  - [ ] 4.2 Glossary-termen exact conform PRD §3: kandidaat-referentie, promotiebatch, kwaliteitspoort, gold-set-regressietest, quarantaine, per-klasse cap, outlier-audit, seed-bootstrap, hard-negative, dubbele bevestiging, evidence-contract, informatieleverancier (GLN). Toon nuchter: "wacht op jouw beoordeling", nooit "GEFAALD".
- [ ] 5. Tests (zie Testrichtlijnen)
  - [ ] 5.1 `FlywheelPage.test.tsx`: rendert lege/ladende staat; theming-wrapper aanwezig; NL-teksten via i18n.
  - [ ] 5.2 AppLayout-test: nav-item Vliegwiel aanwezig naast Review, badge toont count uit gemockte API, navigatie naar `/flywheel` werkt.
  - [ ] 5.3 apps/api: route-test voor het minimale overview-endpoint (count-query gemockt).
- [ ] 6. versions.md (NL, eindgebruikerstaal) in DEZELFDE commit; Engelse commitmessage.

## Dev Notes — Developer Context

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Router + lazy pages | `apps/web/src/App.tsx:22-31` (lazy imports), `:95-166` (createBrowserRouter, AppLayout-children `:100-141`) | Nieuwe route als extra child; zelfde lazy-patroon. |
| App-brede ConfigProvider | `apps/web/src/App.tsx:49-57` (colorPrimary `#007AFF`, borderRadius 8, fontSize 16, dark/light algorithm) | **Niet aanraken.** De flywheel-wrapper nest hierbinnen. |
| Navigatie | `apps/web/src/components/common/AppLayout.tsx:36-85` (`getNavigationItems(t)`, items met @ant-design/icons + `t('nav.*', { defaultValue })`), `:116` (`getSelectedKey`), `:6` (Badge-import) | Nav-item + badge hier toevoegen; Review-item op `:76-79` als anker voor de positie. |
| i18next-setup | `apps/web/src/i18n/index.ts` + `locales/nl.json` (7 talen) | Bestaande namespace-structuur volgen; NL is leidend (UX-DR10). |
| Flat-page-conventie | `apps/web/src/pages/*Page.tsx` met colocated `*.test.tsx` (bijv. `DashboardPage.tsx`/`.test.tsx`) | FlywheelPage.tsx volgt exact dit patroon. |
| Data-fetch-patroon | `apps/web/src/services/apiClient.ts` (axios) + per-domein service (bijv. `dashboardService.ts`); TanStack Query via gedeelde QueryClient (`App.tsx:19`) | Nieuwe `flywheelService.ts` + query-hook voor de badge. |
| Notificatie/refetch-patroon | `apps/web/src/components/training/RetrainingNotificationBanner.tsx` (TanStack Query, refetchOnMount, data-testids) | Voorbeeld voor badge-data zonder polling. |
| v1-route-registratie | `apps/api/src/main.ts:18-29` (imports) + `:125-135` (`app.register(xRoutes, { prefix: '/api/v1' })`) | Nieuw `flywheelRoutes` uit `api/v1/flywheel.ts` hier registreren. |
| Promotiebatch-tabel | `promotion_batches` (Prisma-model uit Story 13.4; status pending/passed/quarantined/rolled_back, `closedAt?`) | Bron voor de badge-count. Bestaat pas ná Epic 13 — zie afhankelijkheden. |
| antd 5.22.5 + @ant-design/plots 2.3.3 + zustand + react-query | `apps/web/package.json:25-50` | Alles al aanwezig; géén nieuwe UI-libraries nodig. |

### Wat er NIEUW is (de eigenlijke story)

1. `apps/web/src/components/flywheel/FlywheelThemeProvider.tsx` — gescopeerde ConfigProvider met XXtract-tokens.
2. `apps/web/src/pages/FlywheelPage.tsx` — casco met skeleton-/empty-states.
3. Nav-item "Vliegwiel" + quarantaine-badge in `AppLayout.tsx`.
4. `apps/api/src/api/v1/flywheel.ts` — minimale eerste read (quarantaine-count), geregistreerd in `main.ts`; dunne handler, sub-service in `apps/api/src/services/flywheel/`.
5. `apps/web/src/services/flywheelService.ts` + i18next-keys `flywheel.*`.
6. Material Symbols Outlined-font (of gedocumenteerd alternatief) voor het `autorenew`-icoon.

### Bindende UX-gedragsregels (DESIGN.md + EXPERIENCE.md)

- **Kleursemantiek (UX-DR5, bindend voor alles wat deze story al toont):** groen = gepasseerd/gepromoveerd; **amber = quarantaine/wachtend — nadrukkelijk géén fout**; rood uitsluitend regressie-alarm en automatische stilstand. De quarantaine-badge in de nav is dus amber-getint volgens antd-Badge-conventie, nooit "error"-rood.
- Tekst nooit hard zwart (`#000000`); headings in navy `#2F5A7A`; pagina-achtergrond `#EDF1F7` binnen de flywheel-subtree.
- Status altijd via twee kanalen: kleur + icoon/dot + tekst — nooit kleur alleen (Accessibility Floor).
- Laden = skeleton in verwachte layout; leeg = richtinggevende empty state; geen spinner-op-wit (EXPERIENCE.md State Patterns).
- Desktop-first 1280px+; onder 1280px stapelen secties.
- Geen polling: refresh-on-load + handmatige verversknop is het patroon voor álle flywheel-data (Component Patterns, KPI-tegel).

### Afhankelijkheden

- **Epic 13 (m.n. 13.4)** levert `promotion_batches`. Landt deze story eerder, dan toont de badge 0 via een guard (tabel-onafhankelijke fallback) óf wacht taak 3.3 — keuze documenteren. Geen eigen migratie in deze story (ARCH-2 niet van toepassing: schema ongewijzigd).
- Stories 15.2/15.3/15.4 bouwen op dit casco; houd `flywheel.ts` (api) en `FlywheelPage.tsx` bewust modulair.

### Guardrails (voorkom bekende fouten)

- **Geen app-brede retheme** — elke wijziging aan de bestaande ConfigProvider-tokens of globale CSS die niet-flywheel-schermen raakt is een review-finding.
- **Geen DB-migraties** in deze story; teamregel: migraties alleen na expliciete toestemming per geval.
- **Glossary exact** (PRD §3): "promotiebatch" niet "batch-promotie", "kwaliteitspoort" niet "quality gate" in UI-teksten.
- **Geen antd-defaultblauw** in de flywheel-subtree; alle kleuren uit de DESIGN.md-frontmatter-tokenset.
- **E2E buiten de stable-subset-gate** (recente quarantaine-les): nieuwe e2e-specs optioneel en buiten de gate.
- Commits/PRs in het Engels; `versions.md` (NL, eindgebruikersperspectief) in DEZELFDE commit.

### Testrichtlijnen

- Web: vitest + jsdom conform `apps/web/vitest.config.ts` (globals, setupFiles `./tests/setup.ts`, colocated `src/**/*.test.tsx`); component-tests in de stijl van `DashboardPage.test.tsx`/`ApprovalQueuePage.test.tsx` (render + gemockte service + assertie op zichtbare NL-tekst en data-testids). Let op de 100%-coverage-thresholds in de web-config.
- API: vitest in `apps/api/src/__tests__/api/` — route-test met gemockte Prisma-count.

### Project Structure Notes

- `FlywheelPage.tsx` flat in `apps/web/src/pages/` (conventie); flywheel-specifieke componenten in `apps/web/src/components/flywheel/`.
- API: routebestand `apps/api/src/api/v1/flywheel.ts`, domeinlogica in `apps/api/src/services/flywheel/` (ARCHITECTURE-SPINE Source-tree).

### References

- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#Story-15.1] — AC's, bronnen UX-DR1/2/8/10, AD-10.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/DESIGN.md] — frontmatter-tokens (bindend), §Colors, §Typography, §Shapes, Do's and Don'ts.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/EXPERIENCE.md#Information-Architecture, #State-Patterns] — nav-positie, route, staten.
- Visuele referentie: `_bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/mockups/mock-overzicht.html`.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md#AD-10] — dashboard binnen bestaande SPA, data uitsluitend via `/api/v1/flywheel/*`; #Consistency-Conventions (v1-routebestand, i18next NL-only).

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) uit epics-vliegwiel.md Epic 15, geverifieerd tegen App.tsx/AppLayout.tsx/i18n/main.ts.
