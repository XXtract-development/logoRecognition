# Architectuur-beslisdocument — keurmerk-localisatie (de echte bottleneck)

Auteur: Winston (System Architect) · Datum: 2026-06-13 · Status: beslisdocument + spike-plan
Context: vervolg op Epic 12 (12.2-spike, 12.3-embedding, 12.4-detector). Dit document herijkt de
prioriteit op basis van een visuele steekproef van de live review-queue (2026-06-13).

## 1. Probleemstelling (opnieuw gegrond, met bewijs)

De review-queue is onbruikbaar omdat de **localisatie** — niet de identificatie — faalt. Visuele
steekproef van 7 open items: 6 van de 7 voorgestelde "keurmerken" waren **geen keurmerk**:
voedingstabel-fragmenten, bedrijfstekst ("GmbH"), een kookpan-pictogram, een los vinkje, halve crops.
De classifier plakte daar keurmerk-labels op (~0,55–0,67).

**Kernoorzaak:** de klassieke CV-proposer (MSER/contour/template-tiling) heeft geen notie van
"is dit überhaupt een merk?" Hij stelt élk contrastrijk blok voor (tekst, tabellen, pictogrammen),
en de open-set-drempel vangt ze onvoldoende af. Embedding-/referentie-werk (12.3 real-crop-refs)
verbetert *welk* keurmerk, maar krijgt rommel als input → het kan de queue niet redden.

> **Architectuur-principe (Fowler): los het bindende knelpunt op, niet het zichtbare.** Het
> zichtbare was "voorstellen kloppen niet" → leidde naar embedding-tuning. Het bindende knelpunt is
> localisatie-precisie. Dit document corrigeert die koers.

## 2. Wat behouden blijft: de twee-traps class-agnostische vorm

De vorm **localize → identify (embed → pgvector → open-set)** blijft correct. Reden (bewezen in
12.2-AC1): de kosten zijn **ontkoppeld van het aantal klassen** — een keurmerk toevoegen = één
referentie-embedding, O(1). Voor het doel (honderden GS1-keurmerken) is dat onmisbaar; een
end-to-end multi-class detector zou per-klasse gelabelde data eisen (we hebben 78 crops totaal →
infeasible). De twee trappen hebben ook **verschillende data-behoeften**:
- Localisatie = class-agnostisch "merk vs geen-merk" → veel positief/negatief, **goedkoop via synthese
  + overvloedige echte negatieven** (tekst/tabellen staan op elk artwork).
- Identificatie = "welk merk" → referentiebeelden (guide-logo's voor allemaal + groeiende echte crops).

→ **De structurele ingreep zit in trap 1 (localisatie). Trap 2 blijft, gevoed met schone regio's.**

## 3. De kandidaat-architecturen voor trap 1

### Optie A — getrainde 1-klasse region-detector (YOLO / RT-DETR)
Leert "keurmerk-regio vs achtergrond/tekst/tabel/foto" uit gelabelde bboxen.
- **Data:** 8.7-synthese levert **onbeperkt gelabelde bboxen** (officieel logo gecomposit op echte
  artwork-achtergrond → bbox exact bekend) + de 78 echte crops + review-bevestigde regio's. Vooral:
  **hard-negative mining uit echt artwork** (precies de tekst/tabellen/pictogrammen uit de steekproef).
- **Voor:** boring & bewezen; snelle inferentie; kosten ⊥ #klassen; past in de Python/ML-service-stack
  (ultralytics/RT-DETR); de synthese-pijplijn bestaat al.
- **Tegen:** twee-traps; synthese-echt-kloof (de iter1/iter2-les: synthetische composities ≠ echte
  degradatie) → detector kan op synthese overfitten. Mitigatie: realistische compositing +
  hard-negatives uit echt artwork + de review-lus als bron van échte gelabelde boxen.

### Optie B — open-vocabulary / image-conditioned detector (Grounding-DINO / OWL-ViT-achtig)
Detecteert regio's die matchen met een tekst- óf **beeld-query** ("vind regio's die lijken op dít
referentie-logo") — localisatie + identificatie in één model, few-shot.
- **Voor:** sterke pretrained "objectness"-priors → negeert tekst/tabellen van nature; dekt de lange
  staart via referentiebeelden (O(1), geen per-klasse-training).
- **Tegen:** zwaardere inferentie; integratie-complexiteit; **en een belangrijk waarschuwingssignaal
  uit 12.3-stap-0: foundation-modellen (DINOv2, CLIP) scheidden onze fijnmazige grafische keurmerk-
  marks juist NIET goed** — ze zijn getuned op natuurlijke-beeld-semantiek. De *localisatie/objectness*
  van B kan uitstekend zijn terwijl de *identificatie* faalt op fijnmazige marks.

### Het scharnierpunt
Stap-0 (gemeten, niet vermoed) zegt: foundation-features identificeren grafische keurmerken zwak.
Dat maakt B als **identificator** verdacht, maar zegt niets over B als **localisator**. Daarom is de
sterkste hypothese mogelijk een **hybride**:
- **Localisatie:** een geleerde detector die merk-achtige regio's vindt en tekst/tabellen afwijst
  (A's 1-klasse-detector óf B's open-vocab-objectness — meten welke).
- **Identificatie:** de bestaande reference-embedding (bewezen vorm, O(1)), gevoed met schone regio's.

## 4. Aanbeveling (trade-offs, geen verdict)

1. **Behoud de twee-traps-vorm.** Niet onderhandelbaar gezien de klasse-kosten-ontkoppeling.
2. **De hoogste hefboom = een geleerde localisator.** Dit maakt de queue bruikbaar.
3. **Leun richting Optie A** als default — het is de *boring*, bewezen keuze die de stack en de
   8.7-synthese direct voeden, en stap-0 geeft B geen identificatie-voordeel. **Tenzij** de spike
   aantoont dat B's open-vocab-localisatie materieel beter is (hogere merk-recall, lagere tekst/tabel-
   FP) — dan B voor trap 1, embedding voor trap 2.
4. **Beslis op data, niet op gevoel** — run de spike (§5) vóór een meerweekse build. Dit is exact de
   discipline die 12.2/12.3 succesvol maakte.
5. **Pragmatische tussenstap die op het pad ligt (geen weggegooid werk):** een binaire
   **"keurmerk vs geen-keurmerk"-gate** op de huidige proposer-regio's. Hij ruimt de queue nú op,
   en zijn trainingsdata (de tekst/tabellen die de proposer opdiept) ís de hard-negative-set die de
   detector óók nodig heeft. Bouw de gate → hergebruik de data voor de volwaardige detector.

> **Data is de échte lange-termijn-bottleneck** (78 crops). Beide opties leunen op de 8.7-synthese
> (onbeperkte labels) + de **review→referentie-lus** (mits *diverse* crops — de RECYCLABLE-near-dup-les:
> 26 crops uit 3 GTINs veroorzaakten over-matching). De lus is de data-motor; voed hem met diversiteit.

## 5. Spike-plan — A vs B op échte data (go/no-go per AC)

**Doel:** kies trap-1-architectuur op gemeten localisatie-kwaliteit, niet op gevoel. Geen productie-
mutatie; meet op de gold-set + een steekproef van de live-queue-artworks (waar we de FP's al zagen).

**Eval-set:**
- Positief: de 12.6/gold-set-bboxen (echte keurmerk-locaties) + de 78 bevestigde crops.
- Negatief (cruciaal): de tekst/tabel/pictogram-regio's uit de huidige queue-FP's (label = geen-keurmerk).
  Dit is de set waarop de huidige proposer faalt — de echte test.

**AC1 — localisatie-precisie/recall:** voor A (getrainde 1-klasse-detector, gebootstrapt op 8.7-
synthese + hard-negatives) en B (open-vocab, image-query = referentie-logo's): meet
*merk-recall @ IoU≥0,5* en — het belangrijkst — *tekst/tabel/pictogram-FP-rate*. Winnaar = hoogste
recall bij laagste niet-merk-FP. Bar: FP-rate op de niet-keurmerk-set **< 10%** (huidige proposer is
de facto ~100% op die set).

**AC2 — identificatie ongemoeid/beter:** voer beide detectoren naar de bestaande
reference-embedding-classify; meet end-to-end top-1 op de gold-set. Mag niet onder de huidige
klassieke-proposer→classify-baseline (9,3% e2e uit 12.2) zakken; doel is materieel hoger door schonere
regio's.

**AC3 — kosten ⊥ #klassen behouden:** per-beeld-latency ≈constant in #klassen (12.2-AC1-meetwijze).
B mag niet per-keurmerk-query lineair ontsporen; meet de inferentiekost eerlijk.

**AC4 — synthese-echt-kloof eerlijk:** verdict **alleen op echte regio's** (de iter1-les: circulaire
synthetische metriek telt niet). Rapporteer de FP-rate op échte queue-artworks.

**Deliverable spike:** een go/no-go-tabel (A vs B op AC1–AC4) + aanbeveling welke trap-1 te bouwen,
plus of de binaire gate als tussenstap eerst gaat. Pas dán de meerweekse build (Story 12.4-herzien).

## 6. Migratie/risico

- A/B náást de bestaande proposer (geen van de 4 beschermde tests in `tests/test_artwork_processing.py`
  wijzigen; cutover per beeld/globaal — conform 12.2/12.4-besluit).
- Risico's: synthese-overfit (→ hard-negatives + review-loop-data), open-vocab-identificatie-zwakte
  (→ hybride: B alleen voor localisatie), data-schaarste (→ synthese + diverse harvesting).
- Rollback triviaal: detector is een A/B-pad; terug naar de klassieke proposer is config.
