# 8-3P Meetrapport — precisie-kalibratie lokalisatie (FP-reductie op echt artwork)

Datum: 2026-06-07 · Omgeving: ACC (`ml-service` container, read-only) · Story: 8-3P
Reproduceerbaar script: `apps/ml-service/scripts/remeasure_localization.py`
(geladen via `NEW_LOCALIZATION_PATH=/tmp/eight3p/localization.py`).

**Done-criterium (AC4): PASSED** — composiet-recall 9/9 ÉN FP-baseline 1 ≤ 5 op het gepinde artwork.

---

## Bevroren instellingenset (vastgelegd VÓÓR de meting)

| Parameter | Waarde |
|---|---|
| `LOCALIZE_SCALE_MIN_PX` (floor) | **64** (nieuwe default, 8-3P AC1) |
| `LOCALIZE_SCALE_STEP` | **1.10** (8-3R-kalibratie-output, als env meegegeven) |
| `LOCALIZE_SCALE_MAX_PX` | 512 |
| `LOCALIZE_PEAKS_PER_VARIANT` | **3** |
| `LOCALIZE_COLLAPSE_TOP_K` | **3** |
| `LOCALIZE_CLASS_THRESHOLDS` | **`{"RAINFOREST_ALLIANCE": 0.65}`** |
| FP-baseline request-`min_score` | **0.55** (de 8-3R-drempel waarbij 20 FP's optraden) |

De set is één keer vastgelegd en niet bijgesteld tijdens de meting — beide gates
(a) en (b) zijn in dezelfde run gemeten. De RAINFOREST-drempel 0,65 is de
story-voorbeeldwaarde, gericht op de in 8-3R gemeten FP-bron (alle 20 FP's waren
RAINFOREST op de kleinste ladder-schaal).

---

## Gate-uitkomsten

| Gate | Resultaat | Status |
|---|---|---|
| (a) Composiet-recall | **9/9** (capture-drempel 0,30 · IoU ≥ 0,30 · juiste code) | PASSED |
| (b) FP-baseline gepind artwork | **1 detectie** op `artwork/08710679005795/08710679005795.jpg` (gate ≤ 5; was 20) | PASSED |

**Overall AC4: PASSED.**

---

## (a) Composiet-recall (9/9)

Alle 9 geplante logo's over de review-item-bronbestanden worden teruggevonden
met juiste code en hoge IoU (0,88–0,95). De 64px-floor en step-1,10-ladder laten
de composiet-instanties (≥110px) intact.

| bron | code | gevonden | score | IoU |
|---|---|---|---|---|
| 00008500002456.png | FOREST_STEWARDSHIP_COUNCIL_MIX | ✅ | 0,873 | 0,948 |
| 05060925294569.png | FOREST_STEWARDSHIP_COUNCIL_MIX | ✅ | 0,681 | 0,881 |
| 05060925294569.png | EUROPEAN_V_LABEL_VEGAN | ✅ | 0,561 | 0,941 |
| 05060925294569.png | FOREST_STEWARDSHIP_COUNCIL_MIX | ✅ | 0,684 | 0,948 |
| 05060925294569.png | GREEN_DOT | ✅ | 0,654 | 0,881 |
| 05060925294569.png | FOREST_STEWARDSHIP_COUNCIL_MIX | ✅ | 0,681 | 0,881 |
| 05060925294569.png | GREEN_DOT | ✅ | 0,656 | 0,948 |
| 05060925294569.png | EUROPEAN_V_LABEL_VEGAN | ✅ | 0,553 | 0,941 |
| 05060925294569.png | GREEN_DOT | ✅ | 0,654 | 0,881 |

**Score-distributie (composieten):**
- Geplant (n=9): min 0,553 · mediaan 0,656 · max 0,873
- Niet-geplant (n=12, op composieten, ≥ capture-drempel 0,30): min 0,301 · max **0,445**

De geplante en niet-geplante populaties scheiden schoon: élke geplante instantie
≥ 0,553, élke niet-geplante ≤ 0,445. Een composiet-drempel ≥ 0,50 levert dus
9/9 recall met 0 composiet-FP.

---

## (b) FP-baseline — gepind artwork (vóór → ná)

| | detecties op `08710679005795.jpg` |
|---|---|
| **Vóór (8-3R, drempel 0,55, floor 48)** | **20** (≥19 FP, vrijwel allemaal RAINFOREST op 48×35…77×57 px) |
| **Ná (8-3P, bevroren set)** | **1** |

De enige overgebleven detectie:

| code | score | drempel | bbox |
|---|---|---|---|
| RAINFOREST_ALLIANCE | 0,665 | 0,65 | 1324,394 · 77×57 |

De 64px-floor verwijdert de sub-64px FP-fabriek; de per-klasse RAINFOREST-drempel
0,65 filtert de resterende groene-textuur-correlaties (die in 8-3R tot ~0,68
reikten). Eén RAINFOREST-detectie van 0,665 blijft net boven 0,65 — ruim binnen de
≤5-gate. Dit is een kandidaat voor het menselijk label (zie §labelsample); bij
een vals-oordeel kan een volgende iteratie de drempel licht verhogen binnen de
bevroren-set-discipline.

---

## (c) Labelsample-overzicht (wacht op labels)

Het script genereert sectie 6 van de stdout-output: een markdown-tabel met **alle**
overgebleven detecties op de ACC-artworks ≥ de capture-drempel 0,30, mét
crop-thumbnails als base64 PNG data-URI's en scores. Dit is het láge-drempel
superset (286 detecties) voor menselijke echt/vals-beoordeling — bewust ruim, NIET
de productie-gefilterde set. De FP-gate (b) hierboven is gemeten op de bevroren
productie-drempels, niet op deze capture-floor.

**UITSLAG LABELRONDE (Friso, 2026-06-07):** productie-gefilterd pakket (2 detecties, ontdubbeld): #1 FSC@0,873 op 00008500002456 = **echt** (composiet-plant — mechanisme bevestigd) · #2 RAINFOREST@0,665 op Theunisse-koffie = **VALS**. **Natuurlijke precisie: 0/1** — de eerder gerapporteerde "eerste natuurlijke detectie" is door de menselijke beoordelaar verworpen; op de natuurlijke ACC-set is nog géén echt keurmerk bevestigd (definitief antwoord op 8-3R-bevinding 6 voor deze set). Kalibratie-iteratie: RAINFOREST-drempel 0,65 → 0,70 (FP zat op 0,665); de bijbehorende koffie-reviewitems zijn gereject. Brede natuurlijke validatie volgt bij de bulk-voorbereiding op gevarieerder artwork.

**Oorspronkelijke status: wacht op labels.** Een menselijke beoordelaar vult de kolom `label`
(echt/vals) in; precision = echt / totaal per gekozen drempel. Beslismoment PO:
precisie voldoende voor 8-3O-bulk → doorgaan; anders volgende kalibratie-iteratie.

Reproductie van het label-overzicht (read-only):

```
docker exec \
  -e NEW_LOCALIZATION_PATH=/tmp/eight3p/localization.py \
  -e LOCALIZE_SCALE_STEP=1.10 -e LOCALIZE_SCALE_MIN_PX=64 \
  -e LOCALIZE_CLASS_THRESHOLDS='{"RAINFOREST_ALLIANCE":0.65}' \
  -e FP_BASELINE_MIN_SCORE=0.55 \
  <ml> sh -c 'PYTHONPATH=/app python3 /tmp/eight3p/remeasure_localization.py'
```

---

## Throughput-delta

- Gemiddeld **10,34 s/bestand** (110 ladder-varianten × ~tegels, step 1,10).
- Extrapolatie 39.000 bestanden: **~112 uur** single-threaded op de huidige container.
- De step-1,10-ladder is fijner dan de default 1,25 (meer varianten → hogere
  recall, maar tragere doorvoer); de bulk-orkestratie (8-3O) kan parallelliseren.
  De default-step in de code blijft 1,25; 1,10 is een ACC-meting-env, geen
  code-default.

---

## Verificatie & reproduceerbaarheid

- STRIKT READ-ONLY: uitsluitend SELECT-queries; geen review-items, geen MinIO-writes,
  geen rebuilds, geen container-herstarts.
- De nieuwe `localization.py` is via `NEW_LOCALIZATION_PATH` geladen (de
  geïnstalleerde module wordt verdrongen, geen deploy).
- Unit-/handler-tests (39 passed, 0 failed, 0 skipped) dekken de engine-wijzigingen;
  deze hermeting dekt het empirische done-criterium (AC4) op echte ACC-data.
