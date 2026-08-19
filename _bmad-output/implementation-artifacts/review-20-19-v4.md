---
review_of: _bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md (versie 4, 275 regels)
review_type: adversariële her-review op de ontwerpwijziging — toetst de verwerking van review-20-19-v3 én het geleverde artefact
reviewer: adversariële her-review, verse context
date: 2026-08-19
branch: acc
verdict: FAIL
severity_count: { high: 4, medium: 13, low: 7 }
---

# Her-review — story 20.19, versie 4 (momentopname in plaats van live verbinding)

**Verdict: FAIL** — 4 high / 13 medium / 7 low.

De ontwerpwijziging is goed uitgevoerd waar hij het meeste risico wegnam: geen inloggegevens op
acceptatie, geen driver, geen netwerkpad, en een geoogst bestand dat ik regel voor regel heb
nageteld en dat **exact** klopt met wat de spec belooft. Elf van de twaalf punten uit
`review-20-19-v3.md` §4 zijn verwerkt of terecht vervallen.

Wat de story níet af heeft, zit in wat de ontwerpwijziging nieuw maakt. Drie dingen springen eruit:
de nieuwe redencode wordt in AC6 geëist maar nergens benoemd of gedefinieerd; 177 producten uit een
bevroren momentopname gaan langs de automatische bevestiging, die auto-accepteert én
referentielogo's aanmaakt, zonder enige versheids- of overeenstemmingscontrole; en de test die AC5
belooft "de generator te bewaken" toetst de generator tegen zichzelf. Daarnaast staat er een
governance-bewering in de story die haar eigen akkoordverzoek tegenspreekt.

> **Let op — het artefact is al gecommit.** `VERIFIED`: commit `c7e3fa5` ("feat(20.19): harvest the
> trade-item declarations into a committed snapshot", 19 aug 14:25) bevat de spec, het
> momentopname-bestand, het oogstscript én de test. De spec draagt op regel 3 nog "wacht op
> her-review". Code en data zijn dus op `acc` geland vóór de spec-review die ze had moeten
> voorafgaan. Zie M13.

---

## 1. De twaalf punten uit `review-20-19-v3.md` §4

*(De opdracht sprak van elf punten; sectie 4 van v3 telt er twaalf. Alle twaalf zijn getoetst.)*

| # | Punt uit v3 §4 | Oordeel | Bewijs |
|---|---|---|---|
| 1 | Splits AC4 per ingang | **VERWERKT** | AC4 (r. 132-145) draagt de twee-uitgangen-tabel en zegt letterlijk: de momentopname draagt alle vijf de veldsoorten mét `fieldType`, en de T3777-ingang filtert daaruit uitsluitend `PackagingMarkedLabelAccreditationCode`. Precies de formulering die v3 vroeg |
| 2 | Trek het toetsende criterium gelijk met AC4 | **VERWERKT** | AC9 (r. 203-210) draagt beide getallen apart: 238/475 voor de index, 177/292 voor de automatische bevestiging. Geen tegenstrijdigheid meer. `VERIFIED` tegen het bestand zelf, zie §4 |
| 3 | Herstel de AC-nummering | **VERWERKT** | De lijst loopt 1 t/m 12 zonder dubbel nummer (r. 110-227). De drie interne verwijzingen — "Zie AC8" (r. 19), "zie AC4" (r. 58), "volgt uit AC2" (r. 126) — wijzen alle drie naar het bedoelde criterium |
| 4 | Schrap de tegenstrijdigheden (byte-identiek, de 404-passage, de twee getallen voor de 429) | **VERWERKT** | "byte-identiek" is weg; AC3 zegt nu "mogen niet veranderen" mét de 2-van-100-waarschuwing (r. 126-130). De 404-groep staat op **0 van de 144** met de verklaring waar de eerdere 12 vandaan kwamen (r. 235-239). De 429 staat op **3**, consistent op r. 78-80 én r. 233-234 |
| 5 | Corrigeer de bewering over de ontbrekende testnaad | **VERWERKT** | AC10 (r. 215-219) noemt `GlnLookup`/`BackfillDeps` en trekt de oude bewering expliciet in. `VERIFIED`: `apps/api/scripts/backfill-gln-from-tradeitems.ts:143` (`GlnLookup`) en `:146-159` (`BackfillDeps`), met `apps/api/src/__tests__/services/backfill-gln-from-tradeitems.test.ts` ernaast |
| 6a | Schrap "inclusief `timeout` en `niet-verwerkt`" | **VERWERKT** | AC6 (r. 174-176) zegt nu het omgekeerde, met de reden erbij. `VERIFIED`: `DeclarationReason` kent ze niet (`t3777-declarations.ts:48-55`) |
| 6b | Noem de vier codeplekken voor een nieuwe redencode | **DEELS** | De tabel staat er (r. 167-172), maar hij is niet compleet — zie **M3** |
| 6c | Eigen korte time-out op de databaseopzoeking, met een getal | **VERVALLEN — terecht** | `VERIFIED`: AC1 (r. 110-113) schrapt elke netwerkaanroep, en `TRADEITEM_SNAPSHOT` is een objectopzoeking in het geheugen (`apps/api/src/services/tradeitem-declaration-snapshot.ts:42`). Er is geen I/O meer om een time-out op te zetten |
| 7 | Maak de cache-maatregel uitvoerbaar | **VERWERKT** | AC7 (r. 178-189) draagt de schakelaar bij naam, zegt dat de 442 bestaande sleutels blijven staan, en benoemt dat opruimen een schrijfactie op de acceptatie-Redis is die aparte toestemming vraagt. *Twee kanttekeningen bij de uitvoerbaarheid: M6 en M7* |
| 8 | Zet de veldtabel in de spec | **VERWERKT** | De tabel op r. 49-55 geeft alle vijf gdsn-namen mét hun `fieldType`, inclusief de scoping van `enumerationValue` binnen `consumerUsageLabelCode`. AC5 (r. 147-152) noemt `trim()`, `toUpperCase()`, ontdubbelen per `(fieldType, code)`, lege waarden overslaan en het weglaten van `oldValue` |
| 9 | Regel de omgevingsscheiding van de twee caches | **VERWERKT** | AC7, derde bolletje (r. 186-189). `VERIFIED`: `marks:${envTag}:…` (`t3777-declarations.ts:521`) tegenover `t3777:${gln}:${gtin}:${tm}` (`:112`). De regelnummers in de spec kloppen allebei |
| 10 | Overeenstemmingstoets database ↔ XML op de 848, met ondergrens | **VERVALLEN voor de 848 — maar de zorg verhuist mee** | `VERIFIED`, en dit is de onderbouwing die de opdracht vraagt: de terugval wordt uitsluitend geraadpleegd bij `geen-tradeitem-bestand`, en de 848 hebben per definitie een werkende XML. Een vergelijking database↔XML is voor hén dus niet meer nodig. **Maar**: voor de 442 is er géén XML om tegen te vergelijken, terwijl hun codes nu wél de automatische bevestiging in gaan. De toets vervalt precies daar waar hij goedkoop was en ontbreekt daar waar hij duur is. Zie **H2** |
| 11a | Werk het akkoordverzoek bij | **NIET** | Zie **H4** en **M12** |
| 11b | Vul de Change Log aan | **VERWERKT** | Twee 19-augustus-regels (r. 260-271), de eerste beschrijft de ontwerpwijziging inhoudelijk |
| 12 | Twaalf kleine correcties | **10 VERWERKT, 1 VERVALLEN, 1 NIET** | `T3777_TARGET_MARKET` staat in AC1 (`VERIFIED`: `t3777-declarations.ts:86`, default `'528'`); het pad naar de 18.1-spec en naar `review-20-19-v2.md` staan in de bronnen (r. 248, 250); 18 → **17** in AC5 (r. 154); de weesregel is weg; `ids442.json` is weg; de onderbouwde bewering over "zelfstandige keurmerken" is weg; de afgebroken zin in 20.18 is hersteld (`VERIFIED`: het bestand eindigt nu op "Het is opgepakt in story 20.19."). **VERVALLEN**: getallen bij de verbindingseisen — er zijn geen verbindingseisen meer. **NIET**: de `_id`-nuance dat `meta.targetMarket` een array is en `_id` alleen de eerste draagt, komt in versie 4 niet voor — zie **M4** |

---

## 2. Nieuwe gaten die de ontwerpwijziging introduceert

### HIGH

**H1 — De "nieuwe redencode" uit AC6 wordt nergens benoemd, en er staat niet wanneer hij ontstaat. — high**

AC6 (r. 157-172) eist dat "de nieuwe reden" expliciet wordt toegewezen, buiten poortregel 7b valt,
en op vier plekken landt. Nergens in de story staat **hoe die reden heet** of **welke uitkomst hem
oplevert**.

`VERIFIED` — de story dekt maar twee van de drie mogelijke uitkomsten van een opzoeking:

| geval | wat AC2 zegt | regel |
|---|---|---|
| sleutel ontbreekt | blijft `geen-tradeitem-bestand` | r. 117-118 |
| sleutel aanwezig, lege lijst | `lege-declaratie` | r. 117 |
| **sleutel aanwezig, mét codes** | **niets** | — |

Dat derde geval is nu juist de 238 producten waar de hele story om draait. Een ontwikkelaar kan
hier twee kanten op: `ok` teruggeven (dan is er géén nieuwe redencode, en is AC6 in zijn geheel
loze tekst plus vier onnodige codewijzigingen), of een nieuwe reden invoeren (dan moet die een
naam hebben, want AC6's vier codeplekken zijn allemaal `switch`- of `Record`-constructies waar een
naam letterlijk in de code komt te staan). `VERIFIED`: `CollectReason` is een string-union
(`build-keurmerk-index.ts:325-334`) en `emptyReasonCounts()` een `Record` met die namen als
sleutels (`:338-349`); zonder gekozen naam is dit niet te bouwen.

Bijkomend gevolg: AC8's eis "hoeveel sleutels uit de momentopname zijn gebruikt" (r. 194) is niet te
tellen zonder dat onderscheid, en AC9 vraagt om precies dat getal (238).

**H2 — De momentopname voedt een schrijfpad: auto-acceptatie én het aanmaken van referentielogo's, zonder enige versheidscontrole. — high**

`VERIFIED` in de code. De 177 producten die AC4 bewust naar de automatische bevestiging stuurt komen
binnen via `resolveDeclarations` → `catalogDeclarationProvider` (`t3777-declarations.ts:387-390`) →
`activeDeclarationProvider(gtin)` in de detectiestroom (`pipeline/detection-flow.ts:250`). Wat daar
mee gebeurt:

- `crosscheckDetections(gtin, …, declared)` levert `autoAccepted` (`detection-flow.ts:260-265`);
- auto-geaccepteerde detecties met een crop worden **weggeschreven** via `registerCropsTx` in een
  transactie (`detection-flow.ts:279-283`);
- en ze gaan als **kandidaat-referentie** het vliegwiel in via `nominateAutoAccepted`
  (`detection-flow.ts:290`).

De story erkent zelf dat de database en de XML niet hetzelfde zeggen — "van 100 vergeleken producten
weken er 2 af, waaronder één met een ander codewoord (`RAINFOREST_ALLIANCE` tegenover
`RAINFOREST_ALLIANCE_PEOPLE_NATURE`)" (r. 128-130) — en gebruikt dat als argument om de XML nooit te
vervangen. Datzelfde argument geldt onverkort voor de 177, met twee verzwaringen: hun gegevens zijn
**bevroren op 19 augustus 2026** en er is voor hen géén XML om tegen af te zetten.

`VERIFIED`: het codewoord uit het voorbeeld staat daadwerkelijk in het geleverde bestand —
`RAINFOREST_ALLIANCE_PEOPLE_NATURE` komt 2× voor in
`apps/api/src/services/tradeitem-declaration-snapshot.ts`.

De story neemt hier geen besluit over. Twee routes zijn verdedigbaar (de momentopname alleen aan de
indexbouwer geven en de automatische bevestiging ongemoeid laten, óf hem ook aan de kruischeck geven
met een expliciete aanvaarding van het risico), en dat is een keuze voor Friso, niet voor dev.

**H3 — De test die AC5 belooft "de generator te bewaken" toetst de generator tegen zichzelf. — high**

AC5 (r. 150-152): *"Leg dat vast in een test op het bestand zelf … Zo bewaakt de test de generator,
niet andersom."*

`VERIFIED` in `apps/api/src/__tests__/services/tradeitem-declaration-snapshot.test.ts`:

- de drie teltoetsen (`:168-193`) vergelijken de **inhoud** van het bestand met de **meta** van
  hetzelfde bestand. Beide komen uit dezelfde generatorrun (`harvest-tradeitem-snapshot.ts:212-221`
  rendert de meta uit `result`). Een oogst die de helft van de sleutels verliest, of die de 204 lege
  lijsten weglaat, produceert een bestand dat deze toetsen glansrijk haalt;
- de toets op onbekende `fieldType`s (`:166`, `:195-208`) bouwt zijn verwachting uit
  `GDSN_TO_FIELD_TYPE` — geïmporteerd uit de generator zelf (`:20`). Drift in die map wordt dus
  meegedreven in plaats van gevangen.

Dat is precies het gevaar waar het oogstscript zelf voor waarschuwt: *"Gelijk aan MARK_FIELDS +
CONSUMER_USAGE_FIELD_TYPE in `src/services/t3777-declarations.ts`; wijkt dit af, dan koppelen
geoogste marks niet aan een logo"* (`harvest-tradeitem-snapshot.ts:48-52`). Niets pint die
gelijkheid vast. `VERIFIED`: `MARK_FIELDS` (`t3777-declarations.ts:420`) en
`CONSUMER_USAGE_FIELD_TYPE` (`:434`) zijn allebei **niet geëxporteerd**, dus een pinnende toets
vraagt eerst een export.

Wat de test wél echt afdekt: geen lege codes, normalisatie, geen dubbele paren binnen één sleutel,
sleutelvorm, en een leesbare oogstdatum. Dat is waardevol, maar het is bewaking tegen handmatig
knoeien, niet tegen een verkeerde generator.

**H4 — De story zegt dat de leesgebruiker, `TRADEITEMS_MONGO_URI` en de `mongodb`-driver vervallen; AC8 heeft ze alle drie nodig, en het akkoordverzoek zegt het tegenovergestelde. — high**

De story, r. 93-95: *"Wat hiermee vervalt … de leesrechten-gebruiker, `TRADEITEMS_MONGO_URI` op de
acceptatie-applicatie, de `mongodb`-driver in de applicatie, en het netwerkpad … **Geen van die vier
is nog nodig.**"*

`VERIFIED`, drie tegenbewijzen:

1. AC8 (r. 198-201) maakt `apps/api/scripts/harvest-tradeitem-snapshot.ts` onderdeel van de story.
   Dat script eist `TRADEITEMS_MONGO_URI` (`:243-247`), importeert `mongodb` (`:249`) en zegt in de
   kop: *"Gebruik een account met UITSLUITEND `read` op `application`"* (`:31`).
2. Het akkoordverzoek waar de story naar verwijst zegt in zijn aanvulling van 19 augustus:
   *"De gevraagde gebruiker met uitsluitend `read` op `application` blijft nodig."*
   (`_bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md`).
3. `mongodb` staat **niet** in `apps/api/package.json` (dependencies noch devDependencies) en ook
   niet in de root-`package.json`; `tsx`, dat de gebruiksaanwijzing van het script voorschrijft,
   evenmin.

De juiste formulering is: die vier vervallen **voor de draaiende applicatie**, en blijven nodig
**voor de handmatige regeneratie**. Zoals het er nu staat is het een governance-bewering die niet
klopt, en het akkoordverzoek — het enige spoor buiten het story-record — is niet bijgewerkt voor
de ontwerpwijziging.

### MEDIUM

**M1 — `harvest()` ontdubbelt de sleutels niet; Redis `SCAN` mág dezelfde sleutel twee keer geven. — medium**

`VERIFIED`: `listMissingFileIds` verzamelt sleutels met een `SCAN`-lus (`:265-273`) en duwt ze
ongefilterd in `ids`; `harvest()` loopt daar overheen met `for (const id of ids)` en telt
`withMarks` en `markInstances` per doorloop op (`:145-158`). `snapshot[id]` wordt overschreven, dus
het aantal sleutels blijft kloppen, maar de tellingen in de meta lopen op. Redis garandeert
uitsluitend dat élke sleutel **minstens** één keer terugkomt. Een tweede oogst kan zo een bestand
opleveren dat zijn eigen consistentietoets laat vallen.

**M2 — Het gegenereerde bestand is niet het bestand dat het script maakt. — medium**

`VERIFIED`, eigen meting: ik heb `renderSnapshotModule` (`harvest-tradeitem-snapshot.ts:170-232`)
opnieuw gedraaid op de inhoud van het gecommitte bestand, met dezelfde oogstdatum. De uitvoer is
**485 regels met één regel per sleutel**; het gecommitte bestand telt **1193 regels** met
afgebroken lijsten. `npx prettier --check` op het gecommitte bestand meldt bovendien nog steeds
opmaakafwijkingen (enkele in plaats van dubbele aanhalingstekens).

Gevolg: `--write` levert altijd een diff over het hele bestand, en de kop
*"GEGENEREERD BESTAND — niet met de hand bewerken"* (`:4`) botst met de opmaakstap die het bestand
feitelijk al herschreven heeft. Zet de opmaak in de generator, of laat de generator door dezelfde
opmaakstap lopen en leg dat vast.

**M3 — AC6's "vier plekken" zijn er vijf. — medium**

`VERIFIED`: naast de samenvattingsregels op `build-keurmerk-index.ts:631-635` drukt ook de
voortgangsregel de redenen bij naam af:
`ok=… 404=… leeg=… geen-bestand=… api-fout=… timeout=…` (`:484-486`). Een nieuwe reden is daar
onzichtbaar tot hij wordt toegevoegd — precies het argument waarmee AC6 de andere plekken opsomt.
Bijkomend: de spec noemt "`:633-634`", maar dat zijn twee opeenvolgende regels bínnen één
`console.log` (die van `:630` tot `:636` loopt), niet twee samenvattingsregels.

**M4 — De momentopname is uitsluitend doelmarkt 528; AC1 sleutelt op een instelbare waarde. — medium**

`VERIFIED`, eigen telling over alle 442 sleutels: **442 van de 442** eindigen op `-528`. AC1 (r. 112-113)
schrijft voor dat de doelmarkt uit `T3777_TARGET_MARKET` komt (`VERIFIED`: `t3777-declarations.ts:86`,
default `'528'`). Staat die variabele op een acceptatie- of productie-omgeving ooit op iets anders,
dan mist **elke** opzoeking, zonder foutmelding en zonder verschil met "niet gemeten". De story zegt
nergens dat de momentopname doelmarkt-gebonden is; `TRADEITEM_SNAPSHOT_META` draagt de doelmarkt ook
niet als eigen veld. Dit is de v4-vorm van het `_id`-punt (N12) dat v3 §4.12 vroeg en dat niet
verwerkt is.

**M5 — De sleutel hangt aan een gln die niet stabiel bepaald wordt. — medium**

`VERIFIED`: de indexingang krijgt de gln uit het universum meegegeven (`resolveDeclaredMarks(…,
knownGln)`, `t3777-declarations.ts:601-612`) — daar is de sleutel stabiel. De T3777-ingang doet zijn
eigen opzoeking: `prisma.artworkImport.findFirst({ where: { gtin, gln: { not: null } } })`
(`:293-299`), **zonder `orderBy`**. Voor een GTIN met meer dan één gln is de uitkomst dus niet
gegarandeerd dezelfde als de gln waarmee de 442 sleutels geoogst zijn. AC9 belooft 177 producten aan
die ingang; dat getal is alleen aan de indexkant meetbaar. Leg in AC1 vast welke gln de sleutel
vormt, of geef beide ingangen dezelfde, geordende bron.

**M6 — De cache-schakelaar staat in de indexbouwer-naamruimte maar werkt procesbreed. — medium**

AC7 (r. 181-183) stelt `KEURMERK_INDEX_REFRESH_REASONS` voor. `VERIFIED`: de cachelees die hij moet
omzeilen zit in `t3777-declarations.ts` (`cacheRead`-aanroep op `:330`, `marksCacheRead`-aanroep op `:642`) — een
service die óók de detectie-worker gebruikt (`detection-flow.ts:250`). De naam suggereert dat het
alleen de indexrun raakt; het effect geldt voor elk proces waar de variabele staat. Kies een naam
die dat weerspiegelt, of zet de schakelaar als parameter in de aanroep in plaats van in de omgeving.

Kleine tweede kanttekening: "de cachelees voor precies die reden overslaan" is letterlijk niet
uitvoerbaar — je moet de cache lézen om de reden te kennen. Bedoeld is: lezen, en een hit met die
reden als miss behandelen. Schrijf dat zo op.

**M7 — Het omgevingssegment op de T3777-sleutel maakt in één klap elke bestaande cache-entry waardeloos. — medium**

AC7 (r. 186-189) vraagt `t3777:{gln}:{gtin}:{tm}` hetzelfde omgevingssegment te geven als
`marks:{env}:…`. `VERIFIED`: dat verandert de sleutelvorm (`t3777-declarations.ts:112`), dus élke
bestaande `t3777:`-entry wordt onvindbaar en de eerstvolgende run doet ~1863 verse catalogus-aanroepen.
Dat is geen bezwaar tegen de maatregel, maar het hoort in de story te staan naast de expliciete
afspraak dat de 442 `marks:`-sleutels juist blijven staan.

**M8 — De 61 producten zonder `PackagingMarkedLabelAccreditationCode` vallen tussen AC2 en AC4 in. — medium**

`VERIFIED`, eigen telling: 238 sleutels dragen minstens één keurmerk, 177 daarvan dragen minstens één
`PackagingMarkedLabelAccreditationCode`. Voor de overige **61** levert de T3777-filter uit AC4 een
lege codelijst op, terwijl de momentopname voor die sleutel níet leeg is. AC2 kent alleen "lege
lijst" en "ontbrekende sleutel". Welke reden krijgt dit derde geval — `lege-declaratie` (feitelijk
juist voor deze ingang) of de nieuwe reden uit H1? Het antwoord wordt 24 uur gecacht
(`VERIFIED`: `ttlForReason` geeft alles behalve `api-fout` de normale TTL,
`t3777-declarations.ts:532`; `T3777_CACHE_TTL_S` staat standaard op `86400`, `:87`), dus een verkeerde keuze is een dag lang
zichtbaar in elke telling.

**M9 — AC8 maakt de veroudering zichtbaar maar nergens bezwaarlijk. — medium**

AC8 drukt de oogstdatum en de ouderdom af. Er is geen bovengrens, geen waarschuwing, geen
vervaldatum. `INFERENCE`: een sleutel in de momentopname blijft een product dat structureel geen
XML-bestand heeft **voor onbepaalde tijd** schaduwen — ook als de declaratie op productie verandert,
want de XML-route komt er nooit aan toe. Het enige signaal dat AC8 oplevert (GTINs die níet in de
momentopname staan) meet alleen de aangroei van nieuwe producten, niet het verlopen van bestaande.
Zet er een leeftijd bij waarboven de indexbouwer luidruchtig wordt.

**M10 — De regeneratieweg uit AC8 kan niet draaien zoals hij beschreven staat. — medium**

`VERIFIED`: de gebruiksaanwijzing in het script (`:36`, `:38`) schrijft
`npx tsx scripts/harvest-tradeitem-snapshot.ts` voor. Noch `tsx` noch `mongodb` staat in
`apps/api/package.json` of in de root-`package.json`. Het bestaande 18.1-script heeft hetzelfde
patroon, dus het is een bekende conventie — maar AC8 presenteert regeneratie als een beschikbare
handeling en zegt niet dat er eerst twee pakketten geïnstalleerd moeten worden op de uitvoerende
machine.

**M11 — Het oogstscript filtert niet op omgeving bij het scannen van de cache. — medium**

`VERIFIED`: `listMissingFileIds` scant `MATCH marks:*` (`:268`) en pakt daarna blind
`parts[2..4]` als `{gln}-{gtin}-{tm}` (`:288`). Het omgevingssegment (`parts[1]`) wordt weggegooid zonder
controle. Delen twee omgevingen ooit één Redis — precies het scenario dat AC7's derde bolletje
aandraagt als reëel — dan oogst dit script beide omgevingen door elkaar. Geef het script hetzelfde
omgevingssegment mee dat `catalogEnvTag` oplevert (`t3777-declarations.ts:496-505`).

**M12 — Het akkoordverzoek beschrijft nog de verlaten route en verwijst naar het verkeerde criterium. — medium**

`VERIFIED`: `akkoordverzoek-productie-leestoegang-2026-08-19.md` beschrijft in zijn aanvulling nog
steeds de live leesverbinding met een nieuwe leesgebruiker, en schrijft *"Dat is gecorrigeerd (story
20.19, **AC5**)"* voor de versmalling — die in versie 4 **AC4** is. Het document is het governance-
spoor; het bevat nu een route die is afgeblazen en een verwijzing die naar het verkeerde criterium
wijst. Eén aanvulling met datum volstaat.

**M13 — Het artefact is gecommit vóór de spec-review die het moest goedkeuren. — medium**

`VERIFIED`: commit `c7e3fa5` bevat de spec (r. 3: "wacht op her-review"), het bestand met 442
sleutels, het oogstscript en 15 toetsen — in één commit. De spec-review is daarmee een review op
werk dat al op `acc` staat. Dat is niet onherstelbaar (er is nog niets uitgerold), maar het draait
de volgorde om die de rest van dit dossier wél volgde.

### LOW

- **L1 — AC6 noemt `t3777-declarations.ts:48-56` voor `DeclarationReason`.** `VERIFIED`: de union
  loopt van `:48` t/m `:55`; `:56` is een lege regel.
- **L2 — AC10 noemt `backfill-gln-from-tradeitems.ts:143-152`.** `VERIFIED`: `GlnLookup` staat op
  `:143`, `BackfillDeps` op `:146-159`. Het bereik kapt de interface halverwege af.
- **L3 — AC4 noemt `t3777-declarations.ts:420-431` voor "alle vijf, als `{code, fieldType}`".**
  `VERIFIED`: `MARK_FIELDS` (`:420-425`) bevat er **vier**; de vijfde staat op `:434`
  (`CONSUMER_USAGE_FIELD_TYPE`) en `parseDeclaredMarks` zelf begint op `:446`. Wie de verwijzing
  volgt ziet vier veldsoorten en kan denken dat de spec zich vergist.
- **L4 — De toetsopstelling gebruikt een Nutri-Score-waarde die niet bestaat.** `VERIFIED`: de test
  voert `nutritionalScore` op met waarde `'NUTRISCORE_A'`
  (`tradeitem-declaration-snapshot.test.ts:56`), terwijl alle 61 Nutri-Score-instanties in het echte
  bestand kale letters `A`-`E` zijn — de vorm waar `nutriscoreDeclaredCodes`
  (`t3777-declarations.ts:583-593`) juist op rekent. De toets bewijst hier niets over de werkelijkheid.
- **L5 — Codes worden zonder ontsnapping in enkele aanhalingstekens gezet.** `VERIFIED`:
  `harvest-tradeitem-snapshot.ts:181`. Eén code met een apostrof levert een bestand op dat niet
  compileert. Vandaag komt dat niet voor (`VERIFIED`: alle 475 codes zijn `[A-Z0-9_]`), maar de
  generator hoort dat af te dwingen in plaats van te hopen.
- **L6 — `versions.md` is niet bijgewerkt in commit `c7e3fa5`.** `VERIFIED` via `git show --stat`:
  vier bestanden, geen `versions.md`.
- **L7 — De AC6-tabel noemt bestandsnamen zonder pad** (`t3777-declarations.ts`,
  `build-keurmerk-index.ts`), terwijl de bronverwijzingen het volledige pad wél dragen
  (`apps/api/src/scripts/build-keurmerk-index.ts`, r. 255). Twee bestanden met dezelfde naam bestaan
  er niet, dus dit is cosmetisch.

---

## 3. De code-beweringen in de spec, regel voor regel getoetst

| bewering in de spec | regel | oordeel |
|---|---|---|
| `Dockerfile:57-58` kopieert `apps/api/src/` en `apps/api/prisma/`, niet `apps/api/scripts/` | r. 104, 224-225, 256 | **KLOPT** — `VERIFIED`: `Dockerfile:57` = `COPY apps/api/src/ ./apps/api/src/`, `:58` = `COPY apps/api/prisma/ ./apps/api/prisma/`. Geen enkele `COPY` raakt `apps/api/scripts/`. De runtime-laag haalt `dist` op (`:84`) |
| `parseT3777Codes` levert uitsluitend `packagingMarkedLabelAccreditationCode` — `t3777-declarations.ts:97-108` | r. 138 | **KLOPT** — `VERIFIED`, de functie loopt exact van `:97` t/m `:108` en matcht één tagnaam |
| `parseDeclaredMarks` levert alle vijf — `t3777-declarations.ts:420-431` | r. 139 | **DEELS ONJUIST** — zie L3 |
| `DeclarationReason` — `t3777-declarations.ts:48-56` | r. 169 | **BIJNA** — zie L1 |
| `CollectReason` én `emptyReasonCounts()` — `build-keurmerk-index.ts:325-349` | r. 170 | **KLOPT** — `VERIFIED`: `CollectReason` `:325-334`, `emptyReasonCounts()` `:338-349` |
| `const technical = reasons['api-fout'] + reasons.timeout;` — `build-keurmerk-index.ts:546` | r. 161-163 | **KLOPT** — `VERIFIED`, letterlijk die regel. Een nieuwe reden valt er inderdaad buiten |
| "de twee samenvattingsregels" — `build-keurmerk-index.ts:633-634` | r. 172 | **ONVOLLEDIG** — zie M3 |
| `marks:{env}:…` draagt een omgevingssegment (`:521`), `t3777:…` niet (`:112`) | r. 186-189 | **KLOPT** — `VERIFIED`, beide regelnummers exact |
| doelmarkt uit `T3777_TARGET_MARKET`, standaard `528` | r. 113 | **KLOPT** — `VERIFIED`: `t3777-declarations.ts:86` |
| testnaad `GlnLookup`/`BackfillDeps` — `backfill-gln-from-tradeitems.ts:143-152` | r. 216 | **BIJNA** — zie L2 |
| `mapDeclarationReason` heeft `default: return 'api-fout'` | r. 157-158 | **KLOPT** — `VERIFIED`: `build-keurmerk-index.ts:376-377` |
| `timeout` en `niet-verwerkt` komen nooit langs `mapDeclarationReason` | r. 174-176 | **KLOPT** — `VERIFIED`: ze zitten wel in `CollectReason` (`:331-334`) maar niet in `DeclarationReason` (`:48-55`) |

---

## 4. Het geleverde artefact

### `apps/api/src/services/tradeitem-declaration-snapshot.ts`

`VERIFIED` — eigen telling, volledige doorloop van alle 442 sleutels (geen steekproef). Dit is een
**vijfde** onafhankelijke telling naast de vier die de story noemt, en hij komt op dezelfde getallen:

| grootheid | meta belooft | gemeten | |
|---|---|---|---|
| sleutels | 442 | **442** (442 uniek) | ✔ |
| sleutels met keurmerk | 238 | **238** | ✔ |
| sleutels met lege lijst | 204 (story r. 43) | **204** | ✔ |
| code-instanties | 475 | **475** | ✔ |
| unieke `(fieldType, code)`-paren | 52 (story r. 45) | **52** | ✔ |
| `PackagingMarkedLabelAccreditationCode` | 292 | **292** instanties / **177** producten | ✔ |
| `DietTypeCode` | 89 | **89** / **68** | ✔ |
| `NutritionalScore` | 61 | **61** / **61** | ✔ |
| `EU_consumerUsageLabelCodeList` | 33 | **33** / **22** | ✔ |
| `AdditionalPackagingMarkingsCode` | 0 | **0** / **0** | ✔ |

Verder gecontroleerd, alles schoon:

- **geen lege codes** (0 van 475);
- **geen dubbele `(fieldType, code)`-paren** binnen een sleutel (0);
- **geen onbekende `fieldType`s** — de vier voorkomende waarden zitten alle in `GDSN_TO_FIELD_TYPE`;
- **alle codes genormaliseerd** — elke code is gelijk aan zijn eigen `trim().toUpperCase()`;
- **sleutels op vorm** — 442/442 matchen `^\d+-\d+-\d+$`, alle met doelmarkt `528` (zie M4);
- **sleutels alfabetisch gesorteerd**, en de marks binnen elke sleutel gesorteerd op
  `(fieldType, code)` — 0 afwijkingen.

De opbrengstbelofte uit AC4 en AC9 (**238**/475 voor de index, **177**/292 voor de automatische
bevestiging) klopt dus exact met de inhoud van het bestand.

`VERIFIED` — `npx tsc --noEmit` in `apps/api` is schoon, en de 15 toetsen in
`tradeitem-declaration-snapshot.test.ts` draaien groen (`vitest run`, 25 ms).

### `apps/api/scripts/harvest-tradeitem-snapshot.ts`

Sterk aan dit script: `extractMarks` en `renderSnapshotModule` zijn zuivere functies, `HarvestDeps`
geeft een echte testnaad zonder database, de driver wordt lazy geïmporteerd, `--dry-run` is verplicht
tenzij je `--write` zegt, en de kop draagt de "NOOIT automatisch"-waarschuwing die AC8 vraagt. De
scheiding "geen document = niet gemeten, dus niet in de momentopname" is expliciet en correct
geïmplementeerd (`:145-149`).

**Zou het script hetzelfde bestand opnieuw produceren?** `VERIFIED`: **nee**, om twee redenen die
allebei te repareren zijn:

1. de opmaak wijkt af — 485 regels tegenover de 1193 die er nu staan (M2);
2. `harvestedAt` komt uit `new Date()` (`:310`), dus die regel wijzigt altijd. Dat is verdedigbaar,
   maar maakt "byte-identiek hertellen" onmogelijk; overweeg een `--harvested-at`-vlag zodat een
   hertelling wél vergelijkbaar is.

En de inhoud kan bij een tweede run afwijken zonder dat de bron veranderde: `SCAN` mag sleutels
dubbel opleveren (M1) en het omgevingssegment wordt niet gecontroleerd (M11).

---

## 5. Wat moet wijzigen vóór dev

1. **Benoem de nieuwe redencode en zeg wanneer hij ontstaat** (H1). Dek alle drie de gevallen af:
   sleutel ontbreekt, sleutel met lege lijst, sleutel met codes — en het vierde geval dat AC4
   creëert: sleutel met codes waar na het T3777-filter niets van overblijft (M8). Kies één naam en
   gebruik die in alle vier (vijf, zie punt 3) codeplekken.
2. **Leg de keuze over de automatische bevestiging voor aan Friso** (H2). De momentopname voedt
   auto-acceptatie én het aanmaken van referentielogo's met bevroren gegevens waarvan de story zelf
   vaststelt dat ze 2 op 100 afwijken van de XML. Óf alleen de indexbouwer voeden, óf de kruischeck
   ook, met het risico expliciet aanvaard. Dit is de enige echte afweging in deze review.
3. **Vul AC6 aan tot vijf plekken** (M3): de voortgangsregel op `build-keurmerk-index.ts:484-486`
   drukt de redenen ook bij naam af.
4. **Maak de test niet-tautologisch** (H3): exporteer `MARK_FIELDS` en `CONSUMER_USAGE_FIELD_TYPE`
   uit `t3777-declarations.ts` en pin `GDSN_TO_FIELD_TYPE` daar hard tegenaan; zet de drie
   verwachte aantallen (442 / 238 / 475) als letterlijke waarden in de test in plaats van tegen de
   meegegenereerde meta.
5. **Corrigeer de governance-bewering** (H4): de leesgebruiker, `TRADEITEMS_MONGO_URI` en de
   `mongodb`-driver vervallen voor de **applicatie**, niet voor de regeneratie uit AC8. Werk het
   akkoordverzoek bij met de ontwerpwijziging en herstel de verwijzing naar AC5 → AC4 (M12).
6. **Leg vast dat de momentopname doelmarkt 528 is** (M4): zet de doelmarkt in
   `TRADEITEM_SNAPSHOT_META` en laat de opzoeking hard falen (of luid loggen) als
   `T3777_TARGET_MARKET` daarvan afwijkt.
7. **Ontdubbel de sleutels in het oogstscript en filter op omgeving** (M1, M11).
8. **Zet een leeftijdsgrens op de momentopname** (M9): AC8 drukt de ouderdom af, maar niets wordt er
   luidruchtig van. Noem een aantal dagen waarboven de indexbouwer waarschuwt.
9. **Leg de gln-bron van de sleutel vast** (M5): de T3777-ingang doet een `findFirst` zonder
   `orderBy`, dus voor een GTIN met meerdere gln's is de sleutel niet gegarandeerd dezelfde als bij
   de oogst.
10. **Werk AC7 bij op twee punten** (M6, M7): geef de schakelaar een naam die zijn procesbrede
    werking dekt en herformuleer "cachelees overslaan" naar "een hit met die reden als miss
    behandelen"; en benoem dat het omgevingssegment op de T3777-sleutel elke bestaande entry
    ongeldig maakt.
11. **Los de opmaakkloof op** (M2): laat de generator uitvoer produceren die gelijk is aan wat er in
    de repository staat, en voeg een `--harvested-at`-vlag toe zodat een hertelling vergelijkbaar is.
12. **Vermeld in AC8 dat regeneratie `mongodb` en `tsx` vraagt** op de uitvoerende machine (M10).
13. **Kleine correcties**: de regelverwijzingen `:48-56` → `:48-55` (L1), `:143-152` → `:143-159`
    (L2), `:420-431` → `:420-425` + `:434` + `:446` (L3), de Nutri-Score-waarde in de toetsopstelling
    (L4), ontsnapping van codes in de generator (L5), `versions.md` (L6).

---

## 6. Wat NIET geverifieerd is

- **Of de 442 sleutels disjunct zijn van de 848 werkende producten.** `INFERENCE` uit het
  oogstscript, dat uitsluitend cache-entries met `reason === 'geen-tradeitem-bestand'` meeneemt
  (`harvest-tradeitem-snapshot.ts:284`). Ik heb de acceptatie-Redis niet zelf gelezen; de
  cache-verdeling (ok=848 / 442 / 429 / 144) is overgenomen uit `review-20-19-v3.md`.
- **Of de 442 documenten op productie vandaag nog dezelfde declaraties dragen.** Ik heb geen
  verbinding met de productie-MongoDB gemaakt. Alle getallen in §4 zijn gemeten op het **bestand**,
  niet op de bron.
- **Met welk account de oogst van 19 augustus is uitgevoerd.** Het akkoordverzoek stelt vast dat het
  enige bestaande account `dbOwner` + `readWrite` draagt; de story zegt dat er uitsluitend gelezen
  is, maar noemt het account niet.
- **De claim "volledige herbouw geeft +29 producten, +1 code"** (r. 74-75) — de story markeert die
  zelf als `INFERENCE`; ik heb hem niet nagemeten.
- **De 2-van-100-afwijking tussen database en XML** — overgenomen uit eerdere reviews, niet opnieuw
  gemeten. Wel `VERIFIED` dat het genoemde codewoord `RAINFOREST_ALLIANCE_PEOPLE_NATURE` in het
  geleverde bestand voorkomt.
- **Of de containerbouw het bestand daadwerkelijk in `dist/` zet** (AC12) — ik heb `tsc --noEmit`
  gedraaid, geen echte bouw en geen container. `INFERENCE`: `rootDir: "./src"` en
  `include: ["src/**/*"]` in `apps/api/tsconfig.json` nemen het bestand mee, en `Dockerfile:84`
  kopieert `dist`.
- **Of de acceptatie-omgeving de nieuwe code al draait.** Niet gekeken.
- **Er is nergens iets geschreven.** Alleen bestanden gelezen, `npx tsc --noEmit`,
  `npx vitest run` op één toetsbestand, `npx prettier --check`, en een eigen telscript in de
  scratchpad. Geen database, geen container, geen Redis, geen netwerk naar productie.

---

## Change Log

- 2026-08-19: Her-review op versie 4 (ontwerpwijziging: eenmalige momentopname in plaats van een
  live leesverbinding). Verdict FAIL (4 high / 13 medium / 7 low). Elf van de twaalf punten uit
  `review-20-19-v3.md` §4 zijn verwerkt of terecht vervallen; alleen het bijwerken van het
  akkoordverzoek is blijven liggen. Het geleverde bestand is volledig nageteld en klopt exact met
  wat de spec belooft — 442 / 238 / 475 / 52, geen lege codes, geen dubbele paren, geen onbekende
  veldsoorten. De vier highs komen alle vier voort uit de ontwerpwijziging zelf: een redencode die
  geëist maar niet benoemd wordt, bevroren gegevens die een schrijfpad voeden, een toets die de
  generator tegen zichzelf houdt, en een governance-bewering die haar eigen akkoordverzoek
  tegenspreekt.
