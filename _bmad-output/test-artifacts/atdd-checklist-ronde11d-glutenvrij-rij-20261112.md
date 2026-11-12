---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-12'
story: SPEC CAP-3 "Ronde 10, browser" (ronde 11d)
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-3)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6 "Glutenvrij op de pagina")
  - _bmad-output/planning-artifacts/spike-getrainde-detector/invul/index.html (ongewijzigd)
  - tests/test_ronde5_browser_20261101.py, test_ronde7_browser_20261102.py, test_ronde9_browser_20261102.py (fixtures)
---

# ATDD-checklist: ronde 11d, ronde-10-contract van de lokale invulpagina

Stack: pytest + Playwright (bestaande fixtures), AI-generatie, sequentieel. De pagina verandert in deze ronde niet; de verandering is het bijwerken van 17 verouderde verwachtingen plus expliciete tests voor de glutenvrij-rij.

| Criterium (CAP-3 "Ronde 10, browser") | Test | Prio |
|---|---|---|
| 14 rijen, glutenvrij na PlanetProof en vóór Nutri-Score, 13 keuzegroepen; rijdelen, aria-label, voorinvulling, AI-merkje, stand | `test_r11d_glutenvrij_rij_na_planetproof_voor_nutriscore_met_alle_delen` (nieuw) + bijgewerkte r5/r7/r9-opbouwtests | P0 |
| bevestigen zonder glutenvrij slaat op zonder glutenvrij in `bevestigde_codes` | `test_r11d_bevestigen_zonder_glutenvrij_…` (nieuw) | P0 |
| 1/2/3 schuift door tot glutenvrij en blijft daar; nooit naar Nutri-Score | `test_r11d_123_schuift_door_…` (nieuw) + bijgewerkte r7/r9-toetstests | P0 |
| 4/5/0 doen niets op glutenvrij | `test_r11d_456_en_0_…` (nieuw) + bijgewerkte r7-Nutri-Score-toetstests | P1 |
| pijl-omlaag 13× = Nutri-Score, terug = glutenvrij, grenzen 0 en 13 | `test_r11d_pijlen_…` (nieuw) + bijgewerkte r7-tests | P1 |
| glutenvrij valt buiten het nalopen; notitie over de vier | `test_r11d_glutenvrij_valt_buiten_het_nalopen` (nieuw) | P1 |
| alle 14 rijen op één scherm in 1440×800 en 1920×970, rij ≤ 32,5 px | bijgewerkte `test_r9b_dertien_rijen_…` (8 varianten) | P0 |

## Rode fase

Commando (map `spike-getrainde-detector`): `uv run pytest tests/test_ronde11d_glutenvrij_rij_browser_20261112.py tests/test_ronde5_browser_20261101.py tests/test_ronde7_browser_20261102.py tests/test_ronde9_browser_20261102.py -q`, 12-11-2026: **17 failed, 52 passed**. Rood: de 17 verouderde verwachtingen (13 rijen, 12 groepen, PlanetProof als laatste keuzerij, 12 keer pijl-omlaag). De 6 nieuwe tests zijn meteen groen: het gedrag bestaat sinds 1498c81 en de pagina verandert in deze ronde bewust niet (afwijking van de rode fase, met reden). De indelingsmeting met 14 rijen is vooraf gedaan (spec ronde 11d).
