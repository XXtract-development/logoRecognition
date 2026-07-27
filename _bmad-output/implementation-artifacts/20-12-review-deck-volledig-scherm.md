# Story 20.12: Review-deck moet het artwork paginabreed kunnen tonen

Status: ready-for-dev

<!-- Aanleiding: Friso, 2026-07-27, tijdens een beoordeelronde van 129 kandidaten.
Het artwork is op een breed scherm onnodig klein; het keurmerk zoeken kost daardoor
extra zoom-acties per item. -->

## Story

Als **reviewer die honderden kandidaten per sessie beoordeelt**
wil ik **het artwork paginabreed/volledig kunnen zien**
zodat **ik het keurmerk in één oogopslag kan controleren in plaats van per item te moeten inzoomen**.

## Waarom dit meer is dan cosmetiek

Bij een wachtrij van 129 items telt elke extra handeling per item op. Een kleine weergave dwingt tot dubbelklikken/zoomen om te zien óf het kader om het juiste logo zit — precies de beoordeling die de reviewer moet maken. Sneller kunnen zien betekent ook betrouwbaarder oordelen: een te klein beeld nodigt uit tot "lijkt goed, accepteren".

## Huidige begrenzingen (gemeten in de code)

| Waar | Regel | Effect |
|---|---|---|
| `apps/web/src/components/review/ImageStage.tsx` | `:274` en `:288` — `maxHeight: '64vh'` (op zowel de container als de `<img>`) | beeld gebruikt max 64% van de schermhoogte |
| `apps/web/src/pages/ArtworkReviewPage.tsx` | `:261` — `maxWidth: isMobile ? '100%' : 880` | deck is op desktop nooit breder dan 880 px |

Op een breed scherm blijft daardoor links en rechts veel ruimte ongebruikt (zie schermafbeelding: het artwork beslaat ruwweg een derde van de vensterbreedte).

Bestaand gedrag dat NIET verloren mag gaan:
- dubbelklik/dubbeltik = zoom, slepen = pannen (`ImageStage`);
- slepen tekent een kader wanneer `canDraw` aan staat (annotatie-pad, Story 12.17/20.3);
- "Bekijk in context" toont het volledige bronartwork met het voorgestelde kader;
- de swipe-gebaren en sneltoetsen (A/R/L, pijltjes) van het deck.

## Afbakening

- Alleen de weergavegrootte in `ImageStage` + de deck-containerbreedte in `ArtworkReviewPage`. Geen wijziging aan de beoordeel-logica, de endpoints of de crop-verwerking.
- **Mobiel gedrag blijft zoals het is** — daar is `maxWidth` al 100% en is 64vh juist prettig omdat de knoppen in beeld moeten blijven.

## Acceptatiecriteria

1. **Paginabrede weergave op desktop.** Given een reviewer op een scherm ≥ 1200 px breed, when het deck een artwork toont, then benut het beeld de beschikbare breedte (containerlimiet omhoog van 880 px naar minimaal ~1400 px of een percentage van het venster) en is het artwork merkbaar groter dan nu, zonder horizontale paginascroll.
2. **Hogere weergave, knoppen blijven bereikbaar.** Given dezelfde reviewer, then mag het beeld hoger dan 64vh (richtwaarde ~80vh), **mits** de knoppen "Wijs af"/"Accepteer" zonder scrollen bereikbaar blijven — die zijn de kern van de werkstroom. Toon dit aan op een gangbare hoogte (bv. 900 px viewport).
3. **Schakelbaar, met geheugen.** Given de reviewer wil wisselen, then is er een expliciete schakelaar tussen "normaal" en "volledig scherm/paginabreed", en **onthoudt de app die keuze** over items én sessies heen (localStorage). *Reden: bij 129 items wil je die keuze één keer maken, niet per item. Vergelijkbaar met de filter-valkuil uit de review-app: een instelling die telkens terugspringt kost meer dan hij oplevert.*
4. **Alle bestaande interacties blijven werken in beide standen**: dubbelklik-zoom, pannen, kader tekenen (`canDraw`), "Bekijk in context", swipe en de sneltoetsen A/R/L en pijltjes. Aantoonbaar met tests op de bestaande deck-suites.
5. **Mobiel ongewijzigd.** Given een viewport ≤ 768 px, then is het gedrag byte-gelijk aan nu (`maxWidth: '100%'`, hoogte zo dat de actieknoppen in beeld blijven).
6. **Geen regressie.** De bestaande suites rond het deck (`MobileReviewDeck*.test.tsx`, `ImageStage.test.tsx`, `ArtworkReviewPage.test.tsx`) blijven groen.

## Tasks / Subtasks

- [ ] 1. `ImageStage`: `maxHeight` instelbaar maken via een prop i.p.v. de vaste `64vh` op twee plekken (AC1/AC2).
- [ ] 2. `ArtworkReviewPage`: de `maxWidth: 880`-limiet verruimen/afhankelijk maken van de stand (AC1).
- [ ] 3. Schakelaar in de deck-koptekst + opslag in localStorage (AC3).
- [ ] 4. Controleren dat de actieknoppen bij de grootste stand in beeld blijven op ~900 px hoogte (AC2).
- [ ] 5. Tests: schakelaar wisselt en onthoudt; interacties werken in beide standen; mobiel ongewijzigd (AC3/AC4/AC5).

## Dev Notes

- `ImageStage` zet `maxHeight: '64vh'` **twee keer** (container `:274` én `<img>` `:288`). Beide moeten mee, anders wordt de ene door de andere begrensd — een klassieke halve fix.
- De `transform: scale()` van de zoom werkt op de `<img>`; bij een grotere basis blijft dat werken, maar controleer of `transformOrigin: center center` bij een pagina­brede weergave nog prettig pant (mogelijk moet de pan-begrenzing mee-schalen).
- De deck-container op `:261` gebruikt `isMobile` (`max-width: 768px`) — die hoeft niet te wijzigen, alleen de desktop-tak.
- **Waarom een schakelaar en niet gewoon altijd groot:** bij het annoteren (kader tekenen) is een compacter beeld soms juist handiger omdat je het hele pak in één keer ziet. De reviewer weet zelf wat hij nodig heeft; dwing het niet af.
- [Source: apps/web/src/components/review/ImageStage.tsx:274,288; apps/web/src/pages/ArtworkReviewPage.tsx:261; apps/web/src/components/review/MobileReviewDeck.tsx]

## Change Log
- 2026-07-27: Story aangemaakt op verzoek van Friso tijdens de beoordeelronde van 129 kandidaten.
