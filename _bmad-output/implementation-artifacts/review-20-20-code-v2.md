---
review_of: "Verwerking van review-20-20-code.md — story 20.20 deel A (commits f6281d2 en f1ae1bb, diff 4487952..HEAD)"
reviewer: "adversariële code review, verse context"
date: 2026-08-20
verdict: FAIL
severity_count: "1 hoog / 3 middel / 6 laag (alle 15 punten uit de vorige ronde: 15 VERWERKT)"
---

# Code review v2 — de verwerking van de vorige ronde

> [!warning] FAIL — maar om iets nieuws
> **Alle vijftien punten uit de vorige ronde zijn werkelijk verwerkt**, en de vier hoge zijn op
> gedrag nagemeten, niet op tekst. De reparatie van M2 ("een cap-paar telt niet meer als
> afgehandeld") heeft er echter een nieuw gat voor teruggelegd: zo'n paar wordt **elke run
> opnieuw volledig doorgerekend** en de offset schuift daardoor hoogstens `PER_CODE_CAP` paren
> per run op. Dat is precies het dure herhaalwerk dat deze story wegneemt. Nagemeten, niet
> beredeneerd (sectie 3).

Alles hieronder is gelezen én gedraaid tegen dubbels; niets tegen acceptatie of productie. Geen
enkele schrijfactie buiten dit reviewbestand en een wegwerpcontainer.

## Poorten, zelf nagedraaid

`VERIFIED`:

| suite | uitkomst |
|---|---|
| `apps/api` — `npx vitest run` | 1131 groen, 2 overgeslagen, 67 todo (eerste run 7 rood onder gelijktijdige docker-belasting; alle vijf bestanden los groen — belastingafhankelijk, zoals de opdracht al meldde) |
| `apps/api` — `npx tsc -p tsconfig.json` (met emit) | exit 0 |
| `apps/api` — `npx eslint src/scripts/build-declared-harvest-map.ts` | 0 fouten, 7 waarschuwingen (6 daarvan bestonden al; zie L5) |
| `apps/web` — `npx vitest run` | 200 groen, 20 todo |
| ml-suite in wegwerpcontainer | 231 groen, 1 fout (`test_phash_service`) + 3 collectiefouten — exact de bestaande baseline |

> [!note] Eén afwijking in de bookkeeping
> `sprint-status.yaml` meldt "api 1128 groen (+8)". Gemeten: **1131**. Geen inhoudelijk probleem,
> wel een getal dat niet klopt (L6).

---

## 1. De vijftien punten uit de vorige ronde

| # | punt | oordeel | bewijs |
|---|---|---|---|
| 1 | H1 — gecompileerd bestand aanroepen | **VERWERKT** | `scripts/deployment/build-declared-harvest-map.sh:54` draait `node dist/scripts/build-declared-harvest-map.js --apply`; containernaam wordt opgezocht (`:41-49`); scriptkop van `build-declared-harvest-map.ts:24-36` scheidt lokaal van omgeving |
| 2 | H2 — slot dekt de inhaalronde | **VERWERKT** | `_lock_max_age_for_run()` `queue_harvest_declared.py:205-224`; marker draagt zijn eigen vervaltijd `:600`; lezer honoreert die `:265-270`; runbook `20-20-aandrijving.md:45-56` gecorrigeerd |
| 3 | H3 — embeddings in de vingerafdruk | **VERWERKT** | `database.py:860-870` — `reference_embeddings re JOIN reference_logos rl`, `md5(string_agg(re.id::text, ',' ORDER BY re.id))`; afwijkingsparagraaf in de story herschreven |
| 4 | H4 — "de parenlijst verandert" exact | **VERWERKT in de oogst, NIET in de bouwer** | `_map_signature` `:466-477`, `_counter_reset_needed` `:285-300`. De bouwer voorspelt het nog steeds op een telling — zie M2 hieronder |
| 5 | M1 — slot atomair / marker vroeg + opruimen | **VERWERKT** | `_claim_lock` `:579-603` staat op `:696`, direct na de slotcontrole; `_release_lock` `:606-624` op `:745` (compleet) en `:807` (`checks_unavailable`); `_checkpoint(done=True)` ruimt op `:566` |
| 6 | M2 — cap-overslag niet als afgehandeld | **VERWERKT, met een nieuw gevolg** | `done_idx.discard(i)` `:1021`, `cap_deferred` `:871`/`:1099`. Zie H1-nieuw |
| 7 | M3 — onbruikbare kaart eigen status | **VERWERKT** | `DeclaredMapUnavailable` `:392-405`, geheven op `:424`/`:427`/`:437`; `map_unavailable`-tak `:646-661` vóór het inlezen van de stand, dus de teller wordt niet aangeraakt |
| 8 | M4 — logbestemming voor beide scripts | **VERWERKT** | `declared-harvest.sh:37,59` en `build-declared-harvest-map.sh:38,55` — `tee -a` houdt de uitvoer óók op stdout |
| 9 | M5 — AC7-toetsen tegen de werkelijkheid | **VERWERKT** | `build-declared-harvest-map.test.ts:370-410` legt het `.js`-pad naast `tsconfig.outDir/rootDir` én naast de runtime-laag van de `Dockerfile`; `:412-424` bewijst dat `tsx` in geen enkele `package.json` staat |
| 10 | M6 — `map_pairs` los van de scope | **VERWERKT voor de kaart, NIET voor de teller** | `_all_pairs` `:452-464` negeert `HARVEST_CODES`. `next_offset` blijft wél scope-afhankelijk — zie M3 hieronder |
| 11 | L1 — dubbeltelling uitsluitingen | **VERWERKT** | `build-declared-harvest-map.ts:250-259` telt pas ná het samenvoegen; toets `:198-215` |
| 12 | L2 — eigen uitkomstwaarde | **VERWERKT** | `OUTCOME_EXISTING_ITEM` `:171`, blijvend `:179-181`, gebruikt op `:1037`; migratie- en schemacommentaar bijgewerkt |
| 13 | L3 — hoofdletteraanname | **VERWERKT** | `build-declared-harvest-map.ts:192-201` vergelijkt bewust exact, mét toelichting in de uitsluitingsreden `:303-309`; toets `:217-231` |
| 14 | L4 — droogloop geen exitcode 1 | **VERWERKT** | `build-declared-harvest-map.ts:624-635` staat nu vóór de blokkade-tak en meldt de blokkade alsnog; toets `:563-570` |
| 15 | L5 — verweesde rijen in de tabelcommentaar | **VERWERKT** | migratie 0021 `:37-42` plus `COMMENT ON TABLE` `:66-71` |

Vijftien van vijftien. Twee ervan (4 en 10) zijn aan één kant van de scheidslijn gerepareerd; dat
staat hieronder als nieuwe bevinding, niet als "niet verwerkt".

---

## 2. De vier hoge, op gedrag nagemeten

### H1 — bestaat `dist/scripts/build-declared-harvest-map.js` na een echte build?

`VERIFIED`. `npx tsc -p apps/api/tsconfig.json --outDir <wegwerpmap>` (exit 0) levert
`scripts/build-declared-harvest-map.js`, 22.654 bytes. De `Dockerfile` kopieert
`/app/apps/api/dist` naar `./dist` met `WORKDIR /app` (`Dockerfile:82-84`), dus het pad dat het
script aanroept klopt in het beeld. De `require.main === module`-guard blijft in CommonJS werken
(`module: "CommonJS"` in `tsconfig.json`).

### H2 — klopt de afleiding van de vervaltijd?

`VERIFIED`, gedraaid in de wegwerpcontainer tegen de echte module:

| `DECLARED_HARVEST_MAX_SECONDS` | `_lock_max_age_for_run()` |
|---|---|
| 36000 (inhaalronde) | **37800** |
| 1000 (nachtelijk) | 21600 |
| n.v.t., `LOCK_MAX_AGE_SECONDS=0` | 0.0 (= nooit vervallen) |

De vraag uit de opdracht — "wat als `MAX_SECONDS` op de omgeving anders staat dan het script
aanneemt?" — is structureel afgevangen: de vervaltijd hoort bij de run die de marker **zet**, en
de lezer neemt hem over uit de marker (`:265-270`). Een nachtelijke run met budget 1000 weigert
dus acht uur later nog steeds voor een inhaalronde die 37800 in zijn marker legde. `declared-
harvest.sh:53` geeft het budget per `docker exec` mee, dus een afwijkende container-env
overschrijft het niet.

Rest-risico, klein: `MAX_SECONDS` begrenst alleen het *starten* van een nieuwe paginagroep. Duurt
één groep langer dan de marge van 1800 s, dan vervalt de marker tóch te vroeg. Bij de gemeten
~28 s per paar is dat ruim; ik noem het omdat de marge een aanname is, geen meting.

### H3 — vangt de vingerafdruk de bewegingen die ertoe doen?

`VERIFIED` dat de bron nu gelijk is aan die van de match: `database.py:860-870` tegenover
`find_similar_references_by_codes` `database.py:706-714` — dezelfde `FROM`, dezelfde `JOIN`,
dezelfde `rl.active = true`. De nieuwe toets `test_reference_pool_fingerprint_20_20.py` legt die
twee query's letterlijk naast elkaar en faalt als één van beide verschuift; dat is de goede vorm.

`INFERENCE` (uit de querystructuur, niet tegen een echte database) per beweging:

| beweging | gevangen? |
|---|---|
| referentie krijgt alsnog een embedding | **ja** — er komt een `re.id` bij, aantal én digest wijzigen |
| netto-nul-wisseling (één erbij, één eraf) | **ja** — het digest gaat over de id's, niet over aantal + tijdstempel |
| deactivatie | **ja** — de rij valt uit de join |
| codewissel | **ja** — beide codes zien hun groep veranderen |
| deactiveren én weer activeren tussen twee runs | eindstand terecht gelijk (zelfde `re.id`) |

Kosten: **één** geaggregeerde query per run, over de codes in het venster (ten hoogste 39).
`string_agg` van uuid-tekst is ~37 bytes per embedding; bij duizenden referenties is dat honderden
kilobytes en één md5 — verwaarloosbaar naast één pagina decoderen. Wél `INFERENCE`: er is geen
index die deze join stuurt, dus het is vermoedelijk een scan over `reference_embeddings`. Eén keer
per run, dus geen bezwaar; niet gemeten op ACC.

### H4 — is de kaartsignatuur stabiel bij een andere sleutelvolgorde?

`VERIFIED`, nagemeten tegen de echte module met twee JSON-documenten die dezelfde kaart in een
andere sleutel- én GTIN-volgorde bevatten: identieke signatuur. Dat komt doordat
`_load_declared_map` normaliseert (`upper`, `strip`, `sorted`, ontdubbeld, `:428-437`) vóórdat
`_all_pairs` sorteert (`:452-464`). De teller reset dus **niet** elke ronde.

Ook nagemeten: een netto-nul-wisseling in de kaart wijzigt de signatuur wél
(`3|c91bf6…` tegenover een andere digest bij gelijk aantal).

---

## 3. Nieuw — wat de reparaties zelf hebben geïntroduceerd

### H1-nieuw (hoog) — een cap-paar wordt élke run opnieuw volledig doorgerekend, en pint de offset vast

`VERIFIED`, gedraaid in de wegwerpcontainer met de bestaande harness (drie GTIN's onder één code,
`PER_CODE_CAP=1`):

| | `from_offset` → `to_offset` | `cap_deferred` | pagina's opnieuw geanalyseerd (`propose_regions`) | vastgelegd |
|---|---|---|---|---|
| run 1 | 0 → 1 | 2 | 111, 222, 333 | alleen 111 |
| run 2 | 1 → 2 | 1 | **222, 333 opnieuw** | alleen 222 |

Drie dingen tegelijk:

1. **Het dure werk wordt weggegooid.** De cap-controle staat op `:1007`, ná `propose_regions`, ná
   alle embeddings, ná `find_similar_references_by_codes` en ná de cross-code-guard
   (`:960-1005`). Een cap-paar wordt dus volledig doorgerekend (~28 s) en daarna noch vastgelegd
   noch als afgehandeld geteld — de volgende nacht gebeurt exact hetzelfde. Dat is precies het
   herhaalwerk dat AC4 wegneemt, opnieuw ingevoerd voor een hele klasse paren.
2. **De offset schuift hoogstens `PER_CODE_CAP` per run op** voor een code die de cap raakt. Omdat
   het venster `[next_offset, next_offset + BATCH)` aan die offset hangt, komen de paren voorbij
   `offset + 400` er 's nachts niet meer aan te pas. Verandert de referentiepool, dan worden de
   voorlopige oordelen daarachter dus niet opnieuw bekeken zolang de offset vooraan vastzit — het
   vliegwiel loopt vast achter één verzadigde code.
3. **`DECLARED_HARVEST_PER_CODE_CAP=0` staat permanent stil.** Nagemeten: `to_offset` 0, niets
   vastgelegd, beide pagina's tóch geanalyseerd. Er is geen ondergrens op de cap, en "de cap op 0
   zetten om even geen kandidaten te maken" is een voor de hand liggende ingreep.

De goedkope reparatie: zet de cap-controle **vóór** het laden van de pagina en de analyse, direct
na de `already_checked`-controle (`:917-920`). Het gedrag blijft gelijk (na `PER_CODE_CAP`
kandidaten levert de code die run niets meer op), maar een overgeslagen paar kost dan niets in
plaats van de volle analyse. Overweeg daarbij `PER_CODE_CAP <= 0` af te vangen.

### M1-nieuw (middel) — H4 is aan de kant van de bouwer níet doorgevoerd

`VERIFIED`. `describeCounterPlan` (`build-declared-harvest-map.ts:398-431`) beslist nog steeds op
`statePairs === mapPairs` en meldt dan "de kaart houdt N paren — de teller blijft staan". De oogst
beslist sinds deze commit op een digest. Bij precies het geval waar H4 om ging — evenveel paren,
andere lijst — **meldt de droogloop het tegenovergestelde van wat er gebeurt**: de bouwer zegt "de
teller blijft staan", de oogst zet hem terug naar 0.

Dat is geen cosmetisch verschil: de droogloop is het scherm waarop een mens beslist of `--apply`
verantwoord is (AC1/AC6). De docstring op `:387-391` beweert bovendien nog dat het op "de paren in
de KAART" wordt vastgesteld, wat de implementatie niet doet.

De bouwer kan hetzelfde digest berekenen (md5 over `"<CODE>\t<GTIN>"`-regels, codes gesorteerd,
GTIN's gesorteerd) en het naast `map_signature` uit het voortgangsbestand leggen — dat is dezelfde
vorm die `_map_signature` `:466-477` produceert.

De toets op `:330-334` heet "laat de teller staan als de kaart dezelfde paren houdt" maar voedt
alleen twee gelijke **aantallen**. Hij bevestigt daarmee de oude regel in plaats van de bedoeling —
hetzelfde patroon als M5 uit de vorige ronde, alleen een bestand verderop.

### M2-nieuw (middel) — `next_offset` bleef scope-afhankelijk, en de zelfherstelling is weg

`VERIFIED` op de code. `_all_pairs` `:452-464` negeert `HARVEST_CODES`, maar `pairs` — waar
`next_offset` in wijst — komt uit `_scoped_pairs` `:732`. Vóór deze commit vergiftigde een
gescopete debugrun `map_pairs`, waardoor de eerstvolgende nachtelijke run zijn teller op 0 zette:
verspilling, maar zelfherstellend. Nu blijft de signatuur gelijk, gebeurt er geen reset, en leest
de nachtelijke run een offset die in een lijst van dertig paren was opgebouwd terwijl er 1349 zijn.
De voorste paren van de volledige lijst worden dan **stil overgeslagen** tot de kaart verandert.

M6 is dus letterlijk verwerkt, maar de kwaal die eronder zat is verplaatst. Weeg: `next_offset`
per scope opslaan, of het voortgangsbestand niet schrijven zolang `DECLARED_HARVEST_CODES` gezet
is (een gescopete run is per definitie een debugrun).

### M3-nieuw (middel) — een onleesbaar vóórtgangsbestand krijgt de bescherming niet die de kaart wél kreeg

`VERIFIED`. M3 maakte de kaart fail-loud, met als motivering: één hikje in de objectopslag mag de
voortgang niet wissen. Het bestand dat die voortgang draagt, houdt de oude fail-safe:
`:666-668` vangt élke leesfout af met `state = {"next_offset": 0}`, en `_claim_lock` (`:696`)
schrijft die verse stand nu **onmiddellijk** weg — waar hij vóór deze commit pas ná de bulk-ophaal
werd geschreven en de vroege stoppaden hem ongemoeid lieten.

Netto: een tijdelijke leesfout op `declared-harvest-state.json` wist nu zeker `next_offset` én
`map_signature`, in plaats van misschien. De schade is beperkt (de vastlegging in
`declared_harvest_checks` draagt het echte geheugen), maar het is dezelfde redenering die voor de
kaart wél tot een eigen status leidde. Minstens een aparte tak voor "stand onleesbaar" — of
onderscheid maken tussen "bestand bestaat niet" (terecht een verse start) en "leesfout" (storing).

### L1-nieuw (laag) — welk pad ruimt niet op, en wat bij een crash

`VERIFIED`, uitputtend nagelopen. Ná `_claim_lock` `:696` bestaan vier uitgangen: de
`complete`-tak (`:745`, opruimen), de `checks_unavailable`-tak (`:807`, opruimen), het normale
einde (`_checkpoint(done=True)`, `:566`, opruimen) en een onverwachte uitzondering — die laat de
marker bewust staan. Dat is gedocumenteerd (`:606-617`) en verdedigbaar, en de marker vervalt
vanzelf op `lock_max_age_seconds`. Geen gat gevonden. Twee kleinigheden:

* De `map_unavailable`-tak ligt vóór `_claim_lock`, dus daar valt niets op te ruimen. Klopt.
* In `DRY_RUN` meldt de `complete`-tak `stale_marker_cleared: true` terwijl `_release_lock`
  `:616-617` meteen terugkeert en er niets is opgeruimd. Cosmetisch, maar het is een onwaar veld
  in een uitvoer die als bewijs gelezen wordt.

### L2-nieuw (laag) — `status: map_unavailable` haalt geen alarm

`VERIFIED`. `run_batch` geeft een dict terug en roept nooit `sys.exit`, dus
`python -m app.services.queue_harvest_declared` eindigt met exitcode 0 — óók bij
`map_unavailable`, `locked` en `checks_unavailable`. `declared-harvest.sh` schrijft de regel naar
`/var/log/declared-harvest.log` en naar stdout (cron-mail), maar de cron **stopt stil** in de zin
dat niets een niet-nul status ziet. M4 vroeg "logbestemming óf niet-nul exitcode"; er is voor de
eerste gekozen, dus de letter is nagekomen. Wie de wekenlange stilte van 20.2 niet wil herhalen,
wil hier een exitcode of een bewaking op dat logbestand.

### L3-nieuw (laag) — de logpijplijn kan de exitcode omdraaien

`VERIFIED` (lokaal, bash op darwin; `INFERENCE` voor Linux): met een onschrijfbaar logpad meldt
`tee` de fout, **kopieert het werk gewoon door naar stdout, en de opdracht draait**, maar de
pijplijn eindigt op 1 door `pipefail`. Een geslaagde oogst rapporteert dan een mislukking. De
`mkdir -p … || true` op `:38`/`:39` vangt dat niet af — die slikt juist het signaal. Klein, maar
het maakt de exitcode onbetrouwbaar in de enige richting die telt.

### L4-nieuw (laag) — de api-containerprefix is niet getoetst, en `head -n 1` kiest willekeurig

`VERIFIED` dat de asymmetrie er is: de ml-prefix heeft een toets die hem tegen een echte,
gemeten containernaam legt (`build-declared-harvest-map.test.ts:616-623`), de api-prefix
(`build-declared-harvest-map.sh:41`, `app-qsookwow8koko0kwg00g0cwk-`) heeft dat niet — daar wordt
alleen gecontroleerd dát er op prefix gezocht wordt. Of die prefix klopt is `INFERENCE`: hij duikt
alleen op als tegenvoorbeeld in de ml-toets. Bijkomend: bij meer dan één treffer (blauw/groen
tijdens een uitrol) pakt `head -n 1` er willekeurig één.

### L5-nieuw (laag) — twee toetsen bewijzen minder dan hun commentaar belooft

`VERIFIED`:

* `test_queue_harvest_declared_20_20.py:822-825` — het commentaar zegt "en dat gebeurde vóór de
  sleutellijst opgehaald werd", maar `_FakeStorage.list_training_images` (`:89-90`) legt niets
  vast, dus dat is niet te zien. De regel `assert out.storage.puts` erna is dood: `puts[0]` zou
  al gefaald zijn.
* `build-declared-harvest-map.test.ts:468-483` — deze toets leest de twee constanten met een
  regex uit de python-bron en **rekent de formule zelf na** (`Math.max(lock, budget + grace)`).
  Verandert `_lock_max_age_for_run` van vorm, dan blijft hij groen. Het echte bewijs zit in de
  python-toets, die de functie wél aanroept; deze voegt vooral de koppeling aan de runbook toe.

Ook laag, in dezelfde hoek: `eslint` geeft nu 7 waarschuwingen "unused eslint-disable directive"
tegenover 6 vóór deze commit; het `enable`/`disable`-geschuifel rond de omgedraaide takken
(`build-declared-harvest-map.ts:598-642`) is lastig te volgen voor wat het oplevert.

### L6-nieuw (laag) — het poortgetal in `sprint-status.yaml` klopt niet

`VERIFIED`. Er staat "api 1128 groen (+8)"; gemeten 1131 (1200 totaal min 2 overgeslagen en 67
todo). Bewijs is kort en controleerbaar, dus het hoort te kloppen.

---

## 4. De toetsen van deze ronde

**De vervangen AC7-toetsen bewijzen nu wél iets.** `build-declared-harvest-map.test.ts:370-410`
haalt het commando letterlijk uit het script, eist dat het `.js`-pad onder `tsconfig.outDir` valt,
herleidt het terug naar een bestaand `.ts`-bronbestand via `rootDir`, en controleert in de
runtime-laag van de `Dockerfile` dat `dist` gekopieerd wordt en `src` níet. Dat is een toets tegen
de werkelijkheid in plaats van tegen een markdownbestand, en hij zou H1 gevangen hebben. De
`tsx`-toets `:412-424` idem.

**De drie nieuwe toetsen op `declared-harvest.sh`** (`:602-624`) zijn zinnig maar blijven
tekstueel: ze eisen `docker ps --filter`, een melding en `exit 1`, en leggen de prefix naast twee
letterlijke containernamen. Ze vangen een teruggezette hardcoded naam; ze bewijzen niet dat de
prefix klopt (zie L4-nieuw).

**Wat ontbreekt aan toetsen:** er is geen toets die twee opeenvolgende runs met een volle cap
naast elkaar zet — daardoor bleef H1-nieuw onzichtbaar. `test_ac4_cap_bereikt_telt_ook_niet_als_
afgehandeld` (`:572-590`) toetst één run en stopt precies vóór de vraag "en wat kost dat de
volgende ronde?".

---

## 5. Deel B en schrijfacties

`VERIFIED`, vier routes:

* De diff raakt uitsluitend broncode, toetsen, het migratiebestand, twee `.sh`-bestanden en
  documentatie (`git diff --stat 4487952..HEAD`).
* `git grep` op beide scriptnamen levert buiten `_bmad-output/` alleen de toetsen en twee
  commentaarregels op — **geen enkele aanroep**, en geen geplaatste cron (de cron-regels staan als
  tekst in de scriptkop en in de runbook).
* Geen `prisma migrate`, `db push` of automatische migratie toegevoegd; `writeMap` wordt nog
  steeds alleen achter `--apply` bereikt (`build-declared-harvest-map.ts:646`), en de droogloop is
  de standaard.
* Werkboom schoon (`git status --porcelain` leeg bij aanvang).

> [!warning] Eén ding om vóór het toepassen te weten
> Migratie `0021` is ná zijn oorspronkelijke commit inhoudelijk gewijzigd (commentaar plus twee
> `COMMENT ON`-opdrachten). Is hij ergens al toegepast, dan klaagt Prisma over een gewijzigde
> checksum. `INFERENCE`: de vorige review stelde vast dat niets hem automatisch toepast; of hij op
> acceptatie al gedraaid heeft is niet gemeten.

---

## Wat moet wijzigen

**Hoog — moet vóór `done`:**

1. **Zet de cap-controle vóór de dure analyse.** Verplaats de tak op
   `queue_harvest_declared.py:1007` naar direct na de `already_checked`-controle (`:917-920`),
   zodat een overgeslagen paar niets kost in plaats van de volle ~28 s — elke nacht opnieuw. Vang
   daarbij `PER_CODE_CAP <= 0` af (dat zet de offset nu permanent vast) en voeg een toets toe die
   **twee opeenvolgende runs** met een volle cap naast elkaar legt: de offset moet opschuiven en
   de tweede run mag de al beoordeelde pagina's niet opnieuw analyseren.

**Middel — hoort in dezelfde ronde mee:**

2. Laat `describeCounterPlan` (`build-declared-harvest-map.ts:398-431`) op dezelfde digest
   beslissen als de oogst, of laat de bouwer expliciet zeggen dat hij het niet exact weet. Nu kan
   de droogloop het tegenovergestelde melden van wat er gebeurt. Vervang de toets op `:330-334`,
   die de oude telregel bevestigt.
3. Maak `next_offset` scope-bewust, of schrijf het voortgangsbestand niet weg zolang
   `DECLARED_HARVEST_CODES` gezet is. Sinds de signatuur scope-onafhankelijk werd, laat een
   gescopete debugrun een stil dekkingsgat achter in plaats van een zichtbare reset.
4. Geef een onleesbaar voortgangsbestand dezelfde behandeling als de onleesbare kaart: een eigen
   tak, of minstens onderscheid tussen "bestaat niet" en "leesfout". `_claim_lock` overschrijft
   die stand nu onmiddellijk (`:666-668` + `:696`).

**Laag — repareer waar je toch bent:** L1-nieuw (`stale_marker_cleared` liegt in droogloop),
L2-nieuw (exitcode 0 bij `map_unavailable`/`locked`/`checks_unavailable` — of een bewaking op het
logbestand), L3-nieuw (een onschrijfbaar log draait de exitcode om), L4-nieuw (toets de
api-containerprefix zoals de ml-prefix getoetst is; overweeg te falen bij meer dan één treffer in
plaats van `head -n 1`), L5-nieuw (de dode assert in `test_ac8_marker_staat_er_voor_het_dure_
voorwerk` en de nagerekende formule in de TS-slottoets), L6-nieuw (poortgetal in
`sprint-status.yaml`: 1131, niet 1128).

---

## Wat NIET geverifieerd is

* **Niets is tegen een echte omgeving gedraaid.** Geen database, geen MinIO, geen container op
  `vanilla`, geen migratie, geen deploy. De uitspraken over het beeld komen uit `Dockerfile`,
  `apps/api/tsconfig.json` en een echte `tsc`-build naar een wegwerpmap — niet uit een
  `docker exec` op acceptatie.
* **De api-containerprefix `app-qsookwow8koko0kwg00g0cwk-`** is niet tegen een draaiende
  omgeving gehouden. De ml-prefix is volgens de toetsbron gemeten; voor de api-prefix ontbreekt
  dat bewijs in de repository.
* **Of `declared_harvest_checks` op acceptatie al bestaat**, en of migratie 0021 daar al is
  toegepast (relevant voor de checksumwijziging), is niet gemeten.
* **De queryplannen** van de nieuwe vingerafdrukquery zijn niet gemeten; de kostenuitspraak is een
  redenering over vorm en frequentie, geen `EXPLAIN`.
* **RED-vóór-GREEN** is niet na te lopen: beide commits zijn samengeperst. Beoordeeld is wat de
  toetsen in hun eindtoestand vastpinnen.
* **De getallen uit de story** (1349 paren, 39 codes, ~28 s per paar, ~8,5 uur) zijn opnieuw niet
  nagemeten; de gevolgtrekkingen over de doorlooptijd van H1-nieuw leunen erop.
* **Het ene falende ml-toetsgeval** (`test_phash_service`, ontbrekende `requirements.txt`) en de
  drie collectiefouten zijn als bestaande baseline aangenomen, niet uitgezocht.
* **De zeven api-toetsen die onder gelijktijdige belasting rood werden** zijn los groen bevonden;
  dat ze op `origin/acc` net zo flakey zijn, is niet zelf nagemeten maar uit de opdracht
  overgenomen.
