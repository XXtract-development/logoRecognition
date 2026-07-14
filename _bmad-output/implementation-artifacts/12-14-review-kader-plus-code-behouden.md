# Story 12.14: Review — zelfgetekend kader + gekozen code samen bewaren

Status: review

<!-- BUGFIX (frontend). Gemeld door Friso 2026-07-13: als hij in de review-deck zelf met de muis een kader om het logo tekent én vervolgens een ander keurmerk uit de lijst kiest, wordt de accept doorgezet maar zijn zelfgetekende crop NIET bewaard (de auto-crop wordt geregistreerd). Oorzaak: de twee acties zijn gescheiden en combineren niet — de backend ondersteunt de combinatie al (`POST /annotate` met `rel` + `t3777Code`). Frontend-only fix. -->

## Story

Als **datamanager die review-items beoordeelt (o.a. het 12.12-Nutri-Score-labelwerk)**
wil ik **dat wanneer ik zelf een kader om het keurmerk teken én een (ander) keurmerk uit de lijst kies, zowel mijn getekende crop ALS de gekozen code bewaard worden**
zodat **de bevestigde referentie de crop is die ik zelf heb aangewezen onder de code die ik heb gekozen — niet de automatisch gedetecteerde crop of de oorspronkelijke code**.

### Afbakening (kritiek)
- **Frontend-only bug** in `apps/web` (de review-deck). De **backend is al correct**: `POST /artwork/review-items/:id/annotate` accepteert `{ rel, t3777Code }` en bewaart de crop op het getekende kader ónder de meegegeven code (`artwork-pipeline.ts:1215` `code = override || item.t3777Code`, crop op `rel`, `method:'human-annotation'`, registreert als actieve referentie). NIET wijzigen aan de backend/accept/annotate-endpoints.
- **Scope:** de review-UI zo bedraden dat "kader getekend" + "code gekozen" samen via `annotateReviewItem(id, rel, code)` gaan (kader + code), i.p.v. de huidige gescheiden paden. Beide volgordes moeten werken (eerst kader dan code; eerst code dan kader). Bestaand gedrag behouden wanneer er GEEN kader is getekend (dan blijft "code kiezen" een gewone accept-onder-code) en wanneer er GEEN code is gekozen (dan blijft "kader" een annotate onder de bestaande code).
- **UX volgens XXtract Design System** (Shadcn/Tailwind is hier Ant Design in de bestaande deck — volg het bestaande deck-patroon en de XXtract-kleuren; lees `~/claude-team-config/design-system/xxtract-design-system.md` vóór UI-wijzigingen).
- **Geen ML-/vliegwiel-wijziging, geen ACC-schrijf/deploy** (deploy permission-gated bij Friso).

## Oorzaak (bewezen, als context voor de dev)
In `apps/web/src/components/review/MobileReviewDeck.tsx`:
- `applyAnnotation(rel)` (≈regel 362-367) → `annotateReviewItem(cur.id, rel)` — bewaart het kader, maar geeft **geen** `t3777Code` mee → registreert onder de bestaande code (de codekeuze gaat verloren).
- `relabel(code)` (≈regel 385-398) → `acceptReviewItem(cur.id, code)` — accepteert onder de gekozen code, maar via het **accept**-endpoint dat de bestaande `cropPath` (auto-detectie) gebruikt → het zelfgetekende kader gaat verloren.
- De service ondersteunt de combinatie al: `annotateReviewItem(id, rel, t3777Code?)` (`services/artworkReviewService.ts:131`). Er is alleen geen UI-pad dat beide meegeeft.
- De desktop-kaart `ArtworkReviewItemCard.tsx` heeft alleen Accepteer (geen code/kader), Wijs af, en "Markeer keurmerk" (kader via `ArtworkAnnotator`, geen code); de codelijst zit in de deck. Controleer of dezelfde combineer-fix daar ook nodig is (of dat de kaart geen relabel-pad heeft).

## Acceptatiecriteria

1. **Kader + gekozen code worden samen bewaard**
   **Given** een open review-item waarbij de datamanager zelf een kader om het keurmerk heeft getekend
   **When** de datamanager (in dezelfde beoordeling) een keurmerk uit de lijst kiest en bevestigt
   **Then** wordt het item geregistreerd via `annotateReviewItem(id, rel, gekozenCode)` — de bewaarde crop is het **getekende kader** (`method: 'human-annotation'`) én de code is de **gekozen** code; NIET de auto-detectie-crop en NIET de oorspronkelijke code.

2. **Beide volgordes werken**
   **Given** de datamanager
   **When** hij óf eerst het kader tekent en dan de code kiest, óf eerst de code kiest en dan het kader tekent en bevestigt
   **Then** is het eindresultaat in beide gevallen identiek: getekend kader + gekozen code samen bewaard.

3. **Geen regressie op de losse paden**
   **Given** géén getekend kader
   **When** de datamanager alleen een code kiest (relabel)
   **Then** blijft het gedrag een gewone accept-onder-gekozen-code (auto-crop) zoals nu.
   **And Given** géén codekeuze **When** alleen een kader wordt getekend **Then** blijft het een annotate onder de bestaande code (huidig gedrag).

4. **Duidelijke UI-terugkoppeling**
   **Given** de gecombineerde actie
   **When** hij slaagt
   **Then** toont de UI een bevestiging die klopt (bijv. "keurmerk gemarkeerd op je kader en gekoppeld aan {{code}}"), en de deck gaat door naar het volgende item — consistent met de bestaande `review.annotated`/`review.relabeled`-meldingen.

5. **Tests (regressiebestendig)**
   **Given** de wijziging
   **When** de web-tests draaien
   **Then** dekken ze: (a) kader + code → `annotateReviewItem` met (id, rel, code) aangeroepen (niet `acceptReviewItem`); (b) beide volgordes; (c) alleen-code → nog steeds `acceptReviewItem(id, code)`; (d) alleen-kader → `annotateReviewItem(id, rel)` zonder code. Volg het bestaande deck-testpatroon (`MobileReviewDeck.test.tsx`).

## Tasks / Subtasks
- [ ] 1. **Kader-state bijhouden + combineren (AC: 1, 2, 3)** — houd in de deck bij of voor het huidige item een kader is getekend (pending `rel`). Pas `relabel(code)` aan: als er een pending kader is → `annotateReviewItem(cur.id, rel, code)`; anders het huidige `acceptReviewItem(cur.id, code)`. Pas `applyAnnotation(rel)` aan: als er al een code is gekozen (`assignedCode[cur.id]`) → `annotateReviewItem(cur.id, rel, code)`; anders het huidige `annotateReviewItem(cur.id, rel)`. Zorg dat de pending-kader-state per item reset bij navigatie.
- [ ] 2. **UI-terugkoppeling (AC: 4)** — passende succesmelding voor de gecombineerde actie; behoud de bestaande losse meldingen. XXtract-kleuren/patroon.
- [ ] 3. **Desktop-kaart checken (AC: 3)** — verifieer of `ArtworkReviewItemCard.tsx` een relabel/annotate-combinatie kent die dezelfde fix nodig heeft; zo ja, analoog fixen; zo nee, documenteren dat de kaart geen gecombineerd pad heeft.
- [ ] 4. **Tests (AC: 5)** — web-vitest volgens AC5, patroon `MobileReviewDeck.test.tsx`.
- [ ] 5. **Verificatie (AC: 1-5)** — `tsc --noEmit` 0 (web) + volledige web-vitest groen (zelf draaien). GEEN deploy (permission-gated).

## Dev Notes — Developer Context
### Bestanden (bestaand — wijzig gericht)
- `apps/web/src/components/review/MobileReviewDeck.tsx` — `applyAnnotation` (≈362), `relabel` (≈385), `pickList`/relabel-picker (≈636/924), `assignedCode`-state (≈616). Kern van de fix.
- `apps/web/src/services/artworkReviewService.ts:131` — `annotateReviewItem(id, rel, t3777Code?)` (backend-contract al aanwezig — hergebruiken, niet dupliceren).
- `apps/web/src/components/review/ArtworkReviewItemCard.tsx` + `ArtworkAnnotator.tsx` — desktop "Markeer keurmerk"-modal (`onConfirm={handleAnnotate}` → `onAnnotate(id, rel)`), check op combineer-behoefte (Task 3).
- Backend ter referentie (NIET wijzigen): `apps/api/src/api/v1/artwork-pipeline.ts:1168-1293` (annotate-handler; `code = override || item.t3777Code`, crop op `rel`, registreert referentie).

### Wat behouden moet blijven / niet doen
- Backend niet aanraken (annotate ondersteunt de combinatie al). Geen wijziging aan het accept-endpoint of de rate-limit-fix (12.13). Geen ML/vliegwiel.
- De losse paden (alleen-code, alleen-kader) exact behouden (AC3).
- Geen ACC-schrijf/deploy.

### Waarom dit de juiste fix is
De reviewer wees expliciet een crop én een code aan; beide zijn grondwaarheid voor het vliegwiel (conditie C matcht op de échte crop). De auto-crop registreren i.p.v. de aangewezen crop ondermijnt precies de menselijke correctie die de review-stap moet vastleggen. De backend was al klaar voor de combinatie; alleen de UI-bedrading ontbrak.

### References
- Melding Friso 2026-07-13 (deze sessie).
- Geheugen: `project_flywheel_resume`. Story 12.7 (relabel-label-prior), 19.8/19.12 (accept→referentie), 12.12 (Nutri-Score-labelwerk dat dit raakt).

### Project Structure Notes
- Enkel `apps/web`. Bouwen in een schone worktree; commit code + tests + story→`review` + sprint-status samen (één werk-commit).

## Dev Agent Record
### Agent Model Used
Claude Sonnet 5 (implement-sprint epic-agent, epic-12 story 12.14)

### Debug Log References
- CR (code review): Blind Hunter + Edge Case Hunter (parallel, adversarial) + Acceptance Auditor — independently converged on 1× HIGH finding (stale `pendingRel`/`assignedCode` on decision-switch via plain accept/reject buttons or the flywheel reject-reason modal, `commitReject`/`applyDecision`). Fixed; re-verified PASS by a follow-up Edge Case Hunter pass.
- Trace: `_bmad-output/implementation-artifacts/12-14-ac-trace.md` — gate PASS, 5/5 functional AC's + 3/3 regression findings covered.
- NFR: `_bmad-output/implementation-artifacts/12-14-nfr.md` — PASS on all applicable dimensions (performance, security, reliability/graceful degradation, accessibility, concurrency/idempotency, maintainability).

### Completion Notes List
- Task 1 (kader-state + combineren): `pendingRel: Record<itemId, rel>` toegevoegd; `applyAnnotation`/`relabel` combineren nu via `annotateReviewItem(id, rel, code)` in beide volgordes (AC1, AC2); losse paden (AC3) behouden.
- Task 2 (UI-terugkoppeling): `review.annotatedWithCode` melding ("Keurmerk gemarkeerd op je kader en gekoppeld aan {{code}}") bij de gecombineerde actie (AC4).
- Task 3 (desktop-kaart): `ArtworkReviewItemCard.tsx` geverifieerd — geen relabel/code-pad aanwezig (`onAccept(id)`/`onReject(id)`/`onAnnotate(id, rel)`, geen code-override-mogelijkheid), dus geen fix nodig; vastgelegd als code-comment.
- Task 4 (tests, AC5): 4 tests voor de vier gespecificeerde gevallen (a)-(d) + 3 regressietests voor de tijdens code review gevonden staleness-bug (2× via de gewone knoppen, 1× via de flywheel-redenmodal).
- Task 5 (verificatie): `tsc --noEmit` 0 errors, volledige web-vitest 132/132 groen (na de laatste fix). Backend git-bevestigd ongewijzigd (`git diff HEAD --stat -- apps/api` = leeg).
- CR-fix (niet in de oorspronkelijke tasks, uit adversarial review): `pendingRel`/`assignedCode` worden nu ook opgeruimd in `commitReject` en de decision-switch-tak van `applyDecision`, zodat een latere combineer-actie nooit stilzwijgend een verlaten kader/code van vóór een tussentijdse afwijzing hergebruikt.
- Geen deploy uitgevoerd (permission-gated bij Friso, per afbakening).

### File List
- `apps/web/src/components/review/MobileReviewDeck.tsx` (kern-fix)
- `apps/web/src/components/review/MobileReviewDeck.test.tsx` (7 nieuwe tests: 4 AC + 3 regressie)
- `apps/web/src/components/review/ArtworkReviewItemCard.tsx` (documentatie-comment, geen gedragswijziging)
- `_bmad-output/implementation-artifacts/12-14-ac-trace.md` (nieuw)
- `_bmad-output/implementation-artifacts/12-14-nfr.md` (nieuw)
- `_bmad-output/implementation-artifacts/12-14-adversarial-review.md` (nieuw, verdict: PASS)
- `versions.md` (nieuwe entry 2026-07-14)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status → review + cleanup van een misplaatste 12-13-comment die onder de 12-14-sleutel stond)

## Change Log
- 2026-07-13: aangemaakt. BUGFIX gemeld door Friso: zelfgetekend kader + gekozen code combineren niet in de review-deck → de auto-crop wordt geregistreerd i.p.v. het getekende kader. Frontend-only; backend (`annotate` met `rel`+`t3777Code`) ondersteunt de combinatie al.
- 2026-07-14: geïmplementeerd (kader+code combine, beide volgordes, losse paden behouden, UI-melding, desktop-kaart gedocumenteerd als niet-van-toepassing). Adversarial code review vond en fixte 1× HIGH (stale pending-state bij beslissingswissel). AC-trace PASS (5/5 + 3/3 regressie), NFR PASS. Gates groen: tsc 0, web-vitest 132/132. Status → review (deploy permission-gated).
