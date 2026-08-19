---
review_of: "git diff 57b5439..HEAD op branch story/20-19-momentopname (9342ca0, b56e161, 1c7d159) — de verwerking van review-20-19-code.md"
reviewer: adversariële code-review v2, verse context
date: 2026-08-19
verdict: FAIL
severity_count:
  high: 0
  medium: 2
  low: 6
---

# Code review v2 story 20.19 — de verwerking van de vorige ronde

Basis: `git diff 57b5439..HEAD`, tien bestanden. Alles hieronder is zelf gelezen of zelf
gedraaid; elke regel draagt `VERIFIED` of `INFERENCE`.

## Samenvatting

**De high is écht dicht.** Niet beredeneerd maar uitgevoerd: ik heb de oude aanval opnieuw
gedraaid, in beide volgordes, én geprobeerd hem langs een oude gedeelde cachesleutel te
heropenen. Alle routes leveren nu `geen-tradeitem-bestand` met een lege marks-lijst aan een
aanroeper zonder de vlag. Alle twaalf punten uit "Wat moet wijzigen" zijn verwerkt, geen
waivers, en de poorten zijn groen (api 1084, web 200, `tsc` schoon in beide).

Toch FAIL, om twee dingen die de reparatie zélf meebrengt:

1. **De gescheiden cachesleutel verdubbelt het catalogus-verkeer** — gemeten: twee verzoeken en
   twee Redis-sleutels per GTIN, óók voor gewone werkende producten die niets met de
   momentopname te maken hebben. Vóór deze story warmde de indexrun de cache voor de
   detectiestroom; dat is nu weg. Nergens vermeld, terwijl de commit-boodschap punt 4 juist
   verdedigt met "442+ extra catalogus-verzoeken per run" (N1).
2. **Punt 4 zelf is nergens getoetst.** De derde parameter kreeg de standaardwaarde `true` en
   géén enkele toets geeft hem mee. Draai de fix terug en de hele suite blijft groen — precies
   het faalpatroon van H2 uit ronde 1, één laag dieper (N2).

---

## De twaalf punten uit "Wat moet wijzigen"

| # | punt | oordeel | bewijs |
|---|---|---|---|
| 1 | cache-route naar niet-deelnemers sluiten (H1) | **VERWERKT** | `t3777-declarations.ts:585-593` (eigen `:snap`-sleutel) + `:702-704` (tweede grendel); gedrag zelf gedraaid, zie hieronder |
| 2 | gedragstoets voor AC1 + aanroeperstoets die de codebase afloopt (H2) | **VERWERKT** (met kanttekening N3) | testbestand `:286-341` en `:274-283` |
| 3 | vervalregel op de reden i.p.v. op het datumveld (M1) | **VERWERKT** | `t3777-declarations.ts:709-711`, toets `:334-341` |
| 4 | omzeiling begrenzen tot geoogste sleutels (M2) | **VERWERKT in code, NIET getoetst** | `t3777-declarations.ts:692-695` + `:851-853`; zie N2 |
| 5 | `versions.md` bijwerken (M3) | **VERWERKT** | `versions.md:3-21` |
| 6 | LET OP-regel eerlijk + `resetSnapshotStats()` in `collectGtinData` (M4) | **VERWERKT** (met N4) | `build-keurmerk-index.ts:674-681` en `:439` |
| 7 | een gevallen hit niet als cache-miss tellen (L1) | **VERWERKT** (met N5) | `t3777-declarations.ts:856-863` |
| 8 | herkomst ook in de relabel-lijst (L2) | **VERWERKT**, zonder toets | `MobileReviewDeck.tsx:1731-1750` |
| 9 | brontekst-toetsen ongevoelig voor commentaar (L3) | **VERWERKT** | testbestand `:253-259` |
| 10 | één doelmarkt-waarschuwing per run (L4) | **VERWERKT**, zonder toets | `t3777-declarations.ts:562-563`, `:743-755`, reset op `:542` |
| 11 | neveneffect van de `orderBy` noteren (L5) | **VERWERKT** | `t3777-declarations.ts:819-825` (in code, niet in het story-record) |
| 12 | story-record: bouwaantekening, RED-bewijs, plek voor de meting (L6) | **VERWERKT** | story-md `:394-458` |

`VERIFIED` voor elke regel in deze tabel: zelf gelezen op de genoemde plek.

## De reparatie van de high, met gedrag getoetst

`VERIFIED, zelf uitgevoerd.` Twaalf probes tegen de échte `resolveDeclaredMarks` (Redis, Prisma
en `fetch` gemockt, opstelling gelijk aan het repo-testbestand). Het probebestand staat in mijn
scratchpad; er is niets in de repository geschreven (`git status --porcelain` is leeg).

| probe | opzet | uitkomst |
|---|---|---|
| P1a | mét vlag → zónder vlag | `geen-tradeitem-bestand`, `marks: []`, `nutriscoreDeclaredCodes([]) = []` |
| P1b | zónder → mét → zónder | nog steeds `geen-tradeitem-bestand`, lege marks |
| P2a | oude GEDEELDE sleutel voorgevuld met `uit-momentopname` + marks + actuele oogstdatum, dan zónder vlag lezen | lege marks — de tweede grendel vangt de migratie-entry |
| P2b | oude gedeelde sleutel met `lege-declaratie` + oogstdatum, zónder vlag | als miss behandeld |
| P3 | lege declaratie uit de momentopname (`lege-declaratie`) | bereikt de niet-deelnemer niet |

Ik heb ook geprobeerd het lek langs een andere weg te openen en dat lukt niet:

- **een handgeschreven of legacy `lege-declaratie` zónder oogstdatum** op de gedeelde sleutel
  komt wél bij een niet-deelnemer binnen (probe P2c, uitkomst `{"marks":[],"reason":
  "lege-declaratie"}`). `VERIFIED` dat dit géén lek is: `lookupSnapshot` (`:765-769`) hangt
  altijd de oogstdatum aan zijn lege declaratie, dus een datumloze `lege-declaratie` kan alleen
  uit de XML-route komen — en die is legitiem. De marks zijn hoe dan ook leeg.
- **een volgorde-aanval** (niet-deelnemer eerst, deelnemer daarna) faalt: gescheiden sleutels.
- **de tweede grendel** vangt alles wat `reason === 'uit-momentopname'` óf een `snapshotHarvestedAt`
  draagt zodra de vlag uit staat (`:702-704`). Twee elkaar afdekkende maatregelen; dat is
  bewust en het is de juiste keuze.

`VERIFIED`: er bestaat geen aanroepvolgorde meer waarin bevroren marks bij `verify-flow.ts`,
`bootstrap-run.ts` of `build-nutriscore-declared-map.ts` terechtkomen.

---

## Nieuwe bevindingen

### MEDIUM

#### N1 — de gescheiden cachesleutel verdubbelt cache én catalogus-verkeer, en dat staat nergens

`VERIFIED, zelf gemeten` (probe P5 en P5b):

```
zelfde GTIN, eerst mét vlag, daarna zonder:
  catalogus-verzoeken: 1 → 2
  Redis-sleutels: ['marks:acc:…:528:snap', 'marks:acc:…:528']

een gewoon WERKEND product (reden `ok`, niets met de momentopname te maken):
  catalogus-verzoeken: 2      Redis-sleutels: 2
```

`VERIFIED` uit de bron: de sleutel krijgt `:snap` puur op basis van de vlag
(`t3777-declarations.ts:592`), niet op basis van de vraag of dit product überhaupt geoogst is.
Gevolg: **de twee aanroepersgroepen warmen elkaars cache niet meer op.** Vóór deze story deelden
alle vijf aanroepers één sleutel; een indexrun over 1870 GTINs warmde daarmee ook de
detectiestroom. Dat is nu weg, voor de volle populatie — niet voor de 442 geoogste sleutels
waar het om ging.

`INFERENCE` voor de omvang: tot ~1870 extra catalogus-verzoeken per 24-uursvenster en ~2× het
geheugen in de `marks:`-naamruimte. Ik heb dat niet op een omgeving nagemeten; de verdubbeling
zelf is wél uitgevoerd.

Dit staat haaks op de eigen verantwoording: de commit-boodschap van `b56e161` verdedigt punt 4
met "would have … cost 442+ extra catalog requests per run", terwijl dezelfde commit langs de
andere deur een groter aantal binnenlaat. Geen van beide getallen is gemeten.

**Wat moet wijzigen.** Geef alleen de sleutels die daadwerkelijk in de momentopname staan een
eigen naamruimte; de tweede grendel dekt de rest al af:

```ts
const inMomentopname = TRADEITEM_SNAPSHOT[`${gln}-${gtin}-${targetMarket}`] !== undefined;
const key = marksCacheKey(gln, gtin, targetMarket, envTag, useSnapshot && inMomentopname);
```

Voor een niet-geoogst product levert het momentopname-pad nooit een momentopname-uitkomst op
(`lookupSnapshot` geeft `null`, `:759-763`), dus er kan niets bevrorens op de gedeelde sleutel
belanden. Dan blijft de cachewinst voor ~1428 van de 1870 producten intact. Wordt hiervan
afgeweken, noteer de verdubbeling dan expliciet in het story-record én in de LET OP-regel van
de indexbouwer.

#### N2 — punt 4 is nergens getoetst; de standaardwaarde maakt de fix onzichtbaar voor de suite

`VERIFIED`, `grep -rn "shouldTreatCacheHitAsMiss(" src`: zeven aanroepen in toetsen, **allemaal
met twee argumenten**, plus één productie-aanroep met drie (`t3777-declarations.ts:853`). De
derde parameter heeft standaard `true` (`:692`), dus elke bestaande assertie beschrijft precies
het gedrag van vóór de reparatie. Vervang `return staatInMomentopname;` door `return true;` en
de hele suite blijft groen.

`VERIFIED` dat er ook geen gedragstoets is: elk cache-scenario in
`t3777-momentopname-20-19.test.ts` gebruikt `GTIN_MET`, een sleutel die wél in de momentopname
staat (`:158-190`). Het geval dat punt 4 repareert — een NIET-geoogste GTIN met een gecachete
negatieve uitkomst — komt in geen enkele toets voor.

`VERIFIED, zelf gedraaid` dat de code het wél goed doet (probe P4): een niet-geoogste GTIN met
een gecachete `geen-tradeitem-bestand` en de vlag aan doet **nul** catalogus-verzoeken, een wél
geoogste GTIN doet er wel één. De fix werkt; hij is alleen niet vastgepind.

**Wat moet wijzigen.** Twee asserties, allebei geverifieerd werkend in mijn probe:

```ts
expect(shouldTreatCacheHitAsMiss(hit, true, false)).toBe(false);
// en een gedragstoets: niet-geoogste GTIN + gecachete negatieve uitkomst + vlag aan
//                      => reason blijft `geen-tradeitem-bestand` en fetch is NIET aangeroepen
```

Overweeg daarnaast de standaardwaarde te schrappen en de parameter verplicht te maken: hij is
er om een omzeiling te *begrenzen*, en een standaard die de begrenzing uitschakelt is de
verkeerde kant om.

### LOW

- **N3** — `VERIFIED`, testbestand `:274-283`: de aanroeperstoets heet "kent ALLE aanroepers in
  de codebase" maar `grep -rln … src` loopt alleen `apps/api/src` af. `apps/api/scripts/`
  (waar `harvest-tradeitem-snapshot.ts` staat) en `apps/web` blijven buiten beeld. Vandaag geen
  gat — `grep -rn "resolveDeclaredMarks(" apps` levert geen aanroeper buiten `src` — maar de
  belofte in de naam is breder dan de dekking. Bovendien strippen deze grep géén commentaar,
  terwijl punt 9 dat juist uit de zustertoets haalde: een bestand dat `resolveDeclaredMarks(`
  alleen in een toelichting noemt telt hier als aanroeper. (`build-keurmerk-index.ts:23` is
  precies zo'n commentaarregel; hij valt nu niet op omdat dat bestand óók een echte aanroep
  heeft op `:479`.)
- **N4** — `VERIFIED`, `t3777-declarations.ts:534-537`: het doc-commentaar bij `snapshotStats`
  zegt nog steeds dat `notInSnapshot` "precies de hoeveelheid werk voor een verse oogst" is.
  Dat is exact de bewering die punt 6 uit de afgedrukte LET OP-regel heeft gehaald
  (`build-keurmerk-index.ts:674-681`). De twee spreken elkaar nu tegen; de lezer van de code
  krijgt de weerlegde versie.
- **N5** — `VERIFIED`, `t3777-declarations.ts:856-863`: een bewust gevallen hit telt nu in
  geen van beide tellers. `hits + misses` is daarmee niet meer gelijk aan het aantal aanroepen,
  dus het afgedrukte percentage (`build-keurmerk-index.ts:769`) vleit de cache en is niet
  vergelijkbaar met runs van vóór 20.19. De eigen teller staat bovendien op een andere regel
  (`:671-672`), dus de lezer moet twee regels bij elkaar optellen. Zet het aantal gevallen hits
  ook op de cacheregel, of noem de noemer erbij.
- **N6** — `VERIFIED`, `git show -w --stat b56e161 -- …/MobileReviewDeck.tsx`: 898 gewijzigde
  regels, waarvan 141/29 inhoudelijk — de rest is een prettier-herindeling van het hele bestand,
  in dezelfde commit als de functionele wijziging. Een zichtbare schermwijziging wordt zo
  onnodig moeilijk te beoordelen. Herindeling hoort in een eigen commit.
- **N7** — `VERIFIED`: vier van de twaalf verwerkte punten landen zónder toets.
  (a) punt 8, de herkomst-aanduiding in de relabel-lijst — `git diff --stat` toont geen
  wijziging in `MobileReviewDeck.momentopname-20-19.test.tsx`;
  (b) punt 10, de eenmalige doelmarkt-waarschuwing — geen enkele toets kijkt naar `logger.warn`;
  (c) punt 6, de `resetSnapshotStats()` aan het begin van `collectGtinData` — het enige
  testbestand dat `collectGtinData` aanroept mockt die functie weg als `vi.fn()`
  (`build-keurmerk-index-19-16.test.ts:28`) en assert nooit dat hij aangeroepen is;
  (d) de `:snap`-ontleding in het oogstscript — die code staat inline in `main()`
  (`harvest-tradeitem-snapshot.ts:399-407`), buiten de wél testbare `harvest()`.
- **N8** — `VERIFIED`, `t3777-declarations.ts:541-547`: `resetSnapshotStats()` zet nu ook
  `doelmarktGewaarschuwd` terug. De naam belooft tellers. Wie hem ooit aanroept om alleen de
  getallen te nullen, herbewapent stilzwijgend een waarschuwing. Hernoem, of splits in een
  eigen `resetSnapshotWarnings()`.

### Nagekeken en géén bevinding

- `VERIFIED`: de `:snap`-sleutel botst niet met een bestaande naamruimte. De enige twee
  sleutelfamilies zijn `t3777:{gln}:{gtin}:{tm}` (`:121`) en `marks:{env}:…` (`:592`); geen
  ander zesdelig `marks:`-patroon bestaat. De ontleding in `harvest-tradeitem-snapshot.ts:404-406`
  klopt (`parts[2..4]` blijft het product, dubbele ids worden op `:187` ontdubbeld) en het
  SCAN-patroon `marks:{env}:*` vangt beide vormen.
- `VERIFIED`: `doelmarktGewaarschuwd` lekt niet tussen toetsen. Vitest geeft elk testbestand een
  eigen moduleregistratie, en het 20.19-bestand roept `resetSnapshotStats()` aan in `beforeEach`
  (`:74`). In het API-serverproces waarschuwt hij één keer per proceslevensduur — dat is de
  bedoeling.
- `VERIFIED`: `resetSnapshotStats()` in `collectGtinData` wist niets dat een aanroeper nodig had.
  `collectGtinData` wordt precies één keer aangeroepen (`build-keurmerk-index.ts:737`), vóór
  `printPlan`, en niemand leest `snapshotStats` daarvóór. `marksCacheStats` wordt bewust níet
  meegereset.
- `VERIFIED`: de standaardwaarde `staatInMomentopname = true` is *veilig* — hij kan alleen te
  vaak omzeilen, nooit bevroren gegevens doorlaten. Het bezwaar is toetsbaarheid (N2) en kosten,
  niet veiligheid.
- `VERIFIED, zelf gedraaid`: api 1084 geslaagd / 2 overgeslagen / 67 todo (89 bestanden),
  web 200 geslaagd / 20 todo (33 bestanden), `npx tsc --noEmit` zonder uitvoer in beide,
  `eslint` op de gewijzigde api-bestanden 0 fouten (7 waarschuwingen, allemaal bestaande
  ongebruikte `eslint-disable`-regels). De gecompileerde momentopname staat in
  `apps/api/dist/services/tradeitem-declaration-snapshot.js` (60.641 bytes).

---

## Wat moet wijzigen

**Ernst midden — repareren vóór uitrol**

1. **Beperk de eigen cachesleutel tot geoogste sleutels** (N1), zodat de indexrun de cache voor
   de detectiestroom weer warmt en het catalogus-verkeer niet voor de volle populatie
   verdubbelt. Wijk je hiervan af, zet de verdubbeling dan expliciet in het story-record.
2. **Pin punt 4 vast met twee asserties** (N2): `shouldTreatCacheHitAsMiss(hit, true, false)`
   moet `false` geven, en een gedragstoets met een NIET-geoogste GTIN moet aantonen dat de
   catalogus niet opnieuw wordt bevraagd. Maak de parameter bij voorkeur verplicht.

**Ernst laag — meenemen zolang je er toch bent**

3. Laat de aanroeperstoets ook `apps/api/scripts` en `apps/web` aflopen, en strip er commentaar
   (N3).
4. Haal de weerlegde bewering over `notInSnapshot` uit het doc-commentaar bij `snapshotStats`
   (N4).
5. Zet het aantal bewust gevallen hits op dezelfde regel als de cacheverhouding, of noem de
   noemer erbij (N5).
6. Houd prettier-herindelingen in een eigen commit, los van functionele wijzigingen (N6).
7. Zet een toets op de vier ongetoetste reparaties: de herkomst in de relabel-lijst, de
   eenmalige doelmarkt-waarschuwing, de reset in `collectGtinData` en de `:snap`-ontleding in
   het oogstscript — die laatste vraagt dat de sleutelontleding uit `main()` naar een
   exporteerbare functie verhuist (N7).
8. Hernoem `resetSnapshotStats()` of splits het waarschuwingsvlaggetje eruit (N8).

## Wat NIET geverifieerd is

- **De draaiende omgeving.** Niets uitgerold, geen container aangeraakt, geen droogloop
  gedraaid, geen index herbouwd, geen cachesleutel opgeruimd, geen database benaderd. Dat is
  conform de opdracht en conform het waarschuwingsblok bij AC13.
- **De omvang van N1 in cijfers.** Dat de sleutels en de verzoeken verdubbelen is uitgevoerd en
  zeker; hoeveel extra catalogus-verzoeken dat per etmaal op acceptatie oplevert heb ik niet
  gemeten. Dat deel is `INFERENCE`.
- **De getallen 238 / 475 / 442 / 1870 uit AC12.** Onveranderd sinds ronde 1: uit de spec, niet
  door mij opnieuw gemeten. Wat ik wél zag: de momentopname draagt 442 sleutels en de bestaande
  17 toetsen daarover zijn groen.
- **`eslint` op `apps/web`.** De losse aanroep op `MobileReviewDeck.tsx` stort af op een
  botsing tussen twee eslint-versies in de werkruimte (eslint 9.39 naast 8.57.1). Dat is een
  bestaand infrastructuurprobleem, niet iets uit deze diff; ik heb de bewering "eslint 0
  fouten" voor `apps/web` dus niet kunnen natrekken. Voor `apps/api` wel.
- **Het RED-bewijs uit AC13.** Het staat nu als tabel in het story-record (`:420-434`), maar of
  de toetsen destijds daadwerkelijk eerst rood waren kan ik achteraf niet vaststellen. Wat ik
  wél kon controleren is de bewering in de laatste tabelregel — dat geen enkele gedragstoets de
  tweede grendel alléén betrapt — en die klopt: de twee maatregelen dekken elkaar af, en
  daarom staat er terecht een rechtstreekse toets op (`:322-331`).
