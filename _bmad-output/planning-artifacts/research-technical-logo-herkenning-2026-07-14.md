---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/implementation-artifacts/12-21-spike-nutriscore-herkenningsmechanisme.md
workflowType: 'research'
research_type: 'technical'
research_topic: 'Betrouwbare Nutri-Score-letterherkenning + verbeterde classificatie-laag voor keurmerk-logo-herkenning'
research_goals: 'Beste concrete oplossing voor Nutri-Score-letters bepalen; bredere upgrade van de embedding/matching-laag onderzoeken; incrementeel migratiepad zonder infra-herbouw'
user_name: 'Friso'
date: '2026-07-14'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Datum:** 2026-07-14
**Auteur:** Mary (BMAD Business Analyst) voor Friso
**Research Type:** technical

---

## Research Overview

Dit onderzoek beantwoordt de vraag welke techniek het Nutri-Score-letterherkenningsprobleem betrouwbaar oplost en tegelijk — idealiter — de hele classificatie-laag van de keurmerk-herkenning naar een hoger niveau tilt, zónder de bestaande infrastructuur (region-proposer, review-UI, referentie-opslag/pgvector, vliegwiel, n8n-kruischeck) te herbouwen. Grondwaarheid is de spike 12.21 (2026-07-14): open letterherkenning 1/6 juist, kruischeck-similarities 0,24–0,59 onder de vloer, same-letter-cosine structureel ~0,3 — de generieke efficientnet_b0-embedding kan de vijf visueel bijna identieke Nutri-Score-varianten niet scheiden, en méér referenties lossen dat niet op.

De kernbevindingen: (1) het Nutri-Score-probleem is elders al betrouwbaar opgelost — een YOLOv5-model getraind op de publieke NutriGreen-dataset (~5.200 geannoteerde beelden, CC-BY-SA) haalt 96–100% per letterklasse, en een deterministische route (balk-ankerdetectie + uitvergroot-vakje-geometrie + OCR-bevestiging) is als nul-training-optie beschikbaar; (2) voor de brede laag is er direct overdraagbaar bewijs van Open Food Facts/Robotoff — een architectuur die vrijwel 1-op-1 gelijk is aan de onze (logo-detector → embedding → ANN → menselijke validatie) — dat het vervangen van precies hetzelfde efficientnet_b0 door een CLIP-klasse encoder de retrieval-recall met ~20+ punten verhoogt op food-packaging-logo's; (3) vision-LLM's zijn bij de huidige prijzen ($0,0003–0,002 per beeld) een spotgoedkoop verificatie-orakel voor 100–200 checks/dag en zelfs voor 39k-bulk, maar horen als vangnet/arbiter in de architectuur, niet als primaire laag.

Het volledige advies met gerangschikte opties, effort-inschattingen, risico's en het migratiepad staat in secties 6–8; de eerstvolgende toetsbare stap (offline validatie op de bestaande held-out set, 1–2 dagen) in sectie 8.4.

---

## Inhoudsopgave

1. [Onderzoeksvraag, methode en grondwaarheid](#1-onderzoeksvraag-methode-en-grondwaarheid)
2. [Waarom de huidige aanpak faalt (diagnose-synthese)](#2-waarom-de-huidige-aanpak-faalt-diagnose-synthese)
3. [Deel A — Oplossingen voor Nutri-Score-letterherkenning](#3-deel-a--oplossingen-voor-nutri-score-letterherkenning)
4. [Deel B — De bredere classificatie-laag (alle ~900 codes)](#4-deel-b--de-bredere-classificatie-laag-alle-900-codes)
5. [Deel C — Vision-LLM's als classificatie- of verificatie-orakel](#5-deel-c--vision-llms-als-classificatie--of-verificatie-orakel)
6. [Advies: gerangschikte opties](#6-advies-gerangschikte-opties)
7. [Migratiepad (incrementeel, infra-behoudend)](#7-migratiepad-incrementeel-infra-behoudend)
8. [Risico's, effort en eerstvolgende toetsbare stap](#8-risicos-effort-en-eerstvolgende-toetsbare-stap)
9. [Bronnen](#9-bronnen)

---

## 1. Onderzoeksvraag, methode en grondwaarheid

**Vraag:** Welke techniek/architectuur lost het Nutri-Score-letterherkenningsprobleem betrouwbaar op, en is idealiter breder toepasbaar als verbeterde leer-/detectie-laag voor álle keurmerk-logo's — zonder de bestaande infrastructuur opnieuw te bouwen?

**Methode:** web-onderzoek (juli 2026) naar (a) bestaande Nutri-Score-herkenningsoplossingen en datasets, (b) OCR-engines op CPU voor kleine crops, (c) moderne embedding-modellen voor fijn onderscheid (CLIP/SigLIP2/DINOv3/metric-learning), (d) vision-LLM-kosten en CPU-haalbaarheid van lokale VLM's — gecombineerd met de gemeten grondwaarheid uit spike 12.21 en de eerdere spikes (12.11 synthetisch NO-GO, 12.4 detector-spike, 12.3 real-ref pivot, flywheel-recall-onderzoek).

**Grondwaarheid (12.21, held-out, 6 C/D-producten):**
- Open letterherkenning: 1/6 juist; scores 0,29–0,53 (live-vloer 0,75).
- Kruischeck tegen gedeclareerde letter: sim 0,24–0,59, grotendeels onder de vloer 0,6; 1 GTIN vindt niets.
- Letters verwarren naar A; same-letter-cosine structureel ~0,3.
- Coverage is NIET het knelpunt (A11/B4/C11/D11/E8 actieve refs, alle met embedding).

**Aannames (autonoom gedocumenteerd, geen gebruikersvragen):**
- De interim-stance blijft staan: n8n-kruischeck vertrouwt de GDSN-declaratie voor de letter; dit onderzoek richt zich op de structurele oplossing.
- "CPU-only" betekent: geen GPU beschikbaar; zware batch-runs 's nachts met OMP/MKL=3; live-pad moet per crop in orde van honderden ms blijven.
- De region-proposer levert bruikbare crops aan (recall 0,82 klassiek); de zwakke plek is uitsluitend classificatie/matching.

---

## 2. Waarom de huidige aanpak faalt (diagnose-synthese)

De generieke ImageNet-getrainde efficientnet_b0-embedding meet **globale visuele gelijkenis**. Nutri-Score-varianten delen ±95% van hun pixels (zelfde 5-kleurenbalk, zelfde lay-out); het onderscheid zit in één lokaal kenmerk: welk vakje/welke letter is uitvergroot. Cosine-similariteit op een globale embedding kan dat lokale signaal niet isoleren — vandaar same-letter-sim ~0,3 én cross-letter-verwarring. Dit is geen data-probleem (meer refs helpt aantoonbaar niet, 12.21) en geen trainings-probleem van de bestaande architectuur (synthetische augmentatie NO-GO, 12.11), maar een **architectuur-mismatch**: fijn categorisch onderscheid binnen een gestandaardiseerde logo-familie vraagt een classifier of een deterministische lezer, geen open-set-similarity.

Dat dezelfde conclusie extern is getrokken, is goed gedocumenteerd: Open Food Facts draait al jaren een pipeline die structureel identiek is aan de onze — universal-logo-detector → CLIP-embedding → HNSW nearest-neighbor → menselijke validatie ([Robotoff logo-ANN](https://openfoodfacts.github.io/robotoff/references/logos-ANN/)) — maar behandelt **Nutri-Score apart** met een purpose-built objectdetectiemodel met de vijf letters als aparte klassen (historisch Faster-RCNN ResNet-101, [robotoff-models](https://github.com/openfoodfacts/robotoff-models)), níét via de generieke embedding-route. Het patroon "generieke embedding voor open-set logo's + specifieke koppen voor gestandaardiseerde families" is dus een gevalideerd industriepatroon, geen work-around.

---

## 3. Deel A — Oplossingen voor Nutri-Score-letterherkenning

### 3.1 Optie A1 — Deterministische balk-detector + uitvergroot-vakje-lezer (spike-blauwdruk 12.21)

**Wat:** (1) detecteer de 5-vaks kleurenbalk via kleursegmentatie/ankerdetectie op de al-geproposede crop — de gradiënt donkergroen→lichtgroen→geel→oranje→rood in vaste volgorde is een uniek, gestandaardiseerd signaal dat met HSV-drempels + connected components of een 1-D kleurprofiel-scan betrouwbaar te vinden is; (2) bepaal **geometrisch** welk vakje uitvergroot is (hoogste/breedste kolom in het balkprofiel) → deterministische 5-klasse-uitkomst; (3) bevestig optioneel met OCR van de grote letter.

**Sterk:** nul training, volledig verklaarbaar, microseconden-tot-ms CPU-kosten, precies gericht op de faalmodus (aanwezigheid = balk gevonden; letter = geometrie). Werkt op vector-scherpe artwork-renders (PDF→PNG) — schoner beeldmateriaal dan de consumentenfoto's waar OFF mee werkt.

**Zwak:** handgeschreven regels zijn gevoelig voor rand-gevallen — monochrome/diapositieve drukvarianten van het logo (komen op verpakkingen voor), extreem kleine weergaves, afwijkende achtergrondkleuren die HSV-segmentatie vervuilen, en 90°-gedraaide plaatsing. Elke rand-case is wel deterministisch debugbaar.

**OCR-keuze voor stap (3):** voor één enkele, grote, bekende glyph (A–E, wit op gekleurd vakje) is volwaardige OCR overkill en zelfs fragiel; Tesseract in single-character-modus (PSM 10) met whitelist "ABCDE" is gratis en op CPU ~ms-werk, maar Tesseract presteert wisselend op los stylized lettertype. PaddleOCR (PP-OCRv5, ~15 MB totaal) is de accuraatste CPU-vriendelijke optie (confidence 0,93 vs 0,89 Tesseract / 0,85 EasyOCR in 2025-benchmarks; [CodeSOTA-benchmark](https://www.codesota.com/ocr/paddleocr-vs-tesseract), [TildAlice-benchmark](https://tildalice.io/ocr-tesseract-easyocr-paddleocr-benchmark/)); EasyOCR is 200+ MB en traag; TrOCR is een transformer die op CPU onnodig zwaar is voor 1 glyph. Advies: geometrie is primair, OCR alleen als bevestiging — en dan Tesseract-PSM10-whitelist eerst proberen (0 extra dependencies-gewicht), PaddleOCR als die tegenvalt.

**Verwachte nauwkeurigheid:** op schone artwork-crops realistisch ≥95% voor kleurenvariant; monochrome varianten vereisen een aparte (vorm-gebaseerde) tak of vallen door naar optie A2.

**Effort:** 2–4 dagen bouw-spike (incl. offline validatie), +2–3 dagen integratie.

### 3.2 Optie A2 — Klein 5-klasse-model, getraind op de publieke NutriGreen-dataset (aanbevolen als structurele oplossing)

**Wat:** een lichte CNN-classifier (of nano-detector) met klassen NUTRISCORE_A..E (+ "geen"), getraind op de **NutriGreen-dataset**: ~5.200 geannoteerde Nutri-Score-beelden (A:1.250, B:1.107, C:867, D:1.001, E:967), CC-BY-SA, downloadbaar via [Zenodo](https://zenodo.org/records/8374047) ([NutriGreen-paper, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11002244/)). In het paper haalt YOLOv5x per letterklasse **96–100% detectie** (A 96, B 99, C 100, D 100, E 99) — het bestaansbewijs dat dit probleem met een getraind model betrouwbaar oplosbaar is.

**Waarom dit de eerdere detector-NO-GO níét herhaalt:** de 12.4-detector-spike faalde op data (22 artworks). NutriGreen levert precies de ontbrekende trainingsdata — publiek, gelabeld, vijf gebalanceerde klassen — aangevuld met de eigen 45 actieve Nutri-Score-refs + review-bevestigde crops. Bovendien is de taak hier veel kleiner dan in 12.4: géén full-page-detectie (de region-proposer + keurmerk-gate doen dat al met recall 0,82), alleen **classificatie van een aangeleverde crop** in 6 klassen. Een MobileNetV3-small- of EfficientNet-B0-classifier met 6-klasse-kop is <10 M parameters, traint in uren op CPU/Colab en doet inference in enkele tientallen ms op CPU.

**Sterk:** robuust tegen precies de varianten waar A1 kwetsbaar is (monochroom, kleine weergave, rotatie, rommelige achtergrond — NutriGreen bevat echte-wereld-foto's, dus het model generaliseert conservatief gezien ruimer dan nodig voor schone artwork); zelfde patroon later herbruikbaar voor andere gestandaardiseerde families (GHS, recycling-varianten).

**Zwak/risico:** domain gap (NutriGreen = productfoto's, wij = artwork-renders) — mitigeerbaar door de eigen refs/crops mee te trainen en op de held-out set te valideren; CC-BY-SA op de dataset (share-alike geldt voor de data; voor gewichten van een daarop getraind model is de juridische status grijs — intern gebruik is onomstreden, maar leg dit vast); klein onderhoudspad (model-versie, her-training bij nieuwe logo-varianten).

**Effort:** 3–5 dagen (data-prep + training + offline validatie), +2–3 dagen integratie.

### 3.3 Optie A3 — Vision-LLM per crop

De crop (of het hele artwork) naar een vision-LLM sturen met de vraag "welke Nutri-Score-letter?". Qwen-VL-klasse: ~$0,0003/beeld; GPT-4o-klasse: ~$0,002/beeld ([OpenRouter Qwen2.5-VL](https://openrouter.ai/qwen/qwen2.5-vl-72b-instruct), [TokenMix vision-API-vergelijking](https://tokenmix.ai/blog/vision-api-comparison)). Voor deze bounded taak (5 letters, gestandaardiseerd logo) zijn moderne VLM's naar verwachting zeer accuraat. Nadelen: externe afhankelijkheid en klant-artwork naar een derde partij (privacy/contractueel afwegen), latency 1–5 s per call, en het lost niets structureels op in de eigen laag. Lokaal draaien (Qwen2.5-VL-3B/SmolVLM2 via llama.cpp, Q4) kan op CPU maar kost seconden per beeld en levert lagere betrouwbaarheid dan de API-klasse ([HF SmolVLM](https://huggingface.co/blog/smolvlm), [Roboflow lokale VLM's](https://blog.roboflow.com/local-vision-language-models/)). **Positie: prima als verificatie-orakel of tijdelijke lapmiddel, niet als primaire herkenner** — zie Deel C.

### 3.4 Optie A4 — Template matching op de gestandaardiseerde vorm

Multi-schaal template matching (OpenCV `matchTemplate`) tegen de 5 officiële logo-varianten. Op schone artwork verleidelijk, maar eerder in dit project al bewezen niet schaalbaar en fragiel bij schaal/rotatie/kleurprofiel-variatie ([[project_keurmerk_dekking_strategie]]: "template-match schaalt niet"). De deterministische balk-lezer (A1) is de slimmere vorm van hetzelfde idee — hij matcht op het kleur-ánker in plaats van op pixels. Niet als zelfstandige optie aanbevolen.

### 3.5 Vergelijking Deel A

| Optie | Verwachte accuratesse (letter) | CPU/latency | Effort | Onderhoud | Risico |
|---|---|---|---|---|---|
| **A1 balk-geometrie (+OCR-check)** | hoog op kleurenvariant (≥95%), zwak op monochroom | ~ms | 4–7 d totaal | laag (regels) | rand-cases drukvarianten |
| **A2 klein 5-klasse-model (NutriGreen)** | 96–100% bewezen haalbaar in vergelijkbare setting | tientallen ms | 5–8 d totaal | klein (model-versie) | domain gap, CC-BY-SA-grijszone |
| A3 vision-LLM | zeer hoog (verwacht) | 1–5 s + extern | 1–2 d | vendor-afhankelijk | privacy, dependency |
| A4 template matching | onvoldoende robuust | ~ms | 2–3 d | hoog | reeds intern gefalsifieerd |

**Advies Deel A: A1 en A2 zijn complementair — start met A1 als bouw-spike (laagste effort, valideert de blauwdruk uit 12.21), en laat A2 klaarstaan als structurele opvolger of vangnet voor de varianten waar A1 doorheen valt.** De praktische combinatie: A1's balk-detectie als aanwezigheids-check + A2's classifier voor de letter is de meest robuuste eindvorm; de offline validatie (sectie 8.4) wijst uit of A1 alleen al volstaat.

---

## 4. Deel B — De bredere classificatie-laag (alle ~900 codes)

### 4.1 Het sterkste bewijs: Robotoff's embedding-benchmark op exact ons probleem

Open Food Facts benchmarkte embedding-modellen voor **food-packaging-logo-classificatie via nearest-neighbor** — met **efficientnet_b0 als vertrekpunt, net als bij ons**. Resultaat ([Robotoff embedding-benchmark](https://openfoodfacts.github.io/robotoff/research/logo-detection/embedding-benchmark/)):

| Model | micro-recall@4 | macro-recall@4 |
|---|---|---|
| efficientnet-b0 (huidig, L2) | 0,542 | — |
| clip-vit-base-patch16 | 0,730 | 0,843 |
| clip-vit-large-patch14 | 0,771 | 0,876 |

**+19 tot +23 punten recall door alléén het embedding-model te vervangen**, zonder eigen training, op hetzelfde domein (logo-crops van voedselverpakkingen) en in dezelfde architectuur (detector → embedding → ANN → mens). Dit is het meest directe externe bewijs dat er voor dit project bestaat, en het spoort met het interne flywheel-recall-onderzoek (bootstrap-recall efficientnet ~20–28% te laag). OFF koos productiematig voor clip-vit-base-patch32 ([logo-ANN-referentie](https://openfoodfacts.github.io/robotoff/references/logos-ANN/)).

### 4.2 Kandidaat-modellen en CPU-haalbaarheid

| Model | Params | Emb-dim | Licentie | CPU-inschatting per crop* | Opmerking |
|---|---|---|---|---|---|
| CLIP ViT-B/32 | 88 M | 512 | MIT | ~40–100 ms (ONNX), 2–4× sneller int8 | bewezen op logo's (OFF-productie); ONNX-exports beschikbaar ([Qdrant/clip-ViT-B-32-vision](https://huggingface.co/Qdrant/clip-ViT-B-32-vision)) |
| CLIP ViT-B/16 | 86 M | 512 | MIT | ~100–200 ms | beste balans in OFF-benchmark |
| SigLIP 2 ViT-B/16 | 86 M | 768 | Apache-2.0 | vergelijkbaar met ViT-B/16 | nieuwere generatie, sterker dan CLIP op retrieval; ONNX opset 17 ([HF SigLIP2](https://huggingface.co/docs/transformers/model_doc/siglip2), [paper](https://arxiv.org/pdf/2502.14786)) |
| DINOv3 ViT-S/16 | 21,6 M | 384 | DINOv3-licentie (niet OSI) | snelste ViT-optie; 8 ms op A10-GPU → orde tientallen ms CPU | zelf-supervised, sterk op puur-visuele similarity ([HF dinov3-vits16](https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m), [Lightly-analyse](https://www.lightly.ai/blog/dinov3)) |
| Unicom (ArcFace-stijl retrieval) | var. | var. | MIT | vergelijkbaar ViT-B | universeel retrieval-getraind; interessant maar minder gevalideerd op logo's ([Unicom-paper](https://www.researchgate.net/publication/369975333_Unicom_Universal_and_Compact_Representation_Learning_for_Image_Retrieval)) |

\* CPU-latencies zijn indicatief (afhankelijk van host/threads); publieke CPU-benchmarks per model ontbreken — de offline validatie (8.4) meet dit op de eigen host. Kwantisatie (int8/dynamic, ONNX Runtime) levert doorgaans 2–4× versnelling bij minimale kwaliteitsverliezen ([Nixiesearch-kwantisatie](https://medium.com/nixiesearch/how-to-compute-llm-embeddings-3x-faster-with-model-quantization-25523d9b4ce5)).

Voor CLIP vs DINO op fijn onderscheid is de literatuur genuanceerd: DINO-familie is sterker op puur-visuele/pixel-niveau-gelijkenis, CLIP op semantisch onderscheid; voor logo-identiteit (vorm+kleur+tekst) presteert CLIP in de praktijk uitstekend en is het de enige met een directe logo-benchmark-validatie ([CLIP vs DINOv2 retrieval-vergelijking](https://ai.gopubby.com/clip-vs-dinov2-which-one-is-better-for-image-retrieval-d68c03f51f0d), [Medium-analyse](https://medium.com/aimonks/clip-vs-dinov2-in-image-similarity-6fa5aa7ed8c6)).

**Advies: SigLIP 2 ViT-B/16 als eerste kandidaat, CLIP ViT-B/16 als bewezen-veilige tweede, DINOv3 ViT-S/16 als snelheids-alternatief — alle drie in de offline shoot-out op de eigen refs + held-out set meenemen (goedkoop: ~130 refs re-embedden is minuten-werk).**

### 4.3 Wat een beter embedding-model WEL en NIET oplost

**Wel:** hogere bootstrap-recall (het gemeten 20–28%-probleem), betrouwbaardere open-set-matching over de ~900-code-universe, hogere kruischeck-similarities voor visueel onderscheidbare keurmerken, minder valse A-defaults. De hele vliegwiel-economie verbetert: betere kandidaten → snellere review → snellere referentie-groei.

**Niet:** fijn categorisch onderscheid bínnen gestandaardiseerde families die alleen in een detail verschillen (Nutri-Score-letters; GHS-pictogram-varianten; recycling-code-cijfers). Ook CLIP-large scheidt "95%-identieke" varianten niet betrouwbaar op cosine. Daarvoor is het patroon uit Deel A nodig: **per-familie fine-grained heads**.

### 4.4 Architectuurpatroon: gedeelde embedding + per-familie heads

De doel-architectuur (bestaande pipeline, twee chirurgische ingrepen):

```
propose_regions → keurmerk-gate → embedding (NIEUW model, zelfde interface)
    → pgvector nearest-reference  → familie-router:
         ├─ gewone code           → bestaand pad (drempels → review → vliegwiel)
         └─ fine-grained familie  → familie-head (Nutri-Score-lezer, later GHS, …)
                                     → code mét variant → zelfde review/vliegwiel
```

- De **familie-router** is triviaal: als de nearest-reference-familie (bv. een van NUTRISCORE_*) een geregistreerde head heeft, beslist de head de variant; de embedding hoeft alleen nog "dit is familie Nutri-Score" te kunnen zeggen (presence), wat een veel lichtere eis is dan letter-onderscheid. A1's balk-detector kan de presence-check zelfs embedding-onafhankelijk maken.
- Heads alleen bouwen **waar bewezen nodig** (Nutri-Score nu; kandidaten daarna op basis van review-verwarrings-statistieken).
- Review-UI, referentie-opslag, vliegwiel en n8n-contract blijven ongewijzigd: een head levert gewoon een code + confidence op dezelfde plek in de flow.
- De keurmerk-gate (logistic head op embedding) moet bij een nieuw embedding-model **opnieuw getraind** worden op de bestaande gelabelde data (positieven + 212 PO-rejected hard-negatives) — dat is een uur werk met de bestaande gate-v2-tooling, geen nieuw onderzoek.

### 4.5 Few-shot/metric-learning met de bestaande referentie-DB

Pgvector blijft de index. Twee goedkope verbeteringen bovenop het nieuwe model:
1. **Prototype-matching per code** (gemiddelde van de refs per code als extra "prototype-embedding") naast instance-matching — dempt uitschieters bij codes met veel refs; klassiek prototypical-networks-idee, implementeerbaar als één extra rij per code.
2. **Optionele lichte metric-fine-tune later** (ArcFace/triplet op de eigen review-bevestigde crops) — pas overwegen als de off-the-shelf-winst plafonneert; het eerdere interne besluit "geen embedding-fine-tuning" blijft geldig totdat er duizenden bevestigde crops zijn (het 12.3-inzicht: het knelpunt was de referentie-kwaliteit, niet trainbaarheid).

---

## 5. Deel C — Vision-LLM's als classificatie- of verificatie-orakel

**Kosten (2026-tarieven):** Qwen-VL-klasse ~$0,0003/beeld; GPT-4o/Claude-klasse ~$0,002/beeld ([TokenMix-vergelijking](https://tokenmix.ai/blog/vision-api-comparison), [OpenRouter](https://openrouter.ai/qwen/qwen2.5-vl-72b-instruct), [OpenAI-pricing](https://developers.openai.com/api/docs/pricing)).
- n8n-kruischeck 100–200/dag: **$0,03–0,40/dag** — verwaarloosbaar.
- Bulk 39k (eenmalig): **~$12 (Qwen-klasse) tot ~$78 (GPT-4o-klasse)** — verwaarloosbaar t.o.v. de nachtelijke CPU-rekentijd die het vervangt.

**Latency:** 1–5 s per call — prima voor n8n-checks en review-triage, niet voor het inline live-pad.

**Privacy/contractueel:** klant-artwork gaat naar een externe API. Mitigaties: alleen de kleine crop sturen (niet het volledige artwork), een provider met zero-data-retention-optie kiezen, en dit expliciet als beleidsbeslissing voorleggen. Lokaal alternatief (Qwen2.5-VL-3B/SmolVLM2, Q4, llama.cpp) is functioneel mogelijk maar op een gedeelde CPU-host te traag en te wisselvallig voor productie ([HF VLM-overzicht 2025](https://huggingface.co/blog/vlms-2025), [SmolVLM](https://huggingface.co/blog/smolvlm)).

**Juiste rol in deze architectuur — arbiter, geen laag:**
1. **Low-confidence-arbiter vóór review:** als de similarity in de grijze zone valt (bv. 0,6–0,75), vraag het VLM "welk keurmerk is dit?" en toon het antwoord als hint in de review-UI → sneller menselijk oordeel, geen autonomie-risico.
2. **Steekproef-verificatie van de kruischeck** (bv. 5% van de n8n-checks) → onafhankelijke kwaliteitsmeting van de eigen laag.
3. **Bootstrap-labeler voor nieuwe codes zonder refs** → versnelt het vliegwiel aan de koude kant.

Primaire classificatie via VLM wordt afgeraden: het maakt de kernfunctie vendor-afhankelijk, on-verifieerbaar versioneerbaar, en lost de eigen laag niet op — terwijl de eigen laag met Deel A+B aantoonbaar op niveau te brengen is.

---

## 6. Advies: gerangschikte opties

**Rang 1 — Nutri-Score-familie-head bouwen (Deel A: A1-spike, A2 als structurele opvolger/vangnet).**
Motivatie: pakt de acute, gemeten faalmodus (1/6) direct aan; extern bewezen oplosbaar op 96–100%-niveau (NutriGreen/YOLOv5, Robotoff-precedent); klein, offline toetsbaar, raakt geen bestaand contract. Effort: bouw-spike 2–4 d (A1) → integratie 2–3 d; A2 daarbovenop 3–5 d indien nodig.

**Rang 2 — Embedding-model vervangen (Deel B: SigLIP2-B/16 / CLIP-B/16 / DINOv3-S shoot-out, dan cutover via schaduwdraaien).**
Motivatie: +19–23 punten recall extern bewezen op exact onze architectuur en ons vertrekmodel; tilt álle ~900 codes, de gate, de kruischeck én het vliegwiel tegelijk; re-embedden van ~130 refs is triviaal. Effort: offline shoot-out 2–3 d; schaduwfase + herkalibratie + cutover 1–2 weken doorlooptijd (rekenwerk 's nachts).

**Rang 3 — Vision-LLM als arbiter/verificatie (Deel C), niet als primaire laag.**
Motivatie: bij $0,03–0,40/dag een spotgoedkope kwaliteitsversterker voor review-triage en kruischeck-steekproeven; vereist wél een expliciete privacy/beleidskeuze over crops naar een externe API. Effort: 1–2 d per integratiepunt.

Expliciet afgeraden: template matching als zelfstandige oplossing (A4, intern gefalsifieerd), embedding-fine-tuning nu (12.11/12.3-lessen), en een volledige detector-herbouw (12.4-les; de klassieke proposer blijft met recall 0,82 de beste eerste trap).

---

## 7. Migratiepad (incrementeel, infra-behoudend)

**Fase 0 — Offline validatie (nu, 1–2 dagen, geen productie-impact):** zie 8.4.

**Fase 1 — Nutri-Score-head (week 1–2):**
- Bouw A1 (balk-detector + geometrie-lezer) als losse module in de ml-service (`app/`, conform de queue-harvester-les: alleen `app/` wordt in Docker gekopieerd).
- Familie-router-hook: als de gate + (balk-detector óf nearest-ref-familie) "Nutri-Score" zegt, beslist de head de letter; output = bestaand suggestie-formaat → review-UI ongewijzigd.
- n8n-kruischeck: de head-uitkomst wordt de onafhankelijke bevestiging van de declaratie (vervangt de interim "vertrouw de declaratie blind" zodra de held-out-validatie ≥5/6 haalt).
- Vliegwiel: bevestigde Nutri-Score-crops blijven refs worden (nuttig voor presence), maar oogst-als-verbetermiddel blijft gestopt conform 12.21.

**Fase 2 — Embedding-schaduw (week 2–4, rekenwerk 's nachts):**
- Shoot-out-winnaar uit fase 0 als ONNX (int8) naast efficientnet_b0 zetten.
- **Re-embedden:** ~130 refs is minuten-werk; nieuw kolom-/tabel-ontwerp met `model_version` (bv. `reference_embeddings(model_version, embedding vector(768))` of aparte tabel per versie) zodat oud en nieuw parallel bestaan; pgvector-index (ivfflat/hnsw) per versie opnieuw aanmaken — let op de bekende ivfflat-onder-fetch, overweeg meteen HNSW zoals OFF gebruikt.
- **Drempels zijn model-specifiek:** 0,75 (live) en 0,6 (kruischeck) gelden NIET voor het nieuwe model. Herkalibreer op de gold-set + 212 hard-negatives (zelfde methode als gate-v2/19.6-herkalibratie).
- **Gate hertrainen** op de nieuwe embeddings (bestaande gelabelde data, bestaande tooling).
- Schaduwdraaien: nachtelijke runs loggen beide modellen; vergelijk top-1/recall/queue-precisie over 1–2 weken echte doorvoer zonder gedragswijziging.

**Fase 3 — Cutover (week 4–5):** schakel het live-pad om zodra de schaduw-metrics de oude laag aantoonbaar verslaan; houd efficientnet_b0-embeddings 1 cyclus als fallback; review-UI/vliegwiel/n8n merken alleen betere suggesties, geen contractwijziging.

**Fase 4 — Uitbreiden (daarna):** per-familie heads op bewezen-verwarde families (GHS, recycling-cijfers) volgens het fase-1-patroon; VLM-arbiter op de grijze-zone-flow; optioneel prototype-embeddings per code.

---

## 8. Risico's, effort en eerstvolgende toetsbare stap

### 8.1 Risico's

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| A1 faalt op monochrome/kleine logo-varianten | middel | middel | A2-vangnet (NutriGreen-classifier); held-out-set bevat de echte varianten |
| Domain gap NutriGreen (foto's) vs artwork (renders) | middel | laag-middel | eigen refs/crops mee-trainen; validatie op eigen held-out vóór integratie |
| Nieuwe drempels verkeerd gekalibreerd → queue-vervuiling | middel | middel | schaduwfase + gold-set-herkalibratie vóór cutover; fallback-pad 1 cyclus |
| CPU-budget live-pad (ViT-B ~100–200 ms/crop) | laag-middel | middel | int8-kwantisatie; DINOv3-S-alternatief (3–4× kleiner); zware batches nachtelijk (bestaand regime) |
| DINOv3-licentie (niet-OSI) of CC-BY-SA-grijszone NutriGreen-gewichten | laag | laag | SigLIP2 (Apache-2.0)/CLIP (MIT) als hoofdkeuze; licentie-notitie vastleggen |
| VLM-privacy (crops naar externe API) | — | beleidskeuze | alleen crop sturen, zero-retention-provider, expliciete go/no-go door Friso |
| Re-embed-vergissing: oude en nieuwe vectors mengen | laag | hoog | hard `model_version`-schema, aparte index, nooit cross-versie vergelijken |

### 8.2 Effort-totaal (indicatief)

- Rang 1 (Nutri-Score-head): **1–2 weken** tot in productie.
- Rang 2 (embedding-upgrade): **3–5 weken doorlooptijd**, waarvan ~1,5 week actief werk (rest is schaduw-draaitijd).
- Rang 3 (VLM-arbiter): **enkele dagen** per integratiepunt, na beleids-go.

### 8.3 Wat expliciet NIET hoeft

Geen herbouw van region-proposer, review-UI, referentie-opslag, vliegwiel of n8n-contract; geen GPU-aanschaf; geen eigen embedding-training; geen nieuwe detector-trainingscampagne.

### 8.4 Eerstvolgende toetsbare stap (klein, offline, read-only op bestaande data)

Eén gecombineerde offline validatie op de bestaande held-out set (dezelfde 6+ GTINs met GDSN-declaratie als grondwaarheid, uit te breiden naar de 19 beschikbare held-out-kandidaten):

1. **A1-prototype** (balk-detectie + geometrie + Tesseract-PSM10-check) op de al-geproposede crops → meet letter-accuratesse (doel: ≫1/6, streefwaarde ≥5/6).
2. **Embedding-shoot-out**: re-embed de ~130 refs met SigLIP2-B/16, CLIP-B/16 en DINOv3-S (ONNX, CPU); herdraai de 12.21-probes (open + familie + kruischeck) per model → meet top-1, familie-juistheid, sim-verdeling en CPU-latency per crop op de eigen host.
3. Rapporteer één vergelijkingstabel; go/no-go per spoor volgt direct uit de cijfers.

Effort: 1–2 dagen; volledig scriptbaar naast de bestaande probe (`scratchpad/nutriscore_recog_probe.py`); geen schrijf-acties op ACC nodig.

---

## 9. Bronnen

**Nutri-Score-specifiek**
- NutriGreen-dataset (paper): https://pmc.ncbi.nlm.nih.gov/articles/PMC11002244/ — data: https://zenodo.org/records/8374047
- Robotoff-models (o.a. tf-nutriscore, universal-logo-detector): https://github.com/openfoodfacts/robotoff-models
- Robotoff nutriscore_tensorflow: https://github.com/openfoodfacts/nutriscore_tensorflow
- Nutri-Score-logo-standaard: https://en.wikipedia.org/wiki/Nutri-Score

**OCR op CPU**
- PaddleOCR vs Tesseract vs EasyOCR (2025/2026-benchmarks): https://www.codesota.com/ocr/paddleocr-vs-tesseract en https://tildalice.io/ocr-tesseract-easyocr-paddleocr-benchmark/
- Non-LLM OCR-engines technisch overzicht: https://intuitionlabs.ai/articles/non-llm-ocr-technologies
- OCR op voedselverpakkingen (evaluatie): https://arxiv.org/html/2510.03570v1

**Embedding-laag**
- Robotoff logo-embedding-benchmark (efficientnet_b0 vs CLIP): https://openfoodfacts.github.io/robotoff/research/logo-detection/embedding-benchmark/
- Robotoff logo-ANN-pipeline: https://openfoodfacts.github.io/robotoff/references/logos-ANN/ en https://blog.openfoodfacts.org/en/news/how-open-food-facts-uses-logos-to-get-information-on-food-products
- SigLIP 2: https://arxiv.org/pdf/2502.14786 en https://huggingface.co/docs/transformers/model_doc/siglip2
- DINOv3 (ViT-S/16): https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m en https://www.lightly.ai/blog/dinov3
- CLIP vs DINOv2 voor retrieval: https://ai.gopubby.com/clip-vs-dinov2-which-one-is-better-for-image-retrieval-d68c03f51f0d en https://medium.com/aimonks/clip-vs-dinov2-in-image-similarity-6fa5aa7ed8c6
- Unicom (universeel retrieval, ArcFace-stijl): https://www.researchgate.net/publication/369975333_Unicom_Universal_and_Compact_Representation_Learning_for_Image_Retrieval
- CLIP ONNX-exports: https://huggingface.co/Qdrant/clip-ViT-B-32-vision — kwantisatie-winst: https://medium.com/nixiesearch/how-to-compute-llm-embeddings-3x-faster-with-model-quantization-25523d9b4ce5
- Open-set logo-detectie (achtergrond): https://arxiv.org/pdf/1911.07440 en https://arxiv.org/abs/1811.08009

**Vision-LLM's**
- Vision-API-kosten-vergelijking: https://tokenmix.ai/blog/vision-api-comparison
- Qwen2.5-VL-pricing: https://openrouter.ai/qwen/qwen2.5-vl-72b-instruct en https://deepinfra.com/blog/qwen-api-pricing-2026-guide
- OpenAI-pricing: https://developers.openai.com/api/docs/pricing
- Kleine lokale VLM's: https://huggingface.co/blog/smolvlm , https://huggingface.co/blog/vlms-2025 , https://blog.roboflow.com/local-vision-language-models/

**Interne grondwaarheid**
- Spike 12.21 (herkenningsmechanisme-verdict): `_bmad-output/implementation-artifacts/12-21-spike-nutriscore-herkenningsmechanisme.md`
- Eerdere spikes/lessen: 12.11 (synthetisch NO-GO), 12.4 (detector-spike), 12.3 (real-ref pivot), flywheel-recall-onderzoek, keurmerk-dekking-strategie (projectgeheugen).

---

**Afronding:** 2026-07-14 · Alle externe claims voorzien van bron-URL; CPU-latencies gemarkeerd als indicatief waar publieke benchmarks ontbreken (te meten in fase 0). Vertrouwensniveau: hoog voor de Nutri-Score-route (extern gerepliceerd bewijs) en de embedding-winst (benchmark op identieke architectuur én identiek vertrekmodel); middel voor exacte CPU-latencies en de NutriGreen-domain-gap (beide expliciet in de fase-0-validatie belegd).
