# Adversarial Review — Story 13.8 (RGBA-veilige embedding)

```
reviewed_commit: d11d8f1
verdict: PASS
```

Onafhankelijke adversariële review (BMAD fase F). Statisch geverifieerd tegen de diff `origin/acc..HEAD`, de gewijzigde functie, alle `generate_embedding`-callers en de overige preprocessing-paden. De ATDD-test is niet opnieuw in het ml-image gedraaid (optioneel); het RED→GREEN-bewijs in het Dev Agent Record is intern consistent met de code.

## Bevindingen

- `apps/ml-service/app/ml/model_manager.py:176-177` — RGB-cast staat na de `embedding_model is None`-check en vóór de torch-`try`; op RGB slaat de `if image.mode != "RGB"` volledig over → RGB-object onaangeraakt, dus AC2 bit-identiek gegarandeerd door constructie (geen bevinding, positief). — informational
- `model_manager.py:176` — RGBA→RGB comprimeert de alfalaag op zwart (PIL-default); voor een keurmerk-crop semantisch acceptabel maar níét noodzakelijk optimaal. Bewust als opvolgpunt buiten scope gehouden in de story; AC eist alleen een geslaagde embedding, niet semantische gelijkheid. — low
- `model_manager.py:176` — `convert("RGB")` dekt RGBA/LA/P/L/CMYK; exotische modes (`I;16`, `F`) kan PIL niet altijd naar RGB casten. Niet in de gold-set en buiten AC1-scope; geen echte blootstelling. — low
- `model_manager.py:176` — `image.mode` op een niet-PIL-invoer zou een `AttributeError` geven, maar dat was pré-existent gedrag (oude code brak alsnog in `preprocess`); geen materiële regressie. — low
- `test_generate_embedding_rgba_13_8.py:63-68` — RGB-controletest assert alleen `shape == 512`, niet numerieke gelijkheid t.o.v. pre-fix. Bit-identiteit is structureel gegarandeerd door de `mode != "RGB"`-guard, dus geen extra assertie strikt nodig. — low

Geen bevindingen ≥ medium.

## Verificatie kernclaims

- **Centrale plek dekt alle aanroepers:** bevestigd. Alle 14 `generate_embedding`-callsites (detector, detection-endpoint, `flywheel.py:393` [de bug-site], similarity ×4, bootstrap ×3, queue_harvest ×4, classification) lopen door de gefixte functie. Het enige andere ToTensor/Normalize-pad (`trainer.py`) is een aparte trainingsflow die zelf al `.convert("RGB")` doet (r.231/455) en buiten de regressie-eval valt. Geen omzeilende caller.
- **No-op op RGB:** de guard skipt de conversie volledig voor RGB → hetzelfde object bereikt `preprocess`. Correct.
- **Mock/ImportError-tak ongewijzigd:** de convert draait vóór de torch-`try` (alleen PIL, geen torch); de ImportError-tak retourneert nog steeds `np.random.randn(512)` ongeacht de invoer. Geen gedragswijziging.
- **Test exerciseert de echte preprocessing:** de stub-embedding-model (`torch.zeros(N,512)`) wordt pas ná `preprocess(image)` aangeroepen; de bug zit in `ToTensor`→`Normalize` (vóór het model), dus de RED-fout treedt op met de echte torchvision-transforms, niet in de mock-tak. Geldige testopzet.
- **`importorskip("torchvision")` eager:** legitieme volgorde-onafhankelijkheid — laadt torchvision schoon vóór een andere suite-test een `__spec__`-loze nep-`cv2` in `sys.modules` injecteert. Maskeert geen productieprobleem (de lazy import in productie draait niet ná zo'n test-pollutie). De onderliggende cv2-`sys.modules`-pollutie bewust buiten scope; acceptabele afbakening (test-hygiëne, geen productie-impact).
- **Scope/diff schoon:** 6 bestanden, +261/-0. Alleen `model_manager.py` (10 regels) + nieuwe test als code; rest is bookkeeping (story, investigation, sprint-status, versions.md). Geen schema/API-wijziging, geen debug/dode code, geen ongewenste bestanden.

## Acceptance-audit

- **AC1 — RGB-veilige centrale embedding:** GEDEKT. `if image.mode != "RGB": image.convert("RGB")` vóór `transforms.Compose`. Test `test_generate_embedding_accepts_rgba` + `..._palette_and_grayscale` (RGBA/P/L/LA) bewijzen een 512-vector zonder tensor-mismatch.
- **AC2 — RGB-invoer onveranderd:** GEDEKT. Guard skipt conversie op RGB → bit-identiek per constructie; `test_generate_embedding_rgb_unchanged` bevestigt functioneel.
- **AC3 — regressiepoort embedt volledige gold-set:** GEDEKT op code-niveau (bug-site `flywheel.py:393` loopt nu door de RGB-veilige functie). End-to-end ACC-verificatie (deploy ml-service + promotielus) is expliciet gated op go van Friso en als losse verificatietaak gemarkeerd — geen code-deliverable, geen falen.
- **AC4 — reproducerende test + geen regressie:** GEDEKT. RED→GREEN met echte torch-preprocessing gedocumenteerd; suite-differential +3 groen / 0 regressie (187 vs 184 passed, dezelfde 1 pré-existente env-only failure). Statisch consistent; niet her-uitgevoerd (optioneel).

## Verdict

**PASS.** De fix is correct, minimaal, centraal geplaatst en gedrag-behoudend op RGB. De test bewijst de bug via de echte preprocessing (geen mock-tak). Uitsluitend low/informational bevindingen, allemaal bewust-afgebakende opvolgpunten. Geen wijziging vereist voor merge. Enige openstaande stap is de gated ACC-deploy/verificatie (AC3-runtime), conform story.
