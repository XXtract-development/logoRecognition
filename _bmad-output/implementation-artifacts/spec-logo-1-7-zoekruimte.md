---
title: 'Verhaal 1.7 Zoekruimte beperken op productcategorie'
type: 'feature'
created: '2026-10-06'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c28cdd362113d4a94ca0116414c0f4cf82e58125'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** De logo-scan zoekt altijd alle soorten, ook Nutri-Score en dieetlogo's op een schoonmaakmiddel. Dat kost looptijd en geeft valse treffers.

**Approach:** Geeft de aanvraag `gpcCategoryCode` mee, dan beperkt de scanworker de `codes`-lijst voor de lokalisatie via de kolom `categorieen` (GPC-prefixen) in `gs1-mapping.json`. De gebruikte beperking staat in `logoResults.zoekruimte`.

## Boundaries & Constraints

**Always:**
- GPC-code = precies 8 cijfers; segment = eerste 2, family = 4, class = 6, brick = 8. `categorieen` bevat prefixen (strings van 2/4/6/8 cijfers); een soort is zinvol als de gpc-code met één van die prefixen begint.
- Een soort met lege `categorieen`, of zonder regel in de omzettabel, valt nooit af (Green Dot, FSC, recycling, alle keurmerken, GHS).
- Zonder code, bij een ongeldige code (geen 8 cijfers): volledige set. Een geldige code die geen enkele soort uitsluit geeft ook de volledige set (`beperkt: false`).
- Gevuld wordt alleen wat zeker is: Alleen Nutri-Score (5) krijgt `["50"]` (segment Voeding/Drank/Tabak); dieetsoorten (34) blijven leeg tot de ACC-meting (besluit Friso 2026-10-06, gewijzigd na review). GHS en alles overig blijft leeg, want een gemist gevaarsymbool is onaanvaardbaar en de GPC-dekking is niet bewezen. Dit staat in de README van de bronbestanden en in de API-specificatie.
- De vulling loopt via `categorieen-overrides.json` en `generate-gs1-mapping.js`; het JSON wordt nooit met de hand bewerkt. `policyVersion` verandert daardoor, bewust.
- `zoekruimte` is optioneel in `logoResults.v1.json` (`schemaVersion` blijft `'1'`: optioneel veld); `.sha256` en `LOGO_RESULTS_SCHEMA_SHA256` volgen het schema.
- Dezelfde lokaliseer- en classificeeraanroepen; alleen de lijst codes wordt kleiner.

**Never:**
- Geen prisma-migratie, geen databaseverbinding, geen netwerk naar ACC of productie, geen push, PR, Zoho of uitrol.
- Geen GPC-bricklijst of code die niet-voedsel opsomt; geen aanpassing van `/detect`, `/recognize`, verify-declared of ghs-review.
- Het meetscript draait niet tegen echte omgevingen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Geen code | `gpcCategoryCode` ontbreekt | volledige set; `zoekruimte {beperkt:false, aantalSoorten:n}` | N/A |
| Ongeldige code | `abc`, `123`, 9 cijfers | volledige set, `beperkt:false` | geen fout |
| Voedsel | `50200000` | Nutri-Score, dieet, keurmerken en GHS blijven | N/A |
| Niet-voedsel | `47000000` | alleen Nutri-Score valt af; dieet, keurmerken en GHS blijven; `beperkt:true` | N/A |
| Lege `categorieen` | elke code | soort blijft | N/A |
| Prefixmatch | `50`, `5020`, `502000`, `50200000` tegen `50200000` | zinvol; `5021`, `50200001`, `51` niet | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/services/zoekruimte.ts` -- NIEUW: `isGpcCode`, `beperkSoorten(codes, gpc, lookup = findGs1Entry)` -> `{codes, zoekruimte}`.
- `apps/api/src/services/gs1-mapping.ts` -- `findGs1Entry` hergebruiken; `validateMapping` krijgt controle: prefixen 2/4/6/8 cijfers en GHS-soorten (`isGhsCode`) houden lege `categorieen`; commentaar op `categorieen` actualiseren (prefixen).
- `apps/api/src/services/pipeline/logo-scan-flow.ts` -- `recognize()` bouwt `codes` (regel ~148); filter daar via `beperkSoorten`, geef `zoekruimte` terug, via `buildLogoResults` in het resultaat. `state.gpcCategoryCode` is al aanwezig. `failedState` laat `zoekruimte` weg.
- `apps/api/src/services/pipeline/gs1-block.ts` -- `BuildInput.zoekruimte?`, `LogoResults.zoekruimte?`, constante `LOGO_RESULTS_SCHEMA_SHA256`.
- `apps/api/src/schemas/logoResults.v1.json` + `.sha256` -- optioneel object `zoekruimte` (`gpcCategoryCode` string pattern ^[0-9]{8}$, `beperkt` boolean, `aantalSoorten` integer >= 0; verplicht `beperkt`, `aantalSoorten`; geen extra velden).
- `apps/api/scripts/generate-gs1-mapping.js` + `scripts/gs1-mapping-sources/categorieen-overrides.json` (NIEUW, per categorie: `{"NutritionalScore":["50"]}`) -- toepassen op `categoryOf`; onbekende categorie of ongeldige prefix = fout. Daarna regenereren.
- `apps/api/scripts/meet-zoekruimte.ts` (NIEUW) -- meetscript: map beelden + CSV (bestand,gpc), ACC-URL en sleutel uit omgeving (`LOGO_SCAN_URL`, `LOGO_SCAN_KEY`); per beeld twee scans (met/zonder `gpcCategoryCode`), schrijft looptijd, aantal items, verschillen naar CSV/JSON. Weigert te draaien zonder expliciete `--bevestig`.
- `docs/02-architecture/api-specification.md` (~regel 361) en README bij `scripts/gs1-mapping-sources/` -- beschrijven filter, keuze en reden, `zoekruimte`.
- Tests (staan al, falend): `src/__tests__/services/zoekruimte.test.ts`, blok "Story 1.7" in `src/__tests__/routes/logo-scans-flow.test.ts`. Bestaande tests (gs1-mapping, gs1-block, logo-scans-gs1) die de oude hash of lege categorieen verwachten bewust bijwerken.

## Tasks & Acceptance

**Execution:**
- [ ] `categorieen-overrides.json` + generator -- vulling Nutri-Score `["50"]`, regenereren -- AD-2
- [ ] `zoekruimte.ts` + `gs1-mapping.ts` validatie -- filterlogica -- FR-4
- [ ] `logo-scan-flow.ts` + `gs1-block.ts` + schema/sha -- filter in worker, `zoekruimte` vastleggen -- FR-4
- [ ] `meet-zoekruimte.ts` -- meetscript, niet uitgevoerd -- meting op ACC later
- [ ] docs en README -- keuze en reden vastleggen

**Acceptance Criteria:**
- Given een aanvraag met `gpcCategoryCode` 47000000, when de worker draait, then bevat de lokalisatie-aanroep geen Nutri-Score maar wel dieetsoorten, keurmerken en gevaarsymbolen.
- Given geen of onbekende code, when de worker draait, then wordt de volledige set gezocht.
- Given een afgerond resultaat, then valideert `logoResults` met `zoekruimte` tegen het schema.
- Given de bestaande suites (gs1-mapping, gs1-block, gs1-codelists, logo-scans-*, legacy-detect, recognition, verify-declared, ghs-review), then blijven ze groen.
- GAT (niet lokaal): meting op minstens 30 echte beelden (looptijd, valse treffers, gemiste logo's).

## Implementation Notes

- Filter staat in `recognize()` (extra parameter `gpcCategoryCode`), `zoekruimte` loopt via de returnwaarde naar `buildLogoResults`; `failedState` laat het weg.
- `Zoekruimte`-type staat in `zoekruimte.ts` en wordt in `gs1-block.ts` als type-import gebruikt.
- `gs1-mapping-sources/README.md` bestond niet; nieuw aangemaakt.
- Nieuwe sha256 schema: ea6abb7becc1dba827b02b0f9e2aebed964dcc1ef9179004616a4714f4499056 (ook in `.sha256`, constante en api-specification.md).
- Meetscript niet uitgevoerd en niet getypecheckt tegen een omgeving; `--bevestig` verplicht.
- Volledige suite `src/__tests__`: 108 bestanden groen. `tsc` toont bestaande Prisma-implicit-any fouten, geen in de gewijzigde bestanden.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm --filter @logo-recognition/api exec vitest run src/__tests__/services/zoekruimte.test.ts src/__tests__/routes src/__tests__/services/gs1-mapping.test.ts src/__tests__/services/gs1-block.test.ts src/__tests__/services/gs1-codelists.test.ts` -- expected: groen
- `node apps/api/scripts/generate-gs1-mapping.js` en daarna `git diff --stat` -- expected: alleen categorieen en policy-gerelateerde regels
