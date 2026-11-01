---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-01'
run: 3
head: 'c6c2a23 + niet-gecommitte testuitbreiding B-IO-1'
gate: 'PASS'
vorige_runs:
  - {run: 1, head: 'e157e5f', gate: 'FAIL', reden: 'licentietest echte omgeving rood (stoppunt 4)'}
  - {run: 2, head: 'c6c2a23', gate: 'FAIL', reden: 'P0-dekkingsgat B-IO-1 (hoofdletterongevoeligheid ongetest)'}
---

# Traceability — spike proef getrainde detector

> [!note] Gatebesluit run 3: PASS
> P0-dekking 25/25 (100%), P1 9/9 (100%), totaal 35/37 (95%); alle tests groen (494/494 en 4/4) en de licentiecontrole op de echte omgeving schoon (93 pakketten, 0 overtredingen). Het gat van run 2 (B-IO-1) is gedicht door `bmad-testarch-automate`: 9 extra gevallen in `tests/test_besluiten_20261101.py` toetsen andere schrijfwijzen, positief en negatief. Blijft gedeeltelijk, zonder blokkade: CAP-6a en AC-2 (P2, MPS niet beweerd).
>
> **Let op:** de testuitbreiding is nog niet gecommit; de werkboom is HEAD `c6c2a23` plus die wijziging. Commit hem samen met deze trace, anders klopt het besluit niet met de tak.

## Historie

| run | datum | HEAD | tests (dev / `zwaar or lokaal`) | dekking | gate | reden |
|---|---|---|---|---|---|---|
| 1 | 01-11-2026 | `e157e5f` | 417/418 / 3/4 | 23/25 (92%), P0 15/15, P1 7/7 | FAIL | P0-test `test_cap13_lokaal_echte_omgeving_zonder_overtredingen` rood: `torch` 2.15.0 (BSL-1.0-deel) en `regex` 2026.9.29 (CNRI-Python) buiten randvoorwaarden §4 → stoppunt 4; CAP-13, AC-1, AC-3 niet gehaald. PARTIAL: CAP-6, AC-2 (MPS niet beweerd). |
| 2 | 01-11-2026 | `c6c2a23` | 485/485 / 4/4 | 34/37 (92%), P0 24/25, P1 9/9 | FAIL | P0-dekkingsgat B-IO-1 (hoofdletterongevoeligheid ongetest). Geen rode test. |
| 3 | 01-11-2026 | `c6c2a23` + testuitbreiding | 494/494 / 4/4 | 35/37 (95%), P0 25/25, P1 9/9 | **PASS** | B-IO-1 gedicht; alleen P2 gedeeltelijk (CAP-6a, AC-2). |

Wat in run 3 veranderde: alleen `tests/test_besluiten_20261101.py` (+6/−2 regels, door `bmad-testarch-automate`, verslag `_bmad-output/test-artifacts/automation-summary-spike-getrainde-detector.md`). `test_cap13_bsl_1_0_en_cnri_python_zijn_toegestaan` 5 → 10 gevallen (`bsl-1.0`, `Bsl-1.0`, `cnri-python`, `CNRI-PYTHON`, `Apache-2.0 AND cnri-python`); `test_cap13_busl_bsl_1_1_en_cnri_jython_blijven_verboden` 6 → 10 (`busl-1.1`, `bsl-1.1`, `cnri-jython`, `CNRI-JYTHON`). Geen productiecode gewijzigd. De rest van dit rapport (stap 1–3) geldt ongewijzigd; alleen de rij B-IO-1, de statistiek en het besluit zijn bijgewerkt.

Wat sinds run 1 is opgelost:
- **Stoppunt 4:** Friso liet `BSL-1.0` en `CNRI-Python` toe (commit `c86a067`); gebouwd in `21f9d89`. De `lokaal`-test van CAP-13 is groen, `licenties.py` geeft exitcode 0.
- **Reviewbevinding 11** (nakijklijst bevat alleen verschillen): beslist in `c86a067` — gestratificeerde steekproef van 10%, verborgen sleutel, oordeel per regel, tweede ronde (meetregels §6–§7); gebouwd en getest (CAP-9, B-IO-3 t/m B-IO-8).

Volledige tekst van run 1: `git show 55a22a9:_bmad-output/test-artifacts/traceability/spike-getrainde-detector-trace.md`.

## Stap 1 — Context (run 2; geldt ook voor run 3, behalve de testuitbreiding hierboven)

- **Werkboom:** `.claude/worktrees/proef-detector`, tak `spike/proef-getrainde-detector`, HEAD `c6c2a23`, werkboom schoon vóór deze run (`git status --porcelain` leeg). Sinds run 1: `c86a067` (besluiten Friso in SPEC, meetregels, randvoorwaarden, trainingsset), `79f6ce1` (ATDD ronde 2, 55 rode tests), `21f9d89` (bouw), `c6c2a23` (wankele browsertest in `deferred-work.md`).
- **Contract (criteria):** de `success`-regels van CAP-1 t/m CAP-15 in `SPEC.md` (bijgewerkt 01-11: CAP-6, CAP-9 en CAP-13 gewijzigd), gelezen met `meetregels.md`, `toetsset.md`, `trainingsset-en-herkenning.md` en `randvoorwaarden.md`; de 3 AC's en 6 I/O-rijen van `spec-spike-getrainde-detector.md` (status `in-review`); de 3 AC's en 8 I/O-rijen van `spec-spike-getrainde-detector-besluiten.md` (status `done`).
- **ATDD-checklist:** `_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md`, incl. "Ronde 2 (besluiten Friso 01-11-2026)": 52 nieuwe tests, 4 aangepaste, rode run 55 failed / 415 passed.
- **Prioriteiten:** zoals run 1 (ATDD stap 3). Ronde 2: CAP-13 P0, CAP-9 P0, CAP-10 P2, de maatregel van CAP-6 P1. Rijen van de besluiten-buildspec krijgen de prioriteit van de CAP waarop ze rusten: B-IO-1 (CAP-13) P0, B-IO-2 (CAP-6b) P1, B-IO-3 t/m B-IO-8 (CAP-9) P0; B-AC-1 en B-AC-3 P0; B-AC-2 P0 (rust op de `lokaal`-tests van CAP-1 en CAP-13 en de `zwaar`-tests van CAP-6).
- **Kennis geladen:** `test-priorities-matrix`, `risk-governance`, `probability-impact`, `test-quality`, `selective-testing` (`_bmad/tea/testarch/knowledge/`).
- **Bewust ongetest (DRAAIPLAN.md, 13 regels `ongetest:`):** stappen 1–4, 6–13 en 15 noemen welke opdrachtregel of netwerkstap niet automatisch getest is. Ongewijzigd t.o.v. run 1; telt niet als ontbrekende test zolang de bouwsteen getest is (CAP-10 eist alleen de vermelding).
- **Klantdata:** `~/logo-meetset-20261018/` niet gelezen door deze trace; de `lokaal`-test van CAP-1 leest zijn invoer zelf.
- **Headless besluiten (geen mens aanwezig):** modus Create; uitvoermodus sequentieel in de hoofddraad (de fase-1-secties zijn tellingen over 37 rijen, in één script); bestanden in place bijgewerkt op verzoek van de orchestrator in plaats van het standaardpad `traceability-report.md`. **CAP-6 gesplitst** in CAP-6a (training, MPS, rooktest; P2) en CAP-6b (maat N, andere maat alleen met besluit; P1), zodat de nieuwe P1-regel uit ronde 2 niet onder P2 verdwijnt.

## Stap 2 — Tests gevonden en ingedeeld

Map `_bmad-output/planning-artifacts/spike-getrainde-detector/tests/`, 19 testbestanden, **494 tests** na parametrisatie (run 2: 485) (`pytest --collect-only`). Koppeling via de bestandsnaam (`test_capNN_*`) en het voorvoegsel van de testnaam; `R:` = `test_review_20261101.py`, `B:` = `test_besluiten_20261101.py`, `RB:` = `test_review_besluiten_20261101.py`.

| bestand | tests | niveau | CAP | prio |
|---|---:|---|---|---|
| `test_cap01_scheiding.py` | 20 | unit + 1 `lokaal` | 1 | P0 |
| `test_cap02_kandidaten.py` | 15 | unit (nagebootste client) | 2 | P1 |
| `test_cap03_invulpagina.py` | 34 | integratie (server op poort 0) + unit | 3 | P0 |
| `test_cap03_invulpagina_browser.py` | 12 | browser (Playwright, Chromium) | 3 | P0 |
| `test_cap04_generator.py` | 10 | unit | 4 | P1 |
| `test_cap05_echt.py` | 12 | unit | 5 | P1 |
| `test_cap06_training.py` | 10 | unit + 2 `zwaar` (MPS) | 6 | P2 |
| `test_cap07_herkenning.py` | 35 | unit | 7 | P1 |
| `test_cap08_beoordelaar.py` | 15 | unit (nagebootst transport) | 8 | P0 |
| `test_cap09_telling.py` | 47 | unit + integratie server → telscript | 9 | P0 |
| `test_cap10_draaiplan.py` | 4 | documentcontrole | 10 | P2 |
| `test_cap11_bevriezing.py` | 7 | unit | 11 | P0 |
| `test_cap12_k4aa_runner.py` | 12 | unit (nagebootste `k4aa`) | 12 | P1 |
| `test_cap13_licenties.py` | 47 | unit + 1 `lokaal` (echte omgeving) | 13 | P0 |
| `test_cap14_uitgaven.py` | 9 | unit | 14 | P0 |
| `test_cap15_beelden.py` | 30 | unit (nagebootste opdrachtuitvoerder) | 15 | P1 |
| `test_openrouter.py` | 47 | unit (nagebootst transport) | client (RV §1–2) | P0 |
| `test_review_20261101.py` | 52 | unit + 2 pagina/server | 2–7, 9, 11–15, client | gemengd |
| `test_besluiten_20261101.py` (nieuw) | 61 | unit + opdrachtregel + 2 processen + documenttest | 13 (22; run 2: 13), 6b (16), 9 (18), 10 (5) | P0/P1/P2 |
| `test_review_besluiten_20261101.py` (nieuw) | 15 | unit + opdrachtregel | 9 (14), 6b (1) | P0/P1 |

### Dekkingsheuristieken (`coverage_heuristics`)

- **Endpoints:** ongewijzigd; de invulserver (`GET /`, `GET /items.json`, `GET /stand`, `POST /opslaan`) en OpenRouter `POST /api/v1/chat/completions` (nagebootst) zijn direct getest. De nieuwe onderdelen hebben geen endpoint. `endpoints_without_tests: []`.
- **Toegang:** ongewijzigd (alleen 127.0.0.1, vreemde Host/Origin → 403, OpenRouter 401/402/403 stopt, sleutel alleen uit de omgeving). `auth_missing_negative_paths: []`.
- **Foutpaden (nieuw in ronde 2):** andere maat zonder besluit (functie, snelheidsmeting vóór het werk, opdrachtregel), `BUSL-1.1`/`BSL-1.1`/`CNRI-Jython`/vrije tekst blijven overtreding, nakijken met ontbrekende regel / regel buiten de lijst / ongeldige waarde, oude `--correcties`, onvolledige tweede ronde, 7 ongeldige ronde-2-opties, lijst gewijzigd sinds stap 14 (hashcontrole), oude uitvoer blijft niet staan. `criteria_happy_path_only: []`.

## Stap 3 — Matrix criteria → tests

Dekking = of elke deelbewering van het criterium een test heeft; "uitslag" = run 3 (01-11-2026, HEAD `c6c2a23` + testuitbreiding B-IO-1).

### SPEC.md (CAP-1 t/m CAP-15) en de gedeelde client

| # | criterium (kern) | prio | tests (kern) | dekking | uitslag |
|---|---|---|---|---|---|
| CAP-1 | scheiding op GLN, uitsluitingen, uitputtend, deterministisch, dHash ≤ 6, `lokaal` tabel | P0 | 20 in `test_cap01_*`; R: `nutriscore_token_van_twee_letters_telt_niet` | FULL | groen |
| CAP-2 | kandidaten ≤ 40 (+10), ontdubbeld, voorinvulling via zdr-client, rapport, stoppunt 2 | P1 | 15 in `test_cap02_*`; `test_openrouter_voorinvulling_weigert_het_k4aa_model`; R: 4 | FULL | groen |
| CAP-3 | server atomisch, 8 gelijktijdig, weigeringen; browser: cursor/tekst, sneltoetsen, concept na herladen; stand | P0 | 34 server + 12 browser; R: 4 | FULL | groen |
| CAP-4 | COCO, gelabeld/ongelabeld, geen overlap, 0–10% leeg, 4 varianten, bron-GTIN, seed | P1 | 10 in `test_cap04_*`; R: 1 | FULL | groen |
| CAP-5 | voorlabels, geen toetsleverancier, onzekere tegels eruit, valsplit op dHash-cluster, rapport | P1 | 12 in `test_cap05_*`; R: 9 | FULL | groen |
| CAP-6a | trainingscommando (config, seed, log, checkpoint, sha256, gewichtsherkomst); snelheidsmeting **op MPS** met verwachte duur; rooktest → laadbaar checkpoint | P2 | 8 in `test_cap06_*` (incl. 2 `zwaar`); R: 2 | **PARTIAL** | groen — geen test beweert `apparaat == "mps"` (ongewijzigd t.o.v. run 1) |
| CAP-6b | andere maat dan N geweigerd zonder vastgelegde besluitverwijzing (nieuw 01-11) | P1 | B: `test_cap06_andere_maat_dan_n_zonder_besluit_wordt_geweigerd` (9), `…zonder_besluit_parameter_weigert_config_s`, `…maat_n_zonder_besluit_mag_en_een_besluit_wordt_vastgelegd`, `…snelheidsmeting_andere_maat_zonder_besluit_weigert_voor_het_werk` (3), `…opdrachtregel_train_vraagt_besluit…`, `…opdrachtregel_snelheid_geeft_besluit_door`; aangepast: `test_cap06_configuratie_legt_fase_maat_seed_epochs_en_mappen_vast` (2); RB: `test_snelheid_andere_maat_met_besluit_legt_het_besluit_vast` | FULL | groen |
| CAP-7 | tegels, NMS, band, `laag`/`hoog` uit mini-validatie, certificaat alleen bevestigen | P1 | 35 in `test_cap07_*`; R: 4 | FULL | groen |
| CAP-8 | twee beelden, schema ja/nee/twijfel, alleen `ja`, ongeldig = fout, hoog→laag, ≤ 10 | P0 | 15 in `test_cap08_*` | FULL | groen |
| CAP-9 | tabellen §7 en blinde nakijklijst **met steekproef** (nieuw 01-11): seed vast in de code, zelfde trekking in elk proces, regels niet te onderscheiden (sleutel en `verschil.json` apart), oordeel per regel verplicht, steekproef apart, besluitregel met tweede ronde en "voorlopig"; plus de definities, Nutri-Score-groep, gedeelde negatieven, > 2%, zdr-stop, < 16 / < 35, grensgetallen §4, integratie | P0 | 47 in `test_cap09_*` (incl. aangepast `blinde_nakijklijst_zonder_routenamen`); B: 18 (`steekproef_seed_ligt_vast…`, `nakijklijst_verschillen_plus_steekproef…`, `regels_gelijk_van_vorm…`, `hangt_niet_af_van_de_volgorde…`, `zelfde_trekking_in_elk_proces` (PYTHONHASHSEED 1/4242), `sleutel_en_verschil_in_aparte_map_met_sha256_vooraf`, `nakijken_vraagt_een_oordeel…` (2), `fout_is_elk_afwijkend_oordeel…`, `steekproef_apart…wilson…gevoeligheid`, `fout_in_steekproef_geeft_voorlopig…`, `tweede_ronde_*` (3), `te_weinig_voorbeelden_gaat_voor_voorlopig` e.a.); RB: 14; R: `nakijken_voor_een_keurmerk_en_nutriscore`, `ongeldig_nakijken…` (4) | FULL | groen |
| CAP-10 | `DRAAIPLAN.md`: volgorde, per stap commando/uitvoer/kosten/tijd/stoppunt, getest of `ongetest:`; nieuw: licentieblok weg, MAAT=N, stap 10/14/15 | P2 | 4 in `test_cap10_*`; B: 5 (`licentieblok_is_vervallen`, `maat_n_en_nergens_een_andere_maat_zonder_besluit`, `stap_10_…`, `stap_14_…`, `stap_15_…`) | FULL | groen |
| CAP-11 | `bevroren.json` met sha256, gewijzigd → geweigerd, tweede run alleen met `--herhaling` + reden | P0 | 7 in `test_cap11_*`; R: 4 | FULL | groen |
| CAP-12 | referenties alleen trainingskant/publiek, elke detectie een melding, tijdsbudget, `budget_exhausted`, `no_zdr_provider`, kosten/tijd | P1 | 12 in `test_cap12_*`; R: 3 | FULL | groen |
| CAP-13 | **BSL-1.0 en CNRI-Python toegestaan, andere buiten de lijst niet** (nieuw 01-11); verboden pakket stopt; `AND`/`OR`; leeg veld → licentiebestand; onbekend stopt; echte omgeving zonder overtredingen | P0 | 47 in `test_cap13_*` incl. `lokaal_echte_omgeving_zonder_overtredingen`; B: 13 (`bsl_1_0_en_cnri_python_zijn_toegestaan` (5), `torch_samengesteld…even_ruim`, `busl_bsl_1_1_en_cnri_jython_blijven_verboden` (6), `torch_regex_en_elk_ander_pakket…`); R: 1 | FULL | groen (ook `lokaal`) |
| CAP-14 | post boven grens start niet, aanroep die grens passeert niet verstuurd, kosten uit `usage.cost` of tokens × tarief | P0 | 9 in `test_cap14_*`; client- en R-tests | FULL | groen |
| CAP-15 | ophaalquery `SELECT`, rsync/ssh met `nice -n 19`, samenvoegen, PDF en RGBA/CMYK, weigert git-werkboom | P1 | 30 in `test_cap15_*`; R: 5 | FULL | groen |
| RV-1/2 | gedeelde OpenRouter-client: zdr, vaste URL, zdr-proef, statustabel, logs zonder inhoud, sleutel uit omgeving | P0 | 47 in `test_openrouter.py`; R: 2 | FULL | groen |

### Buildspec 1 — `spec-spike-getrainde-detector.md`

| # | criterium | prio | tests | dekking | uitslag |
|---|---|---|---|---|---|
| AC-1 | dev-suite: alle niet-`zwaar`-tests slagen, `lokaal`-tests slagen op echte invoer | P0 | hele suite | FULL | **gehaald** (494/494; run 2: 485/485; run 1: 417/418) |
| AC-2 | detectoromgeving `-m zwaar`: rooktests slagen op MPS | P2 | 2 `zwaar` in CAP-6 | **PARTIAL** | groen — MPS alleen in het log, niet beweerd |
| AC-3 | `licenties.controleer(pakketten_uit_omgeving())` → nul overtredingen | P0 | `test_cap13_lokaal_echte_omgeving_zonder_overtredingen` | FULL | **gehaald** (run 1: 2 overtredingen) |
| IO-1 | zdr-weigering → `RunStop("geen_zdr")`, run stopt, telt niet als eerste run | P0 | client, CAP-12, CAP-9, R-tests (als run 1) | FULL | groen |
| IO-2 | budgetgrens → aanroep niet verstuurd, `RunStop("budget")` | P0 | client, CAP-14 | FULL | groen |
| IO-3 | tweede toetsrun zonder `--herhaling` → `AlGedraaid`, eerste blijft | P0 | CAP-11 (2) | FULL | groen |
| IO-4 | gewijzigd bevroren onderdeel → `Gewijzigd` | P0 | CAP-11, R | FULL | groen |
| IO-5 | schrijven in git-werkboom → `BinnenRepo`, niets geschreven | P0 | CAP-15, 1, 4, 6, 11 | FULL | groen |
| IO-6 | certificaatnummer zonder kandidaat → geen melding | P1 | CAP-7 (2) | FULL | groen |

### Buildspec 2 — `spec-spike-getrainde-detector-besluiten.md`

| # | criterium | prio | tests | dekking | uitslag |
|---|---|---|---|---|---|
| B-AC-1 | volledige dev-suite → 0 failed (ook de 55 die vóór de bouw rood waren) | P0 | hele suite | FULL | gehaald: 494 passed, 0 failed |
| B-AC-2 | detectoromgeving `-m "zwaar or lokaal"` → 0 failed | P0 | 2 `zwaar` (CAP-6), 2 `lokaal` (CAP-1, CAP-13) | FULL | gehaald: 4 passed |
| B-AC-3 | `licenties.py` → exitcode 0, nul overtredingen, aantal en lijst "ruim" in de spec | P0 | `lokaal`-test CAP-13 + het commando zelf (deze run) + Implementation Notes (93 pakketten, 8 "ruim") | FULL | gehaald: exit 0, 93, `[]`, 8 "ruim" gelijk aan de spec |
| B-IO-1 | `BSL-1.0`, `CNRI-Python` (**hele term, hoofdletterongevoelig**) → `toegestaan`, niet onder `ruim`; `BUSL-1.1`, `BSL-1.1`, `CNRI-Jython`, vrije tekst blijven overtreding | P0 | B: `bsl_1_0_en_cnri_python_zijn_toegestaan` (10, waarvan 5 andere schrijfwijzen), `torch_regex_en_elk_ander_pakket…` (niet onder `ruim`), `busl_bsl_1_1_en_cnri_jython_blijven_verboden` (10, waarvan 4 andere schrijfwijzen) | FULL (run 2: PARTIAL) | groen |
| B-IO-2 | S/M/L zonder besluit (`None`, leeg, spaties) → niets gestart, geen map, geen dataset gelezen; `ValueError` met "besluit"; opdrachtregel exit ≠ 0 | P1 | B: CAP-6b-tests (9 + 1 + 3 + opdrachtregel) | FULL | groen |
| B-IO-3 | steekproef `(n + 9) // 10` per kant, 0 bij 0 | P0 | B: `nakijklijst_verschillen_plus_steekproef_per_keurmerk_en_kant` (11→2, 29→3, 1→1, 31→4, 0→0) | FULL | groen |
| B-IO-4 | regel ontbreekt / nr buiten de lijst / ongeldige waarde → geen `tabellen-na-nakijken.*`, exit ≠ 0 | P0 | B: `nakijken_vraagt_een_oordeel_voor_precies_elke_regel` (2); R: `ongeldig_nakijken_geeft_geen_tabellen_na_nakijken` (4) | FULL | groen |
| B-IO-5 | ≥ 1 fout in steekproef K → K overal "mens bevestigt (voorlopig)" en `nakijklijst-ronde2-<K>.json`; "te weinig voorbeelden" gaat voor | P0 | B: `fout_in_steekproef_geeft_voorlopig…`, `te_weinig_voorbeelden_gaat_voor_voorlopig`; RB: `geen_fout_in_de_steekproef_geeft_geen_tweede_ronde` | FULL | groen |
| B-IO-6 | `--nakijken-ronde2 K=pad` volledig → gewoon besluit; onvolledig → exit ≠ 0, geen tabellen | P0 | B: `tweede_ronde_nagekeken_geeft_het_gewone_besluit`, `tweede_ronde_vraagt_ook_een_oordeel_voor_elke_regel`; RB: `correcties_uit_de_tweede_ronde_verschuiven_met_en_zonder`, `gevoeligheid_na_de_tweede_ronde_is_het_besluit` | FULL | groen |
| B-IO-7 | `--ronde2-overgeslagen K` → "mens bevestigt" | P0 | B: `tweede_ronde_uitdrukkelijk_overgeslagen_geeft_mens_bevestigt` | FULL | groen |
| B-IO-8 | K zonder tweede ronde, onbekende K, beide opties, ronde-2-optie zonder `--nakijken` → geen tabellen, exit ≠ 0 | P0 | RB: `ongeldige_ronde2_optie_geeft_geen_tabellen_na_nakijken` (7) | FULL | groen |

### Controle op de dekkingslogica

- P0: 25 van 25 FULL (run 2: 24, B-IO-1 PARTIAL). P1: 9/9 FULL. P2: CAP-6a en AC-2 PARTIAL (zelfde gat als run 1).
- Geen criterium alleen op het geluksscenario getest; elk nieuw foutpad uit de besluiten-buildspec heeft een negatieve test.
- Dubbele dekking is bewust: de steekproef wordt zowel op de functie `nakijklijst` als via `main` met bestanden getest; zdr en budget per aanroeper (als run 1).
- **Regels uit de bijlagen die geen `success`-regel zijn en geen eigen test hebben** (tellen niet mee voor de gate, ter kennisname):
  - Correctiepercentage per keurmerk (meetregels §6, laatste punt): het veld `veranderd` wordt per etiket vastgelegd en getest (CAP-3), maar niets telt het op tot een percentage per keurmerk. ATDD ronde 2 noemt dit "bewust niet gedekt".
  - Tekortschieten van N op de validatieset (trainingsset §5, stoppunt 1): wordt met de hand afgelezen uit de validatietabel; alleen de vermelding in DRAAIPLAN stap 10 is getest.
  - Een lopende trainingsfase boven 8 uur stoppen (trainingsset §5): handmatig, geen gereedschap.

## Stap 4 — Gatenanalyse (fase 1 afgerond)

- **Uitvoermodus:** config `auto`; tellingen in één deterministisch script, na elkaar (headless keuze).
- **Fase-1-matrix:** `/tmp/tea-trace-coverage-matrix-2026-11-01T10-42-59.json` (`phase: PHASE_1_COMPLETE`); run 2: `…T10-28-46.json`.

| statistiek | run 3 | run 2 | run 1 |
|---|---|---|---|
| criteria totaal | 37 | 37 | 25 |
| FULL | 35 (95%) | 34 (92%) | 23 (92%) |
| PARTIAL | 2 (CAP-6a P2, AC-2 P2) | 3 (+ B-IO-1 P0) | 2 (CAP-6, AC-2) |
| NONE | 0 | 0 | 0 |
| P0 | 25/25 (100%) | 24/25 (96%) | 15/15 (100%) |
| P1 | 9/9 (100%) | 9/9 (100%) | 7/7 (100%) |
| P2 | 1/3 (33%) | 1/3 (33%) | 1/3 (33%) |

- **Gaten:** geen criterium zonder test; geen P0- of P1-criterium gedeeltelijk. Gedeeltelijk: CAP-6a en AC-2 (P2).
- **Heuristieken:** endpoints zonder test 0; toegangsregels zonder negatief pad 0; alleen geluksscenario 0.

### Aanbevelingen

1. **MEDIUM** — CAP-6a/AC-2 volledig maken: `train-resultaat.json` en `snelheid.json` bevatten al het veld `apparaat`; één bewering `== "mps"` in elk van de twee `zwaar`-tests volstaat.
2. **LOW** — `bmad-testarch-test-review` voor de testkwaliteit (omvang van `test_review_20261101.py` en `test_besluiten_20261101.py`).

## Stap 5 — Gatebesluit (fase 2)

### Bewijs: testuitvoering (VERIFIED, 01-11-2026, HEAD `c6c2a23` + testuitbreiding B-IO-1)

```
cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider
494 passed, 18 warnings in 87.82s (0:01:27)

uv run --group dev --group detector pytest -q -p no:cacheprovider -m "zwaar or lokaal" -rA
PASSED tests/test_cap01_scheiding.py::test_cap01_lokaal_echte_invoer_reproduceert_de_tabel
PASSED tests/test_cap06_training.py::test_cap06_rooktest_paar_iteraties_geeft_laadbaar_checkpoint_met_herkomst
PASSED tests/test_cap06_training.py::test_cap06_snelheidsmeting_geeft_seconden_per_iteratie_en_verwachte_duur
PASSED tests/test_cap13_licenties.py::test_cap13_lokaal_echte_omgeving_zonder_overtredingen
4 passed, 490 deselected, 18 warnings in 51.21s

uv run --group dev --group detector python licenties.py
exit 0 · "pakketten": 93 · "overtredingen": [] · 8 onder "ruim" (zelfde lijst als run 2 en de buildspec)
```

- De bekende wankele browsertest `test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan` (`deferred-work.md`, laatste regel) **trad in deze run niet op**: groen in de volledige run. In de run van `bmad-testarch-automate` faalde hij 1× (493/494) en slaagde hij daarna 3× los (zie het automate-verslag).
- Uitkomsten per prioriteit (testbestanden van stap 2): P0 238/238, P1 114/114, P2 14/14, gemengde bestanden (review en besluiten) 128/128; totaal 494/494.
- Run 2 had een probe nodig om het gedrag van B-IO-1 te tonen; nu bewijzen 9 testgevallen het (5 positief, 4 negatief, alle groen).
- `git status --porcelain` na deze run: `tests/test_besluiten_20261101.py` (testuitbreiding, niet door deze trace), de twee tracebestanden, en het nieuwe `automation-summary-spike-getrainde-detector.md`. Geen productiecode gewijzigd.

### Toetsing van de beslisregels

| regel | drempel | gemeten | status |
|---|---|---|---|
| P0-dekking | 100% | 100% (25/25) | MET |
| P0-slaagpercentage | 100% | 100% (238/238) | MET |
| P1-dekking | ≥ 90% (PASS), ≥ 80% (minimum) | 100% (9/9) | MET |
| totale dekking | ≥ 80% | 95% (35/37) | MET |
| totaal slaagpercentage | — | 100% (494/494) | informatief |
| P2 | informatief | dekking 1/3, slagen 14/14 | blokkeert niet |
| waiver | — | geen nodig | — |

Regel 4 van de beslisboom (P0 100%, P1 ≥ 90%, totaal ≥ 80%) geeft **PASS**.

### GATE DECISION: PASS

**Reden:** elk P0- en P1-criterium is volledig gedekt en elke test slaagt, ook de `lokaal`-tests op de echte invoer en de echte omgeving. De twee gedeeltelijke criteria (CAP-6a, AC-2) zijn P2 en betreffen alleen dat geen test beweert dat de training op MPS liep; het pytest-log en `snelheid.json` tonen het wel.

**Risico (probability × impact, INFERENCE):** CAP-6a/AC-2 — kans 1 (de rooktests draaiden op MPS volgens het log), impact 1 (een training die stil op de processor loopt, valt op door de duur, die stoppunt 1 bewaakt) → score 1, DOCUMENT.

### Openstaande punten

Geen blokkade. Ter kennisname:

1. **CAP-6a / AC-2 (P2):** MPS wordt niet beweerd (aanbeveling 1); ongewijzigd sinds run 1.
2. **Bewust ongetest volgens DRAAIPLAN:** opdrachtregels en netwerkstappen van stap 1–4, 6–13 en 15; handmatige opschoning van `manifest.json` na stap 7.
3. **Bijlage-regels zonder eigen gereedschap:** correctiepercentage per keurmerk, tekortschieten van N, de 8-uursgrens tijdens een lopende fase (zie stap 3).
4. **Wankele browsertest** staat in `deferred-work.md` (fix in de testfixture); trad in deze run niet op.
5. **Buildspec 1** staat nog op `in-review`; afronden valt buiten deze trace.
6. **Niet gecommit:** de testuitbreiding van B-IO-1 en deze trace; samen committen, anders geldt dit besluit niet voor de tak.

```
✅ GATE DECISION: PASS
- P0 Coverage: 100% (Required: 100%) → MET
- P0 Test Pass Rate: 100% (238/238) → MET
- P1 Coverage: 100% (PASS target: 90%, minimum: 80%) → MET
- Overall Coverage: 95% (Minimum: 80%) → MET
⚠️ Critical Gaps: 0
📂 Gate-bestand: _bmad-output/test-artifacts/traceability/spike-getrainde-detector-gate.json
```
