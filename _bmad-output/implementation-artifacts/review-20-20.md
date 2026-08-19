---
review_of: _bmad-output/implementation-artifacts/20-20-declaratie-oogst-weer-aan-de-gang.md (spec versie 1)
reviewer: adversariële spec-review (verse context, alleen-lezen)
date: 2026-08-19
verdict: FAIL
severity_count:
  high: 4
  medium: 10
  low: 4
---

# Tegenlezing story 20.20 — "De declaratie-oogst weer aan de gang, en goedkoop houden"

> [!warning]
> De herschrijving pakt 8 van de 13 punten uit `review-20-2.md` volledig op en de diagnose is
> opnieuw bevestigd. Maar de **kernrekensom van de story past haar eigen AC2 niet toe**: de derde
> uitsluiting (RECYCLABLE/TRIMAN, 537 paren) ontbreekt in elk getal. Gemeten hoort er
> **1349 paren / 39 codes / 867 producten** te staan, niet 1886 / 41 / 1005. AC2 en AC11 kunnen
> daardoor niet allebei groen zijn. Daarnaast onthoudt AC4 uitkomsten die **niet blijvend zijn**
> ("onder de drempel", "cap"), wat de oogst tegen zijn eigen vliegwiel dichtzet.

Alle metingen hieronder zijn op 19 augustus 2026 zelf gedaan, alleen-lezen: `ssh vanilla` +
`docker exec` op `ml-service-qsookwow8koko0kwg00g0cwk`, en `ssh coolify-host` +
`docker exec coolify-db psql`. De gebruikte scripts staan onderaan.

---

## 1. De 13 punten uit `review-20-2.md` § "Wat moet wijzigen vóór dev"

| # | Punt | Oordeel | Bewijs |
|---|---|---|---|
| 1 | Regel de aandrijving (kaart herbouwen **én** oogst draaien) | **DEELS** | AC7 (`:127-132`) regelt alleen de oogst. Nergens staat wie de kaart periodiek herbouwt; AC1 levert opnieuw een script dat iemand met de hand start. Het punt vroeg expliciet om beide. |
| 2 | Kaart beperken tot codes met ≥1 actieve referentie + aparte lijst | **VERWERKT** | AC2 (`:83-93`), inclusief de aparte sleutel "wacht op een eerste referentie". |
| 3 | Veldsoort `NutritionalScore` uitsluiten, met reden | **VERWERKT** | AC2, rij 1 (`:87`); beide redenen (codenaam-mismatch én dubbele items) staan erbij. |
| 4 | Kosten van het terugzetten erkennen + het goedkope alternatief | **DEELS** | Het alternatief staat er goed en volledig (AC4, `:100-112`: onthouden + de toets vóór het dure werk). De getallen kloppen niet (H1, M1, M2). |
| 5 | Standaard-modus corrigeren, één bestaande conventie bij naam | **VERWERKT** | AC1 (`:76-78`) noemt twee bestaande scripts; beide zijn nagemeten en kloppen. Kanttekening M9. |
| 6 | AC4 toetsbaar maken: welk proces schrijft, `in_progress`, welk getal | **DEELS** | "welk proces" staat er (AC5, `:117`). `in_progress` is een **opdracht** ("leg vast wat er gebeurt"), geen criterium (M10). Het derde deel — kaartparen of door artwork gefilterde paren — is niet beantwoord (M6). |
| 7 | Krimpbescherming | **DEELS** | AC6 bestaat (`:122-125`), maar eindigt met "Kies een grens en noem hem" — de spec kiest hem niet (M5). |
| 8 | Splitsen bouw / ná toestemming, en de 5%-toets vervangen | **VERWERKT** | Deel A (`:66`) tegenover Deel B (`:140`); de droogloop-vergelijking met de 5%-drempel is volledig verdwenen. |
| 9 | Uitsluitingen vastleggen in de kaart (of verplaatsen naar het bereik) | **VERWERKT** | AC1 (`:80-81`): de kaart draagt `builtAt`, de bronindexsleutel en de toegepaste uitsluitingen. |
| 10 | De verwachting vóór de run opnemen | **DEELS** | AC11 (`:146-159`) heeft de tabel, en het weglaten van de opbrengstschatting is netjes onderbouwd. De getallen zelf kloppen niet (H1, M2). |
| 11 | Eigen storynummer | **VERWERKT** | 20.20, met de verantwoording in de kop (`:5-8`). |
| 12 | Ontbrekende bronnen opnemen | **VERWERKT** | `build-nutriscore-declared-map.ts` (`:177`) en `oogst-voorraad-2026-08-18.md` (`:179`) staan er beide. |
| 13 | Bronpagina in de ontdubbelsleutel + beslissen bij paginawissel | **VERWERKT** | AC4 (`:110-112`), met de beslissing erbij ("dan is het een nieuw paar"). |

**8 VERWERKT · 5 DEELS · 0 NIET.**

---

## 2. Toetsing van elke feitelijke bewering

### Wat klopt

| Bewering | Uitkomst |
|---|---|
| 0 open items, meest recente 27 juli 2026 | `VERIFIED` — `SELECT count(*) … WHERE status='open'` → 0; `max(created_at) = 2026-07-27 13:52:04+00`. Statusverdeling: 4521 `dismissed_low_conf`, 1489 `dismissed_recyc`, 759 `registered`, 528 `gated_nonkeurmerk`, 323 `rejected`, 13 `accepted`, 2 `dismissed_keyline` |
| Index: 89 codes, 1082 producten | `VERIFIED` — 90 sleutels `veldsoort/code`, 89 unieke codes, 1082 unieke GTINs, `builtAt 2026-08-19T17:09:38.335Z` |
| Kaart: 16 juli, 39 codes, 791 producten | `VERIFIED` — `builtAt: "2026-07-16"`, 39 codes, 791 GTINs, 1521 paren, `mergedAt 2026-07-27` |
| Niets bouwt de kaart | `VERIFIED` — de vier routes uit `review-20-2.md` zijn overgenomen en blijven staan; het bestand draagt nog steeds `source: "20-1-meting (prod-Mongo)"` en een `sourceNotes`-regel die het handwerk documenteert |
| De enige planning op ACC start de **volume**-oogst | `VERIFIED`, vier routes: `crontab -l` → één oogstregel (`37 3 * * * /usr/local/bin/keurmerk-harvest.sh`), en dat script draait `python -m app.services.queue_harvest`; `grep` over alle bestanden in `/etc/cron.d/` → geen treffer op harvest/keurmerk/declared; `systemctl list-timers --all` → geen treffer; **volledige** uitdraai van `scheduled_tasks` in de Coolify-database (23 rijen, alle getoond) → geen enkele met `harvest` en geen enkele op applicatie 106/de logoRecognition-app. Bovendien `grep -ci declared /var/log/keurmerk-harvest.log` → 0 |
| Nutri-Score: 209 paren, sleutels `NutritionalScore/A`..`/E` | `VERIFIED` — exact 209, precies vijf sleutels |
| 43 codes zonder ook maar één actieve referentie, 281 paren | `VERIFIED` — 48 codes zonder actieve referentie (490 paren); vijf daarvan zijn de Nutri-Score-letters A..E (209 paren); blijft **43 codes / 281 paren**. Gebruikt fragment: `SELECT DISTINCT t3777_code FROM reference_logos WHERE active = true` (61 codes) |
| `PREGNANCY_WARNING` onder twee veldsoorten, 130 en 2 | `VERIFIED`, en het is nog steeds de **enige** code met meer dan één veldsoort |
| `queue_harvest.py:75` sluit `RECYCLABLE_GENERAL_CLAIM` en `TRIMAN` uit | `VERIFIED` — `_DEFAULT_EXCLUDE_CODES` staat exact op regel 75 |
| `review_item_exists` op `:548` | `VERIFIED` |
| Cross-code-guard `:535`, keyline-guard `:480` | `VERIFIED` |
| De ontdubbeling onthoudt alleen paren die een item **opleverden** | `VERIFIED` — `review_item_exists` (`database.py:734`) kijkt naar rijen in `artwork_review_items`; de paden `skipped_below_floor`, `skipped_cross_code`, `skipped_keyline` en `skipped_cap` (`queue_harvest_declared.py:496`, `:525`, `:536`, `:544`) schrijven **niets**. De enige andere sporen zijn `next_offset` en `total_pairs` in `keurmerk-harvest/declared-harvest-state.json`, en die zijn betekenisloos zodra de parenlijst wijzigt |
| De index kapt standaard af op 500 GTINs | `VERIFIED` — `getIndexLimit()` retourneert 500 bij ontbrekende env (`build-keurmerk-index.ts:266-268`) |
| Precedent dry-run-als-standaard: `backfill-gln-from-tradeitems.ts` | `VERIFIED` — `:303-305`, `const apply = has('--apply'); const dryRun = has('--dry-run') \|\| !apply;` |
| Precedent dry-run-als-standaard: `correct_nutriscore_labels.py` | `VERIFIED` — `:388-390`, `--apply` met help "zonder deze vlag: dry-run, geen writes" |
| `queue_harvest.py` mist ontdubbeling | `VERIFIED` — de INSERT op `:283` heeft geen `ON CONFLICT`, en `review_item_exists` komt in het bestand niet voor |

### Wat niet klopt

**M1 — "2377 paren" is het aantal **rijen**, niet het aantal paren; de rekensom gebruikt 2376.**
`VERIFIED`: de index bevat 2377 `(sleutel, rij)`-combinaties maar **2376 unieke (code, gtin)-paren**.
Het verschil is precies één GTIN die `PREGNANCY_WARNING` onder beide veldsoorten declareert — het
geval waar AC3 (`:95-98`) over gaat. De spec zet 2377 in de tabel en trekt er dan 209 en 281 af tot
1886; die uitkomst hoort bij 2376 (2377 − 209 − 281 = 1887). De kop van de tabel telt dus het
dubbeltellen mee dat de story zelf wil wegnemen.

**M2 — "312 al afgehandeld" en "1574 echt door te rekenen" zijn allebei twee te laag.**
`VERIFIED` via twee sleutelingen die hetzelfde antwoord geven: **314**, en dus **1572** in plaats van
1574. Er zijn 327 `declared-harvest`-rijen, goed voor 314 unieke `(code, gtin)`-combinaties én 314
unieke `(code, gtin, bronpagina)`-combinaties, verspreid over 28 codes. Alle 314 vallen binnen de
1886-verzameling. Klein op zichzelf, maar het is een `VERIFIED`-gemarkeerd getal in een tabel die
de kosten van de story draagt.

**M7 — `propose_regions` staat op `:477`, niet op `:479`.**
`VERIFIED`: regel 477 is `boxes, _ = propose_regions(img)`; 478 en 479 zijn commentaarregels van de
keyline-guard, en 480 is `is_keyline = …`. Het nummer 479 staat drie keer in de spec (`:61`, `:107`
en de bronverwijzing op `:174`). De guards zelf (`:480`, `:535`, `:548`) kloppen wél.

**L2 — `build-keurmerk-index.ts:261-264` wijst naar de toelichting, niet naar de code.**
`VERIFIED`: 259-265 is het doc-commentaar (dat "Default 500" noemt), de functie staat op 266-268.
De bewering zelf klopt; alleen het regelbereik wijst naar proza.

**L3 — de ~28 seconden per paar zijn niet opnieuw gemeten.**
`VERIFIED`: het getal komt uit `20-11-oogst-geheugengrens-batching.md:105` (een meting bij 173
paren). In de spec staat het binnen een blok dat met `VERIFIED` is gemarkeerd, zonder herkomst. Ik
heb het niet nagemeten — dat zou een oogstrun vereisen.

**L1 — AC1 en de bronnenlijst wijzen naar verschillende voorbeelden.** AC1 (`:68-70`) schrijft "in
dezelfde stijl" als `build-keurmerk-index.ts`, terwijl de bronnenlijst (`:177`)
`build-nutriscore-declared-map.ts` "het echte precedent voor een kaartbouwer" noemt. Kies er één.

**L4 — AC8 hangt aan regelnummers.** `review-20-2.md` §3 vroeg om functienamen in plaats van
regelnummers, juist omdat die verouderen. AC8 (`:134-135`) gebruikt opnieuw `:535` en `:480` — en
M7 laat zien dat dat precies is wat er misgaat.

---

## 3. Gaten in het nieuwe ontwerp

### HIGH-1 — de derde uitsluiting uit AC2 zit in geen enkel getal van de story

`VERIFIED`, per stap gemeten over de levende index van 19 augustus:

| stap | paren | codes | producten |
|---|---|---|---|
| unieke `(code, gtin)` in de index | 2376 | 89 | 1082 |
| − veldsoort `NutritionalScore` (AC2, rij 1) | 2167 | 84 | — |
| − codes zonder actieve referentie (AC2, rij 2) | **1886** | **41** | **1005** |
| − `RECYCLABLE_GENERAL_CLAIM` (285) en `TRIMAN` (252) (AC2, **rij 3**) | **1349** | **39** | **867** |
| − paren die al een item hebben | **1095** | | |

De spec stopt bij de tweede regel. Haar kerngetallen — 1886, "1574 echt door te rekenen",
"ruim 12 uur", en de AC11-verwachting van **41 codes / 1005 producten** — zijn **exact** de kolom
die de derde uitsluiting niet toepast. Dat is geen toeval maar een reproduceerbare meting: 41/1005
komt er alleen uit als RECYCLABLE en TRIMAN blijven staan.

`VERIFIED` dat de twee niet al door een andere uitsluiting worden gevangen: beide codes **hebben**
een actieve referentie, en beide staan in de huidige kaart. De cel "zie meting" in AC2 (`:89`) is
dus nooit ingevuld — en het antwoord is 537 paren, ruim een kwart van het werk.

Gevolg: **AC2 en AC11 kunnen niet allebei groen zijn.** Bouwt de ontwikkelaar AC2 zoals hij er
staat, dan meet AC11 een kaart van 39/867 tegen een verwachting van 41/1005 en faalt. Bouwt hij naar
AC11, dan laat hij de uitsluiting weg die AC2 eist. De echte eenmalige rekentijd is ~1095 × 28 s ≈
**8,5 uur**, niet ruim 12.

**Nodig:** de tabellen in "Wat er stilstaat" en in AC11 doorrekenen met alle drie de uitsluitingen,
en de cel "zie meting" vervangen door 537.

### HIGH-2 — AC4 onthoudt uitkomsten die niet blijvend zijn, en zet de oogst zo tegen zijn eigen vliegwiel dicht

AC4 (`:103-104`) schrijft voor: leg de uitkomst vast als *kandidaat / onder de drempel / cross-code
afgewezen / keyline / cap*, en sla een nagekeken paar de volgende ronde over. Twee van die vijf
uitkomsten mogen niet blijvend zijn.

**"onder de drempel" is een oordeel tegen de referentiepool van dát moment.** `VERIFIED`: de
beslissing valt op `find_similar_references_by_codes(embedding, t3777_codes=[code], threshold=FLOOR)`
(`queue_harvest_declared.py:512-517`) — strikt binnen de referentiepool van die ene code. Groeit die
pool, dan kan hetzelfde paar wél matchen. En groeien is precies wat er hoort te gebeuren: de story
schrijft zelf een aparte lijst "wacht op een eerste referentie" (`:91-93`) voor 43 codes, en de
goedgekeurde kandidaten van de beoordeelwachtrij worden referenties. Een paar dat vandaag onder de
drempel valt en morgen voorgoed wordt overgeslagen, is het vliegwiel dat zijn eigen aandrijving
uitschakelt.

**"cap" is helemaal geen oordeel over het paar.** `VERIFIED`: `PER_CODE_CAP` is een
budgetbegrenzing per run (`queue_harvest_declared.py:541-544`) — het paar is niet afgewezen, er was
alleen geen ruimte meer. Vastleggen als "nagekeken" laat die paren nooit meer terugkomen. (Dat de
huidige offset ze óók al als afgehandeld telt — `done_idx.add(i)` op `:491`, vóór de cap-toets — is
een bestaand probleem; AC4 maakt het blijvend in plaats van het te herstellen.)

**Nodig:** per uitkomst vastleggen of hij blijvend is. "keyline" en "kandidaat" zijn dat; "onder de
drempel" hoort een stempel te dragen dat ongeldig wordt zodra de referentiepool van die code
verandert (bijvoorbeeld het aantal actieve referenties op het moment van meten); "cap" hoort
helemaal niet in de vastlegging.

### HIGH-3 — AC7 en AC11 beschrijven twee onverenigbare uitvoeringen, en er is geen bescherming tegen twee gelijktijdige oogsters

**Onverenigbaar.** AC11 belooft "~12 uur eenmalig". AC7 vraagt een periodieke start "met een
tijdslimiet". `VERIFIED`: de bestaande tijdslimiet is `DECLARED_HARVEST_MAX_SECONDS=1000`
(`queue_harvest_declared.py:60`) en het gemeten tempo is ~28 s/paar — ongeveer **35 paren per run**.
1095 paren zijn dan ~31 nachten, 1572 paren ~45 nachten. Ofwel de story bedoelt één lange
handmatige run (dan is AC7 niet de aandrijving die AC11 meet), ofwel nachtelijke runs (dan bestaat
"eenmalig ~12 uur" niet). De spec kiest niet.

**Gelijktijdigheid.** De opmerking bij AC7 (`:131-132`) gaat over api tegenover ml-service. Dat is
niet het risico. `VERIFIED`: **beide** oogsters draaien met `docker exec` in dezelfde
ml-service-container. Die container heeft een geheugenlimiet van **8 GiB**
(`docker inspect … .HostConfig.Memory` → 8589934592; huidig gebruik 1,37 GiB). De declaratie-oogst
meet bewust het **gedeelde** cgroup-geheugen en stopt boven 75% (`MEM_STOP_FRACTION`,
`queue_harvest_declared.py:132`) — en story 20.11 laat zien dat een oogstrun tot 7 GB kon lopen.
Twee oogsters die elkaar overlappen, laten de tweede dus vroeg en stil afbreken.

Er is geen slot. `VERIFIED`: `in_progress` wordt op `:407` gezet en op `:319`/`:374` opgeruimd, maar
op **geen enkele plek** gelezen om een start te weigeren — de enige lezing (`:372`) staat in de tak
"alles al gedekt". Dat het vandaag niet knelt komt alleen doordat de volume-oogst op 1857/1857 staat
en in ~20 seconden klaar is (`/var/log/keurmerk-harvest.log`, 19 augustus 01:37) — en de story
noemt "de volume-oogst weer aan de praat krijgen" zelf als vervolgstory (`:166`).

**Nodig:** in AC7 een startvenster dat niet overlapt met 03:37 **en** een expliciet slot (of een
toets op `in_progress` mét vervaltijd), plus de keuze tussen "één lange run" en "nachtelijke runs"
met het bijbehorende getal in AC11.

### HIGH-4 — AC4 zegt niet waar de vastlegging leeft, wat hij kost, of wat er gebeurt als hij weg is

De vraag is bewust gesteld en de spec beantwoordt hem niet. Dat is bezwaarlijk, want elk van de twee
opties heeft een ander faalgedrag en de bestaande code faalt precies de verkeerde kant op.

**Objectopslag (zoals `declared-harvest-state.json`).** `VERIFIED`: het bestaande patroon is
fail-safe naar *leeg*. `_load_declared_map` (`:207-220`) geeft bij een onleesbaar bestand een lege
dict terug, en het staatbestand valt terug op `{"next_offset": 0}` (`:340-346`). Vertaalt de
ontwikkelaar dat patroon naar de vastlegging, dan betekent één corrupt object: **niets onthouden,
alles opnieuw** — 8,5 uur, stil, met alleen een waarschuwing in het log. Dat is exact het scenario
dat AC4 zou moeten voorkomen. Bovendien wordt het object bij elke checkpoint (`FLUSH_EVERY=25`,
`:135`) opnieuw volledig weggeschreven; bij de huidige 1349 paren is dat te verwaarlozen, maar het
corpus waar dit heen groeit is ~39.000 GTINs.

**Database.** `artwork_review_items` staat er al, met een pool en een index. Een kleine eigen tabel
`(t3777_code, gtin, source_file, uitkomst, refs_bij_meting, gemeten_op)` is transactioneel, in bulk
op te vragen vóór de paginalus, en overleeft een harde afbreking. Dat is de sterkere keuze en past
bij het feit dat de ontdubbeling nú ook uit de database komt.

**Aanbeveling:** database, met de expliciete regel dat een ontbrekende of onleesbare vastlegging
**de run tegenhoudt** in plaats van hem stil duur te maken.

Daarbovenop drie onopgeloste punten in dezelfde AC:

1. **AC4 spreekt zichzelf tegen over de sleutel.** `:103` zegt "per `(code, gtin)`", `:110` zegt
   "Sleutel de vastlegging op `(code, gtin, bronpagina)`". Kies er één. (Ter informatie: `VERIFIED`
   dat het vandaag niets uitmaakt — beide sleutelingen geven 314 respectievelijk 254 overslagen. Dat
   komt doordat `_pick_page` (`:195-204`) deterministisch is en elke GTIN precies één pagina krijgt:
   eerst een `converted-0`-bestand, dan een `_1`-bestand, anders alfabetisch de eerste. Een product
   met meerdere pagina's wordt dus sowieso maar op één pagina bekeken — de vastlegging verliest
   daar niets, maar de **oogst** ziet de andere pagina's überhaupt nooit.)
2. **Verhoudt de vastlegging zich tot `review_item_exists`, of vervangt hij die?** Beide onthouden
   "al gedaan", op dezelfde sleutel, in twee bronnen die uit elkaar kunnen lopen. De spec zwijgt.
   `VERIFIED` als reden om `review_item_exists` te **behouden**: die toets is bewust statusblind
   (`database.py:734-742`) en houdt dus ook `rejected`- en `dismissed_*`-items tegen — een
   eigenschap die de nieuwe vastlegging niet automatisch heeft.
3. **Maakt de vastlegging de teller uit AC5 overbodig?** AC4 zegt alleen dat terugzetten "niet meer
   duur" is (`:120`). Zolang beide bestaan, is er een tweede waarheid over voortgang die kan
   afwijken; het eenvoudigste ontwerp laat de offset vervallen en leidt de voortgang af uit de
   vastlegging. Dat is een echte keuze en hoort in de spec, niet bij de ontwikkelaar.

---

### MEDIUM-3 — AC7 laat de helft van punt 1 liggen: niets herbouwt de kaart periodiek

AC7 regelt alleen de oogst. Zonder een periodieke herbouw van de kaart schuift het handwerk van
"kaart bijwerken" naar "bouwscript starten" — precies de verplaatsing die `review-20-2.md` punt 1
afwees. Het is bovendien de enige route waarlangs de 43 wachtende codes ooit in de kaart komen zodra
ze hun eerste referentie krijgen.

### MEDIUM-4 — AC7 staat in deel A maar schrijft op acceptatie, en de toestemmingspoort noemt hem niet

AC10 (`:142-144`) noemt drie schrijfacties: de kaart, de teller en de echte oogstrun. Het
**installeren van een planning op de acceptatieserver** staat er niet bij, terwijl AC7 in deel A
staat — het deel dat volgens de story zonder toestemming afgerond kan worden. Een cron-regel
plaatsen op `vanilla` is een schrijfactie op acceptatie. Ofwel AC7 verhuist naar deel B, ofwel AC10
noemt hem expliciet.

### MEDIUM-5 — AC6 is niet toetsbaar zoals hij er staat

"Kies een grens en noem hem" (`:125`) is een opdracht aan de ontwikkelaar, geen criterium. Er kan
geen falende toets uit geschreven worden, terwijl AC9 (`:137`) juist RED-bewijs voor AC6 eist. Twee
gevallen ontbreken bovendien:

- **De eerste run**, waarin er nog geen kaart is om tegen te vergelijken — de bescherming mag dan
  niet blokkeren.
- **Wat de droogloop doet.** Meldt hij de krimp ook zonder te schrijven? Dat is de enige manier om
  de bescherming te zien vóórdat er iets misgaat.

*Antwoord op de vraag of dit zonder echte kaart toetsbaar is: ja.* `VERIFIED`: beide bestaande
bouwers scheiden de zuivere logica van de I/O (`build-keurmerk-index.ts:255-257`, "I/O-laag (alleen
in `main()`)"), en de kaart is een gewoon JSON-object. Een zuivere functie `magSchrijven(oud, nieuw)`
is met verzonnen tellingen te toetsen. Wat de spec mist is niet de toetsbaarheid maar het **getal**.

Twee opmerkingen die de bescherming sterker maken: `VERIFIED` dat de opgeslagen index **geen**
`truncated`- of `total`-veld draagt (topsleutels: `builtAt`, `declarationSource`,
`universeReference`, `universeCodeCount`, `summary`) — de afkapwaarschuwing gaat alleen naar de
console (`build-keurmerk-index.ts:731`). De suggestie uit `review-20-2.md` om die melding over te
nemen is dus niet uitvoerbaar; de vergelijking met de vorige kaart is inderdaad het enige
beschikbare signaal. Wél beschikbaar en bruikbaar: `summary.gtinsWithData` (nu 1082) — een
afgekapte index laat daar ~500 zien.

### MEDIUM-6 — AC5 zegt nog steeds niet op wélk getal "de parenlijst verandert" wordt vastgesteld

De derde vraag van punt 6 is onbeantwoord: het aantal paren in de kaart, of het aantal paren ná
filtering op GTINs met artwork (`queue_harvest_declared.py:361`, en dat is wat via `_checkpoint` in `total_pairs` belandt).
`VERIFIED` dat ze vandaag samenvallen: van de 1082 index-GTINs hebben er **0** geen artwork (1857
GTINs met artwork in MinIO). Dat maakt het onschuldig vandaag en dubbelzinnig zodra de
artwork-import achterloopt op de index — precies de situatie die story 20.19 heeft veroorzaakt.

### MEDIUM-8 — "overslaan vóór de regio-analyse" bespaart minder dan het lijkt

`VERIFIED`: de lus groepeert per bronpagina (`:419-425`) en laadt+analyseert de pagina bij het
**eerste** paar van de groep (`:468-480`), vóórdat er ook maar iets per paar wordt getoetst. Een
overslag per paar, hoe vroeg ook, betaalt dus nog steeds het decoderen en `propose_regions` van elke
pagina waarvan minstens één paar overblijft. De volle besparing vraagt dat de groep **vóór** het
laden wordt gefilterd, en dat een groep zonder overblijvende paren helemaal wordt overgeslagen. AC4
moet dat zeggen, anders bouwt de ontwikkelaar de goedkope helft.

### MEDIUM-9 — de gekozen dry-run-conventie botst met de dichtstbijzijnde precedenten

De twee genoemde precedenten kloppen (zie hierboven), maar liggen allebei buiten de map waar het
nieuwe script komt. `VERIFIED` voor `apps/api/src/scripts/`, de map die AC1 aanwijst: het échte
zusje van dit script — `build-nutriscore-declared-map.ts`, óók een kaartbouwer, óók naar de
`flywheel-index/`-prefix — heeft de droge run juist **uit** staan (`:35`, "droge-run default UIT";
`:296`, `const dryRun = process.argv.includes('--dry-run')`). Datzelfde geldt voor vier andere
scripts in die map. De keuze is verdedigbaar en AC10 leunt erop, maar "gelijk aan" (`:77`) doet
alsof de zaak beslecht is terwijl het nieuwe script het buitenbeentje van zijn eigen map wordt. Noem
dat, dan komt het bij de code review niet terug.

### MEDIUM-10 — `in_progress` is geen slot, en AC5 vraagt de ontwikkelaar dat te ontdekken

AC5 (`:117-118`) draagt op "vast te leggen wat er gebeurt als er een lopende run is". `VERIFIED`:
vandaag gebeurt er niets — de markering wordt geschreven maar nooit gelezen om een start te
weigeren. De spec kan dat zelf beslissen in plaats van het door te schuiven, en het antwoord hangt
samen met HIGH-3.

---

## 4. Toetsbaarheid, en of deel A zonder deel B afgerond kan worden

| AC | Toetsbaar? | Waarom |
|---|---|---|
| 1 | deels | Vorm, sleutelsplitsing en standaard-modus zijn concreet. "In dezelfde stijl" is dat niet, en botst met de bronnenlijst (L1). Geen criterium voor determinisme/idempotentie, terwijl beide bestaande bouwers dat expliciet hebben. |
| 2 | deels | Twee van de drie uitsluitingen zijn met een getal te toetsen; de derde draagt "zie meting" in plaats van 537 (HIGH-1). |
| 3 | ja | Meetbaar en juist: `PREGNANCY_WARNING` 130 + 2, en het is nog steeds de enige zo'n code. |
| 4 | nee | Tegenstrijdige sleutel, geen opslagplaats, geen faalgedrag, twee uitkomsten die niet blijvend mogen zijn, en de besparing wordt niet volledig beschreven (HIGH-2, HIGH-4, MEDIUM-8). |
| 5 | deels | Het precedent en het schrijvende proces staan er; het getal en het gedrag bij een lopende run niet (MEDIUM-6, MEDIUM-10). |
| 6 | nee | De grens ontbreekt, en daarmee de falende toets die AC9 eist (MEDIUM-5). |
| 7 | nee | "Leg vast: wie, hoe vaak, met welke tijdslimiet" is de opdracht, niet het criterium — en de twee kandidaat-antwoorden zijn onverenigbaar met AC11 (HIGH-3). |
| 8 | ja | De guards en hun toetsen bestaan (`test_queue_harvest_declared_20_2.py`). Vervang de regelnummers alsnog door functienamen (L4). |
| 9 | ja | Duidelijk, mits AC2/AC4/AC6 eerst toetsbaar worden gemaakt — anders is er niets om RED op te schrijven. |
| 10 | ja | Duidelijk, mits AC7 erin wordt opgenomen (MEDIUM-4). |
| 11 | nee | De verwachte kolom hoort bij een kaart die AC2 niet oplevert (HIGH-1). |

**Kan deel A zonder deel B afgerond worden?** In opzet ja, en de splitsing zelf is een duidelijke
verbetering: AC1 t/m AC9 zijn allemaal te bouwen en te toetsen zonder één schrijfactie op
acceptatie, en de droogloop is aantoonbaar schrijfvrij (`_flush` `:264-275`, `_checkpoint` `:314`,
de markering `:406`, de opruiming `:373` — alle vier op `DRY_RUN` afgeschermd). Twee dingen breken
het:

1. **AC7 zit in het verkeerde deel** (MEDIUM-4). Een planning installeren is een schrijfactie op
   acceptatie.
2. **AC11 meet een getal dat AC2 niet produceert** (HIGH-1). Deel B kan dan niet slagen, hoe goed
   deel A ook is gebouwd.

---

## 5. Wat wél goed zit

- De diagnose is opnieuw langs vier routes bevestigd en klopt op elk punt.
- De verhuizing van de ontdubbeling naar vóór het dure werk is de juiste ingreep, en de story
  benoemt hem als de kern in plaats van als bijzaak.
- De aparte lijst "wacht op een eerste referentie" is de goede vorm: hij laat 281 kansloze paren uit
  de rekentijd verdwijnen zonder ze onzichtbaar te maken.
- **De uitbreiding van het kaartformaat is veilig.** `VERIFIED`: `_load_declared_map`
  (`queue_harvest_declared.py:221-231`) leest uitsluitend `data["codes"]` en negeert elke andere
  topsleutel. `builtAt`, de bronindexsleutel, de toegepaste uitsluitingen en de wachtlijst kunnen er
  dus zonder risico bij; de oogst hoeft niet mee te veranderen.
- Het weglaten van een harde opbrengstverwachting, mét de reden erbij (`:157-159`), is beter dan het
  cijfer van ~21% uit `review-20-2.md` overnemen — die kwam inderdaad van een andere codemix.
- De AC3-botsing is nog steeds echt en nog steeds enkelvoudig: `PREGNANCY_WARNING` is de enige code
  onder twee veldsoorten, met 130 tegen 2.

---

## Wat moet wijzigen vóór dev

1. **Pas AC2's derde uitsluiting toe op elk getal in de story.** RECYCLABLE_GENERAL_CLAIM (285) en
   TRIMAN (252) zijn samen 537 paren en hebben allebei een actieve referentie, dus geen andere
   uitsluiting vangt ze. Gemeten uitkomst: **1349 paren, 39 codes, 867 producten**, waarvan 254 al
   een item hebben → **1095 door te rekenen, ~8,5 uur**. Vervang daarmee de tabel in "Wat er
   stilstaat", de cel "zie meting" in AC2, en de verwachte kolom in AC11 (nu 41/1005/1574).
2. **Leg per uitkomst in AC4 vast of hij blijvend is.** "cap" hoort er niet in (dat is een
   runbudget, geen oordeel). "onder de drempel" hoort een stempel te dragen dat vervalt zodra de
   referentiepool van die code verandert — anders sluit de oogst zich af voor de referenties die
   het vliegwiel zelf oplevert. "keyline" en "kandidaat" mogen blijvend zijn.
3. **Kies in AC4 de opslagplaats en het faalgedrag.** Aanbeveling: een eigen tabel naast
   `artwork_review_items` — transactioneel, in bulk op te vragen vóór de paginalus, bestand tegen
   een harde afbreking. En expliciet: een ontbrekende of onleesbare vastlegging **houdt de run
   tegen**; hij mag niet stilzwijgend naar "niets onthouden" terugvallen zoals de bestaande
   kaart- en staatlezers doen.
4. **Maak AC4's sleutel eenduidig.** `:103` zegt `(code, gtin)`, `:110` zegt
   `(code, gtin, bronpagina)`. Neem tegelijk op dat de vastlegging naast `review_item_exists` blijft
   bestaan (die is bewust statusblind en houdt ook afgewezen items tegen), en beslis of de
   offset-teller uit AC5 daarmee vervalt.
5. **Zeg in AC4 dat de hele paginagroep vóór het laden wordt gefilterd.** De pagina wordt nu
   gedecodeerd en geanalyseerd bij het eerste paar van de groep, vóór elke toets per paar; een
   overslag per paar alleen bespaart het decoderen niet.
6. **Kies in AC7 tussen één lange run en nachtelijke runs, en reken het door.** Bij de bestaande
   tijdslimiet van 1000 seconden en ~28 s/paar haalt één run ~35 paren — 1095 paren zijn dan ~31
   nachten, niet "~12 uur eenmalig" zoals AC11 belooft.
7. **Voeg aan AC7 een slot en een niet-overlappend startvenster toe.** Beide oogsters draaien in
   dezelfde ml-service-container met 8 GiB, de declaratie-oogst breekt af boven 75% van dat gedeelde
   geheugen, en `in_progress` wordt vandaag nergens gelezen om een start te weigeren. De volume-oogst
   start om 03:37.
8. **Voeg aan AC7 (of aan een eigen criterium) de periodieke herbouw van de kaart toe.** Zonder dat
   blijft de helft van punt 1 uit de vorige ronde liggen, en komen de 43 wachtende codes nooit in de
   kaart zodra ze hun eerste referentie krijgen.
9. **Verplaats AC7 naar deel B, of noem het installeren van de planning expliciet in AC10.** Een
   cron-regel op `vanilla` plaatsen is een schrijfactie op acceptatie; AC10 noemt nu alleen de kaart,
   de teller en de oogstrun.
10. **Kies de krimpgrens in AC6 zelf**, en regel de twee ontbrekende gevallen: geen bestaande kaart
    (eerste run — niet blokkeren) en de droogloop (meldt hij de krimp?). Neem erbij op dat de
    opgeslagen index géén afkapmelding draagt, en dat `summary.gtinsWithData` (nu 1082) het bruikbare
    tweede signaal is.
11. **Beantwoord in AC5 op wélk getal "de parenlijst verandert" wordt vastgesteld** — kaartparen of
    de door artwork gefilterde paren — en beslis wat er gebeurt bij een lopende run in plaats van
    dat aan de ontwikkelaar te laten.
12. **Corrigeer de getallen en verwijzingen:** 2377 → **2376** unieke paren (2377 is het aantal
    rijen; het verschil is precies de dubbeltelling die AC3 wegneemt), 312 → **314**, 1574 → **1572**
    (en na punt 1: 1095), `propose_regions` `:479` → **`:477`** op drie plekken,
    `build-keurmerk-index.ts:261-264` → **`:266-268`**, en zet bij de ~28 s/paar dat die uit
    `20-11-oogst-geheugengrens-batching.md:105` komt en niet vandaag gemeten is.
13. **Ruim twee kleine tegenstrijdigheden op:** AC1 noemt `build-keurmerk-index.ts` als voorbeeld
    terwijl de bronnenlijst `build-nutriscore-declared-map.ts` "het echte precedent" noemt; en AC8
    hangt opnieuw aan regelnummers terwijl de vorige ronde om functienamen vroeg — M7 laat zien
    waarom.

---

## Wat NIET geverifieerd is

- **Of er buiten deze routes tóch een planning voor de declaratie-oogst bestaat.** Ik heb de crontab
  van `vanilla`, alle bestanden in `/etc/cron.d/`, de systemd-timers en de **volledige**
  `scheduled_tasks`-tabel van Coolify (23 rijen, alle uitgedraaid) gelezen. Een planning in n8n, in
  GitHub Actions of op een andere host zou ik zo niet zien. Dit is "niet gevonden", niet "bestaat
  niet".
- **De ~28 seconden per paar.** Overgenomen uit `20-11-oogst-geheugengrens-batching.md:105`. Ik heb
  geen oogstrun gestart (alleen-lezen), dus elke afgeleide rekentijd (8,5 uur, 31 nachten) is
  `INFERENCE` op dat ene getal.
- **Het geheugenverbruik van twee gelijktijdige oogsters.** Dat de limiet 8 GiB is en dat de
  declaratie-oogst het gedeelde cgroup meet, is `VERIFIED`. Dat twee runs elkaar daadwerkelijk over
  de 75% duwen is `INFERENCE`, gebaseerd op de 7 GB uit story 20.11; ik heb het niet waargenomen.
- **Wat de daadwerkelijke opbrengst van de run wordt.** Geen droogloop gedraaid; de story laat dit
  getal terecht open.
- **Of de 314 al afgehandelde paren allemaal uit de hùidige kaart komen.** Gemeten is dat ze
  binnen de 1886-verzameling vallen; dat de resterende ~1207 nagekeken-maar-niets-opgeleverd paren
  uit de 1521 van de huidige kaart komen, is `INFERENCE` (1521 − 314).
- **Of `_pick_page` de juiste laag kiest.** Bekend probleem uit eerder onderzoek (hardgecodeerde
  voorkeur voor `converted-0`, waardoor die-line-first producten hun printlaag verliezen). Buiten
  het bereik van deze tegenlezing; hier alleen relevant omdat AC4 op de bronpagina sleutelt.

## Gebruikte metingen

Alle Python-fragmenten zijn met `docker exec -e PYTHONPATH=/app -w /app <ml-service> python …`
gedraaid op `vanilla`, uitsluitend lezend. De kern:

```python
# unieke paren, uitsluitingen en de kosten per stap
idx = json.loads(storage_service.get_training_image("flywheel-index/keurmerk-etiket-index.json"))
percode = defaultdict(set)
for key, rows in idx["entries"].items():
    ft, code = key.split("/", 1)
    for r in rows:
        percode[code].add(r["gtin"])
refcodes = {r["t3777_code"] for r in await c.fetch(
    "SELECT DISTINCT t3777_code FROM reference_logos WHERE active = true")}
done = {(r["reason"].split(":", 1)[1], r["gtin"]) for r in await c.fetch(
    "SELECT gtin, reason, source_file FROM artwork_review_items "
    "WHERE reason LIKE 'declared-harvest:%'")}
NS = {"A", "B", "C", "D", "E"}; RT = {"RECYCLABLE_GENERAL_CLAIM", "TRIMAN"}
A = {(c, g) for c in percode if c not in NS and c in refcodes for g in percode[c]}
B = {(c, g) for c, g in A if c not in RT}          # AC2 volledig toegepast
# len(A)=1886  len(B)=1349  len(B - done)=1095
```

```bash
ssh vanilla 'crontab -l; grep -iE "harvest|keurmerk|declared" /etc/cron.d/*; \
             systemctl list-timers --all --no-pager | grep -iE "harvest|keurmerk"; \
             grep -ci declared /var/log/keurmerk-harvest.log'
ssh coolify-host 'docker exec coolify-db psql -U coolify -t -A -F"|" \
  -c "SELECT id,name,command,frequency,application_id,service_id FROM scheduled_tasks;"'
ssh vanilla 'docker inspect <ml-service> --format "{{.HostConfig.Memory}}"'   # 8589934592
```
