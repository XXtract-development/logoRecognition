# Story 12.18: Valse "niet gedeclareerd op deze GTIN"-badge voor Nutri-Score (kale letter vs NUTRISCORE_-code)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Ontdekt tijdens de 12.15 Nutri-Score review-ronde (2026-07-14). -->

## Story

Als **reviewer aan het reviewstation**,
wil ik dat de "gedeclareerd / niet gedeclareerd"-melding klopt voor Nutri-Score-items,
zodat ik niet bij élk Nutri-Score-item een valse oranje "niet gedeclareerd"-waarschuwing zie en daardoor terecht gedeclareerde items ten onrechte wantrouw of afwijs.

## Context / Probleem

De label-prior-badge (Story 12.7) vergelijkt de gedeclareerde GS1-marks van de GTIN met de getoonde keurmerkcode. Voor Nutri-Score levert de declaratie-endpoint de **kale letter** terug (`{code:"D", fieldType:"NutritionalScore"}`), terwijl het review-item de **volledige** code `NUTRISCORE_D` gebruikt. De vergelijking `declared.codes.has(shownCode)` is daardoor **altijd false** voor Nutri-Score, en de UI toont ten onrechte de oranje badge "⚠ niet gedeclareerd op deze GTIN" — óók wanneer de letter wél gedeclareerd is.

Bewijs (2026-07-14): `GET /api/v1/artwork/declared-marks/08718452660308` → `{"marks":[{"code":"D","fieldType":"NutritionalScore"},{"code":"GENERAL_FOODS","fieldType":"NutritionalScore"}]}`, terwijl het item code `NUTRISCORE_D` toont. Deze GTIN declareert D, maar de badge kleurt oranje.

Dezelfde mismatch raakt niet alleen de badge maar ook (a) de "gedeclareerd"-tag in de relabel-picker en (b) de sorteervolgorde die gedeclareerde codes bovenaan zet.

## Acceptance Criteria

1. **Nutri-Score-letter matcht de volledige code.** Wanneer een GTIN een Nutri-Score-letter declareert (`fieldType='NutritionalScore'`, code = kale letter A–E) en het getoonde item is `NUTRISCORE_<letter>`, toont de UI de **groene** "✓ gedeclareerd op verpakking"-tag, niet de oranje waarschuwing.
2. **Geen vals-positief de andere kant op.** Een Nutri-Score-item waarvan de gedeclareerde letter afwijkt (bijv. item toont `NUTRISCORE_C` maar declaratie zegt `D`) blijft terecht "niet gedeclareerd" tonen.
3. **Niet-Nutri-Score ongewijzigd.** Gewone keurmerkcodes (BIO, RECYCLABLE, etc.) behouden exact hun huidige gedrag; alleen de Nutri-Score-letter↔code-normalisatie wordt toegevoegd.
4. **Consistent overal.** De normalisatie geldt overal waar `declared.codes` tegen een volledige code wordt vergeleken: de badge, de picker-"gedeclareerd"-tag én de sorteervolgorde.
5. **Ambigue/categorie-codes lekken niet.** Categorie-codes die via dezelfde `fieldType='NutritionalScore'` meekomen (bijv. `GENERAL_FOODS`) worden **niet** als Nutri-Score-letter genormaliseerd (alleen kale enkele letters A–E). Dit spiegelt de leak-guard uit de 12.15 map-bouw.

## Tasks / Subtasks

- [ ] Task 1 — Normalisatie kiezen en implementeren (AC: 1, 3, 5)
  - [ ] Voorkeur: normaliseer in de frontend bij het opbouwen van `codes` uit de declaratie-marks (MobileReviewDeck `fetchDeclaredMarks`-effect): map een mark met `fieldType==='NutritionalScore'` en `code` ∈ {A,B,C,D,E} naar `NUTRISCORE_<letter>`; laat alle andere codes (incl. `GENERAL_FOODS`) ongewijzigd. Overweeg een kleine gedeelde helper zodat de mapping op één plek staat.
  - [ ] Alternatief (indien architectuur dit prefereert): normaliseer in de backend `/artwork/declared-marks/:gtin` zodat die canonieke t3777-codes teruggeeft. Kies één plek; documenteer de keuze in Dev Notes.
- [ ] Task 2 — Alle vergelijkpunten dekken (AC: 4)
  - [ ] Badge (`declared.codes.has(shownCode)`), picker-tag (`declared.codes.has(c)`) en sorteervolgorde (`Number(declared.codes.has(b)) - Number(declared.codes.has(a))`) gebruiken de genormaliseerde set.
- [ ] Task 3 — Tests (AC: 1, 2, 3, 5)
  - [ ] Test: declaratie letter D + item `NUTRISCORE_D` ⇒ groene "gedeclareerd"-tag.
  - [ ] Test: declaratie letter D + item `NUTRISCORE_C` ⇒ oranje "niet gedeclareerd".
  - [ ] Test: `GENERAL_FOODS` in marks wordt niet als letter-code genormaliseerd.
  - [ ] Test: niet-Nutri-Score code (bijv. BIO) gedrag ongewijzigd.

## Dev Notes

### Huidige toestand (gelezen, niet aannemen)
- `apps/web/src/components/review/MobileReviewDeck.tsx`
  - `fetchDeclaredMarks`-effect (~regel 196–214): `const codes = res.marks.map((m) => m.code);` → hier komt de kale letter binnen; dit is de normalisatie-plek (voorkeur).
  - Badge (~regel 824–832): `declared.has && (declared.codes.has(shownCode) ? groen : oranje)`.
  - Picker-tag (~regel 1041–1043) en sortering (~regel 735) vergelijken óók tegen volledige codes.
  - `shownCode = assignedCode[cur.id] ?? cur.t3777Code` (~regel 706) — altijd de volledige `NUTRISCORE_<letter>`-vorm voor deze items.
- `apps/web/src/services/artworkReviewService.ts` — `fetchDeclaredMarks(gtin)` → `GET /artwork/declared-marks/:gtin`, `DeclaredMark = { code, fieldType }`.

### Relatie met bestaand werk
- De 12.15 map-bouw (`apps/api/src/scripts/build-nutriscore-declared-map.ts`) doet exact deze leak-guard al (fieldType `NutritionalScore` + kale enkele letter A–E; categorie-codes zoals `GENERAL_FOODS` verworpen). Spiegel die regel; overweeg de code-lijst/helper te delen i.p.v. dupliceren (sluit aan bij de openstaande follow-up "gedeelde code-lijsten" uit 12.10).

### Testing standards
- Frontend: bestaande `MobileReviewDeck`/`ArtworkReviewPage`-testsuite (Vitest + Testing Library).

### Project Structure Notes
- Voorkeursfix is frontend-only. Als voor herbruikbaarheid gekozen wordt voor backend-normalisatie, raakt dat `apps/api` en moet de declared-marks-contracttest mee.

### References
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx#declared, #badge, #picker, #sort]
- [Source: apps/web/src/services/artworkReviewService.ts#fetchDeclaredMarks, #DeclaredMark]
- [Source: apps/api/src/scripts/build-nutriscore-declared-map.ts] (bestaande leak-guard om te spiegelen)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- Bevestigd via ACC: `GET /artwork/declared-marks/08718452660308` = `[{code:'D',
  fieldType:'NutritionalScore'},{code:'GENERAL_FOODS',...}]` terwijl het item
  `NUTRISCORE_D` toont → `declared.codes.has('NUTRISCORE_D')` was false → valse
  oranje badge.

### Completion Notes List

- Nieuwe pure module `apps/web/src/services/declaredMarks.ts` met
  `canonicalDeclaredCode({code,fieldType})`: alleen `fieldType==='NutritionalScore'`
  + kale enkele letter `A–E` → `NUTRISCORE_<letter>`; al het andere (incl.
  `GENERAL_FOODS`, andere fieldTypes) onveranderd (leak-guard spiegelt de 12.15
  map-bouw).
- Bewust in een APART, niet-gemockt bestand (geen apiClient-import): de deck
  importeert 'm daaruit, zodat de vele tests die `artworkReviewService` mocken de
  ECHTE helper draaien i.p.v. `undefined` (dit veroorzaakte anders 8 unhandled
  rejections in `ArtworkReviewPage.test.tsx`). `artworkReviewService` re-exporteert
  'm voor API-cohesie.
- Deck bouwt `declared.codes` nu via `res.marks.map(canonicalDeclaredCode)`, wat
  badge, picker-"gedeclareerd"-tag én sortering in één klap dekt (AC4).
- Tests: 4 unit (`declaredMarks.test.ts`) + 2 badge-integratie in
  `MobileReviewDeck.test.tsx` (D+`NUTRISCORE_D`→groen; D+`NUTRISCORE_C`→terecht
  oranje). Gates: tsc 0; volledige web-vitest 143 passed / 0 failed.

### File List

- apps/web/src/services/declaredMarks.ts (NEW)
- apps/web/src/services/declaredMarks.test.ts (NEW)
- apps/web/src/services/artworkReviewService.ts (UPDATE — re-export)
- apps/web/src/components/review/MobileReviewDeck.tsx (UPDATE)
- apps/web/src/components/review/MobileReviewDeck.test.tsx (UPDATE)
