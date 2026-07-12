# Code Review — Story 19.9 (fase 2, nearest-reference-ranking / conditie C)

reviewed_commit: a807cca (cycle 2 verified against HEAD after cycle-1 fixes)
verdict: PASS

## Cyclus 1 — parallelle adversariële review (Blind Hunter + Edge Case Hunter + Acceptance Auditor)

Gereviewd: `git diff 7b9e2a7..bea45ae` (initiële implementatie, commit `bea45ae`).

### Bevindingen (alle gefixt in commit `a807cca`)

| # | Severity | Bestand:regel | Omschrijving | Fix |
|---|---|---|---|---|
| 1 | HIGH | `apps/api/src/services/flywheel/bootstrap-run.ts` (`queueCropForReview`) | `confidence` gebruikte altijd `seed_cosine`, nooit `ranking_cosine` — een conditie-C-match met lage gids-cosine (AC1's kernscenario) zakte onderaan de door-confidence-gesorteerde review-wachtrij (`/artwork/review-queue`, `orderBy confidence desc`). | `confidence = Math.max(seed_cosine, ranking_cosine ?? 0)` |
| 2 | HIGH | `apps/api/src/services/flywheel/bootstrap-run.ts` (real-ref-query) | Geen `take`-limiet op de refs-query — een lange-staart-klasse (RECYCLABLE, 26 refs) kon onbegrensd veel refs naar de ml-service sturen (embed-kosten). | `getRankingMaxRefs()` (default 25, env `FLYWHEEL_RANKING_MAX_REFS`), `orderBy createdAt desc` blijft (nieuwste eerst). |
| 3 | HIGH | `apps/ml-service/app/services/bootstrap_search.py` (`t0`-plaatsing) | De tijdbox (`max_seconds`) startte NA het zaad/refs-embedden — refs-embed-kosten telden niet mee, kon de tijdbox laten uitlopen. | `t0 = time.perf_counter()` verplaatst naar vóór het zaad-embedden. |
| 4 | MEDIUM | `apps/ml-service/app/services/bootstrap_search.py:210` + `apps/ml-service/app/api/flywheel.py` (request-model) | Een misconfigureerde `min_refs<=0` activeerde conditie C met NUL geëmbede refs → `max()` op een lege lijst gooit `ValueError`. | Defense-in-depth-guard `min_refs > 0 and len(...) >= min_refs` in `search_with_seed` + Pydantic `Field(ge=1)`/`Field(ge=0,le=1)` op het contract. |
| 5 | LOW | `apps/api/src/services/flywheel/bootstrap-run.ts` (real-ref-query) | Geen structurele scheiding tussen zaad en echte refs — vertrouwde uitsluitend op de `source`-tag als data-invariant. | `realRefPaths.filter((p) => p !== seedPath)` defensief toegevoegd. |
| 6 | LOW | `apps/api/src/services/flywheel/bootstrap-run.ts` | `ranking_active`/`real_refs_used` werden berekend maar nergens gelogd (verloren telemetrie). | Info-log bij `search.ranking_active === true` (t3777Code, realRefsUsed, matches). |

## Cyclus 2 — verificatie van de fixes zelf

Gereviewd: `git diff bea45ae..a807cca` (de fix-commit). Onafhankelijke check op: `??`-semantiek voor `null`/`undefined`, Pydantic `Optional[..., ge=...]`-gedrag bij `None` (empirisch getest tegen het gepinde `pydantic==2.5.3`), `take`-positie in de Prisma-query, of `min_refs=3`-default ongewijzigd blijft, of de `t0`-verplaatsing geen bestaande test breekt (geen enkele test asserteert op timing), en of `seedPath` in scope is op het filter-punt.

**Geen nieuwe bevindingen.** Alle 6 fixes correct geverifieerd; regressietests toegevoegd (`test_c_min_refs_kleiner_of_gelijk_aan_nul_activeert_conditie_c_niet` in ml-pytest; `take`-cap-test + `confidence`-fix-test in api-vitest).

## Verdict

**PASS** op commit `a807cca` (= huidige branch-HEAD op moment van dit rapport). Geen open bevindingen, kritiek t/m low.

## Test-status op dit punt

- `apps/ml-service/tests/unit/test_bootstrap_search_service.py`: 18/18 groen (12 pre-existing + 6 nieuw voor Story 19.9).
- `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts`: 28/28 groen.
- `apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts`, `flywheel-guard-5-5.atdd.test.ts`, `flywheel-review-routing-19-8.atdd.test.ts`: 23/23 groen (default-mock-aanvulling, gedrag onveranderd).
- `tsc --noEmit` (apps/api): 0 fouten.
- Volledige suites (ml-pytest + api-vitest): zie Gate G in de story/epic-result (draait na TR/TRACE/NFR).
