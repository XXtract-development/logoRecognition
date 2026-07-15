# Story 12.27 — Nutri-Score-veld in de kruischeck

**Status:** review
**Epic:** 12 (Keurmerk-dekking & Nutri-Score)
**Datum:** 2026-07-15
**Branch:** epic-12-story-12.23-testinfra (worktree logoRecognition-wt-1217)

## Context / aanleiding

Bij de eerste echte end-to-end kruischeck-run op ACC (na de 12.26 jobId-fix en het zetten van API_KEY) bleek dat producten die een Nutri-Score declareren `{"reason":"lege-declaratie","codes":[]}` teruggeven. Oorzaak: `resolveDeclarations()` parseert uitsluitend het T3777-veld (`packagingMarkedLabelAccreditationCode`), terwijl de Nutri-Score-letter in het aparte GS1-veld `nutritionalScore` staat. De hele Nutri-Score-keten (reader 12.22 + A2-vangnet 12.25) was daardoor onzichtbaar voor de kruischeck.

## Acceptatiecriteria

- **AC1** — Een product met `nutritionalScore = D` (en geen T3777-declaraties) levert in verify-declared een declaratieset `['NUTRISCORE_D']` op; bij een actieve referentieklasse en een `nutriscore-head`-detectie ≥ drempel volgt verdict `CONFIRMED` met method `nutriscore-head`.
- **AC2** — T3777-codes en Nutri-Score-codes worden samengevoegd en gededupliceerd; bestaand T3777-gedrag verandert byte-voor-byte niet wanneer er geen Nutri-Score-declaratie is.
- **AC3** — Falen van de marks-resolutie (`resolveDeclaredMarks`) is fail-open: de kruischeck draait door op alleen T3777, met een warn-log.
- **AC4** — Alleen geldige letters (A–E, case-insensitive, getrimd) uit `fieldType === 'NutritionalScore'` mappen naar `NUTRISCORE_<letter>`; al het andere wordt genegeerd (leak-guard: `GENERAL_FOODS`/`DietType` e.d. lekken niet mee).
- **AC5** — Methods `nutriscore-head` en `nutriscore-a2` hebben eigen kruischeck-drempels (env `CROSSCHECK_THRESHOLD_NUTRISCORE_HEAD` default 0.80, `CROSSCHECK_THRESHOLD_NUTRISCORE_A2` default 0.50) in `getThresholdForMethod`.

## Implementatie

- **`apps/api/src/services/t3777-declarations.ts`** — nieuwe pure helper `nutriscoreDeclaredCodes(marks)`: filtert `fieldType === 'NutritionalScore'`, valideert `/^[A-E]$/` na trim+uppercase, dedupt via Set, retourneert gesorteerd als `NUTRISCORE_<letter>`.
- **`apps/api/src/services/pipeline/verify-flow.ts`** — declaratiestap haalt `resolveDeclarations` (T3777) en `resolveDeclaredMarks` (alle sporen, incl. `nutritionalScore`) parallel op (`Promise.all`, settled-object-patroon voor de marks zodat een rejectie fail-open blijft); NS-codes worden gemerged + gededupt in `declaration.codes`; `declaration.reason` flipt alléén van `'lege-declaratie'` naar `'ok'` (harde faalredenen zoals `'api-fout'` worden niet gemaskeerd).
- **`apps/api/src/services/pipeline/verify-flow.ts` (mapVerdicts)** — beste-detectie-per-code-selectie is marge-gebaseerd: `margin(d) = d.confidence − getThresholdForMethod(d.method)` i.p.v. rauwe confidence, zodat een boven-drempel `nutriscore-a2`-hit (bv. 0.55 ≥ 0.50) niet verdrongen wordt door een onder-drempel embedding-hit (bv. 0.79 < 0.80).
- **`apps/api/src/services/artwork-crosscheck.ts`** — twee nieuwe drempelconstanten + switch-cases in `getThresholdForMethod`; commentaar documenteert dat deze paden voor de *live* crosscheck-provider (T3777-only) slapend zijn en alleen via verify-declared actief worden.

## ATDD

- RED: 3 nieuwe tests faalden aantoonbaar vóór implementatie (NS-only → CONFIRMED; merge+dedup; marks-fail fail-open).
- GREEN: implementatie; daarna adversariële review; na verwerking review-fixes 5 extra regressietests.
- Eindstand: `verify-flow.test.ts` 19/19 groen; volledige api-suite **947 passed / 0 failed** (82 files); `tsc --noEmit` 0 fouten.

## Adversariële review (verwerkt)

| # | Ernst | Bevinding | Fix |
|---|-------|-----------|-----|
| M1 | MEDIUM | Cross-method `bestByCode` op rauwe confidence kon een geldige boven-drempel-hit verdringen door een hogere maar onder-drempel-hit van een andere method | Marge-gebaseerde selectie (`confidence − drempel`); regressietest: a2 0.55 verslaat embedding 0.79 |
| M2 | MEDIUM | `reason`-override maskeerde harde faalredenen (`api-fout`) zodra NS-codes aanwezig waren | Override beperkt tot `reason === 'lege-declaratie'`; regressietest: reason blijft `api-fout`, NS-letter wordt wél geverifieerd |
| L | LOW | Twee sequentiële catalog-fetches bij koude cache (2×10s worst-case) | `Promise.all` met settled-object voor de marks-tak |
| L | LOW | Nieuwe drempels suggereren live-crosscheck-dekking die er (nog) niet is | Dormancy-commentaar bij de constanten |
| L | LOW | Testgaten: UNSUPPORTED, NOT_FOUND, maskeer-scenario, realistisch marks-faalpad | 4 tests toegevoegd |

Review-correctie op de reviewer zelf: het M1-voorbeeldscenario (embedding 0.84 vs head 0.80) was geen echte inversie omdat de embedding-kruischeckdrempel 0.80 is (niet 0.85); het echte inversiegeval zit bij het a2-vangnet — de test is daarop gebouwd.

Door de review bevestigd zonder wijziging: cache retourneert verse objecten (mutatie van `declaration` veilig), geen alias-botsingen met `NUTRISCORE_*`, vliegwiel-pollutie onmogelijk (classifier-normalisatie → 0.90-drempel + geen-crop-skip), method-strings byte-exact gelijk aan ml-service.

## Verificatie op ACC (na deploy, permission-gated)

Plan: `POST /api/v1/artwork/<gtin>/verify-declared` met `x-api-key` op een D-declarerend GTIN (08718452660308 / 08719587352908) → verwacht `declaration.codes` bevat `NUTRISCORE_D` en verdict `CONFIRMED` via `nutriscore-head`.
