---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-12'
scope: SPEC CAP-9 "Ronde 11f" (besluit Friso 12-11-2026, "Ja, erbij bouwen")
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-9 "Ronde 11f")
  - _bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md (§7)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11f.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde11f-ai-aandeel-20261112.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-9 "Ronde 11f"

## Gate Decision: PASS

**Rationale:** P0 6/6, P1 3/3, totaal 9/9. `uv run pytest tests/test_ronde11f_ai_aandeel_20261112.py tests/test_ronde11c_samenvoeg_20261112.py -q` = 49 passed; met de bestaande telling- en nakijktests 181 passed (12-11-2026). Rood vooraf: 5 failed op gedrag.

## Matrix

| # | Criterium | Test(s) | Prio | Dekking |
|---|---|---|---|---|
| 1 | `zonder_ai` telt alleen afwezig + exact `ai-r10` + bevestigd; 0 voor andere sleutels (ook Nutri-Score en letters); ≤ zonder | `test_r11f_zonder_ai_telt_alleen_afwezig_met_ai_markering` | P0 | FULL |
| 2 | Besluit en Wilson-grenzen ongewijzigd | `test_r11f_besluit_en_grenzen_veranderen_niet` + bestaande `test_cap09_*` | P0 | FULL |
| 3 | md: "(AI n)" alleen bij n > 0, kolommen ongewijzigd, toelichting per routeblok alleen bij n > 0 | `test_r11f_md_toont_ai_aantal_alleen_waar_het_er_is`, `test_r11f_blind_nakijken_…` | P0 | FULL |
| 4 | Nakijkoordeel (ook gelijk aan de AI) maakt menselijk, eerste en tweede ronde | `test_r11f_nakijkoordeel_maakt_het_menselijk_…`, `test_r11f_blind_nakijken_eerste_en_tweede_ronde_…` | P0 | FULL |
| 5 | Alleen de AI-markering vervalt; menselijke markering blijft | `test_r11f_nakijken_haalt_alleen_de_ai_markering_weg` | P0 | FULL |
| 6 | Ook in `tabellen-na-nakijken` (json en md) | `test_r11f_blind_nakijken_…` | P0 | FULL |
| 7 | Gelijk aan `zonder_ai` van gate C na de samenvoeging (één gedeelde markering) | `test_r11f_gelijk_aan_gate_c_van_de_samenvoeging` | P1 | FULL |
| 8 | Nakijklijst en `verschil.json` zonder herkomst / `zonder_ai` | `test_r11f_nakijklijst_en_verschil_blijven_zonder_herkomst` | P1 | FULL |
| 9 | Bestaande telling, nakijkstappen en md-kolommen blijven werken | `tests/test_cap09_telling.py`, `test_review_besluiten_20261101.py`, `test_besluiten_20261101.py`, `test_review_20261101.py` | P1 | FULL |

## Gaten

Geen kritieke of hoge. Uitgesteld: splitsing van de steekproeffouten naar herkomst (deferred-work.md).

## Gate

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0 | 100% | 100% (6/6) | MET |
| P1 | ≥ 90% | 100% (3/3) | MET |
| Totaal | ≥ 80% | 100% (9/9) | MET |

**Besluit: PASS.**
