# Adversarial review — voorwerk story 19.5 (story + ATDD-tests, vóór implementatie)

Datum: 2026-07-06. Targets: `19-5-declaratie-guard-op-5-5-velden.md` + `apps/api/src/__tests__/services/flywheel-guard-5-5.atdd.test.ts`.

## Geverifieerde aannames
- **Superset T3777 ⊂ 5/5 bevestigd.** `MARK_FIELDS` bevat `packagingMarkedLabelAccreditationCode` (t3777-declarations.ts:347); identieke normalisatie (`trim().toUpperCase()`, regel 86 vs 376). Elke code uit `resolveDeclarations` zit ook in `resolveDeclaredMarks`-marks → bootstrap 17.1 blijft passeren.
- **Callers van `searchAndNominateClass`:** enkel `balanced-sampler.ts:294` en `bootstrap-run.processClass:381`. Geen verweesde caller.
- **`resolveDeclarations` elders:** `verify-flow.ts:403` + `catalogDeclarationProvider` = LIVE T3777-crosscheck (auto-accept), ander doel dan de flywheel-guard → bewust buiten scope.
- **ATDD-test is een echte mismatch-vanger:** RED-run faalt op de 2 sleuteltests (guard weigert niet-T3777-code, `bootstrapSearch` 0×), 3 contracttests groen. Assert op downstream-effect, geen tautologie.

## Bevindingen + afhandeling
| # | Ernst | Bevinding | Afgehandeld |
|---|-------|-----------|-------------|
| 1 | Midden | Scope-grens `verify-flow.ts`/`catalogDeclarationProvider` niet expliciet → risico dat dev ze meeneemt. | **Fixed** — expliciete out-of-scope-regel in story Afbakening. |
| 2 | Midden | Test dwong fix-richting niet hard af (dev kon resolveDeclarations laten staan). | **Fixed** — `expect(mockMarks).toHaveBeenCalledWith('999')` toegevoegd; faalt op oud gedrag. |
| 3 | Midden→Hoog | **Regressie-valkuil:** bestaande test-mockfactories exporteren alleen `resolveDeclarations`; na de fix roept de guard `resolveDeclaredMarks` (→ undefined() TypeError, suites crashen). | **Fixed** — expliciete ⚠️-waarschuwing + Task 2-instructie in story (factory uitbreiden + beforeEach-default). |
| 4 | Laag | Guard matcht op code, niet (fieldType, code) — code-botsing tussen GS1-lijsten theoretisch mogelijk. | **Fixed** — bewuste keuze gedocumenteerd in story Afbakening. |
| 5 | Laag | `reason`-divergentie (dietType-only → `lege-declaratie` bij T3777 vs `ok` bij 5/5) niet benoemd. | Impliciet gedekt door test (leeg vs mark); cosmetisch, geen actie. |
| 6 | Laag | AC4 noemt oude baseline "855/2skip"; verschuift met +5 tests. | Dev vermeldt nieuwe baseline bij afronding (dev-story). |
| 7 | Info | 3 contracttests slagen op oud én nieuw — alleen test 1&2 sturen de fix. Correct, geen defect. | — |

## Verdict
**PASS met verwerkte fixes.** De drie inhoudelijke bevindingen (1–3) zijn verwerkt in story en test; de test is nu een harde, richting-afdwingende mismatch-vanger die tegelijk de kritieke test-regressie voor de dev signaleert. Klaar voor `dev-story`.
