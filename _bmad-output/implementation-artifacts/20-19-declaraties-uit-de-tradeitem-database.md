# Story 20.19: Declaraties uit een momentopname van de trade-item-database

Status: **spec versie 5 — wacht op her-review.**

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
> **Wat besluit 2 betekent voor de code:** `resolveDeclarations` — de ingang die de automatische
> bevestiging voedt — wordt **niet aangeraakt**. Alleen `resolveDeclaredMarks`, de ingang van de
> indexbouwer, krijgt de terugval.

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

> **Volgorde-afwijking, met opzet vastgelegd.** Commit `c7e3fa5` bracht de momentopname, de
> generator en de toetsen naar `acc` terwijl deze spec nog op her-review wachtte. Dat draait de
> gebruikelijke volgorde om. Er is niets uitgerold en niets bedraad — het is data en een generator —
> maar het hoort genoemd. De bedrading zelf (AC1 t/m AC12) wacht wél op de review van déze versie.

## Acceptatiecriteria

1. **De terugval leest uit de momentopname, niet uit een database, en alleen bij de indexbouwer.**
   Levert `resolveDeclaredMarks` de reden `geen-tradeitem-bestand`, dan wordt
   `{gln}-{gtin}-{targetMarket}` opgezocht in `TRADEITEM_SNAPSHOT`. Geen netwerkaanroep, geen
   driver, geen inloggegevens.

   **`resolveDeclarations` wordt niet aangeraakt** (besluit 2). Daarmee vervallen twee zorgen uit
   de vorige review: de gln die die ingang zelf opzoekt is niet geordend
   (`prisma.artworkImport.findFirst({ where: { gtin, gln: { not: null } } })`,
   `t3777-declarations.ts:293-299`, zonder `orderBy`) en zou dus een andere sleutel kunnen vormen
   dan waarmee geoogst is; en de 61 producten zonder `PackagingMarkedLabelAccreditationCode` zouden
   daar een lege lijst opleveren zonder eigen reden. Beide zijn nu niet aan de orde.

2. **Drie uitkomsten, elk met een eigen reden. Geen vierde.**

   | geval | uitkomst | reden |
   |---|---|---|
   | sleutel staat niet in de momentopname | geen marks | `geen-tradeitem-bestand` — ongewijzigd |
   | sleutel staat erin met een **lege** lijst | geen marks | `lege-declaratie` |
   | sleutel staat erin **met codes** | de marks uit de momentopname | **`uit-momentopname`** (nieuw) |

   De naam is `uit-momentopname`, in dezelfde vorm als de bestaande redenen
   (`geen-tradeitem-bestand`, `lege-declaratie`). Zonder gekozen naam is dit niet te bouwen: de
   plekken in AC6 zijn `switch`- en `Record`-constructies waar de naam letterlijk in de code komt.

   Het onderscheid tussen "lege lijst" en "ontbrekende sleutel" is met opzet: een lege lijst
   betekent "gemeten, declareert niets" (204 sleutels), een ontbrekende sleutel betekent "niet
   gemeten" — en dat laatste getal is precies de hoeveelheid werk voor een verse oogst.

3. **Alleen als terugval, nooit als vervanging.** De XML-route blijft primair; de momentopname
   wordt uitsluitend geraadpleegd nádat de XML-route `geen-tradeitem-bestand` heeft opgeleverd.

   De 848 werkende producten kunnen niet geraakt worden: hun sleutels staan niet in de
   momentopname, en de opzoeking gebeurt pas ná die ene reden. Leg dat vast met een test die
   bewijst dat een `ok`-uitkomst de momentopname niet raadpleegt.

4. **Alle vijf de veldsoorten, mét `fieldType`.** De indexbouwer werkt op `(fieldType, code)`-
   sleutels; `resolveDeclaredMarks` → `parseDeclaredMarks` levert alle vijf (`MARK_FIELDS`,
   `t3777-declarations.ts:420-425`, plus `CONSUMER_USAGE_FIELD_TYPE` op `:434`). De momentopname
   draagt dezelfde vijf en die gelijkheid is vastgepind in een toets — `MARK_FIELDS` en
   `CONSUMER_USAGE_FIELD_TYPE` zijn daarvoor geëxporteerd.

5. **De momentopname is al genormaliseerd; de terugval normaliseert niet opnieuw.** Bij het oogsten
   is toegepast, gelijk aan `parseDeclaredMarks`: `trim()`, `toUpperCase()`, ontdubbeld per
   `(fieldType, code)`, lege waarden overgeslagen, uitsluitend `value` en nooit `oldValue`, en
   `enumerationValue` uitsluitend gescopet binnen `consumerUsageLabelCode`.

   *`oldValue` is bewust weggelaten: 17 code-instanties staan daar uitsluitend in, goed voor 5
   extra producten, maar het is een vórige waarde en zou valse akkoorden opleveren.*

6. **Fail-open, met een reden die de kwaliteitspoort niet omgooit.** `mapDeclarationReason` heeft
   `default: return 'api-fout'`, dus élke nieuwe reden telt nu als technische fout — met 23,7%
   tegen een drempel van 5% valt de poort van de indexbouwer om. `uit-momentopname` moet dus
   expliciet toegewezen worden **en buiten de teller van poortregel 7b vallen**. `VERIFIED`: die
   teller is `const technical = reasons['api-fout'] + reasons.timeout;`
   (`apps/api/src/scripts/build-keurmerk-index.ts:546`), dus een nieuwe reden valt er vanzelf
   buiten — zolang `mapDeclarationReason` hem niet alsnog op `api-fout` laat vallen.

   **`uit-momentopname` raakt vijf plekken. Alle vijf bijwerken:**

   | plek | bestand en regel |
   |---|---|
   | `DeclarationReason` (de union loopt t/m `:55`) | `apps/api/src/services/t3777-declarations.ts:48-55` |
   | `CollectReason` | `apps/api/src/scripts/build-keurmerk-index.ts:325-334` |
   | `emptyReasonCounts()` | `apps/api/src/scripts/build-keurmerk-index.ts:338-349` |
   | `mapDeclarationReason` — expliciete toewijzing, niet via `default` | `apps/api/src/scripts/build-keurmerk-index.ts` |
   | de **voortgangsregel** én de samenvattingsregel, die de redenen bij naam afdrukken | `build-keurmerk-index.ts:484-486` en `:630-636` |

   Die voortgangsregel is de vijfde plek die versie 4 miste: hij drukt
   `ok=… 404=… leeg=… geen-bestand=… api-fout=… timeout=…` af, dus een nieuwe reden is daar
   onzichtbaar tot hij wordt toegevoegd.

   *`timeout` en `niet-verwerkt` hoeven hier niet toegewezen te worden: die ontstaan in de
   indexbouwer zelf en komen nooit langs `mapDeclarationReason`. `VERIFIED`: `DeclarationReason`
   kent ze niet.*

7. **De cache mag de terugval niet 24 uur blokkeren.** `geen-tradeitem-bestand` houdt de normale
   TTL van 86.400 s (`VERIFIED`: `ttlForReason` geeft alleen `api-fout` een korte TTL,
   `t3777-declarations.ts:531-534`; `T3777_CACHE_TTL_S` staat standaard op `86400`, `:87`), en de
   cache wordt gelezen vóór de aanroep (`marksCacheRead` op `:642`). Zonder maatregel bereikt de
   terugval de 442 producten pas een dag ná uitrol.

   - **Formulering die klopt:** de cache wordt gewoon gelezen, maar een hit met reden
     `geen-tradeitem-bestand` wordt als **miss** behandeld. "De cachelees overslaan" kan niet — je
     moet lezen om de reden te kennen.
   - **De schakelaar is procesbreed, dus de naam moet dat zeggen.** `VERIFIED`: de cachelees zit in
     `t3777-declarations.ts`, een dienst die óók de detectie-worker gebruikt
     (`pipeline/detection-flow.ts:250`). Noem hem daarom niet `KEURMERK_INDEX_…`. Beter is een
     parameter op de aanroep in plaats van een omgevingsvariabele; kies dat als het kan, en
     anders een naam zonder `INDEX` erin.
   - De 442 bestaande cachesleutels **blijven staan**; de maatregel loopt eromheen. Ze alsnog
     verwijderen is een **schrijfactie op de acceptatie-Redis** en vraagt aparte toestemming.

8. **De veroudering is zichtbaar én bezwaarlijk.** Dit is de prijs van deze ontwerpkeuze:
   - De indexbouwer drukt bij elke run de **oogstdatum**, de **ouderdom in dagen** en de
     **doelmarkt** af uit `TRADEITEM_SNAPSHOT_META`, plus hoeveel sleutels uit de momentopname zijn
     gebruikt (de teller van `uit-momentopname`).
   - **Boven een leeftijdsgrens wordt de indexbouwer luidruchtig.** Kies een grens — voorstel: 180
     dagen — en laat de run daarboven een zichtbare waarschuwing geven. Zonder grens schaduwt een
     bevroren sleutel een product voor onbepaalde tijd, ook als de declaratie op productie
     verandert, want de XML-route komt er nooit aan toe.
   - Loopt een GTIN op `geen-tradeitem-bestand` en staat hij **niet** in de momentopname, dan telt
     dat als een eigen regel — dat getal is de hoeveelheid werk voor een verse oogst.
   - `apps/api/scripts/harvest-tradeitem-snapshot.ts` regenereert het bestand. Handmatig, met een
     leesverbinding, buiten de applicatie om, en bewust in `scripts/` zodat het níet mee de
     container in gaat. Het vraagt `mongodb` en `tsx`, die eerst geïnstalleerd moeten worden.

9. **De momentopname is doelmarkt-gebonden, en dat staat er ook.** `VERIFIED`: alle 442 sleutels
   eindigen op `-528`, en `TRADEITEM_SNAPSHOT_META.targetMarket` draagt die waarde. Staat
   `T3777_TARGET_MARKET` (`t3777-declarations.ts:86`, standaard `'528'`) ooit op iets anders, dan
   mist **elke** opzoeking — zonder foutmelding en zonder verschil met "niet gemeten". De
   opzoeking moet daarom melden wanneer de gevraagde doelmarkt niet die van de momentopname is,
   in plaats van stilzwijgend niets te vinden.

10. **Meetbare uitkomst.** Draai de indexbouwer droog vóór en ná en leg vast:

    | wat | verwacht |
    |---|---|
    | producten uit de 442 die alsnog een declaratie opleveren | **238** (475 code-instanties) |
    | producten met reden `uit-momentopname` | **238** |
    | producten met reden `lege-declaratie` uit de momentopname | **204** |
    | groei van de index in producten en in unieke `(fieldType, code)`-sleutels | te meten |

    Verwachting en meting naast elkaar in het story-record. Wijkt de meting meer dan 5% af, dan
    eerst uitzoeken waaróm voordat de story op `done` gaat.

11. **Testbaar zonder database.** De opzoeking krijgt de momentopname als **afhankelijkheid** mee,
    net als `GlnLookup` (`apps/api/scripts/backfill-gln-from-tradeitems.ts:143`) en `BackfillDeps`
    (`:146-159`), met een bestaande test ernaast. Zo draaien de tests op een kleine eigen
    momentopname en niet op 442 echte sleutels.

12. **RED-bewijs** voor AC1, AC2 en AC7, en **geen regressie**: de api-suite blijft groen. Toon ná
    de bouw dat de gecompileerde momentopname in `dist/` staat en dat de indexbouwer hem in de
    draaiende container leest — een testsuite die lokaal groen is bewijst dat niet.

## Wat NIET in deze story zit, met het getal erbij

- **De automatische bevestiging** — besluit 2. De 177 producten met een
  `PackagingMarkedLabelAccreditationCode` blijven daar buiten. Wil je dat later wél, dan is dat een
  eigen story mét een houdbaarheidsgrens op de momentopname.
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
- [Source: Dockerfile:57-58 — `src/` en `prisma/` worden gekopieerd, `scripts/` niet]

## Change Log

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
