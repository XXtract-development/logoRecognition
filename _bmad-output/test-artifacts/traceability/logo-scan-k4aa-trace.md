---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-10-31'
spec: _bmad-output/specs/spec-logo-scan-k4aa/SPEC.md
commit: 628a36b4be296796680bd28a561098e64e1082d8
---

# Traceability — spec-logo-scan-k4aa

## Gate Decision: FAIL (regel 3: P1-dekking 50% < 80%)

Oorzaak is één meetcriterium, geen ontbrekende test: CAP-8 deel (b) haalt de vooraf gezette norm (≥ 90% overeenkomst in beide richtingen met spike K4-aa run 1) in één richting niet (78%). De spike haalt diezelfde norm tegen zichzelf ook niet (run 1 ↔ run 2: 78% / 84%). Zie `../../implementation-artifacts/investigations/k4aa-lokale-vergelijking-20261031.md`. Opheffen kan alleen via een uitdrukkelijke ontheffing (WAIVED) door Friso of een bijgestelde norm; niet door deze workflow.

## Coverage Summary

- Criteria: 8 (P0: 6, P1: 2)
- Volledig gedekt: 7 / 8 (87,5%)
- P0: 6 / 6 (100%)
- P1: 1 / 2 (50%)
- Testruns (31-10-2026, na review): ml-service `pytest tests/` 821 geslaagd / 14 overgeslagen; API `vitest run` 1641 geslaagd / 2 overgeslagen / 67 todo; ruff, black, isort, tsc schoon.

## Traceability Matrix

| CAP | prio | tests (niveau) | dekking |
|---|---|---|---|
| CAP-1 schakelaar, schema, route vast bij aanvraag | P0 | vitest: legacy zonder variabele, onbekende waarde → legacy + waarschuwing, k4aa strict ≤165 s + schema-geldig, route vast bij aanvraag, box buiten beeld/vreemde methode/zekerheid > 1 → result_invalid, nul detecties (integratie); legacy-`stap1` ongewijzigd | FULL |
| CAP-2 K1a byte-gelijk | P0 | pytest `test_cap2_*` (5): hashes instructie/schema/blad + model, vensters = tile_windows(6), JPEG-codering = spike, body per venster (nep-transport), parse | FULL |
| CAP-3 top-3-poort + samenvoegen | P0 | pytest `test_cap3_*` (4), `test_reference_set_change_*`; lokaal (a) 50/50 gelijk aan spike | FULL |
| CAP-4 7 bruikbaar, niets automatisch, categorie | P0 | vitest CAP-4 (4: redenen, ingespoten `automatisch`-tabel, gedeelde drempel onaangeroerd, categorie); pytest `test_cap4_*` (2) | FULL |
| CAP-5 nul-bewaring, fail-closed, foutklassen, geen logs | P0 | pytest `test_cap5_*` (5 + 5 parametrisch), `test_one_window_without_zdr_provider_*`, caplog in `test_cap4_cap8_*`, endpoint 503-detail; vitest no_zdr_provider zonder terugval | FULL |
| CAP-6 hergebruik per route | P0 | vitest CAP-6 (2) + mislukte scan `/k4aa` + lees-time-out met route | FULL |
| CAP-7 SigLIP-referenties naast B0 | P1 | pytest `test_cap7_*` (6), sync overslaan/niets-te-doen, endpoint 422/409, lui laden via legacy-verzoek; migratie + Prisma-model (tsc/prisma generate) | FULL (unit; SQL-integratietest uitgesteld, zie deferred-work) |
| CAP-8 lokale gelijkheid + kosten per scan | P1 | vitest stap1 (kosten, tokens, pogingen, aanbieders); pytest kosten over pogingen / onbekend = null; lokaal (a) geslaagd, (b) 21/23 en 21/27 | PARTIAL |

## Gaps & Recommendations

1. CAP-8 (b): norm niet gehaald; verschil even groot als de eigen spreiding van de spike. Aanbeveling: norm vervangen door "binnen de spreiding run 1 ↔ run 2 van de spike" of ontheffing; daarna is de gate PASS (P1 100%).
2. SQL van `get_siglip_references`/`upsert_siglip_embedding` alleen via mocks (deferred-work, vóór migratie 0023 op ACC).
3. Geheugen op ACC: niet getoetst in de container (regel: geen proeven in de live container); ACC staat nu al op 6,57 / 8 GiB.

## Next Actions

- Friso: ontheffing of bijgestelde norm voor CAP-8 (b).
- Hoofdsessie: migratie 0023 (akkoord), sync, keuze werkers/geheugen vóór `LOGO_SCAN_ROUTE=k4aa` op ACC.
