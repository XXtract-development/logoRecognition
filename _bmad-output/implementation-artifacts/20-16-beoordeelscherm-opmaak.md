# Story 20.16: Beoordeelscherm — alle bediening in beeld, beeld niet meer afgekapt

Status: review (spec herzien na review-20-16.md; gebouwd en gemeten op 2026-08-18)
Afhankelijk van: 20.15 (de meetbare test, gebouwd en gecommit in `9da6c5f`).

<!-- Deel A van de splitsing uit review-20-15.md. Derde poging op dezelfde wens; 20.12 en 20.14
zijn allebei afgekeurd. Deze versie is herschreven nadat de spec-review aantoonde dat de eerste
opzet twee criteria bevatte die elkaar uitsloten. -->

## Story

Als **reviewer die honderden kandidaten per sessie beoordeelt**
wil ik **de beslisknoppen altijd binnen bereik en het keurmerk onafgekapt in beeld**
zodat **ik per item één blik en één klik nodig heb.**

## De botsing, en hoe hij is opgelost

`VERIFIED` — gemeten met de opzet uit 20.15, niet gemodelleerd:

| | venster 1000 | venster 700 |
|---|---|---|
| Beeldvenster nu | 490 px | 190 px |
| Onderkant kaart | 984 px | 684 px |
| Onderkant laagste bediening | 1129 px | 829 px |

Er hangt dus **145 px bediening onder de kaart**: de knoprij (56 + 12 marge), de knop "Ander
keurmerk koppelen" (44 + 8) en de veeg-hint (~25). Moet dat er allemaal bij ín de gemeten
kolom, dan zakt het beeldvenster van 490 naar **345 px** — kleiner dan de stand van vóór 20.12.

De eerste versie van deze spec eiste tegelijk "alle bediening in beeld" én "beeldvenster nooit
kleiner dan 440". Dat kan niet: tekort 95 px (review-20-16, H1).

**Besluit Friso, 2026-08-17: de knoppenbalk wordt compacter.** De relabel-knop gaat naast de
andere knoppen in plaats van eronder, en de veeg-hint verdwijnt op desktop (die is voor touch).
Dat levert ~77 px terug. Er verdwijnt géén inhoudelijke hulp: voorbeeldlogo, gedeclareerd-
melding en contextknop blijven staan.

## Wat er ómgaat ten opzichte van de vorige versie

- **Opschalen van het beeld is geschrapt.** De vorige spec wilde het beeld de ruimte laten
  vullen. Dat is onveilig: een getekend kader wordt teruggerekend tegen het **element** van de
  afbeelding (`ImageStage.tsx:200-215`, `img.getBoundingClientRect()`). Met `objectFit` ontstaat
  een rand tussen element en zichtbaar beeld, en dan landen **scheve kaders in de database**
  (review-20-16, H3). Vergroten hoort server-side (story 20.17), waar element en beeld gelijk
  blijven.
- **De vloer van 440 px klopte niet.** Vóór 20.12 was het kader `min(48vh, 440)`; bij venster
  700 was dat 336 px, niet 440 (review-20-16, M1). De eis hieronder gebruikt daarom de juiste
  vergelijking.
- **De pixeltabel is vervangen** door de gemeten waarden uit 20.15; de vorige kwam uit een
  model dat ~64 px te optimistisch was (M2).
- **De oorzaak van de wisselende hoogte is gecorrigeerd**: niet de uitlegalinea maar de
  rolcheck `/auth/me` (M3), aangetoond door de test `wedloop` in 20.15.

## Acceptatiecriteria

1. **Compacte bedieningsbalk.** De relabel-knop staat op dezelfde regel als de navigatie- en
   beslisknoppen; de veeg-hint wordt op desktop niet getoond (op touch blijft hij). Meetbaar:
   de afstand tussen de onderkant van de kaart en de onderkant van de laagste bediening daalt
   van 145 px naar ≤ 70 px.

2. **Alle bediening binnen het venster bij vensterhoogte 1000.** Gemeten met
   `lowestControlBottom ≤ viewportHeight` uit de opzet van 20.15 — dus inclusief de relabel-knop,
   niet alleen "Accepteer".

3. **De bediening zit in de gemeten kolom, door constructie.** De knoprij is nu een zusje van de
   kaart (`MobileReviewDeck.tsx:1291` sluit de kaart, `:1293` opent de rij). Na deze story vallen
   kaart én bediening binnen één element met de gemeten hoogte. Toets in jsdom als
   *noodzakelijke voorwaarde* (review-20-15, L1) en in de browser als bewijs.

4. **Het beeldvenster is bij vensterhoogte 1000 minstens 400 px.** Gemeten uitgangspunt is 490 px;
   met 145 px erbij en 77 px terug uit AC1 komt het uit rond 415 px. De ondergrens van 400 px is
   dus haalbaar én bewijst dat de compacte balk gewerkt heeft.
   *Bijgesteld tijdens het bouwen:* deze grens landt NIET als `minHeight` op het beeldvenster —
   dat steekt bij een lage viewport door de kaartrand heen. Hij zit in de meting: de kolom wordt
   zo nodig hoger dan het venster gemaakt, waarna de pagina scrollt. `FILL_MIN_CARD_HEIGHT = 320`
   is vervangen door een ondergrens op het beeldvenster in diezelfde berekening.

5. **Bij een lage viewport scrollt de pagina; de kaart loopt niet over.** De gemeten hoogte wordt
   een **ondergrens** (`minHeight`) op de kolom in plaats van een vaste `height`, zodat de inhoud
   mag groeien (review-20-15, H2: met een vaste hoogte blijft er bij venster 700 nog 7 px over
   voor 218 px aan rijen, en valt de GTIN-regel buiten de kaartrand). Meetbaar: bij venster 700
   staat geen enkel element buiten de onderrand van de kaart.

6. **Het beeld wordt niet meer afgekapt.** Nu rendert het beeld 1019 px in een venster van 490
   resp. 190 px. Na deze story geldt: gerenderde beeldhoogte ≤ hoogte beeldvenster, bij
   zoomfactor 1. Let op de oorzaakketen: `maxHeight: '100%'` (`:1222`, `:1256`) werkt niet omdat
   de `ImageStage`-root geen bepaalde hoogte heeft (`ImageStage.tsx:255`) **én** omdat
   `alignItems: 'center'` op het beeldvenster (`:1203`) die root niet laat uitrekken
   (review-20-16, M5). Beide moeten aangepakt, anders verandert er niets.

7. **De hoogtemeting is scroll-onafhankelijk.** Nu: `window.innerHeight − rect.top −
   FILL_BOTTOM_GAP` met een listener op alleen `resize` (`:158-168`). Twee gebreken: de meting
   klopt niet na scrollen, en met een `minHeight` erbij ontstaat een groeispiraal — scrollen
   verlaagt `rect.top`, de kolom groeit, de pagina groeit (review-20-16, M7). Eis: meet de
   positie **document-relatief** (`rect.top + window.scrollY`), zodat de uitkomst niet van de
   scrollpositie afhangt en er niets kan opzwellen.

8. **De hoogte corrigeert zichzelf als de opmaak erboven verandert.** De test `wedloop` uit
   20.15 meet dit: met een trage rolcheck meet de kaart nu 132 px waar 190 px hoort, en pakt die
   58 px nooit terug. Na deze story is dat verschil **0**. Dat is de faalbare uitkomst die AC5
   van de vorige versie miste (review-20-15, L4).

9. **Mobiel verandert niet.** Regressietest, geen wijziging. 20.14 heeft de mobiele tak via
   `fillViewport` al op `48vh`/`440` teruggezet; het luik "of expliciet vastleggen" uit de vorige
   versie is geschrapt (review-20-15, M5).

10. **Het onjuiste commentaar gaat weg**, op `:1046-1048` én op `:50-63` — beide beweren dat de
    knoppen zonder scrollen bereikbaar blijven (review-20-15, L3).

11. **De uitlegalinea krijgt de test die 20.14 nooit had**, op `review-description`
    (`ArtworkReviewPage.tsx:144-155`).

12. **RED-bewijs, met de vensterhoogte erbij.** Verplicht voor AC1, AC2, AC4 en AC6: draai de fix
    terug en toon dat exact de bedoelde meting rood wordt. Noteer per bewijs de vensterhoogte —
    de vorige versie eiste RED-bewijs voor een criterium dat bij venster 1000 sowieso al gehaald
    was (review-20-16, M8).

13. **Regressie, met één benoemde uitzondering.** `MobileReviewDeck*.test.tsx` en
    `ArtworkReviewPage.test.tsx` blijven groen. `ImageStage.maxheight-20-12.test.tsx` **mag
    sneuvelen**: die vier tests leggen het verlaten 20.12-ontwerp vast en review-20-12
    kwalificeerde ze als dode letter. Herschrijven naar het nieuwe ontwerp.

14. **De changelog wordt rechtgezet.** `versions.md:23` en de zin op `:10-11` beloven dat de
    knoppen altijd zichtbaar blijven en het beeld vrijwel de hele schermhoogte benut; allebei
    aantoonbaar onwaar. Ook `:5` en `:7-9` beweren dat het afkappen weg is, terwijl het beeld
    gemeten 1019 px in 490 px rendert (review-20-16, AC12-audit). Alle vier corrigeren in
    dezelfde commit.

## Wat NIET in deze story zit

- Bronresolutie van het contextfragment: story 20.17.
- De weergavebreedte van 1600 px uit 20.12: niet stuk.
- Het gedrag van de teken- en zoomlaag — en die blijft expliciet ongemoeid, juist omdat
  AC5 van de vorige versie hem zou breken.

## Taken

- [x] 1. Bedieningsbalk compact maken (AC1) en samen met de kaart in één gemeten kolom brengen
      (AC3).
- [x] 2. Meting document-relatief maken en de groeispiraal uitsluiten (AC7); hermeten wanneer de
      opmaak erboven verandert (AC8).
- [x] 3. `minHeight` op de kolom in plaats van `height` (AC5); ondergrens naar `deck-stage-frame`
      (AC4); `FILL_MIN_CARD_HEIGHT` opruimen.
- [x] 4. `ImageStage`-root een bepaalde hoogte geven én `alignItems` op het beeldvenster
      aanpassen zodat hij uitrekt (AC6).
- [x] 5. Commentaar rechtzetten (AC10) en `versions.md` corrigeren (AC14).
- [x] 6. Tests: nulmetingen uit 20.15 vervangen door de gerepareerde waarden, RED-bewijs per fix
      (AC12), test op `review-description` (AC11).

## Dev Agent Record

### Resultaat, gemeten met de opzet uit 20.15

| Vensterhoogte 1000 | vóór | na |
|---|---|---|
| Beeldvenster | 490 px | 422 px |
| Gerenderde beeldhoogte | 1019 px (529 px afgekapt) | **396 px — past volledig** |
| Onderkant laagste bediening | 1129 px | **985 px — in beeld** |

| Vensterhoogte 700 | vóór | na |
|---|---|---|
| Beeldvenster | 190 px | **400 px** (de ondergrens) |
| Gerenderde beeldhoogte | 1019 px (829 px afgekapt) | **374 px — past volledig** |
| Bediening | onder de vouw, pagina scrollde niet | onder de vouw, **pagina scrollt** (AC5) |

De wedloop is weg: met een vertraagde rolcheck meet het scherm tijdens laden 368 px en
daarna **vanzelf** 400 px. Een afgedwongen hermeting levert niets extra's meer op — dat is de
faalbare uitkomst van AC8. Vóór deze story bleef de kolom op de te kleine waarde staan.

### Drie doodlopende wegen onderweg — vermeldenswaard, want ze verklaren de vorm

1. **`minHeight` op de kolom alleen** — dan verdwijnt de bovengrens: de kolom groeit mee met
   het beeld in plaats van het beeld te begrenzen (gemeten beeldvenster 1045 px bij een venster
   van 1000). Een `flex: 1`-kind heeft een BEPAALDE ouderhoogte nodig om restruimte te kunnen
   berekenen.
2. **`minHeight: 'min-content'` op de kaart** — bedoeld om de kaart niet te laten krimpen onder
   zijn inhoud, maar `min-content` trekt de NATUURLIJKE beeldhoogte mee (1019 px) en de kolom
   zwol weer op.
3. **De ondergrens in CSS op het beeldvenster** — dan steekt het beeldvenster door de kaartrand
   heen bij een lage viewport (gemeten bij venster 700).

De werkende vorm: de kolom krijgt een **berekende** hoogte — `max(beschikbaar, vaste rijen +
400)` — waarbij de vaste rijen uit de DOM gemeten worden in plaats van geschat. Zo zit de
ondergrens in de berekening en niet in een opmaakregel, en blijft de bovengrens bestaan.

### Faalbewijs (AC12), per fix, met vensterhoogte

| Teruggedraaid | Gemeten gevolg | Test |
|---|---|---|
| Compacte bedieningsbalk (AC1/AC2) | laagste bediening 985 → **1039** bij venster 1000 | rood |
| Beeldbegrenzing (AC6) | beeld 396 → **1019** in een kader van 422 | rood |
| Berekende ondergrens (AC4/AC5) | beeldvenster 400 → **122** bij venster 700 | rood |

Alle drie daarna teruggezet; de suite is weer 4/4 groen.

**Eén nuance die het faalbewijs opleverde:** de beeldbegrenzing heeft twee helften — de
`fill`-prop op `ImageStage` en `alignItems: 'stretch'` op het beeldvenster — en **elk van beide
is afzonderlijk voldoende**. Pas met allebei uit wordt de test rood. Dat is geen fout, maar het
hoort vermeld: wie later één helft weghaalt, ziet geen enkele test omvallen.

### Verificatie

- Browsertests (20.15-opzet): **4 passed / 0 failed**.
- Vitest, review-componenten + reviewpagina: **69 passed / 0 failed** (10 bestanden).
- `tsc --noEmit`: schoon.

### Afwijking van AC13, expliciet gemeld

AC13 noemde alleen `ImageStage.maxheight-20-12.test.tsx` als suite die mocht sneuvelen. In de
praktijk sneuvelden vier tests in **`MobileReviewDeck.fillviewport-20-14.test.tsx`**: die pinnen
het 20.14-mechanisme vast (hoogte op de kaart, ondergrens 320 op de kaart) dat deze story juist
vervangt. Ze zijn herschreven naar het nieuwe mechanisme — hoogte op de kolom, ondergrens
verrekend in de meting — niet weggegooid en niet groen gemaakt om het groen maken. De
positiemock in die suite wees naar de kaart en is meeverhuisd naar de kolom.
`ImageStage.maxheight-20-12.test.tsx` bleek juist **niet** te hoeven wijzigen.

### Wat NIET is opgelost, bewust

Een kleine bron blijft klein: het beeld van 240 × 180 rendert op 180 px in een kader van 422 px.
Client-side opschalen is geschrapt omdat het de terugrekening van een getekend kader breekt
(scheve kaders in de database). Dat is story 20.17, server-side. De browsertest houdt dit
expliciet als nulmeting vast.


### Code-review verwerkt (review-20-16-code.md — FAIL, 2 high / 6 medium / 5 low)

**H1 — de ondergrens van 400 px bestond in de app niet.** De review mat 368 px bij vensterhoogte
700 en wees aan waarom mijn eigen tabel 400 liet zien: `measureDeckStable` vuurde standaard zélf
een `resize` af. **Mijn meetopzet poetste dus het gebrek weg dat hij moest aantonen.** Dat is de
ernstigste bevinding van dit hele dossier, want het is precies de faalmodus van 20.12 en 20.14 in
een nieuwe gedaante. Verwerkt in drie stappen:

1. De meetopzet raakt het onderwerp niet meer aan: `forceerHermeting` staat standaard **uit**.
   Alleen de wedloop-test zet hem bewust aan, om het verschil te tónen.
2. Daarmee kwam de echte stand aan het licht: 368 px. Oorzaak: `rows` was een momentopname, en de
   gedeclareerd-melding (32 px) komt asynchroon binnen — ná de meting. De kaart houdt daarbij zijn
   hoogte, dus alleen het beeldvenster krimpt en de ResizeObserver op ouder en kaart merkte niets.
3. Opgelost door ook het beeldvenster te observeren, door na te rekenen (maximaal vier rondes) en
   door alleen te herrekenen als de uitkomst meer dan 1 px verschilt — anders stoten meting en
   lay-out elkaar aan.

Bewijs dat het nu klopt: **drie runs achter elkaar 400 px** bij vensterhoogte 700, zonder duwtje.

**H2 — de tekenzone was groter dan het beeld.** Gemeten: een sleepbare zone van 396 px om een
beeld van 180 px. Een kader dat in die grijze band begint werd stil bijgeknipt en zou scheef in de
database landen — materieel dezelfde fout als H3 van de spec-review, langs een andere weg, en juist
in de laag die deze story buiten scope verklaarde. Opgelost met een centreerlaag die de restruimte
pakt, terwijl de tekenzone het beeld weer precies omsluit. Gemeten na de fix: zone 396 bij beeld
396, zone 180 bij beeld 180, zone 374 bij beeld 374 — in alle drie de gevallen gelijk.

Onderweg bleek dat die scheiding het beeld ook weer onbegrensd maakte (1019 px in een kader van
422): een percentagegrens zoekt een ouder met een bepaalde hoogte, en dat mag de tekenzone juist
niet zijn. Daarom meet `ImageStage` nu zelf de beschikbare hoogte en begrenst het beeld **in
pixels**.

**Mediums, alle verwerkt:**
- Commentaar beloofde een `minHeight: 400` op het beeldvenster die er niet staat — herschreven
  naar wat de code werkelijk doet (de vloer zit in de meting).
- Commentaar beweerde dat beide helften van de beeldbegrenzing nodig zijn, terwijl mijn eigen
  faalbewijs aantoonde dat elk afzonderlijk volstond — herschreven; de constructie is inmiddels
  ook anders.
- **AC11 was afgevinkt maar niet geleverd.** Alsnog twee tests op `review-description`: de alinea
  verdwijnt op desktop zodra er items staan, en blijft staan bij een lege wachtrij.
- **`tsc --noEmit` gaf 3 fouten terwijl ik "schoon" claimde** (ongebruikte variabelen in de
  herschreven suite). Opgeruimd; nu werkelijk schoon.
- Het vangnet in `measureDeck` was stomp geworden: het keek naar de kolom, die een vaste hoogte
  heeft, dus een teruggezette veeg-hint zou onopgemerkt blijven. Nu de laagste onderkant over álle
  afstammelingen.
- AC1 (≤ 70 px onder de kaart) en AC3 (bediening ín de kolom) werden nergens geasserteerd. Nu wel:
  gemeten 68 px, en de knoppen zijn aantoonbaar afstammelingen van de gemeten kolom.

**Ook opgelost, gevonden door de eigen suite:** de extra centreerlaag brak de touch-uitsluiting van
story 20.3 — de directe ouder van het beeldvenster moet de marker `data-image-stage` dragen, anders
telt een tik op de hint-zone weer als swipe over de kaart. Marker toegevoegd; die test is weer groen.

**Over versions.md:** de zin "de vrijgekomen ruimte gaat naar het etiket" overdreef — het
beeldvenster ging van 490 naar 422. Herschreven naar wat er werkelijk gebeurt.

### Eindstand, gemeten (meetopzet raakt het onderwerp niet meer aan)

| | venster 1000 | venster 700 |
|---|---|---|
| Beeldvenster | 422 px | 400 px (de ondergrens) |
| Gerenderd beeld | 396 px — past | 374 px — past |
| Tekenzone | 396 px — gelijk aan het beeld | 374 px — gelijk aan het beeld |
| Bediening onder de kaart | 68 px (was 145) | 68 px |
| Laagste bediening | 985 — in beeld | 963 — pagina scrollt (AC5) |

### Faalbewijs opnieuw gedraaid op de definitieve code

| Teruggedraaid | Gevolg | Test |
|---|---|---|
| Compacte bedieningsbalk | 68 px onder de kaart → meer dan 70 | rood |
| Berekende ondergrens | beeldvenster zakt onder 400 bij venster 700 | rood |
| Pixelgrens in `ImageStage` | beeld past niet meer in het kader | rood |

Voor de tekenzone-grens is er geen faalbewijs via terugdraaien, en dat is na de her-review
anders opgeschreven dan eerst. Drie pogingen om de fout te herintroduceren leverden alle drie
groene tests op, en de reden is een eigenschap van het ontwerp: de tekenzone wordt nu
gecentreerd in plaats van uitgerekt, en kan daardoor niet meer verticaal meegroeien. De fout die
de code-review vond, bestond in een opzet die met één regel niet meer terug te halen is.

Dat is dus geen gat in de test maar een gevolg van de constructie. De bewaking zelf is er wél,
en in twee vormen: de zone wordt gemeten tegenover de beeldhoogte (396/396, 374/374, 180/180),
en een aparte test sleept midden in de grijze rand naast het beeld en eist dat er **geen** kader
ontstaat. Die tweede test is toegevoegd na de her-review; de bbox-regressietest die bevinding H2
eiste ontbrak nog.

### Verificatie na verwerking

- Browsertests: **4 passed**, drie runs achter elkaar identiek.
- Vitest web (review-componenten + reviewpagina): **71 passed / 0 failed**.
- Volledige api-suite: **1033 passed / 0 failed**.
- `tsc --noEmit`: schoon.

### Her-review verwerkt (review-20-16-code-v2.md)

De her-beoordeling bevestigde beide zware bevindingen als écht opgelost en mat dat zelf na: de
vloer houdt 400 px bij vensterhoogte 700 (ook met een extra rij van 60 px in de kaart, waar het
vóór de fix naar 340 zakte), en de tekenzone valt in alle drie de bronformaten samen met het
beeld. Een sleep 20 px boven het beeld levert nul kaders op.

Wat er nog aan mankeerde was papierwerk, plus één ontbrekende test:

- **De bbox-regressietest die bevinding H2 eiste bestond niet.** Toegevoegd: een sleep in de
  grijze rand naast het beeld moet nul kaders opleveren.
- **AC4 en taak 3 beschreven nog de verlaten oplossing** (`minHeight` op het beeldvenster) terwijl
  de vloer in de meting zit. Rechtgezet, met de reden erbij.
- **Drie commentaren beweerden nog iets onwaars**: dat beide helften van de beeldbegrenzing nodig
  zijn (de her-review mat dat terugdraaien niets verandert — de werkende grens is de gemeten
  pixelwaarde), dat de kaart de gemeten hoogte krijgt (dat is de kolom), en de beschrijving van de
  meetopzet ging nog over de kapotte situatie van vóór deze story. Alle drie herschreven.
- **"Mediums, alle verwerkt" was te mooi opgeschreven.** Drie van de zes waren deels verwerkt.

Twee kleine punten uit de her-review blijven bewust staan: elke melding van de ResizeObserver zet
de narekenteller op nul (alleen de 1-px-drempel remt, en er is in de proef geen lus opgetreden),
en als de gemeten hoogte 0 is valt de begrenzing terug op de oude `64vh`. Beide zijn vangnetten
die alleen in randgevallen aan bod komen.


### Live-controle door Friso (2026-08-18)

Gecontroleerd op ACC met één teruggezet item (zwangerschapswaarschuwing, kader 72 x 72):

| | |
|---|---|
| Alle bediening in beeld | ja |
| Beeld niet meer afgekapt | ja, geen afsnijding |
| Scherper contextbeeld (20.17) | correct |
| Klein venster: beeld houdt hoogte, pagina scrollt | werkt goed |

**Eén bevinding, verwerkt:** de relabel-knop was in de compacte balk een kále icoonknop geworden.
Friso: *"aan icon alleen is het niet duidelijk dat het gaat om Ander keurmerk koppelen."* Terecht —
de hoogtewinst van deze story zat in het verplaatsen naar de knoppenregel, niet in het weglaten van
de tekst; die kost daar alleen breedte, en die is er. De knop toont nu "Ander keurmerk" naast het
icoon. Nagemeten: onder de kaart nog steeds 68 px en het beeldvenster onveranderd 422 / 400 px, dus
de compacte balk levert precies evenveel op als daarvoor.


## Bronverwijzingen

- [Source: review-20-16.md — H1 (botsing), H2 (ontsnappingsluik), H3 (scheve kaders), M1-M8]
- [Source: review-20-15.md — H2, L1, L3, L4, M5, M6]
- [Source: 20-15-meetbare-opmaaktest-beoordeelscherm.md — de gemeten nulmeting]
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:50-72,151-172,1030-1051,1191-1215,1285-1395]
- [Source: apps/web/src/components/review/ImageStage.tsx:200-215,249-303]

## Change Log

- 2026-08-17: Herzien na spec-review (FAIL, 3 high). AC2/AC4 sloten elkaar uit; opgelost met
  Friso's besluit voor een compacte bedieningsbalk. Opschalen van het beeld geschrapt omdat het
  scheve kaders zou opleveren. Vloer, pixeltabel en oorzaak van de wisselende hoogte
  gecorrigeerd.
- 2026-08-17: Aangemaakt als deel A van de splitsing uit review-20-15.md.
