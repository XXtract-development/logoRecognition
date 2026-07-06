---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation', 'step-03-red-verify']
lastStep: 'step-03-red-verify'
lastSaved: '2026-07-06'
inputDocuments:
  - _bmad-output/implementation-artifacts/19-5-declaratie-guard-op-5-5-velden.md
  - apps/api/src/services/flywheel/bootstrap-run.ts
  - apps/api/src/services/t3777-declarations.ts
  - apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts
  - apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts
---

# ATDD — Story 19.5: Declaratie-guard op 5/5 keurmerkvelden

**Stack:** backend (apps/api, vitest 2.1.8). Framework aanwezig; geen browser-tests nodig (unit/service-niveau).

## Preflight
- Story `ready-for-dev` met 4 heldere acceptatiecriteria. ✔
- Betrokken unit: `searchAndNominateClass` (`apps/api/src/services/flywheel/bootstrap-run.ts`), geëxporteerd → direct testbaar. ✔
- Bestaande patronen gespiegeld uit `flywheel-bootstrap-run.test.ts` + `flywheel-balanced-sampler.test.ts` (globale prisma/mlClient-mock via setup.ts; `nomination` + `t3777-declarations` module-mock). ✔

## Gegenereerde testen (RED)
Bestand: `apps/api/src/__tests__/services/flywheel-guard-5-5.atdd.test.ts` (5 tests).

| # | Test | AC | Verwacht vóór fix | Verwacht na fix |
|---|------|----|-------------------|-----------------|
| 1 | keurmerk via `enumerationValue` (PREGNANCY_WARNING) passeert guard | AC1 | **FAIL** (guard=T3777-only weigert) | PASS |
| 2 | keurmerk via `dietTypeCode` (VEGAN) passeert guard | AC1 | **FAIL** | PASS |
| 3 | accreditatie-code (T3777) passeert ongewijzigd | AC3 | PASS | PASS |
| 4 | niet-declarerende GTIN overgeslagen + geteld | AC2 | PASS | PASS |
| 5 | fail-closed bij reason != ok | AC2 | PASS | PASS |

**Ontwerp van de sleuteltest (1 & 2):** de twee declaratie-lezers lopen bewust uiteen —
`resolveDeclarations` (T3777-only) geeft leeg terug, `resolveDeclaredMarks` (5/5) geeft
het keurmerk terug via een niet-T3777-veld. Op de huidige code (guard = `resolveDeclarations`)
valt de GTIN af en wordt `mlClient.bootstrapSearch` nooit aangeroepen → rood. Na de fix
(guard = 5/5 declared-marks) passeert de GTIN → groen. Dit is exact het go-live-defect dat
de gemockte tests misten (die mockten alléén `resolveDeclarations`).

## RED-verificatie (uitgevoerd 2026-07-06)
```
npx vitest run src/__tests__/services/flywheel-guard-5-5.atdd.test.ts
→ Test Files 1 failed (1) | Tests 2 failed | 3 passed (5)
  × AC1 enumerationValue → expected bootstrapSearch called 1x, got 0
  × AC1 dietTypeCode      → expected bootstrapSearch called 1x, got 0
  ✓ AC3 accreditatie / AC2 niet-declarerend / AC2 fail-closed
```
De 2 falende tests zijn de mismatch-vangers; de 3 groene borgen het te behouden contract
(regressie). RED-fase correct: de suite dwingt de fix af en bewaakt tegelijk bootstrap 17.1.

## Volgende stap
Adversarial review op story + tests (fix indien nodig) → `dev-story` (guard omzetten naar
`resolveDeclaredMarks`, tests groen) → `code-review`.
