# Story 12.6: Top-N acceptatie-dataset (bevroren, menselijk gelabeld, echte PDF's/artwork)

Status: ready — **voorwaarde voor 12.5** (de endpoint is niet toetsbaar zonder deze set). Toegevoegd na
adversariële review: 12.5 hing op een testset die niet bestond.

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
