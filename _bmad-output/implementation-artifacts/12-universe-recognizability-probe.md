# Epic 12 — Universe-recognizability probe: "kunnen de meeste keurmerken herkend worden?"

Datum 2026-06-09 · ML-container (echte `efficientnet_b0`-embedding, IMAGENET1K_V1) ·
harnas `apps/ml-service/scripts/spike_universe_separability.py` · data: alle GS1-guide-logo's
(extractie `extract_gs1_label_guide.py` → **884 codes / 1006 logo's**). Artefact:
`spikes/12-2-region-proposer/universe-recognizability.json`.

## Kernonderscheid: *trainbaar* ≠ *herkenbaar*

- **Trainbaar (data bestaat): JA, vrijwel volledig.** 884 van de 894 T3777-codes hebben een
  officieel guide-logo (1006 beelden, 96 codes met varianten, 804 < 200px). Met 8.7-synthese is per
  code positieve trainingsdata te genereren. → de bibliotheek is te seeden / te trainen voor bijna de
  hele universe (long tail = zware few-shot: vaak één referentie/code).
- **Herkenbaar (met de huidige embedding): NEE.** Twee meetassen, beide gemeten op de echte embedding:

### A. Inter-code-collisie (schone ref vs schone ref) — harde ondergrens op onherkenbaarheid
Voor elke code: dichtstbijzijnde logo van een **andere** code.

| cosine-drempel | codes met een andere-code-buur | fractie universe |
|---:|---:|---:|
| ≥ 0,80 | 301 | 34 % |
| **≥ 0,75 (operationele poort)** | **448** | **50,7 %** |
| ≥ 0,70 | 608 | 68,8 % |
| ≥ 0,65 | 725 | 82 % |

Mediane dichtstbijzijnde-andere-code-cosine = **0,747** — d.w.z. het *typische* keurmerk ligt
qua officieel logo op ~0,75 (de poort) van een ánder keurmerk **op déze embedding**.

**Belangrijk onderscheid (geen wet over de logo's, maar een eigenschap van de zwakke embedding):**
- De 50,7 % collisie is gemeten op de generieke ImageNet-`efficientnet_b0` mét de lossy 1280→512-
  truncatie. Een zwakke embedding plaatst verschillende beelden dicht bij elkaar *omdat hij zwak is* —
  dat is **grotendeels herstelbaar** door een sterkere/gefine-tunede embedding (precies wat metric-
  learning doet: de marge vergroten). Het is **fixbaar signaal, geen plafond.**
- Er is wél een echt plafond, maar dat is een **kleiner, nog niet apart gekwantificeerd** subset:
  visueel bijna-identieke variant-families (FSC MIX/100%/RECYCLED, kosher/halal-certificeerder-
  varianten, BETER_LEVEN-sterren, V-Label vegan/vegetarian). Die blijven moeilijk, óók met een
  perfecte embedding. Niet de 50 %.

Drempel-tuning alléén lost de collisie niet op; een betere embedding wel (op het fixbare deel).

### B. Vervormde-crop → referentie (query-zijde, de as die op herkenning slaat)
Elk schoon logo vervormd tot een artwork-achtige crop (downscale/blur/JPEG/rotatie), embed, gematcht
tegen de 884-code-bibliotheek.

| Metriek | Waarde | Lezing |
|---|---:|---|
| self-cosine p50 (crop ↔ eigen ref) | **0,654** | ónder de 0,75-poort; reproduceert de echte ~0,69 op de 4 gold-klassen |
| top-1-accuratesse (juiste code = dichtstbij) | **57,6 %** | rangschikking is *redelijk*; signaal bestaat |
| **accept @ 0,75 (zelfverzekerd herkend)** | **24 %** | herkenbaarheidsplafond onder gunstige condities |

De self-cosine p50 0,654 sluit aan bij de echt gemeten gold-crop-waarden (V_LABEL/FSC/EU_ORGANIC
0,61–0,64 synthetisch vs 0,62–0,78 reëel) → het vervormingsproxy is ruwweg gekalibreerd, dus de
24 %-accept is **richtinggevend** (geen exact getal). **Bovendien is 24 % een óvergrens:** schone
referentie-bibliotheek, synthetische i.p.v. echte artwork-vervorming, géén proposer-localisatiefout,
en gemeten op de single-reference-bibliotheek. Echte productie ligt láger (vgl. de gemeten 17 % accept
op de 4 gold-klassen met echte crops).

## Antwoord op de vraag

**De meeste keurmerken zijn met deze epic wél te trainen, maar worden met de huidige (zwakke,
ongetrainde) embedding níét betrouwbaar herkend.** Het knelpunt zit op **beide embedding-assen** —
inter-klasse-marge (collisie) én intra-klasse-spreiding (crop→referentie). Dat is **grotendeels een
eigenschap van de zwakke baseline-embedding, geen plafond:** een sterkere/gefine-tunede embedding
(12.3) is precies bedoeld om beide te herstellen. Het echte (kleinere, nog niet gekwantificeerde)
plafond zijn de visueel bijna-identieke variant-families. Robuuste cijfers: **collisie 50,7 %** (schone
data) en **17 % accept op de 4 gold-klassen met echte crops**; de universe-brede 24 %/58 % uit proxy B
zijn richtinggevend (synthetisch), geen hard getal.

**Reden voor optimisme / pragmatisch pad:**
1. De rangschikking dráágt signaal (top-1 57,6 % op 884 klassen) — metric-learning is precies bedoeld
   om marge te vergroten en spreiding te verkleinen; de 12.3-stap-0 (sterkere off-the-shelf-backbone
   als DINOv2/CLIP) kan dit al deels oplossen vóór er getraind wordt. Deze probe ís die meting,
   gedraaid op de zwakke baseline.
2. **Richt niet op alle 884.** De declaratie-frequentie is sterk geconcentreerd: een handvol codes
   (GREEN_DOT 11.169, RECYCLABLE 8.643, TRIMAN 3.886, …) domineert het volume; de lange staart (850+
   codes) wordt zelden gedeclareerd. Brede dekking betekent in de praktijk **de top-N-meest-
   gedeclareerde keurmerken** (tientallen) betrouwbaar krijgen — een veel kleiner, haalbaarder doel.
   12.1 dekt er al 10; de embedding-slag (12.3) bepaalt of die tientallen herkenbaar worden.

## Caveats
- Vervormingsproxy (B) is synthetisch; per-code single-sample → ruis. Richting robuust, exacte %
  zacht. De collisie-meting (A) is schone data, geen proxy — die 50,7 % staat hard.
- Gemeten op de huidige `efficientnet_b0`; zegt niets over wat een sterkere backbone/fine-tuning haalt
  (dat is 12.3-stap-0/fine-tuning). Dit is de **baseline waartegen 12.3 zich moet bewijzen**.
