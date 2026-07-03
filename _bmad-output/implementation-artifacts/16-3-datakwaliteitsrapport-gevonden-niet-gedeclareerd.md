# Story 16.3: Datakwaliteitsrapport gevonden-niet-gedeclareerd

Status: ready-for-dev

<!-- Aangemaakt via create-story workflow, 2026-07-02. Epic 16 — Mismatch-stromen als brandstof en datakwaliteitssignaal. -->

## Story

As a **datamanager**,
I want **een exporteerbaar periodiek overzicht van keurmerken die wél op verpakkingen staan maar níet gedeclareerd zijn**,
So that **ik leveranciers gericht op declaratie-omissies kan wijzen**.

### Afbakening

- **Intern rapport** (PRD §5-non-goal): geen automatische communicatie richting leveranciers; terugkoppeling is menselijk werk buiten dit systeem.
- Geen nieuwe registratie: het rapport is een **leesprojectie** over de `found-not-declared`-events uit Story 16.1 (die al alleen boven de promotiedrempel geschreven worden — FR-16-voorwaarde is daar afgedwongen, hiér niet opnieuw filteren met een tweede drempel-implementatie).
- Geen schemawijziging: deze story migreert niets.
- **Afhankelijkheid:** Story 16.1 (`mismatch_events` gevuld met `found-not-declared`). Dashboard-knop hangt aan de /flywheel-pagina's (Epic 15); zolang die er niet zijn is het endpoint zelfstandig bruikbaar en getest.

## Acceptatiecriteria

1. **Rapport per informatieleverancier.**
   **Given** de `found-not-declared`-events van een periode
   **When** de datamanager het rapport opvraagt
   **Then** is het gegroepeerd per informatieleverancier (GLN) en bevat het per geval GTIN, code, confidence en bronbestand — voldoende voor menselijke verificatie (FR-16)
   **And** is het exporteerbaar vanuit het dashboard via endpoint `reports/data-quality` (FR-16, UX-DR3).
   Endpoint: `GET /api/v1/flywheel/reports/data-quality` (spine-endpointset) met periode-parameters (van/tot) en optionele GLN-filter; exportformaat CSV (download) naast de JSON-weergave voor het dashboard.

2. **Bronrestrictie (NFR-6 — hard).**
   **Given** de bronrestrictie
   **When** het rapport of de export wordt samengesteld
   **Then** bevat het uitsluitend eigen crops en verwijzingen — **nooit GS1-gidsbeelden** (NFR-6).
   Concreet: crop-/bestandsverwijzingen in rapport en export komen uitsluitend uit de eigen verwerkingsdata (bronbestand + `artwork-crops/`-paden); paden onder het `reference-logos/`-prefix (de gids-/referentiebibliotheek, `apps/api/src/api/v1/reference-logos.ts:105`) verschijnen nergens in de payload — afgedwongen met een expliciete guard + test, niet alleen per conventie.

3. **Tests.**
   - Unit (vitest, apps/api): groepering per GLN (incl. GLN=null → groep "onbekend"), periode-afbakening (randen inclusief/exclusief gedocumenteerd), CSV-serialisatie (velden GTIN/code/confidence/bronbestand, delimiter-/quoting-randgevallen).
   - NFR-6-guard-test: een event-set met (kunstmatig) een `reference-logos/`-pad ⇒ rapport weigert/filtert dat veld en logt een waarschuwing — de export bevat het pad aantoonbaar niet.
   - Integratie: geseede events → endpoint-respons (JSON + CSV-download-headers); leeg-rapport-pad (geen events in periode) geeft een geldige lege respons.
   - E2E: NIET aan de stable-subset-gate toevoegen.

## Tasks / Subtasks

- [ ] 1. Rapport-service `apps/api/src/services/flywheel/data-quality-report.ts`: query over `mismatch_events` (type `found-not-declared`, periode, groepering per GLN) + rapportmodel (AC: 1). Filter op reguliere herkomst; cohort-herkomst (`cohort-*`, Story 16.4) uitsluiten uit deze aggregatie.
- [ ] 2. NFR-6-guard: pad-validator (weiger/filter alles onder `reference-logos/`) als herbruikbare functie — ook bruikbaar door latere export-stories (AC: 2)
- [ ] 3. Endpoint `GET /api/v1/flywheel/reports/data-quality` (JSON + `?format=csv` download) in het flywheel-routebestand (AC: 1)
- [ ] 4. Dashboard-export-knop: alleen indien de /flywheel-pagina's (15.2) al bestaan — anders endpoint + docblock en dit noteren in Dev Agent Record (AC: 1)
- [ ] 5. Unit-/integratietests incl. NFR-6-guard (AC: 3)
- [ ] 6. versions.md (NL) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy

## Dev Notes — Developer Context

### Wat er AL bestaat (geverifieerd 2026-07-02, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Eventbron mét drempelfilter | `mismatch_events` (Story 16.1) — `found-not-declared` wordt dáár alleen ≥ promotiedrempel geschreven (16.1-AC2) | Het rapport leest; het filtert niet opnieuw op confidence (één drempel-implementatie, geen drift tussen registratie en rapport). |
| GLN per verwerking | Op het event zelf (16.1); oorsprong `artwork_imports.gln` (`apps/api/prisma/schema.prisma` :448) | Groepeersleutel. Null-GLN's bestaan tot Epic 18 het archief dekt — groep "onbekend", niet weglaten (anders verdwijnen signalen stil). |
| Bronbestand/crop per geval | `mismatch_events`-payload (16.1: sourceFile/cropPath via de crosscheck-detectie, vgl. `CrosscheckDetection.cropPath/sourceFile` — `apps/api/src/services/artwork-crosscheck.ts` :66–73); eigen crops onder `artwork-crops/{gtin}/...` (patroon `queue_harvest.py` :174) | De "voldoende voor menselijke verificatie"-velden. |
| Referentie-/gidsbeeld-prefix | `reference-logos/{code}/{variant}.{ext}` (`apps/api/src/api/v1/reference-logos.ts` :105; seeds-README `apps/api/seeds/reference-logos/README.md`) | Wat er per NFR-6 juist NIET in mag — de guard kent dit prefix. |
| v1-route- + auth-patroon | `apps/api/src/api/v1/` bestaande routebestanden; JWT-auth via bestaande `authMiddleware` | Rapport is een ingelogde dashboard-functie (datamanager), geen system-API-key-route. |

### Wat er NIEUW is

1. `apps/api/src/services/flywheel/data-quality-report.ts` — query, groepering, rapportmodel, CSV-serialisatie.
2. NFR-6-pad-guard (herbruikbaar, met test).
3. Route `reports/data-quality` in `apps/api/src/api/v1/flywheel.ts` (spine source-tree).
4. Optioneel (indien 15.2 al gemerged): export-knop op het mismatch-/rapport-paneel.

### Bindende AD's

- **AD-2** — rapport leeft volledig in `apps/api`; ml-service is niet betrokken (geen beeldverwerking nodig — het rapport verwijst, het rendert geen beelden).
- **AD-13** — elk rapportgeval is herleidbaar naar zijn event (runId/verwerking).
- **NFR-6 / Consistency Convention "GS1-gidsbeelden"** — "uitsluitend in het bootstrap-zoekpad; nooit in exports, API-responses of rapporten — exports en rapporten bevatten uitsluitend eigen crop-paden." Dit is de bindende regel achter AC2.

### Guardrails (voorkom bekende fouten)

- **Geen schemawijziging** in deze story; mocht er tóch een kolom nodig blijken → stoppen en eerst toestemming vragen (ARCH-2), niet omheen werken.
- **Geen tweede confidence-drempel:** het drempelfilter zit in de registratie (16.1); een extra filter hier maskeert registratiefouten.
- **NFR-6 afdwingen, niet aannemen:** de guard + test zijn onderdeel van de definition of done; "er staan nu toch geen gidspaden in de data" is geen argument.
- **Export streaming-vriendelijk houden** bij grote periodes (CSV per rij schrijven, geen volledige set in geheugen samenstellen) — het 39k-archief kan dit rapport later groot maken.
- Deploy-volgorde ml → api → web (hier api, evt. web); ghcr-workflow laten slagen vóór Coolify-deploy.
- Commits/PRs Engels; `versions.md` (NL) in DEZELFDE commit.
- E2E buiten de stable-subset-gate.

### Testrichtlijnen

- Vitest, apps/api. Groeperings- en periode-logica puur testen; CSV-output snapshot-arm houden (assert op velden, niet op hele bestanden).
- NFR-6-guard: positieve én negatieve casus; guard-log aantoonbaar.
- Integratie: JSON- en CSV-pad, lege periode, GLN-filter.

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 16.3 (AC-bron).
- `ARCHITECTURE-SPINE.md` — endpointset (`reports/data-quality`), Consistency Convention GS1-gidsbeelden, AD-2, AD-13.
- PRD §4.5 FR-16 (+ §5 non-goal "geen automatische communicatie richting leveranciers"; §8 bronrestrictie).
- `_bmad-output/implementation-artifacts/16-1-mismatch-registratie-en-aggregatie.md` — eventcontract en drempelafdwinging.

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Story 16.3, PRD FR-16/NFR-6 en de spine-endpointset.
