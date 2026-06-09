# Story 12.3: Embedding-fine-tuning — keurmerk-discriminatie boven de open-set-drempel tillen

Status: ready (gated-beslissing uit Story 12.2-spike valt op JA: de embedding ís het knelpunt).
Vervolg op 12.2; voorwaarde voor de brede-dekking productie-build. **Scope-noot:** "fine-tuning" is
het wáárschijnlijke pad, maar de verplichte stap-0-pre-checks (1280-vs-512, sterkere off-the-shelf-
backbone) kunnen de story degraderen tot "betere backbone + versioneren" zónder training — dat is
expliciet een toegestane, goedkopere uitkomst (meten vóór committen).

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

## Stap 0 — goedkope pre-checks vóór er één gewicht getraind wordt (verplicht)

De 12.2-les was: meten vóór committen. Voordat we in (dure) metric-learning investeren, draaien
twee bijna-gratis experimenten door **dezelfde 12.2-harnas** (`goldset`), elk met een go/no-go:

1. **Volledige 1280-dim vs getrunceerde 512-dim.** De huidige `embedding[:512]`-truncatie gooit
   ~60 % van de backbone-features weg. Meet de perfecte-crop-accept met de **volledige 1280-dim**
   embedding (pgvector-kolom tijdelijk 1280, of cosine in-process) tegen de 512-baseline. **Als dit
   alleen al de accept materieel tilt, is een deel van de winst gratis** (alleen de projectie-/
   dimensie-fix, geen training) → herijk de scope.
2. **Sterkere off-the-shelf-backbone, nul training.** Haal **DINOv2 (ViT-S/14)**, **CLIP ViT-B/32**
   en **EfficientNet-B3/V2-S** (allemaal pretrained, geen fine-tuning) door de harnas. DINOv2/CLIP
   zijn aantoonbaar sterker in fijnmazige/zero-shot-discriminatie dan ImageNet-`efficientnet_b0`.
   **Als een off-the-shelf-backbone de accept al boven de AC1-bar tilt, vervalt (of verkleint) de
   noodzaak van fine-tuning** → de story degradeert tot "backbone vervangen + versioneren".

Pas als beide pre-checks ontoereikend blijken, gaat de metric-learning-trap (hieronder) door. De
pre-checks zijn **onderdeel van deze story** en hun harnas-output is een verplicht artefact (AC0).

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

**Aanbeveling: eerst stap 0, dán — indien nog nodig — start B (ArcFace op een projectie-kop,
backbone bevroren).** Angular-margin is de standaard voor fijnmazige veel-klasse-herkenning en sluit
aan op het cosine-serving-pad. **Maar de keuze van loss is pas relevant als stap 0 aantoont dat een
sterkere off-the-shelf-backbone het niet al oplost** — anders vervalt de hele trainings-trap. Val
terug op/combineer B met A bij data-schaarste; ontdooi backbone (C) alleen als de meting het plafond
daar legt. Twee sub-beslissingen expliciet gated op meting (off-the-shelf vóór training; C vóór A),
in dezelfde geest als 12.2's fine-tuning-beslissing.

## Trainingsdata-strategie

Per `t3777_code` positieve crops + class-agnostische negatieven (voor de open-set-marge):
- **Gold-set-loop / bevestigde detecties:** crops mét menselijk label + herkomst (Story 8.6,
  `get_training_images`, holdout-veld op queryniveau — NFR3). Dit is de schone positieve bron.
- **Synthese (Story 8.7, done):** officieel GS1-guide-logo op realistische achtergronden met
  bekende klasse → goedkope positieven, **essentieel voor zeldzame keurmerken** (de ~894-universe
  heeft meestal maar de single guide-referentie — few-shot).
- **Open-set-negatieven:** niet-keurmerk-regio's uit de region-proposer (12.2 produceert die in
  bulk) → leren de marge tegen food-textuur/typografie.
- **Holdout / anti-leakage (MECHANISME, niet alleen intentie):** de evaluatie-set is de
  gold-set-oogstrun (91 records). Diezelfde records zijn óók bevestigde detecties en kunnen dus in
  de trainings-pull zitten → reële lekkage. Mitigatie: **sluit de 91 `id`'s expliciet uit** de
  trainings-query (een `id NOT IN (...)`-filter, gevoed door `gold-set-oogstrun.json`), bovenop het
  bestaande 8.6/NFR3-holdout-veld. De story levert een **test die faalt als één gold-set-id in de
  trainingsselectie belandt**. De gold-set blijft bevroren; geen augmentatie/synthese van die crops.

## Acceptatiecriteria

> **Baselines (12.2, bevroren gold-set, n=75 ECHT) — waartegen AC1/AC2 meten:** perfecte-crop-accept
> **micro 17,3 % / macro 20,5 %**, precisie-van-geaccepteerde **100 %** (0 fout-accepts), per-klasse
> 5 %–54 %. *Kanttekening (12.2): kleine per-klasse-n (EU_ORGANIC n=3) → per-klasse-deltas zijn
> indicatief, niet significant; rapporteer micro **én** macro.*

0. **Pre-checks gedraaid (stap 0):** de twee goedkope experimenten (1280-vs-512, off-the-shelf-
   backbones) zijn door de harnas gehaald en hun output is bijgevoegd, met een expliciet go/no-go
   of (en in welke vorm) fine-tuning nog nodig is. Géén training vóór dit artefact bestaat.
1. **Discriminatie meetbaar verbeterd, met een vooraf vaste bar:** op de bevroren gold-set stijgt de
   perfecte-crop-accept naar **≥ 50 % micro (en ≥ 55 % macro)** — d.w.z. ruwweg een **verdrievoudiging**
   van de 17,3 %-baseline — bij **precisie-van-geaccepteerde ≥ 95 %** (max. ~1 fout-accept op 75).
   Tevens: van de huidige sub-drempel-missers is **44 % top-1-verkeerd** (12.2); de gefine-tunede
   embedding moet de **wrong-top1-fractie naar < 15 %** brengen (niet alleen correcte matches omhoog,
   ook foute omlaag). Gemeten met de 12.2-harnas; micro + macro beide gerapporteerd.
2. **Geen open-set-regressie:** VALS-reject blijft **16/16 (100 %)** en de niet-logo-FP-rate blijft
   **≤ 0,5 %** (12.2-baseline 0,24 %). *Kanttekening: VALS waren al lage-confidence-crops van de oude
   pipeline → dit toetst drempel-consistentie, niet robuustheid tegen níéuwe hard-negatives; voeg
   daarom ≥ 1 set verse hard-negatives (proposer-food-textuur, hoog-contrast-typografie) toe en meet
   de FP daarop apart.*
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
