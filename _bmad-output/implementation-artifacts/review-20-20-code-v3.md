---
review_of: "Story 20.20 deel A op tak epic-20-declaratie-oogst, HEAD 27d0d81 — derde en laatste ronde; verwerking van review-20-20-code-v2.md (commits f051ddf, f532941, 27d0d81)"
reviewer: "adversariële code review, verse context"
date: 2026-08-20
verdict: FAIL
severity_count: "1 hoog / 4 middel / 5 laag (alle 10 punten uit ronde 2: 10 VERWERKT)"
---

# Code review v3 — de laatste ronde

> [!warning] FAIL — niet om de tien punten, maar om iets dat drie ronden bleef liggen
> **Alle tien punten uit ronde 2 zijn verwerkt**, negen ervan op gedrag nagemeten. Het hoge punt
> is bovendien mét mutatiebewijs gecontroleerd. Wat FAIL oplevert zit één bestand verderop: de
> **krimpbescherming valt stil weg zodra de bestaande kaart niet te lézen is**, en het enige pad
> dat schrijft is een onbewaakte wekelijkse cron met `--apply`. Dat is precies het onderscheid
> ("ontbreekt" tegenover "onleesbaar") dat deze ronde in de oogst twee keer wél is aangebracht.

Alles hieronder is gelezen én gedraaid. Niets tegen acceptatie of productie: de startscripts zijn
gedraaid met een **nagemaakte `docker` in een wegwerpmap vóór in `PATH`**, de python-suite in een
wegwerpcontainer. Geen enkele schrijfactie buiten dit reviewbestand.

## Poorten, zelf gedraaid

`VERIFIED`:

| suite | tak `epic-20-declaratie-oogst` (27d0d81) | `origin/acc` (1e9a938) |
|---|---|---|
| `apps/api` — `npx vitest run`, ronde 1 | 1136 geslaagd, **2 gevallen** (1138 niet-overgeslagen) | 1077 geslaagd, **12 gevallen** (1089) |
| `apps/api` — `npx vitest run`, ronde 2 | 1136 geslaagd, **2 gevallen** | 1088 geslaagd, **1 geval** |
| `apps/web` — `npx vitest run` | 197 geslaagd, 3 gevallen, 20 todo | n.v.t. (tak raakt geen enkel `apps/web`-bestand) |
| ml-suite, wegwerpcontainer | **240 geslaagd**, 1 fout (`test_phash_service`) + 3 collectiefouten | = de opgegeven basisstand |
| `npx tsc -p apps/api/tsconfig.json` (met emit) | exit 0 | — |

**De vergelijking met de basisstand is schoon** — maar anders dan de commit hem beschrijft.
`VERIFIED`: er valt op deze tak **geen enkele toets om die op `origin/acc` groen is**. Het geval dat
op de tak in béíde runs viel — `artwork-detection-orchestration.test.ts › should write gln on
import so 8-3D can resolve declarations (S3/D1)` — viel ook op `origin/acc` om. Alle uitvallers,
op beide takken, zijn `Test timed out in 5000ms` en wisselen per run van bestand.

`VERIFIED`, en dat is bevinding M4: **de meting in commit `27d0d81` en in `sprint-status.yaml`
("api 1138 groen"; "on origin/acc the api suite is 1089 green with no flakes") is hier niet
reproduceerbaar.** `origin/acc` flakete in allebei mijn runs, de tak in allebei. Er is dus geen
verschil in flakiness tussen de twee — en dus ook geen regressie.

---

## 1. De tien punten uit ronde 2

Het hoge punt is deels in `f051ddf` verwerkt en deels in `f532941`; de gevraagde diff
`f051ddf..HEAD` bevat de eerste helft dus niet. Beoordeeld is `f1ae1bb..HEAD`, de volledige
verwerking.

| # | punt | oordeel | bewijs |
|---|---|---|---|
| 1a | cap-controle vóór de dure analyse | **VERWERKT** | `queue_harvest_declared.py:1096-1114`, direct ná de `already_checked`-tak (`:1091-1094`) en vóór `page_loaded` (`:1118`). Nagemeten: `test_cap_kost_geen_pagina_laden_en_geen_analyse` |
| 1b | `PER_CODE_CAP <= 0` afvangen | **VERWERKT** | `:752-773` — eigen status `cap_disabled`, vóór model, kaart, slot én teller; niets gelezen, niets geschreven |
| 1c | toets met twee opeenvolgende cap-runs | **VERWERKT** | `test_queue_harvest_declared_20_20.py:942-985` — offset 0→1→2, `propose_calls` per run precies één pagina |
| 2 | `describeCounterPlan` op dezelfde digest | **VERWERKT** | `build-declared-harvest-map.ts:384-408` (`declaredHarvestMapSignature`) en `:426-472`; de oude telregel-toets is vervangen door `build-declared-harvest-map.test.ts:355-371` ("evenveel paren, andere lijst" → reset) |
| 3 | `next_offset` scope-bewust | **VERWERKT** | `_scope_suffix` `:539-556`, `offset_field`/`signature_field` `:870-871`, `_checkpoint(offset_field=…)` `:654-676`; toets `:1023-1052` |
| 4 | onleesbare stand eigen behandeling | **VERWERKT** | `StateUnavailable` `:500-512`, `_load_state` `:518-537`, tak `:811-830`; toets `:1054-1074` bewijst dat `next_offset: 900` blijft staan |
| 5 | L1 — `stale_marker_cleared` liegt in droogloop | **VERWERKT** | `:924-927` en `:918-921`: `stale_marker and not DRY_RUN` |
| 6 | L2 — niet-nul exitcode | **VERWERKT** | `ALERT_STATUSES` `:734-748`, `exit_code_for` `:751-753`, `sys.exit(...)` `:1315` |
| 7 | L3 — onschrijfbaar log draait de exitcode om | **VERWERKT, door mij nagedraaid** | zie sectie 3 — zes gevallen, allemaal goed |
| 8 | L4 — api-prefix toetsen + niet gokken bij >1 treffer | **VERWERKT** | `build-declared-harvest-map.test.ts:528-550`; guard in beide scripts, door mij nagedraaid (exit 1 bij twee treffers) |
| 9 | L5 — dode assert + nagerekende formule | **VERWERKT** | `test_queue_harvest_declared_20_20.py:850-857` meet nu echt de volgorde via `events`; de TS-slottoets rekent niet meer na — maar zie L2 hieronder |
| 10 | L6 — poortgetal in `sprint-status.yaml` | **VERWERKT** | 1131 in het ORIGINEEL-blok; het nieuwe blok meldt 1138, wat bij mij 1136+2 is (M4) |

Tien van tien.

---

## 2. De twee vondsten van de hoofdsessie, op gedrag

### `f051ddf` — staat de cap-controle vóór het laden, en kost een afgeketst paar echt niets?

`VERIFIED`, ja. `queue_harvest_declared.py:1107` staat vóór `if not page_loaded:` (`:1118`), dus
vóór `get_training_image`, `imdecode` en `propose_regions`. De controle is **per paar** en niet per
groep, zodat een andere code op dezelfde pagina zijn pagina nog wél krijgt. Nagemeten in de
wegwerpcontainer: bij `PER_CODE_CAP=1` en drie GTIN's onder één code doet run 1 alleen
`propose_regions` op pagina 111, run 2 alleen op 222, en run 2 haalt 111 en 333 niet eens op.

**Vang ik een geval waarin hij tóch te laat komt?** Nee — en dat is precies het probleem
(bevinding M2). De **late** cap-tak op `:1201-1217` is nu **onbereikbaar**: `per_code_counts[code]`
verandert alleen op `:1250`, de laatste opdracht van dezelfde iteratie, en `run_batch` draait als
één coroutine, dus tussen `:1107` en `:1201` kan de telling voor dit paar niet veranderen.

`VERIFIED` met een mutatie: `raise AssertionError` bovenaan die tak, hele ml-suite gedraaid in een
wegwerpcontainer → **275 geslaagd, geen enkele toets raakt hem** (alleen de bekende
`test_phash_service` en de drie collectiefouten). Geen gedragsfout, wel dode code — en de
uitgebreide uitleg over "waarom een cap-paar niet als afgehandeld telt" staat er nu op, terwijl de
toets `test_ac4_cap_bereikt_telt_ook_niet_als_afgehandeld` stilletjes de vroege tak beproeft.

### `27d0d81` — blijft de bouwer heel, en opent nog een ánder bestand een handvat?

**Functionaliteit heel:** `VERIFIED`. `npx tsc -p apps/api/tsconfig.json` (exit 0) zet de twee
`await import('../core/db')` om naar `Promise.resolve().then(() => __importStar(require('../core/db')))`
(`dist/scripts/build-declared-harvest-map.js:422` en `:576`). `core/db.ts` zet `__esModule`, dus
`__importStar` geeft de module zelf terug en `.default` is de client. De client wordt geopend zodra
`listActiveReferenceCodes` hem nodig heeft (`:513-526`, altijd aangeroepen in `runBuild`) en in
`.finally()` netjes gesloten (`:724-729`).

**Maar de opgegeven oorzaak klopt niet** — `VERIFIED`, bevinding M4. In `apps/api` wordt
`@prisma/client` in vitest ge-aliast naar `src/__tests__/__mocks__/prisma.ts`
(`vitest.config.ts:31-33`) én in `src/__tests__/setup.ts:24-322` met `vi.mock` vervangen door één
gedeeld nepobject. `new PrismaClient()` in `src/core/db.ts:3` opent daar dus **nooit** een
verbinding; het aliasbestand gebruikt zelfs `jest.fn()` en zou meteen omvallen als het echt geladen
werd. "Extra clients vraten verbindingen" en "toetsen die de database echt nodig hebben" kunnen
allebei niet: géén api-toets praat met een database. De uitvallers zijn 5000 ms-timeouts en staan er
nog steeds (twee runs, 1136/1138), en `origin/acc` flakete bij mij net zo hard.

**Een ánder bestand met een handvat op moduleniveau?** `VERIFIED`, geen. In de diff:
`build-declared-harvest-map.ts` houdt op moduleniveau alleen `createHash`, `createLogger` en
`services/storage` over — en die laatste maakt zijn client lui aan (`storage.ts:61`,
`let _adapter: StorageAdapter | null = null`). De python-module opent op moduleniveau niets
(`queue_harvest_declared.py:75-120`: alleen `cv2`, `numpy`, `logger` en env-waarden); `model_manager`,
`db_service` en `storage_service` worden pas ín `run_batch` geïmporteerd. De toetsbestanden
importeren geen client.

---

## 3. Wat ik zelf heb gedraaid aan de startscripts

`VERIFIED`, met een nagemaakte `docker` vóór in `PATH` (geen echte container aangeraakt):

| geval | `declared-harvest.sh` | `build-declared-harvest-map.sh` |
|---|---|---|
| één container, log schrijfbaar, werk slaagt | exit **0**, logregel weggeschreven | — |
| log onschrijfbaar, werk slaagt | exit **0** | exit **0** |
| werk faalt | exit **1** | exit **3** (eigen code, niet platgeslagen) |
| twee containers met dezelfde prefix | exit **1**, "MEER DAN EEN" | exit **1** |
| geen container | exit **1** | — |

De `PIPESTATUS`-reparatie doet dus wat ze belooft, en de multi-treffer-guard ook. Beide scripts
dragen `#!/usr/bin/env bash`, dus `PIPESTATUS` en de array-toewijzing zijn gedekt.

---

## 4. Nieuw — wat drie ronden niet gevonden hebben

### H1 (hoog) — een onleesbare bestaande kaart zet de krimpbescherming stil uit, op het enige schrijfpad

`VERIFIED`. `readExistingPairs` (`build-declared-harvest-map.ts:528-544`) geeft `null` terug in
twéé volstrekt verschillende gevallen: het object is er niet (`if (!buf) return null`, `:531`) en
het object is er wél maar niet te lezen of misvormd (`catch { return null }`, `:541-543`).
`evaluateShrink` (`:366-368`) behandelt `null` als "geen bestaande kaart" en blokkeert dan **niets**,
en `runBuild` `:655-659` meldt het als *"geen leesbare bestaande kaart — niet van toepassing
(eerste run)"* — een uitspraak die het script niet kan doen.

Gevolg: één hikje in de objectopslag tijdens de **wekelijkse, onbewaakte** `--apply`-cron
(`build-declared-harvest-map.sh:9`, `7 0 * * 0`) en de kaart wordt overschreven zónder de
10%-krimpgrens die AC6 er juist voor zet. Van 1349 paren naar 12 zou er zo gewoon doorheen glippen,
met exitcode 0 en een regel die "eerste run" zegt.

Dit is exact de redenering die deze ronde in de oogst twéé keer wél is doorgevoerd
(`DeclaredMapUnavailable`, `StateUnavailable`) en die `readSourceIndex` al hanteert — die faalt
luid en geeft exitcode 1 (`:639-646`). De twee gevallen zijn in de code al uit elkaar te halen
(`!buf` tegenover `catch`); het is een reparatie van een paar regels.

### M1 (middel) — dezelfde stille terugval bij het voortgangsbestand, en die legt M1-nieuw terug

`VERIFIED`. `readHarvestState` (`:546-570`) heeft dezelfde `catch { return { pairs: null,
signature: null, inProgress: false } }`. Met de nieuwe digest-regel betekent `signature: null`:
*"het voortgangsbestand draagt nog geen vingerafdruk — de teller wordt nu niet teruggezet"*
(`:432-440`). Bij een leesfout meldt de droogloop dus opnieuw **het tegenovergestelde** van wat de
oogst gaat doen, op precies het scherm waarop een mens over `--apply` beslist. Punt 2 van ronde 2 is
op het gelukkige pad gerepareerd en op het foutpad blijven staan. Bijkomend: `inProgress` wordt dan
`false`, dus de "er loopt een run"-waarschuwing verdwijnt ook.

### M2 (middel) — de late cap-tak is dode code, en de AC4-toets bewijst iets anders dan hij zegt

Zie sectie 2. `queue_harvest_declared.py:1201-1217` is onbereikbaar (mutatiebewijs). Weghalen, of —
als hij als vangnet bedoeld is — er een toets bij die hem echt raakt. Zoals het nu staat, draagt
dode code de uitleg van het mechanisme en toetst `test_ac4_cap_bereikt_telt_ook_niet_als_
afgehandeld` (`:572-590`) een andere tak dan waar hij bij staat.

### M3 (middel) — `DECLARED_HARVEST_CODES` wordt niet vastgezet, en dat is sinds deze ronde stil geworden

`VERIFIED`. `declared-harvest.sh:74-77` geeft `DECLARED_HARVEST_MAX_SECONDS` en
`DECLARED_HARVEST_BATCH` expliciet per `docker exec` mee — met de uitdrukkelijke motivering dat de
container-omgeving die niet mag overschrijven (`:61-63`). `DECLARED_HARVEST_CODES` krijgt die
behandeling **niet**. Staat die variabele op de ml-container (bijvoorbeeld overgebleven van een
debugsessie), dan is elke nachtelijke run stilzwijgend gescoped — en sinds M3 uit ronde 2 schrijft
zo'n run zijn voortgang in `next_offset:<codes>`. De nachtelijke teller `next_offset` **beweegt dan
nooit meer**, en de droogloop van de bouwer leest juist het ongescopete veld (`:561-565`) en meldt
"dezelfde parenlijst — de teller blijft staan". Vóór deze ronde viel zoiets nog op (de teller
sprong zichtbaar terug); nu is het onzichtbaar. De reparatie is één regel:
`-e DECLARED_HARVEST_CODES=""` erbij.

### M4 (middel) — een opgeschreven oorzaak die niet kan kloppen, en een poortgetal dat niet reproduceert

`VERIFIED`, zie sectie 2 en de poortentabel. `27d0d81` legt een gemeten oorzaak vast (extra
Prisma-clients die verbindingen opeten) die in deze suite onmogelijk is, en een basisstand
("`origin/acc` 1089 groen zonder flakes") die ik in twee runs niet terugzie. De code**wijziging**
zelf is prima en mag blijven — het is de vastlegging die niet klopt, en die staat inmiddels ook in
`sprint-status.yaml`. Corrigeer de commit-toelichting in het storybestand en zet er het gemeten
getal bij, met de kanttekening dat beide takken op deze machine timeouts geven.

### L1 (laag) — `_is_missing_object` spreekt zijn eigen commentaar tegen

`VERIFIED`. `queue_harvest_declared.py:493-497`: het commentaar zegt uitdrukkelijk *"Bewust NIET
'bucket bestaat niet'"*, maar `_MISSING_OBJECT_TEXT` bevat `"does not exist"` en `"not found"`, en
de standaardboodschap van een S3-`NoSuchBucket` is *"The specified bucket does not exist"*
(`INFERENCE` voor die letterlijke tekst). Praktisch klein: de kaart wordt eerder gelezen dan de
stand en is fail-loud op álles, dus een ontbrekende bucket komt hier normaal niet aan. Maar de
tekstmatch is breder dan bedoeld en de code zegt het tegenovergestelde van zijn commentaar.

### L2 (laag) — vier nieuwe toetsen pinnen brontekst waar gedrag toetsbaar was

`VERIFIED`. `build-declared-harvest-map.test.ts:552-561` (`/PIPESTATUS/`, `/exit "\$status"/`),
`:539-549` (`/AANTAL=.*grep -c/`, `/MEER DAN EEN/`), `:586-604` (`toContain('MAX_SECONDS +
LOCK_GRACE_SECONDS')`) en `:606-617` (`toContain('signature_field = f"map_signature{_scope_suffix()}"')`)
beweren iets over gedrag maar meten de aanwezigheid van een tekenreeks in een ander bestand. Dat is
hetzelfde patroon dat ronde 1 (M5) en ronde 2 (L5) al aanwezen. Dat het anders kan, laat sectie 3
zien: de zes gedragsgevallen kostten mij één opdracht met een nagemaakte `docker` in `PATH`. De
laatste twee breken bovendien op elke herformulering van de python-bron.

### L3 (laag) — `locked` in `ALERT_STATUSES` maakt van de inhaalronde elke nacht een mislukking

`VERIFIED` op de code. De runbook schrijft een eenmalige inhaalronde van 36000 s voor; zolang die
loopt, weigert de nachtelijke cron terecht met status `locked` — en die staat in `ALERT_STATUSES`
(`:734-748`), dus hij eindigt op exitcode 1 en `declared-harvest.sh` geeft dat door. Tien uur
inhaalronde levert zo een cron-mail "mislukt" op voor een run die precies deed wat hij moest doen.
Weeg: `locked` eruit, of hem alleen als alarm tellen als de marker ouder is dan verwacht.

### L4 (laag) — de offset schuift nog altijd hoogstens `PER_CODE_CAP` per run op

`VERIFIED` op de code en in de twee-runs-toets (`:942-985`: 0→1→2 bij cap 1). Ronde 2 vroeg alleen
dat een afgeketst paar niets meer kóst, en dat is gelukt. Maar een code met veel paren vooraan in
de gesorteerde lijst laat de teller nog steeds met hooguit `PER_CODE_CAP` per nacht opschuiven, en
de paren erachter komen tot die tijd niet aan de beurt. Bij de standaardcap 15 en 1349 paren is dat
geen ramp, maar het is een eigenschap die nergens is opgeschreven en die het vliegwiel achter één
verzadigde code traag houdt.

### L5 (laag) — niets toetst dat de exitcode de container ook echt verlaat

`VERIFIED`. `test_de_statussen_waarop_niets_gebeurde_geven_een_niet_nul_exitcode`
(`test_queue_harvest_declared_20_20.py:1083-1097`) somt dezelfde vijf statussen op als
`ALERT_STATUSES` — hij herhaalt de implementatie. Dat `if __name__ == "__main__"` die code ook
werkelijk aan `sys.exit` geeft (`:1315`) en dat het startscript hem doorlaat, wordt door geen enkele
toets gedekt. Ik heb het tweede zelf gemeten (sectie 3); het eerste is `INFERENCE` uit de bronregel.

---

## 5. Deel B en schrijfacties

`VERIFIED`, vijf routes:

* De diff `f051ddf..HEAD` raakt uitsluitend twee bronbestanden, twee toetsbestanden, twee
  `.sh`-bestanden en drie documenten (`git diff --stat f051ddf..HEAD`). Geen migratiebestand, geen
  `apps/web`.
* Geen `crontab`, `systemctl`, `cp … /usr/local/bin`, `prisma migrate` of `db push` toegevoegd
  (`git diff f051ddf..HEAD | grep -E '^\+.*(crontab|systemctl|…)'` → alleen twee documentregels die
  het ONDERWERP noemen).
* Buiten `_bmad-output/` wordt geen van beide scripts aangeroepen: `git grep` levert twee
  toetsverwijzingen, één commentaarregel en de cron-regel in de scriptkop — als tekst.
* `writeMap` is nog steeds alleen bereikbaar achter `--apply` én een doorlaatbare krimppoort
  (`build-declared-harvest-map.ts:682-704`); droogloop is de standaard.
* Mijn eigen runs: de startscripts draaiden met een **nagemaakte `docker`** in een wegwerpmap vóór
  in `PATH` (geen echte container), de python-suite in een `--rm`-container op een kopie van de
  bron in de wegwerpmap. Geen kaart geschreven, geen teller teruggezet, geen cron geplaatst, geen
  migratie toegepast.

Werkboom bij aanvang schoon; `origin/acc` los uitgecheckt in een losgekoppelde HEAD en daarna
teruggezet op `epic-20-declaratie-oogst` (`git status --porcelain` leeg, op dít bestand na).

---

## Wat moet wijzigen

**Hoog — moet vóór `done`:**

1. **Scheid "er is geen kaart" van "de kaart is niet te lezen" in `readExistingPairs`**
   (`build-declared-harvest-map.ts:528-544`). `!buf` blijft een eerste run; een `catch` hoort te
   stoppen met exitcode 1, net als `readSourceIndex` (`:639-646`) al doet — anders schrijft de
   wekelijkse `--apply`-cron de kaart over zonder de krimpbescherming van AC6, met een regel die
   "eerste run" beweert. Toets: een lezende afhankelijkheid die gooit, en `runBuild` die 1 teruggeeft
   zonder `writeMap` aan te raken.

**Middel — hoort in dezelfde ronde mee:**

2. Geef `readHarvestState` (`:546-570`) dezelfde behandeling. Nu meldt de droogloop bij een leesfout
   "nog geen vingerafdruk — de teller blijft staan", terwijl de oogst hem terugzet. Dat is het gat
   van punt 2 uit ronde 2, teruggelegd op het foutpad.
3. Haal de onbereikbare late cap-tak weg (`queue_harvest_declared.py:1201-1217`) en verplaats de
   uitleg naar de tak die wél draait (`:1096-1114`). Hernoem of herricht
   `test_ac4_cap_bereikt_telt_ook_niet_als_afgehandeld` (`:572-590`), die nu een andere tak beproeft
   dan waar hij bij hoort.
4. Zet `DECLARED_HARVEST_CODES` vast in `declared-harvest.sh` (`-e DECLARED_HARVEST_CODES=""`), op
   dezelfde grond als `MAX_SECONDS` en `BATCH` daar al staan. Sinds de teller scope-bewust is, kan
   een blijvende container-env de nachtelijke voortgang stil in een zijteller parkeren.
5. Corrigeer de vastlegging van `27d0d81` in het storybestand en `sprint-status.yaml`: de
   opgegeven oorzaak (extra Prisma-clients) kan in deze suite niet kloppen — `@prisma/client` is
   ge-aliast en gemockt — en "1138 groen" / "acc 1089 zonder flakes" reproduceert niet. De
   codewijziging mag blijven; de bewering moet weg of gemeten worden.

**Laag — repareer waar je toch bent:** L1 (`_is_missing_object` matcht "does not exist" en dus ook
`NoSuchBucket`, in weerwil van zijn eigen commentaar), L2 (vier tekstuele toetsen vervangen door
gedragstoetsen; voor de shellscripts kost dat één nagemaakte `docker` in `PATH`), L3 (`locked` uit
`ALERT_STATUSES`, of alleen alarmeren bij een verlopen marker), L4 (schrijf in de story op dat de
teller hooguit `PER_CODE_CAP` per run opschuift achter een verzadigde code), L5 (een toets die
bewijst dat `__main__` de exitcode werkelijk doorgeeft).

---

## Wat NIET geverifieerd is

* **Niets is tegen een echte omgeving gedraaid.** Geen database, geen MinIO, geen container op
  `vanilla`, geen migratie, geen deploy. De startscripts zijn gedraaid met een nagemaakte `docker`;
  dat bewijst de bash-logica, niet dat `docker exec` op acceptatie slaagt.
* **De containerprefixen** (`app-qsookwow8koko0kwg00g0cwk-`, de ml-prefix) zijn niet tegen een
  draaiende omgeving gehouden; het bewijs in de toets is een verwijzing naar eerdere reviews.
* **Of `declared_harvest_checks` op acceptatie bestaat** en of migratie 0021 daar is toegepast, is
  opnieuw niet gemeten. Deze ronde raakt het migratiebestand niet; de waarschuwing staat nu in het
  storybestand.
* **De letterlijke boodschap van een S3-`NoSuchBucket`** (L1) is `INFERENCE` uit de bekende
  S3-foutvorm, niet uit een run tegen MinIO.
* **De timeouts in `apps/api` en `apps/web`** zijn niet uitgezocht — alleen vergeleken. Dat ze op
  beide takken voorkomen is gemeten (vier api-runs); *waarom* ze voorkomen niet. Dat de web-uitval
  geen regressie is, leun ik op het feit dat de tak geen enkel `apps/web`-bestand raakt.
* **De getallen uit de story** (1349 paren, 39 codes, ~28 s per paar, ~8,5 uur) zijn opnieuw niet
  nagemeten; L4 leunt erop.
* **RED-vóór-GREEN** is niet na te lopen — de commits zijn samengeperst. Beoordeeld is wat de
  toetsen in hun eindtoestand vastpinnen; voor de late cap-tak is dat met een mutatie gedaan.
* **Het ene falende ml-geval** (`test_phash_service`) en de drie collectiefouten zijn als bestaande
  basisstand aangenomen, niet uitgezocht.
