# Technisch onderzoek — Recall verhogen van de flywheel-bootstrap-matcher (lege keurmerkklassen)

Datum: 2026-07-06 · logoRecognition, Epic 19 · Auteur: technical-research (BMAD)
Grondslag: ACC-metingen 2026-07-06 (case-file `investigations/flywheel-ml-search-0-matches-investigation.md`) + eigen spikes 12.2/12.3/12.4 + externe stand van zaken.

## 1. Probleem en het echte knelpunt

De bootstrap moet een LEGE keurmerkklasse (nul referenties) vullen met echte crops, met alleen een GS1-gids-logo als zaad + absolute cosine-drempel op een generieke ImageNet-embedding (`efficientnet_b0`). Gemeten recall: **~20–28%** van de declarerende producten; ~4 van 5 blijven leeg.

**Twee onafhankelijke assen bepalen het knelpunt (beide al gemeten in Epic 12):**
- **Discriminatie (welk keurmerk):** de universe-probe (`12-universe-recognizability-probe.md`) toont **50,7% inter-code-collisie** op de 0,75-poort — het typische keurmerk-logo ligt ~0,75 van een *ánder* keurmerk. Daarvan is **~14% een hard variant-family-plafond** (FSC-varianten, kosher/halal-families) en **~36% embedding-zwakte**.
- **Localisatie/spreiding (crop → referentie):** self-cosine p50 ~0,65, ónder de poort; top-1-ranking ~58% — de rangschikking draagt wél signaal, de absolute drempel niet.

**Cruciaal, al bewezen:** een sterkere *off-the-shelf*-backbone (DINOv2/CLIP) rankt NIET beter dan `efficientnet_b0` (`12-3-stap0-backbone-resultaten.md`). En een GETRAINDE detector haalde de AC's niet — bottleneck = data (22 artworks), niet architectuur (`12-4-detector-spike-resultaten.md`). Extern bevestigd: goede one-shot logo-herkenning vereist fine-tuning op een uitdagende logo-dataset (Siamese op QMUL-OpenLogo ~77%) — dus off-the-shelf embeddings zijn intrinsiek zwak voor deze taak.

## 2. De doorbraak die er al ligt — en waarom die niet 1-op-1 past

`12-3-realref-poc-resultaten.md` (LEAVE-ONE-GTIN-OUT, geen training): echte-crop-referenties + top-1/nearest-reference-**ranking** i.p.v. één zaad + absolute drempel → **micro top-1 37%→81%, macro 60%→69%, RECYCLABLE 0%→100%**. Conditie C (echte crops MÉT het guide-logo als fallback) is de beste, productie-vorm.

**De kip-ei:** die winst geldt voor klassen die AL ≥2 echte crops per GTIN hebben. De bootstrap draait juist op een LEGE klasse — er zíjn nog geen echte crops. Ranking lost het lege-klasse-startprobleem dus niet direct op.

## 3. Opties (afgewogen, geen zware training)

| # | Optie | Wat het doet | Verwacht effect | Kosten/risico |
|---|-------|--------------|-----------------|---------------|
| A | **Zaad-verrijking** (multi-variant gids-logo's + augmentatie: schaal/rotatie/mono-inkt; max-cosine over varianten) | verhoogt de *eerste-pass*-recall met alleen het gids-logo | bescheiden (+enkele %-punten; embedding-plafond blijft) | laag, geen training |
| B | **Twee-traps-bootstrap (AANBEVOLEN kern)** | fase 1: lage-bar priming met gids-logo → eerste k crops via de bestaande QUARANTAINE/human-review; fase 2: zodra klasse ≥k bevestigde crops heeft → overschakelen op 12.3-ranking (81%) | hoog: breekt de kip-ei; recall schaalt naar POC-niveau ná de eerste crops | laag/midden; hergebruikt `reference_embeddings`, `queue_harvest`, gold-set |
| C | **Betere localisatie via open-vocabulary-detector** (Grounded SAM 2 / Grounding DINO, zero-shot, promptbaar; vervangt/vult de klassieke `region_proposer` aan) | surfacet kleine logo-regio's beter → meer kandidaat-crops de embedding in | midden op de localisatie-as; lost discriminatie NIET op | zwaarder bij inference (~28s/beeld nu); geen training maar groot model |
| D | Off-the-shelf backbone-swap (DINOv2/CLIP) | — | **bewezen géén winst** (stap-0) | — (afvoeren) |
| E | Nieuwe detector/embedding-fine-tuning trainen | metric-learning op keurmerk-marks | potentieel hoog, maar **onbewezen** + data-hongerig (12.4 faalde) | hoog; aparte, latere R&D-lijn |

## 4. Aanbeveling

**Kies B (twee-traps-bootstrap) als kern, met A (zaad-verrijking) als goedkope versterker van fase 1. Scope tot de top-N meest-gedeclareerde keurmerken (tientallen), niet alle 884.**

Redenering:
- De bootstrap hóéft geen hoge recall te halen — hij hoeft alleen de **eerste paar** echte crops per klasse te vinden. De bestaande quarantaine/human-review bevestigt die eerste crops vóórdat ze referentie worden, dus fase 1 mag een **lagere lat** hebben zonder de bibliotheek te vervuilen (guard + gold-set + review als vangnet). Zodra ≥k bevestigde crops bestaan, neemt de **bewezen 81%-ranking (12.3)** het over — precies de "volle kraan".
- Dit is het patroon dat 12.3's eigen uitrolplan al noemt (harvest voert echte crops/GTINs aan → betere refs → sterkere eval). De infrastructuur bestaat: `reference_embeddings`, `rebuild_reference_embeddings`, `queue_harvest`.
- Concentreer op de volume-keurmerken (GREEN_DOT 11.169, RECYCLABLE 8.643, TRIMAN 3.886, …): daar zit de brandstofwaarde, en RECYCLABLE bewees al 0%→100% met echte refs.
- **C (open-vocab-detector) is een aparte, latere localisatie-verbetering** — kansrijk maar zwaarder; alleen oppakken als fase-1-recall ná A/B nog te laag blijkt.
- **D afvoeren** (bewezen geen winst). **E (training) blijft een onbewezen, latere R&D-lijn** — niet nu.

## 5. Voorgestelde spike (minimaal, meetbaar, read-only mogelijk)

**Doel:** bewijs op 2–3 volume-klassen (bv. RECYCLABLE, GREEN_DOT, TRIMAN) dat de twee-traps-aanpak de recall structureel optilt.

1. **Fase-1-meting:** vergelijk read-only de eerste-pass-recall van (i) enkel gids-logo vs (ii) zaad-verrijking (multi-variant + augmentatie, max-cosine). Verwacht: modest omhoog.
2. **Fase-2-simulatie (kern):** neem per klasse k=3 bevestigde echte crops (uit de bestaande verdict-set / harvest), bouw referentie-embeddings (conditie C), en her-meet de recall over de resterende declarerende producten met **ranking** i.p.v. absolute drempel — leave-one-GTIN-out, zoals de 12.3-POC. Verwacht: richting 81%.
3. **Precisie-poort:** toets tegen de gold-set + de RECYCLABLE-flood-controle dat de winst niet ten koste van precisie gaat (guard beschermt kruisbesmetting al).
4. **Uitkomst:** een go/no-go met cijfers per klasse + een concreet implementatie-story-voorstel (schakelmoment ≥k refs, ranking-pad in `bootstrap_search`/nominatie, harvest-koppeling).

Reproductie-harnas bestaat grotendeels: `spike_iter2_realref_poc.py` (12.3), `queue_harvest.py`, de read-only probes van vandaag (`sweep.py`/`proof.py`).

## 6. Randvoorwaarden (bewaakt)
- ml-service-code onder `apps/ml-service/app/` (ARCH-3); geen zware GPU-training aannemen.
- Guard (19.5), gold-set-regressie, tweetraps-dedup, class-cap blijven het vangnet.
- 19.6 (drempel+gate-kalibratie) blijft nodig als fase-1-enabler (zet het straaltje aan); dit onderzoek levert de fase-2-recall.

## Bronnen
- Intern: `12-universe-recognizability-probe.md`, `12-3-realref-poc-resultaten.md`, `12-3-stap0-backbone-resultaten.md`, `12-4-detector-spike-resultaten.md`, `investigations/flywheel-ml-search-0-matches-investigation.md`.
- Extern: [One Shot Logo Recognition — Siamese Networks (ICMR 2020)](https://dl.acm.org/doi/10.1145/3372278.3390734) · [Few-shot Open-set Recognition Using Background as Unknowns](https://arxiv.org/pdf/2207.09059) · [Grounding DINO (ECCV 2024)](https://github.com/IDEA-Research/GroundingDINO) · [Grounded SAM 2 — open-set detection to segmentation (2026)](https://pyimagesearch.com/2026/01/19/grounded-sam-2-from-open-set-detection-to-segmentation-and-tracking/) · [Fine-Tuning Grounding DINO](https://learnopencv.com/fine-tuning-grounding-dino/).
