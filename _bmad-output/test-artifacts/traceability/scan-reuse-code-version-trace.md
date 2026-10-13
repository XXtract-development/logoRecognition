---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-10-13'
---

# Traceability — spec-scan-reuse-code-version

- **Spec:** `_bmad-output/specs/spec-scan-reuse-code-version/SPEC.md` (CAP-1..CAP-7)
- **Tests:** `apps/api/src/__tests__/routes/logo-scans-dedupe.test.ts` (API-niveau, vitest; Prisma en Redis gemockt via `fake-logo-db`, dat `where` en de unieke sleutel echt toepast)
- **Gemeten:** 13-10-2026, `npx vitest run src/__tests__/routes/logo-scans-dedupe.test.ts` → 41/41 passed; volledige API-suite 1622 passed, 2 skipped, 67 todo.

## Matrix

| Criterium | Prio | Tests | Dekking | Fout-/randpad |
|---|---|---|---|---|
| CAP-1 andere codeversie → nieuwe scan, attempt per sleutel (ook rescan) | P0 | `CAP-1: after a deploy …` | FULL | rescan onder A (attempt 2) en onder C (attempt 1) |
| CAP-2 zelfde codeversie → hergebruik | P0 | `CAP-2 …`, AC1 `same product + image + versions …` | FULL | n.v.t. |
| CAP-3 onbekend/ongeldig → nooit hergebruik, scan werkt | P0 | `CAP-3 (…)` × 4: geen env, `acc`+geldige SOURCE_COMMIT, korte hash, datum | FULL | alle vier ongeldige vormen |
| CAP-4 bronvolgorde + normalisatie, per aanvraag gelezen | P1 | `CAP-4: LOGO_IMAGE_TAG wins …`, `CAP-4: whitespace and upper case …` | FULL | lege tag, ontbrekende tag, wissel SOURCE_COMMIT |
| CAP-5 sleutel op elke rij; `@none`; geen botsing | P1 | `CAP-5: every stored row …` (done, superseded, `model-1@none`, `unknown@none`), `CAP-5: … @<hash> cannot collide`, AC4 opgeslagen rij | FULL | superseded-pad, ontbrekende modelversie |
| CAP-6 antwoord-modelVersion ongewijzigd | P1 | `CAP-6 …` (done én failed) | FULL | failed-pad; timeout deelt `failedState`; omzettabel krijgt dezelfde `input.modelVersion` (`gs1-block.ts` r.65/75) |
| CAP-7 documentatie | P2 | handmatige controle: `api-specification.md` bevat sleutel, bronvolgorde, gedrag zonder codeversie en herstart `attempt` (elk 1 treffer via `grep -F`) | FULL (handmatig) | n.v.t. |

## Gaten

- Geen P0/P1-gaten.
- Bekend en uitgesteld (deferred-work.md): taak die vóór een uitrol in de wachtrij stond en erna draait; commit in de image bakken.
- Bijvangst: drie bestaande AC1-controles toetsten zonder `productId` niets; gerepareerd.

## Gate

- P0: 3/3 = 100%. P1: 3/3 = 100%. Overall: 7/7 = 100%.
- **Besluit: PASS** — P0 100%, P1 100% (doel 90%), overall 100% (minimum 80%).
