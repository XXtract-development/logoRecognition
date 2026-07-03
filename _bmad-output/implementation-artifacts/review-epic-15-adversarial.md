# Adversarial review — Epic 15 (Vliegwiel-dashboard & besturing)

reviewed_commit: 7915364
verdict: PASS
base: 244fcd6 (acc + Epics 13+14)
epic_head_before_fixes: dab2fe7
scope: 4 stories (15.1–15.4), frontend + API, één migratie (0017)

## Samenvatting

De epic is inhoudelijk sterk en de riskante cross-epic-integraties zijn correct én
getest. De KRITIEKE punten uit de review-opdracht kloppen allemaal:

- Één gedeelde drempel-resolver (`resolvePromotionThreshold`) is het ENIGE effectieve-
  waarde-leespad; nominatie (`nomination.ts`), guardrail (`guardrails.ts`) en batch-detail
  lezen er allemaal via — geen tweede leespad dat de override negeert.
- Pauze heeft één bron van waarheid (`system_settings` via de 13.6-`pause.ts`-service);
  15.4 (`pause-control.ts`) is een dunne bedien-/audit-laag erbovenop, geen tweede state.
- Outlier-deactivatie (15.2) roept `markBaselineStale('outlier-deactivatie', by)` aan
  (AD-5) — expliciet getest (`flywheel-outlier-decision.test.ts:75`).
- Rollback-modal → `batches/:id/rollback` (13.6) correct; 409 op niet-`passed` batch.
- Vrijgave (15.3) muteert alleen status + koppelt `promotionBatchId` los, GEEN poortlogica
  in het request-pad (AD-15); 409 op `in_batch` in een `pending`-batch (AD-16) — getest.
- Migratie 0017 is additief, volgt exact het `model_activation_logs`-patroon, heeft down.sql,
  `prisma migrate status` lokaal up-to-date, geen drift.
- Scoped theming (15.1) raakt de root-`ConfigProvider` in `App.tsx` NIET; FlywheelThemeProvider
  is pagina-scoped.
- A11y (UX-DR9): aria-live op beslis-feedback, role=alert op banners, aria-selected +
  scrollIntoView op de kandidatenlijst, role=img + tekst-datatabel als grafiek-alternatief.
- Kleursemantiek (UX-DR5): rood UITSLUITEND in de precisie-trend (regressie) en de auto-
  stilstand-banner; amber voor quarantaine/pauze. Consistent.
- Geen dangerouslySetInnerHTML, geen console.log/debug, geen secrets; crop-beelden via
  geauthenticeerde blob-URL (geen XSS/URL-injectie).

## Bevindingen

### HIGH

- **H1 — apps/web/src/components/common/AppLayout.tsx:124 (vóór fix)** — De nav-badge werd
  gevoed door `useFlywheelOverview()` (het volle `/flywheel/overview`). AppLayout mount op
  ÉLKE pagina (Home/Recognize/Training/Models/Review/Dashboard) via `<Outlet/>`, dus na de
  15.2-uitbreiding vuurde elke navigatie de 12-panel-aggregatie `composeOverview()`
  (`overview/index.ts:68-95`: KPI, precisie-trend, gold-set-samenstelling, class-caps,
  outliers, historie, …) af — puur om één badge-getal. Cross-story-regressie: 15.1's badge-
  spec verwees naar het toen-nog-minimale 13.2-overview, dat 15.2 in dezelfde epic tot een
  zware aggregatie liet groeien. Overtreedt de PRD §5-non-goal-geest (15.1 mag app-breed niets
  duurs toevoegen) en is een reële performance-regressie op bestaande schermen.
  **FIX:** lichte route `GET /api/v1/flywheel/quarantine-count` (één `promotion_batches`-count,
  best-effort→0) + `fetchQuarantineCount` + `useQuarantineBadgeCount`; AppLayout gebruikt nu
  die hook. Het volle overview blijft voorbehouden aan de /flywheel-pagina. Gedrag identiek
  (zelfde count), badge blijft app-breed.

### LOW / informational (niet-blokkerend, niet gewijzigd)

- **L1 — apps/web/index.html:16 / globals.css** — Material Symbols + Inter worden van Google
  Fonts geladen op documentniveau (niet /flywheel-scoped). Terecht: het `autorenew`-nav-icoon
  leeft in AppLayout (app-breed), dus het font MOET document-level zijn. Introduceert wel een
  externe netwerk-/privacy-afhankelijkheid en toont offline de ligature-tekst ("autorenew")
  i.p.v. het icoon. Cosmetisch, `aria-hidden` op het icoon + tekstlabel "Vliegwiel" houdt het
  toegankelijk. Geen fix — bewuste keuze conform DESIGN.md §Typography.
- **L2 — apps/web/src/services/flywheelService.ts** — path-params (candidate/batch/finding-id)
  worden zonder `encodeURIComponent` geïnterpoleerd, terwijl `code` het wél gebruikt. IDs zijn
  server-side UUID's (niet vrij-tekst), dus geen injectie-risico; louter inconsistentie. Geen fix.

## Acceptatie-audit per story

- **15.1 (theming/route/nav)** — PASS. Route + nav-item + badge + scoped theming + i18next NL.
  Badge-voeding gecorrigeerd (H1) zonder AC-afwijking (count identiek). Tests groen.
- **15.2 (overzichtsscherm)** — PASS. Modulaire `/overview` (sub-service per paneel, sectie-
  lokale `{error}`), outlier-beslissing met AD-5 baseline-stale, rollback-modal met verplicht
  redenveld. Getest.
- **15.3 (quarantaine-afhandeling)** — PASS. Batch-detail (on-read), kandidaat-decision
  (afkeuren/vrijgeven/undo) met conditional updates (AD-16), 409-regels, hard-negative +
  gold-set-VALS-aanwas via de 14.1-service, batch-close. Gedocumenteerde variances (crop-route
  binnen /flywheel/, L1-declaratie niet in evidence) correct afgehandeld. Getest.
- **15.4 (drempels/pauze)** — PASS. Gedeelde resolver + override in `system_settings` +
  `threshold_changes`-audit (verplichte reden, bereik 0,50–0,99), pauze/hervat via 13.6-service
  met audit-log, `openQuarantines` als niet-blokkerende waarschuwing. Migratie 0017 additief.
  Getest.

## Diff-scope

Alleen `apps/api`, `apps/web`, `apps/api/prisma` (schema + migratie 0017) en de bmad-artefacten.
Geen `.env`/`node_modules`/snapshots/build-output meegecommit.

## Fix-log

- H1 — lichte badge-count-route + hook, AppLayout omgezet, tests bijgewerkt/toegevoegd:
  fix in commit 7915364; deze report-hash-sync in de opvolgende commit.

## Testresultaat (na fix, DATABASE_URL lokaal)

- apps/api vitest: 603 passed | 2 skipped | 20 todo (55 files) — +2 nieuwe route-tests.
- apps/web vitest: 115 passed | 16 todo (20 files) — AppLayout-test omgezet naar de badge-hook.
- apps/api `tsc --noEmit`: schoon. apps/web `tsc --noEmit`: één PRE-BESTAANDE unused-React
  in `MobileReviewDeck.test.tsx` (niet in de epic-diff, niet door deze wijziging geraakt).
