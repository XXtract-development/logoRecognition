---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-12'
story: SPEC CAP-9 ronde 11f (besluit Friso 12-11-2026, "Ja, erbij bouwen")
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-9 "Ronde 11f")
  - _bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md (§7)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/tel_proef.py, uitslag.py, samenvoeg_glutenvrij.py
---

# ATDD-checklist: ronde 11f, AI-aandeel aan de zonder-kant in het eindrapport

Stack: pytest (alleen backend). AI-generatie, sequentieel. Verzonnen etiketten met glutenvrij in `bevestigde_codes`.

| Criterium | Test | Prio |
|---|---|---|
| `zonder_ai` telt alleen afwezig + exacte markering ai-r10 + bevestigd; 0 voor andere sleutels (ook Nutri-Score en letters); ≤ zonder | `test_r11f_zonder_ai_telt_alleen_afwezig_met_ai_markering` | P0 |
| besluit en Wilson-grenzen ongewijzigd | `test_r11f_besluit_en_grenzen_veranderen_niet` | P0 |
| md: "(AI n)" alleen bij n > 0, kolommen ongewijzigd, één toelichting per routeblok alleen als n > 0 | `test_r11f_md_toont_ai_aantal_alleen_waar_het_er_is` | P0 |
| nakijkoordeel (ook gelijk aan de AI) maakt menselijk; andere codes houden hun markering; invoer ongewijzigd | `test_r11f_nakijkoordeel_maakt_het_menselijk_ook_als_het_gelijk_is` | P0 |
| gelijk aan `zonder_ai` van gate C na de samenvoeging | `test_r11f_gelijk_aan_gate_c_van_de_samenvoeging` | P1 |
| nakijklijst en `verschil.json` zonder herkomst/`zonder_ai` | `test_r11f_nakijklijst_en_verschil_blijven_zonder_herkomst` | P1 |

## Rode fase

`uv run pytest tests/test_ronde11f_ai_aandeel_20261112.py -q` (map `spike-getrainde-detector`), 12-11-2026: **5 failed, 1 passed**. Rood: geen `zonder_ai` in `tel`, geen "(AI n)" in de md, `corrigeer` laat de markering staan. Groen: de bewaker op nakijklijst en verschil.
