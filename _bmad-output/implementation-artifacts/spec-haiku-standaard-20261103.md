---
title: 'Haiku 5.5 als standaardmodel voorinvulling'
type: 'chore'
created: '2026-11-03'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Het standaardmodel van de voorinvulling in de proef "getrainde detector voor keurmerken" is `anthropic/claude-sonnet-5.5`. Friso besloot op 03-11-2026: "Gebruik voortaan haiku".

**Approach:** Het Haiku-tarief (OpenRouter 03-11-2026: 1e-7 invoer, 5e-7 uitvoer per token) komt in `kosten.TARIEF`. Het standaardmodel van `voorinvulling` en `voorinvulling-r9` in `toets.py` wordt Haiku 5.5. Sonnet en Gemini blijven kiesbaar via `--model`. De documenten (randvoorwaarden §3, DRAAIPLAN, toetsset §5) krijgen het nieuwe model met datum en besluit. Niet veranderen: zdr-gedrag in `openrouter.py`, de kostengrenzen $73 en $55.

</frozen-after-approval>

## Implementation Notes

- **Route-poort (drie feiten):**
  1. Intent gaps: geen. Het besluit van Friso dekt het model, de scope en de grenzen.
  2. Irreversibles: nee. Code en documenten, geen betaalde aanroep, geen voorinvulling, geen push naar acc of main.
  3. Footprint: klein. `kosten.py`, `toets.py`, `randvoorwaarden.md`, `DRAAIPLAN.md`, `toetsset.md` en één testbestand. Geen nieuwe publieke API.
  Route: `oneshot`.
- **Goedkeuring:** de hoofdsessie (coordinator) heeft de spec goedgekeurd namens de keuzestap, op basis van het besluit van Friso in het Intent. Friso zelf heeft deze spec niet gelezen.
- **ATDD vooraf:** `tests/test_haiku_standaard_20261103.py` in de proefmap, rood vastgelegd (4 rood, 1 groen). Checklist: `_bmad-output/test-artifacts/atdd-checklist-haiku-standaard-20261103.md`.
- **Bekend voorbehoud (uit de spec-wijziging, niet opgelost):** de keuze voor Haiku volgt uit een vergelijking waarin de bevestigingen Sonnets antwoorden zijn. Die zijn niet onafhankelijk.
- **Bekend kostenverschil (niet opgelost, bewust):** `randvoorwaarden.md` §3 noemt $0,12 per etiket voor Sonnet als gemeten. Het memlog van 03-11 noemt $22,93 voor 301 etiketten, dat is $0,076 per etiket.
- **Reviewlagen (oneshot-set uit het manifest):** Blind Hunter, Edge Case Hunter en Verification Gap. Geen andere lagen.

## Review Triage Log

Reviewlagen: Blind Hunter (22 KB diff, N=5 bij de vloer), Edge Case Hunter, Verification Gap. Alle drie via verse subagents.

| # | Bron | Bevinding | Oordeel | Actie |
|---|---|---|---|---|
| 1 | Blind | Documenten zeggen dat Gemini kiesbaar is; de client weigert Gemini voor de voorinvulling (`openrouter.py`, K4-aa-model) | high (feitelijk onjuist) | Doorgevoerd: randvoorwaarden §3, toetsset §5, SPEC.md. Frozen intent blijft staan en is een open punt voor de hoofdsessie |
| 2 | Blind | Gemini-test controleerde alleen de parse | medium | Doorgevoerd: test bouwt de Client voor Sonnet en Haiku (slaagt) en Gemini (ValueError) |
| 3 | Blind | Geen test voor de tokenfallback van Haiku | low | Doorgevoerd: `test_kosten_zonder_usage_cost_telt_tokens_maal_haiku_tarief` (0,15 dollar) |
| 4 | Blind | Testheader beschreef de rode fase als actueel | cosmetisch | Doorgevoerd |
| 5 | Blind | Bron Haiku-tarief niet vastgelegd; docstring noemde alleen 30-10 | low | Doorgevoerd: docstring en commentaar bij de regel; bron benoemd als "zoals doorgegeven bij het besluit", INFERENCE |
| 6 | Blind + Verification | Startprojectie (PER_AANROEP 0,06, raming_r9) ongeacht model | medium (conservatief) | Gedocumenteerd in DRAAIPLAN stap 3; ontwerpkeuze uitgesteld (deferred-work) |
| 7 | Blind | Drie afwijkingen Haiku (RECYCLABLE x2, V-label x1) niet genoemd | high voor het besluit | Doorgevoerd in toetsset §5; besluit van Friso uitgesteld (deferred-work) |
| 8 | Blind | Tijdregels in DRAAIPLAN beschrijven Sonnet | low | Doorgevoerd: label erbij, Haiku niet gemeten |
| 9 | Blind | $73-grens zonder nieuw besluit | medium (beslissing) | Niet veranderd (regel van de hoofdsessie); deferred-work voor Friso |
| 10 | Blind | Commando zonder `--model` | low | Doorgevoerd: `--model anthropic/claude-haiku-5.5` in het DRAAIPLAN-commando |
| 11 | Blind | SPEC.md noemde de update als "nog niet bijgewerkt" | low | Doorgevoerd |
| 12 | Blind | versions.md niet bijgewerkt | false voor deze wijziging | Verworpen: de wijziging is alleen zichtbaar in de proef (intern), geen eindgebruikerswijziging; versions.md is niet gewijzigd |
| 13 | Blind + Verification | zdr-bewijs voor Haiku niet bij §1 | low | Doorgevoerd: zdr-proef 03-11 (VERIFIED, memlog) in randvoorwaarden §1 |
| 14 | Edge | Gemengde modellen in voorinvulling.json en voorinvulling-r9.json (een herstart met een ander model mengt de resultaten) | high (operationeel) | Niet doorgevoerd als guard, want die breekt de bestaande testcontract "oude entries blijven staan" (test_ronde4, test_ronde5, test_ronde9: drie rood bij de eerste poging). Gedrag blijft zoals het was. Besluit Friso 03-11-2026: nieuw bestand per model; opgelost in de code via `bestandsnaam()` in `toets.py` (Sonnet houdt de oude namen, Haiku schrijft naar `*-claude-haiku-5-5.json`). Zie deferred-work |
| 15 | Verification | Main-pad naar de client niet getest; een verkeerd model blijft onopgemerkt | high | Doorgevoerd: test stubt `openrouter.Client` en bewijst Haiku voor beide subcommando's |
| 16 | Verification | Twee tests in de normale suite faalden door het label "Kosten:" | high | Doorgevoerd: regel begint weer met "Kosten:" (test_cap10 en test_ronde3 groen) |
| 17 | Trace (AC5, AC6 zonder test) | Zdr-gedrag en de documenten-tekst zonder test | gat in de gate (66,7%) | Doorgevoerd: karakteriseringstests `test_zdr_gedrag_van_de_client_ongewijzigd` en `test_documenten_noemen_haiku_met_datum_en_besluit[...]` (besluit Friso 03-11-2026, optie a) |
| 18 | Build na besluit | Per-model uitvoernamen: de drie tests met de oude Sonnet-namen zetten nu `--model anthropic/claude-sonnet-5.5` expliciet (test_ronde3, _ronde4, _ronde5, _ronde9) | doorgevoerd | Het testcontract blijft: Sonnet schrijft de oude bestanden |

Overige suite-uitkomst: twee rooktests van training (`test_cap06_training` sigterm/hervatten, `test_ronde9_20261102` zwaar rooktest) falen op timing en stoppunt van het trainingsproces. Geen van beide importeert `toets` of `kosten`; `nacht.py` en `train.py` verwijzen niet naar die modules (VERIFIED met grep). Vermoedelijk machine-afhankelijk; niet door deze wijziging.
