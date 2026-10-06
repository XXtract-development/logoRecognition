---
title: 'Verhaal 1.6 Codes tegen de GS1-lijst'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
baseline_commit: '221843941208d341b6fc22dada4fb845780d6def'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Een ongeldige GS1-waarde in `gs1-mapping.json` kan tot de XML komen; er is geen controle tegen de officiële codelijst (FR-12, AD-10, AR-1).

**Approach:** Een afgeleid, gecommit bestand met alleen codewaarden uit GS1 Benelux datamodel 3.1.37.1 (gegenereerd door een lokaal script uit de xlsx, hash gecontroleerd), een vitest-controle in de normale suite die de omzettabel ertegen toetst, en een runtime-functie `isValidGs1Value` waarmee de GS1-blokbouwer (1.5) ongeldige items weglaat en logt.

## Boundaries & Constraints

**Always:** alleen codewaarden in het afgeleide bestand (geen omschrijvingen); bovenaan `release`, `bronSha256`, `gegenereerdOp`; `nutritionalScore` als aparte constante (A..E, EXEMPT) met bronverwijzing Attributen rij 411 en NutritionalProgramCode rij 4963; CI draait tegen het afgeleide bestand, nooit de xlsx; ongeldig item = hele item weglaten (ook een groep), detectie blijft, `logger.warn` met `ongeldige_gs1_waarde`.

**Never:** de xlsx committen; `logoResults.v1.json` (hash gepind) wijzigen; database, migratie, push, netwerk.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| Actieve regel, waarde in lijst | alle 68 voorstel-regels | geldig |
| Afwijkende keurmerkcode | 52 codes uit gs1-not-in-codelist | niet in lijst, regel `uit` met reden |
| Interne code als waarde | NUTRISCORE_A, GHS02 | ongeldig; omzetting geeft A / FLAME |
| Alias | MARINE_STEWARDSHIP_COUNCIL | omzetting geeft ..._LABEL (geldig) |
| Booleaanse waarde | isDietTypeMarkedOnPackage | alleen `true`/`false` |
| Onbekend veld | x | ongeldig |
| Ongeldige waarde in blokbouwer | bogus | item weg, warn gelogd |

</frozen-after-approval>

## Code Map

- `apps/api/scripts/generate-gs1-codelists.py` — nieuw (lokaal, `uv run --with openpyxl`), controleert sha256.
- `apps/api/src/services/gs1-codelists/gs1-codelists-3.1.37.1.json` + `index.ts` — nieuw.
- `apps/api/src/services/pipeline/gs1-block.ts` — filter op `isValidGs1Value`.
- `apps/api/src/__tests__/services/gs1-codelists.test.ts` — ATDD, bestaat al.
- Docs: `apps/api/README.md` sectie regenereren; `docs/02-architecture/api-specification.md` verwijzing.

## Tasks & Acceptance

- [x] Script + afgeleid bestand + index.ts
- [x] Blokbouwer weigert ongeldige waarden
- [x] Docs
- [x] `gs1-codelists.test.ts` groen; regressiesuites groen
