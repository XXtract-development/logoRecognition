---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-03'
workflowType: 'testarch-atdd'
inputDocuments: ['_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md', '_bmad-output/planning-artifacts/spike-getrainde-detector/.memlog.md', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_haiku_standaard_20261103.py', '_bmad-output/planning-artifacts/spike-getrainde-detector/tests/conftest.py']
---

# ATDD Checklist - Haiku 5.5 als standaardmodel voorinvulling

**Date:** 2026-11-03
**Author:** Friso (besluit), uitvoering door de ATDD-stap
**Primary Test Level:** Unit (backend, pytest; geen E2E, geen API-laag in deze proef)
**Stack:** backend (`pyproject.toml`, pytest). Playwright-items van de checklist zijn N/A.

---

## Story Summary

Het standaardmodel van de voorinvulling in de proef "getrainde detector voor keurmerken" wordt `anthropic/claude-haiku-5.5`. Sonnet en Gemini blijven kiesbaar via `--model`. Het OpenRouter-tarief van Haiku staat in `kosten.TARIEF`.

**As a** proefleider
**I want** de voorinvulling standaard op Haiku 5.5 te laten draaien
**So that** de kosten per etiket dalen en het besluit van Friso (03-11-2026: "Gebruik voortaan haiku") wordt uitgevoerd.

---

## Acceptance Criteria

1. Het standaardmodel van de subcommando's `voorinvulling` en `voorinvulling-r9` (argument `--model` in `toets.py`) is `anthropic/claude-haiku-5.5`.
2. Sonnet en Gemini blijven kiesbaar via `--model` (bewaking, moet groen blijven).
3. `kosten.TARIEF` bevat `anthropic/claude-haiku-5.5` met `(1e-7, 5e-7)`, en de bestaande regels blijven ongewijzigd.
4. `openrouter.Client("anthropic/claude-haiku-5.5", "voorinvulling", ...)` start zonder fout; de constructor doet geen aanroep (transport-stub faalt bij aanroep).

Grenzen: geen betaalde aanroep, geen wijziging in `openrouter.py` (zdr-gedrag), geen wijziging in de kostengrens ($73, $55).

---

## Failing Tests Created (RED Phase)

### Unit Tests (4 rood, 1 groen-bewaking)

**File:** `_bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_haiku_standaard_20261103.py` (76 regels)

- ❌ **Test:** `test_standaardmodel_voorinvulling_is_haiku[voorinvulling]`
  - **Status:** RED - standaardmodel is `anthropic/claude-sonnet-5.5`, verwacht Haiku
  - **Verifieert:** criterium 1
- ❌ **Test:** `test_standaardmodel_voorinvulling_is_haiku[voorinvulling-r9]`
  - **Status:** RED - idem voor `voorinvulling-r9`
  - **Verifieert:** criterium 1
- ✅ **Test:** `test_sonnet_en_gemini_blijven_kiesbaar_via_model`
  - **Status:** GREEN bij de rode fase (bewaking: mag na de wijziging niet breken)
  - **Verifieert:** criterium 2
- ❌ **Test:** `test_tarief_haiku_bestaat_en_bestaande_regels_blijven`
  - **Status:** RED - `KeyError: 'anthropic/claude-haiku-5.5'` in `kosten.TARIEF`
  - **Verifieert:** criterium 3
- ❌ **Test:** `test_client_met_haiku_start_zonder_fout_en_roept_niets_aan`
  - **Status:** RED - `ValueError: model anthropic/claude-haiku-5.5 heeft geen tarief in kosten.TARIEF`
  - **Verifieert:** criterium 4

---

## Rood-run (vastgelegd)

- Commando: `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_haiku_standaard_20261103.py -v`
- Uitkomst vóór elke productiecodewijziging: **4 failed, 1 passed** (0.05 s).
- Basislijn bestaande suites: `uv run pytest tests/test_cap14_uitgaven.py tests/test_openrouter.py -q` = **56 passed**.

---

## Validatie (step-05, checklist.md, applicabele items)

- [x] Acceptatiecriteria geïdentificeerd en testbaar
- [x] Testniveau gekozen (unit, backend) en gedocumenteerd
- [x] Tests falen vóór implementatie (RED geverifieerd door lokale run)
- [x] Failure-berichten duidelijk (test 1 toont het gevonden en verwachte model)
- [x] Given-When-Then in commentaar per test
- [x] Deterministisch: geen netwerk, geen klok, geen bestanden; transport-stub faalt bij elke aanroep
- [x] Geen afhankelijkheid tussen tests; `ORIGINELE_PARSE_ARGS` voorkomt geneste monkeypatch
- [x] Geen dubbele dekking met `test_cap14_uitgaven.py` (die test de bestaande tarieven, niet Haiku)
- [x] Geen betaalde aanroep (CLI-parse wordt bij `parse_args` afgebroken; client-constructor zonder aanroep)
- N/A Playwright-items (`data-testid`, fixtures, factories, network-first, component tests): dit is een Python-backend zonder browser.
- N/A `test.skip()`: de skill-stap 4c eist `test.skip()` voor Playwright; bij pytest moeten de tests juist rood falen, en dat doen ze.

---

## Afwijkingen van de skill-stappen (gemeld, niet verborgen)

1. **Step-04 (subagents API/E2E):** niet gedispatcht. Reden: backend zonder API- en E2E-laag; de vier criteria zijn al als unit-tests uitgeschreven vóór de skill-run (ATDD vóór implementatie, rood vastgelegd). Een tweede generatie zou dubbele tests geven. Dit is een gat in de letter van de skill en staat zo in de rapportage.
2. **Step-04c:** de controle "test.skip()" en de tijdelijke `/tmp`-JSON zijn niet van toepassing; de tests zijn geschreven als pytest-bestand en rood geverifieerd.
3. **Step-01 (config):** `test_artifacts` staat op `{project-root}/_bmad-output/test-artifacts`, met project-root = worktree. Het checklist-bestand staat daar.
