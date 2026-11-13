---
title: 'Ronde 12: aanvulling glutenvrij met volledige voorinvulling en pagina met nieuwe etiketten (CAP-21)'
type: 'feature'
created: '2026-11-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9dec847214793913894af4b8e7e7176abd0fa67a'
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Gate C voor glutenvrij staat op mét 8/16; Friso besliste 13-11-2026 "Eerst aanvullen", "60 etiketten" en "Alle keurmerken". Het gereedschap kent geen glutenvrij-kandidaten, geen volledige voorinvulling met glutenvrij en geen pagina met alleen nieuwe etiketten.

**Approach:** Volgens toetsset §4 (aanvulling 3), §5 (volledige voorinvulling met glutenvrij) en §6a (alleen de nieuwe etiketten): (1) `toets._toets_rijen` bouwt een glutenvrij-rij (`FREE_FROM_GLUTEN` uit `lees_declaraties`, zelfde toetskantfilter), `kandidaten()` neemt die rij alleen als hij gekozen is; (2) `ontdubbel` schrijft `<lijst>-nieuw.json`; (3) `voorinvulling --met-glutenvrij` (één prompt/schema met 12 losse + glutenvrij + Nutri-Score, kenmerk ronde 12, eigen r12-bestanden, fout "onvolledig", Haiku-verwachting $0,005 per aanroep); (4) `bouw.py` krijgt `bouw_nieuw()` en `--items/--assets/--uit` plus `--lijst`. De acceptatietests in `tests/test_ronde12_aanvulling_glutenvrij_20261113.py` zijn rood en moeten groen worden zonder de tests te wijzigen.

## Boundaries & Constraints

**Always:** scheiding (`scheiding.py`, `scheiding.json`, `bouw_rijen`) blijft gelijk; zonder `--met-glutenvrij` blijft `voorinvulling` byte-gelijk in gedrag (prompt, schema, bestanden, verwachting per aanroep); zonder keuze blijft de glutenvrij-rij leeg in de kandidatenlijst; `bouw.py` zonder `--items` werkt als in ronde 11/11b; alle bestaande tests blijven groen.

**Never:** echte proefmap of productie aanraken in tests; etiketcodes of beeldadressen in de repo; het sjabloon wijzigen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aanvulling glutenvrij | `--alleen DIET_FREE_FROM_GLUTEN --max-per N --print-laag-eerst --bestaand …` | alleen glutenvrij-GTIN's van de toetskant, print-laag eerst, hoogstens N, geen eerdere | N/A |
| Gewone run | geen `--alleen/--alle` | geen glutenvrij-kandidaten | N/A |
| Volledige voorinvulling | `--met-glutenvrij`, Haiku | 13 codes + Nutri-Score, ronde 12, r12-bestanden | ontbrekende code → `fout: onvolledig` |
| Pagina nieuwe etiketten | items + koppeltabel | ITEMS met asset-url's, `{u, n}`, ware maat | ontbrekende koppeling, gedeeltelijke voorinvulling, dubbel, git → ValueError, niets geschreven |
| Lege voorinvulling | item met fout en lege keurmerken | gebouwd met lege voorinvulling | N/A |

</frozen-after-approval>

## Code Map

- `toets.py:377-404` `_toets_rijen` -- voeg `rijen[GLUTEN]` toe uit `decl` (codes bevatten `FREE_FROM_GLUTEN`), door dezelfde `toets()`-filter; `GLUTEN = NIEUW_R10[0]`.
- `toets.py:170-206` `kandidaten()` -- neem `GLUTEN` mee na `LOS[3:]` (bron `rijen_toets.get(GLUTEN, {})`, maximum `maxima.get(GLUTEN, max_per)`); `main` (r.514-529): bij een gewone run (geen keuze) de glutenvrij-rij leegmaken; `AANVUL_CODES` bevat glutenvrij al (via `CODES`).
- `toets.py` ontdubbel-tak (±r.583-596) -- schrijf naast `toets-docs.json` `<kandidatenpad zonder .json>-nieuw.json` met de toegevoegde docs (lijst, volgorde zoals toegevoegd).
- `toets.py:74-111` OMSCHRIJVING/SCHEMA/PROMPT, `:247-276` `voorinvulling()`, `:534-575` voorinvulling-tak -- `--met-glutenvrij`: eigen schema (enum LOS + GLUTEN) en prompt (OMSCHRIJVING plus de glutenvrij-regel van `PROMPT_R10`), codefilter LOS + GLUTEN, `ronde: 12`, ontbrekende code na een geslaagde run → `fout: "onvolledig"`; uitvoer `bestandsnaam("voorinvulling-r12", model)` en `bestandsnaam("items-r12", model)`; `PER_AANROEP_HAIKU = 0.005` voor startprojectie en `verwacht` bij een Haiku-model, anders `PER_AANROEP`; hintbeelden ook voor glutenvrij (de bestaande hint-lus loopt al over alle hinttegels).
- `kosten.py` `Bewaker` -- ongewijzigd; `--grens` met `--besluit` via `grens_uit`.
- `invul/artefact/bouw.py` -- `bouw_nieuw(items, assets, uit)`: items-lijst (paden relatief aan de map van het itemsbestand), koppeltabel {bestandsnaam: url}; ITEM = `{"id", "beeld": assets[naam(beeld)], "hint": [{"u": assets[n], "n": n}], "voorinvulling": {"keurmerken": {13 codes}, "nutriscore": lijst} of {"keurmerken": {}, "nutriscore": []}, "ww", "wh"}` (maat uit de PNG-kop, stdlib); weigeringen als in de matrix plus `in_werkboom`; schrijven als `bouw()` (escape `</`, atomisch, sjabloon). `main`: `--items` met `--assets --uit` (bouwen, drukt "N nieuwe etiketten; …" af) of met `--lijst` (absolute paden van beeld + hints, één per regel); `--bron/--voorinvulling` alleen verplicht zonder `--items`.
- Tests: `tests/test_ronde12_aanvulling_glutenvrij_20261113.py` (contract), bestaande `test_cap02_kandidaten.py`, `test_ronde4_20261101.py`, `test_ronde11_artefact_*`.

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/planning-artifacts/spike-getrainde-detector/toets.py` -- glutenvrij-rij, kandidatenkeuze, ontdubbel `-nieuw.json`, `--met-glutenvrij`, `PER_AANROEP_HAIKU`.
- [x] `_bmad-output/planning-artifacts/spike-getrainde-detector/invul/artefact/bouw.py` -- `bouw_nieuw`, `--items/--assets/--uit/--lijst`.

**Acceptance Criteria:**
- Given de tests in `tests/test_ronde12_aanvulling_glutenvrij_20261113.py`, when ze draaien, then zijn ze groen zonder wijziging aan de tests.
- Given de volle suite `-m "not zwaar"`, when hij draait, then is hij groen.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_ronde12_aanvulling_glutenvrij_20261113.py tests/test_cap02_kandidaten.py tests/test_ronde4_20261101.py tests/test_ronde11_artefact_bouw_20261112.py -q` -- groen.

## Implementation Notes

- **Route-poort (step-02), 13-11-2026:** intent gaps 0 (besluiten Friso 13-11-2026 en de regels in toetsset §4/§5/§6a na de spec-review). Irreversibles 0 in de build (geen productie, geen echte proefmap in tests; het ophalen en de voorinvulling draaien daarna als aparte stap onder kostenbewaking). Footprint niet klein (twee modules, nieuwe opdrachtregelvorm, kostenpad). Route: dispatch. Checkpoint 1: goedkeuring volgt uit de opdracht van de orchestrator (13-11-2026, volledige keten).
- ATDD vooraf: `uv run pytest tests/test_ronde12_aanvulling_glutenvrij_20261113.py -q` = 15 failed, 2 passed.

- Implementatie door een verse subagent (alleen de spec als bron): 17/17 groen; de subagent meldde twee documentfouten van mij (volledige commitcode in de memlog, kostenregel boven de oude in DRAAIPLAN stap 6), door mij hersteld.
- Na review: tests uitgebreid door mij (34 in het bestand), codepatches door dezelfde subagent. `uv run pytest tests/test_ronde12_aanvulling_glutenvrij_20261113.py tests/test_cap02_kandidaten.py tests/test_ronde4_20261101.py tests/test_ronde3_20261101.py tests/test_haiku_standaard_20261103.py tests/test_ronde11_artefact_bouw_20261112.py tests/test_ronde11_artefact_browser_20261112.py tests/test_review_20261101.py tests/test_ronde10_glutenvrij_20261103.py -q` = 244 passed.

## Spec Change Log

## Review Triage Log

Drie lagen (Blind Hunter, Edge Case Hunter, Verification Gap), parallel, zelfde modelniveau; 32 bevindingen. Per root cause:

- `--besluit` in DRAAIPLAN tussen dubbele aanhalingstekens: de shell eet de bedragen — medium, patch (enkele aanhalingstekens, bedragen zonder $).
- raming en verwachting per aanroep gemeten op een kleinere prompt — medium, patch (DRAAIPLAN: eerst 3 etiketten, raming herberekenen; verwachting blijft $0,005, INFERENCE).
- vaste grens 64.04 tegen een momentopname van het verbruik — low, patch (herberekenen vlak vóór de run).
- bewaker reserveert $0,005, werkelijke aanroep kan duurder zijn: plafond niet hard — medium, patch (claim in SPEC en DRAAIPLAN: hoogstens één aanroep over de grens).
- "onvolledig" onbeperkt opnieuw geprobeerd — medium, patch (5 op rij stopt; test).
- `--met-glutenvrij` zonder `--docs` of met een ander model — medium, patch (alleen Haiku en met `--docs`; test).
- `ontdubbel`: volgorde van schrijven, herhaalde run wist de lijst, bijwerking `kandidaten-nieuw.json` — medium, patch (afgeleid uit de kandidatenlijst, eerst `-nieuw.json`, alleen met `--kandidaten`; tests).
- lege glutenvrij-rij schrijft een lege lijst — low, patch (weigeren; test).
- `bouw_nieuw` controleert Nutri-Score niet; vreemde koppeltabel, item zonder id/beeld, afgekapte PNG geven een traceback — medium, patch (ValueError; tests).
- `--assets`/`--lijst` zonder `--items` stil genegeerd — low, patch (fout; test).
- geen stap die de koppeltabel maakt; plaatshouders in het commandoblok — low, patch (DRAAIPLAN: hoofdsessie uploadt en schrijft `{bestandsnaam: url}`; variabele `$S`).
- geen test dat de gewone Haiku-run $0,06 houdt; geen test voor herhaald `ontdubbel`, `--lijst` in git, verkeerde combinaties — medium, patch (tests).
- klantcodebewaker zwak (alleen het testbestand, alleen blob-adressen) — low, patch (ook `toets.py` en `bouw.py`, ook 13+ cijfers).
- CAP-21 belooft meetellen terwijl de samenvoeging later komt — low, patch (SPEC: telt pas na de samenvoeging in een volgende ronde).
- leesbaarheid (lambda, vlagcontrole), altijd-ware assert, `split()` — low; assert en `splitlines()` doorgevoerd, de rest verworpen (cosmetisch).
- kleine documentpunten (ankers, regelnummers in de Code Map, peildatum tegen baseline, checkpoint) — low, verworpen (cosmetisch; de goedkeuring van checkpoint 1 staat in de Implementation Notes).

Uitgesteld: geen nieuw.
