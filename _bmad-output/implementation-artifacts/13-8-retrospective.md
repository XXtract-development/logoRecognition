# Retrospective — Story 13.8 (RGBA-veilige embedding)

**Datum:** 2026-07-21 · **Epic:** 13 (vliegwiel) · **Commit:** d11d8f1 op `epic/vliegwiel-13-8-rgba-embedding`

## Wat ging goed
- **Investigate→story→fix werkte zoals bedoeld.** De read-only investigatie (RGBA-mode-telling op ACC, code-lokalisatie) leverde een eenduidige, minimale fix (2 regels) met gemeten scope (15/250 crops RGBA).
- **Echte-omgeving-verificatie.** ATDD gedraaid tegen de échte torch-preprocessing in het ml-image (niet de mock-tak), met een baseline-differential (184→187, 0 regressie) die bewees dat de resterende rode vinkjes pré-existent/omgevings-only zijn.
- **Onafhankelijke review** (implementeerder ≠ reviewer) bevestigde centrale dekking van alle 14 callsites en de geldigheid van de test.

## Wat brak / opviel
- **Test-isolatie-zwakte in de ml-suite.** Andere tests injecteren een nep-`cv2` in `sys.modules` zónder `__spec__`; dat maakte een nieuwe test die de échte torchvision-preprocessing raakt volgorde-afhankelijk (`cv2.__spec__ is None`). Opgelost door torchvision eager te importeren in de test; de onderliggende pollutie in die andere tests blijft staan.
- **PROD-image is geen test-omgeving.** De volledige ml-suite draaien in het productie-image geeft omgevings-ruis (ontbrekende `scripts/`, `requirements.txt`, andere padstructuur → 3 collection-errors + 1 phash-failure). Een echte test-image/CI-run zou schoner zijn.

## Afspraken / opvolging
1. **Lazy zware imports + gedeelde `sys.modules`-mocks = flakiness-risico.** Nieuwe tests die een echt zwaar pad raken: importeer de zware dependency eager op collection-tijd, of isoleer. (Deze story past dat toe.)
2. **Klein test-hygiëne-opvolgpunt:** de `cv2`-`sys.modules`-injecties in de ml-suite een `__spec__` geven of via `monkeypatch.setitem` met teardown — voorkomt toekomstige volgorde-afhankelijkheid. Niet in scope van 13.8.
3. **Nazorg-opvolgpunten uit de story blijven open:** (a) waarom de review-UI crops als RGBA opslaat (upstream RGB?), (b) de 5 resterende `in_batch`-kandidaten in de gesloten quarantained batch `12e27fbc` (her-nominatie/heropening).
4. **Deblokkeer-verificatie (AC3)** staat gated op go Friso: na ml-service-deploy de promotielus opnieuw triggeren en bevestigen dat de regressie-eval de volledige gold-set embedt.
