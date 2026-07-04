# Story 19.2: Declaratie-parser naar volledige keurmerk-dekking (5/5 velden)

Status: ready-for-dev

<!-- Aangemaakt via prepare-sprint (bmad-sprint-planning + create-story-vorm), 2026-07-04. Bron: epics-vliegwiel.md Epic 19 / Story 19.2. -->

## Story

Als **ontwikkelaar**
wil ik **de declaratie-lezer alle vijf GDSN-keurmerkvelden laten herkennen**
zodat **het vliegwiel geen keurmerken meer mist die in `enumerationValue` of het aanvullende-logo-veld staan** (FR-22-dekking; raakt FR-1/12/15/20).

### Afbakening (kritiek)
- **Onafhankelijk van de spike (19.1)** — kan parallel. Puur een uitbreiding van de bestaande declaratie-parser; geen media-/infra-werk.
- **Byte-gelijk gedrag voor de al-gedekte 3 velden.** De crosscheck (FR-1), kruischeck (FR-20), bootstrap (FR-12) en mismatch (FR-15) mogen voor bestaande codes exact hetzelfde blijven.
- Geen DB-migratie, geen nieuwe endpoints. Alleen `t3777-declarations.ts` + tests.

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 19.2)*

1. **Given** `parseDeclaredMarks`/`MARK_FIELDS` in `apps/api/src/services/t3777-declarations.ts` (nu 3 velden)
   **When** de story klaar is
   **Then** herkent de lezer ook `enumerationValue` (`consumerInstructionsModule/consumerInstructions/consumerUsageLabelCode/enumerationValueInformation/enumerationValue`) en `localPackagingMarkedLabelAccreditationCodeReference` (`packagingMarkingModule/packagingMarking/localPackagingMarkedLabelAccreditationCodeReference`), elk met de juiste `fieldType`/codelijst-mapping.

2. **Given** de bestaande afnemers (crosscheck FR-1, kruischeck FR-20, bootstrap FR-12, mismatch FR-15)
   **When** de dekking uitbreidt
   **Then** blijft het gedrag voor de al-gedekte 3 velden byte-gelijk, zijn de 2 nieuwe velden namespace-agnostisch geparsed (local-name), en is er een unit-test per veld.

## Tasks / Subtasks

- [ ] 1. **`MARK_FIELDS` uitbreiden (AC: 1)** — twee entries toevoegen aan de array in `t3777-declarations.ts`:
  - `{ tag: 'enumerationValue', fieldType: 'EU_consumerUsageLabelCode' }` (codelijst `EU_consumerUsageLabelCode`, o.a. AISE_1..12, NIX18/zwangerschap-logo's)
  - `{ tag: 'localPackagingMarkedLabelAccreditationCodeReference', fieldType: 'AdditionalPackagingMarkingsCode' }` (codelijst `BENELUX_GDSN_AdditionalPackagingMarkingsCode`)
  - De bestaande regex-aanpak (`<(?:[\w.-]+:)?${tag}[^>]*>([^<]+)<`, local-name, namespace-agnostisch) werkt ongewijzigd voor beide nieuwe tags.
- [ ] 2. **`fieldType`-mapping controleren (AC: 1)** — sluit aan op `reference_logos.fieldType`-conventie (zoals `PackagingMarkedLabelAccreditationCode`/`DietTypeCode`/`NutritionalScore` nu). Kies consistente fieldType-namen en documenteer de codelijst-herkomst (5 lijsten, `Result_4.xlsx`).
- [ ] 3. **Unit-tests per veld (AC: 2)** — test-XML met elk van de 5 velden (incl. namespace-prefix), verifieer dedup per `(fieldType, code)`, trim/uppercase, en dat een XML met alleen de oude 3 velden byte-gelijke output geeft.
- [ ] 4. **Regressie afnemers (AC: 2)** — draai de bestaande crosscheck/kruischeck/bootstrap-tests; geen gedragswijziging voor bestaande codes.

## Dev Notes — Developer Context

### Wat er AL bestaat (hergebruiken)
- `parseDeclaredMarks(xml)` + `MARK_FIELDS` (`apps/api/src/services/t3777-declarations.ts:338-365`) — nu 3 velden: `packagingMarkedLabelAccreditationCode`, `dietTypeCode`, `nutritionalScore`. Namespace-agnostische regex op local-name; union, trim, uppercase, dedup per `(fieldType, code)`.
- `parseT3777Codes` (alleen accreditation) blijft ongemoeid — dat is het smalle T3777-crosscheck-pad.

### Het 951-code-universum (Result_4.xlsx)
- 5 GS1-codelijsten: `PackagingMarkedLabelAccreditationCode` (890), `DietTypeCode` (34), `EU_consumerUsageLabelCode` (20), `NutritionalScore` (7), `AdditionalPackagingMarkingsCode` (0 actief/2 verlopen). De 2 nieuwe velden dekken de laatste twee lijsten.

### Testrichtlijnen
- Unit-tests importeren `parseDeclaredMarks` direct (pure functie). Geen DB/HTTP nodig.

### Project context reference
- `Result_4.xlsx`; geheugen `project_prod_corpus_route`.

## Dev Agent Record

### Agent Model Used
_(in te vullen bij uitvoering)_

## Change Log
- 2026-07-04: aangemaakt via prepare-sprint (Epic 19, correct-course).
