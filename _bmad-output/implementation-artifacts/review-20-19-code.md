---
review_of: _bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md (versie 6) — commit 57b5439 op branch story/20-19-momentopname
reviewer: adversariële code-review, verse context
date: 2026-08-19
verdict: FAIL
severity_count:
  high: 2
  medium: 4
  low: 6
---

# Code review story 20.19 — de terugval op de geoogste momentopname

Basis: `git diff d10a2a8..HEAD`, negen bestanden. Alles hieronder is zelf gelezen of zelf
gedraaid; elke regel draagt `VERIFIED` of `INFERENCE`.

## Samenvatting

De bedrading is er en hij is zorgvuldig gebouwd: de nieuwe reden bestaat, alle zes de codeplekken
uit AC6 zijn geraakt, de vlag staat standaard uit, precies twee aanroepers zetten hem aan, de drie
cachemaatregelen zitten erin en de veroudering is zichtbaar. Beide testsuites zijn groen en beide
typecontroles zijn schoon.

Toch FAIL, om één reden die de kern van besluit 2 raakt: **de bevroren gegevens bereiken de drie
niet-deelnemende aanroepers alsnog, via de gedeelde Redis-cache.** De vlag beschermt de *aanroep*,
niet de *cache* waar het antwoord in belandt. Ik heb dat niet beredeneerd maar uitgevoerd (H1).
De toets die AC1 zou moeten vastleggen kijkt naar de brontekst en niet naar gedrag, en mist het
daardoor volledig (H2).

## De 13 acceptatiecriteria

### AC1 — de terugval aan de aanroepkant, vijf aanroepers — **DEELS**

`VERIFIED`: de vlag bestaat en staat standaard uit — `apps/api/src/services/t3777-declarations.ts:757`
(`const useSnapshot = options?.useSnapshot === true;`), signatuur op `:730-756`.

`VERIFIED`, eigen telling van alle aanroepers buiten `__tests__` en `dist`:

```bash
grep -rn "resolveDeclaredMarks" apps --include="*.ts" --include="*.tsx" | grep -v __tests__
```

| aanroeper | regel | zet `useSnapshot` aan? | spec vraagt |
|---|---|---|---|
| `apps/api/src/scripts/build-keurmerk-index.ts` | `:473` | ja | ja ✔ |
| `apps/api/src/api/v1/artwork-pipeline.ts` | `:852` | ja | ja ✔ |
| `apps/api/src/services/pipeline/verify-flow.ts` | `:423` | nee | nee ✔ |
| `apps/api/src/services/flywheel/bootstrap-run.ts` | `:450` | nee | nee ✔ |
| `apps/api/src/scripts/build-nutriscore-declared-map.ts` | `:256` | nee | nee ✔ |

Precies vijf, precies de vijf uit de spec, en de verdeling klopt op het aanroeppunt.

**DEELS** en niet VERVULD, omdat het aanroeppunt niet de enige weg is waarlangs de momentopname bij
een aanroeper komt. Zie H1: het resultaat wordt onvoorwaardelijk naar de gedeelde cache geschreven
(`t3777-declarations.ts:830`) en een aanroeper zónder de vlag leest het daar gewoon terug.

### AC2 — drie uitkomsten, geen vierde — **VERVULD**

`VERIFIED`: `lookupSnapshot` (`t3777-declarations.ts:688-726`) kent exact drie uitgangen —
ontbrekende sleutel → `null` (aanroeper houdt `geen-tradeitem-bestand`), lege lijst →
`lege-declaratie`, lijst met codes → `uit-momentopname`. De naam is letterlijk `uit-momentopname`
in de union op `:64`.

### AC3 — `uit-momentopname` mag nooit `ok` zijn — **VERVULD**

`VERIFIED`: nergens in de diff wordt `uit-momentopname` op `ok` afgebeeld;
`mapDeclarationReason` (`build-keurmerk-index.ts:380-385`) geeft hem expliciet aan zichzelf terug.
De toets `AC3 — uit-momentopname mag nooit ok zijn` draait over 50 echte sleutels en is groen.

`VERIFIED`, en het is belangrijk: dít criterium is wat H1 voor `bootstrap-run.ts` onschadelijk
maakt — die guard leest `decl.reason !== 'ok'` (`bootstrap-run.ts:451`) en werkt ook op een
cachewaarde. Voor `verify-flow.ts` en `build-nutriscore-declared-map.ts` biedt AC3 géén bescherming:
beide gooien de reden weg en houden alleen `.marks` over (`verify-flow.ts:423-425`,
`build-nutriscore-declared-map.ts:256`).

### AC4 — alleen als terugval, nooit als vervanging — **VERVULD**

`VERIFIED`: `t3777-declarations.ts:803-809` — de opzoeking staat binnen
`if (reason === 'geen-tradeitem-bestand' && useSnapshot)`, ná de XML-route. Een `ok`-uitkomst komt
daar nooit langs. De toets in `t3777-momentopname-20-19.test.ts` (AC4-blok) bewijst het met een
echte 200-respons én controleert dat geen enkele momentopname-teller is geraakt.

### AC5 — vijf veldsoorten, geen hernormalisatie — **VERVULD**

`VERIFIED`: `lookupSnapshot` doet `marks.map((m) => ({ code: m.code, fieldType: m.fieldType }))`
(`:719`) — geen `trim`, geen `toUpperCase`, geen ontdubbeling. De gelijkheid met `MARK_FIELDS` is
al gepind in `tradeitem-declaration-snapshot.test.ts` (17 toetsen, groen bij mijn run).

### AC6 — zes codeplekken — **VERVULD**

`VERIFIED`, alle zes geraakt:

| plek | bestand:regel |
|---|---|
| `DeclarationReason` | `t3777-declarations.ts:64` |
| `CollectReason` | `build-keurmerk-index.ts:341` |
| `emptyReasonCounts()` | `build-keurmerk-index.ts:356` |
| `mapDeclarationReason` (expliciet) | `build-keurmerk-index.ts:380-385` |
| voortgangsregel + samenvattingsregel | `build-keurmerk-index.ts:501` en `:649` |
| beoordeelscherm | `MobileReviewDeck.tsx:433` |

Het scherm toont ook de herkomst (`MobileReviewDeck.tsx:1315-1325`), gevoed door
`snapshotHarvestedAt` uit de endpoint (`artwork-pipeline.ts:852-858`) en het servicetype
(`artworkReviewService.ts:150-178`). `VERIFIED`: de route heeft geen response-schema, dus het
extra veld wordt niet weggefilterd.

### AC7 — fail-open zonder de poort om te gooien — **VERVULD**

`VERIFIED`: `const technical = reasons['api-fout'] + reasons.timeout;`
(`build-keurmerk-index.ts:562`) — `uit-momentopname` valt er buiten. Ik heb de overige poortregels
nagelopen (7a, 7c, 7d, `build-keurmerk-index.ts:544-612`): geen enkele leest de nieuwe reden.

### AC8 — de drie cachemaatregelen — **DEELS**

| maatregel | staat er | bewijs |
|---|---|---|
| hit met `geen-tradeitem-bestand` telt als miss | ja | `t3777-declarations.ts:664` + `:794-798` |
| hit met afwijkende oogstdatum telt als miss | grotendeels | `:665-670` — zie M1 |
| oogstscript selecteert breder + alle bestaande sleutels | ja | `harvest-tradeitem-snapshot.ts:391-412` |

`VERIFIED`: het oogstscript ontdubbelt de samengevoegde lijst (`[...new Set(await
deps.listMissingFileIds())]`, `harvest-tradeitem-snapshot.ts:187`), dus de sleutels die twee keer
binnenkomen tellen niet dubbel in `requested`/`withMarks`.

**DEELS** vanwege M1 (een cache-entry met reden `uit-momentopname` zónder oogstdatum wordt níet als
miss behandeld, terwijl de spec dat wel vraagt) en M2 (de eerste maatregel geldt óók op het
interactieve endpoint en zet daar de cache permanent buiten spel voor een groeiende groep).

### AC9 — veroudering zichtbaar en bezwaarlijk — **VERVULD**

`VERIFIED`: `build-keurmerk-index.ts:655-681` drukt oogstdatum, ouderdom in dagen, doelmarkt en
aantal sleutels af, plus een eigen telregel (`withMarks` / `empty` / `notInSnapshot` /
`staleCacheDropped`), plus een LET OP-regel en een WAARSCHUWING boven 180 dagen
(`SNAPSHOT_MAX_AGE_DAYS`, `t3777-declarations.ts:560`). De teller is los van de redenentellers, zoals
gevraagd. Kanttekening in M4 over wat `notInSnapshot` werkelijk meet.

### AC10 — doelmarkt-gebonden — **VERVULD**

`VERIFIED`: `lookupSnapshot` vergelijkt eerst en meldt (`t3777-declarations.ts:696-704`); een
afwijkende doelmarkt geeft `null` en verhoogt `notInSnapshot` níet — dat laatste is precies goed en
wordt ook getoetst.

### AC11 — bepaalde gln — **VERVULD**

`VERIFIED`: `orderBy: [{ gln: 'asc' }]` op `t3777-declarations.ts:775`. De opzoeking blijft
fail-open (afwijkende gln → sleutel afwezig → geen terugval). Zie L5 over het neveneffect.

### AC12 — meetbare uitkomst — **NIET (terecht)**

`VERIFIED`: de diff bevat geen droogloop, geen meting, geen indexherbouw. Dat is conform de
waarschuwingsblok in AC13: permission-gated, hoort niet bij de bouw. Wat wél ontbreekt is de
bookkeeping-plek waar verwachting en meting straks naast elkaar komen (L6).

### AC13 — testbaar zonder database, RED-bewijs, geen regressie — **DEELS**

`VERIFIED, zelf gedraaid`:

```
apps/api : 89 bestanden groen, 9 overgeslagen — 1079 geslaagd, 2 overgeslagen, 67 todo
apps/web : 33 bestanden groen, 2 overgeslagen — 200 geslaagd, 20 todo
npx tsc --noEmit in apps/api en apps/web : beide zonder uitvoer
```

`VERIFIED`: de gecompileerde momentopname staat in `dist` —
`apps/api/dist/services/tradeitem-declaration-snapshot.js`, 60.641 bytes, 19 aug 17:56.

**DEELS**: de momentopname is een module-import, geen meegegeven afhankelijkheid zoals AC13 vraagt
("krijgt de momentopname als **afhankelijkheid** mee, net als `GlnLookup`"). Dat is in de praktijk
niet erg — de toetsen draaien zonder database omdat ze de échte momentopname gebruiken — maar het is
een afwijking van de letterlijke tekst, en het is de reden dat de AC1-toets naar brontekst moest
grijpen in plaats van naar gedrag (H2). Van het RED-bewijs is niets terug te vinden: er is geen
story-record bijgewerkt (L6), dus dat kan ik niet verifiëren.

---

## Bevindingen

### HIGH

#### H1 — de momentopname bereikt de drie niet-deelnemende aanroepers via de gedeelde cache

`VERIFIED, zelf uitgevoerd.` Ik heb de echte `resolveDeclaredMarks` gedraaid met gemockte Redis,
Prisma en `fetch` (opstelling gelijk aan `t3777-momentopname-20-19.test.ts`, testbestand in mijn
scratchpad, niets in de repository geschreven):

```
1) resolveDeclaredMarks(GTIN, GLN, { useSnapshot: true })  → uit-momentopname, 2 marks
2) resolveDeclaredMarks(GTIN, GLN)                          → VERWACHT geen-tradeitem-bestand

feitelijke uitkomst van (2):
{"marks":[{"code":"HALAL","fieldType":"DietTypeCode"},
          {"code":"TRIMAN","fieldType":"PackagingMarkedLabelAccreditationCode"}],
 "reason":"uit-momentopname","snapshotHarvestedAt":"2026-08-19"}
```

De keten, allemaal `VERIFIED` uit de bron:

1. `t3777-declarations.ts:830` schrijft **onvoorwaardelijk** naar de cache, ook het resultaat uit de
   momentopname, met de normale TTL van 86.400 s (`ttlForReason`, `:580`).
2. De cachesleutel `marks:{env}:{gln}:{gtin}:{tm}` (`:569`) kent geen segment voor `useSnapshot`,
   dus deelnemers en niet-deelnemers delen dezelfde sleutel.
3. `shouldTreatCacheHitAsMiss(cached, false)` geeft `false` voor zo'n entry: de eerste regel vraagt
   `useSnapshot`, de tweede vraagt een *afwijkende* oogstdatum — en die is hier gelijk
   (`:664-670`).

Waarom dit besluit 2 breekt en niet slechts kosmetisch is:

- `verify-flow.ts:423-425` gooit de reden weg en houdt `.marks` over → `nutriscoreDeclaredCodes`
  (`t3777-declarations.ts:635-652`, filtert op `fieldType === 'NutritionalScore'`) →
  `declaredCodes` (`verify-flow.ts:442`) → `aliased` → `runFlywheelHooks(gtin, canonicalDeclared, …)`
  (`:555-556`) → `nominateFromKruischeck`. Dat is de route naar kandidaat-referenties. De
  momentopname draagt 61 `NutritionalScore`-instanties, precies de groep waar H1 van ronde 5 over
  ging. De vlag `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` staat vandaag uit, maar AC1 zegt letterlijk
  dat een vlag die morgen aan gaat deze belofte niet mag breken.
- `build-nutriscore-declared-map.ts:256` doet hetzelfde (`const { marks } = …`) en schrijft het
  resultaat naar de MinIO-trainingsbucket.
- `bootstrap-run.ts:451` is wél veilig: die guard staat op `reason !== 'ok'` en werkt ook op een
  cachewaarde. Dat is AC3 die zijn werk doet.

Dit is bovendien in één proces bereikbaar zonder de indexbouwer: het beoordeelscherm-endpoint
(`artwork-pipeline.ts:852`) draait ín de API-server, schrijft de momentopname-uitkomst naar Redis, en
`verify-flow` in diezelfde server leest hem terug. `INFERENCE` voor die procesvolgorde — ik heb het
niet op een draaiende omgeving gemeten — maar de leesroute zelf is hierboven uitgevoerd.

**Wat moet wijzigen.** De poort hoort op de cache te staan, niet alleen op de aanroep. De kleinste
correcte ingreep is één regel in `shouldTreatCacheHitAsMiss`:

```ts
if (!useSnapshot && cached.reason === 'uit-momentopname') return true;
```

Dan haalt een niet-deelnemer altijd opnieuw op en krijgt hij `geen-tradeitem-bestand`. Nadeel: de
twee groepen wippen elkaars cache-entry weg, dus beide betalen per aanroep een catalogus-verzoek.
Schoner, maar iets meer werk: het momentopname-resultaat in een eigen sleutel bewaren (bijvoorbeeld
`marks:{env}:{gln}:{gtin}:{tm}:momentopname`) zodat de twee groepen elkaar niet meer raken; let er
dan op dat `harvest-tradeitem-snapshot.ts:398-403` de sleutel nog steeds ontleedt (`parts[2..4]`
blijft kloppen, en de dubbele id wordt op `:187` ontdubbeld).

#### H2 — de AC1-toets bewijst de verkeerde stelling, en de "zesde aanroeper"-toets toetst zichzelf

`VERIFIED`, `apps/api/src/__tests__/services/t3777-momentopname-20-19.test.ts`, laatste
`describe`-blok.

- `it.each(MOETEN_UIT)` leest de brontekst en eist `not.toContain('useSnapshot')`. Dat bewijst dat
  die bestanden de vlag niet *doorgeven* — niet dat zij de momentopname niet *zien*. H1 laat zien
  dat het tweede onwaar is terwijl het eerste waar blijft. AC1 vraagt letterlijk om een toets "die
  bewijst dat de drie niet-deelnemende aanroepers de momentopname niet zien"; die toets bestaat niet.
- `it('kent alle vijf de aanroepers — een zesde moet hier langs')` doet
  `expect([...MOETEN_UIT, ...MOETEN_AAN]).toHaveLength(5)` op een lijst die in datzelfde bestand
  hardgecodeerd staat. Die assertie kan alleen falen als iemand de lijst zelf wijzigt; een zesde
  aanroeper elders in de codebase maakt hem niet rood. De toets certificeert een garantie die hij
  niet levert.

**Wat moet wijzigen.** Twee dingen. (1) Een gedragstoets per niet-deelnemer: vul de cache met een
`uit-momentopname`-entry en toon dat `resolveDeclaredMarks(gtin, gln)` — zonder opties — géén marks
teruggeeft. Die toets is nu rood en hoort dat te zijn tot H1 gerepareerd is. (2) Laat de
"vijf aanroepers"-toets de codebase zelf aflopen (een `grep`/`readdir` over `apps/api/src` op
`resolveDeclaredMarks(`) en de gevonden verzameling vergelijken met de verwachte vijf paden. Pas dan
klopt de belofte in de toetsnaam.

### MEDIUM

#### M1 — een cache-entry met reden `uit-momentopname` zónder oogstdatum glipt door de vervalregel

`VERIFIED`, `t3777-declarations.ts:665-670`: de tweede regel begint met
`cached.snapshotHarvestedAt !== undefined`. AC8 zegt: "Een hit met reden `uit-momentopname` waarvan
die datum niet gelijk is aan `TRADEITEM_SNAPSHOT_META.harvestedAt` wordt óók als miss behandeld."
`undefined` is niet gelijk, dus die hit hoort een miss te zijn; hij wordt nu juist als geldig
geserveerd, met bevroren marks en zonder enige manier om te weten uit welke oogst ze komen.

Bereikbaar: `marksCacheRead` (`:584-608`, het veld valt weg op `:602`) laat het veld vallen zodra het falsy is, dus een entry met
een lege oogstdatum komt precies zo binnen. De regel hoort op de reden te staan, niet op de
aanwezigheid van het veld:

```ts
if (cached.reason === 'uit-momentopname' &&
    cached.snapshotHarvestedAt !== TRADEITEM_SNAPSHOT_META.harvestedAt) return true;
```

Dat dekt zowel de oudere oogst als de ontbrekende datum, en laat `lege-declaratie` uit de XML-route
(zonder datum) met rust.

#### M2 — de cache-omzeiling geldt óók op het beoordeelscherm-endpoint, voor een groeiende groep

`VERIFIED`: `artwork-pipeline.ts:852` zet `useSnapshot: true`, en `shouldTreatCacheHitAsMiss`
behandelt daarmee **elke** `geen-tradeitem-bestand`-hit als miss (`t3777-declarations.ts:664`) — ook
voor GTINs die helemaal niet in de momentopname staan. Voor die GTINs schrijft de run weer
`geen-tradeitem-bestand` terug, dus de volgende aanroep omzeilt de cache opnieuw. Per verzoek kost
dat een catalogus-aanroep met herkansingen op een scherm waar een beoordelaar op wacht.

De groep is niet stabiel: elk product dat ná 19 augustus binnenkomt zonder trade-item-bestand valt
erin, net als elke GTIN waarvan de gln-keuze afwijkt van de oogst (AC11). De maatregel uit AC8 was
bedoeld om de 442 geoogste sleutels los te wrikken; hem beperken tot díe sleutels doet dat net zo
goed en houdt de cache voor de rest intact:

```ts
if (useSnapshot && cached.reason === 'geen-tradeitem-bestand'
    && TRADEITEM_SNAPSHOT[`${gln}-${gtin}-${tm}`] !== undefined) return true;
```

(dat vraagt wel dat de sleutel aan de functie wordt meegegeven).

#### M3 — `versions.md` is niet bijgewerkt in dezelfde commit

`VERIFIED`, `git log -1 --name-only d10a2a8..HEAD`: negen bestanden, geen `versions.md`. De commit
bevat een zichtbare schermwijziging — de nieuwe aanduiding "uit momentopname van …" in het
beoordeelscherm (`MobileReviewDeck.tsx:1315-1325`) — en de vaste werkafspraak is dat zo'n wijziging
in dezelfde commit een `versions.md`-regel krijgt, in het Nederlands en vanuit de eindgebruiker.

#### M4 — `notInSnapshot` meet iets anders dan het opschrift belooft

`VERIFIED`: `lookupSnapshot` verhoogt `notInSnapshot` bij élke afwezige sleutel
(`t3777-declarations.ts:706-709`), en de indexbouwer drukt dat af als "dat is de omvang van een
verse oogst" (`build-keurmerk-index.ts:669-675`). Een afwezige sleutel kan óók een gln-mismatch zijn
(AC11 noemt die route expliciet) of een product dat ná de oogst is binnengekomen. Dat zijn drie
verschillende soorten werk op één getal.

Twee kleinere zaken op dezelfde teller, allebei `VERIFIED`:

- `resetSnapshotStats()` (`:541`) wordt nergens in productiecode aangeroepen — alleen in de toets.
  In een CLI-proces begint de teller op nul, dus vandaag klopt het; roep hem aan het begin van
  `collectGtinData` aan zodat het ook blijft kloppen als de bouwer ooit twee keer in één proces
  draait.
- Dezelfde module-tellers lopen mee in het API-serverproces (het endpoint zet de vlag ook aan). Dat
  vervuilt de afgedrukte getallen niet — de indexbouwer is een eigen proces — maar het maakt de
  tellers ongeschikt om ooit via een endpoint uit te lezen.

### LOW

- **L1** — `VERIFIED`, `t3777-declarations.ts:798-799`: een als miss behandelde hit verhoogt
  `marksCacheStats.misses`. De hit/miss-verhouding die de indexbouwer afdrukt (het 19.16-bewijs dat
  "de cache werkt") wordt daardoor pessimistischer zonder dat er iets mis is.
- **L2** — `VERIFIED`, `MobileReviewDeck.tsx:1104` en `:1635`: codes uit de momentopname sorteren in
  de relabel-lijst naar boven en krijgen daar een vinkje, terwijl de herkomst-aanduiding alleen in
  het prior-blok staat (`:1300`). In dat scherm is dus niet zichtbaar dat het om bevroren gegevens
  gaat.
- **L3** — `VERIFIED`, testbestand, `MOETEN_UIT`-blok: `not.toContain('useSnapshot')` maakt de toets
  rood zodra iemand het woord in een *commentaar* in `verify-flow.ts` schrijft — bijvoorbeeld om uit
  te leggen waaróm de vlag daar niet staat. Idem voor `toContain('resolveDeclaredMarks(')`, dat ook
  in commentaar raak is (in `bootstrap-run.ts` staat die tekst op `:15`, `:380`, `:443` en `:446`,
  dus de assertie slaagt daar al op commentaar alleen). Robuuster: op de aanroep zelf toetsen, of
  commentaar eerst wegstrippen.
- **L4** — `VERIFIED`, `lookupSnapshot`, `:696-704`: bij een afwijkende doelmarkt wordt per GTIN een
  `logger.warn` geschreven. Staat `T3777_TARGET_MARKET` ooit verkeerd, dan levert één indexrun
  ~1870 identieke waarschuwingen op. Luid mag, maar één keer per run is genoeg.
- **L5** — `VERIFIED`, `t3777-declarations.ts:775`: de nieuwe `orderBy` verandert voor GTINs met
  meerdere gln's mogelijk wélke gln gekozen wordt, en daarmee de cachesleutel — óók voor de drie
  niet-deelnemende aanroepers. Eenmalige extra cache-missers en mogelijk een andere declaratie dan
  vóór deze commit. De spec vraagt de `orderBy` expliciet, dus dit is geen fout, maar het is een
  neveneffect buiten de scope van de story dat nergens is opgeschreven.
- **L6** — `VERIFIED`: het story-bestand
  `_bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md` staat nog op
  "ready for dev" en heeft geen bouwrecord. AC12 wil verwachting en meting náást elkaar in het
  story-record en AC13 wil RED-bewijs; beide hebben nu geen plek om te landen.

---

## Wat moet wijzigen

**Ernst hoog — blokkeert `done`**

1. **Sluit de cache-route naar de niet-deelnemende aanroepers** (H1). Ofwel één regel in
   `shouldTreatCacheHitAsMiss` (`t3777-declarations.ts:660-672`) die een `uit-momentopname`-hit als
   miss behandelt zodra `useSnapshot` uit staat, ofwel een eigen cachesleutel voor het
   momentopname-resultaat. Zonder dit lopen de 61 Nutri-Score-producten alsnog via
   `verify-flow.ts:423` naar `nominateFromKruischeck`, en schrijft
   `build-nutriscore-declared-map.ts:256` bevroren gegevens naar MinIO — precies wat besluit 2
   uitsluit.
2. **Vervang de brontekst-toets voor AC1 door een gedragstoets** (H2): vul de cache met een
   momentopname-entry en toon dat een aanroep zónder opties geen marks krijgt. Laat de
   "vijf aanroepers"-toets de codebase zelf aflopen in plaats van een hardgecodeerde lijst te tellen.

**Ernst midden — repareren vóór uitrol**

3. Laat de vervalregel op de *reden* staan in plaats van op de aanwezigheid van het datumveld, zodat
   een `uit-momentopname`-entry zonder oogstdatum ook een miss is (M1,
   `t3777-declarations.ts:665-670`).
4. Beperk de cache-omzeiling tot sleutels die daadwerkelijk in `TRADEITEM_SNAPSHOT` staan, zodat het
   beoordeelscherm niet voor een groeiende groep GTINs permanent langs de cache gaat (M2).
5. Werk `versions.md` bij met een regel over de nieuwe herkomst-aanduiding in het beoordeelscherm
   (M3).
6. Zeg in de LET OP-regel van de indexbouwer wat `notInSnapshot` werkelijk telt (niet-geoogst **of**
   afwijkende gln **of** nieuw product), en roep `resetSnapshotStats()` aan bij de start van
   `collectGtinData` (M4).

**Ernst laag — meenemen zolang je er toch bent**

7. Tel een als miss behandelde hit niet als cache-miss (L1).
8. Toon de herkomst ook in de relabel-lijst, of onderdruk daar het vinkje voor
   momentopname-codes (L2).
9. Maak de brontekst-toetsen ongevoelig voor commentaar (L3).
10. Waarschuw één keer per run over een afwijkende doelmarkt in plaats van per GTIN (L4).
11. Noteer het neveneffect van de nieuwe `orderBy` op bestaande cachesleutels (L5).
12. Werk het story-record bij met de bouwaantekening, het RED-bewijs en de plek waar de meting van
    AC12 straks landt (L6).

## Wat NIET geverifieerd is

- **De draaiende omgeving.** Ik heb niets uitgerold, geen container aangeraakt, geen droogloop
  gedraaid, geen index herbouwd en geen cachesleutel opgeruimd. Dat is conform het
  waarschuwingsblok bij AC13 en het hoort ook niet bij deze review.
- **De getallen 238 / 475 / 442 / 1870 uit AC12.** Die komen uit de spec en uit metingen op de
  acceptatiedatabase; ik heb ze niet opnieuw gemeten. Wat ik wél zelf zag: de momentopname draagt
  `keys: 442` in `TRADEITEM_SNAPSHOT_META`, en alle sleutels eindigen op `-528` (de bestaande
  toetsen lopen daar overheen en zijn groen).
- **Dat de indexbouwer en de API-server dezelfde Redis delen.** Voor H1 maakt het niet uit — het
  endpoint en `verify-flow` draaien hoe dan ook in hetzelfde proces met dezelfde
  cacheverbinding — maar de bredere variant (indexrun vergiftigt de cache van de worker) heb ik
  niet op een omgeving nagemeten. Dat deel is `INFERENCE`.
- **Het RED-bewijs uit AC13.** Er is geen story-record waarin het staat, en ik kan achteraf niet
  vaststellen of de toetsen eerst rood waren.
- **De prestatie-impact van M2 in cijfers.** Dat de cache wordt omzeild is uitgevoerd en zeker; hoe
  duur dat per verzoek is op de acceptatie-omgeving heb ik niet gemeten.
