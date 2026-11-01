---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets', 'step-03-generate-tests', 'step-03c-aggregate', 'step-04-validate-and-summarize']
lastStep: 'step-04-validate-and-summarize'
lastSaved: '2026-11-01'
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
