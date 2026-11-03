---
title: 'Rooktests nacht: één klok voor starttijd en bestandstijden'
type: 'chore'
created: '2026-11-03'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In `nacht._registreer` meet de duur van de eerste epoch van een run als echte bestandstijd (`st_mtime`) minus de starttijd uit `nu()`; latere epochs meten het verschil met de bestandstijd van het vorige checkpoint. Twee rooktests gebruiken voor `nu()` een vaste nep-tijd (2026-11-02 23:00, en in `test_cap06` 22:00 plus een monotonic offset). Het verschil met de echte bestandstijd van de eerste epoch is dan groter dan 9,5 uur, en `draai()` zet een valse `stoppunt_1` ("een epoch duurde langer dan 9.5 uur"). Daardoor falen `test_cap06_rooktest_hervatten_sigterm_midden_in_epoch_2_via_nacht` (op `s["stoppunt_1"]`) en `test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr` (`draai` geeft `stoppunt_1` in plaats van `afgerond`).

**Approach:** Alleen de tests veranderen; `nacht.py` blijft ongewijzigd. In productie zijn `nu()` (`datetime.now`) en de bestandstijden allebei echt, dus daar klopt de vergelijking. In de twee rooktests gebruikt `nu()` de echte klok, dezelfde als de bestanden. Het venster is met `monkeypatch` op `nacht.in_venster` altijd open. Het einde van de run (`nacht.einde`) ligt 9 uur na de start, zodat de stopcontrole in de lus (`t >= eind`) niet op een vaste, verouderde tijd vastloopt. De 07:30-stop van cap06 is daarmee een stop op dat gepatchte einde. Die wijziging staat in de testdocstring. De planner moet een echte te lange epoch nog steeds afvangen: daarvoor komen negatieve controles die de bestandstijd via `os.utime` op een vaste afstand na de echte start zetten.

</frozen-after-approval>

## Acceptatiecriteria

- AC1: beide rooktests slagen met status `passed` (niet `skipped`), op de echte klok. Bewijs: `pytest -v -rfs` op de twee tests, en `git diff -- nacht.py` is leeg.
- AC2: de negatieve controle geeft na `draai()` `stoppunt_1` met de reden "een epoch duurde langer dan 9.5 uur", ook wanneer de lange epoch door een korte wordt gevolgd.
- AC3: de grens is scherp: een epoch van precies 9,5 uur geeft geen epochreden; 9,5 uur plus 1 seconde wel. De epoch wordt in beide gevallen gemeten (`epoch_s`).
- AC4 (mutatiecontrole): met de epochgrens uitgeschakeld (`nacht.MAX_EPOCH_S` vergroot) vallen alle negatieve controles rood. Dat is het bewijs dat de controles de planner echt bewaken.

## Implementation Notes

- **Route-poort:** open vragen geen. Onomkeerbare acties nee (alleen testbestanden en dit document; geen productiecode, geen betaalde aanroep). Omvang klein (`tests/test_cap06_training.py`, `tests/test_ronde9_20261102.py`). De zware rooktest draait een echte rfdetr-run op een verzonnen set; dat is geen productietraining.
- **Rode run vóór de wijziging (bewijs):** `uv run pytest tests/test_cap06_training.py::test_cap06_rooktest_hervatten_sigterm_midden_in_epoch_2_via_nacht tests/test_ronde9_20261102.py::test_r9_zwaar_rooktest_pauzeren_en_hervatten_met_rfdetr`: 2 failed. De assertiefouten: `At index 2 diff: 'een epoch duurde langer dan 9.5 uur' != None` (cap06) en `assert 'stoppunt_1' == 'afgerond'` (r9).
- **Keuze (optie A, door de build gemaakt):** echte klok met gepatchte venster- en einde-functies. De alternatief (optie B: een nep-klok die de bestandstijden van de checkpoints bijstelt) vraagt een race tussen het schrijven van een checkpoint en het bijstellen van zijn tijd. Optie A kan Friso terugdraaien; dat is geen open vraag.
- **Negatieve controles:** `tests/test_cap06_training.py`, onderaan, zonder marker `zwaar` (geen rfdetr nodig). Een stub-trainingsproces schrijft checkpoints met vaste bestandstijden. Tests: 10 uur na de start (AC2); de grens bij 9,5 uur en 9,5 uur plus 1 s (AC3); een tweede epoch van 10 uur (het pad van een latere epoch); en een lange epoch gevolgd door een korte (AC2).
- **Overlap:** `test_r9_nacht_stoppunt_1_bij_een_epoch_langer_dan_max_epoch_s` (`tests/test_ronde9_20261102.py`) dekt de trigger met een consistente nep-klok en een grens van 1800 s. De controles hier voegen de echte klok en de productiegrens van 9,5 uur toe.
- **Bekende beperking:** de rooktests dekken niet de echte 07:30-rekenregel van `in_venster` en `einde`; die wordt in deze wijziging gepatcht. De productie-controle van een epoch langer dan 9,5 uur kan alleen binnen de 300 s stopgrace optreden (INFERENCE op `draai`: de run stopt bij het einde, en `_registreer` meet ná `_stop_proces`).
- **Groen betekent passed:** draai met rfdetr geïnstalleerd en `pytest -rs`. Een skip telt niet als groen.
- **Te verifiëren (hoofdsessie):** de twee rooktests faalden ook vóór de Haiku-wijziging, met dezelfde oorzaak. Controle: een git-export van `3557574` in een tijdelijke map (niet in de worktree), daarin de twee tests draaien. Het resultaat van die controle staat in het resultaatblok.
- **Datumafhankelijk:** de nep-start van cap06 (2026-11-02 22:00) geeft een verschil van meer dan 9,5 uur vanaf 3 november 2026, 07:30 lokale tijd; de r9-test (23:00) vanaf 08:30. Daarvoor blijft het verschil onder de drempel, zonder dat de test dat bewijst. Dat is de reden van de wijziging, niet een verklaring van het slagen.
- **Review (bmad-review en de drie build-lagen):** de bevindingen zijn doorgevoerd in de tests (dubbele imports, de einde-patch in de negatieve controles, de 0-s-grenstest meet de epoch, de docstrings zonder 07:30, de lange-dan-korte-epoch-controle). De spec-tekst is gecorrigeerd op het mechanisme van de eerste epoch.
