# Story 20.3: Mobiele crop-flow in de review-deck — tekenen zonder swipe-conflict

Status: review

<!-- BUGFIX (frontend). Gemeld door Friso 2026-07-16: "De mobile version is niet
     aangepast met de verbeterde specs voor croppen e.d." Diagnose: de deck is op
     desktop en mobiel DEZELFDE component (alle 12.14/12.17/12.19/12.20-verbeteringen
     zitten er dus in), maar de swipe-gebaren (veeg rechts = ECHT, links = VALS) op
     het kaartje sluiten de teken-/zoom-zones (ImageStage) NIET uit. Op touch vuurt
     een teken-gebaar (pointer events op de stage) óók de touch-handlers van het
     kaartje af: een horizontaal getekend kader > 70px veegt de kaart weg als
     BESLISSING, en elke teken-beweging sleept de kaart visueel mee. Op desktop
     onzichtbaar (muis vuurt geen touch-events) — precies waarom dit als
     "mobiel loopt achter" wordt ervaren. -->

## Story

Als beoordelaar op een telefoon/tablet
wil ik in de review-deck een kader kunnen tekenen (op de uitsnede én in de context-weergave) zonder dat het kaartje meebeweegt of per ongeluk als goedgekeurd/afgewezen wordt weggeveegd,
zodat de crop-verbeterflows (12.14/12.17/12.19) op mobiel net zo betrouwbaar zijn als op desktop.

## Acceptatiecriteria

1. **AC1 — geen swipe vanuit de teken-zone.** Een touch-gebaar dat start binnen een ImageStage (uitsnede-stage of context-stage) triggert nooit een swipe-beslissing en sleept het kaartje niet mee — ongeacht richting of afstand van het gebaar.
2. **AC2 — swipe buiten de teken-zone blijft werken.** Het bestaande veeg-gedrag (>70px horizontaal → ECHT/VALS; kleiner of verticaal → terugveren) blijft byte-gelijk voor gebaren die buiten de stages starten; sneltoetsen en knoppen onaangetast.
3. **AC3 — touch-passende hint.** Op aanraakapparaten (`pointer: coarse`) tonen de bedieningshints touch-taal (vinger-slepen, dubbeltik) i.p.v. muis-/toetsenbordtaal (dubbelklik, spatie+slepen); op desktop ongewijzigd.
4. **AC4 — tests.** RED→GREEN op de swipe-vs-teken-conflictscenario's + regressie; volledige web-suite groen; tsc 0.

## Dev Notes

- Kern: markeer de ImageStage-wrapper met een stabiel attribuut (`data-image-stage`) en laat de deck-touch-handlers gebaren die daar starten volledig negeren (`closest('[data-image-stage]')` in `onTouchStart` → geen `touchStart.current`, dus ook geen drag/beslissing).
- ImageStage gebruikt al pointer-events + `touchAction: 'none'` — tekenen zelf werkt op touch; het conflict zit uitsluitend in de bubbelende touch-events naar het kaartje.
- `pointer: coarse`-detectie defensief (`window.matchMedia?.`) — jsdom heeft geen matchMedia.

## Change Log

- 2026-07-16: aangemaakt + diagnose bevestigd op de code (touch-handlers regel ~630/837 MobileReviewDeck.tsx zonder zone-uitsluiting; ImageStage pointer-based met touchAction none).
- 2026-07-16: geïmplementeerd (ATDD 4 RED→GREEN: zone-marker, zone-uitsluiting, regressie-swipe, touch-hints). Adversariële review verdict FAIL → alle bevindingen verwerkt: H1 multi-touch her-bewapening (tweede vinger buiten de stage zette de swipe weer aan op de coördinaten van de tekenende vinger → `e.touches.length !== 1`-guard), M2 stale drag (kaart bleef scheef met accept-tint → `setDrag(0)` in de ignore-tak), L3 hint/bevestig-zone onder de afbeelding viel buiten de marker (→ marker ook op de buitencontainer). +3 regressietests (7/7). Review bevestigde verder: geen andere touch-conflicten in de app (grep), clear-knop/zone-dekking correct, isCoarsePointer SSR/jsdom-veilig. Gates: web-vitest 169 passed/0 failed, tsc 0. Deploy permission-gated.
