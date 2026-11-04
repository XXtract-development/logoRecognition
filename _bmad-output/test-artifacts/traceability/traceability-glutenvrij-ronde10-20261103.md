---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-03'
workflowType: 'testarch-trace'
inputDocuments: ['_bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde10.md', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_ronde10_glutenvrij_20261103.py']
---

# Traceability & Gate - Ronde 10 glutenvrij (03-11-2026)

**Spec:** `spec-spike-getrainde-detector-ronde10.md` (ready-for-dev, review-loop 2)
**Testdatei:** `tests/test_ronde10_glutenvrij_20261103.py`, 20 tests, groen (`uv run pytest tests/test_ronde10_glutenvrij_20261103.py -q`). Suite `-m "not zwaar"`: 997 passed.
**Evaluator:** trace-stap van de build-sessie (worktree proef-ronde9).

Alleen de tests in deze ene testdatei tellen mee als dekking. Tests in andere bestanden die de telling 18/14 vastleggen (test_cap03, test_cap04, test_cap05, test_ronde5, test_ronde6, test_ronde9, test_cap02) zijn bijgewerkt maar dekken geen gedrag van de nieuwe poorten.

---

## DEEL 1: Poorten en route (nodig voor de betaalde voorinvulling)

| ID | Criterium | Prio | Coverage | Dekkende test (bestand::functie) |
|---|---|---|---|---|
| G-B1 | Cap $1 voor de route; grootboek-post "voorinvulling glutenvrij (gate B)"; de post "voorinvulling toets" blijft onaangeroerd | P0 | FULL | `test_ronde10_glutenvrij_20261103.py::test_a_post_heet_voorinvulling_glutenvrij_en_bewaker_grens_is_een_dollar`; `::test_gate_b_cap_is_een_dollar_en_eigen_bestand_voor_haiku` (grens 1.0) |
| G-B2 | Cap stopt de run vóór de aanroep die $1 zou passeren (exit 2, geen aanroep boven de cap) | P0 | FULL | `::test_b_cap_stopt_de_run_en_geen_aanroep_boven_de_cap` |
| G-B3 | Reserve per aanroep ($0,05): de aanroep wordt geweigerd als de marge de grens passeert | P0 | FULL | `::test_b_reserve_weigert_de_eerste_aanroep_als_marge_de_grens_passeert` |
| G-B4 | Haiku schrijft naar `voorinvulling-r10-claude-haiku-5-5.json` | P0 | FULL | `::test_gate_b_cap_is_een_dollar_en_eigen_bestand_voor_haiku` (bestandsnaam) |
| G-B5 | `--grens` boven $1 wordt geweigerd, met melding over de grens | P0 | FULL | `::test_gate_b_weigert_grens_boven_een_dollar_zonder_nieuw_besluit` (streng: de melding moet "grens" bevatten) |
| G-B6 | Modelpin: alleen Haiku op de route; Sonnet of Gemini geweigerd zonder aanroep | P0 | FULL | `::test_e_sonnet_op_voorinvulling_r10_wordt_geweigerd_zonder_aanroep` |
| G-B7 | Zdr-proef wordt op het grootboek geboekt (binnen de post) | P1 | FULL | `::test_d_zdr_proef_wordt_op_het_grootboek_geboekt` |
| G-B8 | De 17 etiketten met glutenvrij-declaratie komen vóór de rest | P1 | FULL | `::test_c_de_17_met_glutenvrij_declaratie_komen_vooraan`; `::test_gate_b_volgorde_zet_de_17_glutenvrij_etiketten_vooraan` (helper) |
| G-B9 | Sonnet-bestanden worden niet gelezen of geschreven door de r10-route | P1 | **PARTIAL** | Niet getest. Alleen code-inspectie: de route gebruikt `bestandsnaam("...-r10", model)` en leest geen `voorinvulling.json`. Gat: geen test die een Sonnet-bestand laat staan en de route draait. |
| G-B10 | Een bedrag van precies $1,00 mag nog; boven $1,00 stopt de run | P1 | **PARTIAL** | Niet getest. De grens is `<=` in `kosten.Bewaker.mag` (code-inspectie); geen testgeval op de grens. |
| G-B11 | OFF-record met de glutenvrij-zoekterm wordt via het standaardpad als DIET_FREE_FROM_GLUTEN herkend | P1 | FULL | `::test_f_off_record_met_glutenvrij_tag_wordt_diet_free_from_gluten`; `::test_off_zoekterm_voor_glutenvrij_bestaat` (sleutel) |
| G-B12 | Aantallen: 18 klassen, 14 keurmerken (Nutri-Score één keurmerk) | P0 | FULL | `::test_glutenvrij_is_veertiende_keurmerk_en_achttiende_klasse` |
| G-B13 | Bestaande bevestigingen zonder glutenvrij-sleutel blijven geldig | P0 | FULL | `::test_bestaande_bevestigingen_zonder_glutenvrij_blijven_geldig`; `::test_glutenvrij_keuze_wordt_geaccepteerd_als_bekende_sleutel` |
| G-A1 | Gate A opgeheven (Friso, 03-11-2026); licentierisico benoemd als bekend risico, niet blokkerend | P2 | FULL (documentair) | Tekst in spec (Gates, Intent) en `randvoorwaarden.md` §4; geen code-test nodig. |
| G-A2 | `bekende_risico` in de trainingsresultaten | P2 | **GAT** | Niet gebouwd. Hoort bij de eerste training met glutenvrij-beelden (open punt 4). |

**Dekking deel 1, per prioriteit**

| Prioriteit | Totaal | FULL | PARTIAL | GAT | Dekking |
|---|---|---|---|---|---|
| P0 | 7 | 7 | 0 | 0 | 100% |
| P1 | 5 | 3 | 2 | 0 | 60% |
| P2 | 2 | 1 | 0 | 1 | (buiten de betaalde route) |

**Gate-beslissing deel 1: FAIL** (regel: P1 minimaal 80%; hier 60%). P0 is volledig gedekt. De twee P1-gaten zijn klein en vallen binnen de betaalde route:
- G-B9 (Sonnet-bestanden niet aangeraakt): een test die een Sonnet-bestand aanmaakt met een afwijkende inhoud en controleert dat de r10-route het niet leest of wijzigt.
- G-B10 ($1,00 exact): een testgeval met kost precies op de grens.

Deze twee tests zijn in een paar regels te schrijven. Daarna is deel 1 PASS volgens dezelfde regels. De trace schrijft geen tests; dat is de volgende stap.

---

## DEEL 2: Training (nog niet gestart; Gate C)

| ID | Criterium | Prio | Coverage | Dekkende test / gat |
|---|---|---|---|---|
| G-C1 | Poort: minder dan 16 bevestigde mét weigert | P0 | PARTIAL | `::test_gate_c_weigert_bij_minder_dan_16_mét` (de functie `poort_glutenvrij` direct). De poort zit in de dataset-bouwer (`echt.py`), niet in `train()`; geen test die via de bouwer loopt. |
| G-C2 | Poort: minder dan 35 zonder weigert (meetregels §4/§7) | P0 | PARTIAL | `::test_gate_c_weigert_bij_minder_dan_35_zonder` (functie). Zelfde gat als G-C1. |
| G-C3 | Poort slaagt bij 16 mét en 35 zonder | P0 | PARTIAL | `::test_gate_c_slaagt_bij_16_mét_en_35_zonder` (functie). |
| G-C4 | Poort is fail-closed bij een ontbrekend of onleesbaar uitslag-bestand | P0 | PARTIAL | `::test_gate_c_is_fail_closed_bij_ontbrekend_bestand`. Onleesbaar (ongeldige JSON) niet getest. |
| G-C5 | Telling zoals de uitslag (bevestigde_codes) | P0 | FULL | `::test_gate_c_telt_glutenvrij_niet_mee_als_het_niet_in_bevestigde_codes_staat` |
| G-C6 | "Training weigert" (AC van Gate C in de trainer, `train()`) | P0 | **GAT** | Niet gebouwd in `train()`. Open punt 1. |
| G-C7 | Glutenvrij-rij op de invulpagina; Friso bevestigt op de pagina | P0 | **GAT** | Niet gebouwd. `invul/index.html` en `invul/server.py` ongewijzigd. Open punt 2 (welke pagina; de live :8767 mag niet wisselen). |
| G-S1 | Scheiding: glutenvrij-rij en de GLN-verdeling | P1 | **AFWIJKING** | Bevroren scheiding (toetsset §7): geen rij toegevoegd. De twee bouw_rijen-tests zijn versoepeld; de Always-regel "voor alle keurmerken tegelijk" wordt daardoor voor glutenvrij niet geverifieerd. Beslispunt, open punt 3. |
| G-S2 | Glas en pictogram uitgesloten van de meetlijst | P1 | **PARTIAL** | `::test_verpakkingscodes_glas_en_pictogram_staan_niet_in_de_meetlijst` (functie `klasse_tabel`, verzonnen regels). `klasse_tabel` heeft geen aanroeper in de productiecode; de bronnamen staan niet vast. Open punt 5. |
| G-O1 | OFF-lekregel (toets-GTIN, toetsleverancier) geldt voor glutenvrij | P1 | **PARTIAL** | Niet in deze testdatei. De lekregel is ongewijzigd (`record_reden`), en de bestaande ronde-6-tests dekken die functie; geen glutenvrij-specifiek testgeval. |

**Dekking deel 2:** P0: 5 van 7 volledig of deels; 2 GAT (training-weigering in `train()` en de pagina-rij). P1: 0 FULL, 3 PARTIAL/AFWIJKING.

**Gate-beslissing deel 2: FAIL.** Dat is verwacht: de training is nog niet gestart, en Gate C is pas volledig als de poort in `train()` zit en de pagina de rij toont. Het voorbereidende deel (de functie en de telling) is getest en groen.

---

## Samenvatting voor de hoofdsessie

- **Deel 1 (betaalde run): FAIL op P1 (60%)**, door twee kleine gaten: Sonnet-bestanden onaangeroerd (G-B9) en de grens van exact $1,00 (G-B10). P0 is volledig gedekt. Twee tests dichten het; daarna is het PASS.
- **Deel 2 (training): FAIL, verwacht.** Open: `train()`-poort (G-C6), glutenvrij-rij op de pagina (G-C7), `bekende_risico` (G-A2), scheiding (G-S1, beslispunt).
- De tests in de testdatei zijn groen. Dat zegt niets over de GAT-punten; die zijn hierboven benoemd.
- De volgorde van wat er nog moet voordat de training kan starten, staat in de spec onder "Open punten na de bouw" (1 t/m 7).

## Aannames en bewijsmarkering

- VERIFIED: welke tests bestaan en wat ze controleren (`grep -n "^def test_"`, en het groene resultaat van de testdatei).
- INFERENCE: dat G-B9 en G-B10 in een paar regels te testen zijn (geen code gelezen voor de nieuwe tests).
- VERIFIED: de poort staat in `echt.py` (dataset-bouw) en niet in `train()` (uit de review van de bouw).
