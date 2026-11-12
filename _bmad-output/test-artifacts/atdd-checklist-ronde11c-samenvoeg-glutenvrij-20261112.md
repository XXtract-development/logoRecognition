---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-12'
story: SPEC CAP-20 ronde 11c (samenvoeging glutenvrij in toets/uitslag.json)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-20)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6b)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/uitslag.py, train.py (poort_glutenvrij)
  - _bmad/tea/testarch/knowledge/{data-factories,test-quality,test-levels-framework,test-priorities-matrix}.md
---

# ATDD-checklist: CAP-20, samenvoeging glutenvrij

Stack: Python/pytest (alleen backend, geen browser). Modus: AI-generatie, sequentieel. Alles op verzonnen bestanden in `tmp_path`; nooit de echte uitslag. Vervangt de verplichte test "antwoord te laat" (geen scherm) door "een ouder exportrecord overschrijft een latere bevestiging niet" (opdracht).

| Criterium (CAP-20 / §6b) | Test | Prio |
|---|---|---|
| mens gaat voor, AI afwezig op niet-getoonde, AI aanwezig zonder mens telt niet, niet bevestigd niets; categorieën = aantal records; verwacht AI | `test_regels_mens_gaat_voor_ai_afwezig_ai_aanwezig_telt_niet` | P0 |
| andere velden, sleutelvolgorde en formaat blijven; nieuwe sleutels achteraan | `test_alle_andere_velden_en_volgorde_blijven` | P0 |
| ouder exportrecord overschrijft latere bevestiging niet (tijdzones) | `test_ouder_exportrecord_overschrijft_latere_bevestiging_niet` | P0 |
| mens vervangt AI (ook onzeker), nieuwere export vervangt oudere, al gelijk | `test_mens_vervangt_ai_en_nieuwere_export_vervangt_oudere_export` | P0 |
| ingetrokken oordeel haalt niets weg | `test_ingetrokken_oordeel_haalt_niets_weg` | P1 |
| mens op niet-bevestigd uitslagrecord: niets | `test_mens_op_niet_bevestigd_uitslagrecord_verandert_niets` | P1 |
| herhaalbaar: tweede run niets, geen tweede reservekopie | `test_tweede_run_verandert_niets_en_maakt_geen_reservekopie` | P0 |
| droogloop schrijft niets, zelfde rapport | `test_droogloop_telt_en_schrijft_niets` | P0 |
| reservekopie = bytekopie | `test_reservekopie_is_bytekopie_van_het_origineel` | P0 |
| uitslag veranderd tussen lezen en schrijven: weigeren | `test_weigert_als_uitslag_tussen_lezen_en_schrijven_verandert` | P1 |
| 10 weigeringen, niets geschreven | `test_weigert_en_schrijft_niets[…]` | P0 |
| gate C vóór/na = `poort_glutenvrij` (grenzen 15/16, 34/35), zonder mens/AI | `test_gate_c_voor_en_na_zoals_poort_glutenvrij[3]` | P0 |
| opdrachtregel droog en weigering | `test_main_droog_…`, `test_main_weigert_met_code_1` | P1 |
| DRAAIPLAN noemt alleen bestaande, geteste scripts | `test_cap10_genoemde_scripts_bestaan_en_zijn_getest_of_ongetest_met_reden` (bestaand) | P1 |

## Rode fase

`uv run pytest tests/test_ronde11c_samenvoeg_20261112.py tests/test_cap10_draaiplan.py -q` (proefmap), 12-11-2026: **26 failed, 3 passed**. Rood: `samenvoeg_glutenvrij` bestaat niet (25 tests); de draaiplantest ziet het nieuwe commando in stap 5 zonder script. Afwijkingen: geen `test.skip()` (pytest), geen worker-subagents.
