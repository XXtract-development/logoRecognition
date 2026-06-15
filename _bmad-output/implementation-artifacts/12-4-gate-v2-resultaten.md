# Story 12.4 — gate-v2 resultaten (de keurmerk-gate hertraind op échte hard-negatives)

Datum: 2026-06-14 · ACC ML-container (CPU) · Status: gate-v2 getraind, gepersisteerd, queue herbouwd.

## Kern (15-sec)

De live gate (gate-v1, "AUC 0,96") was getraind op **makkelijke ruis** — de spike waarschuwde al dat
zo'n gate **maar 25%** van de échte flood vangt. Dat verklaart waarom de her-assemblage (gate-v1, floor
0,7) nog steeds ~70% rommel toonde (merklogo's, font-spec-tekst, CMYK-swatches, pictogrammen).
**gate-v2** is hertraind op de **212 door de PO afgewezen** queue-items (clean hard-negatives) +
79 actieve keurmerk-crops → **5-fold ROC-AUC 0,8476** (eerlijke generalisatie). Met **floor 0,85**
levert dit een **bruikbare label-queue (~74% correct)**.

## Data (de doorbraak)

- **Positief:** 79 `training_data`-crops (active=true; de 26 RECYCLABLE near-dups bewust uitgesloten).
- **Hard-negatief (clean):** **212 PO-afgewezen** `artwork_review_items` (status=rejected). Dit is precies
  de set die de spike miste — de spike had alleen ruizige 0,55–0,75-proxies (~15% labelruis → AUC 0,872).
  De PO-afwijzingen zijn de "lijkt-op-keurmerk-maar-is-het-niet"-gevallen = de juiste hard-negatives.

## Training

- effb0-embedding (512-dim, L2-genormaliseerd) → `LogisticRegression(class_weight=balanced)`.
- 5-fold StratifiedKFold ROC-AUC: **0,8476** (folds: 0,82 / 0,93 / 0,84 / 0,79 / 0,86).
- Gepersisteerd als plain coef+intercept JSON: `keurmerk-gate/gate-v2.json` (versie gate-v2, l2_normalize=true).
- Serving-compatibel met `keurmerk_gate.py` (geen sklearn nodig bij inferentie).

## Queue-meting (53 bron-artworks, dezelfde set)

| Config | Kandidaten | Correct (visuele steekproef) |
|---|---:|---|
| gate-v1, floor 0,7 (de kapotte live-queue) | 110 | ~30% |
| gate-v2, floor 0,7 | 35 | ~49% |
| **gate-v2, floor 0,85** | **23** | **~74%** |

gate-v2 ruimde hele FP-klassen op: **CONFORMITE_EUROPEENNE 25→0** (CE-tekstblokken/"Sheep"),
**GREEN_DOT 6→0** ("20 min"-timer), **AISE 4→0**. De sterke-ref-codes overleefden (MSC, WEIDEMELK,
RAINFOREST, FSC, EU-organic).

## Eerlijke caveats

- **Optimistische queue-meting:** een deel van de 212 hard-negatives kwam van dezelfde 53 artworks →
  de gate "kent" die crops. De **onbevooroordeelde** generalisatie is de 5-fold **AUC 0,85**, niet de
  74%. Op nieuwe artworks ligt de precisie tussen die twee.
- **Resterende FPs bij 0,85:** distinctieve grafische pictogrammen die écht dicht bij een referentie
  embedden ("1xT"-rood→V-label, "RIJK AAN EIWITTEN"-badge→EU-organic, "indiPa"→V-vegan). De gate
  (crop-embedding, geen ruimtelijke context) kan die niet scheiden → **dit is precies waarvoor de
  getrainde detector (optie A) nodig is**.
- **BETER_LEVEN-referentie verdacht:** matcht font-spec-tekst/CMYK-swatches op 0,70–0,72 (net boven
  floor 0,7). Floor 0,85 verbergt dit; een schonere/diversere BETER_LEVEN-referentie zou het structureel
  oplossen.

## Live-status

- Queue herbouwd: 110 → **23** open 12.6-items (clear 110, insert 23, 0 failed). Live op
  `/artwork-review`.
- gate-v2 staat in storage maar de **live classificatie-pijplijn draait nog op gate-v1** (env
  `KEURMERK_GATE_KEY` ongewijzigd → vereist redeploy/herstart = bevestiging). De queue-herbouw gebruikte
  gate-v2 expliciet via env op de assembler-run.

## Vervolg (12.4-pad)

1. (optioneel, snel) `KEURMERK_GATE_KEY` default → gate-v2 in `keurmerk_gate.py`; deploy zodat óók de
   live-detectie de betere gate gebruikt.
2. (structureel) **Detector optie A** bouwen met dezelfde 212 hard-negatives + 8.7-synthese-positieven —
   ruimtelijke context lost de resterende pictogram-FPs op die de gate niet kan scheiden.
3. (data) Schonere/diversere BETER_LEVEN-referentie; meer bron-artworks oogsten voor een vollere queue.

## Reproductie

- Train: `/tmp/train_gate_v2.py` op ML-container (`PYTHONPATH=/app`), input `/tmp/gate_data.json`
  (dump via `dump_gate_data.js` in APP-container).
- Queue: `assemble_gated.py --floor 0.7` met `KEURMERK_GATE_KEY=keurmerk-gate/gate-v2.json`, daarna
  filter conf≥0,85 → `populate-review-queue-12-6.js`.
