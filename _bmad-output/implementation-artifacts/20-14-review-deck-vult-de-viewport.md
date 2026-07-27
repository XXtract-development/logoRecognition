# Story 20.14: Review-deck vult de beschikbare schermhoogte écht

Status: review

<!-- Aanleiding: Friso, 2026-07-27, direct na uitrol van 20.12: "Het is niet
fullscreen. Alleen breder." Story 20.12 AC2 is dus NIET gehaald; dit is een
hersteldstory, geen nieuwe wens. -->

## Story

Als **reviewer die honderden kandidaten per sessie beoordeelt**
wil ik **dat het artwork de volle beschikbare schermhoogte gebruikt**
zodat **ik het keurmerk zie zonder te zoomen — wat 20.12 beloofde maar niet leverde**.

## Wat er misging in 20.12

20.12 verruimde de breedte (880 → 1600 px, AC1 gehaald) en maakte `maxHeight` in
`ImageStage` instelbaar. Maar de hoogte veranderde niet, en het beeld wordt zelfs
zichtbaar **afgekapt** (schermafbeelding Friso: de regel "wit gedrukt worden. Indien
mogelijk" valt weg onder de rand).

Oorzaak: er is een **derde** hoogtebegrenzing, één niveau boven `ImageStage`, die
20.12 over het hoofd zag — `apps/web/src/components/review/MobileReviewDeck.tsx:1144-1156`:

```ts
height: '48vh',
maxHeight: 440,
overflow: 'hidden',
```

De `maxHeight={DECK_MAX_IMAGE_HEIGHT}` die 20.12 aan `ImageStage` meegeeft
(`calc(100vh - 260px)`) is daardoor een dode letter: de ouder is 440 px hoog met
`overflow: hidden`, dus alles daarboven wordt weggeknipt. Dit is exact de "klassieke
halve fix" waar 20.12's eigen Dev Notes voor waarschuwden — de waarschuwing keek
alleen naar de twee plekken *binnen* `ImageStage`, niet naar de wrapper erboven.

**Les voor deze story:** niet de wrapper vervangen door alweer een vast getal. Elk
vast getal is de volgende 440.

## Tweede oorzaak: de vaste opmaak boven het deck eet de hoogte op

Alleen het 440-dak weghalen levert weinig op. Gemeten op de schermafbeelding van
Friso staat de bovenkant van het beeld pas op ~365 px, door: paginatitel +
beschrijvende alinea (~110 px), filterbalk, de teller `1/117 · 0 ✓ 0 ✗` en de
sneltoetsregel. Onder het beeld staat nog ~140 px aan knoppen. Zonder die alinea
te laten vervallen blijft de winst ~75 px — merkbaar te weinig voor "fullscreen".

De beschrijvende alinea is introductietekst; een reviewer die aan zijn 117e item
zit heeft die niet elke sessie nodig.

## Afbakening

- Alleen weergave/afmetingen: de wrapper in `MobileReviewDeck`, de doorgegeven
  `maxHeight`, en de paginakop in `ArtworkReviewPage`.
- Geen wijziging aan beoordeel-logica, endpoints, crop-verwerking of herkenning.
- **Mobiel blijft exact zoals nu** (`48vh` / `440`): daar moeten de knoppen in beeld
  blijven op een klein scherm, en 20.12 AC5 legde dat al vast.
- Geen schakelaar (besluit Friso bij 20.12 AC3 — blijft staan).

## Acceptatiecriteria

1. **Het 440-dak is weg op desktop.** Given een reviewer op desktop, when het deck
   een artwork toont, then begrenst geen enkele voorouder van `ImageStage` de hoogte
   tot een vaste pixelwaarde; het beeld wordt niet meer afgekapt.
2. **Het beeld vult de restruimte, zonder magisch getal.** Given een viewport van
   willekeurige hoogte, then wordt de hoogte van het beeldvenster *gemeten* bepaald
   (afstand van de bovenkant van de kaart tot de onderkant van het venster), niet
   met een hardgecodeerde aftrekking. Bij het wijzigen van de venstergrootte past
   het beeld zich aan.
3. **Aantoonbaar groter.** Given een viewport van 1000 px hoog op desktop, then is
   het beeldvenster minimaal **600 px** hoog (nu: 440). Meetbaar in een test.
4. **Knoppen blijven zonder scrollen bereikbaar.** Given dezelfde viewport, then
   staan "Wijs af" en "Accepteer" volledig binnen het venster. Dit is de harde grens:
   liever een kleiner beeld dan een knop onder de vouw.
5. **De introductie-alinea verdwijnt op desktop zodra er items zijn.** Given een
   reviewer met ≥ 1 openstaand item op desktop, then wordt de beschrijvende alinea
   niet getoond (die is onboarding, geen werkinformatie). Given een lege wachtrij,
   then blijft de uitleg staan.
6. **Mobiel ongewijzigd.** Given een viewport ≤ 768 px, then is het gedrag gelijk
   aan nu: wrapper `48vh` / `maxHeight 440`, en de alinea blijft staan.
7. **Alle bestaande interacties blijven werken**: dubbelklik-zoom, pannen, kader
   tekenen (`canDraw`), "Bekijk in context", swipe, sneltoetsen A/R/L en pijltjes.
8. **Geen regressie.** `MobileReviewDeck*.test.tsx`, `ImageStage*.test.tsx` (incl.
   `ImageStage.maxheight-20-12.test.tsx`) en `ArtworkReviewPage.test.tsx` blijven groen.

## Tasks / Subtasks

- [x] 1. `MobileReviewDeck`: prop `fillViewport` toevoegen; bij `true` de kaart als
      flex-kolom met gemeten hoogte, wrapper `flex: 1; minHeight: 0` i.p.v.
      `48vh`/`440` (AC1/AC2/AC4/AC6).
- [x] 2. Hoogte meten via ref + `resize`-listener; `ImageStage` krijgt `maxHeight: '100%'`
      in deze stand (AC2).
- [x] 3. `ArtworkReviewPage`: `fillViewport={!isMobile}` doorgeven en de alinea
      verbergen op desktop zodra `items.length > 0` (AC5).
- [x] 4. Tests: gemeten hoogte ≥ 600 bij viewport 1000 (AC3), knoppen binnen beeld
      (AC4), mobiel byte-gelijk (AC6), interacties intact (AC7).

## Dev Notes

- De wrapper op `:1144` omsluit **beide** `ImageStage`-takken (crop én "Bekijk in
  context"). Eén wijziging dekt allebei — maar test ze allebei, want de contexttak
  is de tak waarin kaders getekend worden.
- `DECK_MAX_IMAGE_HEIGHT = 'calc(100vh - 260px)'` (`:63`) was zelf al een magisch
  getal en wordt in de fill-stand vervangen door `'100%'`; laat 'm staan voor de
  mobiele tak.
- De deck kent geen `isMobile`; `isCoarsePointer()` is géén goede vervanger
  (touchscreen-laptops). Daarom een expliciete prop vanuit de pagina, die `isMobile`
  al berekent.
- `overflow: 'hidden'` op de wrapper mag blijven: die knipt niets meer weg zodra de
  hoogte klopt, en beschermt tegen uitschieters tijdens zoomen.
- Meet de kaartpositie met `getBoundingClientRect().top` in een `useLayoutEffect`;
  herbereken op `resize`. In jsdom is `innerHeight` instelbaar, dus AC3/AC4 zijn
  testbaar zonder browser.
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:63,1144-1156,1167-1203;
  apps/web/src/pages/ArtworkReviewPage.tsx:144,261; schermafbeelding Friso 2026-07-27]

## Verificatie

- `MobileReviewDeck.fillviewport-20-14.test.tsx` — 6 tests groen.
- Regressie: `src/components/review/` + `ArtworkReviewPage.test.tsx` → **69 tests, 10 bestanden, groen** (AC8).
- **Eerlijke grens van de unit-tests (AC3):** jsdom voert geen opmaak uit, dus de
  werkelijk gerenderde hoogte van het beeldvenster is daar niet meetbaar. De tests
  leggen het *mechanisme* vast (gemeten kaarthoogte 784 px bij een venster van
  1000 px, `flex: 1` + `minHeight: 0` op het beeldvenster, geen enkel vast dak meer).
  De visuele bevestiging dat het artwork niet langer wordt afgekapt gebeurt op ACC
  na uitrol — dat is de enige plek waar dit écht te zien is.

## Change Log
- 2026-07-27: Story aangemaakt na melding Friso dat 20.12 alleen breedte opleverde.
