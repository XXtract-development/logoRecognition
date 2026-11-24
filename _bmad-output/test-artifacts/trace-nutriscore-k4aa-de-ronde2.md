---
spec: _bmad-output/specs/spec-nutriscore-k4aa-de/SPEC.md (ronde 2, 24 november 2026)
datum: 2026-11-24
gate: PASS voor bouw (CAP-1, 2, 2b, 2c, 4); CAP-5 en CAP-6 open tot de deelmeting
---

# Traceermatrix ronde 2

Tests: `apps/ml-service/tests/test_k4aa_nutriscore_de_atdd.py` (23) + `test_k4aa_atdd.py` + `test_k4aa_vergelijk_norm.py`: 67 groen (VERIFIED, `pytest … -q`). Rode run tegen oude `k4aa.py`: 6 rood van de eerste 19 (zie atdd-checklist). Mutatietest review: 11 mutanten, 4 overleefden, daarna 4 tests erbij.

| Eis | Test(s) | Status |
|---|---|---|
| CAP-1 codes/prompt/schema/blad | `test_cap1_*` (5) | gedekt |
| CAP-2 letter achter andere letter blijft; letter buiten top-3 blijft; confidence = hoogste Nutri-Score-score; gelijk; plek 2/3; plek 4 valt weg; andere codes gelijk | `test_cap2_letter_behind…`, `…missing_from_top3…`, `…confidence_is…`, `…equal_scores…`, `…rank_2_or_3…`, `…without_any_letter…`, `…rank_4_…via_top_codes`, `…other_codes…` | gedekt |
| CAP-2b één balk één letter; stemmen; overlap; IoU 0,5; gelijkstand laagste orde; ketens; e2e | `test_cap2b_*`, `test_cap2_cap2b_scan_end_to_end…` | gedekt |
| CAP-2c `letter_dropped`, `na_poort` | `test_cap2b_scan_calls_one_letter_and_counts_what_it_drops` | gedekt |
| CAP-3 (vervallen) | n.v.t. (siglip_references_incomplete: bestaande test in `test_k4aa_atdd.py`) | n.v.t. |
| CAP-4 pins, 17 codes | `test_k4aa_atdd.py` pins (r.157-170) | gedekt |
| CAP-5 deelmeting + conclusie | geen test (meting op ACC) | **OPEN** |
| CAP-6 ACC terugzetten | geen test (bewijs per commando) | **OPEN** |

Bekende restpunten (review): stemmen tellen meldingen, geen vensters; gelijkstand → venster 0; afgesneden balk kan twee letters geven; `confidence` is voor NUTRISCORE_* niet letterzeker. Meetbaar in de deelmeting.
