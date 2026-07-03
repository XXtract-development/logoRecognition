# AC→test-traceability — Story 15.2 (Overzichtsscherm)

Elk acceptatiecriterium met de dekkende geautomatiseerde test(s). Alle tests draaien groen (web vitest + api vitest).

| AC | Kern | Dekkende test(s) | Bestand |
|----|------|------------------|---------|
| **AC1** | Overzicht conform mock: KPI-rij, precisietrend, quarantainetabel, signaalpanelen; niet-gebouwde panelen → lege staat | `15.2 AC1: rendert de KPI-rij, trend, quarantainetabel, gold-set en signaalpanelen`; `toont de lege staat voor de nog-niet-gebouwde panelen (16/17/18)`; `een sectie-lokaal falend paneel toont zijn foutkaart, de rest blijft staan` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| AC1 (API) | Modulaire compositie, sectie-lokale fout per paneel | `composeOverview (AC1) — sectie-lokale fouttolerantie` (2 tests); per-paneel sub-service-tests | `apps/api/src/__tests__/services/flywheel-overview-compose.test.ts`, `flywheel-overview-panels.test.ts` |
| **AC2** | Kleursemantiek (amber quarantaine ≠ fout, rood alleen regressie/stilstand) | `15.2 AC2: de quarantaine-status is amber (…) niet rood`; `een teruggedraaide batch draagt de neutrale badge "teruggedraaid" (geen rood)` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| **AC3** | Klik op quarantaine-batch → detail (drawer-fallback tot 15.3) | `15.2 AC3: klik op "Openen" toont de detail-drawer met poort-uitkomsten` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| AC3 (API) | Poort-uitkomsten in de quarantaine-payload voor de drawer | `quarantine (AC1/AC3) — … levert gateResults voor de drawer` | `apps/api/src/__tests__/services/flywheel-overview-panels.test.ts` |
| **AC4** | Gold-set-samenstellingspaneel (omvang, ECHT/VALS, top-5, scheefgroei) | `15.2 AC1: gold-set-samenstellingspaneel (AC4) — toont omvang, ECHT/VALS-verdeling en top-klassen` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| **AC5** | Historie-tab + rollback-modal met verplicht redenveld; badge `teruggedraaid` | `15.2 AC5: de rollback-modal blokkeert bevestigen zolang er geen reden is; met reden slaagt de rollback` (asserteert disabled zonder reden, enabled met reden, service-aanroep); `AC2: teruggedraaide badge` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| AC5 (API/service) | Historie-paneel markeert teruggedraaide batch + rollback-context; rollback-service-aanroep | `history (AC5) — markeert een teruggedraaide batch met rollback-context`; `rollbackBatch (AC5)` | `flywheel-overview-panels.test.ts`, `apps/web/src/services/flywheelService.test.ts` |
| **AC6** | Outlier-vergelijkingsweergave + Behouden/Deactiveren; deactiveren = soft-delete + baseline-invalidatie | `15.2 AC6: Deactiveren roept de decision-service aan …` (comparison zichtbaar); `Behouden roept … "behouden" aan` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| AC6 (API/service) | `decideOutlier`: behouden/deactiveren, soft-delete (active=false), **markBaselineStale (AD-5)**, idempotentie; endpoint 200/400/404/409/403 | `decideOutlier — behouden` / `deactiveren (AD-5 KRITIEK)` (asserteert `active:false` + `markBaselineStale('outlier-deactivatie', …)`); `— foutpaden` (404/409); route-test 6 cases | `flywheel-outlier-decision.test.ts`, `flywheel-outlier-decision.routes.test.ts` |
| **AC7** | KPI openstaande quarantaines + ouderdom (SM-5); gemiste-nominaties-teller met reden; laatste succesvolle run | `15.2 AC7: toont openstaande quarantaines met ouderdom, gemiste nominaties en laatste run` | `apps/web/src/pages/FlywheelPage.test.tsx` |
| AC7 (API) | KPI-paneel: precisie, promoties, quarantaine-ouderdom, cap | `kpi (AC7) — bevat de openstaande quarantaines met ouderdom (SM-5)` | `flywheel-overview-panels.test.ts` |
| **AC8** | Verversknop + refresh-on-load, géén polling; verouderde-data-melding | `15.1 casco > de verversknop roept refetch aan (AC8, handmatig)`; refetch-on-mount/geen-polling in `useFlywheelOverview.ts` (staleTime 30s, refetchOnMount, geen refetchInterval); StaleDataAlert-component (geen auto-reload, aria-live) | `apps/web/src/pages/FlywheelPage.test.tsx`, `useFlywheelOverview.test.tsx` |

## Coördinatie-noot (bindend) — modulaire /overview
Per paneel één sub-service (`apps/api/src/services/flywheel/overview/*`); de route componeert alleen (`composeOverview`). Elk paneel faalt sectie-lokaal — getest in `flywheel-overview-compose.test.ts`. Geen monoliet-handler.

## Geen AC zonder dekkende test
Alle 8 AC's hebben ten minste één dekkende, in de diff aanwezige test die het AC-gedrag asserteert. Geen waivers.
