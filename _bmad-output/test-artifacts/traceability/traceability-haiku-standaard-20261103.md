---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-03'
workflowType: 'testarch-trace'
inputDocuments: ['_bmad-output/test-artifacts/atdd-checklist-haiku-standaard-20261103.md', '_bmad-output/implementation-artifacts/spec-haiku-standaard-20261103.md', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_haiku_standaard_20261103.py']
---

# Traceability Matrix & Gate Decision - Haiku 5.5 als standaardmodel voorinvulling

**Story:** geen story-bestand; wijziging volgt uit het besluit van Friso (03-11-2026, "Gebruik voortaan haiku")
**Datum:** 2026-11-03 (tweede ronde, na de karakteriseringstests en de per-model uitvoer)
**Evaluator:** build-sessie (tak spike/proef-ronde9, worktree proef-ronde9)

---

## PHASE 1: REQUIREMENTS TRACEABILITY

### Criteria

Prioriteit: P0 = kern van het besluit; P1 = bewaking of eigen besluit van Friso; P2 = randvoorwaarden.

| ID | Criterium | Prio | Coverage | Dekkende tests (bestand::functie) |
|---|---|---|---|---|
| AC1 | Standaardmodel van `voorinvulling` en `voorinvulling-r9` is `anthropic/claude-haiku-5.5` | P0 | FULL | `test_haiku_standaard_20261103.py::test_standaardmodel_voorinvulling_is_haiku[voorinvulling]` en `[voorinvulling-r9]` (parse); `::test_main_zonder_model_geeft_haiku_door_aan_de_client[voorinvulling]` en `[voorinvulling-r9]` (bedrading tot de Client) |
| AC2 | Sonnet blijft kiesbaar via `--model` | P1 | FULL | `::test_sonnet_blijft_kiesbaar_via_model`; `::test_client_voor_voorinvulling_weigert_alleen_het_k4aa_model[SONNET-True]` |
| AC3 | `kosten.TARIEF` bevat Haiku `(1e-7, 5e-7)`, bestaande regels ongewijzigd; tokenfallback 0,15 dollar | P0 | FULL | `::test_tarief_haiku_bestaat_en_bestaande_regels_blijven`; `::test_kosten_zonder_usage_cost_telt_tokens_maal_haiku_tarief` |
| AC4 | `openrouter.Client` met Haiku en Sonnet start zonder fout; Gemini (K4-aa-model) wordt geweigerd voor de voorinvulling | P0 | FULL | `::test_client_voor_voorinvulling_weigert_alleen_het_k4aa_model[HAIKU-True]`, `[SONNET-True]`, `[FLASH-False]`; `::test_client_met_haiku_start_zonder_fout_en_roept_niets_aan` |
| AC5 | Zdr-gedrag van `openrouter.py` ongewijzigd (`PROVIDER == {"zdr": True, "data_collection": "deny"}`) | P2 | FULL | `::test_zdr_gedrag_van_de_client_ongewijzigd` (karakterisering, na de build toegevoegd) |
| AC6 | Documenten (randvoorwaarden, DRAAIPLAN, toetsset) noemen Haiku, datum 03-11-2026 en het besluit | P2 | FULL | `::test_documenten_noemen_haiku_met_datum_en_besluit[randvoorwaarden.md]`, `[DRAAIPLAN.md]`, `[toetsset.md]` (karakterisering, na de build toegevoegd) |
| AC7 | Per model een eigen uitvoerbestand; het Sonnet-bestand blijft ongewijzigd (besluit Friso 03-11-2026, optie 2) | P1 | FULL | `::test_uitvoernamen_per_model_sonnet_houdt_oude_namen_haiku_krijgt_eigen_bestand` (naamgeving via `toets.bestandsnaam`); de bedrading zelf is gedekt door de bestaande Sonnet-contracttests in `test_ronde3`, `test_ronde4`, `test_ronde5`, `test_ronde9` en `test_review_20261101`, die nu `--model anthropic/claude-sonnet-5.5` expliciet zetten |

AC7 is een eigen criterium en geen onderdeel van AC1. Het is een besluit van Friso op zichzelf (de naamgeving van bestanden), los van de keuze voor het model. Daarom telt het mee in P1 en niet als ondersteunend. Motivatie: het besluit kan gelden zonder het model, en een ander model krijgt dan toch een eigen bestand.

### Dekking per prioriteit

| Prioriteit | Totaal | FULL | Dekking | Status |
|---|---|---|---|---|
| P0 | 3 | 3 | 100% | PASS |
| P1 | 2 | 2 | 100% | PASS |
| P2 | 2 | 2 | 100% | PASS |
| **Totaal (AC1-AC7)** | **7** | **7** | **100%** | PASS |

Set ATDD-criteria (AC1-AC4): 4 van 4, 100%.

---

## PHASE 2: GATE DECISION

Regels (step-05): P0 moet 100% zijn; overall minimaal 80%; P1 minimaal 80% (doel 90%).

| Set | P0 | P1 | Overall | Beslissing |
|---|---|---|---|---|
| ATDD-criteria (AC1-AC4) | 100% | 100% | 100% | **PASS** |
| Volledige set (AC1-AC7) | 100% | 100% | 100% | **PASS** |

**Beslissing: PASS** op de volledige set. Regel 4 (P1 >= 90% en overall >= 80% met P0 op 100%) is voldaan.

Eerdere uitkomst (eerste trace, zes criteria): FAIL op 66,7%, omdat AC5 en AC6 geen test hadden. Die zijn nu toegevoegd en daarmee gedicht.

---

## Afwijkingen van de ATDD-volgorde

De ATDD-volgorde eist dat falende tests er zijn vóór de productiecode. Voor de criteria hieronder is dat niet gebeurd:

1. **AC5 en AC6** (`test_zdr_gedrag_van_de_client_ongewijzigd`, `test_documenten_noemen_haiku_met_datum_en_besluit`): na de build toegevoegd op verzoek van de trace-gate. Het gedrag bestond al, dus deze tests konden niet rood zijn. Ze leggen het bestaande gedrag vast (karakterisering).
2. **AC7** (`test_uitvoernamen_per_model_sonnet_houdt_oude_namen_haiku_krijgt_eigen_bestand`): na de build toegevoegd bij het besluit van Friso (03-11-2026, optie 2). Dat besluit kwam na de eerste build.
3. De drie oude Sonnet-contracttests (`test_ronde3`, `test_ronde4`, `test_ronde5`, `test_ronde9`, `test_review_20261101`) zijn aangepast met `--model anthropic/claude-sonnet-5.5`, omdat het standaardmodel nu Haiku is en die tests het Sonnet-bestand controleren. De assertions zelf zijn niet veranderd.

De criteria AC1 t/m AC4 zijn wel rood-eerst gedaan (ATDD-checklist, 4 rood en 1 groen vóór de wijziging).

---

## Uitvoering

- Testbestand: `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_haiku_standaard_20261103.py -v`. Uitkomst: **16 passed** (11 uit de ATDD-ronde, 5 nieuwe karakterisering- en naamgevingstests).
- Volledige suite (laatste run, 2026-11-03): **974 passed, 2 failed**. De twee failures zijn de training-rooktests hieronder (buiten scope).
- Buiten scope: `test_cap06_rooktest_hervatten_sigterm_midden_in_epoch_2_via_nacht` en `test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr` falen op timing en het stoppunt van het trainingsproces. Geen van beide importeert `toets` of `kosten` (grep).

## Aannames en bewijsmarkering

- VERIFIED: welke tests welke criteria dekken (`grep -n "def test_"`).
- VERIFIED: `openrouter.py` ongewijzigd (git status leeg) en `PROVIDER` staat op regel 22.
- VERIFIED: de drie documenten noemen Haiku, de datum en het besluit (test_documenten...).
- INFERENCE: de prioriteiten P0/P1/P2 zijn door de build-sessie toegekend, niet door Friso.
