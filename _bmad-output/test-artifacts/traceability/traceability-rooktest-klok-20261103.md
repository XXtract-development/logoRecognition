---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-03'
workflowType: 'testarch-trace'
inputDocuments: ['_bmad-output/implementation-artifacts/spec-rooktest-klok-20261103.md', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_cap06_training.py', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_ronde9_20261102.py']
---

# Traceability Matrix & Gate Decision - Rooktests nacht met één klok

**Story:** geen story-bestand; spec `spec-rooktest-klok-20261103.md` (oorzaak: de nep-klok in de rooktests klopte niet met de echte bestandstijden)
**Datum:** 2026-11-03
**Evaluator:** build-sessie (tak spike/proef-ronde9, worktree proef-ronde9)

---

## PHASE 1: REQUIREMENTS TRACEABILITY

| ID | Criterium | Prio | Coverage | Dekkende tests / bewijs |
|---|---|---|---|---|
| AC1 | Beide rooktests slagen (passed, niet skipped) op de echte klok; `nacht.py` ongewijzigd | P0 | FULL | `tests/test_cap06_training.py::test_cap06_rooktest_hervatten_sigterm_midden_in_epoch_2_via_nacht` (zwaar); `tests/test_ronde9_20261102.py::test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr` (zwaar). Bewijs: `pytest ... -v -rfs` geeft PASSED voor beide (2 passed, ~96 s). `git diff -- nacht.py` is leeg. |
| AC2 | Negatieve controle: een lange epoch geeft `stoppunt_1` met de epochreden | P0 | FULL | `tests/test_cap06_training.py::test_cap06_negatief_epoch_van_10_uur_geeft_stoppunt_met_echte_klok`; `::test_cap06_negatief_tweede_epoch_van_10_uur_geeft_stoppunt`; `::test_cap06_negatief_lange_epoch_gevolgd_door_een_korte_geeft_nog_stoppunt` |
| AC3 | Grens scherp: 9,5 uur geeft geen epochreden, 9,5 uur + 1 s wel; de epoch wordt gemeten | P1 | FULL | `tests/test_cap06_training.py::test_cap06_grens_9_5_uur_precies_geen_stoppunt_plus_1_seconde_wel[0-False]` en `[1-True]` (de epochreden wordt specifiek gecontroleerd, niet alleen "een stoppunt") |
| AC4 | Mutatiecontrole: met de epochgrens uitgeschakeld vallen de negatieve controles rood | P1 | FULL | Bewijs (herhaald op 2026-11-03): `PYTHONPATH=/tmp/bmad-review-haiku uv run pytest tests/test_cap06_training.py -k "negatief or grens" -q -p mutant_plugin`. Echte code: 5 passed. Mutant (`nacht.MAX_EPOCH_S` = 1e12): 5 failed. |

### Dekking per prioriteit

| Prioriteit | Totaal | FULL | Dekking | Status |
|---|---|---|---|---|
| P0 | 2 | 2 | 100% | PASS |
| P1 | 2 | 2 | 100% | PASS |
| **Totaal (AC1-AC4)** | **4** | **4** | **100%** | PASS |

---

## PHASE 2: GATE DECISION

Regels (step-05): P0 moet 100% zijn; overall minimaal 80%; P1 minimaal 80% (doel 90%).

| Set | P0 | P1 | Overall | Beslissing |
|---|---|---|---|---|
| AC1-AC4 | 100% | 100% | 100% | **PASS** |

**Beslissing: PASS.** Alle criteria hebben een test of bewijs, alle P0 en P1 zijn gedekt, en de mutatiecontrole bewijst dat de negatieve controles de planner echt bewaken.

---

## Gaten en beperkingen (gemeld, niet als gat in de gate)

1. **07:30-rekenregel in de rooktests:** de rooktests patchen `in_venster` en `einde` (spec, bekende beperking). De echte rekenregel wordt wél getest, maar in een andere module: `tests/test_ronde9_20261102.py` regels 789-798 (`in_venster` binnen/buiten het venster; `einde` geeft 07:30 van de volgende dag, ook om 23:15 en 03:00, en een ValueError buiten het venster). Die dekking blijft dus bestaan; de rooktests zelf dekken hem niet.
2. **Productiebereik van een epoch langer dan 9,5 uur** (INFERENCE op `draai`): de run stopt bij het einde (hoogstens start + 9,5 uur); een checkpoint dat later dan 9,5 uur na de start wordt weggeschreven, kan alleen binnen de 300 s stopgrace worden gemeten. De negatieve controles dekken de planner-regel zelf, niet de vraag of die situatie in productie voorkomt.
3. **Pre-Haiku-oorzaak:** op een git-export van `3557574` falen de twee rooktests met dezelfde assertiefout (`'een epoch duurde langer dan 9.5 uur' != None` en `'stoppunt_1' == 'afgerond'`). De oorzaak zit dus niet in de Haiku-wijziging.
4. **Volledige suite:** 981 passed, 0 failed (`/tmp/bmad-review-klok/full-suite.txt`, na alle wijzigingen van deze spec).

## Aannames en bewijsmarkering

- VERIFIED: welke tests welke criteria dekken; `nacht.py` ongewijzigd (`git diff` leeg).
- VERIFIED: rode run met de oude klok (assertiefouten hierboven); pre-Haiku-export met dezelfde fout.
- VERIFIED: mutatiecontrole 5 passed (echt) tegen 5 failed (mutant).
- INFERENCE: het productiebereik van een epoch langer dan 9,5 uur (gap 2).
