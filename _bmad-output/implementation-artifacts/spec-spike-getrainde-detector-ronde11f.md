---
title: 'Ronde 11f: AI-aandeel aan de zonder-kant in het eindrapport van tel_proef (CAP-9)'
type: 'feature'
created: '2026-11-12'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Na de samenvoeging (CAP-20) rusten de 317 glutenvrij-"zonder"-oordelen op de AI; het eindrapport van `tel_proef` laat dat niet zien, zodat de glutenvrij-score als volledig nagekeken gelezen kan worden (besluit Friso 12-11-2026, "Ja, erbij bouwen").

**Approach:** `tel_proef.tel` telt per keurmerksleutel `zonder_ai` (zonder-kant met `herkomst_codes[code]` exact `{"bron": "ai-r10"}`); `_md` toont "(AI n)" achter vals/afwezig bij n > 0 en per routeblok een toelichting; `corrigeer` haalt de markering weg voor elke nagekeken (etiket, code). Besluit en Wilson-grenzen ongewijzigd. Contract: SPEC CAP-9 "Ronde 11f", meetregels §7.

</frozen-after-approval>

## Implementation Notes

- **Route-poort (step-02), 12-11-2026:** intent gaps 0 (veld, md-tekst, nakijkregel vastgelegd in SPEC CAP-9 na spec-review). Irreversibles 0 (`tel_proef.py` staat in de bevriezingslijst, maar `bevroren.json` bestaat nog niet). Footprint klein (±15 regels in één module, geen nieuwe afnemers). Route: oneshot.
- ATDD vooraf: `uv run pytest tests/test_ronde11f_ai_aandeel_20261112.py -q` = 5 failed, 1 passed.
- Gebouwd: `tel_proef.tel` zet per keurmerksleutel `zonder_ai`; `_md` toont "(AI n)" bij n > 0 en een toelichting per routeblok; de steekproefzin noemt "het eerdere oordeel (van Friso, de beoordelaar of de AI)"; `corrigeer` haalt alleen de markering `ai-r10` weg, na de geldigheidscontrole. De markering staat nu één keer in `uitslag.AI_R10` en wordt gedeeld door `samenvoeg_glutenvrij` en `tel_proef`. Groen: 181 passed (11f + bestaande telling- en nakijktests) direct na de bouw; 49 passed (11f + 11c) na de reviewbevindingen.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_ronde11f_ai_aandeel_20261112.py tests/test_cap09_telling.py tests/test_review_besluiten_20261101.py -q` -- groen.
- `uv run pytest -q -m "not zwaar"` (zelfde map) -- volle suite groen.

## Review Triage Log

Laag Blind Hunter (verse subagent, zelfde modelniveau; vloer N = 6). 10 bevindingen:

- eerste en tweede nakijkronde niet via het volledige pad getest — medium, patch (test via `main` met eerste en tweede ronde: 40 → 40 − nagekeken → 0).
- md na nakijken niet getest — medium, patch (zelfde test: "(AI n)" en kolomaantal in `tabellen-na-nakijken.md`, toelichting weg als n = 0).
- rapport toont niet of gate C zonder AI gehaald wordt — low, verworpen: Friso besliste dat AI-oordelen meetellen ("Ja, AI telt mee"); "(AI n)" plus de toelichting laten het aandeel zien, een extra vlag in de besluitkolom is een nieuwe keuze die niet gevraagd is.
- steekproef scheidt AI- en mensfouten niet — medium, defer (deferred-work.md; nieuwe meting, buiten dit besluit).
- markering op twee plekken los gedefinieerd — medium, patch (`uitslag.AI_R10`, gedeeld).
- `corrigeer` haalt elke herkomst weg en vóór de controle — low, patch (alleen `ai-r10`, na de controle; test met artefactmarkering).
- groene fase, review en trace niet vastgelegd — low, patch (deze spec, trace).
- gate-C-gelijkheidstest leunt op een ander testbestand — low, verworpen: zelfde importpatroon als de andere browser- en telltests in deze suite; een wijziging aan de helpers breekt de test zichtbaar.
- DRAAIPLAN zegt niet hoe "(AI n)" te lezen — low, patch (stap 14).
- `context:` van deze spec onvolledig — low, patch (toetsset toegevoegd).
