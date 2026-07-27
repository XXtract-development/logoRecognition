# Adversariële review — Story 20.11 (oogst-geheugengrens & batching)

- **Reviewer:** adversarial review (BMAD), 2026-07-27
- **Story:** `_bmad-output/implementation-artifacts/20-11-oogst-geheugengrens-batching.md` (status `ready-for-dev`)
- **Code-basis:** HEAD `6999c5b` (= origin/acc)
- **Scope:** story-inhoud getoetst tegen de echte code; er is niets geïmplementeerd.

```
verdict: FAIL
severity_count: { high: 3, medium: 5, low: 4, info: 1 }
```

FAIL omdat drie bevindingen op high staan: de aangewezen hoofdoorzaak is **onvolledig** (AC2 lost de OOM niet op als hij letterlijk wordt uitgevoerd), AC1 en AC5 zijn **onderling tegenstrijdig**, en AC3 is zó geformuleerd dat een letterlijke implementatie **stil werk overslaat**.

---

## 1. Bevindingen

### HIGH

**H1 — `apps/ml-service/app/services/queue_harvest_declared.py:126` (+ `:333`) — de gequeuede crops zijn numpy-*views* op de volledige pagina; alleen de page-cache begrenzen (AC2/Dev Notes) laat de OOM intact — high**

`_crop_bgr` doet `c = img[y:y+h, x:x+w]`. Basic slicing in numpy levert per definitie een **view**, geen kopie: het kleine crop-object houdt de volledige gedecodeerde pagina (`c.base`) in leven. Die crop wordt op regel 333 in `queue[code]` gezet en pas ná de hele batch-lus gebruikt (`cv2.imencode` op regel 347). Gevolg: zelfs met een LRU-begrensde page-cache blijven er tot `PER_CODE_CAP × #codes` (15 × 7 = 105) volledige pagina's vastgehouden tot het einde van de run. Bij ~40 MB per pagina is dat op zichzelf al ~4 GB.

De story wijst in AC2 en de Dev Notes uitsluitend naar de page-cache ("bv. LRU op N pagina's"). Een dev die dat letterlijk uitvoert, meet daarna nog steeds een OOM bij een grote batch en concludeert ten onrechte dat de diagnose fout was.
**Moet wijzigen:** AC2 expliciet twee retainers benoemen — (a) de page-cache, (b) de gequeuede crops. Voor (b) is de fix één regel: `c.copy()` in `_crop_bgr` (of direct naar PNG-bytes encoderen bij het queuen, dan is de crop-array helemaal weg). Voeg een testbare invariant toe: **een gequeuede crop heeft geen `base`** (`crop.base is None`).

**H2 — `queue_harvest_declared.py:59` + `:311` vs AC5 — `PER_CODE_CAP` geldt *per run*, dus AC1 (kleinere batch) verandert per definitie de opbrengst die AC5 gelijk wil houden — high**

`PER_CODE_CAP = 15` begrenst `queue[code]`, en `queue` is een lokale variabele per run. Eén run van 173 paren levert dus maximaal 15 kandidaten per code; vijf runs van 40 paren leveren maximaal 5 × 15 per code. Bovendien knipt de tijdbox (`MAX_SECONDS`, `:60`/`:242`) een grote batch af terwijl kleine batches elk hun eigen budget krijgen.

De referentie-uitkomst waar AC5 op wil aftekenen ("9 + 16 = 25 kandidaten") is dus **zelf een artefact van de handmatige batching met `BATCH=40`** — geen batch-onafhankelijke waarheid. AC1 en AC5 kunnen niet allebei waar zijn.
**Moet wijzigen:** kies één van twee. Ofwel `PER_CODE_CAP` expliciet buiten scope verklaren en AC5 herformuleren als "geen *systematisch* verlies van kandidaten" (met de cap-interactie als bekend en genoteerd effect), ofwel de cap mee-verhuizen naar een per-*oogstronde*-begrenzing (dan is het geen puur geheugen-verhaal meer — dat is een aparte story).

**H3 — `queue_harvest_declared.py:369-373` vs AC3 — "schrijf *vóór* elke batch een tussenstand naar de state" is, letterlijk uitgevoerd, dataverlies — high**

De state (`next_offset`) wordt nu uitsluitend ná de lus geschreven, samen met de INSERTs. AC3 vraagt om een tussenstand *vóór* de batch. Als de offset vooruit wordt gezet vóórdat het bijbehorende werk is weggeschreven, dan slaat een volgende run precies de paren over die de gedode run niet meer heeft kunnen inserten — stil, en zonder enig spoor. Dat is een ergere fout dan die de story wil oplossen.
**Moet wijzigen:** AC3 herformuleren als **flush-dan-checkpoint**: elke N paren (a) crops uploaden + rijen inserten, (b) daarna pas `next_offset = reached` schrijven. De offset mag nooit voorlopen op de geïnserteerde rijen. Voeg als aparte, expliciete eis toe: een run-marker in de state (`run_started_at` / `in_progress: true`, opgeruimd bij nette afsluiting) — dát is het enige wat achteraf een SIGKILL zichtbaar maakt; een offset alleen is niet te onderscheiden van "er is nooit een run geweest".

### MEDIUM

**M1 — `queue_harvest_declared.py:214-227` — de premisse van AC3 ("een volgende run meldt compleet") is feitelijk onjuist — medium**

Bij een SIGKILL wordt de state helemaal niet geschreven; `next_offset` blijft staan op de oude waarde. De volgende run verwerkt dus exact hetzelfde venster opnieuw en meldt `status: complete` alleen wanneer `next_offset >= total` — wat na een kill per definitie niet het geval is. De story beschrijft dus een risico dat vandaag niet bestaat, en mist het risico dat wél bestaat: **al het werk van de gedode run is weg** (uren rekenwerk, nul zichtbaar resultaat) en de operator ziet nergens dat er een run is omgevallen.
**Moet wijzigen:** de motivering onder AC3 corrigeren en de eis herleiden tot (i) werk niet verliezen (tussentijdse flush) en (ii) een afgebroken run achteraf herkenbaar maken (run-marker + voortgangslogregels).

**M2 — `queue_harvest_declared.py:316` — AC5 is niet af te tekenen: dedup blokkeert de reproductie, ook in DRY_RUN — medium**

`review_item_exists(gtin, reason=declared-harvest:<code>, source_file)` draait bewust ook in dry-run (moduledoc regel 22-23). De 25 kandidaten van 27-07 stáán al in `artwork_review_items`, dus een herhaalde run — droog of nat — levert `candidates: 0` en `skipped_duplicate: 25`, niet "dezelfde 25 kandidaten". Daarbovenop drijft de uitkomst mee met de referentieset (die verandert zodra reviewers goedkeuren/afkeuren; die referenties voeden zowel de gescopete floor-match als de 20.7 cross-code-guard) en met de benaderende ivfflat-zoekopdracht (bekend onder-fetch-gedrag, story 19.14).
**Moet wijzigen:** AC5 verifieerbaar maken. Bijvoorbeeld: "`candidates + skipped_duplicate` per code komt overeen met de run van 27-07 (9 + 16)", plus een unit-test op de bestaande harness die aantoont dat floor/dedup/cross-code/keyline-beslissingen byte-gelijk blijven. Een vrije her-run op ACC is geen bewijs.

**M3 — AC4 — een waarschuwing in het log voorkomt de kill niet; en de eigen RSS is niet de grens — medium**

Twee problemen. (a) AC4 vraagt alleen een logregel. Een logregel op 70% laat het proces gewoon doorlopen tot de kill; de waarneembaarheid verbetert, het probleem niet. (b) Het proces deelt de 8 GiB-cgroup met de draaiende ml-service (de oogst wordt als los proces in dezelfde container gestart — enig entrypoint is `__main__` op regel 396-397, en het laadt bovendien zijn eigen model, regel 186-187). De OOM-killer kiest niet noodzakelijk de oogst: hij kan de API-server omleggen en zo de hele dienst neerhalen. De eigen RSS zegt dus te weinig; `memory.current` (cgroup v2) / `memory.usage_in_bytes` (v1) is het juiste signaal.
**Moet wijzigen:** AC4 een actie geven — bij overschrijding: huidige queue flushen, state checkpointen, batch netjes afsluiten met `status: stopped_memory` in het resultaat-JSON. Dan is AC4 het echte vangnet en wordt AC1 een comfort-instelling in plaats van de fix. En: meet de cgroup-usage, niet alleen de eigen RSS.

**M4 — Task 7 / Afbakening regel 39 — "de zuster-harvesters hebben dezelfde vorm" is deels onjuist en riskeert een vals-negatief — medium**

Gecontroleerd: de page-cache bestaat **uitsluitend** in `queue_harvest_declared.py:240` (toegevoegd door 20.2). `queue_harvest.py`, `queue_harvest_nutriscore.py` en `queue_harvest_nutriscore_declared.py` hebben geen cache — die itereren per GTIN en laten de pagina elke iteratie los. Een dev die task 7 uitvoert met "zoek dezelfde onbegrensde cache" concludeert dus terecht "niet aanwezig" en sluit de zusters af — terwijl ze wél alledrie (a) crops als views queueën (`queue_harvest.py:232/259`, `queue_harvest_nutriscore.py:218/250`, `queue_harvest_nutriscore_declared.py:257/322`), (b) pas ná de hele batch inserten en de state schrijven, en (c) een default `BATCH=400` hebben. Ze zijn dus aan dezelfde klasse fout blootgesteld, met een lagere constante.
**Moet wijzigen:** task 7 herschrijven naar het juiste zoekcriterium ("gequeuede crop-views + eind-van-batch-insert + BATCH-default"), en vooraf vastleggen dat de page-cache 20.2-specifiek is. Idem `bootstrap_search.py:75`, dat `_crop_bgr` bewust dupliceert.

**M5 — Dev Notes regel 66 / AC2 — "geheugen per paar vrijgeven" kost precies de 20.2-winst, en de story benoemt die prijs niet — medium**

De cache uit 20.2 bestaat omdat een multi-code-GTIN (alcohol: zwangerschap + niet-rijden + 18+) anders per code opnieuw wordt gedecodeerd. Zonder cache betaal je per code opnieuw: MinIO-fetch, `cv2.imdecode`, `propose_regions` (MSER op een 1280px-downscale, regel 62-81 van `region_proposer.py`) én — sinds 20.9 — een **volledige-pagina PNG-encode** voor de keyline-maat (`_page_detail_bpp`, regel 85-95, aangeroepen op regel 263). Voor een 3-code-GTIN is dat 3× de duurste stap. De story vraagt "per paar vrijgeven" zonder deze terugval te noemen.
**Moet wijzigen:** in AC2 de oplossingsrichting sturen naar **groeperen per pagina** — sorteer de paren van de batch op `src`, verwerk alle codes van één pagina achter elkaar, laat de pagina daarna expliciet los (cachegrootte 1). Dat houdt de 20.2-winst volledig in stand, maakt de LRU overbodig en maakt het geheugen batch-onafhankelijk. Let op: dit verandert de verwerkingsvolgorde, dus het moet samen met de checkpoint-logica van AC3 (offsets) worden ontworpen — de offset moet dan op de oorspronkelijke, deterministische parenlijst blijven slaan, niet op de gehergroepeerde.

### LOW

**L1 — AC1 (`queue_harvest_declared.py:58`) — geen budget, alleen een getal — low**
"40 werkt, 400 niet" is één meting in één containertoestand. Het beschikbare budget is 8 GiB **min** de resident ml-service (~2,4 GiB volgens de Dev Notes) **min** het model dat het oogstproces zelf laadt. Leg in AC1 het budget en de meetmethode vast (RSS-meting per N paren uit task 1), niet alleen de uitkomst. Noem ook de doorlooptijd-consequentie: 400 → 50 betekent 8× zoveel aanroepen om dezelfde parenlijst te dekken, en er staat geen scheduler-definitie voor deze harvester in de repo (hij wordt handmatig gestart) — wie of wat die extra rondes aanroept, is een open punt.

**L2 — AC3 vs `queue_harvest_declared.py:343` — de tussenstand mag in DRY_RUN niets schrijven — low**
`if not DRY_RUN` omsluit nu zowel de INSERTs als de state-write. Een tussentijds checkpoint moet diezelfde poort respecteren, anders muteert een dry-run de state — dat breekt de belofte in de moduledoc (regel 35-36) en maakt droog-tellen onbetrouwbaar.

**L3 — AC4 draagbaarheid — low**
`psutil` staat **niet** in `apps/ml-service/requirements.txt`; voeg er geen dependency voor toe. `/proc/self/status` (VmRSS) volstaat. De cgroup-limiet vergt beide varianten (`/sys/fs/cgroup/memory.max` v2, `/sys/fs/cgroup/memory/memory.limit_in_bytes` v1) plus afhandeling van `max` en de v1-sentinel (`9223372036854771712`) = onbegrensd. Op de macOS-dev-machine bestaat `/proc` niet: de lezer moet gracieus `None` teruggeven (guard uit) zodat de unit-tests niet omvallen.

**L4 — AC6 testbaarheid — low**
De bestaande harness (`tests/unit/test_queue_harvest_declared_20_2.py:56-60`) stubt `cv2.imdecode` naar een 8×8-beeld; echt geheugen is daar niet meetbaar. AC6 moet daarom om **waarneembare invarianten** vragen: aantal decodes per pagina (`pages_decoded`/`peak_cached_pages` in het resultaat-JSON), `crop.base is None` voor gequeuede crops, en checkpoint-gedrag via een pure helper (zoals `_is_keyline`/`_cross_code_rejected` al voordoen) zodat "een afgebroken run markeert zichzelf niet compleet" unit-testbaar is zonder proces te killen.

### INFO

**I1 — `queue_harvest_declared.py:148/215/391` — de "stilte" is inherent, niet een symptoom van vroeg sterven — info**
De module logt niets per paar; tussen "Keurmerk gate loaded" en de eindregel is er structureel géén uitvoer, ook bij een kerngezonde run. Het log dat "stopt" bewijst dus niets over het moment van de kill. Sterker: 7,03 GB opbouw impliceert juist dat er véél paren verwerkt zijn. De story-zin "terwijl de run in werkelijkheid nooit één paar heeft verwerkt" (regel 33) is **onbewezen en waarschijnlijk onjuist** en moet uit de motivering — hij stuurt de lezer naar de verkeerde diagnose.

---

## 2. Claim-audit

| # | Claim in de story | Oordeel | Bewijs |
|---|---|---|---|
| 1 | De 20.2-page-cache bestaat en is onbegrensd | **GEVERIFIEERD** | `queue_harvest_declared.py:240` (`page_cache: dict = {}`), gevuld op `:264`, nergens begrensd of geleegd |
| 2 | De cache groeit per batch (niet per run over meerdere batches) | **GEVERIFIEERD** | lokale variabele in `run_batch`; enig entrypoint is `__main__` (`:396`) → elke batch is een vers proces. Daarom hielp `BATCH=40` |
| 3 | Groei is ~lineair met het aantal verwerkte paren | **GEVERIFIEERD (orde van grootte)** | 7,03 GB / ≤173 pagina's ≈ 40 MB/pagina; consistent met volledig-resolutie BGR-artwork. `propose_regions` schaalt alleen intern af (`region_proposer.py:23`), de bewaarde `img` is full-res |
| 4 | De cache is de (enige) oorzaak | **ONVOLLEDIG** | tweede retainer: crop-views in `queue` (H1). Cache begrenzen alleen is geen fix |
| 5 | Default `DECLARED_HARVEST_BATCH` = 400 | **GEVERIFIEERD** | `:58` |
| 6 | "De zuster-harvesters hebben dezelfde vorm" | **DEELS ONJUIST** | geen page-cache in de zusters; wél dezelfde crop-view + eind-van-batch-insert + BATCH=400 (M4) |
| 7 | "De run heeft in werkelijkheid nooit één paar verwerkt" | **ONBEWEZEN / waarschijnlijk onjuist** | geen per-paar-logging; de RSS-opbouw wijst op het tegendeel (I1) |
| 8 | "Een volgende run meldt 'compleet'" na een kill | **ONJUIST** | state wordt bij een kill niet geschreven; `complete` alleen bij `next_offset >= total` (`:214`, `:369`) |
| 9 | Dedup werkt samen met hervatten | **GEVERIFIEERD** | `review_item_exists(gtin, marker, source_file)` (`:316`) is een bruikbare idempotentiesleutel: her-verwerken na een gedeeltelijke flush kan niet dubbel inserten |
| 10 | AC5 "dezelfde 25 kandidaten" is aftekenbaar | **ONHOUDBAAR** | dedup (ook in dry-run), driftende referentieset, benaderende ivfflat, en `PER_CODE_CAP` per run (H2, M2) |
| 11 | RSS/cgroup uitlezen is haalbaar | **GEVERIFIEERD, met voorbehoud** | `/proc/self/status` + cgroup v1/v2; geen psutil in requirements; niet-Linux moet gracieus degraderen (L3) |
| 12 | "Containerlimiet verhogen is geen oplossing" | **ONDERSCHREVEN** | de groei is onbegrensd in de batchgrootte; een hogere limiet verschuift alleen de drempel |
| 13 | De cache is er om multi-code-GTINs één keer te decoderen | **GEVERIFIEERD** | `:238-239` + `:250`; die winst is reëel (decode + MSER + volledige PNG-encode voor de keyline-maat) — zie M5 |

---

## 3. Wat er moet wijzigen vóór dev

1. **AC2 herschrijven** — twee retainers: (a) page-cache begrenzen, (b) gequeuede crops loskoppelen van hun pagina (`copy()` of direct PNG-encode). Oplossingsrichting: **paren per pagina groeperen** (cache van 1) i.p.v. LRU, zodat de 20.2-winst behouden blijft (H1, M5).
2. **AC1 ondergeschikt maken aan AC2 en AC4** — de batch-default is een comfort-instelling, geen fix; noteer het geheugenbudget (limiet − resident service − model) en de meetmethode, plus de doorlooptijd-consequentie (H2, L1, M3).
3. **AC3 omdraaien naar flush-dan-checkpoint** — nooit een offset vooruit zonder geïnserteerde rijen; voeg een run-marker in de state toe; respecteer DRY_RUN; corrigeer de onjuiste "meldt compleet"-premisse (H3, M1, L2).
4. **AC4 actie geven** — bij drempeloverschrijding netjes stoppen (flush + checkpoint + `status: stopped_memory`), en meten op cgroup-usage in plaats van alleen de eigen RSS (M3).
5. **AC5 verifieerbaar maken** — vergelijk `candidates + skipped_duplicate` per code, of dek het af met unit-tests op de bestaande harness; erken expliciet de `PER_CODE_CAP`-interactie met de batchgrootte (H2, M2).
6. **AC6 aanscherpen** — waarneembare invarianten in het resultaat-JSON (`pages_decoded`, `peak_cached_pages`), `crop.base is None`, en checkpoint-logica als pure helper (L4).
7. **Task 7 herformuleren** met het juiste zoekcriterium en de vooraf bekende uitkomst (geen cache in de zusters, wél crop-views + BATCH=400); neem `bootstrap_search.py` mee in de scan (M4).
8. **Motivering opschonen** — verwijder de onbewezen zin "nooit één paar verwerkt" en vervang hem door de werkelijke schade: verloren batchwerk en geen enkel spoor van een omgevallen run (I1).
