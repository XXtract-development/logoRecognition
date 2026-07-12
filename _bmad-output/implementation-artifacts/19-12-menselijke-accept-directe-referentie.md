---
baseline_commit: 0aab6e2920a2f51415eacbc684e040a2763b886f
---
<!-- Story 19.12 — Menselijke accept = grondwaarheid → directe actieve referentie -->
<!-- Aangemaakt 2026-07-11 via bmad-create-story. Bron: ACC-diagnose + adversariële review + ACC-verificatie 2026-07-11 (geheugen project_recyclable_dead_refs). Uitvoervolgorde 2e van 3 (19.14 → 19.12 → 19.13). -->

# Story 19.12: Menselijke accept = grondwaarheid → directe actieve referentie

Status: done

## Story

As a kwaliteitsbeheerder,
I want dat een expliciete menselijke goedkeuring (accept) van een review-crop áltijd direct een actieve referentie oplevert — ongeacht de nominatie-vlag,
so that menselijke grondwaarheid niet stil verloren gaat aan automatische drempels die voor onbevestigde nominaties bedoeld zijn, en de bibliotheek voor élk keurmerk betrouwbaar groeit.

## Afbakening (kritiek — geverifieerde root cause)

Op ACC (2026-07-11, read-only geverifieerd; corrigeert de eerder vermoede "class-exists skip", die NIET bestaat):

- `FLYWHEEL_NOMINATION_ENABLED=true` (live). In de accept-handler betekent dat: de goedgekeurde crop gaat via `enqueueNominations(..., 'review')` (`apps/api/src/api/v1/artwork-pipeline.ts:1106-1120`) de **nominatie→promotie-pijplijn** in. Die promotie moet de automatische guardrails passeren (o.a. crosscheck-drempel 0,80, promotiedrempel), wat echte crops (~0,70 cosine) niet halen.
- **Gevolg (bewijs):** er bestaan **0 `flywheel-promotion`-referenties** in de hele database — voor géén enkel keurmerk. Menselijke goedkeuringen onder de live-vlag worden dus nooit een actieve referentie. De 125 `review-confirmed` referenties zijn **historisch** (uit het vlag-uit-tijdperk).
- De **vlag-uit-tak** (`artwork-pipeline.ts:1121-1147`) doet het wél goed: `mlClient.registerReference(cropPath, t3777Code)` → directe `review-confirmed` referentie (via `register_crop_as_reference`, default `source='review-confirmed'`).
- Symptoom in de diagnose: RECYCLABLE kreeg 0 review-confirmed refs ondanks 2 goedkeuringen — maar dat is het verwachte gedrag van de vlag-aan-tak, niet een RECYCLABLE-specifieke bug. Het raakt **alle** keurmerken.

**Gekozen fix-richting (akkoord Friso — "breed fixen, grondwaarheid direct"):** een expliciete menselijke accept moet áltijd direct een actieve referentie aanmaken (zoals de vlag-uit-tak), ongeacht `FLYWHEEL_NOMINATION_ENABLED`. De automatische guardrails (bedoeld voor onbevestigde nominaties) mogen een mens-bevestigde crop niet kunnen droppen.

**Niet in scope:** de auto-confirm van onbeoordeelde matches / de crosscheck-vloer voor niet-menselijke stromen (dat is de aparte crosscheck-vloer-vraag, resume Task 2). Deze story gaat uitsluitend over de **mens-bevestigde accept**. Ook niet in scope: de RECYCLABLE-dataherstel (19.13) en de index (19.14).

## Acceptatiecriteria

1. **Given** `FLYWHEEL_NOMINATION_ENABLED=true` (de live-toestand)
   **When** een reviewer een crop expliciet bevestigt (accept in de review-queue)
   **Then** ontstaat direct een actieve referentie (`active=true`, `source='review-confirmed'`) MET embedding, zónder dat de crosscheck-/promotiedrempels de mens-bevestigde crop kunnen droppen.

2. **Given** een keurmerkklasse waarvan alle bestaande `reference_logos`-rijen inactief zijn (of geen embedding hebben)
   **When** een crop voor die klasse wordt geaccepteerd
   **Then** blokkeert de aanwezigheid van die dode rijen de nieuwe actieve referentie niet; idempotentie geldt per `storage_path` (geen tweede actieve referentie voor dezelfde crop).

3. **Given** de reopen/relabel-symmetrie
   **When** een geaccepteerd item wordt heropend
   **Then** deactiveert de zojuist-aangemaakte actieve referentie mee — bevestig dat de nieuwe referentie `source='review-confirmed'` gebruikt, want de reopen-deactivatie (`artwork-pipeline.ts` reopen, ~regel 1431) raakt alleen die bron.

4. **Given** een falende regressietest die het huidige gat aantoont (accept onder vlag-aan → geen actieve referentie)
   **When** de fix is toegepast
   **Then** bewijst de test (rood→groen) dat accept een actieve `review-confirmed` referentie + embedding produceert, ook voor een klasse met bestaande inactieve refs.

## Tasks / Subtasks

- [x] **Task 1 — Accept-tak: directe registratie ongeacht vlag** (AC: 1, 2)
  - [x] Beide menselijke-accept-handlers aangepast (`artwork-pipeline.ts`): review-item-accept (~1080) én human-annotation-accept (~1228). `mlClient.registerReference(cropPath/cropKey, code)` is uit de `else` gehaald en draait nu ALTIJD (ongeacht `isNominationEnabled()`). **Keuze (herzien na code-review):** de nominatie-enqueue is bij accept/annotate VERVALLEN — review-nominaties slaan de promotiedrempel over (`nomination.ts`, 19.11) en `promoteOne` kent geen storage_path-guard, dus behoud van de nominatie zou een tweede, dubbele actieve referentie maken naast de directe registratie. De gold-set-aanwas (14.1, `recordAcceptDecision`) blijft achter de vlag.
  - [x] Idempotentie per `storage_path` geborgd via de bestaande guard in `register_crop_as_reference` (`apps/ml-service/app/services/similarity.py:347-352`) — dubbele accept geeft geen dubbele actieve ref.
- [x] **Task 2 — Symmetrie & baseline** (AC: 3)
  - [x] `source='review-confirmed'` (default van `register_crop_as_reference`) → reopen-deactivatie (`artwork-pipeline.ts` reopen, source='review-confirmed') sluit daarop aan. `markBaselineStale` bij `added` behouden met nieuwe reden `'review-accept-registratie'` (toegevoegd aan `BaselineInvalidationReason`, `baseline.ts:38`).
- [x] **Task 3 — Regressietest** (AC: 4)
  - [x] `flywheel-review-redirect.routes.test.ts` bijgewerkt naar het 19.12-contract: vlag AAN → `registerReference` WÉL aangeroepen (`toHaveBeenCalledWith`) ÉN nominatie geënqueue-d. Dit faalt op het oude 13.2-ombuiggedrag (rood→groen). Vlag-uit-regressietest ongewijzigd groen. Volledige api-suite: 885 passed, tsc 0.
- [ ] **Task 4 — Meting/verificatie (ACC, post-deploy, met toestemming)** (AC: 1)
  - [ ] Na deploy + toestemming: her-accepteer een testcrop en verifieer read-only dat er een `review-confirmed` ref + embedding bij komt (voor een klasse met bestaande inactieve refs). Geen ACC-schrijf zonder go. Niet uitgevoerd in de dev-fase.

### Review Findings

_Code-review 2026-07-11 (3 adversariële lagen). Kern: de fix zelf klopte, maar mijn oorspronkelijke keuze "nominatie behouden" bleek een duplicaat-bron._

- [x] [Review][Patch] **CRITICAL — dubbele actieve ref**: directe review-confirmed ref + behouden review-nominatie (promoteert via 19.11-bypass; `promoteOne` zonder storage_path-guard) → twee refs per crop. **Opgelost:** nominatie bij accept/annotate laten vervallen (beide handlers). [artwork-pipeline.ts]
- [x] [Review][Patch] **HIGH — annotate-handler ongetest**: tweede handler kreeg dezelfde altijd-aan registratie zonder test. **Opgelost:** annotate-routetest toegevoegd (echt PNG-buffer via sharp, `downloadTrainingObject` gemockt) → registerReference met `annot_{id}.png`, geen nominatie. [flywheel-review-redirect.routes.test.ts]
- [x] [Review][Patch] **MEDIUM — enqueue-faalt-blokkeert-registratie**: `enqueueNominations` (niet in try/catch) draaide vóór de verplichte registratie → 500 + item al `registered` → 409 op retry. **Opgelost:** enqueue verwijderd uit het accept-pad. [artwork-pipeline.ts]
- [x] [Review][Defer] **MEDIUM — `promoteOne` mist storage_path-guard**: defensieve invariant voor de promotie-transactie → `deferred-work.md` (eigen story/test). Voor 19.12 al afgedekt door de nominatie-drop.
- [x] [Review][Defer] MEDIUM — "altijd een referentie" faalt stil bij ml-hapering (geen retry/backfill); gecorrigeerde her-annotatie stil genegeerd (idempotente cropkey); `t3777Code`-override niet gevalideerd; accept-idempotentie-guard-asymmetrie (M1) → allen pre-existing/defensief, `deferred-work.md`.
- [x] [Review][Defer] MEDIUM — AC-dekking `source='review-confirmed'` + embedding: code-geverifieerd in de ml-service (mocked in Node-routetests), post-deploy bevestigd (Task 4) → `deferred-work.md`.

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE)

- `apps/api/src/api/v1/artwork-pipeline.ts:1106-1120` — vlag-AAN accept-tak: `enqueueNominations(gtin, [...], [t3777Code], 'review')`. Dit is de bron van het gat: de mens-bevestigde crop wordt een nominatie i.p.v. een referentie.
- `apps/api/src/api/v1/artwork-pipeline.ts:1121-1147` — vlag-UIT accept-tak: `mlClient.registerReference(cropPath, t3777Code)` → directe referentie + `markBaselineStale` bij `added`. Dit is het gewenste gedrag dat generiek moet worden.
- `apps/api/src/services/flywheel/promotion.ts` — `PROMOTION_SOURCE='flywheel-promotion'` + guardrails (crosscheck/drempel/cap). Verklaart waarom nominaties niet promoveren.
- `apps/ml-service/app/services/similarity.py:316-423` — `register_crop_as_reference`: skip op bestaande actieve `storage_path` (347-352) en near-dup binnen dezelfde code (371-385); default `source='review-confirmed'`. Géén "code bestaat al"-skip.

### Waarom dit klopt (bewijs)

- 0 `flywheel-promotion`-refs in de DB (query over alle sources); 125 `review-confirmed` zijn historisch. `FLYWHEEL_NOMINATION_ENABLED=true` in de app-container-env op ACC.
- De vlag-uit-tak bewijst dat directe registratie werkt en `review-confirmed` produceert — de fix generaliseert dat gedrag naar de mens-accept, ongeacht vlag.

### Wat behouden moet blijven

- De gold-set-aanwas (`recordReviewDecision(..., source:'review-accept')`, ~1088-1104) en hard-negative/dedup-logica ongemoeid.
- De nominatie-/promotie-pijplijn voor **niet-menselijke** stromen (bootstrap, sampler) mag niet veranderen — alleen de expliciete menselijke accept krijgt het directe pad.
- Reopen-symmetrie: nieuwe ref moet meedeactiveren bij reopen (dus `source='review-confirmed'`).

### References

- [Bron: `_bmad-output/planning-artifacts/epics-vliegwiel.md`#Story 19.12: Menselijke accept = grondwaarheid → directe actieve referentie]
- [Bron: `apps/api/src/api/v1/artwork-pipeline.ts:1106-1147` — accept-handler (vlag-aan/uit takken)]
- [Bron: `apps/api/src/api/v1/artwork-pipeline.ts:1431` — reopen-deactivatie (source='review-confirmed')]
- [Bron: `apps/api/src/services/flywheel/promotion.ts` — PROMOTION_SOURCE + guardrails]
- [Bron: `apps/ml-service/app/services/similarity.py:316` — register_crop_as_reference]
- [Bron: geheugen `project_recyclable_dead_refs` — ACC-verificatie 2026-07-11]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — bmad-dev-story

### Debug Log References

- `npx vitest run flywheel-review-redirect.routes.test.ts` → 2 passed (nieuw 19.12-contract + vlag-uit-regressie).
- `npx vitest run artwork-pipeline.routes.test.ts flywheel-crosscheck-hook.test.ts` → 46 passed (geen regressie).
- `npx tsc --noEmit` → 0 errors (na toevoegen `'review-accept-registratie'` aan `BaselineInvalidationReason`).
- `npx vitest run` (volledige api-suite) → **885 passed, 2 skipped, 67 todo** (9 ATDD-bestanden skip zoals gebruikelijk); geen failures.

### Completion Notes List

- **Kern:** beide expliciete-menselijke-accept-handlers (review-item-accept + human-annotation-accept) registreren de bevestigde crop nu ALTIJD direct als `review-confirmed` referentie (`mlClient.registerReference`), ongeacht `FLYWHEEL_NOMINATION_ENABLED`. Voorheen ging de crop onder de vlag alleen als nominatie de promotie-pijplijn in, waar de guardrails (crosscheck 0,80) echte crops (~0,70) droppen → 0 `flywheel-promotion` refs, mens-bevestigingen verdampten.
- **Ontwerpkeuze (herzien na code-review):** de nominatie-enqueue is bij accept/annotate VERVALLEN. De code-review toonde dat behoud een duplicaat-bron is: review-nominaties slaan de promotiedrempel over (`nomination.ts`, 19.11) en `promoteOne` heeft geen storage_path-guard → dat zou een tweede, dubbele actieve ref maken. Direct registreren is nu het enige ref-pad voor een menselijke accept; idempotentie per `storage_path` voorkomt dubbele actieve refs. De gold-set-aanwas (14.1) blijft achter de vlag.
- **Code-review (3 lagen):** 1 CRITICAL + 2 HIGH/MEDIUM opgelost (duplicaat-ref, annotate-test, enqueue-blokkeert-registratie); 6 punten gedefereerd naar `deferred-work.md` (o.a. `promoteOne` storage_path-guard, ml-hapering-retry, override-validatie). Volledige api-suite na fixes: 886 passed, tsc 0.
- **Superseded:** 19.12 overrulet de 13.2-AC6-ombuiging voor het referentie-deel; de bestaande route-test is bijgewerkt (niet verwijderd) zodat het nieuwe contract expliciet geborgd blijft.
- **Scope-borging:** de nominatie-/promotie-pijplijn voor NIET-menselijke stromen (bootstrap/sampler, herkomst ≠ review) is ongemoeid.
- **Task 4 (post-deploy):** read-only ACC-verificatie ná deploy, met toestemming. Geen ACC-schrijf in de dev-fase.

### File List

- `apps/api/src/api/v1/artwork-pipeline.ts` (M) — beide menselijke-accept-handlers (review-item-accept + human-annotation): `registerReference` uit de `else` → draait altijd; nominatie-enqueue VERWIJDERD (duplicaat-preventie); gold-set-aanwas behouden.
- `apps/api/src/services/flywheel/baseline.ts` (M) — nieuwe `BaselineInvalidationReason` `'review-accept-registratie'`.
- `apps/api/src/__tests__/api/flywheel-review-redirect.routes.test.ts` (M) — 3 tests: accept vlag-aan/uit (directe registratie, geen nominatie) + nieuwe annotate-routetest; header/describe naar 19.12-contract.

## Change Log

| Datum | Versie | Wijziging | Auteur |
|-------|--------|-----------|--------|
| 2026-07-11 | 0.1 | Story aangemaakt via bmad-create-story (uit ACC-diagnose + adversariële review + ACC-verificatie) | Friso / AI |
| 2026-07-11 | 0.2 | Dev-story: menselijke accept registreert crop altijd direct (review-confirmed), beide handlers; route-test naar 19.12-contract (rood→groen); api-suite 885 groen, tsc 0. Status → review. | AI |
| 2026-07-11 | 0.3 | Code-review (3 lagen): CRITICAL duplicaat-ref opgelost door nominatie bij accept/annotate te laten vervallen; annotate-routetest toegevoegd; 6 defers → deferred-work.md. api-suite 886 groen, tsc 0. Status → done. | AI |
