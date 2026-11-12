---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-12'
scope: SPEC CAP-3 "Ronde 10, browser" (ronde 11d)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-3)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6 "Glutenvrij op de pagina", "Opslaan")
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11d.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde11d-glutenvrij-rij-20261112.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-3 "Ronde 10, browser" (ronde 11d)

## Gate Decision: PASS

**Rationale:** P0 5/5 (100%), P1 4/4 (100%), totaal 9/9. De volle suite zonder zware tests is groen; de nieuwe tests zijn aantoonbaar rood tegen de pagina van vóór glutenvrij.

## Tests (stap 2)

`uv run pytest tests/test_ronde11d_glutenvrij_rij_browser_20261112.py tests/test_ronde5_browser_20261101.py tests/test_ronde7_browser_20261102.py tests/test_ronde9_browser_20261102.py -q` (map `spike-getrainde-detector`), 12-11-2026: **70 passed**. Faalbewijs: tegen `invul/index.html` van c2d73ed falen 6 van de 7 nieuwe tests (tijdelijk teruggezet, daarna byte-gelijk hersteld).

## Matrix (stap 3)

| # | Criterium | Test(s) | Prio | Dekking |
|---|---|---|---|---|
| 1 | 14 rijen in vaste volgorde, glutenvrij na PlanetProof en vóór Nutri-Score; 13 keuzegroepen | `test_r11d_glutenvrij_rij_…`, `test_r9b_vier_nieuwe_rijen_…`, `test_r7_opbouw_…`, `test_r5_browser_v_label_…`, `test_r5_browser_stand_toont_9_…` | P0 | FULL |
| 2 | Glutenvrij-rij: keuze, stand, AI-merkje, gewijzigd, aria-label, voorinvulling | `test_r11d_glutenvrij_rij_…` | P0 | FULL |
| 3 | Bevestigen zonder glutenvrij: opgeslagen zonder glutenvrij; met glutenvrij: in `bevestigde_codes` | `test_r11d_bevestigen_zonder_…`, `test_r11d_bevestigen_met_…` | P0 | FULL |
| 4 | 1/2/3 schuift door tot glutenvrij, blijft daar, nooit naar Nutri-Score | `test_r11d_123_…`, `test_r9b_123_…`, `test_r7_toetsen_123_en_pijlen_per_rij` | P0 | FULL |
| 5 | Alle 14 rijen op één scherm in 1440×800 en 1920×970, rij ≤ 32,5 px | `test_r9b_alle_rijen_op_een_scherm_zonder_paginascroll[8]` | P0 | FULL |
| 6 | 4/5/0 doen niets op glutenvrij | `test_r11d_456_en_0_…`, `test_r7_nutriscore_toetsen_en_456_0_elders_niets` | P1 | FULL |
| 7 | Pijl-omlaag 13× = Nutri-Score, terug = glutenvrij, grenzen 0 en 13 | `test_r11d_pijlen_…`, `test_r7_toetsen_123_en_pijlen_per_rij`, de Nutri-Score-tests van ronde 7 | P1 | FULL |
| 8 | Glutenvrij buiten het nalopen; notitie over de vier | `test_r11d_glutenvrij_valt_buiten_het_nalopen` | P1 | FULL |
| 9 | Volle suite `-m "not zwaar"` groen | volle run (spec ronde 11d) | P1 | FULL |

## Gaten (stap 4)

Kritiek en hoog: geen. Uitgesteld (deferred-work.md): doelwaarde "zonder" voor glutenvrij op de pagina (50 tegen gate C 35), twee gelijke paginabestanden, indelingstest zonder speling.

## Gate (stap 5)

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0-dekking | 100% | 100% (5/5) | MET |
| P1-dekking | ≥ 90% | 100% (4/4) | MET |
| Totaal | ≥ 80% | 100% (9/9) | MET |

**Besluit: PASS.**
