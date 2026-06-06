# Story 9.4: Champion/challenger-kwaliteitsgate

Status: ready-for-dev

## Story

As a datamanager,
I want dat alleen modellen die aantoonbaar beter zijn ter goedkeuring worden aangeboden,
so that ik geen tijd verlies aan beoordelen van modellen die het niet waard zijn.

## Acceptance Criteria

1. **Gate: pass bij gelijke holdout-set (FR56):** Given een afgeronde training met holdout-evaluatie (Story 7.2), When de gate-stap draait met een challenger die de actieve champion haalt of overtreft op de configureerbare drempel (default: holdoutAccuracy ≥ champion), Then is `verdict.passed = true` And gaat de challenger door naar de goedkeurings-queue (Story 9.5).

2. **Gate: fail bij slechtere accuracy (FR56):** Given een challenger met lagere accuracy dan de champion op dezelfde holdout-set, When de gate-stap draait, Then is `verdict.passed = false` And bevat `verdict.comparison` de cijfers van beide modellen (championAccuracy, challengerAccuracy).

3. **Gate: weigering bij ongelijke holdout-set:** Given een challenger en champion geëvalueerd op verschillende holdout-sets (verschillende holdoutHash), When de gate-stap draait, Then is `verdict.passed = false` And bevat `verdict.reason` een tekst die match op `/holdout/i` — vergelijking op ongelijke basis is altijd ongeldig.

4. **Edgecase: geen actief model (eerste run):** Given er is geen actief model (eerste trainingsrun of alle modellen gedeactiveerd), When de gate-stap draait, Then is `verdict.passed = true` (auto-pass — er is geen champion om te verslaan) And bevat `verdict.reason` een tekst die aangeeft dat er geen champion was.

5. **Edgecase: actief model zonder holdout-metrics (pre-7.2):** Given het actieve model heeft geen `holdoutHash` (getraind vóór Epic 7.2), When de gate-stap draait, Then is `verdict.passed = true` (auto-pass — geen geldige baseline) And wordt dit in het verdict gedocumenteerd zodat de goedkeurder weet dat de gate niet als echte vergelijking telde.

6. **Gate-failure-pad: registratie en notificatie (FR56):** Given een challenger die de gate niet haalt, When de flow afrondt, Then wordt het model wél geregistreerd (versiebeheer blijft intact, `isActive: false`, `metrics.gate.passed: false`) And ontvang ik een notificatie (Socket.IO-event `gate_failed`) met de vergelijkingscijfers en de reden.

7. **Configureerbare drempel (FR56):** Given een afwijkende drempelwaarde geconfigureerd via `GATE_MIN_IMPROVEMENT` (default `0.0` — gelijke of betere accuracy), When de gate-stap draait, Then wordt de drempel in de vergelijking meegenomen (challenger.accuracy ≥ champion.accuracy + drempel).

## Tasks / Subtasks

- [ ] Task 1: Quality-gate module `apps/api/src/services/pipeline/quality-gate.ts` (AC: 1, 2, 3, 4, 5, 7)
  - [ ] **ATDD-contract (training-pipeline-queue.test.ts — exact, 3 bestaande tests):**
    - `evaluateGate({ champion: { holdoutAccuracy: 0.91, holdoutHash }, challenger: { holdoutAccuracy: 0.93, holdoutHash } })` → `{ passed: true }`
    - `evaluateGate({ ..., challenger.accuracy: 0.85 })` → `{ passed: false, comparison: { championAccuracy: 0.91, challengerAccuracy: 0.85 } }`
    - `evaluateGate({ ..., challenger.holdoutHash: 'sha256:OTHER' })` → `{ passed: false, reason: /holdout/i }`
  - [ ] Edgecase-behandeling (AC 4): geen champion (`champion: null | undefined`) → `{ passed: true, reason: 'geen actief model — eerste run' }`
  - [ ] Edgecase-behandeling (AC 5): champion zonder holdoutHash (`champion.holdoutHash: null`) → `{ passed: true, reason: 'champion zonder holdout-metrics (pre-7.2 model)' }`
  - [ ] Drempel-parameter: `evaluateGate` accepteert optionele `minImprovement: number` (default 0.0 of uit `GATE_MIN_IMPROVEMENT` env); challenger.accuracy >= champion.accuracy + minImprovement is de gate-conditie

- [ ] Task 2: Nieuwe ATDD-tests voor edgecases en gate-failure (AC: 4, 5, 6, 7)
  - [ ] Voeg **4 nieuwe** `it.skip`-tests toe aan `training-pipeline-queue.test.ts` (Quality gate describe):
    - `should auto-pass when there is no active champion (first run)` — champion=null → passed=true, reason bevat 'geen actief model'
    - `should auto-pass when champion has no holdout metrics (pre-7.2)` — champion.holdoutHash=null → passed=true, reason bevat 'pre-7.2'
    - `should notify with comparison figures when gate fails` — gate-failure triggert Socket.IO-emit `gate_failed` met `comparison`-object
    - `should respect a non-zero minImprovement threshold` — challenger.accuracy=0.92, champion=0.91, minImprovement=0.02 → passed=false (niet 0.01 verbeterd)
  - [ ] Verwijder `.skip` van alle 7 gate-tests (3 bestaande + 4 nieuw) zodra Task 1 geïmplementeerd is

- [ ] Task 3: Gate-failure-afhandeling in de flow (AC: 6)
  - [ ] In de `evaluate-model`-stap van training-flow.ts: na `evaluateGate`, als `verdict.passed === false` → registreer het model (Prisma `modelVersion.create/update` met `isActive: false`, `metrics.gate.passed: false`) + emit Socket.IO-event `gate_failed` met `{ modelVersionId, comparison, reason }`
  - [ ] Event-naam `gate_failed` volgt architectuur-conventie (snake_case met type-prefix)

- [ ] Task 4: Registratie gate-passing challengers (AC: 1)
  - [ ] Als `verdict.passed === true`: update `modelVersion.metrics` met `{ gate: { passed: true, timestamp } }` + voeg toe aan de goedkeurings-queue (status-veld op modelVersion: `pendingApproval: true`)

- [ ] Task 5: Tests groen (alle ACs)
  - [ ] `.skip` weg: **3 bestaande service-tests** + **4 nieuwe** in `training-pipeline-queue.test.ts` (Quality gate describe — totaal 7)
  - [ ] Geen e2e voor 9.4 (de gate-resultaten zijn zichtbaar via 9.5's goedkeuringsscherm)

## Dev Notes

### ⚠️ Epic 8-learnings (verplicht toepassen)

1. **Dubbele schema-bron:** elke datamodel-wijziging in ZOWEL Prisma-schema ALS `infrastructure/docker/postgres/init.sql` (+ GRANT).
2. **Deploy-realiteit:** Docker-build draait `prisma generate` + `tsc`.
3. **Monorepo-worktrees:** node_modules root + per-app symlinken.
4. **ML-service blijft REST:** gate-logica is volledig op de Node/API-kant.
5. **ATDD = contract:** response-shapes exact; de holdoutHash-check sluit exact aan op 7.2-implementatie (`sha256:<hex>`, trainer.py:303 → holdout-metrics.ts:24).

### Champion-edgecases zijn essentieel

Zonder expliciete behandeling van AC 4 en AC 5 crasht de gate bij de eerste trainingsrun (geen champion in DB) of bij een legacy-model (geen holdoutHash). Beide moeten auto-pass zijn — de datamanager kan pas de gate verliezen als er een geldige baseline is.

### Gate-drempel als veiligheidsmarge

De default `GATE_MIN_IMPROVEMENT=0.0` laat een gelijke accuracy door (niet strenger dan de champion). Een hogere drempel (bijv. `0.02`) eist dat de challenger minstens 2 procentpunt beter is. Dit is aantoonbaar vereist door de ATDD-test op afwijkende drempelwaarde (bevinding #15 uit de review).

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/services/pipeline/training-flow.ts` (9.3) | integratiepunt evaluate-model-stap |
| `apps/api/src/services/socket-io-manager.ts` | Socket.IO-emit-patroon |
| `apps/ml-service/app/services/trainer.py:303` | holdoutHash-formaat (`sha256:<hex>`) |
| `apps/api/src/api/v1/training.ts` | modelVersion Prisma-queries als referentie |

### References

- [Source: epics.md#Story 9.4] · [Source: atdd-checklist-epic-8-9.md — gate-contract] · [Source: review-epic-9-voorwerk.md bevinding #6, #7, #15] · [Source: PRD FR56, NFR-A5]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
