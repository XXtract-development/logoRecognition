# Story 20.17: Contextbeeld dat een klein keurmerk ook écht groot toont

Status: review (spec herzien na review-20-17.md; gebouwd en gemeten op 2026-08-18)
Afhankelijk van: 20.15 (meetopzet). Onafhankelijk van 20.16 — raakt alleen de serverkant.

## Story

Als **reviewer die een kader moet controleren of corrigeren**
wil ik **het keurmerk groot genoeg zien om het te herkennen**
zodat **ik niet inzoom op een beeld dat de server al klein heeft gemaakt.**

## De aanname die de vorige versie onderuit haalde

`VERIFIED` (review-20-17, H1, gemeten met de `sharp` uit deze repository): de schaalfactor is
geklemd op 1 (`artwork-pipeline.ts:1018`, `Math.min(1, TARGET / max(rw, rh))`). Het uitgeknipte
gebied is 5 × de kadergrootte (`:1010-1015`, marge 2,5 × per zijde). Daaruit volgt dat de
werkelijke begrenzing `min(5 × kader, TARGET)` is — **niet** TARGET.

Gevolg, gemeten:

| Kadergrootte | 900 → 1600 |
|---|---|
| ≤ 180 px | **byte-identiek** — geen enkele winst |
| mediaan | ~1,49 × |
| ≥ 320 px | volle winst |

De vorige spec ("zet de grens van 900 naar 1600") had dus voor precies de gevallen waar het om
gaat — kleine keurmerken — **geen effect**. Ook het RED-bewijs was onmogelijk: de enige
bestaande test op dit endpoint gebruikt een kader van 80 × 60, dus een venster van 500 × 500,
dat bij élke grens groen blijft.

**Besluit Friso, 2026-08-17: de server mag vergroten.** Een klein uitgeknipt gebied wordt
opgeschaald, zodat het keurmerk echt groter op het scherm komt. De prijs is een zachter beeld
(pixels worden geïnterpoleerd) en dat is bewust aanvaard. Vergroten mag **alleen server-side**:
daar blijven het element en het zichtbare beeld even groot, zodat de terugrekening van een
getekend kader exact blijft — client-side vergroten zou scheve kaders opleveren (zie 20.16).

## Acceptatiecriteria

1. **Kleine uitsneden worden opgeschaald.** De klem op 1 vervalt: een venster kleiner dan de
   doelmaat wordt vergroot in plaats van ongemoeid gelaten. Meetbaar: bij een kader van 100 px
   (venster 500 px) is het geleverde fragment aantoonbaar groter dan nu — dit is precies het
   geval dat vandaag byte-identiek blijft.

2. **De vergroting heeft een bovengrens in factor én in pixels.** Twee knoppen, allebei met een
   naam en een getal:
   - `CONTEXT_FRAGMENT_MAX_PX`, standaard **1600**, hard geklemd op **2400**;
   - `CONTEXT_FRAGMENT_MAX_UPSCALE`, standaard **3**, hard geklemd op **4**.
   Een venster van 200 px wordt dus 600 px en niet 1600 — vier keer opblazen levert alleen nog
   matige pixels. Beide waarden worden defensief gelezen: een lege, onzinnige of NaN-waarde valt
   terug op de standaard. Kopieer daarbij **niet** het patroon van `DEFAULT_CONCURRENCY`
   (`:99-102`); dat klemt niet en vangt NaN niet af (review-20-17, M3).

3. **Het fragment gaat als JPEG de deur uit, niet als PNG.** Gemeten byte-omvang: 900 → ~1-1,5 MB,
   1600 → ~2,5-4,4 MB, 2400 → ~10-15 MB, doordat `/source` PNG stuurt terwijl `/marked` op
   dezelfde 1600 px al JPEG q82 gebruikt (review-20-17, M2). Zonder deze wijziging betaalt de
   reviewer de vergroting in laadtijd. Kwaliteit gelijk aan `/marked` (q82), zodat beide
   weergaven er hetzelfde uitzien.

4. **Al bezochte items krijgen het nieuwe fragment ook.** De ETag is nu
   `W/"${item.id}-${item.updatedAt}"` en verandert niet als de instellingen wijzigen; de browser
   houdt dan het oude fragment via `304` — juist bij de items waarmee iemand controleert.
   Let op de valkuil die de review vond (H2): de ETag wordt gezet vóórdat de afbeelding geladen
   is (`:981`), dus de wérkelijke fragmentgrootte bestaat daar nog niet. Neem daarom de
   **ingestelde** waarden op (maxPx + maxUpscale + formaat), niet de gemeten grootte. Doe dat
   **alleen op de contextfragment-tak**: de ETag-helper wordt gedeeld met drie andere endpoints
   waarvan de exacte ETag in tests is vastgepind (`:597`, `:608`, `:638`, `:664`).

5. **De terugrekening van een getekend kader blijft identiek.** De `X-Context-Window`-header
   staat in artwork-pixels (`:1046`) en de client rekent met fracties
   (`MobileReviewDeck.tsx:661-664`) — beide schaal-onafhankelijk, en dat moet zo blijven. Toetsbaar
   zonder browser: hetzelfde relatieve kader levert dezelfde artwork-fracties bij grens 900, bij
   1600 en bij een opgeschaald venster.

6. **De rode kaderlijn blijft even goed leesbaar.** De lijndikte staat vast op 3 px met een witte
   rand op offsets −2/+4 (`:1030-1032`). Laat dikte **en** die offsets meeschalen met de
   uiteindelijke fragmentgrootte, zodat de lijn er bij elke schaal hetzelfde uitziet. IJk op de
   huidige verhouding bij 900, niet op 1600 — anders wordt de lijn voor de meerderheid dunner
   (review-20-17, M6).

7. **Meetbare kosten in plaats van een onmeetbare eis.** De vorige versie vroeg een
   geheugenmeting die hier niet uitvoerbaar is: `heapUsed` meet `sharp` niet (libvips zit buiten
   de V8-heap) en er is geen representatieve fixture (review-20-17, M5). In plaats daarvan:
   meet **uitvoergrootte in bytes en duur** voor kadergroottes 100, 200 en 400 px, bij de oude en
   de nieuwe instelling, en leg beide in het story-record vast. Gemeten, niet geschat.

8. **Het echte geheugenrisico wordt benoemd, niet weggedefinieerd.** De piek zit niet in de
   uitvoer maar in het tweemaal decoderen van het volledige artwork (~36 MB ruw,
   review-20-17, M1). De grenzen uit AC2 dekken dat níet af. Vermeld dit expliciet in het
   story-record als bekend risico; het geheugenincident uit 20.11 zat bovendien in de
   Python-ml-container, niet in deze api.

9. **RED-bewijs met een geschikte fixture.** De bestaande `/source`-test gebruikt een kader van
   80 × 60 en blijft bij elke instelling groen. Voeg een fixture toe met een kader dat groot
   genoeg is om verschil te maken, en toon dat de test rood wordt als de wijziging teruggedraaid
   wordt.

10. **Geen regressie.** De api-suite rond `artwork-pipeline` blijft groen, inclusief de
    vastgepinde ETags van de andere drie endpoints. Het cache-gedrag uit story 20.6 (no-cache +
    zwakke ETag + 304) blijft intact.

## Wat NIET in deze story zit

- De kaderloze tak (`:1000`, `resize({ width: 1200 })`). Dat is géén ander endpoint maar de
  fallback van ditzelfde endpoint (review-20-17, M4) — bewust ongemoeid, zodat deze story één
  gedragswijziging bevat.
- De opmaak van het beoordeelscherm: story 20.16.

## Wat de review negatief beantwoordde (en dus geen risico is)

- **Geen andere afnemers van `/source`** dan het reviewdeck; `ArtworkReviewItemCard` gebruikt
  `/marked`.
- **Geen doorwerking in de herkenning**: `/annotate` snijdt opnieuw uit het volledige artwork op
  volle resolutie (`:1244-1260`), dus een groter contextfragment verandert niets aan wat er
  geleerd wordt.
- **Meeschalende lijndikte verstoort de terugrekening niet.**

## Taken

- [x] 1. Klem op 1 vervangen door opschalen met factor- en pixelgrens (AC1, AC2).
- [x] 2. Uitvoer naar JPEG q82 (AC3).
- [x] 3. Instellings-vingerafdruk in de ETag, alléén op deze tak (AC4).
- [x] 4. Lijndikte en halo-offsets meeschalen (AC6).
- [x] 5. Test op de fractie-invariant bij drie schalen (AC5) + fixture met groot kader (AC9).
- [x] 6. Bytes en duur meten bij kader 100/200/400 px, oud versus nieuw (AC7).

## Dev Agent Record

### Gemeten resultaat (AC7) — bytes en duur, oud tegenover nieuw

Gemeten op een artwork van 4000 x 3000 met tekst erin, met de `sharp` uit deze repository:

| Kadergrootte | oud: 900 px, alleen verkleinen, PNG | nieuw: 1600 px, max 3x, JPEG q82 |
|---|---|---|
| 100 px | 500 px · 2 kB · 6 ms | **1500 px** · 13 kB · 32 ms |
| 200 px | 900 px · 5 kB · 16 ms | **1600 px** · 15 kB · 24 ms |
| 400 px | 900 px · 35 kB · 37 ms | **1600 px** · 32 kB · 39 ms |

Twee dingen vallen op:

1. **Bij een klein keurmerk wordt het fragment drie keer zo groot** — 500 naar 1500 px. Dat is
   precies het geval waar de vorige spec niets deed: daar was de uitkomst byte-identiek.
2. **Bij een groot keurmerk kostte het in deze meting niets extra's**: 32 kB tegen 35 kB, ondanks
   1,8x zoveel pixels — het JPEG-effect uit AC3. LET OP: dat cijfer draagt niet ver. De
   spec-review mat voor dezelfde configuratie 1,0-1,5 MB op zijn eigen fixture. De
   PNG/JPEG-verhouding hangt sterk af van het beeld; over productie-artwork doet deze meting
   geen uitspraak.

`INFERENCE, geen bewijs` — het testartwork is synthetisch en grotendeels effen. Echte
verpakkingsbeelden comprimeren slechter, dus de absolute kB's liggen in productie hoger. De
verhouding tussen oud en nieuw is wel indicatief.

### Bevinding tijdens het bouwen: de opblaasgrens bindt vaker dan verwacht

Het uitgeknipte gebied is **nooit kleiner dan 500 px**: de marge is `max(2,5 x kader, 250)` per
zijde, dus minimaal 250 + 250. Een kader van 40 px levert dus hetzelfde venster als een kader
van 100 px. Gevolg: voor álle kleine keurmerken bindt de factorgrens (3x → 1500 px) en niet de
pixelgrens. Dat is precies zoals bedoeld — vier keer opblazen zou alleen nog matige brij
opleveren — maar het was niet wat ik in de eerste testverwachting had staan; die stond op 600 px
en is naar de gemeten werkelijkheid gecorrigeerd.

### Faalbewijs (AC9)

| Teruggedraaid | Gevolg | Test |
|---|---|---|
| De klem op 1 (dus weer alleen verkleinen) | fragment 1500 → **500 px** | 2 tests rood: "expected 500 to be 1500" |
| De instellings-vingerafdruk in de ETag | ETag zonder variant | 1 test rood |

Beide daarna teruggezet.

De bestaande `/source`-test gebruikt een kader van 80 x 60 en blijft bij elke instelling groen —
precies de tekortkoming die de spec-review aanwees. De nieuwe tests gebruiken kaders van 40, 100
en 400 px op een artwork van 4000 x 3000, zodat zowel de factorgrens als de pixelgrens
aantoonbaar bindt.

### Verificatie

- Route-suite `artwork-pipeline.routes.test.ts`: **59 passed / 0 failed** (5 nieuwe tests).
- **Volledige api-suite: 1033 passed / 0 failed** (2 skipped, 67 todo).
- `tsc --noEmit`: schoon.

### Aangepaste bestaande test, expliciet gemeld

De 12.19-test pinde `content-type: image/png` op `/source`. Dat formaat is nu JPEG (AC3), dus die
bewering is aangepast — met de reden erbij in de test. De rest van die test, inclusief de
vastgepinde context-window-waarden `[190, 80, 500, 500]`, staat ongewijzigd en blijft groen: dat
is meteen het bewijs dat de header schaal-onafhankelijk is gebleven (AC5).

### Bekend risico, niet weggedefinieerd (AC8)

De grenzen uit AC2 begrenzen de UITVOER. De geheugenpiek zit elders: het volledige artwork wordt
gedecodeerd (bij 4000 x 3000 al ~36 MB ruw) vóór het uitsnijden, en dat verandert deze story
niet. Wie het geheugengebruik van dit endpoint wil aanpakken, moet daar zijn — niet bij de
fragmentgrootte. Ter nuance: het geheugenincident uit story 20.11 zat in de Python-ml-container,
niet in deze api.

### Wat niet is gemeten

Het geheugengebruik zelf. `heapUsed` meet `sharp` niet, want libvips werkt buiten de V8-heap, en
een representatieve meetopstelling is er niet. De spec-review stelde dit vast en de eis is
daarom vervangen door bytes en duur, die wél te meten zijn.


### Code-review verwerkt (review-20-17-code.md — FAIL, 1 high / 4 medium / 5 low)

**H1 — mijn "defensieve" lezing was niet defensief.** Ik klemde het geparste getal, maar
`Number(' ')` en `Number('')` zijn 0, en die kwamen daardoor op de **ondergrens** uit in plaats
van op de standaard. Gemeten gevolg: `CONTEXT_FRAGMENT_MAX_PX=" "` leverde een fragment van
300 px — slechter dan vóór deze story — en `CONTEXT_FRAGMENT_MAX_UPSCALE=0` zette het vergroten
stil helemaal uit. Opgelost: lege, niet-eindige en niet-positieve waarden vallen nu terug op de
standaard. Getest met vijf soorten rommel (` `, ``, `abc`, `0`, `-5`), allemaal 1500 px.

**M1 — de klem was door geen enkele test gedekt.** De review toonde dat je de hele functie kon
vervangen door `Number(raw) || fallback` zonder één rode test. Daarom zijn de instellingen nu
**per verzoek** leesbaar in plaats van één keer bij het laden van de module: alleen zo kan een
test de omgeving zetten en het gedrag meten. Twee nieuwe tests dekken de bovengrenzen (99999 →
2400 px, 50 → 4x).

**M2 — doorzichtig bron-artwork werd zwart.** `sharp` flattet alfa bij JPEG naar zwart, niet naar
wit; een etiket op doorzichtige achtergrond zou als zwart vlak in de review verschijnen. Dat is
geen theoretisch risico: `/annotate` in ditzelfde bestand rekent expliciet op RGBA-bronnen.
Opgelost met `.flatten({ background: '#ffffff' })`. **Faalbewijs:** zonder die regel meet de test
`{r:0,g:0,b:0}` in plaats van wit.

**M3 — de AC5-test mat geen schaal-onafhankelijkheid.** Hij vergeleek twee verschillende kaders
en 900 werd nooit gedraaid. Herschreven: hetzelfde kader bij grens 900 én 1600, waarbij de
fragmenten aantoonbaar verschillen (900 tegen 1600 px) terwijl de header **identiek** is. Dat is
de invariant die nooit mag verschuiven.

**M4 — de kostenconclusie was te stellig.** "Kost niets extra's" leunde op een synthetische
fixture; juist de PNG/JPEG-verhouding is fixture-gestuurd (35 kB hier tegen 1,0-1,5 MB in de
spec-review voor dezelfde configuratie). De tabel hierboven blijft staan als meting, maar de
conclusie is teruggebracht tot wat hij draagt: bij een klein keurmerk wordt het fragment
aantoonbaar drie keer zo groot; over de byte-kosten op productie-artwork doet deze meting geen
uitspraak.

**Low, verwerkt:** de lijndikte-ondergrens staat weer op 3 px, zodat de lijn nooit dunner wordt
dan vóór deze story.

### Verificatie na verwerking

- Route-suite: **63 passed / 0 failed** (9 nieuwe tests).
- **Volledige api-suite: 1037 passed / 0 failed.**
- `tsc --noEmit`: schoon.

## Bronverwijzingen

- [Source: review-20-17.md — H1 (de klem op 1), H2 (ETag), M1-M6]
- [Source: apps/api/src/api/v1/artwork-pipeline.ts:79-96,99-102,981,1000,1008-1032,1046]
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:652-668]
- [Source: 20-6-marked-crop-revalidatie-cache.md — het cache-gedrag dat intact blijft]

## Change Log

- 2026-08-17: Herzien na spec-review (FAIL, 2 high). De kern van de vorige versie — de grens van
  900 naar 1600 — bleek voor kleine keurmerken byte-identiek; vervangen door server-side
  vergroten, met Friso's besluit erbij. ETag-aanpak, uitvoerformaat, lijndikte en de
  kostenmeting gecorrigeerd.
- 2026-08-17: Aangemaakt als deel B van de splitsing uit review-20-15.md.
