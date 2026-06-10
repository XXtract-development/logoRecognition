# Story 12.6: Top-N acceptatie-dataset (bevroren, menselijk gelabeld, echte PDF's/artwork)

Status: **in-progress — concreet gemaakt 2026-06-09** (machinerie + seed + spec klaar; resteert het
menselijke labelwerk). Voorwaarde voor 12.5 én voor fine-tuning-iteratie 2 (12.3).

## Operationalisering (concreet, 2026-06-09)

**Het echte-data-gat (de kern-bevinding).** Inventarisatie van álle labelbronnen: er zijn lokaal
**75 echte ECHT-crops over 4 klassen** (gold-set: GREEN_DOT 42, FSC 17, V_LABEL_VEGAN 13, EU_ORGANIC 3)
+ ~9 ECHT proof-slice-crops (5 klassen, records in de DB). `labels-oogstrun.json` is 100 % de gold-set-
overlay (geen extra data). **Conclusie: er is bijna geen gelabelde echte keurmerk-data → 12.6 is een
data-CREATIE-taak (menselijk labelen), geen consolidatie. Dit gat is dé bottleneck van de epic.**

**Concrete artefacten (klaar):**
- **Top-N = 20 codes** (top-gedeclareerd ∩ guide-logo aanwezig; 25/26 hebben een logo, alleen de numerieke
  resin-code `SOCIETY_PLASTICS_INDUSTRY` mist): `tests/validation/acceptatie-dataset/top-n-codes.json`.
- **v0-seed** (geverifieerd startpunt, canoniek schema = gold-set-schema):
  `tests/validation/acceptatie-dataset/dataset-v0.json` — 75 ECHT + 16 VALS, 4 klassen.
- **Kandidaat-assembler** `apps/ml-service/scripts/assemble_acceptance_candidates.py`: draait propose→
  classify over echte artwork, surfacet per-code kandidaat-crops (hoog-recall, floor 0,45) → een
  label-wachtrij (crop + voorspelde code + bbox). Maakt "keurmerken zoeken" → "kandidaten accepteren/
  afwijzen". Kosten ≈constant in #klassen (12.2-AC1).

**Label-mechanisme (bestaat al — niet herbouwen):** de Epic 8.5/8.6 **review-UI (ArtworkReviewPage) +
crop-stream/review-queue** surfacet gedetecteerde crops voor menselijke accept/reject mét herkomst. De
assembler vult die queue gericht met top-N-kandidaten; geaccepteerde ECHT-crops → `dataset-vN.json`.

**Doel-omvang & proces:**
- **Target K ≥ 15 ECHT-crops per top-N-code** (gespreid over grootte/clustering/mono-inkt) + een
  hard-negatieven-set. Nu: 4/20 codes ≥15, 1 code (EU_ORGANIC) onder; 16 codes = 0 → **labelwerk nodig**.
- **Proces:** (0) **eerst de top-N referentielogo's seeden** (12.1-seed-runner) — de assembler classificeert tegen de actieve `reference_logos`; nu staan er 10, de top-N vergt alle 20 geseed, anders surfacet hij alleen de geseede codes. (1) assembler draaien over de ~2000 geïmporteerde artworks per top-N-code → kandidaat-queue. (2) PO labelt accept/reject + bbox-correctie via de review-UI. (3) export geaccepteerde ECHT → vN. (4) bevriezen + id-exclusie uit alle training (12.3-anti-leakage).
- **Eigenaar labelwerk:** Product Owner (Sasha Roest) / aangewezen annotator — menselijke taak, geen modeltaak.

## Uitgevoerd 2026-06-10 — top-N geseed + assembler gedraaid

- **Top-N referenties geseed:** de 10 ontbrekende codes via de 12.1-seed-runner → **ACC-referentie-
  bibliotheek 10 → 20 actieve codes** (22 embeddings herbouwd). De assembler classificeert nu tegen alle 20.
- **Assembler gedraaid** over 150 echte artworks (van 3502 geïmporteerd) → **3164 kandidaten over alle 20
  codes** (`review-queue/candidates-top25.json` = top-25/code). Artefact + crops + review-sheet in
  `tests/validation/acceptatie-dataset/review-queue/` (`review.html`).
- **Eerlijke bevinding (her-bevestigt het embedding-knelpunt):** bij floor 0,45 is de wachtrij
  **ruis-gedomineerd** — ~21 kandidaten/artwork vs ~1–3 echte marks. Van de 3164 zijn er maar **47 ≥0,75**
  en **331 ≥0,65**. Hoog-conf = écht (geverifieerd: top BETER_LEVEN @0,94 is een echt Beter-Leven-logo),
  maar échte marks zakken vaak onder 0,75 (zelfde 17 %-probleem). → **Kip-ei:** labelen is nodig om de
  embedding te fixen, maar de zwakke embedding maakt de wachtrij rumoerig.
- **Werkbare labelstrategie voor de PO:** review.html toont per code de top-25 conf-gesorteerd
  (groen ≥0,75 = hoogste ECHT-kans). Begin hoog-conf-eerst (~47–331 crops, behapbaar); vul aan met de
  mid-band (0,6–0,75) waar échte marks zitten. De volledige 3164 is niet bedoeld om handmatig te doen.
- **Volgende:** PO labelt review.html → geaccepteerde ECHT → `dataset-v1.json` (≥15/code-doel), bevriezen
  + id-exclusie. Dat ontgrendelt fine-tuning-iteratie 2 (12.3) met realistische, echte positieven.

## Annotatie voorbereid 2026-06-10 — klaar voor de PO

- **Interactief annotatie-instrument** `review-queue/annotate.html` (zelfstandig, geen backend): per crop
  ECHT/VALS klikken of E/V-toets, voortgang in localStorage, knop **"Exporteer dataset-v1.json"** in het
  canonieke schema. JS-syntax geverifieerd (`node --check`). 389 kandidaten (top-25/code), conf-gesorteerd.
- **Annotatie-brief** `review-queue/ANNOTATIE-BRIEF.md` — instructie, doel (≥15 ECHT/code), bij-twijfel-VALS,
  bbox niet vereist (crop accept/reject volstaat voor embedding-training; strak bijsnijden = 12.4).
- **Hand-off:** de enige resterende blokker is mensenwerk (PO/annotator). Output `dataset-v1.json` →
  bevriezen + id-exclusie → input voor 12.3-iter2 (realistische positieven) én 12.5-acceptatienorm.

## Story

Als ML-eigenaar,
wil ik een **bevroren, menselijk gelabelde acceptatie-dataset** van echte PDF's/artwork voor de top-N
keurmerken (mét per-mark bbox én t3777-code, inclusief expliciete negatieven), zodat de endpoint (12.5)
en de embedding-/detector-slagen (12.3/12.4) tegen een **betrouwbare grondwaarheid** gemeten worden in
plaats van tegen de huidige gold-set-oogstrun — die uit de óúde pipeline komt, slechts 4 klassen dekt,
en waarvan we vaststelden dat de bboxen verschoven/onbetrouwbaar zijn.

## Probleem (review-blokker)

- De huidige `gold-set-oogstrun.json` = 91 records / 4 klassen, gegenereerd door de óúde template-match-
  pipeline; we maten dat `classify|covered` (20,6 %) > perfecte-crop (17,3 %), wat aantoont dat de
  **gold-bboxen te strak/verschoven** zijn. Een detector/endpoint hiertegen evalueren meet overeenstemming
  met foute labels, niet ware recall/precisie.
- 12.5's acceptatie-norm (precisie ≥90 %, recall-bar) is **niet meetbaar** zonder een schone set.

## Doel / niet-doel

- **Doel:** een bevroren set echte artwork-PDF's/afbeeldingen, menselijk geannoteerd met (a) per
  zichtbare keurmerk-mark een **bbox + t3777-code**, (b) expliciete **hard-negatieven** (food-textuur,
  typografie, niet-keurmerk-pictogrammen) voor de open-set-meting, gespreid over de **top-N** keurmerken
  en over realistische artwork-condities (klein, mono-inkt, geclusterd, multi-page).
- **Niet-doel:** de lange staart annoteren (fase 2); trainingsdata produceren (dit is een *eval*-set,
  strikt gescheiden van training — zie anti-leakage in 12.3); de annotatietooling herbouwen (hergebruik
  de bestaande review-UI/crop-tooling uit Epic 8).

## Acceptatiecriteria

1. **Dekking:** ≥ K voorbeelden per top-N-keurmerk (K vooraf vastgesteld, bv. ≥15) uit échte artwork,
   met spreiding over grootte/clustering/mono-inkt; plus een hard-negatieven-set.
2. **Kwaliteit van de grondwaarheid:** elke bbox+code menselijk bevestigd (dubbel-gelabeld of
   review-gevalideerd); meetbaar dat de bbox de mark strak omsluit (niet de oude losse boxen).
3. **Bevroren & lek-vrij:** de set heeft stabiele id's, wordt **nooit** in training gebruikt (id-exclusie
   zoals in 12.3), en vervangt de oude gold-set als de officiële endpoint-eval-bron.
4. **Bruikbaar door de harnas:** de 12.2/stap-0-meetharnas leest deze set (zelfde schema als
   `gold-set-oogstrun.json`: sourceFile, bbox, t3777Code, label).

## Afhankelijkheden / eigenaar

- **Voorwaarde voor:** 12.5 (endpoint-acceptatie) en de definitieve recall/precisie-bars van 12.3/12.4.
- **Hergebruikt:** Epic 8 review-UI + crop-tooling, MinIO-artwork, declaratie-data (om kandidaat-PDF's met
  top-N-keurmerken te vinden).
- **Eigenaar grondwaarheid/labels:** Product Owner (Sasha Roest) of aangewezen annotator — labelen is een
  menselijke taak, geen modeltaak.
