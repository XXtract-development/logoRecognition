# Story 12.15 — map-bouw + DRY_RUN van de declaratie-gedreven Nutri-Score-oogst (ACC)

Datum: 2026-07-14 · branch `epic-12-15`. **STAP 1** schreef de GTIN→letter-map naar MinIO (de enige toegestane write). **STAP 2** draaide de oogst in **DRY_RUN** (0 review-writes). Verder read-only. App-image ~`194b6f8` (ACC), ml-image `194b6f8`.

## Verdict: **DOORBRAAK bevestigd** — de bestaande artwork levert genoeg C én D voor conditie C

De declaratie-map bevat **22 C- en 16 D-GTINs**; de DRY_RUN-oogst zou daaruit **13 NUTRISCORE_C- en 9 NUTRISCORE_D-crops** aanmaken met een **gegarandeerd-juist gedeclareerd label**. Beide letters komen ruim boven de k=3-drempel → conditie C wordt haalbaar voor C én D. Geen review-writes in deze run.

---

## STAP 1 — GTIN→letter-map gebouwd (write toegestaan)

- **MinIO-sleutel:** `flywheel-index/nutriscore-declared-map.json` (TRAINING-bucket), 4.124 bytes, 142 entries.
- **Methode:** de branch-map-bouwlogica (Story 12.15) uitgevoerd tegen ACC via de bestaande, ongewijzigde `resolveDeclaredMarks` (12.7) + de storage-adapter uit de gedeployde app-dist. Harde **leak-guard**: alleen `fieldType='NutritionalScore'` én een **kale, enkele letter A–E** (categorie-codes zoals GENERAL_FOODS/CHEESES die via de 12.7-regex meelekken worden verworpen); >1 distincte letter → ambigu (overgeslagen, geen gok).
- **Verdeling (1.862 artwork-GTINs verwerkt):**

| | A | B | **C** | **D** | E | resolved | geen-declaratie | ambigu | fout |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| GTINs | 30 | 33 | **22** | **16** | 41 | **142** | 1.720 | 0 | 0 |

(Deze run had 0 catalog-fouten — de eerdere dekkingsmeting toonde dezelfde C=22/D=16 met nog wat ongeresolvede api-fouten, dus dit is de schone, iets completere stand.)

## STAP 2 — DRY_RUN van de oogst (C/D-scope, 0 writes)

Configuratie (branch-defaults): `NUTRISCORE_DECLARED_HARVEST_DRY_RUN=1`, scope `C,D` (default), `FLOOR=0.60` (cosine-drempel tegen de Nutri-Score-pool), `PER_CODE_CAP=15`, `BATCH=400`. Pipeline per (C/D-)GTIN: artwork-pagina → `propose_regions` → gate-voorfilter → **best-of-regio** (hoogste cosine ≥ FLOOR tegen de NUTRISCORE_A–E-pool) → dedup-read (draait ook in DRY_RUN) → per-letter-cap → zou croppen + INSERT'en onder de **gedeclareerde letter**.

**Resultaat:**
```
{"dry_run": true, "candidates": 22, "inserted": 0,
 "per_code": {"NUTRISCORE_C": 13, "NUTRISCORE_D": 9},
 "skipped_below_floor": 16, "skipped_duplicate": 0, "skipped_cap": 0,
 "total_gtins": 38, "from_offset": 0, "to_offset": 38, "remaining": 0, "seconds": 96.3}
```

| Letter | declared-GTINs (map) | zou crops aanmaken | overgeslagen (geen vakje ≥ drempel) |
|--------|---------------------:|-------------------:|------------------------------------:|
| **C** | 22 | **13** | 9 |
| **D** | 16 | **9** | 7 |
| **Totaal** | 38 | **22** | 16 |

- **13 C + 9 D crops** — beide **≥ 3** → **conditie C wordt haalbaar voor C én D** zodra deze crops (met gegarandeerd label) door een mens bevestigd/geregistreerd zijn.
- **16 GTINs overgeslagen** (`skipped_below_floor`) omdat er geen Nutri-Score-vakje boven de cosine-drempel gevonden werd → **AC3: geen fabricatie** (liever niets voorleggen dan een onbetrouwbare crop).
- `skipped_duplicate=0` (verse oogst), `skipped_cap=0` (ruim onder de cap van 15).

## 0 review-writes bevestigd
- `dry_run: true`, `inserted: 0` → het volledige write-blok (crop-upload + `INSERT artwork_review_items` + state-write) is overgeslagen.
- De `NoSuchKey` op `keurmerk-harvest/nutriscore-declared-state.json` bevestigt dat de state-key niet bestaat én NIET is aangemaakt.
- Enige write in de hele opdracht: de map-file (STEP 1, toegestaan). Gedeployde containers ongemoeid (DRY_RUN in wegwerp-container met branch-app read-only gemount). Staging opgeruimd.

## Waarom dit beter is dan 12.12
Bij de 12.12-vorm-oogst gokte een mens de letter op kleur → 33/40 afgekeurd. Hier komt het label uit de **GDSN-declaratie** (gegarandeerd juist); de mens hoeft alleen te bevestigen dat de crop het Nutri-Score-logo ís, niet welke letter. Verwachte accept-ratio dus veel hoger, en C/D krijgen eindelijk echte, correct-gelabelde crops.

*STAP 1 schreef alleen de map-file; STAP 2 volledig DRY_RUN (0 review-writes). Drempel 0,60, cap 15. Branch `epic-12-15`.*
