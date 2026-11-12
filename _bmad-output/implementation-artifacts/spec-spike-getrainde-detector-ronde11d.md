---
title: 'Ronde 11d: browsertests van de lokale invulpagina op het ronde-10-contract (CAP-3)'
type: 'chore'
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

**Problem:** Sinds 1498c81 (04-11-2026) heeft de lokale invulpagina 14 rijen (glutenvrij optioneel na PlanetProof); 17 browsertests van ronde 5, 7 en 9 verwachten nog 13 rijen, 12 keuzegroepen en PlanetProof als laatste keuzerij, waardoor de volle suite rood is.

**Approach:** De verwachtingen in `tests/test_ronde5_browser_20261101.py`, `tests/test_ronde7_browser_20261102.py` en `tests/test_ronde9_browser_20261102.py` bijwerken naar het ronde-10-contract van SPEC CAP-3 ("Ronde 10, browser") en toetsset §6, zonder controles weg te halen of te verzwakken; de pagina blijft ongewijzigd. Per test is vooraf vastgesteld dat het een verouderde verwachting is (meting 12-11-2026 in de spec van ronde 11d).

</frozen-after-approval>

## Implementation Notes

- **Route-poort (step-02), 12-11-2026:** intent gaps 0 (het contract staat in SPEC CAP-3 en toetsset §6, na spec-review). Irreversibles 0. Footprint klein (verwachtingen in drie testbestanden plus een nieuw testbestand met expliciete glutenvrij-tests; geen productcode, geen nieuwe afnemers; SPEC/toetsset en deferred-work via de spec-stap). Route: oneshot.
- Per test gecontroleerd (meting 12-11-2026, volle suite en losse runs): 2× ronde 5 en 1× ronde 7 (opbouw) tellen 12 groepen / 13 rijen; 8× ronde 9 "dertien rijen" faalt alleen op het aantal (indeling met 14 rijen gemeten: past); 1× ronde 9 en 1× ronde 7 (toetsen) verwachten dat 1/2/3 op PlanetProof blijft staan, terwijl het nu naar glutenvrij doorschuift (consistent met "nooit automatisch naar Nutri-Score"); 3× ronde 7 (Nutri-Score) drukken 12 keer pijl-omlaag in plaats van 13; ronde 9 "vier nieuwe rijen" telt 13/12. Geen echte paginafout gevonden.
- ATDD vooraf: rode basislijn 17 failed, 52 passed; zes nieuwe expliciete tests in `tests/test_ronde11d_glutenvrij_rij_browser_20261112.py`.
- Gebouwd: verwachtingen bijgewerkt in `tests/test_ronde5_browser_20261101.py` (13 groepen, 14 standen), `tests/test_ronde7_browser_20261102.py` (`KEUZE13`, `NEGEN` = 14 rijen, `LAATSTE` = glutenvrij, PlanetProof schuift door, pijl-omlaag `len(KEUZE13)`), `tests/test_ronde9_browser_20261102.py` (`VEERTIEN`, 14 rijen, 13 groepen, PlanetProof schuift door naar glutenvrij; test hernoemd naar `test_r9b_alle_rijen_op_een_scherm_zonder_paginascroll`, dode constante weg). Geen controle verwijderd; de indelingscontroles lopen nu over alle 14 rijen.
- Faalbewijs nieuwe tests: tegen de pagina van c2d73ed (vóór glutenvrij, tijdelijk teruggezet en daarna byte-gelijk hersteld) falen 6 van de 7 nieuwe tests; de nalooptest is op beide groen (regel ongewijzigd sinds ronde 9).

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run pytest tests/test_ronde11d_glutenvrij_rij_browser_20261112.py tests/test_ronde5_browser_20261101.py tests/test_ronde7_browser_20261102.py tests/test_ronde9_browser_20261102.py -q` -- 70 passed (12-11-2026).
- `uv run pytest -q -m "not zwaar"` (zelfde map) -- volle suite groen.

## Review Triage Log

Laag Blind Hunter (verse subagent, zelfde modelniveau; vloer N = 8). 12 bevindingen gecontroleerd:

- 1 4/5/0-test telt POSTs zonder ijkpunt — low, patch (ijkpunt-POST zoals ronde 7).
- 2 geen browsertest voor bevestigen mét glutenvrij — medium, patch (nieuwe test: glutenvrij in `bevestigde_codes`).
- 3 pagina toont voor glutenvrij doel zonder 50, gate C vraagt 35 — medium, defer (productkeuze, bestond al; deferred-work.md).
- 4 "alle 13" dubbelzinnig in SPEC CAP-3 en toetsset §6 Opslaan — low, patch (12 losse + Nutri-Score; glutenvrij alleen bij keuze in `bevestigde_codes`).
- 5 twee byte-gelijke paginabestanden, verouderde docstring ronde-10-test — low, defer (bestond al; deferred-work.md).
- 6 verouderde namen en dode constante in ronde 9 — low, patch (docstring, kop, `DERTIEN` weg, test hernoemd).
- 7 docstring ronde 7 spreekt zichzelf tegen — low, patch.
- 8 vaste aantallen in de nieuwe tests — low, patch (afgeleid uit `VEERTIEN`).
- 9 spec ronde 11d dekt niet wat er gedaan is — low, patch (deze notities, Verification, status).
- 10 nieuwe tests nooit rood gezien — medium, patch (faalbewijs tegen de pagina van vóór glutenvrij: 6 van 7 rood).
- 11 indelingstest zonder speling alleen terloops vermeld — low, defer (eigen regel in deferred-work.md, eigenaar bmad-ux).
- 12 holle controle op `#melding` direct na `b` — low, patch (eerst "Opgeslagen" afwachten).
