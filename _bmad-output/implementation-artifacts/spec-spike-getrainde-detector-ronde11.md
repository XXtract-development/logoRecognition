---
title: 'Ronde 11: artefactpagina laat glutenvrij nalopen (CAP-19)'
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

**Problem:** In de gepubliceerde beoordelingspagina (artefact "Beoordeling keurmerk-proef") is glutenvrij een optionele rij die niet meetelt; de beoordelaar sloeg hem op alle 352 etiketten over. De repository is publiek, dus de pagina met etiketcodes en beeldadressen mag er niet in.

**Approach:** Het sjabloon (`invul/artefact/sjabloon.html`, versie 4 met lege ITEMS) maakt glutenvrij de enige na-te-lopen code en verplicht bij bevestigen, met notitie "Al bevestigd: controleer alleen glutenvrij."; opslag, documentvorm, `bevestigde_codes`-regel, downloadknop, beelden en sneltoetsen blijven gelijk. Een bouwscript (`invul/artefact/bouw.py`) zet het glutenvrij-oordeel uit `voorinvulling-r10-claude-haiku-5-5.json` in de ITEMS van de huidige artefactbron en schrijft het sjabloon met die ITEMS buiten elke git-werkboom, met de weigeringen uit toetsset §6a. Contract: SPEC CAP-19 en toetsset §6a; tests `tests/test_ronde11_artefact_*_20261112.py`.

</frozen-after-approval>

## Implementation Notes

- **Route-poort (step-02), 12-11-2026:** intent gaps 0 — de enige niet in de briefing vastgelegde schermtekst is de weigering bij bevestigen zonder alle keuzes; in de gebouwde pagina is die niet bereikbaar (elk etiket heeft voorinvulling voor de 12, glutenvrij en Nutri-Score, het bouwscript weigert anders, en een keuzerondje kan niet worden leeggemaakt), dus de gebruiker merkt hem niet; gekozen: "Kies eerst bij alle 12 keurmerken, glutenvrij en Nutri-Score; niets opgeslagen." (één constante, aan te passen vóór publiceren). Irreversibles 0 — niets gepubliceerd, geen schrijfactie op de opslag, de pagina gaat naar de scratchpad. Footprint klein — `sjabloon.html` (±10 regels), nieuw `bouw.py` (±80 regels, CLI, door niets anders aangeroepen), `invul/artefact/__init__.py`. Route: oneshot.
- ATDD vooraf: `uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q` = 12 failed, 7 errors, 1 passed (checklist `_bmad-output/test-artifacts/atdd-checklist-ronde11-artefact-glutenvrij-20261112.md`).
- Gebouwd: `invul/artefact/bouw.py` (nieuw, met `__init__.py`), `invul/artefact/sjabloon.html` (R9/NIEUW/KEUZE in plaats van LOS/OPTIONEEL; `NIEUW = ["DIET_FREE_FROM_GLUTEN"]`; `volledig()` over alle 13 keuzerijen; notitie en weigertekst als constanten). Tussenrun na alleen `bouw.py`: 7 browsertests faalden op gedrag (sjabloon nog versie 4), 13 groen; na de sjabloonwijziging 20/20 groen.
- Gebouwde pagina buiten de repo: `/private/tmp/claude-501/-Users-frisovanweelden-Documents-projects-logoRecognition/9cd81e71-06f4-4168-a2be-d3af944fd461/scratchpad/sasha/beoordeling-keurmerk-proef-glutenvrij.html` (352 etiketten, glutenvrij 35 aanwezig, 317 afwezig; ITEMS gelijk aan de bron op glutenvrij na; buiten de ITEMS-regel alleen de bedoelde regels anders dan versie 4).
- Verrassing: de 15 ongecommitte memlogregels van ronde 10 en `toetsset.md` regel 126 (al gecommit in e347751ecb86c2ef1694bc47a5c21fbc6862b59d) bevatten echte etiketcodes; in de werkboom vervangen door neutrale verwijzingen. De gecommitte versie staat nog in de geschiedenis van de tak (melden aan Friso).
- Volle suite (12-11-2026, proefmap): eerste run met de zware trainingsrooktests liep na 20 min vast in een echte training onder load average 44; eigen run op proces-id gestopt. `uv run pytest -q -m "not zwaar"` = 1017 passed, 17 failed, 4 deselected. De 17 zijn browsertests van de lokale invulpagina die 13 rijen verwachten terwijl ronde 10 (1498c81) er 14 maakte; geen van de betrokken bestanden is in ronde 11 gewijzigd; uitgesteld in deferred-work.md. De zware tests (`train.py`, niet gewijzigd) niet opnieuw gedraaid.
- Trace: PASS, `_bmad-output/test-artifacts/traceability-spike-getrainde-detector-ronde11.md`.

## Review Triage Log

Laag Blind Hunter (verse subagent, zelfde modelniveau; vloer N = 10). Alle 12 bevindingen gecontroleerd:

- 1 echte etiketcodes in ongecommitte memlogregels — high, patch: vervangen door neutrale verwijzingen (ook `toetsset.md` r.126).
- 2 lekbewaker dekt alleen `invul/artefact/` — medium, patch: test `test_documenten_van_de_proef_bevatten_geen_etiketcodes` over spec, companions en memlog.
- 3 naam beoordelaar in memlog; oudere memlogregels in deze commit — medium, patch: "externe beoordelaar"; commitbericht noemt de meegaande ronde-10-regels (briefing staat dat toe).
- 4 `in_werkboom` laat schrijven door bij andere git-fout of `.git`-pad — medium, patch: alleen "not a git repository" (LC_ALL=C) telt als buiten; `.git` in het pad weigert; test erbij.
- 5 `test_main_drukt_telling_af` te zwak — medium, patch: exacte regel.
- 6 weigerpad van de opdrachtregel ongetest — low, patch: test `main` geeft 1, stderr "geweigerd:", niets geschreven.
- 7 geen test met een record met status `open` — medium, patch: D is een tussenstand; extra test opent op het eerste open etiket in ITEMS-volgorde.
- 8 documenten lezen nog als rode fase — low, patch: docstrings, deze spec en de ATDD-checklist bijgewerkt.
- 9 open vraag over onbereikbare weigertekst — low, patch: in SPEC gesloten met de reden (memlog).
- 10 unittests hangen aan de browsermodule — low, patch: `tests/ronde11_hulp.py`; bouwtests draaien zonder Playwright (16 passed met `-m "not browser"`).
- 11 geen controle op 352/35/317; `~` in `--bron`/`--uit` — medium, patch: `expanduser` op alle drie; de vergelijking met 352/35/317 hoort bij de publicatiestap van de hoofdsessie (de afgedrukte regel), geen code (andere invoer mag een ander aantal hebben).
- 12 `</script>` in ITEMS breekt de pagina — low, patch: `</` wordt `<\/` (ook in de testhulp); test erbij.

Uitgesteld: geen. Verworpen: geen.
