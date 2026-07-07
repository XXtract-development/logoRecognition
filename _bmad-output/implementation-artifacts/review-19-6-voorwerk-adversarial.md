# Adversarial review — voorwerk story 19.6 (story + ATDD-tests, vóór implementatie)

Datum: 2026-07-06. Targets: `19-6-bootstrap-drempel-herkalibratie.md` + `flywheel-bootstrap-threshold-19-6.atdd.test.ts` + de 19.6-tests in `test_bootstrap_search_service.py`.

## Geverifieerde feiten
- Gate is gedeeld met de live classificatie (`classification.py:118-133`, `GATE_THRESHOLD` 0,5) — de bootstrap-scoping (optie 2c) is dus terecht en noodzakelijk.
- `getBootstrapThreshold` heeft geen andere callers dan bootstrap-run → default-verlaging is bootstrap-specifiek veilig.
- `queue_harvest.py:16-17` documenteert een GEVALIDEERD operatiepunt: gate-v2 + cosine-floor 0,85 → ~74% precisie, "no RECYCLABLE flood".
- Sweep-recall bij cosine 0,60: 6/29 GTINs (4 klassen) matchen; 23/29 leeg.

## Bevindingen + afhandeling
| # | Ernst | Bevinding | Afhandeling |
|---|-------|-----------|-------------|
| 1 | **Hoog** | Operatiepunten 0,60/0,2 op recall gekozen, niet precisie-gevalideerd; prior bewijs van RECYCLABLE-flood bij lagere gate. | **Fixed** — story markeert 0,60/0,2 als VOORLOPIG; Task 1.1 verplicht precisie-validatie tegen gold-set + expliciete flood-toets vóór commit; ATDD-waarden bewegen mee. |
| 2 | Midden | Geen echte regressietest dat de live-gate 0,5 blijft. | **Fixed** — `test_gedeelde_gate_default_blijft_05_19_6` toegevoegd (groen; bewaakt de gedeelde default) + Task 5 eist de code-review-diffcheck op classification.py/keurmerk_gate. |
| 3 | Midden | `queue_harvest.py`-siblingpad + gevalideerd operatiepunt niet benoemd. | **Fixed** — story verwijst ernaar; bootstrap-kalibratie moet consistent/geïnformeerd zijn. |
| 4 | Laag | ATDD hardcodeert 0,60. | **Fixed** — story: testwaarden volgen de gemeten uitkomst. |
| 5 | Info | Bevestigd correct: gate gedeeld, geen andere threshold-callers, flywheel vlag-gated (prod draait 'm niet). | — |

## RED-status (bewezen)
- api: `getBootstrapThreshold` default-test faalt (0,93≠0,60); override-test groen.
- ml: 2 fix-drijvers falen (gate_threshold-param ontbreekt; kp 0,3 < gedeelde 0,5); 9 bestaande + 1 nieuwe regressietest groen.

## Verdict
**PASS met verwerkte fixes — MITS Task 1.1 (precisie-validatie tegen gold-set + flood-toets) vóór de code-commit gebeurt.** De belangrijkste bevinding (#1) is geen story-fout maar een essentiële volgorde-eis: de getallen zijn meet-startpunten, niet eindwaarden. Klaar voor dev-story, met de precisiemeting als eerste, blokkerende taak.
