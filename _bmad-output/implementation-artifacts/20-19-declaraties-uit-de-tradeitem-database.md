# Story 20.19: Declaraties uit een momentopname van de trade-item-database

Status: **spec versie 6 — wacht op her-review.**

> **Twee besluiten van Friso, 19 augustus 2026, die dit ontwerp bepalen.**
>
> **1 — Geen live verbinding.** Versies 1 t/m 3 gaven de acceptatie-omgeving een leesverbinding met
> de trade-item-database op productie. Dat is van tafel. De uitlezing is **één keer met de hand**
> gedaan en als momentopname in de code vastgelegd; de applicatie praat nooit zelf met productie.
> Aanleiding: het enige bestaande account (`xxtract`) draagt `dbOwner` + `readWrite` op
> `application` en `userAdminAnyDatabase` op `admin` — die reeks naar acceptatie brengen zou
> acceptatie schrijfrechten op productie geven.
>
> **2 — De geoogste gegevens gaan uitsluitend naar de beoordeelwachtrij.** Ze worden **niet**
> gebruikt om detecties automatisch goed te keuren en **niet** om referentielogo's aan te maken.
> Reden: de gegevens zijn bevroren op 19 augustus 2026 en voor déze 442 producten is er geen XML om
> ze tegen af te zetten, terwijl bij een eerdere vergelijking 2 van de 100 producten afweken
> (`RAINFOREST_ALLIANCE` tegenover `RAINFOREST_ALLIANCE_PEOPLE_NATURE` — dat codewoord staat
> daadwerkelijk in het geoogste bestand). Een verkeerd referentielogo is later moeilijk terug te
> draaien; een beoordelaar die ernaar kijkt is dat niet.
>
> **Wat besluit 2 betekent voor de code — gecorrigeerd in versie 6.** Versie 5 vertaalde dit naar
> "raak alleen `resolveDeclaredMarks` aan". Dat was fout: die functie is een **gedeelde dienst met
> vijf aanroepers**, en twee daarvan schrijven. De terugval hoort daarom **aan de aanroepkant**, niet
> in de dienst. Zie AC1.

<!-- Vijfde poging in dit dossier. Vier eerdere verklaringen voor de vastgelopen oogst zijn
gemeten en gesneuveld (te kleine index; uitgeputte bron; gat in de bestandsopslag; verouderde
gln — story 20.18). Deze staat op wat ná die metingen overeind bleef. -->

## Story

Als **datamanager die het vliegwiel draaiende houdt**
wil ik **dat een ontbrekend XML-bestand geen keurmerkdeclaratie meer kost**
zodat **de beoordeelwachtrij weer kandidaten krijgt uit producten die we al binnen hebben.**

## De opbrengst — geoogst, niet geschat

`VERIFIED` — de oogst is uitgevoerd op 19 augustus 2026 en staat in
`apps/api/src/services/tradeitem-declaration-snapshot.ts`. Vijf onafhankelijke tellingen komen op
exact dezelfde getallen uit (twee in de database, drie in de client, waarvan één in de her-review).

| | |
|---|---|
| Sleutels in de momentopname (de hele groep `geen-tradeitem-bestand`) | **442** |
| Documenten gevonden op `_id = {gln}-{gtin}-{tm}` | **442 (100%)** |
| Sleutels met ten minste één keurmerk | **238 (53,8%)** |
| Sleutels die aantoonbaar niets declareren | **204** |
| Code-instanties | **475** |
| Unieke `(fieldType, code)`-paren | **52** |
| Doelmarkt | **528** — alle 442 sleutels |

Per veldsoort:

| veldsoort (`meta.gdsn`) | `fieldType` | instanties | producten |
|---|---|---|---|
| `packagingMarkedLabelAccreditationCode` | `PackagingMarkedLabelAccreditationCode` | 292 | 177 |
| `dietTypeCode` | `DietTypeCode` | 89 | 68 |
| `nutritionalScore` | `NutritionalScore` | 61 | 61 |
| `enumerationValue`, gescopet binnen `consumerUsageLabelCode` | `EU_consumerUsageLabelCodeList` | 33 | 22 |
| `localPackagingMarkedLabelAccreditationCodeReference` | `AdditionalPackagingMarkingsCode` | **0** | **0** |

**De opbrengst van deze story is 238 producten in de beoordeelwachtrij, met 475 code-instanties.**
Eén getal, geen twee — dat is het gevolg van besluit 2. De 177 producten met een
`PackagingMarkedLabelAccreditationCode` zouden langs de automatische bevestiging kunnen; dat gebeurt
bewust niet.

*Eerdere versies noemden 179-211. Dat was te laag: die telling liep langs 2 van de 5 veldsoorten
en kapte de documentboom na 12 niveaus af.*

### Wat de oorzaak NIET is, zodat niemand die wegen opnieuw inloopt

- **niet** een te kleine index: volledige herbouw geeft +29 producten, +1 code.
  *`INFERENCE` — overgenomen uit het onderzoek van 18 augustus, niet opnieuw nagemeten.*
- **niet** een verouderde gln: bij 10 van 10 gecontroleerde gevallen is de werkende gln exact die
  van ons; bij het kroongetuige-product faalt ook de nieuwere gln (story 20.18, afgekeurd).
- **niet** een uitlezer die velden mist. `VERIFIED, volledige telling`: van de **429** producten
  met een lege declaratie declareren er op productie **3**. Alle 429 documenten bestaan wél
  (429/429 gevonden op `_id`); ze zijn gewoon leeg.

## Het governance-spoor

**AKKOORD (Friso, 19 augustus 2026)** op
`_bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md`, plus op
dezelfde dag de twee besluiten in de kop.

De uitgevoerde oogst valt binnen dat akkoord én binnen het oudere akkoord van 2026-07-04
("eenmalig, handmatig, buiten piekuren, NOOIT automatisch"): één handmatige leesactie op 442
sleutels, uitsluitend `find` op de primaire sleutel, geen enkele schrijfbewerking. Conform de
werkwijze van story 18.1 geldt dit story-record als het governance-spoor.

**Wat wél en niet vervalt** — dit onderscheid is wezenlijk en versie 4 had het fout:

| | draaiende applicatie | handmatige regeneratie |
|---|---|---|
| leesrechten-gebruiker | **niet nodig** | **nodig** |
| `TRADEITEMS_MONGO_URI` | **niet nodig** | **nodig** |
| `mongodb`-driver | **niet nodig** | **nodig** |
| netwerkpad naar de database | **niet nodig** | **nodig** |

`VERIFIED`: `mongodb` en `tsx` staan in **geen enkele** `package.json` — noch in `apps/api`, noch in
de root. Wie regenereert installeert ze eerst op de eigen machine. Hetzelfde geldt al voor het
18.1-script, dus het is een bestaande conventie, maar hij hoort hier opgeschreven.

## Wat er al ligt

`apps/api/src/services/tradeitem-declaration-snapshot.ts` — gegenereerd, 442 sleutels, met
`TRADEITEM_SNAPSHOT_META` (oogstdatum, herkomst, doelmarkt, aantallen per veldsoort) en
`TRADEITEM_SNAPSHOT` (sleutel → lijst van `{fieldType, code}`).
`apps/api/scripts/harvest-tradeitem-snapshot.ts` — de generator.
`apps/api/src/__tests__/services/tradeitem-declaration-snapshot.test.ts` — 17 toetsen.

`VERIFIED` — het bestand staat onder `src/` en niet onder `scripts/`, en dat is geen detail: de
Dockerfile kopieert `apps/api/src/` en `apps/api/prisma/`, **niet** `apps/api/scripts/`
(`Dockerfile:57-58`). Een databestand in `scripts/` bereikt de container nooit. Dezelfde val kostte
eerder de region proposer een deploy.

> **Volgorde-afwijking, met opzet vastgelegd.** Drie commits brachten de momentopname, de generator
> en de toetsen naar `acc` terwijl deze spec nog op her-review wachtte: `c7e3fa5` (oogst),
> `4670d80` (reparaties uit ronde 4) en de commit van deze ronde. Dat is geen uitglijder meer maar
> een patroon, en het hoort zo genoemd. Wat het beperkt houdt: het gaat om **data en een generator**,
> niets is uitgerold en niets is bedraad. De bedrading zelf (AC1 t/m AC13) is nog niet gebouwd en
> wacht wél op de review van déze versie.

## Acceptatiecriteria

1. **De terugval staat aan de aanroepkant, niet in de gedeelde dienst.** Dit is de correctie op
   versie 5, die "alleen bij de indexbouwer" schreef en hem vervolgens onvoorwaardelijk in
   `resolveDeclaredMarks` legde. `VERIFIED`: die functie heeft **vijf** aanroepers, niet één:

   | aanroeper | regel | krijgt de momentopname? | waarom |
   |---|---|---|---|
   | `apps/api/src/scripts/build-keurmerk-index.ts` | `:458` | **ja** | de indexbouwer — vult de beoordeelwachtrij, het doel van deze story |
   | `apps/api/src/api/v1/artwork-pipeline.ts` | `:849` | **ja** | `GET /artwork/declared-marks/:gtin`, uitsluitend lezen; zónder dit ziet de beoordelaar de declaratie niet |
   | `apps/api/src/services/pipeline/verify-flow.ts` | `:423` | **nee** | voegt Nutri-Score-letters samen in `declaredCodes` en die lopen door naar `runFlywheelHooks` → `nominateFromKruischeck` — kandidaat-referenties, precies wat besluit 2 uitsluit |
   | `apps/api/src/services/flywheel/bootstrap-run.ts` | `:450` | **nee** | guard vóór de klasse-zoektocht die referenties oplevert |
   | `apps/api/src/scripts/build-nutriscore-declared-map.ts` | `:256` | **nee** | schrijft de declaratiemap naar de MinIO-trainingsbucket |

   Bouw dit als een expliciete keuze op de aanroep — bijvoorbeeld
   `resolveDeclaredMarks(gtin, gln, { useSnapshot: true })` — met **uit** als standaard. Een
   ontwikkelaar die een zesde aanroeper toevoegt krijgt dan het veilige gedrag zonder erover na te
   denken.

   **Leg het vast met een toets** die bewijst dat de drie niet-deelnemende aanroepers de
   momentopname niet zien. `VERIFIED, nuance`: de twee schrijfpaden in `verify-flow` zitten vandaag
   achter `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`, die standaard uit staat (`verify-flow.ts:546-550`).
   Dat is geen ontwerp — een vlag die morgen aan gaat mag deze belofte niet breken.

2. **Drie uitkomsten, elk met een eigen reden. Geen vierde.**

   | geval | uitkomst | reden |
   |---|---|---|
   | sleutel staat niet in de momentopname | geen marks | `geen-tradeitem-bestand` — ongewijzigd |
   | sleutel staat erin met een **lege** lijst | geen marks | `lege-declaratie` |
   | sleutel staat erin **met codes** | de marks uit de momentopname | **`uit-momentopname`** (nieuw) |

   De naam is `uit-momentopname`, in dezelfde vorm als de bestaande redenen. Zonder gekozen naam is
   dit niet te bouwen: de plekken in AC6 zijn `switch`- en `Record`-constructies waar de naam
   letterlijk in de code komt.

3. **`uit-momentopname` mag NOOIT `ok` zijn, en dat is dragend.** Een ontwikkelaar kan redeneren
   dat de marks echt zijn en dus `ok` teruggeven. Dat breekt besluit 2 in stilte. `VERIFIED`:
   `bootstrap-run.ts:451` luidt `if (decl.reason !== 'ok' || …) continue;` — die guard bepaalt welke
   GTINs de klasse-zoektocht in gaan die referenties oplevert. Met `ok` zouden de 238 bevroren
   producten daar meteen naar binnen lopen.

   Leg dit vast met een toets die faalt zodra de terugval `ok` teruggeeft. Dit is geen stijlkeuze
   maar de tweede grendel op besluit 2, naast AC1.

4. **Alleen als terugval, nooit als vervanging.** De XML-route blijft primair; de momentopname
   wordt uitsluitend geraadpleegd nádat de XML-route `geen-tradeitem-bestand` heeft opgeleverd.
   De 848 werkende producten kunnen niet geraakt worden: hun sleutels staan niet in de momentopname,
   en de opzoeking gebeurt pas ná die ene reden. Leg dat vast met een test die bewijst dat een
   `ok`-uitkomst de momentopname niet raadpleegt.

5. **Alle vijf de veldsoorten, mét `fieldType`.** De indexbouwer werkt op `(fieldType, code)`-
   sleutels; `parseDeclaredMarks` levert alle vijf (`MARK_FIELDS`,
   `apps/api/src/services/t3777-declarations.ts:420-425`, plus `CONSUMER_USAGE_FIELD_TYPE` op
   `:434`). De momentopname draagt dezelfde vijf en die gelijkheid is vastgepind in een toets —
   `MARK_FIELDS` en `CONSUMER_USAGE_FIELD_TYPE` zijn daarvoor geëxporteerd.

   De momentopname is al genormaliseerd; de terugval normaliseert **niet** opnieuw. Bij het oogsten
   is toegepast, gelijk aan `parseDeclaredMarks`: `trim()`, `toUpperCase()`, ontdubbeld per
   `(fieldType, code)`, lege waarden overgeslagen, uitsluitend `value` en nooit `oldValue`, en
   `enumerationValue` uitsluitend gescopet binnen `consumerUsageLabelCode`.

   *`oldValue` is bewust weggelaten: 17 code-instanties staan daar uitsluitend in, goed voor 5
   extra producten, maar het is een vórige waarde en zou valse akkoorden opleveren.*

6. **`uit-momentopname` raakt ZES plekken, en twee ervan breken de compilatie niet.**

   | plek | bestand en regel | compiler vangt het? |
   |---|---|---|
   | `DeclarationReason` (de union loopt t/m `:55`) | `apps/api/src/services/t3777-declarations.ts:48-55` | ja |
   | `CollectReason` | `apps/api/src/scripts/build-keurmerk-index.ts:325-334` | ja |
   | `emptyReasonCounts()` | `apps/api/src/scripts/build-keurmerk-index.ts:338-350` | ja |
   | `mapDeclarationReason` — expliciete toewijzing, niet via `default` | `apps/api/src/scripts/build-keurmerk-index.ts:362` | **nee** — hij neemt `string`, geen `DeclarationReason` |
   | de **voortgangsregel** (`:484-486`) én de samenvattingsregel (`:630-636`), die de redenen bij naam afdrukken | `apps/api/src/scripts/build-keurmerk-index.ts` | **nee** |
   | het **beoordeelscherm**: `const has = res.reason === 'ok' && res.marks.length > 0;` | `apps/web/src/components/review/MobileReviewDeck.tsx:417` | **nee** | 

   De laatste is de gemeenste en versie 5 miste hem volledig. `VERIFIED`: die regel haalt zijn
   gegevens uit `fetchDeclaredMarks` (`apps/web/src/services/artworkReviewService.ts:164-176`) →
   `GET /artwork/declared-marks/:gtin` → `resolveDeclaredMarks` (`artwork-pipeline.ts:849`). Met
   reden `uit-momentopname` is `has` **false**, en het commentaar op `:299-300` zegt wat dat
   betekent: *"without it we show nothing"*. De 238 producten van deze story zouden dan wél in de
   wachtrij komen maar zónder hun declaratie — de beoordelaar krijgt precies het gegeven niet te
   zien waar de hele story voor bestaat.

   **Wat er moet gebeuren:** de poort accepteert ook `uit-momentopname`, en het scherm **toont de
   herkomst** — een korte aanduiding dat deze declaratie uit een momentopname van
   `TRADEITEM_SNAPSHOT_META.harvestedAt` komt en niet uit de actuele catalogus. Dat past bij de reden
   waarom besluit 2 genomen is: de beoordelaar hoort te weten dat hij naar bevroren gegevens kijkt.
   De bestaande deck-toetsen zetten allemaal `reason: 'ok'` in hun opstelling; er komt er één bij met
   `uit-momentopname`.

7. **Fail-open, met een reden die de kwaliteitspoort niet omgooit.** `mapDeclarationReason` heeft
   `default: return 'api-fout'`, dus élke nieuwe reden telt nu als technische fout — met 23,7%
   tegen een drempel van 5% valt de poort van de indexbouwer om. `VERIFIED`: die teller is
   `const technical = reasons['api-fout'] + reasons.timeout;`
   (`apps/api/src/scripts/build-keurmerk-index.ts:546`), dus een nieuwe reden valt er vanzelf
   buiten — zolang `mapDeclarationReason` hem niet alsnog op `api-fout` laat vallen.

   *`timeout` en `niet-verwerkt` hoeven niet toegewezen te worden: die ontstaan in de indexbouwer
   zelf en komen nooit langs `mapDeclarationReason`. `VERIFIED`: `DeclarationReason` kent ze niet.*

8. **De cache mag de terugval niet blokkeren, en mag het oogstscript niet blind maken voor zijn
   eigen bron.** Dit tweede deel is de vondst van ronde 5 en het is een eenrichtingsdeur als het
   blijft staan.

   `VERIFIED`, de volgorde in `resolveDeclaredMarks`: lezen op `:642`, en aan het eind
   **onvoorwaardelijk** schrijven — `marksCacheWrite(key, result, ttlForReason(result.reason,
   cacheTtlS), gtin)` (`:673`). `ttlForReason` (`:532-534`) geeft alles behalve `api-fout` de normale
   TTL van 86.400 s (`T3777_CACHE_TTL_S`, `:87`).

   Gevolg zonder maatregel: ná één indexrun dragen de 442 cachesleutels reden `uit-momentopname` of
   `lege-declaratie`. Het oogstscript selecteert op `reason === 'geen-tradeitem-bestand'`
   (`harvest-tradeitem-snapshot.ts:349`), dus **de 442 zijn onvindbaar geworden voor precies het
   script dat ze moet verversen** — en daarmee is de regeneratie uit AC9, én de leeftijdsgrens,
   een dode letter.

   Drie maatregelen, alle drie nodig:
   - **De cache wordt gelezen, maar een hit met reden `geen-tradeitem-bestand` wordt als miss
     behandeld.** "De cachelees overslaan" kan niet — je moet lezen om de reden te kennen.
   - **De gecachete waarde draagt de oogstdatum van de momentopname waaruit hij komt.** Een hit met
     reden `uit-momentopname` waarvan die datum niet gelijk is aan
     `TRADEITEM_SNAPSHOT_META.harvestedAt` wordt óók als miss behandeld. Zo pikt een verse
     momentopname zichzelf op, zonder dat iemand een schakelaar hoeft te onthouden.
   - **Het oogstscript selecteert op `geen-tradeitem-bestand` én `uit-momentopname`, plus alle
     sleutels die al in `TRADEITEM_SNAPSHOT` staan.** Dan is de populatie compleet, ongeacht wat de
     cache op dat moment zegt.

   De 442 bestaande cachesleutels **blijven staan**; de maatregelen lopen eromheen. Ze verwijderen is
   een schrijfactie op de acceptatie-Redis en vraagt aparte toestemming.

   *Is er tóch een schakelaar nodig, geef hem dan geen `KEURMERK_INDEX_`-naam.* `VERIFIED`: de
   cachelees zit in `t3777-declarations.ts`, een dienst die óók de detectie-worker gebruikt
   (`apps/api/src/services/pipeline/detection-flow.ts:250`); de naam zou suggereren dat het alleen de
   indexrun raakt.

9. **De veroudering is zichtbaar én bezwaarlijk.**
   - De indexbouwer drukt bij elke run de **oogstdatum**, de **ouderdom in dagen** en de
     **doelmarkt** af uit `TRADEITEM_SNAPSHOT_META`.
   - **Boven 180 dagen wordt de run luidruchtig** — een zichtbare waarschuwing, geen keuze voor de
     ontwikkelaar. Zonder grens schaduwt een bevroren sleutel een product voor onbepaalde tijd, ook
     als de declaratie op productie verandert, want de XML-route komt er nooit aan toe.
   - **Een eigen telregel voor het gebruik van de momentopname**, los van de redenentellers:
     hoeveel sleutels met marks, hoeveel leeg, en hoeveel GTINs op `geen-tradeitem-bestand` liepen
     zónder in de momentopname te staan. Dat laatste getal is de hoeveelheid werk voor een verse
     oogst. Dit moet een eigen regel zijn omdat de `lege-declaratie`-teller al 429 producten uit de
     XML-route bevat en die twee bronnen anders op één hoop vallen.
   - `apps/api/scripts/harvest-tradeitem-snapshot.ts` regenereert het bestand: handmatig, met een
     leesverbinding, buiten de applicatie om, en bewust in `scripts/` zodat het níet mee de container
     in gaat. Vereisten op de uitvoerende machine: **`mongodb` en `tsx`** — beide staan in geen
     enkele `package.json`. Met `--harvested-at=JJJJ-MM-DD` is een hertelling byte-voor-byte te
     vergelijken met het gecommitte bestand.

10. **De momentopname is doelmarkt-gebonden, en dat staat er ook.** `VERIFIED`: alle 442 sleutels
    eindigen op `-528`, en `TRADEITEM_SNAPSHOT_META.targetMarket` draagt die waarde. Staat
    `T3777_TARGET_MARKET` (`t3777-declarations.ts:86`, standaard `'528'`) ooit op iets anders, dan
    mist **elke** opzoeking — zonder foutmelding en zonder verschil met "niet gemeten". De opzoeking
    meldt daarom wanneer de gevraagde doelmarkt niet die van de momentopname is.

11. **De gln die de sleutel vormt is bepaald, niet toevallig.** Versie 5 voerde deze zorg op als
    vervallen; dat was onjuist. `VERIFIED`: `resolveDeclaredMarks` doet **zelf** dezelfde
    ongeordende opzoeking wanneer `knownGln` ontbreekt —
    `prisma.artworkImport.findFirst({ where: { gtin, gln: { not: null } } })`
    (`t3777-declarations.ts:620-625`, zonder `orderBy`). Van de vijf aanroepers geeft alleen de
    indexbouwer een gln mee (`:458`).

    Voor een GTIN met meer dan één gln vormt de terugval bij de tweede deelnemende aanroeper — de
    endpoint van het beoordeelscherm — dus mogelijk een andere sleutel dan waarmee geoogst is. Het
    gevolg is fail-open (geen terugval, oud gedrag), dus niet gevaarlijk, maar wel stil. Geef die
    `findFirst` een `orderBy` zodat de keuze in elk geval deterministisch is, en leg vast dat een
    afwijkende gln géén terugval oplevert in plaats van een verkeerde.

12. **Meetbare uitkomst, met de voorwaarde erbij.**

    | wat | verwacht |
    |---|---|
    | producten met reden `uit-momentopname` | **238** (475 code-instanties) |
    | GTINs die op `geen-tradeitem-bestand` liepen en niet in de momentopname staan | **0** bij de eerste run |
    | groei van de index in producten en in unieke `(fieldType, code)`-sleutels | te meten |

    **De droogloop vraagt `KEURMERK_INDEX_LIMIT` op minstens het universumtotaal.** `VERIFIED, eigen
    meting op de acceptatie-database, 19 augustus 2026`: het universum telt **1870** unieke
    `(gln, gtin)`-paren. De standaard is **500** (`build-keurmerk-index.ts:261-264`) en poortregel 7d
    blokkeert een run waarin `universeSize < universeTotal`. Zonder die instelling meet de droogloop
    een kwart van de populatie en leest dat als een afwijking van 75%.

    `VERIFIED, eigen meting` — **alle 442 sleutels zitten in dat universum**, geen enkele ontbreekt.
    Versie 6 voerde dit nog als aanname op; het is nu gemeten:

    ```sql
    -- acceptatie, alleen lezen
    SELECT DISTINCT gln, gtin FROM artwork_imports WHERE gln IS NOT NULL;
    -- daarna de 442 (gln, gtin)-paren uit de momentopname ertegen houden
    -- uitkomst: universum 1870, gevraagd 442, gevonden 442, ontbreekt 0
    ```

    De 442 sleutels bevatten bovendien 442 **unieke** GTINs, dus "442 sleutels = 442 producten"
    klopt.

    Verwachting en meting naast elkaar in het story-record. Wijkt de meting meer dan 5% af, dan
    eerst uitzoeken waaróm voordat de story op `done` gaat.

13. **Testbaar zonder database, met RED-bewijs, zonder regressie.** De opzoeking krijgt de
    momentopname als **afhankelijkheid** mee, net als `GlnLookup`
    (`apps/api/scripts/backfill-gln-from-tradeitems.ts:143`) en `BackfillDeps` (`:146-159`).
    RED-bewijs voor AC1 (de drie niet-deelnemende aanroepers), AC3 (`uit-momentopname` ≠ `ok`), AC6
    (het beoordeelscherm) en AC8 (de cache-invalidatie op oogstdatum). De api-suite blijft groen.

    Toon ná de bouw dat de gecompileerde momentopname in `dist/` staat en dat de indexbouwer hem in
    de draaiende container leest — een testsuite die lokaal groen is bewijst dat niet.

## Wat NIET in deze story zit, met het getal erbij

- **Alles wat schrijft op grond van een declaratie** — besluit 2, en dat is breder dan versie 5
  dacht. Buiten deze story blijven: de automatische bevestiging (`resolveDeclarations`), het
  aanmaken van kandidaat-referenties via de kruischeck (`verify-flow.ts` → `runFlywheelHooks` →
  `nominateFromKruischeck`), de klasse-zoektocht van de bootstrap (`bootstrap-run.ts:450`) en de
  Nutri-Score-declaratiemap in MinIO (`build-nutriscore-declared-map.ts:256`). Wil je dat later wél,
  dan is dat een eigen story mét een houdbaarheidsgrens op de momentopname.
- **Het omgevingssegment op de T3777-cachesleutel.** `VERIFIED`: `marks:{env}:{gln}:{gtin}:{tm}`
  draagt er een (`t3777-declarations.ts:521`), `t3777:{gln}:{gtin}:{tm}` niet (`:112`). Delen twee
  omgevingen ooit één Redis, dan kan het acceptatiepad langs die cache op productiegegevens gaan
  draaien. Deze story raakt dat pad niet, dus de reparatie hoort in een eigen story — mét de
  aantekening dat het de sleutelvorm verandert en dus élke bestaande `t3777:`-entry onvindbaar
  maakt (~1863 verse catalogus-aanroepen bij de eerstvolgende run).
- **Een vaste koppeling met de trade-item-database.** Bewust niet gekozen.
- **De 429 producten met een lege declaratie.** `VERIFIED, volledige telling`: 429/429 documenten
  bestaan, en **3** ervan declareren iets. Deze weg is dicht.
- **De 144 met een 404.** `VERIFIED, volledige telling`: **0 van de 144** heeft een document op
  `_id = {gln}-{gtin}-528`. Dat een eerdere meting "12 declarerend" noemde klopt niet met deze
  route — die 12 kwamen uit een zoekopdracht op gtin, dus onder een **andere** doelmarkt of gln.
  Dat is precies de TM-mismatch die de redencode al vermoedt, en een eigen story waard.
- Het bijwerken van `artwork_imports`.
- Het herbouwen van de live index (aparte schrijfactie, wacht op toestemming).

## Bronverwijzingen

- [Source: _bmad-output/implementation-artifacts/review-20-19.md — eerste review, vier highs]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v2.md — de telling 238/442 en 475 codes]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v3.md — her-review, FAIL; de meting 177/292]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v4.md — her-review op de ontwerpwijziging, FAIL; H2 is besluit 2 geworden]
- [Source: _bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md — de gln-regel, het akkoordpatroon en de testnaad]
- [Source: _bmad-output/implementation-artifacts/20-18-verouderde-gln-blokkeert-oogst.md — afgekeurd, met de meting die de gln-route uitsluit]
- [Source: _bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md — akkoordverzoek en aanvullingen]
- [Source: apps/api/src/services/tradeitem-declaration-snapshot.ts — de geoogste momentopname]
- [Source: apps/api/scripts/harvest-tradeitem-snapshot.ts — de generator]
- [Source: apps/api/src/services/t3777-declarations.ts — XML-route, de twee ingangen, cache, `MARK_FIELDS`]
- [Source: apps/api/src/scripts/build-keurmerk-index.ts — indexbouwer, redencodes, poortregel 7b]
- [Source: apps/api/src/services/pipeline/detection-flow.ts — de automatische bevestiging die deze story bewust niet raakt]
- [Source: apps/api/src/services/pipeline/verify-flow.ts:423 — de aanroeper die via de kruischeck kandidaat-referenties aanmaakt]
- [Source: apps/api/src/services/flywheel/bootstrap-run.ts:450 — de guard die op reden `ok` staat]
- [Source: apps/api/src/api/v1/artwork-pipeline.ts:849 — de endpoint achter de declaratie-prior van het beoordeelscherm]
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx:417 — de zesde plek, buiten apps/api]
- [Source: Dockerfile:57-58 — `src/` en `prisma/` worden gekopieerd, `scripts/` niet]

## Change Log

- 2026-08-19: **Versie 6** na `review-20-19-v5.md` (FAIL, 3 high / 10 medium / 5 low). De drie highs
  zijn alle drie zelf nagemeten en klopten. **H1:** versie 5 vertaalde besluit 2 naar "raak alleen
  `resolveDeclaredMarks` aan", maar dat is een gedeelde dienst met vijf aanroepers waarvan twee
  schrijven — via `verify-flow.ts:423` zouden de 61 Nutri-Score-producten alsnog kandidaat-referentie
  worden. De terugval gaat nu naar de aanroepkant, standaard uit, met twee expliciete deelnemers.
  **H2:** de terugvaluitkomst wordt gecachet, waardoor het oogstscript ná één indexrun zijn eigen 442
  sleutels niet meer terugvindt en de regeneratie een dode letter is; opgelost met drie maatregelen,
  waaronder de oogstdatum in de gecachete waarde zodat een verse momentopname zichzelf oppikt.
  **H3:** een zesde codeplek in `apps/web` zet de declaratie uit voor precies de 238 producten van
  deze story; de poort accepteert nu de nieuwe reden en het scherm toont de herkomst. Verder:
  `uit-momentopname` mag nooit `ok` zijn (eigen criterium, want `bootstrap-run.ts:451` hangt eraan),
  de gln-zorg is niet vervallen maar verplaatst, de meting vraagt `KEURMERK_INDEX_LIMIT` ≥ 1870, en
  het onmeetbare getal 204 is vervangen door een eigen telregel. In de code verwerkt: `--harvested-at`
  voor een vergelijkbare hertelling, de generator weigert nu ook onveilige sleutels, oogstdatums en
  doelmarkten, het oogstscript importeert de dienstlaag niet meer (die trok Prisma en de queue zijn
  proces in), en het gegenereerde bestand staat in `.prettierignore` zodat `npm run format` het niet
  in één klap herschrijft (gemeten: 2863 diff-regels).
- 2026-08-19: **Versie 5** na `review-20-19-v4.md` (FAIL, 4 high / 13 medium / 7 low). Alle
  bevindingen verwerkt. De kern is besluit 2 van Friso: de geoogste gegevens gaan uitsluitend naar
  de beoordeelwachtrij, niet naar de automatische bevestiging. Daarmee vervallen drie bevindingen
  vanzelf (de ongeordende gln-opzoeking aan de T3777-ingang, de 61 producten zonder
  keurmerkveldsoort, en het filter zelf). Verder: de nieuwe reden heeft een naam
  (`uit-momentopname`) en alle drie de uitkomsten zijn gedefinieerd; de governance-bewering is
  gecorrigeerd (leesgebruiker, `TRADEITEMS_MONGO_URI` en de driver vervallen voor de applicatie,
  níet voor de regeneratie); de vijfde codeplek voor een nieuwe reden is toegevoegd; de doelmarkt
  staat nu in de momentopname en in een acceptatiecriterium; de cache-maatregel is uitvoerbaar
  geformuleerd; de veroudering krijgt een grens. In de code verwerkt: sleutels ontdubbelen bij het
  oogsten, filteren op omgevingssegment, codes met onveilige tekens weigeren, opmaakschone en dus
  idempotente uitvoer, en toetsen die de generator tegen `MARK_FIELDS` pinnen in plaats van tegen
  zichzelf.
- 2026-08-19: Versie 4 — ontwerpwijziging. De live leesverbinding vervangen door een eenmalig
  geoogste momentopname in de code. De oogst uitgevoerd: 442 sleutels, 238 met keurmerk, 475
  code-instanties, 52 unieke paren.
- 2026-08-19: Versie 3 na `review-20-19-v3.md`. Alle elf punten verwerkt; kern was de versmalling
  verplaatsen van de bron naar de afnemer. Verder: AC-nummering hersteld, "byte-identiek" vervangen
  door een overeenstemmingstoets, de 429- en 144-groep zelf volledig geteld (3 respectievelijk 0,
  niet 5 en 12).
- 2026-08-18: Versie 2 na review-20-19 (FAIL, 4 high). Opzoeken op `_id` in plaats van zoeken op
  `meta.gtin` (0 ms tegen 51 s), de onterechte gln-regel geschrapt, vijf veldsoorten in plaats van
  twee.
- 2026-08-18: Versie 1 aangemaakt nadat 20.18 sneuvelde.
