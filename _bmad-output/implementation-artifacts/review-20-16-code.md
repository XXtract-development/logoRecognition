# Adversariële CODE-review — Story 20.16 (beoordeelscherm: alle bediening in beeld, beeld niet afgekapt)

```yaml
reviewed: werkkopie (niet gecommit)
baseline: 9da6c5f
branch: acc
scope: >
  apps/web/src/components/review/MobileReviewDeck.tsx,
  apps/web/src/components/review/ImageStage.tsx,
  apps/web/src/components/review/MobileReviewDeck.fillviewport-20-14.test.tsx,
  tests/e2e/review-deck-layout.spec.ts, tests/e2e/helpers/review-deck.ts, versions.md
verdict: FAIL
severity_count: { high: 2, medium: 6, low: 5 }
```

Bij vensterhoogte 1000 is dit **echt gerepareerd**, en dat is zelf nagemeten: beeldvenster 422,
beeld 396 (past), laagste bediening 985, afstand kaartonderkant → laagste bediening 68 px,
kolomhoogte ongevoelig voor scrollen. Drie stories lang was dat niet zo.

FAIL om twee dingen die precies de faalmodus van dit dossier herhalen. (1) De ondergrens van
400 px bestaat in de echte app niet: het beeldvenster staat bij venster 700 op **368 px**, en
de browsertest ziet 400 alleen omdat hij zelf een `resize` afvuurt vóór hij meet. De tabel in
het Dev Agent Record ("beeldvenster 400 px bij venster 700") is dus een gepookte waarde, geen
schermwaarde. (2) De tekenzone is nu ruim groter dan het beeld (gemeten 396 px zone om een
beeld van 180 px), waardoor een getekend kader stilzwijgend wordt bijgeknipt vóór het als
`bbox` de database in gaat — dezelfde uitkomst als H3 van de spec-review, via een andere weg,
in de laag die de story expliciet buiten scope verklaart.

---

## Bevindingen

### H1 — de ondergrens van 400 px houdt alleen ná een kunstmatige `resize`; in de app is het 368
`apps/web/src/components/review/MobileReviewDeck.tsx:182-185`,
`tests/e2e/helpers/review-deck.ts:302,317-320`, `tests/e2e/review-deck-layout.spec.ts:115-119`
— **high**

De vloer zit niet in de opmaak maar in de meting: `rows = kolom.offsetHeight −
beeldvenster.offsetHeight`, `needed = rows + 400`. Die `rows` is een **momentopname**. Verandert
er ná de meting iets aan de vaste rijen binnen de kolom, dan absorbeert het beeldvenster dat
verschil en hermeet niemand — de ResizeObserver kijkt naar `parentElement` en `document.body`,
en die veranderen niet, want de kolom heeft een **vaste** hoogte.

**VERIFIED (zelf gedraaid, Chrome via `pw-lokaal.config.ts`, dev-server 5173):**

| venster 700 | beeldvenster |
|---|---|
| natuurlijke eindstand, 1,5 s na laden, zonder duw | **368 px** |
| ná `window.dispatchEvent(new Event('resize'))` | 400 px |
| na injectie van een rij van 60 px in de kaart (geen hermeting) | **340 px** |

Twee onafhankelijke bevestigingen dat 368 de eindstand is en niet een tussenstand: mijn probe
(`measureDeck` na 1,5 s rust) en de eigen `wedloop`-meting van de story
(`test-results/review-deck-metingen/wedloop.json`, `tijdensLaden.stageFrameHeight = 368`,
`stabielNa: 2`).

Waarom de test dit niet ziet: `measureDeckStable` heeft `forceerHermeting = true` als **default**
(`review-deck.ts:302`) en vuurt dus een `resize` af vóór elke meting van de twee opmaaktests. Die
duw was in 20.15 bewust ingebouwd als tijdelijke krukstok, met in de eigen docstring
(`:288-296`) de opdracht "story 20.16 (AC7) moet de hermeting zelf repareren". De hermeting is
deels gerepareerd (`canMutate` + observer), de krukstok is blijven staan, en de assertie
`stageFrameHeight >= 400` bij venster 700 leunt er volledig op. Draai je de duw eruit, dan is
die assertie rood op de huidige code.

Dat het bij venster 1000 wél klopt (422, zelf gemeten mét én zonder duw) komt doordat daar de
`avail`-tak bindt; `rows` doet er dan niet toe. De fout zit uitsluitend in de vloer-tak — precies
de tak die AC4/AC5 dragen.

Reviewer-zichtbaar gevolg, niet alleen testhygiëne: elke rij die per item verschijnt of
verdwijnt ná de meting krimpt het beeldvenster geruisloos onder de beloofde vloer — de
letterloze Nutri-Score-hint (`:1149-1167`), de gedeclareerd-rij, de referentierij die op
`refError` van 44 px naar een placeholder omklapt. Het meet-effect hangt niet aan `idx`.

**Moet wijzigen:** de vloer afdwingen op een plek die niet van een momentopname afhangt (echte
`minHeight` op `deck-stage-frame`, zoals AC4 zegt, of de kolom laten meegroeien), óf de kolom
zélf observeren zodat een verandering binnen de kolom hermeting uitlokt. En `forceerHermeting`
op `false` zetten in de twee opmaaktests, anders meet de suite een stand die geen reviewer ziet.

### H2 — de tekenzone is veel groter dan het beeld; een getekend kader wordt stil bijgeknipt
`apps/web/src/components/review/ImageStage.tsx:308` (`flex: 1` + `alignItems: 'center'` in de
vul-stand), `:128-133` (`wrapPos`), `:216-226` (`clamp01` tegen de `<img>`-rechthoek) — **high**

**VERIFIED (zelf gemeten, bron 240 × 180 bij venster 1000):** de tekenzone `deck-stage` is
**396 px hoog**, het beeld erbinnen **180 px** — 216 px (55 %) van het oppervlak waarop je kunt
slepen ligt buiten het beeld. Vóór 20.16 had de wrap alleen `maxHeight` en kromp hij om het
beeld heen; die grijze band bestond niet.

`wrapPos` rekent pointerposities tegen de **wrap**, `confirm` rekent ze om tegen de **`<img>`**
met `clamp01`. Een sleep die deels in de grijze band begint levert dus een `bbox` die niet is wat
de reviewer tekende en zag: het overlay-kader staat in de band, de opgeslagen fractie is naar de
beeldrand geplakt. Geen melding, geen rode test. Een sleep volledig in de band valt weg op de
`rel.width/height < 0.005`-drempel — dat dekt alleen het volledig-buiten-geval af.

Dit is materieel dezelfde uitkomst als **H3 van review-20-16** (scheve kaders in de database),
die de story zegt te hebben afgewend door opschalen te schrappen. Het opschalen is inderdaad
geschrapt, maar `alignItems: 'center'` op een uitgerekte wrap opent dezelfde deur. "Het gedrag
van de teken- en zoomlaag — en die blijft expliciet ongemoeid" (story, *Wat NIET in deze story
zit*) is daarmee onwaar. Ook `dbl` (`:196-205`) zoomt nu om het beeldmiddelpunt binnen een zone
die tweemaal zo hoog is.

**Moet wijzigen:** de tekenzone om het beeld laten krimpen (bijvoorbeeld de wrap laten
shrink-to-fit binnen een gecentreerde ouder), of `wrapPos`/de overlay tegen de `<img>`-rechthoek
laten werken en slepen buiten het beeld weigeren. Plus een regressietest die een kader op vaste
coördinaten tekent en de doorgegeven fracties vergelijkt — dat was de eis die review-20-16 onder
H3 al stelde.

### M1 — het commentaar op het beeldvenster belooft een vloer die er niet staat
`MobileReviewDeck.tsx:1269-1275` — **medium**

Het commentaar zegt: *"de vloer staat hier, op het beeldvenster … `minHeight` samen met `flex: 1`
betekent 'pak de restruimte, maar zak nooit onder 400'"*. De code eronder is
`{ flex: 1, minHeight: 0 }`, en de jsdom-test pint dat expliciet vast
(`fillviewport-20-14.test.tsx:141`, `expect(frame.style.minHeight).toBe('0')`). AC4 ("Deze grens
landt op `deck-stage-frame` (`minHeight`)") en taak 3 ("ondergrens naar `deck-stage-frame`
(AC4)", afgevinkt) zeggen hetzelfde als het commentaar. Drie bronnen beweren iets dat de code
niet doet. In een story waarvan AC10 *"het onjuiste commentaar gaat weg"* is, is dit de ergste
vorm van terugval — en het is de directe leesbron voor de volgende ontwikkelaar die H1 moet
repareren.

### M2 — twee nieuwe commentaren beweren dat beide helften nodig zijn; het eigen faalbewijs zegt het tegendeel
`MobileReviewDeck.tsx:1277-1280`, `ImageStage.tsx:273-277` — **medium**

Beide passages: *"alleen de root een hoogte geven volstaat niet"* / *"Alleen de begrenzing
repareren is niet genoeg"*. Het Dev Agent Record schrijft zelf: *"elk van beide is afzonderlijk
voldoende. Pas met allebei uit wordt de test rood."* Dat is correct (een `height: 100%` op een
ouder met bepaalde hoogte is definiet, ook onder `align-items: center`), en het maakt het
commentaar onjuist. Het record noemt de redundantie eerlijk, maar laat de tegenstrijdige
commentaren staan én laat de ongedekte helft ongetest — wie later `alignItems: 'stretch'`
weghaalt, ziet niets omvallen.

### M3 — AC11 is niet geleverd, terwijl taak 6 is afgevinkt
`ArtworkReviewPage.tsx:149` — **medium**

AC11 eist een test op `review-description`. `grep -rn "review-description" apps/web/src tests`
geeft precies één treffer: de component zelf. Er is geen enkele test. Taak 6 ("test op
`review-description` (AC11)") staat op `[x]` en het Dev Agent Record meldt de afwijking niet,
terwijl het de afwijking op AC13 wél netjes meldt.

### M4 — `tsc --noEmit` is niet schoon; het verslag claimt van wel
`MobileReviewDeck.fillviewport-20-14.test.tsx:159,170,190` — **medium**

Zelf gedraaid (`cd apps/web && npx tsc --noEmit`): 3 × `TS6133: 'card' is declared but its value
is never read` — resten van de herschrijving, waar de assertie van de kaart naar de kolom
verhuisde. Het Dev Agent Record schrijft "`tsc --noEmit`: schoon". Klein van inhoud, maar het is
een verificatieclaim in een story die op verificatieclaims wordt afgerekend.

### M5 — het vangnet van `measureDeck` is stomp geworden en het commentaar erbij is nu onjuist
`tests/e2e/helpers/review-deck.ts:350-362` — **medium**

`deckRoot = cardEl.parentElement` was bewust de natuurlijke onderkant van het héle deck, juist
om te voorkomen dat een reparatie "de knoppen staan in beeld" claimt terwijl er bediening onder
hangt (bevinding H1 van review-20-15-code). Die ouder is nu `deck-column` met een **vaste**
hoogte: de term levert altijd `docTop + columnHeight` op, wat een reparatie niet meer kan
tegenspreken. Alleen `deck-accept` en `deck-relabel-open` worden nog direct gemeten. Zet iemand
de veeg-hint terug (geen testid, valt buiten de kolom), dan blijft `allControlsVisible` groen
terwijl er bediening onder de vouw hangt — de faalmodus waarvoor deze opzet is gebouwd. Het
commentaar op `:350-356` verwijst bovendien nog naar `MobileReviewDeck.tsx:1371`/`:1385` voor de
relabel-knop en de hint (verouderd), en de docstring op `:288-296` beschrijft nog de niet
meer bestaande "meet één keer bij montage"-situatie.

### M6 — de meetbare eis van AC1 en de jsdom-toets van AC3 worden nergens getoetst
`tests/e2e/review-deck-layout.spec.ts:79-126`, `fillviewport-20-14.test.tsx:121-145` — **medium**

AC1 is meetbaar geformuleerd ("de afstand tussen de onderkant van de kaart en de onderkant van
de laagste bediening daalt van 145 px naar ≤ 70 px"). Feitelijk klopt het (zelf gemeten: 985 −
917 = **68 px** bij venster 1000), maar geen enkele assertie legt het vast, terwijl beide
grootheden al in `DeckMeasurement` zitten. AC3 vraagt om een jsdom-toets als *noodzakelijke
voorwaarde* dat de bediening binnen de gemeten kolom valt; de suite toetst wel de stijlen van de
kolom maar nergens dat `deck-accept`/`deck-relabel-open` er een afstammeling van zijn.

### L1 — `columnHeight` doet dienst als vlag én als waarde, zonder ondergrens-guard
`MobileReviewDeck.tsx:185,1078,1086,1110,1273,1450,1473,1489` — **low.** Een uitkomst van 0 valt
terug op de héle mobiele tak (block-knop + veeg-hint terug), een negatieve uitkomst blijft
truthy en zet `height: 0` via `Math.max(columnHeight, 0)`. Beide zijn in de praktijk
onwaarschijnlijk (`needed ≥ 400`), maar de guard en de vlag spreken elkaar tegen; `setColumnHeight`
zou zijn eigen ondergrens moeten afdwingen.

### L2 — de eerste meting telt de mobiele extra's mee
`MobileReviewDeck.tsx:183` — **low.** Bij de eerste `measure()` is `columnHeight` nog `null`,
dus staan de block-relabelknop (44 + 8) en de veeg-hint (~25) nog in de kolom en zitten ze in
`rows`. Alleen een tweede observer-ronde corrigeert dat. Zonder `ResizeObserver` (jsdom, en
alles wat de observer niet vuurt) blijft die overschatting staan.

### L3 — versify: de nieuwe changelog-alinea overdrijft in dezelfde adem als de rechtzetting
`versions.md:12-15` — **low.** "De vrijgekomen ruimte gaat naar het etiket" — het beeldvenster
is juist gekrompen van 490 naar 422 px. Wat waar is, is dat het etiket nu volledig past
(1019 → 396 px gerenderd). De rechtzettingen zelf (`:31-35`, `:55-57`) zijn feitelijk correct
en volledig: 1019-in-490, 129 px bediening buiten beeld, en beide onware alinea's zijn geraakt.

### L4 — de icoonknop is toegankelijk maar niet meer vindbaar zonder tooltip
`MobileReviewDeck.tsx:1450-1463` — **low.** `aria-label` én `title` staan er (correct), en de
sneltoetsregel noemt "L ander keurmerk". Maar voor een muisgebruiker is "Ander keurmerk
koppelen" van een volle knoprij teruggebracht tot een tag-icoontje van 48 px zonder tekst; de
onderbouwing daarvoor (77 px winst) staat in de story, de UX-afweging is niet voorgelegd.

### L5 — verouderd commentaar bij de meting
`MobileReviewDeck.tsx:153-157` — **low.** Nog steeds "Story 20.14 — de kaart vult de ruimte …
We MÉTEN waar de kaart begint", terwijl de meting naar de kolom is verhuisd. Zelfde categorie
als AC10.

---

## Claim-audit per acceptatiecriterium

| AC | Claim gehaald? | Bewijs |
|---|---|---|
| **AC1** compacte balk, afstand ≤ 70 px | **ja in de code, niet getoetst** | Relabel in de knoprij (`:1450`), veeg-hint alleen mobiel (`:1489`). Zelf gemeten 985 − 917 = **68 px**. Geen assertie → **M6** |
| **AC2** alle bediening in beeld bij 1000 | **ja, VERIFIED** | `allControlsVisible: true`, laagste 985 ≤ 1000, mét én zónder afgedwongen hermeting. Assertie aanwezig (`spec:98-103`) |
| **AC3** bediening binnen de gemeten kolom | **ja door constructie, jsdom-toets ontbreekt** | `deck-column` omvat kaart + knoprij (`:1074-1496`). Geen containment-assertie → **M6** |
| **AC4** beeldvenster ≥ 400 bij venster 1000 | **ja (422)**, maar het mechanisme is niet wat AC4 beschrijft | Vloer staat níet als `minHeight` op `deck-stage-frame` (daar staat `0`) → **M1**; de rekenvloer faalt bij 700 → **H1** |
| **AC5** lage viewport scrollt, kaart loopt niet over | **deels** | `contentWithinCard: true` en de pagina scrollt (beide geasserteerd, zelf groen). Maar het beeldvenster zakt naar 368 → **H1** |
| **AC6** beeld niet meer afgekapt | **ja, VERIFIED** | 396 ≤ 422 (venster 1000), 374 ≤ 400 (700). Twee onderling redundante helften, één ongedekt → **M2** |
| **AC7** meting document-relatief, geen groeispiraal | **ja, VERIFIED** | `rect.top + scrollY` (`:175`). Zelf geprobeerd: na `scrollTo(0,300)` + geforceerde hermeting blijft de kolom **708 px** — identiek aan de ongescrollde waarde |
| **AC8** hoogte corrigeert zichzelf | **deels** | `wedloop`: 368 → 400 vanzelf, duwtje levert 0 extra ✓. Maar de correctie hangt aan `canMutate` en aan parent/body-resizes; wijzigingen bínnen de kolom lokken géén hermeting uit → **H1** |
| **AC9** mobiel ongewijzigd | **ja** | Niet-vullende tak byte-identiek: block-knop 44 px/`marginTop 8`, veeg-hint, `48vh`/`440`, `DECK_MAX_IMAGE_HEIGHT`, `alignItems: 'center'`, `fill={false}`. De nieuwe wrapper krijgt `style={undefined}` in een gewone block-ouder (`:1044`) → layout-neutraal; vastgelegd in `fillviewport-20-14.test.tsx:212` |
| **AC10** onjuist commentaar weg | **nee** | `:50-63` en het oude `:1046-1048` zijn weg ✓, maar er komen drie nieuwe onjuiste passages bij → **M1**, **M2**, **L5** |
| **AC11** test op `review-description` | **nee** | Nul treffers in de testbestanden; taak afgevinkt → **M3** |
| **AC12** RED-bewijs per fix, met vensterhoogte | **deels** | Drie bewijzen zijn plausibel en de vensterhoogtes staan erbij. Ik heb ze **niet opnieuw uitgevoerd** (zou de code moeten wijzigen). Bewijs 3 gebruikt de gepookte 400 als vertrekpunt → **H1**; bewijs 2 vereist twee helften uit → **M2** |
| **AC13** regressie, één benoemde uitzondering | **ja** | Zelf gedraaid: `src/components/review` 61 passed, `ArtworkReviewPage` 8 passed, 0 failed. `ImageStage.maxheight-20-12.test.tsx` inderdaad ongewijzigd groen. De afwijking (20.14-suite in plaats van 20.12) is expliciet gemeld ✓ |
| **AC14** changelog rechtgezet | **ja, met één overdrijving** | Beide alinea's geraakt, getallen kloppen tegen de nulmeting → **L3** |

### Is de herschreven 20.14-suite groengemaakt?

Nee — de vier gesneuvelde tests zijn omgezet naar het nieuwe mechanisme, niet verzwakt. De
diff bevat geen enkele geschrapte assertie; alles wat verdween (`card.style.height`) is vervangen
door het equivalent op de kolom, plús vier nieuwe asserties (`column.style.display/flexDirection`,
`card.style.height === ''`, `card.style.flex`). Twee kanttekeningen: de ondergrenstest bewijst
niets over het mechanisme (in jsdom is `offsetHeight` 0, dus `rows = 0` en valt de vloer
toevallig samen met 400 — het commentaar zegt dat eerlijk), en `expect(frame.style.minHeight)
.toBe('0')` pint nu een waarde vast die AC4 en het commentaar tegenspreekt (**M1**).

### Blijft een test groen als iemand de fix terugdraait?

- Compacte balk terug → `relabelBottom` ≈ 1036 > 1000 → **rood** ✓ (direct gemeten, niet via het
  stompe vangnet).
- Veeg-hint terug (geen testid) → **groen**, terwijl er bediening onder de vouw hangt → **M5**.
- Beeldbegrenzing, één helft terug → **groen** → **M2**.
- Rekenvloer terug → rood bij 700, maar alleen dankzij de kunstmatige `resize` → **H1**.

---

## Wat moet wijzigen vóór PASS

1. **H1** — de 400 px-vloer op een plek zetten die niet van een momentopname afhangt (echte
   `minHeight` op `deck-stage-frame`, of de kolom laten meegroeien), óf de kolom zelf laten
   observeren. En `forceerHermeting` in de twee opmaaktests op `false`, zodat de suite de stand
   meet die de reviewer krijgt. Zonder dit is de eindstand bij venster 700 **368 px**, niet 400,
   en is de tabel in het Dev Agent Record onjuist.
2. **H2** — de tekenzone weer om het beeld laten sluiten (of `wrapPos`/overlay tegen de
   `<img>`-rechthoek laten rekenen en slepen buiten het beeld weigeren), plus de regressietest
   die een kader op vaste coördinaten tekent en de doorgegeven fracties vergelijkt.
3. **M1 + M2 + L5** — de drie onjuiste commentaren rechtzetten (of de code laten doen wat ze
   beweren), en AC4/taak 3 in overeenstemming brengen met wat er werkelijk staat.
4. **M3** — de test op `review-description` alsnog schrijven, of AC11 met reden intrekken.
5. **M4** — de drie `TS6133`-fouten opruimen en de verificatieregel corrigeren.
6. **M5** — `measureDeck` een echt vangnet teruggeven (de natuurlijke onderkant van
   `mobile-review-deck` in plaats van de vaste kolom) en de twee verouderde commentaren
   bijwerken.
7. **M6** — de ≤ 70 px van AC1 en de containment van AC3 als assertie vastleggen.
8. **L1-L4** — guard op `columnHeight`, de eerste-meting-overschatting, de zin in `versions.md`,
   en desgewenst de UX-keuze van de tekstloze relabel-knop expliciet voorleggen.

---

## Verificatie-aantekening

**VERIFIED (zelf uitgevoerd op de werkkopie, 2026-08-18).**
`cd apps/web && npx vitest run src/components/review` → 61 passed / 0 failed;
`npx vitest run src/pages/ArtworkReviewPage` → 8 passed / 0 failed;
`npx tsc --noEmit` → 3 × TS6133 (**niet** schoon);
`npx playwright test --config=<scratchpad>/pw-lokaal.config.ts` → **4 passed / 0 failed**, met de
metingen in `test-results/review-deck-metingen/*.json` (laptop 422/396/985/917, klein
400/374/963/895, kleine-bron 422/180, wedloop 368 → 400 → 400).
Eigen probes op dezelfde harnas (buiten de repo, `<scratchpad>/rev2016/`): eindstand bij venster
700 zonder afgedwongen hermeting **368 px**; na injectie van een rij van 60 px **340 px**;
venster 1000 met én zonder duw **422 px**; kolomhoogte na `scrollTo(0,300)` + hermeting **708 px**
(onveranderd); tekenzone 396 px om een beeld van 180 px bij een bron van 240 × 180.

**NIET geverifieerd.** De drie RED-bewijzen van AC12 zijn niet opnieuw uitgevoerd (dat vraagt om
het terugdraaien van de fix; ik heb buiten dit reviewbestand niets in de repo gewijzigd). Verder
niet gemeten: het gedrag op ACC of productie, echt mobiel/touch in een browser (alleen jsdom plus
structurele vergelijking), browsers zonder `ResizeObserver`, mogelijke
`ResizeObserver loop`-waarschuwingen in de console (niet uitgelezen; de metingen waren wel na
twee rondes stabiel), en de werkelijke bronresoluties van crops in productie. `npx playwright
install` is bewust **niet** gedraaid; alle browsertests liepen op de geïnstalleerde Google Chrome.
