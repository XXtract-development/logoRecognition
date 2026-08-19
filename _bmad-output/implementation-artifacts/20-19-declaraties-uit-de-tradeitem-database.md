# Story 20.19: Declaraties uit een momentopname van de trade-item-database

Status: **spec versie 4 — wacht op her-review.**

> **Ontwerpwijziging, 19 augustus 2026 (besluit Friso).** Versies 1 t/m 3 gaven de
> acceptatie-omgeving een **live leesverbinding** met de trade-item-database op productie. Dat is
> van tafel. In plaats daarvan is de uitlezing **één keer met de hand** gedaan en als momentopname
> in de code vastgelegd. De applicatie praat dus nooit zelf met productie.
>
> Aanleiding: het enige bestaande account (`xxtract`) is géén leesaccount — het draagt `dbOwner` +
> `readWrite` op `application` en `userAdminAnyDatabase` op `admin`. Die verbindingsreeks naar
> acceptatie brengen zou acceptatie schrijfrechten op productie geven. Een nieuwe leesgebruiker
> aanmaken kon, maar de keuze is gevallen op de route zonder verbinding.
>
> **Wat dit wint:** geen inloggegevens op acceptatie, geen netwerkafhankelijkheid, geen
> `mongodb`-driver, geen leesgebruiker om te beheren, en de terugval is volledig testbaar en
> deterministisch.
> **Wat dit kost:** de momentopname veroudert. Producten die ná 19 augustus 2026 binnenkomen staan
> er niet in. Zie AC8.

<!-- Vijfde poging in dit dossier. Vier eerdere verklaringen voor de vastgelopen oogst zijn
gemeten en gesneuveld (te kleine index; uitgeputte bron; gat in de bestandsopslag; verouderde
gln — story 20.18). Deze staat op wat ná die metingen overeind bleef. -->

## Story

Als **datamanager die het vliegwiel draaiende houdt**
wil ik **dat een ontbrekend XML-bestand geen keurmerkdeclaratie meer kost**
zodat **de oogst weer kandidaten krijgt uit producten die we al binnen hebben.**

## De opbrengst — geoogst, niet geschat

`VERIFIED` — de oogst is uitgevoerd op 19 augustus 2026 en staat in
`apps/api/src/services/tradeitem-declaration-snapshot.ts`. Vier onafhankelijke tellingen (v2 met
een `$reduce`-doorloop in de database, v3 met een boomdoorloop in de client, een eigen hertelling,
en de oogst zelf) komen op exact dezelfde getallen uit.

| | |
|---|---|
| Sleutels in de momentopname (de hele groep `geen-tradeitem-bestand`) | **442** |
| Documenten gevonden op `_id = {gln}-{gtin}-{tm}` | **442 (100%)** |
| Sleutels met ten minste één keurmerk | **238 (53,8%)** |
| Sleutels die aantoonbaar niets declareren | **204** |
| Code-instanties | **475** |
| Unieke `(fieldType, code)`-paren | **52** |

Per veldsoort:

| veldsoort (`meta.gdsn`) | `fieldType` | instanties | producten |
|---|---|---|---|
| `packagingMarkedLabelAccreditationCode` | `PackagingMarkedLabelAccreditationCode` | 292 | 177 |
| `dietTypeCode` | `DietTypeCode` | 89 | 68 |
| `nutritionalScore` | `NutritionalScore` | 61 | 61 |
| `enumerationValue`, gescopet binnen `consumerUsageLabelCode` | `EU_consumerUsageLabelCodeList` | 33 | 22 |
| `localPackagingMarkedLabelAccreditationCodeReference` | `AdditionalPackagingMarkingsCode` | **0** | **0** |

**Twee opbrengstgetallen, en ze horen allebei bij deze story** — omdat er twee afnemers zijn met
een verschillend contract (zie AC4):

| afnemer | veldsoorten | producten | code-instanties |
|---|---|---|---|
| **indexbouwer** via `resolveDeclaredMarks` — vult de beoordeelwachtrij | alle vijf | **238** | **475** |
| **automatische bevestiging** via `resolveDeclarations` | alleen `PackagingMarkedLabelAccreditationCode` | **177** | **292** |

De 238 is het getal waarop het akkoord van 19 augustus is gegeven, en dat blijft staan: de
beoordeelwachtrij — het doel van deze story — krijgt alle vijf de veldsoorten. De 177 is geen
verlies maar een filter aan de andere ingang, precies zoals de XML-route het vandaag ook doet.

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
`_bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md`, en op
dezelfde dag de keuze voor de **eenmalige oogst** in plaats van een vaste koppeling.

De uitgevoerde oogst valt daarmee binnen het akkoord én binnen het oudere akkoord van 2026-07-04
("eenmalig, handmatig, buiten piekuren, NOOIT automatisch"): het was één handmatige leesactie op
442 sleutels, uitsluitend `find` op de primaire sleutel, geen enkele schrijfbewerking. Conform de
werkwijze van story 18.1 geldt dit story-record als het governance-spoor.

**Wat hiermee vervalt** ten opzichte van versie 3: de leesrechten-gebruiker, `TRADEITEMS_MONGO_URI`
op de acceptatie-applicatie, de `mongodb`-driver in de applicatie, en het netwerkpad naar
`10.0.0.8:27017`. Geen van die vier is nog nodig.

## Wat er al ligt

`apps/api/src/services/tradeitem-declaration-snapshot.ts` — gegenereerd, 442 sleutels, met
`TRADEITEM_SNAPSHOT_META` (oogstdatum, herkomst, aantallen per veldsoort) en `TRADEITEM_SNAPSHOT`
(sleutel → lijst van `{fieldType, code}`).

`VERIFIED` — het bestand staat onder `src/` en niet onder `scripts/`, en dat is geen detail: de
Dockerfile kopieert `apps/api/src/` en `apps/api/prisma/`, **niet** `apps/api/scripts/`
(`Dockerfile:57-58`). Een databestand in `scripts/` bereikt de container nooit. Dezelfde val kostte
eerder de region proposer een deploy.

## Acceptatiecriteria

1. **De terugval leest uit de momentopname, niet uit een database.** Levert de XML-route
   `geen-tradeitem-bestand`, dan wordt `{gln}-{gtin}-{targetMarket}` opgezocht in
   `TRADEITEM_SNAPSHOT`. Geen netwerkaanroep, geen driver, geen inloggegevens. De doelmarkt komt
   uit `T3777_TARGET_MARKET` (standaard `528`), dezelfde bron als de XML-route.

2. **Een lege lijst is een antwoord, een ontbrekende sleutel niet.** De momentopname bevat
   opzettelijk ook de **204** sleutels die niets declareren. Een lege lijst betekent "gemeten,
   declareert niets" en levert `lege-declaratie`; een sleutel die er helemaal niet in staat
   betekent "niet gemeten" en laat de uitkomst onveranderd op `geen-tradeitem-bestand`. Die twee
   mogen niet op één hoop, anders is straks niet te zien welke producten een verse oogst nodig
   hebben.

3. **Alleen als terugval, nooit als vervanging.** De XML-route blijft primair; de momentopname
   wordt uitsluitend geraadpleegd bij `geen-tradeitem-bestand`. Beide ingangen moeten geraakt
   worden — `resolveDeclarations` en `resolveDeclaredMarks` — elk met een eigen cache.

   **De 848 werkende producten mogen niet veranderen.** De momentopname bevat hun sleutels niet, dus
   dat volgt uit AC2; toets het met een test die bewijst dat een `ok`-uitkomst de momentopname niet
   raadpleegt. *Ter herinnering waarom de momentopname nooit de XML vervangt: van 100 vergeleken
   producten weken er 2 af, waaronder één met een ander codewoord (`RAINFOREST_ALLIANCE` tegenover
   `RAINFOREST_ALLIANCE_PEOPLE_NATURE`).*

4. **Versmallen doe je bij de afnemer, niet bij de bron.** Dit is de correctie op versie 2, die "de
   terugval" als geheel versmalde en daarmee 61 producten weggooide bij de verkeerde ingang.
   `VERIFIED` in de code — de twee uitgangen hebben een verschillend contract:

   | uitgang | wat hij vandaag uit de XML haalt | bewijs |
   |---|---|---|
   | `resolveDeclarations` → `parseT3777Codes` | **uitsluitend** `packagingMarkedLabelAccreditationCode`, als platte codelijst | `t3777-declarations.ts:97-108` |
   | `resolveDeclaredMarks` → `parseDeclaredMarks` | alle vijf, als `{code, fieldType}` | `t3777-declarations.ts:420-431` |

   De momentopname draagt **alle vijf de veldsoorten mét `fieldType`**, en de T3777-ingang filtert
   daaruit uitsluitend `PackagingMarkedLabelAccreditationCode` — exact wat de XML-route ook doet. Zo
   komen er geen vreemde codelijsten bij de automatische bevestiging terecht én verliest de
   indexbouwer geen 61 producten (waaronder alle 61 Nutri-Score-producten en 22
   AISE/NIX18-pictogrammen).

5. **De momentopname is al genormaliseerd; de terugval normaliseert niet opnieuw.** Bij het oogsten
   is toegepast, gelijk aan `parseDeclaredMarks`: `trim()`, `toUpperCase()`, ontdubbeld per
   `(fieldType, code)`, lege waarden overgeslagen, uitsluitend `value` en nooit `oldValue`, en
   `enumerationValue` uitsluitend gescopet binnen `consumerUsageLabelCode`. Leg dat vast in een test
   op het bestand zelf: geen lege codes, geen dubbele paren, elke `fieldType` uit de vijf bekende
   waarden. Zo bewaakt de test de generator, niet andersom.

   *`oldValue` is bewust weggelaten: 17 code-instanties staan daar uitsluitend in, goed voor 5
   extra producten, maar het is een vórige waarde en zou valse akkoorden in de kruischeck opleveren.*

6. **Fail-open, met een redencode die de poort niet omgooit.** `mapDeclarationReason` heeft
   `default: return 'api-fout'`, dus élke nieuwe redencode telt nu als technische fout — met 23,7%
   tegen een drempel van 5% valt de kwaliteitspoort van de indexbouwer om. De nieuwe reden moet
   expliciet toegewezen worden **en buiten de teller van poortregel 7b vallen**. `VERIFIED`: die
   teller is `const technical = reasons['api-fout'] + reasons.timeout;`
   (`build-keurmerk-index.ts:546`), dus een nieuwe reden valt er vanzelf buiten — zolang
   `mapDeclarationReason` hem niet alsnog op `api-fout` laat vallen.

   **Een nieuwe redencode raakt vier plekken. Alle vier bijwerken:**

   | plek | bestand |
   |---|---|
   | `DeclarationReason` | `t3777-declarations.ts:48-56` |
   | `CollectReason` én `emptyReasonCounts()` | `build-keurmerk-index.ts:325-349` |
   | `mapDeclarationReason` — expliciete toewijzing, niet via `default` | `build-keurmerk-index.ts` |
   | de twee samenvattingsregels, die de redenen bij naam afdrukken | `build-keurmerk-index.ts:633-634` |

   *`timeout` en `niet-verwerkt` hoeven hier niet toegewezen te worden: die ontstaan in de
   indexbouwer zelf en komen nooit langs `mapDeclarationReason`. `VERIFIED`: `DeclarationReason`
   kent ze niet.*

7. **De cache mag de terugval niet 24 uur blokkeren, en de twee caches moeten uit elkaar blijven.**
   - `geen-tradeitem-bestand` wordt 24 uur gecacht en de cache wordt vóór de aanroep gelezen.
     Zonder maatregel bereikt de terugval de 442 producten pas een dag ná uitrol en is de
     voor/na-meting onmogelijk. Bouw een **schakelaar bij naam** — bijvoorbeeld
     `KEURMERK_INDEX_REFRESH_REASONS=geen-tradeitem-bestand` — die de cachelees voor precies die
     reden overslaat. Geen algemene cache-uitschakelaar.
   - De 442 bestaande cachesleutels **blijven staan**; de schakelaar loopt eromheen. Ze alsnog
     verwijderen is een **schrijfactie op de acceptatie-Redis** en vraagt aparte toestemming.
   - **Omgevingsscheiding.** `VERIFIED`: `marks:{env}:{gln}:{gtin}:{tm}` draagt een
     omgevingssegment (`:521`), `t3777:{gln}:{gtin}:{tm}` **niet** (`:112`). Delen twee omgevingen
     ooit één Redis, dan kan het acceptatiepad langs de T3777-cache op productiegegevens gaan
     draaien. Geef de T3777-sleutel hetzelfde omgevingssegment, of leg vast waarom dat niet kan.

8. **De veroudering is zichtbaar, niet stil.** Dit is de prijs van deze ontwerpkeuze en hij moet
   afleesbaar zijn:
   - De indexbouwer drukt bij elke run de **oogstdatum** en de **ouderdom in dagen** af uit
     `TRADEITEM_SNAPSHOT_META`, plus hoeveel sleutels uit de momentopname zijn gebruikt.
   - Loopt een GTIN op `geen-tradeitem-bestand` en staat hij **niet** in de momentopname, dan telt
     dat als een eigen regel in de samenvatting — dat getal is precies de hoeveelheid werk voor een
     verse oogst.
   - `apps/api/scripts/harvest-tradeitem-snapshot.ts` regenereert het bestand. Dat script draait
     **handmatig**, met een leesverbinding, buiten de applicatie om, en staat bewust in `scripts/`
     zodat het níet mee de container in gaat. In de kop van dat script: dezelfde waarschuwing als
     in het 18.1-script ("NOOIT automatisch").

9. **Meetbare uitkomst, met de twee getallen apart.** Draai de indexbouwer droog vóór en ná en leg
   vast:

   | wat | verwacht |
   |---|---|
   | producten uit de 442 die alsnog een declaratie opleveren, alle vijf veldsoorten | **238** (475 code-instanties) |
   | daarvan bruikbaar voor de automatische bevestiging | **177** (292 code-instanties) |
   | groei van de index in producten en in unieke `(fieldType, code)`-sleutels | te meten |

   Verwachting en meting naast elkaar in het story-record. Wijkt de meting meer dan 5% af, dan
   eerst uitzoeken waaróm voordat de story op `done` gaat.

10. **Testbaar zonder database.** De opzoeking krijgt de momentopname als **afhankelijkheid** mee,
    net als `GlnLookup`/`BackfillDeps` in `apps/api/scripts/backfill-gln-from-tradeitems.ts:143-152`
    (met een bestaande test ernaast). Zo draaien de tests op een kleine eigen momentopname en niet
    op 442 echte sleutels. *Versie 2 beweerde "er is nu geen testnaad voor Mongo"; dat klopte niet,
    en met dit ontwerp is er sowieso geen database meer in het testpad.*

11. **RED-bewijs** voor AC1, AC2 en AC4, en **geen regressie**: de api-suite blijft groen, inclusief
    de tests rond `t3777-declarations` en de indexbouwer.

12. **Het bestand komt daadwerkelijk in de container.** `VERIFIED` vooraf: de Dockerfile kopieert
    `apps/api/src/`, niet `apps/api/scripts/`. Toon ná de bouw dat de gecompileerde momentopname in
    `dist/` staat en dat de indexbouwer hem in de draaiende container leest — een testsuite die
    lokaal groen is bewijst dat niet.

## Wat NIET in deze story zit, met het getal erbij

- **Een vaste koppeling met de trade-item-database.** Bewust niet gekozen; blijft mogelijk als de
  momentopname te vaak verloopt.
- **De 429 producten met een lege declaratie.** `VERIFIED, volledige telling`: 429/429 documenten
  bestaan, en **3** ervan declareren iets. Deze weg is dicht.
- **De 144 met een 404.** `VERIFIED, volledige telling`: **0 van de 144** heeft een document op
  `_id = {gln}-{gtin}-528`. Langs deze route leveren ze niets op. Dat een eerdere meting "12
  declarerend" noemde klopt niet met deze route — die 12 kwamen uit een zoekopdracht op gtin, dus
  onder een **andere** doelmarkt of gln. Dat is precies de TM-mismatch die de redencode al
  vermoedt, en een eigen story met een eigen meting waard.
- Het bijwerken van `artwork_imports`.
- Het herbouwen van de live index (aparte schrijfactie, wacht op toestemming).
- De vier niet-keurmerkveldsoorten bij de **automatische bevestiging** — die komen met AC4 wél in
  de index, maar bewust niet in de kruischeck.

## Bronverwijzingen

- [Source: _bmad-output/implementation-artifacts/review-20-19.md — eerste review, vier highs]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v2.md — de telling 238/442 en 475 codes]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v3.md — her-review, FAIL; de meting 177/292]
- [Source: _bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md — de gln-regel, het akkoordpatroon en de testnaad]
- [Source: _bmad-output/implementation-artifacts/20-18-verouderde-gln-blokkeert-oogst.md — afgekeurd, met de meting die de gln-route uitsluit]
- [Source: _bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md — akkoordverzoek en aanvulling]
- [Source: apps/api/src/services/tradeitem-declaration-snapshot.ts — de geoogste momentopname]
- [Source: apps/api/src/services/t3777-declarations.ts — XML-route, de twee ingangen, cache, `mapDeclarationReason`]
- [Source: apps/api/src/scripts/build-keurmerk-index.ts — indexbouwer, redencodes, poortregel 7b]
- [Source: Dockerfile:57-58 — `src/` en `prisma/` worden gekopieerd, `scripts/` niet]

## Change Log

- 2026-08-19: **Versie 4 — ontwerpwijziging.** De live leesverbinding is vervangen door een
  eenmalig geoogste momentopname in de code (besluit Friso). Daarmee vervallen de leesgebruiker,
  `TRADEITEMS_MONGO_URI`, de `mongodb`-driver en het netwerkpad. De oogst is uitgevoerd: 442
  sleutels, 238 met keurmerk, 475 code-instanties, 52 unieke paren. Nieuw: AC2 (lege lijst tegenover
  ontbrekende sleutel), AC8 (de veroudering zichtbaar maken, plus het regeneratiescript) en AC12
  (bewijzen dat het bestand de container haalt — `scripts/` wordt niet gekopieerd).
- 2026-08-19: Versie 3 na `review-20-19-v3.md` (FAIL, 3 high / 10 medium / 7 low). Alle elf punten
  verwerkt; kern was de versmalling verplaatsen van de bron naar de afnemer, waarmee de indexbouwer
  de beloofde 238 producten houdt. Verder: AC-nummering hersteld, "byte-identiek" vervangen door een
  overeenstemmingstoets met ondergrens, de 429- en 144-groep zelf volledig geteld (3 respectievelijk
  0, niet 5 en 12), de onjuiste bewering over de ontbrekende testnaad geschrapt, de vier codeplekken
  voor een nieuwe redencode benoemd, en de cache-schakelaar plus de omgevingsscheiding uitgeschreven.
- 2026-08-18: Versie 2 na review-20-19 (FAIL, 4 high). Opzoeken op `_id` in plaats van zoeken op
  `meta.gtin` (0 ms tegen 51 s), de onterechte gln-regel geschrapt (kostte 32 van de 211), vijf
  veldsoorten in plaats van twee.
- 2026-08-18: Versie 1 aangemaakt nadat 20.18 sneuvelde.
