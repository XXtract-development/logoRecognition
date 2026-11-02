---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets', 'step-03-generate-tests', 'step-03c-aggregate', 'step-04-validate-and-summarize']
lastStep: 'step-04-validate-and-summarize'
lastSaved: '2026-11-02'
inputDocuments:
  - _bmad/tea/config.yaml
  - _bmad-output/test-artifacts/traceability/spike-getrainde-detector-trace.md
  - _bmad-output/implementation-artifacts/spec-spike-getrainde-detector-besluiten.md
  - _bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md
  - _bmad-output/planning-artifacts/spike-getrainde-detector/licenties.py
  - _bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_besluiten_20261101.py
  - _bmad-output/planning-artifacts/spike-getrainde-detector/pyproject.toml
  - _bmad/tea/testarch/knowledge/test-quality.md
  - _bmad/tea/testarch/knowledge/test-priorities-matrix.md
  - _bmad/tea/testarch/knowledge/test-levels-framework.md
  - _bmad/tea/testarch/knowledge/data-factories.md
  - _bmad/tea/testarch/knowledge/selective-testing.md
  - _bmad/tea/testarch/knowledge/ci-burn-in.md
---

# Automatisering testdekking — spike getrainde detector, gat B-IO-1

## Stap 1 — Voorbereiding en context

- **Werkboom:** `.claude/worktrees/proef-detector`, HEAD `c6c2a23`. Vooraf gewijzigd (niet door deze run): de twee trace-bestanden onder `_bmad-output/test-artifacts/traceability/`.
- **Stack:** `backend` (auto-detectie: `pyproject.toml` in de spike-map, geen frontend-manifest). Raamwerk aanwezig: pytest via `uv` (`[tool.pytest.ini_options]`, `tests/conftest.py`).
- **Modus:** BMad-geïntegreerd — buildspec `spec-spike-getrainde-detector-besluiten.md` (I/O-matrix, rij "ruime licentie"), trace-rapport run 2 (item B-IO-1, PARTIAL, P0), ATDD-checklist ronde 2.
- **TEA-vlaggen:** `tea_use_playwright_utils: true`, `tea_use_pactjs_utils: false`, `tea_pact_mcp: none`, `tea_browser_automation: auto`, `test_stack_type: auto`.
- **Kennis geladen:** de zes kernfragmenten (`test-levels-framework`, `test-priorities-matrix`, `data-factories`, `selective-testing`, `ci-burn-in`, `test-quality`).
- **Headless besluiten (geen mens aanwezig):**
  - Modus Create (geen eerdere uitvoer om te hervatten of te valideren).
  - Playwright-Utils-fragmenten niet geladen: het gat zit in een zuivere Python-functie; geen TypeScript-browsertests in scope.
  - Uitvoerbestand `automation-summary-spike-getrainde-detector.md` in plaats van het standaardpad `automation-summary.md`, naar de bestaande naamgeving per onderwerp in deze map (`atdd-checklist-spike-getrainde-detector.md`).
  - Reikwijdte op verzoek van de orchestrator beperkt tot één gat (B-IO-1); geen productiecode wijzigen; niet committen; klantdata in `~/logo-meetset-20261018/` niet gelezen.

## Stap 2 — Doelen en dekkingsplan

**Contract (buildspec, I/O-matrix):** `BSL-1.0`, `CNRI-Python` (hele term, **hoofdletterongevoelig**) → `toegestaan`, niet onder `ruim`; `BUSL-1.1`, `BSL-1.1`, `CNRI-Jython`, vrije tekst blijven overtreding.

**Bestaande dekking:** `test_cap13_bsl_1_0_en_cnri_python_zijn_toegestaan` (5 uitdrukkingen) en `test_cap13_busl_bsl_1_1_en_cnri_jython_blijven_verboden` (6) gebruiken alleen de exacte schrijfwijze. De implementatie (`licenties._blad`: `term.upper() in _EXACT`) is hoofdletterongevoelig, maar niets bewaakt dat.

| doel | niveau | prio | aanpak |
|---|---|---|---|
| `BSL-1.0` / `CNRI-Python` in kleine letters, hoofdletters en gemengd → `toegestaan`, ook binnen een AND | unit | P0 (CAP-13) | bestaande parametrisatie uitbreiden |
| `BUSL-1.1`, `BSL-1.1`, `CNRI-Jython` in andere schrijfwijzen → niet `toegestaan`/`ruim` | unit | P0 (CAP-13) | bestaande negatieve parametrisatie uitbreiden |

- **Niveau:** unit — zuivere functie `licenties.beoordeel`, geen I/O; de `controleer`- en `lokaal`-tests dekken de samenstelling al (geen dubbele dekking op een hoger niveau).
- **Reikwijdte:** selectief — alleen het P0-gat B-IO-1. Geen nieuwe testfuncties (alleen extra parametrisatiegevallen), geen fixtures of factories nodig.

## Stap 3 — Generatie (uitvoermodus)

| | |
|---|---|
| gevraagd | `auto` (config `tea_execution_mode`), probe aan |
| ondersteund | subagent: ja; agent-team: nee |
| **gekozen** | **sequentieel** (headless besluit, afwijking van de auto-keuze "subagent") |

Reden: het hele resultaat is één bewerking in één bestand; parallelle werkers voegen niets toe. Uitvoercontract ongewijzigd: tijdelijke JSON per werker onder `/tmp/tea-automate-*-2026-11-01T09-34-36-000Z.json`.

- **Werker A (API):** `success: true`, 0 tests — geen HTTP-endpoint in scope.
- **Werker B (E2E):** overgeslagen (stack `backend`).
- **Werker B-backend:** `success: true`, 9 unit-gevallen (P0), 1 bestand, geen fixtures nodig.

## Stap 3C — Samenvoegen

- **Bijgewerkt:** `_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_besluiten_20261101.py` (+6/−2 regels). Geen nieuw testbestand, geen nieuwe testfunctie.
  - `test_cap13_bsl_1_0_en_cnri_python_zijn_toegestaan`: 5 → 10 gevallen (`bsl-1.0`, `Bsl-1.0`, `cnri-python`, `CNRI-PYTHON`, `Apache-2.0 AND cnri-python`).
  - `test_cap13_busl_bsl_1_1_en_cnri_jython_blijven_verboden`: 6 → 10 gevallen (`busl-1.1`, `bsl-1.1`, `cnri-jython`, `CNRI-JYTHON`).
- **Fixtures, factories, hulpfuncties:** geen (0 behoeften gemeld).
- **Telling:** 9 tests, alle P0 (CAP-13). Tijdelijke bestanden opgeruimd na het samenvoegen.

## Stap 4 — Validatie en samenvatting

### Uitvoering

| run | commando (in de spike-map) | uitkomst |
|---|---|---|
| gericht | `uv run --group dev pytest -q -p no:cacheprovider tests/test_besluiten_20261101.py -k "bsl_1_0_en_cnri_python_zijn_toegestaan or busl_bsl_1_1_en_cnri_jython"` | 20 passed |
| volledig 1 | `uv run --group dev pytest -q -p no:cacheprovider` | 493 passed, 1 failed (`test_review_20261101.py::test_pagina_b_zonder_alle_keuzes_slaat_niets_op_en_blijft_staan`) |
| los, 3× | dezelfde test apart | 3× passed |
| volledig 2 | `uv run --group dev pytest -q -p no:cacheprovider` | **494 passed**, 0 failed (485 vóór deze run + 9) |

De ene fout in run 1 is de bekende wankele browsertest uit `deferred-work.md` (vastgelegd in `c6c2a23`); hij raakt `licenties.py` en het gewijzigde testbestand niet.

### Bewijs dat de nieuwe gevallen het gat dichten (mutatiecontrole, niets op schijf gewijzigd)

`licenties.py` in het geheugen geladen met `term.upper() in _EXACT` vervangen door een hoofdlettergevoelige vergelijking (`term in {"BSL-1.0", "CNRI-Python"}`): alle 5 nieuwe positieve gevallen geven dan `onbekend` (test rood), de 5 oude in exacte schrijfwijze blijven `toegestaan`. Vóór deze run zou die regressie dus groen zijn gebleven.

### Checklist (`checklist.md`)

- **Gehaald:** raamwerk aanwezig (pytest/`uv`); BMad-artefacten geladen (buildspec, ATDD-checklist, trace); bestaande tests en patronen bekeken; niveau unit voor een zuivere functie; geen dubbele dekking (samenstelling al gedekt door `controleer`- en `lokaal`-tests); prioriteit P0 uit het trace-rapport; deterministisch, geen gedeelde toestand, geen wachttijden; volledige suite gedraaid; tijdelijke bestanden opgeruimd; geen browsersessies geopend.
- **Bewust afgeweken (projectconventie gaat voor):** geen `[P0]`-label in de testnaam en geen Given-When-Then-commentaar — het bestand gebruikt beide niet, de prioriteit volgt uit de CAP (trace-rapport); geen faker-factory — de letterlijke SPDX-ids zíjn het contract.
- **N.v.t.:** Playwright/Cypress-configuratie, `package.json`-scripts, E2E/API/component/Pact-items, fixtures met `test.extend()`, healing (geen falende gegenereerde test), `tests/README.md`.

### Aannames en risico's

- "Hoofdletterongevoelig" is getoetst op de term zelf, in kleine letters, hoofdletters en gemengd, los en binnen een AND. Kleine letters voor de operatoren (`and`/`or`) vallen buiten de belofte en zijn niet toegevoegd.
- Productiecode niet gewijzigd; niets gecommit (op verzoek van de orchestrator).

### Volgende stap

`bmad-testarch-trace` opnieuw draaien (run 3): B-IO-1 hoort van PARTIAL naar FULL te gaan, P0 dan 25/25.

## Run 2 (02-11-2026): P0-gaten uit trace run 7 (ronde 6)

### Stap 1 — preflight en context

- **Stack:** `backend` (Python 3.12, pytest via `uv`, `tests/conftest.py`); BMad-geïntegreerd (SPEC CAP-17, buildspec `spec-spike-getrainde-detector-ronde6.md`, ATDD-checklist ronde 6, trace run 7). Playwright Utils en Pact niet van toepassing: geen browsertest en geen contract in scope.
- **Kennis:** `test-levels-framework`, `test-priorities-matrix`, `data-factories`, `selective-testing`, `ci-burn-in`, `test-quality`, `fixture-architecture`.
- **Context:** trace run 7 (FAIL op P0 77/79): R6-CAP-17j en R6-CAP-17l; `tests/test_ronde6_20261102.py` (fixtures uit `test_cap04_generator`: `achtergrond`, `logos`, `TRAIN_GTINS`, `TEGEL`; helpers `gen_off`, `objecten`, `magenta`, `inhoud`); `generator.genereer`.

### Stap 2 — doelen en dekkingsplan

| doel | niveau | prio | scenario |
|---|---|---|---|
| R6-CAP-17j klassenverhouding ongewijzigd door OFF | unit (`genereer`) | P0 | zelfde seeds (3 × 100 tegels), met en zonder OFF voor GREEN_DOT: aandeel GREEN_DOT onder de geplakte logo's verschilt hoogstens 0,10 (gemeten 02-11: 0,53 tegen 0,50 en 0,48 tegen 0,45; een fout die OFF als extra bron telt geeft ±0,67) |
| R6-CAP-17l zonder OFF byte-gelijk aan vóór ronde 6 | unit (`genereer`) | P0 | fixture van `test_cap04_generator` (12 tegels, seed 5, tegel 256): sha256 over naam + bytes van `train/` gelijk aan de waarde gemeten op 953ca95 (`d5f84b86…a6009`); zonder `off`, met `off=None` en met `off={}` |

Geen browser- of API-doel; geen duplicaat van ATDD (die vergelijkt de nieuwe code met zichzelf).

### Stap 3 — generatie (uitvoermodus)

Gevraagd `auto`, subagent beschikbaar; **gekozen sequentieel** (zelfde reden als run 1: twee tests in één bestand). Werker A (API): `success`, 0 tests (geen HTTP-endpoint in scope; `/tmp/tea-automate-api-tests-2026-11-02T-run2.json`). Werker B (E2E): overgeslagen (stack `backend`). Werker B-backend: `success`, 2 functies (4 gevallen, P0), geen fixtures nodig (`/tmp/tea-automate-backend-tests-2026-11-02T-run2.json`).

### Stap 3C — samenvoegen

Beide werkers `success`. Geschreven in `tests/test_ronde6_20261102.py`: `test_r6_generator_zonder_off_train_gelijk_aan_de_uitvoer_van_953ca95` (3 gevallen: zonder argument, `None`, `{}`; constante `TRAIN_VOOR_RONDE_6`, hulpfunctie `sha_train`) en `test_r6_generator_off_laat_de_klassenverhouding_ongewijzigd`. Hergebruikte fixtures en helpers: `achtergrond`, `logos`, `TRAIN_GTINS`, `TEGEL` (`test_cap04_generator`), `gen_off`, `objecten`, `magenta`. Geen nieuwe fixture-infrastructuur.

### Stap 4 — validatie en samenvatting

- **Uitvoering:** de 4 nieuwe gevallen 4× na elkaar groen (1,9–3,3 s); volledige suite **771 passed, 0 failed** (`uv run --group dev pytest -q -p no:cacheprovider`, 02-11-2026).
- **Mutaties (kopie buiten de repository, daarna verwijderd):** (1) altijd een extra `rng.random()` per geplakt logo → de 3 bytetests falen, de verhoudingstest niet; (2) OFF-uitsneden als extra bron van hun klasse → de verhoudingstest faalt. Elke test vangt de fout waarvoor hij bedoeld is.
- **Kwaliteit:** geen vaste wachttijd, geen netwerk, alles in `tmp_path`, deterministisch (vaste seeds), < 4 s.
- **Aanname en risico:** de vastgelegde sha256 hangt af van Pillow/libjpeg uit `uv.lock`; na een upgrade opnieuw meten op 953ca95 (staat bij de constante).
- **Volgende stap:** `bmad-testarch-trace` (run 8).

# Run 3 — ronde 7 (invulpagina op één scherm), gaten trace run 9

## Stap 1 — Voorbereiding en context

- **Werkboom:** `.claude/worktrees/proef-invulpagina`, tak `spike/proef-invulpagina-ux`, HEAD `8bc97a7` + ronde 7 (ongecommit: spec-update, spines, ATDD, bouw).
- **Stack:** `fullstack` (Python-server + één HTML-pagina; Playwright voor Python in de dev-groep). Modus BMad-geïntegreerd: trace run 9 (gaten R7-6b, R7-17b, R7-24 t/m R7-29), contract "Ronde 7" in de ATDD-checklist, buildspec `spec-spike-getrainde-detector-invulpagina-ux.md` (Reviewronde 1).
- **Headless besluiten:** Create; reikwijdte beperkt tot de gaten van trace run 9; paginacode niet wijzigen; niet committen; geen klantdata.

## Stap 2 — Doelen

| gat | prio | gedrag (uit de reviewpatches) |
|---|---|---|
| R7-6b | P1 | breedte-beginstand scrollt naar het bovenste kader, ook als dat niet het eerste in `hint` is |
| R7-17b | P1 | opslagfout van een ander etiket blijft staan na verdere wissels, tot dat etiket opslaat |
| R7-24 | P1 | stand altijd volledig zichtbaar naast "gewijzigd"/"AI: …" |
| R7-25 | P2 | uitsnedenamen vóór het laden van het beeld |
| R7-26 | P2 | Enter op de beeldlink zoomt op het midden |
| R7-27 | P2 | resize in breedte houdt de scrollpositie |
| R7-28 | P2 | paneel scrollt in een laag venster; titel krimpt vóór de etiketcode |
| R7-29 | P2 | letters gedempt zolang "letter onleesbaar" aan staat |

## Stap 3 — Tests (worker E2E, subagent)

Toegevoegd aan `tests/test_ronde7_browser_20261102.py` (kop "automate (trace run 9)", nieuw item `OMGEKEERD`): `breedte_scrollt_naar_bovenste_kader_niet_eerste_in_hint` (R7-6b), `opslagfout_blijft_staan_tot_dat_etiket_opslaat` (R7-17b), `stand_volledig_zichtbaar_naast_gewijzigd_en_ai_tekst` (R7-24), `uitsnedenamen_voor_het_laden_van_het_beeld` (R7-25), `enter_op_beeldlink_zoomt_op_het_midden` (R7-26), `resize_in_breedte_houdt_de_scrollpositie` (R7-27), `paneel_scrollt_in_laag_venster` en `titel_krimpt_voor_de_etiketcode` (R7-28), `letters_gedempt_zolang_onleesbaar_aan_staat` (R7-29). 9 functies, 9 gevallen.

**Mutatiecontrole (elke test rood onder een gerichte breuk):** `.sort(y0)` weg; `fout` niet tonen / niet wissen (2 breuken); "gewijzigd"/AI-tekst terug op regel 2 (209 > 190 px); namen pas na laden; `e.detail === 0`-tak weg; resize herberekent altijd (sprong 7280 px); `overflow-y: auto` weg; titel krimpt gelijk met de code (250 > 192 px); dempregel weg. Breuken in kopieën buiten de repo, geserveerd via `invul.server.PAGINA`; controle met een onveranderde kopie: 9 passed. `invul/index.html` sha256 vóór en na: `a95a9830a376305ec9ffcca2b2e76efbf41d0972c9264b9d1a05dae4d7dabc28`.

## Stap 4 — Validatie

- Ronde-7-bestand 2× na elkaar: 40 passed.
- Volledige suite (VERIFIED door de orchestrator, 02-11-2026): `uv run --group dev pytest -q -p no:cacheprovider` → **809 passed, 2 skipped, 0 failed**.
- Geen vaste wachttijden, geen netwerk buiten 127.0.0.1, alles in `tmp_path`.
- **Volgende stap:** `bmad-testarch-trace` run 10.
