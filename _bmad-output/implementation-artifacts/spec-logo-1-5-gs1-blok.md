---
title: 'Verhaal 1.5 GS1-blok in het antwoord'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
baseline_commit: '399ccee7cb04e77e96b852bcbf9ba4278c75f034'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De scanworker levert alleen ruwe detecties (`schemaVersion: 'pending'`, `items: []`); afnemers moeten zelf soorten naar GS1-velden omzetten.

**Approach:** Een bouwer `pipeline/gs1-block.ts` zet detecties met de omzettabel (1.4) om naar `logoResults` v1 (schema `schemas/logoResults.v1.json`, validatie met ajv in de worker). Opnamestand per item = effectieve stand uit 1.4, verlaagd naar `voorstel` bij zekerheid onder de drempel van de methode, `uncertain`/`requires_review`, GHS en tegenstrijdigheid.

## Boundaries & Constraints

**Always:** waarden uit de tabel, nooit interne codes; per soort één item (hoogste zekerheid), alle detecties blijven in `detections`; tegenstrijdig = twee items met dezelfde `groep` en hetzelfde `veld` met verschillende waarde; `signalWord` alleen DANGER|WARNING, ongewijzigd, anders weglaten; GHS-item zonder signaalwoord krijgt markering `signaalwoord ontbreekt`; deterministische uitvoer (items gesorteerd op soort).

**Never:** `/detect`, `/recognize`, `verify-declared`, `/ghs/review` wijzigen; database, migratie, push; `skipped` gebruiken; `afgewezen` uitgeven.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| Nutri-Score C | NUTRISCORE_C | één groep: nutritionalScore C + nutritionalProgramCode 8 |
| Soort buiten tabel / uit | onbekend of stand uit | geen item, wel detectie |
| Onder drempel / uncertain / GHS 0,99 | zie FR-8 | voorstel |
| Twee Nutri-Score-letters | A en C | beide voorstel |
| Dezelfde soort op twee plekken | 0,91 en 0,95 | één item 0,95 |
| Classificatie deels ontbreekt | minder resultaten dan crops | status partial, reden classification_incomplete |
| Fout | ML faalt | logoResults status failed + reden |

</frozen-after-approval>

## Code Map

- `apps/api/src/services/pipeline/gs1-block.ts` — nieuw: `buildLogoResults`, `validateLogoResults`, schema-hash.
- `apps/api/src/schemas/logoResults.v1.json` + `.sha256` — nieuw.
- `apps/api/src/services/pipeline/logo-scan-flow.ts` — worker bouwt resultaat; `signalWord`; partial/failed.
- `apps/api/src/api/v1/logo-scans.ts` — veld `signalWord`.
- `apps/api/src/api/legacy-detect.ts` — alleen `SCORE_KINDS` exporteren.
- Hergebruik: `gs1-mapping.ts` (`resolveSoort`, `policyVersion`), `artwork-crosscheck.ts` (`getThresholdForMethod`).

## Tasks & Acceptance

- [ ] Schema + hash, bouwer, worker, route, docs (`docs/02-architecture/api-specification.md`)
- [ ] Tests `gs1-block.test.ts`, `logo-scans-gs1.test.ts` groen; regressiesuites groen
