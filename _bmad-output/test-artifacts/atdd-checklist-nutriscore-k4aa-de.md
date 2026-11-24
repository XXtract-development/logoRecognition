---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-24'
spec: _bmad-output/specs/spec-nutriscore-k4aa-de/SPEC.md
---

# ATDD-checklist: Nutri-Score D/E in K4-aa

Stack: Python/pytest (ml-service), geen UI. Unit-niveau met de nep-wereld van `test_k4aa_atdd.py` (geen netwerk, geen SigLIP). Bestand: `apps/ml-service/tests/test_k4aa_nutriscore_de_atdd.py`.

| Eis | Test | Prio |
|---|---|---|
| CAP-1 17 codes, D/E niet bruikbaar | `test_cap1_codelist_has_17_codes…` | P0 |
| CAP-1 prompt + schema-enum | `test_cap1_prompt_and_schema_carry_d_and_e` | P0 |
| CAP-1 C zonder "D or E: ander" | `test_cap1_c_description_no_longer…` | P0 |
| CAP-1 parse houdt D/E | `test_cap1_parse_keeps_d_and_e` | P0 |
| CAP-1 blad 15 tegels, bouwscript, nieuwe hash, 1440×1176 | `test_cap1_reference_sheet_is_rebuilt…` | P1 |
| CAP-2 (ronde 2, familiepoort) letter achter andere letter blijft; letter buiten top-3 blijft als andere letter in top-3; confidence = hoogste Nutri-Score-score; gelijk blijft; geen letter in top-3 valt weg; andere codes gelijk | `test_cap2_*` | P0 |
| CAP-2b één balk één letter + onaangetast | `test_cap2b_*` | P0 |
| CAP-2/2b end-to-end scan | `test_cap2_cap2b_scan_end_to_end…` | P0 |
| CAP-4 pins | `test_k4aa_atdd.py`: `len(TOP15) == 17`; hashes worden bij de bouw vastgelegd | P0 |

## Rode fase, gemeten 24-11-2026
- `pytest tests/test_k4aa_nutriscore_de_atdd.py`: **9 rood, 4 groen** (13). Rood om de verwachte reden: D/E ontbreken, `one_letter` en bouwscript bestaan niet, poort kent geen letterregel.
- Groen vooraf als wacht: de drie poort-tests "voor blijft", "gelijk blijft", "plek 4 valt", "andere codes" zonder letterconflict.
- Basislijn vóór de wijziging: `test_k4aa_atdd.py` 38 groen.
- Interface voor de bouw: `k4aa.gate` past de letterregel toe; `k4aa.one_letter(meldingen)` na de poort, vóór `merge`; `apps/ml-service/scripts/k4aa_referentieblad.py` met `TILES` (gesorteerde 15 codes) en `build()`.

## Ronde 2 (24-11-2026)
- Letterregel-tests "achter valt weg" en "voor blijft" vervangen door familie-tests (oorzaak: investigations/nutriscore-k4aa-ronde2-oorzaak-20261124.md).
- Rode fase (tegen de oude k4aa.py): **6 rood** van de eerste 19: letter achter andere letter, letter buiten top-3, confidence, gelijke stemmen → laagste orde, meeste stemmen wint, end-to-end. Na review 4 tests erbij (plek 2/3, stemmen met overlap, IoU 0,5 precies; mutanten M3/M4/M5/M7 sloegen eerst niet aan).
- Omgeving: venv `uv venv -p 3.12` + fastapi httpx opencv-python-headless pillow numpy asyncpg pytest pytest-asyncio pydantic pydantic-settings python-multipart structlog minio.
