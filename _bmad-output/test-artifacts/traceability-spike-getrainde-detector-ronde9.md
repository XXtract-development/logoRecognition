---
titel: Traceability en gate: proef getrainde detector ronde 9
datum: 2026-11-02
spec: _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-ronde9.md
contract: _bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md (sectie "Ronde 9")
tak: spike/proef-ronde9
code: cdebb15 (review-patches); werkboom: tests/test_cap07_herkenning.py (verwachting FSC bijgewerkt)
gate: PASS
---

# Traceability en gate: proef getrainde detector ronde 9

> [!note] Gate PASS
> P0 100 % (14 van 14 criteriumrijen: AC1, AC2, M1–M8, CAP-2, CAP-3, CAP-6, CAP-18), P1 100 % (7 van 7 criteriumrijen: CAP-1, -4, -5, -9, -12, -16, -17), totaal 100 % (21 van 21 rijen met P0/P1; P2 CAP-7, -8, -10 ook gedekt). Gedekt door geautomatiseerde tests die op deze stand groen zijn. Drie punten zijn geen code-claim maar uitvoering (zie "Niet gedekt, bewust").

## Bewijs

- **Volle suite** (`uv run --group dev pytest -q -p no:cacheprovider`, 02-11-2026, na de tweede correctie): **960 passed, 0 failed** in 4 min 18 s.
- **Roodcontrole ATDD** (tegen de oorspronkelijke bronnen `47edcb1`): backend 79 nieuwe tests rood op ontbrekend gedrag, browser 20 nieuwe tests rood. Zie spec, Implementation Notes.
- **Zware rooktest** (`uv run --group dev --group detector pytest -m zwaar -k rooktest`): `test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr` **1 passed** (46 s). Echte rfdetr-fase N op een kleine verzonnen set; `nacht.stop` na het eerste checkpoint, hervatten vanaf het nieuwste checkpoint, `train-resultaat.json`.

## Matrix acceptatiecriteria en I/O-matrix (P0)

| # | Criterium | Tests | Niveau | Dekking |
|---|---|---|---|---|
| AC1 | Given de rode tests van ronde 9, when de bouw klaar is, then groen en volle suite groen | alle ronde-9-tests; volle suite | integratie | FULL (960 passed) |
| AC2 | Given een kleine COCO-set, when `nacht.draai` SIGTERM midden in epoch krijgt en daarna opnieuw draait, then hervat vanaf checkpoint en eindigt met `train-resultaat.json` | `test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr` | zwaar (rfdetr) | FULL (passed) |
| M1 | oud bevestigd etiket: telt voor de negen oude, na te lopen, tussenstand houdt `bevestigd` | `test_r9_oud_bevestigd_etiket_telt_voor_de_negen_oude_en_niet_voor_de_vier`, `test_r9_server_tussenstand_op_oud_bevestigd_etiket_houdt_status_en_telt_pas_na_bevestigen`, `test_r9_na_te_lopen_als_een_van_de_vier_niet_bevestigd_is` | unit + server | FULL |
| M2 | keuze op nieuwe rij zonder bevestigen: opgeslagen, niet geteld | `test_r9_per_keurmerk_en_stand_tellen_alleen_bevestigde_codes`, `test_r9b_tussenstand_op_nieuwe_rij_houdt_bevestigd_en_telt_pas_na_bevestigen` | unit + browser | FULL |
| M3 | bevestigen zonder de vier keuzes: geweigerd | `test_r9_server_bevestigd_vraagt_13_keuzes_en_zet_bevestigde_codes`, `test_r9b_bevestigen_zonder_keuze_bij_de_vier_wordt_geweigerd` | server + browser | FULL |
| M4 | startprojectie boven grens: start niet | `test_r9_cli_voorinvulling_r9_startprojectie_boven_de_grens_stopt_voor_de_client` | opdrachtregel | FULL |
| M5 | buiten het venster: start niets | `test_r9_nacht_draai_buiten_het_venster_start_niets` | unit | FULL |
| M6 | 07:30 bereikt: SIGTERM, na 300 s SIGKILL, gepauzeerd | `test_r9_nacht_draai_stuurt_sigterm_om_0730_en_pauzeert`, `test_r9_nacht_draai_sigkill_na_300_s_als_het_proces_blijft_lopen` | unit (nagebootste klok en proces) | FULL |
| M7 | nieuwste checkpoint onleesbaar: hervat vanaf het vorige | `test_r9_nacht_tweede_nacht_met_onleesbaar_nieuwste_checkpoint_hervat_bij_het_vorige`, `test_r9_nacht_hervatpunt_nieuwste_leesbare_terugval_en_alleen_de_eigen_map` | unit | FULL |
| M8 | volledig venster zonder checkpoint: stoppunt 1, daarna niets | `test_r9_nacht_stoppunt_1_na_een_volledig_venster_zonder_checkpoint_daarna_geen_start_tot_vrijgeven`, `test_r10_run_zonder_nieuw_checkpoint_zet_stoppunt_1_en_start_daarna_niets` | unit | FULL |

## Matrix capabilities (CAP-1 t/m CAP-18)

| CAP | Onderwerp | Tests (voorbeelden) | Prioriteit | Dekking |
|---|---|---|---|---|
| CAP-1 | scheiding, vier extra rijen, versie met reden | `test_r9_scheiding_extra_rijen…`, `test_r9_cli_kies_*`, `test_r27_*` | P1 | FULL |
| CAP-2 | voorinvulling ronde 9, samenvoegen, raming | `test_r9_voorinvulling_r9_*`, `test_r9_samenvoegen_*`, `test_r9_raming_r9_kostenmodel`, `test_r26_*` | P0 (kosten) | FULL |
| CAP-3 | invulpagina: 13 rijen, nalopen, bevestigde codes | `test_r9_valideer_*`, `test_r9_server_*`, `test_r9b_*` (9 functies, 20 gevallen) | P0 (antwoorden Friso) | FULL |
| CAP-4 | referentieplaatjes, FSC-variant, handmatig | `test_r9_logos_*`, `test_r18_*` | P1 | FULL |
| CAP-5 | voorlabels: gelijkend, schema, V-label | `test_r9_echt_gelijkend_*`, `test_r23_*` | P1 | FULL |
| CAP-6 | training: 17 klassen, `--hervat`, checkpoint per epoch | `test_r9_klassen_17_*`, `test_r9_train_argumenten_*`, `test_r9_config_hervat_*`, `test_r22_*`, `test_r9_zwaar_rooktest_*` | P0 (nachten) | FULL |
| CAP-7 | certificaatnummer FSC | `test_r9_herken_certificaatnummer_fsc`, `test_cap07_certificaatnummers` | P2 | FULL |
| CAP-8 | beoordelaar: FSC-varianten, kunststofcode zonder cijfer | `test_r9_beoordelaar_vraag_fsc_varianten_en_kunststofcode_zonder_cijfer` | P2 | FULL |
| CAP-9 | telling: NVT bij nul referenties; nakijken behoudt NVT | `test_r9_tel_met_referenties_geeft_nvt…`, `test_r20_*` | P1 | FULL |
| CAP-10 | draaiplan: nachttraining, voorinvulling, wisselplan | `test_r9_draaiplan_nachttraining_voorinvulling_r9_scheiding_met_reden_en_wisselplan` | P2 (document) | FULL |
| CAP-12 | K4-aa-referenties per klasse, 17 varianten | `test_r9_k4aa_per_klasse_*`, `test_r21_*` | P1 | FULL |
| CAP-16 | NutriGreen (ongewijzigd, regressie via volle suite) | bestaande `test_cap05_*`, `test_ronde5_*` | P1 | FULL |
| CAP-17 | OFF-tabel vier klassen | `test_r9_off_zoek_vier_klassen_exact` | P1 | FULL |
| CAP-18 | nachttraining: venster, hervatten, status, planner | `test_r9_nacht_*` (24 functies), `test_r10/r11/r13/r15/r24/r25_*`, zwaar rooktest | P0 | FULL |

Heuristieken (step 2/3): er zijn geen API-eindpunten met auth in deze spike; foutpaden staan per capability (ongeldige invoer, ontbrekend bestand, kapot checkpoint, mislukte popen, verweesd slot). Geen criterium met alleen happy-path.

## Gap-analyse

- Geen P0- of P1-gaten.
- Bewust niet geautomatiseerd (uitvoering, geen code-claim): (1) de voorinvulling ronde 9 (betaalde OpenRouter-aanroepen; stoppunt 5, keuze Friso); (2) de volledige training (na bevestiging van de toetsset); (3) het blind nakijken en de eindmeting (na het experiment).
- Uitvoering OFF-ophaal voor de vier klassen: loopt op de achtergrond; de lekcontrole en de contactbladen zijn na de ophaal, niet in deze trace.
- Verouderde verwachting gevonden en bijgewerkt: `test_cap07_certificaatnummers[FSC]` (ronde 9 maakt FSC een keurmerk met certificaatpatroon). De ATDD-ronde had die niet gevangen.

## Gate-beslissing

**PASS.** P0 14/14 criteriumrijen (100 %), P1 7/7 criteriumrijen (100 %), P2 3/3, totaal 100 %. Aantallen zijn criteriumrijen uit de matrix hierboven, niet testfuncties. Volle suite groen, zware rooktest groen. Voorwaarde voor de push: de keten staat op een lokaal tussenpunt; push naar origin spike/proef-ronde9 volgt na deze trace (geen PR, geen merge).
