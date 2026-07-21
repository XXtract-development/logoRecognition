# Story 13.8: RGBA-veilige embedding — deblokkeer de regressiepoort

Status: done

<!-- Aangemaakt 2026-07-21 op basis van investigation-rgba-goldset-embedding-2026-07-21.md (BMAD investigate→story). Bugfix op afgeronde Epic 13 (vliegwiel), volgt op 13.7 (uuid-fix). Epic-13 staat al `in-progress`. -->

## Story

Als **datamanager**
wil ik **dat de kwaliteitspoort álle ijk-crops kan inbedden, óók de met-transparantie (RGBA) opgeslagen crops**
zodat **het vliegwiel weer batches kan promoveren in plaats van elke batch fail-closed te quarantaineren op een embedding-fout**.

### Afbakening (kritiek)

- **Kernfix, ml-service-only, gedrag-behoudend voor RGB.** Eén defensieve conversie naar RGB in de centrale embedding-functie. Géén schema-wijziging, géén crop-regeneratie, géén API-wijziging.
- **Root cause is al gelokaliseerd** (zie Dev Notes + `investigation-rgba-goldset-embedding-2026-07-21.md`). De story hoeft niet opnieuw te diagnosticeren.
- **Bewust BUITEN scope (losse opvolgpunten, niet in deze story):**
  1. Waaróm de review-UI menselijk-getekende crops mét alfakanaal opslaat, en of dat upstream al RGB moet worden (verbetering, niet blokkerend — de embed-fix dekt het functioneel af).
  2. De 5 resterende `in_batch`-kandidaten van batch `12e27fbc`, die na de quarantaine in een **gesloten** batch zitten en niet vanzelf herverwerkt worden (`runPromotionLoop` hervat alleen `pending`). Her-nominatie/heropening is een aparte beslissing.
- Deploy naar ACC (en het opnieuw triggeren van de promotielus) is een **ACC-schrijf, gated op expliciete go van Friso** — buiten de code-scope, als verificatietaak.

## Acceptatiecriteria

1. **RGB-veilige centrale embedding.** Given een `PIL.Image` in een niet-RGB-mode (RGBA/LA/P/L/CMYK), when `model_manager.generate_embedding(image)` draait, then wordt het beeld eerst naar RGB geconverteerd vóór de `ToTensor`/`Normalize`-preprocessing, en levert de functie een geldige 512-vector **zonder** de fout *"The size of tensor a (4) must match the size of tensor b (3)"*.
2. **RGB-invoer onveranderd.** Given een beeld dat al RGB is, when het wordt ingebed, then is de uitkomst identiek aan vóór de wijziging (conversie is een no-op op RGB) — geen regressie op de bestaande 235 RGB-gold-set-crops of enige andere aanroeper.
3. **Regressiepoort embedt de volledige gold-set.** Given de actieve crop-niveau-gold-set (250 crops, waarvan 15 RGBA), when `/ml/regression-eval` de query-crops inbedt, then slagen álle 250 embeddings en faalt de meting niet langer fail-closed op de embedding-stap; een batch die de guardrails passeert bereikt een échte regressie-beslissing (promote/quarantine op delta) i.p.v. `systeem-fout`.
4. **Reproducerende test + geen regressie.** Given een pytest die `generate_embedding` op een synthetische RGBA-`PIL.Image` aanroept, when hij op de pre-fix-code zou draaien, then faalt hij met de tensor-mismatch; op de gefixte code slaagt hij (512-vector). En: de volledige ml-service-pytest blijft groen.

## Tasks / Subtasks

- [ ] 1. Fix `generate_embedding` RGB-veilig (AC: 1, 2)
  - [ ] 1.1 In `apps/ml-service/app/ml/model_manager.py::generate_embedding` (rond r.156): vóór de `transforms.Compose`-preprocessing `if image.mode != "RGB": image = image.convert("RGB")`. Centrale plek → dekt álle aanroepers (regression-eval, `similarity.py:42/159/365`, `bootstrap_search.py`, `queue_harvest.py`, `detection.py`).
  - [ ] 1.2 Laat de bestaande per-caller-converts (`detection.py:205`, `similarity.py:273`) staan — ze worden redundant maar zijn een no-op op RGB; niet verwijderen (scope-creep/risk vermijden). Documenteer dat ze nu overbodig zijn.
  - [ ] 1.3 Bevestig dat de mock-/ImportError-tak (torch afwezig → random vector) ongewijzigd blijft.
- [ ] 2. ATDD-test (AC: 4)
  - [ ] 2.1 `apps/ml-service/tests/` — pytest die `generate_embedding` op een synthetische RGBA-`Image.new("RGBA", …)` aanroept en een 512-lange vector zonder error verwacht; plus een RGB-controle (AC 2). Reproduceer eerst RED (pre-fix tensor-mismatch), dan GREEN. Volg het bestaande pure-pytest-patroon (torch nodig voor deze test — of skip-marker conform hoe de suite torch-afhankelijke tests draait; kies consistent met bestaande embedding-tests en documenteer).
- [ ] 3. Volledige suite (AC: 4) — draai de complete ml-service-pytest ná de fix; groen vereist. (apps/api ongewijzigd, maar vitest draaien als sanity.)
- [ ] 4. versions.md (Nederlands, eindgebruikersperspectief, nieuwste bovenaan) in dezelfde commit; Engelse commit + signature/co-author.
- [ ] 5. Deploy & ACC-verificatie (AC: 3) — **ACC-write, pas ná expliciete go van Friso**
  - [ ] 5.1 ghcr-build-workflow ('Build and Push Docker Images') afwachten vóór Coolify-deploy; deploy **ml-service** (de wijziging zit in ml-service).
  - [ ] 5.2 Trigger de promotielus (`flywheel-promotion` op queue `flywheel`) en verifieer read-only dat de regressie-eval nu de volledige gold-set embedt (geen `systeem-fout` op de embedding-stap) en een batch een echte poort-beslissing krijgt. Leg gate_results vast in het Dev Agent Record.

## Dev Notes — Developer Context

### Root cause (bevestigd — zie investigation-rapport)

`model_manager.generate_embedding` (`apps/ml-service/app/ml/model_manager.py:156`) doet `ToTensor()` → `Normalize(mean=[3], std=[3])` zonder RGB-conversie. Een RGBA-beeld → 4-kanaals tensor → `Normalize` eist 3 → *"tensor a (4) must match tensor b (3)"*. De directe endpoints converteren zélf (`detection.py:205`, `similarity.py:273`), maar de **regressie-eval-gold-set-embedding** (`flywheel.py:391-393`: `phash_service.load_image_from_bytes` → `generate_embedding`) niet. Sinds de uuid-fix (13.7) bereikt de lus voor het eerst de regressiepoort, en botst daar op de RGBA-crops.

### Scope-meting (read-only op ACC, 2026-07-21)

Actieve gold-set 462 records; regressie-eval gebruikt `cropOnly:true` (`gate.ts:314` → `gold-set.ts:78` filtert `cropPath NOT NULL`) → 250 crops. Daarvan **235 RGB / 15 RGBA**. De 15 RGBA zijn álle menselijk-geannoteerde `annot_*.png` (review-UI). De 212 `cropPath=NULL`-records zijn bedoelde GTIN-declaratie-ankers (uitgesloten, geen bug).

### Guardrails (voorkom bekende fouten)

- **Centraliseer de conversie in `generate_embedding`** — niet per-caller een pleister; dat is precies de asymmetrie die deze bug veroorzaakte. Eén plek heft de hele foutklasse op.
- **`convert("RGB")` is een no-op op RGB** → AC 2 (RGB-vector bit-identiek). Voor RGBA plat de conversie de alfalaag (PIL: op zwart tenzij achtergrond meegegeven). Voor een keurmerk-crop is dat acceptabel (het logo is het signaal); spot-check dat de similariteit niet materieel verschuift.
- **Geen crops regenereren, geen schema, geen API-wijziging.** De fix deblokkeert bij eval-tijd.
- **Embedding-preprocessing raakt herkenning én flywheel** — deze wijziging maakt eerder-falende embeddings juist succesvol; er worden geen bestaande geslaagde embeddings anders. Let toch op [[project_embedding_rebuild_pitfall]] als er ooit een rebuild volgt.
- Commits Engels; versions.md zelfde commit; ghcr vóór Coolify; deploy ml-service; e2e buiten de stable-subset-gate.

### Testrichtlijnen

- **Pytest (ml-service):** `generate_embedding` op RGBA → 512-vector zonder error (RED→GREEN); RGB-controle (AC 2). Consistent met hoe de suite torch-afhankelijke tests behandelt (venv/skip-marker) — documenteer de keuze.
- **Volledige ml-pytest** groen ná de fix (AC 4).
- E2E/ACC: taak 5 (na go) — regressie-eval embedt volledige gold-set, echte poort-beslissing.

### Project Structure Notes

- Wijziging in `apps/ml-service/app/ml/model_manager.py` + een pytest onder `apps/ml-service/tests/`. Geen apps/api-wijziging.

### References

- [Source: _bmad-output/implementation-artifacts/investigation-rgba-goldset-embedding-2026-07-21.md]
- [Source: apps/ml-service/app/ml/model_manager.py:156 (generate_embedding); app/api/flywheel.py:391-393 (ongeguarde eval-embedding); app/api/detection.py:205, app/services/similarity.py:273 (contrast: wél geconverteerd)]
- [Source: apps/api/src/services/flywheel/gate.ts:314, gold-set.ts:78 (cropOnly-filter)]
- [Source: _bmad-output/implementation-artifacts/13-7-uuid-cast-promotielus-guardrail-queries.md (voorafgaande uuid-fix die deze fase pas bereikbaar maakte)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (implement-sprint, orchestrator-directe implementatie; onafhankelijke adversarial review via aparte subagent).

### Debug Log References

- **RED→GREEN (echte torch-preprocessing, ml-image `logo-recognition-ml:0db627e`):** pre-fix `model_manager.py` → `test_generate_embedding_accepts_rgba` + `..._palette_and_grayscale` FAIL met `RuntimeError: output with shape [1/4,224,224] doesn't match the broadcast shape [3,224,224]` (exact de eval-blocker), RGB-test passeert. Post-fix → 3/3 groen.
- **Volledige suite baseline-differential (zelfde ml-image):** origineel zónder mijn test = 184 passed / 1 failed / 14 skipped; gefixt mét mijn 3 tests = **187 passed / 1 failed / 14 skipped**. Netto: +3 groen, 0 regressie.
- **Die ene failure + 3 collection-errors zijn pré-existent & omgevings-only** (draaien in het PROD-image dat `scripts/`, `requirements.txt` en de test-padstructuur niet meelevert): `test_phash_service::...imagehash_gepind` (leest `/app/requirements.txt`), `test_correct_nutriscore_labels`/`test_restore_recyclable_refs_19_13` (`import scripts`), `test_no_node_content_hash` (`parents[4]`-padaanname). Alle vier falen op ontbrekende bestanden/paden, niet op `model_manager`; bewezen identiek in de baseline. Sluit aan op de bekende "6 pre-existing collection-errors"-baseline.
- **apps/api ongewijzigd** t.o.v. origin/acc (was 960 vitest groen); niet opnieuw gedraaid.

### Completion Notes List

1. **Kernfix (AC 1/2):** één centrale RGB-cast bovenaan `generate_embedding` (`model_manager.py`), vóór de torch-preprocessing. Dekt álle aanroepers; no-op op RGB (bit-identiek). De bestaande per-caller-converts (`detection.py:205`, `similarity.py:273`) bewust laten staan (nu redundant, geen risico).
2. **Test-volgorde-robuustheid:** de ATDD-test importeert torchvision **eager** op collection-tijd (`pytest.importorskip("torchvision")`). Zónder dat trapte de lazy `from torchvision import transforms` ín `generate_embedding` tijdens de test over een door een ándere suite-test in `sys.modules` geïnjecteerde nep-`cv2` (zonder `__spec__`) → `ValueError: cv2.__spec__ is None` (volgorde-afhankelijke flakiness, pré-existente test-isolatie-zwakte in de suite, niet in productie). Eager laden cachet torchvision schoon → test deterministisch groen in de volledige suite. De onderliggende cv2-`sys.modules`-pollutie in andere tests is een aparte, kleine test-hygiëne-opvolging (niet in scope).
3. **AC 3 (ACC-verificatie):** gated op go Friso — deploy ml-service + promotielus opnieuw triggeren; nog niet uitgevoerd.

### File List

**Gewijzigd (apps/ml-service):**
- `app/ml/model_manager.py` — RGB-cast in `generate_embedding` (AC 1/2).

**Nieuw (apps/ml-service):**
- `tests/unit/test_generate_embedding_rgba_13_8.py` — ATDD (RGBA/P/L/LA → 512-vector; RGB-controle; volgorde-robuust).

**Gewijzigd (root/bookkeeping):**
- `versions.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, deze story.

**Artefacten:** `investigation-rgba-goldset-embedding-2026-07-21.md` (bron), `review-13-8.md` (adversarial).

## Change Log

- 2026-07-21: Story aangemaakt op basis van de RGBA-investigation. Root cause al gelokaliseerd (generate_embedding niet RGB-veilig; 15 RGBA gold-set-crops). Twee bijzaken bewust als losse opvolgpunten buiten scope gehouden.
