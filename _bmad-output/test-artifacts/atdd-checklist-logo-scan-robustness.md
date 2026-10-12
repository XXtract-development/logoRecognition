---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: step-05-validate-and-complete
lastSaved: '2026-10-12'
inputDocuments: ['_bmad-output/specs/spec-logo-scan-robustness/SPEC.md', '_bmad-output/implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md', '_bmad/tea/testarch/tea-index.csv', 'apps/api/vitest.config.ts']
---
# ATDD: logo-scanpijplijn robuuster en meetbaar

Backend-scope (API vitest + ml-service pytest), AI-generatie, sequentieel door één schrijver (headless subagent). Geen UI, geen E2E. Alle externe systemen gemockt: Prisma via `helpers/fake-logo-db.ts`, Redis in-memory, ml-client `vi.fn()`; ml-service via de bestaande ASGI-`runtime`-fixture met gestubde backbone, database en provider. Geen netwerk, geen model, geen database.

| Acceptatie | Testniveau | Prioriteit | Bestand |
|---|---|---|---|
| AC-1.1, 1.2, 1.4, 1.5 lege uitsnede | ml route (`/ml/artwork/classify`) | P0 | `apps/ml-service/tests/test_logo_scan_robustness_atdd.py` |
| AC-1.3 gedeelde helper | ml unit (geïsoleerde module-load) | P1 | idem |
| AC-1.6 blank_crop in het GS1-blok | API unit (pure functie) | P1 | `apps/api/src/__tests__/services/gs1-block-robustness.atdd.test.ts` |
| AC-2.1–2.4 foutklassen, log, lek | ml route (`/ml/artwork/localize` visueel), geparametriseerd | P0 | ml atdd |
| AC-3.1 `proposals` | ml route, drie varianten | P1 | ml atdd |
| AC-3.2–3.4 `stap1` in rij, nooit in antwoord | API route + fake DB | P0 | `apps/api/src/__tests__/routes/logo-scans-stap1.atdd.test.ts` |
| AC-4.1–4.5 poolversie | API route + API unit (`effectiveStand`) | P0 | beide API-bestanden |
| AC-5.1 geen 0,99 | API route (ml-client mock) | P0 | stap1.atdd |
| AC-5.2 twijfelachtig selectief | API unit | P1 | gs1-block-robustness.atdd |
| AC-5.3 Nutri-Score-gevolg | geen test: bewust aanvaard gedrag (bestaande tests pinnen het pad met expliciete drempel) | — | — |

## RED evidence (vóór implementatie)
- API: `npx vitest run src/__tests__/services/gs1-block-robustness.atdd.test.ts src/__tests__/routes/logo-scans-stap1.atdd.test.ts` → **14 failed / 8 passed** (de 8 zijn pins van gedrag dat behouden blijft: unknown zonder pool, AC-4.5 `effectiveStand`, AC-5.2, AC-1.6, oude rij, tabelpad, database uit).
- ml-service: `python -m pytest tests/test_logo_scan_robustness_atdd.py -q` → **24 failed / 3 passed** (pins: uitsnede met teken volgt de keten, templateroute zonder `proposals`, `assert_reference_content` blijft weigeren).

## Validatie
Elke AC uit de spec heeft minstens één test, behalve AC-5.3 (aanvaard gedrag, geen contract om te pinnen). Tests draaien zonder netwerk, database of model; geen skips.
