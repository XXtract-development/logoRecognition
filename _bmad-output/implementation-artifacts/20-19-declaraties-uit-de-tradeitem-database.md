# Story 20.19: Declaraties lezen uit de trade-item-database als het XML-bestand ontbreekt

Status: **spec herzien (versie 3) — wacht op her-review.** Bouwen kan pas als de toegang uit
"Voorwaarden buiten deze story" geregeld is.

<!-- Vijfde poging in dit dossier. Vier eerdere verklaringen voor de vastgelopen oogst zijn
gemeten en gesneuveld (te kleine index; uitgeputte bron; gat in de bestandsopslag; verouderde
gln — story 20.18). Deze staat op wat ná die metingen overeind bleef, en de opbrengst is dit keer
geteld in plaats van geschat. -->

## Story

Als **datamanager die het vliegwiel draaiende houdt**
wil ik **dat een ontbrekend XML-bestand geen keurmerkdeclaratie meer kost**
zodat **de oogst weer kandidaten krijgt uit producten die we al binnen hebben.**

## De opbrengst — geteld, niet geschat

`VERIFIED` — drie onafhankelijke tellingen (v2 met een `$reduce`-doorloop in de database, v3 met
een boomdoorloop in de client, en een eigen hertelling op 19 augustus) komen op exact dezelfde
getallen uit. Volledige telling over alle 442, geen steekproef.

Van de **442** producten waarvan het XML-bestand ontbreekt heeft **442 (100%)** een document onder
onze eigen gln. Wat die documenten declareren:

| veldsoort (`meta.gdsn`) | `fieldType` | code-instanties | producten |
|---|---|---|---|
| `packagingMarkedLabelAccreditationCode` | `PackagingMarkedLabelAccreditationCode` | 292 | 177 |
| `dietTypeCode` | `DietTypeCode` | 89 | 68 |
| `nutritionalScore` | `NutritionalScore` | 61 | 61 |
| `enumerationValue`, gescopet binnen `consumerUsageLabelCode` | `EU_consumerUsageLabelCodeList` | 33 | 22 |
| `localPackagingMarkedLabelAccreditationCodeReference` | `AdditionalPackagingMarkingsCode` | **0** | **0** |
| **totaal (producten ontdubbeld)** | | **475** | **238** |

**Twee opbrengstgetallen, en ze horen allebei bij deze story** — omdat er twee afnemers zijn met
een verschillend contract (zie AC5):

| afnemer | veldsoorten | producten | code-instanties |
|---|---|---|---|
| **indexbouwer** via `resolveDeclaredMarks` — vult de beoordeelwachtrij | alle vijf | **238** | **475** |
| **automatische bevestiging** via `resolveDeclarations` | alleen `PackagingMarkedLabelAccreditationCode` | **177** | **292** |

De 238 is het getal waarop het akkoord van 19 augustus is gegeven, en dat blijft staan: de
beoordeelwachtrij — het doel van deze story — krijgt alle vijf de veldsoorten. De 177 is geen
verlies maar een filter aan de andere ingang, precies zoals de XML-route het vandaag ook doet.

*Eerdere versies noemden 179-211. Dat was te laag: die telling liep langs 2 van de 5 veldsoorten
en kapte de documentboom na 12 niveaus af.*

Twee waarnemingen die de bouw raken:
- `localPackagingMarkedLabelAccreditationCodeReference` levert in de hele set **niets** op. De
  toewijzingstabel houdt de regel — het veld bestaat — maar niemand hoeft erop te wachten.
- Alle 442 documenten werden gevonden op de exacte sleutel: **442 van 442**, geen enkele misser.
  De opzoeking op `_id` is dus niet alleen snel maar ook volledig.

Dat is het verschil met de afgekeurde voorganger 20.18, die 0 van 62 opleverde. De premisse
onder déze story is gemeten en houdt stand.

### Herbruikbaar meetfragment

```javascript
// productie, application.tradeItems — uitsluitend lezen
db.tradeItems.find({ _id: { $in: [ /* "{gln}-{gtin}-{tm}", 442 sleutels */ ] } })
// per document de boom aflopen; verzamel knopen met meta.gdsn in de vijf namen hierboven;
// enumerationValue alleen meetellen als meta.xpath 'consumerUsageLabelCode' bevat;
// tel uitsluitend een niet-lege .value (NIET .oldValue).
```

De sleutels komen uit de declaratiecache van de acceptatie-applicatie (`SCAN marks:*` + `MGET`,
filteren op `reason`), niet uit een zoekopdracht op de database.

### Wat de oorzaak NIET is, zodat niemand die wegen opnieuw inloopt

- **niet** een te kleine index: volledige herbouw geeft +29 producten, +1 code.
  *`INFERENCE` — overgenomen uit het onderzoek van 18 augustus, niet opnieuw nagemeten.*
- **niet** een verouderde gln: bij 10 van 10 gecontroleerde gevallen is de werkende gln exact die
  van ons; bij het kroongetuige-product faalt ook de nieuwere gln (story 20.18, afgekeurd).
- **niet** een uitlezer die velden mist. `VERIFIED, volledige telling 19 augustus`: van de **429**
  producten met een lege declaratie declareren er op productie **3** — 3 code-instanties
  `packagingMarkedLabelAccreditationCode` en 2 `nutritionalScore`. Alle 429 documenten bestaan wél
  (429/429 gevonden op `_id`); ze zijn gewoon leeg. Terecht uitgesloten.

## Voorwaarden buiten deze story

1. **Een leesrechten-gebruiker** op de trade-item-database, rol `read` op `application`, verder
   niets. `VERIFIED, 19 augustus`: het account waarmee tot nu toe gemeten is (`xxtract`) is
   **geen** leesaccount — het draagt `dbOwner` + `readWrite` op `application` plus
   `userAdminAnyDatabase`. Die verbindingsreeks mag dus **niet** naar de acceptatie-omgeving; dat
   zou acceptatie schrijfrechten op productie geven en het recht gebruikers aan te maken.
2. **De verbindingsreeks als `TRADEITEMS_MONGO_URI`** op de acceptatie-applicatie — dezelfde naam
   die story 18.1 al gebruikt, niet een nieuwe ernaast. `VERIFIED, 19 augustus`: staat nog niet
   gezet op de acceptatiecontainer.
3. **De `mongodb`-driver.** `VERIFIED`: die staat in **geen enkele** package.json en moet
   toegevoegd worden; daardoor draait ook het bestaande 18.1-script vandaag niet.

`VERIFIED` — het netwerkpad bestaat al: de applicatiecontainer bereikt `10.0.0.8:27017`.

### Het governance-akkoord

**AKKOORD (Friso, 19 augustus 2026).** Het akkoord van 2026-07-04 gold een eenmalige, handmatige
leesactie buiten piekuren ("NOOIT automatisch" in de scriptkop). Deze story maakt de
productiedatabase een terugkerende afhankelijkheid; dat is voorgelegd met de onderbouwing in
`_bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md` en
goedgekeurd. Conform de werkwijze van story 18.1 geldt dit story-record als het governance-spoor;
volgens 18.1 is Friso zelf de goedkeurder en is er geen externe poort.

Voorwaarden zoals goedgekeurd, plus de twee die het akkoordverzoek nog openliet:

| | |
|---|---|
| Reikwijdte | uitsluitend lezen, uitsluitend `application.tradeItems` |
| Methode | opzoeken op primaire sleutel; **geen** collectiescan |
| Volume | ten hoogste enkele honderden opzoekingen per indexbouw |
| **Tijdvenster** | geen beperking gevraagd of gegeven — de opzoeking kost 0 ms en volgt de indexbouw, die niet continu draait |
| **Verbindingsprofiel** | één verbinding per proces, pool van ten hoogste 5, time-out 5000 ms (AC10) |

Het akkoordverzoek noemt als verwachting 238 producten. Met de splitsing van AC5 blijft dat het
getal voor de beoordeelwachtrij; er is dus geen nieuw akkoord nodig.

## Het bestaande patroon — wat wél en wat NIET hergebruikt wordt

`apps/api/scripts/backfill-gln-from-tradeitems.ts` (story 18.1) levert het patroon: lazy import van
de driver, `TRADEITEMS_MONGO_URI`, uitsluitend `find`, geen schrijfbewerkingen. Het levert ook de
**testnaad**: `GlnLookup` en `BackfillDeps` (`:143-152`), met een bestaande test op
`apps/api/src/__tests__/services/backfill-gln-from-tradeitems.test.ts`.

**Niet overnemen: de zoekmethode.** Dat script zoekt met een reguliere expressie over `_id`
(`{ _id: { $regex: '...$' } }`), en dat is precies de collectiescan van 51 seconden per aanroep.
Die is daar aanvaardbaar omdat het om één handmatige run ging; hier niet. Deze story doet een
**exacte** opzoeking op `_id`.

## Acceptatiecriteria

1. **Opzoeken op sleutel, niet zoeken op veld.** Het document heeft `_id` in de vorm
   `{gln}-{gtin}-{targetMarket}`. `VERIFIED, zelf gemeten`: opzoeken op `_id` kost **0 ms**,
   terwijl `{"meta.gtin": …}` een collectiescan is over 161.945 documenten van **50.934 ms** — 442
   producten zouden dan 6,3 uur scannen betekenen tegen een budget van 20 minuten per run.
   Gebruik de gln die de oogst toch al heeft en zoek rechtstreeks op `_id`.

   **Nuance bij de doelmarkt:** `meta.targetMarket` is een **array** (`["528"]`), en `_id` draagt
   uitsluitend het **eerste** element. 4.044 documenten hebben er 2, 3 of 5. De doelmarkt die wij
   invullen komt uit `T3777_TARGET_MARKET` (standaard `528`), dezelfde bron als de XML-route.

2. **Alleen de exacte sleutelopzoeking, niet de scan uit 18.1.** `find({_id: "{gln}-{gtin}-{tm}"})`
   — geen `$regex`, geen zoeken op `meta.gtin`. Gemeten verschil: 0 ms tegenover 50.934 ms.

3. **Daarmee vervalt elke gln-keuze.** Er wordt niets gegokt: we lezen de declaratie voor de gln
   die de oogst toch al gebruikt. De regel uit story 18.1 ("bij meer dan één gln niet gokken") gaat
   over het **schrijven** van een gln in `artwork_imports` en is hier niet van toepassing — de
   vorige versie van deze spec nam die regel verkeerd over en wierp daarmee 32 van de 211 producten
   weg, inclusief het eigen kroongetuige-product. Inmiddels is bovendien gemeten dat **alle** 442
   producten een document onder onze eigen gln hebben, dus er valt sowieso niets te kiezen.

4. **Alleen als terugval, nooit als vervanging.** De XML-route blijft primair; de database wordt
   uitsluitend geraadpleegd bij `geen-tradeitem-bestand`. Beide ingangen moeten geraakt worden —
   `resolveDeclarations` en `resolveDeclaredMarks` — elk met een eigen cache.

   **De 848 werkende producten mogen niet veranderen.** Toets dat met een steekproef van ten minste
   100 producten uit de `ok`-groep: XML-uitkomst tegenover database-uitkomst, per
   `(fieldType, code)`. `VERIFIED`: die twee zijn **niet** byte-identiek — van 100 vergeleken
   producten weken er 2 af, waarvan één met een ander codewoord (`RAINFOREST_ALLIANCE` tegenover
   `RAINFOREST_ALLIANCE_PEOPLE_NATURE`). Ondergrens: ten hoogste **5 van de 100** mag afwijken, en
   elke afwijking wordt gelogd met beide waarden. Boven die grens stopt de story en gaat de
   afwijking eerst naar Friso. Dit is precies waarom de database alléén dient waar de XML ontbreekt.

5. **Versmallen doe je bij de afnemer, niet bij de bron.** Dit is de correctie op versie 2, die
   "de terugval" als geheel versmalde en daarmee 61 producten weggooide bij de verkeerde ingang.
   `VERIFIED` in de code — de twee uitgangen hebben een verschillend contract:

   | uitgang | wat hij vandaag uit de XML haalt | bewijs |
   |---|---|---|
   | `resolveDeclarations` → `parseT3777Codes` | **uitsluitend** `packagingMarkedLabelAccreditationCode`, als platte codelijst | `t3777-declarations.ts:97-108` |
   | `resolveDeclaredMarks` → `parseDeclaredMarks` | alle vijf, als `{code, fieldType}` | `t3777-declarations.ts:420-431` (`MARK_FIELDS` + `CONSUMER_USAGE_FIELD_TYPE`) |

   De databaseterugval levert daarom **alle vijf de veldsoorten mét `fieldType`**, en de
   T3777-ingang filtert daaruit uitsluitend `PackagingMarkedLabelAccreditationCode` — exact wat de
   XML-route ook doet. Zo komen er geen vreemde codelijsten bij de automatische bevestiging terecht
   én verliest de indexbouwer geen 61 producten (waaronder alle 61 Nutri-Score-producten en 22
   AISE/NIX18-pictogrammen).

   **De toewijzingstabel hoort in de code, niet impliciet** — vijf regels, gdsn-naam → `fieldType`,
   de tabel in "De opbrengst" hierboven. Neem de meting per veldsoort ook op in de indexbouwer,
   zodat het verschil zichtbaar blijft.

6. **Het uitlezen is bestand tegen de werkelijke structuur.** De waarden zitten diep in
   onregelmatig geneste lijsten (een vast pad werkt niet: geprobeerd, dat gaf 161.945 dan wel 0
   treffers). Loop de boom af op `meta.gdsn`. Neem daarbij mee:
   - **alleen `value`, NIET `oldValue`.** `VERIFIED`: **17** code-instanties staan uitsluitend in
     `oldValue`, goed voor 5 extra producten. Maar `oldValue` is een vórige waarde; die als
     declaratie gebruiken levert valse akkoorden in de kruischeck. Vijf producten zijn dat niet
     waard.
   - **`enumerationValue` uitsluitend gescopet binnen `consumerUsageLabelCode`** — dezelfde scoping
     die `parseDeclaredMarks` toepast, om dezelfde reden: de naam is generiek in GDSN. Toets op
     `meta.xpath`. *`INFERENCE`: in de 442 gemeten documenten kwam `enumerationValue` uitsluitend
     gescopet voor, en in een steekproef van 3.000 willekeurige documenten kwam hij helemaal niet
     voor. Over de hele collectie is het niet vastgesteld — daarom is de scoping een eis en geen
     aanname.*
   - **`trim()` en `toUpperCase()`** op elke waarde, en **ontdubbelen per `(fieldType, code)`** —
     niet per code alleen. Dat is wat `parseDeclaredMarks` doet; wijkt de terugval hiervan af, dan
     krijgt dezelfde code twee verschijningsvormen. Over de 442 levert dat 52 unieke paren.
   - lege waarden overslaan.

7. **Fail-open, met redencodes die de poort niet omgooien.** `mapDeclarationReason` heeft
   `default: return 'api-fout'`, dus élke nieuwe redencode telt nu als technische fout — met 23,7%
   tegen een drempel van 5% valt de kwaliteitspoort van de indexbouwer om. De nieuwe reden moet
   daarom expliciet toegewezen worden **en buiten de teller van poortregel 7b vallen**.
   `VERIFIED`: die teller is `const technical = reasons['api-fout'] + reasons.timeout;`
   (`build-keurmerk-index.ts:546`), dus een nieuwe reden valt er vanzelf buiten — zolang
   `mapDeclarationReason` hem niet alsnog op `api-fout` laat vallen.

   **Een nieuwe redencode raakt vier plekken. Alle vier bijwerken:**

   | plek | bestand |
   |---|---|
   | `DeclarationReason` | `t3777-declarations.ts:48-56` |
   | `CollectReason` én `emptyReasonCounts()` | `build-keurmerk-index.ts:325-349` |
   | `mapDeclarationReason` — expliciete toewijzing, niet via `default` | `build-keurmerk-index.ts` |
   | de twee samenvattingsregels, die de redenen bij naam afdrukken | `build-keurmerk-index.ts:633-634` |

   *Vervalt uit versie 2: "inclusief `timeout` en `niet-verwerkt`". Die twee zijn geen
   declaratieredenen — ze ontstaan in de indexbouwer zelf (`getGtinTimeoutMs`, `getMaxRuntimeMs`)
   en komen nooit langs `mapDeclarationReason`. `VERIFIED`: `DeclarationReason` kent ze niet.*

   Is de database onbereikbaar of niet ingesteld, dan blijft de uitkomst zoals nu en loopt de run
   door.

8. **De cache mag de terugval niet 24 uur blokkeren, en de twee caches moeten uit elkaar blijven.**
   - `geen-tradeitem-bestand` wordt 24 uur gecacht en de cache wordt vóór de aanroep gelezen.
     Zonder maatregel bereikt de terugval de 442 producten pas een dag ná uitrol en is de
     voor/na-meting onmogelijk. Bouw een **schakelaar bij naam** — bijvoorbeeld
     `KEURMERK_INDEX_REFRESH_REASONS=geen-tradeitem-bestand` — die de cachelees voor precies die
     reden overslaat. Geen algemene cache-uitschakelaar.
   - De 442 bestaande cachesleutels **blijven staan**; de schakelaar loopt eromheen. Ze alsnog
     verwijderen is een **schrijfactie op de acceptatie-Redis** en vraagt aparte toestemming; doe
     dat niet als onderdeel van deze story.
   - **Omgevingsscheiding.** `VERIFIED`: `marks:{env}:{gln}:{gtin}:{tm}` draagt een
     omgevingssegment (`:521`), `t3777:{gln}:{gtin}:{tm}` **niet** (`:112`). Delen twee omgevingen
     ooit één Redis, dan kan het acceptatiepad langs de T3777-cache op productiegegevens gaan
     draaien. Geef de T3777-sleutel hetzelfde omgevingssegment, of leg vast waarom dat hier niet
     kan.

9. **Meetbare uitkomst, met de twee getallen apart.** Draai de indexbouwer droog vóór en ná en leg
   vast:

   | wat | verwacht |
   |---|---|
   | producten uit de 442 die alsnog een declaratie opleveren, alle vijf veldsoorten | **238** (475 code-instanties) |
   | daarvan bruikbaar voor de automatische bevestiging | **177** (292 code-instanties) |
   | groei van de index in producten en in unieke `(fieldType, code)`-sleutels | te meten |

   Verwachting en meting naast elkaar in het story-record. Wijkt de meting meer dan 5% af, dan
   eerst uitzoeken waaróm voordat de story op `done` gaat.

10. **Leesrechten, zichtbaar in de code, met getallen.** Alleen `find` — geen enkele
    schrijfbewerking in het codepad. Time-out **5000 ms** op de opzoeking (ruim onder de 30 s van
    de indexbouwer per GTIN), pool van ten hoogste **5**, één verbinding per proces, netjes
    gesloten. Let op het verschil tussen een langlopend script en de webserver: de webserver mag de
    verbinding niet per aanroep opnieuw opzetten.

11. **Testbaar.** Volg de bestaande testnaad van 18.1 (`GlnLookup`/`BackfillDeps`,
    `backfill-gln-from-tradeitems.ts:143-152`, met een bestaande test ernaast): geef de opzoeking
    als afhankelijkheid mee, zodat er in de test geen echte database nodig is. *Versie 2 beweerde
    "er is nu geen testnaad voor Mongo"; dat klopte niet.*

12. **RED-bewijs** voor AC1, AC5 en AC6, en **geen regressie**: de api-suite blijft groen,
    inclusief de tests rond `t3777-declarations` en de indexbouwer.

## Wat NIET in deze story zit, met het getal erbij

- **De 429 producten met een lege declaratie.** `VERIFIED, volledige telling`: 429/429 documenten
  bestaan, en **3** ervan declareren iets. Dit is geen weg meer; hij is dicht.
- **De 144 met een 404.** `VERIFIED, volledige telling`: **0 van de 144** heeft een document op
  `_id = {gln}-{gtin}-528`. Langs de route van deze story leveren ze dus niets op. Dat een eerdere
  meting "12 declarerend" noemde klopt niet met deze route — die 12 kwamen uit een zoekopdracht op
  gtin, dus onder een **andere** doelmarkt of gln. Dat is precies de TM-mismatch die de redencode
  al vermoedt, en het is een eigen story met een eigen meting waard.
- Het bijwerken van `artwork_imports`.
- Het herbouwen van de live index (aparte schrijfactie, wacht op toestemming).
- De aparte story voor de vier niet-keurmerkveldsoorten bij de **automatische bevestiging** — die
  komen met AC5 wél in de index, maar bewust niet in de kruischeck.

## Bronverwijzingen

- [Source: _bmad-output/implementation-artifacts/review-20-19.md — eerste review, vier highs]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v2.md — de telling 238/442 en 475 codes]
- [Source: _bmad-output/implementation-artifacts/review-20-19-v3.md — her-review, FAIL; de meting 177/292]
- [Source: _bmad-output/implementation-artifacts/18-1-gln-backfill-via-batch-export.md — de gln-regel en het akkoordpatroon]
- [Source: _bmad-output/implementation-artifacts/20-18-verouderde-gln-blokkeert-oogst.md — afgekeurd, met de meting die de gln-route uitsluit]
- [Source: _bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md — het akkoordverzoek]
- [Source: apps/api/scripts/backfill-gln-from-tradeitems.ts — het bestaande mongo-patroon en de testnaad (18.1)]
- [Source: apps/api/src/services/t3777-declarations.ts — XML-route, de twee ingangen, cache, `mapDeclarationReason`]
- [Source: apps/api/src/scripts/build-keurmerk-index.ts — indexbouwer, redencodes, poortregel 7b]
- [Source: _bmad-output/planning-artifacts/research/oogstbron-uitgeput-of-geblokkeerd-2026-08-18.md]

## Change Log

- 2026-08-19: **Versie 3** na `review-20-19-v3.md` (FAIL, 3 high / 10 medium / 7 low). Alle elf
  punten verwerkt. Kern: de versmalling verplaatst van de bron naar de afnemer (AC5), waarmee de
  indexbouwer de beloofde 238 producten houdt en de automatische bevestiging op 177 filtert —
  versie 2 versmalde beide ingangen en kostte 61 producten. Verder: AC-nummering hersteld (er
  stonden twee criteria met nummer 3), "byte-identiek" vervangen door een overeenstemmingstoets met
  ondergrens, de 429- en 144-groep zelf volledig geteld (3 respectievelijk 0, niet 5 en 12), de
  onjuiste bewering over de ontbrekende testnaad geschrapt, `timeout`/`niet-verwerkt` uit AC7
  gehaald, de vier codeplekken voor een nieuwe redencode benoemd, de cache-schakelaar en de
  omgevingsscheiding van de twee cachesleutels uitgeschreven, veldtabel met `fieldType` en de
  scoping van `enumerationValue` opgenomen, getallen bij de verbindingseisen, 18 → 17
  `oldValue`-instanties, en het akkoordblok verplaatst naar "Voorwaarden buiten deze story" mét
  tijdvenster en verbindingsprofiel. Nieuw vastgesteld: het meetaccount `xxtract` is géén
  leesaccount (`dbOwner` + `userAdminAnyDatabase`) en mag niet naar acceptatie.
- 2026-08-18: Versie 2 na review-20-19 (FAIL, 4 high). Belangrijkste wijzigingen: opzoeken op
  `_id` in plaats van zoeken op `meta.gtin` (0 ms tegen 51 s), de onterechte gln-regel geschrapt
  (kostte 32 van de 211), vijf veldsoorten in plaats van twee, redencodes expliciet toewijzen
  zodat de kwaliteitspoort niet omvalt, en aansluiten op het bestaande patroon van story 18.1.
- 2026-08-18: Versie 1 aangemaakt nadat 20.18 sneuvelde.
