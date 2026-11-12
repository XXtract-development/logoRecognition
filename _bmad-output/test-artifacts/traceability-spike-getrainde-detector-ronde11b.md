---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-12'
scope: SPEC CAP-19 ronde 11b (besluit Friso 12-11-2026, "35, rest volgt de AI")
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-19, sub-bullet ronde 11b; constraint publicatie)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6a, bullet ronde 11b)
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde11b.md
  - _bmad-output/test-artifacts/atdd-checklist-ronde11b-alleen-ai-glutenvrij-20261112.md
  - _bmad/tea/testarch/knowledge/{test-priorities-matrix,risk-governance,probability-impact,test-quality,selective-testing}.md
---

# Traceability: CAP-19 ronde 11b

## Gate Decision: PASS

**Rationale:** P0 8/8 (100%), P1 3/3 (100%), totaal 11/11. Geen gaten binnen de scope van deze build.

## Tests (stap 2)

`uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q` (proefmap), 12-11-2026: 36 passed (ronde 11 en 11b). Nieuw voor 11b: 4 browsertests (fixture `gefilterd`, met een niet-getoond afgehandeld en een niet-getoond na te lopen record) en 7 unittests (waarvan 3 geparametriseerd). Foutpaden: weigeringen vóór het filter, nul getoond, afwijkend verwacht aantal.

## Matrix (stap 3)

| # | Criterium | Test(s) | Niveau | Prio | Dekking |
|---|---|---|---|---|---|
| 1 | Filter houdt precies AI-glutenvrij `true`, bronvolgorde, item = bron + oordeel; telling | `test_11b_filter_houdt_precies_de_ai_glutenvrij_etiketten_in_bronvolgorde` | unit | P0 | FULL |
| 2 | Weigeringen over de hele bron vóór het filter (niet-booleaans, zonder voorinvulling, afwijkend bestaand) | `test_11b_weigeringen_gelden_over_de_hele_bron_voor_het_filter[3]` | unit | P0 | FULL |
| 3 | Nul getoonde etiketten geweigerd | `test_11b_nul_getoonde_etiketten_wordt_geweigerd` | unit | P1 | FULL |
| 4 | Opdrachtregel drukt "getoond X van Y" af | `test_11b_main_met_optie_drukt_getoond_x_van_y_af` | unit | P1 | FULL |
| 5 | `--verwacht N` weigert bij een ander aantal, schrijft niets | `test_11b_verwacht_aantal_wijkt_af_wordt_geweigerd` | unit | P0 | FULL |
| 6 | Zonder optie bouw van ronde 11 ongewijzigd | ronde-11-bouwtests (`test_zet_glutenvrij_…`, `test_buiten_items_…`, `test_herbouwen_…`, weigeringen) | unit | P0 | FULL |
| 7 | Voortgang en nalopen alleen over getoonde etiketten ("x van N"); niet-getoonde records tellen niet | `test_11b_teller_en_nalopen_over_de_getoonde_etiketten` | browser | P0 | FULL |
| 8 | Stand per keurmerk telt bevestigde records van niet-getoonde etiketten | `test_11b_stand_telt_bevestigde_records_van_niet_getoonde_etiketten` | browser | P1 | FULL |
| 9 | Download exporteert alle records, ook niet-getoonde, en schrijft niets | `test_11b_download_exporteert_alle_records_ook_niet_getoonde` | browser | P0 | FULL |
| 10 | Antwoord te laat blijft goed (ook op de gefilterde pagina) | `test_late_opslag_van_a_overschrijft_b_niet`, `test_11b_late_opslag_raakt_niet_getoonde_records_en_het_volgende_etiket_niet` | browser | P0 | FULL |
| 11 | Records van niet-getoonde etiketten worden niet aangeraakt | idem #10 (alleen X1 geschreven, H1/H2 gelijk) en #9 (0 schrijfacties) | browser | P0 | FULL |

Buiten de matrix (geen gedrag van deze build): de samenvoeging in de proefmap (DRAAIPLAN stap 5, hoofdsessie; herkomstveld en telling uitgesteld in deferred-work.md) en de open productvraag over gate C (SPEC Open Questions).

## Gaten (stap 4)

Kritiek en hoog: geen. Gedeeltelijk: geen. Aanbeveling: test voor de samenvoeging zodra die gebouwd wordt (deferred-work.md).

## Gate (stap 5)

| Criterium | Vereist | Werkelijk | Status |
|---|---|---|---|
| P0-dekking | 100% | 100% (8/8) | MET |
| P1-dekking | ≥ 90% | 100% (3/3) | MET |
| Totaal | ≥ 80% | 100% (11/11) | MET |

**Besluit: PASS.**
