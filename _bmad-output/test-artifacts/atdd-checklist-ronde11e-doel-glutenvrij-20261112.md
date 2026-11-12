---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-12'
story: SPEC CAP-3 "Ronde 11e" (besluit Friso 12-11-2026, "35, gelijk aan de eis")
inputDocuments:
  - _bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md (CAP-3 "Ronde 11e")
  - _bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md (§6)
  - _bmad-output/planning-artifacts/spike-getrainde-detector/invul/index.html (zetStand)
---

# ATDD-checklist: ronde 11e, doel zonder 35 voor glutenvrij op de lokale pagina

Stack: pytest + Playwright, bestaande fixtures; `/stand` nagebootst met `page.route`. AI-generatie, sequentieel.

| Criterium | Test | Prio |
|---|---|---|
| glutenvrij "zonder 35/35", gehaald, tooltip met "(doel gehaald)"; ander keurmerk met 35 zonder "zonder 35/50", niet gehaald | `test_r11e_glutenvrij_doel_35_en_andere_50` | P0 |
| glutenvrij met 34 zonder niet gehaald | `test_r11e_glutenvrij_34_zonder_is_niet_gehaald` | P0 |
| `index.html` en `index-ronde10.html` byte-gelijk | `test_r11e_paginabestanden_blijven_gelijk` | P1 |
| langste standtekst ("mét 35/16 · zonder 352/35") houdt alles op één scherm in 1440×800 en 1920×970 | `test_r11e_langste_standtekst_houdt_alles_op_een_scherm[1440x800, 1920x970]` | P0 |

## Rode fase

`uv run pytest tests/test_ronde11e_doel_glutenvrij_browser_20261112.py -q` (map `spike-getrainde-detector`), 12-11-2026: **4 failed, 1 passed**. Rood op gedrag: de pagina toont voor glutenvrij nog "/50". Groen: de gelijkheidsbewaker (beide bestanden nog gelijk).

## Groene fase

Na de bouw en de reviewbevindingen: 8 passed (drie tests erbij: grensgevallen, ontbrekende stand, koppeling aan `train.MIN_ZONDER`; langste tekst nu in elke rij).
