---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-12'
scope: SPEC CAP-3 "Ronde 11e" (besluit Friso 12-11-2026, "35, gelijk aan de eis")
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-3 "Ronde 11e")
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11e.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde11e-doel-glutenvrij-20261112.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-3 "Ronde 11e"

## Gate Decision: PASS

**Rationale:** P0 4/4, P1 3/3, totaal 7/7. `uv run pytest tests/test_ronde11e_doel_glutenvrij_browser_20261112.py -q` = 8 passed (12-11-2026); rood vooraf 4 failed op gedrag.

## Matrix

| # | Criterium | Test(s) | Prio | Dekking |
|---|---|---|---|---|
| 1 | Glutenvrij toont "zonder y/35", gehaald bij mét ≥ 16 en zonder ≥ 35; tooltip met "(doel gehaald)" | `test_r11e_glutenvrij_doel_35_en_andere_50`, `test_r11e_glutenvrij_34_zonder_is_niet_gehaald`, `test_r11e_glutenvrij_met_te_weinig_mét_…` | P0 | FULL |
| 2 | Andere keurmerken houden 50 (35 en 49 niet gehaald, 50 wel) | idem + `test_r11e_glutenvrij_zonder_stand_toont_nul_van_35` | P0 | FULL |
| 3 | Geen extra regel: alle 14 rijen op één scherm met de langste tekst in 1440×800 en 1920×970 | `test_r11e_langste_standtekst_houdt_alles_op_een_scherm[2]` | P0 | FULL |
| 4 | Paginadoel glutenvrij gelijk aan `train.MIN_ZONDER` | `test_r11e_paginadoel_glutenvrij_gelijk_aan_gate_c` | P0 | FULL |
| 5 | Ontbrekende stand valt terug op 0/35 en 0/50 | `test_r11e_glutenvrij_zonder_stand_toont_nul_van_35` | P1 | FULL |
| 6 | `index.html` en `index-ronde10.html` byte-gelijk | `test_r11e_paginabestanden_blijven_gelijk` | P1 | FULL |
| 7 | Server-`/stand`, artefactpagina en meetdoel ongewijzigd | diff (geen wijziging aan `invul/server.py`, `uitslag.py`, `invul/artefact/`, meetdoel in meetregels §4) + volle suite | P1 | FULL |

## Gaten

Geen kritieke of hoge. Uitgesteld: UX-documenten (deferred-work.md).

## Gate

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0 | 100% | 100% (4/4) | MET |
| P1 | ≥ 90% | 100% (3/3) | MET |
| Totaal | ≥ 80% | 100% (7/7) | MET |

**Besluit: PASS.**
