# Story 12.4 — getrainde detector (optie A): spike-resultaten (NEGATIEF)

Datum: 2026-06-15 · ACC ML-container (CPU) · Status: **3 attempts, geen haalt de AC's. Data is de bottleneck.**

## Kern (15-sec)

Een getrainde 1-klasse keurmerk-detector (torchvision FasterRCNN-MobileNet) is in 3 varianten getraind
op de beschikbare data (22 echte artworks/79 bboxen + 8.7-synthese + 212 hard-negs). **Geen enkele
variant haalt AC1 (FP<10%) én AC2 (recall≥80%).** De tiling-variant (de juiste fix voor kleine marks)
verdrievoudigde de recall (0,09→0,27) — wat de kleine-object-diagnose bevestigt — maar blijft ver onder
de bar en de hard-neg-FP liep op naar 0,69. **Bindende bottleneck = data (22 artworks is te weinig),
niet de architectuur.** Dit bevestigt de risico-vlag uit het beslisdocument ("data is de échte bottleneck:
78 crops").

## Meetresultaten (REAL-only val: 6 pos-artworks/11 bboxen + 16 hard-neg-artworks)

| variant | recall @IoU≥0,5 (AC2≥0,80) | hard-neg-FP-img (AC1<0,10) |
|---|---|---|
| klassieke proposer (baseline) | 0,82 (9/11) | 1,00 (16/16, ~65 box/beeld) |
| v1 — downscaled 1333px, synth-swamped (840 synth : 22 real) | 0,00 | 0,08 |
| v2 — rebalanced (real×12) | 0,09 (1/11) | 0,17 |
| **v3 — tiled 768px full-res** | **0,27 (3/11)** | **0,69 (11/16)** |

## Diagnose (evidence-based)

1. **Kleine marks**: echte keurmerken zijn 3–15% van de korte zijde (mediaan 5% → ~120px op 2500px-artwork).
   v1/v2 downscaleden naar 1333px → marks ~40–60px → MobileNet-FPN onderdetecteert (ndet vaak 0). Eén mark
   werd wél gelokaliseerd @IoU 0,73 (conf 0,21) → architectuur kán, maar onderkomt.
2. **Tiling werkt deels**: full-res 768px-tiles (marks 10–48% van tile) → recall 3× omhoog (0,09→0,27).
   Bewijst dat resolutie/scale de juiste hefboom was. Maar sliding-window = meer kansen op tekst/tabel-FP
   → FP-img 0,69. Netto nog steeds slechter dan de klassieke proposer.
3. **Data-schaarste (bindend)**: 22 echte positieve artworks / 79 bboxen → de detector generaliseert niet
   naar 6 ongeziene val-artworks. Synthese-echt-kloof: composites dekken echte keurmerk-verschijning
   onvoldoende. Honderden GS1-keurmerken vragen veel meer diverse echte gelabelde boxen.
4. **Compute**: CPU-only, ~11–17 min/epoch → iteratie pijnlijk traag; GPU nodig voor serieuze hyperparameter-
   /resolutie-sweeps.

## Conclusie

De **vorm** (localize→identify, class-agnostisch) blijft correct, en tiling is de juiste richting voor de
kleine marks. Maar met **22 echte artworks + CPU** haalt een getrainde detector de AC's niet — hij is zelfs
slechter dan de klassieke proposer. De getrainde detector is **niet inzetbaar nu**; de bottleneck is
**gelabelde data-volume + diversiteit** (precies de beslisdoc-vlag), secundair compute (GPU).

## Aanbeveling (data-flywheel eerst)

1. **Consolideer op gate-v2 + floor 0,85** als de werkende oplossing (74% queue-precisie, live). Zie
   [[12-4-gate-v2-resultaten]].
2. **Draai de data-motor**: laat de PO de schone gate-v2-queue labelen → groei de échte bbox-set van 79
   naar honderden, divers over GTINs/designs (RECYCLABLE-near-dup-les vermijden). De review→referentie-lus
   is de motor.
3. **Hertrain de tiled detector** zodra er ~enkele honderden diverse echte boxen zijn — bij voorkeur op GPU,
   evt. sterkere backbone (resnet50-fpn) + per-tile hard-negative-mining om de FP-img omlaag te halen.
4. **Niet** verder CPU-itereren op 22 artworks — de bottleneck is data, niet hyperparameters.

## Reproductie (container /tmp/, scripts)

- Dataset full-page: `build_det_ds.py` (synth scale 0,025–0,24, downscale 1333). Tiled: `build_tiles.py`
  (768px box-centered pos + hard-neg + synth-op-tile). Boxen: `det_boxes.json` (dump_boxes.js).
- Train: `train_det.py` (v1), `train_det2.py` (v2 rebalanced), `train_tiles.py` (v3, min_size 768).
- Eval: `eval_det.py` (full-page), `eval_tiles.py` (sliding-window + NMS). Val-split: `tiles/val_split.json`.
- Modellen in storage: `keurmerk-detector/det-v1.pt`, `det-v2.pt`, `det-tiles-v1.pt`.
