# Story 12.23: ml-testsuite-sanering — volledige suite groen in het productie-image

Status: done

<!-- Uitvoering van de op 2026-07-15 geflagde opvolgtaak (pre-existing suite-
     problemen, empirisch bewezen via controle-runs tijdens de 12.22-gates).
     Friso's go: "ad 4 implementeer". Test-infra-only; geen productiecode. -->

## Probleem (drie wortels, alle pre-existing)

Volle-suite-runs in het ghcr-container-image gaven structureel
`1 failed + 11 errors`; delen van de suite draaiden effectief nooit:

1. **Hash-guard vals alarm + nooit gedraaid.** `test_no_node_content_hash`
   flagde `artwork-pipeline.ts` — maar de enige `contentHash`-vermelding daar is
   een **commentaarregel**, naast een legitieme AD-12-hash (sha256 over
   BRON-bestandsbytes). In eerdere gates draaide de test überhaupt niet
   (repo-mount miste `apps/api/src`).
2. **cv2-herimport crasht.** De 12_12-fixture deed `delitem` + verse
   `import_module("cv2")` — opencv kan niet in-proces geherimporteerd worden
   zodra hij al geladen is (bewezen met minimale repro: "partially initialized
   module 'cv2'", ook na volledige cv2*-purge) → 6 setup-ERRORs.
3. **Collectie-vergiftiging door stubs.** Module-niveau-loaders (19.11,
   bootstrap) installeerden op COLLECTIE-tijd `app`-pakket-stubs met
   `__path__ = []` én submodule-stubs (`app.services.database` e.d.) — alle
   later gecollecteerde bestanden die de échte `app.api`/`DatabaseService`
   importeren kregen ImportError → 5 collection-errors (die tests draaiden
   nooit).

## Fixes

1. **Hash-guard**: content-hash-vermeldingen in commentaarregels tellen niet
   meer mee; de guard draait nu echt en het AD-12-geval passeert terecht.
2. **12_12-fixture**: echte cv2 wordt op collectie-moment gevangen
   (`import cv2 as _REAL_CV2`) en via monkeypatch geïnjecteerd — nooit meer
   herimporteren (zelfde patroon als test_nutriscore_reader_12_22).
3. **Stub-hygiëne**: (a) alle stub-installers geven pakket-stubs het ÉCHTE
   package-pad (`__path__ = [apps/ml-service/app/...]`) zodat niet-gestubde
   submodules gewoon importeerbaar blijven; (b) de module-niveau-loaders
   (19.11/bootstrap) herstellen ná het laden de aangetroffen
   sys.modules-toestand (hun eigen tests herinstalleren stubs per test via de
   bestaande autouse-fixtures, dus dit is gedragsneutraal voor henzelf).

## Resultaat (container-gate, productie-image)

| | vóór | ná |
|---|---|---|
| passed | 141 | **176** |
| failed | 1 | **0** |
| errors | 11 | **0** |
| skipped | 13 | 14 |

Voor het eerst draait de volledige ml-suite schoon; 4 testbestanden
(flywheel_phash, localize_codes_filter, phash_service, restore_recyclable) +
ivfflat_probes draaien nu daadwerkelijk mee. Lokale subset eveneens groen.

## Geraakte bestanden (alleen tests)

- apps/ml-service/tests/unit/test_no_node_content_hash.py
- apps/ml-service/tests/unit/test_queue_harvest_nutriscore_12_12.py
- apps/ml-service/tests/unit/test_classify_gate_19_11.py
- apps/ml-service/tests/unit/test_bootstrap_search_service.py
- apps/ml-service/tests/unit/test_queue_harvest_19_10.py
- apps/ml-service/tests/unit/test_queue_harvest_nutriscore_declared_12_15.py
- apps/ml-service/tests/unit/test_nutriscore_reader_12_22.py

## Suite-conventie (vastgelegd voor toekomstige tests)

- cv2 exact één keer per proces laden; nooit `delitem`+herimport — vang de
  collectie-referentie en injecteer die.
- Pakket-stubs altijd met echt `__path__`; module-niveau-loads herstellen
  sys.modules; per-test herinstalleren blijft de defensieve norm.
