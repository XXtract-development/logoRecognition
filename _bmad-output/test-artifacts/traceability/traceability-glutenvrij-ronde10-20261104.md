---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-04'
workflowType: 'testarch-trace'
inputDocuments: ['_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde10.md', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_ronde10_glutenvrij_20261103.py']
---

# Traceability & Gate - Ronde 10 glutenvrij (tweede trace, 04-11-2026)

**Vervangt niet:** `traceability-glutenvrij-ronde10-20261103.md` (eerste trace: deel 1 FAIL op P1 60%).
**Spec:** `spec-spike-getrainde-detector-ronde10.md` (ready-for-dev, review-loop 2).
**Testdatei:** `tests/test_ronde10_glutenvrij_20261103.py`: 22 tests, groen.
**Nieuw sinds de eerste trace:** `test_g_b9_r10_route_leest_en_schrijft_geen_sonnet_bestand` (G-B9) en `test_g_b10_grens_precies_een_dollar_mag_nog_en_daarboven_niet` (G-B10). Mutantcontrole G-B9: een route die `voorinvulling.json` schrijft wordt rood; de echte code is groen.
**Besluit Friso 04-11-2026:** poort in de dataset-bouwer (niet in `train()`), de rooktests uitgezonderd; scheiding bevroren; glutenvrij-voorbeelden alleen uit openbare beelden; de glutenvrij-rij op de pagina is nog niet gebouwd.

---

## DEEL 1: Betaalde route voorinvulling-r10 (Gate B)

| ID | Criterium | Prio | Coverage | Dekkende test (bestand::functie) |
|---|---|---|---|---|
| G-B1 | Cap $1; eigen post "voorinvulling glutenvrij (gate B)"; de post "voorinvulling toets" blijft onaangeroerd | P0 | FULL | `test_ronde10_glutenvrij_20261103.py::test_a_post_heet_voorinvulling_glutenvrij_en_bewaker_grens_is_een_dollar`; `::test_gate_b_cap_is_een_dollar_en_eigen_bestand_voor_haiku` |
| G-B2 | Cap stopt de run vóór de aanroep die $1 zou passeren (exit 2, geen aanroep boven de cap) | P0 | FULL | `::test_b_cap_stopt_de_run_en_geen_aanroep_boven_de_cap` |
| G-B3 | Reserve per aanroep ($0,05): de aanroep wordt geweigerd als de marge de grens passeert | P0 | FULL | `::test_b_reserve_weigert_de_eerste_aanroep_als_marge_de_grens_passeert` |
| G-B4 | Haiku schrijft naar `voorinvulling-r10-claude-haiku-5-5.json` | P0 | FULL | `::test_gate_b_cap_is_een_dollar_en_eigen_bestand_voor_haiku` (bestandsnaam) |
| G-B5 | `--grens` boven $1 wordt geweigerd, met melding over de grens | P0 | FULL | `::test_gate_b_weigert_grens_boven_een_dollar_zonder_nieuw_besluit` (de melding moet "grens" bevatten) |
| G-B6 | Modelpin: alleen Haiku op de route; Sonnet of Gemini geweigerd zonder aanroep | P0 | FULL | `::test_e_sonnet_op_voorinvulling_r10_wordt_geweigerd_zonder_aanroep` |
| G-B7 | Zdr-proef wordt op het grootboek geboekt (binnen de post) | P1 | FULL | `::test_d_zdr_proef_wordt_op_het_grootboek_geboekt` |
| G-B8 | De 17 etiketten met glutenvrij-declaratie komen vóór de rest | P1 | FULL | `::test_c_de_17_met_glutenvrij_declaratie_komen_vooraan`; `::test_gate_b_volgorde_zet_de_17_glutenvrij_etiketten_vooraan` |
| G-B9 | Sonnet-bestanden worden door de r10-route niet gelezen of geschreven | P1 | FULL | `::test_g_b9_r10_route_leest_en_schrijft_geen_sonnet_bestand`. Bewijs: alle Sonnet-namen staan met sentinel-inhoud in de proefmap; `pathlib.Path.read_text` en `write_text` worden opgenomen; geen Sonnet-naam wordt aangeraakt en de inhoud blijft gelijk. Een assertie dat de opname werkt (r10-bestand wordt geraakt) voorkomt een lege, vacuüme controle. Mutantcontrole: een route die `voorinvulling.json` schrijft faalt de test. |
| G-B10 | Precies $1,00 mag nog; een cent meer niet | P1 | FULL, met kanttekening | `::test_g_b10_grens_precies_een_dollar_mag_nog_en_daarboven_niet` (op het niveau van `kosten.Bewaker.mag`: `uitgegeven + volgende <= grens`). Kanttekening: de route gebruikt de reserve van $0,05, dus een aanroep die precies op $1,00 eindigt, wordt op routeniveau niet bereikt. De grenslogica zelf is wel getest. |
| G-B11 | OFF-record met de glutenvrij-zoekterm wordt via het standaardpad als DIET_FREE_FROM_GLUTEN herkend | P1 | FULL | `::test_f_off_record_met_glutenvrij_tag_wordt_diet_free_from_gluten`; `::test_off_zoekterm_voor_glutenvrij_bestaat` |
| G-B12 | Aantallen: 18 klassen, 14 keurmerken | P0 | FULL | `::test_glutenvrij_is_veertiende_keurmerk_en_achttiende_klasse` |
| G-B13 | Bestaande bevestigingen zonder glutenvrij-sleutel blijven geldig | P0 | FULL | `::test_bestaande_bevestigingen_zonder_glutenvrij_blijven_geldig`; `::test_glutenvrij_keuze_wordt_geaccepteerd_als_bekende_sleutel` |
| G-A1 | Gate A opgeheven (Friso 03-11-2026); licentierisico als bekend risico, niet blokkerend | P2 | FULL (documentair) | Spec (Gates, Intent) en `randvoorwaarden.md` §4; geen code-test nodig |
| G-A2 | `bekende_risico` in de trainingsresultaten | P2 | GAT | Niet gebouwd. Hoort bij de eerste training met glutenvrij-beelden (open punt 4 in de spec). Buiten de betaalde route. |

**Dekking deel 1 per prioriteit**

| Prioriteit | Totaal | FULL | PARTIAL | GAT | Dekking |
|---|---|---|---|---|---|
| P0 | 7 | 7 | 0 | 0 | 100% |
| P1 | 5 | 5 | 0 | 0 | 100% |
| P2 | 2 | 1 | 0 | 1 | buiten de betaalde route |

**Gate-beslissing deel 1: PASS.** P0 100%, P1 100% (minimum 80%). De enige GAT (G-A2) is P2 en valt buiten de betaalde route. De kanttekening bij G-B10 is genoemd.

---

## DEEL 2: Training (Gate C); nog niet gestart

| ID | Criterium | Prio | Coverage | Dekkende test / gat |
|---|---|---|---|---|
| G-C1 | Poort in de dataset-bouwer: minder dan 16 bevestigde mét weigert | P0 | PARTIAL | `::test_gate_c_weigert_bij_minder_dan_16_mét` test de functie `poort_glutenvrij` direct. De aanroep in `echt.py` (dataset-bouw) heeft geen test; de review heeft dat genoteerd. |
| G-C2 | Poort in de dataset-bouwer: minder dan 35 zonder weigert (meetregels §4/§7) | P0 | PARTIAL | `::test_gate_c_weigert_bij_minder_dan_35_zonder` (functie). Zelfde gat als G-C1. |
| G-C3 | Poort slaagt bij 16 mét en 35 zonder | P0 | PARTIAL | `::test_gate_c_slaagt_bij_16_mét_en_35_zonder` (functie). |
| G-C4 | Poort is fail-closed bij een ontbrekend uitslag-bestand | P0 | PARTIAL | `::test_gate_c_is_fail_closed_bij_ontbrekend_bestand`. Onleesbare JSON niet getest. |
| G-C5 | Telling zoals de uitslag (bevestigde_codes) | P0 | FULL | `::test_gate_c_telt_glutenvrij_niet_mee_als_het_niet_in_bevestigde_codes_staat` |
| G-C6 | Poort in `train()`: de training weigert zonder bevestiging | P0 | AFGESPROKEN ANDERS | Besluit Friso 04-11: de poort zit in de dataset-bouwer, niet in `train()`. Daarmee is de AC van de spec ("training weigert") vervangen door "dataset-bouw met glutenvrij-beelden weigert". De nieuwe AC is op de bouwer nog niet getest (zie G-C1). |
| G-C7 | Glutenvrij-rij op de invulpagina; Friso bevestigt op de pagina | P0 | GAT | Niet gebouwd. Friso's besluit 04-11: nieuwe rij op de huidige pagina, bevestigingen blijven, een herstart van de server is goed, daarna controleren via `/stand`. Dat is nog niet gedaan. |
| G-S1 | Scheiding: glutenvrij-rij en de GLN-verdeling | P1 | AFWIJKING (besloten) | Scheiding bevroren (toetsset §7). Friso 04-11: glutenvrij-voorbeelden alleen uit openbare beelden; de toetsset blijft zoals die is. De spec-AC over de GLN-verdeling voor glutenvrij is daarmee vervangen; dat moet in de spec worden vastgelegd. |
| G-S2 | Glas en pictogram uitgesloten van de meetlijst | P1 | PARTIAL | `::test_verpakkingscodes_glas_en_pictogram_staan_niet_in_de_meetlijst` (functie `klasse_tabel`, verzonnen regels). `klasse_tabel` heeft geen aanroeper in de productiecode; de bronnamen staan niet vast. |
| G-O1 | OFF-lekregel (toets-GTIN, toetsleverancier) geldt voor glutenvrij | P1 | PARTIAL | Niet in deze testdatei. De lekregel is ongewijzigd (`record_reden`); de ronde-6-tests dekken die functie; geen glutenvrij-specifiek testgeval. |

**Dekking deel 2:** P0: 5 van 8 deels of volledig gedekt; 2 GAT (G-C6 vervangen, G-C7 pagina). P1: 0 FULL.

**Gate-beslissing deel 2: FAIL.** Verwacht: de training is nog niet gestart, de poort in de dataset-bouwer heeft geen test die via `echt.py` loopt, en de pagina-rij ontbreekt. Het voorbereidende deel (de functie en de telling) is getest en groen.

---

## Samenvatting

- **Deel 1 (betaalde route): PASS.** P0 100%, P1 100%. De betaalde voorinvulling mag gaan, binnen de cap van $1, na de commit van de ronde-10-paden.
- **Deel 2 (training): FAIL, verwacht.** Open: een test voor de poort via `echt.py` (G-C1 t/m G-C4 via de bouwer), de glutenvrij-rij op de pagina (G-C7), de scheiding-AC vastleggen in de spec (G-S1), `klasse_tabel` aansluiten (G-S2), en `bekende_risico` bij de eerste training (G-A2).

## Aannames en bewijsmarkering

- VERIFIED: welke tests bestaan en wat ze controleren (`grep -n "^def test_"` op de testdatei; 22 passed).
- VERIFIED: de mutantcontrole op G-B9 (een route die `voorinvulling.json` schrijft faalt).
- VERIFIED: de poort staat in `echt.py` en niet in `train()` (uit de review van de bouw en het besluit van Friso 04-11).
- INFERENCE: dat de G-B10-grens op routeniveau niet bereikt wordt, omdat de reserve van $0,05 de route begrenst.
