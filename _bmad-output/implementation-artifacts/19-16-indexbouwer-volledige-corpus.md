# Story 19.16: Keurmerk-index over de volledige corpus (nazorg 19.3)

Status: review

<!-- Nazorg op Story 19.3 ("KEURMERK_INDEX_LIMIT default 500; volledige-corpus = latere
uitbreiding"). Diagnose 2026-07-22. HERSCHREVEN 2026-07-25 na adversariële review
(review-19-16.md, verdict FAIL): twee van de drie dragende diagnoses in v1 waren
ONJUIST — zie "Weerlegde hypothesen" hieronder. Niet terugdraaien naar v1. -->

## Story

Als **datamanager**
wil ik **dat de keurmerk→etiket-index betrouwbaar over de VOLLEDIGE ACC-corpus gebouwd kan worden**
zodat **de oogst zoekt in al het beschikbare artwork in plaats van in een fractie ervan, en dunbezette keurmerken (SEPARATE_COLLECTION, SOCIETY_PLASTICS_INDUSTRY) aan echte crops kunnen komen**.

### Achtergrond (ACC-sessiemeting 2026-07-22 — motivatie, GEEN afgetekende nulmeting)

De live index (`flywheel-index/keurmerk-etiket-index.json`, gebouwd 2026-07-06) dekt **70 GTINs / 32 sleutels**. Het GTIN-universum is ~**1862**.

| Limiet | GTINs met data | Sleutels | Uitkomst |
|---|---|---|---|
| 25 | 17 | 10 | klaar |
| 200 | 90 | **40** | klaar (≈5 min) |
| 2000 | — | — | **25 min zonder voortgang, 0:00 CPU-tijd, `ep_poll`** |

Bij ~11% van de corpus al **40 sleutels** — meer dan de héle huidige index. Nieuw o.a.: `SOCIETY_PLASTICS_INDUSTRY` (6 etiketten, zat NIET in de index), `SEPARATE_COLLECTION` (3), `NutritionalScore/C` en `/D`, `CRUELTY_FREE_PETA`, `PROTECTED_DESIGNATION_OF_ORIGIN`, `AISE_14`.

### Weerlegde hypothesen uit v1 — NIET opnieuw als diagnose gebruiken

1. **"Er is geen timeout op de catalog-aanroep."** ONJUIST. `t3777-declarations.ts:59-60` heeft `FETCH_TIMEOUT_MS = 10_000` met `AbortController` (`:114-123`); mediaserver heeft 60s axios-timeout (`mediaserver-client.ts:86`).
2. **"`resolveDeclaredMarks` mist een `.catch()`, daarom stalt de run."** ONJUIST **als diagnose van de hang**: een `.catch()` maakt een hangende call niet los. **Maar niet absoluut** (correctie na her-review): `parseDeclaredMarks(xml)` op `:495` staat als enige aanroep **buiten elke try/catch** en kán dus throwen, en zodra Task 1 de call in een `Promise.race` hangt rejecteert die per definitie bij timeout. Er moet dus wél degelijk foutafhandeling omheen — alleen niet als *hang-fix*.
3. **"De declaratie-cache is stuk (0 `t3777:*`-sleutels)."** ONJUIST. `resolveDeclaredMarks` cachet op `marks:{gln}:{gtin}:{tm}` (`:409-412`); de `t3777:`-prefix (`:93-95`) hoort bij de aparte kruischeck en wordt door dit script nooit geschreven. **Empirisch bevestigd 2026-07-25:** een droge run met 3 GTINs produceerde exact 3 `marks:*`-sleutels. De cache werkt.
   - *Restobservatie (geen AC):* vóór die test stonden er 0 `marks:*`-sleutels terwijl eerdere runs (25/200 GTINs) wél afrondden, en DBSIZE zakte 4840→3058. Onverklaard, mogelijk eviction. Niet als bug behandelen zonder nieuw bewijs.

### Werkelijke hang-kandidaten (dit is waar de fix moet landen)

- **`await response.text()` (`t3777-declarations.ts:155`) valt BUITEN de timer** — `clearTimeout(timer)` staat in de `finally` van de fetch (`:132-134`). Een server die headers stuurt en dan stilvalt hangt oneindig. Past exact bij "25 min, 0:00 CPU, `ep_poll`".
- **ioredis met `maxRetriesPerRequest: null`** (`services/pipeline/queue.ts:80-82`): `get`/`setex` **rejecten nooit** bij een haperende Redis — ze wachten oneindig.
- **`prisma.artworkImport.findFirst` per GTIN** (`t3777-declarations.ts:468-472`) zonder eigen bovengrens.

### Afbakening

- Alleen `apps/api/src/scripts/build-keurmerk-index.ts` en de daarvoor benodigde ingrepen in `t3777-declarations.ts` / `services/pipeline/queue.ts` (sluit-helper). Geen wijziging aan oogst, sampler of herkenning.
- **Het herbouwen van de live index op ACC valt BUITEN deze story** (aparte schrijfactie, expliciete toestemming Friso). Consumenten van dezelfde MinIO-sleutel: `flywheel/overview/coverage.ts:120` en `queue_harvest.py:84`. De vervolg-story moet de 19.10-scopeparameters (`HARVEST_TOP_N`, `HARVEST_EXCLUDE_CODES`) opnieuw beoordelen tegen een 5-25× grotere index.
- De GLN-eis blijft: de catalog adresseert op `{gln}-{gtin}-{tm}`. Kost 12 van 1874 GTINs (0,6%).

## Acceptatiecriteria

1. **Volledige corpus draait door.** Given `KEURMERK_INDEX_LIMIT` ≥ 1862, when de droge run start, then doorloopt hij alle GTINs, print het plan en eindigt binnen de wandkloklimiet uit AC9. Geen enkele individuele GTIN kan de run permanent stallen.
   - **Verhouding tot de AC9-deadline:** "alle GTINs" is de eis voor de **normale** uitkomst. Grijpt de globale deadline in, dan is dat een **uitzonderingspad**, geen stille gedeeltelijke uitkomst: de resterende GTINs krijgen reden `niet-verwerkt` en AC7d blokkeert het overschrijven. AC1 geldt dus als geslaagd wanneer de run álle GTINs verwerkt binnen de deadline; wordt de deadline geraakt, dan is dat een gecontroleerde mislukking mét zichtbare reden — niet "ook goed".
2. **Per-GTIN totaalbudget (vervangt de onjuiste v1-premisse).** Given een GTIN waarvan een upstream-stap (catalog-headers, **catalog-body**, mediaserver, **Redis-commando** of gln-lookup) niet binnen `KEURMERK_INDEX_GTIN_TIMEOUT_MS` (default 30000) antwoordt, when dat budget verstrijkt, then wordt die GTIN met reden `timeout` geteld en gaat de run verder. Het budget omvat aantoonbaar óók `response.text()` en Redis-commando's. **Bewijs vereist:** een test met een stub die ná de headers stilvalt, én een test met een niet-antwoordende Redis.
3. **Het proces sluit schoon af, met een eenduidige exitcode.** Given de run is klaar (droge run én echte bouw), then eindigt het proces **zonder externe `timeout`/`kill`**, met exitcode **0 bij succes** en **≠ 0 wanneer de AC7-poort de write blokkeerde** (dat is een gecontroleerde, gewenste uitkomst — géén tegenspraak met "schoon afsluiten"; de run is dan geslaagd ín zijn oordeel, maar het resultaat is afgekeurd).
   - Sluit de ioredis-singleton expliciet via een nieuwe `closeRedisConnection()` naast `getRedisConnection()` (`services/pipeline/queue.ts:77-89`; er bestaat nu geen gedeelde helper — alleen een ad-hoc `redis.quit()` in `health.ts:169`), náást het bestaande `prisma.$disconnect()` (`build-keurmerk-index.ts:350-352`).
   - **Gebruik `disconnect()`, niet `quit()`** (her-review N2): `quit()` wacht op openstaande commando's, en een `Promise.race`-timeout (Task 1) **annuleert het onderliggende commando niet** — met `quit()` hangt de "schone afsluiting" dus alsnog precies in het AC2-scenario. Sta `quit()` alleen toe met een eigen bovengrens en `disconnect()` als terugval.
   - **`process.exit()` mag NIET als afsluitmechanisme worden gebruikt** — dat kan bij de echte bouw de MinIO-write afkappen. Zet `process.exitCode` en laat de event-loop leeglopen.
   - **Droge run + deadline:** een droge run schrijft nooit, dus AC7 spreekt geen oordeel uit. Wordt een droge run door de AC9-deadline afgekapt, dan eindigt hij eveneens met exitcode ≠ 0 — de uitkomst is immers onvolledig.
4. **Cache: juiste prefix + geen vergiftiging door transiënte fouten.** Given een run over N GTINs, then bestaan er `marks:*`-sleutels (**niet** `t3777:*`) en logt de run cache-hits/-misses. And given een GTIN gaf een **transiënte** fout (`api-fout`, timeout, 5xx, 429), then wordt die uitkomst NIET 86400s negatief gecached (aparte korte TTL of niet cachen), zodat een herhaalde run zich herstelt. **Let op:** nu cachet `:492-499` álle uitkomsten onvoorwaardelijk, inclusief fouten — parallellisatie vergroot de foutkans en daarmee de schade.
5. **Voortgang is meetbaar zichtbaar.** Given een run over honderden GTINs, then verschijnt elke 25 GTINs (env-instelbaar) één regel op stdout met `verwerkt/totaal`, verstreken tijd, ETA en de reden-verdeling tot dan toe, **direct geflusht** zodat de regels ook door een pijp/`tail` zichtbaar zijn.
6. **Geen regressie op de 19.3-contracten.** `buildIndex` blijft puur; sleutelvorm `{fieldType}/{code}`; droge run schrijft niets. Aanvullend:
   - deterministisch **op `builtAt` na** (`:199` zet een live timestamp — byte-identiek is onhaalbaar);
   - **parallellisatie mag de output niet beïnvloeden**: gebruik het chunked-`Promise.all`-patroon van `artwork-pipeline.ts:404-413` en voeg een test toe dat concurrency 1 en N dezelfde `GtinData`-verzameling geven;
   - **gln-consistentie**: `loadGtinUniverse` dedupt op gtin alleen (`:251-267`, geen tiebreak) terwijl `resolveDeclaredMarks` zijn eigen `findFirst` zonder `orderBy` doet (`:468-472`) → bij een GTIN met meerdere GLN's kan de opgeslagen gln afwijken van de gln waarmee is opgehaald. Geef de al bekende gln mee (spaart ~1900 queries) of borg dezelfde ordening;
   - reden-tellingen gaan naar **stdout/log, niet in de index-JSON** (anders breekt dit AC zichzelf);
   - de 13 bestaande tests dekken **uitsluitend pure helpers** (`buildIndex`/`serializeIndex`/`indexKey`/`dedupSorted`) en raken geen regel van de I/O-laag die deze story wijzigt; `collectGtinData`/`loadGtinUniverse` moeten geëxporteerd of injecteerbaar worden om AC2/AC6 te kunnen testen.
7. **Kwaliteitspoort op de echte bouw (NIEUW — ontbrak volledig).** De bouw overschrijft altijd dezelfde vaste MinIO-sleutel (`INDEX_OBJECT_KEY`, geen versie/backup), dus een slechte run verving stilzwijgend een goede index. De poort kent **drie** onafhankelijke voorwaarden; élke overtreding blokkeert het overschrijven:
   - **7a — configuratiefout is fataal, niet "geen fout".** Given `resolveDeclaredMarks` geeft voor een GTIN `api-key-ontbreekt` of `gln-ontbreekt`, then telt dat NIET als normale uitkomst. Bij ≥1 `api-key-ontbreekt` stopt de run onmiddellijk. *Reden (her-review N1): dat is een vroege return vóór elke netwerkaanroep (`:461-464`); zonder deze regel geeft een ontbrekende sleutel 0% "technische" fouten → poort passeert → een **lege** index overschrijft de goede — precies wat deze AC moet voorkomen.*
   - **7b — technische foutratio.** Given het aandeel GTINs met `api-fout` of `timeout` (dus NIET 404/`lege-declaratie`, die horen bij het normale beeld) boven `KEURMERK_INDEX_MAX_ERROR_RATE` ligt, then niet overschrijven. Default **5%**, met de expliciete opdracht deze te kalibreren op de reden-verdeling uit de eerste volledige droge run (Task 9) en de gekozen waarde te onderbouwen in de Debug Log.
   - **7c — krimpbeveiliging.** Given `distinctKeys` of `gtinsWithData` **lager** ligt dan de bestaande index, then niet overschrijven tenzij `--allow-shrink` expliciet is meegegeven. *Vangt verarming af t.o.v. de vorige stand.* **Randgeval:** is de bestaande index afwezig of onleesbaar (het script leest hem vandaag helemaal niet — die lees-actie moet worden toegevoegd), dan is 7c niet van toepassing en beslissen 7a/7b/7d alleen; log expliciet dát er geen vergelijkingsbasis was.
   - **7d — volledigheidsvoorwaarde (dekt het gat dat 7c NIET dicht).** Given de run niet álle GTINs uit het universum heeft verwerkt (≥1 GTIN met reden `niet-verwerkt`, bv. door de AC9-deadline), then wordt de index **NIET overschreven** tenzij `--allow-partial` expliciet is meegegeven. *Reden: 7c vergelijkt met de vórige stand, en die is klein (32 sleutels). Een run die op 60% afkapt levert volgens de eigen metingen van deze story al méér dan 40 sleutels — die zou 7c dus passeren en met exitcode 0 een onvolledige index wegschrijven. Alleen een expliciete volledigheidseis vangt dat.*
   - Bij blokkade: geen write, log de volledige reden-verdeling (ok/404/lege-declaratie/api-fout/timeout/api-key-ontbreekt/gln-ontbreekt) én het verschil t.o.v. de bestaande index. Zie AC3 voor de exitcode.
8. **Omgevingsscheiding van de cache (HARDE VOORWAARDE — besluit 2026-07-25: we bouwen op stage).** Given de run draait tegen `catalog.stage.xxtract.com` terwijl de code-default ACC is, when declaraties gecached worden, then **bevat de cachesleutel een omgevingsdimensie** (afgeleid van de genormaliseerde `baseUrl`-host, bv. `marks:{env}:{gln}:{gtin}:{tm}`). Geen alternatieven, geen "of documenteer het" — de vorige review merkte zo'n dubbele uitweg terecht aan als ontsnappingsluik (F9).
   - *Reden: de huidige sleutel `marks:{gln}:{gtin}:{tm}` (`:409-412`) heeft geen omgevingsdimensie. Een index-run tegen **stage** schrijft 24h-entries die de LIVE ACC-paden — review-prior (`artwork-pipeline.ts:754`) en de bootstrap-declaratieguard (`bootstrap-run.ts:450`, waar hij als **harde** guard werkt) — daarna als ACC-waarheid lezen.*
   - **Migratiegedrag:** bestaande sleutels zonder env-dimensie worden genegeerd (niet gelezen), zodat er geen vervuilde entries van vóór deze story doorlekken. Ze verlopen vanzelf binnen de TTL.
9. **Belastingsgrens, netheid en een globale deadline (NIEUW).** Given de volledige corpus, when de droge run draait met `KEURMERK_INDEX_CONCURRENCY` (default 3, harde max 8), then rondt hij af **binnen 20 minuten wandklok**. And when upstream een 429 of 5xx geeft, then wordt met exponentiële backoff (max 3 pogingen) hersteld voordat de GTIN als fout telt. De limiet-env blijft bestaan — géén "geen limiet" zonder deze rem. *Er is nu nergens uitgaande 429-/backoff-afhandeling (`git grep 429` in `services/`+`scripts/` = 0 treffers).*
   - **Globale deadline verplicht** (her-review N3): AC2 (30s per GTIN) en AC9 (20 min totaal) zijn in het slechtste geval onverenigbaar — 1862 GTINs × 30s ÷ concurrency 3 ≈ 5 uur, en backoff-retries verlengen dat nog. Implementeer daarom `KEURMERK_INDEX_MAX_RUNTIME_MS` (default 20 min): bij het verstrijken stopt de run **gecontroleerd**, telt de resterende GTINs als `niet-verwerkt`, en levert dat resultaat verplicht aan de AC7-poort aan — waar **7d** (volledigheid) het overschrijven blokkeert. *Expliciet NIET 7c: een afgekapte run kan méér sleutels bevatten dan de kleine bestaande index en zou 7c dus passeren.* De 20 minuten zijn een **harde grens**, geen verwachting.
   - **Redis-voetafdruk vóór de verificatierun** (her-review N8): een volledige run schrijft ~1862 `marks:*`-sleutels in **dezelfde keyspace als de live BullMQ-pipeline** (`DBSIZE` was ~3058, waarvan ~3056 bull). Stel vóór Task 10 vast dat dit past binnen het geheugenbudget en het eviction-beleid van die Redis — een `allkeys-lru`-eviction zou live queue-sleutels kunnen verdringen. Bevindt zich hier een risico, dan een aparte DB-index of TTL-verlaging, en dat vastleggen.

10. **Geen regressie op de twee live paden die deze service delen (NIEUW).** AC4 (cachegedrag) en AC8 (sleutelvorm) wijzigen `t3777-declarations.ts`, dat óók de live review-prior (`artwork-pipeline.ts:754`) en de bootstrap-declaratieguard (`bootstrap-run.ts:450`) voedt. Given die wijzigingen, then blijven beide paden functioneel ongewijzigd — aangetoond met tests op de bestaande suites, niet alleen op het script. *Een cachewijziging die de bootstrap-guard breekt, breekt de oogst zelf.*
## Tasks / Subtasks

- [x] 1. **Per-GTIN budget** via `Promise.race` in `collectGtinData` (`:274-285`) — dekt body-read, Redis en Prisma. Een `.catch()` alléén lost de **hang** niet op (zie Weerlegde hypothesen), maar foutafhandeling is wél nodig: de race rejecteert bij timeout, en `parseDeclaredMarks` (`:495`) kan throwen. Dus: race mét catch, niet catch in plaats van race (AC2).
- [x] 2. **Body-read binnen de timer** brengen in `fetchTradeItemXml` (`clearTimeout` op `:132-134` vs `response.text()` op `:155`) (AC2).
- [x] 3. **Begrensde parallellisatie** met chunked `Promise.all` (patroon `artwork-pipeline.ts:404-413`) + backoff bij 429/5xx (AC9, AC6).
- [x] 4. **`closeRedisConnection()`** toevoegen en aanroepen; geen `process.exit()` (AC3).
- [x] 5. **Transiënte fouten niet 24h negatief cachen** (AC4) + **omgevingsdimensie** in de cachesleutel of cache-uit voor niet-default base (AC8).
- [x] 6. **Kwaliteitspoort** vóór `writeIndex`: 7a fataal bij `api-key-ontbreekt`, 7b foutratio, 7c krimpbeveiliging (AC7).
- [x] 7. **Voortgangsrapportage** met flush (AC5) + **globale deadline** `KEURMERK_INDEX_MAX_RUNTIME_MS` (AC9).
- [x] 8. **gln-consistentie**: de al bekende gln uit het universum meegeven aan de declaratie-resolutie i.p.v. de eigen `findFirst` zonder `orderBy` (`:468-472`) — spaart ~1862 DB-queries én dicht het determinisme-gat (AC6).
- [x] 9. **Testbaarheid**: `collectGtinData`/`loadGtinUniverse` exporteren/injecteerbaar maken; tests voor AC2 (stilvallende body + dode Redis), AC6 (concurrency-invariantie), AC7 (alle drie de poortvoorwaarden, incl. lege index bij ontbrekende API-sleutel), AC10 (review-prior + bootstrap-guard ongewijzigd).
- [x] 9b. **Bronvermelding in de index-metadata**: gebruikte `CATALOG_API_BASE`-host opnemen naast `builtAt`, zodat herleidbaar is op welke declaratiebron een index is gebouwd (besluit 2026-07-25).
- [ ] 10a. **Redis-voetafdruk controleren** vóór de verificatierun: past ~1862 `marks:*`-sleutels naast de live BullMQ-keyspace binnen geheugenbudget en eviction-beleid? Zo nee: aparte DB-index of lagere TTL, en vastleggen (AC9).
- [ ] 10. Verificatie: volledige droge run over ~1862 GTINs, klaar binnen 20 min zonder externe timeout; reden-verdeling in de Debug Log + **onderbouwing van de gekozen 7b-drempel** op basis van die verdeling.
- [ ] 11. **NIET in deze story:** live index herbouwen op ACC — aparte expliciete toestemming.

## Besluit (Friso, 2026-07-25): bouwen op STAGE-declaraties

**Bron = `CATALOG_API_BASE=https://catalog.stage.xxtract.com`.** Onderbouwing: stage lost 7/10 GTINs op, de ACC-catalog 0/10 (404's/500's) — stage is de enige bruikbare declaratiebron. Dit is de bestaande instelling op ACC; er verandert dus niets aan de configuratie.

**Gevolgen die hieruit volgen (verwerken tijdens dev):**
1. **AC8 is niet langer voorwaardelijk maar HARD.** We draaien per definitie tegen een andere base dan de code-default (`t3777-declarations.ts:69` = ACC). De omgevingsdimensie in de cachesleutel is daarmee de enige bescherming tegen het lekken van stage-declaraties naar de LIVE ACC-review-prior (`artwork-pipeline.ts:754`) en de bootstrap-declaratieguard (`bootstrap-run.ts:450`). Zonder AC8 mag de volledige run niet draaien.
2. **De index draagt een bronvermelding.** Neem de gebruikte `CATALOG_API_BASE` (host) op in de index-JSON-metadata naast `builtAt`, zodat later herleidbaar is op welke declaratiebron een index is gebouwd. *Uitzondering op de AC6-regel "geen nieuwe velden": dit is metadata, geen sleutel/telling, en raakt `buildIndex`' puurheid niet.*
3. **Bewust geaccepteerd risico:** de oogst op ACC wordt aangestuurd door declaraties uit stage. Als stage en ACC inhoudelijk uiteenlopen voor een GTIN, kan een keurmerk worden gezocht dat op het ACC-product niet gedeclareerd is. Dit is een aanvaard gevolg van de meting hierboven — géén reden om alsnog naar de ACC-default te wisselen (die levert 0/10). Herzie dit zodra de ACC-catalog wél declaraties teruggeeft.

## Dev Notes

- **`CATALOG_API_BASE=https://catalog.stage.xxtract.com` — BESLOTEN bron (Friso, 2026-07-25).** Gemeten op 10 GTINs: stage lost **7/10** op, de ACC-catalog **0/10** (404's/500's). De stage-instelling is dus functioneel noodzakelijk, maar de consequentie is niet doordacht: de code-default is ACC (`t3777-declarations.ts:69`) en de live beslispaden gebruiken ACC. Bouwen we de index op stage-declaraties? Dat is een inhoudelijke keuze plus een besmettingsrisico → AC8. **Niet stilzwijgend "corrigeren" naar de ACC-default** (dan lost 0/10 op).
- `printPlan` (`:287-301`) schrijft alles pas ná `collectGtinData`; door een pijp lijkt een lopende run volledig stil. Dat maakte de eerste diagnose onnodig moeilijk (AC5).
- Upstream levert legitiem 404 (onbekende GTIN) en 500 per GTIN (`:136-144`, beide fail-safe zonder throw) — die horen bij het normale beeld, niet bij de technische-foutratio van AC7.
- Low/optioneel: code-extractie uit de indexsleutel splitst aan tegengestelde kanten — `build-keurmerk-index.ts:192` (eerste `/`) vs `queue_harvest.py` (`rsplit("/",1)`, laatste `/`). Voor een code mét `/` wijken API en harvester af. Harmoniseren of vastleggen dat zulke codes niet voorkomen.
- [Source: 19-3-keurmerk-etiket-index-uit-declaraties.md; review-19-16.md; apps/api/src/scripts/build-keurmerk-index.ts; apps/api/src/services/t3777-declarations.ts; apps/api/src/services/pipeline/queue.ts]

## Dev Agent Record

### Context Reference
Diagnose 2026-07-22, aanleiding: "Verpakking & recycling" groen krijgen. De twee doelcodes leken geen oogstmateriaal te hebben; bij limiet 200 blijken ze er wél te zijn. De beperkende factor is de indexdekking, niet de corpus.

### Review-historie
- v1 (2026-07-22) → adversariële review `review-19-16.md`: **FAIL** (5 high, 7 medium, 4 low). Twee van de drie dragende diagnoses hielden geen stand tegen de code.
- v2 (2026-07-25): §4 van de review integraal doorgevoerd (AC2 en AC4 herschreven; AC7/AC8/AC9 toegevoegd; AC1/AC3/AC5/AC6 aangescherpt; afbakening en Dev Notes gecorrigeerd). Weerlegde hypothesen expliciet vastgelegd zodat ze niet terugkeren. Cachewerking zelfstandig geverifieerd (3 GTINs → 3 `marks:*`-sleutels).
- v3 (2026-07-25): her-review `review-19-16-v2.md` gaf opnieuw **FAIL** (2 high, 7 medium) — 13 van 18 oude bevindingen waren opgelost, maar de NIEUWE AC's bevatten zelf gaten. Doorgevoerd: AC7 uitgebreid naar drie voorwaarden (7a fatale configuratiefout — een ontbrekende API-sleutel liet anders een LEGE index de goede overschrijven; 7b kalibreerbare foutratio; 7c krimpbeveiliging), AC3 exitcode-conflict opgelost + `disconnect()` i.p.v. `quit()`, AC9 globale deadline (30s×1862÷3 ≈ 5 uur botste met de 20-minuteneis), AC8 ontsnappingsluik dichtgezet, AC10 toegevoegd (regressiepoort op de twee live paden), Task 1 genuanceerd (`parseDeclaredMarks` op :495 kán throwen).
- v4 (2026-07-25) — deze versie: review-ronde 3 (`review-19-16-v3.md`) gaf **FAIL, maar marginaal** (6 van 9 punten opgelost; 3 blokkerende zinnen). Kernvondst, met de eigen cijfers van deze story bewezen: **7c-krimpbeveiliging dicht het gat niet** — de bestaande index heeft 32 sleutels en bij 11% corpus meet deze story er al 40, dus een run die op 60% afkapt levert méér sleutels, passeert de poort en schrijft met exitcode 0 een onvolledige index weg. Doorgevoerd: **AC7d volledigheidsvoorwaarde** (blokkeert bij ≥1 `niet-verwerkt`, tenzij `--allow-partial`), randgeval 7c bij afwezige/onleesbare bestaande index (+ de benodigde lees-actie), AC1 expliciet verenigbaar gemaakt met de AC9-deadline (uitzonderingspad i.p.v. stille gedeeltelijke uitkomst), en de Redis-voetafdruk (~1862 sleutels naast de live BullMQ-keyspace) als controlepunt vóór de verificatierun.


### Debug Log References (implementatie 2026-07-26)
- **tsc**: 0 fouten.
- **Nieuwe suite** `build-keurmerk-index-19-16.test.ts`: **17 tests groen** (AC2 budget incl. hangende mediaserver + throw-pad; AC5 voortgang; AC6 concurrency-invariantie + gln-doorgifte; AC7 alle vier poortvoorwaarden; AC9 deadline; bronvermelding).
- **Bestaande 19.3-suite**: 13/13 groen (regressiepoort intact). Samen 86/86, 3× herhaald zonder afwijking.
- **RED-bewijs (tests hebben tanden)**: met 7a én 7d uitgeschakeld vallen exact die twee tests om (`expected true to be false` op de poort); na herstel weer groen en de code identiek aan vóór de ingreep.
- **Volledige api-suite**: 977 passed / 1 failed. Die ene is een **bestaande, belasting-afhankelijke flake** (`flywheel-control-cohort.atdd.test.ts`, time-out bij 5000ms), GEEN regressie — bewijs: dezelfde volledige suite op de **ongewijzigde `origin/acc`** gaf **7** falende tests, en de test slaagt geïsoleerd 3/3 op deze branch. Mijn branch presteert dus beter dan de basis.
- **ml-service**: niet geraakt (geen Python-wijziging), suite niet gedraaid.

### File List
- Gewijzigd: `apps/api/src/scripts/build-keurmerk-index.ts` (budget, concurrency, deadline, voortgang, poort, bronvermelding, schone afsluiting)
- Gewijzigd: `apps/api/src/services/t3777-declarations.ts` (timer dekt body-read; env-dimensie in cachesleutel; korte TTL voor transiënte fouten; optionele `knownGln`; parse-guard)
- Gewijzigd: `apps/api/src/services/pipeline/queue.ts` (`closeRedisConnection()`)
- Nieuw: `apps/api/src/__tests__/scripts/build-keurmerk-index-19-16.test.ts`

## Change Log
- 2026-07-22: Story aangemaakt (nazorg 19.3).
- 2026-07-25: Herschreven na adversariële review — verdict FAIL geadresseerd.
- 2026-07-26: Geïmplementeerd (alle 10 AC's). Status → review.
