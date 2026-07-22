# Story 13.10: cv2 test-isolatie — geen sys.modules-lek meer

Status: review

<!-- Nazorg-opvolgpunt #3 uit de RGBA-investigation (2026-07-21). Test-hygiëne in de ml-suite. -->

## Story

Als **ontwikkelaar**
wil ik **dat de bootstrap-search-tests hun nep-`cv2` niet naar andere tests laten lekken**
zodat **tests die (lazy) de echte torchvision/cv2-import raken niet volgorde-afhankelijk breken**.

### Afbakening
- Alleen test-hygiëne in `apps/ml-service/tests/unit/test_bootstrap_search_service.py`. Geen productcode.
- Scope = de `cv2`-injectie (de bewezen boosdoener van `cv2.__spec__ is None`). De overige `sys.modules`-injecties in dezelfde fixtures (app.* nep-modules) blijven buiten scope — ze veroorzaken de importlib-crash niet.

## Acceptatiecriteria
1. **Geldige `__spec__`.** Given de nep-`cv2`-module in de `patched`/`patched_c`-fixtures, when die in `sys.modules` staat, then heeft `cv2.__spec__` een geldige spec (niet `None`), zodat importlib-machinerie in een láter draaiende test er niet op crasht.
2. **Geen lek.** Given een test die de `patched`/`patched_c`-fixture gebruikt, when de test klaar is, then is `sys.modules["cv2"]` hersteld naar de oorspronkelijke waarde (via `monkeypatch.setitem`) — de nep lekt niet naar volgende tests.
3. **Geen regressie.** Given de bestaande bootstrap-search-tests, when de wijziging is toegepast, then blijven ze groen; en een test die lazy torchvision importeert slaagt in de volledige suite óók zónder eigen eager-import-workaround.

## Tasks / Subtasks
- [x] 1. Nep-`cv2` een `__spec__` geven: `importlib.util.spec_from_loader("cv2", loader=None)` (beide fixtures) (AC 1).
- [x] 2. `sys.modules["cv2"] = fake_cv2` → `monkeypatch.setitem(sys.modules, "cv2", fake_cv2)` (beide fixtures) (AC 2).
- [x] 3. **Eager-import-workaround uit 13.8's test verwijderd**, zodat `test_generate_embedding_rgba_13_8.py` de echte lazy-torchvision-probe IS en permanent in de repo bewaakt of de cv2-pollutie terugkeert (AC 3). Geen deploy (test-only).
- [x] 4. Verificatie: volledige ml-suite groen mét die probe (bewijs in Debug Log).

## Dev Notes
- Boosdoener: bare `types.ModuleType("cv2")` → `__spec__ is None`; direct `sys.modules["cv2"] = fake_cv2` zonder teardown → lek. Een láter draaiende test die torchvision lazy importeert (bv. `generate_embedding`) crasht op `cv2.__spec__ is None` (13.8's test moest daarom eager torchvision importeren).
- Fix is minimaal en gedrag-behoudend voor de bootstrap-tests zelf (de nep-cv2 blijft actief tíjdens de test; alleen teardown + spec toegevoegd).
- [Source: investigation-rgba-goldset-embedding-2026-07-21.md; 13-8-retrospective.md (opvolgpunt); apps/ml-service/tests/unit/test_bootstrap_search_service.py:199,487]

## Dev Agent Record
### Agent Model Used
claude-opus-4-8 (orchestrator-directe implementatie; onafhankelijke review).
### Completion Notes List
- `__spec__` + `monkeypatch.setitem` in beide fixtures (`patched`, `patched_c`).
- **Review-remediatie (bevinding 2):** AC3 was als afgevinkt gepresenteerd zonder achterblijvend bewijs (de probe was een wegwerp-run). Nu structureel opgelost: 13.8's eager-`importorskip("torchvision")`-workaround is verwijderd, waardoor die test de lazy import écht uitoefent en permanent als regressieprobe fungeert. Suite-run als bewijs in de Debug Log.
- **Review-remediatie (bevinding 4):** de comment bij `setitem` nuanceert nu expliciet dat alléén cv2 is opgelost en de `app.*`-stubs nog steeds lekken (bewust buiten scope).
### File List
- Gewijzigd: `apps/ml-service/tests/unit/test_bootstrap_search_service.py`
- Gewijzigd: `apps/ml-service/tests/unit/test_generate_embedding_rgba_13_8.py` (eager-import-workaround verwijderd → is nu de probe)

## Change Log
- 2026-07-22: Story + fix (nazorg #3 uit RGBA-investigation).
