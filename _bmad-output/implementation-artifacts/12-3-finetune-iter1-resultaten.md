# Story 12.3 — Fine-tuning ITERATIE 1: resultaat (feasibility) — naïeve synthese werkt NIET

Datum 2026-06-09 · ML-container · harnas `apps/ml-service/scripts/spike_finetune_iter1.py` · artefact
`spikes/12-2-region-proposer/finetune-iter1.json`. **Feasibility-grade** (verdict alleen op echte crops,
4 klassen — te smal voor een capaciteits-verdict; wél een duidelijk richtingssignaal).

## Opzet

Projectie-kop (1280→1024→512, L2-norm) op **bevroren** `efficientnet_b0`-features, getraind met
**supervised-contrastive** metric-loss. Positieven = synthetische augmentaties (downscale/blur/JPEG/
rotatie) van de guide-logo's. **Gold-4 klassen volledig hold-out** (nooit in training). 730 train-codes,
6 augmentaties/code, 60 epochs.

## Resultaat

| metriek | vóór (effb0) | ná (kop) | Δ |
|---|---:|---:|---:|
| **ECHTE held-out gold-crops, top-1 (VERDICT)** | **0,373** | **0,227** | **−0,147** ❌ |
| held-out synthetisch, top-1 (sanity, circulair) | 0,600 | 0,753 | +0,153 |

(75 echte ECHT-crops over 4 klassen; top-1 = drempelvrij, schaal-invariant.)

## Lezing — een schoon, eerlijk negatief

De kop **verbeterde de circulaire synthetische metriek** (+15pt: hij leerde mijn augmentatie terug te
draaien) maar **verslechterde de échte herkenning** (37 %→23 %, −15pt). Exact het door de review
voorspelde valse-positief-patroon: de synthetische augmentatie-distributie ≠ echte artwork-degradatie
(we wisten al: synthetische GREEN_DOT 0,83 vs echt 0,69), dus de kop overfit de *verkeerde* vervorming
en duwde de feature-ruimte in een richting die echte crops scháádt. **Het vooraf vastleggen van
"alleen echte crops = verdict" voorkwam dat dit als (vals) succes werd gelezen.**

## Conclusie

- **Bevroren effb0 + kop op naïeve synthetische augmentatie = niet de oplossing** (maakt echt slechter).
  Dit is *geen* "fine-tuning is kansloos" — het is "naïeve synthese + bevroren kop is ontoereikend".
- De bindende beperking is **trainingsdata-realisme** (de #1-prep uit de review), niet de kop/loss.

## Iteratie 2 — gerichte vervolgstappen (in volgorde van hefboom)

1. **Realistische positieven via de 8.7-synthese-pijplijn** (logo op échte achtergronden + compositie-
   variatie) i.p.v. signaal-degradatie. Dit is de meest waarschijnlijke oorzaak van het falen.
2. **Echte gelabelde crops als positieven/eval verbreden** (Story 12.6 + training_data-DB + proof-slice-
   labels) → van 4 naar ≥10–15 klassen, zodat het verdict draagkracht heeft.
3. **Backbone (deels) ontdooien** als 1+2 nog te laag plafond geven (stap-0 toonde dat zelfs bevroren
   DINOv2 deze grafische marks niet scheidt → bevroren features hebben mogelijk een laag plafond).

## Caveats

- 4 echte klassen / 75 crops → de exacte Δ is ruis-gevoelig; het **kwalitatieve patroon** (echt omlaag,
  synthetisch omhoog) is het robuuste signaal en is op zichzelf voldoende om "naïeve synthese" af te wijzen.
- Eén kop-architectuur/loss/LR geprobeerd; een zachtere kop overfit minder maar verandert negatief→positief
  niet zonder beter-passende data (de transfer-kloof is data-, geen capaciteits-probleem in iteratie 1).
