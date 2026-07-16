# Story 12.16: Declared-marks-parser — tag-grens tegen prefix-collisie (categorie-code-lek)

Status: done

<!-- BUGFIX (API). Gesignaleerd 2026-07-13 tijdens de Nutri-Score-dekking-analyse (12.15-voorwerk): de parseDeclaredMarks/parseT3777Codes-regex matcht een tag ZONDER grens na de naam, waardoor een langere tag met dezelfde prefix meelekt — concreet: `nutritionalScore` matcht óók `nutritionalScoreProductCategoryCode` (categorie-codes GENERAL_FOODS/CHEESES lekken onder fieldType NutritionalScore). Raakt de 12.7-relabel-picker (declared-marks-hint) en de crosscheck-hint. Los van 12.15 (die filtert lokaal al hard op A–E). Friso: pak op als losse story. -->

## Story

Als **ontwikkelaar van de declaratie-kruischeck en de relabel-picker**
wil ik **dat `parseDeclaredMarks`/`parseT3777Codes` een GS1-declaratie-tag alleen matcht als het de VOLLEDIGE elementnaam is (grens na de tagnaam)**
zodat **een langere tag met dezelfde prefix niet meelekt — met name `nutritionalScoreProductCategoryCode` (categorie-code) niet als een `nutritionalScore`-letter wordt gelezen** — waardoor de declared-marks (relabel-picker-hint + crosscheck) schoon en correct zijn.

### Afbakening
- **API-only**, `apps/api/src/services/t3777-declarations.ts`. Fix in de tag-matching-regex van `parseDeclaredMarks` (en dezelfde patroon-bug in `parseT3777Codes`). Geen ander gedrag wijzigen.
- **Geen wijziging aan** de fetch/cache/fail-safe-keten, de MARK_FIELDS-inhoud, of de consumerUsageLabelCode-gescopete parse (die is al correct begrensd via het blok-patroon).
- Story 12.15 filtert voor de Nutri-Score-oogst al lokaal op exact A–E; deze story lost de bron structureel op zodat ook de relabel-picker/crosscheck geen categorie-codes meer tonen.

## Oorzaak (bewezen)
- `parseDeclaredMarks` (regel ~385): `new RegExp(\`<(?:[\\w.-]+:)?${tag}[^>]*>([^<]+)<\`, 'g')`. Voor `tag='nutritionalScore'` matcht `<nutritionalScore[^>]*>` óók `<nutritionalScoreProductCategoryCode>…<` omdat `[^>]*` "ProductCategoryCode" opslokt → de categorie-waarde (bv. `GENERAL_FOODS`) wordt als een `NutritionalScore`-mark toegevoegd.
- `parseT3777Codes` (regel ~82) heeft hetzelfde patroon (`packagingMarkedLabelAccreditationCode[^>]*>`) en dus dezelfde prefix-collisie-gevoeligheid.
- Bewijs: dekking-analyse zag onder fieldType `NutritionalScore` naast A–E ook `GENERAL_FOODS` (128×), `CHEESES` (5×), … — dat zijn `nutritionalScoreProductCategoryCode`-waarden.

## Acceptatiecriteria
1. **Tag-grens**
   **Given** een tradeItem-XML met zowel `<nutritionalScore>C</nutritionalScore>` als `<nutritionalScoreProductCategoryCode>GENERAL_FOODS</…>`
   **When** `parseDeclaredMarks` draait
   **Then** bevat het resultaat de mark `{code:'C', fieldType:'NutritionalScore'}` en NIET `{code:'GENERAL_FOODS', fieldType:'NutritionalScore'}` (de categorie-code lekt niet meer).
2. **Geen regressie op de echte tags**
   **Given** de bestaande, correct-gevormde elementen (`packagingMarkedLabelAccreditationCode`, `localPackagingMarkedLabelAccreditationCodeReference`, `dietTypeCode`, `nutritionalScore`, en de gescopete `consumerUsageLabelCode/enumerationValue`)
   **When** de parsers draaien
   **Then** worden die nog steeds correct gematcht (namespace-prefix-agnostisch, union over lagen, dedup) — inclusief het correcte onderscheid tussen `packagingMarkedLabelAccreditationCode` en `localPackagingMarkedLabelAccreditationCodeReference` (twee aparte MARK_FIELDS).
3. **`parseT3777Codes` dezelfde grens**
   **Given** dezelfde prefix-collisie-gevoeligheid
   **When** `parseT3777Codes` draait
   **Then** matcht ook die alleen de volledige tagnaam (geen langere-prefix-tag lekt mee), zonder de bestaande T3777-crosscheck-uitkomsten te wijzigen.
4. **Tests**
   **Given** de fix
   **When** de tests draaien
   **Then** dekken ze AC1-3: category-code-lek weg, alle echte tags nog gematcht, prefix-collisie afgevangen (bv. een kunstmatige `<xTagLonger>`-casus), en de bestaande parser-tests blijven groen.

## Tasks / Subtasks
- [ ] 1. **Tag-grens toevoegen (AC1, AC2, AC3)** — pas de gedeelde tag-regex aan zodat na de tagnaam een grens vereist is (bv. lookahead `(?=[\\s/>])` — tag gevolgd door whitespace, `/`, of `>`), in `parseDeclaredMarks` (MARK_FIELDS-loop) én `parseT3777Codes`. Behoud de namespace-prefix-match `(?:[\\w.-]+:)?` en het bestaande gedrag verder.
- [ ] 2. **Tests (AC4)** — uitbreiden op het bestaande `t3777-declarations`-testpatroon: category-code-lek-casus, alle echte tags, prefix-collisie, en de `packagingMarked` vs `localPackagingMarked…Reference`-onderscheiding.
- [ ] 3. **Verificatie** — `tsc --noEmit` 0 + volledige api-vitest groen (zelf draaien). Geen ACC/deploy (permission-gated).

## Dev Notes — Developer Context
- `apps/api/src/services/t3777-declarations.ts` — `parseDeclaredMarks` (~372-407, MARK_FIELDS-loop ~384), `parseT3777Codes` (~81-90). De consumerUsageLabelCode-parse (~395) is al correct begrensd (blok-patroon) — niet wijzigen.
- Namespace-agnostiek behouden (`(?:[\\w.-]+:)?`). GS1-tags kunnen cijfers bevatten → gebruik een lookahead op een echt scheidingsteken (`\\s`,`/`,`>`) i.p.v. `\\b` (dat zou tag-namen met cijfergrenzen onbedoeld kunnen raken).
- Impact: de relabel-picker (12.7 declared-marks-hint) en de crosscheck tonen geen categorie-codes meer als NutritionalScore-marks. Verwant: [[project_declared_values_prior]] (12.7), Story 12.15 (die lokaal al op A–E filtert).

### Project Structure Notes
- Enkel `apps/api`. Bouwen in een schone worktree; **na 12.15** (basis = de 12.15-branch) om een merge-conflict op `t3777-declarations.ts` te vermijden. Commit code + tests + story→`review` + sprint-status samen.

## Change Log
- 2026-07-13: aangemaakt. Prefix-collisie in de declared-marks-tag-regex (`nutritionalScore` matcht `nutritionalScoreProductCategoryCode`) → categorie-codes lekken als NutritionalScore-marks. Fix = tag-grens (lookahead op scheidingsteken) in `parseDeclaredMarks` + `parseT3777Codes`. Losse story op verzoek Friso; build ná 12.15.

- 2026-07-16: GEBOUWD + gereviewd (ATDD). Bug empirisch bevestigd (categorie-code FRDR2023_1 lekte als NutritionalScore-mark). Fix: lookahead-tag-grens `(?=[\s/>])` na de tagnaam in `parseT3777Codes` én de MARK_FIELDS-loop van `parseDeclaredMarks`; de gescopete `enumerationValue`-parse gebruikte al `\b` en was veilig. 4 nieuwe tests (RED 3 falend -> GREEN 26/26). Gates: volledige api-suite 951 passed/0 failed, tsc 0. Adversarial review PASS: 19 XML-vormvarianten + 2 echte ACC-GDSN-XML's — oud/nieuw byte-identiek op geldige data, alle lek-paden dicht; 3 pre-existing LOWs (self-closing/CDATA/rauwe `>` in attribuut) bewust buiten scope (komen in echte GDSN-data niet voor); repo-brede grep bevestigt dat dit de enige XML-tag-regexes zijn. Downstream-guards (12.15-map-builder lengte-1/A-E; 12.27 `/^[A-E]$/`) blijven als tweede slot bestaan.
