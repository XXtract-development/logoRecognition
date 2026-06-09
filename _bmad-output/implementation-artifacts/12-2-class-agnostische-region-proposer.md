# Story 12.2 (architectuur): Class-agnostische region-proposer — detectiekosten ontkoppelen van het aantal keurmerk-klassen

Status: **spike DONE** (2026-06-09) — alle AC's gemeten op ACC. Verdict: GO op de architectuur,
GATED op embedding-fine-tuning. Volledige resultaten + beslisdocument:
`12-2-spike-results-and-decision.md`. Productie-build volgt de fine-tuning-vervolgstory.

## Story

Als ML-eigenaar,
wil ik de localisatie-stap vervangen door een **class-agnostische region-proposer** (vind "keurmerk-achtige"
regio's onafhankelijk van wélk keurmerk), gevolgd door embedding + open-set classificatie,
zodat de **detectiekosten per beeld ≈ constant** worden ten opzichte van het aantal keurmerk-klassen —
en het toevoegen van een keurmerk neerkomt op het toevoegen van een referentie-embedding (O(1)),
niet een extra template met lineaire detectiekost.

## Probleem (Risico A uit Story 12.1)

De huidige localisatie is **per-klasse template-matching**: `for tmpl in templates: cv2.matchTemplate`
(`apps/ml-service/app/services/localization.py:347`). Kosten ≈ `tiles × templates × ~10 scale-varianten`,
dus **strikt lineair in het aantal klassen**. Gemeten: ~28s/beeld bij 5 templates → 5→50 = ×10, 5→500 = ×100.
"Honderden keurmerken" is daarmee architecturaal onhaalbaar. 12.1 is daarom begrensd tot tientallen;
deze story levert de architectuur voor **brede dekking**.

## Doel / niet-doel

- **Doel:** detectiekost per beeld vrijwel **onafhankelijk van #referentieklassen**; een nieuw keurmerk toevoegen =
  referentie-embedding(s) toevoegen, geen nieuwe template, geen extra detectie-kost.
- **Niet-doel:** de referentiebibliotheek wijzigen (de GS1-geseede bibliotheek + embeddings uit 12.1 blijft de bron);
  het embedding-model vervangen (tenzij §Risico's aantoont dat fine-tuning nodig is); de crosscheck/declaratie-routing
  of de gold-set-loop wijzigen.

## Voorgestelde architectuur (twee-traps, class-agnostisch)

```
artwork → [1] region-proposer (class-agnostisch)  → kandidaat-bboxen
        → [2] per regio: embed (model_manager) → pgvector nearest-reference (find_similar_references)
                         → open-set drempel → t3777_code  óf  UNKNOWN
```

- **Trap 1 (region-proposal)** draait **één keer per beeld**, onafhankelijk van #klassen → constante kost.
- **Trap 2** is per regio een goedkope ANN-zoekopdracht over N referenties (pgvector ivfflat, sublineair in N).
- Totale kost ≈ `regio's × ANN` — **ontkoppeld van #klassen**. Dit is de hele winst.

**Hergebruik (bestaat al, geverifieerd):** embedding-model `app/ml/model_manager.py`; pgvector cosine
`db_service.find_similar_references` (`database.py:362`); **open-set UNKNOWN-markering** + per-methode-drempels
(`classification.py`: `CLASSIFY_THRESHOLD_EMBEDDING`=0.75, `uncertain`-markering, UNKNOWN-fallback);
`tile_image` (640/overlap 0.2). **Vervangen:** alleen de per-klasse template-match localize.
**De 5 bestaande klassen migreren naadloos** — ze worden referentie-embeddings, geen templates meer nodig.

## Kernbeslissing: de region-proposer (opties + trade-offs)

| Optie | Wat | Voor | Tegen |
|---|---|---|---|
| **A. Getrainde generieke "logo"-detector** (YOLO/RT-DETR, één klasse "keurmerk-regio") | model dat *waar* een keurmerk staat voorspelt, niet *welk* | hoogste precisie/recall; snelle, constante inferentie | vereist gelabelde bboxen van logo's op artwork; trainingsinspanning |
| **B. Klassieke CV-proposals** (MSER / contour / connected-components / saliency, getuned op compacte hoog-contrast marks) | regelgebaseerde regiovoorstellen | geen training; direct inzetbaar; goede spike/v0 | ruisiger (meer valse regio's → meer embed+classify-calls + open-set-ruis) |
| **C. Hybride** (B om te bootstrappen + labelen, dan A trainen) | start B, gradueer naar A | pragmatisch; B genereert trainingsdata voor A | twee fasen |

**Aanbeveling: C.** Spike met **B** om (a) de kosten-ontkoppeling te bewijzen en (b) trainingsdata te genereren,
train daarna **A** voor productiekwaliteit. Klassieke proposals + open-set-filter zijn genoeg om het *principe*
te bewijzen vóór we in detector-training investeren.

## Open-set classificatie & drempels (kritiek bij schaal)

- De region-proposer stelt onvermijdelijk **niet-keurmerk-regio's** voor; **open-set-verwerping** is essentieel:
  een regio die geen referentie boven drempel haalt → **UNKNOWN** (bestaande markering) → review/negeren.
- Bij honderden referenties groeit **inter-klasse-verwarring**. Dit erft het classify-drempelgat uit 12.1 (AC5):
  classify draait nu op een **globale** drempel, geen per-klasse. Deze story moet **per-klasse calibratie +
  confusion-matrix-gedreven drempels** leveren (anders schaalt precisie niet mee).

## Trainingsdata-strategie (voor optie A)

Positieve bboxen ("hier staat een keurmerk-mark"), class-agnostisch:
- **Gold-set-loop:** bevestigde detecties hebben crop + bbox + menselijk label (hergebruik bestaande tooling).
- **Synthese (Story 8.7 bestaat):** officieel logo op realistische achtergronden plakken met bekende bbox →
  oneindig goedkope positieve voorbeelden, ook voor zeldzame keurmerken.
- **Zwakke supervisie:** 84k artwork + declaraties (product claimt keurmerk X → ergens op het etiket staat een mark).

## Acceptatiecriteria (architectuur-spike, geen volledige build)

1. **Kosten-ontkoppeling bewezen:** een spike toont dat de per-beeld-detectielatency **≈constant** is bij 5 → 50 →
   ~200 referentieklassen (gemeten), binnen een vooraf vastgesteld budget — afgezet tegen de lineaire
   template-match-baseline (curve template-match vs region-proposer).
2. **Geen regressie op de 5 bestaande klassen:** op de bestaande gold-set evenaart (of verbetert) het
   region-proposer→embed→classify-pad de huidige 5-klasse-precisie/recall.
3. **Open-set werkt:** niet-keurmerk-regio's worden als UNKNOWN gemarkeerd tegen een acceptabele (gemeten) FP-rate.
4. **Beslisdocument:** onderbouwde keuze region-proposer (A/B/C) + trainingsdata-plan + expliciet oordeel of
   **embedding-fine-tuning** nodig is (zie Risico's), met go/no-go voor de productie-build.

## Risico's & mitigaties

- **Region-proposer recall** (mist echte logo's) → start hoog-recall/laag-precisie proposals + open-set-filter;
  bboxen-trainingsdata verbeteren.
- **Embedding-onderscheidend vermogen:** een ImageNet-backbone scheidt mogelijk ~900 fijnmazige logo's onvoldoende
  (bv. FSC-varianten, kosher-varianten) → kan **metric-learning fine-tuning** op keurmerk-crops vergen. Grotere
  inspanning; expliciet als sub-beslissing in AC4. Dit is het grootste inhoudelijke risico van de brede aanpak.
- **Open-set valse positieven** (regio snapt naar verkeerde klasse) → per-klasse drempels + confusion-matrix + abstain.
- **Bootstrap kip-ei** (detector heeft labels nodig) → klassieke proposals (B) + synthese (8.7) als startset.

## Migratiepad

Region-proposer **naast** template-match draaien (shadow/A-B) op hetzelfde artwork; per-klasse precisie/recall +
latency vergelijken; cutover per klasse of globaal zodra non-regressie bewezen. De referentiebibliotheek en
crosscheck blijven onveranderd, dus terugvallen op template-match blijft mogelijk.

## Besluiten (vastgesteld 2026-06-09)

1. **Region-proposer = optie C** (klassiek → getraind). Spike met klassieke CV-proposals (B) om de
   kosten-ontkoppeling te bewijzen én trainingsdata te genereren (samen met 8.7-synthese), daarna detector (A)
   trainen voor productiekwaliteit. Reden: direct A vereist gelabelde bboxen die we nog niet op schaal hebben.
2. **Embedding-fine-tuning = aparte vervolgstory, gated door de meting in deze spike.** Niet vooraf committen;
   12.2's confusion-matrix (AC2/open-set) moet aantonen of de standaard ImageNet-embedding de fijnmazige varianten
   (FSC-, kosher-varianten) genoeg scheidt. Zo niet → fine-tuning-story starten mét bewijs.

## Beschermde tests — harde ontwerpregel

De 4 beschermde tests in `tests/test_artwork_processing.py` (regels 142–206) pinnen **direct** `match_templates`,
`tile_image` en `merge_detections` en moeten **byte-identiek** blijven. Daarom: 12.2 **verwijdert of wijzigt deze
functies niet** — de region-proposer komt er **náást** (consistent met het A/B-migratiepad). De template-match-localize
blijft als fallback bestaan; de beschermde tests blijven groen door ontwerp, niet door bewerking.

## Tests / ATDD

Architectuur-spike → meet-harnassen i.p.v. klassieke unit-ATDD:
- **AC1-harnas:** latency-curve template-match vs region-proposer bij 5 → 50 → ~200 referentieklassen (≈constant aantonen).
- **AC2-harnas:** region-proposer→embed→classify op de bestaande gold-set (`tests/validation/gold-set-oogstrun.json`)
  → precisie/recall + **confusion-matrix**; non-regressie t.o.v. de huidige 5-klasse-cijfers (100%@≥0,7).
- **AC3-test:** open-set — niet-keurmerk-regio's → UNKNOWN-rate (gemeten FP).
- **Beschermde tests blijven ongewijzigd draaien** (zie ontwerpregel hierboven).
- Productie-build (na go) krijgt eigen red-phase-ATDD; valt buiten deze spike-story.
