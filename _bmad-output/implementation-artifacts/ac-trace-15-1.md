# AC → test-mapping — Story 15.1

Elke AC (en de deelvereisten uit de Tasks) gedekt door minstens één
geautomatiseerde test die het gedrag assert. Alle genoemde tests staan in de
epic-diff en zijn groen.

## AC1 — Gescopeerde XXtract-theming rond /flywheel, geen app-brede retheme

| Deelvereiste | Test |
|---|---|
| ConfigProvider-wrapper omhult de flywheel-subtree | `FlywheelThemeProvider.test.tsx` → "rendert zijn children binnen de gescopeerde subtree"; `FlywheelPage.test.tsx` → "rendert de gescopeerde theming-wrapper en de NL-paginatitel" (`flywheel-page` root) |
| Exacte XXtract-tokens (navy primair, teal links, groen, amber, rood, Inter 14px), géén antd-blauw | `FlywheelThemeProvider.test.tsx` → "gebruikt de exacte XXtract-tokens ... (geen antd-blauw)" — assert op #2F5A7A/#54949E/#B7D945/#E6A817/#D64545, fontSize 14, Inter, en ≠ #007AFF/#1677ff |
| Bestaande app-brede ConfigProvider ongewijzigd (geen regressie) | Verificatie: `App.tsx:49-57` (colorPrimary #007AFF, fontSize 16) byte-ongewijzigd — bevestigd via git-diff (geen wijziging aan dat blok); de flywheel-wrapper zit uitsluitend in FlywheelPage.tsx |

## AC2 — Nav-item "Vliegwiel" (autorenew + badge) → /flywheel, lege/ladende staat, NL i18n

| Deelvereiste | Test |
|---|---|
| Nav-item "Vliegwiel" aanwezig naast Review | `AppLayout.test.tsx` → "toont het nav-item Vliegwiel naast Review" |
| Icoon autorenew (Material Symbols) | `MaterialSymbol.test.tsx` → "rendert de ligature-naam met de material-symbol-utility" (autorenew) |
| Badge met aantal openstaande quarantainebatches | `AppLayout.test.tsx` → "toont de quarantaine-badge met de count uit de overview-hook" (count 2) |
| Badge amber, geen fout-rood; verdwijnt bij 0 | `AppLayout.test.tsx` → "toont GEEN badge als er geen openstaande quarantainebatches zijn"; badge-kleur #E6A817 (amber) in code |
| Navigatie naar /flywheel werkt | `AppLayout.test.tsx` → "navigeert naar /flywheel bij klik op het nav-item" |
| Route /flywheel mount FlywheelPage (flat-page) | `App.tsx` child-route + `FlywheelPage.test.tsx` (rendert de pagina) |
| Correcte lege/ladende staat (UX-DR8) | `FlywheelPage.test.tsx` → "toont de skeleton-ladende staat"; "toont de richtinggevende empty state"; "toont een sectie-lokale foutkaart met Opnieuw proberen" |
| NL-teksten via i18next-keys, glossary exact | `FlywheelPage.test.tsx` (titel "Vliegwiel", empty-tekst "Nog geen promotiebatches"); i18n-keys onder `flywheel.*` + `nav.flywheel` in `nl.json` |
| Badge-count uit /overview | API: `flywheel.routes.test.ts` → "ontsluit quarantineCount ... default 0"; "telt alleen openstaande quarantainebatches (status quarantined, closedAt null)"; "valt best-effort terug op 0" |
| Data-fetch: refetch-on-mount, geen polling | `useFlywheelOverview.test.tsx` → "haalt het overzicht op en levert quarantineCount"; "exporteert een stabiele query-key"; service: `flywheelService.test.ts` |

## Migratie
Geen. Schema ongewijzigd; `quarantineCount` is een count-query op de bestaande
`promotion_batches`-tabel (Epic 13).

## Testtelling
- Web (nieuw): 18 tests over 6 bestanden — allemaal groen.
- API (nieuw): 3 tests toegevoegd aan `flywheel.routes.test.ts` — bestand 7/7 groen.
