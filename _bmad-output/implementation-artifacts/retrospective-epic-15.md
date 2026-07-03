# Retrospective — Epic 15: Vliegwiel-dashboard & besturing

**Datum:** 2026-07-03 · **Branch:** `epic/vliegwiel-15` · **HEAD:** `216fb1d` (code-anchor `7915364`) · **Base:** `244fcd6` (acc met Epics 13+14)
**Stories:** 15.1–15.4 (4/4 done) · **Migratie:** 0017 (`threshold_changes`) · **Eerste frontend-zware epic.**

## Wat ging goed

- **De epic-brede review ving een cross-story performance-regressie die geen story-agent kon zien.** 15.1 gaf de nav-badge een `/overview`-bron toen dat endpoint nog minimaal was; 15.2 liet `/overview` groeien tot een 12-panel-aggregatie. Gevolg: elke paginanavigatie in de héle app (Home, Recognize, Training, …) vuurde de volledige aggregatie af, puur voor één badge-getal. Alleen zichtbaar met de hele epic in beeld. Gedicht met een dedicated `GET /flywheel/quarantine-count`. **Les: zodra meerdere stories één endpoint samen laten groeien, controleer op epic-niveau wie het aanroept en hoe vaak.**
- **De gedeelde-resolver-discipline hield stand.** `resolvePromotionThreshold` (override ?? env ?? default) is de enige leesbron voor de drempel in nominatie, guardrail én poort — geen tweede pad ontstaan ondanks vier stories die drempels/config raken.
- **Cross-epic-hefbomen correct en getest.** Outlier-deactivatie (15.2) roept `markBaselineStale` aan (AD-5), rollback-modal roept het 13.6-endpoint, vrijgave (15.3) gaat via conditional updates zonder poortlogica in het request-pad (AD-15/16). Deze waren het grootste risico en zijn expliciet geborgd.
- **Gescopeerde theming werkte zoals bedoeld.** De antd-ConfigProvider zit alléén om /flywheel; App.tsx-root en de bestaande schermen bleven onaangeraakt — de PRD §5-non-goal is gerespecteerd, bestaande web-tests bleven groen.
- **Modulaire /overview-compositie** (sub-service per paneel, sectie-lokale foutafhandeling) hield de merge-churn over vier stories beheersbaar.

## Wat brak / lastig was

- **Worktree miste node_modules** (15.1): opgelost door te symlinken naar de hoofdrepo-modules; niet gecommit. Voor frontend-epics is dit een terugkerend opstartpunt — de web-suite heeft de volledige dep-tree nodig.
- **Batch-detail-koppeling in twee stappen.** 15.2 leverde een Drawer-fallback omdat de 15.3-route nog niet bestond; 15.3 verving die door de echte route + `onOpenBatch`. Werkte, maar vergde bewuste coördinatie tussen de twee stories.
- **Pre-existing tsc-fout** in `MobileReviewDeck.test.tsx` (niet van Epic 15) bleef zichtbaar in `tsc --noEmit`; niet aangeraakt om scope-zuiver te blijven.

## Patronen / afspraken hieruit

1. **Een badge/teller die op een globaal gemount component leeft, mag NOOIT een samengesteld/duur endpoint aanroepen** — altijd een dedicated lichte query. Nu als vaste regel voor latere dashboard-uitbreidingen.
2. **Bij een endpoint dat meerdere stories samen laten groeien: epic-brede check op alle consumers.** De story-lokale review ziet alleen de eigen toevoeging.
3. **Frontend-epics: node_modules-beschikbaarheid in de worktree is een expliciete fase-A-stap**, niet iets om tijdens de testfase te ontdekken.

## Stand van het vliegwiel na Epic 15

Het **volledige besturingspaneel** draait nu: overzicht (KPI's, precisietrend, quarantaines, cap/outlier/gold-set-panelen, lege staten voor Epics 16–18), quarantaine-afhandeling met bewijs + sneltoetsen, drempelbeheer met audittrail, pauze/hervat/stilstand-banners. Samen met de backend (Epics 13+14) is de datamanager-loop uit UJ-1/UJ-3 end-to-end bruikbaar. Wat rest (Epics 16–18) zijn brandstof-uitbreidingen: mismatch-stromen, seed-bootstrap, GLN-backfill — de lege panelen staan er al klaar voor.

## Openstaand richting latere epics (geen blocker)

- De lege panelen (mismatch-trends, bootstrap-wachtrij, GLN-dekking) tonen nu placeholder-lege-staten; Epics 16/17/18 vullen ze.
- AC6 van 14.1 (afstemming reviewstation-gebruikers) blijft de openstaande menselijke taak vóór de vlag op ACC aan gaat.
