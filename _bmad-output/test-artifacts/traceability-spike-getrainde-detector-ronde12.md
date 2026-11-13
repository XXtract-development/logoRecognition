---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-13'
scope: SPEC CAP-21 ronde 12 (besluiten Friso 13-11-2026)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-21)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§4, §5, §6a)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde12.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde12-aanvulling-glutenvrij-20261113.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-21 ronde 12

## Gate Decision: PASS

**Rationale:** P0 10/10, P1 6/6, totaal 16/16. `uv run pytest tests/test_ronde12_aanvulling_glutenvrij_20261113.py -q` = 34 passed; met de betrokken bestaande bestanden 244 passed (13-11-2026). Rood vooraf: 15 failed op gedrag.

## Matrix

| # | Criterium | Test(s) | Prio | Dekking |
|---|---|---|---|---|
| 1 | Glutenvrij-rij aan de toetskant, niet aan de trainingskant | `test_r12_toets_rijen_kent_een_glutenvrij_rij_alleen_aan_de_toetskant` | P0 | FULL |
| 2 | Aanvulling: print-laag eerst, maximum, geen eerdere kandidaat, melding | `test_r12_aanvulling_glutenvrij_…` | P0 | FULL |
| 3 | Gewone run kiest geen glutenvrij; lege rij weigert | `test_r12_gewone_kandidatenrun_…`, `test_r12_lege_glutenvrij_rij_…` | P0 | FULL |
| 4 | `ontdubbel` schrijft `-nieuw.json`, herhaalbaar, alleen met `--kandidaten` | `test_r12_ontdubbel_schrijft_de_nieuwe_docs`, `test_r12_ontdubbel_zonder_kandidatenlijst_…` | P0 | FULL |
| 5 | `--met-glutenvrij`: schema/prompt met glutenvrij, ronde 12, eigen bestanden, hint glutenvrij | `test_r12_voorinvulling_met_glutenvrij_…` | P0 | FULL |
| 6 | Onvolledig = fout; 5 op rij stopt | `test_r12_ontbrekende_code_…`, `test_r12_vijf_keer_onvolledig_…` | P0 | FULL |
| 7 | Haiku-verwachting $0,005 alleen met de vlag; gewone run houdt $0,06 | `test_r12_haiku_verwachting_…`, `test_r12_zonder_vlag_blijft_…` | P0 | FULL |
| 8 | Alleen Haiku en met `--docs` | `test_r12_met_glutenvrij_alleen_met_haiku_en_docs[2]` | P0 | FULL |
| 9 | `bouw_nieuw`: asset-url's, `{u, n}`, ware maat, volledige voorinvulling, sjabloon byte-gelijk | `test_r12_bouw_alleen_nieuwe_etiketten_…` | P0 | FULL |
| 10 | Weigeringen (9 gevallen) schrijven niets | `test_r12_bouw_nieuw_weigert_en_schrijft_niets[9]` | P0 | FULL |
| 11 | Lege voorinvulling wordt meegenomen | `test_r12_bouw_neemt_een_lege_voorinvulling_mee` | P1 | FULL |
| 12 | `--lijst` schrijft de uploadlijst; in git geweigerd | `test_r12_lijst_…`, `test_r12_lijst_in_git_werkboom_geweigerd` | P1 | FULL |
| 13 | Opdrachtregel bouwt nieuw; verkeerde combinaties geweigerd | `test_r12_main_bouwt_nieuw_…`, `test_r12_main_weigert_verkeerde_combinaties[5]` | P1 | FULL |
| 14 | Pagina: "0 van N" naast oude records; lege voorinvulling weigert bevestigen | `test_r12_pagina_nieuwe_etiketten_open_…` | P1 | FULL |
| 15 | Geen klantcodes in de nieuwe bestanden | `test_r12_geen_klantcodes_in_de_nieuwe_bestanden` | P1 | FULL |
| 16 | Bestaand gedrag (kandidaten, aanvullingen, startprojectie, ronde-11-pagina) blijft | `test_cap02_kandidaten.py`, `test_ronde3/4`, `test_haiku_standaard`, `test_ronde11_artefact_*`, `test_review_20261101.py` | P1 | FULL |

Buiten de matrix: ophalen en bouwen tegen productie (netwerk, draait als stap daarna), de echte voorinvulling (onder kostenbewaking), de samenvoeging van de nieuwe antwoorden (volgende ronde).

## Gate

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0 | 100% | 100% (10/10) | MET |
| P1 | ≥ 90% | 100% (6/6) | MET |
| Totaal | ≥ 80% | 100% (16/16) | MET |

**Besluit: PASS.**
