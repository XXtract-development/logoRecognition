# Story 20.18: Een verouderde GLN mag de oogst geen producten meer kosten

Status: superseded — NIET BOUWEN

> **Afgekeurd op 18 augustus 2026** door `review-20-18.md` (FAIL, 3 high / 9 medium / 6 low), en
> de kernbevinding is daarna door mijzelf nagemeten en bevestigd. De aanname onder deze story is
> onjuist: de terugvaloptie levert vrijwel niets op.
>
> - **Gemeten (steekproef 250 GTINs uit het echte universum): 0 van de 62** "geen bestand"-gevallen
>   worden opgelost. 53 hebben helemaal geen tweede gln; de 9 die er wel een hebben geven onder die
>   nieuwe gln **ook** een 500. Bovengrens 95%: ~4,8%, dus hooguit ~21 van de 442.
> - **Mijn bewijsvoering was fout.** De drie keurmerken van `08000146029059` komen uit de
>   productie-MongoDB; ik zette ze in een tabelkolom die suggereerde dat het XML-bestand er wél was.
>   Zelf nagemeten: `8717591319993` geeft `500 File not found` op acc én stage, identiek aan de oude
>   gln. Vierde te snelle conclusie op één waarneming, op één dag.
> - **De doelgroep stond omgekeerd.** Het 404-pad, dat deze story expliciet buiten scope zette, is
>   het enige dat wél oplevert: 4 van 4 in de steekproef, geschat ~29 producten.
> - **Er lag al een besluit.** Story 18.1 heeft vastgelegd dat bij meer dan één gln NIET gegokt mag
>   worden, met akkoord. Deze spec deed precies dat, zonder dat besluit te noemen.
> - **AC6 was onuitvoerbaar**: `geen-tradeitem-bestand` wordt 24 uur gecacht en de cache-lees staat
>   vóór de aanroep, dus een ná-meting bereikt de terugvaloptie nooit.
>
> Wat hiervan overeind blijft: de declaraties van die 442 producten staan wél in de
> productie-MongoDB, maar die is vanaf de acceptatie-omgeving niet bereikbaar. Dat is het echte
> obstakel, en het is groter dan deze story.

<!-- Aanleiding: onderzoek 18 augustus 2026
(_bmad-output/planning-artifacts/research/oogstbron-uitgeput-of-geblokkeerd-2026-08-18.md).
De oogst meldt sinds 27 juli "geen kandidaten". Dat bleek geen uitputting maar een blinde vlek. -->

## Story

Als **datamanager die het vliegwiel draaiende houdt**
wil ik **dat de oogst een product niet overslaat omdat het van partij is gewisseld**
zodat **de wachtrij zich weer vult uit materiaal dat we al binnen hebben.**

## Wat er misgaat, gemeten

`VERIFIED` — van de **1874** producten met artwork op ACC zijn er **815** zichtbaar voor de
oogst. De overige **1059** leveren niets op. De volledige droge run van de indexbouwer over
1862 producten geeft als reden:

| Uitkomst | Aantal |
|---|---|
| Bruikbare declaratie | 848 |
| **Geen trade-item-bestand (HTTP 500)** | **442** |
| Wel bestand, geen keurmerk gedeclareerd | 429 |
| Niet gevonden (404) | 143 |
| Technische fout / time-out | 0 |

`VERIFIED` — de oorzaak van die 500'en is **niet** een gat in de opslag maar een **verouderde
GLN**. De oogst leest de GLN uit onze eigen `artwork_imports`; wisselt een product van partij, dan
blijft die oude GLN staan en zoekt de catalogus naar een bestand dat daar niet meer hoort.

Bewijs (GTIN `08000146029059`):

| GLN | laatst bijgewerkt | XML-bestand | declaraties |
|---|---|---|---|
| 8712423033887 (die wij gebruiken) | 18 nov 2025 | ontbreekt — ook op productie | — |
| **8717591319993** | **25 nov 2025** | aanwezig | **RECYCLABLE_GENERAL_CLAIM, TRIMAN, GREEN_DOT** |

Dit product declareert dus drie keurmerken en werd afgeschreven als "geen declaratie".

`VERIFIED, tegenbewijs` — het is géén garantie op opbrengst. GTIN `00731509942156` bestaat ook op
productie, maar het veld `packagingMarkedLabelAccreditationCode` is daar **leeg**. Van twee
onderzochte producten declareert er één iets. Eén op twee is geen percentage; de winst is
aangetoond, de omvang niet.

## De oplossing, en waarom déze

`VERIFIED` — de catalogus kan op GTIN alleen zoeken:

```
GET {base}/api/tradeitemxml
header  x-query: {"globalTradeItemNumber":"08000146029059"}
→ 200  [ {id:103736, informationProvider:"8712423033887", targetMarket:"528", updated_at:"2025-11-18 13:57:49"},
         {id:123431, informationProvider:"8717591319993", targetMarket:"528", updated_at:"2025-11-25 09:12:56"} ]
```

De actuele GLN is dus opvraagbaar. Daarmee blijft alles binnen de bestaande architectuur.

**Overwogen en verworpen: rechtstreeks uit de productie-MongoDB lezen.** Daar staan de declaraties
als veld (`application.tradeItems`, 161.945 documenten), wat aantrekkelijk lijkt. Maar de
applicatie heeft **geen enkele Mongo-verbinding** — niet in de code, niet in de omgeving — dus dat
vraagt een nieuwe client, productie-inloggegevens op de acceptatie-omgeving en netwerktoegang van
acc naar productie. Een architectuur- en beveiligingsstap voor een probleem dat met een
bestaande endpoint op te lossen is.

## Acceptatiecriteria

1. **Bij een mislukte ophaalpoging wordt de actuele GLN opgezocht.** Given `resolveDeclaredMarks`
   krijgt voor een GTIN een `500` met "File not found at path" of een `404`, when er een andere
   GLN bestaat voor dat GTIN, then wordt de ophaalpoging herhaald met de **meest recent
   bijgewerkte** GLN voor dezelfde doelmarkt.

2. **De keuze is deterministisch en verantwoord.** Bij meerdere kandidaten wint de hoogste
   `updated_at`; bij gelijke stand het hoogste `id`. De gekozen GLN wordt gelogd samen met de
   afgewezen kandidaten, zodat een verkeerde keuze naderhand te herleiden is.

3. **De doelmarkt blijft leidend.** Een record voor een andere doelmarkt is géén kandidaat — dat
   zou het product aan de verkeerde markt koppelen. Alleen records met dezelfde `targetMarket`
   tellen mee.

4. **Eén extra aanroep per mislukking, niet meer.** De GTIN-zoekopdracht gebeurt alleen ná een
   mislukte poging, niet standaard. De uitkomst (gtin → gln) wordt gecachet zoals de bestaande
   declaratie-cache, zodat een volledige indexbouw niet twee keer zoveel verkeer geeft.

5. **Geen stille wijziging van onze eigen gegevens.** `artwork_imports` wordt **niet** bijgewerkt.
   Deze story lost de opzoeking op, niet de herkomstregistratie; dat laatste raakt bestaande
   provenance en hoort in een eigen story met eigen bewijs.

6. **Meetbare uitkomst.** Draai de indexbouwer droog vóór en ná. Vastleggen: hoeveel van de 442
   "geen bestand" alsnog een declaratie opleveren, hoeveel keurmerkcodes erbij komen, en hoeveel
   producten de index groeit. Zonder die twee metingen naast elkaar is de story niet af.

7. **Een mislukte opzoeking is geen fout.** Levert de GTIN-zoekopdracht niets op, of geen andere
   GLN, dan blijft de uitkomst zoals nu ("geen trade-item-bestand"). De kwaliteitspoort van de
   indexbouwer mag hier niet door omvallen.

8. **RED-bewijs.** Draai de fallback terug en toon dat exact de bedoelde test rood wordt, met het
   gemeten verschil erbij.

9. **Geen regressie.** De bestaande api-suite blijft groen, inclusief de tests rond
   `t3777-declarations` en de indexbouwer.

## Wat NIET in deze story zit

- De 429 producten mét bestand maar zónder keurmerk. Die zijn correct uitgelezen; of dat klopt is
  een aparte vraag (mogelijk leest de uitlezer een veld niet, mogelijk declareren ze echt niets).
- De 143 met een 404: geen enkel record voor die combinatie. Kan dezelfde oorzaak hebben, maar
  valt pas te beoordelen als AC1 draait.
- Het herbouwen van de live index (aparte schrijfactie, wacht op toestemming).
- De declaratiebron vervangen door de MongoDB — zie hierboven, verworpen.

## Bronverwijzingen

- [Source: _bmad-output/planning-artifacts/research/oogstbron-uitgeput-of-geblokkeerd-2026-08-18.md]
- [Source: apps/api/src/services/t3777-declarations.ts:163 — de URL-opbouw met gln-gtin-tm]
- [Source: apps/api/src/services/t3777-declarations.ts:295 — de `artworkImport.findFirst` die de gln levert]
- [Source: apps/api/src/scripts/build-keurmerk-index.ts — indexbouwer, `--dry-run`, `KEURMERK_INDEX_LIMIT`]
- [Source: catalogus-route `Route::apiResource('/tradeitemxml', TradeItemXmlController::class)`,
  `index()` leest de `x-query`-header — bekeken in de draaiende container op banana]

## Change Log

- 2026-08-18: Aangemaakt na het onderzoek naar de vastgelopen oogst. Status: superseded — NIET BOUWEN

> **Afgekeurd op 18 augustus 2026** door `review-20-18.md` (FAIL, 3 high / 9 medium / 6 low), en
> de kernbevinding is daarna door mijzelf nagemeten en bevestigd. De aanname onder deze story is
> onjuist: de terugvaloptie levert vrijwel niets op.
>
> - **Gemeten (steekproef 250 GTINs uit het echte universum): 0 van de 62** "geen bestand"-gevallen
>   worden opgelost. 53 hebben helemaal geen tweede gln; de 9 die er wel een hebben geven onder die
>   nieuwe gln **ook** een 500. Bovengrens 95%: ~4,8%, dus hooguit ~21 van de 442.
> - **Mijn bewijsvoering was fout.** De drie keurmerken van `08000146029059` komen uit de
>   productie-MongoDB; ik zette ze in een tabelkolom die suggereerde dat het XML-bestand er wél was.
>   Zelf nagemeten: `8717591319993` geeft `500 File not found` op acc én stage, identiek aan de oude
>   gln. Vierde te snelle conclusie op één waarneming, op één dag.
> - **De doelgroep stond omgekeerd.** Het 404-pad, dat deze story expliciet buiten scope zette, is
>   het enige dat wél oplevert: 4 van 4 in de steekproef, geschat ~29 producten.
> - **Er lag al een besluit.** Story 18.1 heeft vastgelegd dat bij meer dan één gln NIET gegokt mag
>   worden, met akkoord. Deze spec deed precies dat, zonder dat besluit te noemen.
> - **AC6 was onuitvoerbaar**: `geen-tradeitem-bestand` wordt 24 uur gecacht en de cache-lees staat
>   vóór de aanroep, dus een ná-meting bereikt de terugvaloptie nooit.
>
> Wat hiervan overeind blijft: de declaraties van die 442 producten staan wél in de
> productie-MongoDB, maar die is vanaf de acceptatie-omgeving niet bereikbaar. Dat is het echte
> obstakel, en het is groter dan deze story. Het is opgepakt in story 20.19.
