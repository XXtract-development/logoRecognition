# Adversarial self-review — Story 15.1 (Vliegwiel-casco)

reviewed_commit: (pre-commit self-review op de werkboom van epic/vliegwiel-15)
verdict: PASS (na fixes)

## Scope

Gescopeerde antd-theming rond /flywheel, route + FlywheelPage-casco, nav-item
"Vliegwiel" met amber quarantaine-badge, lege/ladende/fout-staten, i18next NL,
en het `quarantineCount`-veld op `/api/v1/flywheel/overview`. Migratie-vrij.

## Bevindingen per severity

### Critical
- Geen.

### High
- **[gefixt] Geen echte testuitvoering mogelijk (worktree zonder node_modules).**
  De worktree miste `node_modules`; `tsc`/`vitest` draaiden aanvankelijk niet
  (of gaven een vals-positieve "0 errors"). Opgelost door de root- en
  per-package `node_modules` van de hoofdrepo in de worktree te symlinken. Web-
  en API-suites draaien nu aantoonbaar groen. (Geen codewijziging; testinfra.)

### Medium
- **[gefixt] Ongeldige antd `Col`-span (24/5) in de skeleton-grid.** Antd `Col`
  eist integer-spans; `24/5` = 4,8 zou stil breken. Vervangen door een CSS-grid
  met `repeat(auto-fit, minmax(180px,1fr))` — 5 tegels op desktop, stapelt onder
  1280px (UX-DR: onder 1280px stapelen).
- **[gefixt] Ongebruikte `React`-import in AppLayout.test.tsx** (TS6133) — de
  automatische JSX-runtime maakt de import overbodig. Verwijderd.

### Low
- **[overwogen, geen actie] Material Symbols via Google Fonts-`<link>` in
  index.html.** Dit is een externe font-bron (geen self-host). Bewuste keuze,
  conform de mockup en DESIGN.md; alleen fontlaadwerk, inert tot referentie, en
  het verandert niets aan bestaande schermen. Self-hosting zou een fontbestand-
  asset vereisen dat niet in de repo zit. Gedocumenteerd in het Dev Agent Record.
- **[gefixt] Best-effort degradatie quarantaine-count.** `getQuarantineCount`
  vangt DB-fouten en retourneert 0 (badge = observability, mag de overview-flow
  nooit breken) — conform het patroon van `missed-nominations.ts`. Test dekt het
  faalpad.

## Checklist (protocol §C)
- Alle AC geïmplementeerd: ja (zie ac-trace-15-1.md).
- Architectuur-patterns gevolgd: ja — reads via `/api/v1/flywheel/*` (AD-10);
  dunne route + sub-service (`quarantine-count.ts`); TanStack Query refetch-on-
  mount, geen polling; flat-page-conventie; geneste ConfigProvider.
- Anti-patterns vermeden: geen app-brede retheme (App.tsx:49-57 ongewijzigd);
  geen antd-defaultblauw in de subtree; glossary-termen exact ("promotiebatch",
  "quarantaine", "wacht op jouw beoordeling").
- Graceful degradation: quarantaine-count faalt naar 0; empty/loading/error-
  staten aanwezig; overview-hook zonder data → badge 0, geen crash.
- Geen secrets/security-issues: geen.
- Geen dode code / debug-statements: geen console.log; alle nieuwe exports
  worden gebruikt of getest.

## Fix-log
- FlywheelPage.tsx: skeleton-grid van antd Col → CSS-grid.
- AppLayout.test.tsx: ongebruikte React-import verwijderd.
- Testinfra: node_modules-symlinks in de worktree (buiten de commit).
