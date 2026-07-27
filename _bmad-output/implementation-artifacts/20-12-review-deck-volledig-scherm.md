# Story 20.12: Review-deck moet het artwork paginabreed kunnen tonen

Status: review

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
3. **Altijd paginabreed — geen schakelaar** (besluit Friso, 2026-07-27). Given een reviewer op desktop, then is de grote weergave de enige stand; er komt geen knop en geen voorkeur-opslag. *Overwogen en verworpen: een schakelaar met geheugen. Bij het tekenen van een kader is een compacter beeld soms handiger, maar dat weegt niet op tegen een extra klik per sessie en een instelling die kan terugspringen — precies de valkuil van het review-filter. Blijkt het compacte beeld bij annoteren toch nodig, dan is dat een aparte story met een reden.*
4. **Alle bestaande interacties blijven werken **: dubbelklik-zoom, pannen, kader tekenen (`canDraw`), "Bekijk in context", swipe en de sneltoetsen A/R/L en pijltjes. Aantoonbaar met tests op de bestaande deck-suites.
5. **Mobiel ongewijzigd.** Given een viewport ≤ 768 px, then is het gedrag byte-gelijk aan nu (`maxWidth: '100%'`, hoogte zo dat de actieknoppen in beeld blijven).
6. **Geen regressie.** De bestaande suites rond het deck (`MobileReviewDeck*.test.tsx`, `ImageStage.test.tsx`, `ArtworkReviewPage.test.tsx`) blijven groen.

## Tasks / Subtasks

- [x] 1. `ImageStage`: `maxHeight` instelbaar maken via een prop i.p.v. de vaste `64vh` op twee plekken (AC1/AC2).
- [x] 2. `ArtworkReviewPage`: de `maxWidth: 880`-limiet verruimen/afhankelijk maken van de stand (AC1).
- [x] 4. Controleren dat de actieknoppen bij de grootste stand in beeld blijven op ~900 px hoogte (AC2).
- [x] 3. Tests: interacties blijven werken bij de grotere weergave; mobiel ongewijzigd (AC4/AC5).

## Dev Notes

- `ImageStage` zet `maxHeight: '64vh'` **twee keer** (container `:274` én `<img>` `:288`). Beide moeten mee, anders wordt de ene door de andere begrensd — een klassieke halve fix.
- De `transform: scale()` van de zoom werkt op de `<img>`; bij een grotere basis blijft dat werken, maar controleer of `transformOrigin: center center` bij een pagina­brede weergave nog prettig pant (mogelijk moet de pan-begrenzing mee-schalen).
- De deck-container op `:261` gebruikt `isMobile` (`max-width: 768px`) — die hoeft niet te wijzigen, alleen de desktop-tak.
- **Geen schakelaar** (besluit 2026-07-27): altijd groot. Zie AC3 voor de afweging.
- [Source: apps/web/src/components/review/ImageStage.tsx:274,288; apps/web/src/pages/ArtworkReviewPage.tsx:261; apps/web/src/components/review/MobileReviewDeck.tsx]

### Dev Agent Record — implementatie 2026-07-27
- `ImageStage` kreeg een `maxHeight`-prop met **default `64vh`** — de historische waarde — zodat andere gebruikers van de component onaangeroerd blijven. Het deck geeft een ruimere waarde mee.
- **Beide** vaste `64vh`-waarden vervangen (container én `<img>`). Dat was geen detail: laat je er één staan, dan klemt die de andere alsnog terug en verandert er visueel niets. Er staat een test op die precies dat afvangt.
- Deck-hoogte: `calc(100vh - 260px)`, bewust géén vh-breuk. De koptekst en de knoppen "Wijs af"/"Accepteer" kosten een VAST aantal pixels; met `80vh` zou het beeld op een laag scherm de knoppen wegduwen en op een hoog scherm ruimte laten liggen. Zo blijft de chrome-ruimte constant en schaalt de rest mee.
- Paginabreedte: `880` → `1600` op desktop; de mobiele tak (`isMobile`) is onaangeroerd (AC5).
- **Geen schakelaar** (besluit Friso): altijd groot. Zie AC3 voor de verworpen alternatieven.
- **RED-bewijs**: zet de `<img>` terug op de vaste `64vh` — de "beide begrenzingen"-test wordt rood, de andere drie blijven groen. Daarna hersteld.
- **Verificatie**: tsc 0. Nieuwe suite 4/4; deck- + reviewpagina-suites **63/63**; volledige web-suite **188 passed / 0 failed**.
- **Resteert**: visuele controle op ACC na deploy (AC1/AC2 in de praktijk).

## Change Log
- 2026-07-27: Geïmplementeerd; status → review.
- 2026-07-27: AC3 gewijzigd na besluit Friso — altijd paginabreed, geen schakelaar/voorkeur-opslag.
- 2026-07-27: Story aangemaakt op verzoek van Friso tijdens de beoordeelronde van 129 kandidaten.
