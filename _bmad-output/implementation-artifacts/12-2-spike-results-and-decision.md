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

Eén beeld (`artwork/03059946316376/…_converted-0.png`, 3342×3161), volledige keten
`propose → embed(alle regio's) → search`, afgezet tegen de template-match-baseline op
dezelfde hardware.

| #referentieklassen | Region-proposer (totaal/beeld) | Template-match baseline |
|---:|---:|---:|
| 5   | **1,18 s** | 23,6 s |
| 50  | **1,18 s** | 235,8 s (~4 min) |
| 200 | **1,18 s** | 943,4 s (~16 min) |
| 894 | **1,18 s** | 4216,9 s (~70 min) |

**Region-proposer-budget (constant):** propose 238,7 ms + embed 940,7 ms (43 regio's ×
21,9 ms, **klasse-onafhankelijk**) + searchterm < 1 ms zelfs bij N=894 (0,634 ms
in-memory; de echte pgvector-call mat 73 ms totaal over 43 regio's bij de huidige N=10).
De enige klasse-afhankelijke term (nearest-reference-zoek) is verwaarloosbaar en
sublineair in productie.

**Baseline:** gemeten 47,2 s bij 10 templates → 4,72 s/template, strikt lineair. De
N=5-extrapolatie (23,6 s) bevestigt de in Story 12.1 gerapporteerde ~28 s @ 5.

De ~1,18 s is voor dít beeld (43 regio's); een beeld met 153 regio's kost ~3,6 s. Het
**resultaat is de vlakheid over N** (de totaalkost beweegt < 3 ms van N=5 → N=894), niet
het absolute getal — dat schaalt met het aantal regio's, niet met het aantal klassen.

→ Bij N=200 is de region-proposer **~800× sneller**, en de kloof groeit lineair. De
detectiekost is **ontkoppeld van het aantal keurmerk-klassen**. Een keurmerk toevoegen =
één referentie-embedding toevoegen (O(1)), geen extra detectiekost. **AC1 = PASS.**

Artefact: `spikes/12-2-region-proposer/ac1-latency.json`.

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
| Classify-accuratesse op **perfecte crop** | **17,3 %** | embed→classify mét perfecte localisatie |
| End-to-end (proposer-box → classify) | **9,3 %** | zelfde orde als AC5-9 % (zie kanttekening) |

**Per-klasse accept op de perfecte crop (drempel 0,75 cosine):**

| Klasse | n | accept | mediane conf | max conf |
|---|---:|---:|---:|---:|
| EUROPEAN_V_LABEL_VEGAN | 13 | 54 % | 0,781 | 0,953 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 17 | 24 % | 0,676 | 0,899 |
| GREEN_DOT | 42 | 5 % | 0,695 | 0,798 |
| EU_ORGANIC_FARMING | 3 | 0 % | 0,618 | 0,618 |

**Het beslissende patroon:** van de 13 geaccepteerde perfecte crops waren er **0 fout
geclassificeerd** — *precisie van het geaccepteerde = 100 %*. De confusion-matrix bevat
uitsluitend `CODE→CODE` (correct) en `CODE→UNKNOWN` (onthouding); **geen enkele
`CODE→andere CODE`**. De embedding kiest dus nooit zelfverzekerd de verkeerde klasse —
hij **onthoudt zich**. Echte keurmerk-crops liggen op cosine ~0,62–0,78, grotendeels
ónder de 0,75-poort, dus recall stort in terwijl precisie 100 % blijft.

→ **Non-regressie op precisie houdt stand (100 %); recall is het slachtoffer en wordt
begrensd door de embedding, niet door de architectuur of de drempel.** De end-to-end
9,3 % ligt in dezelfde orde als de schone AC5-9 %, maar dat is *suggestief, geen strikte
reproductie*: AC5 mat **precisie op de 5 níéuwe klassen**, deze meting **end-to-end-
accuratesse op de 4 óude gold-set-klassen** — andere metriek, andere klasse-set. Dat beide
rond 9 % landen wijst op een uniform zwakke embedding over oud én nieuw, maar het is geen
onafhankelijke bevestiging langs hetzelfde pad. Het plafond is de **17,3 % perfecte-crop-
accept**: zelfs met perfecte localisatie
klaart maar 17 % van de echte marks de drempel. Localisatie (proposer 45 %) is secundair;
het bindende knelpunt is het onderscheidend vermogen van de ImageNet-embedding
(`efficientnet_b0`).

Artefacten: `spikes/12-2-region-proposer/ac2-ac3-results.json` (summary + per-record),
diagnose-viz `spikes/12-2-region-proposer/diag_{0,1,2}.png` (gold-box groen, proposals
rood — toont kleine marks die in clusters door NMS in grovere buurregio's verdwijnen).

---

## AC3 — Open-set: **PASS**

Uit dezelfde run.

| Metriek | Waarde |
|---|---:|
| VALS-records (oude-pipeline-FP's) correct → UNKNOWN | **16/16 = 100 %** |
| Niet-keurmerk-regio's beoordeeld (food-textuur uit de proposer) | 5424 |
| Daarvan als echte code geaccepteerd (FP) | 13 |
| **Niet-logo-FP-rate** | **0,24 %** |

De open-set-verwerping (UNKNOWN-markering + 0,75-drempel) verwerpt 100 % van de
bekende false positives en 99,76 % van de proposer-geïntroduceerde niet-logo-regio's.
Kanttekening: een deel van de 13 kan een écht maar ongelabeld logo zijn (de gold-set
labelt één mark per beeld). **AC3 = PASS.** De prijs van deze strakke drempel is de lage
AC2-recall — dezelfde drempel die ruis buitenhoudt, onthoudt zich ook op echte marks
zolang de embedding ze niet boven 0,75 tilt.

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

- Perfecte-crop-accept maar 17,3 %; mediane cosine van echte marks 0,62–0,78 — een
  ImageNet-`efficientnet_b0`-backbone trekt de fijnmazige keurmerk-klassen onvoldoende uit
  elkaar (GREEN_DOT clustert rond 0,69; EU_ORGANIC rond 0,62).
- Het faalpatroon is **onthouding, niet verwarring** (0 fout-accepts, precisie 100 %) →
  precies wat metric-learning-fine-tuning op keurmerk-crops oplost: vergroot de
  inter-klasse-marge zodat echte marks de 0,75-poort halen, zónder de precisie te slopen.
- Verklaart de 9 % uit AC5 onafhankelijk: het is **niet** primair de architectuur of de
  localisatie — het is de embedding.

→ Start een **vervolgstory "metric-learning-fine-tuning op keurmerk-crops"** (triplet/
ArcFace op de gold-set-loop + 8.7-synthese-crops). Dit is de #1-precisieblokker voor brede
dekking. Per-klasse-drempelcalibratie + confusion-gedreven drempels (story §Open-set)
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
```
