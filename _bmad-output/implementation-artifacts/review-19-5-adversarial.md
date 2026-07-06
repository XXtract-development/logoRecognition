# Code review — Story 19.5: Declaratie-guard op 5/5 keurmerkvelden

Datum: 2026-07-06 · Diff: working tree vs baseline `da99e99` · Mode: full (spec = 19.5-story).
Lagen: Blind Hunter (diff-only) + Edge Case Hunter (diff + project) + Acceptance Auditor (diff + spec), parallel & onafhankelijk.

## Verdict: APPROVE

De productiecode is correct en regressievrij; de enige actie was een test-verscherping (toegepast). Geen blokkerende bevindingen.

## Wat de drie lagen bevestigden
- **Guard-omzetting correct** — `decl.reason !== 'ok' || !decl.marks.some(m => m.code === t3777Code)` is semantisch equivalent aan de oude `codes.includes`, met legitieme superset-verbreding. Fail-closed intact.
- **Superset → bootstrap 17.1 regressievrij** — `packagingMarkedLabelAccreditationCode` zit in `MARK_FIELDS`; accreditatie-GTINs passeren ongewijzigd.
- **Afbakening gerespecteerd** — `bootstrap-run.ts` bevat alleen import-swap + guard + doc-comments; `verify-flow.ts:403` en `catalogDeclarationProvider` = 0 diff-regels (live T3777-crosscheck bewust ongemoeid). Geen migratie, geen ml-service-wijziging.
- **`decl.marks` nooit undefined** — alle 4 return-paden van `resolveDeclaredMarks` leveren een concrete array; `.some()` gooit niet.
- **Reason-set identiek** — beide functies delen `DeclarationReason` + `fetchTradeItemXml`; `reason !== 'ok'` gedraagt zich gelijk.
- **Alle 4 AC's aantoonbaar voldaan; sleuteltest is geen tautologie** (echte RED bewezen: 2 failed vóór fix).

## Bevindingen + afhandeling
| # | Bron | Ernst | Classificatie | Afhandeling |
|---|------|-------|---------------|-------------|
| 1 | Blind #3+#4 | Laag | **patch** | ATDD-test: `mockDecl`-opzet was na de fix dood; `toHaveBeenCalledWith` sloot een OR-schijnfix niet uit. **Toegepast:** `expect(mockDecl).not.toHaveBeenCalled()` in beide sleuteltests. 38/38 groen. |
| 2 | Edge #1 | Laag | **defer** | Guard-vergelijking hoofdletter-/trim-gevoelig aan `t3777Code`-kant. Bestaand gedrag, geen 19.5-regressie; sampler-caller veilig. → `deferred-work.md`. |
| — | Blind #1, Edge #2–5, Auditor | — | dismiss | Bevestigingen dat de code veilig is (marks-shape, reason-set, cache-namespace, geen caller op oud gedrag, fieldType-agnostische match bewust/gedocumenteerd). |

## Gates
- `tsc --noEmit`: exit 0.
- Betrokken suites: 38/38 (guard-5-5 5, bootstrap-run 18, balanced-sampler 15).
- Volledige api-suite: 873 passed / 2 skip / 67 todo; 1 onafhankelijke flaky-timeout (`artwork-detection-orchestration.test.ts`, geen guard/bootstrap-import, 17/17 geïsoleerd).
