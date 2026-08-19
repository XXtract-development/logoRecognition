---
review_of: _bmad-output/implementation-artifacts/20-19-declaraties-uit-de-tradeitem-database.md (versie 5, 320 regels)
review_type: adversariële her-review — vierde ronde; toetst de verwerking van review-20-19-v4, besluit 2, en de code uit c7e3fa5 + 4670d80
reviewer: adversariële her-review, verse context
date: 2026-08-19
branch: acc
verdict: FAIL
severity_count: { high: 3, medium: 9, low: 5 }
---

# Her-review — story 20.19, versie 5 (besluit 2: alleen de beoordeelwachtrij)

**Verdict: FAIL** — 3 high / 9 medium / 5 low.

De code uit de vorige ronde is echt gerepareerd. Ik heb alle vier de codereparaties nagemeten en ze
werken: het ontdubbelen, het omgevingsfilter, de tekensetcontrole, en — het lastigste punt —
de generator produceert nu **byte-voor-byte** hetzelfde bestand als wat er in de repository staat.
De toetsen pinnen de veldtabel niet langer tegen zichzelf maar tegen `MARK_FIELDS`. Van de drie
foute `bestand:regel`-verwijzingen uit versie 4 is er nog één over, en die is cosmetisch.

Wat er misgaat zit in besluit 2 zelf. De spec vertaalt "de gegevens gaan uitsluitend naar de
beoordeelwachtrij" naar één codehandeling: `resolveDeclarations` niet aanraken, alleen
`resolveDeclaredMarks`. Die vertaling klopt niet. `resolveDeclaredMarks` is geen ingang van de
indexbouwer — het is een gedeelde dienst met **vijf** aanroepers, waarvan er twee schrijven en
één een referentiekandidaat kan aanmaken. Drie bevindingen die de spec als "vervallen" opvoert
verschuiven daardoor in plaats van te verdwijnen.

Daarnaast introduceert de nieuwe redencode twee gaten die niemand nog gezien heeft: hij wordt
gecachet, waardoor het oogstscript zijn eigen bron niet meer terugvindt; en hij wordt door de
beoordeelscherm-code als "geen declaratie" gelezen.

> **Let op — er is opnieuw gecommit vóór deze review.** `VERIFIED`: commit `4670d80`
> ("docs(20.19),fix(20.19): process the design re-review; the snapshot feeds review only",
> 19 aug 14:48) wijzigde de spec, het akkoordverzoek, het oogstscript, de toetsen, `t3777-declarations.ts`
> en het momentopname-bestand. De spec draagt op regel 3 nog "wacht op her-review". Zie M9.

---

## 1. De bevindingen uit `review-20-19-v4.md`, stuk voor stuk

### Highs

| # | Bevinding v4 | Oordeel | Bewijs |
|---|---|---|---|
| H1 | De nieuwe redencode wordt nergens benoemd | **VERWERKT** | AC2 (r. 136-150) draagt een drie-gevallen-tabel met de naam `uit-momentopname`, en zegt erbij waarom een naam nodig is. `VERIFIED`: de naam is vrij — `grep -rn "uit-momentopname"` over `apps/` (ts/tsx/py) geeft **niets**; hij botst niet met een waarde uit `DeclarationReason` (`t3777-declarations.ts:48-55`) of `CollectReason` (`build-keurmerk-index.ts:325-334`), en er is geen database-enum die hem zou weigeren (`prisma/schema.prisma`: alle `reason`-kolommen zijn `String`) |
| H2 | De momentopname voedt een schrijfpad zonder versheidscontrole | **NIET — verschoven, niet vervallen** | Zie **H1 (nieuw)**. `resolveDeclarations` wordt inderdaad niet aangeraakt, maar `resolveDeclaredMarks` voedt zélf een nominatiepad |
| H3 | De toets houdt de generator tegen zichzelf | **VERWERKT** | `VERIFIED`: `tradeitem-declaration-snapshot.test.ts:185-196` pint `GDSN_TO_FIELD_TYPE` tegen `MARK_FIELDS` + `CONSUMER_USAGE_FIELD_TYPE`; de aantallen staan als letterlijke waarden in `GEMETEN` (`:40-49`) en worden op `:218-225` tegen de inhoud gehouden, niet tegen de meta. De meta wordt apart tegen dezelfde letterlijke waarden gehouden (`:231-237`). Beide exports bestaan nu: `MARK_FIELDS` (`t3777-declarations.ts:420`) en `CONSUMER_USAGE_FIELD_TYPE` (`:434`) |
| H4 | De governance-bewering spreekt het akkoordverzoek tegen | **VERWERKT** | De spec draagt nu de twee-kolommen-tabel (r. 91-98) en het akkoordverzoek is bijgewerkt met een tweede aanvulling die dezelfde tabel draagt, besluit 2 opneemt, én de AC5-verwijzing expliciet intrekt (`akkoordverzoek-productie-leestoegang-2026-08-19.md:101-133`). `VERIFIED`: `mongodb` en `tsx` komen in **geen** `package.json` voor (root, `apps/api`, `apps/web`) — de spec-bewering op r. 100-102 klopt |

### Mediums

| # | Bevinding v4 | Oordeel | Bewijs |
|---|---|---|---|
| M1 | `harvest()` ontdubbelt de sleutels niet | **VERWERKT** | `VERIFIED`: `harvest-tradeitem-snapshot.ts:160` — `const ids = [...new Set(await deps.listMissingFileIds())];`, met de reden erboven |
| M2 | Het gegenereerde bestand is niet het bestand dat het script maakt | **VERWERKT — met een nieuw randgeval** | `VERIFIED, eigen meting`: ik heb `renderSnapshotModule` + `formatGenerated` opnieuw gedraaid op de inhoud van het gecommitte bestand (zelfde `harvestedAt`) en de uitvoer is **identiek, 0 diff-regels**. Zie ook **M4 (nieuw)** en **M5 (nieuw)** |
| M3 | AC6's "vier plekken" zijn er vijf | **VERWERKT — maar het zijn er zes** | De tabel (r. 184-189) noemt de voortgangsregel `:484-486`. `VERIFIED`: die regel bestaat en drukt de redenen bij naam af. Zie **H3 (nieuw)** voor de zesde plek |
| M4 | De momentopname is uitsluitend doelmarkt 528 | **VERWERKT** | `VERIFIED`: `TRADEITEM_SNAPSHOT_META.targetMarket: '528'` (`tradeitem-declaration-snapshot.ts:29`), AC9 (r. 230-235), een bewaking in de generator (`harvest-tradeitem-snapshot.ts:183-189`) en een toets (`…test.ts:240-249`). Eigen telling: **442/442** sleutels eindigen op `-528` |
| M5 | De sleutel hangt aan een gln die niet stabiel bepaald wordt | **NIET — de spec noemt hem ten onrechte vervallen** | Zie **M1 (nieuw)** |
| M6 | De cache-schakelaar heet naar de indexbouwer maar werkt procesbreed | **VERWERKT** | AC7 (r. 205-212): "een hit … als **miss** behandelen", parameter boven omgevingsvariabele, en geen `INDEX` in de naam. De onderbouwing klopt: `VERIFIED`, `marksCacheRead` op `:642`, `T3777_CACHE_TTL_S` default `86400` op `:87` |
| M7 | Het omgevingssegment op de T3777-sleutel maakt elke cache-entry waardeloos | **VERWERKT — uitgeplaatst** | r. 263-268 zet het in "Wat NIET in deze story zit", mét het gevolg (~1863 verse aanroepen). `VERIFIED`: `marks:${envTag}:…` op `:521`, `t3777:${gln}:${gtin}:${tm}` op `:112` |
| M8 | De 61 producten zonder `PackagingMarkedLabelAccreditationCode` vallen tussen AC2 en AC4 | **VERVALLEN — terecht** | `VERIFIED`: het T3777-filter uit v4-AC4 bestaat niet meer; `resolveDeclaredMarks` → `parseDeclaredMarks` neemt alle vijf veldsoorten (`:420-425` + `:434`), dus er is geen ingang meer die een niet-lege momentopname tot een lege lijst versmalt. Dit is de enige van de drie "vervallen"-claims die volledig standhoudt |
| M9 | AC8 maakt de veroudering nergens bezwaarlijk | **VERWERKT — met een open keuze** | AC8 (r. 220-223) vraagt een grens en stelt 180 dagen voor. Zie **L4** |
| M10 | De regeneratieweg vraagt `mongodb` en `tsx` | **VERWERKT — onvolledig** | r. 100-102 en AC8 (r. 228). Zie **M6 (nieuw)**: er is inmiddels een derde vereiste bij gekomen |
| M11 | Het oogstscript filtert niet op omgeving | **VERWERKT** | `VERIFIED`: `harvest-tradeitem-snapshot.ts:319-322` bepaalt `envTag` via `catalogEnvTag(CATALOG_API_BASE)`, `:330` scant `marks:${envTag}:*`, en `:352` weigert alsnog elke sleutel waarvan `parts[1] !== envTag`. Dubbel gesloten, en de `.replace(/\/+$/, '')` is gelijk aan die in `readEnv()` (`t3777-declarations.ts:85`) |
| M12 | Het akkoordverzoek beschrijft de verlaten route | **VERWERKT** | `akkoordverzoek-…-2026-08-19.md:101-133` — tweede aanvulling met datum, de tabel, besluit 2, en "de verwijzing is vervallen" voor AC5 |
| M13 | Gecommit vóór de review | **ERKEND, en opnieuw gebeurd** | r. 117-120 legt het vast voor `c7e3fa5`. Zie **M9 (nieuw)** voor `4670d80` |

### Lows

| # | Bevinding v4 | Oordeel | Bewijs |
|---|---|---|---|
| L1 | `:48-56` → `:48-55` | **VERWERKT** | r. 185. `VERIFIED`: de union loopt t/m `:55` |
| L2 | `:143-152` → `:143-159` | **VERWERKT** | AC11 (r. 250-251). `VERIFIED`: `GlnLookup` op `:143`, `BackfillDeps` `:146-159` |
| L3 | `:420-431` → `:420-425` + `:434` | **VERWERKT** | AC4 (r. 161-162). `VERIFIED`: `MARK_FIELDS` bevat vier paren op `:420-425`, de vijfde staat op `:434` |
| L4 | De Nutri-Score-waarde in de toetsopstelling | **VERWERKT** | `VERIFIED`: `…test.ts:78` gebruikt nu de kale letter `'A'`, en `:251-259` is een nieuwe toets die alle 61 echte scores tegen `/^[A-E]$/` én tegen `nutriscoreDeclaredCodes` houdt |
| L5 | Codes zonder ontsnapping in enkele aanhalingstekens | **VERWERKT — onvolledig** | `VERIFIED`: `SAFE_CODE = /^[A-Z0-9_.-]+$/` (`:63`) met een harde `throw` op `:116-121`. Zie **M10 (nieuw)** |
| L6 | `versions.md` niet bijgewerkt | **NIET — met een verdedigbare reden** | `VERIFIED` via `git show --stat`: geen `versions.md` in `c7e3fa5` noch in `4670d80`. De commit-tekst zegt bewust "nothing user-visible has landed yet". Dat houdt stand zolang er niets bedraad is; bij de bedrading moet het mee |
| L7 | Bestandsnamen zonder pad in de AC6-tabel | **GROTENDEELS VERWERKT** | De eerste vier rijen dragen het volledige pad (r. 185-188); de vijfde rij (r. 189) valt terug op `build-keurmerk-index.ts:484-486` |

---

## 2. Besluit 2 getoetst: waar komt `resolveDeclaredMarks` werkelijk uit?

### H1 — `resolveDeclaredMarks` heeft vijf aanroepers, niet één; twee ervan schrijven. — **high**

De spec stelt (r. 22-24): *"`resolveDeclarations` — de ingang die de automatische bevestiging voedt —
wordt niet aangeraakt. Alleen `resolveDeclaredMarks`, de ingang van de indexbouwer, krijgt de
terugval."* AC1 herhaalt het: *"en alleen bij de indexbouwer"*.

`VERIFIED` — `grep -rn "resolveDeclaredMarks" apps/ --include="*.ts"`, tests en `dist/` weggelaten,
geeft **vijf** productie-aanroepers:

| aanroeper | regel | wat er met het resultaat gebeurt | schrijft? |
|---|---|---|---|
| `src/scripts/build-keurmerk-index.ts` | `:458` | de indexbouwer — de bedoelde afnemer | index-sleutel |
| `src/services/pipeline/verify-flow.ts` | `:423` | Nutri-Score-letters uit de marks gaan de gedeclareerde codes in | **ja — zie hieronder** |
| `src/services/flywheel/bootstrap-run.ts` | `:450` | harde declaratie-guard vóór de klasse-zoektocht | indirect |
| `src/scripts/build-nutriscore-declared-map.ts` | `:256` | bouwt de Nutri-Score-declaratiemap | **ja — MinIO** |
| `src/api/v1/artwork-pipeline.ts` | `:849` | `GET /artwork/declared-marks/:gtin`, de label-prior voor het beoordeelscherm | nee (lezen) |

De tweede is de ernstige. `verify-flow.ts:421-441` roept **beide** resolvers parallel aan en voegt
de Nutri-Score-letters uit `resolveDeclaredMarks` toe aan `declaredCodes`:

```
const declaredCodes = [...new Set([...declaration.codes, ...nsCodes])];
```

Die samengevoegde lijst loopt door naar de detectie, de verdicts, en dan naar
`runFlywheelHooks(gtin, canonicalDeclared, verdicts, detections, runId)` (`:556`). Daarbinnen
(`verify-flow.ts`, definitie van `runFlywheelHooks`) wordt élk `CONFIRMED`-verdict via
`nominateFromKruischeck` (`flywheel/kruischeck-hook.ts:63-86`) een **kandidaat-referentie**, en
`registerKruischeckMismatchEvents` schrijft mismatch-gebeurtenissen weg.

`VERIFIED`: de momentopname draagt **61** `NutritionalScore`-instanties over 61 producten. Met de
terugval in `resolveDeclaredMarks` komen die letters via deze route alsnog bij het aanmaken van
referentiekandidaten uit — precies wat besluit 2 uitsluit, en precies wat de spec op r. 14-15 en
het akkoordverzoek in zijn tweede aanvulling beloven dat níet gebeurt.

`VERIFIED, nuance die erbij hoort`: beide schrijfacties zitten achter
`FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`, die standaard uit staat (`verify-flow.ts:546-550`,
`:631`). Het pad is dus vandaag inactief. Maar de spec doet een **onvoorwaardelijke** bewering
("worden niet gebruikt om … referentielogo's aan te maken"), er is geen acceptatiecriterium dat die
vlag noemt, en geen toets die de belofte vasthoudt. Een vlag die morgen aan gaat is geen ontwerp.

`build-nutriscore-declared-map.ts:256` leest ook mee en schrijft het resultaat als JSON naar de
MinIO-trainingsbucket (`writeDeclaredMap`, `putObject(BUCKETS.TRAINING, …)`). Dat is een handmatig
script, maar het is wél een schrijfactie op geoogste, bevroren gegevens die de spec niet noemt.

`bootstrap-run.ts:451` is het geruststellende geval, maar per ongeluk:
`if (decl.reason !== 'ok' || …) continue;` — een GTIN met reden `uit-momentopname` valt daar dus
weg. Dat is de gewenste uitkomst, maar hij hangt volledig aan de keuze om **niet** `ok` terug te
geven. Zie M7.

**Wat moet gebeuren:** de terugval moet aan de aanroepkant gezet worden (een parameter op
`resolveDeclaredMarks`, of een aparte functie die alleen de indexbouwer aanroept), niet
onvoorwaardelijk in de dienst. AC1 zegt letterlijk "alleen bij de indexbouwer" en spreekt zichzelf
in de volgende zin tegen door hem in de gedeelde dienst te leggen.

---

## 3. Nieuwe gaten die besluit 2 en `uit-momentopname` introduceren

### H2 — De terugvaluitkomst wordt gecachet, en maakt daarmee het oogstscript blind voor zijn eigen bron. — **high**

`VERIFIED`, de cachevolgorde in `resolveDeclaredMarks`: lezen op `:642`, en aan het eind
onvoorwaardelijk schrijven — `await marksCacheWrite(key, result, ttlForReason(result.reason, cacheTtlS), gtin);`
(`t3777-declarations.ts:673`). `ttlForReason` (`:532-534`) geeft alles behalve `api-fout` de normale
TTL van 86.400 s.

AC7 beschrijft de maatregel als "een hit met reden `geen-tradeitem-bestand` als miss behandelen",
dus de terugval landt op het miss-pad — vóór die schrijfregel. Het gevolg staat nergens in de spec:

1. na één indexrun dragen de 442 cachesleutels reden `uit-momentopname` (238) of `lege-declaratie`
   (204), niet meer `geen-tradeitem-bestand`;
2. `VERIFIED`: het oogstscript selecteert uitsluitend op die oude reden —
   `if (parsed.reason !== 'geen-tradeitem-bestand') return;` (`harvest-tradeitem-snapshot.ts:349`);
3. dus de regeneratie die AC8 als remedie tegen veroudering aanwijst, en de leeftijdsgrens van 180
   dagen die AC8 instelt, hebben ná de eerste run **geen populatie meer om op te oogsten**. De 442
   zijn onvindbaar geworden voor precies het script dat ze moet verversen;
4. en de maatregel uit AC7 zelf (hit-als-miss op `geen-tradeitem-bestand`) vuurt daarna nooit meer
   voor deze groep, dus een vérse momentopname wordt 24 uur lang niet opgepikt.

De spec moet kiezen: de terugvaluitkomst **niet** cachen, of het oogstscript zijn sleutels uit
`TRADEITEM_SNAPSHOT` laten halen in plaats van uit de cachereden. Zonder die keuze bouwt deze story
een eenrichtingsdeur.

### H3 — De nieuwe reden raakt een zesde plek, buiten `apps/api`, en die zet het beoordeelscherm uit. — **high**

`VERIFIED`: `apps/web/src/components/review/MobileReviewDeck.tsx:417`

```
const has = res.reason === 'ok' && res.marks.length > 0;
```

`res` komt van `fetchDeclaredMarks` (`apps/web/src/services/artworkReviewService.ts:164-176`), die
`GET /artwork/declared-marks/:gtin` aanroept — de endpoint die `resolveDeclaredMarks` doorgeeft
(`artwork-pipeline.ts:849`). Met reden `uit-momentopname` is `has` **false**, en het commentaar op
`:299-300` zegt wat dat betekent: *"without it we show nothing"*.

Dat is de beoordelaar die de story wil bedienen: voor de 238 producten komen de marks wél mee over
de lijn, maar de deck toont de declaratie-prior niet. AC6 somt vijf plekken op en noemt zichzelf
uitputtend ("`uit-momentopname` raakt vijf plekken. Alle vijf bijwerken"); de zesde ligt in
`apps/web` en wordt door geen enkel acceptatiecriterium geraakt. Er is ook geen toets die hem
afdekt — de bestaande deck-toetsen zetten allemaal `reason: 'ok'` in hun mock.

---

## 4. Mediums

**M1 — De ongeordende gln-opzoeking is niet vervallen; hij zit óók in `resolveDeclaredMarks`. — medium**

AC1 (r. 129-134) voert dit als vervallen op omdat `resolveDeclarations` niet aangeraakt wordt, met
verwijzing naar `t3777-declarations.ts:293-299`. `VERIFIED`: die verwijzing klopt (`resolveGln`,
`findFirst` zonder `orderBy` op `:295-298`) — maar `resolveDeclaredMarks` doet exact dezelfde
opzoeking zélf wanneer `knownGln` ontbreekt:

```
const row = await prisma.artworkImport.findFirst({
  where: { gtin, gln: { not: null } },
  select: { gln: true },
});
```
(`t3777-declarations.ts:620-625`, zonder `orderBy`)

`VERIFIED`: van de vijf aanroepers geeft alléén de indexbouwer een gln mee
(`resolveDeclaredMarks(gtin, gln)`, `build-keurmerk-index.ts:458`). De andere vier niet. Voor een
GTIN met meer dan één gln vormt de terugval daar dus een andere sleutel dan waarmee geoogst is, en
mist de opzoeking stilzwijgend. Het gevolg is fail-open (geen terugval, oud gedrag), dus niet
gevaarlijk — maar "beide zijn nu niet aan de orde" is onjuist en hoort gecorrigeerd.

**M2 — AC10's getal van 204 is niet te meten. — medium**

AC10 (r. 240-244) vraagt "producten met reden `lege-declaratie` uit de momentopname: **204**".
`VERIFIED`: de indexbouwer telt één `lege-declaratie`-emmer (`emptyReasonCounts()`,
`build-keurmerk-index.ts:338-350`), en de spec stelt zelf vast dat er al **429** producten met een
lege declaratie langs de XML-route komen (r. 270-271). De teller wordt dus 633, niet 204, en de
twee bronnen zijn niet te scheiden. AC8 laat alleen de teller van `uit-momentopname` afdrukken
(r. 218-219), dus het getal 204 heeft geen instrument. Kies: een eigen reden voor de lege
momentopname-treffer, of schrap de rij uit AC10.

**M3 — AC10 is bij de standaardinstellingen niet uitvoerbaar. — medium**

`VERIFIED`: `getIndexLimit()` staat standaard op **500** (`build-keurmerk-index.ts:261-264`), en
poortregel 7d blokkeert een run waarin `universeSize < universeTotal`. Het universum is ~1863 GTINs
(de 23,7% uit AC6 is 442/1863). Een droogloop die de 238 kan aantonen vraagt dus
`KEURMERK_INDEX_LIMIT` op minstens het universumtotaal; de spec noemt geen waarde en geen
voorwaarde. Zonder die instructie meet AC10 een kwart van de populatie en concludeert dev een
afwijking van 75%.

**M4 — De repo-eigen opmaakstap maakt het generatorbestand alsnog kapot. — medium**

`VERIFIED, eigen meting`: er staat **geen** prettier-configuratie in de repo-root
(`.prettierrc*`/`prettier.config*` ontbreken; alleen `apps/web/.prettierrc.json` bestaat).
`prettier.resolveConfig(OUT_PATH)` levert daarom `{}` — dat heb ik afgedrukt — en de generator vult
zelf `singleQuote: true, printWidth: 100` in (`harvest-tradeitem-snapshot.ts:270-280`). Het
root-script `"format": "prettier --write \"**/*.{ts,tsx,…}\""` (`package.json:27`) draait echter
zónder die opties: `npx prettier` op het gecommitte bestand levert **2863 diff-regels**
(dubbele aanhalingstekens, printWidth 80). Wie één keer `npm run format` draait, herschrijft het
"GEGENEREERD BESTAND" volledig en de volgende oogst geeft weer een diff over 442 regels.
`VERIFIED`: CI redt dit niet — `.github/workflows/ci-cd.yml:72-73` draait `pnpm lint`, geen
`prettier --check`. Zet de opties in een echte configuratie voor `apps/api`, of laat de generator
de root-standaard volgen.

**M5 — De `--harvested-at`-vlag is niet gemaakt; een hertelling blijft onvergelijkbaar. — medium**

`VERIFIED`: `const harvestedAt = new Date().toISOString().slice(0, 10);`
(`harvest-tradeitem-snapshot.ts:375`). Punt 11 van de v4-lijst vroeg naast de opmaak ook een vlag om
een hertelling byte-voor-byte te kunnen vergelijken; alleen de opmaakhelft is gedaan. Ik kon de
idempotentie alleen bewijzen door de datum zelf te fixeren.

**M6 — Regeneratie vraagt sinds de M11-reparatie ook een gegenereerde Prisma-client. — medium**

`VERIFIED`: het oogstscript importeert `catalogEnvTag` uit `../src/services/t3777-declarations`
(`harvest-tradeitem-snapshot.ts:44`), en dat bestand importeert `prisma from '../core/db'`
(`t3777-declarations.ts:42`), waar op moduleniveau `new PrismaClient()` staat (`src/core/db.ts:3`).
Het script trekt daarmee de hele dienstlaag (queue, detection-flow) zijn proces in en heeft een
gegenereerde client nodig. De spec somt op r. 100-102 en in AC8 alleen `mongodb` en `tsx` op. Het
botst bovendien met de framing van het script zelf: "buiten de applicatie om" (r. 227). Neem de
zeven regels van `catalogEnvTag` over in het script, of vul de vereistenlijst aan.

**M7 — Dat `uit-momentopname` géén `ok` mag zijn, is dragend en staat nergens. — medium**

`VERIFIED`: `bootstrap-run.ts:451` — `if (decl.reason !== 'ok' || !decl.marks.some(…)) continue;`.
Die guard bepaalt welke GTINs de klasse-zoektocht in gaan die referenties oplevert. Zou een
ontwikkelaar de terugval als reden `ok` teruggeven — een verdedigbare lezing, want de marks zijn
echt — dan gaan de 238 bevroren producten daar meteen naar binnen. Besluit 2 hangt dus aan een
naamkeuze die de spec nergens aan die guard koppelt. Leg het expliciet vast, met een toets.

**M8 — De 238 zijn niet gegarandeerd allemaal bereikbaar via de indexbouwer. — medium**

`INFERENCE`: het universum is "distinct (gln, gtin) uit `artwork_imports` waar gln gevuld is"
(`build-keurmerk-index.ts:266-267`). De 442 sleutels komen uit de acceptatie-cache van een eerdere
indexrun, dus ze zouden er alle in moeten zitten — maar dat is een aanname, geen meting: ik heb de
acceptatie-Redis en `artwork_imports` niet gelezen. `VERIFIED` wél: de 442 sleutels bevatten **442
unieke GTINs** (eigen telling), dus er is geen GTIN die twee sleutels claimt en de vertaling
"442 sleutels = 442 producten" in AC10 klopt.

**M9 — Opnieuw code gecommit vóór de review die hem moest goedkeuren. — medium**

`VERIFIED`: `4670d80` (19 aug 14:48) wijzigde behalve de spec ook
`apps/api/scripts/harvest-tradeitem-snapshot.ts` (+77), de toetsen (+104),
`apps/api/src/services/t3777-declarations.ts` (twee exports) en het momentopname-bestand. De
spec-regel 3 luidt nog steeds "wacht op her-review", en de "Volgorde-afwijking"-notitie op r. 117-120
noemt alleen `c7e3fa5`. Twee rondes op rij is geen uitglijder meer maar een patroon; de notitie
hoort bijgewerkt.

**M10 — De tekensetcontrole dekt de codes, niet de sleutels. — medium**

`VERIFIED`: `SAFE_CODE` wordt toegepast op `code` (`harvest-tradeitem-snapshot.ts:116-121`), maar
`renderSnapshotModule` interpoleert óók `id` (`:212`, `:216`), `harvestedAt` (`:246`) en
`result.targetMarket` (`:248`) ongefilterd in enkele aanhalingstekens. `id` komt uit
`parts[2]-parts[3]-parts[4]` van een Redis-sleutel en wordt nergens op vorm gecontroleerd vóór het
renderen. Vandaag zijn alle 442 sleutels `^\d+-\d+-\d+$` (eigen telling), maar de generator dwingt
dat niet af — dezelfde redenering die L5 opleverde.

---

## 5. Lows

- **L1 — `ttlForReason` staat op `:532-534`, de spec zegt `:531-534`.** `VERIFIED`: `:531` is een
  lege regel; `:530` is `const TRANSIENT_CACHE_TTL_S = 300;`. Cosmetisch, maar dit is het enige
  regelnummer in versie 5 dat niet exact klopt.
- **L2 — `emptyReasonCounts()` sluit op `:350`, de spec zegt `:338-349`.** `VERIFIED`: `:349` is de
  laatste sleutel van het `Record`, `:350` de sluitende accolade van de functie.
- **L3 — De vijfde rij van de AC6-tabel (r. 189) draagt geen pad**, terwijl de vier rijen erboven
  `apps/api/src/…` wel volledig schrijven. Rest van L7 uit v4.
- **L4 — AC8 laat de leeftijdsgrens als keuze open** ("Kies een grens — voorstel: 180 dagen",
  r. 220-221). Een acceptatiecriterium dat de ontwikkelaar de drempel laat kiezen is niet toetsbaar;
  noem het getal.
- **L5 — `mapDeclarationReason` neemt `string`, geen `DeclarationReason`.** `VERIFIED`:
  `build-keurmerk-index.ts:362`. De waarschuwing in AC6 klopt dus nog sterker dan hij zelf zegt: er
  is geen enkele typecontrole die de nieuwe reden hier afdwingt. `CollectReason` en `ReasonCounts`
  breken wél de compilatie, dus twee van de zes plekken zijn compilerbewaakt en vier niet.

---

## 6. De code uit `c7e3fa5` en `4670d80` — eigen metingen

`VERIFIED, volledige doorloop van alle 442 sleutels` (eigen telscript, geen steekproef). Dit is een
zesde onafhankelijke telling en hij komt op dezelfde getallen:

| grootheid | spec/meta belooft | gemeten |
|---|---|---|
| sleutels | 442 | **442** (442 uniek, 442 unieke GTINs) |
| sleutels met keurmerk | 238 | **238** |
| lege lijsten | 204 | **204** |
| code-instanties | 475 | **475** |
| unieke `(fieldType, code)`-paren | 52 | **52** |
| `PackagingMarkedLabelAccreditationCode` | 292 | **292** |
| `DietTypeCode` | 89 | **89** |
| `NutritionalScore` | 61 | **61** |
| `EU_consumerUsageLabelCodeList` | 33 | **33** |
| `AdditionalPackagingMarkingsCode` | 0 | **0** |
| doelmarkt | 528 | **528**, één waarde over alle 442 |

De vier gevraagde reparaties, elk apart getoetst:

| reparatie | oordeel | bewijs |
|---|---|---|
| ontdubbelen van sleutels in `harvest()` | **werkt** | `:160`, `[...new Set(...)]` vóór `fetchDocuments`; de tellers lopen over de ontdubbelde lijst (`:169-181`) |
| omgevingsfilter bij het scannen | **werkt, dubbel gesloten** | `:330` (`MATCH marks:${envTag}:*`) én `:352` (`parts[1] !== envTag` → overslaan) |
| codetekenset-controle | **werkt voor codes** | `:63` + `:116-121`, harde `throw` mét de sleutel erbij. Sleutels zelf niet gedekt — M10 |
| idempotentie van de generator | **werkt** | eigen hergeneratie via `renderSnapshotModule` + `formatGenerated` op de inhoud van het gecommitte bestand: **identiek, 0 diff-regels**. Enige variabele blijft `harvestedAt` — M5 |
| toetsen gepind op `MARK_FIELDS` | **werkt** | `…test.ts:189-195` bouwt de verwachting uit `MARK_FIELDS` + `CONSUMER_USAGE_FIELD_TYPE` en vergelijkt met `GDSN_TO_FIELD_TYPE`; de aantallen staan als `GEMETEN`-literalen (`:40-49`). Beide symbolen zijn nu geëxporteerd (`t3777-declarations.ts:420`, `:434`) |

`VERIFIED`: `npx vitest run src/__tests__/services/tradeitem-declaration-snapshot.test.ts` → **17
toetsen groen** (46 ms). Het aantal in de spec (r. 110) klopt.

`VERIFIED`: `apps/api/tsconfig.json` sluit `**/__tests__/**` uit, dus de import van het
`scripts/`-bestand in de toets valt buiten de bouw en botst niet met `rootDir: "./src"`. Het
momentopname-bestand valt wél binnen `include: ["src/**/*"]` en komt dus in `dist` — `INFERENCE`,
niet met een echte bouw bevestigd.

---

## 7. Alle `bestand:regel`-verwijzingen in de spec

| verwijzing | regel in de spec | oordeel |
|---|---|---|
| `t3777-declarations.ts:293-299` — `findFirst` zonder `orderBy` | 131-132 | **KLOPT** (`resolveGln` op `:293`, de query `:295-298`) |
| `t3777-declarations.ts:420-425` — `MARK_FIELDS` | 161 | **KLOPT** |
| `t3777-declarations.ts:434` — `CONSUMER_USAGE_FIELD_TYPE` | 161 | **KLOPT** |
| `t3777-declarations.ts:48-55` — `DeclarationReason` | 185 | **KLOPT** |
| `build-keurmerk-index.ts:325-334` — `CollectReason` | 186 | **KLOPT** |
| `build-keurmerk-index.ts:338-349` — `emptyReasonCounts()` | 187 | **BIJNA** — sluit op `:350` (L2) |
| `build-keurmerk-index.ts:484-486` — voortgangsregel | 189 | **KLOPT** |
| `build-keurmerk-index.ts:630-636` — samenvattingsregel | 189 | **KLOPT** |
| `build-keurmerk-index.ts:546` — `const technical = …` | 178 | **KLOPT**, letterlijk |
| `t3777-declarations.ts:531-534` — `ttlForReason` | 200 | **FOUT, cosmetisch** — `:532-534` (L1) |
| `t3777-declarations.ts:87` — `T3777_CACHE_TTL_S` default `86400` | 201 | **KLOPT** |
| `t3777-declarations.ts:642` — `marksCacheRead` | 202 | **KLOPT** |
| `pipeline/detection-flow.ts:250` — de detectie-worker | 210 | **KLOPT** |
| `t3777-declarations.ts:521` / `:112` — cachesleutels | 264 | **KLOPT**, beide |
| `t3777-declarations.ts:86` — `T3777_TARGET_MARKET` default `'528'` | 231 | **KLOPT** |
| `backfill-gln-from-tradeitems.ts:143` + `:146-159` | 250-251 | **KLOPT**, beide |
| `Dockerfile:57-58` — `src/` en `prisma/`, niet `scripts/` | 113, 293 | **KLOPT** — `:57` `COPY apps/api/src/`, `:58` `COPY apps/api/prisma/`; geen enkele `COPY` raakt `apps/api/scripts/` |

Eén cosmetische misser (L1) en één afkapping (L2) op zeventien verwijzingen. Versie 4 had er drie
fout; dit is een duidelijke verbetering.

---

## 8. Wat moet wijzigen vóór dev

1. **Zet de terugval aan de aanroepkant, niet in de gedeelde dienst** (H1). `resolveDeclaredMarks`
   heeft vijf aanroepers; via `verify-flow.ts:423` → `runFlywheelHooks` → `nominateFromKruischeck`
   kunnen de 61 Nutri-Score-producten alsnog referentiekandidaten worden, en
   `build-nutriscore-declared-map.ts:256` schrijft ze naar MinIO. Een parameter op de aanroep of een
   aparte functie voor de indexbouwer; AC1 zegt al "alleen bij de indexbouwer" en moet dat ook
   afdwingen. Leg het vast met een toets die bewijst dat de andere aanroepers de momentopname niet
   zien.
2. **Beslis wat er met de cache gebeurt** (H2). Wordt de terugvaluitkomst gecachet, dan vindt
   `harvest-tradeitem-snapshot.ts:349` de 442 sleutels nooit meer terug en is AC8's regeneratie —
   en de leeftijdsgrens van AC8 — een dode letter. Óf niet cachen, óf het oogstscript zijn sleutels
   uit `TRADEITEM_SNAPSHOT` laten halen.
3. **Voeg de zesde plek toe aan AC6** (H3): `apps/web/src/components/review/MobileReviewDeck.tsx:417`
   gate op `reason === 'ok'` en verbergt de declaratie-prior voor precies de 238 producten van deze
   story.
4. **Corrigeer de claim dat de gln-zorg vervallen is** (M1): `resolveDeclaredMarks:620-625` doet
   dezelfde `findFirst` zonder `orderBy`, en vier van de vijf aanroepers geven geen gln mee.
5. **Repareer AC10** (M2, M3): het getal 204 heeft geen teller zolang het bij de bestaande 429 op
   één hoop valt, en de meting vraagt `KEURMERK_INDEX_LIMIT` ≥ universumtotaal (standaard 500,
   `build-keurmerk-index.ts:261-264`) omdat poortregel 7d een afgekapte run blokkeert.
6. **Leg de opmaak van het gegenereerde bestand vast in een configuratie** (M4). Zonder een
   prettier-configuratie voor `apps/api` herschrijft `npm run format` (`package.json:27`) het bestand
   in één klap — 2863 diff-regels.
7. **Leg vast dat `uit-momentopname` nooit `ok` mag zijn** (M7), met de reden erbij:
   `bootstrap-run.ts:451` laat alleen `ok` de klasse-zoektocht in.
8. **Vul de vereisten voor regeneratie aan** (M6): naast `mongodb` en `tsx` ook een gegenereerde
   Prisma-client, omdat het script sinds de omgevingsfilter-reparatie `t3777-declarations` importeert.
9. **Maak `--harvested-at`** (M5), zodat een hertelling byte-voor-byte vergelijkbaar is.
10. **Dwing de sleutelvorm af in de generator** (M10), net als de codes: `id`, `harvestedAt` en
    `targetMarket` gaan ongefilterd in enkele aanhalingstekens.
11. **Werk de volgorde-notitie bij** (M9): `4670d80` landde opnieuw code vóór deze review.
12. **Kleine correcties**: `:531-534` → `:532-534` (L1), `:338-349` → `:338-350` (L2), het pad in de
    vijfde AC6-rij (L3), een getal in plaats van een voorstel voor de leeftijdsgrens (L4).

---

## 9. Wat NIET geverifieerd is

- **Of de 442 sleutels allemaal in het GTIN-universum van de indexbouwer zitten.** `INFERENCE` uit
  de herkomst (ze komen uit de `marks:`-cache van een eerdere indexrun). Ik heb de acceptatie-Redis
  noch `artwork_imports` gelezen.
- **Of de 442 documenten op productie vandaag nog dezelfde declaraties dragen.** Geen verbinding met
  de productie-MongoDB gemaakt. Alle getallen in §6 zijn gemeten op het **bestand**.
- **De cacheverdeling (848 / 442 / 429 / 144)** en de bewering "3 van de 429 declareren iets" en
  "0 van de 144" — overgenomen uit eerdere reviews, niet zelf gemeten.
- **De 2-van-100-afwijking tussen database en XML** — overgenomen. Wel `VERIFIED` dat
  `RAINFOREST_ALLIANCE_PEOPLE_NATURE` in het geoogste bestand voorkomt.
- **"Volledige herbouw geeft +29 producten, +1 code"** — de spec markeert dat zelf als `INFERENCE`;
  niet nagemeten.
- **Of de containerbouw het bestand in `dist/` zet** (AC12) — geen echte bouw en geen container.
  `INFERENCE` uit `tsconfig.json` (`include: ["src/**/*"]`, `exclude: ["**/__tests__/**"]`) en
  `Dockerfile:84`.
- **Of de acceptatie-omgeving de nieuwe code draait.** Niet gekeken.
- **Met welk account de oogst van 19 augustus is uitgevoerd.** Het story-record noemt het niet.
- **Er is nergens iets geschreven buiten dit reviewbestand.** Alleen gelezen, plus
  `npx vitest run` op één toetsbestand, `npx prettier` (naar de scratchpad, niet naar de repository)
  en een eigen tel-/hergeneratiescript in de scratchpad. Geen database, geen container, geen Redis,
  geen netwerk naar productie.

---

## Change Log

- 2026-08-19: Her-review op versie 5 (besluit 2: de geoogste gegevens gaan uitsluitend naar de
  beoordeelwachtrij). Verdict FAIL (3 high / 9 medium / 5 low). Van de 24 bevindingen uit v4 zijn er
  20 verwerkt, 1 terecht vervallen (M8), 2 niet vervallen maar verschoven (H2 → H1-nieuw, M5 →
  M1-nieuw) en 1 bewust open gelaten met reden (L6, `versions.md`). Alle vier de codereparaties zijn
  nagemeten en werken, inclusief de idempotentie van de generator (0 diff-regels). De drie highs zijn
  nieuw: `resolveDeclaredMarks` heeft vijf aanroepers in plaats van één, de terugvaluitkomst wordt
  gecachet en maakt het oogstscript blind voor zijn eigen bron, en de nieuwe redencode zet de
  declaratie-prior in het beoordeelscherm uit.
