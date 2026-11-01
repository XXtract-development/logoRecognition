---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-01'
---

# Traceability — spike proef getrainde detector

> [!warning] Gatebesluit: FAIL
> De dekking voldoet (P0 15/15, P1 7/7, totaal 23/25 = 92%), maar één P0-test is rood: `test_cap13_lokaal_echte_omgeving_zonder_overtredingen` (licentiecontrole op de echte omgeving; `torch` met een BSL-1.0-deel en `regex` met CNRI-Python staan niet op de toegestane lijst). Dat is stoppunt 4 en wacht op Friso. Na zijn besluit: lijst aangevuld en test groen → opnieuw tracen (verwacht PASS); of een waiver → WAIVED.

## Stap 1 — Context

- **Werkboom:** `.claude/worktrees/proef-detector`, tak `spike/proef-getrainde-detector`, HEAD `e157e5f`.
- **Contract (criteria):** de `success`-regels van CAP-1 t/m CAP-15 in `_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md`, met de regels uit `meetregels.md`, `toetsset.md`, `trainingsset-en-herkenning.md` en `randvoorwaarden.md`; plus de drie Acceptance Criteria en de I/O-matrix (6 rijen) in `_bmad-output/implementation-artifacts/spec-spike-getrainde-detector.md` (status `in-review`).
- **ATDD-checklist:** `_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md` — testbestand per CAP, niveau en prioriteit per CAP (stap 3), rode run 31-10 (`366 errors`: 362 × `ModuleNotFoundError`, 4 × `FileNotFoundError: DRAAIPLAN.md`), contractwijzigingen na de review (01-11).
- **Prioriteiten:** overgenomen uit de ATDD-checklist (stap 3, tabel "Niveaus en prioriteit"): P0 = CAP-1, 3, 8, 9, 11, 13, 14 en de gedeelde OpenRouter-client; P1 = CAP-2, 4, 5, 7, 12, 15; P2 = CAP-6, 10. De drie build-AC's en de I/O-matrix krijgen de prioriteit van de CAP waarop ze rusten (AC-1 en AC-3 P0, AC-2 P2; I/O-rijen P0, behalve "certificaatnummer zonder kandidaat" P1 via CAP-7).
- **Kennis geladen:** `test-priorities-matrix`, `risk-governance`, `probability-impact`, `test-quality`, `selective-testing` (`_bmad/tea/testarch/knowledge/`).
- **Bewust ongetest (DRAAIPLAN.md, regels `ongetest:`):** stappen 1–4, 6–13 en 15 noemen elk welke opdrachtregel of netwerkstap niet automatisch getest is (geen klantartwork naar OpenRouter, geen netwerk naar productie, geen volle training). Deze stappen vallen onder CAP-10 (het draaiplan moet ze benoemen) en tellen niet als ontbrekende test voor een CAP-criterium, zolang de bouwsteen zelf getest is.
- **Klantdata:** `~/logo-meetset-20261018/` niet gelezen; de `lokaal`-test van CAP-1 leest die invoer zelf via `PROEF_MAP`.
- **Headless besluiten:** modus Create; uitvoermodus `auto` → sequentieel in de hoofddraad (de mapping is één samenhangende matrix); bestandsnamen volgens de conventie in deze map (`<onderwerp>-trace.md`, `<onderwerp>-gate.json`).

## Stap 2 — Tests gevonden en ingedeeld

Map `_bmad-output/planning-artifacts/spike-getrainde-detector/tests/`, 18 bestanden, **418 tests** na parametrisatie (`pytest --collect-only`). Geen test-ID's in de vorm `1.3-E2E-001`; de koppeling loopt via de bestandsnaam (`test_capNN_*`) en het voorvoegsel van de testnaam. `test_review_20261101.py` (52) bevat de tests die de code review van 01-11 toevoegde; die zijn hieronder per CAP toegewezen op naam.

| bestand | tests | niveau | CAP | prio |
|---|---:|---|---|---|
| `test_cap01_scheiding.py` | 20 | unit + 1 `lokaal` (echte invoer) | 1 | P0 |
| `test_cap02_kandidaten.py` | 15 | unit (nagebootste client) | 2 | P1 |
| `test_cap03_invulpagina.py` | 34 | integratie (echte server op poort 0) + unit (`uitslag`) | 3 | P0 |
| `test_cap03_invulpagina_browser.py` | 12 | browser (Playwright, Chromium) | 3 | P0 |
| `test_cap04_generator.py` | 10 | unit (verzonnen beelden) | 4 | P1 |
| `test_cap05_echt.py` | 12 | unit | 5 | P1 |
| `test_cap06_training.py` | 10 | unit + 2 `zwaar` (rooktest MPS) | 6 | P2 |
| `test_cap07_herkenning.py` | 35 | unit | 7 | P1 |
| `test_cap08_beoordelaar.py` | 15 | unit (nagebootst transport) | 8 | P0 |
| `test_cap09_telling.py` | 47 | unit + integratie server → `uitslag.json` → telscript | 9 | P0 |
| `test_cap10_draaiplan.py` | 4 | documentcontrole | 10 | P2 |
| `test_cap11_bevriezing.py` | 7 | unit | 11 | P0 |
| `test_cap12_k4aa_runner.py` | 12 | unit (nagebootste `k4aa`-module) | 12 | P1 |
| `test_cap13_licenties.py` | 47 | unit + 1 `lokaal` (echte omgeving) | 13 | P0 |
| `test_cap14_uitgaven.py` | 9 | unit | 14 | P0 |
| `test_cap15_beelden.py` | 30 | unit (nagebootste opdrachtuitvoerder) | 15 | P1 |
| `test_openrouter.py` | 47 | unit (nagebootst transport) | gedeelde client (randvoorwaarden §1–2) | P0 |
| `test_review_20261101.py` | 52 | unit + 2 pagina/server | 2, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, client | gemengd |

Indeling naar het niveaumodel van de workflow: geen E2E tegen een draaiende applicatie en geen API van een product; de invulserver (4 lokale endpoints) is getest op integratieniveau, de pagina op browserniveau, de rest op unitniveau.

### Dekkingsheuristieken (`coverage_heuristics`)

- **Endpoints:** de invulserver heeft `GET /`, `GET /items.json`, `GET /stand`, `POST /opslaan`. Alle vier zijn direct getest (`test_cap03_pagina_en_items`, `test_cap03_stand_endpoint_gebruikt_de_gedeelde_functie`, `test_cap03_keuze_landt_volgens_het_schema` e.a.). Externe aanroep OpenRouter `POST /api/v1/chat/completions` is getest met een nagebootst transport (`test_openrouter_*`). `endpoints_without_tests: []`.
- **Authenticatie/autorisatie:** geen inlog. Wel toegangsregels met negatieve paden: server alleen op 127.0.0.1 (`test_cap03_server_luistert_alleen_lokaal`), vreemde Host/Origin → 403 (`test_server_weigert_vreemde_host_en_vreemde_origin`), OpenRouter 401/402/403 → run stopt (`test_openrouter_401_402_403_stoppen_de_run`), sleutel alleen uit de omgeving, ontbreekt → `RunStop("auth")` (`test_openrouter_sleutel_alleen_uit_de_omgeving`). `auth_missing_negative_paths: []`.
- **Foutpaden:** per CAP aanwezig (ongeldige invoer, 404/429/5xx/`OSError`, ongeldig antwoord, budget, zdr-weigering, schrijven in een git-werkboom, te grote beelden, ssh-fout 255). `criteria_happy_path_only: []`.

## Stap 3 — Matrix criteria → tests

Dekking = of elke deelbewering van het criterium een test heeft. Of die test slaagt staat in de kolom "uitslag" (run van 01-11-2026, zie fase 2). Testnamen zonder bestand: zie het bestand van de CAP; `R:` = `test_review_20261101.py`.

| # | criterium | prio | tests (kern) | dekking | uitslag | fout-/randpad |
|---|---|---|---|---|---|---|
| CAP-1 | scheiding op GLN, uitsluitingen, uitputtend, deterministisch, dHash ≤ 6, lokaal tabel (zwakste 16,5) | P0 | 20 in `test_cap01_*` (o.a. `geen_leverancier_aan_beide_kanten`, `referentie_training_data_en_fase_b_gtins_nooit_in_de_toets`, `nul_uitgesloten_gtins_is_een_fout`, `uitputtende_zoektocht_wint_van_gulzige_keuze`, `zelfde_invoer_geeft_dezelfde_indeling…`, `bijna_gelijke_trainings_en_validatiebeelden_gaan_eruit`, `schrijf_*`, `lokaal_echte_invoer_reproduceert_de_tabel`); R: `nutriscore_token_van_twee_letters_telt_niet` | FULL | groen (21/21) | nul uitgesloten, gelijkspel, schrijven in repo |
| CAP-2 | kandidaten ≤ 40 (+10 gelijkend), ontdubbeld, voorinvulling ander model via zdr-client, rapport, stoppunt 2 < 16 | P1 | 15 in `test_cap02_*`; `test_openrouter_voorinvulling_weigert_het_k4aa_model`; R: `voorinvulling_verdeelt_tegels…`, `voorinvulling_stopt_na_5_weigeringen…`, `ontdubbel_voegt_aanvulling_samen…`, `alleen_zonder_bestaand_weigert` | FULL | groen | mislukte voorinvulling, zdr-weigering niet ingeslikt |
| CAP-3 | server atomisch volgens schema, 8 gelijktijdig, weigeringen; browser: cursor/tekst, sneltoetsen in tekstveld, concept na herladen; stand t.o.v. doel | P0 | 34 server/`uitslag` + 12 browser (`test_p0_cursor_en_tekst_blijven_staan…`, `test_p0_sneltoetsen_doen_niets_in_het_tekstveld`, `test_p0_concept_per_toetsaanslag_en_gaat_voor_op_serverstand`, `test_p1_stand_per_keurmerk_tegen_het_doel`); R: 4 (tussenstand, Host/Origin 403, `b` onvolledig, volgorde opslagen) | FULL | groen (50/50) | onbekend etiket, ongeldige waarde, onvolledig bevestigd, kapotte aanvraag, vreemde Origin |
| CAP-4 | COCO, alles gelabeld, gelijkend ongelabeld, geen overlap, 0–10% leeg, 4 varianten, bron-GTIN trainingskant, achtergrond zonder keurmerk, seed | P1 | 10 in `test_cap04_*`; R: `generator_60_procent_regel_en_achtergrond_als_pad` | FULL | groen | bron van toetsleverancier, `leeg_fractie` > 0,1 |
| CAP-5 | voorlabels via gedeelde client, geen toetsleverancier, onzekere tegels eruit, valsplit per klasse op dHash-cluster, rapport | P1 | 12 in `test_cap05_*`; R: 9 (`schoon_*`, `voorlabels_maat_*`, `naar_tegels_rand_*`, `valsplit_slaat_te_groot_cluster_over…`, `dataset_*`, `validatie_onzekere_code…`, `voorlabels_herstart…`, `klassenlijst…`) | FULL | groen | toetsleverancier, vakje buiten beeld, kapotte vakjes |
| CAP-6 | trainingscommando met config/seed/log/checkpoint/sha256/gewichtsherkomst; snelheidsmeting **op MPS** met verwachte duur; rooktest → laadbaar checkpoint | P2 | 10 in `test_cap06_*` (incl. 2 `zwaar`: `rooktest_paar_iteraties_geeft_laadbaar_checkpoint_met_herkomst`, `snelheidsmeting_geeft_seconden_per_iteratie_en_verwachte_duur`); R: `gewichtsherkomst_fase_2…`, `op_schaal_verkleint…` | **PARTIAL** | groen | geen test beweert dat het apparaat MPS is; alleen het pytest-log ("GPU available: True (mps), used: True") en de meting in de specfile tonen het (ATDD: "bewust niet gedekt") |
| CAP-7 | tegels, NMS (ook over Nutri-Score), band, `laag`/`hoog` uit mini-validatie incl. terugval en 1,01, certificaat alleen bevestigen | P1 | 35 in `test_cap07_*`; R: `tegels_weigert_overlap…`, `beslis_stoppunt_7…`, `beslis_afgebroken_run…`, `detecteer_met_bevroren…` | FULL | groen | onbekende maat, overlap buiten bereik, ontbrekend referentieplaatje |
| CAP-8 | twee losse beelden, schema ja/nee/twijfel, alleen `ja`, ongeldig = fout, hoog→laag tot `ja`, ≤ 10 | P0 | 15 in `test_cap08_*` | FULL | groen | ongeldig antwoord, fout van de client |
| CAP-9 | tabellen §7 + blinde nakijklijst uit bevroren uitvoer; definities, Nutri-Score-groep, gedeelde negatieven, onzeker/onleesbaar, fouten, > 2%, zdr-stop, te weinig < 16 / < 35, grensgetallen §4, integratie server → script | P0 | 47 in `test_cap09_*` (o.a. `besluit_bij_de_grensgetallen` met (15,…,50), (16,…,34), `integratie_server_uitslag_json_telscript`, `main_stopt_bij_zdr_weigering_zonder_tabellen`); R: 4 (verkeerde letter, correcties, ongeldige correcties, `aandeel_requires_review`) | FULL | groen | foutpercentage, zdr, onvoltooide run |
| CAP-10 | `DRAAIPLAN.md`: vaste volgorde, per stap commando/uitvoer/kosten/tijd/stoppunt, getest of `ongetest:` met reden | P2 | 4 in `test_cap10_*` | FULL | groen | script bestaat niet, stap zonder reden |
| CAP-11 | `bevroren.json` met sha256 van alle onderdelen; gewijzigd → geweigerd; tweede run zonder `--herhaling` + reden → geweigerd; eerste blijft | P0 | 7 in `test_cap11_*`; R: 4 (`bevries_legt_code_vast…`, `bevries_map_gewijzigd…`, `bevries_instellingen…`, `laatste_voltooide_run`) | FULL | groen | ontbrekend onderdeel, schrijven in repo |
| CAP-12 | alleen referenties van trainingskant/publiek, elke detectie (ook `requires_review`) een melding, tijdsbudget, `budget_exhausted` routefout, `no_zdr_provider` stopt, uitvoer met kosten/tijd | P1 | 12 in `test_cap12_*` (fout geparametriseerd over `budget_exhausted`, `provider_error`, `image_invalid`, `references_incomplete`); R: 3 (grens, `_matrix`, `--bevroren`) | FULL | groen | zdr, budget |
| CAP-13 | verboden pakket stopt, `AND`/`OR`, leeg veld → licentiebestand, onbekend stopt; **echte omgeving zonder overtredingen** | P0 | 47 in `test_cap13_*` incl. `lokaal_echte_omgeving_zonder_overtredingen`; R: `licentie_met_ongelezen_rest_is_onbekend` | FULL | **1 rood** (46+1 groen, 1 rood) | `torch` 2.15.0 (`… AND BSL-1.0 AND …`) en `regex` 2026.9.29 (`Apache-2.0 AND CNRI-Python`) vallen buiten randvoorwaarden §4 → stoppunt 4 |
| CAP-14 | post boven grens start niet, aanroep die grens passeert niet verstuurd, kosten uit `usage.cost` anders tokens × tarief | P0 | 9 in `test_cap14_*`; `test_openrouter_bewaker_houdt_de_aanroep_tegen…`; R: `bewaker_grootboek…`, `client_weigert_model_zonder_tarief`, `beslis_start_niet_boven_de_uitgavengrens`, `k4aa_stopt_voor_het_etiket…` | FULL | groen | herstart, model zonder tarief |
| CAP-15 | ophaalquery alleen `SELECT`, rsync/ssh met `nice -n 19` zonder schrijfopties, samenvoegen als `bouw.py`, PDF en RGBA/CMYK, weigert schrijven in git-werkboom | P1 | 30 in `test_cap15_*`; R: 5 (RGB-origineel, origineel bouwen, ssh-fout 255, alleen PDF, stderr) | FULL | groen | > 250 MP, ongeldige invoer query, schrijven in repo |
| RV-1/2 | gedeelde OpenRouter-client: zdr-provider, vaste URL, zdr-proef, statustabel, logs zonder inhoud, sleutel uit omgeving | P0 | 47 in `test_openrouter.py`; R: `client_onvolledig_antwoord…`, `antwoord_met_verkeerde_typen…` | FULL | groen | 404/401/402/403/4xx/429/5xx/`OSError` |
| AC-1 | dev-suite: alle niet-`zwaar`-tests slagen, `lokaal`-tests slagen op echte invoer | P0 | de hele suite | FULL | **niet gehaald** (417 groen, 1 rood: CAP-13 `lokaal`) | — |
| AC-2 | detectoromgeving `-m zwaar`: rooktests slagen op MPS | P2 | 2 `zwaar` in CAP-6 | **PARTIAL** | groen | MPS alleen uit het log, niet beweerd |
| AC-3 | `licenties.controleer(pakketten_uit_omgeving())` → nul overtredingen | P0 | `test_cap13_lokaal_echte_omgeving_zonder_overtredingen` | FULL | **niet gehaald** (2 overtredingen) | stoppunt 4 |
| IO-1 | zdr-weigering → `RunStop("geen_zdr")`, hele run stopt, telt niet als eerste run | P0 | `test_openrouter_404_stopt_de_run_geen_zdr…`, `test_cap12_no_zdr_provider_stopt_de_run`, `test_cap09_zdr_weigering_stopt_de_telling`, R: `beslis_afgebroken_run_herstart_en_telling`, `laatste_voltooide_run` | FULL | groen | — |
| IO-2 | budgetgrens → aanroep niet verstuurd, `RunStop("budget")` | P0 | `test_openrouter_bewaker_houdt_de_aanroep_tegen…`, `test_cap14_aanroep_die_de_grens_zou_passeren_mag_niet` | FULL | groen | — |
| IO-3 | tweede toetsrun zonder `--herhaling` → `AlGedraaid`, eerste blijft | P0 | `test_cap11_eerste_toetsrun_telt_tweede_zonder_herhaling_en_reden_geweigerd`, `…herhaling_met_technische_reden_mag_en_eerste_blijft_bewaard` | FULL | groen | — |
| IO-4 | gewijzigd bevroren onderdeel → `Gewijzigd` | P0 | `test_cap11_toetsrun_met_een_gewijzigd_onderdeel_wordt_geweigerd`, R: `bevries_map_gewijzigd…` | FULL | groen | — |
| IO-5 | schrijven in git-werkboom → `BinnenRepo`, niets geschreven | P0 | `test_cap15_doel_in_een_git_werkboom…`, `…doel_in_deze_repository…`, `…opslaan_weigert…`, `test_cap01_schrijf_weigert…`, `test_cap04_schrijft_niet…`, `test_cap06_uitvoermap…`, `test_cap11_bevroren_json_binnen…` | FULL | groen | — |
| IO-6 | certificaatnummer zonder kandidaat → geen melding | P1 | `test_cap07_certificaat_bevestigt_alleen_een_kandidaat_in_de_band`, `…certificaat_haalt_nooit_een_melding_weg` | FULL | groen | — |

### Controle op de dekkingslogica

- P0- en P1-criteria hebben allemaal dekking (FULL).
- Geen criterium is alleen op het geluksscenario getest; waar het criterium foutafhandeling vraagt (zdr, budget, ongeldige antwoorden, toegangsregels), is het negatieve pad getest.
- Dubbele dekking is bewust: zdr en budget worden zowel in de client als bij elke aanroeper (voorinvulling, `beslis`, K4-aa-runner, telscript) getest, omdat de stop per aanroeper anders wordt vastgelegd.
- Bewust buiten de tests (DRAAIPLAN `ongetest:`): de opdrachtregels en netwerkstappen van stap 1–4, 6–13 en 15 (netwerk naar productie, klantartwork naar OpenRouter, volle training, `main` van de K4-aa-runner met de ml-service-code). De bouwstenen onder die stappen zijn getest; CAP-10 eist alleen dat het draaiplan dit per stap benoemt, en dat doet het (getoetst door `test_cap10_genoemde_scripts_bestaan_en_zijn_getest_of_ongetest_met_reden`). Eén handmatige handeling zonder gereedschap: trainingsbeelden uit `manifest.json` halen na de dHash-controle (stap 7).

## Stap 4 — Gatenanalyse (fase 1 afgerond)

- **Uitvoermodus:** config `tea_execution_mode: auto` met capability-probe zou `subagent` geven. De drie parallelle secties (gatenindeling, heuristieken, statistiek) zijn hier tellingen over 25 rijen; ze zijn in één deterministisch script na elkaar uitgevoerd (headless keuze, vastgelegd als afwijking).
- **Fase-1-matrix:** `/tmp/tea-trace-coverage-matrix-2026-11-01T04-24-58.json` (`phase: PHASE_1_COMPLETE`).

| statistiek | waarde |
|---|---|
| criteria totaal | 25 (15 CAP + gedeelde client + 3 AC + 6 I/O-rijen) |
| FULL | 23 (92%) |
| PARTIAL | 2 (CAP-6, AC-2; beide P2) |
| NONE | 0 |
| P0 | 15/15 (100%) |
| P1 | 7/7 (100%) |
| P2 | 1/3 (33%) |
| P3 | 0/0 |

- **Gaten:** kritiek (P0) 0, hoog (P1) 0, middel (P2) 0 zonder dekking; gedeeltelijk: CAP-6 en AC-2 (het apparaat MPS wordt niet beweerd).
- **Heuristieken:** endpoints zonder test 0; toegangsregels zonder negatief pad 0; criteria alleen op het geluksscenario 0.
- **Los van de dekking:** drie criteria zijn gedekt maar niet gehaald, omdat één P0-test rood is: CAP-13 (laatste deelbewering), AC-1 en AC-3 — allemaal door `test_cap13_lokaal_echte_omgeving_zonder_overtredingen`.

### Aanbevelingen

1. **URGENT** — stoppunt 4 naar Friso: `torch` 2.15.0 (`… AND BSL-1.0 AND …`) en `regex` 2026.9.29 (`Apache-2.0 AND CNRI-Python`) toestaan door randvoorwaarden §4 aan te vullen, of een waiver met reden en einddatum. Daarna de `lokaal`-test van CAP-13 opnieuw draaien. (CAP-13, AC-1, AC-3)
2. **MEDIUM** — CAP-6/AC-2 volledig maken: laat de `zwaar`-tests beweren dat training en snelheidsmeting op `mps` liepen (bijvoorbeeld een veld `apparaat` in het resultaat van `train`/`snelheid`).
3. **LOW** — `bmad-testarch-test-review` voor de testkwaliteit (o.a. omvang van `test_review_20261101.py`).

## Stap 5 — Gatebesluit (fase 2)

### Bewijs: testuitvoering (VERIFIED, 01-11-2026, HEAD `e157e5f`)

```
cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider
FAILED tests/test_cap13_licenties.py::test_cap13_lokaal_echte_omgeving_zonder_overtredingen
1 failed, 417 passed, 18 warnings in 56.30s

uv run --group dev --group detector pytest -q -p no:cacheprovider -m "zwaar or lokaal"
PASSED test_cap01_lokaal_echte_invoer_reproduceert_de_tabel
PASSED test_cap06_rooktest_paar_iteraties_geeft_laadbaar_checkpoint_met_herkomst
PASSED test_cap06_snelheidsmeting_geeft_seconden_per_iteratie_en_verwachte_duur
FAILED test_cap13_lokaal_echte_omgeving_zonder_overtredingen
1 failed, 3 passed, 414 deselected, 18 warnings in 28.68s
```

- Overtredingen (zelfde omgeving, `licenties.controleer(licenties.pakketten_uit_omgeving())`): `regex` 2026.9.29 `Apache-2.0 AND CNRI-Python`; `torch` 2.15.0 `Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND ISC AND MIT AND Zlib`.
- In de standaardrun liepen ook de `zwaar`- en browsertests (de `.venv` heeft `rfdetr` en Chromium); 0 overgeslagen.
- `git status --porcelain` na de runs: alleen dit rapport is nieuw; geen code, test of licentielijst gewijzigd.
- Uitkomsten per prioriteit (testbestanden van stap 2): P0 237/238 (99,6%), P1 114/114, P2 14/14, reviewbestand (gemengd) 52/52; totaal 417/418 (99,8%).

### Toetsing van de beslisregels

| regel | drempel | gemeten | status |
|---|---|---|---|
| P0-dekking | 100% | 100% (15/15) | MET |
| P0-slaagpercentage (template, "must all pass") | 100% | 99,6% (237/238) | **NOT MET** |
| P1-dekking | ≥ 90% (PASS), ≥ 80% (minimum) | 100% (7/7) | MET |
| totale dekking | ≥ 80% | 92% (23/25) | MET |
| totaal slaagpercentage | — | 99,8% (417/418) | informatief |
| P2 | informatief | dekking 1/3, slagen 14/14 | volgt, blokkeert niet |
| waiver | — | geen (geen besluit van Friso; headless run) | — |

De dekkingsboom van stap 5 alleen geeft PASS; de P0-eis uit het template (alle P0-tests groen) maakt het **FAIL**. Er is geen waiver, dus niet WAIVED.

### GATE DECISION: FAIL

**Reden:** één P0-test rood — de licentiecontrole op de echte detectoromgeving vindt 2 licenties buiten randvoorwaarden §4 (stoppunt 4). Daardoor zijn CAP-13 (laatste deelbewering), AC-1 en AC-3 van de buildspec niet gehaald. Er is geen dekkingsgat: elk criterium heeft een test, en alle andere 417 tests slagen.

**Risico (probability × impact, INFERENCE):** kans 3 (de overtreding is er nu), impact 2 (blokkeert de trainingsstappen 9–10 van het draaiplan; het overige gereedschap werkt) → score 6, actie MITIGATE. Eigenaar: Friso (productkeuze over de toegestane lijst). Wijst hij `torch` af, dan valt elke detector op `torch` af (ook de terugval D-FINE); dan wordt de impact 3.

### Openstaande punten

1. **Stoppunt 4 (blokkerend, eigenaar Friso):** `torch` (BSL-1.0-deel) en `regex` (CNRI-Python) toestaan via randvoorwaarden §4, of een waiver. Niet door de build of deze trace op te lossen zonder de toegestane lijst te wijzigen.
2. **CAP-6 / AC-2 gedeeltelijk (P2, blokkeert niet):** geen test beweert het apparaat `mps`; het pytest-log toont "GPU available: True (mps), used: True".
3. **Bewust ongetest volgens DRAAIPLAN:** opdrachtregels en netwerkstappen van stap 1–4, 6–13 en 15; handmatige opschoning van `manifest.json` na stap 7. Geen gat in een CAP-criterium, wel risico bij het echte draaien.
4. **Ter kennisname (buiten de trace):** reviewbevinding 11 (nakijklijst bevat alleen verschillen) ligt als contractvraag bij Friso; stoppunt 1 voor maat S (±11 uur per fase) staat in de specfile.

### Volgende stappen

- Friso beslist over stoppunt 4 → bij aanvulling van de lijst: CAP-13-`lokaal` opnieuw draaien en deze trace opnieuw uitvoeren (verwacht PASS); bij een waiver: gate WAIVED met reden, goedkeurder en einddatum.
- Daarna afronding van `bmad-build` (step-05) voor de spec `spec-spike-getrainde-detector.md` (nu `in-review`).

```
🚨 GATE DECISION: FAIL
- P0 Coverage: 100% (Required: 100%) → MET
- P0 Test Pass Rate: 99,6% (Required: 100%) → NOT MET
- P1 Coverage: 100% (PASS target: 90%, minimum: 80%) → MET
- Overall Coverage: 92% (Minimum: 80%) → MET
⚠️ Critical Gaps: 0 (dekking); 1 rode P0-test (stoppunt 4)
📂 Gate-bestand: _bmad-output/test-artifacts/traceability/spike-getrainde-detector-gate.json
```
