# Adversariële review — Story 13.9 + 13.10 (RGBA-nazorg) — RE-REVIEW na remediatie

```yaml
reviewed_commit: ab45ab3
previous_review: d4b0b7a (verdict FAIL — 2 medium, 6 low)
branch: epic/vliegwiel-13-9-10-nazorg
base: origin/acc
verdict: PASS
severity_count: {critical: 0, high: 0, medium: 0, low: 4}
```

De twee blokkerende bevindingen zijn **structureel** opgelost (niet cosmetisch weggeschreven), en
één eerdere bevinding was **mijn fout** — dat wordt hieronder eerlijk teruggedraaid.

## Wat is in deze re-review onafhankelijk uitgevoerd

| Verificatie | Methode | Uitkomst |
|---|---|---|
| Nieuwe route-test draait groen | `npx vitest run src/__tests__/api/flywheel-review-redirect.routes.test.ts` (node_modules gesymlinkt) | **4 pass / 0 fail** (3 bestaande + 1 nieuwe) |
| **RED-claim gereproduceerd** | `.removeAlpha()` fysiek uit `artwork-pipeline.ts:1258` verwijderd, testfile opnieuw gedraaid | **3 pass / 1 FAIL** — `AssertionError: expected 4 to be 3` op r.175. Productiecode daarna hersteld (`git status` schoon). |
| Volledige api-suite | `npx vitest run` in `apps/api` | **961 pass / 0 fail** (was 962; −2 verwijderde spiegel-tests, +1 route-test) |
| Typecheck api | `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| Mock-index `calls[0][0]` correct | `grep uploadReferenceLogo apps/api/src/api/v1/artwork-pipeline.ts` → precies **één** aanroep (r.1263) in het annotate-pad; `vi.clearAllMocks()` in `beforeEach` (r.54) | geen eerdere upload-call mogelijk; empirisch bevestigd door de RED-run (die las de júiste buffer: 4 kanalen) |
| Co-Authored-By in `d4b0b7a` | `git cat-file commit d4b0b7a` + `git log -1 --format='%(trailers:key=Co-Authored-By)'` | **trailer is aanwezig** → bevinding 5 was géén defect (zie hieronder) |
| Co-Authored-By in `ab45ab3` | idem | aanwezig |
| Andere spec-loze cv2-stubs in de ml-suite | `grep -rn 'ModuleType("cv2")' / 'sys.modules["cv2"]' over tests/` | `test_queue_harvest_19_10.py:103` en `test_queue_harvest_declared_20_2.py:56` maken óók een bare stub, maar registreren die via `monkeypatch.setitem` → **lekken niet**. `test_nutriscore_*` zetten de **echte** cv2 terug (heeft spec). De enige lekkende bron was bootstrap — die is gedicht. |
| Collectievolgorde van de probe | alfabetisch binnen `tests/unit/`: `test_bootstrap_search_service.py` < `test_generate_embedding_rgba_13_8.py` | vervuiler draait vóór de probe ⇒ probe is effectief in de standaardvolgorde (zie N3) |
| ml-suite draaien | geen numpy/torch/torchvision beschikbaar (python3, python3.11, geen venv, geen container) | **opnieuw niet mogelijk**; AC3's suite-cijfer blijft niet-reproduceerbaar in deze omgeving (zie N4) |

## Status van de 8 eerdere bevindingen

| # | Sev (was) | Status | Bewijs |
|---|---|---|---|
| **1** | medium | **OPGELOST** | Spiegel-test `artwork-crop-rgb-13-9.test.ts` is verwijderd (−44 regels). Vervangen door `apps/api/src/__tests__/api/flywheel-review-redirect.routes.test.ts:151-178`, die de échte Fastify-handler via `app.inject('POST …/annotate')` draait en assert op `(uploadReferenceLogo as any).mock.calls[0][0]`. Ik heb de RED-claim **zelf gereproduceerd**: zonder `.removeAlpha()` faalt de test met `expected 4 to be 3`. Dit is echte regressiebescherming. |
| **2** | medium | **OPGELOST** | Optie 1 uit het vorige rapport is gekozen én consequent doorgevoerd: `pytest.importorskip("torchvision")` is uit `test_generate_embedding_rgba_13_8.py:22-28` verdwenen, waardoor die drie tests de lazy `from torchvision import transforms` (`model_manager.py:181`) écht uitoefenen en permanent als pollutieprobe in de repo staan. `sprint-status.yaml:180` claimt niet langer een wegwerp-probe maar beschrijft de structurele situatie. De claim is nu falsifieerbaar door de suite zelf i.p.v. door een verdwenen run. |
| **3** | low | **OPGELOST** | `flywheel-review-redirect.routes.test.ts:176-177`: `sharp(uploaded).raw().toBuffer()` → `expect([data[0],data[1],data[2]]).toEqual([200,30,30])`. Dit bewaakt AC2's kern (alfa droppen zónder compositing); bij een sharp-upgrade naar compositing-gedrag wordt de test rood i.p.v. stil fout. |
| **4** | low | **OPGELOST** | `test_bootstrap_search_service.py:202-204` en `498-500`: de comment stelt nu expliciet dat alléén cv2 is gedicht en dat de `app.*`-stubs nog steeds lekken (bewust buiten scope). Geen overclaim meer. |
| **5** | low | **WAS GEEN DEFECT — mijn fout** | `git cat-file commit d4b0b7a` toont regel 23 van de body: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`, en `--format='%(trailers:key=Co-Authored-By)'` resolvet hem. De auteur heeft gelijk. Oorzaak van de valse melding: de git-proxy in deze omgeving levert bij `git log --format=%B | grep` een afgekapt/gefilterd resultaat (`grep -c` geeft nog steeds 0 terwijl `tail -3` de trailer wél toont) — een omgevings-artefact, geen commit-defect. Les: trailers uitsluitend via `git cat-file commit` of `%(trailers:…)` beoordelen. |
| **6** | low | **OPGELOST** | `13-9-…md:22-26`: taak 3 (versions.md + Engelse commit met co-author) staat op `[x]`, de deploy is afgesplitst naar taak 4 en staat als enige nog op `[ ]` — wat de werkelijkheid is (deploy gated op go Friso). |
| **7** | low | **OPGELOST** | `sprint-status.yaml:177-178` citeert nu de codefix-commits `8d980e1` (13.7) en `d11d8f1` (13.8) i.p.v. de docs-commit `b013797`. Beide hashes geverifieerd tegen `git log`: het zijn inderdaad de `fix(…)`-commits. |
| **8** | low | **OPGELOST** | `13-9-…md:16` verklaart `apps/api/src/api/v1/reference-logos.ts` expliciet buiten scope en de story-belofte op r.11 is versmald van "downstream struikelt nooit meer op een alfakanaal" naar "deze crops … belanden niet langer met een alfakanaal in de opslag". De formulering overreikt niet meer. |

## Nieuwe bevindingen (alle low — niet blokkerend)

1. `_bmad-output/implementation-artifacts/13-10-cv2-test-isolatie-hygiene.md:26` — taak 4 en de completion note verwijzen naar bewijs "in de Debug Log", maar de story bevat geen Debug Log-sectie; het suite-cijfer (179 passed) staat alléén in de commit-body van `ab45ab3` — **low**
2. `apps/ml-service/tests/unit/test_generate_embedding_rgba_13_8.py:22` — zonder `importorskip("torchvision")` falen deze 3 tests hard (i.p.v. skip) in een omgeving mét torch maar zónder torchvision; risico klein omdat `requirements.txt:16-17` beide samen pint, maar de skip-vangnet-asymmetrie met `torch` is nu onbedoeld — **low**
3. `apps/ml-service/tests/unit/test_generate_embedding_rgba_13_8.py:23-28` — de probe detecteert pollutie alleen als de vervuilende test eerder draait; dat berust op de alfabetische collectievolgorde (`test_bootstrap_…` < `test_generate_…`) en is nergens afgedwongen of gedocumenteerd. Bij random test-ordering of een hernoeming valt de dekking stil weg — **low**
4. `commit ab45ab3` — het ml-suite-cijfer daalt van 182 (`d4b0b7a`) naar 179 zonder toelichting; plausibel verklaard door het wegvallen van het wegwerp-probebestand (3 tests), maar dat staat nergens vastgelegd en is in deze omgeving niet reproduceerbaar (geen torch/numpy) — **low, traceerbaarheid**

Geen scope-overschrijding in de remediatie-diff: 8 bestanden, alle terug te voeren op een concrete bevinding.
Geen debug-code, geen ongewenste bestanden, worktree schoon. De 3 bestaande tests in
`flywheel-review-redirect.routes.test.ts` (19.12) zijn ongewijzigd en blijven groen.

## Acceptance-audit

### Story 13.9

| AC | Oordeel | Bewijs |
|---|---|---|
| **AC1** RGBA-bron → opgeslagen `annot_*.png` heeft exact 3 kanalen | **GEDEKT** | Productiecode `artwork-pipeline.ts:1256-1260` voegt `.removeAlpha()` toe vóór `.png()`. De AC-formulering ("when een reviewer een crop opslaat") wordt nu op routeniveau uitgeoefend: `POST /api/v1/artwork/review-items/:id/annotate` met een RGBA-bron via `downloadTrainingObject`, assert `channels === 3` en `hasAlpha === false` op de buffer die naar `uploadReferenceLogo` gaat. RED-check zelf uitgevoerd: zonder de fix rapporteert de test 4 kanalen. |
| **AC2** RGB-behoud + embedding-consistentie met PIL `convert("RGB")` | **GEDEKT** | Pixelassert `[200,30,30]` op de daadwerkelijk geüploade crop bewijst dat de alfaband wordt gedropt zónder compositing (compositing op wit zou ~`227,142,142` geven) — identiek aan `PIL.convert("RGB")`, dus embedding-identiek aan 13.8's live-conversie. De no-op op een RGB-bron blijft gedekt door de bestaande 19.12-annotate-test (RGB-bron, route slaagt) plus de sharp-metingen uit de eerste review. Rand blijft: een 16-bit RGBA-bron blijft 16-bit RGB waar PIL naar 8-bit gaat — pre-existing (`.png()` behield de diepte al), niet blokkerend. |

### Story 13.10

| AC | Oordeel | Bewijs |
|---|---|---|
| **AC1** geldige `__spec__` op de nep-cv2 | **GEDEKT** | `importlib.util` top-level (r.18); `fake_cv2.__spec__ = importlib.util.spec_from_loader("cv2", loader=None)` in béide fixtures (r.185 `patched`, r.491 `patched_c`). Eerder zelf uitgevoerd: dit levert een echte `ModuleSpec`, waarna `find_spec("cv2")` niet meer op `ValueError: cv2.__spec__ is None` klapt. |
| **AC2** geen lek — cv2 hersteld na de test | **GEDEKT** | `monkeypatch.setitem(sys.modules, "cv2", fake_cv2)` in beide fixtures (r.207, r.503); `MonkeyPatch.undo` verwijdert de key als die vooraf ontbrak en herstelt hem anders. De in-place `imdecode`-mutaties op r.281/321 raken de fake (die tijdens de test in `sys.modules` staat) en niet de echte cv2 — die fake wordt per test opnieuw gebouwd, dus ook daar geen residu. |
| **AC3** geen regressie + lazy-torchvision-test slaagt zónder eager-import-workaround | **GEDEKT (structureel); suite-cijfer niet reproduceerbaar** | De workaround is daadwerkelijk verwijderd, en `generate_embedding` importeert torchvision aantoonbaar lazy (`model_manager.py:181`) — de test oefent die import dus echt uit en is nu de permanente probe die AC3 bewaakt. Ik heb bovendien geverifieerd dat er geen andere lekkende spec-loze cv2-stub in de suite meer bestaat. Wat ik **niet** kan bevestigen is de telling "179 passed / 0 failed": in deze omgeving ontbreken numpy/torch/torchvision (zie N4). Dat is een omgevingsbeperking, geen aanwijzing voor een defect — de eerdere reden voor medium (onbewijsbare claim zónder achterblijvend artefact) is weggenomen doordat het bewijs nu in de repo staat. |

## Conclusie

**PASS.** Beide blokkerende bevindingen zijn bij de wortel opgelost: de 13.9-test raakt nu
aantoonbaar de productiecode (RED-check door mij gereproduceerd) en 13.10's AC3 wordt niet meer
door een verdwenen run gedragen maar door een permanente probe in de suite. Bevinding 5 was een
onterechte melding van mijn kant; dat is hierboven rechtgezet. De vier resterende punten zijn
documentatie-/robuustheidsnuances zonder gedragsrisico.

Rest-actie buiten deze review: de deploy van `apps/api` (13.9) staat nog open en blijft gated op
expliciete go.
