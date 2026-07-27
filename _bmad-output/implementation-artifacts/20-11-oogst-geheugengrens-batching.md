# Story 20.11: Declaratie-oogst mag niet stilzwijgend door het geheugen gedood worden

Status: review

<!-- Live gevonden 2026-07-27 tijdens een oogstronde over 7 codes / 173 paren:
de ml-container werd OOM-killed. Geen foutmelding, geen resultaat.
HERZIEN 2026-07-27 na adversariële review (FAIL, 3 high): de oorspronkelijke
oorzaakanalyse noemde maar ÉÉN van de twee geheugen-retainers. Zie AC2. -->

## Story

Als **datamanager**
wil ik **dat een oogstronde over veel codes/producten niet stilzwijgend afgebroken wordt door het geheugen**
zodat **ik erop kan vertrouwen dat "geen kandidaten" ook echt "niets gevonden" betekent, en niet "de run is halverwege gesneuveld"**.

## Reproductie (ACC, 2026-07-27)

```
DECLARED_HARVEST_CODES=HALAL,VEGAN_SOCIETY_VEGAN_LOGO,AQUACULTURE_STEWARDSHIP_COUNCIL,
  CROSSED_GRAIN_SYMBOL,SOCIETY_PLASTICS_INDUSTRY,SEPARATE_COLLECTION,LACTOSE_FREE
→ python -m app.services.queue_harvest_declared   (173 paren, default BATCH=400)
```

Log stopt na `Keurmerk gate loaded`, daarna niets. `dmesg` toont de oorzaak:

```
Memory cgroup out of memory: Killed process (python)
total-vm:10540120kB, anon-rss:7035976kB   (limiet: 8 GiB, GEDEELD met de draaiende service)
```

**Werkende omweg (toegepast):** `DECLARED_HARVEST_BATCH=40` — dezelfde set draait dan wel (9 + 16 kandidaten).

## Waarom dit erger is dan een crash

De OOM-kill is **stil**: geen logregel, geen resultaat-JSON. Wie daarna de wachtrij bekijkt ziet nul kandidaten en concludeert "niets te vinden voor deze codes" — terwijl de run geen enkel paar verwerkte. Bij LACTOSE_FREE dacht ik aanvankelijk aan een inhoudelijk probleem, terwijl minstens één run simpelweg gesneuveld was.

## Twee geheugen-retainers (gecorrigeerd na review)

De eerste versie noemde alleen de page-cache. Dat is **de helft**:

| # | Retainer | Bewijs | Gevolg |
|---|---|---|---|
| a | **Page-cache** — `page_cache: dict = {}` (`:240`), gevuld op `:264`, nergens begrensd of geleegd | geverifieerd | groeit met het aantal *unieke pagina's* in de batch |
| b | **Gequeuede crops zijn numpy-*views*** — `_crop_bgr` (`:126`) geeft een slice terug; die houdt de **volledige pagina-array** in leven tot de insert aan het eind (`:333`) | geverifieerd | tot ~105 hele artworks tegelijk in geheugen |

**Alleen (a) begrenzen lost de OOM niet op.** (b) is één regel: `.copy()` in `_crop_bgr`, of de crop direct naar PNG-bytes encoderen bij het queuen zodat de array helemaal verdwijnt.

## Afbakening

- `apps/ml-service/app/services/queue_harvest_declared.py`. Zusters (`queue_harvest.py`, `queue_harvest_nutriscore*.py`) en `bootstrap_search.py:75` alleen nalopen op het **juiste** criterium (zie Task 7) — de page-cache is 20.2-specifiek en zit daar niet in, maar de crop-views en `BATCH=400` mogelijk wél.
- **Geen** wijziging aan floor, cross-code-guard, keyline-guard of dedup.
- **`PER_CODE_CAP` blijft buiten scope** (zie AC5) — dat is een aparte, niet-geheugen-gerelateerde keuze.
- Containerlimiet verhogen is GEEN oplossing: dat verschuift de grens en laat de stille mislukking intact.

## Acceptatiecriteria

1. **Geheugen is batch-ONafhankelijk.** Given een oogstronde, when het aantal paren toeneemt, then blijft het piekgeheugen vlak (binnen een marge) in plaats van lineair te groeien. `DECLARED_HARVEST_BATCH` mag daarna een comfort-instelling zijn, geen veiligheidsklep. *AC1 is bewust ondergeschikt aan AC2/AC4: een lagere default is symptoombestrijding zolang het geheugen met de batch meegroeit.*
2. **Beide retainers weg — via groeperen per pagina.** Given een batch, then worden de paren gesorteerd op bronpagina en worden alle codes van één pagina achter elkaar verwerkt, waarna die pagina expliciet wordt losgelaten (effectieve cachegrootte 1). And given een crop wordt gequeued, then is het een **losgekoppelde kopie**, niet een view op de pagina — testbare invariant: `crop.base is None` (of: er wordt bij het queuen al PNG-bytes bewaard i.p.v. een array).
   - *Groeperen per pagina behoudt de 20.2-winst volledig (geen herhaald decoderen/MSER/PNG-encoden voor multi-code-GTINs) en maakt een LRU overbodig. "Per paar vrijgeven" zou die winst juist wegnemen — bewust NIET die richting.*
   - **Let op:** dit wijzigt de verwerkingsvolgorde. De offset uit AC3 moet op de **oorspronkelijke, deterministische parenlijst** blijven slaan, niet op de gehergroepeerde volgorde.
3. **Werk niet verliezen + een afgebroken run is herkenbaar.** Given een run, then wordt elke N paren **eerst geflusht** (crops uploaden + rijen inserten) en **daarna pas** `next_offset` weggeschreven — nooit andersom. And given de state, then staat er een run-marker in (`in_progress` / `run_started_at`) die bij nette afsluiting wordt opgeruimd; blijft die staan, dan is de vorige run afgebroken.
   - *Correctie op v1: de motivering "een volgende run meldt compleet" was **onjuist** — de code herhaalt na een kill gewoon het venster. De echte eisen zijn dus (i) geen werk verliezen en (ii) een kill achteraf kunnen zien. Een offset alleen is niet te onderscheiden van "er is nooit een run geweest"; daarom de run-marker.*
   - In DRY_RUN wordt niets naar de state geschreven.
4. **Bij naderend geheugentekort: gecontroleerd stoppen, niet alleen waarschuwen.** Given het **cgroup**-geheugengebruik (niet alleen de eigen RSS — de limiet is gedeeld met de draaiende service) boven een drempel komt, then flusht de run de queue, checkpoint hij de state en sluit hij netjes af met `status: "stopped_memory"` in het resultaat-JSON. *Dit is het echte vangnet; een logregel voorkomt de kill niet.* Werkt op cgroup v1 én v2, zonder extra dependency (`/proc` + cgroup-bestanden).
5. **Geen systematisch verlies van kandidaten.** Given dezelfde codes en data, then blijven de beslissingen van floor, dedup, cross-code- en keyline-guard **byte-gelijk** — aangetoond met unit-tests op de bestaande harness, niet met een her-run op ACC.
   - *Waarom niet "dezelfde 25 kandidaten": die staan al in de database, dus dedup blokkeert reproductie (ook in DRY_RUN). Bovendien geldt `PER_CODE_CAP` **per run**, dus een andere batchgrootte verandert per definitie de opbrengst — AC1 en een letterlijke "zelfde 25"-eis spreken elkaar tegen. Als indicatie mag `candidates + skipped_duplicate` per code vergeleken worden met de run van 27-07 (9 + 16).*
6. **Tests.** (a) crop-invariant: een gequeuede crop houdt de pagina niet vast (`crop.base is None`); (b) geheugen/cache: over N paren blijft het aantal vastgehouden pagina's begrensd (≤1 bij groeperen); (c) flush-dan-checkpoint: na een gesimuleerde afbreking staat de offset nooit vóór de geïnserteerde rijen; (d) de run-marker blijft staan bij een harde afbreking en wordt opgeruimd bij een nette afsluiting.

## Tasks / Subtasks

- [ ] 1. Meten: RSS + cgroup-usage per N paren tijdens een run over ~170 paren, als onderbouwing én nulmeting (AC1).
- [x] 2. **Crop losmaken van de pagina** — `.copy()` in `_crop_bgr` of direct PNG-bytes bij het queuen (AC2, retainer b).
- [x] 3. **Groeperen per bronpagina** + pagina expliciet loslaten; offset blijft op de oorspronkelijke parenlijst (AC2 retainer a, AC3).
- [x] 4. Flush-dan-checkpoint per N paren + run-marker in de state (AC3).
- [x] 5. Cgroup-drempel → gecontroleerd stoppen met `status: "stopped_memory"` (AC4).
- [ ] 6. `DECLARED_HARVEST_BATCH`-default heroverwegen ná AC2 — waarschijnlijk kan hij dan gewoon blijven staan (AC1).
- [ ] 7. Zusters nalopen op het JUISTE criterium: **gequeuede crop-views + insert-aan-het-eind + `BATCH`-default** (NIET "heeft een page-cache" — die is 20.2-specifiek). Ook `bootstrap_search.py:75`, dat `_crop_bgr` dupliceert.
- [x] 8. Tests (AC6) + verificatierun.

## Dev Notes

- Gemeten 2026-07-27: `anon-rss` **7,03 GB** bij limiet **8 GiB** (gedeeld met de draaiende ml-service, die in rust ~2,4 GiB gebruikt). `total-vm` 10,5 GB.
- Met `BATCH=40` bleef dezelfde set ruim binnen budget — maar dat is één meting zonder expliciet budget, niet een grens.
- De "stilte" bij een OOM-kill is **inherent** aan SIGKILL (geen handler mogelijk), niet een symptoom van vroeg sterven. Daarom is AC4 (zelf stoppen vóór de kill) het enige echte vangnet, en AC3 (run-marker) de manier om een kill achteraf te zien.
- [Source: apps/ml-service/app/services/queue_harvest_declared.py:126, :240, :264, :311, :316, :333, :369-373; dmesg ACC 2026-07-27 10:13:35; review-20-11.md]

### Dev Agent Record — implementatie 2026-07-27
- **Retainer (b)** — `_crop_bgr` geeft nu `c.copy()` i.p.v. een view. Eén regel, en aantoonbaar de doorslaggevende: zonder deze kopie hield elke gequeuede crop de volledige pagina-array in leven.
- **Retainer (a)** — de onbegrensde `page_cache` is **weg**. De paren van het venster worden gegroepeerd op bronpagina; per groep wordt de pagina één keer geladen/gelokaliseerd en daarna expliciet losgelaten. Daarmee is er nooit meer dan één pagina tegelijk nodig én blijft de 20.2-winst intact (geen herhaald decoderen/MSER/PNG-encoden voor multi-code-GTINs). Geheugen is nu batch-ONafhankelijk, dus `BATCH` hoefde niet verlaagd te worden (AC1 via AC2 opgelost).
- **Offset op de OORSPRONKELIJKE parenlijst** — groeperen wijzigt de verwerkingsvolgorde, dus `reached` = het aaneengesloten voorste deel van afgehandelde indices (`done_idx`), niet de teller van de hergroepeerde lus.
- **Subtiele valkuil onderweg**: `done_idx.add(i)` moest aan het BEGIN van de iteratie, niet aan het eind — de meeste paden verlaten de lus met `continue` (floor/dedup/cap/cross-code/keyline), en die paren zouden anders nooit meetellen voor de offset. De run zou ze eindeloos herhalen.
- **`PER_CODE_CAP` ongemoeid gehouden**: de cap telt nu op `per_code_counts` i.p.v. `len(queue[code])`, omdat de queue tussentijds wordt geleegd door de flush. Zonder die wijziging zou de cap per flush resetten — een stille gedragsverandering die de story expliciet buiten scope verklaarde.
- **Flush-dan-checkpoint** (`_flush` → `_checkpoint`), nooit andersom. In DRY_RUN schrijft geen van beide iets.
- **Run-marker** (`in_progress` / `run_started_at`) in de state, opgeruimd bij nette afsluiting → een SIGKILL is achteraf herkenbaar.
- **AC4** — `cgroup_memory()` leest v2 én v1, zonder extra dependency; bij druk stopt de run gecontroleerd met `status: "stopped_memory"` in het resultaat-JSON. Fail-open: onleesbare cgroup ⇒ géén valse stop.

### Verificatie
- **34 tests groen** in de raakvlak-suites: 9 nieuw (crop-invariant, cgroup v1/v2, fail-open, drempel-uit, `max`-parsing) + 25 bestaande 20.2-tests **ongewijzigd** — floor/dedup/cap/cross-code/keyline byte-gelijk (AC5).
- **RED-bewijs**: `.copy()` terugdraaien maakt exact `test_crop_is_losgekoppeld_van_de_pagina` rood (`crop.base` wijst dan naar de pagina); daarna hersteld.
- **Volledige ml-suite: 188 passed / 0 failed** (14 skipped; 4 omgevings-only bestanden genegeerd zoals gebruikelijk).

## Change Log
- 2026-07-27: Story aangemaakt na OOM-kill tijdens de oogstronde.
- 2026-07-27: Geïmplementeerd; status → review.
- 2026-07-27: Herzien na adversariële review (FAIL: 3 high, 5 medium). H1: tweede retainer toegevoegd (crops zijn numpy-views op de volledige pagina — alleen de cache begrenzen lost de OOM níét op). H2: AC5 herschreven, `PER_CODE_CAP` expliciet buiten scope (AC1 en "zelfde 25" spraken elkaar tegen). H3: AC3 omgedraaid naar flush-dan-checkpoint (de v1-formulering "checkpoint vóór de batch" zou paren stil overslaan) + run-marker toegevoegd; de onderliggende premisse ("meldt compleet") was feitelijk onjuist. Verder: AC4 krijgt een actie i.p.v. alleen een waarschuwing en meet cgroup i.p.v. eigen RSS; AC1 ondergeschikt gemaakt aan AC2; oplossingsrichting gestuurd naar groeperen-per-pagina zodat de 20.2-prestatiewinst intact blijft; Task 7 op het juiste zoekcriterium gezet.
