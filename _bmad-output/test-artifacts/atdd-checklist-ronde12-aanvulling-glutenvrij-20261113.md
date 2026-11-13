---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-13'
story: SPEC CAP-21 ronde 12 (besluiten Friso 13-11-2026)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-21)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§4, §5, §6a)
  - toets.py, scheiding.py, kosten.py, invul/artefact/bouw.py, invul/artefact/sjabloon.html
---

# ATDD-checklist: CAP-21, aanvulling glutenvrij

Stack: pytest (+ één Playwright-browsertest), nagebootste client, verzonnen GLN's en GTIN's, alles in `tmp_path`. AI-generatie, sequentieel.

| Criterium | Test | Prio |
|---|---|---|
| `_toets_rijen` kent een glutenvrij-rij aan de toetskant (trainingsleverancier niet) | `test_r12_toets_rijen_kent_een_glutenvrij_rij_alleen_aan_de_toetskant` | P0 |
| aanvulling glutenvrij: print-laag eerst, maximum, geen eerdere kandidaat, melding | `test_r12_aanvulling_glutenvrij_print_laag_eerst_maximum_en_geen_eerdere` | P0 |
| gewone run kiest geen glutenvrij | `test_r12_gewone_kandidatenrun_kiest_geen_glutenvrij` | P0 (bewaker) |
| `ontdubbel` schrijft `<lijst>-nieuw.json` | `test_r12_ontdubbel_schrijft_de_nieuwe_docs` | P0 |
| `--met-glutenvrij`: schema en prompt met glutenvrij, ronde 12, eigen r12-bestanden, hint voor glutenvrij | `test_r12_voorinvulling_met_glutenvrij_…` | P0 |
| ontbrekende code → fout "onvolledig" | `test_r12_ontbrekende_code_is_fout_onvolledig` | P0 |
| Haiku-verwachting per aanroep $0,005 in reservering en startprojectie | `test_r12_haiku_verwachting_…` | P0 |
| `bouw_nieuw`: asset-url's, `{u, n}`, ware maat, volledige voorinvulling, rest byte-gelijk aan sjabloon | `test_r12_bouw_alleen_nieuwe_etiketten_…` | P0 |
| lege voorinvulling wordt meegenomen | `test_r12_bouw_neemt_een_lege_voorinvulling_mee` | P1 |
| weigeringen: koppeling mist, gedeeltelijk, dubbel, git | `test_r12_bouw_nieuw_weigert_en_schrijft_niets[4]` | P0 |
| `--lijst` schrijft de te uploaden beelden | `test_r12_lijst_schrijft_de_te_uploaden_beelden` | P1 |
| opdrachtregel bouwt nieuw | `test_r12_main_bouwt_nieuw_en_drukt_af` | P1 |
| browser: "0 van 2" naast oude records; lege voorinvulling weigert bevestigen | `test_r12_pagina_nieuwe_etiketten_open_…` | P0 |

## Rode fase

`uv run pytest tests/test_ronde12_aanvulling_glutenvrij_20261113.py -q` (map `spike-getrainde-detector`), 13-11-2026: **15 failed, 2 passed**. Rood: geen glutenvrij-rij (KeyError), geen keuze voor glutenvrij in `kandidaten`, geen `-nieuw.json`, geen `--met-glutenvrij`, geen `bouw_nieuw`/`--items`. Groen: de bewaker "gewone run kiest geen glutenvrij" (huidig gedrag) en de klantcodebewaker.
