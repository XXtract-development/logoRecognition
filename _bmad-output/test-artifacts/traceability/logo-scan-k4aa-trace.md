---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-10-31'
spec: _bmad-output/specs/spec-logo-scan-k4aa/SPEC.md
run: 2 (na besluiten Friso 31-10: norm CAP-8b, CAP-9, ontheffing)
vorige_uitslag: FAIL (run 1, commit fc6730d)
---

# Traceability — spec-logo-scan-k4aa

## Gate Decision: WAIVED

Zonder ontheffing is de uitslag FAIL. Regel 3: P1-dekking 2/3 = 67% < 80%.

De enige open eis is CAP-8 deel (b). Het hek gebruikt de nieuwe norm: de route wijkt niet meer af van spike K4-aa run 1 dan de spike van zichzelf. De telregel is die van het script, voor beide metingen. Uitslag 31-10:
- route → run 1: 21/23. Dat haalt de norm (spike run 2 → run 1: 22/25).
- run 1 → route: 21/27. Dat haalt de norm niet (run 1 → run 2: 23/27).

**Ontheffing door Friso, 31-10-2026 (regel 6, handmatig).** Reden: het verschil van 2 meldingen op 27 past bij de wisselvalligheid van Gemini. De echte kwaliteitstoets is de latere validatie door een mens op nieuwe etiketten. Vastgelegd in SPEC.md CAP-8 en in `.memlog.md`.

## Coverage Summary

- Criteria: 9 (P0: 6, P1: 3)
- Volledig gedekt: 8/9 (89%)
- P0: 6/6 (100%)
- P1: 2/3 (67%), ontheven op CAP-8b
- Testruns 31-10-2026, na de tweede reviewronde:
  - ml-service `pytest tests/`: 828 geslaagd, 14 overgeslagen;
  - API `vitest run`: 1643 geslaagd, 2 overgeslagen, 67 todo;
  - ruff, black, isort en tsc: schoon.

## Traceability Matrix

| CAP | prio | tests (niveau) | dekking |
|---|---|---|---|
| CAP-1 schakelaar, schema, route vast bij aanvraag | P0 | vitest CAP-1 (integratie), legacy-`stap1` ongewijzigd | FULL |
| CAP-2 K1a byte-gelijk | P0 | pytest `test_cap2_*` (5) | FULL |
| CAP-3 top-3-poort + samenvoegen | P0 | pytest `test_cap3_*`, cacheverversing; lokaal (a) 50/50 | FULL |
| CAP-4 7 bruikbaar, niets automatisch | P0 | vitest CAP-4 (4), pytest `test_cap4_*` (2) | FULL |
| CAP-5 nul-bewaring, fail-closed | P0 | pytest `test_cap5_*` + multi-venster; vitest no_zdr_provider; lokaal: 91/91 aanroepen naar aanbieder "Google" | FULL |
| CAP-6 hergebruik per route | P0 | vitest CAP-6 + mislukte/time-out-scans met `/k4aa` | FULL |
| CAP-7 SigLIP-referenties naast B0 | P1 | pytest `test_cap7_*`, sync, endpoints, lui laden | FULL (alleen unit; SQL-integratietest staat in deferred-work) |
| CAP-8 lokale gelijkheid + kosten per scan | P1 | vitest stap1; pytest kosten/pogingen; pytest `test_k4aa_vergelijk_norm.py` (7: norm, spreiding, richtingen, mislukte etiketten, herbeoordeling); lokaal (a) geslaagd, (b) niet gehaald | PARTIAL, ontheven |
| CAP-9 ACC-limiet 12G, productie 8G | P1 | vitest `logo-scans-k4aa-deploy.atdd.test.ts` (2) | FULL |

## Gaps & Recommendations

1. CAP-8b: ontheven. De validatie door een mens op nieuwe etiketten volgt vóór "automatisch" (SPEC Non-goals).
2. In deferred-work: SQL-integratietest vóór migratie 0023, en de 12G herzien na de proeven.
3. Het geheugen in de container is niet getoetst; geen proeven in de live container.

Bronnen:
- `../../implementation-artifacts/investigations/k4aa-lokale-vergelijking-20261031.md`
- `../../implementation-artifacts/spec-logo-scan-k4aa.md`
- `../../implementation-artifacts/spec-logo-scan-k4aa-2.md`
