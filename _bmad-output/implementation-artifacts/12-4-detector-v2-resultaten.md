# Story 12.4 — detector v2 (tiled, uitgebreide data): resultaten

Datum: 2026-06-15 · ACC ML-container (CPU, getemperd) · Status: **beter dan v1, haalt AC's nog niet.
Data-hefboom bevestigd.**

## Kern (15-sec)

Na PO-labeling groeide de positieve set van 22 → **102 artworks / 214 boxen**. De tiled-detector hertraind
op die data: **recall 0,27 → 0,45** (eerlijke val van 49 boxen over 21 artworks, vs v1's 11 boxen over 6).
Dat bevestigt dat **data de bindende hefboom is** (recall klimt mee: 0 → 0,27 → 0,45 bij 0 → 22 → 102
artworks). Maar het haalt de AC's nog niet: AC2 (recall ≥0,80) en AC1 (hard-neg-FP <0,10) blijven onbereikt;
de FP-rate verslechterde zelfs (0,69 → 0,82). Pad: blijf data oogsten (nachtelijke harvester) en herzie de
detector bij veel meer data + GPU + per-tile hard-negative-mining tegen de FP-rate.

## Meetresultaten (REAL-only val: 21 pos-artworks/49 boxen + 17 hard-neg-artworks)

| variant | data (pos artworks/boxen) | recall @IoU≥0,5 (AC2≥0,80) | hard-neg-FP-img (AC1<0,10) |
|---|---|---|---|
| klassieke proposer | — | 0,82 | 1,00 (~65 box/beeld) |
| v1 — tiled | 22 / 79 | 0,27 (3/11) | 0,69 |
| **v2 — tiled** | **102 / 214** | **0,45 (22/49)** | 0,82 (14/17), ~3,5 box/beeld |

Trainingsverloop v2 gezond (loss 0,44 → 0,092 over 8 epochs, LR-drop @ epoch 6). Train-set 1753 tiles
(330 pos×3 + 763), getemperd op 4 cores zodat de live-API responsief bleef (geverifieerd 0,00s).

## Lezing (eerlijk)

1. **Data werkt** — recall steeg 1,7× puur door meer/diversere echte boxen (geen architectuurwijziging).
   De hypothese "data is de bottleneck" is daarmee kwantitatief bevestigd.
2. **Nog niet bruikbaar** — 0,45 recall mist meer dan de helft van de keurmerken; de detector is nog
   steeds slechter dan de klassieke proposer op recall.
3. **FP-rate verslechterde** (0,69 → 0,82): meer positieve trainingsdata maakte de detector gretiger →
   meer false positives op hard-neg-artworks. Per-detectie is hij wél precies (~3,5 box/beeld vs 65 bij
   de proposer), maar hij vuurt op de meeste hard-neg-artworks minstens één keer. Vraagt om expliciete
   **per-tile hard-negative-mining** (hard-neg-tiles zwaarder wegen / gate als suppressor in de detector-lus).
4. **Geen productie-impact**: `det-tiles-v2.pt` staat in storage maar is NIET in de live-pijplijn gehangen;
   de live-detectie draait nog op de klassieke proposer + gate-v2 (de werkende oplossing).

## Aanbeveling

- **Blijf data oogsten** via de nachtelijke server-side harvester (richting alle 1857 GTINs) — de recall-
  curve zegt dat dit het verschil maakt. Herhaal de meting bij bv. 300-500 artworks.
- **Bij volgende serieuze poging:** GPU (CPU maakt iteratie traag), sterkere backbone (resnet50-fpn), en
  per-tile hard-negative-mining om AC1 te halen.
- De tussenoplossing (gate-v2 + floor 0,85 + auto-harvest) blijft de werkende queue-leverancier.

## Reproductie
Data: `dump_boxes.js` → `/tmp/det_boxes.json` (214 pos/102 src, 221 neg/83 src). Tiles: `build_tiles.py`
(768px box-centered + synth, 1753 train tiles, val 21+17). Train: `train_tiles.py` (min_size 768, 8 ep,
OMP/MKL/torch=4). Eval: `eval_tiles.py` (sliding-window + NMS). Model: `keurmerk-detector/det-tiles-v2.pt`.
Bouwt op [[12-4-detector-spike-resultaten]].
