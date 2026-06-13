# Story 12.4 (HERZIEN 2026-06-13): Getrainde keurmerk-localisator — de queue-bottleneck oplossen

Status: **ready, herprioriteerd tot hoofdlijn.** Voorheen geframed als "vervolg op 12.3, start ná
stap-0". Dat is omgedraaid: een visuele steekproef van de live review-queue (2026-06-13) bewijst dat
**localisatie het bindende knelpunt is, niet de embedding**. Beslisbasis:
`12-ARCH-localisatie-detector-beslisdocument.md`. Architectuur-keuze (A vs B) valt via `12-4-spike`.

## Story

Als ML-eigenaar,
wil ik de klassieke CV-proposer (12.2-optie B) vervangen door een **getrainde localisator** die
**alléén keurmerk-achtige regio's** voorstelt — geen tekst, voedingstabellen, pictogrammen of halve
crops — zodat de review-queue bruikbaar wordt en de downstream-identificatie schone regio's krijgt.

## Probleem (gemeten, niet vermoed — 2026-06-13)

Visuele steekproef van 7 open queue-items: **6/7 voorgestelde "keurmerken" waren geen keurmerk**
(voedingstabel-fragment, "GmbH"-bedrijfstekst, kookpan-pictogram, los vinkje, halve crops), door de
classifier gelabeld op 0,55–0,67. Oorzaak: de klassieke proposer (MSER/contour/template-tiling) heeft
geen notie van "is dit een merk?" en stelt elk contrastrijk blok voor; de open-set-drempel vangt ze
onvoldoende af. **Embedding-/referentie-werk (12.3) verbetert *welk* keurmerk, maar krijgt rommel als
input** → het kan de queue niet redden. Daarom is dit, niet 12.3, de hoofdlijn.

## Doel / niet-doel

- **Doel:** een getrainde localisator (class-agnostisch "keurmerk-regio") met **hoge merk-recall bij
  een lage niet-keurmerk-FP-rate**; kosten ≈constant in #klassen (12.2-AC1 niet regresseren). Voedt
  trap 2 (de bestaande reference-embedding-classify) met schone regio's.
- **Niet-doel:** classificeren wélk keurmerk (dat blijft trap 2 / 12.3); de referentiebibliotheek
  wijzigen; per-keurmerk-detectoren (juist class-agnostisch houden = de kostenwinst).

## Architectuur-keuze: A vs B (beslist via `12-4-spike`)

| | A — getrainde 1-klasse-detector (YOLO/RT-DETR) | B — open-vocabulary detector (image-conditioned) |
|---|---|---|
| Localisatie | leert "merk vs tekst/tabel/foto" uit bboxen | objectness-priors negeren tekst/tabel van nature |
| Identificatie | apart (trap 2, embedding) | model kan matchen op referentiebeeld (few-shot) |
| Risico | synthese-echt-kloof (iter1/2-les) → overfit | **stap-0: foundation-modellen scheiden onze grafische marks zwák** → mogelijk goed in localiseren, zwak in identificeren |
| Default | **boring/bewezen, past in de stack** | alleen als spike materieel beter localiseert |

**Default = A** (boring, voedt op 8.7-synthese, geen identificatie-voordeel voor B). Mogelijke
hybride: B/A voor localisatie + de bestaande embedding voor identificatie. **De spike beslist op data.**

## Aanpak

- **Trainingsdata (kritiek — erft de near-dup-les van 12.3):**
  - **Positieven:** 8.7-synthese (officieel logo op échte artwork-achtergronden → bbox exact bekend;
    onbeperkt en goedkoop) + de 12.6-bevestigde bboxen + review-lus-bevestigde regio's. **Diversiteits-
    eis:** meerdere GTINs/designs per klasse — geen near-duplicaten (de RECYCLABLE-les: 26 crops uit 3
    GTINs veroorzaakten over-matching).
  - **Hard-negatives (de doorslag voor deze story):** de echte tekst/tabel/pictogram/halve-crop-regio's
    die de huidige proposer opdiept (zichtbaar in de queue-FP's) → expliciet als "geen-keurmerk" labelen.
    Dit is precies waar de klassieke proposer faalt en de detector moet excelleren.
- **Train + evalueer** met de 12.2-meetharnas; verdict **alleen op echte regio's** (iter1-les: de
  circulaire synthetische metriek telt niet).
- **A/B náást de klassieke proposer** (geen van de 4 beschermde tests in
  `tests/test_artwork_processing.py` wijzigen; cutover per beeld/globaal; rollback = config).

## Tussenstap (parallel, niet-blokkerend): binaire keurmerk-gate

Een binaire **"keurmerk vs geen-keurmerk"-classifier** op de regio's van de huidige proposer ruimt de
queue **nu** op (filtert de tekst/tabel/pictogram-FP's eruit vóór classificatie) en levert exact de
**hard-negative-trainingsset** die de volwaardige detector nodig heeft. Geen weggegooid werk — het is
de eerste leverbare en de databron voor 12.4. Aparte mini-story; mag vóór de detector-build live.

## Acceptatiecriteria

1. **Niet-keurmerk-FP omlaag (de queue-fix):** op de niet-keurmerk-set (de tekst/tabel/pictogram-regio's
   uit de queue-FP's) is de FP-rate **< 10 %** (huidige proposer is de facto ~100 % op die set).
2. **Merk-recall behouden/verbeterd:** detector-recall @ IoU≥0,5 **≥ 80 %** tegen de 12.6-bboxen
   (12.2-baseline 45 %), bij regio's/beeld in dezelfde orde als de proposer (niet 10×).
3. **Kosten ⊥ #klassen:** per-beeld-latency ≈constant in #klassen (12.2-AC1; `ac1`/`ac1dist`).
4. **End-to-end niet-regressie:** detector → bestaande classify ≥ de klassieke-proposer→classify-
   baseline (12.2: 9,3 % e2e); doel materieel hoger door schonere regio's.
5. **Beschermde tests byte-identiek** (`tests/test_artwork_processing.py` 142–206); A/B-cutover mogelijk.

## Afhankelijkheden

- **Voorwaarde:** `12-4-spike` (A vs B-keuze). **Hergebruikt:** 8.7-synthese (done), 12.6 (schone bboxen
  + diversiteit), Epic 9-trainings-infra, de 12.2-meetharnas, de review→referentie-lus (data-motor).
- **Parallel:** de binaire gate (tussenstap) mag vooruit. **Voedt:** 12.5 (endpoint).
