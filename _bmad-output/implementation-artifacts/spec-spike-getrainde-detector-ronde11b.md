---
title: 'Ronde 11b: alleen de etiketten met AI-glutenvrij in de artefactpagina (CAP-19)'
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

**Problem:** Besluit Friso 12-11-2026 ("35, rest volgt de AI"): de beoordelaar hoeft alleen de etiketten na te lopen waarop de AI glutenvrij zag; de pagina van ronde 11 toont alle 352.

**Approach:** `invul/artefact/bouw.py` krijgt de optie `--alleen-ai-glutenvrij` (functie: `alleen_ai_glutenvrij=True`), standaard uit. Met de optie houdt het script na alle weigeringen over de hele bron alleen de etiketten met AI-glutenvrij `true`, in bronvolgorde, weigert het bij nul getoonde etiketten en drukt het "getoond X van Y" af. Het sjabloon, de opslag en de downloadknop blijven ongewijzigd. Contract: SPEC CAP-19 (sub-bullet ronde 11b) en toetsset §6a.

</frozen-after-approval>

## Implementation Notes

- **Route-poort (step-02), 12-11-2026:** intent gaps 0 (de afgedrukte regel "getoond X van Y" en het gedrag liggen vast in SPEC en toetsset; het sjabloon telt de voortgang al over ITEMS, en de download en de stand al over alle records). Irreversibles 0 (niets gepubliceerd, geen schrijfactie op de opslag, uitvoer in de scratchpad). Footprint klein (`bouw.py`, ±15 regels, geen nieuwe afnemers). Route: oneshot.
- ATDD vooraf: `uv run pytest tests/test_ronde11_artefact_browser_20261112.py tests/test_ronde11_artefact_bouw_20261112.py -q` = 4 failed, 4 errors, 25 passed (checklist `_bmad-output/test-artifacts/atdd-checklist-ronde11b-alleen-ai-glutenvrij-20261112.md`).
- Gebouwd: `invul/artefact/bouw.py` — `bouw(..., alleen_ai_glutenvrij=False, verwacht=None)`, opdrachtregel `--alleen-ai-glutenvrij` en `--verwacht N`; filter ná alle controles over de hele bron; nul getoond en een afwijkend verwacht aantal worden geweigerd; telling altijd `{etiketten, aanwezig, afwezig, totaal}`. Sjabloon ongewijzigd. Groen: 33 passed direct na de bouw, 36 passed na de reviewbevindingen.
- Pagina: `/private/tmp/claude-501/-Users-frisovanweelden-Documents-projects-logoRecognition/9cd81e71-06f4-4168-a2be-d3af944fd461/scratchpad/sasha/beoordeling-keurmerk-proef-glutenvrij-35.html`, gebouwd met `--alleen-ai-glutenvrij --verwacht 35` uit de bron van versie 4: "getoond 35 van 352"; de 35 id's zijn precies de AI-true-etiketten in bronvolgorde, elk gelijk aan het bronitem plus het oordeel; buiten de ITEMS-regel gelijk aan de ronde-11-pagina.
- Volle suite (`-m "not zwaar"`): 1025 passed, 17 failed — dezelfde 17 lokale invulpagina-tests als in ronde 11 (deferred-work.md). Trace: PASS, `_bmad-output/test-artifacts/traceability-spike-getrainde-detector-ronde11b.md`.

## Review Triage Log

Laag Blind Hunter (verse subagent, zelfde modelniveau; vloer N = 7). 12 bevindingen gecontroleerd:

- 1 DRAAIPLAN "hoogstens 317 … wijkt af" tegenstrijdig — medium, patch: exact verwacht aantal vooraf meten en vergelijken.
- 2 geen regel voor onafgemaakte getoonde etiketten — medium, patch: telt niet voor glutenvrij, aantal melden (afgeleid; ter bevestiging in SPEC).
- 3 herkomstveld `ai-r10` nergens gedefinieerd of geteld — medium, defer (deferred-work.md) en in DRAAIPLAN gemarkeerd als ongebouwd hoofdsessiewerk.
- 4 gate C wordt met AI-oordelen gehaald — high, HALT als productvraag: open vraag in SPEC, teruggegeven aan de orchestrator; blokkeert deze build niet (de samenvoeging en training zijn hoofdsessiewerk).
- 5 te bevestigen punten niet onder Open Questions — low, patch.
- 6 build zonder afronding vastgelegd — low, patch (deze spec, memlog, trace).
- 7 controle op 35 alleen via lezen — medium, patch: `--verwacht N` weigert bij afwijking; publicatieconstraint gebruikt `--verwacht 35`; tests erbij.
- 8 docstring zonder optie — low, patch.
- 9 twee vormen van de telling — low, patch: één vorm met `totaal`.
- 10 losse weigertest — low, patch: `match=` en drie gevallen op een niet-getoond etiket.
- 11 tijdraming niet bijgewerkt — low, patch: DRAAIPLAN stap 5, ±12 minuten (INFERENCE).
- 12 glutenvrij-stand op de pagina misleidend voor de beoordelaar — low, overdracht: de hoofdsessie zegt het bij de publicatie; geen schermwijziging.
