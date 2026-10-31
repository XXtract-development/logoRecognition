---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-10-31'
spec: _bmad-output/specs/spec-logo-scan-k4aa/SPEC.md
---

# ATDD-checklist — spec-logo-scan-k4aa

- **Stack:** backend (FastAPI ml-service + Fastify API); generatie: AI, geen opname (geen UI).
- **Afwijking van het sjabloon:** tests staan **niet** op `test.skip`. Projectconventie (eerdere `*_atdd`-bestanden) is een actieve rode run, zodat de rode run met aantallen vast te leggen is.
- **Niveaus:** unit/contract in pytest (ml-functies, verzonden body via `httpx.MockTransport`, ASGI-endpoints); integratie in vitest (POST → werker → GET met nep-Redis/-Prisma/-ml-client). Geen E2E.

| CAP | test(s) | prioriteit |
|---|---|---|
| CAP-1 | vitest CAP-1 (6) | P0/P1 |
| CAP-2 | pytest `test_cap2_*` (5) | P0 |
| CAP-3 | pytest `test_cap3_*` (4) | P0 |
| CAP-4 | vitest CAP-4 (4), pytest `test_cap4_*` (2) | P0 |
| CAP-5 | pytest `test_cap5_*` (5 + 4 parametrisch), vitest no_zdr_provider | P0 |
| CAP-6 | vitest CAP-6 (2) | P0 |
| CAP-7 | pytest `test_cap7_*` (6), endpoints (2), lui laden (1) | P0/P1 |
| CAP-8 | vitest stap1 (2), pytest stats/kosten (in `test_cap4_cap8_*`); lokale vergelijking = handmatige eindtoets (script) | P1 |

## Rode run (31-10-2026, vóór de bouw)

- `cd apps/ml-service && <venv py3.11, requirements.txt>/bin/python -m pytest tests/test_k4aa_atdd.py -q` → **29 errors / 29** (`ImportError: cannot import name 'k4aa' from 'app.services'`).
- `cd apps/api && npx vitest run src/__tests__/routes/logo-scans-k4aa.atdd.test.ts` → **12 failed | 3 passed (15)**. De 3 groene zijn bewuste regressiebewakers (zonder variabele draait legacy; legacy-`stap1` ongewijzigd; gedeelde methodedrempel kent `k4aa` niet).

## Aanvulling 31-10-2026 (besluiten Friso): CAP-8b-norm en CAP-9

| CAP | test(s) | prioriteit |
|---|---|---|
| CAP-8b nieuwe norm | pytest `tests/test_k4aa_vergelijk_norm.py` (4) | P1 |
| CAP-9 ACC-limiet 12G, productie ongewijzigd | vitest `logo-scans-k4aa-deploy.atdd.test.ts` (2) | P1 |

Rode run (vóór de wijziging):
- `pytest tests/test_k4aa_vergelijk_norm.py -q` → **4 failed / 4** (`norm_geslaagd` bestaat niet; 0.9-norm nog aanwezig).
- `npx vitest run src/__tests__/routes/logo-scans-k4aa-deploy.atdd.test.ts` → **1 failed | 1 passed (2)**; de groene is de bewaker dat productie op 8G blijft.
