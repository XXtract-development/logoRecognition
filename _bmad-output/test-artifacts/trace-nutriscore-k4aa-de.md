---
id: trace-nutriscore-k4aa-de
spec: SPEC-nutriscore-k4aa-de
datum: 2026-11-24
---
# Traceability — Nutri-Score K4-aa D/E

Gate: **PASS voor bouw** (CAP-1, 2, 2b, 2c, 4 gedekt door tests, 61 passed), **FAIL voor doel** (eis per letter niet gehaald).

| CAP | Dekking | Resultaat |
|---|---|---|
| CAP-1 | tests/test_k4aa_nutriscore_de_atdd.py (codes, prompt/schema, C-omschrijving, parse, blad/bouwer) | groen |
| CAP-2 | idem, 5 poorttests + end-to-end met CropEmbedder-mutatie | groen |
| CAP-2b | idem, overlap/ongemoeid/keten/gelijk | groen |
| CAP-2c | idem, stats.letter_dropped | groen |
| CAP-3 | niet gemeten (referentiestaat ACC niet uitgelezen) | GAT, gemeld |
| CAP-4 | tests/test_k4aa_atdd.py pins bijgewerkt | groen |
| CAP-5 | deelset gemeten; 352 niet (drempel) | uitgevoerd, zie investigations/nutriscore-k4aa-de-deelset-20261124.md |
| CAP-6 | Coolify-variabelen weg, health 200, oude sleutel 401 | gedaan; testscan-modelVersion UNVERIFIED |

Lokale test: `cd apps/ml-service && python -m pytest tests/test_k4aa_atdd.py tests/test_k4aa_nutriscore_de_atdd.py tests/test_k4aa_vergelijk_norm.py -q`
