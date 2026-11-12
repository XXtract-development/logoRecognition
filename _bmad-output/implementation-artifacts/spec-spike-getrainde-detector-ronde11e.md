---
title: 'Ronde 11e: doel zonder 35 voor glutenvrij op de lokale invulpagina (CAP-3)'
type: 'feature'
created: '2026-11-12'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De lokale invulpagina toont voor elk keurmerk het doel "zonder 50"; voor glutenvrij besliste Friso op 12-11-2026 "35, gelijk aan de eis" (gate C).

**Approach:** In `invul/index.html` en de byte-gelijke `invul/index-ronde10.html` gebruiken standtekst, tooltip en de stip "gehaald" per keurmerk het eigen doel: glutenvrij zonder 35, de andere 50, mét 16 voor alle. Geen extra regel in het paneel; server, artefactpagina en het meetdoel van meetregels veranderen niet. Contract: SPEC CAP-3 "Ronde 11e", toetsset §6.

</frozen-after-approval>

## Implementation Notes

- **Route-poort (step-02), 12-11-2026:** intent gaps 0 (doelwaarden, tooltiptekst en gehaald-regel liggen vast in SPEC CAP-3 "Ronde 11e"). Irreversibles 0. Footprint klein (±5 regels in twee byte-gelijke paginabestanden). Route: oneshot.
- ATDD vooraf: `uv run pytest tests/test_ronde11e_doel_glutenvrij_browser_20261112.py -q` = 4 failed, 1 passed.
- Gebouwd: `DOEL_ZONDER_PER = {DIET_FREE_FROM_GLUTEN: 35}` en per keurmerk `zonderDoel` in `zetStand()` (tekst, tooltip, stip) in `invul/index.html` en `invul/index-ronde10.html` (byte-gelijk gebleven). Groen: 12 passed direct na de bouw (11e + ronde-10-paginatests), 8 passed in het 11e-bestand na de reviewbevindingen.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_ronde11e_doel_glutenvrij_browser_20261112.py -q` -- 8 passed.
- `uv run pytest -q -m "not zwaar"` (zelfde map) -- volle suite groen.

## Review Triage Log

Laag Blind Hunter (verse subagent, zelfde modelniveau; vloer N = 7). 13 bevindingen:

- 35 los van gate C — medium, patch (test vergelijkt het paginadoel met `train.MIN_ZONDER`).
- "gehaald" bij 35 zegt meer dan het meetdoel — medium, patch (risico in SPEC CAP-3 en toetsset §6; besluit Friso blijft).
- oude deferred-regel staat nog open — low, verworpen: het grootboek wordt niet bewerkt; de nieuwe regel "Opgelost in ronde 11e" verwijst ernaar.
- dubbele pagina met de hand gelijk gehouden, verouderde docstring ronde-10-test — low, verworpen: al uitgesteld in deferred-work.md (ronde 11d); gelijkheid nu bewaakt.
- moment waarop de wijziging live gaat niet beschreven — low, patch (DRAAIPLAN: zichtbaar bij de volgende paginalaad; op 12-11-2026 draaide geen lokale server).
- indelingstest toetst niet het langste geval — medium, patch ("mét 352/16 · zonder 352/35|50" in elke rij, alle 14 rijen gemeten).
- grensgevallen ontbreken — medium, patch (mét < 16, ontbrekende stand, 49/50 bij een ander keurmerk).
- klassecontroles zwak — low, patch (reguliere expressie op de klasse "gehaald").
- administratie stopt bij rood — low, patch (deze spec, checklist, trace).
- verkeerde sectieverwijzing in memlog — low, patch (correctieregel).
- UX-documenten zeggen nog 50 — low, defer (deferred-work.md, eigenaar bmad-ux).
- `||` in plaats van `??` — low, patch.
- verwarrende telling in DRAAIPLAN — low, patch ("14 sinds ronde 10").
