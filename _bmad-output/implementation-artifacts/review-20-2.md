---
review_of: _bmad-output/implementation-artifacts/20-2-sampler-run-en-vullen-categorie-3.md (spec versie 1)
reviewer: adversariële spec-review (verse context, alleen-lezen)
date: 2026-08-19
verdict: FAIL
severity_count:
  high: 4
  medium: 9
  low: 3
---

# Tegenlezing story 20.2 — "De beoordeelwachtrij vult zich weer, en blijft dat doen"

> [!warning]
> De diagnose klopt: er is inderdaad niets dat de kaart schrijft. Maar de voorgestelde
> oplossing haalt het doel van de story niet. Op de acceptatie-omgeving staat **geen enkele
> planning die de declaratie-oogst draait** — alleen de volume-oogst heeft een cron-regel.
> Een kaart die meegroeit levert dus nog steeds geen kandidaten, omdat niets hem oogst.

## 1. Toetsing van de feitelijke beweringen

Alle metingen hieronder zijn op 19 augustus 2026 zelf gedaan, op de ACC-omgeving
(`ssh vanilla` + `docker exec` op de ml-service-container, alleen-lezen).

### Wat klopt

| Bewering in de spec | Uitkomst |
|---|---|
| 0 open items, 7.635 afgehandeld, meest recente 27 juli | `VERIFIED` — `SELECT status, count(*) FROM artwork_review_items GROUP BY 1` geeft 7.635 rijen, geen enkele `open`; `max(created_at) = 2026-07-27 13:52:04+00` |
| `keurmerk-harvest/state.json` op 1857/1857 | `VERIFIED` — `{'next_offset': 1857, 'total_gtins': 1857, ...}` |
| `queue_harvest.py` heeft geen ontdubbeling | `VERIFIED` — geen enkele aanroep van `review_item_exists` in het bestand; de INSERT staat op `queue_harvest.py:283-295` zonder `ON CONFLICT` |
| Enige unieke sleutel op `artwork_review_items` is de primaire sleutel | `VERIFIED`, twee routes: `0006_add_artwork_pipeline/migration.sql:75-99` én live `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='artwork_review_items'` (1 unique index: `_pkey`) |
| `queue_harvest.py:75` sluit `RECYCLABLE_GENERAL_CLAIM` en `TRIMAN` uit | `VERIFIED` — `_DEFAULT_EXCLUDE_CODES` staat exact op regel 75 |
| Kaart: 39 codes, 791 producten, gebouwd 16 juli | `VERIFIED` — `builtAt = 2026-07-16`, 39 codes, 791 unieke GTINs, 1521 paren |
| Kaartstaat 1521/1521 met `resetAt`/`resetReason` van 27 juli | `VERIFIED` — letterlijk `{'next_offset': 1521, 'total_pairs': 1521, 'resetAt': '2026-07-27T12:57:38.983Z', 'resetReason': 'kaart uitgebreid 8->11 codes; ...'}` |
| RECYCLABLE 223 en TRIMAN 197 zijn de twee grootste posten in de kaart | `VERIFIED` |
| Index van 19 augustus: 90 sleutels, 1082 producten | `VERIFIED` — `builtAt 2026-08-19T17:09:38.335Z`, `declarationSource: stage`, 90 sleutels, 1082 unieke GTINs, 89 unieke codes, 2376 (code, product)-paren |
| Vorm van de index: `entries` met sleutels `fieldType/code` | `VERIFIED` — `build-keurmerk-index.ts:128` (`entries: Record<string, IndexLabelEntry[]>`), sleutel via `indexKey()` |
| Vorm van de kaart: `{"codes": {code: [gtin]}}` | `VERIFIED` — `queue_harvest_declared.py:207-231` (`_load_declared_map`), en de live kaart heeft die vorm |
| `PREGNANCY_WARNING` onder twee veldsoorten, 130 en 2 | `VERIFIED` — `{'EU_consumerUsageLabelCodeList/PREGNANCY_WARNING': 130, 'PackagingMarkedLabelAccreditationCode/PREGNANCY_WARNING': 2}`; het is bovendien de **enige** code met meer dan één veldsoort in de huidige index |
| Cross-code-guard op `:535`, keyline-guard op `:480` | `VERIFIED` — beide regelnummers kloppen; getoetst in `apps/ml-service/tests/unit/test_queue_harvest_declared_20_2.py` (29 treffers op `cross_code`/`keyline`) |
| Niets in de codebase schrijft de kaart | `VERIFIED`, drie routes: (1) `git grep -In "declared-harvest-map" $(git rev-list --all)` geeft over de **hele geschiedenis** maar twee bestanden — dit storybestand en `queue_harvest_declared.py`; (2) een uitputtende lijst van alle schrijvers naar `flywheel-index/` in `apps/`, `scripts/` en `infrastructure/` levert alleen `build-keurmerk-index.ts` en `build-nutriscore-declared-map.ts`; (3) de kaart draagt zélf `source: "20-1-meting (prod-Mongo)"` en een `sourceNotes`-regel met `mergedAt: 2026-07-27` — handwerk, gedocumenteerd in het bestand zelf; (4) een `grep -rl` over de **hele werkmap** (dus ook niet-gevolgde bestanden, `scripts/`, `infrastructure/`, shell) geeft alleen dezelfde twee bestanden plus een kopie ervan in een bmad-loop-worktree |

### Wat niet klopt (ernst per punt aangegeven)

**F1 (MEDIUM) — "de oogst ontdubbelt per (code, product)" is te ruim gesteld.** `VERIFIED`:
`queue_harvest_declared.py:548` roept `review_item_exists(gtin, reason, source_file)` aan, en die
query (`database.py:766-770`) is `WHERE gtin = $1 AND reason = $2 AND source_file = $3`. De sleutel
is dus **(product, code, bronpagina)**, niet (code, product). De bronpagina komt uit `_pick_page`,
die een voorkeur heeft voor een `converted-0`-bestand en anders op alfabetische volgorde terugvalt.
Verandert de pagina-keuze voor een GTIN — nieuw artwork ingeladen, een `converted-0`-laag die er
eerder niet was — dan ziet de ontdubbeling het oude item niet en komt er een tweede kandidaat.
Precies waar AC4 op leunt ("de hele veiligheid van het terugzetten hangt eraan").

**F2 (LOW) — "`--dry-run` als standaard, net als de andere scripts in dit dossier" is onjuist.**
`VERIFIED`: van de zes scripts in `apps/api/src/scripts/` draaien er **vijf** standaard écht en is
`--dry-run` de opt-in (`build-keurmerk-index.ts:716`, `build-nutriscore-declared-map.ts:296`,
`seed-gold-set.ts:294`, `seed-bootstrap-queue.ts:160`, `seed-control-cohort.ts:171`). Eén script
draait wél droog by default: `backfill-reference-logo-field-type.ts:154` — en dat gebruikt
`--apply`, niet `--write`. De spec verzint dus een derde conventie en beroept zich daarbij op een
huisstijl die niet bestaat.

**F3 (LOW) — "Dit is dat storybestand" klopt niet.** `VERIFIED`: de regel in `sprint-status.yaml:235`
beschrijft wat er in juli is **gebouwd en opgeleverd** — `queue_harvest_declared.py` zelf, met
"9 RED->GREEN" — en de toetsen daarvan staan onder `test_queue_harvest_declared_20_2.py`. Deze
spec beschrijft heel ander werk: een bouwscript voor de kaart. Dat onder hetzelfde nummer en onder
de oude bestandsnaam ("sampler-run-en-vullen-categorie-3") schrijven maakt de herleidbaarheid stuk:
de trace van 20.2 wijst straks naar toetsen van een andere story.

**F4 (LOW) — de spec noemt het bestaande precedent niet.** `VERIFIED`:
`apps/api/src/scripts/build-nutriscore-declared-map.ts` bouwt al een declaratie-kaart naar
`flywheel-index/nutriscore-declared-map.json`, gelezen door `queue_harvest_nutriscore_declared.py`.
Dat is het script waar de nieuwe bouwer op moet lijken; de spec verwijst alleen naar
`build-keurmerk-index.ts`. Ook het onderzoek
`_bmad-output/planning-artifacts/research/oogst-voorraad-2026-08-18.md` — dat exact deze stilstand
onderzocht en een andere aanbeveling deed (zie H2) — ontbreekt in de bronverwijzingen.

## 2. Gaten in het ontwerp

### HIGH-1 — niets draait de declaratie-oogst; de story haalt haar eigen doel niet

`VERIFIED`, drie routes:

1. `ssh vanilla 'crontab -l'` → de enige oogstregel is
   `37 3 * * * /usr/local/bin/keurmerk-harvest.sh`, en dat script draait
   `python -m app.services.queue_harvest` — de **volume**-oogst.
2. `grep -ci declared /var/log/keurmerk-harvest.log` → 0.
3. Coolify-database: `SELECT name, command FROM scheduled_tasks WHERE command ILIKE '%harvest%'`
   → geen rijen; ook geen geplande taak gekoppeld aan de applicatie `qsookwow8koko0kwg00g0cwk`.

De belofte in de story ("vanzelf beoordeelbare kandidaten", "blijft dat doen") vereist twee
periodieke dingen: de kaart opnieuw bouwen, en de oogst draaien. De spec regelt geen van beide.
AC1 levert een script dat iemand met de hand moet starten, en AC9 zet de enige echte run buiten de
story. Het handwerk verschuift dus van "kaart bijwerken" naar "script starten en oogst starten" —
het verdwijnt niet.

**Nodig:** een acceptatiecriterium dat vastlegt wie de bouwer draait, hoe vaak, en wie de
declaratie-oogst draait, met dezelfde vorm als `/usr/local/bin/keurmerk-harvest.sh`. Zonder dat is
de titel van de story ("en blijft dat doen") niet waargemaakt.

### HIGH-2 — 48 van de 87 codes uit de afgeleide kaart kunnen structureel niets opleveren

De declaratie-oogst zoekt per code in zijn **eigen referentiepool**:
`find_similar_references_by_codes(embedding, t3777_codes=[code], threshold=FLOOR)`
(`queue_harvest_declared.py:512`, `database.py:693-694`). Een code zonder actieve referentie geeft
gegarandeerd nul matches — de methode valt bewust nooit terug op "alle referenties".

`VERIFIED` (meting, kaart afgeleid uit de index minus RECYCLABLE/TRIMAN, alleen GTINs met artwork):

| | |
|---|---|
| codes in de afgeleide kaart | 87 |
| …met ≥ 1 actieve referentie | **39** |
| …zonder actieve referentie | **48** |
| paren op codes zónder referentie (gegarandeerd 0 kandidaten) | **490 van 1839** |

Het gebruikte fragment:

```sql
SELECT DISTINCT t3777_code FROM reference_logos WHERE active = true;   -- 61 codes
```

en de kaartzijde uit `entries` van `keurmerk-etiket-index.json`, gefilterd op GTINs die artwork in
MinIO hebben.

Dat is precies de aanbeveling die het onderzoek van 18 augustus al deed
(`oogst-voorraad-2026-08-18.md`, §5.1: "de gerichte oogst loslaten op de codes die er al zijn").
De kaart hoort dus geschaard te worden op codes met ≥ 1 actieve referentie, en de rest hoort in een
apart, zichtbaar vak "wacht op een eerste referentie" — anders betaalt elke run de volle
embeddingprijs voor werk dat per definitie niets oplevert.

### HIGH-3 — `NutritionalScore/A..E` breekt op twee manieren

`VERIFIED`: de index bevat de veldsoort `NutritionalScore` met **209 paren**, sleutels
`NutritionalScore/A` t/m `/E`. AC2 schrijft voor: splitsen op de eerste schuine streep. Dat levert
de codes `A`, `B`, `C`, `D`, `E` op.

1. De referenties heten `NUTRISCORE_A` … `NUTRISCORE_E` (`SELECT DISTINCT t3777_code FROM
   reference_logos WHERE active=true` — 12 tot 15 stuks per letter, en géén enkele rij `A`..`E`).
   De oogst zoekt op `A` en vindt niets: 209 paren volle rekentijd, nul kandidaten.
2. Zou je het wél goed vertalen naar `NUTRISCORE_A`, dan botst de kaart met de **aparte**
   Nutri-Score-oogst (`queue_harvest_nutriscore_declared.py`, marker
   `"12.15 nutriscore-declaratie-oogst"`). Twee oogsters met een verschillende `reason` op dezelfde
   pagina zien elkaars items niet — de ontdubbeling is per marker — dus dezelfde crop kan twee keer
   in de wachtrij belanden, één keer per oogster.

De veldsoort `NutritionalScore` hoort dus expliciet uitgesloten te worden van deze kaart, met de
reden erbij. AC2 zwijgt erover.

### HIGH-4 — het terugzetten van de teller is veel duurder dan de spec doet vermoeden

`VERIFIED` (`20-11-oogst-geheugengrens-batching.md:105`): op ACC is de tijdslimiet het normale pad
— **~28 seconden per paar** tegen `MAX_SECONDS=1000`. Eén run haalt dus ongeveer **35 paren**.

`VERIFIED`: de afgeleide kaart telt **1839** paren (excl. RECYCLABLE/TRIMAN, alleen GTINs met
artwork). Teller op 0 betekent die 1839 opnieuw aflopen: ~14 uur rekentijd, ofwel ~52 nachtelijke
runs — als er een nachtelijke run zou zijn (zie HIGH-1).

Erger: de ontdubbeling zit ná het dure werk. In `queue_harvest_declared.py` wordt eerst de pagina
gedecodeerd, worden alle regio's voorgesteld, geëmbed, door de poort gehaald, met de referenties
vergeleken en door de cross-code-guard gehaald (regels 500-535) — en **pas op regel 548** wordt
gevraagd of dit paar al een item heeft. Een teruggezette teller betaalt dus de volle prijs voor
paren die gegarandeerd worden overgeslagen. `VERIFIED`: 254 van de 1839 paren hebben al een
`declared-harvest`-rij.

`VERIFIED` — wat het terugzetten oplevert:

| | |
|---|---|
| paren in de afgeleide kaart | 1839 |
| daarvan écht nieuw (niet in de huidige kaart) | **742** |
| …waarvan op een code mét actieve referentie | **252** |

Met de historische opbrengst (314 `declared-harvest`-items uit 1521 paren ≈ 21%) komt de
realistische verwachting op **grofweg 50 nieuwe open items** — voor 14 uur rekenwerk. Dat getal
hoort in AC6 te staan, want het is precies het soort verwachting dat de meting kan weerleggen.

De goedkope uitwegen die de spec niet bespreekt: de ontdubbelingstoets vóór de regio-analyse
trekken, en/of de teller niet op 0 zetten maar de al-verwerkte paren overslaan (de kaart draagt
immers per paar een deterministische sleutel).

### MEDIUM-1 — de droogloop kan de echte run niet betrouwbaar voorspellen (AC5)

`VERIFIED`: in `_flush` (`queue_harvest_declared.py:264-275`) keert de functie in droogloop
onmiddellijk terug — **zonder `queue.clear()`**. De queue houdt de crops vast. Dat is exact de
situatie die story 20.11 heeft opgelost voor de echte run (geheugen liep tot 7 GB), en de
geheugenrem (`memory_pressure`, regel 452) breekt de run af zodra het cgroup-gebruik boven 75%
komt. Een droogloop over een grote batch kan dus **eerder stoppen dan de echte run**, waardoor het
aantal kandidaten systematisch te laag uitvalt. AC5's "wijkt dat meer dan 5% af" is daarmee geen
bruikbare toets.

### MEDIUM-2 — AC5, AC6 en AC9 spreken elkaar tegen

AC9 zet de echte oogstrun, het terugzetten van de teller en het schrijven van de kaart buiten de
bouw. AC5 eist een vergelijking tussen droogloop en echte run; AC6 eist een ná-meting van het
aantal open items. Beide kunnen dus per definitie niet groen zijn als de story wordt afgerond. Er
staat nergens welke criteria `done` bepalen en welke pas ná de toestemmingsstap gelden. Zoals het
er staat kan de story nooit afgerond worden — of wordt hij afgerond met twee ongetoetste criteria.

### MEDIUM-3 — geen bescherming tegen een krimpende kaart

`VERIFIED`: de index heeft een eigen afkaplimiet, `KEURMERK_INDEX_LIMIT`, **standaard 500**
(`build-keurmerk-index.ts:260-268`). De docstring beschrijft precies de val: een run over 500 van
1862 GTINs meldde zich ooit als volledig en overschreef de goede index. Daar zit sindsdien een
kwaliteitspoort op. De afgeleide kaart erft dat risico **zonder** die poort: een afgeknotte index
levert een sterk gekrompen kaart, en AC4 zet dan óók nog de teller op 0. De kaart raakt in één
handeling driekwart van zijn bereik kwijt en de oogst begint van voren af aan.

**Nodig:** een weigering (of een expliciete vlag) bij krimp boven een drempel, en overname van de
`total`/`truncated`-melding uit de index.

### MEDIUM-4 — AC3 kan zijn eigen belofte niet waarmaken

AC3 wil dezelfde uitsluitlijst "met dezelfde omgevingsvariabele-vorm zodat de lijst op één plek te
wijzigen is". `VERIFIED`: `HARVEST_EXCLUDE_CODES` staat op ACC in **geen enkele container** gezet
(`docker exec <ml-service|app> env | grep -iE 'HARVEST|DECLARED'` → leeg in beide). Beide diensten
draaien dus op hun eigen, in code vastgelegde standaard, en het zijn twee aparte containers in twee
talen. "Eén plek" wordt zo juist twee plekken die uit elkaar kunnen lopen.

Bovendien: de oogst heeft al een eigen bereikschakelaar, `DECLARED_HARVEST_CODES`
(`queue_harvest_declared.py:73-77`). Uitsluiten hoort daar thuis, niet in de kaart — een kaart die
stiekem minder bevat dan de index waaruit hij komt, is geen afgeleide meer.

### MEDIUM-5 — AC4 zegt niet wie de teller terugzet, en meet het verkeerde getal

`keurmerk-harvest/declared-harvest-state.json` is het voortgangsbestand van de **ml-service**
(Python). De bouwer uit AC1 is een **api**-script (TypeScript). Dat een script uit de ene dienst het
voortgangsbestand van de andere overschrijft is een ontwerpkeuze die de spec niet maakt en niet
verantwoordt — inclusief de vraag wat er gebeurt als de oogst op dat moment loopt (er is een
`in_progress`-markering; die wordt hier genegeerd).

Daarnaast: de bouwer kan alleen het aantal paren **in de kaart** vergelijken, terwijl `total_pairs`
in de staat het aantal paren is **ná** filtering op GTINs die artwork in MinIO hebben
(`queue_harvest_declared.py:362`). Vandaag vallen die twee toevallig samen (1521 = 1521, en alle
1082 index-GTINs hebben artwork), maar de spec maakt dat nergens expliciet.

### MEDIUM-6 — de bestaande herkomst van de kaart gaat verloren

`VERIFIED`: de huidige kaart draagt `builtAt`, `mergedAt`, `source` ("20-1-meting (prod-Mongo)") en
een `sourceNotes`-lijst die vastlegt welke codes wanneer zijn bijgevoegd en waaruit. AC1 vraagt
alleen om `builtAt` plus de indexsleutel. Een bouwer die dat bestand overschrijft, gooit de
herkomstregels van de handmatige samenstelling weg. Leg vast wat er bewaard blijft, of leg vast dat
het bewust vervalt.

### MEDIUM-7 — de sleutel-splitsing verschilt van de index zelf

`VERIFIED`: `build-keurmerk-index.ts:216` splitst met `key.slice(key.indexOf('/') + 1)` — de
**eerste** schuine streep, zoals AC2 voorschrijft — terwijl de commentaarregel er direct boven zegt
"deel na de laatste '/'". Dat is een bestaande tegenstrijdigheid in de bron. Neem in AC2 op dat de
bouwer de splitsing van de index **hergebruikt** (geëxporteerde helper) in plaats van hem na te
bouwen, dan kan het paar nooit uit elkaar lopen.

### MEDIUM-8 — het storynummer is bezet

Zie F3. `queue_harvest_declared.py` draagt in zijn kop "Story 20.2", de toetsen heten
`test_queue_harvest_declared_20_2.py`, en de crops krijgen het voorvoegsel `20_2_`
(`queue_harvest_declared.py:283`). Nieuw werk onder datzelfde nummer maakt elke latere trace en
retrospectief dubbelzinnig. Geef dit een eigen nummer en verwijs terug.

## 3. Toetsbaarheid van de acceptatiecriteria

| AC | Toetsbaar? | Waarom |
|---|---|---|
| 1 | deels | "in dezelfde stijl" en "de sleutel van de index waaruit hij komt" zijn niet meetbaar gemaakt; de standaard-modus is bovendien fout beschreven (F2). Geen criterium voor determinisme/idempotentie, terwijl de index dat wél expliciet heeft. |
| 2 | ja | Meetbaar, met één inhoudelijk gat: `NutritionalScore` (HIGH-3). |
| 3 | nee | "op één plek te wijzigen" is niet waar te maken (MEDIUM-4) en er staat geen meetbare uitkomst. |
| 4 | nee | "Verandert het aantal paren" laat de ontwikkelaar kiezen wie dat vaststelt, waar, en op welk getal (MEDIUM-5); de kosten van de reset zijn niet erkend (HIGH-4). |
| 5 | nee | De vergelijking is niet uitvoerbaar binnen de story (MEDIUM-2) en de droogloop is geen zuivere voorspeller (MEDIUM-1). |
| 6 | deels | Vóór-kolom is gemeten, ná-kolom kan niet in de story. De beloofde verwachting ("hoort in de story vóór de run") ontbreekt — die is nu wél te geven: 87 codes / 992 producten / 1839 paren, 742 nieuw, ~252 nieuw op een code met referentie. |
| 7 | ja | De guards en hun toetsen bestaan (`test_queue_harvest_declared_20_2.py`). Vervang de regelnummers door de functienamen; regelnummers verouderen. |
| 8 | ja | Duidelijk. |
| 9 | ja | Duidelijk, maar zie MEDIUM-2 over de botsing met AC5/AC6. |

## 4. Wat wél goed zit

- De diagnose zelf is juist en met drie routes te bevestigen.
- De index is de **juiste** bron: hij is een projectie van de GS1-declaraties
  (`build-keurmerk-index.ts:4-7`), niet van herkende keurmerken. De zorg "levert dat alleen al
  afgehandelde producten op?" is dus ongegrond — een product staat erin omdat het de code
  *declareert*, niet omdat er iets herkend is.
- **Reeds afgewezen kandidaten komen niet terug.** `VERIFIED`: `review_item_exists` filtert
  bewust niet op status (`database.py:739-742`), dus een `rejected` of `dismissed_*`-item blokkeert
  een nieuwe kandidaat voor hetzelfde (product, code, pagina). Dat hoort in de story genoemd te
  worden, want het is een dragende eigenschap van AC4.
- De droogloop schrijft aantoonbaar niets: `_flush` (regel 274), `_checkpoint` (regel 314), de
  `in_progress`-markering (regel 406) en de opruiming van een oude markering (regel 373) zijn alle
  vier op `DRY_RUN` afgeschermd. AC9's laatste zin klopt.
- De per-code-limiet van 15 is niet de knellende factor: met 27 codes die daadwerkelijk nieuwe
  paren mét referentie hebben, is de bovengrens per run 405, ruim boven de 252 nieuwe bruikbare
  paren.

## Wat moet wijzigen vóór dev

1. **Regel de aandrijving, of erken dat de story haar titel niet waarmaakt.** Voeg een criterium toe
   dat vastlegt hoe de kaart periodiek herbouwd wordt én hoe de declaratie-oogst periodiek draait
   (er is vandaag geen enkele planning voor die oogst). Zonder dat verplaatst de story het handwerk
   in plaats van het weg te nemen.
2. **Beperk de kaart tot codes met minstens één actieve referentie**, en maak de rest zichtbaar als
   een aparte lijst "wacht op een eerste referentie". Anders is 490 van de 1839 paren rekenwerk
   zonder mogelijke uitkomst.
3. **Sluit de veldsoort `NutritionalScore` expliciet uit**, met de reden erbij: de codes heten daar
   `A`..`E` terwijl de referenties `NUTRISCORE_A`..`E` heten, én er bestaat al een eigen
   Nutri-Score-oogst met een eigen markering die dubbele items zou opleveren.
4. **Erken de kosten van het terugzetten in AC4 en AC6**, met de gemeten getallen (1839 paren,
   ~28 s per paar, ~35 paren per run), en neem het goedkope alternatief op: de ontdubbelingstoets
   vóór de regio-analyse trekken, of de teller niet op 0 zetten maar verwerkte paren overslaan.
5. **Corrigeer de standaard-modus van het script.** Vijf van de zes scripts in die map draaien
   standaard écht; het enige script met droogloop-als-standaard gebruikt `--apply`. Kies één van
   beide bestaande conventies en noem hem bij naam.
6. **Herschrijf AC4 tot iets toetsbaars**: welk proces schrijft het voortgangsbestand van de
   ml-service, wat gebeurt er als er een `in_progress`-markering staat, en op welk getal wordt
   "veranderd" vastgesteld (kaartparen of de door artwork gefilterde paren).
7. **Voeg een krimpbescherming toe** die de kaart weigert te overschrijven als hij fors kleiner
   wordt, met dezelfde redenering als de kwaliteitspoort op de index (`KEURMERK_INDEX_LIMIT` staat
   standaard op 500 van 1862).
8. **Splits AC5 en AC6 in "bouw" en "ná toestemming"**, zodat duidelijk is welke criteria de story
   afronden. En vervang de 5%-toets in AC5 door iets dat klopt: de droogloop leegt de wachtrij niet
   en kan op geheugendruk vroeg stoppen.
9. **Verplaats de uitsluiting van RECYCLABLE/TRIMAN naar het bereik van de oogst**
   (`DECLARED_HARVEST_CODES`) óf leg in de kaart vast welke uitsluitingen zijn toegepast — anders is
   de kaart geen eerlijke afgeleide van de index en klopt de herkomstvermelding uit AC1 niet.
10. **Zet de verwachting in AC6 vóór de run**: 87 codes, 992 producten, 1839 paren; 742 nieuwe
    paren; 252 daarvan op een code met referentie; historische opbrengst ~21% → grofweg 50 nieuwe
    open items.
11. **Geef dit werk een eigen storynummer** en verwijs terug naar 20.2; het nummer, de toetsen en
    het crop-voorvoegsel `20_2_` zijn al bezet door de oogster zelf.
12. **Neem de ontbrekende bronnen op**: `build-nutriscore-declared-map.ts` (het echte precedent) en
    `oogst-voorraad-2026-08-18.md` (het onderzoek dat dezelfde stilstand al analyseerde).
13. **Noteer in AC4 dat de ontdubbeling ook op de bronpagina sleutelt**, en beslis wat er gebeurt
    als de pagina-keuze voor een GTIN verandert — dat is het enige gat in de "opnieuw aflopen is
    veilig"-redenering.

## Wat NIET geverifieerd is

- **Of de kaart ooit door iets buiten deze repository geschreven is.** Ik heb de hele
  git-geschiedenis van deze repository doorzocht en alle schrijvers naar `flywheel-index/`
  opgesomd; een script in een andere repository, een handmatige `mc cp` of een notebook zou ik zo
  niet zien. De `sourceNotes` in het bestand zelf wijzen op handwerk, maar bewijzen niet dat er
  nergens een generator staat.
- **De opbrengstschatting van ~50 nieuwe items.** Dat is een `INFERENCE` op basis van de
  historische verhouding (314 items uit 1521 paren) toegepast op 252 bruikbare nieuwe paren. De
  vloer van 0,60, de keurmerkpoort, de cross-code-guard en de keyline-guard kunnen dat naar beneden
  halen; alleen een droogloop meet het echt.
- **De ~28 seconden per paar** komen uit de meting in `20-11-oogst-geheugengrens-batching.md`, niet
  uit een eigen meting van vandaag. Ik heb geen oogstrun gestart (alleen-lezen).
- **Of de veldsoort `NutritionalScore` bij een correcte vertaling naar `NUTRISCORE_A` daadwerkelijk
  dubbele items zou opleveren**: dat volgt uit het feit dat de twee oogsters een verschillende
  `reason` gebruiken (`declared-harvest:<code>` tegenover `"12.15 nutriscore-declaratie-oogst"`),
  maar ik heb het niet in een run waargenomen.
- **De precieze planning van de api-kant.** Ik heb de Coolify-scheduled-tasks-tabel en de crontab
  van de ACC-server gelezen; een planning die elders leeft (GitHub Actions, n8n, een andere host)
  zou ik zo niet gevonden hebben.
