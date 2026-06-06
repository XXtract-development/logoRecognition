# Story 8.2: PDF-artwork rasterization

Status: done

## Story

As a datamanager,
I want dat PDF-artwork automatisch wordt omgezet naar hoogresolutie-afbeeldingen,
so that de ~8.000 PDF-etiketten dezelfde pipeline in kunnen als JPG/PNG-artwork.

## Acceptance Criteria

1. **Per-pagina rasterization (FR45):** Given een gecachet PDF-artworkbestand, When de rasterization-stap draait, Then wordt elke pagina gerasterized naar een afbeelding met configureerbare DPI (default 300) en opgeslagen naast het origineel And wordt de paginarelatie vastgelegd (bestand X, pagina N).
2. **Zacht falen:** Given een corrupt of wachtwoord-beveiligd PDF, When rasterization faalt, Then wordt het item gemarkeerd met foutreden en telt het niet als pipeline-fout.

## Tasks / Subtasks

- [x] Task 1: Python-module `apps/ml-service/app/services/artwork.py` (AC: 1, 2)
  - [x] **ATDD-contract (test_artwork_processing.py — exact volgen):**
    - `rasterize_pdf(path, dpi=300) -> list[dict]` met per pagina `{ "source_file": <eindigt op bronbestandsnaam>, "page": int, "image_path": "....png", "dpi": int }`
    - Corrupt/beveiligd PDF → `[]` óf lijst van dicts met `"error"`-key — NOOIT raisen
  - [x] Library: **PyMuPDF (fitz)** — toegevoegd aan `apps/ml-service/requirements.txt` (regel 35)
  - [x] Output-PNG's naast het origineel in MinIO (`artwork/{gtin}/{fileName}.page-{n}.png`) via `storage_service` — endpoint `POST /ml/artwork/rasterize` + nieuwe `storage_service.put_training_image`
- [x] Task 2: Integratie in de import-flow (AC: 1)
  - [x] Na succesvolle import (8.1): als extensie .pdf → rasterization-stap (`isPdf`-detectie); paginarelatie vastgelegd in `ArtworkImport.pages` (Json-object `{ dpi, pages: [{page, imagePath}], error? }`, direct aan Prisma-Json — nooit str()). Rasterize draait BUITEN de import-try/catch → een rasterize-fout markeert het item NIET failed (AC2)
  - [x] DPI configureerbaar via env `ARTWORK_RASTER_DPI` (default 300) — ml-service `DEFAULT_DPI` + api `ARTWORK_RASTER_DPI`
- [x] Task 3: Tests groen (alle ACs)
  - [x] `@pytest.mark.skip` reeds verwijderd; 2 ATDD-tests groen (en de fixtures bestaan)
  - [x] Test-fixtures: `tests/fixtures/two-page-label.pdf` + `tests/fixtures/corrupt.pdf` aanwezig; gegenereerde `*.page-*.png` staan in `.gitignore`
  - [x] Endpoint-tests toegevoegd (echt, niet-gemockt op rasterize_pdf): upload+MinIO-keys, soft-fail corrupt (200, geen 422), storage-fout → 422
  - [x] Vitest: rasterizeImportedPdf paginarelatie, soft-fail blijft imported, corrupt-doorgifte, JPG wordt NIET gerasterized

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Vereist Story 8.1** (gecachete bestanden + ArtworkImport-tabel). Pure functie-laag kan parallel ontwikkeld worden met fixtures.
- **Vectordata-kans (research-addendum):** PDF's zijn vector-artwork — keurmerken zitten er soms als ingesloten object in. Buiten scope van deze story, maar log per PDF of er embedded images zijn (`page.get_images()`) als gratis signaal voor later.
- **Geheugen:** raster per pagina streamen (pixmap → bytes → MinIO → release), niet alle pagina's in geheugen houden; sommige etiket-PDF's zijn groot (300 DPI A3 ≈ 35MP).
- **ML-service blijft REST** — de rasterization draait ín de ML-service (Python heeft de PDF-libs), aangeroepen vanuit de import-flow via een intern endpoint `POST /ml/artwork/rasterize` (body: storage_path, dpi) → response: pages-lijst. Volg endpoint-stijl van `app/api/training.py` incl. nette 4xx (HoldoutSetTooSmallError-patroon uit Epic 7: specifieke exception → HTTPException 422).

### Web-research (PyMuPDF, geverifieerd 2026-06)

- PyMuPDF (`pip install PyMuPDF`, import `fitz`) is de snelste maintained PDF-rasterizer voor Python; `page.get_pixmap(dpi=300)` → PNG-bytes via `pix.tobytes("png")`
- Wachtwoord-detectie: `doc.needs_pass` → behandel als corrupt-pad (AC 2)
- Licentie AGPL — intern gebruik OK (geen distributie); alternatief pdf2image+poppler is trager en vereist systeembinary in het Docker-image. Bij licentiebezwaar: pdf2image, en poppler-utils aan `apps/ml-service/Dockerfile` toevoegen

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/ml-service/app/services/storage.py` | get/put-conventies MinIO |
| `apps/ml-service/app/api/training.py` (Epic 7-versie) | endpoint + specifieke-exception→HTTPException-patroon |
| `apps/ml-service/app/services/trainer.py` (kop) | module-level constanten-patroon (IMAGE_SIZE e.d.) |

### Project Structure Notes

- Nieuw: `app/services/artwork.py` + endpoint in nieuw `app/api/artwork.py` (router registreren in main.py naast bestaande routers)
- requirements.txt-wijziging ⇒ Docker-image rebuild op deploy (geen verdere actie, Coolify bouwt lokaal)

### References

- [Source: epics.md#Story 8.2] · [Source: atdd-checklist-epic-8-9.md] · [Source: research-addendum — PDF-rasterize + vector-extractie-kans] · [Source: 8-1 story — ArtworkImport-tabel]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (remediation-agent — voltooit ontbrekende scope: endpoint + import-integratie)

### Completion Notes List

- `rasterize_pdf` (Task 1 kern) was al aanwezig en groen; remediatie voegde de ontbrekende endpoint + import-integratie toe.
- Intern endpoint `POST /ml/artwork/rasterize`: haalt PDF uit training-bucket, rasterized, upload page-PNG's terug, geeft MinIO-object-keys terug (niet de tijdelijke temp-paden). Storage-/fetch-fout → HTTP 422 (training.py-contract); corrupt/leeg/beveiligd PDF → 200 met lege pages + `error`-reden (zacht falen, AC2).
- Import-flow: PDF-detectie op extensie/mimetype; rasterize draait BUITEN de import-try/catch zodat een rasterize-fout `failedCount` niet verhoogt en de item-status niet op `failed` zet (AC2). Paginarelatie als Json-object op `ArtworkImport.pages`.
- Nieuwe `storage_service.put_training_image` toegevoegd (er was alleen een get).
- Tests: pytest 14/14 (3 nieuwe endpoint-tests), vitest 175 passed / 2 pre-existing skips (4 nieuwe Story-8.2-tests). Geen test-assertions afgezwakt.

### File List

- apps/ml-service/app/services/storage.py (put_training_image)
- apps/ml-service/app/api/artwork.py (POST /ml/artwork/rasterize)
- apps/api/src/services/ml-client.ts (rasterizeArtwork + types)
- apps/api/src/api/v1/artwork-pipeline.ts (rasterizeImportedPdf + import-integratie + ARTWORK_RASTER_DPI + isPdf)
- apps/api/src/__tests__/setup.ts (mlClient.rasterizeArtwork mock)
- apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts (4 Story-8.2-tests)
- tests/test_artwork_processing.py (3 endpoint-tests)
