# Adversariële CODE-review — Story 20.11 (geheugengrens declaratie-oogst)

```yaml
reviewed_commit: 87fea96
baseline: 6999c5b
branch: epic/20-11-oogst-geheugengrens-batching
scope: apps/ml-service/app/services/queue_harvest_declared.py + tests/unit/test_queue_harvest_declared_20_11.py
verdict: FAIL
severity_count: { high: 2, medium: 3, low: 6 }
```

De twee geheugen-retainers zijn aantoonbaar weg en de gedragsequivalentie (AC5) houdt stand.
Maar het groeperen introduceert een **nieuwe, ernstiger fout dan de OOM zelf**: bij een
vroegtijdige stop schuift de offset niet op, waardoor de oogst permanent op dezelfde
paren blijft hangen. Precies dat pad is ongetest.

---

## Bevindingen

### H1 — offset kan bij een vroege stop nul voortgang boeken (livelock)
`apps/ml-service/app/services/queue_harvest_declared.py:389` (+ `:400-404`, `:545`) — **high**

`ordered_pages = sorted(groups)` sorteert op **pagina-sleutel**, niet op de laagste
oorspronkelijke parenindex. `_reached()` is een aaneengesloten prefix over `done_idx`.
Zodra de lus vroegtijdig breekt (timebox `:410` of geheugendruk `:414`) en index
`next_offset` toevallig in een láát gesorteerde pagina-groep zit, blijft `reached ==
next_offset` — terwijl er wél werk is verzet en rijen zijn ingevoegd.

Empirisch bewijs (gedraaide probe tegen deze commit, gestubde deps, 2 paren:
`[('A','999'), ('B','111')]`, pagina-sortering zet `111` vóór `999`, stop na de eerste groep):

```
RESULT: {"status":"stopped_memory","candidates":1,"inserted":1,
         "from_offset":0,"to_offset":0,"remaining":2}
STATE:  {"next_offset": 0, "total_pairs": 2}
```

De volgende run start weer op 0, groepeert identiek (deterministisch), verwerkt exact
dezelfde kop-pagina's en stopt weer op hetzelfde punt → **de offset komt nooit vooruit**.
Dedup voorkomt dubbele rijen, dus het faalt stil: `remaining` blijft gelijk, de rest van
het venster wordt nooit bereikt.

Dit is géén randgeval op ACC: 173 paren × ~28 s/paar tegen `MAX_SECONDS=1000` betekent dat
de timebox vrijwel zeker toeslaat. De oude code kon dit niet: `i += 1` liep sequentieel en
`reached = i` garandeerde altijd voortgang (`6999c5b:.../queue_harvest_declared.py`, `while`-lus).

**Wat moet wijzigen:** groepen verwerken in volgorde van hun laagste oorspronkelijke index —
`ordered_pages = sorted(groups, key=lambda s: min(groups[s]))` — zodat de verwerkte
verzameling bij een stop altijd (nagenoeg) een prefix is en `_reached()` meeschuift.
Blijft de pagina-sleutelvolgorde gewenst, dan is een expliciete voortgangsgarantie nodig
(bv. minimaal tot de laagste onverwerkte index doorwerken vóór het breken). Plus een
regressietest die aantoont dat `to_offset > from_offset` na een gesimuleerde stop mét werk.

### H2 — AC6 (b), (c) en (d) hebben geen enkele test
`apps/ml-service/tests/unit/test_queue_harvest_declared_20_11.py:1-167` — **high**

De 9 nieuwe tests dekken: 3× `_crop_bgr` (AC6a, mét geldig RED-bewijs) en 6× de
cgroup-helpers `_read_int`/`cgroup_memory`/`memory_pressure` (AC4). Dat zijn **pure
helpers**; geen enkele test roept `run_batch` aan.

Ontbreekt volledig:
- (b) begrensd aantal vastgehouden pagina's (≤1) — niet getest;
- (c) flush-dan-checkpoint / offset nooit vóór de ingevoegde rijen — niet getest;
- (d) run-marker blijft staan bij harde afbreking, verdwijnt bij nette afsluiting — niet getest.

Verificatie: `grep -n "to_offset\|next_offset\|STATE_KEY\|in_progress\|remaining"` over
**beide** declared-suites geeft **0 treffers**. De 25 bestaande 20.2-tests raken de offset-
en state-logica per constructie niet, dus H1 is voor de hele suite onzichtbaar. Dat de
suite groen is, is hier dus geen bewijs.

### M1 — het "compleet"-pad ruimt een achtergebleven run-marker nooit op
`apps/ml-service/app/services/queue_harvest_declared.py:337-350` — **medium**

De vroege return schrijft de state helemaal niet weg. Een `in_progress` die van een
gekilde run is blijven staan, blijft daarna **permanent** staan zodra `next_offset >= total`.
De marker uit AC3 wordt dan een blijvend vals alarm ("vorige run afgebroken").

Probe-bewijs (state vooraf `{"next_offset":99,"in_progress":true}`):
```
RUN2: {"status":"complete", ...}
RUN2 state writes: []          → in_progress blijft True
```

**Wat moet wijzigen:** ook op het compleet-pad de marker opruimen (buiten DRY_RUN), bv.
via `_checkpoint(state, storage_service, next_offset, total, done=True)`.

### M2 — de geheugendrempel meet ook de herwinbare page-/file-cache
`apps/ml-service/app/services/queue_harvest_declared.py:144-169`, gebruikt op `:414` — **medium**

`memory.current` (v2) en `memory.usage_in_bytes` (v1) tellen **anon + file cache + kernel**.
File cache is herwinbaar en veroorzaakt geen OOM-kill; een proces dat veel bytes leest en
schrijft kan 0,75 halen zonder enige echte druk. Gevolg: een **valse** `stopped_memory`.
De fail-open (`use`/`lim` `None` → `False`) dekt alleen onleesbaarheid, niet overtelling.
In combinatie met H1 kost elke valse stop nul voortgang.

**Wat moet wijzigen:** meet het anonieme deel — `memory.stat` → `anon` (v2) of `total_rss`
(v1), of `memory.current − file` — en houd de fail-open. De AC-eis ("cgroup, niet de eigen
RSS") blijft daarmee gerespecteerd.

### M3 — zusters houden de crop-view-retainer; story staat op `review` met 3 open taken
`app/services/queue_harvest.py:91`, `queue_harvest_nutriscore_declared.py:124`,
`queue_harvest_nutriscore.py:100`, `bootstrap_search.py:82` — **medium**

Alle vier retourneren `_crop_bgr` nog als **view** en inserten pas aan het eind — exact
retainer (b), de retainer die de story doorslaggevend noemt. Taak 7 is bewust niet
afgevinkt, evenals taak 1 (nulmeting) en taak 6 (`BATCH`-default). Dat is legitieme scope-
afbakening, maar de story staat wél op `review`: `apps/ml-service` kan op precies dezelfde
manier OOM-killed worden via een zuster-harvester. Blokkeert `done`, niet de code zelf.

### L1 — `cid` is met 1 verschoven t.o.v. 20.2
`queue_harvest_declared.py:527` — **low**. Oud gebruikte `i` ná `i += 1`; nieuw gebruikt de
echte index. Zelfde paar levert nu een andere `crop_key` in MinIO. Geen beslissing, wel een
naamswijziging die niet in de story staat.

### L2 — `processed_since_flush` telt niet mee bij een onleesbare pagina
`queue_harvest_declared.py:444-446` — **low**. `done_idx.add(i)` gebeurt wel, de teller niet.
Een venster met veel kapotte pagina's doet dus geen enkele tussentijdse checkpoint; het
slot-checkpoint (`:549`) vangt het op.

### L3 — timebox en geheugencheck staan alleen op groep-niveau
`queue_harvest_declared.py:410`, `:414` — **low**. Een multi-code-groep loopt de tijdbox met
N × ~28 s over. Begrensd (codes per GTIN is klein), maar de tijdbox is niet langer strak.

### L4 — `_flush` leegt de queue niet in DRY_RUN
`queue_harvest_declared.py:251-252` — **low**. Directe uitzondering op de docstring erboven
("het legen is essentieel"). Praktisch onschadelijk sinds crops kopieën zijn en `PER_CODE_CAP`
de queue begrenst, maar in DRY_RUN is het geheugen dus niet flush-begrensd.

### L5 — `_pick_page` wordt twee keer per index aangeroepen
`queue_harvest_declared.py:385` en `:397` — **low**. Elke aanroep sorteert de key-lijst van de
GTIN opnieuw. Kosmetisch; één pass die zowel `groups` als de no-page-set vult volstaat.

### L6 — een gecontroleerde stop is in de state niet te onderscheiden van een volle run
`queue_harvest_declared.py:549` — **low**. De slot-`_checkpoint(done=True)` verwijdert de
run-marker ook na `stopped_memory`/`timebox`. AC4 wordt gedekt door de `status` in het
resultaat-JSON, maar wie alleen de state leest ziet het verschil niet.

---

## AC-audit

| AC | Oordeel | Code-bewijs |
|----|---------|-------------|
| **AC1** — geheugen batch-onafhankelijk | **gedekt** (analytisch, niet gemeten) | `page_cache` is verdwenen; per groep één pagina, expliciet losgelaten `:534`; `queue.clear()` `:278` na elke flush `:539-542`; queue-omvang begrensd door `PER_CODE_CAP` × #codes i.p.v. door `BATCH`. Piek ≈ 1 pagina + enkele KB's crops. Taak 1 (nulmeting) staat nog open, dus er is geen meetbewijs. |
| **AC2** — beide retainers weg | **deels** | Retainer (b): `_crop_bgr` `:189` `return c.copy()`, invariant `crop.base is None` getest (`test_..._20_11.py:68`) mét RED-bewijs. Retainer (a): groeperen `:381-389` + loslaten `:534`, 20.2-winst behouden (pagina één keer geladen/`propose_regions`/`_page_detail_bpp` per groep, `:431-442`). **Maar** de expliciete AC2-waarschuwing over de offset is maar half ingevuld: de offset slaat wél op de oorspronkelijke parenlijst, alleen maakt de pagina-sortering hem bij een vroege stop waardeloos → **H1**. |
| **AC3** — flush-dan-checkpoint + run-marker | **deels** | Volgorde correct: `_flush` → `_checkpoint` op `:540-542` en `:548-549`; `_checkpoint` schrijft alleen de offset, `_flush` de rijen — nooit omgekeerd. Queue wordt geleegd `:278`. Marker gezet `:368-373`, opgeruimd via `done=True` `:293-295`. **Gaten:** compleet-pad ruimt een stale marker niet op (**M1**); een gecontroleerde stop wist de marker tóch (**L6**); geen tests (**H2**). DRY_RUN schrijft inderdaad niets (`:251`, `:289`). |
| **AC4** — gecontroleerd stoppen op cgroup-druk | **gedekt, met voorbehoud** | v2 `:150-151`, v1-fallback `:152-154`, v1-"geen limiet" `:156-157`, fail-open `:167-168`, drempel 0 uit `:163-164`. Bij druk: `break` `:420` → slot-flush `:548` → checkpoint `:549` → `status: "stopped_memory"` `:558`. Werk gaat dus niet verloren. Voorbehoud: **M2** (gemeten teller bevat file cache). |
| **AC5** — geen gedragswijziging | **gedekt** | Floor/dedup/cross-code/keyline-blokken zijn regel-voor-regel identiek aan `6999c5b`. `PER_CODE_CAP` op `per_code_counts` `:503` is run-breed equivalent aan het oude `len(queue[code])` (de oude queue werd nooit tussentijds geleegd); beide creëren de sleutel bij de cap-check, dus `per_code` blijft gelijk. `candidates` = `candidate_total` `:530` ≡ oud `sum(len(v) for v in queue.values())`. 25 bestaande 20.2-tests ongewijzigd. Enige afwijking: `cid` (**L1**). |
| **AC6** — tests | **deels** | (a) gedekt: `test_crop_is_losgekoppeld_van_de_pagina:68`, `test_crop_overleeft_het_vrijgeven_van_de_pagina:83`. (b), (c), (d): **niet gedekt** — geen enkele test raakt `run_batch`, `_reached`, `_flush`-volgorde of de run-marker → **H2**. |

## Wat moet wijzigen vóór PASS

1. **H1** — `ordered_pages` op laagste oorspronkelijke index sorteren (of een expliciete
   voortgangsgarantie), zodat `to_offset > from_offset` zodra er werk is verzet.
2. **H2** — tests voor AC6 (b)/(c)/(d), inclusief expliciet: na een gesimuleerde stop
   mét ingevoegde rijen moet de offset zijn opgeschoven en nooit voorbij die rijen liggen.
3. **M1** — marker ook op het compleet-pad opruimen.
4. **M2** — anoniem geheugen meten (`memory.stat: anon` / `total_rss`), fail-open behouden.
5. **M3** — taak 7 (zusters) afronden of de story expliciet als deel-oplevering afsluiten;
   taak 1 en 6 staan eveneens open terwijl de status `review` is.

## Verificatie-aantekening

De pytest-suite kon in deze omgeving niet gedraaid worden (plugin-conflict
`pytest_asyncio`/`logfire` in de beschikbare interpreter). De bevindingen H1 en M1 zijn
daarom empirisch aangetoond met een losse probe die `run_batch` op deze commit draait tegen
gestubde storage/db/model-modules; de overige bevindingen zijn code-geverifieerd. De claim
"34 tests groen (9 nieuw + 25 bestaand)" klopt qua telling (9 testfuncties in het nieuwe
bestand), maar zegt niets over AC6 b/c/d — zie H2.
