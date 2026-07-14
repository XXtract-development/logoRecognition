# Story 12.19: Kader tekenen (annoteren) óók in de "bekijk in context"-weergave

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Vervolg op 12.17/12.18, gevraagd door Friso tijdens de Nutri-Score review-ronde (2026-07-14). -->

## Story

Als **reviewer aan het reviewstation**,
wil ik in de **"bekijk in context"**-weergave (de ingezoomde uitsnede rond het voorgestelde kader) óók zelf een kader kunnen tekenen om het keurmerk te markeren,
zodat ik het logo kan boxen in de weergave waar ik het het beste zie, zonder eerst terug te hoeven naar de uitsnede-weergave.

## Context / Probleem

De "bekijk in context"-weergave toont een server-gerenderd **fragment**: een venster rond de bbox (2,5× de box, min 250px marge), gedownscaled, met het voorgestelde kader in rood (endpoint `GET /artwork/review-items/:id/source`). Dit laadt snel en toont het logo in zijn omgeving. Maar het werd getoond als een **platte `<img>`** — je kon er geen kader tekenen. Tekenen kon alleen in de standaard (marked/`ImageStage`) weergave.

Een kader dat je op het fragment tekent is in **fragment-fracties**; om te annoteren moet dat terug naar **volledige-artwork-fracties** (wat `annotateReviewItem` verwacht). Daarvoor is de venster-mapping van het fragment nodig (extract-window + volledige artwork-afmetingen).

## Acceptance Criteria

1. **Tekenbaar in context.** In de "bekijk in context"-weergave kan een beheerder een kader slepen (zelfde `ImageStage`-interactie als de uitsnede-weergave: slepen = kader, dubbelklik = zoom, spatie+sleep = verschuiven).
2. **Correcte terugrekening.** Een op het fragment getekend kader wordt via het venster ([left, top, rw, rh, W, H] in artwork-pixels) omgerekend naar volledige-artwork-fracties vóór `annotateReviewItem`, zodat de server de juiste regio uit de originele artwork knipt.
3. **Venster-metadata.** `GET .../source` geeft het extract-venster mee als header `X-Context-Window: left,top,rw,rh,W,H` (in artwork-pixels). Ontbreekt de header (respons = de hele artwork, bv. de geen-bbox-fallback), dan is de rel al in volledige-artwork-fracties (identiteitsmapping).
4. **Accepteer-consistentie (12.17).** Ook in de context-weergave geldt: is er een getekend kader, dan bevestigt "Accepteer" (en swipe/toets) dat kader (→ annotate) i.p.v. de auto-crop; de draft-state reset bij het wisselen van weergave/item.
5. **Geen regressie.** De uitsnede-weergave, de marked-crop-annotatie (12.17) en de badge (12.18) blijven ongewijzigd; bestaande tests groen.

## Tasks / Subtasks

- [x] Task 1 — Backend venster-header (AC3)
  - [x] `/source` (apps/api/src/api/v1/artwork-pipeline.ts): in het fragment-pad `X-Context-Window` + `Access-Control-Expose-Headers` zetten (fallback-paden = hele artwork → geen header).
- [x] Task 2 — Service geeft venster terug (AC2/AC3)
  - [x] `fetchReviewItemSourceBlob` → `ReviewItemSource { url, window: number[]|null }`, parseert de header (exact 6 eindige getallen, anders null).
- [x] Task 3 — Context-weergave tekenbaar (AC1/AC2/AC4)
  - [x] Deck: `srcWindow`-state + cache van `ReviewItemSource`; context-render van platte `<img>` naar `ImageStage` (canDraw, onDraftChange, confirmToken).
  - [x] `applyContextAnnotation`: fragment-rel → artwork-rel via `srcWindow`, dan `applyAnnotation`.
- [x] Task 4 — Tests (AC1-5)
  - [x] Service: header-parsing (6-getallen / ontbrekend / misvormd / fout).
  - [x] Deck: context-kader → annotate met terug-gerekende fracties; zonder venster identiteit.
  - [x] Test-setup: `URL.createObjectURL/revokeObjectURL`-stubs (jsdom mist ze).
- [ ] Task 5 — ACC-verificatie na deploy (permission-gated).

## Dev Notes

### Terugreken-formule (fragment-rel → artwork-rel)
Gegeven venster `[left, top, rw, rh, W, H]` (artwork-pixels) en fragment-rel `{x,y,w,h}` (fracties van het getoonde fragment):
```
artwork_x = (left + x·rw) / W
artwork_y = (top  + y·rh) / H
artwork_w =        (w·rw) / W
artwork_h =        (h·rh) / H
```
Server-window (artwork-pipeline.ts): `left/top` = geclampte hoek, `rw/rh = halfW·2 / halfH·2`, `W/H` = `sharp().metadata()`.

### Huidige toestand (gelezen)
- `apps/api/src/api/v1/artwork-pipeline.ts` `/source`: rendert extract-venster gecentreerd op bbox, tekent rode box, downscalet naar 900px. Drie respons-paden: geen-bbox (hele artwork, 1200px), fragment (nu +header), sharp-fout (rauwe bytes = hele artwork).
- `apps/web/src/components/review/MobileReviewDeck.tsx`: `context`-toggle (`deck-context-toggle`); context-branch toonde `<img deck-context>`. `applyAnnotation` (12.14/12.17) ongewijzigd hergebruikt.
- `ImageStage` (12.17) levert al `onDraftChange`/`confirmToken`; context hergebruikt dezelfde `hasDraftBox`/`confirmBoxToken` (slechts één stage tegelijk gemount).

### Testing standards
- Frontend Vitest/RTL; backend Vitest (Fastify inject). Gemockte `ImageStage` in de deck-test dekt de bedrading; de terug-gerekende fracties met `expect.closeTo` (float-robuust).

### Project Structure Notes
- Raakt backend (`/source` header) + frontend (service + deck + test-setup). Geen DB-/migratiewijziging.

### References
- [Source: apps/api/src/api/v1/artwork-pipeline.ts#/source]
- [Source: apps/web/src/services/artworkReviewService.ts#fetchReviewItemSourceBlob, #ReviewItemSource]
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx#applyContextAnnotation, #context-render]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Completion Notes List

- Backend header additief in het fragment-pad; fallback-paden bewust zonder header (identiteit). tsc 0.
- Service-returntype gewijzigd van `string|null` naar `ReviewItemSource|null`; bestaande mocks (`null`) blijven geldig.
- Gates: web-vitest 155 passed/16 todo/0 failed (26 files, incl. nieuw artworkReviewService.source.test.ts + 2 deck-tests); api-vitest 936→**947** passed/0 failed (incl. nieuwe /source-header-test); tsc 0 (web + api).

### Adversarial review (2026-07-14) — PASS, geen substantiële defecten

Reviewer traceerde de coördinaat-math end-to-end (/source ↔ /annotate) en de gedeelde draft/confirm-lifecycle. Bevestigd: (1) /annotate gebruikt hetzelfde `item.sourceFile` en dezelfde `sharp`-dimensies als /source → geen dimensie-mismatch; beide in opgeslagen-pixelruimte (geen `.rotate()`) → EXIF consistent. (2) marked- en context-stage renderen wederzijds exclusief; unmount-cleanup + `firstConfirmToken`-guard voorkomen draft/confirm-lek. (3) alle drie de server-paden coördinaat-consistent. 3 LOW verwerkt/afgewogen:
- LOW#1 (geen backend-test voor de header) → **toegevoegd** (`/source`-test: header pariteit + `left+rw≤W`, `top+rh≤H`, exacte 190,80,500,500 voor bbox 400,300,80,60 op 1000×800).
- LOW#2 (rel kan ~1px buiten 0..1 aan de rand) → **geen fix nodig**: `/annotate` clamt `x∈[0,W-2]`, `w∈[2,W-x]` (regels 1215-1218) → crop blijft geldig; frontend leunt correct op die server-clamp.
- LOW#3 (lokale `window` schaduwt global) → **hernoemd** naar `parsedWindow`.

### File List

- apps/api/src/api/v1/artwork-pipeline.ts (UPDATE — X-Context-Window header)
- apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts (UPDATE — /source header-test)
- apps/web/src/services/artworkReviewService.ts (UPDATE — ReviewItemSource + header parse)
- apps/web/src/services/artworkReviewService.source.test.ts (NEW)
- apps/web/src/components/review/MobileReviewDeck.tsx (UPDATE — drawable context view + transform)
- apps/web/src/components/review/MobileReviewDeck.test.tsx (UPDATE — 12.19 tests)
- apps/web/tests/setup.ts (UPDATE — URL object-URL stubs)
