# 8.3R Meetrapport — hermeting multi-scale lokalisatie (ACC, 2026-06-06)

**Status: GATE PASSED — 9/9 composiet-recall** (run 3, na herstel van corrupte fase-B-ground-truth met expliciet akkoord Friso — optie A).
Uitgevoerd met `apps/ml-service/scripts/remeasure_localization.py` (reproduceerbaar, read-only) in de draaiende ACC ml-container via expliciete module-loading van de nieuwe engine (geen deploy). Drie runs: 1) stap 1,25 default, 2) stap 1,10 kalibratie, 3) stap 1,10 op herstelde composieten.

## 1. Ground-truth-incident (runs 1–2: gate 4/9 → BLOCKED, daarna hersteld)

De eerste meting faalde **niet door de engine** maar door corrupte testdata uit fase B. Kruisproef van elke crop tegen álle referenties bewees:
- **1 mislabel:** item `28cfae48` (label FSC_MIX, crop 110×73) bevatte aantoonbaar EU_ORGANIC (score 0,914)
- **4 vrijwel witte crops** (mean ≥250, std ~24): items `1a06185f`, `71afbd47`, `aecf8dac`, `8bac3453` — geen logo-inhoud; zelfs niet-uniform gesquishte matching tegen het eigen label scoorde ≤0,17
- Patroon: alle 4 valide items hadden de juiste aspect-ratio voor hun code; alle 5 corrupte items droegen de AR van een ándere referentie — wijst op een label↔crop-verwisseling + mislukte pastes in de fase-B-composietgeneratie. De B4–B7-acceptatie toetste UI-gedrag, niet label↔inhoud-consistentie.
- Engine-bewijs op de valide 4: **4/4 gevonden**; crop-level (exacte schaal) 0,736–0,980.

**Herstel (optie A, akkoord Friso):** 9 items in-place geregenereerd — labels en (x,y) behouden, bbox-afmetingen AR-correct gemaakt, referenties vers alpha-gecomposit op de bronbestanden, nieuwe crops (`artwork-crops/{gtin}/83r-*.png`). Mutaties limitatief: 9 UPDATE-rows, 3 bron-overschrijvingen, 9 nieuwe crop-objecten (script: `regen_composites.py`, sessie-log 2026-06-06).

## 2. Composiet-recall-gate (run 3, definitief): 9/9 ✅

| bron | code | score | IoU |
|---|---|---|---|
| 00008500002456.png | FSC_MIX | 0,873 | 0,948 |
| 05060503504929-composiet | FSC_MIX ×2 | 0,681 / 0,684 | 0,88–0,95 |
| 05060503504929-composiet | V_LABEL | 0,561 | 0,941 |
| 05060503504929-composiet | GREEN_DOT | 0,654 | 0,881 |
| 05060925294569-composiet | GREEN_DOT ×2 | 0,654 / 0,656 | 0,88–0,95 |
| 05060925294569-composiet | V_LABEL | 0,553 | 0,941 |
| 05060925294569-composiet | FSC_MIX | 0,681 | 0,881 |

Geplant (n=9): min 0,553 · mediaan 0,656 · max 0,873 · Niet-geplant (n=30): max 0,588.

## 3. Drempel-kalibratie (output, geen vooraf geprikt getal)

| drempel | recall | FP |
|---|---|---|
| 0,50 | 9/9 | 6 |
| **0,55** | **9/9** | **3** |
| 0,60 | 7/9 | 0 |

**Gekalibreerd: `min_score=0.55` bij `LOCALIZE_SCALE_STEP=1.10`.** Onderbouwing schaal-stap: CCOEFF is gevoelig voor afstand tot de dichtstbijzijnde ladder-stap — bij stap 1,25 (±11% mismatch) zakte detailrijk FSC van 0,98 (exacte schaal) naar 0,39; bij stap 1,10 (±5%) liggen alle plants op 0,55–0,87. De review voorzag dit ("range is kalibratie-output"); advies: defaults aanpassen naar stap 1,10 ten koste van ~2,2× rekentijd. De oude 1446-FP-telling blijft context (andere metric/route), geen vergelijkbare baseline.

## 4. Natuurlijke opbrengst (bevinding 6 — meting, geen gate)

- **Eerste echte detectie: RAINFOREST_ALLIANCE op beide Theunisse-koffie-GTIN's (08710679005795, 08710679016524), topscores 0,68** — boven de gekalibreerde drempel; plausibel voor koffie-artwork, visuele verificatie aanbevolen (geen T3777-declaratie beschikbaar ter kruischeck).
- 11 natuurlijke afbeeldingen (1 PDF zonder afbeeldingssleutel overgeslagen en gerapporteerd) · 517 detecties boven capture-vloer 0,30.
- **Facade-guard:** 153/517 natuurlijke detecties overleven drempel 0,55 (incl. veel duplicaten — meerdere identieke artworkbestanden per GTIN). Valide composiet-plants (0,55–0,87) en natuurlijke top (0,68) liggen in dezelfde band → drempel is niet wereldvreemd; de brede 0,3–0,5-staart bevestigt de noodzaak. Per-klasse drempels (ReferenceLogo-metadata) blijven het aangewezen vervolg (expliciet buiten scope, zie story).

## 5. Throughput

- Run 3 (125 varianten): gem. **11,6 s/bestand** → 39k ≈ **126 uur** single-threaded (binnen `LOCALIZE_TIME_BUDGET_S=30` per bestand; `truncated` niet geraakt; grootste bestand 2273×2879 → 30 tegels)
- Run 1 (55 varianten, stap 1,25): 5,2 s/bestand → 57 uur — de stap-1,10-kwaliteit kost ~2,2×

## 6. Conclusies

1. **AC4 voldaan:** gate 9/9 op herstelde ground truth; drempel als kalibratie-output mét distributies en facade-guard; reproduceerbaar script als deliverable; door de orchestrator zelf uitgevoerd en gediagnosticeerd.
2. De fase-B-productie-failure ("Template larger than tile" → 0 detecties) is opgelost; de engine detecteert nu ook op echte artwork (Rainforest/Theunisse).
3. Productie-aanbeveling: `LOCALIZE_SCALE_STEP=1.10` + `LOCALIZE_MIN_SCORE=0.55` (env), herbevestigen op een bredere natuurlijke set ná 8-3O (orkestratie) — input voor de 8-3O-story zoals gepland.
4. Ground-truth-incident gedocumenteerd als les: composiet-acceptatie hoort label↔inhoud-consistentie te toetsen (kruisproef zit nu in het script).
