# Story 12.3 — Fine-tuning ITERATIE 2: plan (realistische synthese + bredere echte eval-set)

Datum 2026-06-12 · Vervolg op `12-3-finetune-iter1-resultaten.md` (iter1 faalde: naïeve
signaal-degradatie maakte echte top-1 37 %→23 %). Dit plan fixeert **één variabele tegelijk** —
eerst de trainingsdata-realisme (de bewezen bindende beperking), architectuur constant t.o.v. iter1.

## Wat iter2 anders doet dan iter1 (de enige bewust gewijzigde variabele)

| | iter1 (gefaald) | iter2 |
|---|---|---|
| **Positieven** | naïeve signaal-degradatie van guide-logo's (downscale/blur/JPEG/rotatie) op schone achtergrond | **8.7-compositing** (`synthesis.compose_synthetic`): guide-logo op **échte cached artwork-achtergronden**, met scale/rotatie/HSV-jitter/blur, bekende bbox |
| **Kop/loss** | projectie-kop + supervised-contrastive, backbone bevroren | **ongewijzigd** (zelfde kop/loss/LR) — om het data-effect te isoleren |
| **Eval-set** | 4 klassen, 75 echte gold-crops | **24 klassen, 101 echte bevestigde crops** (zie inventaris) |
| **Metriek** | top-1 rang op echte crops | **ongewijzigd**: top-1 rang (schaal-invariant; stap-0 wees accept@0,75 af als backbone-confounded) |

De hypothese die iter1 expliciet maakte: *het knelpunt is data-realisme, niet kop/loss.* Iter2 toetst
precies dat door **alleen de synthese-bron** te wisselen. Slaagt het niet → pas dán architectuur
(backbone ontdooien, stap 3 uit iter1-doc), niet eerder.

## Kritieke bevinding — echte gelabelde data is schaars (gemeten 2026-06-12)

`training_data` op ACC (`logo_recognition`, status-telling): **101 bevestigde echte crops, 24 labels,
allemaal met `crop_path`.** Verdeling is bruut scheef:

| bucket | klassen |
|---|---|
| ≥ 10 crops | 1 (RECYCLABLE_GENERAL_CLAIM = 26) |
| 5–9 crops | ~5 (BETER_LEVEN_1_STER 11, RAINFOREST_PN 7, NUTRISCORE_B 7, CONFORMITE_EUROPEENNE 6, WEIDEMELK 6) |
| 1–4 crops | ~18 (de rest) |

**Gevolg voor het plan:**
1. **Trainen op echte crops kan niet** (1–4/klasse) → de positieven móéten van 8.7-synthese komen.
   De echte crops zijn te kostbaar om aan training te besteden; ze zijn de **verdict-set**.
2. **De eval-set verbreedt van 4 → 24 klassen** — dit adresseert iter1-caveat #2 ("4 klassen te smal").
   Per-klasse-n blijft klein (ruis), dus rapporteer **macro top-1** als hoofdcijfer en lever per-klasse
   alleen indicatief. Klasse-dékking is hier de winst, niet per-klasse-precisie.
3. **De harvesting-bron is de opgeschoonde review-queue** (2.154 open items ≥ 0,50 na de 12-06-filter).
   Meer bevestigde crops = betere toekomstige iteraties; dit is de 12.6-loop. Geen blokker voor iter2,
   wél de reden dat iter2's verdict statistisch licht blijft tot 12.6 levert.

## Anti-leakage (ongewijzigd hard mechanisme)

De 101 echte crops zijn de verdict-set én potentieel bevestigde detecties die in een trainings-pull
kunnen lekken. 8.7-synthese gebruikt **guide-referentie-PNG's**, geen echte crops → structureel geen
lekkage van de verdict-crops in de positieven. Expliciet asserten: geen `training_data.id` uit de
verdict-set verschijnt in de synthese-seed-set (de synthese leest alleen `reference_logos`).

## Uitvoeringsstappen (in hefboomvolgorde)

1. **Herijk de baseline op de bredere set.** Draai de bestaande effb0-backbone (volle 1280-dim, geen
   truncatie — stap-0's gratis winstje) door de top-1-harnas op de 24-klasse / 101-crop verdict-set.
   Dit is **de bar die iter2 moet verslaan** (iter1 mat 37 % op 4 klassen; her-meet op 24).
2. **Genereer realistische positieven** met `build_synthetic_batch` / `synthesize_for_class` (8.7),
   voor de 24 verdict-klassen + een ruime selectie van de bredere guide-universe, op échte
   artwork-achtergronden. Persisteer naar MinIO (`synthetic/{code}/{seed}.png`) — reproduceerbaar (seed).
3. **Train de identieke iter1-kop** (bevroren backbone, supervised-contrastive) op deze positieven +
   class-agnostische negatieven (proposer-food-textuur). Géén kop/loss/LR-wijziging.
4. **Verdict:** top-1 rang op de bevroren 24-klasse verdict-set, macro + micro, vs stap-1-baseline.
   - **Go** (top-1 materieel > baseline, bv. ≥ +10pt macro): door naar AC1-meting (accept@0,75,
     precisie-behoud, wrong-top1-fractie) en richting versionering/activatie (AC3/AC4).
   - **No-go** (≤ baseline): data-realisme alléén ontoereikend → escaleer naar **backbone (deels)
     ontdooien** (iter1-stap 3) als aparte, duurdere sub-iteratie. Leg het negatief net zo schoon vast
     als iter1 (echt omlaag = falen, ongeacht de circulaire synthetische sanity-metriek).

## Gate vóór productie (ongewijzigd t.o.v. 12.2-besluit)

Géén A/B tegen de gedeployde embedding tot een **gemeten top-1-winst op de held-out échte crops**.
De circulaire synthetische sanity-metriek telt niet als bewijs (iter1-les). Pas bij een gemeten
echte-crop-winst volgen AC1–AC5 (versionering, rebuild-bij-activatie, drempel-hercalibratie).

## Risico's specifiek voor iter2

- **8.7-compositing blijft een schoon logo plakken** (scale/rotatie/HSV/blur), maar modelleert geen
  print-degradatie, occlusie of lage-contrast-over-drukke-verpakking → mogelijk een resterende
  synthetisch-echt-kloof. Als iter2 net-niet haalt, is dít de eerste verdachte (vóór ontdooien):
  verrijk de compositing (perspectief-warp, JPEG-blokken, gedeeltelijke occlusie, contrast-matching).
- **Verdict-set statistisch licht** (101 crops, 1–4/klasse voor 18 klassen) → een +10pt macro-sprong is
  betekenisvol, maar kleine deltas niet. 12.6-harvesting van de opgeschoonde queue verzwaart latere
  verdicts.
- **Klasse-imbalance in de synthese** (RECYCLABLE oververtegenwoordigd in echte data) → balanceer de
  synthese per klasse (8.7's `min_per_class`), niet de echte verdeling kopiëren.

## Hergebruik

`synthesis.compose_synthetic`/`build_synthetic_batch` (8.7, done), `spike_finetune_iter1.py` (kop/loss/
harnas — herbruik, alleen de data-loader wisselt), `spike_pipeline_eval.py goldset` (top-1 + accept),
Epic 9-trainings-infra. Verdict-set = de 101 `training_data`-crops met `crop_path` (MinIO).
