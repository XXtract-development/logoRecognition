# Adversariële review ronde 3 — Story 19.16 v3 (Keurmerk-index over de volledige corpus)

reviewed_artifact: `_bmad-output/implementation-artifacts/19-16-indexbouwer-volledige-corpus.md` (v3, 2026-07-25, status ready-for-dev)
previous_reviews: `review-19-16.md` (FAIL, F1–F18) · `review-19-16-v2.md` (FAIL, N1–N13)
reviewed_code: `apps/api/src/scripts/build-keurmerk-index.ts`, `apps/api/src/services/t3777-declarations.ts`, `apps/api/src/services/pipeline/queue.ts`, `apps/api/src/api/v1/artwork-pipeline.ts`
reviewer: adversarial (code-geverifieerd, niets geïmplementeerd)
datum: 2026-07-25

**VERDICT: FAIL** — marginaal. Drie zinnen scheiden deze story van PASS; al het overige is dev-klaar.

severity_count (nieuw): critical 0 · high 1 · medium 4 · low 7 · info 1
Blokkerend voor dev: **3** (V1, V2, V3). De overige 9 zijn "tijdens dev".

Voortgang t.o.v. ronde 2: **6 van 9 N-bevindingen volledig opgelost**, 3 deels. De story is inhoudelijk sterk verbeterd; de resterende gaten zitten uitsluitend in de koppeling tussen de nieuwe AC9-deadline en de AC7-poort.

---

## 1. Status N1–N9 (ronde 2)

| # | Sev (v2) | Status in v3 | Bewijs uit v3 / code |
|---|---|---|---|
| N1 | high | **deels** | AC7a: "Bij ≥1 `api-key-ontbreekt` stopt de run onmiddellijk" — het scenario dat N1 beschreef (lege index bij ontbrekende sleutel) is **dicht**. 7c ("Given `distinctKeys` of `gtinsWithData` **lager** ligt dan de bestaande index, then niet overschrijven tenzij `--allow-shrink`") is een correcte generieke vangnet-formulering. **Twee lekken resteren:** (a) `gln-ontbreekt` wordt in 7a wél genoemd ("telt NIET als normale uitkomst") maar krijgt géén actie en géén bovengrens — v2 §4.1(b) vroeg daar expliciet om; (b) de door AC9 geïntroduceerde uitkomst `niet-verwerkt` glipt door alle drie de poorten heen (zie V1). |
| N2 | high | **opgelost** | AC3: "**Gebruik `disconnect()`, niet `quit()`** … `quit()` wacht op openstaande commando's, en een `Promise.race`-timeout annuleert het onderliggende commando niet". Technisch **juist** tegen ioredis-semantiek: `quit()` stuurt QUIT en wacht op de nog openstaande replies; bij een dode verbinding belandt QUIT zelf in de offline-queue, en met `maxRetriesPerRequest: null` (`queue.ts:81`) rejecteert die nooit. `disconnect()` verbreekt direct. Exitcode-tegenspraak **opgelost**: AC3 zegt nu letterlijk "exitcode **0 bij succes** en **≠ 0 wanneer de AC7-poort de write blokkeerde**". Restpunten (V12, V3) zijn klein. |
| N3 | medium | **deels** | AC9: "`KEURMERK_INDEX_MAX_RUNTIME_MS` (default 20 min)". Rekensom is nu **sluitend**: de 5-uur-worstcase kan niet meer optreden, de 20 min is "een **harde grens**, geen verwachting". **Maar** het gedrag ná de deadline is niet eenduidig aan AC7 gekoppeld: AC9 stelt "levert dat resultaat verplicht aan de AC7-poort aan (waar 7c-krimpbeveiliging het overschrijven blokkeert)" — die bewering is met de eigen cijfers van de story **onjuist** (V1). Tweede helft van v2 §4.3 ("backoff-pogingen vallen **binnen** het per-GTIN-budget") is nergens vastgelegd (V-info). |
| N4 | medium | **opgelost** | AC3 bevat de uitzondering expliciet, inclusief motivatie: "géén tegenspraak met 'schoon afsluiten'; de run is dan geslaagd ín zijn oordeel, maar het resultaat is afgekeurd". Geen twee tests kunnen elkaar meer tegenspreken. |
| N5 | medium | **deels** | AC10 toegevoegd: "blijven beide paden functioneel ongewijzigd — aangetoond met tests op de bestaande suites". Dat dekt de *functionele* regressie. Niet gedekt is wat v2 §4.5 expliciet vroeg: dat `fetchTradeItemXml` de HTTP-status moet gaan doorgeven en of de AC9-backoff **wel/niet** in het live pad mag landen (zie V7). |
| N6 | medium | **opgelost** | AC8 kop: "(NIEUW — **één verplichte uitvoering, geen keuzemenu**)" + "Geen alternatieven, geen 'of documenteer het'". Het derde alternatief is weg. Het openstaande besluit stage-vs-ACC is nu expliciet begrensd tot de herbouw ("Open besluit voor Friso (blokkeert dev NIET, wél de latere herbouw)") en de Dev Notes maken de dev-keuze eenduidig ("stage … functioneel noodzakelijk … Niet stilzwijgend 'corrigeren' naar de ACC-default"). Aanvaardbaar: de herbouw valt buiten scope. |
| N7 | medium | **opgelost** | AC7b: "Default **5%**, met de expliciete opdracht deze te kalibreren op de reden-verdeling uit de eerste volledige droge run … en de gekozen waarde te onderbouwen in de Debug Log" + Task 10 verplicht die onderbouwing. Alleen de taakverwijzing klopt niet (V9). |
| N8 | medium | **niet opgelost** | v3 bevat geen enkele AC/Task over de Redis-voetafdruk van een 1862-sleutels-run in dezelfde keyspace als de live BullMQ-pipeline; de restobservatie (DBSIZE 4840→3058) blijft "Niet als bug behandelen zonder nieuw bewijs". AC8 **vergroot** de voetafdruk (nieuwe env-sleutelnaamruimte naast de oude, die pas via TTL verloopt). Zie V6. |
| N9 | medium | **opgelost** | Task 1: "Een `.catch()` alléén lost de **hang** niet op …, maar foutafhandeling is wél nodig: de race rejecteert bij timeout, en `parseDeclaredMarks` (`:495`) kan throwen. Dus: race mét catch, niet catch in plaats van race." Weerlegde hypothese §2 is identiek genuanceerd. Code-check: `parseDeclaredMarks(xml)` op `:495` staat inderdaad als enige aanroep buiten try/catch. |

Lows uit ronde 2: **N10 opgelost** (Task 8 draagt de gln-consistentie nu op), **N11 niet opgelost** → nu dragend, zie V2, **N12** blijft cosmetisch (de 3-GTIN-proef wordt nog steeds "Empirisch bevestigd" genoemd; onschadelijk), **N13 vervallen** (de citaat-range `artwork-pipeline.ts:404-413` eindigt exact op de `await Promise.all(...)`-regel; het patroon zit erin).

**Telling: opgelost 6 · deels 3 (N1, N3, N5) · niet opgelost 1 (N8).**

---

## 2. Nieuwe bevindingen v3

| # | Locatie | Bevinding | Severity |
|---|---|---|---|
| V1 | AC9 (deadline) × AC7b/7c × AC1 | **De deadline-uitkomst glipt door de hele kwaliteitspoort.** AC9 belooft dat 7c een afgekapte run blokkeert, maar dat is met de eigen cijfers van de story onwaar: de live index heeft **32 sleutels**, en bij 200 GTINs (11%) meet de story al **40 sleutels**. Een run die op 60% de deadline raakt levert ruim méér sleutels dan de bestaande index → 7c grijpt niet, 7b telt `niet-verwerkt` niet mee (alleen `api-fout`/`timeout`), 7a raakt het niet → een **onvolledige** index overschrijft de goede, met exitcode **0** (AC3: "0 bij succes"). Precies de schadeklasse die AC7 moest afdekken. | **high** |
| V2 | AC7c ("t.o.v. de bestaande index") + `build-keurmerk-index.ts:304-309` | **Het enige vangnet is ongedefinieerd in zijn eigen randgeval.** 7c vereist een MinIO-**lees**actie die het script vandaag niet heeft (`writeIndex` is de enige aanraking van `INDEX_OBJECT_KEY`); wat er gebeurt bij een ontbrekende, corrupte of onleesbare bestaande index (eerste bouw, MinIO-hikje) staat nergens. Dit was N11 (low) en is nu dragend, want 7c is de generieke backstop voor N1/V1. Dev moet raden: doorlaten of blokkeren. | medium |
| V3 | AC1 ("doorloopt alle GTINs … eindigt binnen de wandkloklimiet uit AC9") vs AC9 | **AC1 is niet aftekenbaar in de deadline-modus.** AC1 eist dat de run *alle* GTINs doorloopt; AC9 staat toe dat hij bij de deadline stopt met de rest als `niet-verwerkt`. Voor de enige verificatie die deze story kent (Task 10, droge run over ~1862 GTINs) is dus onbepaald of een run die op 20 min afkapt AC1 **haalt**, en welke exitcode een afgekapte **droge** run krijgt (de AC7-poort draait daar niet, dus per AC3 wordt dat 0 = "succes"). | medium |
| V4 | AC7 slotbullet + AC5 | `niet-verwerkt` ontbreekt in de verplichte reden-enumeratie van AC7 ("ok/404/lege-declaratie/api-fout/timeout/api-key-ontbreekt/gln-ontbreekt") en in de teller van 7b; AC5's "reden-verdeling tot dan toe" is generiek genoeg, maar de twee lijsten lopen daarmee uiteen. | low |
| V5 | AC7a + Task 8 | `gln-ontbreekt` krijgt in 7a het label "telt NIET als normale uitkomst" zonder actie of bovengrens, terwijl Task 8 (gln uit het universum meegeven) die reden in het scriptpad juist vrijwel **onmogelijk** maakt — `loadGtinUniverse` filtert al op `gln: { not: null }` (`:251-256`). Tegenstrijdig signaal; dev moet raden of hij hierop moet aborten, tellen of niets doen. | low |
| V6 | ontbrekende AC (N8 onopgelost) + `queue.ts:79` + AC8-migratie | De verificatierun schrijft ~1862 cache-sleutels met 24 h TTL in **dezelfde Redis-keyspace als de live BullMQ-pipeline** (één singleton, `REDIS_URL` zonder db-suffix; gebruikt door `trigger.ts`, `verify-flow.ts`, `workers.ts`). AC8 verdubbelt tijdelijk de naamruimte. Niets meet of begrenst dit, terwijl de eerder waargenomen DBSIZE-daling juist op eviction wees. | medium |
| V7 | AC10 vs AC9-backoff + `t3777-declarations.ts:136-144` | AC10 borgt alleen "functioneel ongewijzigd". Backoff (3 pogingen, exponentieel) in het gedeelde `fetchTradeItemXml` verandert de live review-prior en de **harde** bootstrap-guard niet functioneel maar wél in latentie (van ~10 s naar tientallen seconden per GTIN bij 5xx). Story zegt niet of backoff script-lokaal of service-breed is; ook niet dat `fetchTradeItemXml` de HTTP-status moet gaan doorgeven (nu collapst alles ≥400 naar `api-fout`, `:141-144`) — terwijl 429/5xx-onderscheid daarvoor nodig is. | medium |
| V8 | AC8 "Migratiegedrag" | Het negeren van sleutels zonder env-dimensie veroorzaakt na deploy een eenmalige cache-miss-golf op de live paden (bootstrap-declaratieguard, review-prior): elk van die GTINs doet weer een catalog-call van max 10 s. Functioneel conform AC10, operationeel niet benoemd. | low |
| V9 | AC7b "(Task 9)" | Verkeerde taakverwijzing: de kalibratie/onderbouwing zit in **Task 10** ("onderbouwing van de gekozen 7b-drempel"); Task 9 is testbaarheid. Hernummeringsrestje. | low |
| V10 | AC2/AC9 vs `t3777-declarations.ts:43-49` | `timeout` en `niet-verwerkt` bestaan niet in `DeclarationReason` (`'ok' \| 'api-key-ontbreekt' \| 'gln-ontbreekt' \| '404-mogelijk-TM-mismatch' \| 'api-fout' \| 'lege-declaratie'`), en de story schrijft "404" waar het literal `404-mogelijk-TM-mismatch` is. Nergens staat dat deze twee redenen **script-lokaal** moeten blijven — verbreding van de union raakt AC10's vocabulaire-belofte. | low |
| V11 | `build-keurmerk-index.ts:78-85, 274-285` | Restant van F10: `GtinData` heeft nog steeds geen `reason`, `collectGtinData` gooit `marksResult.reason` weg, en geen Task draagt die plumbing op — terwijl AC2, AC5 en AC7 er alle drie op leunen. Afleidbaar, maar niet opgeschreven. | low |
| V12 | AC3 + `queue.ts:75-88` | `closeRedisConnection()` komt in de **gedeelde** `queue.ts` te staan naast `getRedisConnection()`, die door `trigger.ts`/`verify-flow.ts`/`workers.ts` wordt gebruikt. AC3 zegt niet dat de helper de module-singleton op `null` moet zetten (anders blijft een disconnected client gecached) noch dat hij alleen door scripts mag worden aangeroepen. | low |
| V13 | AC9 (3 pogingen) vs AC2 (30 s/GTIN) | v2 §4.3 vroeg expliciet vast te leggen dat backoff-pogingen **binnen** het per-GTIN-budget vallen; v3 zegt daar niets over. Onschadelijk geworden door de globale deadline, maar nog steeds een keuze die de dev zelf maakt. | info |

---

## 3. Implementeerbaar zonder nieuwe aannames?

**Bijna.** Punten waarop een dev vandaag nog moet raden, in volgorde van gewicht:

1. Wat doet de poort met een run die de deadline raakte (write of niet)? — V1
2. Wat doet 7c als er geen leesbare bestaande index is? — V2
3. Haalt een afgekapte droge run AC1, en met welke exitcode? — V3
4. Wat te doen met `gln-ontbreekt` (aborten / tellen / negeren)? — V5
5. Landt de 429/5xx-backoff in het gedeelde live pad of alleen in de indexbouwer? — V7
6. Waar leven `timeout`/`niet-verwerkt` (script-lokaal vs `DeclarationReason`)? — V10
7. Hoe komt `reason` van `resolveDeclaredMarks` naar de reden-verdeling? — V11

Alles daarbuiten (timeoutwaarden, chunk-patroon, cachesleutel-vorm, testopzet, exportbaarheid, gln-consistentie) is expliciet en toetsbaar vastgelegd.

---

## 4. Blokkeert dev vs tijdens dev

### Blokkeert dev — moet vóór dev in de story (3 zinnen)

1. **V1 — voeg een volledigheidsvoorwaarde toe aan AC7** (bv. 7d): "Given ≥1 GTIN heeft reden `niet-verwerkt`, then wordt de index niet overschreven (echte bouw) en eindigt het proces met exitcode ≠ 0." Schrap tegelijk de onjuiste bewering in AC9 dat 7c dit afvangt, en neem `niet-verwerkt` op in de reden-enumeratie van AC7 (V4).
2. **V2 — definieer 7c's randgeval**: "Kan de bestaande index niet worden gelezen of geparsed, dan geldt dat als blokkade (geen write) tenzij `--allow-shrink`/`--first-build` expliciet is meegegeven." Benoem dat het script daarvoor een lees-actie op `INDEX_OBJECT_KEY` krijgt (die bestaat nog niet).
3. **V3 — maak AC1 verenigbaar met AC9**: "…doorloopt alle GTINs, óf stopt conform de deadline van AC9 met de rest als `niet-verwerkt`; in dat geval geldt AC1 als **niet** gehaald en eindigt ook de droge run met exitcode ≠ 0."

### Vóór de verificatierun (Task 10), niet vóór het coderen

4. **V6 — Redis-voetafdruk.** Eén regel in AC4 of Task 10: de run logt het aantal geschreven sleutels en DBSIZE vóór/na, en gebruikt voor de indexrun een eigen (kortere) TTL of prefix. De verificatierun raakt live ACC-Redis; dit is de enige onopgeloste bevinding uit ronde 2.

### Tijdens dev oplosbaar (documenteren in de Debug Log)

- **V7** — kies backoff script-lokaal (aanbevolen) of service-breed; als service-breed: meet de latentie-impact op de bootstrap-guard. Geef `fetchTradeItemXml` een status-doorgifte.
- **V5** — behandel `gln-ontbreekt` als normale, te loggen uitkomst met een gerapporteerde bovengrens (na Task 8 hoort hij ~0 te zijn).
- **V8** — vermeld de eenmalige cache-miss-golf in de release-notitie.
- **V9** — corrigeer "(Task 9)" → "(Task 10)".
- **V10, V11, V12, V13** — implementatiedetails; kies en documenteer.

---

## 5. Eindoordeel

v3 is opnieuw een echte verbetering: de kwaliteitspoort heeft drie onafhankelijke voorwaarden, de afsluiting is technisch correct gespecificeerd (`disconnect()` is de juiste keuze tegen ioredis-semantiek), de exitcode-tegenspraak is weg, de rekensom van AC2/AC9 klopt dankzij de globale deadline, het AC8-ontsnappingsluik is dicht en AC10 bewaakt de twee live paden. Zes van negen bevindingen zijn volledig afgehandeld, geen enkele is genegeerd.

De FAIL komt uit één plek: de **nieuwe** deadline van AC9 introduceert een uitkomst (`niet-verwerkt`) die door de poort van AC7 heen glipt — en de story beweert het tegendeel, terwijl haar eigen achtergrondcijfers (40 sleutels bij 11% corpus vs 32 in de live index) aantonen dat de krimpbeveiliging hier niet grijpt. Daarbovenop is diezelfde krimpbeveiliging ongedefinieerd zodra de bestaande index niet leesbaar is, en botst AC1 letterlijk met AC9.

Dit zijn drie zinnen tekst. Na doorvoeren van §4 punten 1-3 (plus punt 4 vóór de verificatierun) is de story dev-klaar; een vierde volledige review is niet nodig — een delta-check op AC1/AC7/AC9 volstaat.
