# Story 12.17: Accepteer-na-getekend-kader registreert het kader (annotate), niet de auto-crop

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Ontdekt tijdens de 12.15 Nutri-Score review-ronde (2026-07-14). Zie onderaan "Bewijs op ACC". -->

## Story

Als **reviewer aan het reviewstation**,
wil ik dat wanneer ik een correctie-kader op de artwork teken en vervolgens op **Accepteer** druk, het door mij getekende kader wordt geregistreerd (niet de automatische crop),
zodat ik nooit per ongeluk een verkeerde/ruis-crop als referentie vastleg terwijl ik dacht mijn eigen kader te bevestigen.

## Context / Probleem

In `MobileReviewDeck` zijn er twee losse registratiepaden:

- **Kader tekenen in de afbeelding** → `ImageStage onConfirmBox` → `applyAnnotation(rel)` → `annotateReviewItem(id, rel[, code])`. De server knipt de artwork op **jouw** kader en registreert dat als referentie/trainingsdata.
- **Grote groene Accepteer-knop** → `applyDecision('ECHT')` → `acceptReviewItem(id[, code])`. Dit registreert de **automatische** crop (de harvest-bbox), en negeert een eventueel voor dit item getekend kader.

De relabel-flow combineert een eerder getekend kader wél met de gekozen code via `pendingRel` (Story 12.14), maar de kale Accepteer-knop kijkt niet naar `pendingRel`. Een reviewer die "kader tekenen → Accepteer" doet (de intuïtieve volgorde) legt daardoor de auto-crop vast en verliest zijn getekende kader zonder waarschuwing.

Dit is niet alleen verwarrend maar datavervuilend: de auto-crop kan een vals-positief zijn (zie bewijs), en die belandt dan als **actieve referentie** in de herkenning.

## Acceptance Criteria

1. **Kader-dan-Accepteer registreert het kader.** Als er voor het huidige item een getekend/pending kader bestaat (`pendingRel[cur.id]`), dan roept de Accepteer-knop (`applyDecision('ECHT')`) `annotateReviewItem(cur.id, rel[, code])` aan met dat kader — **niet** `acceptReviewItem` met de auto-crop. Na succes wordt `pendingRel[cur.id]` opgeruimd.
2. **Geen pending kader = ongewijzigd gedrag.** Zonder getekend kader blijft Accepteer exact het huidige `acceptReviewItem`-gedrag houden (byte-identiek pad; bestaande tests/mocks blijven groen).
3. **Code-correctie blijft meegaan.** Een via de relabel-picker gekozen code (`assignedCode[cur.id]`) wordt in het kader-pad meegegeven aan `annotateReviewItem(cur.id, rel, code)`, consistent met de bestaande 12.14-combinatielogica.
4. **Zichtbare bevestiging welke crop wordt opgeslagen.** De UI maakt vóór het accepteren ondubbelzinnig welke crop wordt vastgelegd wanneer een kader getekend is (bijv. de knoptekst/melding verandert naar "kader vastleggen", of een badge "je getekende kader wordt opgeslagen"). Minimaal: de succesmelding na afloop verwijst naar het juiste pad (kader vs. auto-crop).
5. **Regressietest.** Een test dekt: item met een getekend `pendingRel` + druk op Accepteer ⇒ `annotateReviewItem` wordt aangeroepen (met de rel, en met de code indien gekozen) en `acceptReviewItem` wordt **niet** aangeroepen. Plus de spiegel-test: geen pending kader ⇒ `acceptReviewItem` wordt aangeroepen en `annotateReviewItem` niet.

## Tasks / Subtasks

- [ ] Task 1 — Accepteer-knop kader-bewust maken (AC: 1, 2, 3)
  - [ ] In `applyDecision('ECHT')` (apps/web/src/components/review/MobileReviewDeck.tsx): lees `pendingRel[cur.id]`; indien aanwezig → `annotateReviewItem(cur.id, rel, assignedCode[cur.id])` (code optioneel weglaten met bestaande arity-conventie), ruim `pendingRel[cur.id]` op; anders het huidige `acceptReviewItem`-pad ongewijzigd.
  - [ ] Hergebruik de bestaande annotate-afhandeling (decisions/goto/toast) i.p.v. duplicatie; volg het patroon uit `applyAnnotation`/`relabel`.
- [ ] Task 2 — UX-disambiguatie (AC: 4)
  - [ ] Toon, zodra `pendingRel[cur.id]` bestaat, duidelijk dat Accepteer nu het getekende kader vastlegt (knoptekst of hint/badge). Succestoast onderscheidt kader- vs auto-crop-pad (hergebruik `review.annotated*` vs `review.relabeled`/accept-melding).
- [ ] Task 3 — Tests (AC: 5)
  - [ ] Unit/interactietest in de bestaande deck-testsuite: pending kader + Accepteer ⇒ annotate (niet accept); geen kader + Accepteer ⇒ accept (niet annotate). Bevestig arity/call-shape zoals bestaande mocks verwachten.
- [ ] Task 4 — Handmatige verificatie op ACC (permission-gated, met Friso)
  - [ ] Herhaal het gereproduceerde scenario in de review-UI: teken kader op een Nutri-Score-item, druk Accepteer, bevestig via netwerk-log dat er een `annotate`-call gaat (geen `accept`) en dat de opgeslagen crop het getekende gebied is.

## Dev Notes

### Huidige toestand (gelezen, niet aannemen)
- `apps/web/src/components/review/MobileReviewDeck.tsx`
  - `applyAnnotation(rel)` (~regel 412): tekent-kader-pad; roept `annotateReviewItem(cur.id, rel[, code])`; beheert `pendingRel` (onthoudt kader voor latere code-keuze wanneer nog geen code).
  - `relabel(code)` (~regel 460–490): als `pendingRel[cur.id]` bestaat → `annotateReviewItem(cur.id, rel, code)`, anders `acceptReviewItem(cur.id, code)`. **Dit is exact het patroon dat Accepteer óók moet volgen.**
  - `applyDecision('ECHT')` (de groene knop, `data-testid="deck-accept"`, ~regel 960): roept nu `acceptReviewItem` — **negeert `pendingRel`**. Dit is de fix-locatie.
  - `ImageStage ... onConfirmBox={applyAnnotation}` (~regel 888–905): het teken-pad.
- `apps/web/src/services/artworkReviewService.ts`
  - `acceptReviewItem(id, t3777Code?)` → `PATCH /artwork/review-items/:id/accept` (registreert auto-crop).
  - `annotateReviewItem(id, rel, t3777Code?)` → `POST /artwork/review-items/:id/annotate` (server crop op `rel` = fracties 0..1 van de artwork; registreert als referentie/trainingsdata). Behoud de bestaande arity-conventie (2 args zonder code, 3 met code) — sommige tests asserteren de call-shape exact.

### Wat behouden moet blijven
- Het kale accept-pad (zonder pending kader) moet byte-identiek blijven (AC2) — de bestaande route/pipeline-tests mocken exacte call-shapes.
- `pendingRel`-semantiek uit 12.14 (kader-dan-code én code-dan-kader) niet breken.

### Testing standards
- Frontend: bestaande deck-testsuite (Vitest + Testing Library) — zie `apps/web/src/pages/ArtworkReviewPage.test.tsx` en de `MobileReviewDeck`-tests. Volg de bestaande mock-conventies voor `acceptReviewItem`/`annotateReviewItem`.

### Bewijs op ACC (2026-07-14)
- Nutri-Score review-item `af630228-ddc0-4d22-91e0-3dd1d8f6370e`, GTIN `08718452660308`, code `NUTRISCORE_D`, confidence 0,895.
- Reviewer tekende een kader en drukte Accepteer. Netwerk-log toonde **alleen** `PATCH .../accept` (geen `annotate`). De auto-crop `artwork-crops/08718452660308/12_15_NUTRISCORE_D__18_1679_2346.png` (bbox 846×363) bleek een **drukproef-tekstblok** ("DEAR CUSTOMER, PLEASE CHECK THIS PROOF...") — geen Nutri-Score-logo — en werd als **actieve** `reference_logos`-rij (`7e5752e2-...`, `source='review-confirmed'`) geregistreerd.
- Hersteld via `PATCH .../reopen` → `deactivatedTrainingData: 1, deactivatedReferences: 1`; item terug op `open`. Dit toont ook dat reopen de juiste vangnet-actie is, maar de bug zit in het accepteer-pad.

### Project Structure Notes
- Wijziging is frontend-only (review-deck + evt. i18n-strings). Geen API-, ml-service- of DB-wijziging nodig; de `annotate`-route bestaat al.

### References
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx#applyDecision, #applyAnnotation, #relabel]
- [Source: apps/web/src/services/artworkReviewService.ts#acceptReviewItem, #annotateReviewItem]
- [Source: _bmad-output/implementation-artifacts/12-15-dryrun-acc.md] (herkomst van de foutieve auto-crop)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- Root cause verfijnd t.o.v. de story-hypothese: het getekende kader leeft in
  `ImageStage` (lokale `box`-state) tot de reviewer de in-stage knop **"Bevestig
  kader"** (`stage-confirm`) klikt — pas dán vuurt `onConfirmBox → applyAnnotation`.
  De grote groene **Accepteer** (`applyDecision('ECHT')`) registreert de auto-crop
  en negeerde het (nog niet naar de ouder gelifte) getekende kader. Op ACC kwam
  daardoor alleen een `accept`-call (geen `annotate`), en werd de auto-crop
  (drukproef-tekst, 90% vals-positief) als actieve referentie geregistreerd.
- Daarom is `pendingRel` (dat pas ná een bevestigde annotate bestaat) NIET de
  juiste haak; de fix lift de "er is een getekend maar onbevestigd kader"-state
  naar de ouder.

### Completion Notes List

- `ImageStage`: twee kleine props toegevoegd — `onDraftChange(hasDraft)` (meldt een
  bruikbaar getekend, onbevestigd kader; sub-drempel telt als geen kader) en
  `confirmToken` (bump → `confirm()` draait, rel live herberekend zodat zoom/pan
  kloppen; via ref zodat het effect enkel op token-wijziging vuurt, niet tijdens
  het tekenen).
- `MobileReviewDeck`: `hasDraftBox` + `confirmBoxToken`; de grote Accepteer roept
  bij een getekend kader `setConfirmBoxToken(n+1)` (→ bevestigt het kader = annotate)
  i.p.v. `applyDecision('ECHT')`; knoptekst wisselt naar "Bevestig getekend kader"
  (AC4 disambiguatie). Zonder kader: ongewijzigd (AC2).
- Tests: 2 nieuw in `MobileReviewDeck.test.tsx` (mock uitgebreid met `mock-draw` +
  `confirmToken`-reactie). Gates: tsc 0; volledige web-vitest 143 passed / 16 todo /
  0 failed (24 files). eslint niet betrouwbaar draaibaar in de symlink-worktree
  (dubbele eslint-versie in gedeelde node_modules — faalt óók op ongewijzigde
  bestanden); code is naar constructie lint-schoon; echte lint-gate = CI/hoofdboom.
### Adversarial review — bevindingen verwerkt (2026-07-14)

- **HIGH — swipe/toets-A omzeilden de guard.** De guard zat eerst alleen op de
  knop-`onClick`; `applyDecision('ECHT')` via swipe (`onTouchEnd`) en de "A"-
  sneltoets registreerde nog steeds de auto-crop. Gefixt: de kader-check staat nu
  centraal in `applyDecision('ECHT')` zelf (bumpt `confirmBoxToken` + return), dus
  knop, swipe én toets lopen door één route. Regressietest toegevoegd (toets "A"
  met getekend kader ⇒ annotate, niet accept).
- **MEDIUM — `hasDraftBox` bleef hangen bij unmount** (context-toggle / crop-loos
  item). Gefixt: unmount-cleanup in `ImageStage` meldt `onDraftChange(false)`.
  Regressietest toegevoegd.
- **MEDIUM — geen directe ImageStage-dekking.** Nieuw `ImageStage.test.tsx` (5
  tests): geen bevestiging op mount, `onDraftChange` true/false bij tekenen/wissen,
  `confirmToken`-bump bevestigt met live rel, no-op zonder kader, unmount-cleanup.
- LOW (sub-drempel confirm = stille no-op): pre-existing gedrag van "Bevestig
  kader", geen regressie — bewust ongewijzigd gelaten.
- Story 12.18 (badge) in dezelfde review als solide beoordeeld.

### File List

- apps/web/src/components/review/ImageStage.tsx (UPDATE)
- apps/web/src/components/review/ImageStage.test.tsx (NEW)
- apps/web/src/components/review/MobileReviewDeck.tsx (UPDATE)
- apps/web/src/components/review/MobileReviewDeck.test.tsx (UPDATE)
