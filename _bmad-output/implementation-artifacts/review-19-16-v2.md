# Adversariële HER-review — Story 19.16 v2 (Keurmerk-index over de volledige corpus)

reviewed_artifact: `_bmad-output/implementation-artifacts/19-16-indexbouwer-volledige-corpus.md` (v2, herschreven 2026-07-25, status ready-for-dev)
previous_review: `_bmad-output/implementation-artifacts/review-19-16.md` (verdict FAIL — 5 high / 7 medium / 4 low / 1 info)
reviewed_code: `apps/api/src/scripts/build-keurmerk-index.ts`, `apps/api/src/services/t3777-declarations.ts`, `apps/api/src/services/pipeline/queue.ts`, `apps/api/src/api/v1/artwork-pipeline.ts`, `apps/api/src/services/flywheel/bootstrap-run.ts`, `apps/api/src/services/flywheel/overview/coverage.ts`, `apps/ml-service/app/services/queue_harvest.py`, `apps/api/src/__tests__/scripts/build-keurmerk-index.test.ts`
reviewer: adversarial (code-geverifieerd, geen implementatie uitgevoerd)
datum: 2026-07-25

**VERDICT: FAIL** (2 high + 7 medium nieuwe bevindingen → story mag niet ongewijzigd naar dev)

severity_count (nieuw): critical 0 · high 2 · medium 7 · low 3 · info 1

Voortgang t.o.v. v1: **13 van 18 bevindingen opgelost**, 4 deels, 1 n.v.t.-opgelost-als-info. De herschrijving is substantieel en de diagnose is nu code-correct. De FAIL komt **niet** terug uit v1, maar uit **nieuwe gaten die de nieuwe AC7/AC8/AC9 zelf introduceren**.

---

## 1. Status van F1–F18 uit review-19-16.md

| # | Sev (v1) | Status in v2 | Bewijs uit v2 / code |
|---|---|---|---|
| F1 | high | **opgelost** | "Weerlegde hypothesen" §3 benoemt `marks:{gln}:{gtin}:{tm}` (`:409-412`) vs de kruischeck-prefix `t3777:` (`:93-95`); AC4 eist expliciet "`marks:*`-sleutels (**niet** `t3777:*`)". Code-geverifieerd: `marksCacheKey` = `marks:...` (r.410-411), `cacheKey` = `t3777:...` (r.93-94). |
| F2 | high | **opgelost** | "Weerlegde hypothesen" §1 + sectie "Werkelijke hang-kandidaten" noemen `response.text()` (`:155`) buiten `clearTimeout` (`:132-134`), ioredis `maxRetriesPerRequest: null` (queue.ts:81) en de per-GTIN `findFirst` (`:468-472`). AC2 vervangt de premisse door een **per-GTIN totaalbudget** met bewijseis (stub die na headers stilvalt + dode Redis). Alle vier lijnverwijzingen kloppen. |
| F3 | high | **opgelost, maar lek** — zie N1 | AC7 toegevoegd (`KEURMERK_INDEX_MAX_ERROR_RATE`, default 5%, niet-overschrijven + exitcode ≠ 0). Correcte premisse: `INDEX_OBJECT_KEY` is een constante (`:59`) en `writeIndex` (`:304-309`) schrijft altijd naar diezelfde sleutel — géén versionering, géén backup. De poort dekt echter niet alle faalredenen (N1). |
| F4 | high | **opgelost (tekstueel)** | AC4: "given een GTIN gaf een **transiënte** fout … dan NIET 86400s negatief gecached". Premisse klopt: `:492-499` cachet álle uitkomsten met dezelfde TTL, inclusief `api-fout`. Implementatie-impact op live callers is nieuw ongedekt (N5). |
| F5 | high | **opgelost, met ontsnappingsluik** — zie N6 | AC8 toegevoegd. Claim geverifieerd: `marksCacheKey` (`:410-412`) bevat gln/gtin/tm maar **geen** `baseUrl`/omgeving, terwijl `readEnv()` (`:69`) de base wél variabel maakt. Beide genoemde live lezers kloppen: `artwork-pipeline.ts:754` (`await resolveDeclaredMarks(gtin)` in `/artwork/declared-marks/:gtin`) en `bootstrap-run.ts:450` (`const decl = await resolveDeclaredMarks(gtin)`, harde guard op `decl.reason !== 'ok'`). |
| F6 | medium | **opgelost** | AC9: backoff op 429/5xx (max 3 pogingen) + "De limiet-env blijft bestaan — géén 'geen limiet'". Claim "nergens 429/backoff" geverifieerd: `grep 429` over `apps/api/src/services` + `src/scripts` = **0 treffers**; de wél gevonden `backoff`-treffers (queue.ts:50, training-flow.ts:78, workers.ts) zijn BullMQ-jobretries op eigen jobs, geen uitgaande HTTP-backoff. |
| F7 | medium | **opgelost, onderspecificeerd** — zie N2 | AC3: "**`process.exit()` mag NIET als afsluitmechanisme worden gebruikt**" + `closeRedisConnection()` naast `getRedisConnection()`. Code-check: die helper bestaat inderdaad niet (queue.ts:77 exporteert alleen `getRedisConnection`; enige `quit()` staat in `health.ts:169`). Maar `quit()` vs `disconnect()` is niet bepaald — beslissend in precies het scenario van AC2. |
| F8 | medium | **opgelost** | AC1 verwijst naar de wandkloklimiet van AC9; AC9 noemt 20 minuten; AC5 noemt interval (25 GTINs, env-instelbaar), velden (verwerkt/totaal, verstreken, ETA, reden-verdeling) en "direct geflusht". Aftekenbaar — zij het onhaalbaar in de foutmodus (N3). |
| F9 | medium | **opgelost in AC4, teruggekeerd in AC8** — zie N6 | AC4's "repareer **of** documenteer" is weg. AC8 sluit echter af met "Alternatief zonder codewijziging: vastleggen dat de stage-run op een aparte Redis/DB-index draait" — dezelfde "opschrijven telt als af"-constructie. |
| F10 | medium | **deels** | AC6 lost het conflict op ("reden-tellingen gaan naar **stdout/log, niet in de index-JSON**"). Het **plumbing**-deel niet: `GtinData` (`:78-85`) heeft geen `reason`, `collectGtinData` (`:282`) gooit `marksResult.reason` weg, en géén AC/Task draagt op dat veld toe te voegen — terwijl AC2 ("reden `timeout`"), AC5 (reden-verdeling) en AC7 (verdeling per reden) er alle drie op leunen. Task 8 noemt alleen exporteren/injecteerbaar maken. |
| F11 | medium | **opgelost (AC), niet in de Tasks** — zie N10 | AC6-bullet "gln-consistentie" met beide feiten correct: `loadGtinUniverse` (`:251-267`) dedupt op `gtin` alleen na `orderBy: {gtin:'asc'}` zonder tiebreak; `resolveDeclaredMarks` doet zijn eigen `findFirst` zonder `orderBy` (`:468-472`). Geen enkele Task 1-10 draagt deze wijziging op. |
| F12 | medium | **opgelost** | AC6-bullet: "de 13 bestaande tests dekken **uitsluitend pure helpers**… `collectGtinData`/`loadGtinUniverse` moeten geëxporteerd of injecteerbaar worden", + Task 8. Geverifieerd: de testfile importeert alleen `buildIndex, serializeIndex, indexKey, dedupSorted, UNIVERSE_CODE_COUNT, type GtinData`; `collectGtinData` (`:274`) is niet geëxporteerd. |
| F13 | medium | **opgelost** | Afbakening noemt nu `flywheel/overview/coverage.ts:120` en `queue_harvest.py:84` als consumenten en legt de 19.10-herbeoordeling (`HARVEST_TOP_N`, `HARVEST_EXCLUDE_CODES`) bij de vervolg-story. Beide regelverwijzingen kloppen (coverage.ts:120 = `downloadTrainingObject(INDEX_OBJECT_KEY)`; queue_harvest.py:84 = `VOLUME_INDEX_KEY = "flywheel-index/keurmerk-etiket-index.json"`). |
| F14 | low | **opgelost** (conform de review's eigen "optioneel") | Dev Notes low-bullet: eerste `/` (`build-keurmerk-index.ts:192`, `key.indexOf('/')`) vs `rsplit("/",1)` — "Harmoniseren of vastleggen dat zulke codes niet voorkomen". Code-check bevestigt `indexOf` (r.192) — en de code-comment op r.191 zegt zelfs ten onrechte "laatste '/'". |
| F15 | low | **opgelost** | AC6: "deterministisch **op `builtAt` na** (`:199` zet een live timestamp — byte-identiek is onhaalbaar)". |
| F16 | low | **opgelost** | Task 3 en AC6 citeren nu `artwork-pipeline.ts:404-413` i.p.v. `mediaserver-client.ts`. Inhoudelijk juist; regelnummer marginaal mis (N14). |
| F17 | low | **opgelost** | Elke keep-alive-claim is verdwenen; AC3/Task 4 wijzen uitsluitend de ioredis-singleton aan. |
| F18 | info | **opgelost** | Kop luidt nu "ACC-sessiemeting 2026-07-22 — motivatie, GEEN afgetekende nulmeting". Zie wel N12 (asymmetrische bewijsstandaard voor de nieuwe 3-GTIN-meting). |

**Telling:** opgelost 13 · deels 4 (F3, F5, F7, F10 — alle vier met een nieuwe bevinding gekoppeld) · niet opgelost 0 · F11 formeel opgelost maar zonder Task.

---

## 2. Toets van de nieuwe AC7 / AC8 / AC9 tegen de code

| Bewering | Verdict | Bewijs |
|---|---|---|
| AC7: "de bouw overschrijft altijd dezelfde vaste MinIO-sleutel" | **JUIST** | `INDEX_OBJECT_KEY = 'flywheel-index/keurmerk-etiket-index.json'` (`:59`, `export const`), enige schrijver `writeIndex` (`:304-309`) → `adapter.putObject(BUCKETS.TRAINING, INDEX_OBJECT_KEY, …)`. Geen timestamp/versie in het pad, geen backup vóór de write. |
| AC8: "de cachesleutel heeft geen omgevingsdimensie" | **JUIST** | `marksCacheKey(gln, gtin, tm)` = `` `marks:${gln}:${gtin}:${tm}` `` (`:410-411`); `baseUrl` komt uit `readEnv()` (`:69`) en gaat alleen de URL in (`:113`), nooit de sleutel. |
| AC8: "`artwork-pipeline.ts:754` en `bootstrap-run.ts:450` lezen die cache" | **JUIST** | `artwork-pipeline.ts:754` `const { marks, reason } = await resolveDeclaredMarks(gtin);` in `GET /artwork/declared-marks/:gtin`; `bootstrap-run.ts:450` `const decl = await resolveDeclaredMarks(gtin);` gevolgd door de **harde** guard `decl.reason !== 'ok'` (r.451). Beide lopen door `marksCacheRead` (`:487`). Contaminatierisico is dus reëel én raakt een *harde* beslispoort, niet alleen een UI-hint. |
| AC9: "nergens 429-/backoff-afhandeling" | **JUIST** | `grep -rn 429` over `apps/api/src/services` + `apps/api/src/scripts` = 0 treffers. `fetchTradeItemXml` behandelt alles ≥400 (behalve 404) identiek als `api-fout` (`:141-144`) — status wordt nooit aan de caller doorgegeven. |
| AC3: "`closeRedisConnection()` bestaat nog niet" | **JUIST** | queue.ts:75-88 exporteert alleen `getRedisConnection()`; enige sluiting in de codebase is de ad-hoc `redis.quit()` in `health.ts:169`. |
| Weerlegde hypothese 1 (er is wél een timeout) | **JUIST** | `FETCH_TIMEOUT_MS = 10_000` (`:60`), `AbortController` + `setTimeout` (`:114-115`), `signal` op de fetch (`:122`). |
| Weerlegde hypothese 2 ("`resolveDeclaredMarks` throwt per ontwerp nooit → een `.catch()` is een no-op") | **BIJNA juist, te absoluut** | Zie N9: `parseDeclaredMarks(xml)` op `:495` staat als **enige** aanroep buiten elke try/catch. Alle overige paden zijn wél afgedekt (apiKey `:461`, Prisma `:467-480`, Redis-read `:414-424`, fetch `:118-134`, body-read `:154-163`, Redis-write `:437-451`). |
| Weerlegde hypothese 3 (cache werkt, prefix `marks:`) | **JUIST voor de prefix**, **onvoldoende bewijs voor "de cache werkt"** | Prefix code-geverifieerd. De 3-GTIN-proef toont de schrijfweg aan, niet de persistentie onder 1862 sleutels — en verklaart de restobservatie (DBSIZE 4840→3058) niet. Zie N8/N12. |
| Restobservatie (0 sleutels, DBSIZE-daling) als "geen AC" wegzetten | **RISICOVOL** | Zie N8: de indexbouwer schrijft via dezelfde singleton (queue.ts:79, `REDIS_URL`, geen db-suffix) in dezelfde keyspace als BullMQ. |

**Aftekenbaarheid:** AC7 en AC9 zijn meetbaar geformuleerd (drempel + exitcode; wandklok + max pogingen). AC8 is meetbaar in de eerste twee varianten en **niet** in de derde. Alle drie hebben inhoudelijke gaten — hieronder.

---

## 3. Nieuwe bevindingen (locatie — één regel — severity)

| # | Locatie | Bevinding | Severity |
|---|---|---|---|
| N1 | story AC7 + `t3777-declarations.ts:43-49,461-464,479-483` | **De kwaliteitspoort laat het ergste scenario door:** AC7 rekent alleen `api-fout`/`timeout` als technische fout, maar `DeclarationReason` kent óók `api-key-ontbreekt` en `gln-ontbreekt` — bij een ontbrekende/verlopen `CATALOG_API_KEY` levert **elke** GTIN `api-key-ontbreekt`, is de technische foutratio **0%**, passeert de poort en overschrijft een **lege** index de goede: exact de schade die F3 moest voorkomen. | **high** |
| N2 | story AC3/Task 4 + `queue.ts:77-88` vs AC2 | **AC3 en AC2 kunnen elkaar wurgen:** `closeRedisConnection()` is niet gespecificeerd als `quit()` of `disconnect()`; ioredis' `quit()` wacht op nog openstaande commando's en wordt bij een dode verbinding zelf in de offline-queue gezet — precies het AC2-scenario ("niet-antwoordende Redis") laat de "schone afsluiting" dan alsnog oneindig hangen. Bovendien annuleert `Promise.race` (Task 1) de verliezende operatie niet, dus die hangende `get`/`setex` bestaat gegarandeerd wanneer AC2 afgaat. | **high** |
| N3 | story AC2 (30 000 ms/GTIN) + AC9 (3 pogingen backoff, 20 min wandklok, concurrency 3) | **Onderling onhaalbaar in de foutmodus:** 1862 GTINs × 30 s ÷ 3 = ~5,2 uur worst case, en 3 exponentiële pogingen passen niet binnen één 30 s-budget; er is geen globale run-deadline of circuit-breaker die AC9's 20 minuten afdwingt zodra de foutratio oploopt. | medium |
| N4 | story AC3 vs AC7 | **Letterlijk conflict:** AC3 "Given de run is klaar (droge run én echte bouw), then eindigt het proces met exitcode 0" versus AC7 "eindigt het proces met exitcode ≠ 0" bij een getripte poort; AC3 mist de uitzondering, dus twee tests kunnen elkaar tegenspreken. | medium |
| N5 | story AC4/AC9 + Task 5 vs `artwork-pipeline.ts:754`, `bootstrap-run.ts:450` | **Gedeelde live-service wordt gewijzigd zonder regressie-AC:** AC4 (TTL/negatieve caching) en AC9 (backoff, waarvoor `fetchTradeItemXml` de HTTP-status moet gaan doorgeven — nu collapst alles ≥400 naar `api-fout` op `:141-144`) landen in `t3777-declarations.ts`, dat door de review-prior én de **harde** bootstrap-guard (`decl.reason !== 'ok'`) wordt gebruikt; AC6 dekt alleen de 19.3-contracten, niets bewaakt deze twee callers. | medium |
| N6 | story AC8 (laatste zin) + Dev Notes r.79 | **F9-ontsnappingsluik keert terug én een openstaand besluit blijft open:** "Alternatief zonder codewijziging: vastleggen dat de stage-run op een aparte Redis/DB-index draait" maakt opschrijven tot een geldige afronding zonder enige afdwinging, terwijl de Dev Notes de dragende keuze ("Bouwen we de index op stage-declaraties?") expliciet als open vraag laten staan — een story op `ready-for-dev` met een onbeslist bronsysteem. | medium |
| N7 | story AC7 (`KEURMERK_INDEX_MAX_ERROR_RATE` default 5%) vs Dev Notes r.79 en Achtergrond-tabel | **Drempel niet gekalibreerd op de eigen metingen:** de story meldt zelf stage 7/10 opgelost (30% niet) en 90/200 GTINs met data; zonder uitsplitsing naar 404 vs `api-fout` is onbekend of 5% haalbaar is — de poort blokkeert dan élke echte bouw (of is, andersom, betekenisloos). | medium |
| N8 | story "Restobservatie (geen AC)" + `queue.ts:79` + `t3777-declarations.ts:499` | **De volledige run schrijft ~1862 sleutels met 24 h TTL in dezelfde Redis-keyspace als de live BullMQ-pipeline** (één singleton, `REDIS_URL` zonder db-suffix); de weggezette DBSIZE-daling 4840→3058 wijst juist op actieve eviction, waardoor een corpusbrede run pipeline-jobstate kan verdringen. Geen AC begrenst dit (geen aparte db, geen kortere TTL voor de indexrun, geen meting). | medium |
| N9 | story Task 1 + "Weerlegde hypothesen" §2 vs `t3777-declarations.ts:495` | **Te absoluut:** "een `.catch()` toevoegen is een **no-op**" klopt niet volledig — `parseDeclaredMarks(xml)` (`:495`) is de enige aanroep buiten elke try/catch, én zodra Task 1 de aanroep in een `Promise.race` hangt **rejecteert** die race per definitie bij timeout; foutafhandeling is dus verplicht, niet overbodig. Task 1 stuurt de dev nu weg van een afhandeling die hij nodig heeft. | medium |
| N10 | story AC6 (gln-consistentie) + AC1 vs Tasks 1-10 | **AC's zonder eigenaar-Task:** de gln-consistentie-ingreep (signature-wijziging van `resolveDeclaredMarks` of gelijke `orderBy`) en AC1 komen in geen enkele Task terug; Task 8 noemt alleen tests voor AC2/AC6-concurrency/AC7. | low |
| N11 | story AC7 ("verschil in `distinctKeys`/`gtinsWithData` t.o.v. de bestaande index") | **Eerste-run/leesfout niet gedefinieerd:** de diff vereist een nieuwe MinIO-**lees**actie die het script vandaag niet doet; gedrag bij ontbrekende of corrupte bestaande index (eerste bouw) is niet bepaald. | low |
| N12 | story "Weerlegde hypothesen" §3 vs Achtergrond-kop | **Asymmetrische bewijsstandaard:** de v1-ACC-metingen worden terecht gedegradeerd tot "motivatie, geen nulmeting", maar de nieuwe 3-GTIN-cachetest wordt als sluitend bewijs opgevoerd terwijl hij niets zegt over gedrag bij 1862 sleutels (de enige schaal die ertoe doet). | low |
| N13 | story Task 3 + `artwork-pipeline.ts:407-415` | Regelverwijzing `artwork-pipeline.ts:404-413` wijst net naast het patroon: `runImportLoop` staat op r.407, de chunked `Promise.all`-lus op r.411-414 (uit v1 overgenomen, inhoudelijk juist). | info |

---

## 4. Wat exact moet wijzigen vóór dev (alle ≥ medium)

1. **AC7 (N1) — dicht de poort volledig.** Voeg toe: (a) `api-key-ontbreekt` bij ≥1 GTIN = **directe abort** vóór `writeIndex` (configuratiefout, geen datafeit); (b) `gln-ontbreekt` expliciet classificeren (normaal, met een eigen bovengrens — er zijn 12 bekende gevallen); (c) een **absolute vloer**: de nieuwe index mag `distinctKeys`/`gtinsWithData` niet met meer dan X% laten dalen t.o.v. de bestaande index, ongeacht de foutratio.
2. **AC3 (N2) — specificeer de sluiting.** Eis `closeRedisConnection()` als *forceful* sluiting (`disconnect()`, of `quit()` met een korte bounded fallback naar `disconnect()`), zodat een hangend commando de afsluiting niet gijzelt. Voeg aan AC2 toe dat het budget de onderliggende operatie **afbreekt** (AbortSignal / expliciete disconnect), niet alleen de wachttijd meet.
3. **AC2 + AC9 (N3) — maak ze samen haalbaar.** Voeg een **globale** run-deadline en/of circuit-breaker toe (bv. "bij >N opeenvolgende timeouts: run afbreken met exitcode ≠ 0") en herformuleer de 20-minuteneis als "bij ≤ X% fouten"; specificeer dat backoff-pogingen **binnen** het per-GTIN-budget vallen.
4. **AC3 vs AC7 (N4).** Herformuleer AC3 tot "…eindigt met exitcode 0 **tenzij de poort van AC7 afgaat**".
5. **AC4/AC9 (N5) — bewaak de live callers.** Voeg een AC toe: geen gedragsverandering voor `GET /artwork/declared-marks/:gtin` en de bootstrap-declaratieguard (`reason`-vocabulaire blijft geldig, `!== 'ok'` blijft equivalent), met een test per caller; benoem expliciet dat `fetchTradeItemXml` de HTTP-status moet gaan doorgeven en dat backoff **niet** in het pad van de live crosscheck mag landen (of bewust wel, met meting).
6. **AC8 (N6) — schrap het derde alternatief.** Laat alleen de twee afdwingbare varianten staan (omgeving in de sleutel, of cache uit voor een niet-default base). En zet de openstaande vraag "stage- of ACC-declaraties als indexbron" **vóór** dev om in een beslissing (Friso/PO) of markeer de story als blocked-on-decision; nu staat hij op ready-for-dev met een onbeslist bronsysteem.
7. **AC7 (N7) — kalibreer.** Splits de bestaande meting eenmalig uit naar reden (404 vs `api-fout` vs `lege-declaratie`) of maak 5% een expliciet te herijken startwaarde met een AC dat de droge run de werkelijke verdeling rapporteert vóórdat de echte bouw wordt vrijgegeven.
8. **AC4/AC8 (N8) — begrens de Redis-voetafdruk.** Voeg toe: de indexrun gebruikt een aparte Redis-db/prefix of een aparte, kortere TTL, en de run logt het aantal geschreven sleutels + DBSIZE vóór/na, zodat verdringing van BullMQ-state zichtbaar is.
9. **Task 1 (N9) — nuanceer.** Vervang "een `.catch()` is een no-op" door: "een `.catch()` alléén lost de hang niet op; hij blijft nodig — `parseDeclaredMarks` (`:495`) staat buiten try/catch en de `Promise.race` rejecteert bij timeout."

---

## 5. Eindoordeel

v2 is een echte verbetering: de drie dragende diagnoses zijn nu code-correct, de no-op-fix is eruit, de werkelijke hang-kandidaten staan er, en de drie ontbrekende beschermende AC's zijn toegevoegd. 13 van 18 v1-bevindingen zijn afgehandeld en geen enkele is genegeerd.

De story faalt niettemin op de **nieuwe** AC's: de kwaliteitspoort (AC7) laat juist de goedkoopste catastrofe door (lege index bij ontbrekende API-key overschrijft de goede index), de schone afsluiting (AC3) is zo onderspecificeerd dat hij de bug die de story moet oplossen kan reproduceren, en AC2/AC9 zijn in hun eigen foutmodus niet tegelijk haalbaar. Daarbij landen AC4 en AC9 in een service die twee live beslispaden voedt zonder dat iets die bewaakt, en AC8 herintroduceert het ontsnappingsluik dat F9 had gesloten — bovenop een dragend besluit (stage vs ACC als declaratiebron) dat de story bewust openlaat.

**VERDICT: FAIL** — voer §4 punten 1 t/m 9 door; punten 1, 2 en 6 zijn blokkerend, de rest is verplichte aanscherping. Her-review daarna kan kort zijn (delta op de gewijzigde AC's).
