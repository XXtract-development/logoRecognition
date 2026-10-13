---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-10-13'
---

# ATDD-checklist — spec-scan-reuse-code-version

- **Spec:** `_bmad-output/specs/spec-scan-reuse-code-version/SPEC.md`
- **Stack:** backend (API, vitest 2.1.8); Prisma en Redis gemockt via `src/__tests__/helpers/fake-logo-db.ts`.
- **Uitvoering:** sequentieel (één testbestand, één worker); geen E2E (pure API).
- **Testbestand:** `apps/api/src/__tests__/routes/logo-scans-dedupe.test.ts` (uitgebreid; testopzet zet `LOGO_IMAGE_TAG` op een vaste hash en verwijdert `SOURCE_COMMIT`).

## Strategie en dekking

| Criterium | Test | Niveau | Prio | Rood vóór bouw |
|---|---|---|---|---|
| CAP-1 andere codeversie → nieuwe scan, attempt per sleutel | `CAP-1: after a deploy …` | API | P0 | ja |
| CAP-2 zelfde codeversie → hergebruik | `CAP-2: within the same code version …` + bestaande AC1 | API | P0 | nee (regressiewacht) |
| CAP-3 onbekend/ongeldig → nooit hergebruik (4 varianten) | `CAP-3: unknown or invalid code version (…)` | API | P0 | ja |
| CAP-4 bronvolgorde | `CAP-4: LOGO_IMAGE_TAG wins …` | API | P1 | ja |
| CAP-4 normalisatie | `CAP-4: whitespace and upper case …` | API | P2 | ja |
| CAP-5 sleutel op elke rij (done, superseded, `@none`, `unknown@none`) | `CAP-5: every stored row …` + AC4-rij | API | P1 | ja |
| CAP-5 geen botsing bij `@` in modelversie | `CAP-5: a model version containing @<hash> …` | API | P2 | nee (wacht) |
| CAP-6 antwoord-modelVersion ongewijzigd, ook bij failed | `CAP-6: the answer modelVersion …` | API | P1 | nee (wacht) |
| CAP-7 documentatie | — (doc-controle in trace) | — | P2 | n.v.t. |

## Rode fase (gemeten 13-10-2026, vóór implementatie)

`npx vitest run src/__tests__/routes/logo-scans-dedupe.test.ts` → 9 failed | 32 passed (41). Basislijn zonder nieuwe tests: 30/30 groen.

## Bijvangst

Drie bestaande AC1-controles (andere modelversie/referentiepool, onbekende modelversie, ouder dan 24 uur) postten zonder `productId` en waren daardoor altijd groen, ongeacht het gedrag. Ze sturen nu `productId` mee en toetsen echt; ze blijven groen.

## Validatie (checklist.md)

- Voorwaarden: spec met toetsbare criteria, vitest-configuratie aanwezig — in orde.
- Tests falen om de juiste reden (sleutel zonder codeversie) — gecontroleerd per falende test.
- Geen tijdelijke artefacten buiten `_bmad-output/test-artifacts/`; geen browsersessies.

## Groene fase (na `bmad-build`, 13-10-2026)

- Dedupe-bestand: 41 passed (41). Volledige API-suite: 1622 passed, 2 skipped, 67 todo; `tsc --noEmit` schoon.
