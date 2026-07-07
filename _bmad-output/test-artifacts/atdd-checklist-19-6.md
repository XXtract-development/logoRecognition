---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation', 'step-03-red-verify']
lastStep: 'step-03-red-verify'
lastSaved: '2026-07-06'
inputDocuments:
  - _bmad-output/implementation-artifacts/19-6-bootstrap-drempel-herkalibratie.md
  - _bmad-output/implementation-artifacts/investigations/flywheel-ml-search-0-matches-investigation.md
  - apps/api/src/services/flywheel/config.ts
  - apps/ml-service/app/services/bootstrap_search.py
  - apps/ml-service/app/services/classification.py
  - apps/ml-service/app/services/keurmerk_gate.py
---

# ATDD — Story 19.6: bootstrap-brandstof deblokkeren (drempel + gate)

**Stacks:** api = vitest (apps/api); ml = pytest (apps/ml-service, gedraaid in de ACC-ml-container want lokaal ontbreekt numpy).

## Meet-onderbouwing (uit de investigate)
Root cause bevestigd via sweep (15 klassen/29 GTINs) + visuele verificatie: echte keurmerk-matches cosine 0,60–0,74 (RAINFOREST 0,715, SEPARATE_COLLECTION 0,740, TRIMAN 0,627 — visueel het juiste logo), die de gate met kp 0,25–0,39 ten onrechte afwees. Twee onafhankelijke blokkades → twee wijzigingen.

## Gegenereerde RED-tests

| # | Test | Stack | Verwacht vóór fix | Na fix |
|---|------|-------|-------------------|--------|
| 1 | `getBootstrapThreshold` default = 0,60 | api | **FAIL** (0,93) | PASS |
| 2 | `FLYWHEEL_BOOTSTRAP_THRESHOLD`-override werkt | api | PASS | PASS |
| 3 | `search_with_seed(gate_threshold=0.2)` laat kp 0,3 door | ml | **FAIL** (TypeError: geen param) | PASS |
| 4 | bootstrap-gate default < live 0,5 (kp 0,3 komt door) | ml | **FAIL** (0 matches, gedeelde 0,5) | PASS |

Bestand api: `apps/api/src/__tests__/services/flywheel-bootstrap-threshold-19-6.atdd.test.ts`.
Bestand ml: aangevuld in `apps/ml-service/tests/unit/test_bootstrap_search_service.py` (2 tests, hergebruikt `patched`-fixture).

**Kern van het ontwerp dat de tests afdwingen:** de live-classificatie-gate (`classification.py:118-133`, gedeelde `GATE_THRESHOLD` 0,5) blijft ONGEMOEID; de bootstrap krijgt een APARTE, lagere gate-drempel via `search_with_seed(gate_threshold=…)`. De cosine-lat wordt bootstrap-specifiek verlaagd via `getBootstrapThreshold`. Gold-set/dedup/cap blijven de precisie-noodrem.

## RED-verificatie (2026-07-06)
```
api:  npx vitest run flywheel-bootstrap-threshold-19-6.atdd.test.ts → 1 failed | 1 passed
ml :  pytest test_bootstrap_search_service.py → 2 failed | 9 passed (bestaande 9 ongebroken)
      × test_bootstrap_gate_threshold_scoped_19_6 (TypeError: gate_threshold onbekend)
      × test_bootstrap_gate_default_onder_live_gate_19_6 (kp 0,3 < gedeelde 0,5 → 0 matches)
```
RED correct: de tests dwingen precies de twee wijzigingen af en bewaken dat de bestaande bootstrap-contracten + de live-gate ongemoeid blijven.

## Volgende stap
Adversarial review (story + tests) → dev-story (implementatie: config-default + bootstrap-gescoped gate_threshold) → code review. Precisie-validatie tegen de gold-set + live-verificatierun in dev-story (met toestemming voor ACC-DB-schrijf).
