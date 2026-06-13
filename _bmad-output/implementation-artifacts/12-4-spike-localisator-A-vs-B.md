# Story 12.4-spike: Architectuur-spike — localisator A vs B op échte data

Status: **ready (beslis-poort vóór de 12.4-build).** Beslist op gemeten localisatie-kwaliteit welke
trap-1-architectuur gebouwd wordt. Beslisbasis: `12-ARCH-localisatie-detector-beslisdocument.md`.
Discipline conform 12.2/12.3-spikes: **meten vóór committen** — geen meerweekse detector-build op gevoel.

## Story

Als ML-eigenaar,
wil ik op échte artwork-data meten of een **getrainde 1-klasse-detector (A)** dan wel een
**open-vocabulary detector (B)** keurmerk-regio's beter localiseert — vooral: tekst/tabellen/
pictogrammen afwijst — zodat de 12.4-build op data rust, niet op aanname.

## Probleem / waarom een spike

12.4 kan twee kanten op (A vs B), met een tegengesteld signaal: 8.7-synthese voedt A direct, maar
stap-0 mat dat foundation-modellen onze grafische marks zwák scheiden (verdacht voor B's identificatie,
onbekend voor B's localisatie). Direct bouwen = risico op weggegooid meerweeks werk. Een gerichte spike
beslist goedkoop.

## Eval-set (read-only; geen productie-mutatie)

- **Positief:** de 12.6/gold-set-bboxen (echte keurmerk-locaties) + de 78 bevestigde crops.
- **Negatief (cruciaal):** de tekst/tabel/pictogram/halve-crop-regio's uit de **huidige queue-FP's**
  (label = geen-keurmerk) — exact de set waarop de klassieke proposer faalt. Te oogsten uit de open
  review-items + een steekproef proposer-regio's op de queue-artworks.
- Meet op een steekproef van de **live-queue-artworks** (waar de FP's al zichtbaar zijn), niet alleen
  de gold-set.

## Te bouwen (spike-grade, wegwerpbaar)

- **A:** een getrainde 1-klasse-detector (ultralytics YOLO of RT-DETR), gebootstrapt op 8.7-synthese
  (logo's op echte achtergronden, bbox bekend) + hard-negatives uit echt artwork. Klein/snel; geen
  productie-integratie.
- **B:** een open-vocab/image-conditioned detector (Grounding-DINO/OWL-ViT-achtig), image-query = de
  referentie-logo's. Off-the-shelf, geen training.

## Acceptatiecriteria (go/no-go per criterium)

1. **AC1 — niet-keurmerk-FP-rate (de doorslag):** op de niet-keurmerk-set: A en B's FP-rate. Bar:
   **< 10 %** (huidige proposer ~100 %). Winnaar = laagste FP bij behoud van recall.
2. **AC2 — merk-recall @ IoU≥0,5:** tegen de 12.6-bboxen. Bar: **≥ 80 %** (12.2-baseline 45 %).
3. **AC3 — kosten ⊥ #klassen:** per-beeld-latency ≈constant in #klassen (12.2-`ac1dist`); B mag niet
   per-keurmerk-query lineair ontsporen. Eerlijke inferentiekost rapporteren.
4. **AC4 — end-to-end (detector → bestaande classify):** top-1 op de gold-set per optie; mag niet onder
   de klassieke-proposer→classify-baseline (9,3 % e2e). **Verdict alleen op echte regio's** (iter1-les).
5. **AC5 — hybride-check:** als B goed localiseert maar zwak identificeert (stap-0-vermoeden), meet de
   variant **B-localisatie + bestaande embedding-classify** apart — dat kan de winnaar zijn.

## Deliverable

Een **go/no-go-tabel (A vs B vs hybride op AC1–AC5)** + aanbeveling welke trap-1 te bouwen, en of de
binaire gate als tussenstap eerst gaat. Pas dán de 12.4-build. Artefacten + reproductie zoals de
12.2/12.3-spikes (harnas-output bijgevoegd; verdict op echte data).

## Afhankelijkheden

- Hergebruikt: 8.7-synthese, 12.6-bboxen, de 12.2-meetharnas (`spike_pipeline_eval.py`), de
  queue-FP's als negatieve set. **Voorwaarde voor:** de 12.4-detector-build. **Parallel:** de binaire
  gate-tussenstap (mag vooruit, levert dezelfde hard-negatives).
