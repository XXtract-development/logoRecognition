# 8.3R Meetrapport — hermeting multi-scale lokalisatie (ACC, 2026-06-06)

**Status: GATE BLOCKED — 4/9, aantoonbaar door corrupte ground truth in de fase-B-composieten, niet door de engine.**
Uitgevoerd met `apps/ml-service/scripts/remeasure_localization.py` (reproduceerbaar, strikt read-only) in de draaiende ACC ml-container via expliciete module-loading van de nieuwe engine (geen deploy). Twee runs: ladder-stap 1,25 (default) en 1,10 (kalibratie).

## Opzet

- Referenties: 5 actieve (EU_ORGANIC, V_LABEL, FSC_MIX, GREEN_DOT, RAINFOREST) · ladder 48→512px
- Composiet-reconstructie: per review-item de bewaarde crop teruggeplakt op de geregistreerde bbox (identiteit als bron al composiet is)
- Gevonden = juiste t3777-code met IoU ≥ 0,3 · capture-drempel 0,30 voor distributies

## 1. Composiet-recall-gate: 4/9 — ground truth 5/9 corrupt

| # | label | crop | inhoud (kruisproef tegen álle referenties) | oordeel |
|---|---|---|---|---|
| 28cfae48 | FSC_MIX | 110×73 | **EU_ORGANIC, score 0,914** | ❌ MISLABEL |
| 1a06185f | FSC_MIX | 110×146 | geen enkele referentie (max 0,00); mean 252, std 25 → **vrijwel wit** | ❌ LEEG/CORRUPT |
| 71afbd47 | FSC_MIX | 110×146 | idem (vrijwel wit) | ❌ LEEG/CORRUPT |
| aecf8dac | GREEN_DOT | 110×146 | max 0,13 (V_LABEL); mean 250 → **vrijwel wit** | ❌ LEEG/CORRUPT |
| 8bac3453 | GREEN_DOT | 110×146 | idem | ❌ LEEG/CORRUPT |
| e5bbe73e | V_LABEL | 110×146 | V_LABEL **0,848** | ✅ valide → **GEVONDEN** |
| 7e024d5b | V_LABEL | 110×146 | V_LABEL **0,848** | ✅ valide → **GEVONDEN** |
| 58023c04 | FSC_MIX | 110×110 | FSC_MIX **0,980** | ✅ valide → **GEVONDEN** |
| 253088a2 | GREEN_DOT | 110×110 | GREEN_DOT **0,736** | ✅ valide → **GEVONDEN** |

**Engine-oordeel: 4/4 op valide ground truth.** De 5 gemiste items kunnen door géén enkele engine gevonden worden: 4 crops bevatten nauwelijks beeldinhoud (bijna wit; zelfs niet-uniform "gesquishte" matching tegen het eigen label scoort ≤ 0,17) en 1 crop bevat aantoonbaar een ánder keurmerk dan het label. Alle bboxes passen overigens binnen de bronafbeeldingen (dat is uitgesloten als oorzaak). De toplaag "niet-geplante" detecties (tot 0,681) valt samen met de werkelijke inhoud van de mislabel-locaties — de corruptie vergiftigt dus ook de FP-statistiek.

> Herkomst vermoedelijk een fout in de fase-B-composietgeneratie/registratie (label↔crop-verwisseling + 4 mislukte pastes). De B4–B7-acceptatie keek naar UI-gedrag (crops/labels/knoppen), niet naar label↔inhoud-consistentie — vandaar onopgemerkt.

## 2. Kalibratie (op de 4 valide items)

| | run 1 (stap 1,25) | run 2 (stap 1,10) |
|---|---|---|
| Varianten | 55 | 125 |
| Valide-plant-scores | 0,393–0,848 | 0,593–0,684 |
| Recall 4/4 t/m drempel | 0,35 | **0,55** |
| FP boven die drempel | 26 (incl. mislabel-content) | 5 (idem) |

**Kerninzicht schaal-mismatch:** CCOEFF is gevoelig voor de afstand tot de dichtstbijzijnde ladder-stap. Crop-level (exacte schaal) scoren de valide logo's 0,74–0,98; met stap 1,25 (max ±11% mismatch) zakt detailrijk FSC naar 0,39; met stap 1,10 (max ±5%) liggen alle valide plants op 0,59–0,68. **Kalibratie-advies: `LOCALIZE_SCALE_STEP=1.10` + drempel 0,55** (hoogste drempel met volledige recall op valide items). NB: de gerapporteerde "FP's" op de composieten zijn grotendeels géén echte FP's (zie boven); een schone FP-meting vereist herstelde ground truth. De oude 1446-telling blijft context, geen vergelijkbare baseline.

## 3. Natuurlijke opbrengst (bevinding 6 — meting, geen gate)

11 natuurlijke afbeeldingen gescand (1 PDF zonder afbeeldingssleutel overgeslagen, gerapporteerd):

- **RAINFOREST_ALLIANCE prominent op beide Theunisse-koffie-GTIN's (08710679005795, 08710679016524): topscores 0,663–0,672** — boven de geadviseerde drempel; plausibel (koffie-artwork) maar visuele verificatie vereist (geen declaratie beschikbaar). Dit zou de éérste natuurlijke detectie zijn.
- Distributie: ≥0,60: 112 (allemaal RAINFOREST; bevat duplicaten — meerdere identieke artwork-bestanden per GTIN) · 0,50–0,59: 35 · 0,40–0,49: 81 · 0,30–0,39: 275
- **Facade-guard:** valide composiet-plants (0,59–0,68) en natuurlijke topdetecties (0,66–0,67) liggen in dezelfde band → de composiet-gekalibreerde drempel 0,55 is niet wereldvreemd. De brede 0,3–0,5-staart bevestigt dat de drempel nodig is.

## 4. Throughput

- Run 1 (55 varianten): gem. 5,2 s/bestand → **39k ≈ 57 uur** single-threaded
- Run 2 (125 varianten): gem. ≈ 12 s/bestand → **39k ≈ 130 uur** single-threaded (richtwaarde; binnen time-budget 30 s/bestand)
- Grootste bestand 2273×2879 → 30 tegels; budget-afkap (`truncated`) niet geraakt

## 5. Conclusies & vervolg

1. **Engine werkt en is gekalibreerd**: 4/4 valide plants, crop-level 0,74–0,98, eerste plausibele natuurlijke detectie (RAINFOREST op Theunisse). De productie-failure uit fase B ("template larger than tile" → 0 detecties) is opgelost.
2. **Gate formeel BLOCKED (4/9)** — niet versoepeld conform story-contract. Oorzaak ligt in de testdata, niet in de engine.
3. **Vervolgopties (besluit Friso):** (A) composieten opnieuw genereren met schone ground truth (DB/MinIO-mutaties → expliciete toestemming) en gate herdraaien — verwachting: pass op drempel 0,55/stap 1,10; (B) de 5 corrupte items corrigeren/verwijderen (DB-mutatie) en gate op de herstelde set; (C) gate herdefiniëren op crop-level-bewijs (spec-wijziging).
4. Kalibratie-output voor productie: `LOCALIZE_SCALE_STEP=1.10`, `min_score=0.55` (env), te bevestigen ná herstelde ground truth + bredere natuurlijke set.
