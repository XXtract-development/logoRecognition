---
title: Vliegwiel-dashboard
status: final
created: 2026-07-02
updated: 2026-07-02
sources:
  - _bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md
colors:
  # XXtract-tokens exact (design system v3). Geen kleuren buiten deze set.
  primary: '#2F5A7A'            # Navy — navigatie, primaire acties
  primary-hover: '#245068'
  primary-light: '#E8F0F5'      # Geselecteerde rij, actief nav-item
  primary-faint: '#F2F7FA'      # Rij-hover
  secondary: '#54949E'          # Teal — links, informatief
  secondary-light: '#EBF5F6'
  success: '#B7D945'            # Groen — gepasseerd / gepromoveerd
  success-dark: '#8AAE1F'       # Succestekst op lichte achtergrond
  success-light: '#F4FADF'
  warning: '#E6A817'            # Amber — quarantaine / wacht op mens (géén fout)
  warning-light: '#FDF6E3'
  warning-text: '#92600A'       # Amber-tekst op lichte achtergrond
  destructive: '#D64545'        # Rood — uitsluitend regressie-alarm en stilstand
  destructive-light: '#FDE8E8'
  background: '#FFFFFF'
  background-muted: '#F8FAFB'
  border: '#E2E8F0'
  border-soft: '#EBF0F6'
  foreground: '#1E293B'         # Primaire tekst — nooit hard zwart
  foreground-heading: '#2F5A7A' # Headings en form-labels in navy
  foreground-muted: '#64748B'
  app-bg: '#EDF1F7'             # Pagina-achtergrond buiten cards
typography:
  # Inter overal; iconen Material Symbols Outlined (fill 0).
  page-title:
    fontFamily: 'Inter'
    fontSize: 20px
    fontWeight: '700'
    letterSpacing: -0.02em
  card-title:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '600'
  stat-value:
    fontFamily: 'Inter'
    fontSize: 28px
    fontWeight: '700'
  body:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-medium:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '500'
  label:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: '500'
  caption:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: '400'
  badge:
    fontFamily: 'Inter'
    fontSize: 11px
    fontWeight: '500'
  table-header:
    fontFamily: 'Inter'
    fontSize: 11px
    fontWeight: '600'
    letterSpacing: 0.04em
rounded:
  card: 12px
  alert: 10px
  control: 8px      # buttons, inputs, nav-items
  badge: 20px       # pill
spacing:
  base: 4px
  content-padding: '24px 28px'
  card-body: 20px
  card-header: '16px 20px'
  stats-gap: 14px
  grid-gap: 16px
  section-margin: 20px
components:
  kpi-tile:
    base: 'antd Card (stat-card patroon)'
    background: '{colors.background}'
    radius: '{rounded.card}'
    value: '{typography.stat-value}'
  trend-chart:
    base: '@ant-design/plots Line'
    line: '{colors.secondary}'
    alarm-marker: '{colors.destructive}'
  batch-table:
    base: 'antd Table'
    header-bg: '{colors.background-muted}'
    row-hover: '{colors.primary-faint}'
  evidence-panel:
    base: 'antd Card + Image (vergelijkingsweergave)'
    frame: '{colors.border}'
    radius: '{rounded.card}'
  status-badge:
    base: 'antd Tag (pill)'
    radius: '{rounded.badge}'
    font: '{typography.badge}'
  pause-switch:
    base: 'antd Switch + Modal (bevestiging)'
    on: '{colors.success-dark}'
    off: '{colors.foreground-muted}'
  threshold-input:
    base: 'antd InputNumber + verplicht redenveld'
    focus: '{colors.secondary}'
---

# Vliegwiel-dashboard — DESIGN.md

## Brand & Style

Het Vliegwiel-dashboard is de cockpit waarmee de datamanager het referentie-vliegwiel bestuurt: een intern, data-dense besturingsscherm binnen de bestaande logoRecognition-app. De toon is zakelijk, kalm en feitelijk — het dashboard rapporteert de gezondheid van een autonoom proces en alarmeert alleen wanneer dat proces zelf al is ingegrepen. Geen gamification, geen decoratie, geen alarmisme.

Het UI-systeem is **Ant Design 5** met XXtract-theming via `ConfigProvider` — de app draait al op antd 5.22 + @ant-design/plots; app-consistentie wint hier van de teamstandaard Shadcn/Tailwind (memlog-beslissing, te bevestigen door architect). Alle kleuren, typografie en radii komen uit het XXtract Design System v3; dit document definieert géén nieuwe tokens, alleen de vliegwiel-specifieke toepassing ervan.

## Colors

De volledige XXtract-tokenset staat in de frontmatter. De vliegwiel-**statussemantiek** is het belangrijkste kleurcontract van dit scherm:

- **Groen (`{colors.success}` / tekst `{colors.success-dark}`)** = gepasseerd en gepromoveerd. Een promotiebatch die de kwaliteitspoort passeerde, een geslaagde gold-set-regressietest, een nieuw geactiveerde klasse.
- **Amber (`{colors.warning}` / tekst `{colors.warning-text}`)** = quarantaine en alles dat op de datamanager wacht. Quarantaine is **nadrukkelijk geen fout** — het is de kwaliteitspoort die zijn werk doet en een batch aan de mens voorlegt. Ook: klassen aan hun per-klasse cap, openstaande outlier-meldingen, wachtende bootstrap-runs.
- **Rood (`{colors.destructive}`)** = uitsluitend regressie-alarm en automatische stilstand. Het meetpunt in de precisietrend dat de tolerantie overschreed, en de stilstand-banner (FR-19). Nergens anders. Nooit voor quarantaine, nooit voor "afkeuren"-knoppen in ruststand.
- **Teal (`{colors.secondary}`)** = informatief: trendlijnen, links, mismatch-statistieken, GLN-dekkingsgraad.
- **Navy (`{colors.primary}`)** = navigatie, headings en primaire acties (Vrijgeven, Openen, Hervatten).

Neutrale vlakken: `{colors.app-bg}` als pagina-achtergrond, cards op `{colors.background}` met `{colors.border-soft}` randen. Tekst op `{colors.foreground}` — nooit `#000000`.

## Typography

Inter, basis **14px**, lijnhoogte 1.5 — conform het design system. De type-scale in de frontmatter is de bindende set. Toepassing:

- `{typography.page-title}` voor de paginatitel "Vliegwiel".
- `{typography.stat-value}` voor KPI-waarden (0,97 · 41 · 12); KPI-labels in `{typography.label}` met `{colors.foreground-muted}`.
- `{typography.card-title}` voor card-headers (Precisietrend, Quarantaine, Bootstrap-wachtrij…). Headings altijd in `{colors.foreground-heading}` (navy).
- `{typography.table-header}` uppercase voor tabelkoppen; `{typography.body-medium}` voor primaire celtekst.
- `{typography.badge}` voor statusbadges en poort-uitkomsten.
- Iconen: Material Symbols Outlined, 16–18px, fill 0 — in antd-context aangevuld met @ant-design/icons waar antd-componenten die zelf leveren.

## Layout & Spacing

Basis-unit 4px. Content-area `{spacing.content-padding}`, cards `{spacing.card-body}` body / `{spacing.card-header}` header, KPI-grid met `{spacing.stats-gap}` gap, overige grids `{spacing.grid-gap}`. Desktop-first vanaf 1280px: het dashboard-overzicht gebruikt een KPI-rij van 5 tegels, daaronder een 2/3–1/3 hoofdgrid (trend + quarantainetabel links, signaalpanelen rechts). De batch-detailpagina is een master-detail: kandidatenlijst ±320px vast links, bewijspaneel flexibel rechts. Onder 1280px stapelen secties; het master-detail wordt lijst → detail (push-navigatie).

## Elevation & Depth

Twee niveaus, conform design system: `--card-shadow` (`0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`) voor alle cards en tabellen; `--card-shadow-md` voor modals (pauze-bevestiging, drempelwijziging). Diepte komt van `{colors.app-bg}` achter witte cards, niet van zwaardere schaduwen. Geen glassmorphism, geen gradients.

## Shapes

`{rounded.card}` (12px) voor cards, tabellen en het bewijspaneel; `{rounded.control}` (8px) voor knoppen en invoervelden; `{rounded.alert}` (10px) voor banners; `{rounded.badge}` (pill) uitsluitend voor statusbadges. Antd's `borderRadius`-token wordt op 8 gezet zodat antd-controls vanzelf kloppen; cards krijgen 12px via component-token.

## Components

Alleen de componenten die dit dashboard nodig heeft. Basis = antd 5-component; theming = XXtract-tokens via ConfigProvider en component-tokens.

- **Statuskaart / KPI-tegel** (`{components.kpi-tile}`) — antd `Card` in het stat-card-patroon: label (`{typography.label}`, muted) + icoon-container 32×32 (kleurvariant volgens statussemantiek) + waarde (`{typography.stat-value}`) + voettekst. Vijf tegels: gold-set-precisie, nieuwe referenties (promoties), batches in quarantaine, klassen aan cap, GLN-dekkingsgraad. De quarantaine-tegel kleurt zijn icoon amber zodra > 0 — de waarde-typografie blijft neutraal.
- **Trendgrafiek** (`{components.trend-chart}`) — @ant-design/plots `Line` voor de gold-set-precisietrend: één meetpunt per gepasseerde promotiebatch, lijn in `{colors.secondary}`, tolerantie-ondergrens als gestippelde referentielijn, en een regressie-meetpunt gemarkeerd in `{colors.destructive}` (het enige rood in de grafiek). Mismatch-trend als `Column` (bevestigd = `{colors.success-dark}`, gedeclareerd-niet-gevonden = `{colors.warning}`); promoties per klasse als gestapelde `Column`.
- **Batchtabel** (`{components.batch-table}`) — antd `Table`: header op `{colors.background-muted}` met `{typography.table-header}`, rij-hover `{colors.primary-faint}`, faalreden als tekst + amber badge, laatste kolom actieknop "Openen" (navy, small). Gebruikt voor quarantainebatches en batchhistorie.
- **Bewijspaneel / vergelijkingsweergave** (`{components.evidence-panel}`) — antd `Card` met twee even grote beeldvakken naast elkaar: links de crop (uit het evidence-contract), rechts de actieve referentie van dezelfde T3777-code; beide in een `{colors.border}`-kader met `{rounded.card}`, bijschrift in `{typography.caption}`. Daaronder: scoreblok (antd `Descriptions`), declaratieblok (GTIN, GLN, gedeclareerde T3777-codes) en poort-uitkomsten als badge-rij.
- **Badge-set** (`{components.status-badge}`) — antd `Tag` pill-shaped met dot, altijd dot/icoon + tekst (nooit kleur alleen). Batchstatussen: `gepasseerd` (groen), `quarantaine` (amber), `teruggedraaid` (neutraal). Kandidaatstatussen: `te beoordelen` (amber), `vrijgegeven` (groen), `afgekeurd` (neutraal grijs — géén rood; afkeuren is regulier werk, geen fout), `hard-negative` (neutraal). Poort-uitkomsten: dot groen bij gehaald, amber bij de check die de batch blokkeerde.
- **Pauzeschakelaar + bevestiging** (`{components.pause-switch}`) — antd `Switch` met tekstlabel ("Vliegwiel actief" / "Gepauzeerd") in de pagina-header, gevolgd door een antd `Modal` die de consequenties benoemt en expliciete bevestiging vraagt. Actieve stand: `{colors.success-dark}`. Gepauzeerd: neutraal grijs met amber statuslabel. Automatische stilstand (FR-19) toont daarnaast een rode banner — de schakelaar zelf wordt nooit rood.
- **Drempel-invoer met audittrail-hint** (`{components.threshold-input}`) — antd `InputNumber` (stap 0,01, bereik per methode) + verplicht redenveld in een modal; onder het veld een vaste hint in `{typography.caption}`: "Wijzigingen worden gelogd met oude en nieuwe waarde" (FR-5). Focus-stijl: rand `{colors.secondary}` + `0 0 0 3px rgba(84,148,158,0.1)`.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Amber voor quarantaine en alles dat op de datamanager wacht | Rood voor quarantaine — quarantaine is de poort die werkt, geen fout |
| Rood uitsluitend voor regressie-alarm en automatische stilstand | Rood voor afkeurknoppen, badges of drukte-indicatoren |
| Alle kleuren uit de XXtract-tokenset in de frontmatter | Nieuwe hexwaarden of antd-defaultkleuren (antd-blauw!) introduceren |
| `{colors.foreground}` voor tekst, `{colors.foreground-heading}` voor headings | Hard zwart `#000000` |
| Status altijd via twee kanalen: kleur + dot/icoon + tekst | Kleur als enige betekenisdrager |
| antd-componenten themen via ConfigProvider-tokens | antd-componenten per stuk met inline hexwaarden overschrijven |
| Data-dense tabellen met `{typography.table-header}` en rustige hover | Agressieve badges, animaties of "3 NIEUW!"-drukte |
| Pill-radius (`{rounded.badge}`) alleen voor badges | Radius > 12px op cards of panelen |
