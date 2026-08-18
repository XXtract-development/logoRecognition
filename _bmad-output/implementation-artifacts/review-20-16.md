# Adversariële SPEC-review — Story 20.16 (beoordeelscherm: knoppen in beeld, beeld benut de ruimte)

- **Reviewer:** adversarial spec review (BMAD), 2026-08-17
- **Story:** `_bmad-output/implementation-artifacts/20-16-beoordeelscherm-opmaak.md` (status `draft`)
- **Code-basis:** branch `acc`, HEAD `9da6c5f`
- **Scope:** de SPEC getoetst tegen de echte code én tegen de **gemeten** nulmeting uit story 20.15
  (`tests/e2e/review-deck-layout.spec.ts`, `tests/e2e/helpers/review-deck.ts`). Er is niets
  geïmplementeerd. Vierde poging op dezelfde wens (20.12 FAIL, 20.14 FAIL, 20.15-groot afgekeurd).

```
verdict: FAIL
severity_count: { high: 3, medium: 8, low: 5 }
```

FAIL omdat de story de botsing die haar bestaansreden is **verplaatst maar niet oplost**: hij erkent
de ruil bij 900, maar rekent hem niet na op de gemeten getallen — en dan blijkt hij ook bij 1000 te
bestaan, precies waar AC2 het tegendeel eist.

1. **AC2 en AC4 sluiten elkaar uit bij vensterhoogte 1000.** Uit de gemeten nulmeting van 20.15
   volgt dwingend: zodra de 145 px bediening die nu ónder de kaart hangt binnen de gemeten kolom
   komt (AC1/AC2), houdt het beeldvenster **345 px** over. AC4 eist 440. Het tekort is 95 px, en
   Friso's besluit ("er verdwijnt niets van het scherm") sluit de enige uitweg af. Dit is
   letterlijk dezelfde faalvorm als H1 van review-20-15, één story verderop.
2. **AC5 kan per constructie niet falen én maakt AC10 onhaalbaar.** "Opgeschaald tot het venster
   **of** klein met een vastgelegde reden" — kiest de ontwikkelaar de tweede tak, dan verandert er
   geen regel code en is er geen RED-bewijs te leveren, terwijl AC10 dat expliciet voor AC5 eist.
   Dat is het ontsnappingsluik dat review-20-15 als M5 afkeurde, terug in een ander criterium.
3. **De andere tak van AC5 breekt stilzwijgend de kaderterugrekening.** Een beeld dat het venster
   vult krijgt `width`/`height` + `objectFit`; dan valt de gerenderde `<img>`-rechthoek niet meer
   samen met het zichtbare beeld, en `ImageStage.tsx:204-212` rekent een getekend kader om met
   precies die rechthoek. Uitkomst: verkeerde `bbox`-fracties in de database. "Het gedrag van de
   teken- en zoomlaag" staat in *Wat NIET in deze story zit*, en geen enkel criterium bewaakt het.

Wat de story wél goed doet: de afweging staat er eindelijk expliciet in, AC1 is een structuureis in
plaats van een getal, AC10 (RED-bewijs) en AC11 (welke tests mogen sneuvelen) zijn de juiste
medicijnen tegen 20.12/20.14, en de code-verwijzingen kloppen stuk voor stuk — `:1291`/`:1293`,
`:1201`, `:1046-1048`, `:50-63`, `ImageStage.tsx:255`, `:288-303` zijn alle nagelopen en juist.

---

## 1. Bevindingen

### HIGH

**H1 — AC2 (alles in beeld bij venster 1000) en AC4 (beeldvenster ≥ 440) kunnen niet gelijktijdig waar zijn: gemeten blijft er 345 px over — high**

Bronnen: de gemeten nulmeting in `20-15-meetbare-opmaaktest-beoordeelscherm.md:120-135`
(beeldvenster **490**, onderkant laagste bediening **1129**, bij venster 1000),
`MobileReviewDeck.tsx:164-165` (`avail = innerHeight − rect.top − 16`), `:1049-1051` (kaart met
gemeten hoogte), `:1291` (kaart sluit) / `:1293` (knoprij begint als zusje), `:1371`, `:1385`.

**VERIFIED (gemeten in 20.15, Chrome):** bij venster 1000 is het beeldvenster 490 px en staat de
onderkant van de laagste bediening op 1129.

**AFGELEID (deterministisch, niet zelf gemeten):** de onderkant van de kaart ligt op
`innerHeight − FILL_BOTTOM_GAP` = **984** — onafhankelijk bevestigd door de gemeten
`acceptBottom` van 1053 (= 984 + 12 marginTop + 56 knophoogte + afronding). Er hangt dus
**1129 − 984 = 145 px** bediening onder de kaart: knoprij (12 + 56), relabel-knop (8 + 44) en
swipe-hint (8 + ~17). Elk van die maten is vast (`:1293`, `:1299`, `:1380`, `:1385`).

| venster | beeldvenster nu | ná AC1/AC2 (bediening in de kolom) | AC4 eist | tekort |
|---|---|---|---|---|
| 1000 | 490 | **345** | 440 | **95 px** |
| 900 (1080p) | 390 | **245** | 440 | 195 px |
| 700 | 190 | **45** | 440 | 395 px |

De kolom kent maar één elastisch kind (`deck-stage-frame`, `flex: 1`, `:1199-1200`); alle andere
rijen hebben een vaste hoogte. Die 145 px kan dus alleen van het beeldvenster af. Gevolg:

- Kies je AC2, dan is het beeldvenster 345 px en faalt AC4 — én is het resultaat op élk scherm
  kleiner dan de 440 van vóór 20.12, exact de achteruitgang die review-20-15 H1 verbood.
- Kies je AC4, dan groeit de kolom 95 px en staat de laagste bediening op ~1079 bij een venster van
  1000 — AC2 faalt, gemeten met precies de test die 20.15 heeft opgeleverd.

De story erkent de ruil alléén bij 900 ("op een 1080p-scherm blijven de knoppen dan niet vanzelf in
beeld") en schrijft daarboven "past alles, dan past alles". Bij 1000 past het níet, en AC2 beweert
onvoorwaardelijk van wel. Dit is geen formuleringskwestie: het is hetzelfde onhaalbare criterium
als 20.14-AC3 en 20.15-AC3, nu 95 px in plaats van 191 px mis.

Merk ook op dat de story haar eigen tabel (409 / 309 / 109) overneemt uit de **gemodelleerde**
proef van review-20-15, terwijl 20.15 inmiddels de echte getallen heeft — zie **M2**. Het model was
64 px te optimistisch; het probleem is dus groter dan de spec laat zien.

**Moet wijzigen:** de botsing bij 1000 expliciet beslechten in plaats van hem bij 900 te laten
beginnen. Dit is een echte keuze met reële gevolgen en hoort in het keuzemenu, niet in de spec:
(a) AC4 verlagen tot een gemeten haalbaar getal (345 bij 1000); (b) AC4 handhaven en AC2 laten
vervallen — dan scrollt de reviewer op élk scherm per item; (c) alsnog hoogte vrijmaken boven of in
de kaart (referentierij, prior-tag, contextknop, titelblok), wat Friso's besluit van 17 augustus
tegenspreekt; (d) de vloer schaalmatig maken (zie **M1**).

**H2 — AC5 bevat een ontsnappingsluik dat AC10 onuitvoerbaar maakt — high**

AC5: "wordt hij opgeschaald tot het venster **of** blijft hij klein met een vastgelegde reden."
AC10: "RED-bewijs verplicht voor AC2, AC4, **AC5** en AC6: draai de fix terug en toon dat exact de
bedoelde meting rood wordt."

Kiest de ontwikkelaar de tweede tak, dan is er geen fix om terug te draaien en dus geen RED-bewijs.
De bestaande meting (`review-deck-layout.spec.ts:108-127`, "kleine bron": 240 × 180 rendert op 180
in een venster van 490, 310 px onbenut) blijft dan gewoon groen — de nulmeting wordt bevestigd in
plaats van vervangen. Twee criteria in dezelfde story die elkaar uitsluiten, en de tak die niets
kost is de tak die een gehaaste ontwikkelaar kiest. Dit is woordelijk dezelfde constructie die
review-20-15 onder **M5** afkeurde ("of expliciet als bewuste keuze vastgelegd").

**Inhoudelijk is de keuze bovendien niet neutraal**, en dat hoort de spec te zeggen: een bron van
240 × 180 uitvergroten naar een venster van 440 px hoog is een factor 2,4 — dat is interpolatie van
bestaande pixels, geen extra informatie, en het levert een wazig beeld waarop de reviewer juist
minder ziet dan nu. De echte oplossing voor kleine bronnen zit aan de serverkant
(`artwork-pipeline.ts:854`, `withoutEnlargement: true`) en dus in 20.17.

**Moet wijzigen:** de keuze nú maken en één toetsbare eis overhouden. Aanbeveling: leg vast dat het
beeld het venster vult tot de **bronresolutie** (dus grote bronnen wél, kleine niet), schrap AC5 uit
de RED-lijst van AC10 en verplaats de kleine-bron-winst naar 20.17. Dan blijft de nulmeting
"kleine bron" staan als bewuste, gedocumenteerde stand in plaats van als open eis.

**H3 — de andere tak van AC5 breekt de kaderterugrekening, en dat staat buiten scope zonder dat iets het bewaakt — high**

`ImageStage.tsx:288-303` (de `<img>` heeft nu uitsluitend `maxWidth`/`maxHeight`, géén `width`/
`height`), `:204-212` (`confirm`), `:189-193` (`dbl`, zoom om het beeldmiddelpunt),
`MobileReviewDeck.tsx:1229` (`applyContextAnnotation`) en `:1263` (`applyAnnotation`).

Vandaag valt de layoutrechthoek van de `<img>` exact samen met het zichtbare beeld: zonder
`width`/`height` krimpt het element mee met de inhoud. Daarop leunt de terugrekening:

```
const ir = img.getBoundingClientRect();
const x0 = clamp01((left - ir.left) / ir.width);
```

Laat je het beeld het venster vullen op de gangbare manier (`width: 100%`, `height: 100%`,
`objectFit: 'contain'`), dan wordt `ir` het **hele venster** inclusief de grijze randen naast of
onder het beeld. Elke `x0/y0/width/height` die de reviewer tekent verschuift en krimpt dan
stilzwijgend — en die fracties gaan naar de database als de nieuwe `bbox` van het keurmerk. Geen
foutmelding, geen rode test: de crops komen scheef binnen en dat merkt niemand vóór de volgende
oogst. Ook `dbl` (`:189-193`) centreert de zoom dan op het midden van het venster in plaats van op
het beeld.

De story zegt in *Wat NIET in deze story zit*: "Het gedrag van de teken- en zoomlaag." Dat is
precies de laag die AC5 aanraakt. Geen enkel AC en geen enkele regressietest dekt het af; AC11
noemt alleen `MobileReviewDeck*`, `ArtworkReviewPage` en `ImageStage.maxheight-20-12`.

**Moet wijzigen:** AC5 moet de implementatievorm binden (bijvoorbeeld: het beeld schaalt via de
*breedte/hoogte van het beeldelement zelf*, zodat `getBoundingClientRect()` het beeld blijft
beschrijven — niet via `objectFit` met een groter element), en er moet een criterium bij dat een
getekend kader dezelfde artwork-fracties oplevert vóór en ná de wijziging. Dat is meetbaar in
dezelfde browsertest: teken een kader op vaste coördinaten en vergelijk de doorgegeven fracties.

### MEDIUM

**M1 — "440 px is de stand van vóór 20.12" klopt alleen bij grote vensters — medium**

`MobileReviewDeck.tsx:1201`: `{ height: '48vh', maxHeight: 440 }`. De effectieve hoogte was dus
`min(48vh, 440)`: bij venster 900 was dat **432**, bij 700 **336**, bij 600 **288**. De 440 werd
alleen gehaald vanaf een venster van ongeveer 917 px. AC4 maakt van een schaalende grens een vaste
vloer, en juist bij de kleine vensters (waar de vloer de pagina laat scrollen, AC3) is die vloer
**strenger dan het herstelpunt waaraan hij zich beroept**. Bij venster 700 eist AC4 440 px waar het
scherm vóór 20.12 336 px gaf.

**Moet wijzigen:** ofwel de vloer formuleren als `min(48vh, 440)` — dan is het echt "de stand van
vóór 20.12" en scrollt de pagina bij 700 aanzienlijk minder — ofwel expliciet zeggen dat de vaste
440 een verzwaring is, met de reden erbij.

**M2 — de centrale pixeltabel is de gemodelleerde, niet de gemeten — medium**

De story presenteert onder "De afweging die 20.12 en 20.14 verstopten" een tabel met `VERIFIED`
(409 / 309 / 109) en de bron "review-20-15, H1, gemeten in Chrome op de voorgeschreven structuur".
Dat was een **nagebouwde** structuur (review-20-15, Verificatie-aantekening: "de tabellen gelden
voor de nagebouwde structuur, niet voor een gemeten scherm"). Story 20.15 heeft daarna de échte
applicatie gemeten en komt op andere getallen; herrekend voor de structuur die deze story
voorschrijft is het 345 / 245 / 45 (**H1**). De spec draagt dus het optimistische model als bewijs,
terwijl de story waarvan hij afhankelijk is de pessimistische werkelijkheid al heeft vastgelegd.

**Moet wijzigen:** de tabel vervangen door de gemeten nulmeting van 20.15 plus de herrekening, en
de bronregel aanpassen. Anders rekent de ontwikkelaar met 409 en denkt hij dat AC4 bij 1000 met
31 px marge haalbaar is.

**M3 — AC7 wijst de verkeerde oorzaak aan; 20.15 heeft die attributie al weerlegd — medium**

AC7: "na scrollen en na het verschijnen of verdwijnen van **de uitlegalinea** (gemeten verschil
58 px, review-20-15 L4)". Story 20.15 heeft dat onder H3 van haar eigen code-review expliciet
gecorrigeerd: de uitlegalinea kan nooit naast een kaart staan (`ArtworkReviewPage.tsx:148` —
`isMobile || items.length === 0`), en de werkelijke bron is de **rolcheck** `/auth/me`, waarvan de
melding "Beoordelen vereist beheerdersrechten" (`ArtworkReviewPage.tsx:187-196`) boven het deck
staat zolang hij loopt. Dáár komen de 58 px vandaan, en dáárop is de test `wedloop` gebouwd
(`review-deck-layout.spec.ts:129-162`, `authDelayMs`). 20.15 noteert letterlijk: "Repareren hoort
bij 20.16 AC7" — en 20.16 AC7 noemt de rolcheck niet.

Gevolg: een ontwikkelaar die AC7 letterlijk leest, gaat de alinea onderzoeken, vindt niets, en levert
een AC7 af die met de bestaande test niet in verband staat.

**Moet wijzigen:** AC7 herschrijven op de rolcheck, met de faalbare uitkomst die de test al kent:
het verschil tussen de meting bij montage (met vertraagde rolcheck) en na een afgedwongen hermeting
is **0**.

**M4 — de aangewezen oplossing noemt niet wáár de 440-vloer landt, en laat een tegenstrijdige constante staan — medium**

`MobileReviewDeck.tsx:1199-1201` (`flex: 1, minHeight: 0`), `:71-72`
(`FILL_MIN_CARD_HEIGHT = 320`), `:165` (`Math.max(FILL_MIN_CARD_HEIGHT, avail)`).

AC3 verplaatst `height` → `minHeight` op de kolom. Dat alléén levert AC4 niet: het beeldvenster is
een flexkind met `flex: 1` (dus `flex-basis: 0`), waardoor zijn inhoud níet bijdraagt aan de
inhoudshoogte van de kolom. De kolom blijft dan exact op zijn minimum staan en het beeldvenster
krijgt gewoon de restruimte — 345 px. De vloer moet dus als `minHeight: 440` op
`deck-stage-frame` zelf; pas dan groeit de kolom eroverheen en gaat de pagina scrollen.

Daarmee wordt `FILL_MIN_CARD_HEIGHT = 320` betekenisloos tot tegenstrijdig: een kaart met een
beeldvenster van 440 plus ~218 px vaste rijen plus 145 px bediening is minstens ~800 px hoog, dus
een vloer van 320 op de kaart doet nooit meer iets. De spec noemt de constante nergens. Dit is exact
het type overgeslagen begrenzing dat de vorige ronde een extra story kostte.

**Moet wijzigen:** in AC3/AC4 benoemen op welk element de vloer komt, en `FILL_MIN_CARD_HEIGHT`
expliciet verwijderen of herdefiniëren.

**M5 — AC6 benoemt de oorzaak maar de oplossingsrichting raakt hem niet — medium**

`ImageStage.tsx:255` (root: `width: 100%`, `display: flex`, `flexDirection: column`, **geen
hoogte**), `MobileReviewDeck.tsx:1202-1204` (`display: flex`, `alignItems: 'center'`,
`justifyContent: 'center'` op het beeldvenster), `ImageStage.tsx:282` en `:296` (`maxHeight`).

Het beeldvenster centreert zijn kind op de kruis-as; dat kind rekt dus **niet** uit. Ook mét een
bepaalde (of minimale) hoogte op de kolom blijft de `ImageStage`-root een hoogte-auto element, en
blijft `maxHeight: '100%'` daaronder oplossen naar "geen grens" — precies zoals nu. De story
schrijft onder AC6 wel de diagnose op, maar de "aangewezen oplossing" (kolom + `minHeight`) laat de
keten `frame → ImageStage-root → wrapRef → img` ongemoeid. Er moet ook iets aan `:255`/`:1203`
gebeuren (uitrekken in plaats van centreren, plus `minHeight: 0`).

**Moet wijzigen:** AC6 of de bijbehorende taak laten zeggen dat de bepaalde hoogte tot aan de
`<img>` moet doorlopen, met `ImageStage.tsx:255` en `MobileReviewDeck.tsx:1203` erbij als de twee
plekken waar de keten nu breekt.

**M6 — AC3 en de scroll-helft van AC7 hebben geen meetbare uitkomst in de opzet van 20.15 — medium**

`tests/e2e/helpers/review-deck.ts:261-281` (`DeckMeasurement`) meet: vensterhoogte, beeldvenster,
beeldafmetingen, onderkanten van accept/relabel/deck, kaartonderkant en twee zichtbaarheidsvlaggen.
Er is **geen** grootheid voor documenthoogte/scrollruimte, en geen voor "loopt de kaartinhoud buiten
de kaartrand". AC3's uitkomst ("de kaartinhoud loopt niet meer buiten de rand en de pagina kan echt
scrollen") is daarmee niet te toetsen zonder de helper uit te breiden, en AC10 vraagt er ook geen
RED-bewijs voor. Hetzelfde geldt voor de scroll-helft van AC7: de opzet scrollt nergens.

**Moet wijzigen:** ofwel AC3/AC7 een uitkomst geven die de bestaande grootheden gebruiken (bv.
`cardBottom ≥ lowestControlBottom` en `document.scrollingElement.scrollHeight > innerHeight`),
ofwel de uitbreiding van `measureDeck` als taak opnemen. Een criterium waarvoor geen meting bestaat
is in dit dossier al twee keer fataal geweest.

**M7 — AC3 (`minHeight`) plus "hermeten na scrollen" (AC7) levert een groeiende pagina — medium**

`MobileReviewDeck.tsx:161-165`: `avail = window.innerHeight − el.getBoundingClientRect().top − 16`,
met `rect.top` vensterrelatief. Wordt die berekening (zoals AC7 suggereert) ook bij `scroll`
uitgevoerd terwijl AC3 er een `minHeight` van maakt, dan geldt: scrollen omlaag verlaagt `rect.top`
→ `avail` groeit → de kolom groeit → de pagina wordt hoger → er valt méér te scrollen. Een
zelfversterkende lus, met als zichtbaar gevolg een pagina die tijdens het scrollen blijft uitdijen.
Het commentaar op `:161-163` waarschuwt al tegen de spiegelvariant (corrigeren met `scrollY`).

**Moet wijzigen:** AC7 moet de meetwijze binden — meten ten opzichte van het document (eenmalig,
plus bij verandering van de opmaak erboven via een `ResizeObserver`), niet ten opzichte van het
venster bij elke scroll — en expliciet vastleggen dat de kolomhoogte niet van de scrollpositie mag
afhangen.

**M8 — AC10's RED-bewijs voor AC4 is bij venster 1000 niet te leveren, en de vensterhoogte ontbreekt in AC4 — medium**

AC4 noemt geen vensterhoogte. De huidige stand is bij venster 1000 al 490 px, dus een toets
"beeldvenster ≥ 440" is op de **onveranderde** code groen — er valt niets rood te maken door de fix
terug te draaien. RED-bewijs voor AC4 kan alleen bij venster 700 (gemeten 190). Erger: nádat AC1/AC2
zijn doorgevoerd wordt diezelfde toets bij 1000 rood (345), en dat is dan geen bewijs maar **H1**.

**Moet wijzigen:** AC4 per vensterhoogte formuleren en in AC10 vastleggen op welke hoogte het
RED-bewijs geldt.

### LOW

**L1 — AC2 zegt "de laagste knop", de meetopzet meet de laagste bediening inclusief de swipe-hint — low.**
`review-deck.ts:348-360` neemt bewust de onderkant van het héle deck, want onder "Accepteer" staan
nog de relabel-knop en de hint (`MobileReviewDeck.tsx:1371`, `:1385`). Dat is een verbetering die
20.15 na een code-review heeft aangebracht; AC2's formulering ("de laagste **knop**") maakt hem
weer ongedaan en scheelt ~25 px. Schrijf "de laagste bediening, zoals `measureDeck` die meet".

**L2 — AC12 dekt maar de helft van de onware changelog — low.** `versions.md:10-11` (*"De knoppen
'Wijs af' en 'Accepteer' blijven altijd in beeld."*) en `:23` zijn **VERIFIED** onwaar. Maar in
dezelfde alinea staan `:5` (*"Het beoordeelscherm gebruikt nu ook de volle hoogte"*) en `:7-9`
(*"Er zat een vaste hoogtegrens omheen die de onderkant van het etiket wegknipte. Die grens is
weg"*) — en de nulmeting toont dat het beeld nog steeds 1019 px rendert in een venster van 490 px,
dus nog steeds wordt afgekapt. Neem de hele alinea mee. (Terzijde: de bewering staat op regel 10-11;
regel 12 is leeg.)

**L3 — AC9's test bewijst niets over hoogte — low.** `review-description` rendert alleen bij een
lege wachtrij of op mobiel (`ArtworkReviewPage.tsx:148`). Een test daarop is een prima
regressietest, maar hij raakt het scherm mét kaart per definitie niet — schrijf dat erbij, anders
lijkt AC9 bij te dragen aan de opmaakclaim.

**L4 — AC11 laat de `ImageStage`-default buiten beschouwing — low.**
`ImageStage.maxheight-20-12.test.tsx` mag sneuvelen, terecht. Maar één van die tests legt de
default `maxHeight = '64vh'` vast (`ImageStage.tsx:76`), en die default beschermt **andere**
gebruikers van de component. Zeg in AC11 dat de default ongewijzigd blijft en dat alleen de
deck-specifieke doorgifte-tests vervallen.

**L5 — de afhankelijkheid is nog niet rond: 20.15 staat op `review` en draait lokaal niet — low.**
`20-15-...md:3` (status `review`) en `:186-199`: het commando slaagt in CI maar niet op deze
machine, want de root-config verwacht chromium-revisie 1148 en die staat niet in de cache;
`npx playwright install chromium` is een download en is niet gedaan. AC10 (RED-bewijs) van deze
story is daarmee lokaal niet uitvoerbaar. Noem dat als voorwaarde onder "Afhankelijk van", zodat de
ontwikkelaar er niet halverwege tegenaan loopt en alsnog naar jsdom uitwijkt — de faalmodus die dit
hele dossier draagt.

---

## 2. Claim-audit per acceptatiecriterium

| AC | Verifieerbaar? | Bewijs / bezwaar |
|----|---------------|------------------|
| **AC1** — bediening als afstammeling van de gemeten kolom | **ja** | De beste eis van de story: structuur, geen getal. Code-verwijzingen `:1291`/`:1293` **VERIFIED**. In jsdom als noodzakelijke voorwaarde plus browsertest is precies de vorm die review-20-15 L1 vroeg. `measureDeck` blijft werken: het meet de onderkant van de ouder van de kaart, en die omvat de bediening ook ná verplaatsing. |
| **AC2** — laagste knop binnen het venster bij 1000 | **verifieerbaar, maar niet gelijktijdig met AC4** | Gemeten haalbaar op zichzelf (de kolom eindigt op `innerHeight − 16`), maar dan is het beeldvenster 345 px. → **H1**. Formulering "knop" i.p.v. "bediening": → **L1**. |
| **AC3** — gemeten hoogte als ondergrens (`minHeight`) | **deels** | De richting is juist en repareert H2 van review-20-15. Maar: er staat niet op welk element de vloer van AC4 landt (**M4**), `FILL_MIN_CARD_HEIGHT = 320` blijft onbesproken (**M4**), er is geen meetbare uitkomst voor "de pagina scrollt echt" (**M6**), en met een scroll-hermeting ontstaat een groeispiraal (**M7**). |
| **AC4** — beeldvenster nooit kleiner dan 440 | **verifieerbaar, maar botst met AC2 en berust op een onjuist herstelpunt** | Gemeten-afgeleid 345 px bij venster 1000 zodra AC1/AC2 gelden (**H1**). De 440 was vóór 20.12 alleen de waarde bij vensters ≥ ~917; `min(48vh, 440)` gaf 336 bij venster 700 (**M1**). Vensterhoogte ontbreekt, waardoor RED-bewijs bij 1000 onmogelijk is (**M8**). |
| **AC5** — beeld benut de ruimte tot de bronresolutie | **nee** | "of blijft klein met een vastgelegde reden" maakt het criterium onweerlegbaar en AC10's RED-eis onhaalbaar (**H2**); de andere tak bedreigt de kaderterugrekening in `ImageStage.tsx:204-212` (**H3**). De feitelijke correctie in de story (grote bronnen vullen het kader al via `/marked` op 1600 px) is **VERIFIED** juist. |
| **AC6** — beeld wordt niet afgekapt | **ja** | Meetbaar met de bestaande grootheden (`imageHeight ≤ stageFrameHeight`; nulmeting 1019 tegen 490) en de aangewezen oorzaak is **VERIFIED** (`maxHeight: '100%'` op `:1222`/`:1256` tegen `ImageStage.tsx:255` zonder hoogte). Maar de voorgestelde oplossing raakt die keten niet (**M5**). Let op de monotone valkuil die review-20-15 al noemde: een kleiner beeldvenster maakt AC6 vanzelf waar. |
| **AC7** — meten klopt bij scrollen en veranderende opmaak | **deels — en de oorzaak is verkeerd benoemd** | De uitlegalinea is niet de bron; de rolcheck `/auth/me` is dat, en 20.15 heeft dat gecorrigeerd en er een deterministische test voor (**M3**). De scroll-helft is niet meetbaar in de opzet (**M6**) en de naïeve implementatie is schadelijk (**M7**). Het gemeten verlies van 58 px is **VERIFIED** (20.15). |
| **AC8** — onjuist commentaar weg | **ja** | Beide passages **VERIFIED** onwaar: `:1046-1048` ("Daardoor blijven de knoppen per definitie in beeld (AC4)") en `:50-63` ("ook op ~900px hoog"). Neem `:71-72` mee als **M4** wordt doorgevoerd. |
| **AC9** — test op `review-description` | **ja, maar zwak** | `ArtworkReviewPage.tsx:144-155` **VERIFIED**. Het is een regressietest voor een element dat nooit naast een kaart staat; het draagt niets bij aan de opmaakclaim (**L3**). Het laten vervallen van de "vaststelling" is terecht (review-20-15 L5). |
| **AC10** — RED-bewijs voor AC2, AC4, AC5, AC6 | **deels** | De juiste eis, en de opzet van 20.15 kan hem voor AC2 en AC6 ook echt dragen. Voor AC5 kan hij niet (**H2**), voor AC4 niet op de genoemde vensterhoogte (**M8**), en lokaal draait de suite nog niet (**L5**). |
| **AC11** — regressie, met `ImageStage.maxheight-20-12` als uitzondering | **ja** | Concreet en het repareert M6 van review-20-15. Eén aanvulling: de default `'64vh'` beschermt andere consumenten en moet blijven (**L4**). |
| **AC12** — changelog rechtzetten | **ja** | `versions.md:10-11` en `:23` **VERIFIED** aanwezig en aantoonbaar onwaar. Onvolledig: `:5` en `:7-9` beloven hetzelfde over het afkappen en blijven staan (**L2**). |

---

## 3. Wat er moet wijzigen vóór dev

1. **H1** — de botsing tussen AC2 en AC4 beslechten op de **gemeten** getallen (345 px bij venster
   1000, niet 409). Dit is een productkeuze en hoort in het keuzemenu: kleiner beeld met alles in
   beeld, of 440 px met scrollen op élk scherm, of alsnog hoogte vrijmaken (tegen het besluit van
   17 augustus in), of een schalende vloer (**M1**).
2. **H2** — AC5 tot één tak terugbrengen. Aanbeveling: "vult het venster tot de bronresolutie",
   kleine bronnen expliciet naar 20.17, en AC5 uit de RED-lijst van AC10.
3. **H3** — AC5 de implementatievorm laten binden zodat de `<img>`-rechthoek het beeld blijft
   beschrijven, plus een criterium dat een getekend kader dezelfde artwork-fracties oplevert
   (`ImageStage.tsx:204-212`). Anders raakt deze story de teken-laag die hij buiten scope verklaart.
4. **M1 + M2** — het herstelpunt eerlijk maken (`min(48vh, 440)` was de werkelijke stand vóór 20.12)
   en de gemodelleerde pixeltabel vervangen door de gemeten nulmeting van 20.15 plus de herrekening.
5. **M3** — AC7 op de rolcheck herschrijven, met de faalbare uitkomst die de test `wedloop` al kent
   (verschil 0), en de uitlegalinea-attributie schrappen.
6. **M4 + M5** — benoemen waar de 440-vloer landt (`deck-stage-frame`, `minHeight`), wat er met
   `FILL_MIN_CARD_HEIGHT` gebeurt, en dat de bepaalde hoogte moet doorlopen tot de `<img>`
   (`ImageStage.tsx:255`, `MobileReviewDeck.tsx:1203`).
7. **M6 + M7 + M8** — AC3 en AC7 uitkomsten geven die de meetopzet kán meten (of `measureDeck`
   uitbreiden als taak), de meetwijze binden zodat de kolomhoogte niet van de scrollpositie afhangt,
   en AC4/AC10 per vensterhoogte formuleren.
8. **L1-L5** — "laagste bediening" in plaats van "laagste knop" (L1), de hele changelog-alinea in
   AC12 (L2), bij AC9 vermelden dat die test niets over hoogte zegt (L3), de `ImageStage`-default
   `'64vh'` in AC11 beschermen (L4), en de lokale uitvoerbaarheid van de 20.15-suite als voorwaarde
   opnemen (L5).

---

## Verificatie-aantekening

**VERIFIED (in de code nagelopen, op `9da6c5f`).** Alle regelverwijzingen van de story:
`MobileReviewDeck.tsx:50-63` (onjuist commentaar), `:63` (`DECK_MAX_IMAGE_HEIGHT`), `:70-72`
(`FILL_BOTTOM_GAP`, `FILL_MIN_CARD_HEIGHT`), `:153-170` (meting met alleen een `resize`-listener),
`:1030-1052` (kaart met gemeten hoogte), `:1046-1048` (onjuist commentaar), `:1191-1209`
(beeldvenster, `flex: 1`/`minHeight: 0`, `alignItems: center`, `overflow: hidden`), `:1201`
(`height: '48vh', maxHeight: 440`), `:1222`/`:1256` (`maxHeight: '100%'`), `:1291`/`:1293`/`:1371`/
`:1385` (kaart sluit, bediening als zusje), `ImageStage.tsx:76` (default `'64vh'`), `:204-212`
(kaderterugrekening), `:249-303` (root zonder hoogte, `wrapRef`, `<img>`),
`ArtworkReviewPage.tsx:144-155` (`review-description`), `:148` (alinea alleen bij lege wachtrij of
mobiel), `:187-196` (rolcheck-melding), `:267-273` (`fillViewport={!isMobile}`), en
`versions.md:5,7-11,23`.

**VERIFIED (gemeten door story 20.15, overgenomen).** Beeldvenster 490 (venster 1000) en 190
(venster 700), beeldhoogte 1019, onderkant "Accepteer" 1053/753, onderkant laagste bediening
1129/829, kleine bron 240 × 180 → 180 px met 310 px onbenut, en het blijvende verlies van 58 px bij
een trage rolcheck. Bron: `20-15-meetbare-opmaaktest-beoordeelscherm.md:120-135` en
`tests/e2e/review-deck-layout.spec.ts`.

**AFGELEID (deterministische rekensom, niet zelf gemeten).** De 145 px bediening onder de kaart
(1129 − 984) en daarmee de 345 / 245 / 45 px beeldvenster ná AC1/AC2. De afleiding steunt op twee
dingen die in de code vaststaan: de kaart eindigt op `innerHeight − FILL_BOTTOM_GAP` (`:164-165`,
`:70`) en alle rijen behalve het beeldvenster hebben een vaste hoogte (`:1293`, `:1299`, `:1380`,
`:1385`). De tussenstap is onafhankelijk gecontroleerd tegen de gemeten `acceptBottom` van 1053
(984 + 12 + 56), die op één pixel na uitkomt.

**NIET geverifieerd.** De testsuite is in deze review **niet gedraaid** — de metingen zijn
overgenomen uit het story-record van 20.15, niet opnieuw uitgevoerd (de chromium-revisie ontbreekt
lokaal, zie **L5**, en installeren is een download). Ook niet gemeten: het gedrag na de voorgestelde
wijziging (er is niets geïmplementeerd), het gedrag op ACC, de werkelijke bronresoluties van crops
in productie, en het effect van `objectFit` op de kaderterugrekening — **H3** is redenering op de
code (`ImageStage.tsx:204-212` gebruikt `img.getBoundingClientRect()`), geen browserproef. Er is in
deze review niets aan de code of aan de tests gewijzigd.
