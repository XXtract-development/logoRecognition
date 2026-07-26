# Adversariële review — Story 19.16 (Keurmerk-index over de volledige corpus)

reviewed_artifact: `_bmad-output/implementation-artifacts/19-16-indexbouwer-volledige-corpus.md` (status ready-for-dev)
reviewed_code: `apps/api/src/scripts/build-keurmerk-index.ts`, `apps/api/src/services/t3777-declarations.ts`, `apps/api/src/services/mediaserver-client.ts`, `apps/api/src/services/pipeline/queue.ts`, `apps/api/src/api/v1/artwork-pipeline.ts`, `apps/api/src/__tests__/scripts/build-keurmerk-index.test.ts`, `apps/ml-service/app/services/queue_harvest.py`, `apps/api/src/services/flywheel/overview/coverage.ts`
reviewer: adversarial (code-geverifieerd, geen implementatie uitgevoerd)
datum: 2026-07-25

**VERDICT: FAIL** (5 high + 7 medium → story mag niet ongewijzigd naar dev)

severity_count: critical 0 · high 5 · medium 7 · low 4 · info 1

---

## 1. Bevindingen (locatie — één regel — severity)

| # | Locatie | Bevinding | Severity |
|---|---------|-----------|----------|
| F1 | story AC4 + `t3777-declarations.ts:410-412` vs `:93-95` | AC4 rust op een **verkeerde sleutelnaam**: `resolveDeclaredMarks` cachet op `marks:{gln}:{gtin}:{tm}`, niet op `t3777:{gln}:{gtin}:{tm}` — de "gemeten anomalie" (0 `t3777:*`-sleutels) is dus het verwachte gedrag, geen bug. | high |
| F2 | story AC2 + Task 1 vs `t3777-declarations.ts:60,114-115,132-134` en `mediaserver-client.ts:86` | De hoofdhypothese is deels onjuist: de catalog-fetch heeft al een harde 10s-`AbortController`-timeout en mediaserver een 60s axios-timeout; de écht onbegrensde wachten zijn `await response.text()` (na `clearTimeout`), de ioredis-commando's (`maxRetriesPerRequest: null`) en de per-GTIN Prisma-lookup — die noemt de story niet. | high |
| F3 | story (geen AC) + `build-keurmerk-index.ts:304-316,334` | Geen kwaliteitspoort bij gedeeltelijke mislukking: de echte bouw overschrijft ALTIJD dezelfde vaste MinIO-sleutel, dus een run waarin 30% van de GTINs een timeout/500 gaf vervangt stilzwijgend een goede index door een verarmde — consumenten (`coverage.ts:120`, `queue_harvest.py:84`) zien dat niet. | high |
| F4 | story AC4 + `t3777-declarations.ts:492-499` | Negatieve caching maakt géén onderscheid tussen "echt leeg" en transiënte fouten: een 429/500/timeout wordt 86400s als `{marks: [], reason:'api-fout'}` gecached, dus AC4 ("cache moet aantoonbaar werken") vergiftigt juist elke herhaalde run — en parallellisatie (Task 2) vergroot de foutkans. | high |
| F5 | story Dev Notes ("CATALOG_API_BASE=stage is bewust en CORRECT") + `t3777-declarations.ts:410-412,499` + `artwork-pipeline.ts:754` + `bootstrap-run.ts:450` | De cachesleutel bevat géén omgevings-/baseUrl-dimensie: een index-run tegen **stage** schrijft 24h-cache-entries die de LIVE ACC-paden (review-prior, bootstrap-declaratieguard) daarna als ACC-waarheid lezen — cross-omgevingscontaminatie, niet geadresseerd. | high |
| F6 | story AC1 ("of geen limiet") vs `build-keurmerk-index.ts:234-244` + `review-19-3-adversarial.md` (medium-mitigatie) | Het opheffen van `KEURMERK_INDEX_LIMIT` (default 500) haalt de énige bewuste upstream-beschermingsmaatregel van 19.3 weg zonder vervanging: er is nergens 429-/backoff-afhandeling (`git grep 429` in `services/`+`scripts/` = 0 treffers). | medium |
| F7 | story AC3 + Task 3 | Het "hoe" van de schone afsluiting is niet begrensd: een `process.exit(0)` in de `finally` haalt AC3 maar kan bij de ECHTE bouw de MinIO-write/logs afkappen — AC3 moet expliciet "geen harde exit; sluit de handles" eisen. | medium |
| F8 | story AC1/AC3/AC5, Task 2 ("acceptabel venster") | Niet objectief aftekenbaar: AC1 noemt geen wandklok-bovengrens, Task 2 geen doelduur, AC5 geen interval/veld/stroom (stdout-flush) — "voortgang te volgen" is niet meetbaar. | medium |
| F9 | story AC4 ("repareer **of documenteer** de uitkomst") | Ontsnappingsluik: elke uitkomst — inclusief "niets gedaan, wel opgeschreven" — haalt AC4; een AC met twee tegengestelde geldige uitkomsten is geen acceptatiecriterium. | medium |
| F10 | story AC2 ("met een reden in de telling") vs AC6 ("index-JSON-structuur ongewijzigd") + `build-keurmerk-index.ts:77-85,282` | Latent conflict + ontbrekend plumbing: `GtinData` heeft geen `reason`-veld en `collectGtinData` gooit de `reason` weg; een reden-telling in `summary` zou AC6 breken. Specificeer: tellingen uitsluitend naar stdout/log. | medium |
| F11 | story AC6 "deterministische ordening" + `build-keurmerk-index.ts:251-267` en `t3777-declarations.ts:468-472` | De echte determinisme-gaten zitten niet in de parallellisatie maar in de gln-keuze: `loadGtinUniverse` dedupt op **gtin alleen** (`orderBy: gtin asc`, geen tiebreak) en `resolveDeclaredMarks` doet zijn **eigen** `findFirst` zonder `orderBy` → bij een GTIN met meerdere GLN's kan de opgeslagen gln afwijken van de gln waarmee de declaratie is opgehaald. | medium |
| F12 | story AC6/Task 6 + `__tests__/scripts/build-keurmerk-index.test.ts:16-24` + `build-keurmerk-index.ts:274` | AC6's regressiepoort is zwak: de 13 bestaande tests raken **uitsluitend pure helpers** (`buildIndex`/`serializeIndex`/`indexKey`/`dedupSorted`) en dekken geen enkele regel van de I/O-laag die deze story wijzigt; `collectGtinData` is niet geëxporteerd, dus Task 6 vereist eerst een testbaarheidsingreep die de story niet benoemt. | medium |
| F13 | story Afbakening + `coverage.ts:18-27,120` en `queue_harvest.py:70-84` | Consumenteneffect van een 5-25× grotere index niet geadresseerd: de 19.10-floodrem (`HARVEST_TOP_N=30`, `HARVEST_EXCLUDE_CODES`) en de dekkingsteller zijn afgeregeld op de huidige 32-sleutel-index; de story sluit de herbouw uit maar legt de vervolgafhankelijkheid niet vast. | medium |
| F14 | `build-keurmerk-index.ts:192` vs `queue_harvest.py` (`key.rsplit("/",1)[-1]`) | Code-extractie splitst aan tegengestelde kanten (eerste vs laatste `/`): voor een code die zelf een `/` bevat wijken API en harvester af — kans hierop stijgt met de volledige corpus. | low |
| F15 | story AC6 "byte-identieke"/idempotent + `build-keurmerk-index.ts:199` | Overgeërfde onjuistheid uit 19.3: `builtAt: now.toISOString()` maakt twee runs nooit byte-identiek; formuleer "deterministisch op `builtAt` na". | low |
| F16 | story Task 2 vs `mediaserver-client.ts:16` en `artwork-pipeline.ts:70-71,404-413` | Precedent verkeerd geadresseerd: `ARTWORK_IMPORT_CONCURRENCY` (default 3) wordt gedefinieerd in `artwork-pipeline.ts:71` (chunked `for`-lus met `Promise.all` per batch) — `mediaserver-client.ts` noemt het alleen in een doc-comment, en het geldt voor mediaserver-downloads, niet voor de catalog-API. | low |
| F17 | story Task 3 ("axios keep-alive agents") + `mediaserver-client.ts:83-90` | Onbewezen deel van de afsluit-diagnose: er is geen custom keep-alive-agent; de énige handle die het proces oneindig openhoudt is de ioredis-singleton (`queue.ts:75-88`), waarvoor nergens een sluit-helper bestaat behalve ad-hoc `redis.quit()` in `health.ts:169`. | low |
| F18 | story Achtergrond-tabel + getallen 1862/1874/7-10 | Niet reproduceerbaar in code/repo (ACC-meting van één sessie): de metingen zijn plausibel maar niet verifieerbaar; behandel ze als aanname, niet als vastgestelde nulmeting. | info |

---

## 2. Claims uit de story die ik heb GEVERIFIEERD (met code-bewijs)

| Claim | Bewijs | Status |
|---|---|---|
| `collectGtinData` staat op r.274-285 en is een strikt sequentiële `for`-lus (r.276) | `build-keurmerk-index.ts:274-285`, `for (const {gtin,gln} of universe)` op 276, `await` binnen de lus op 277 | **JUIST** |
| `discoverArtwork` heeft `.catch(() => [])`, `resolveDeclaredMarks` niet | `build-keurmerk-index.ts:279` resp. `:278` | **JUIST (letterlijk)** — maar zie F2: functioneel irrelevant, `resolveDeclaredMarks` throwt per ontwerp nooit (alle paden `try/catch` of vroege return: `t3777-declarations.ts:461-500`; ook zo vastgesteld in `review-19-3-adversarial.md`, sectie High) |
| `prisma.$disconnect()` gebeurt al | `build-keurmerk-index.ts:350-352` | **JUIST** |
| Het proces houdt vermoedelijk een open **Redis**-socket vast | `queue.ts:75-88`: module-level ioredis-singleton, `maxRetriesPerRequest: null`, nergens `quit()`/`disconnect()` behalve `health.ts:169` → nooit-sluitende socket houdt de event-loop levend | **JUIST (Redis-deel)**; keep-alive-deel onbewezen (F17) |
| `printPlan` schrijft alles pas aan het eind → run lijkt stil | `build-keurmerk-index.ts:287-301`, aangeroepen ná `collectGtinData` in `main()` (322-326) | **JUIST** |
| Upstream levert legitiem 404 en 500 per GTIN, per GTIN te verwerken | `t3777-declarations.ts:136-144` (404 en ≥400 apart, beide fail-safe zonder throw) | **JUIST** |
| Default `KEURMERK_INDEX_LIMIT` = 500 | `build-keurmerk-index.ts:241-244` | **JUIST** |
| GTIN-universum = distinct rijen uit `artwork_imports` met gevulde gln, deterministisch geordend | `build-keurmerk-index.ts:251-267` | **DEELS** — dedup is op **gtin alleen**, niet op "gtin+gln" zoals de story schrijft (F11) |
| `ARTWORK_IMPORT_CONCURRENCY` default 3 bestaat als precedent | `artwork-pipeline.ts:70-71` + `:404-413` | **JUIST inhoudelijk, verkeerde locatie** (F16) |
| De 19.3-tests bestaan en zijn de regressiepoort | `apps/api/src/__tests__/scripts/build-keurmerk-index.test.ts` (13 tests, 189 regels) | **JUIST dat ze bestaan; ONJUIST als dekkingsclaim** (F12) |
| Parallellisatie botst met de deterministische ordening | `buildIndex` is order-invariant (sortering op 180/187/207, expliciet getest op `:168-178`) → een chunked `Promise.all` (patroon `artwork-pipeline.ts:412`) is veilig | **CLAIM NIET NODIG als risico**, mits de invariant expliciet in de story staat (F11 benoemt het echte gat) |

## 3. Claims die ONJUIST of ONBEWEZEN zijn

1. **ONJUIST — "resolveDeclaredMarks cachet per `t3777:{gln}:{gtin}:{tm}`" (AC4).** `t3777-declarations.ts:410-412` → `marks:{gln}:{gtin}:{tm}`. De `t3777:`-prefix (`:93-95`) wordt alleen door `resolveDeclarations` (de T3777-kruischeck) geschreven, en die functie raakt de indexbouwer nergens aan. De "gemeten anomalie" (0 `t3777:*` bij DBSIZE 4840) is dus **volledig verklaard door een verkeerd scan-patroon** en is géén bug. Meest waarschijnlijke werkelijkheid: er stonden wél `marks:*`-sleutels.
2. **ONJUIST — impliciete premisse "er is geen timeout op de catalog-aanroep" (AC2/Task 1).** `t3777-declarations.ts:59-60` (`FETCH_TIMEOUT_MS = 10_000`) + `:114-123` (`AbortController` op `fetch`). Ook mediaserver heeft een timeout (`mediaserver-client.ts:86`, 60s). AC2 is daarmee voor de *verzoeken* al grotendeels geïmplementeerd; wat ontbreekt is een **per-GTIN totaalbudget**. Concreet onbegrensde wachten die de story mist:
   - `await response.text()` op `t3777-declarations.ts:155` valt **buiten** de timer, want `clearTimeout(timer)` staat in de `finally` van de fetch op `:132-134` → een server die headers stuurt en dan stilvalt hangt oneindig (past exact bij "25 min in `ep_poll`, 0:00 CPU");
   - ioredis met `maxRetriesPerRequest: null` (`queue.ts:80-82`) + offline-queue: bij een verbroken/haperende Redis **rejecten `get`/`setex` nooit** — ze wachten oneindig (verklaart óók waarom korte runs slaagden en een lange run niet);
   - `prisma.artworkImport.findFirst` per GTIN (`t3777-declarations.ts:468-472`) zonder eigen bovengrens.
3. **ONJUIST/MISLEIDEND — "`resolveDeclaredMarks` heeft geen catch, dus één hangend verzoek stalt de run" als *diagnose*.** De functie throwt per ontwerp niet (zie §2); een `.catch()` toevoegen verandert niets aan een *hang*. De story stuurt de dev daarmee naar een no-op-fix. Wat werkt is een `Promise.race`-budget per GTIN (dat óók de Redis- en body-read-hang omzeilt) — dat moet AC2 eisen.
4. **ONBEWEZEN — "de cache faalt silently / schrijft naar een andere instance".** De schrijfweg is compleet en gelogd bij falen (`:437-451`, `:499`); een Redis-storing zou `logger.warn('Redis marks cache write failed…')` opleveren. Er is geen DB-index-verschil in de code (`queue.ts:79`: URL uit `REDIS_URL`, geen expliciete `db`; `.env.example:45` = `redis://localhost:6379` → db 0, gelijk aan `redis-cli`-default). Enige resterende, te controleren variant: een `REDIS_URL` met `/N`-suffix in de ACC-env. Hypothese "cachen gebeurt alleen bij 200" is **weerlegd**: `:492-499` cachet álle uitkomsten, inclusief 404/`api-fout`/`lege-declaratie`.
5. **ONBEWEZEN — "axios keep-alive agents" houden het proces open.** Geen custom `httpAgent`/`httpsAgent` (`mediaserver-client.ts:83-90`); Node's default-agent-sockets verlopen zelf. De ioredis-singleton is de aannemelijke (en enige aangetoonde) oorzaak.
6. **ONBEWEZEN (en risicovol als vaststaand feit gepresenteerd) — "`CATALOG_API_BASE=stage` is bewust en CORRECT".** De steekproef (7/10 vs 0/10) staat niet in de repo en de consequentie is niet doordac: de index wordt dan op **stage**-declaraties gebouwd terwijl de default van de code ACC is (`t3777-declarations.ts:69`) en de live beslispaden ACC gebruiken → én inhoudelijke inconsistentie én cache-contaminatie (F5).
7. **ONBEWEZEN (informatief) — alle ACC-metingen** (1862/1874, de limiet-tabel, de 25-minuten-hang, de nieuwe sleutels): eenmalige sessiemetingen, niet reproduceerbaar uit de repo. Prima als motivatie, niet als afgetekende nulmeting (F18).
8. **Gecheckt en NIET van toepassing (voorkomt een valse bevinding):** `12-13-rate-limit-429-en-thumbnail-flood.md` legt géén constraint op deze story — dat gaat over de **inkomende** fastify-limiter (per-IP, 100/60s) op onze eigen API, terwijl de indexbouwer alleen **uitgaand** catalog/mediaserver/Prisma/Redis aanroept en de API-routes niet passeert. Die story staat trouwens zelf nog op `ready-for-dev`. De relevante les is een andere: er is nergens uitgaande 429-/backoff-afhandeling (F6).

---

## 4. Ontbrekende AC's / concrete aanscherpingen

**AC2 herformuleren (vervangt de onjuiste premisse):**
> Given een GTIN waarvan een upstream-stap (catalog-headers, catalog-body, mediaserver, Redis-commando of gln-lookup) niet binnen het per-GTIN-budget `KEURMERK_INDEX_GTIN_TIMEOUT_MS` (default 30000) antwoordt, when dat budget verstrijkt, then wordt de GTIN met reden `timeout` geteld en gaat de run verder; het budget omvat aantoonbaar óók `response.text()` en Redis-commando's (bewijs: test met een stub die na de headers stilvalt, én een test met een niet-antwoordende Redis-mock).

**AC4 herformuleren (vervangt de niet-bestaande anomalie):**
> Given een run over N GTINs, when hij klaar is, then bestaan er `marks:*`-sleutels (niet `t3777:*` — die prefix hoort bij de kruischeck en wordt door dit script nooit geschreven) en logt de run cache-hits/-misses; when een GTIN een transiënte fout gaf (`api-fout`, timeout, 5xx, 429), then wordt die uitkomst NIET 24h negatief gecached (aparte korte TTL of niet cachen), zodat een herhaalde run zich herstelt.

**Nieuwe AC7 — kwaliteitspoort op de echte bouw (F3, ontbreekt volledig):**
> Given een echte bouw, when het aandeel GTINs met een technische fout (`api-fout`/timeout, dus NIET 404/lege-declaratie) boven `KEURMERK_INDEX_MAX_ERROR_RATE` (default 5%) ligt, then wordt de bestaande index NIET overschreven en eindigt het proces met exitcode ≠ 0 en een expliciete reden; when eronder, then bevat de log de volledige reden-verdeling (ok/404/lege-declaratie/api-fout/timeout) én het verschil in `distinctKeys`/`gtinsWithData` t.o.v. de bestaande index.

**Nieuwe AC8 — omgevingsscheiding van de cache (F5):**
> Given een run met een andere `CATALOG_API_BASE` dan de service-default, when declaraties gecached worden, then bevat de cachesleutel de omgeving (of wordt de cache voor die run uitgezet), zodat stage-declaraties de ACC-review-prior (`artwork-pipeline.ts:754`) en de bootstrap-declaratieguard (`bootstrap-run.ts:450`) niet kunnen beïnvloeden. Alternatief, indien geen codewijziging: de story legt vast dat de run tegen stage op een aparte Redis/DB-index draait.

**Nieuwe AC9 — bovengrens en netheid van de belasting (F6, F8):**
> Given de volledige corpus (~1900 GTINs), when de droge run draait met `KEURMERK_INDEX_CONCURRENCY` (default 3, harde max 8), then rondt hij af binnen 20 minuten wandklok; when upstream een 429 of 5xx geeft, then wordt met exponentiële backoff (max 3 pogingen) hersteld en pas daarna als fout geteld. De limiet-env blijft bestaan (geen "geen limiet" zonder deze rem).

**AC1/AC5 aanscherpen (F8):**
- AC1: voeg toe "…en eindigt binnen de in AC9 genoemde wandkloklimiet" (nu ontbreekt elke bovengrens, dus "blijft niet hangen" is niet af te tekenen).
- AC5: "elke 25 GTINs (env-instelbaar) één regel naar stdout met `verwerkt/totaal`, verstreken tijd, ETA en de reden-verdeling tot dan toe; direct geflusht zodat de regels ook door een pijp/`tail` zichtbaar zijn".

**AC3 aanscherpen (F7):** "…sluit expliciet de ioredis-verbinding uit `services/pipeline/queue.ts` (voeg daarvoor een `closeRedisConnection()` toe naast `getRedisConnection()`), náást `prisma.$disconnect()`. `process.exit()`/`process.kill` mag NIET als afsluitmechanisme worden gebruikt, zodat de MinIO-write in de echte bouw nooit halverwege wordt afgekapt. Bewijs: het script eindigt in de echte bouw én de droge run zonder externe `timeout`."

**AC6 aanscherpen (F10, F11, F12, F15):**
- "deterministisch **op `builtAt` na**" (byte-identiek is met een live timestamp onhaalbaar);
- expliciete invariant: parallellisatie mag de output niet beïnvloeden — gebruik het chunked-`Promise.all`-patroon van `artwork-pipeline.ts:404-413` en voeg een test toe dat `collectGtinData` bij concurrency 1 en N dezelfde `GtinData`-verzameling geeft;
- gln-consistentie: geef de al bekende gln uit het universum mee aan de declaratie-resolutie (spaart ~1900 DB-queries) of borg dezelfde `orderBy`, zodat de gln in de index gelijk is aan de gln waarmee is opgehaald;
- reden-tellingen gaan naar stdout/log, **niet** in de index-JSON (anders breekt AC6 zelf);
- benoem dat de 19.3-tests alléén pure helpers dekken en dat `collectGtinData`/`loadGtinUniverse` geëxporteerd of injecteerbaar gemaakt moeten worden om Task 6 te kunnen halen.

**Afbakening aanscherpen (F13):** noem `coverage.ts:120` en `queue_harvest.py:84` als consumenten van dezelfde sleutel en leg vast dat de vervolg-herbouw-story de 19.10-scope-parameters (`HARVEST_TOP_N`, `HARVEST_EXCLUDE_CODES`) opnieuw moet beoordelen op een 5-25× grotere index.

**Optioneel (F14):** harmoniseer de code-extractie uit de indexsleutel (eerste vs laatste `/`) tussen `build-keurmerk-index.ts:192` en `queue_harvest.py`, of leg vast dat codes met `/` niet voorkomen.

---

## 5. Eindoordeel

De story is goed geschreven en de *richting* (volledige corpus haalbaar maken) is juist, maar twee van de drie dragende diagnoses houden geen stand tegen de code: de cache-"anomalie" bestaat niet (verkeerde sleutelprefix) en de "geen timeout"-hypothese is onjuist (10s AbortController aanwezig), waardoor de voorgestelde fixes deels no-ops zijn en de werkelijke hang-oorzaken (body-read buiten de timer, oneindig wachtende Redis-commando's) buiten scope blijven. Daarbovenop ontbreekt de belangrijkste beschermende AC: een run met veel upstream-fouten mag de bestaande index niet stil overschrijven, en negatieve caching van transiënte fouten plus het ontbreken van omgevingsscheiding kunnen de kwaliteit 24 uur lang bederven — inclusief de live ACC-beslispaden. Alleen de afsluit-diagnose (AC3) is grotendeels correct.

**VERDICT: FAIL** — voer §4 door (met name AC2, AC4, nieuwe AC7 en AC8) en her-review vóór dev.
