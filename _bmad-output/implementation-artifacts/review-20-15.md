# Adversariële SPEC-review — Story 20.15 (beoordeelscherm écht bruikbaar)

- **Reviewer:** adversarial spec review (BMAD), 2026-08-17
- **Story:** `_bmad-output/implementation-artifacts/20-15-beoordeelscherm-echt-bruikbaar.md` (status `draft`)
- **Code-basis:** branch `acc`, HEAD `23592d4`
- **Scope:** de SPEC getoetst tegen de echte code; er is niets geïmplementeerd. Derde poging op
  dezelfde wens (20.12 FAIL, 20.14 FAIL).

```
verdict: FAIL
severity_count: { high: 3, medium: 7, low: 6 }
```

FAIL omdat drie bevindingen op high staan, en alle drie raken precies de faalmodus van de twee
vorige pogingen — een criterium dat "gehaald" heet terwijl het gedrag niet klopt.

1. **AC3 en AC1 kunnen niet gelijktijdig waar zijn.** AC3 eist een beeldvenster van ≥ 600 px bij
   vensterhoogte 1000. AC1 eist dat álle bediening binnen het gemeten gebied valt. Gemeten in een
   echte browser op de structuur die de story voorschrijft: **409 px**. Erger: bij een 1080p-scherm
   (venster ≈ 900) komt het beeldvenster op **309 px** — kleiner dan de **440 px** van vóór 20.12.
   Wie deze story letterlijk uitvoert, levert een *achteruitgang* op het meest voorkomende scherm
   en een gegarandeerde AC3-mislukking. Het getal 600 is ongewijzigd overgenomen uit 20.14, waar
   het al niet gehaald werd (558 px) — en AC1 maakt het nu 120 px moeilijker.
2. **De ondergrens uit AC4 levert geen scrollende pagina maar een overlopende kaart.** Gemeten:
   bij venster 600 blijft er −93 px over voor de vaste rijen; de GTIN-regel en het beeldvenster
   lopen buiten de kaartrand door en botsen op de knoprij.
3. **De enige echte waarborg van deze story — de browsertest uit AC9 — is in deze repository niet
   uitvoerbaar** zonder een eigen brok opzetwerk: geen enkele e2e-test raakt het reviewscherm,
   `tests/e2e/helpers/` is leeg, er is geen inlog-fixture, en `reference-library.spec.ts` staat
   volledig op `test.skip` met exact deze reden erboven. Valt AC9 weg, dan staan we waar 20.12 en
   20.14 stonden.

De diagnose in de story is voor het overige scherp en op de code nagerekend: de knoprij buiten de
kaart, de niet-oplossende `maxHeight: '100%'`, en het onjuiste commentaar zijn alle drie echt.
Er ontbreekt geen vierde hoogtebegrenzing — dat deel van de vraag is negatief beantwoord.

---

## 1. Bevindingen

### HIGH

**H1 — AC3 (`beeldvenster ≥ 600 px bij venster 1000`) is onhaalbaar zodra AC1 geldt; bij venster 900 levert de spec een regressie t.o.v. vóór 20.12 — high**

Bronnen: `MobileReviewDeck.tsx:164` (`window.innerHeight − rect.top − FILL_BOTTOM_GAP`), de vaste
rijen in de kaart `:1062-1075` (koprij), `:1104-1156` (referentierij), `:1163-1175` (prior-tag),
`:1177-1190` (contextknop), `:1288-1290` (GTIN-regel), de bediening `:1293` / `:1371` / `:1385`,
en `ArtworkReviewPage.tsx:126,138-141,248-256` + `AppLayout.tsx:191-199` (64 px kop) voor de opmaak
boven de kaart.

**VERIFIED (gemeten, Chrome for Testing 1234):** de structuur die taak 1 + taak 3 voorschrijven
één-op-één nagebouwd — bediening *binnen* de gemeten kolom, `ImageStage`-root met bepaalde hoogte,
beeldvenster als meegroeiend deel — met `* { box-sizing: border-box }` uit
`apps/web/src/styles/index.css:5-9` en elke vaste maat uit de code:

| venster | bovenkant kolom | kolom | kaart | **beeldvenster** | vaste rijen in kaart | onderkant "Accepteer" |
|---|---|---|---|---|---|---|
| 1000, volle kaart (ref + prior + context) | 212 | 772 | 627 | **409** | 218 | 907 (in beeld) |
| 1000, zonder prior-tag en contextknop | 212 | 772 | 627 | **469** | 158 | 907 (in beeld) |
| 1000, ook zonder referentierij | 212 | 772 | 627 | **535** | 92 | 907 (in beeld) |
| **900** (1080p-scherm), volle kaart | 212 | 672 | 527 | **309** | 218 | 807 (in beeld) |
| 800, volle kaart | 212 | 572 | 427 | **209** | 218 | 707 (in beeld) |
| 700, volle kaart | 212 | 472 | 327 | **109** | 218 | 607 (in beeld) |

Twee dingen volgen hieruit.

**(a) AC3 is niet te halen.** Bij venster 1000 blijft er 409 px over; AC3 vraagt 600. Het tekort is
191 px. Zelfs als je de prior-tag, de contextknop **én** de referentierij helemaal weghaalt — geen
van drieën staat in "Wat NIET in deze story zit", maar geen enkel AC vraagt er ook om — kom je op
535 px. De rekensom is sluitend: beeldvenster = 1000 − bovenkant kolom − 16 − 120 (knoprij 56+12 en
relabel-knop 44+8) − vaste rijen in de kaart. Voor 600 px moet de bovenkant van de kolom op ≤ 46 px
staan; de applicatiekop alleen is al 64 px (`AppLayout.tsx:196`).

**(b) Het resultaat is een achteruitgang.** Op een 1080p-scherm (venster ≈ 900 CSS-px) levert deze
constructie 309 px beeldvenster. Vóór 20.12 was dat een vast kader van 440 px
(`MobileReviewDeck.tsx:1201`, `height: '48vh', maxHeight: 440`). De story die het beeld groter moet
maken, maakt het op het gangbaarste scherm dus 130 px kleiner — en AC1 t/m AC10 zien dat niet, want
AC3 is het enige criterium dat een minimumgrootte afdwingt en dat is precies het criterium dat gaat
falen. AC2 ("niet meer afgekapt") is bij 309 px *wel* gehaald: een kleiner beeld is per definitie
niet afgekapt. Dat is de faalmodus van deze story in één regel.

**INFERENCE:** de 212 px boven de kolom is gemodelleerd uit de code (kop 64, paginapadding 24,
titel h2 ~44, sectierij 30, tellerregel + sneltoetsregel 47), niet in de draaiende applicatie
gemeten. De code-review van 20.14 modelleerde 230 px, die van 20.12 las ~365 px van een
schermafbeelding. Elke pixel méér boven de kaart maakt H1 **erger**, nooit beter.

**Moet wijzigen:** AC3 opnieuw vaststellen op een gemeten getal, en de keuze die eronder ligt
expliciet maken in plaats van hem in een onhaalbaar getal te verstoppen. Er is namelijk een echte
afweging: 600 px bij venster 1000 is alléén haalbaar als er hoogte uit de kaart of uit de opmaak
boven de kaart verdwijnt (referentierij 66, prior-tag 30, contextknop 30, titel + sectierij ~74).
Die afweging hoort in het keuzemenu, niet in de spec. Zonder herziening is AC3 een criterium waarvan
nu al vaststaat dat het faalt.

**H2 — AC4's ondergrens levert een overlopende kaart, geen scrollende pagina — high**

`MobileReviewDeck.tsx:71-72` (`FILL_MIN_CARD_HEIGHT = 320`), `:165`, Dev Notes van de story
("de ondergrens voor het beeldvenster"), taak 4.

AC4 zegt: "dan geldt een ondergrens op het beeldvenster … en mag de pagina scrollen". Taak 1 zet
kaart én bediening in één kolom met een **gemeten hoogte**. Die twee eisen samen kunnen niet:
staat de kolomhoogte vast, dan kan een ondergrens op een kind alleen ten koste van de andere
kinderen gaan.

**VERIFIED (zelfde browserproef):** met de vloer van 320 px op het beeldvenster in plaats van op de
kaart:

| venster | kaart | beeldvenster | ruimte over voor de vaste rijen | gevolg |
|---|---|---|---|---|
| 700 | 327 | 320 | **7 px** (nodig: 218) | kaartinhoud loopt over de rand |
| 600 | 227 | 320 | **−93 px** | kaartinhoud loopt over de rand |

De GTIN-regel valt in beide gevallen buiten de onderrand van de kaart en botst op de knoprij. Het
document scrollt weliswaar 34 resp. 134 px, maar dat is de overlopende inhoud, niet de kolom: die
houdt zijn vaste hoogte. Dit is bevinding **L2 van review-20-14** ("de kaart krijgt een vaste hoogte
zonder `overflow`"), die de spec niet meeneemt.

**Moet wijzigen:** AC4 moet zeggen dat de gemeten hoogte in deze stand een **ondergrens** voor de
kolom wordt (`minHeight` i.p.v. `height`), zodat de kolom mág groeien en de pagina echt gaat
scrollen. Anders is "mag de pagina scrollen" niet implementeerbaar naast taak 1. Daarbij hoort de
grens van AC4 (`≤ 600`) aan te sluiten op de bewijspunten van AC1 (1000 en 700): tussen 601 en 900
geldt nu géén ondergrens, en dat is precies de band waarin de meeste laptops zitten — bij venster
700 levert de spec een beeldvenster van 109 px en is AC1 tóch gehaald.

**H3 — AC9 belooft een browsertest die in deze repository niet uitvoerbaar is — high**

`playwright.config.ts:10-31,54-57,86-91`, `tests/e2e/` (16 bestanden), `tests/e2e/helpers/` (**leeg**),
`tests/e2e/reference-library.spec.ts:19-26`, `apps/web/package.json:54-86`.

AC9 presenteert de opzet als aanwezig: "één echte browsertest (Playwright, aanwezig in `tests/e2e/`
+ `playwright.config.ts`)". Playwright staat er, maar de weg naar een beoordeelscherm met een kaart
erin niet:

- **VERIFIED:** geen enkele spec in `tests/e2e/` raakt het reviewscherm.
  `grep -rln "artwork-review\|deck-accept\|/review" tests/e2e/` geeft alleen
  `pipeline-monitoring.spec.ts` (een andere pagina).
- **VERIFIED:** er is geen inlogvoorziening voor e2e — `grep -rn "storageState\|globalSetup\|login("`
  over `tests/e2e/` levert niets, en `tests/e2e/helpers/` is een lege map.
- **VERIFIED:** `reference-library.spec.ts` staat vólledig op `test.skip` met als reden, letterlijk in
  het bestand: het vereist een volledig draaiende stack plus geseede data, en dat was niet
  beschikbaar. Exact dezelfde voorwaarden gelden voor het reviewscherm, dat bovendien een
  ingelogde beheerder én minstens één `ArtworkReviewItem` met `cropPath` + `bbox` nodig heeft
  (`ArtworkReviewPage.tsx:202-243` toont anders een `Alert` of `Empty` in plaats van het deck).
- **VERIFIED:** `playwright.config.ts:24-31` zet zes specs in quarantaine en de kop noteert dat met
  de volledige CI-stack 61 van 89 gevallen slagen.
- **VERIFIED:** er is geen alternatief met minder opzetwerk geïnstalleerd — `@vitest/browser` en
  Playwright component testing staan niet in `apps/web/package.json`; alleen `jsdom` en `happy-dom`.

De story bouwt haar hele geloofwaardigheid op dit ene punt ("Zonder die test is deze story niet af").
Als de ontwikkelaar hem niet kan draaien, is de voorspelbare uitkomst dat hij een `test.skip` of een
jsdom-benadering oplevert en de story alsnog aftekent — de derde herhaling.

**Moet wijzigen:** AC9 moet benoemen *hoe* die browsertest aan een kaart komt, en dat is een keuze
met echte gevolgen: (a) een e2e-test met inlog + geseede data opzetten (eigen story), (b) een kleine
statische harnaspagina die alleen de deck-structuur mount met vaste stubs, of (c) een
meetscript-in-Chrome zoals in deze review, vastgelegd als verifieerbaar artefact. Optie (b) en (c)
zijn dagwerk, (a) niet. Zolang AC9 alleen "Playwright, aanwezig" zegt, is het geen eis maar een
aanname.

### MEDIUM

**M1 — AC7 beschrijft het mechanisme verkeerd: de `X-Context-Window`-map scháált niet mee, hij is schaal-onafhankelijk — medium**

`apps/api/src/api/v1/artwork-pipeline.ts:1046` en `MobileReviewDeck.tsx:652-668`.

AC7 zegt dat de terugrekening blijft kloppen "(de `X-Context-Window`-map schaalt mee)". Dat is niet
wat er gebeurt. De header wordt uitgestuurd als `${left},${top},${rw},${rh},${W},${H}` — alle zes in
**volledige-artwork-pixels**, volstrekt onafhankelijk van `TARGET` en `scale` (`:1012-1018,1046`). De
client rekent een kader terug uit **fracties** van het getoonde fragment:
`x: (left + rel.x * rw) / W` (`:661-664`). Beide kanten zijn schaal-invariant, en dát is precies
waarom AC7 veilig is — niet omdat er iets meeschaalt.

Het onderscheid is niet academisch: een ontwikkelaar die de opdracht "verifieer dat de map meeschaalt"
letterlijk uitvoert, gaat zoeken naar een schaalfactor die er niet is, of voegt er een toe en breekt
daarmee de terugrekening die nu klopt. Wat wél met `scale` meebeweegt is de overlay-rechthoek
(`:1023-1026`, `rx`/`ry`/`rbw`/`rbh` op `dispW × dispH`) — nagerekend en correct op elke `TARGET`.

**Moet wijzigen:** AC7 herformuleren: de header is schaal-onafhankelijk en moet dat blijven; de te
verifiëren invariant is dat een op het fragment getekend kader dezelfde artwork-fracties oplevert bij
`TARGET = 900` en bij `TARGET = 1600`. Dat is toetsbaar zonder browser.

**M2 — AC7 levert geen scherper beeld voor items die de reviewer al bekeken heeft: de ETag verandert niet — medium**

`apps/api/src/api/v1/artwork-pipeline.ts:79-96` (`sendRevalidatingImageHeaders`), aangeroepen op
`:981` vóór de contextfragment-tak.

De ETag is `W/"${item.id}-${item.updatedAt}"` — de fragmentgrootte zit er niet in. Verhoog je `TARGET`
van 900 naar 1600, dan blijft de ETag voor een onveranderd reviewitem identiek en antwoordt de server
`304 Not Modified` (`:91-93`); de browser toont het oude 900-px-fragment. Nieuwe items krijgen het
scherpere fragment, al bezochte items niet — en die tweede groep is precies waarmee iemand
controleert of de story werkt. De `/marked`-tak heeft hier wél een omweg (`?v=` op `editedVersion`,
`MobileReviewDeck.tsx:978-980`); de `/source`-URL heeft die niet.

**Moet wijzigen:** de fragmentgrootte opnemen in de ETag (of in de URL), en dat als voorwaarde onder
AC7 zetten. Anders is de voorspelbare terugkoppeling opnieuw "ik zie geen verschil".

**M3 — geen enkel criterium eist dat het beeld de beschikbare ruimte ook vúlt — medium**

`ImageStage.tsx:288-303` (de `<img>` heeft uitsluitend `maxWidth`/`maxHeight`, nooit `width` of
`height`), `apps/api/src/api/v1/artwork-pipeline.ts:854` (`withoutEnlargement: true`).

AC2 eist "gerenderde beeldhoogte ≤ de hoogte van het beeldvenster" en "zichtbare fractie 100%"; AC3
eist een minimumhoogte van het **venster**. Een `<img>` zonder `width`/`height` schaalt nooit óp
boven zijn bronresolutie, en de server verkleint alleen (`withoutEnlargement`). Een krap
gedetecteerde crop van bijvoorbeeld 220 × 160 px rendert dus op 220 × 160 midden in een grijs kader
van 400+ px — AC2 gehaald, AC3 gehaald, en de reviewer zit alsnog te turen. Dat is dezelfde vorm van
"gehaald zonder dat het gedrag klopt" waarvoor deze story is geschreven.

In de gangbare tak valt het mee: bij een `cropPath` mét `bbox` toont het deck `/marked` op 1600 px
langste zijde (`:933`, `MobileReviewDeck.tsx:976-981`), en dat vult elk kader tot 1600 px. Het gat
zit in de kale-crop-tak (`cropUrl`, geen bbox of `/marked` faalt) en — tot AC7 landt — in het
contextfragment.

**Moet wijzigen:** één criterium toevoegen dat het beeld de kleinste van (venster, bronresolutie)
benut, of expliciet vastleggen dat een kleine bron klein blijft en waarom dat acceptabel is.

**M4 — AC7's omgevingsvariabele en "harde bovengrens" hebben geen naam en geen getal — medium**

AC7 vraagt "instelbaar via een omgevingsvariabele met 1600 als standaard en een harde bovengrens".
Er staat geen variabelenaam en geen bovengrens. Aan dit criterium is te voldoen met een bovengrens van
100 000 — dan is de grens er formeel en beschermt hij niets, terwijl juist de geheugenles uit 20.11
de motivering is. Vergelijk `DEFAULT_CONCURRENCY` (`artwork-pipeline.ts:99-102`), dat de
projectconventie voor zulke variabelen laat zien.

**Moet wijzigen:** naam en bovengrens noemen (bijvoorbeeld 2400, de grens waarboven het fragment
groter wordt dan enig reviewscherm), zodat de eis meetbaar is.

**M5 — AC6 bevat een ontsnappingsluik dat het criterium onweerlegbaar maakt — medium**

AC6: "Dat wordt in deze story rechtgezet **of expliciet als bewuste keuze vastgelegd**." Een
criterium met "of leg uit waarom niet" erin kan niet falen — je schrijft een alinea en het is
gehaald. Dit is dezelfde constructie die review-20-12 als M5 aanmerkte (de mobiele hoogte ging zonder
`isMobile`-guard van `64vh` naar `calc(100vh - 260px)`). Feitelijk is het punt inmiddels bovendien
achterhaald: 20.14 heeft de mobiele tak weer op `48vh`/`440` gezet via de `fillViewport`-prop
(`MobileReviewDeck.tsx:1199-1201`, `:1222`, `:1256`) en `ArtworkReviewPage.tsx:272` geeft
`fillViewport={!isMobile}` mee. Mobiel krijgt `DECK_MAX_IMAGE_HEIGHT` alleen nog in de niet-fill-tak.

**Moet wijzigen:** de keuze nú maken. Beslis of `DECK_MAX_IMAGE_HEIGHT` (`:63`) op mobiel terug moet
naar `'64vh'` en zet dat als enkelvoudige, toetsbare eis in AC6 — of schrap AC6 met de vaststelling
dat 20.14 het al heeft opgelost.

**M6 — AC10 verplicht een testsuite groen te houden die het verlaten 20.12-ontwerp vastlegt — medium**

`apps/web/src/components/review/ImageStage.maxheight-20-12.test.tsx:14-52`.

AC10 eist dat `ImageStage*.test.tsx` groen blijft. Die map bevat
`ImageStage.maxheight-20-12.test.tsx`: vier tests die vastleggen dat de default `'64vh'` is en dat
`maxHeight="calc(100vh - 260px)"` doorloopt tot de `<img>`. Review-20-12 kwalificeerde die suite als
dode letter (H1) en test 4 als tautologie (L2), en review-20-14 stelde vast dat exact deze vorm de
misser liet passeren. Erger: één van de twee oplossingsvormen die review-20-14 aanbeveelt — "het
beeldvenster meten in plaats van een procentwaarde doorgeven" — maakt deze vier tests **rood**. AC10
verbiedt daarmee een legitieme oplossing.

**Moet wijzigen:** in AC10 benoemen welke van deze tests herschreven of verwijderd mogen worden, en
welke echt regressiewaarde hebben. "Alles blijft groen" is hier geen vangnet maar een rem.

**M7 — dit zijn drie stories, en de onjuiste `versions.md`-teksten van 20.12 en 20.14 blijven staan — medium**

**Splitsing.** De story bevat drie brokken met verschillende bestanden, testsuites, risico's en
uitrolpaden:

| deel | inhoud | bestanden |
|---|---|---|
| **A — opmaak** | AC1-AC6, taken 1-6 | `MobileReviewDeck.tsx`, `ImageStage.tsx`, `ArtworkReviewPage.tsx` |
| **B — bronresolutie** | AC7, taak 7 | `apps/api/src/api/v1/artwork-pipeline.ts` + omgevingsvariabele + api-suite |
| **C — meetbare test** | AC9, taak 8 | `tests/e2e/`, `playwright.config.ts`, nieuwe opzet (zie **H3**) |

De knip: **C eerst, dan A, dan B.** C is de reden dat deze story bestaat — zolang niemand pixels kan
meten, is A niet aantoonbaar en herhaalt zich de geschiedenis. B (de api-kant) heeft geen enkele
afhankelijkheid van A en heeft z'n eigen risico's (**M1**, **M2**, **M4**); die in dezelfde story
proppen betekent dat één rode api-test de opmaakfix blokkeert of, waarschijnlijker, dat B er in de
haast bij glijdt. AC7 raakt bovendien álle consumenten van `/source`, niet alleen het deck.

**Bookkeeping.** Review-20-12 eiste onder "Wat moet wijzigen vóór PASS" dat de `versions.md`-tekst
gecorrigeerd wordt. Dat is niet gebeurd. `versions.md:23` belooft de eindgebruiker nog steeds *"Het
beeld benut nu de volledige paginabreedte en vrijwel de hele schermhoogte. De knoppen 'Wijs af' en
'Accepteer' blijven daarbij altijd zichtbaar zonder te scrollen"*, en `versions.md:10-12` (20.14)
*"De knoppen 'Wijs af' en 'Accepteer' blijven altijd in beeld"* — van beide is inmiddels aangetoond
dat ze onwaar zijn. Story 20.15 heeft er geen AC en geen taak voor, en "Wat NIET in deze story zit"
sluit het ook niet uit. Zo blijft de changelog twee beloftes bevatten die de reviewer op zijn scherm
weerlegd ziet.

### LOW

**L1 — de DOM-helft van AC1 is noodzakelijk maar niet voldoende — low.** AC1 vraagt aan te tonen dat
"de knoppen een afstammeling zijn van het element dat de gemeten hoogte draagt". Dat is in jsdom
toetsbaar en het is een goede eis, maar hij sluit de fout niet uit: bij een overlopende kaart
(**H2**) zijn de knoppen afstammeling én onder de vouw. Het echte bewijs zit in de browserhelft
("onderkant van de laagste knop ≤ vensterhoogte") — en dat is precies de helft die volgens **H3** niet
gedraaid kan worden. Formuleer de jsdom-helft als noodzakelijke voorwaarde, niet als bewijs.

**L2 — de overlay-lijndikte blijft 3 px terwijl het fragment ~1,8× groter wordt — low.**
`artwork-pipeline.ts:1030` (`stroke-width="3"`, met een witte halo van 1 px op `:1032`). Die 3 px is
absoluut, dus op een fragment van 1600 px is de rode lijn relatief bijna twee keer zo dun als op 900
px. AC7 stelt dat de overlay "exact blijft kloppen" — positioneel klopt dat (nagerekend op
`:1023-1026`), visueel wordt hij dunner, en juist de leesbaarheid van dat kader is het doel
("in één oogopslag zien of het kader om het juiste logo zit"). Laat de lijndikte meeschalen met
`scale`, of noem het als bewuste keuze.

**L3 — taak 2 repareert één onjuist commentaar en laat het andere staan — low.** Taak 2 vervangt het
commentaar op `:1046-1048`. Maar het commentaarblok op `MobileReviewDeck.tsx:50-63` beweert net zo
hard iets onwaars: *"De knoppen blijven zo zonder scrollen bereikbaar, ook op ~900px hoog (AC2)"* —
de claim die review-20-12 als M1 weerlegde (260 px gereserveerd tegenover ~505 px werkelijke chrome).
Neem `:50-63` mee in taak 2.

**L4 — AC5 noemt geen waarneembare uitkomst, en mist de hermeting zonder resize — low.** AC5 laat de
oplossing open ("herberekenen bij scroll, of meten op een manier die niet van de scrollpositie
afhangt") maar zegt niet wat er dan waar moet zijn; er is geen faalbare uitkomst. Bovendien: de
hoogte boven de kaart verandert óók zonder `resize`-gebeurtenis. **VERIFIED (gemeten):** met de
uitlegalinea erbij staat de bovenkant van de kolom op 270 px in plaats van 212 — 58 px verschil, dus
58 px minder beeld. De huidige listener hangt alleen aan `resize` (`:167-169`). Voor de alinea zelf
is dat gedekt (de deck wordt geremount via `key`, `ArtworkReviewPage.tsx:269`), maar niet voor een
omslaande filterbalk of later ladende fonts — bevinding L1 van review-20-14, die de spec niet
meeneemt.

**L5 — AC8's tweede helft is per constructie onweerlegbaar en het feit is al vastgesteld — low.** AC8
vraagt "de expliciete vaststelling dat er geen layout-sprong optreedt". Een vaststelling is geen test.
Review-20-14 heeft dit onder M4 al **geverifieerd**: de deck bevriest zijn wachtrij
(`MobileReviewDeck.tsx:133`), de pagina toont bij een lege lijst `Empty` in plaats van de deck
(`ArtworkReviewPage.tsx:237,257`) en de `key` op `:269` forceert een remount — de alinea kan dus nooit
verschijnen terwijl er een kaart staat. De testbare helft van AC8 (de test die 20.14 nooit had, op
`review-description`) is legitiem; de vaststelling kan als bronverwijzing.

**L6 — de premisse "alle tests draaien in jsdom" is onnauwkeurig — low.**
`apps/web/vitest.config.ts:16` zet `environment: 'jsdom'`, `apps/web/vite.config.ts:142` zet
`environment: 'happy-dom'` — twee configuraties die elkaar tegenspreken. De conclusie van de story
blijft overeind (ook happy-dom doet geen layout), maar de opruiming van die tegenspraak hoort
genoemd, al is het als open punt.

---

## 2. Claim-audit per acceptatiecriterium

| AC | Verifieerbaar? | Bewijs / bezwaar |
|----|---------------|------------------|
| **AC1** — beslisknoppen binnen het gemeten gebied, bij venster 1000 én 700 | **ja, en haalbaar** | Beste criterium in de story: het eist een structuurwijziging, geen getal, en geeft twee concrete vensterhoogtes plus twee bewijsvormen. Gemeten haalbaar: "Accepteer" komt op 907 (venster 1000) en 607 (venster 700), beide in beeld. Twee kanttekeningen: de DOM-helft alleen sluit de fout niet uit (**L1**), en de browserhelft is niet uitvoerbaar (**H3**). De swipe-hint (`:1385`) wordt in AC1 niet genoemd — bewust of vergeten is niet te zien. |
| **AC2** — beeld niet meer afgekapt, zichtbare fractie 100% bij zoom 1 | **ja, maar te zwak** | Toetsbaar en de aangewezen oorzaak is correct (`maxHeight: '100%'` tegen een ouder zonder bepaalde hoogte, `:1222`/`:1256` → `ImageStage.tsx:255,282,296`). Maar het criterium is monotoon te halen door het beeld kleiner te maken: bij 309 px (**H1**) is er niets afgekapt en is de fractie 100%. Zonder een minimumgrootte die wél haalbaar is, dekt AC2 de wens niet. Zie ook **M3**. |
| **AC3** — beeldvenster ≥ 600 px bij venster 1000 | **verifieerbaar, maar aantoonbaar onhaalbaar** | Gemeten 409 px met de volle kaart; 535 px zelfs zonder referentierij, prior-tag en contextknop. Getal ongewijzigd overgenomen uit 20.14-AC3, waar het al op 558 px strandde — en AC1 kost er nog 120 px bij. → **H1**. |
| **AC4** — ondergrens op het beeldvenster bij venster ≤ 600, pagina mag scrollen | **nee** | Niet implementeerbaar naast taak 1: gemeten levert de vloer een overlopende kaart (7 px resp. −93 px over voor 218 px vaste rijen), geen scrollende pagina. Bovendien laat de drempel `≤ 600` de band 601-900 onbeschermd, waar AC1's eigen bewijspunt 700 in valt met een beeldvenster van 109 px. → **H2**. |
| **AC5** — meting klopt bij scrollen en formaatwijziging | **deels** | De aangewezen oorzaak is echt (`:164` gebruikt `rect.top`, vensterrelatief, met een listener op alleen `resize`, `:167-169`) en review-20-14 M2 heeft het gemeten. Maar het criterium noemt geen faalbare uitkomst en mist de hermeting zonder resize-gebeurtenis (58 px gemeten verschil). → **L4**. |
| **AC6** — mobiel verandert niet | **nee** | Bevat "of expliciet als bewuste keuze vastgelegd" — daarmee kan het niet falen. Feitelijk deels achterhaald: 20.14 heeft de mobiele tak via `fillViewport` weer op `48vh`/`440` gezet (`:1199-1201`, `ArtworkReviewPage.tsx:272`). → **M5**. |
| **AC7** — contextfragment van 900 naar 1600, instelbaar, met bovengrens | **deels — en niet risicovrij zoals opgeschreven** | De kern is veilig, maar niet om de opgegeven reden: de `X-Context-Window`-header staat in artwork-pixels (`:1046`) en de terugrekening werkt met fracties (`:661-664`), dus beide zijn schaal-**onafhankelijk**; er schaalt niets mee (**M1**). Overlay-math nagerekend en correct op elke `TARGET` (`:1023-1026`), lijndikte niet (**L2**). Twee aannames elders die de spec niet noemt: de ETag bevat de fragmentgrootte niet, dus al bezochte items blijven 900 px leveren (**M2**), en variabelenaam plus bovengrens ontbreken (**M4**). De `sharp`-tak op `:1000` (`width: 1200`) wordt correct als ánder pad benoemd — nagelopen en juist. |
| **AC8** — uitlegalinea veroorzaakt geen sprong | **halve** | De testeis (die 20.14 nooit had, op `review-description`) is legitiem. De "expliciete vaststelling" is geen test, en het feit is in review-20-14 M4 al geverifieerd. → **L5**. |
| **AC9** — tests meten effect, niet doorgifte; RED-bewijs; ≥ 1 browsertest | **de eis is scherp, de uitvoerbaarheid niet** | De RED-bewijseis is de sterkste verbetering van deze story en precies het juiste medicijn tegen 20.12/20.14 (waar 63 tests groen bleven ná het terugdraaien van de hele wijziging). Maar de browsertest is in deze repository niet te draaien zonder eigen opzetwerk: geen review-e2e, lege `helpers/`, geen inlog-fixture, `reference-library.spec.ts` volledig geskipt om exact deze reden, geen `@vitest/browser` of component testing. → **H3**. Let ook op: AC9 eist RED-bewijs voor AC1, AC2 en AC3 — voor AC3 kan dat niet, want AC3 gaat niet gehaald worden (**H1**). |
| **AC10** — geen regressie in de genoemde suites + api-suite | **ja, maar deels contraproductief** | Concreet en meetbaar. Maar `ImageStage*.test.tsx` omvat `ImageStage.maxheight-20-12.test.tsx`, dat het verlaten 20.12-ontwerp vastlegt en rood wordt bij één van de aanbevolen oplossingsvormen. → **M6**. |

**Wat de spec goed doet, en wat expliciet is nagelopen en klopt:**

- De vier bevindingen in "Gemeten beginsituatie" zijn alle vier **VERIFIED** in de code:
  `:158-168` (kaarthoogte), `:1291` sluit de kaart / `:1293` opent de knoprij als zusje, het onjuiste
  commentaar op `:1046-1048`, en `maxHeight: '100%'` (`:1222`, `:1256`) tegen `ImageStage.tsx:255`
  zonder bepaalde hoogte. `TARGET = 900` op `:1017` klopt eveneens.
- **Vraag 3 van de opdracht — een gemiste vierde hoogtebegrenzing — is negatief beantwoord.** Alle
  hoogte- en `overflow`-declaraties op het pad zijn geïnventariseerd
  (`grep -n "maxHeight\|height\|overflow\|flex\|minHeight" ImageStage.tsx` plus de keten in het deck):
  kolom/kaart `:1049-1051` → `deck-stage-frame` `:1191-1209` (`flex: 1`, `minHeight: 0`,
  `overflow: hidden`) → `ImageStage`-root `:255` (geen hoogte) → `wrapRef` `:278-286`
  (`maxHeight`, `overflow: hidden`) → `<img>` `:293-302` (`maxHeight`, geen `width`/`height`).
  De `AppLayout`-`Content` (`AppLayout.tsx:335`) heeft géén hoogte of `overflow`, dus het document
  scrollt normaal. Er is geen derde dak zoals de 440 die 20.12 miste. Wat er nog *wel* zit is een
  begrenzing van een andere soort: het beeld kan niet opschalen (**M3**).
- De diagnose van de oorzaak-achter-de-oorzaak (jsdom doet geen layout, dus de tests konden alleen
  doorgifte meten) is juist en is de reden dat AC9 de belangrijkste regel van de story is.

---

## 3. Wat er moet wijzigen vóór dev

1. **H1** — AC3 opnieuw vaststellen. 600 px bij venster 1000 is met AC1 erbij niet haalbaar (gemeten
   409). Leg de onderliggende keuze voor: welke vaste rijen mogen weg (referentierij 66, prior-tag 30,
   contextknop 30, titel + sectierij ~74), of accepteren we een kleiner getal? Voeg daarbij een
   criterium toe dat het beeldvenster bij venster ≈ 900 **niet kleiner** wordt dan de 440 px van vóór
   20.12 — zonder die ondergrens levert deze story een achteruitgang op het gangbaarste scherm.
2. **H2** — AC4 herschrijven: de gemeten hoogte wordt in de fill-stand een **ondergrens** voor de
   kolom (`minHeight`), zodat de pagina echt kan scrollen in plaats van de kaart te laten overlopen.
   Laat de drempel aansluiten op de bewijspunten van AC1, zodat de band 601-900 niet onbeschermd
   blijft.
3. **H3** — AC9 concreet maken: benoem hóe de browsertest aan een gerenderde kaart komt, en erken dat
   de bestaande e2e-opzet daar niet klaar voor is (geen review-spec, lege `helpers/`, geen
   inlog-fixture, `reference-library.spec.ts` volledig geskipt). Kies één van de drie routes uit
   **H3** en zet die in de taken. Zonder dit vervalt de enige waarborg van deze story.
4. **M7** — splitsen in A (opmaak), B (bronresolutie) en C (meetbare test), in de volgorde **C → A → B**.
   Voeg in A of als aparte regel het rechtzetten van `versions.md:10-12` en `:23` toe — beide beloftes
   zijn aantoonbaar onwaar en staan er nog.
5. **M1 + M2 + M4** — AC7 repareren: (a) de invariant is dat de `X-Context-Window`-map
   schaal-**onafhankelijk** blijft, niet dat hij meeschaalt; (b) de fragmentgrootte moet in de ETag
   (of de URL), anders zien al bezochte items geen verbetering; (c) variabelenaam en harde bovengrens
   noemen met een getal.
6. **M3** — een criterium toevoegen dat het beeld de beschikbare ruimte ook benut (tot de
   bronresolutie), of expliciet vastleggen dat kleine bronnen klein blijven en waarom.
7. **M5** — AC6 tot één toetsbare eis terugbrengen: mobiel terug naar `'64vh'`, of AC6 schrappen omdat
   20.14 het via `fillViewport` al heeft opgelost. Het luik "of expliciet vastleggen" moet eruit.
8. **M6** — in AC10 benoemen welke tests uit `ImageStage.maxheight-20-12.test.tsx` mogen sneuvelen;
   "alles blijft groen" verbiedt nu een van de aanbevolen oplossingen.
9. **L1-L6** — kleine reparaties: de jsdom-helft van AC1 als noodzakelijke voorwaarde formuleren (L1),
   de overlay-lijndikte mee laten schalen of als keuze noemen (L2), het onjuiste commentaar op
   `:50-63` meenemen in taak 2 (L3), AC5 een faalbare uitkomst geven plus hermeting zonder resize
   (L4), AC8's "vaststelling" vervangen door een bronverwijzing naar review-20-14 M4 (L5), en de
   tegenspraak jsdom/happy-dom tussen `vitest.config.ts:16` en `vite.config.ts:142` als open punt
   noteren (L6).

---

## Verificatie-aantekening

**VERIFIED (gemeten in een echte browser).** Chrome for Testing 1234 uit deze repository
(`chromium_headless_shell-1234`, gedreven door `playwright@1.49.1` uit `node_modules`). Een losse
HTML-proef bouwt de structuur na die de story voorschrijft — taak 1 (kaart én bediening binnen één
gemeten kolom), taak 3 (`ImageStage`-root met bepaalde hoogte, beeldvenster als meegroeiend deel),
taak 4 (vloer op het beeldvenster) — met `* { box-sizing: border-box }` uit
`apps/web/src/styles/index.css:5-9` en elke vaste maat overgenomen uit de code: kaart `border: 4` /
`padding: 12` (`:1036-1052`), koprij + `marginBottom: 8` (`:1062-1075`), referentierij `padding: 6` /
`border: 1` / 44 px beeld (`:1104-1156`), prior-tag (`:1163-1175`), contextknop 24 px (`:1177-1190`),
`deck-stage-frame` `border: 1` / `overflow: hidden` (`:1191-1209`), GTIN-regel `marginTop: 8`
(`:1288-1290`), knoprij 56 px + `marginTop: 12` (`:1293-1368`), relabel-knop 44 px + `marginTop: 8`
(`:1371-1383`), swipe-hint (`:1385`), `FILL_BOTTOM_GAP = 16` (`:70`), `FILL_MIN_CARD_HEIGHT = 320`
(`:71-72`). Hieruit komen alle pixelgetallen in **H1**, **H2** en **L4**. Het meetscript stond buiten
de repository; er is niets in het project gewijzigd.

**VERIFIED (in de code nagelopen, op `23592d4`).** De vier punten uit "Gemeten beginsituatie" van de
story; de volledige keten van hoogte- en `overflow`-declaraties tussen kaart en `<img>`; het ontbreken
van een derde vast hoogtedak; `AppLayout.tsx:335` (`Content` zonder hoogte/`overflow`);
`X-Context-Window` in artwork-pixels (`artwork-pipeline.ts:1046`) en de fractie-terugrekening
(`MobileReviewDeck.tsx:652-668`); de overlay-math (`:1023-1026`); de ETag-samenstelling (`:79-96`);
`withoutEnlargement` op `:854`; de e2e-inventaris (`tests/e2e/`, lege `helpers/`, `testIgnore` in
`playwright.config.ts:24-31`, de skip-reden in `reference-library.spec.ts:19-26`); het ontbreken van
`@vitest/browser` en Playwright component testing in `apps/web/package.json`; de vier tests in
`ImageStage.maxheight-20-12.test.tsx`; en de twee `versions.md`-passages (`:10-12`, `:23`).

**INFERENCE / gemodelleerd.** De opmaak *boven* de kaart is uit de code gereconstrueerd op 212 px
(applicatiekop 64, paginapadding 24, titel ~44, sectierij 30, teller- en sneltoetsregel 47) en niet in
de draaiende applicatie gemeten; review-20-14 modelleerde 230 px, review-20-12 las ~365 px van een
schermafbeelding. Elke pixel méér boven de kaart maakt **H1** en **H2** ernstiger, nooit milder. De
antd-onderdelen (`Tag`, `Button size="small"`, `Typography`) zijn met hun standaard-lijnhoogtes
nagebouwd, niet met de echte themawaarden.

**NIET geverifieerd.** Het gedrag in de draaiende applicatie op ACC (geen deploy, geen inlog binnen
deze review) — de tabellen in H1/H2 gelden voor de nagebouwde structuur, niet voor een gemeten
scherm. Ook niet gedraaid: de vitest-suites (`MobileReviewDeck*`, `ImageStage*`,
`ArtworkReviewPage.test.tsx`) en de api-suite rond `artwork-pipeline` — AC10 is dus als *formulering*
beoordeeld, niet als uitkomst. En niet gemeten: de werkelijke bronresoluties van crops en
contextfragmenten in productie; **M3** leunt op `withoutEnlargement: true` (`:854`) en op het
ontbreken van `width`/`height` in `ImageStage.tsx:288-303`, niet op gemeten beelden.
