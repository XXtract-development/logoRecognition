---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-12'
story: SPEC CAP-19 ronde 11b (besluit Friso 12-11-2026, "35, rest volgt de AI")
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-19, sub-bullet ronde 11b)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6a, bullet ronde 11b)
  - _bmad-output/test-artifacts/atdd-checklist-ronde11-artefact-glutenvrij-20261112.md (stack, fixtures, kennisfragmenten)
---

# ATDD-checklist: ronde 11b, alleen de etiketten met AI-glutenvrij

Voorbereiding, stack, kennisfragmenten en nep-`window.claude` als in de checklist van ronde 11. Modus: AI-generatie, sequentieel. Tests uitgebreid in de bestaande bestanden (zelfde fixtures).

| Criterium (CAP-19 11b / §6a) | Test | Niveau | Prio |
|---|---|---|---|
| filter houdt precies AI-glutenvrij `true`, bronvolgorde, item = bron + oordeel; telling | `test_11b_filter_houdt_precies_de_ai_glutenvrij_etiketten_in_bronvolgorde` | unit | P0 |
| weigeringen over de hele bron vóór het filter | `test_11b_weigeringen_gelden_over_de_hele_bron_voor_het_filter` | unit | P0 |
| nul getoonde etiketten geweigerd | `test_11b_nul_getoonde_etiketten_wordt_geweigerd` | unit | P1 |
| opdrachtregel drukt "getoond X van Y" af | `test_11b_main_met_optie_drukt_getoond_x_van_y_af` | unit | P1 |
| zonder optie ongewijzigd | bestaande ronde-11-bouwtests | unit | P0 |
| voortgang en nalopen over getoonde etiketten, niet-getoonde records (afgehandeld en na te lopen) tellen niet | `test_11b_teller_en_nalopen_over_de_getoonde_etiketten` | browser | P0 |
| stand telt records van niet-getoonde etiketten | `test_11b_stand_telt_bevestigde_records_van_niet_getoonde_etiketten` | browser | P1 |
| download exporteert alle records, schrijft niets | `test_11b_download_exporteert_alle_records_ook_niet_getoonde` | browser | P0 |
| antwoord te laat op gefilterde pagina; niet-getoonde records ongemoeid | `test_11b_late_opslag_raakt_niet_getoonde_records_en_het_volgende_etiket_niet` | browser | P0 |

## Rode fase

- `uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q` (proefmap), 12-11-2026: **4 failed, 4 errors, 25 passed**. Rood: `bouw()` kent `alleen_ai_glutenvrij` niet (TypeError) en `main` kent `--alleen-ai-glutenvrij` niet. Groen: de 25 tests van ronde 11.
- Afwijkingen van het sjabloon van de skill: geen `test.skip()` (pytest), geen worker-subagents (sequentieel).

## Volgende stap

`bouw.py`: optie `alleen_ai_glutenvrij` / `--alleen-ai-glutenvrij`; sjabloon ongewijzigd (voortgang telt al over ITEMS, download en stand al over alle records).
