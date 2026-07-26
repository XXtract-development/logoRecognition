# Adversariële CODE-review — Story 19.16 (indexbouwer volledige corpus)

```yaml
reviewed_commit: 46ddb93
branch: epic/19-16-indexbouwer
base: origin/acc
verdict: FAIL
severity_count:
  critical: 0
  high: 3
  medium: 7
  low: 7
scope: 4 code/test-bestanden + story + versions.md
```

Deze review toetst de CODE, niet de story-tekst of het commit-bericht. Alle
verwijzingen zijn geverifieerd tegen de bronbestanden in de worktree.

## Zelf uitgevoerde verificatie

| Actie | Uitkomst |
|---|---|
| `npx tsc --noEmit` (apps/api) | 0 fouten |
| nieuwe suite + 19.3-suite + `t3777-declarations.test.ts` | 56 passed / 0 failed |
| `flywheel-bootstrap-run.test.ts` + `verify-flow.test.ts` (AC10-paden) | 53 passed / 0 failed |
| `flywheel-control-cohort.atdd.test.ts` geïsoleerd | 21 passed / 0 failed |
| `grep -E "429\|backoff\|retry\|exponent"` in beide gewijzigde services/scripts | **0 treffers** |

De claim in het commit-bericht dat de ene falende test een pre-existing flake is,
is **plausibel**: `flywheel-control-cohort.atdd.test.ts` importeert niets uit de
gewijzigde modules op een tijdgevoelige manier (ioredis/Prisma zijn globaal
gemockt in `setup.ts`), de timeout is een 5000ms-limiet, en de suite slaagt hier
geïsoleerd 21/21. Geen aanwijzing voor een regressie.

---

## Bevindingen

### High

**H1 — `apps/api/src/services/pipeline/queue.ts:101-114` + `apps/api/src/scripts/build-keurmerk-index.ts:358-372,682-688` — de hang die AC3 moet wegnemen kan terugkeren doordat een niet-geannuleerde race-verliezer ná `closeRedisConnection()` een NIEUWE Redis-verbinding opent — high**

`withBudget` annuleert de verliezer niet; die loopt door. `closeRedisConnection()`
zet `redisConnection = null` (regel 113). Een verliezer die daarna alsnog
`marksCacheRead`/`marksCacheWrite` bereikt, roept `getRedisConnection()` aan, dat
door die `null` een **verse** ioredis-verbinding aanmaakt — een nieuw, nooit meer
gesloten handle dat de event-loop openhoudt. Het pad is concreet bereikbaar: een
verliezer die op een Redis-commando hing krijgt bij `disconnect()` een
`Connection is closed`-rejectie, `marksCacheRead` vangt die en retourneert `null`
(t3777-declarations.ts:285-291), waarna `resolveDeclaredMarks` gewoon doorgaat
naar `fetchTradeItemXml` en eindigt op `marksCacheWrite` → `getRedisConnection()`.
Netto: script hangt alsnog tot een externe `kill`, precies wat AC3 verbiedt.

Wat moet wijzigen: maak het sluiten *definitief*. Bijvoorbeeld een
module-level `let closed = false` in `queue.ts`; `closeRedisConnection()` zet die,
en `getRedisConnection()` weigert daarna te heropenen (throw of een no-op-stub).
Alternatief/aanvullend: geef `collectGtinData` een `AbortController` per GTIN mee
zodat verliezers écht stoppen.

**H2 — `apps/api/src/scripts/build-keurmerk-index.ts:259-285, 606-642` — `KEURMERK_INDEX_LIMIT` kapt het universum stil af en de kwaliteitspoort merkt dat niet; de default (500) schrijft een index over ~27% van het corpus weg met exitcode 0 — high**

`loadGtinUniverse` haalt *alle* rijen op en `break`t bij `limit` (regel 282). Het
werkelijke aantal beschikbare GTINs is dus bekend, maar wordt weggegooid.
`evaluateGate` krijgt `universeSize: universe.length` — dat is de **afgekapte**
omvang. Gevolg:

- `reasons['niet-verwerkt']` blijft 0 → 7d ziet een "volledige" run;
- 7c passeert, want 500 GTINs leveren volgens de story-metingen ruim meer dan de
  32 sleutels van de bestaande index;
- exitcode 0, index overschreven met een fractie van het corpus.

Dit is exact dezelfde klasse gat als waarvoor 7d in reviewronde 4 is toegevoegd
(afgekapte run die groter lijkt dan de kleine bestaande index) — alleen langs de
limiet in plaats van de deadline. Het is bovendien de meest waarschijnlijke
operator-fout: AC1 eist expliciet `KEURMERK_INDEX_LIMIT ≥ 1862`, maar niets in de
code dwingt of controleert dat.

Wat moet wijzigen: `loadGtinUniverse` geeft ook het totaal aantal beschikbare
distinct-GTINs terug; `evaluateGate` krijgt dat als extra invoer en blokkeert
onder 7d wanneer `universeSize < totalAvailable` (tenzij `--allow-partial`).

**H3 — `apps/api/src/scripts/build-keurmerk-index.ts` / `t3777-declarations.ts` — de door AC9 verplicht gestelde exponentiële backoff (max 3 pogingen) bij 429/5xx ontbreekt volledig — high**

AC9: *"when upstream een 429 of 5xx geeft, then wordt met exponentiële backoff
(max 3 pogingen) hersteld voordat de GTIN als fout telt"*. In de code is er geen
enkele retry: `fetchTradeItemXml` mapt élke status ≥ 400 (incl. 429) in één keer
op `api-fout` (t3777-declarations.ts:149-152). `grep -E "429|backoff|retry|exponent"`
over beide gewijzigde bestanden geeft 0 treffers. Task 3 in de story is
afgevinkt met de tekst "+ backoff bij 429/5xx" — dat is feitelijk onjuist en
maakt het story-dossier misleidend.

Dit is niet cosmetisch: zonder retry telt elke tijdelijke 429/503 direct mee in
de 7b-foutratio (drempel 5%) én verhoogt hij de kans dat de poort een verder
prima run blokkeert.

Wat moet wijzigen: backoff implementeren (bv. in `fetchTradeItemXml`, met respect
voor het per-GTIN-budget uit AC2), óf AC9 formeel amenderen met onderbouwing —
maar niet de taak afvinken zonder implementatie.

### Medium

**M1 — `build-keurmerk-index.ts:506-512` — de errorRate-noemer is `universeSize` en niet het aantal daadwerkelijk verwerkte GTINs; bij een afgekapte run verwatert 7b tot betekenisloos — medium**

```ts
const technical = reasons['api-fout'] + reasons.timeout;
const errorRate = universeSize > 0 ? technical / universeSize : 0;
```

Sloeg de deadline toe na 100 van 1862 GTINs en waren daarvan er 90 technisch
fout (90%!), dan is `errorRate` = 90/1862 = **4,8%** → onder de 5%-drempel → 7b
zegt "gezond". 7d vangt dat vandaag nog af, maar zodra iemand `--allow-partial`
gebruikt (de vlag bestaat juist om die situatie te forceren) schrijft de run een
aantoonbaar kapotte index weg. De twee poorten dekken elkaars gat dus niet: 7b
moet zelfstandig kloppen.

Wat moet wijzigen: `errorRate = technical / (universeSize - reasons['niet-verwerkt'])`
(met deling-door-nul-guard), en de gerapporteerde noemer expliciet in de
poort-uitvoer benoemen.

**M2 — `apps/api/src/__tests__/scripts/build-keurmerk-index-19-16.test.ts:20-32` — de twee door AC2 *verplicht gestelde* bewijstests ontbreken; de body-read-fix (Task 2) heeft nul testdekking — medium**

AC2 sluit af met: *"**Bewijs vereist:** een test met een stub die ná de headers
stilvalt, én een test met een niet-antwoordende Redis."* Geen van beide bestaat.
De nieuwe suite mockt `../../services/t3777-declarations` en
`../../services/pipeline/queue` in hun geheel weg, waardoor de daadwerkelijke
ingreep in `fetchTradeItemXml` (timer verplaatst zodat hij `response.text()` dekt)
door **geen enkele test** wordt uitgevoerd. De test op regel 56-72 bewijst alleen
dat `Promise.race` werkt — een generieke eigenschap van `withBudget`, niet van de
gerepareerde transportlaag.

Wat moet wijzigen: een test in `t3777-declarations.test.ts` met een `fetch`-stub
die een `Response` teruggeeft waarvan de body-stream nooit eindigt, en asserteren
dat `resolveDeclaredMarks` binnen ~`FETCH_TIMEOUT_MS` terugkeert met `api-fout`.
Idem een test met een `get`/`setex` die nooit resolvet, om het budget aan te tonen.

**M3 — `build-keurmerk-index-19-16.test.ts:22` — de test mockt `catalogEnvTag` met een eigen implementatie; AC8 (door de story "HARDE VOORWAARDE" genoemd) heeft daarmee nul dekking op de echte functie — medium**

```ts
catalogEnvTag: (base: string) => (base.includes('stage') ? 'stage' : 'acc'),
```

De test op regel 243-251 asserteert vervolgens dat de bronvermelding "stage"
wordt — dat toetst de mock, niet de code. De echte `catalogEnvTag`
(t3777-declarations.ts:434-443) wordt door geen enkele test aangeroepen. Even
ongedekt: `ttlForReason` (AC4) en de env-dimensie in `marksCacheKey`
(t3777-declarations.ts:446-448). De bestaande test die het dichtst in de buurt
komt (t3777-declarations.test.ts:340) asserteert alleen `startsWith('marks:')` en
zou óók slagen als het env-segment volledig ontbrak.

Wat moet wijzigen: unit-tests op de echte `catalogEnvTag` (stage/acc/localhost/
onbruikbare URL) en een test die de volledige verwachte cachesleutel
`marks:stage:{gln}:{gtin}:528` pint, plus een test die aantoont dat een
`api-fout` met 300s en een `ok` met 86400s wordt weggeschreven.

**M4 — `build-keurmerk-index.ts:293-296, 410-421` — de combinatie 30s per-GTIN-budget × concurrency 3 maakt de 20-minutendeadline onhaalbaar zodra er ook maar enkele procenten timeouts zijn; er is geen mitigatie — medium**

Rekensom met de eigen cijfers van de story (200 GTINs ≈ 5 min ⇒ ~1,5s/GTIN):
1862 × 1,5s ÷ 3 ≈ **15,5 min** — dat past net, met ~4,5 min marge en een koude
cache. Maar de chunkduur is het **maximum** van de drie taken: elke chunk met één
time-out kost 30s in plaats van 1,5s. Bij 5% time-outs (= precies de 7b-drempel
die de code als "nog gezond" beschouwt) verspreid over ~93 chunks is dat
93 × 30s ≈ **+46 min**. Resultaat: deadline geraakt → 7d blokkeert → er wordt
niets weggeschreven, terwijl de run technisch "binnen de norm" was. Het
primaire doel van de story (index over de volledige corpus) is dan onbereikbaar
zonder handmatig `--allow-partial`, dat op zijn beurt M1 opent.

De deadline zelf wordt bovendien alleen per chunk gecheckt (regel 411, vóór het
starten van een chunk). Omdat elke taak in `withBudget` zit is een chunk begrensd
op `gtinTimeoutMs`, dus de overschrijding is maximaal ~30s (20:30 i.p.v. 20:00).
Dat is verdedigbaar, maar het is niet de "harde grens" die AC9 belooft en het is
nergens gedocumenteerd.

Wat moet wijzigen: minimaal het resterende tijdsbudget meewegen in het per-GTIN-
budget (`min(gtinTimeoutMs, deadline − now)`), en de gekozen defaults onderbouwen
met een gemeten reden-verdeling (Task 10 staat nog open). Overweeg een lager
default `KEURMERK_INDEX_GTIN_TIMEOUT_MS` (bv. 10-15s, gelijk aan de fetch-timeout).

**M5 — AC10 is niet aangetoond zoals de AC eist: er is geen enkele nieuwe of aangepaste test op de twee live paden — medium**

AC10: *"then blijven beide paden functioneel ongewijzigd — **aangetoond met tests
op de bestaande suites**, niet alleen op het script."* De diff bevat geen enkele
wijziging in `flywheel-bootstrap-run.test.ts`, `artwork-pipeline`-tests of
`t3777-declarations.test.ts`. Ik heb die suites zelf groen gedraaid (53 + 26
tests) en geverifieerd dat alle live call-sites één-argumentig blijven
(`artwork-pipeline.ts:783`, `bootstrap-run.ts:450`, en — níét in de story genoemd
— `verify-flow.ts:423` en `scripts/build-nutriscore-declared-map.ts:256`), dus
het *risico* is laag. Maar "de bestaande tests waren toevallig al blind voor de
sleutelvorm" is geen aangetoonde regressiepoort. Task 9 vermeldt expliciet
"AC10 (review-prior + bootstrap-guard ongewijzigd)"-tests die niet bestaan.

Wat moet wijzigen: één test per live pad die vastlegt dat de env-scoped sleutel
gelezen/geschreven wordt en dat de guard/prior hetzelfde resultaat oplevert als
vóór 19.16.

**M6 — `t3777-declarations.ts:117-183` — de timer dekt nu headers ÉN body (10s totaal) op de drie LIVE paden; dat is een onbedoelde gedragsverstrakking zonder meting of test — medium**

De fix is inhoudelijk juist en `clearTimeout` staat op álle returnpaden correct
(expliciet in de fetch-`catch` op regel 132, verder via de `finally` op regel
181-183; er is geen ontsnappingspad). De abort dekt aantoonbaar ook
`response.text()`, want het aborten van de controller laat de body-stream falen —
dat wordt op regel 164-172 fail-safe opgevangen.

Het punt is de **budgetkrimp**: waar `FETCH_TIMEOUT_MS` voorheen alleen de
headers begrensde, moet nu de complete uitwisseling (tot 5 MiB, `MAX_RESPONSE_BYTES`)
binnen 10s passen — dat is ≥ 500 KB/s. Een grote GS1-XML op een trage verbinding
die eerder slaagde, levert nu `api-fout` op in de review-prior, de bootstrap-guard
(waar hij als **harde** guard werkt) en verify-flow. Geen meting, geen test, geen
afweging in de story.

Wat moet wijzigen: budgetten splitsen (aparte header- en body-deadline) of
`FETCH_TIMEOUT_MS` verhogen met onderbouwing op de gemeten XML-groottes.

**M7 — `t3777-declarations.ts:462-499` — AC4 eist "logt de run cache-hits/-misses"; er is geen enkele hit/miss-logregel — medium**

`marksCacheRead` logt alleen bij een Redis-fout. Er is geen log/teller voor hits
of misses, in de service noch in het script; de voortgangsregel (AC5) bevat ze
evenmin. Deze "then"-clausule van AC4 is dus niet ingelost, terwijl juist de
cache-effectiviteit bepaalt of de 20-minutendeadline (M4) haalbaar is bij een
tweede run.

Wat moet wijzigen: een hit/miss-teller in `collectGtinData` (of `debug`-logging in
`marksCacheRead`) en die meenemen in de voortgangsregel en het eindplan.

### Low

- `build-keurmerk-index.ts:498-500` — AC7a zegt "Bij ≥1 `api-key-ontbreekt` **stopt de run onmiddellijk**"; de code stopt niet, maar loopt het volledige universum af en blokkeert pas bij de poort. Functioneel veilig (elke GTIN keert direct terug), letterlijk niet-conform. — low
- `build-keurmerk-index.ts:366-369` — `withBudget` labelt een **rejection** als `timeout`. Een echte fout verschijnt daardoor als time-out in precies de reden-verdeling waarop de 7b-drempel gekalibreerd moet worden; de test op regel 84-89 omzeilt dat met een `timeout + api-fout >= 1`-som in plaats van een exacte reden. — low
- `t3777-declarations.ts:434-443` — `catalogEnvTag` neemt bij ≥3 labels blind `parts[1]`. Botsingen: IP-hosts (`10.0.0.5` → `0`, `10.0.1.5` → `0`), hosts die alleen op **poort** verschillen (`localhost:3001` vs `:3002` → beide `localhost`, `hostname` negeert de poort), en prod `catalog.xxtract.com` → tag `xxtract`. Binnen de letter van AC8 ("host-afgeleid"), maar dit is de enige bescherming tegen stage→acc-lek. — low
- `build-keurmerk-index.ts:611` — `main()` dupliceert de default-base `'https://catalog.acc.xxtract.com'` uit `readEnv()` (t3777-declarations.ts:69) en past de trailing-slash-normalisatie niet toe. Wijzigt die default, dan drift de bronvermelding/cachetag t.o.v. wat er werkelijk gefetcht wordt. — low
- `build-keurmerk-index.ts:545-559` — `downloadTrainingObject` geeft `null` bij zowel "bestaat niet" als een **leesfout**, dus een transiënte MinIO-hapering schakelt de krimpbeveiliging 7c stilzwijgend uit. Wordt gelogd (conform de story-randvoorwaarde), maar de twee gevallen zijn niet te onderscheiden. — low
- `build-keurmerk-index.ts:13-16` — de usage-docblock bovenaan noemt de nieuwe vlaggen `--allow-shrink` / `--allow-partial` en de nieuwe env-knoppen (`KEURMERK_INDEX_CONCURRENCY`, `_GTIN_TIMEOUT_MS`, `_MAX_RUNTIME_MS`, `_MAX_ERROR_RATE`, `_PROGRESS_EVERY`) niet. — low
- `build-keurmerk-index.ts:452-456` — de voortgangsregel toont 5 van de 8 redenen; `api-key-ontbreekt`, `gln-ontbreekt` en `niet-verwerkt` ontbreken, terwijl AC5 "de reden-verdeling tot dan toe" vraagt. Juist `api-key-ontbreekt` wil je binnen 25 GTINs zien in plaats van na 20 minuten. — low

### Wat er goed is (expliciet, om niet weg te poetsen)

- `withBudget` (358-372) wikkelt de **hele** per-GTIN-keten in één race (declaratie
  én mediaserver), niet alleen de catalog-call — dat dekt inderdaad body-read,
  Redis en Prisma, ongeacht waar het blijft hangen.
- `clearTimeout` is in `fetchTradeItemXml` op alle returnpaden correct; ik heb geen
  lek gevonden.
- Poortvolgorde 7d **vóór** 7c is bewust en juist gedaan (regels 514-535), met een
  test die precies het scenario uit reviewronde 4 vastlegt (test:209-229).
- De poort draait in **beide** modi; alleen de write hangt aan `dryRun` (628-666) —
  een droge run geeft dus hetzelfde verdict én dezelfde exitcode als de echte bouw.
- `process.exitCode` in plaats van `process.exit()` (656, 680) — conform AC3.
- `closeRedisConnection()` in `.finally()`, dus ook bij de vroege return van de
  geblokkeerde poort; `disconnect()` i.p.v. `quit()` conform AC3, idempotent.
- `declarationSource` is conditioneel gespreid (regel 217), zodat de output zonder
  bron **byte-identiek** blijft aan pre-19.16 — met test (253-256). De consument
  `flywheel/overview/coverage.ts` leest alleen `summary.perKey` en is tolerant voor
  het extra veld (geverifieerd).
- `knownGln` verwerkt een lege string correct: `knownGln ?? null` gevolgd door
  `if (!gln)` valt terug op de DB-lookup (t3777-declarations.ts:545-553).
- Geen debug-code, geen ongebruikte imports, geen dode code aangetroffen; `tsc`
  schoon; `versions.md` bijgewerkt in dezelfde commit.

---

## AC-audit AC1–AC10

| AC | Oordeel | Code-bewijs |
|---|---|---|
| **AC1** volledige corpus draait door | **deels** | Chunked loop `build-keurmerk-index.ts:410-458` doorloopt het universum en `printPlan` (561-589) print het plan. Maar: `loadGtinUniverse` kapt stil af op `KEURMERK_INDEX_LIMIT` (default 500, regel 282) zonder poortcontrole → **H2**; en de 20-min-haalbaarheid breekt bij enkele procenten time-outs → **M4**. Task 10 (echte volledige droge run) staat nog open, dus AC1 is empirisch niet aangetoond. |
| **AC2** per-GTIN totaalbudget | **deels** | `withBudget` (358-372) omvat de hele keten incl. mediaserver (423-439); `clearTimeout` correct op alle paden in `fetchTradeItemXml` (132, 181-183); abort dekt aantoonbaar `response.text()` (163-172). Maar verliezers worden niet geannuleerd → **H1**; de twee door de AC *verplichte* bewijstests ontbreken → **M2**. |
| **AC3** schone afsluiting + eenduidige exitcode | **deels** | `process.exitCode = 1` (656, 680) i.p.v. `process.exit()` ✓; `closeRedisConnection()` in `.finally()` (682-688) dus ook bij vroege return ✓; `disconnect()` i.p.v. `quit()` (queue.ts:104) ✓; droge run + deadline → 7d blokkeert → exit ≠ 0 ✓. Maar het proces kan alsnog blijven hangen door **H1**, en door niet-geannuleerde axios-verliezers (mediaserver 60s-timeout) kan de afsluiting tot een minuut opschuiven. |
| **AC4** juiste prefix + geen vergiftiging | **deels** | `marks:{env}:{gln}:{gtin}:{tm}` (446-448) ✓, `t3777:` blijft de aparte kruischeck ✓. `ttlForReason` (458-460) kort `api-fout` in tot 300s; timeouts, 5xx én 429 landen állemaal op `api-fout` (149-152, 130-139, 164-172), dus AC4's transiënte lijst is volledig gedekt ✓. `404-mogelijk-TM-mismatch` houdt 86400s — binnen de letter van de AC, maar wrang gegeven dat dit project 404's juist als omgevingsartefact meet (ACC 0/10). De clausule "logt cache-hits/-misses" is **niet** geïmplementeerd → **M7**. |
| **AC5** voortgang zichtbaar | **gedekt (kanttekening)** | 448-457: `verwerkt/totaal`, verstreken tijd, ETA, redenverdeling; via `process.stdout.write` (402) i.p.v. gebufferde `console.log`; getest (test:127-139). Kanttekening: 5 van 8 redenen (low) en `process.stdout.write` biedt geen harde flush-garantie op een pipe (wél directe queueing — voldoende voor het doel). |
| **AC6** geen regressie op 19.3-contracten | **gedekt** | `buildIndex` (162-229) doet nog steeds geen I/O en is een pure projectie; sleutelvorm `${fieldType}/${code}` ongewijzigd (144-146); `declarationSource` conditioneel gespreid → geen serialisatiebreuk (217, test:253-256); reden-tellingen blijven buiten de JSON (alleen `printPlan`); concurrency-invariantie getest (test:93-100, al vergelijkt die alleen gesorteerde GTIN-lijsten, niet de volledige `GtinData`); gln-doorgifte correct incl. lege-string-terugval (t3777:545-553), en `loadGtinUniverse` filtert lege gln al weg (278). |
| **AC7** kwaliteitspoort | **deels** | 7a (498-500), 7b (506-512), 7c (524-535), 7d (516-520) alle aanwezig, 7d bewust vóór 7c ✓, poort in beide modi ✓ (628-642), blokkade logt redenverdeling + vergelijking ✓ (573-580, 645-651), alle vier getest (test:142-241). Gaten: errorRate-noemer → **M1**; limiet-afkap ongedekt → **H2**; 7a stopt niet "onmiddellijk" (low). |
| **AC8** omgevingsscheiding van de cache | **deels** | `catalogEnvTag` (434-443) + `marksCacheKey` met env-segment (446-448) geïmplementeerd; oude sleutels worden per definitie niet meer gelezen en verlopen binnen de TTL — dat is veilig, want de gevolgen zijn een cache-miss + refetch, geen foute uitkomst. Maar: nul echte testdekking (de test mockt de functie) → **M3**; fragiele hostafleiding bij IP/poort/prod-host (low). |
| **AC9** belastingsgrens, netheid, globale deadline | **niet volledig** | Concurrency default 3 / harde max 8 ✓ (294), `KEURMERK_INDEX_MAX_RUNTIME_MS` default 20 min ✓ (295), gecontroleerde afkap met `niet-verwerkt` en doorgifte aan 7d ✓ (411-419), getest (test:108-125). **Ontbreekt volledig: de exponentiële backoff (max 3 pogingen) bij 429/5xx** → **H3**. Deadlinecheck is per chunk, overschrijding begrensd op ~30s (M4). Task 10a (Redis-voetafdruk) staat nog open. |
| **AC10** geen regressie op de live paden | **deels** | Alle live call-sites blijven één-argumentig en dus gedragsgelijk (`artwork-pipeline.ts:783`, `bootstrap-run.ts:450`, plus de níét in de AC genoemde `verify-flow.ts:423` en `build-nutriscore-declared-map.ts:256`); ik heb die suites groen gedraaid. Maar de AC eist *aangetoonde* tests; die zijn niet toegevoegd → **M5**, en de verstrakte body-timeout raakt deze paden ongetest → **M6**. |

---

## Verdict

**FAIL** — 3 high + 7 medium. De richting is goed en de kern (per-GTIN-budget,
poort met 7a-7d, schone afsluiting, bronvermelding) is degelijk en getest, maar
drie zaken blokkeren:

1. **H1** — de AC3-hang kan via een herrezen Redis-verbinding terugkeren.
2. **H2** — de kwaliteitspoort kent het verschil niet tussen "volledig corpus" en
   "afgekapt door de limiet"; met de default-limiet overschrijft een gedeeltelijke
   index de goede met exitcode 0.
3. **H3** — een expliciet AC-onderdeel (backoff op 429/5xx) is niet gebouwd terwijl
   de taak is afgevinkt.

Daarnaast moeten M1 (errorRate-noemer), M2/M3 (de door de AC's verplicht gestelde
tests op de transportlaag en op `catalogEnvTag`/TTL), M4 (deadline-haalbaarheid),
M5 (AC10-regressietests), M6 (verstrakte live-timeout) en M7 (cache-hit/miss-logging)
zijn geadresseerd voordat deze story naar `done` kan.
