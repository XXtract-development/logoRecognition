# Adversariële CODE-HER-REVIEW — Story 19.16 (indexbouwer volledige corpus)

```yaml
reviewed_commit: da53484
branch: epic/19-16-indexbouwer
base: origin/acc
remediation_diff: 46ddb93..da53484
verdict: PASS            # deploy-poort: niets in deze diff blokkeert de acc-deploy
deploy_gate: PASS
story_done_gate: FAIL    # AC9 is inhoudelijk nog steeds niet ingelost (N1)
severity_count:
  critical: 0
  high: 1                # N1 — de nieuwe backoff is in productiecondities een no-op
  medium: 2              # N2, N3
  low: 5                 # N4-N8
previous_findings: 3 high (2 opgelost, 1 deels) · 7 medium (3 opgelost, 3 deels, 1 niet) · 7 low (0 opgelost)
```

## Zelf uitgevoerde verificatie

| Actie | Uitkomst |
|---|---|
| `npx tsc --noEmit` (apps/api) | 0 fouten |
| nieuwe + bestaande story-suites (`build-keurmerk-index-19-16`, `t3777-declarations-19-16`, `t3777-declarations`) | 63 passed / 0 failed |
| AC10-live-paden (`flywheel-bootstrap-run`, `verify-flow`) | 53 passed / 0 failed |
| **volledige api-suite** | 997 passed / **1 failed** (`artwork-detection-orchestration.test.ts`, 5000ms-timeout) |
| die ene fail geïsoleerd | **17/17 passed** → belastingsafhankelijke, bestaande flake; geen regressie |
| `grep loadGtinUniverse` over de hele repo | 1 definitie + **1 aanroeper** (`:688`), beide meegegaan |
| `grep closeRedisConnection` | 1 definitie + 1 aanroeper (script `:771`) + 1 mock in de test |
| **eigen wegwerp-test** op de echte `resolveDeclaredMarks` met een 503-fetch, 3× aangeroepen | **`fetch` slechts 1× aangeroepen** → bewijs voor N1 (test daarna verwijderd, worktree schoon) |

---

## Vorige bevindingen → status

| # | Vorige bevinding | Status | Code-bewijs |
|---|---|---|---|
| **H1** | hang keert terug via een NIEUWE Redis-verbinding na `closeRedisConnection()` | **opgelost** (klein residu → N5) | `queue.ts:77` `let redisShutdown = false`; `:83` `if (redisShutdown && redisConnection) return redisConnection;` `:118-124` referentie bewust NIET meer op `null`. `closeRedisConnection` keert vroeg terug bij `!redisConnection` (`:110`), dus de vlag wordt alleen niet gezet als er nóóit een verbinding was — en dan bestaat er ook geen laat Redis-commando (elke GTIN passeert `marksCacheRead` vóór de fetch, en `loadGtinUniverse` filtert lege gln weg op `:295`). Na `disconnect()` staat ioredis op status `end` → late commando's rejecten direct met "Connection is closed", die worden gevangen in `t3777-declarations.ts:488-494` / `:515-520`. Vlag is procesbreed; dat is hier juist, want de aanroep staat uitsluitend in het script. |
| **H2** | limiet kapt het universum stil af, poort merkt het niet | **opgelost** | `build-keurmerk-index.ts:270-302` — `loadGtinUniverse` geeft `{entries,total,truncated}`. **`total` wordt ná de dedup geteld** (`all` wordt gevuld ná de `seen`-check op `:296-298`, `total: all.length` op `:301`) → correct distinct-getal, geen dubbeltelling. `GateInput.universeTotal` (`:525`), 7d blokkeert op `cutByLimit = universeTotal − universeSize > 0` (`:583-591`). Enige aanroeper (`:688`) is meegegaan; geen andere scripts/tests gebruiken de functie. Tests `:267-296` (blokkeert / gaat door zonder afkap / `--allow-partial` forceert). Extra waarschuwing bij start op `:695-700`. |
| **H3** | AC9-backoff (max 3 pogingen bij 429/5xx) ontbreekt | **deels — zie N1** | Retry-lus bestaat nu: `:465-487`, `backoffDelayMs` `:380-382` (500/1000/2000ms), `getMaxRetries` default 2 → 3 pogingen `:374-377`, deadline wordt gerespecteerd (`:468`, check vóór élke herkansing). Tests `:317-344` + `:346-358`. **Maar**: in productiecondities bereikt de herkansing upstream niet (negatieve cache, N1), en er wordt geretried op élke `api-fout` — inclusief 401/403/400. De bewering "429 en 5xx zijn niet te onderscheiden" is *waar voor de huidige interface* (`fetchTradeItemXml` platst alles ≥400 op `api-fout`, `t3777-declarations.ts:159-162`), maar die interface is in deze story zelf aangepast; de statuscode doorgeven was mogelijk geweest. |
| **M1** | errorRate-noemer = universeSize | **opgelost** | `:565-572` `processed = universeSize − reasons['niet-verwerkt']`, guard `processed > 0`, noemer expliciet in de blokkeertekst. Test `:298-315` (90% meet als 90%, niet 4,8%). |
| **M2** | AC2-bewijstests (stilvallende body + dode Redis) ontbreken | **deels** | Body-abort: **echt bewezen** — `t3777-declarations-19-16.test.ts:88-120` start een écht `http.createServer` dat headers + `<x>` stuurt en nooit `end()` aanroept, met de echte `fetch` en de echte `AbortController`. Draai de fix terug (`clearTimeout` in de fetch-`finally`) en deze test loopt in de 20s-testtimeout. Dat is een geldige regressiepoort. **De tweede verplichte test — een niet-antwoordende Redis — bestaat nog steeds niet**; `redisGet`/`redisSetex` resolven in álle tests direct. |
| **M3** | `catalogEnvTag` weggemockt, nul dekking op de echte functie | **opgelost (met nit)** | `t3777-declarations-19-16.test.ts:52-86` gebruikt de **echte** functie (geen mock op de service), incl. stage/acc/rare URL/localhost, plus een test die aantoont dat stage- en acc-runs twee gescheiden entries opleveren. TTL-dekking: `:133-145` (`api-fout` ≤300s, 404 >300s). Nit: de exacte sleutelvorm `marks:stage:{gln}:{gtin}:528` wordt niet gepind, alleen `includes(':stage:')`. De oude suite mockt `catalogEnvTag` nog wel (`build-keurmerk-index-19-16.test.ts:22`) — acceptabel nu de echte functie elders gedekt is. |
| **M4** | 30s × concurrency 3 maakt de 20-min-deadline onhaalbaar; geen `min(budget, deadline−now)` | **niet opgelost — en verergerd** | `:430` `gtinTimeoutMs` default nog steeds 30_000 (`:310`), geen clamp op het resterende tijdsbudget. Zie N3: met 2 herkansingen kost één hangende GTIN nu ~91,5s i.p.v. 30s. |
| **M5** | AC10 eist tests op de bestaande live-suites | **deels** | Nieuwe service-tests `t3777-declarations-19-16.test.ts:148-188` leggen het één-argument-pad vast (DB-lookup wél/niet, lege `knownGln`, never-throws). Dat dekt het feitelijke risico. Maar de AC vroeg tests **op de bestaande suites** (`flywheel-bootstrap-run.test.ts`, artwork-pipeline); die zijn ongewijzigd. |
| **M6** | timer dekt nu headers + body op 4 live paden, zonder meting | **deels (gemitigeerd)** | `t3777-declarations.ts:59-70` — `CATALOG_FETCH_TIMEOUT_MS`, **default nog steeds 10_000** (geverifieerd: `:69`). Instelbaar ≠ gemeten: geen header/body-splitsing, geen cijfer over XML-groottes, en de env-var staat nergens gezet of gedocumenteerd (geen `CATALOG_*` in `.env.example` — dat is overigens conform de bestaande praktijk in deze repo). Het risico (grote XML op trage lijn → `api-fout` in de bootstrap-**hard**guard) blijft ongemeten. |
| **M7** | AC4 "logt cache-hits/-misses" ontbreekt | **opgelost (met nit)** | `t3777-declarations.ts:460-465` (`marksCacheStats` + `resetMarksCacheStats`), tellers op `:592` / `:595`, eindregel in `build-keurmerk-index.ts:735`. Test `:122-131`. Nit: staat niet in de voortgangsregel (AC5) en wordt vervuild door N4. |
| **L1** 7a stopt niet "onmiddellijk" | | **niet opgelost** | `:554-556` ongewijzigd. |
| **L2** `withBudget` labelt een rejection als `timeout` | | **niet opgelost** (licht verergerd) | `:387-401` ongewijzigd; rejections worden nu bovendien als "transiënt" geretried (`:486`). |
| **L3** `catalogEnvTag` fragiel bij IP/poort/prod-host | | **niet opgelost** | `:444-453` ongewijzigd; het gedrag is nu wel vastgelegd in tests. |
| **L4** default-base gedupliceerd in `main()` | | **niet opgelost** | `:686` `'https://catalog.acc.xxtract.com'` nog steeds gedupliceerd, zonder de trailing-slash-normalisatie van `readEnv()`. |
| **L5** `downloadTrainingObject` → `null` bij zowel ontbreken als leesfout | | **niet opgelost** | `:616-630` ongewijzigd. |
| **L6** usage-docblock noemt de nieuwe vlaggen/env-knoppen niet | | **niet opgelost** (zie N6) | `:13-16` ongewijzigd; `KEURMERK_INDEX_RETRIES` is er als zevende ongedocumenteerde knop bijgekomen. |
| **L7** voortgangsregel toont 5 van de 8 redenen | | **niet opgelost** | `:502-506` ongewijzigd (`printPlan` `:648-655` toont wél alle acht). |

---

## Nieuwe bevindingen

### High

**N1 — `apps/api/src/services/t3777-declarations.ts:590-594,621` + `build-keurmerk-index.ts:465-487` — de nieuwe AC9-backoff bereikt upstream niet: de negatieve cache serveert elke herkansing zelf, dus 429/5xx worden nog steeds bij de eerste poging als fout geteld — high**

`resolveDeclaredMarks` schrijft ook een `api-fout` naar de cache (`:621`, TTL 300s via `ttlForReason`), en leest de cache vóór de fetch (`:590`). De herkansing in `collectGtinData` roept dezelfde functie opnieuw aan met dezelfde sleutel → **cache-hit** → identieke `api-fout` zonder netwerkverkeer. Herkansingen 2 en 3 kunnen dus per definitie niet slagen zolang Redis werkt (= de productiesituatie).

Empirisch bewezen met een wegwerp-test tegen de **echte** service (mock alleen op Redis/Prisma): drie opeenvolgende `resolveDeclaredMarks`-aanroepen met een 503-stub leverden **één** `fetch`-aanroep. De backoff werkt uitsluitend wanneer Redis stuk is — precies het scenario waarin je hem het minst nodig hebt.

De bestaande test die "hij probeert opnieuw en slaagt alsnog" claimt (`build-keurmerk-index-19-16.test.ts:318-331`) bewijst dit niet: die suite mockt de héle `t3777-declarations`-module weg, dus de cachelaag komt er niet in voor. Dit is exact de "test toetst de mock, niet de code"-klasse uit de vorige ronde (M3), nu op een andere plek.

Wat moet wijzigen (één van): de `api-fout` niet cachen (of alleen na de laatste poging), óf `resolveDeclaredMarks` een `skipCache`/`bypassCache`-optie geven die de herkansing gebruikt, óf de retry in `fetchTradeItemXml` leggen (onder de cache) i.p.v. in het script. Dat laatste lost meteen N2 op.

**Blokkeert de acc-deploy niet** (het script draait handmatig en faalt gesloten), maar AC9 is hiermee nog steeds niet ingelost — dit moet vóór Task 10 (de echte corpus-run) en vóór `done`.

### Medium

**N2 — `build-keurmerk-index.ts:465-487` — de herkansing draait de HELE samengestelde stap opnieuw (inclusief `discoverArtwork`) terwijl de verliezer van de vorige poging niet geannuleerd is → tot 3× `concurrency` gelijktijdige upstream-aanroepen, boven de door AC9 gestelde harde max van 8 — medium**

`withBudget` annuleert niets (`:387-401`, ongewijzigd). Een GTIN die op 30s time-out gaat, hangt vrijwel altijd in `mediaServerClient.discoverArtwork` (axios-timeout 60s; de catalog-fetch breekt zichzelf al op 10s af). De herkansing start een **tweede** mediaserver-aanroep terwijl de eerste nog loopt, en de derde een derde. Met de default `concurrency: 3` kunnen dus 9 mediaserver-verzoeken tegelijk openstaan, terwijl AC9 3 als default en 8 als harde bovengrens stelt (`:311`). Retry op sub-stapniveau (alleen de declaratie) of een `AbortController` per poging lost dit op.

**N3 — `build-keurmerk-index.ts:465-487` + `:430` — de herkansingen vermenigvuldigen het per-GTIN-budget tot ~91,5s; M4's haalbaarheidsprobleem wordt daarmee ~3× erger, zonder clamp op het resterende tijdsbudget — medium**

Worst case per GTIN is nu `(maxRetries+1) × gtinTimeoutMs + Σbackoff` = 3 × 30s + 1,5s ≈ **91,5s** (de `sleep` op `:469` valt buiten `withBudget`). Met de eigen cijfers uit de story (1862 GTINs, ~1,5s/GTIN, 621 chunks) kost 5% time-outs — precies de 7b-drempel die als "nog gezond" geldt — nu ~93 × 91,5s ≈ **142 min** extra i.p.v. de eerder becijferde 46 min. De 20-minutendeadline wordt dan gehaald, 7d blokkeert, en er wordt niets geschreven.

De AC9-**grens** zelf houdt wél stand: `:468` controleert de deadline vóór élke herkansing, dus de overschrijding blijft begrensd op één `gtinTimeoutMs` + één backoff (~32s). Dat is netjes. Het probleem is de haalbaarheid, niet de grens. De in de vorige ronde geadviseerde clamp `min(gtinTimeoutMs, deadline − now)` is niet geïmplementeerd, en `KEURMERK_INDEX_GTIN_TIMEOUT_MS` staat nog op 30s terwijl de onderliggende fetch al op 10s afbreekt.

### Low

- `t3777-declarations.ts:592` + `build-keurmerk-index.ts:735` — elke herkansing die op de negatieve cache landt (N1) telt als **hit**, dus de AC4-eindregel "X hits / Y misses" overrapporteert de cache-effectiviteit systematisch bij een run met veel fouten — low
- `queue.ts:110,124` — `redisShutdown` wordt alleen gezet wanneer er al een verbinding bestond, en kan nooit meer worden teruggedraaid: er is geen `resetRedisConnection()` voor tests en geen herstelpad als de vlag ooit in het API-proces wordt gezet (vóór 19.16 was dat zelfhelend via `null`). Zet de vlag onvoorwaardelijk (vóór de vroege return) en voeg een reset toe — low
- `build-keurmerk-index.ts:13-16, 260-263` — met de default `KEURMERK_INDEX_LIMIT=500` en 1862 GTINs blokkeert 7d nu **altijd**, dus de in de docblock gedocumenteerde standaardaanroep eindigt voortaan gegarandeerd op exitcode 1. Fail-closed en luid gelogd (`:695-700`), maar de docblock is daarmee misleidend en noemt nog steeds geen enkele van de zeven env-knoppen of de twee vlaggen — low
- `t3777-declarations-19-16.test.ts:106-113` — de body-aborttest asserteert alleen een **boven**grens (`elapsed < 5000`). Zonder ondergrens (bv. `>= 500`) zou hij ook slagen als het verzoek om een heel andere reden meteen faalt (verkeerde poort, connection refused) — de test zou dan stilzwijgend niets meer bewijzen — low
- `build-keurmerk-index.ts:286-302` — het nieuwe `total`/`truncated`-rekenwerk zelf heeft geen enkele test; alleen `evaluateGate` wordt met handmatig ingevoerde getallen getoetst. Ik heb de dedup-volgorde met de hand geverifieerd (dedup vóór de telling, dus `total` is correct distinct), maar een regressie hierin wordt door niets gevangen — low

---

## Blokkeert deploy vs. mag later

**Blokkeert de acc-deploy: niets.**

Onderbouwing per gewijzigd LIVE pad (de enige onderdelen die auto-deploy raken; het script draait uitsluitend handmatig):

| Wijziging | Live impact | Oordeel |
|---|---|---|
| `fetchTimeoutMs()` dekt nu headers + body | 4 call-sites (review-prior, bootstrap-guard, verify-flow, nutriscore-map). **Default onveranderd 10s** (`:69`), nu bovendien via env te verruimen zonder deploy | acceptabel; zie aanbeveling |
| env-segment in de cachesleutel | eenmalige koude cache na deploy (refetch), geen foute uitkomsten | acceptabel |
| `marksCacheStats` (procesbrede mutable state) | twee JS-getallen die alleen ophogen; single-threaded, geen geheugengroei, geen lezer in de server | ongevaarlijk |
| `redisShutdown` in `queue.ts` | alleen bereikbaar via `closeRedisConnection()`, en die staat uitsluitend in de `require.main`-guard van het script | ongevaarlijk (latent: zie N5) |
| `printPlan`-signatuur | niet geëxporteerd, één aanroeper | ongevaarlijk |
| `retries`-optie in `collectGtinData` | alleen script-pad | ongevaarlijk |

Volledige api-suite: 997 passed, 1 belastingsafhankelijke bestaande flake die geïsoleerd 17/17 slaagt. `tsc` schoon.

**Aanbeveling bij de deploy (geen blokker):** zet `CATALOG_FETCH_TIMEOUT_MS=20000` op de acc-API als goedkope hedge voor M6, tot de XML-groottes gemeten zijn.

**Mag later — maar wél vóór `done` / vóór de echte corpus-run (Task 10):**

1. **N1** (high) — de backoff werkt niet door de negatieve cache; AC9 blijft onvervuld.
2. **N2** (medium) — retry omzeilt de AC9-belastingsgrens (tot 9 gelijktijdige upstream-aanroepen).
3. **N3 / M4** (medium) — budget-clamp op de resterende tijd + een onderbouwd lager `KEURMERK_INDEX_GTIN_TIMEOUT_MS`; anders haalt de volledige run de 20 minuten niet zodra er enkele procenten time-outs zijn.
4. **M2-rest** (medium) — de tweede door AC2 verplichte bewijstest (niet-antwoordende Redis).
5. **M6** (medium) — meet de XML-groottes of splits de header-/body-deadline.

**Mag echt later (kosmetisch/hygiëne):** M5-rest (tests in de bestaande live-suites), M3-nit (exacte sleutelvorm pinnen), M7-nit (hits/misses in de voortgangsregel), alle zeven lows uit ronde 5 (L1-L7) en N4-N8.

---

## Wat er goed is (expliciet)

- **H2 is grondig opgelost**, niet cosmetisch: `total` wordt ná de dedup geteld, de enige aanroeper is meegegaan, 7d blokkeert op beide bronnen van onvolledigheid, en de startregel waarschuwt vooraf. Er is een test die exact het gemiste scenario (500/1862 met 120 > 32 sleutels) rood zou maken.
- **De body-aborttest is echt bewijs.** Een echte HTTP-server op poort 0, echte `fetch`, echte `AbortController`, `closeAllConnections()` + `close()` in een `finally`, eigen 20s-testtimeout. Dit is precies wat de vorige ronde vroeg en wat een mock-object niet kon leveren.
- **`catalogEnvTag` wordt niet langer weggemockt** in de nieuwe suite — AC8 heeft nu dekking op de echte functie, inclusief de "twee gescheiden entries"-assertie.
- **H1's redenering klopt technisch**: na `disconnect()` staat ioredis op `end` en rejecten commando's direct; alle aanroepers vangen dat af.
- De retry-lus **respecteert de globale deadline** vóór elke herkansing — de AC9-grens blijft hard, ook al wordt de haalbaarheid slechter.
- De remediatie heeft **geen** van de eerder als goed benoemde eigenschappen kapotgemaakt: `process.exitCode` i.p.v. `process.exit()`, poortvolgorde 7d vóór 7c, poort in beide modi, conditionele `declarationSource`, `disconnect()` i.p.v. `quit()` — alles intact.
- De story is **eerlijk** over de onterechte afvinking van Task 3 in de vorige ronde.

---

## Verdict

**PASS voor de acc-deploy.** Geen enkele wijziging in deze diff brengt de acceptatieomgeving in gevaar: de drie live-pad-wijzigingen zijn correct, de default-timeout is aantoonbaar onveranderd (10s), de procesbrede state is ongevaarlijk, en de suite is groen op één bekende flake na.

**FAIL voor `done`.** AC9 is met commit `da53484` nog steeds niet ingelost: de backoff is gebouwd, maar de negatieve cache serveert elke herkansing zelf (N1, empirisch bewezen), de herkansing omzeilt de belastingsgrens (N2) en verslechtert de deadline-haalbaarheid (N3). Merge en deploy gerust; markeer de story pas als done na N1-N3 + de resterende AC2-test.
