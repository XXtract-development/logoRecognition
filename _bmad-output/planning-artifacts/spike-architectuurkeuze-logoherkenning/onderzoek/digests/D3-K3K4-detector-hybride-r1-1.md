---
digest: D3
dimensies: [K3, K4]
ronde: r1-1
geraadpleegd: 2026-10-18
tool-aanroepen: 18
---

# D3 — K3 eigen getraind model / K4 hybride

## Claims

### Open Food Facts / Robotoff (vraag 1)
- OFF `universal-logo-detector` op Hugging Face is een YOLOv8s-fine-tune (Ultralytics 8.3.223), 300 epochs, batch 64, imgsz 640; export ONNX + TensorRT | https://huggingface.co/openfoodfacts/universal-logo-detector | Open Food Facts | model bijgewerkt 2025-11-14 | geraadpleegd 2026-10-18 | hoog | version
- Die detector haalt mAP50 0,837 / recall 0,719 (PyTorch) en mAP50 0,811 / recall 0,68 (ONNX) | idem | Open Food Facts | 2025-11 | geraadpleegd 2026-10-18 | hoog | performance
- De licentie op de modelkaart is AGPL-3.0 (volgt uit Ultralytics) | idem | Open Food Facts | 2025-11 | geraadpleegd 2026-10-18 | hoog | licentie
- Trainingsdataset `openfoodfacts/universal-logo-detector` v1.4: 841 beelden (759 train / 82 val); in de preview is alleen klasse "object" zichtbaar, README leeg | https://huggingface.co/datasets/openfoodfacts/universal-logo-detector | Open Food Facts | 2025-11-12 | geraadpleegd 2026-10-18 | middel (klassenlijst niet volledig zichtbaar) | patroon
- Oudere opzet (blog 2023): detector met klassen "brand" en "label" → elke logo-uitsnede naar CLIP-vision-embedding (512-d) → HNSW-ANN in Elasticsearch, >90% overlap met exacte top-100, <100 ms per zoekactie, ±2,5 M logo's | https://blog.openfoodfacts.org/en/news/how-open-food-facts-uses-logos-to-get-information-on-food-products | OFF-blog | 2023-02-14 (OUD, >6 mnd) | geraadpleegd 2026-10-18 | middel | patroon
- Labelen gebeurt door mensen in Hunger Games; de blog zegt dat er toen géén automatische logo-categorisering in Robotoff zat | idem | OFF-blog | 2023-02-14 (OUD) | geraadpleegd 2026-10-18 | middel | patroon
- Nog oudere robotoff-ann gebruikte EfficientNet-embeddings; repo gearchiveerd omdat ANN nu in Elasticsearch draait | https://github.com/openfoodfacts/robotoff-ann | Open Food Facts | ongedateerd (OUD) | geraadpleegd 2026-10-18 | middel | patroon
- OFF heeft een eigen `clip-vit-base-patch32` op HF (bijgewerkt 2025-10-15), plus price-tag-detection/-classification modellen | https://huggingface.co/openfoodfacts | Open Food Facts | 2025 | geraadpleegd 2026-10-18 | middel | landschap
- robotoff-models (TF universal-logo-detector 1.0, tf-nutriscore 1.0, tf-nutrition-table 1.0) is gearchiveerd op 2025-10-21; OFF gebruikt "exclusively Hugging Face models" | https://github.com/openfoodfacts/robotoff-models | Open Food Facts | 2025-10-21 | geraadpleegd 2026-10-18 | hoog | version

### Datahoeveelheid (vraag 2)
- Ultralytics adviseert ≥1500 beelden en ≥10.000 instanties per klasse, 0–10% achtergrondbeelden tegen valse meldingen, en native/hogere resolutie bij kleine objecten | https://docs.ultralytics.com/yolov5/tutorials/tips_for_best_training_results/ | Ultralytics | ongedateerd | geraadpleegd 2026-10-18 | hoog (als advies) | performance
- RF100-VL (100 datasets): 10-shot YOLOv8n/s/m haalt slechts 20,1–21,1 mAP (23,4 met federated loss) tegen 54,9–56,4 bij volledige fine-tune; 10-shot GroundingDINO 33,3; zero-shot GroundingDINO 15,7; Gemini 2.5 Pro 13,3 zero-shot / 9,2 met voorbeelden; Qwen2.5-VL-72B 5,4/7,5 | https://arxiv.org/html/2505.20612v2 | Robicheaux e.a. (arXiv) | 2025-05 | geraadpleegd 2026-10-18 | hoog | performance
- Winnaar CVPR-2025 few-shot-challenge (RF20-VL) haalde 50,1 mAP, +16,8 boven 10-shot GroundingDINO | idem | arXiv | 2025 | geraadpleegd 2026-10-18 | hoog | performance
- NutriGreen: 10.472 beelden (Nutri-Score A–E 867–1250 per graad, V-label 870, BIO 2328); fine-tuned YOLOv5 "94,0% accuracy" (metriek niet gedefinieerd in de bron) | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11002244/ | Drole e.a., Frontiers in Nutrition | 2024-03 (OUD) | geraadpleegd 2026-10-18 | middel | performance
- RF-DETR op RF100-VL: Nano 57,7 / Small 60,2 / Medium 61,2 AP50:95 (alle drie Apache-2.0) | https://github.com/roboflow/rf-detr | Roboflow | 2026 (ICLR 2026) | geraadpleegd 2026-10-18 | hoog | performance

### Tegelen en CPU (vraag 3)
- SAHI: slicing bij inferentie +5,1 tot +6,8 AP; met slicing-fine-tune cumulatief +12,7 tot +14,5 AP (VisDrone/xView) | https://arxiv.org/abs/2202.06934v1 | Akyon e.a., ICIP 2022 | 2022 (OUD) | geraadpleegd 2026-10-18 | hoog | performance
- YOLO11 CPU-ONNX bij 640 px: n 56,1 ms, s 90,0 ms, m 183,2 ms per beeld; CPU-type niet vermeld; YOLO26 genoemd als nieuwer | https://docs.ultralytics.com/models/yolo11/ | Ultralytics | ongedateerd | geraadpleegd 2026-10-18 | middel (hardware onbekend) | performance
- INFERENCE (eigen rekensom, geen bron): 4000×20000 px met 20% overlap = 8×39 = 312 tegels bij 640 px of 4×20 = 80 tegels bij 1280 px; zonder overlap 224 resp. 64. Met YOLO11n ≈ 312×56 ms ≈ 17 s, YOLO11s ≈ 28 s per beeld per worker (niet gemeten) | — | — | — | — | laag | performance

### Licenties (vraag 4)
- Ultralytics: Enterprise License vereist voor "internal business tools", SaaS/API's en voor "custom-trained or fine-tuned YOLO models" in commerciële setting, "even if you" zelf vanaf nul traint; getrainde modellen vallen standaard onder AGPL-3.0 | https://www.ultralytics.com/license | Ultralytics | 2026 | geraadpleegd 2026-10-18 | hoog (als standpunt van de licentiegever, niet als juridische toets) | licentie
- YOLOE (THU-MIG) is AGPL-3.0; ondersteunt visuele prompts, linear probing en full tuning; geen few-shot- of CPU-cijfers | https://github.com/THU-MIG/yoloe | THU-MIG | 2025 | geraadpleegd 2026-10-18 | hoog | licentie
- YOLO-World is GPL-3.0 ("supported for commercial usage", aparte licentie via Tencent); V2.1 (2025-02) met image-prompt-gewichten | https://github.com/AILab-CVC/YOLO-World | Tencent AILab | 2025-02 | geraadpleegd 2026-10-18 | hoog | licentie
- RF-DETR: code Apache-2.0; detectiemodellen Nano/Small/Medium/Large Apache-2.0, Atto/Femto/Pico/XL/2XL onder PML 1.0 | https://github.com/roboflow/rf-detr | Roboflow | 2026 | geraadpleegd 2026-10-18 | hoog | licentie
- OWLv2 (HF-checkpoint) is Apache-2.0, kaart noemt het "research output"; image-guided detectie niet op die kaart beschreven | https://huggingface.co/google/owlv2-base-patch16-ensemble | Google | ongedateerd | geraadpleegd 2026-10-18 | middel | licentie
- Grounding DINO is Apache-2.0 (meerdere secundaire bronnen; officiële LICENSE niet zelf gelezen) | https://playground.roboflow.com/models/idea-research/grounding-dino | Roboflow (secundair) | 2023 | geraadpleegd 2026-10-18 | middel | licentie
- D-FINE Apache-2.0 alleen via een Gitee-spiegel gezien | https://gitee.com/ykuo/d-fine | spiegel (secundair) | ongedateerd | geraadpleegd 2026-10-18 | laag | licentie

## Leads
- OFF-modeloverzicht-spreadsheet (gelinkt vanaf https://openfoodfacts.github.io/robotoff/references/models/) — klassen en status per model.
- RF-DETR docs (rfdetr.roboflow.com): ONNX/OpenVINO-export en CPU-latency, minimale datasetgrootte.
- AGPL-3.0 §13 (netwerkgebruik) zelf lezen + juridische toets of puur interne inzet zonder externe gebruikers onder §13 valt; Ultralytics' standpunt is ruimer dan de licentietekst mogelijk eist.
- ASAHI (arXiv 2604.19233, 2026): adaptieve tegelgrootte tegen overbodige rekentijd.
- DCH-FSLogo (IET CV 2023): few-shot logo-detectie op LogoDet-3K-100/FoodLogoDet-1500-100.

## Gezocht maar niet gevonden
- Aantal voorbeelden per logo dat OFF nodig heeft om een nieuw logo toe te voegen; actuele (2025–2026) beschrijving van hun logo-pijplijn — docs-pagina's gaven 404.
- Een aparte Nutri-Score-YOLO van OFF in 2025–2026 (alleen gearchiveerd tf-nutriscore 1.0 gevonden).
- CPU-latency voor RT-DETR/RF-DETR/D-FINE en OpenVINO-cijfers; CPU-type achter de Ultralytics-tabel.
- Few-shot-cijfers voor YOLOE/OWLv2 met beeld-prompts op kleine logo's.
- Gemeten CPU-trainingstijd of uren per nieuw keurmerk (vraag 5): geen bron; alleen de afgeleide dat retraining volgens Ultralytics-advies (≥1500 beelden/klasse) ver boven de 20–86 eigen uitsneden ligt, terwijl een referentie toevoegen aan een embedding-index geen training vraagt (OFF-patroon).

## Aanbeveling (redenering, geen bron)
- K3-1: RF-DETR Nano/Small (Apache-2.0) als gesloten 15-klassen-detector op 640-tegels, met ingeplakte productie-uitsneden en negatieve tegels — omdat volledige fine-tune in RF100-VL ±2,5× beter is dan 10-shot, en de licentie geen AGPL-probleem geeft.
- K3-2: generieke 1-klasse logodetector (OFF-patroon, eigen fine-tune) met een crop-classifier op de 870 uitsneden erachter — omdat de bestaande data al uit uitsneden bestaat en één klasse "logo" veel minder vakjes per soort vraagt.
- K4-1: generieke logodetector + embedding-kNN (CLIP-achtig, HNSW) voor de lange staart, met de gesloten classifier voor de top 15 — dit is aantoonbaar het OFF-patroon (detector → embedding → ANN → mens labelt) en een nieuw keurmerk kost dan referenties, geen retraining.
