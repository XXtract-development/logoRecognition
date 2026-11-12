---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-12'
story: SPEC CAP-19 ronde 11 (beoordelingspagina als artefact laat glutenvrij nalopen)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-19)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6a)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/invul/artefact/sjabloon.html (basislijn = gepubliceerde versie 4)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/tests/conftest.py
  - _bmad-output/planning-artifacts/spike-getrainde-detector/tests/test_cap03_invulpagina_browser.py (browserfixture)
  - _bmad/tea/testarch/knowledge/{test-quality,data-factories,component-tdd,test-healing-patterns,selector-resilience,timing-debugging}.md
---

# ATDD-checklist: CAP-19 ronde 11, glutenvrij nalopen in de artefactpagina

## Voorbereiding (stap 1–2)

- Stack: Python (pytest) met Playwright sync voor de browser; geen JS-testrunner voor deze pagina. Config: `pyproject.toml` van de proefmap, `tests/conftest.py` (klaar-teken `#keuzes:not([inert])`).
- Basislijn: `invul/artefact/sjabloon.html` = de gepubliceerde bron van versie 4 met `const ITEMS = [];` (regel 152 vervangen, overige regels byte-gelijk, gecontroleerd met `cmp`).
- Modus: AI-generatie (criteria helder); geen opname. Uitvoering stap 4: sequentieel (één schrijver; beide lagen hebben de interne werking van het sjabloon nodig).

## Teststrategie (stap 3)

| Criterium (CAP-19 / §6a) | Test | Niveau | Prio |
|---|---|---|---|
| na te lopen = bevestigd zonder glutenvrij; met glutenvrij en onleesbaar = afgehandeld; kopregel | `test_teller_telt_alleen_ontbrekend_glutenvrij_als_na_te_lopen` | browser | P0 |
| opent op eerste niet-afgehandelde; glutenvrij-rij actief; notitie; eerdere antwoorden zichtbaar | `test_opent_op_na_te_lopen_etiket_met_glutenvrij_actief_en_notitie` | browser | P0 |
| voorinvulling glutenvrij met AI-merkje | `test_glutenvrij_voorgevuld_met_ai_merkje` | browser | P0 |
| bevestigen houdt 12 keuzes + Nutri-Score, `bevestigde_codes` met glutenvrij; teller zonder "na te lopen" bij y = 0 | `test_bevestigen_houdt_12_keuzes_en_nutriscore_en_voegt_glutenvrij_toe` | browser | P0 |
| antwoord te laat: A komt terug terwijl B getoond wordt | `test_late_opslag_van_a_overschrijft_b_niet` | browser | P0 |
| weigering zonder glutenvrij-keuze, niets geschreven | `test_bevestigen_zonder_glutenvrij_keuze_wordt_geweigerd` | browser | P0 |
| sneltoets 1 op glutenvrij-rij; tussenstand telt niet | `test_sneltoets_1_op_glutenvrij_rij_kiest_aanwezig` | browser | P1 |
| downloadknop ongewijzigd | `test_downloadknop_geeft_alle_opgeslagen_beoordelingen` | browser | P1 |
| bouwscript zet oordeel, rest ITEMS gelijk, telling | `test_zet_glutenvrij_in_items_en_laat_de_rest_gelijk` | unit | P0 |
| uitvoer buiten ITEMS-regel byte-gelijk aan sjabloon | `test_buiten_items_regel_bytegelijk_aan_sjabloon` | unit | P0 |
| herbouwen vanaf gebouwde bron | `test_herbouwen_vanaf_gebouwde_bron_geeft_hetzelfde` | unit | P1 |
| weigeringen (6 gevallen), niets geschreven | `test_weigert_en_schrijft_niets[...]` | unit | P0 |
| uitvoer binnen git-werkboom geweigerd (map bestaat nog niet) | `test_weigert_uitvoer_binnen_git_werkboom` | unit | P0 |
| opdrachtregel drukt telling af | `test_main_drukt_telling_af` | unit | P1 |
| sjabloon lege ITEMS; geen `/_blob/` of 13+ cijfers in `invul/artefact/` | `test_sjabloon_en_map_bevatten_geen_klantdata` | unit (bewaker) | P0 |

De browsertests draaien op de uitvoer van het bouwscript (fixture `gebouwd`: nep-bron + nep-voorinvulling), behalve de weigering: die vraagt een etiket zonder glutenvrij-oordeel, dat het bouwscript terecht weigert, en vult het sjabloon daarom direct (zelfde vervanging).

## Rode fase (stap 4–5)

- Nagebootste `window.claude` (`NEP_CLAUDE` in de browsertest): `use("db")` met `doc().set()` (wacht deterministisch via `window.__houd[id]` tot `window.__laatLos(id)`) en `collection().onSnapshot()`, `use("user").can()`. Geen echte opslag.
- Commando (in de proefmap): `uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q`
- Uitkomst 12-11-2026: **12 failed, 7 errors, 1 passed** (19 rood). Redenen: `invul/artefact/bouw.py` ontbreekt (ImportError in 11 unittests en in de fixture van 7 browsertests); de weigeringstest faalt op gedrag (versie 4 bevestigt zonder glutenvrij-keuze, geen melding `fout`). Groen: de klantdatabewaker (bewaakt al vanaf de basislijn).
- Afwijkingen van het sjabloon van de skill: geen `test.skip()` (pytest; de rode run moet zichtbaar falen), geen worker-subagents (sequentieel, zie boven).

## Groene fase (bmad-build, 12-11-2026)

- Na alleen `bouw.py`: 7 browsertests faalden op gedrag (sjabloon nog versie 4), 13 groen.
- Na de sjabloonwijziging en de reviewbevindingen: `uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q` = 25 passed (9 browser, 16 bouw). Toegevoegd na review: open-record en startpositie, weigerpad opdrachtregel, `.git`-pad, `</script>`-escape, etiketcodebewaker over de documenten.
