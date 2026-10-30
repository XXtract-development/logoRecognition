---
digest: D2-K2-retrieval-r1-1
dimensie: K2 — moderne retrieval-/embeddingnetwerken i.p.v. ImageNet-EfficientNet-B0
datum: 2026-10-18
bronnen_gelezen: 8 (Robotoff-benchmark, DINOv3 HF-kaart, DINOv3-paper HTML, SigLIP2 HF-kaart, PE-Core HF-kaart, nyris-benchmark overzicht + modelpagina, zoekresultaten licentie/CPU/OCR)
---

# D2 · K2 — Retrieval-embeddings (ronde 1)

## Claims

### Logo-specifiek (Open Food Facts / Robotoff)
- Robotoff vergeleek logo-embeddings op de val-split (≥5 items per klasse, recall@4): efficientnet_b0 cosinus micro 0,549 / macro 0,584; clip-vit-base-patch32 0,703 / 0,824; clip-vit-base-patch16 0,730 / 0,847; clip-vit-large-patch14 0,775 / 0,872 | https://openfoodfacts.github.io/robotoff/research/logo-detection/embedding-benchmark/ | Open Food Facts | geen datum (dataset-tag 2022-01-21; OUD) | geraadpleegd 2026-10-18 | hoog | performance
- Zelfde bron, kNN-labelvoorspelling (cosinus): efficientnet_b0 micro 0,784 / macro 0,810 tegen CLIP B/16 0,917 / 0,922 en CLIP L/14 0,943 / 0,942 | idem | Open Food Facts | idem | geraadpleegd 2026-10-18 | hoog | performance
- ImageNet-modellen (BEiT, DeiT, ResNet, grotere EfficientNets) scoren niet beter dan efficientnet_b0; grotere EfficientNet (b1–b4) is zelfs slechter | idem | Open Food Facts | idem | geraadpleegd 2026-10-18 | hoog | performance
- Robotoff noemt efficientnet-b0 (1280-dim) het model dat "currently used" wordt en CLIP een "very good candidate" als vervanger; de pagina zegt níet dat de overstap gemaakt is | idem | Open Food Facts | idem | geraadpleegd 2026-10-18 | middel (pagina oud; huidige productie niet bevestigd) | landschap
- Latentie (Tesla T4 GPU, per sample): efficientnet_b0 5,5 ms, CLIP B/32 3,1 ms, CLIP B/16 11,7 ms, CLIP L/14 56,7 ms; embeddingdim CLIP B 768, L 1024 | idem | Open Food Facts | idem | geraadpleegd 2026-10-18 | hoog | performance

### Instance-retrieval / fijnmazig (algemeen)
- DINOv3-paper, Oxford-Hard mAP (frozen, CLS-cosinus): DINOv3 S/16 49,5 · S+/16 50,0 · B/16 58,5 · L/16 63,1 tegen DINOv2 S/14 39,5 · B/14 51,0 · L/14 55,7 | https://arxiv.org/html/2508.10104 | Meta AI (arXiv) | 2025-08-13 (OUDER dan 6 mnd) | geraadpleegd 2026-10-18 | hoog | performance
- Zelfde tabel: PE-Core en SigLIP 2 op B/L-grootte halen Oxford-Hard slechts ~20–26 mAP; de kolomtoewijzing B/L is door het leesmodel afgeleid | idem | Meta AI | 2025-08-13 | geraadpleegd 2026-10-18 | middel | performance
- Op grootste schaal (Table 9): DINOv3 7B Oxford-H 60,7 / Paris-H 87,1 / Met 55,4; SigLIP 2 g/16 25,1 / 60,9 / 13,9; PE-Core G/14 32,7 / 68,9 / 10,6 — tekst-beeldmodellen zijn duidelijk zwakker op instance-retrieval | idem | Meta AI | 2025-08-13 | geraadpleegd 2026-10-18 | hoog (rijlabels afgeleid uit Table 8-volgorde, bevestigd door getallen in tekst) | performance
- Fijnmazige linear probe (Table 8, alleen grootste modellen): PE-Core G 94,5 · SigLIP 2 g 93,7 · DINOv3 7B 93,0 · DINOv2 g 92,6 (Fine-S, 12 datasets) — op classificatie met probe liggen ze dicht bij elkaar | idem | Meta AI | 2025-08-13 | geraadpleegd 2026-10-18 | hoog | performance
- nyris productzoek-benchmark (7 datasets, gem. R@1 / mAP@20): SigLIP2 SO400M (1152-dim, 384 px) 45,7 / 34,7; DINOv3 ViT-L/16 (224 px) 45,2 / 31,9; PE-Core L/14 (336 px) 44,3 / 33,3; DINOv2 Large 36,9 / 23,8; eigen GEM v6 65,8 / 56,2 | https://benchmark.nyris.io/models | nyris GmbH (belanghebbende, eigen model bovenaan) | 2026 (v0.11.0) | geraadpleegd 2026-10-18 | middel | performance
- Op product-instance-retrieval scoren SigLIP2, DINOv3 en PE-Core dus nagenoeg gelijk, en alle drie ruim boven DINOv2 | idem | nyris | 2026 | geraadpleegd 2026-10-18 | middel | landschap

### Zwakte voor letters/tekst
- Gecontroleerde studie: CLIP-getrainde encoder ~7,5 punt hoger dan DINO op OCR-VQA/TextVQA bij identieke pretraining; oorzaak taalsupervisie | https://arxiv.org/html/2510.11835v1 | Findings EMNLP 2025 | 2025-10 (OUDER dan 6 mnd) | geraadpleegd 2026-10-18 (alleen via zoeksamenvatting) | middel | performance
- Zelfde bron (zoeksamenvatting): TextVQA DINOv2-L ~12,7 vs CLIP-L ~37,3 vs SigLIP-SO400M ~42,1 — VLM-getallen, geen zuivere OCR | idem | idem | idem | geraadpleegd 2026-10-18 | laag | performance

### Versies en licenties
- DINOv3 ViT-S/16: 21,6M param, 384-dim; varianten S+/16 29M, B/16 86M (768), L/16 300M (1024), H+/16 840M, ConvNeXt T/S/B/L 29–198M; gedistilleerd uit 7B | https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m | Meta | 2025-08 | geraadpleegd 2026-10-18 | hoog | version
- DINOv3 valt onder eigen "DINOv3 License" (geen Apache), download achter contactgegevens-poort; commercieel gebruik toegestaan volgens secundaire bronnen, militair gebruik uitgesloten — niet in officiële tekst geverifieerd | https://ai.meta.com/resources/models-and-libraries/dinov3-license | Meta | 2025-08-14 | geraadpleegd 2026-10-18 | middel | licentie
- SigLIP2 (google/siglip2-base-patch16-384): Apache-2.0; ~0,4B param totaal (incl. teksttoren) | https://huggingface.co/google/siglip2-base-patch16-384 | Google | paper 2025-02-20 | geraadpleegd 2026-10-18 | hoog | licentie
- PE-Core: Apache-2.0; B/16 0,09B vision, 1024-dim, 224 px, IN-1k zero-shot 78,4; L/14 0,32B, 336 px, 83,5; G/14 1,88B, 448 px, 85,4 | https://huggingface.co/facebook/PE-Core-B16-224 | Meta | paper 2025-04-17 | geraadpleegd 2026-10-18 | hoog | licentie/version

### CPU-haalbaarheid
- ViT-B/16 (224, classificatie, geen DINO) ONNX Runtime CPU, batch 1, Apple arm64: FP32 92,5 ms, dynamische INT8 37,1 ms; top-1 op 100 beelden 83%→81% | https://darkweb007-ml-portfolio-suite.static.hf.space/05-edge-quantization-benchmark/web/index.html | particulier portfolio (HF Space) | onbekend | geraadpleegd 2026-10-18 (via zoeksamenvatting) | laag | performance
- CanViT-paper: DINOv3 ViT-B/16 121 ms en ViT-S/16 34,8 ms op CPU met 1 thread; 27,4 / 10,1 ms met 16 threads (niet-standaard tokenraster, runtime onbekend) | https://arxiv.org/pdf/2603.22570 | arXiv | 2026-03 | geraadpleegd 2026-10-18 (alleen zoeksnippet; PDF te groot) | laag | performance

## Leads
- Robotoff-repo/issues nagaan of OFF intussen naar CLIP of ander model is overgestapt (pagina is van ~2022).
- DINOv3-paper offset 200000+ lezen voor distilled-modellen op Met/AmsterTime en voor patch-feature-gedrag.
- nyris per-dataset resultaten (https://benchmark.nyris.io/) en ILIAS-benchmark (DINOv3-L R@1 48,0) voor recente instance-retrieval-cijfers.
- WACV 2023 "Image-text pre-training for logo recognition" (Hubenthal e.a.): tekst-beeld-pretraining helpt vooral tekstrijke logo's; +3,5% zero-shot R@1 op LogoDet-3K.
- SigLIP2 NaFlex-varianten (variabele resolutie, beeldverhouding behouden) zijn relevant voor 50–300 px uitsneden.

## Gezocht maar niet gevonden
- Geen 2025–2026-paper gevonden met CLIP/SigLIP2/DINOv3 head-to-head op LogoDet-3K, OpenLogo, FoodLogoDet-1500 of Logo-2K+.
- Geen benchmark gevonden voor fijnmazige varianten zoals Nutri-Score A/B/C of sterren-aantal; geen bewijs dat globale embeddings die scheiden.
- Geen echte CPU-meting voor SigLIP2-B/16 op 384/512 px of DINOv3 met ONNX/int8 in standaardinstelling.
- Geen officiële bevestiging van de DINOv3-licentievoorwaarden (alleen fragment en secundaire bronnen).
- Geen bewijs gevonden voor remedies (patch-reranking, lokale features) specifiek op logo's; niet gericht gezocht binnen budget.

## Top-2 om te meten
1. **SigLIP2 B/16 (384 px of NaFlex), Apache-2.0** — taalsupervisie leest letters beter dan DINO (Nutri-Score, "VEGAN"), het verwante CLIP verhoogde in OFF's logobenchmark recall@4 van 0,58 naar 0,85 macro, en het komt op product-retrieval ongeveer gelijk uit met DINOv3.
2. **DINOv3 ViT-S/16 of ViT-B/16 (eigen licentie, juridisch laten toetsen)** — veruit de sterkste instance-retrieval per parametergrootte (Oxford-H B/16 58,5 vs SigLIP2-B ~20), klein genoeg voor CPU, en het dekt vormverschillen (sterren, logo-varianten) waar tekst niet helpt.
