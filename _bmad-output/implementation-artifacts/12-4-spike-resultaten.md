# Story 12.4-spike — resultaten: localisator A vs B + gate-haalbaarheid

Datum 2026-06-13 · ACC ML-container (CPU) · read-only. Beslist de trap-1-richting op échte data.
Eval: 79 bevestigde keurmerk-crops (positief), dismissed_low_conf-ruis (makkelijke negatief),
en moderate-confidence open-queue-items 0,55–0,75 (**moeilijke** negatief — de tekst/tabellen die jij
in de queue ziet, ~85% niet-keurmerk).

## Resultaten

### Optie B — open-vocabulary detector (OWL-ViT)
- `google/owlvit-base-patch32`, tekst-prompts ("a certification label logo", "an eco-label symbol", …),
  op een echte queue-artwork (3152×4525).
- **Vol beeld: 0 detecties** (≥0,05). **Getild (800px tiles): 0 detecties** (≥0,10).
- **Conclusie: geen quick-win.** Kleine grafische marks verdwijnen na de interne 768px-resize; tekst-
  prompts matchen onze keurmerken niet. B zou tiling + image-conditioning + waarschijnlijk fine-tuning
  (OWLv2) vereisen — geen drop-in. Sluit aan op stap-0 (foundation-modellen scheiden grafische marks zwak).

### Gate-haalbaarheid — "keurmerk vs geen-keurmerk" (effb0 + logreg, 5-fold CV)
| trainingsset | ROC-AUC | lezing |
|---|---:|---|
| keurmerk vs **makkelijke** ruis (sub-0,50) | **0,998** | triviaal scheidbaar — maar niet representatief |
| **gate (makkelijk getraind) → scoren op moeilijke queue-items** | vangt **25%** | **faalt op de échte flood**: tekst/tabellen die 0,55–0,75 scoorden lijken op keurmerken in effb0-ruimte |
| keurmerk vs **moeilijke** negatieven (de queue-FP's) | **0,872** ±0,06 | **scheidbaar — mits op de échte negatieven getraind** (en dit ondanks ~15% labelruis; schoon ~0,90) |

## Conclusie & aanbeveling (data-gedreven)

1. **Optie B (open-vocab) is gedeprioriteerd** — geen quick-win voor onze fijnmazige grafische marks.
2. **De binaire keurmerk-gate is haalbaar en de juiste eerste leverbare**, MAAR met één harde eis:
   **trainen op de échte moeilijke negatieven** (de tekst/tabel/pictogram-regio's uit de queue), niet
   op makkelijke ruis. Dan haalt een simpele effb0+logreg-gate AUC ~0,87–0,90 → ruimt de queue-flood op.
3. **Optie A (getrainde detector) blijft de volledige structurele fix.** De gate werkt op crop-
   embeddings (geen ruimtelijke context); een getrainde detector ziet vorm/context en zou de
   tekst-vs-logo-scheiding nóg beter moeten doen. De **moeilijke negatieven die de gate nodig heeft, zíjn
   de hard-negative-trainingsdata voor de detector** — één oogst, twee gebruiken.

## Pad (herbevestigt het 12.4-plan)

1. **Oogst hard-negatives**: label een set queue-FP's als niet-keurmerk (visueel/steekproef). Dit is de
   gedeelde databron.
2. **Bouw de gate** (effb0 + logreg/MLP, getraind op keurmerk vs hard-negatives) → live als filter vóór
   de review-queue. **Directe queue-verlichting** + meet de echte FP-reductie.
3. **Bouw de detector (optie A)** met dezelfde hard-negatives + 8.7-synthese-positieven; vergelijk met
   de gate (de detector moet beter, want ruimtelijke context). A/B náást de klassieke proposer.

## Caveats (eerlijk)
- De moeilijke-negatief-set is **niet handmatig gelabeld** (~15% echte keurmerken erin) → de 0,872 is
  een ondergrens; schone labels verhogen 'm. Stap 1 (oogst) lost dit op.
- CPU-only; OWLv2/grotere open-vocab-modellen niet getest (B bleef bij base OWL-ViT). Als iemand B
  alsnog wil: image-conditioned (`image_guided_detection`) + OWLv2 + tiling, maar de prior is zwak.

## Reproductie
Scripts op de container (`/tmp/`): `owl_tiled.py` (B), `sep_probe.py` (makkelijk), `gate_hard.py`
(gate op moeilijke), `hard_cv.py` (keurmerk vs moeilijk). Positief/negatief-paden uit
`training_data` (active) resp. `artwork_review_items` (dismissed_low_conf / open 0,55–0,75).
