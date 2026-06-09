# Story 12.2 — Architectuur-spike: resultaten & beslisdocument (AC1–AC4)

Status: **spike DONE** — alle vier acceptatiecriteria gemeten op ACC met de echte
productie-componenten. Go/no-go en de fine-tuning-beslissing staan onderaan (AC4).

Datum: 2026-06-09 · Branch: `acc` · ML-image: `4a6c54c` (ACC, container
`ml-service-qsookwow…`) · Meetharnas: `apps/ml-service/scripts/spike_pipeline_eval.py`
(reuse van `propose_regions`, `model_manager.generate_embedding`,
`db_service.find_similar_references`, `classify_crop`, en de echte
`tile_image`/`prepare_scaled_templates`/`match_templates`).

> **Methode-integriteit.** Geen DB- of storage-mutatie. De N-schaling van de
> referentiebibliotheek is *in-memory* gesimuleerd (brute-force, een conservatieve
> bovengrens t.o.v. productie-ivfflat dat sublineair is). De template-match-baseline
> is gemeten op de echte 10 referenties en lineair geschaald (de localisatie is
> `for tmpl in templates`, strikt lineair — zie story §Probleem). De 4 beschermde
> tests bleven ongewijzigd (geverifieerd: `git diff --stat` leeg); de region-proposer
> staat ernáást (A/B-migratie).
>
> **Embedding-laadpad geverifieerd (cruciaal voor de AC4-diagnose).** De harnas roept
> dezelfde `model_manager.load_models()` aan als de live uvicorn-workers. Het embedding-
> model is de **echte torchvision-pretrained ImageNet-`efficientnet_b0`**
> (`model_manager.py:81`: `EfficientNet_B0_Weights.DEFAULT`, classifier→Identity); de log
> toont het succespad ("Embedding model loaded"), niet de mock-fallback. De aparte
> waarschuwing "ONNX runtime not available, using mock model" betreft het *detectie*-model,
> dat deze spike nooit aanroept. De klasse-afhankelijke cosine-structuur (AC2: V_LABEL 0,953
> vs GREEN_DOT 0,69) sluit random/mock-init uit. → De AC2/AC4-bevindingen gelden voor het
> systeem **zoals gedeployed**.

---

## AC1 — Kosten-ontkoppeling: **BEWEZEN**

**Het resultaat is de vlakheid over N (klasse-onafhankelijkheid), niet één absoluut getal.**
De region-proposer-kost = `propose + #regio's × embed + searchterm`. Alleen de searchterm hangt
van #klassen af, en die is verwaarloosbaar; de totaalkost schaalt met het **aantal regio's**
(artwork-complexiteit), niet met het aantal keurmerk-klassen.

**Per-beeld fixe kost over 8 artworks** (`ac1dist`, propose+embed, klasse-onafhankelijk):
43–154 regio's → **1,18 – 3,61 s (mediaan 3,12 s)**. De eerder genoemde 1,18 s is de ondergrens
(43 regio's), geen typisch geval.

**Vlakheid over N op één representatief beeld** (43 regio's, volledige keten incl. searchterm):

| #referentieklassen | Region-proposer (totaal) | Template-match baseline (zie caveats) |
|---:|---:|---:|
| 5   | **1,182 s** | 23,6 s |
| 50  | **1,179 s** | 235,8 s (~4 min) |
| 200 | **1,180 s** | 943,4 s (~16 min) |
| 894 | **1,180 s** | 4216,9 s (~70 min) |

De totaalkost beweegt **< 3 ms** van N=5 → N=894 — searchterm < 1 ms zelfs bij N=894 (0,634 ms
in-memory brute-force; de echte pgvector-call mat 73 ms totaal over 43 regio's bij N=10).

**Caveats op de baseline-kolom (eerlijkheidshalve):**
1. **Het is een lineaire extrapolatie uit één meting @10** (47,2 s → 4,72 s/template), niet 894
   echte templates gedraaid. De lineariteit volgt uit de `for tmpl in templates`-structuur
   (`localization.py`), die de story al als gegeven accepteert; de N=5-extrapolatie (23,6 s) klopt
   met de 12.1-meting ~28 s @5. Maar het is geen direct gemeten 894-curve.
2. **De gemeten baseline is ongebudgetteerd.** De productie-`localize` heeft een
   `LOCALIZE_TIME_BUDGET_S` die trunkeert — productie draait dus nooit 70 min, maar levert dan
   **partiële detecties** (kwaliteitsverlies i.p.v. tijdverlies). De ~70 min is "wat het zonder
   budget zou kosten"; de échte prijs bij schaal is gemiste detecties, hier niet gekwantificeerd.
3. **De "sublineaire ivfflat in productie"-claim is geasserteerd, niet gemeten.** De in-memory
   searchterm-curve gebruikt random vectoren + brute-force (lineair in N) als **conservatieve
   bovengrens**; ivfflat-prestatie hangt van index-params (lists/probes) + datadistributie af,
   geen daarvan hier gemeten. De decoupling-conclusie staat los hiervan: de searchterm is al
   verwaarloosbaar bij brute-force.

→ Ongeacht de caveats: de region-proposer-kost is **vlak over #klassen** en de template-match
**strikt lineair**; bij N=200 ~800× sneller, kloof groeit lineair. Detectiekost **ontkoppeld van
#klassen**; een keurmerk toevoegen = één referentie-embedding (O(1)). **AC1 = PASS.**

Artefacten: `spikes/12-2-region-proposer/ac1-latency.json` (curve), `ac1dist.json` (distributie).

---

## AC2 — Non-regressie op de gold-set: **gedecomponeerd (kritiek inzicht)**

Eén `propose → classify`-run over alle 83 unieke `sourceFile`-artworks van
`tests/validation/gold-set-oogstrun.json` (75 ECHT + 16 VALS). Voorgestelde regio's
gematcht aan de ground-truth-bbox op IoU. **Bewust opgesplitst** in *proposer-recall*
(localiseert trap 1 de mark?) en *classify-accuratesse* (klopt embed→classify gegeven
een goede crop?) — die splitsing ís het AC4-bewijs.

| Metriek | Waarde | Lezing |
|---|---:|---|
| Proposer-recall @ IoU≥0,5 | **45,3 %** | strakke localisatie van de mark |
| Proposer-recall @ IoU≥0,3 | 61,3 % | losse localisatie |
| Proposer "surfaced" (centrum in een box) | 69,3 % | mark gezien maar box te grof/geabsorbeerd |
| Classify-accept op **perfecte crop** (micro) | **17,3 %** | embed→classify mét perfecte localisatie |
| Classify-accept op perfecte crop (**macro**, klasse-gemiddeld) | **20,5 %** | minder vertekend door GREEN_DOT-imbalans |
| Classify-accept op **proposer-box** (gegeven covered) | **20,6 %** | > perfecte crop → zie gold-bbox-kanttekening |
| End-to-end (proposer-box → classify) | **9,3 %** | = 0,453 × 0,206 (recall × classify\|covered), sluit exact |

**Per-klasse accept op de perfecte crop (drempel 0,75 cosine):**

| Klasse | n | accept | mediane conf | max conf |
|---|---:|---:|---:|---:|
| EUROPEAN_V_LABEL_VEGAN | 13 | 54 % | 0,781 | 0,953 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 17 | 24 % | 0,676 | 0,899 |
| GREEN_DOT | 42 | 5 % | 0,695 | 0,798 |
| EU_ORGANIC_FARMING | 3 | 0 % | 0,618 | 0,618 |

**Het beslissende patroon — maar genuanceerder dan "alleen onthouding".** Bóven de drempel kiest
de embedding nooit zelfverzekerd fout: van de geaccepteerde perfecte crops **0 fout-accepts →
precisie 100 %** (confusion-matrix: enkel `CODE→CODE` en `CODE→UNKNOWN`). Maar **ónder** de drempel
ligt wél verwarring: van de 62 niet-geaccepteerde ECHT-crops had **56 % de juiste code als top-1**
(echte onthouding, conf < 0,75) en **44 % een verkéérde code als top-1** (sub-drempel-verwarring;
voor GREEN_DOT zelfs 50/50). De fine-tuning moet dus niet alleen correcte matches **omhoog** duwen,
maar in 44 % van de missers ook een fout-rangschikkende buur **omlaag** — een zwaardere opgave dan
"til de drempel-bijna-halers eroverheen". Echte marks liggen op cosine ~0,62–0,78.

**De 9,3 %-anomalie verklaard (en wat ze onthult).** End-to-end 9,3 % = proposer-recall 45,3 % ×
classify-accept-gegeven-covered **20,6 %** — sluit exact. Opvallend: classify op de **proposer-box
(20,6 %)** is *hoger* dan op de **perfecte gold-crop (17,3 %)**. De proposer-boxen classificeren dus
béter dan de gold-bboxen → sterke aanwijzing dat de **gold-bboxen (uit de oude template-match) te
strak/verschoven gesneden zijn** en de proposer-recall daardoor mogelijk **onderschat** wordt
(recall meet overeenstemming met een imperfecte referentie). Niet apart gevalideerd; zie kanttekening.

**Kanttekeningen bij "non-regressie" (eerlijkheidshalve):**
- **Er is geen oude-recall-baseline.** De gold-set is door de óúde pipeline gegenereerd; de oude
  *recall* is nooit gemeten. We kunnen dus zeggen dat **precisie 100 % blijft** (nieuwe meting),
  maar het AC2-criterium "evenaart/verbetert recall" is met deze data **niet strikt beantwoordbaar**
  — alleen dat recall bij de huidige 0,75-drempel laag is en embedding-begrensd.
- **Kleine per-klasse-n.** EU_ORGANIC n=3 (0 %) is ruis, niet signaal; de "17,3 %"-kop wordt voor
  56 % bepaald door GREEN_DOT (n=42, slechtste klasse) → daarom ook de **macro 20,5 %** gerapporteerd.
  Geen betrouwbaarheidsintervallen; per-klasse-deltas zijn indicatief.

→ **Het bindende knelpunt is de embedding** (perfecte-crop-accept micro 17 % / macro 20 %), niet de
architectuur of de drempel; localisatie (proposer 45 %, mogelijk onderschat) is secundair. Dat is
het AC4-bewijs. *Relatie tot AC5:* die mat precisie op de 5 níéuwe klassen; deze meet end-to-end op
de 4 óude — andere metriek/klasse-set, dus dezelfde-orde-9 % is suggestief (uniform zwakke embedding),
geen strikte reproductie.

Artefacten: `spikes/12-2-region-proposer/ac2-ac3-results.json` (summary met micro/macro/below-
threshold-split + per-record); diagnose-viz `diag_{0,1,2}.png` (volle pagina, context) en
**`diagzoom_{0,1,2}.png`** (ingezoomd op de gold-bbox — marks leesbaar; toont kleine marks die in
clusters door NMS in grovere buurregio's verdwijnen).

---

## AC3 — Open-set: **PASS**

Uit dezelfde run.

| Metriek | Waarde |
|---|---:|
| VALS-records (oude-pipeline-FP's) correct → UNKNOWN | **16/16 = 100 %** |
| Niet-keurmerk-regio's beoordeeld (food-textuur uit de proposer) | 5424 |
| Daarvan als echte code geaccepteerd (FP) | 13 |
| **Niet-logo-FP-rate** | **0,24 %** |

De open-set-verwerping (UNKNOWN-markering + 0,75-drempel) verwerpt 100 % van de bekende false
positives en 99,76 % van de proposer-geïntroduceerde niet-logo-regio's. **AC3 = PASS**, met twee
eerlijke afzwakkingen:

- **De 16/16 VALS is zwak bewijs.** VALS-records zijn precies de crops waar de óúde embedding al
  lage confidence (~0,5) gaf — ze lágen al onder elke redelijke drempel. Dat dezelfde zwakke
  embedding ze opnieuw bij 0,75 verwerpt, toont **drempel-consistentie**, niet robuustheid tegen
  níéuwe hard-negatives. Een echte open-set-stress-test (verse hard-negatives) staat nog open →
  meegenomen als AC2 in de vervolgstory.
- **De 0,24 % is dubbel vertekend.** De teller (13) bevat mogelijk **échte ongelabelde logo's** (de
  gold-set labelt één mark/beeld) → mogelijk overschat als FP. De noemer (5424) is gedomineerd door
  **makkelijke negatives** (tekst/achtergrond) → de rate ziet er gunstig uit zonder *harde*
  negatives te toetsen. Het getal is geruststellend maar niet de eindmeting.

De prijs van deze strakke drempel is de lage AC2-recall — dezelfde drempel die ruis buitenhoudt,
onthoudt zich ook op echte marks zolang de embedding ze niet boven 0,75 tilt.

---

## AC4 — Beslisdocument

### 1. Region-proposer: **optie C bevestigd** (klassiek → getraind)

De klassieke CV-proposer (optie B) bewees de kosten-ontkoppeling (AC1) en de open-set-
werking (AC3), maar localiseert kleine, geclusterde marks te grof: recall 45 % @ IoU≥0,5
(69 % "surfaced"). Voldoende om het *principe* te bewijzen en bootstrap-trainingsdata te
genereren, onvoldoende voor productiekwaliteit. → Train een **generieke "keurmerk-regio"-
detector (optie A)** voor strakke localisatie, gebootstrapt met B + de 8.7-synthese.
**Geen wijziging t.o.v. het vastgestelde besluit.**

### 2. Embedding-fine-tuning: **VEREIST — gated-beslissing valt op JA (met bewijs)**

Dit was de open sub-beslissing (story §Besluiten 2): committeer fine-tuning niet vooraf,
laat de meting beslissen. **De meting beslist JA.** Bewijs:

- Perfecte-crop-accept maar 17,3 % micro / 20,5 % macro; mediane cosine van echte marks
  0,62–0,78 — een ImageNet-`efficientnet_b0`-backbone trekt de fijnmazige keurmerk-klassen
  onvoldoende uit elkaar (GREEN_DOT clustert rond 0,69; EU_ORGANIC rond 0,62).
- Het faalpatroon is **bóven de drempel onthouding** (0 fout-accepts, precisie 100 %), maar
  **ónder de drempel deels verwarring**: 44 % van de missers heeft een verkéérde code als top-1.
  Dat maakt de opgave zwaarder dan "til de bijna-halers eroverheen" — fine-tuning moet ook
  fout-rangschikkende buren omlaag duwen. Het is precies waar metric-learning (inter-klasse-marge)
  voor bedoeld is, en het bevestigt de noodzaak.
- Diagnose geldt voor het systeem zoals gedeployed (echte pretrained ImageNet-gewichten,
  geverifieerd). Relatie tot AC5: zelfde orde 9 %, suggestief (uniform zwakke embedding), geen
  strikte reproductie (andere metriek/klasse-set).

→ Start een **vervolgstory** (12.3). **Eerst goedkope pre-checks** (volle 1280-dim vs getrunceerde
512-dim; sterkere off-the-shelf-backbone als DINOv2/CLIP — nul training), pás dan metric-learning-
fine-tuning (ArcFace/triplet op de gold-set-loop + 8.7-synthese) als de pre-checks ontoereikend zijn.
Dit is de #1-recall-blokker voor brede dekking. Per-klasse-drempelcalibratie + confusion-gedreven drempels (story §Open-set)
blijven nuttig maar zijn **secundair**: de huidige globale 0,75 levert al 100 % precisie;
het probleem is recall, en recall komt van een betere embedding, niet van een andere
drempel.

### 3. Go/No-go voor de productie-build

**GO op de architectuur, GATED op de embedding.**

- ✅ **GO** — de twee-traps class-agnostische architectuur (propose → embed → pgvector →
  open-set) is bewezen: kosten ontkoppeld van #klassen (AC1), open-set robuust (AC3),
  precisie behouden (AC2). Bouw deze als A/B-pad **náást** de template-match (beschermde
  tests blijven groen door ontwerp); val per klasse terug zolang nodig.
- ⛔ **GATE** — bouw géén brede uitrol (tientallen→honderden keurmerken) op de
  ongetrainde ImageNet-embedding: recall blijft ~17 % ongeacht de architectuur. De
  productie-build moet **samenlopen met (of volgen op) de embedding-fine-tuning**, anders
  levert "brede dekking" 100 %-precieze maar grotendeels onthoudende detectie.

**Aanbevolen volgorde:** (1) fine-tuning-vervolgstory (grootste hefboom op recall) →
(2) detector-A-training voor strakke localisatie (gebootstrapt met B) → (3) productie-
build van het twee-traps-pad als A/B-migratie met per-klasse-cutover.

---

## Reproductie

```bash
# in de ACC ML-container (heeft cv2 + model + DB-env):
C=$(docker ps --format '{{.Names}}' | grep '^ml-service-qsookwow')
docker exec $C /opt/venv/bin/python /app/scripts/spike_pipeline_eval.py \
  ac1 --image-key '<artwork-key>' --out /tmp/ac1.json
docker exec $C /opt/venv/bin/python /app/scripts/spike_pipeline_eval.py \
  goldset --gold /tmp/gold-set-oogstrun.json --out /tmp/goldset_full.json
docker exec $C /opt/venv/bin/python /app/scripts/spike_pipeline_eval.py \
  ac1dist --gold /tmp/gold-set-oogstrun.json --n 8 --out /tmp/ac1dist.json
```

**Pinned omgeving (voor reproduceerbaarheid):** `torch 2.1.2+cu121`, `torchvision 0.16.2+cu121`,
embedding-gewichten **`EfficientNet_B0_Weights.IMAGENET1K_V1`** (5,29M params), device CPU.
Kanttekening: niet bit-reproduceerbaar buiten deze versies — de containernaam wisselt per deploy
(ACC auto-deployt `acc`; her-resolven met `docker ps | grep ml-service-qsookwow`), de
`/app/scripts`-kopieën zijn efemeer (her-`docker cp` na elke deploy), en torchvision-gewichten
kunnen her-downloaden. Resultaten gemeten op image-tags `4a6c54c`/`84d7bcf` (ML-code identiek).
