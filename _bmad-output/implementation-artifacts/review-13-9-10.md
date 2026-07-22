# Adversariële review — Story 13.9 + 13.10 (RGBA-nazorg)

```yaml
reviewed_commit: d4b0b7a
branch: epic/vliegwiel-13-9-10-nazorg
base: origin/acc
verdict: FAIL
severity_count: {critical: 0, high: 0, medium: 2, low: 6}
```

## Wat is onafhankelijk geverifieerd (niet uit de story overgenomen)

| Verificatie | Methode | Uitkomst |
|---|---|---|
| `removeAlpha()` dropt alfa zónder compositing | sharp 0.33.5, RGBA-bron `rgba(200,30,30,0.5)` door exact de productie-pijplijn | out = 3 kanalen, `hasAlpha=false`, pixel = **200,30,30** → identiek aan PIL `convert("RGB")` |
| No-op op RGB-bron | idem, RGB-bron `(10,20,30)` | 3 kanalen, pixel **10,20,30** ongewijzigd |
| Grayscale(+alfa)-bron | b-w 1ch en b-w+alfa 2ch | mét removeAlpha 3ch / zónder removeAlpha 4ch → removeAlpha dropt uitsluitend de alfaband; de b-w→sRGB-promotie komt van de PNG-encoder en bestond al |
| CMYK-bron | libvips `vips_image_hasalpha`: 4 banden mét interpretatie CMYK ⇒ géén alfa | removeAlpha is no-op, geen kanaalverlies |
| api-suite regressie | `npx vitest run` in de worktree (node_modules gesymlinkt) | **962 pass / 0 fail** |
| Nieuwe vitest-test draait groen | idem | 2/2 pass |
| `spec_from_loader("cv2", loader=None)` | Python 3, `find_spec("cv2")` na injectie | geeft `ModuleSpec(name='cv2', loader=None)`; `find_spec` crasht niet meer |
| `monkeypatch.setitem` herstelt afwezige key | `inspect.getsource(MonkeyPatch.undo)` (pytest 9.0.3) | `value is notset` ⇒ `del dictionary[key]` — dus ook correct als cv2 vóór de test afwezig was |
| ml-suite draaien | — | **NIET mogelijk in deze omgeving** (geen numpy/venv). AC3 van 13.10 is dus niet empirisch bevestigd. |

## Bevindingen

1. `apps/api/src/__tests__/services/artwork-crop-rgb-13-9.test.ts:13-19` — de test herimplementeert de sharp-pijplijn lokaal i.p.v. de productiecode aan te roepen; `.removeAlpha()` uit `artwork-pipeline.ts` verwijderen laat deze test groen → nul regressiebescherming — **medium**
2. `_bmad-output/implementation-artifacts/sprint-status.yaml:178` — claimt "no-eager probe groen in volledige suite" terwijl story-task 3 onafgevinkt is, er geen probe-artefact in de diff zit en 13.8's `pytest.importorskip("torchvision")` (de eager-workaround) nog gewoon in de repo staat → AC3 als afgevinkt gepresenteerd zonder bewijs — **medium**
3. `apps/api/src/__tests__/services/artwork-crop-rgb-13-9.test.ts:29-31,40-41` — alleen `channels`/`hasAlpha` worden geassert; de kern van AC2 (RGB-waarden ongewijzigd, embedding-identiek aan PIL) wordt door geen enkele assert bewaakt (klopt feitelijk, maar breekt stil bij een sharp-upgrade naar compositing-gedrag) — **low**
4. `apps/ml-service/tests/unit/test_bootstrap_search_service.py:160-176,467-483` — `app.services.classification/keurmerk_gate/region_proposer/storage` en `app.ml.model_manager` worden nog steeds via directe `sys.modules[...] =` geïnjecteerd zonder teardown; die nep-modules overschaduwen na afloop de échte modules voor later gecollecteerde tests. Pre-existing en expliciet out-of-scope verklaard, maar de "geen sys.modules-vervuiling"-comment op r.203/497 overdrijft wat is opgelost — **low**
5. `commit d4b0b7a` — commit-body bevat geen `Co-Authored-By`-regel; in strijd met de commit-standaard (Engels is wél correct) — **low**
6. `_bmad-output/implementation-artifacts/13-9-annot-crops-als-rgb-opslaan.md:24` — task 3 (`versions.md; Engelse commit`) staat op `[ ]` terwijl versions.md is bijgewerkt en de commit Engels is; alleen de deploy is nog open — checkbox is misleidend — **low**
7. `_bmad-output/implementation-artifacts/sprint-status.yaml:175` — de 13.8-regel is in deze commit herschreven naar "GEDEPLOYED+LIVE (b013797)"; dat valt buiten de scope van 13.9/13.10, en `b013797` is de docs-commit, niet de codefix (`d11d8f1`) — **low**
8. `apps/api/src/api/v1/reference-logos.ts:125` — referentie-logo's worden nog steeds als ruwe (mogelijk RGBA) upload opgeslagen; de story-belofte "downstream struikelt nooit meer op een alfakanaal" is breder dan de fix. Niet-blokkerend (13.8 vangt af bij embed-tijd), maar de formulering overreikt — **low**

Geen debug-code, geen ongewenste bestanden: de diff is exact 7 bestanden, alle relevant; worktree schoon.

## Acceptance-audit

### Story 13.9

| AC | Oordeel | Bewijs |
|---|---|---|
| **AC1** RGBA-bron → opgeslagen `annot_*.png` heeft exact 3 kanalen | **gedeeltelijk gedekt** | Gedrag zelfstandig bevestigd (RGBA-bron door de productie-pijplijn → 3 kanalen, `hasAlpha=false`). Code-wijziging op `artwork-pipeline.ts:1256-1260` is correct. Maar de AC-formulering is "when een reviewer een crop opslaat" — de route `POST /review-items/:id/annotate` wordt door geen enkele test met een RGBA-bron doorlopen. Terwijl de haak bestaat: `flywheel-review-redirect.routes.test.ts:121-145` roept exact die route al aan met een echte sharp-buffer en gemockte upload — daar had de crop-buffer op 3 kanalen geassert kunnen worden. → bevinding 1. |
| **AC2** RGB-behoud + embedding-consistentie met PIL `convert("RGB")` | **feitelijk waar, niet getest** | Zelf gemeten: RGBA `(200,30,30,α=0.5)` → `(200,30,30)`; RGB-bron ongewijzigd. Geen compositing, dus embedding-identiek aan `PIL.convert("RGB")`. De testsuite assert dit nergens → bevinding 3. Rand: 16-bit RGBA-bron blijft 16-bit RGB, waar PIL bij inlezen naar 8-bit gaat — theoretische afwijking, pre-existing (`.png()` behield de diepte al), niet blokkerend. |

### Story 13.10

| AC | Oordeel | Bewijs |
|---|---|---|
| **AC1** geldige `__spec__` op de nep-cv2 | **gedekt** | `importlib.util` is top-level geïmporteerd (r.19); `spec_from_loader("cv2", loader=None)` levert een echte `ModuleSpec` (zelf uitgevoerd), en `find_spec("cv2")` geeft die terug i.p.v. `ValueError: cv2.__spec__ is None`. Toegepast in béide fixtures (r.183, r.487). |
| **AC2** geen lek — cv2 hersteld na de test | **gedekt** | `monkeypatch` is fixture-parameter in zowel `patched` (r.135) als `patched_c` (r.431); `MonkeyPatch.undo` (pytest 9.0.3, broncode gelezen) doet `del sys.modules["cv2"]` als de key vooraf ontbrak en herstelt anders de oude waarde. De nep blijft tíjdens de test actief (setitem zet direct), dus het bootstrap-gedrag is ongewijzigd; de bestaande in-place mutaties op r.278-279/319 blijven werken. |
| **AC3** geen regressie + lazy-torchvision-test slaagt zónder eager-import-workaround | **niet gedekt / onbewezen** | ml-suite lokaal niet draaibaar (geen numpy). Task 3 staat op `[ ]`. `apps/ml-service/tests/unit/test_generate_embedding_rgba_13_8.py:23-29` bevat nog steeds de eager `pytest.importorskip("torchvision")`-workaround; de "zónder workaround"-probe is niet in de repo achtergebleven. sprint-status claimt hem tóch groen → bevinding 2. |

## Wat moet wijzigen vóór PASS

1. **(bevinding 1)** Laat de 13.9-test de productiecode raken: breid `flywheel-review-redirect.routes.test.ts` (of een nieuwe route-test) uit met een RGBA-bronbuffer via `downloadTrainingObject`, en assert op de buffer die aan `uploadReferenceLogo` wordt meegegeven: `(await sharp(buf).metadata()).channels === 3`. De huidige spiegel-test mag blijven als documentatie, maar telt niet als dekking.
2. **(bevinding 2)** Kies één van beide en maak het consistent:
   - laat de no-eager-probe als test in de repo achter (bv. `test_lazy_torchvision_no_eager.py`) en verwijder de eager `pytest.importorskip("torchvision")` uit `test_generate_embedding_rgba_13_8.py`, met een suite-run als bewijs; **óf**
   - haal de claim uit `sprint-status.yaml:178` en noteer AC3 expliciet als "nog te verifiëren" zolang task 3 open staat.

## Aanbevolen (niet blokkerend)

- Bevinding 3: één extra assert op de RGB-pixelwaarden (`.raw().toBuffer()` → `[200,30,30]`) om AC2's kern te borgen.
- Bevinding 4: comment op r.203/497 nuanceren ("cv2 lekt niet meer; de app.*-stubs nog wél — bewust buiten scope").
- Bevindingen 5-7: commit amenden met `Co-Authored-By`, task 3 van 13.9 afvinken op alles behalve deploy, en de 13.8-statusregel corrigeren naar de codefix-commit `d11d8f1`.
