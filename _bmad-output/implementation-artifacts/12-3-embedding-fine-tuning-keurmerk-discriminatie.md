# Story 12.3: Embedding-fine-tuning — keurmerk-discriminatie boven de open-set-drempel tillen

Status: ready (gated-beslissing uit Story 12.2-spike valt op JA, met data). Vervolg op 12.2;
voorwaarde voor de brede-dekking productie-build.

## Story

Als ML-eigenaar,
wil ik het embedding-model **fine-tunen met metric-learning op keurmerk-crops** (i.p.v. de
ongetrainde ImageNet-`efficientnet_b0`-backbone), zodat echte keurmerk-marks **boven de
open-set-drempel (cosine 0,75) uitkomen** en de classify-**recall** stijgt — zónder de
precisie te verliezen — en brede keurmerk-dekking (tientallen → honderden klassen) feitelijk
*classificeerbaar* wordt i.p.v. grotendeels onthouden.

## Probleem (bewezen in Story 12.2, niet vermoed)

De 12.2-spike (`12-2-spike-results-and-decision.md`) toonde met data dat de **embedding het
bindende knelpunt** is — niet de architectuur (AC1 bewees kosten-ontkoppeling) en niet de
open-set (AC3: 100 % VALS-reject, 0,24 % niet-logo-FP):

- **Perfecte-crop classify-accept = 17 %** @ drempel 0,75. Echte marks liggen op cosine
  **0,62–0,78** (GREEN_DOT mediaan 0,69; EU_ORGANIC 0,62; FSC 0,68; V_LABEL 0,78).
- **Precisie van geaccepteerde = 100 %, 0 fout-accepts** → het faalpatroon is **onthouding**,
  niet verwarring. De backbone trekt de fijnmazige keurmerk-klassen onvoldoende uit elkaar.
- End-to-end 9,3 % reproduceert de orde van de AC5-9 % uit Story 12.1.

Twee versterkende implementatie-feiten:
1. **Lossy dimensie-reductie:** `model_manager.generate_embedding` snijdt de 1280-dim
   `efficientnet_b0`-features bruut af tot 512 (`model_manager.py:~179`: `embedding[:512]`).
   Informatie weggegooid vóór de pgvector-cosine. Een **geleerde projectie-kop** vervangt dit.
2. **Embedding-model is niet geversioneerd:** `EMBEDDING_MODEL = "efficientnet_b0"`
   (`config.py:53`), vers uit torchvision geladen bij startup. De `model_versions`-tabel +
   `create_model_version`/`get_active_model`/`save_model`/`load_model` bestaan, maar worden
   **alleen voor de ONNX-classifier** gebruikt (`logo_detector_{version}.onnx`). Er is geen
   opslag/activatie/versionering voor een *fine-getuned embedding-model*.

## Doel / niet-doel

- **Doel:** de perfecte-crop-accept (en daarmee de classify-recall) op de gold-set
  **substantieel verhogen** t.o.v. de 17 %-baseline, bij **behoud van ~100 % precisie** en een
  lage niet-logo-FP-rate; het fine-getunede model **geversioneerd, opgeslagen en activeerbaar**
  maken zonder code-wijziging; bij activatie de **referentie-embeddings herbouwen** zodat
  query- en referentie-vectoren in dezelfde ruimte liggen.
- **Niet-doel:** de region-proposer / detector-A (dat is het localisatie-spoor, 12.2-optie A,
  aparte story); de referentiebibliotheek-inhoud wijzigen (de GS1-geseede bibliotheek blijft de
  bron); de crosscheck/declaratie-routing of de gold-set-loop wijzigen; per-klasse-drempel-
  calibratie als *aparte* slag (komt mee als her-calibratie ná fine-tuning, zie AC5).

## Voorgestelde aanpak (metric-learning op een projectie-kop)

```
keurmerk-crops (positief/negatief, per t3777_code)
   → backbone (efficientnet_b0 features, 1280-dim)
   → [NIEUW] geleerde projectie-kop → L2-genormaliseerde embedding (512-dim)
   → metric-loss (triplet / ArcFace / supervised-contrastive) die de inter-klasse-marge vergroot
   → opgeslagen als geversioneerd embedding-model (model_versions + storage)
   → activatie → model_manager laadt het actieve embedding-model
                → rebuild_reference_embeddings() (re-embed de hele referentiebibliotheek)
```

- **Trap die we trainen:** een projectie-kop bovenop de backbone (de truncate-tot-512 vervangen
  door een *geleerde* 512-projectie). Backbone-lagen optioneel ontdooien (gefaseerd) als de kop
  alleen onvoldoende blijkt — meten, niet vooraf beslissen.
- **Serving:** dezelfde `model_manager.generate_embedding`-interface; intern het actieve
  fine-getunede model i.p.v. de kale torchvision-backbone. **Query- én referentie-embeddings
  moeten hetzelfde modelversie gebruiken** — daarom triggert activatie verplicht
  `similarity.rebuild_reference_embeddings()` (endpoint bestaat sinds 12.1).

## Kernbeslissing: metric-loss (opties + trade-offs)

| Optie | Wat | Voor | Tegen |
|---|---|---|---|
| **A. Triplet / contrastive op projectie-kop** (backbone bevroren) | anchor-positive-negative marge | goedkoop; weinig data nodig; lage forgetting-risk | begrensd door bevroren backbone-features |
| **B. ArcFace / sub-center ArcFace** (classificatie-kop met angular margin) | leert klasse-prototypes met marge | sterk voor fijnmazige, veel-klasse-discriminatie; schaalt naar ~894 | gevoeliger voor klasse-imbalance/few-shot |
| **C. Backbone-fine-tuning** (lagen ontdooien) | volledige feature-aanpassing | hoogste capaciteit | duurste; overfit-/forgetting-risico bij weinig klassen |

**Aanbeveling: start B (ArcFace op een projectie-kop, backbone bevroren)** — angular-margin
is de standaard voor fijnmazige veel-klasse-herkenning en sluit aan op het cosine-similarity-
serving-pad. Val terug op/combineer met A bij data-schaarste; ontdooi backbone (C) alleen als de
meting (AC1) het plafond daar legt. **Eén sub-beslissing expliciet gated op de meting**, net als
12.2's fine-tuning-beslissing dat was.

## Trainingsdata-strategie

Per `t3777_code` positieve crops + class-agnostische negatieven (voor de open-set-marge):
- **Gold-set-loop / bevestigde detecties:** crops mét menselijk label + herkomst (Story 8.6,
  `get_training_images`, holdout-veld op queryniveau — NFR3). Dit is de schone positieve bron.
- **Synthese (Story 8.7, done):** officieel GS1-guide-logo op realistische achtergronden met
  bekende klasse → goedkope positieven, **essentieel voor zeldzame keurmerken** (de ~894-universe
  heeft meestal maar de single guide-referentie — few-shot).
- **Open-set-negatieven:** niet-keurmerk-regio's uit de region-proposer (12.2 produceert die in
  bulk) → leren de marge tegen food-textuur/typografie.
- **Holdout:** strikt op query-niveau uitgesloten van training (hergebruik 8.6/NFR3); de
  **gold-set-oogstrun blijft de bevroren evaluatie-set** (mag niet in training lekken).

## Acceptatiecriteria

1. **Discriminatie meetbaar verbeterd:** op de bevroren gold-set (`tests/validation/
   gold-set-oogstrun.json`) stijgt de **perfecte-crop classify-accept** significant boven de
   17 %-baseline (12.2), bij **precisie ≥ de 100 %-baseline van geaccepteerde** (geen toename
   van fout-accepts). Streefbudget vooraf vastgesteld; gemeten met de 12.2-harnas.
2. **Geen open-set-regressie:** VALS-reject blijft 16/16 (100 %) en de niet-logo-FP-rate blijft
   in de orde van de 12.2-baseline (0,24 %) — fine-tuning mag de open-set-verwerping niet
   ondermijnen (anders ruilen we recall voor precisie weg).
3. **Geversioneerd & activeerbaar:** het fine-getunede embedding-model wordt opgeslagen
   (`save_model`/`load_model`) en geregistreerd (`create_model_version`/`get_active_model`),
   en is activeerbaar **zonder code-wijziging**. `model_manager` laadt bij startup/activatie het
   actieve embedding-model i.p.v. de kale torchvision-backbone (fallback naar de backbone als er
   geen actief model is — open-input gate).
4. **Ruimte-consistentie afgedwongen:** activatie van een embedding-modelversie triggert
   `rebuild_reference_embeddings()`; query- en referentie-embeddings dragen dezelfde modelversie.
   Een meetbare garantie/assert dat er nooit cross-versie wordt vergeleken.
5. **Drempel her-calibratie:** na fine-tuning wordt de operationele drempel (globaal
   `CLASSIFY_THRESHOLD_EMBEDDING`, en waar nodig **per-klasse**, via de 12.2-confusion-matrix)
   opnieuw bepaald op de gold-set, met de gekozen precisie/recall-balans onderbouwd.

## Risico's & mitigaties

- **Catastrophic forgetting / overfit op weinig klassen** → backbone bevriezen (start B), holdout,
  synthese (8.7) voor klasse-balans, evalueren op de bevroren gold-set.
- **Few-shot voor de ~894-universe** (meestal 1 guide-referentie/klasse) → synthese + augmentatie;
  ArcFace-prototypes uit synthetische + reële crops; expliciet meten op zeldzame klassen.
- **Precisie wegruilen voor recall** → AC1+AC2 koppelen precisie-behoud als harde eis; per-klasse-
  drempels (AC5) i.p.v. de drempel globaal verlagen.
- **Ruimte-mismatch query vs referentie** (grootste serving-valstrik) → AC4 dwingt rebuild-bij-
  activatie + versie-assert af.
- **Trainings-infra** → hergebruik Epic 9 (automatische-retraining-queue/job-infra, done) en de
  trainer-scaffolding (`trainer.py`: `build_eval_transform`, model-opslag, `model_versions`).

## Tests / ATDD

- **Primaire meet-gate = de 12.2-harnas** (`apps/ml-service/scripts/spike_pipeline_eval.py
  goldset`): perfecte-crop-accept, recall@drempel, precisie, confusion-matrix, niet-logo-FP —
  draai vóór (baseline 17 %/100 %) en ná fine-tuning op dezelfde bevroren gold-set. AC1/AC2/AC5
  lezen rechtstreeks uit deze output.
- **Red-phase-ATDD** voor de nieuwe productie-paden (embedding-modelversionering, activatie-
  triggert-rebuild, fallback-naar-backbone) — losse unit/integratietests, conform Epic 8/9-stijl.
- **Holdout-discipline** (8.6/NFR3) getest: gold-set en holdout-records lekken niet in training.
- **Beschermde tests** (`tests/test_artwork_processing.py` 142–206) blijven byte-identiek — deze
  story raakt het embedding-/classify-pad, niet `match_templates`/`tile_image`/`merge_detections`.

## Migratiepad

Het fine-getunede embedding-model wordt geactiveerd als **modelversie** (rollback = vorige versie
activeren + rebuild). Tot activatie blijft de kale backbone het actieve pad (fallback). De
referentiebibliotheek en crosscheck blijven onveranderd; terugvallen blijft mogelijk. Past binnen
het 12.2-A/B-migratiepad: eerst betere embedding, dan detector-A, dan de twee-traps productie-build.

## Afhankelijkheden

- **Voorwaarde voor:** de 12.2-productie-build van het twee-traps class-agnostische pad (GATED).
- **Hergebruikt:** Story 8.6 (trainingsdata + herkomst + holdout), Story 8.7 (synthese, done),
  Epic 9 (retraining-infra, done), Story 12.1 (`rebuild_reference_embeddings`-endpoint), de
  12.2-meetharnas.
- **Parallel mogelijk met:** detector-A-training (12.2-optie A) — orthogonaal (localisatie vs
  discriminatie), beide gebootstrapt door 8.7-synthese.
