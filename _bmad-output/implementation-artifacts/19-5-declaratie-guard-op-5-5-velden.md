---
baseline_commit: da99e99ce5223a715acf01572378c8f8b0f76853
---

# Story 19.5: Declaratie-guard in searchAndNominateClass op 5/5 keurmerkvelden

Status: done

<!-- Fix-story onder Epic 19 (correct-course go-live-bevinding 2026-07-05/06). Bron: go-live-bevinding + epics-vliegwiel.md FR-22. Geen nieuwe eis: herstelt de bestaande FR-22-eis "de declaratie-lezer dekt alle vijf GDSN-keurmerkvelden (5/5)" in de nominatie-guard. -->

## Story

Als **datamanager**
wil ik **dat de declaratie-guard in het crop-producerende nominatiepad dezelfde 5/5-keurmerkvelden gebruikt als waarmee de keurmerk→etiket-index (19.3) is gebouwd**
zodat **etiketten die een keurmerk via dietType/nutritionalScore/enumerationValue/localPackagingMarkedReference declareren óók genomineerd worden — niet alleen de accreditatie-codes** (FR-22: "de declaratie-lezer dekt alle vijf GDSN-keurmerkvelden (5/5)").

### Afbakening (kritiek)
- **Kern van de fix** = één guard-lookup in `searchAndNominateClass` (`apps/api/src/services/flywheel/bootstrap-run.ts`). De guard checkt nu via `resolveDeclarations` (T3777-only: alleen `packagingMarkedLabelAccreditationCode`). De 19.3-index is gebouwd met `resolveDeclaredMarks` (5/5-velden). Die twee moeten dezelfde declaratie-woordenschat hanteren.
- **Bootstrap-gedrag (Story 17.1) mag NIET breken.** `searchAndNominateClass` wordt door zowel de bootstrap-run (`processClass`) als de sampler (19.4 `balanced-sampler.ts`) aangeroepen. De 5/5-velden zijn een **superset** van de T3777-velden (`packagingMarkedLabelAccreditationCode` zit in `MARK_FIELDS`), dus accreditatie-codes die bootstrap gebruikt blijven passeren. De guard wordt ruimer, nooit strenger, voor bestaande codes.
- **Alleen een guard-lees-wijziging.** Geen wijziging aan de ml-search, de nominatie-poort, de dedup, de class-cap of de vlag-gating. Geen DB-migratie. Geen ACC-schrijf binnen deze story.
- **Geen hernoeming.** De parameter/variabele heet historisch `t3777Code` maar draagt nu een keurmerkcode uit elk van de 5 velden. Een bredere hernoeming is buiten scope (los op als aparte opruimstory indien gewenst) — voeg hooguit een verduidelijkende comment toe.
- **Live detectie-crosscheck blijft ONGEMOEID (expliciet buiten scope).** `resolveDeclarations` wordt óók gebruikt in `apps/api/src/services/pipeline/verify-flow.ts:403` en in `catalogDeclarationProvider` (`t3777-declarations.ts`) — dat is de LIVE T3777-crosscheck voor auto-accept in de detectiestroom, een ander doel dan de flywheel-brandstof-guard. Die twee blijven bewust T3777-only en worden in deze story NIET aangeraakt. Wijzig UITSLUITEND de guard in `searchAndNominateClass`.
- **Guard matcht op code, niet op (fieldType, code).** De index-sleutel is `fieldType/code`, maar `searchAndNominateClass` ontvangt alleen de code (`cls.code`). De guard bevestigt "declareert de GTIN deze code in enig van de 5 velden?" — een code-match volstaat, want elke gedeclareerde mark is een legitiem keurmerk. Het meegeven van fieldType aan de guard is bewust buiten scope (grotere signatuurwijziging; code-botsing tussen GS1-codelijsten is verwaarloosbaar).

## Acceptatiecriteria

1. **Given** een kandidaat-GTIN die de keurmerkcode declareert via één van de vier niet-T3777-velden (bv. `dietTypeCode` VEGAN, of `enumerationValue` PREGNANCY_WARNING)
   **When** `searchAndNominateClass` de declaratie-guard uitvoert voor die code
   **Then** passeert de GTIN de guard (telt als declarerend), wordt zijn artwork doorzocht en kunnen de gevonden crops genomineerd worden — hij wordt NIET afgewezen met "GTIN declareert de code niet".

2. **Given** een kandidaat-GTIN die de keurmerkcode NIET declareert in geen enkel van de 5 velden
   **When** de guard draait
   **Then** wordt de GTIN nog steeds overgeslagen, geteld in `skippedNonDeclaring` en gelogd — de harde declaratie-guard (AC1 van 17.1) blijft intact; niet-declarerende GTINs komen er niet doorheen.

3. **Given** de bestaande bootstrap-run (Story 17.1) die accreditatie-codes (`packagingMarkedLabelAccreditationCode`) verwerkt
   **When** `searchAndNominateClass` na de wijziging draait
   **Then** blijft het bootstrap-gedrag identiek: accreditatie-declarerende GTINs passeren, niet-declarerende vallen af — de bestaande bootstrap-testsuite blijft groen (regressievrij).

4. **Given** de nieuwe/aangepaste tests
   **When** de testsuite draait
   **Then** vangt minstens één test expliciet de mismatch: een GTIN die een keurmerk via een niet-T3777-veld declareert, wordt door de guard toegelaten. Deze test faalt op het oude gedrag (`resolveDeclarations`) en slaagt op het nieuwe (5/5-declared-marks) — het test-gat dat de mismatch verborg is gedicht.

## Tasks / Subtasks

- [x] 1. **Guard omzetten naar 5/5-declared-marks (AC: 1, 2)** — in `searchAndNominateClass` (`bootstrap-run.ts`) de guard-lookup `resolveDeclarations(gtin)` vervangen door `resolveDeclaredMarks(gtin)`, code-check op `marks.some(m => m.code === t3777Code)`. Reden-semantiek (`reason !== 'ok'`) ongewijzigd. Niet-declarerende GTINs blijven overgeslagen + geteld + gelogd.
  - [x] 1.1. `skippedNonDeclaring`, `budgetSpent`, `truncated` en logregel-semantiek identiek gebleven (geen andere regels aangeraakt).
  - [x] 1.2. Comment toegevoegd die 5/5-superset + koppeling aan de 19.3-index uitlegt.
- [x] 2. **Regressie bootstrap borgen (AC: 3)** — mock-factories van `flywheel-bootstrap-run.test.ts` én `flywheel-balanced-sampler.test.ts` omgezet naar `resolveDeclaredMarks` (+ `marksOf`-helper, beforeEach-default, guard-tests omgezet). Assert-intentie ongewijzigd. Beide suites groen (18/18 + 15/15).
- [x] 3. **Mismatch-vangende test toevoegen (AC: 4)** — `flywheel-guard-5-5.atdd.test.ts`: niet-T3777-veld (PREGNANCY_WARNING via enumerationValue + VEGAN via dietTypeCode) passeert de guard; harde assert `resolveDeclaredMarks` aangeroepen. Faalde op oud gedrag (RED bewezen), slaagt nu.
- [x] 4. **Gates** — `tsc --noEmit` exit 0; betrokken suites groen (38/38). Volledige api-suite: 873 passed / 2 skip / 67 todo — de enige rode is een ONAFHANKELIJKE flaky-timeout (`artwork-detection-orchestration.test.ts`, gebruikt geen guard/bootstrap-code, slaagt 17/17 geïsoleerd).

## Dev Notes — Developer Context

### Huidige staat (bestand UPDATE: `apps/api/src/services/flywheel/bootstrap-run.ts`)
- `searchAndNominateClass` (regel ~197–327) is DE gedeelde crop-producerende kern voor 17.1 (bootstrap) én 19.4 (sampler). De guard zit in de lus vanaf regel ~233:
  ```ts
  const decl = await resolveDeclarations(gtin);
  if (decl.reason !== 'ok' || !decl.codes.includes(t3777Code)) {
    skippedNonDeclaring += 1;
    logger.info('Klasse-zoektocht: GTIN declareert de code niet — overgeslagen', {...});
    continue;
  }
  ```
- `resolveDeclarations` (`t3777-declarations.ts`) parseert **alleen** `packagingMarkedLabelAccreditationCode` (`parseT3777Codes`), retourneert `{ codes, reason }`.
- `resolveDeclaredMarks` (zelfde bestand) parseert **alle 5** velden (`parseDeclaredMarks` + `MARK_FIELDS` + de gescopete `enumerationValue`-parse binnen `consumerUsageLabelCode`), retourneert `{ marks: DeclaredMark[], reason }` met `DeclaredMark = { code, fieldType }`. Aparte cache-namespace (`marks:` i.p.v. `t3777:`) — de guard hangt na de switch aan die cache; onschadelijk.

### Wat moet behouden blijven
- **De guard blijft hard** (fail-closed): een GTIN die niets declareert of waarvan de declaratie-lookup faalt (`reason !== 'ok'`) valt af. Alleen de *woordenschat* verbreedt van 1 veld naar 5.
- **Budget/time-box/artwork-resolutie** eromheen ongewijzigd — elke GTIN telt tegen het budget, ook een afgewezene.
- **Herkomst, nominatie met echt `crop_path`, NFR-6 (zaad nooit als crop)** ongewijzigd.

### Waarom een superset veilig is voor bootstrap (17.1)
`packagingMarkedLabelAccreditationCode` staat in `MARK_FIELDS` (fieldType `PackagingMarkedLabelAccreditationCode`). Alles wat `resolveDeclarations` als code teruggaf, geeft `resolveDeclaredMarks` óók terug (als mark met dat fieldType). De guard wordt dus voor accreditatie-codes gedrags-identiek en voor de vier extra velden ruimer. Geen enkele bestaande passerende GTIN gaat nu afvallen.

### ⚠️ KRITIEKE regressie-valkuil bij de tests (verplicht meenemen)
De bestaande tests mocken de module met een factory die **alléén** `resolveDeclarations` exporteert:
```ts
vi.mock('../../services/t3777-declarations', () => ({ resolveDeclarations: vi.fn() }));
```
Zodra de guard `resolveDeclaredMarks` aanroept, resolveert die import in díe tests naar `undefined` → `undefined()` gooit een TypeError → de suites crashen (niet slechts een assert-mismatch). **Verplicht in Task 2:** in `flywheel-bootstrap-run.test.ts` én `flywheel-balanced-sampler.test.ts` de mock-factory uitbreiden met `resolveDeclaredMarks: vi.fn()` en in `beforeEach` een passende `mockResolvedValue({ marks: [...], reason: 'ok' })` zetten (spiegel de bestaande `resolveDeclarations`-defaults: waar de code declareerde → mark met die code; waar niet → mark met een andere code of lege marks). De assert-intentie blijft identiek.

### Waarom de gemockte tests de mismatch misten
De bestaande sampler-/bootstrap-tests mockten `resolveDeclarations` (en `bootstrapSearch`) en asserteerden op T3777-codes. Ze konden de veld-mismatch per definitie niet zien: de guard-bron zelf was weggemockt. De nieuwe test (Task 3) mockt `resolveDeclaredMarks` met een niet-T3777-veld en dwingt de guard door het 5/5-pad.

### Project Structure Notes
- Wijziging blijft binnen `apps/api/src/services/flywheel/bootstrap-run.ts` (import + guard-lookup) en de bijbehorende testbestanden onder `apps/api/src/__tests__/services/`.
- Geen nieuwe endpoints, geen migratie, geen ml-service-wijziging (ARCH-2/ARCH-3 n.v.t.).
- `FLYWHEEL_`-conventies en MLClient-only ongewijzigd (ARCH-5).

### References
- [Source: _bmad-output/planning-artifacts/epics-vliegwiel.md#FR-22] — "de declaratie-lezer dekt alle vijf GDSN-keurmerkvelden (5/5)".
- [Source: apps/api/src/services/flywheel/bootstrap-run.ts#searchAndNominateClass] — de guard (regel ~233–259).
- [Source: apps/api/src/services/t3777-declarations.ts#resolveDeclaredMarks] — 5/5-lezer + `parseDeclaredMarks`/`MARK_FIELDS`.
- [Source: _bmad-output/implementation-artifacts/19-3-keurmerk-etiket-index-uit-declaraties.md] — index gebouwd met `resolveDeclaredMarks(5/5)`.
- [Source: _bmad-output/implementation-artifacts/19-4-gebalanceerde-sampler-en-nominatie-aansluiting.md] — sampler hergebruikt `searchAndNominateClass`.
- Geheugen: `project_prod_corpus_route` (GO-LIVE-STAND: guard-mismatch-bevinding), `project_keurmerk_dekking_strategie`.

## Dev Agent Record

### Agent Model Used
- claude-opus-4-8 (create-story + ATDD + adversarial review + dev-story)

### Debug Log References
- RED-verificatie ATDD (vóór fix): `flywheel-guard-5-5.atdd.test.ts` → 2 failed / 3 passed (guard weigerde de niet-T3777-code, `bootstrapSearch` 0×).
- GREEN na fix: betrokken bestanden 38/38 (`flywheel-guard-5-5.atdd` 5/5, `flywheel-bootstrap-run` 18/18, `flywheel-balanced-sampler` 15/15).
- `tsc --noEmit`: exit 0.
- Volledige api-suite: 873 passed / 2 skipped / 67 todo; 1 flaky-timeout in `artwork-detection-orchestration.test.ts` (onafhankelijk — geen guard/bootstrap-import; slaagt 17/17 geïsoleerd).

### Completion Notes List
- **Kern-fix (Task 1):** guard in `searchAndNominateClass` gebruikt nu `resolveDeclaredMarks` (5/5-velden) i.p.v. `resolveDeclarations` (T3777-only). Code-check: `decl.marks.some(m => m.code === t3777Code)`. Reden-guard (`reason !== 'ok'`) en alle omliggende budget-/artwork-/log-logica ongewijzigd. Superset-eigenschap borgt dat bootstrap-accreditatie-codes (17.1) blijven passeren.
- **Test-regressie voorkomen (Task 2):** de mock-factories van beide bestaande suites exporteerden alleen `resolveDeclarations` → na de fix zou dat `undefined()` gooien. Omgezet naar `resolveDeclaredMarks` met een `marksOf`-helper; assert-intentie identiek.
- **Buiten scope, niet aangeraakt:** `verify-flow.ts` (live T3777-crosscheck) en `catalogDeclarationProvider` blijven bewust T3777-only.
- Geen migratie, geen ml-service-wijziging, geen ACC-schrijf.

### File List
- `apps/api/src/services/flywheel/bootstrap-run.ts` (M) — guard-import + guard-check omgezet naar 5/5 declared-marks; doc-comments bijgewerkt.
- `apps/api/src/__tests__/services/flywheel-guard-5-5.atdd.test.ts` (A) — mismatch-vangende ATDD-suite (RED→GREEN).
- `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts` (M) — mock-factory + guard-tests omgezet naar `resolveDeclaredMarks`.
- `apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts` (M) — idem.
- `_bmad-output/test-artifacts/atdd-checklist-19-5.md` (A) — ATDD-verantwoording.
- `_bmad-output/implementation-artifacts/review-19-5-voorwerk-adversarial.md` (A) — adversarial review voorwerk.

## Senior Developer Review (AI)
- **Datum:** 2026-07-06 · **Uitkomst:** Approve (patch toegepast; geen blokkerende bevindingen).
- **Lagen:** Blind Hunter + Edge Case Hunter + Acceptance Auditor (parallel, onafhankelijk).
- **Consensus:** productiecode correct — semantisch-equivalente guard-omzetting, superset borgt bootstrap-17.1-regressie, afbakening gerespecteerd (`verify-flow.ts:403` + `catalogDeclarationProvider` geverifieerd ongemoeid via git diff = 0 regels). Alle 4 AC's aantoonbaar voldaan; sleuteltest is geen tautologie (echte RED bewezen).

### Review Findings
- [x] [Review][Patch] ATDD-test hardt de fix-richting nu écht af — `expect(mockDecl).not.toHaveBeenCalled()` + `toHaveBeenCalledWith` in beide sleuteltests, sluit een OR-schijnfix uit die de oude T3777-lezer laat staan [apps/api/src/__tests__/services/flywheel-guard-5-5.atdd.test.ts]. Toegepast, 38/38 groen.
- [x] [Review][Defer] Guard-vergelijking `m.code === t3777Code` is hoofdletter-/trim-gevoelig aan de `t3777Code`-kant [apps/api/src/services/flywheel/bootstrap-run.ts:253] — **bestaand gedrag, geen regressie** (identiek aan de oude `codes.includes`); sampler-caller veilig (index uppercaset), rest-risico alleen bij lowercase `bootstrap_queue`-seed. Buiten scope 19.5 → deferred-work.

## Change Log
- 2026-07-06: aangemaakt via bmad-create-story. Fix-story onder Epic 19 voor de go-live-bevinding "guard-mismatch".
- 2026-07-06: ATDD (RED) + adversarial review (PASS, 3 bevindingen verwerkt) + **dev-story**: guard in `searchAndNominateClass` omgezet naar `resolveDeclaredMarks` (5/5-velden); mock-factories van 2 bestaande suites meegemigreerd; tsc 0, betrokken suites 38/38 groen, volledige suite regressievrij (1 onafhankelijke flake).
