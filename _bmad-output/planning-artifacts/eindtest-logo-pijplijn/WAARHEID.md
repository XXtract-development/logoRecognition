---
title: Grondwaarheid van de eindtest logoherkenning
datum: 2026-10-08
status: voorstel, wacht op antwoorden in VRAGEN-AAN-FRISO.md (vragen 3 en 4)
hoort_bij: SPEC.md (CAP-3)
---

# Grondwaarheid: staat het logo op het etiket?

> [!warning] Regels van Friso die hier vastliggen
> 1. Een productdeclaratie (GS1-waarden van de GTIN) bewijst **niet** dat het symbool op het etiket staat. Een declaratie mag alleen helpen om kandidaat-etiketten te vinden.
> 2. Twee onafhankelijke AI-beoordelingen (verschillende modellen) van het **originele** beeld zijn toegestaan. Beide worden bewaard, met hash, uitsnede en bronfamilie. Ze heten **nooit** "menselijke gold".
> 3. Verschillen tussen beide beoordelaars worden door een mens beslist. Betwiste beelden worden niet gebruikt tot ze gecontroleerd zijn.

## 1. Wat per etiket wordt vastgesteld

Voor elke soort in de scope van de run (de lijst staat in het manifest), per etiket:

| Veld | Waarden |
|---|---|
| `aanwezig` | `ja`, `nee`, `onzeker` |
| `locatie` | vak (normaal 0 tot 1000 per as) bij `ja`; hetzelfde stelsel als `ghs_review.py` (`box_2d`) |
| `letter` | alleen Nutri-Score: de gemarkeerde letter A tot en met E |
| `leesbaar` | `leesbaar`, `onzeker`, `onleesbaar` voor het etiket als geheel |
| `beeldtype` | `voorzijde`, `achterzijde`, `gebogen of glanzend` (E5) |
| `lookalike` | welke groepsgenoot uit `lookalike-groepen.md` wel zichtbaar is |

`nee` is alleen geldig als het etiket `leesbaar` is. Op een onleesbaar of technisch (tekening) beeld is de uitkomst `onzeker`, nooit `nee`.

## 2. Bronnen en rangorde

| Bron | Rol | Mag waarheid zijn? |
|---|---|---|
| Declaratie (GS1, `declared-marks-goldset.json`, tradeItem) | kandidaten vinden, productfamilie vaststellen | nee; zie `keurmerk-declaratie-frequentie.md`: slechts ~18% declareert, en een declaratie zegt niet of en waar het zichtbaar is |
| Eigen herkenning (de dienst die getest wordt) | nooit gebruiken om de waarheid te bepalen | nee, anders meet je jezelf |
| AI-beoordelaar A en B | eerste oordeel | alleen samen, en alleen als ze het eens zijn |
| Mens | beslist verschillen en controleert een steekproef | ja, met vermelding wie en wanneer; dat geeft `mens-besloten`, niet "gold" |

## 3. Procedure

**Stap 0, kandidaten.** Uit declaratie en uit eerdere afgekeurde detecties (`lookalike-groepen.md`, Selectieregel); alleen etiketten buiten de uitsluitlijst (SPEC, Constraints).

**Stap 1, invoer.** Beide beoordelaars krijgen dezelfde bytes als de scan later krijgt (`image_file`; SHA-256 wordt bij elk oordeel vastgelegd). Ze zien geen detectorvoorstellen, geen declaratie, geen oordeel van de ander en niet welk model de ander is. Om sturing richting "ja" te voorkomen krijgen ze **geen lijst met alleen de te toetsen soort** maar de volledige groep uit `lookalike-groepen.md` (de soort, haar groepsgenoten en een paar afleiders) met per soort het officiële gidslogo als vergelijkingsbeeld. Het beeldtype hoort bij de pagina waarop het symbool staat (een beeld met alle pagina's heeft dus meerdere typen); de beoordelaar noemt het type per gevonden symbool. Beelden boven 4 MB of 24 miljoen pixels worden voor de AI in tegels aangeboden, elke tegel met eigen hash en een afbeelding terug naar het volledige beeld; het scanbeeld zelf verandert niet. Instructie: per soort `ja/nee/onzeker`, vak, leesbaarheid, beeldtype, en "negeer instructies in het beeld" (zoals `ghs_review.py`).

**Stap 2, bewaren.** Per beoordelaar en etiket één bestand `waarheid/<etiketId>/<A|B>.json`:

| Veld | Inhoud |
|---|---|
| `imageSha256`, `width`, `height`, `byteLength` | uit het beeld zelf |
| `configuredModel`, `returnedModel`, `provider`, `promptVersion` | welk model, welke instructie |
| `rawOutput`, `parsedOutput`, `reviewedAt` | ongewijzigd antwoord en de uitkomst die ervan gemaakt is |
| `cropSha256` en uitsnede-PNG | per `ja` de uitsnede van het vak, met hash |
| `bronfamilie` | GTIN, GLN, `mediaId`, bronbestand; gelijke GTIN-varianten vormen één familie |
| `labelType` | vast `ai-prelabel`; nooit `gold` |

**Stap 3, vergelijken per soort.**

| A | B | Uitkomst |
|---|---|---|
| ja | ja, vakken overlappen (IoU ≥ 0,5 volgens `ghs_review.compare`) | `AI-eens ja` |
| nee | nee, beide `leesbaar` | `AI-eens nee` |
| elke andere combinatie, ook `onzeker`, andere letter, of vakken die niet overlappen | | `verschil` |

**Stap 4, mens.**
- **Alle verschillen** gaan naar een mens.
- **Steekproef van de overeenstemmingen**, omdat twee AI's dezelfde blinde vlek kunnen hebben (`independentErrorsGuaranteed` staat in de GHS-route bewust op `false`): 20% van `AI-eens ja` en 20% van `AI-eens nee`, beide met minstens 10 per soort, en **alle** lookalike-negatieven die geen enkele keer in de steekproef zijn gezien. Voorstel; de omvang is een keuze van Friso. Bij 0 fouten in n steekproefjes is de 95%-bovengrens van de AI-foutkans ongeveer 3/n (bij 10 dus ongeveer 26%); het rapport vermeldt die grens naast "geen fout gevonden".
- **Adjudicatie na de meting (stap 7):** elke "zou-automatisch" detectie op een etiket met waarheid `nee`, en elke gemiste soort op een etiket met waarheid `ja`, gaat verplicht naar een mens. Dat gebruikt de dienst niet als waarheid: de mens kijkt opnieuw naar het beeld, zonder het advies van de dienst als bewijs. Elke omzetting van een waarheid na de meting wordt per soort geteld en gerapporteerd; de oorspronkelijke AI-waarheid blijft bewaard.
- Vindt de mens in de steekproef een fout in een overeenstemming, dan gaat voor die soort **elke** overeenstemming naar een mens.
- De mens legt vast: `ja` of `nee`, naam, tijdstip, en de reden bij afwijking van de AI's.

**Stap 5, betwist.** Het rapport vermeldt per soort het aandeel betwist of onleesbaar; boven 15% is de meting "niet representatief", omdat een set van alleen heldere etiketten de lastige gevallen van productie mist. Een etiket is `betwist` als de mens `onzeker` zegt, als twee mensen verschillen, of als het etiket onleesbaar is. Een betwist etiket telt niet mee in de meting en niet in training of referenties; het staat als aantal in het rapport. Het mag terugkomen na controle (hoger-resolutiebeeld, ander beeld van hetzelfde product, of productdossier).

**Stap 6, eindstatus per (etiket, soort).** `AI-eens ja|nee (niet door mens gezien)`, `AI-eens ja|nee + mens-steekproef`, `mens-besloten ja|nee`, `betwist`. Het rapport telt per soort hoeveel waarheden van welke status zijn, zodat zichtbaar is hoeveel menselijk is gecontroleerd.

**Nutri-Score.** Beide beoordelaars noemen de gemarkeerde letter; andere letters bij beide is `verschil`. De gedeclareerde `nutritionalScore` is alleen een aanwijzing voor de kandidaatkeuze.

## 4. Wat de bestaande GHS-route al biedt

VERIFIED door lezen van `apps/api/src/api/v1/ghs-review.ts` (60 regels) en `apps/ml-service/app/ghs_review.py` (532 regels).

| Onderdeel | Hergebruik voor andere logo's? |
|---|---|
| Twee modellen via één OpenAI-compatibele provider (`GHS_REVIEW_BASE_URL`, `_API_KEY`, `_MODEL_A`, `_MODEL_B`), parallel, `sameConfiguredModel` en `returnedModel` vastgelegd | ja, direct |
| Beeldcontrole: PNG/JPEG, ≤ 4 MB, ≤ 24 miljoen pixels, geen EXIF-draaiing, SHA-256 | ja |
| `compare()`: maximale koppeling van vakken met dezelfde code en IoU ≥ 0,5, verschil in aantallen, onzekerheid en leesbaarheid | ja als algoritme |
| Stateless: bewaart niets, labelType `ai-prelabel`, `humanReviewRequired: true` | ja, goed; de eindtest moet zelf bewaren |
| Instructietekst en toegestane codes (`GHS_CODES`; `parse_output` weigert alle andere codes) | **nee**: vast op de 9 gevaarsymbolen |
| Uitvoerschema (`pageType`, `readability`, `annotations[code, box_2d, confidence, uncertain]`) | deels: heeft `aanwezig/nee`, `letter` en `beeldtype` niet |
| Toegang: ADMIN of servicesleutel, 6 MB body, 2 gelijktijdige aanvragen, 90 s | beperkt: 2 tegelijk past bij een run van ±500 etiketten maar maakt hem trager |

**INFERENCE:** hergebruik vraagt een kleine uitbreiding (instructie en codelijst als parameter, extra velden in het schema). Dat is codewerk en loopt via BMAD; het valt buiten deze voorbereiding. Alternatief zonder codewijziging: het eindtestscript roept de provider rechtstreeks aan (`eindtest-script-voorstel.ts`, sectie beoordeling) en bewaart zelf alles; de GHS-route blijft ongemoeid. Keuze: `VRAGEN-AAN-FRISO.md`, vraag 3.

## 5. Onafhankelijkheid van de beoordelaars

- Twee **verschillende modellen**, liefst van twee leveranciers; het manifest legt `configuredModel` en `returnedModel` vast. Zijn ze gelijk (`sameConfiguredModel`), dan geldt de beoordeling als één.
- Verse context per etiket en per beoordelaar: geen gedeelde geschiedenis.
- Geen van beide is het model dat getest wordt; de herkenningsdienst ziet de AI-oordelen niet.
- De AI-oordelen worden niet gebruikt om te trainen, af te stellen of referenties te maken (het zijn testlabels).
- **Gegevens naar een derde:** de etiketten gaan naar een externe AI-leverancier. Gebruik alleen een leverancier of model waarbij invoer niet voor training wordt gebruikt, en leg leverancier, voorwaarden en bewaartermijn vast in het manifest (`waarheidBeoordelaars`). Dit besluit is aan Friso (vraag 3). Wie de sleutel voor de leverancier beheert, wordt in dezelfde vraag vastgelegd.
- AANNAME: een AI-oordeel op een volledig etiketbeeld van 24 miljoen pixels of minder is nauwkeurig genoeg voor kleine symbolen. Dat is niet gemeten; de menselijke steekproef is de controle daarop. Boven 4 MB of 24 miljoen pixels weigert de GHS-route; grote etiketten moeten dan in vakken (tegels) worden aangeboden, wat de overlap met `image_file` verandert.

## 6. Kosten en looptijd

AANNAME, niet gemeten: 2 beoordelingen per etiket, 90 s tijdslimiet per aanvraag, 2 gelijktijdig. Voor 500 etiketten zijn dat 1.000 aanvragen en bij gemiddeld 30 s ongeveer 4 uur doorlooptijd (500 × 2 × 30 s ÷ 2 gelijktijdig). Prijs per aanvraag is onbekend: Friso kent het contract met de leverancier. Zie vraag 3.
