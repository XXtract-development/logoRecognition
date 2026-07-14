# Adversarial Review — Story 12.15 (declaratie-gedreven Nutri-Score-oogst)

reviewed_commit: f64b8df
verdict: PASS

## Scope

Combined diff of commits `d84909f` (initial implementation) and `f64b8df` (code-review
fixes), verified as `git diff d84909f f64b8df` (the fix commit alone) plus a full read of
the resulting files at HEAD. This is a re-review after an earlier 3-reviewer round (Blind
Hunter / Edge Case Hunter / Acceptance Auditor) ran on `d84909f` alone; the Edge Case
Hunter's two findings are re-verified here against the actual `f64b8df` diff, not just the
commit message claims.

Files touched by `f64b8df` (the fix commit):
- `apps/api/src/scripts/build-nutriscore-declared-map.ts`
- `apps/api/src/__tests__/scripts/build-nutriscore-declared-map.test.ts`
- `apps/ml-service/app/services/database.py`
- `apps/ml-service/app/services/queue_harvest_nutriscore_declared.py`
- `apps/ml-service/tests/unit/test_queue_harvest_nutriscore_declared_12_15.py`

Full story-scoped file set (`d84909f` + `f64b8df` combined, excludes 12.12/12.13 content
that was additively merged into this branch in `d84909f` for reuse but is unmodified by
this story):
- `apps/api/src/scripts/build-nutriscore-declared-map.ts` (new)
- `apps/api/src/__tests__/scripts/build-nutriscore-declared-map.test.ts` (new, 19 tests)
- `apps/ml-service/app/services/queue_harvest_nutriscore_declared.py` (new)
- `apps/ml-service/tests/unit/test_queue_harvest_nutriscore_declared_12_15.py` (new, 20 tests)
- `apps/ml-service/app/services/database.py` (changed — additive: `review_item_exists`)

## Verification of the two claimed fixes

**Fix 1 — idempotency rekeyed from `(gtin, t3777_code, source_file)` to
`(gtin, reason, source_file)`.** Confirmed correct and complete:
- `database.py:726` — `review_item_exists(self, gtin, reason, source_file)`, SQL now
  `WHERE gtin = $1 AND reason = $2 AND source_file = $3` (no `status` filter, matching the
  docstring's "regardless of status" claim).
- `queue_harvest_nutriscore_declared.py:306` — sole caller, updated to
  `db_service.review_item_exists(gtin=gtin, reason=MARKER, source_file=src)`.
- Regression tests added and independently verified against real code (harness loads the
  module via `importlib`, not a re-implemented stub):
  `test_ac4_idempotentie_check_is_gescoped_op_reason_niet_op_t3777_code` (declaration
  changes C→D between runs, same MARKER — correctly re-skips) and
  `test_ac4_idempotentie_check_negeert_review_items_van_andere_harvesters` (a different
  harvester's `reason` on the same gtin/source_file does NOT block this harvest — correctly
  inserts). Both pass.
- No stale caller left on the old 3-arg `t3777_code=` signature anywhere in the tree.

**Fix 2 — `collectDeclaredMap` per-GTIN try/catch with new `fout` outcome.** Confirmed
correct and complete:
- `build-nutriscore-declared-map.ts:211-225` — each `deps.resolveMarks(gtin)` call is now
  individually wrapped; a throw (Error or non-Error) classifies as
  `{ kind: 'fout', error: ... }` and the loop continues to the next GTIN instead of
  propagating.
- `buildDeclaredMap` counts `fout` separately from `resolved`/`geenDeclaratie`/`ambigu` and
  never adds a `fout` GTIN to `entries` (no guessing).
- Tests verify both the pure classifier path and the orchestration path: a lookup failure
  for one GTIN out of three does not abort the run (`entries` still contains the other two),
  and a non-`Error` throw (a bare string) is also caught without crashing.

**`skipped_cap` observability counter.** Confirmed present and tested
(`test_ac4_skipped_cap_apart_geteld_bij_cap_overschrijding`, `queue_harvest_nutriscore_declared.py:229,282-288,370`).

## Fresh adversarial pass — additional findings

1. **`file: apps/ml-service/app/services/queue_harvest_nutriscore_declared.py:281-309` —
   cap-check runs before the idempotency check, so a duplicate candidate that also happens
   to exceed the per-letter cap is counted as `skipped_cap` instead of `skipped_duplicate`.**
   Severity: low. Pure observability/counter accuracy issue — final behavior (candidate is
   skipped either way, no insert, no crash) is identical regardless of order. This ordering
   was already present in `d84909f` and is unchanged by `f64b8df`; not a regression
   introduced by the fix commit, and not something the story's ACs require to be exact.

2. **`file: _bmad-output/implementation-artifacts/12-15-declaratie-gedreven-nutriscore-oogst.md:93`
   — the story's "Completion Notes" for AC4 still describes the pre-fix signature
   `review_item_exists(gtin, t3777_code, source_file)`, not the corrected
   `(gtin, reason, source_file)`.** Severity: low. Documentation drift only — the actual
   code and its docstring are correct and were verified directly; the story notes were not
   updated when `f64b8df` landed. Left untouched per instructions (story file bookkeeping is
   handled by the caller).

3. **No new unique DB constraint backs the idempotency check** (TOCTOU race between the
   `SELECT` and the later `INSERT`). This is explicitly acknowledged and accepted in the
   `f64b8df` commit message as pattern-consistent with every other harvest script in this
   codebase (`queue_harvest.py`, `queue_harvest_nutriscore.py`) and low-risk given this is a
   manually-triggered, single-operator CLI. Confirmed accurate — not a new gap, not
   reintroduced. No action needed.

No new blocking (medium/high/critical) issues were found. Both Edge Case Hunter findings
from the prior round are genuinely fixed — not just claimed — and are covered by real
regression tests exercising the actual module code.

## Test verification (independently re-run, not just trusted from the commit message)

- **ml-pytest — canonical run (protocol-mandated wegwerp-ghcr-ml-container,
  `ghcr.io/xxtract-development/logo-recognition-ml:acc`, app/+tests/ mounted read-only,
  `python -m pytest tests/unit -q --continue-on-collection-errors`): 98 passed, 0 failed, 7
  pre-existing (unchanged) collection errors** — reproduced independently 3 times across this
  review cycle with identical results. The 7 collection errors
  (`test_correct_nutriscore_labels.py`, `test_flywheel_phash_endpoint.py`,
  `test_ivfflat_probes_19_14.py`, `test_localize_codes_filter.py`,
  `test_no_node_content_hash.py`, `test_phash_service.py`,
  `test_restore_recyclable_refs_19_13.py`) exactly match the count and file set 12.12's own
  status entry already documented ("7 pre-existing (onveranderde) collection-errors") — none
  of the touched files (`app.api`, `app.core.config`, `scripts/`) are part of this story's
  diff. **Zero test failures.**
  - A secondary run against a stripped-down local venv (`/tmp/mlvenv-1215`, missing
    `fastapi`/`app.core.config`/`scripts` — NOT the mandated ghcr container) produced a
    different collection/pass profile (120 passed/1 failed/4 collection errors) purely because
    it has fewer optional dependencies installed, which changes which test files even attempt
    to collect. That run is NOT the canonical gate for this story; the ghcr-container numbers
    above are. The single failure observed only in that secondary venv
    (`test_no_node_content_hash.py`) was independently confirmed pre-existing (reproduces
    identically against the pre-12.15 baseline commit `4bde628`) and unrelated to this story's
    diff either way.
- **api-vitest** (`npx vitest run` from `apps/api`): 936 passed, 2 skipped, 37 todo, 0
  failed — matches the commit message's claimed numbers exactly. The 19
  `build-nutriscore-declared-map.test.ts` tests and 20
  `test_queue_harvest_nutriscore_declared_12_15.py` tests were confirmed present by direct
  count, matching the "20 total ml-pytest / 19 total api-vitest" claim in the `f64b8df`
  commit message.

## Conclusion

Both code-review findings from the prior round are correctly and completely fixed, backed
by real regression tests against the actual module code (not mocks of the fix). The new
`skipped_cap` counter is correctly wired and tested. No new blocking issues were found in a
fresh adversarial pass over the combined diff. Two low-severity, non-blocking observations
are noted above (counter-ordering nuance; stale story doc text) — neither required a code
fix. Full test suites pass with zero regressions; all pre-existing failures/errors were
independently confirmed unrelated to this story via baseline comparison.

**Verdict: PASS.** No code changes were made during this review — none were needed.
