# Adversariële CODE-review — Story 20.12 (review-deck paginabreed)

```yaml
reviewed_commit: 6ec4a87
baseline: a114ea4
branch: acc (oorspronkelijk epic/20-12-paginabreed)
scope: apps/web/src/components/review/ImageStage.tsx
       + apps/web/src/components/review/MobileReviewDeck.tsx
       + apps/web/src/pages/ArtworkReviewPage.tsx
       + apps/web/src/components/review/ImageStage.maxheight-20-12.test.tsx
verdict: FAIL
severity_count: { high: 2, medium: 3, low: 5 }
```

De breedte-helft van de story is echt geleverd: `880 → 1600` staat er, en de deck-suites
zijn groen (zelf gedraaid, 63/63). De hoogte-helft niet. `maxHeight` is netjes door
`ImageStage` geregen, maar één niveau hóger klemt de ouder het beeld op `48vh` / max
`440px` met `overflow: hidden` — de prop is een dode letter. Het beeld werd daardoor niet
hoger maar wél méér afgekapt. Ernstiger dan de misser zelf: de Dev Agent Record en
`versions.md` melden het tegenovergestelde ("vrijwel de hele schermhoogte", "knoppen
blijven altijd zichtbaar"), en de vier nieuwe tests blijven groen wanneer je de héle
productiewijziging terugdraait — gemeten, niet beredeneerd.

---

## Bevindingen

### H1 — AC2 is niet gehaald: een derde hoogtebegrenzing maakt de prop een dode letter
`apps/web/src/components/review/MobileReviewDeck.tsx:1144-1156` (`height: '48vh'` `:1147`,
`maxHeight: 440` `:1148`, `overflow: 'hidden'`), i.c.m. `:63`, `:1169`, `:1203` en
`apps/web/src/components/review/ImageStage.tsx:282,296` — **high**

De story-analyse ("Huidige begrenzingen (gemeten in de code)") noemt twee begrenzingen:
`ImageStage`-container en `<img>`. Beide zijn correct vervangen. Maar de directe ouder van
`ImageStage` — het beeldvenster in het deck — is een `div` met een **vaste** hoogte:

```ts
width: '100%',
height: '48vh',
maxHeight: 440,
...
overflow: 'hidden',
```

Bij een venster van 900 px is dat `min(432, 440) = 432 px`. De oude `ImageStage`-grens was
`64vh = 576 px`, de nieuwe `calc(100vh - 260px) = 640 px`. Beide liggen bóven het
432-px-dak, dus de gerenderde hoogte verandert **niet**. Wat wél verandert: de `<img>` mag
nu 640 px hoog worden in een venster van 432 px met `overflow: hidden` en
`alignItems: 'center'` — het beeld wordt dus over een grótere afstand weggeknipt dan
vóór deze commit. Voor een 4:3-artwork van 1200×900 (na server-downscale): vóór
768×576 → 432 px zichtbaar (75%), ná 853×640 → 432 px zichtbaar (68%). De reviewer krijgt
een groter maar sterker afgekapt beeld — precies het omgekeerde van het storydoel.

Onafhankelijke bevestiging (twee routes):
1. `git show 23592d4` (story 20.14, 2 uur later dezelfde dag): *"Story 20.12 only widened
   the deck (880 -> 1600px); the image height never changed and the artwork was visibly
   clipped. Root cause: a third height constraint one level ABOVE ImageStage that 20.12
   missed."*
2. `_bmad-output/implementation-artifacts/20-14-review-deck-vult-de-viewport.md:5-35` —
   melding Friso direct na uitrol: *"Het is niet fullscreen. Alleen breder."*, met de regel
   die onder de rand wegvalt.

Verzwarend, en het echte bezwaar bij deze commit: de story meldt dit **niet**. De Dev Agent
Record (`20-12-...md:66`) presenteert `calc(100vh - 260px)` als de werkende oplossing, taak
4 (knoppen in beeld op ~900 px) staat afgevinkt, en `versions.md` belooft de eindgebruiker
"vrijwel de hele schermhoogte". Alleen "visuele controle op ACC" staat als restpunt — dat
is geen voorbehoud bij AC2, dat is een afvinkvakje. Het Dev-Notes-waarschuwingskader
("een klassieke halve fix") keek naar de twee plekken *binnen* `ImageStage` en niet naar de
wrapper erboven; de fix is daardoor exact de halve fix waar de story voor waarschuwde.

**Wat moet wijzigen:** het 440-dak weg (of gemeten), en de AC2-claim in de story +
`versions.md` corrigeren zolang dat niet aantoonbaar is. De code-kant hiervan is inmiddels
gerepareerd in `23592d4` (20.14); de bookkeeping-kant van 20.12 niet.

### H2 — de vier nieuwe tests blijven groen als je de héle wijziging terugdraait
`apps/web/src/components/review/ImageStage.maxheight-20-12.test.tsx:14-52` — **high**

Alle vier tests renderen `ImageStage` **direct** met een literal prop. Geen enkele test
raakt `MobileReviewDeck` of `ArtworkReviewPage` — dus geen enkele test raakt de twee
regels die het gedrag daadwerkelijk veranderen (`MobileReviewDeck.tsx:63` en
`ArtworkReviewPage.tsx:261`).

Mutatiebewijs (gedraaid in een losse worktree op `6ec4a87`, `node_modules` gesymlinkt):
`DECK_MAX_IMAGE_HEIGHT` terug naar `'64vh'` **en** `maxWidth` terug naar `880` —
oftewel de volledige gedragswijziging weg, alleen de prop-infrastructuur blijft:

```
 ✓ src/components/review/... (9 bestanden)
   Test Files  9 passed (9)
        Tests  63 passed (63)
```

63/63 groen, inclusief de vier nieuwe. De suite kan de fix dus niet bewaken. Het
"RED-bewijs" in de story (`:69` — `<img>` terug op vaste `64vh` → test 3 rood) is echt,
maar bewijst alleen dat de prop tot in de `<img>` doorloopt; niet dat het deck hem
gebruikt, niet dat het beeld groter wordt, niet dat mobiel gelijk blijft.

Wat structureel ontbreekt: een test op de waarde die het deck doorgeeft, een test op de
paginabreedte (AC1), een test op mobiele pariteit (AC5), en — het belangrijkste — een test
die de gerenderde/effectieve hoogte raakt in plaats van een CSS-string. Dat laatste is in
jsdom beperkt mogelijk (geen layout), maar dan is de eerlijke conclusie dat AC2 hier
niet met unit-tests aan te tonen is; 20.14 schrijft die grens wél expliciet op
(`20-14-...md:121-126`), 20.12 niet.

### M1 — de 260 px chrome-reservering is een gok, en aantoonbaar te klein
`apps/web/src/components/review/MobileReviewDeck.tsx:63`, i.c.m. de kaartstructuur
`:993-1238` (kaart) en `:1240` (knoppenrij) — **medium**

`calc(100vh - 260px)` reserveert 260 px voor koptekst + actieknoppen. De redenering in de
commentaar (vaste pixels i.p.v. een vh-breuk) is goed; het getal is niet gemeten. Op de
schermafbeelding van dezelfde dag staat de bovenkant van het beeld op ~365 px (paginatitel
+ introductie-alinea ~110 px, filterbalk, teller, sneltoetsregel) en staat er ~140 px aan
knoppen onder het beeld — samen ~505 px chrome
(`_bmad-output/implementation-artifacts/20-14-review-deck-vult-de-viewport.md:42-46`).
Met 260 px gereserveerd zou het beeld op een venster van 900 px de knoppen dus onder de
vouw hebben geduwd. Dát het niet gebeurde, komt door het 440-px-dak uit **H1** — de
begrenzing die de story niet kende. AC2's harde eis ("knoppen blijven zonder scrollen
bereikbaar") is hier dus niet *ontworpen* maar per ongeluk overleefd, en taak 4 is
afgevinkt zonder enige vastlegging van die controle.

Zelf nagelopen op déze commit (niet overgenomen uit een andere review): de kaart-`div`
opent op `:993` en sluit op `:1238`; de knoppenrij ("Wijs af"/"Accepteer",
`data-testid="deck-reject"` `:1258` en `deck-accept` `:1275`) begint op `:1240` en is dus
een **zusje** van de kaart, geen kind. Er is geen enkel mechanisme dat die rij binnen het
venster houdt: de knoppen staan simpelweg in de normale flow ónder de kaart, dus elke
pixel die het beeld hoger wordt duwt ze even ver naar beneden en de pagina gaat scrollen.
`calc(100vh - 260px)` reserveert de chrome dus niet, het *gokt* erop — de vorm van de
formule kan de knoppen per constructie niet garanderen, wat de constante ook is.

`versions.md` maakt er vervolgens een onvoorwaardelijke belofte van: *"De knoppen 'Wijs af'
en 'Accepteer' blijven daarbij altijd zichtbaar zonder te scrollen."* Dat is niet
onderbouwd — noch door een test, noch door een meting.

**Wat moet wijzigen:** meten in plaats van reserveren (20.14 doet dit), of de belofte in
`versions.md` afzwakken tot wat aantoonbaar is.

### M2 — AC1 geldt niet voor "Bekijk in context": de bron is server-side op 900 px gekapt
`apps/api/src/api/v1/artwork-pipeline.ts:1017` (`const TARGET = 900`) i.c.m.
`apps/web/src/components/review/ImageStage.tsx:295` (`maxWidth: '100%'`, géén `width`) — **medium**

De `<img>` heeft alleen `maxWidth: '100%'` en `maxHeight`, nooit een `width`/`height`. Een
`<img>` schaalt daarmee **nooit op** boven zijn eigen resolutie; de containerbreedte is een
plafond, geen doel. Voor de standaardtak is dat prima: het `/marked`-endpoint levert
`TARGET = 1600` op de langste zijde (`artwork-pipeline.ts:933`), dus 880 → 1600 levert daar
echte winst. Maar de contextfragment-tak wordt server-side naar `TARGET = 900` verkleind.
Daar levert de verbreding van 880 naar 1600 dus maximaal ~20 px op — en dat is precies de
tak waarin de reviewer een kader tekent en waarin AC1's "in één oogopslag zien of het kader
om het juiste logo zit" moet gebeuren.

De story-afbakening ("geen wijziging aan de crop-verwerking") sluit een grotere
fragmentresolutie uit, maar dan is AC1 voor deze tak niet haalbaar en had dat als
voorbehoud in de story moeten staan. Nu claimt AC1 het onvoorwaardelijk voor "het deck".

### M3 — AC5 is niet gehaald in de code: geen `isMobile`-guard op de nieuwe hoogte
`apps/web/src/components/review/MobileReviewDeck.tsx:1169` en `:1203` — **medium**

AC5 eist dat mobiel "byte-gelijk aan nu" blijft, de afbakening bevestigt dat 64vh daar
juist gewenst is omdat de knoppen in beeld moeten blijven. `DECK_MAX_IMAGE_HEIGHT` wordt
op **beide** call sites onvoorwaardelijk doorgegeven; het deck kent geen `isMobile`
(geverifieerd: `grep -n "isMobile\|matchMedia"` over het bestand op deze commit geeft
alleen `isCoarsePointer()` op `:110-112`, dat hier niet gebruikt wordt). De mobiele
`ImageStage` gaat dus van `64vh` naar `calc(100vh - 260px)` — op een telefoon met
`100vh = 700px` is dat 448 px → 440 px, op een grote telefoon of iPad-portret (≤768 px
breed, dus `isMobile`) juist méér.

Dat dit visueel niet uit de hand loopt, komt opnieuw door het 440-dak uit **H1**: de ouder
klemt beide waarden weg. Dat is toeval, geen ontwerp — de story wist niet van dat dak.
Zodra dat dak weggaat (en dat gebeurt in 20.14) is het ontbreken van de guard wel echt
zichtbaar; 20.14 moest daarom een expliciete `fillViewport`-prop introduceren om mobiel
alsnog te sparen. Bovendien is `100vh` op mobiele browsers berucht groter dan het
zichtbare venster (URL-balk), waardoor een `calc(100vh - …)` daar per definitie te ruim is.

**Wat moet wijzigen:** de mobiele tak expliciet op `64vh` houden, of AC5 herschrijven naar
wat er werkelijk gebeurt.

### L1 — de default `64vh` beschermt gebruikers die niet bestaan
`apps/web/src/components/review/ImageStage.tsx:44-48,76` — **low**. De comment en test 1
motiveren de default met "zodat ANDERE gebruikers van deze component ongemoeid blijven".
`grep -rl ImageStage apps/web/src` geeft precies één productie-consument: `MobileReviewDeck`
(de rest zijn testbestanden). Geen fout, maar de prop, de default en een van de vier tests
dekken een niet-bestaand risico — terwijl de echte risico's (M3, AC1-breedte) ongetest zijn.

### L2 — test 4 is een tautologie
`apps/web/src/components/review/ImageStage.maxheight-20-12.test.tsx:43-51` — **low**. De
test geeft `"calc(100vh - 260px)"` mee en assert dat de uitkomst `calc(` en `px` bevat. Er
is geen ander mogelijk resultaat dan de eigen invoer; de test kan nooit rood worden door een
gedragswijziging. De naam ("de hoogte is gereserveerd in pixels, niet als percentage")
suggereert een beleidscontrole op het deck, maar het deck komt in de test niet voor.

### L3 — de Dev-Notes-vraag over pan-begrenzing is niet beantwoord
`apps/web/src/components/review/ImageStage.tsx:151,193` — **low**. Dev Notes (`:58`) vragen
expliciet te controleren of de pan-begrenzing moet mee-schalen bij een groter basisbeeld.
`setPan` heeft geen enkele clamp (alleen `clamp01` op de kader-fracties, `:53`), dus bij een
groter beeld kun je verder wegpannen voordat je iets in beeld terugkrijgt. Bestaand gedrag,
niet verslechterd — maar de gestelde vraag is niet beantwoord en niet als open punt gemeld.

### L4 — de tekenhint en de bevestig-knop delen het 440-px-venster met het beeld
`apps/web/src/components/review/ImageStage.tsx:250-256` — **low**. De buitenste
`ImageStage`-div is een flex-kolom met het beeld én de hint-tekst ("Sleep hier een kader om
het keurmerk te markeren") eronder, en die kolom staat volledig binnen het venster met
`overflow: hidden`. Een hoger toegestaan beeld duwt de hint verder buiten die 440 px, dus
de teken-instructie verdwijnt eerder uit beeld. AC4 noemt de interacties, niet hun uitleg.

### L5 — 1600 is opnieuw een magisch getal, en de kaartinhoud rekt ongeremd mee
`apps/web/src/pages/ArtworkReviewPage.tsx:261` — **low**. AC1 liet "≥ ~1400 px of een
percentage" open; gekozen is een vast getal, dus op een 2560-px-scherm blijft ~940 px
ongebruikt. Daarnaast rekt de hele kaartinhoud mee naar 1600 px zonder eigen leesbreedte:
de koptekst, de hint-teksten en de referentie-rij (`MobileReviewDeck.tsx:1104-1120`) hebben
geen `maxWidth`, waardoor zinnen over de volle 1600 px lopen. Kosmetisch, maar 20.14 noemt
dit soort getallen terecht "elk vast getal is de volgende 440".

---

## Claim-audit per acceptatiecriterium

| AC | Oordeel | Bewijs |
|----|---------|--------|
| **AC1** — paginabrede weergave op desktop, geen horizontale scroll | **gedekt, met voorbehoud** | `ArtworkReviewPage.tsx:261`: `maxWidth: isMobile ? '100%' : 1600` — de 880-limiet is echt weg en 1600 ≥ de gevraagde ~1400. Geen horizontale paginascroll: de container is `block` met `maxWidth` (kapt af op de vensterbreedte) en de `<img>` heeft `maxWidth: '100%'` (`ImageStage.tsx:295`). Voorbehoud: de `<img>` heeft geen `width`, dus hij schaalt nooit op boven de bronresolutie — winst alleen waar de bron breder is dan 880. Standaardtak: bron 1600 (`apps/api/src/api/v1/artwork-pipeline.ts:933`) → echte winst. Contexttak: bron 900 (`:1017`) → ~20 px winst → **M2**. Geen test dekt deze AC. |
| **AC2** — hoger beeld (~80vh), knoppen zonder scrollen bereikbaar | **niet gedekt** | Prop-kant klopt: `ImageStage.tsx:48,76,282,296` — beide `64vh` weg, default behouden. Maar de directe ouder klemt op `48vh`/`maxHeight: 440`/`overflow: hidden` (`MobileReviewDeck.tsx:1147-1149`), boven de oude 576 px én de nieuwe 640 px, dus de gerenderde hoogte verandert niet en het beeld wordt méér afgekapt → **H1**. Bevestigd door `23592d4` en `20-14-...md:5-35`. Knoppen-deel: de 260-px-reservering staat tegenover ~505 px werkelijke chrome (`20-14-...md:42-46`), en de knoppenrij (`:1240`, `deck-reject` `:1258` / `deck-accept` `:1275`) staat als **zusje** ná de kaart (`:993-1238`) in de normale flow — niets houdt hem binnen het venster; de claim overleefde alleen dankzij datzelfde 440-dak → **M1**. Anders dan bij 20.14 is de ouder hier wél van bepaalde hoogte (`48vh`/`440`), dus de klem is echt en de dode letter zit in het dak, niet in een onbepaalde ouderhoogte. |
| **AC3** — altijd paginabreed, geen schakelaar/voorkeur-opslag | **gedekt** | De diff bevat geen knop, geen state, geen `localStorage`: één constante `DECK_MAX_IMAGE_HEIGHT` (`MobileReviewDeck.tsx:63`) en één vaste `maxWidth` (`ArtworkReviewPage.tsx:261`). Volledige diff nagelopen (`git show 6ec4a87` — 5 bestanden, +89/−3 in code). |
| **AC4** — alle bestaande interacties blijven werken | **gedekt, met voorbehoud** | Zelf gedraaid op `6ec4a87`: `src/components/review` + `ArtworkReviewPage.test.tsx` → **9 bestanden, 63 tests groen** (dubbelklik-zoom, pannen, `canDraw`, "Bekijk in context", swipe, sneltoetsen zitten in die suites). Voorbehoud: diezelfde 63 blijven groen ná het terugdraaien van de wijziging (**H2**), dus ze bewijzen "niets gebroken", niet "werkt óók bij de grotere weergave" — de storyclaim "aantoonbaar met tests op de bestaande deck-suites" is daarmee zwakker dan hij klinkt. |
| **AC5** — mobiel byte-gelijk (`maxWidth: '100%'`, hoogte zo dat de knoppen in beeld blijven) | **niet gedekt** | `maxWidth` is inderdaad onaangeroerd voor `isMobile` (`ArtworkReviewPage.tsx:261`). De hoogte niet: `DECK_MAX_IMAGE_HEIGHT` gaat zonder `isMobile`-guard naar beide `ImageStage`-takken (`MobileReviewDeck.tsx:1169`, `:1203`); het deck kent geen `isMobile` → **M3**. Dat het gerenderde resultaat vermoedelijk gelijk blijft, komt door het 440-dak — toeval, niet ontwerp. Geen test dekt mobiele pariteit (`grep -n "64vh\|maxHeight"` over `ImageStage.test.tsx` en `MobileReviewDeck.test.tsx`: 0 treffers). |
| **AC6** — geen regressie in de bestaande deck-suites | **gedekt** | Zelf gedraaid: 63/63 groen op de reviewed commit; de nieuwe suite apart 4/4 groen. De storyclaims "nieuwe suite 4/4" en "deck- + reviewpagina-suites 63/63" kloppen exact. De claim "volledige web-suite 188 passed" is **niet geverifieerd** (niet gedraaid). |

## Wat moet wijzigen vóór PASS

1. **H1** — AC2 eerlijk opschrijven of leveren. Het 440-dak
   (`MobileReviewDeck.tsx:1147-1148`) moet weg; zolang dat niet gebeurd is, mag de Dev Agent
   Record niet suggereren dat `calc(100vh - 260px)` de hoogte oplost, en moet de
   `versions.md`-tekst ("vrijwel de hele schermhoogte") terug. De code-fix bestaat inmiddels
   in `23592d4` (20.14) — dan hoort 20.12 als **deeloplevering (alleen breedte)** afgesloten
   te worden, met AC2 expliciet als niet gehaald en een verwijzing naar 20.14. Nu leest de
   story als "AC1-AC6 gehaald", en dat is niet zo.
2. **H2** — minstens één test die aan de productiewaarde vastzit: op wat het deck doorgeeft
   (`MobileReviewDeck.tsx:63`) en op de paginabreedte (`ArtworkReviewPage.tsx:261`), zodat
   het terugdraaien van de fix rood wordt. Plus de eerlijke aantekening dat de gerenderde
   hoogte in jsdom niet meetbaar is — die staat in 20.14 wél en hier niet.
3. **M1** — de knoppen-belofte onderbouwen (gemeten hoogte, zoals 20.14) of de
   onvoorwaardelijke formulering in `versions.md` afzwakken. Taak 4 afvinken zonder
   vastlegging kan niet blijven staan.
4. **M2** — AC1 voorzien van het voorbehoud dat de contexttak server-side op 900 px staat,
   of die grens meenemen in een vervolgstory. Anders blijft AC1 een claim die voor de
   teken-tak niet waar is.
5. **M3** — expliciete `isMobile`/`fillViewport`-guard zodat de mobiele hoogte echt `64vh`
   blijft, plus een test daarop; of AC5 herschrijven naar het werkelijke gedrag.
6. **L1-L5** — kleine opruiming: de "andere gebruikers"-motivering laten vallen of een
   tweede consument benoemen (L1), test 4 vervangen door een test met een mogelijk rood
   resultaat (L2), het pan-punt uit Dev Notes beantwoorden of als open punt melden (L3), de
   tekenhint niet mee laten wegklippen (L4), en de kaartinhoud een leesbreedte geven (L5).

## Verificatie-aantekening

Wat **gemeten** is, op `6ec4a87` in een losse worktree met gesymlinkte `node_modules`:
de nieuwe suite (4/4 groen), de deck- + reviewpagina-suites (9 bestanden / 63 tests groen),
en de mutatieproef uit **H2** (dezelfde 63 groen ná het terugdraaien van
`DECK_MAX_IMAGE_HEIGHT` naar `'64vh'` én `maxWidth` naar `880`). De worktree is daarna
opgeruimd; er is niets in de repository gewijzigd.

Wat **op de 20.12-broncode zelf** is nagelopen (niet overgenomen uit de zusterreview van
20.14, waar de regelnummers ná die commit gelden): de kaart/knoppen-structuur
(`MobileReviewDeck.tsx:993` open, `:1238` sluit, knoppenrij `:1240`), het ontbreken van een
`isMobile`-tak in het deck, het ontbreken van elke pan-clamp in `ImageStage`, en de
server-side `TARGET`-constanten in `apps/api/src/api/v1/artwork-pipeline.ts`.

Wat **niet** geverifieerd is: de gerenderde pixelhoogte in een echte browser (jsdom doet
geen layout, en er is geen toegang tot ACC in deze sessie) — de hoogte-conclusie in **H1**
is een layout-analyse van `48vh`/`440`/`overflow: hidden` plus twee onafhankelijke externe
bronnen (`23592d4` en de storytekst van 20.14 met Friso's melding), niet een eigen
schermmeting. Ook niet geverifieerd: de storyclaim "volledige web-suite 188 passed / 0
failed" en "tsc 0" (niet gedraaid), en de werkelijke bronresoluties van concrete artworks
op ACC — **M2** leunt op de code-constanten `TARGET = 900` / `TARGET = 1600` in
`apps/api/src/api/v1/artwork-pipeline.ts`, niet op gemeten beelden.
