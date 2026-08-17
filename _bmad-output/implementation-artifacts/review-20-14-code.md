# Adversariële CODE-review — Story 20.14 (review-deck vult de viewport)

```yaml
reviewed_commit: 23592d4
baseline: 6ec4a87
branch: acc
scope: apps/web/src/components/review/MobileReviewDeck.tsx + ArtworkReviewPage.tsx + MobileReviewDeck.fillviewport-20-14.test.tsx
verdict: FAIL
severity_count: { high: 2, medium: 4, low: 5 }
```

De diagnose van 20.14 is juist: het 440-dak op de wrapper was inderdaad de dode-letter-oorzaak,
en die is aantoonbaar weg. Maar de story herhaalt de fout van 20.12 op twee nieuwe plekken.

1. De **actieknoppen staan buiten de gemeten kaart** — de kaart eindigt op `:1291`, "Wijs af" en
   "Accepteer" beginnen op `:1293` als *zusje*. De kaart wordt exact tot 16 px boven de vensterrand
   opgerekt, dus de knoppen worden per definitie ónder de vouw geduwd. De code-commentaar op
   `:1046-1048` beweert letterlijk het tegenovergestelde ("blijven de knoppen per definitie in
   beeld (AC4)"). Vóór 20.14 stonden ze wél in beeld: dit is een regressie.
2. `maxHeight: '100%'` op `ImageStage` **begrenst niets**, want de ouder heeft geen bepaalde hoogte.
   Het beeld wordt daardoor op zijn natuurlijke hoogte gerenderd en door `overflow: hidden` van het
   beeldvenster afgeknipt — bij een staand artwork is nu **35 % zichtbaar tegen 59 % vóór 20.14**.
   Precies de klacht van Friso ("het beeld wordt afgekapt") wordt hiermee erger, niet beter.

Het derde vaste getal is dus vervangen door twee nieuwe halve fixes. Beide zijn met een gemeten
browserproef aangetoond (zie Verificatie-aantekening) en beide zijn met één regel te repareren.

---

## Bevindingen

### H1 — "Wijs af"/"Accepteer" vallen buiten de gemeten kaart en dus onder de vouw
`apps/web/src/components/review/MobileReviewDeck.tsx:1291` (+ `:1293-1368`, `:1049-1051`,
`:1046-1048`, `:164-165`) — **high**

De kaart `deck-swipe-card` sluit op `:1291`, direct na de GTIN-regel. De knoppenrij (`:1293`,
hoogte 56 + 12 marge), "Ander keurmerk koppelen" (`:1371`, 44 + 8) en de swipe-hint (`:1385`,
~16 + 8) zijn **zusjes** van de kaart, geen kinderen. De flex-kolom die op `:1049-1051` wordt
aangezet omvat ze dus niet.

Omdat `cardHeight = window.innerHeight − rect.top − 16` (`:164`), staat de onderkant van de kaart
altijd 16 px boven de vensterrand. Alles wat daarna komt — ~142 px aan bedieningselementen —
staat gegarandeerd buiten beeld.

Bewijs 1 (**VERIFIED**, echte component in jsdom, `innerHeight = 1000`, wegwerp-probetest tegen
deze commit, daarna verwijderd):

```
PROBE {"cardHeightStyle":"984px","cardContainsReject":false,"cardContainsAccept":false,
       "cardContainsFrame":true,"cardLastChildText":"GTIN 08718989912451",
       "cardNextSiblingText":"Wijs afAccepteer"}
```

Bewijs 2 (**VERIFIED**, Chrome for Testing 1234, gemodelleerde paginakop van 230 px, `* {
box-sizing: border-box }` conform `apps/web/src/styles/index.css:5-9`, staand artwork 1200×1600):

| stand | venster | onderkant kaart | onderkant "Accepteer" | knoppen in beeld |
|---|---|---|---|---|
| 20.14 zoals geleverd | 1000 | 984 | **1052** | **nee** (52 px eronder; hele blok 126 px) |
| vóór 20.14 (48vh/440) | 1000 | 866 | 934 | ja |
| 20.14 zoals geleverd | 700 | 684 | **752** | **nee** (52 px eronder) |

AC4 noemt dit "de harde grens: liever een kleiner beeld dan een knop onder de vouw". Die grens
wordt niet gehaald én is slechter dan de situatie die 20.14 kwam repareren: een reviewer moet nu
per item scrollen om te kunnen beoordelen.

**Wat moet wijzigen:** óf de knoppenrij, de relabel-knop en de hint binnen `deck-swipe-card`
trekken (dan klopt het commentaar op `:1046-1048` en werkt `flex: 1` zoals bedoeld), óf de hoogte
van álle bediening onder de kaart meetellen in de aftrekking op `:164`. Plus een test die
`deck-accept.getBoundingClientRect().bottom <= window.innerHeight` afdwingt — of, jsdom-proof,
dat `deck-swipe-card` de knoppen daadwerkelijk bevat.

### H2 — `maxHeight: '100%'` begrenst niets: het beeld wordt harder afgekapt dan vóór 20.14
`apps/web/src/components/review/MobileReviewDeck.tsx:1222`, `:1256` (+ `:1208`);
`apps/web/src/components/review/ImageStage.tsx:255`, `:282`, `:296` — **high**

De keten is: `deck-stage-frame` (`flex: 1; minHeight: 0; overflow: hidden`) → de buitenste `div`
van `ImageStage` (`:255`: `width: 100%`, flex-kolom, **geen hoogte en geen maxHeight**) → `wrapRef`
(`:282`, `maxHeight`) → `img` (`:296`, `maxHeight`). Het beeldvenster is een flex-*rij* met
`alignItems: center`, dus het `ImageStage`-blok wordt niet uitgerekt en heeft een onbepaalde
hoogte. Een procentuele `max-height` tegen een onbepaalde hoogte gedraagt zich als `none`. De
oude waarde `calc(100vh - 260px)` was absoluut en begrensde dus wél.

Gevolg: het beeld wordt op zijn natuurlijke hoogte gerenderd en door `overflow: hidden` op `:1208`
gecentreerd afgeknipt — **boven én onder**. Gemeten (zelfde proef als H1, venster 1000,
beeldvenster 558 px hoog):

| beeld | gerenderde hoogte | weggeknipt boven / onder | zichtbaar |
|---|---|---|---|
| 1200×1600 (staand artwork, contexttak) | 1600 | 531 / 511 | **35 %** |
| 3000×2000 (liggend artwork) | 1044 | 253 / 233 | 53 % |
| 400×600 (kleine crop) | 600 | 31 / 11 | 93 % |
| 1200×1600, vóór 20.14 (`calc`, venster 440) | 740 | 160 / 140 | 59 % |
| 1200×1600, mét `height: 100%` op `ImageStage:255` | 536 | 0 / 0 | **100 %** |

Voor het staande artwork gaat het zichtbare deel dus van 59 % naar 35 %: AC1's "het beeld wordt
niet meer afgekapt" is niet gehaald, en de klacht die 20.14 moest oplossen wordt erger. Dat de
suite dit niet ziet, is per constructie: het nieuwe testbestand mockt `ImageStage` volledig weg
(`MobileReviewDeck.fillviewport-20-14.test.tsx:53-58`) en toetst alleen de doorgegeven prop-waarde
`'100%'` (`:131-137`) — de vorm van test waar 20.12 ook op strandde.

**Wat moet wijzigen:** de buitenste `div` van `ImageStage` (`ImageStage.tsx:255`) een bepaalde
hoogte geven in deze stand (`height: '100%'; minHeight: 0`), zodat de procentwaarde oplost — de
proef laat zien dat het beeld dan exact past (0 px weggeknipt). Alternatief: geen procentwaarde
doorgeven maar het beeldvenster zelf meten. En een test die aantoont dat het beeld nooit hoger is
dan zijn kader; jsdom kan dat niet, dus dat hoort in een browsertest (Playwright staat in de repo).

### M1 — de AC3-test meet de kaart, niet het beeldvenster; 600 px is niet aangetoond
`apps/web/src/components/review/MobileReviewDeck.fillviewport-20-14.test.tsx:139-145` — **medium**

AC3 eist dat **het beeldvenster** bij een venster van 1000 px minimaal 600 px hoog is ("nu: 440").
De test meet `card.style.height` (784) en niet `deck-stage-frame`. Het beeldvenster is de
kaarthoogte mínus de vaste rijen in de kaart (padding 24, rand 8, koprij, referentierij ~58,
context-knop, GTIN-regel). In de browserproef komt dat uit op **558 px** — onder de 600 uit AC3.
Het exacte getal hangt af van de opmaak boven de kaart (in de proef gemodelleerd op 230 px), maar
de gemeten waarde ligt op of onder de grens en de test kan het verschil niet zien.

**Wat moet wijzigen:** de assertie op `deck-stage-frame` richten en de eis expliciet maken; zolang
dat in jsdom niet meetbaar is (hoogtes zijn daar 0), hoort AC3 in een browsertest.

### M2 — de meting mengt vensterpositie met scrollpositie
`apps/web/src/components/review/MobileReviewDeck.tsx:158-168` — **medium**

`rect.top` is vensterrelatief en `measure()` hangt aan `resize`. Treedt een resize op terwijl de
pagina gescrold is, dan is `rect.top` kleiner en wordt de kaart evenveel te hoog. Het commentaar
op `:160-163` verwerpt een `scrollY`-correctie expliciet, maar de proef laat zien dat juist de
huidige vorm misgaat (venster 1000, 300 px gescrold, daarna terug naar boven):

```
cardH 1054 (i.p.v. 754) · onderkant kaart 1284 · onderkant "Accepteer" 1352 → 426 px onder de vouw
```

De pagina ís scrollbaar in deze stand (paginakop + kaart > venster, plus de Feedback-sectie
`ArtworkReviewPage.tsx:279`), dus dit is geen theoretisch geval. Nodig is de documentpositie van
de kaart (`rect.top + window.scrollY`) mét de bijbehorende aftrekking, of een klem op de
vensterhoogte.

### M3 — de ondergrens van 320 px beschermt het beeld niet, maar levert een onbruikbaar beeld op
`apps/web/src/components/review/MobileReviewDeck.tsx:71-72`, gebruikt op `:165` — **medium**

Het commentaar zegt "bij een heel lage viewport liever scrollen dan een onbruikbaar beeld". Omdat
`deck-stage-frame` het enige krimpbare kind is (`flex: 1; minHeight: 0`) absorbeert het bij een
kaart van 320 px álle krimp: gemeten bij venster 500 blijft er **124 px** beeldvenster over (8 %
van het artwork zichtbaar), en de bediening staat 192 px onder de vouw. De vloer levert dus
precies wat het commentaar wil vermijden. Bij venster 700 (het geval waar deze review expliciet
naar keek) is het beeldvenster 258 px — kleiner dan de 440 van vóór 20.14.

### M4 — AC5 heeft geen enkele test
`apps/web/src/pages/ArtworkReviewPage.tsx:148-155` — **medium**

`grep -rn "review-description" src/ tests/` geeft precies één treffer: de component zelf. Geen test
dekt "alinea weg bij ≥ 1 item op desktop" of "alinea blijft bij een lege wachtrij"; taak 3 is wel
afgevinkt. De `data-testid` is toegevoegd maar nergens gebruikt.

Wel geverifieerd en **géén** probleem: de door de review gevraagde layout-sprong tijdens het
beoordelen kan niet optreden. De deck bevriest zijn wachtrij (`:132 useState(items)`) en de pagina
toont bij `items.length === 0` een `Empty` in plaats van de deck (`:237`, `:257`), dus de alinea
komt nooit terug terwijl er een kaart staat. De `key` op `:269` forceert bovendien een remount
(en dus een verse meting) zodra de itemlijst wijzigt.

### L1 — geen `ResizeObserver`: alleen `resize` triggert een hermeting
`MobileReviewDeck.tsx:167-169` — **low**. Verandert de hoogte van de opmaak boven de kaart zonder
vensterwijziging (fonts die later laden, een omgeslagen filterbalk door een breedtewijziging in de
kolom, een banner), dan blijft `cardHeight` staan. Een `ResizeObserver` op de kaart of op de
paginakop dekt dat af.

### L2 — de kaart krijgt een vaste hoogte zonder `overflow`
`MobileReviewDeck.tsx:1049-1051` — **low**. Groeit de vaste inhoud in de kaart (letterloze
Nutri-Score-hint `:1079`, prior-tag `:1163`, context-knop), dan loopt de inhoud stil buiten de
kaartrand door; alleen het beeldvenster krimpt mee. Zichtbaar effect: inhoud over de rand heen.

### L3 — AC7 is in de fill-stand niet getest
`MobileReviewDeck.fillviewport-20-14.test.tsx:53-58` — **low**. Alle interactietests (zoom, pannen,
kader tekenen, "Bekijk in context", swipe, sneltoetsen) draaien in de bestaande suites **zonder**
`fillViewport`, en de nieuwe suite mockt `ImageStage` weg. De 69 groene tests zeggen dus niets over
gedrag in de nieuwe stand; AC7 rust volledig op de mobiele tak.

### L4 — taak 4 belooft een AC4-test die niet bestaat
`20-14-review-deck-vult-de-viewport.md:95-96` — **low**. Taak 4 ("knoppen binnen beeld (AC4)") is
afgevinkt, maar `grep "deck-reject\|deck-accept"` op het nieuwe testbestand geeft 0 treffers. De
Verificatie-sectie noemt deze lacune niet, terwijl ze de jsdom-grens voor AC3 wél eerlijk benoemt.

### L5 — `FILL_BOTTOM_GAP` is óók een vast getal
`MobileReviewDeck.tsx:70` — **low**. Eerlijk gedocumenteerd als "de ENIGE vaste maat", en 16 px
marge is onschuldig. Waard om te noemen omdat het getal nu de énige buffer is tussen de kaart en
de vensterrand — en in H1 blijkt dat die buffer 142 px te klein is gekozen.

---

## Claim-audit per acceptatiecriterium

| AC | Oordeel | Code-bewijs |
|----|---------|-------------|
| **AC1** — 440-dak weg, beeld niet meer afgekapt | **niet gedekt** | Eerste helft klopt: `:1199-1201` zet in de fill-stand `flex: 1; minHeight: 0` i.p.v. `height: 48vh; maxHeight: 440`, en geen voorouder houdt nog een vaste pixelhoogte (kaart `:1050` = gemeten waarde). Tweede helft niet: het beeld wordt méér afgekapt dan vóór 20.14 (35 % zichtbaar tegen 59 %) doordat `maxHeight: '100%'` (`:1222`, `:1256`) niet oplost tegen `ImageStage.tsx:255` → **H2**. |
| **AC2** — gemeten hoogte, geen magisch getal | **gedekt** | `useLayoutEffect` `:152-171`: `window.innerHeight − rect.top − 16` (`:164`), `resize`-listener `:167-169` met opruiming `:169`. Test bevestigt 784 bij venster 1000/top 200 en 484 na resize naar 700 (`fillviewport-20-14.test.tsx:111-159`). Voorbehoud: de meting mengt scroll- en venstercoördinaten → **M2**. |
| **AC3** — beeldvenster ≥ 600 px bij venster 1000 | **niet aangetoond** | De test meet de **kaart** (`:139-145`), niet het beeldvenster. Gemeten in de browserproef: beeldvenster 558 px bij venster 1000 → onder de eis. Bovendien is de zichtbare beeldhoogte een ander getal dan de vensterhoogte zolang H2 niet gerepareerd is → **M1**. |
| **AC4** — knoppen zonder scrollen bereikbaar | **niet gedekt** | Weerlegd. De knoppen staan buiten de gemeten kaart (`:1291` vs `:1293`); onderkant "Accepteer" op 1052 bij een venster van 1000, en op 752 bij 700. Vóór 20.14 lag hij op 934 (in beeld). Geen test raakt `deck-accept`/`deck-reject` in deze stand → **H1**, **M3**, **L4**. |
| **AC5** — alinea weg bij een gevulde wachtrij, blijft bij een lege | **gedekt, geen test** | `ArtworkReviewPage.tsx:148` `{(isMobile \|\| items.length === 0) && …}` — dekt beide takken letterlijk, inclusief mobiel. Layout-sprong tijdens beoordelen is uitgesloten (deck bevriest de wachtrij `:132`, pagina toont `Empty` bij een lege lijst `:237`/`:257`, remount via `key` `:269`). Bewijs is uitsluitend code; nul tests → **M4**. |
| **AC6** — mobiel ongewijzigd | **gedekt** | Zonder `fillViewport` blijft `cardHeight === null`: `:154-156` zet de state op `null` en meet niet, `:1049-1051` laat de kaartstijl ongemoeid, `:1199-1201` houdt `48vh`/`440`, `:1222`/`:1256` houden `DECK_MAX_IMAGE_HEIGHT`. Getest op alle vier de punten (`fillviewport-20-14.test.tsx:171-188`). De pagina geeft `fillViewport={!isMobile}` mee met `isMobile = useMediaQuery('(max-width: 768px)')` (`ArtworkReviewPage.tsx:49`, `:272`) — exact de grens uit AC6. Geen gedeelde stijl lift mee: elke wijziging staat in een `cardHeight ? … : …`-tak. De alinea blijft op mobiel staan (`:148`). |
| **AC7** — bestaande interacties intact | **gedekt met voorbehoud** | Geen enkele gedragsregel is aangeraakt: de diff bevat alleen stijl, een prop en een effect. Maar alle interactietests draaien zonder `fillViewport` en de nieuwe suite mockt `ImageStage` weg → in de nieuwe stand ongetest (**L3**). Reëel risico is klein maar niet nul: kadertekenen rekent met `getBoundingClientRect()` van het beeld (`ImageStage.tsx:209-213`), en dat beeld hangt nu voor 65 % buiten zijn kader (H2) — een kader tekenen op een onzichtbaar deel is mogelijk. |
| **AC8** — geen regressie | **gedekt (gemeten)** | Zelf gedraaid op deze commit: `npx vitest run src/components/review src/pages/ArtworkReviewPage.test.tsx` → **10 bestanden, 69 tests, alle groen** (66,7 s). De telling in de story klopt exact. |

## Wat moet wijzigen vóór PASS

1. **H1** — de knoppenrij (`:1293`), de relabel-knop (`:1371`) en de hint (`:1385`) binnen
   `deck-swipe-card` trekken, óf hun hoogte meetellen in de aftrekking op `:164`. Mét een test die
   afdwingt dat de kaart de accepteer-knop bevat (jsdom-proof) of dat die binnen `innerHeight` valt.
2. **H2** — `ImageStage.tsx:255` een bepaalde hoogte geven (`height: '100%'; minHeight: 0`) zodat
   `maxHeight: '100%'` oplost, óf het beeldvenster meten i.p.v. een procentwaarde doorgeven. Aantonen
   met een browsertest dat het beeld nooit hoger is dan zijn kader.
3. **M1** — de AC3-assertie op `deck-stage-frame` richten en het 600 px-getal opnieuw vaststellen
   (of AC3 herformuleren op wat werkelijk gehaald wordt).
4. **M2** — de kaartpositie documentrelatief bepalen, of de uitkomst klemmen, zodat een resize
   tijdens scrollen geen te hoge kaart oplevert.
5. **M3** — de ondergrens laten doen wat het commentaar belooft: een minimum voor het *beeldvenster*
   i.p.v. voor de kaart, en onder die grens de pagina laten scrollen.
6. **M4** — tests voor beide AC5-takken (alinea weg bij ≥ 1 item op desktop, blijft bij een lege
   wachtrij en op mobiel).
7. **L4** — de afgevinkte taak 4 en de Verificatie-sectie in overeenstemming brengen met wat er
   werkelijk getest is.

## Verificatie-aantekening

- **VERIFIED (testsuite):** `npx vitest run src/components/review src/pages/ArtworkReviewPage.test.tsx`
  op commit 23592d4 → 69 groen / 10 bestanden. AC8 en de tellingen in de story kloppen.
- **VERIFIED (DOM-nesting):** wegwerp-probetest met de échte `MobileReviewDeck` in jsdom
  (`innerHeight = 1000`) → `card.contains(deck-reject) === false`,
  `card.contains(deck-accept) === false`, `card.nextElementSibling.textContent === "Wijs afAccepteer"`,
  `card.style.height === "984px"`. Het bestand is na de meting verwijderd; de repository is
  onveranderd.
- **VERIFIED (opmaak):** losse HTML-proef in Chrome for Testing 1234 (Playwright uit deze repo) die
  de keten kaart → beeldvenster → `ImageStage`-root → `wrapRef` → `img` één-op-één nabouwt, inclusief
  `* { box-sizing: border-box }` uit `apps/web/src/styles/index.css:5-9`. Daaruit komen alle
  pixelgetallen in H1, H2, M2 en M3.
- **INFERENCE / gemodelleerd:** de opmaak *boven* de kaart is in die proef op 230 px gezet en de
  rijen *in* de kaart zijn uit de code nagebouwd, niet in de draaiende applicatie gemeten. De
  absolute getallen (558 px beeldvenster, 52 px onder de vouw) schuiven dus mee met de echte
  paginakop; de structurele bevindingen doen dat niet — dat de knoppen buiten de gemeten kaart
  vallen en dat `maxHeight: '100%'` niet oplost, volgt uit de code en uit de jsdom-meting.
- **NIET geverifieerd:** het gedrag in de draaiende applicatie op ACC (geen deploy binnen deze
  review), en de werkelijke beeldverhoudingen van de crops en context-fragmenten in productie —
  de gemeten percentages gelden voor de drie doorgerekende formaten.
