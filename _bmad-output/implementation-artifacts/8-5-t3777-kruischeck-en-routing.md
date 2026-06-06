# Story 8.5: T3777-kruischeck en routing

Status: ready-for-dev

## Story

As a datamanager,
I want dat de gedetecteerde keurmerken per product worden vergeleken met de GS1-declaratie,
so that overeenstemmende detecties automatisch geaccepteerd worden en alleen discrepanties mijn aandacht vragen.

## Acceptance Criteria

1. **Auto-accept bij match (FR48):** Given een product met afgeronde detectie én T3777-declaratie, When de kruischeck draait, Then worden detecties die in de gedeclareerde set zitten en boven de confidence-drempel scoren auto-geaccepteerd And gaan "verwacht maar niet gevonden" en "gevonden maar niet verwacht" als reviewitems naar de bestaande uncertainty-queue, met discrepantie-reden.
2. **Geen declaratie = geen auto-accept:** Given een product zonder T3777-declaratie, Then worden alle detecties als reviewitems gerouteerd.
3. **Review-UI met herkomst:** Given reviewitems, When ik er één open, Then zie ik crop, voorgesteld label, confidence, herkomst (bestand + coördinaten) en discrepantie-reden.

## Tasks / Subtasks

- [ ] Task 1: Kruischeck-endpoint in `artwork-pipeline.ts` (AC: 1, 2)
  - [ ] **ATDD-contract (artwork-pipeline.routes.test.ts — exact, 4 tests):**
    - `POST /artwork/:gtin/crosscheck` body `{ detections: [{t3777Code, confidence, bbox}], declared: string[] }` → 200 `{ autoAccepted: [...], reviewItems: [...] }`
    - detectie ∈ declared ∧ confidence ≥ drempel → autoAccepted
    - declared-code zonder detectie → reviewItem `{ t3777Code, reason: /verwacht|expected/i }`
    - detectie ∉ declared → reviewItem `{ reason: /niet verwacht|not declared|unexpected/i }`, autoAccepted leeg
    - `declared: []` → ALLES reviewItems, NOOIT auto-accept (veiligheidsregel — geen onafhankelijke bevestiging = mens kijkt)
  - [ ] Drempels: **per methode** (zie 8.4) — `CROSSCHECK_THRESHOLD_TEMPLATE` (default 0.85), `CROSSCHECK_THRESHOLD_EMBEDDING` (0.80), `CROSSCHECK_THRESHOLD_CLASSIFIER` (0.90); detecties zonder `method`-veld krijgen de strengste drempel. Detectie ∈ declared maar < drempel → reviewItem met reden "confidence onder drempel". De ATDD-tests voeden confidence zonder method — die vallen dus onder de strengste drempel; de testwaarden (0.91-0.99) zitten daar bewust boven
  - [ ] `declared` komt in deze story uit de request-body (aanroeper levert de T3777-set). **Bron-opties documenteren in code-comment:** later vullen vanuit tradeItems (prod-Mongo, regex op packagingMarkingModule — zie research-steekproef) via een aparte sync; NIET in deze story bouwen
- [ ] Task 2: Routing naar de uncertainty-queue (AC: 1, 3)
  - [ ] **Expliciete AC-verfijning (besluit, geen stilzwijgende afwijking):** de epics-AC zegt "bestaande uncertainty-queue", maar artwork-reviewitems zijn geen RecognitionResults — een eigen `ArtworkReviewItem`-model is correcter (id, gtin, t3777Code, cropPath, bbox, confidence, method, reason, sourceFile, status open/accepted/rejected, createdAt) + migratie 0006 + init.sql + GRANT-deploystap. **De AC-belofte wordt aan de UI-kant waargemaakt** (volgende subtaak): de reviewer ziet ÉÉN gecombineerde queue
  - [ ] `GET /artwork/review-queue` → open items
  - [x] **UI-merge (verplichte taak, niet optioneel):** de review-weergave toont voortaan BEIDE bronnen (feedback-uncertain + artwork-reviewitems) op één pagina, in twee bron-gelabelde secties (Tag "Artwork" #2F5A7A actionable; Tag "Feedback" #54949E read-only). `ArtworkReviewPage.tsx` haalt `GET /artwork/review-queue` én `GET /feedback/uncertain` parallel op (best-effort; uncertainty-fetch breekt de pagina niet). [UI-deel — deze story-slag]
- [x] Task 3: Review-UI-uitbreiding (AC: 3) — UI-deel geïmplementeerd in deze story-slag
  - [x] Nieuwe review-component (er bestond géén frontend uncertainty-component — bevestigd): `ArtworkReviewItemCard.tsx` met crop-preview (presigned, alleen on-view via nieuw `GET /artwork/review-items/:id/crop-url`), label, confidence, **herkomstblok** (`review-item-provenance`: img + confidence + reden + sourceFile + bbox) en discrepantie-reden
  - [x] **data-testid-contract:** `review-item-provenance` bevat `img`, confidence-tekst (/%/) en reden (/verwacht|niet verwacht/i) — geverifieerd in `ArtworkReviewPage.test.tsx`. (`pipeline-monitoring.spec.ts` bestaat niet in de repo; prose-contract gevolgd.)
  - [x] Accept/reject-acties: accept → `PATCH /artwork/review-items/:id/accept` (doorzet naar registratie, 8.6 backend is af), reject → `PATCH .../reject`; optimistische verwijdering met rollback bij API-fout, succes in Groen (#B7D945), fouten in Rood; admin-only catch-up via `POST .../process-accepted`
  - [x] **RBAC:** muterende acties verborgen/disabled voor non-admins via `GET /auth/me` (`useCurrentUser`-hook); backend blijft de echte 403-guard; read-only queue voor iedereen
- [ ] Task 4: Tests groen
  - [ ] `.skip` weg: 4 crosscheck-tests in artwork-pipeline.routes.test.ts
  - [ ] e2e `pipeline-monitoring.spec.ts` Journey 4 (review-herkomst): `.skip` alleen weg indien lokaal verifieerbaar; anders laten staan + documenteren (Epic 7-conventie)

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Dit is de veiligheidskern van Epic 8** — de asymmetrie is bewust: auto-accept vereist twee onafhankelijke bronnen (visuele detectie ÉN GS1-declaratie). Versoepel dit nooit "voor het gemak"
- **Vereist 8.1 (gtin-context) conceptueel; testbaar zonder** — alle 4 ATDD-tests voeden detections/declared via de body
- **Zelfde route-bestand als 8.1** (artwork-pipeline.ts) — registratie al gedaan; volg de daar gevestigde error-conventie
- **Migratie-les (Epic 7):** 0006 → Prisma + init.sql + handmatig op Cherry + GRANT voor `logorecognition`
- **i18n-les (Epic 7 review-finding):** géén hardcoded Nederlands in nieuwe UI-componenten — t() met defaults zoals ModelsPage/TrainingPage; de API-reason-strings matchen de ATDD-regexen (NL mag dáár, dat is het testcontract)

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/api/v1/feedback.ts:298-382` | bestaande uncertainty-queue (shape-compatibiliteit) |
| `apps/web/src/components/` (review/uncertainty-componenten) | UI-uitbreidingspunt |
| Research-steekproef Bevinding 2 | T3777-extractie uit tradeItems (toekomstige declared-bron) |

### References

- [Source: epics.md#Story 8.5] · [Source: atdd-checklist-epic-8-9.md — crosscheck-contract] · [Source: research-addendum — kruischeck als zelf-corrigerend mechanisme + artwork-QA-businesskans]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (UI-slag: 8.5 AC3 review-UI + herkomst)

### Completion Notes List

- **Scope deze slag:** alleen het UI-deel van AC3 (review-UI met herkomst) + de verplichte UI-merge. Backend van 8.5 (crosscheck, routing, review-queue, accept/reject/process-accepted endpoints, RBAC) was al af op deze branch; alleen één klein read-only presign-endpoint toegevoegd dat de UI nodig had.
- **Backend-contract-toevoeging (geen facade):** `GET /artwork/review-items/:id/crop-url` — on-view presign van de crop. De queue-list presigned bewust NIET eager (matcht "alleen on-view"). `cropPath` is een bare object key in de TRAINING-bucket (geverifieerd: `uploadArtwork` schrijft crops naar `BUCKETS.TRAINING` met bare key; `registerCropsTx` gebruikt cropPath direct als TRAINING storagePath), dus presign via `getReferenceLogoUrl` (signt TRAINING zonder split) is correct — niet via `getSignedUrl` (die de eerste path-segment als bucket pakt).
- **"Bestaande uncertainty-UI" bestond niet in de frontend** (geverifieerd: geen review/feedback/uncertainty-component in apps/web). Nieuw gebouwd: `ArtworkReviewPage` + `ArtworkReviewItemCard`. De UI-merge is alsnog waargemaakt door op dezelfde pagina ook `GET /feedback/uncertain` (bestaand) read-only te tonen als tweede bron-gelabelde sectie.
- **RBAC:** `useCurrentUser`-hook (`GET /auth/me` → role) verbergt/disabled accept/reject/catch-up voor non-admins; backend blijft de echte guard.
- **Hardening:** crop-presign-effect met ref-guard om een cleanup/finally-race te vermijden die de spinner zou laten hangen; optimistic update met rollback alleen bij API-fout (message-calls buiten de try zodat ze geen rollback triggeren).
- **Tests:** web-vitest 52 passed (was 43; +9 nieuw), api-vitest 190 passed/2 skipped (was 187/2; +3 nieuw). web type-check schoon. apps/api `tsc` faalt pre-existing (Prisma-client niet gegenereerd in worktree — alle `prisma.*`-accessen falen, niet door deze wijziging; api-vitest gebruikt een gemockte client en is groen).

### File List

- apps/api/src/api/v1/artwork-pipeline.ts (nieuw endpoint `GET /artwork/review-items/:id/crop-url` + `getReferenceLogoUrl`-import + route-doc)
- apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts (3 nieuwe presign-tests)
- apps/web/src/services/artworkReviewService.ts (nieuw)
- apps/web/src/hooks/useCurrentUser.ts (nieuw)
- apps/web/src/components/review/ArtworkReviewItemCard.tsx (nieuw)
- apps/web/src/pages/ArtworkReviewPage.tsx (nieuw)
- apps/web/src/pages/ArtworkReviewPage.test.tsx (nieuw, 7 tests)
- apps/web/src/App.tsx (route /artwork-review)
- apps/web/src/components/common/AppLayout.tsx (nav-item + active-key)
- apps/web/src/i18n/locales/nl.json, en.json (review.* + nav.artworkReview + training.size/dateUnknown)
