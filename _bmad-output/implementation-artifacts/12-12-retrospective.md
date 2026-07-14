# Story 12.12 — Retrospective (implement-sprint, epic-agent)

Status: story `review`, Task 7 (ACC DRY_RUN + echte run + menselijke labeling) pending-permission

## Wat ging goed
- De 12.11-spike + de corpus-vindbaarheid-diagnose (2026-07-13) leverden samen
  een vrijwel kant-en-klaar ontwerp: "letter-onafhankelijk op de vorm zoeken,
  mens labelt de letter" was al doorgemeten (0,60-drempel, 157 treffers/397
  GTINs, HSV-kleur-heuristiek) — de story hoefde alleen dat bewezen recept om
  te zetten naar productiecode + tests, niet opnieuw te ontdekken.
- Het bestaande relabel-picker-pad (Story 12.7/12.6) bleek AL de volledige
  Nutri-Score-letteruniverse (`NUTRISCORE_A..E` in `keurmerk-codes.ts`) en de
  code-agnostische accept-override-flow (`artwork-pipeline.ts`) te bevatten —
  Task 2/3 (AC2/AC3) waren dus een VERIFICATIE-taak (nieuwe tests die het
  bestaande gedrag bewijzen), geen nieuwe UI/API-code. Dat hield de diff klein
  en het regressierisico op api/web nul (0 productiecode-wijzigingen daar).
- De keuze voor een apart script (`queue_harvest_nutriscore.py`) i.p.v. een
  env-vlag in `queue_harvest.py` bleek meteen zijn waarde: de volledige
  ml-pytest-suite bleef 63→80 (netto +17, 0 regressies) en `queue_harvest.py`
  zelf staat NERGENS in de diff — het bewijs dat de 19.10-scoping onaangeroerd
  bleef is dus letterlijk "het bestand komt niet voor in `git diff --stat`",
  geen argumentatie nodig.

## Wat brak / wat een verrassing was
- De eigen `color_module`-testfixture faalde bij een volledige-suite-run (5/5
  kleur-heuristiek-tests rood) terwijl dezelfde tests LOS altijd groen waren.
  Root cause: `test_bootstrap_search_service.py` (een bestaande, ongerelateerde
  suite) zet `sys.modules["cv2"] = fake_cv2` RECHTSTREEKS (niet via
  `monkeypatch.setitem`) — dat wordt nooit teruggedraaid en besmet de rest van
  de pytest-sessie met een fake cv2 zonder `cvtColor`. Gevonden door bisectie
  (bestand-voor-bestand samen met de nieuwe suite draaien) in plaats van aan
  te nemen dat "los groen" genoeg bewijs is voor "in de volledige suite ook
  groen" — precies de reden waarom protocol-fase G de volledige suite ná de
  laatste fix vereist, niet alleen de eigen nieuwe tests.
- Fix was defensief (in mijn eigen testbestand: verwijder een gecachete `cv2`
  en forceer een verse, via-monkeypatch-teruggedraaide echte import) in plaats
  van het pre-existing probleem in `test_bootstrap_search_service.py` zelf aan
  te pakken — dat zou een ongerelateerd bestand van een andere story wijzigen,
  buiten scope van 12.12. Het onderliggende sessie-pollutie-patroon (directe
  `sys.modules[...]`-assignment i.p.v. `monkeypatch.setitem`) is een latent
  risico voor toekomstige suites die op echte cv2 vertrouwen — waard om te
  signaleren voor een volgende opschoon-story, niet om nu te fixen.

## Patronen/afspraken voor vervolgstories
- Wanneer een test bewust de ECHTE versie van een normaal-gestubde dependency
  nodig heeft (hier: echte opencv-HSV-conversie i.p.v. de gebruikelijke
  fake-cv2-stub), verwijder eerst expliciet een eventueel gecachete stub uit
  `sys.modules` en herimporteer via `monkeypatch` (zodat het teruggedraaid
  wordt) — anders is de test stilzwijgend afhankelijk van de uitvoeringsvolgorde
  van de hele suite.
- Een goedgekeurde diagnose/spike met een concrete, gemeten drempelwaarde
  (hier: 0,60) hoort 1:1 als default in de implementatie te landen — een test
  die expliciet de default-waarde pint (`test_ac1_default_floor_is_060`)
  voorkomt dat een latere "kleine tuning" de validatie van de diagnose stil
  ongeldig maakt.
- Bij een "aparte modus naast een bestaand, zwaar getest script"-ontwerp: kies
  waar mogelijk voor volledige bestandsisolatie (eigen state-key, eigen
  env-namespace, lokaal gedupliceerde pure helpers i.p.v. cross-module-import)
  — het maakt "raakt het bestaande NIET aan" een git-diff-feit in plaats van
  een bewering.

## Openstaand (niet deze story's scope om te sluiten)
- Task 7 (AC6): live DRY_RUN op ACC (read-only telling + kleur/letter-
  verdeling) → met aparte toestemming een echte run die review-items aanmaakt
  → menselijke labeling in de review-UI → C/D over k=3 → conditie-C-herkenning
  per letter aantonen. Permission-gated, niet uitgevoerd in deze run.
- Het gesignaleerde `sys.modules["cv2"]`-pollutiepatroon in
  `test_bootstrap_search_service.py` (zie hierboven) — een mogelijke, kleine
  opschoon-taak voor een latere story, niet in scope van 12.12.
- Epic-12-retrospective (breder dan deze ene story) — optioneel volgens
  sprint-status, niet in scope hier.
