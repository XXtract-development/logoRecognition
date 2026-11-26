---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-26'
spec: '_bmad-output/implementation-artifacts/spec-k4aa-review-env.md'
stack: backend (pytest) + deploy config (vitest text parse)
mode: AI generation (no browser)
---

# ATDD checklist: K4-aa own provider settings

## Tests written first (red phase)

| AC / matrix row | Test | Level |
|---|---|---|
| AC1 own vars win | `test_review_env_own_vars_win_over_ghs` | integration (scan + MockTransport) |
| AC2 empty/whitespace fallback | `test_review_env_empty_or_whitespace_own_vars_fall_back_to_ghs` (3 params) | integration |
| AC3 own non-OpenRouter base, no request | `test_review_env_own_non_openrouter_base_is_refused_without_a_request` | integration |
| AC3 prod shape (GHS on Google) | `test_review_env_prod_shape_ghs_on_google_and_no_own_vars_is_refused` | integration |
| AC4 own base, no own key | `test_review_env_own_base_without_own_key_never_uses_the_ghs_key` | integration |
| own key, no own base (ACC / prod) | `..._uses_the_ghs_base_when_it_is_openrouter`, `..._on_prod_shape_is_refused` | integration |
| trailing slash | `test_review_env_trailing_slash_on_own_base_is_accepted` | integration |
| AC5 key never in logs/exceptions | `test_review_env_key_values_never_appear_in_logs_or_exception_text` (5 paths: success, 401, 3 refusals) | integration |
| AC9 empty SigLIP path | `test_review_env_empty_siglip_path_falls_back_to_the_default` | unit |
| AC6 prod compose pass-throughs | `ml-service passes K4AA_REVIEW_BASE_URL / K4AA_REVIEW_API_KEY / K4AA_SIGLIP_PATH without a value` (3) | config text parse |
| AC7 drift + floor | `drift: every K4AA_*/GHS_REVIEW_* env name the ml-service app code reads ...` | config text parse |
| AC6 additions only | command `git diff --numstat 5b14961 -- docker-compose.prod.yml` (deletions = 0), in trace | one-off |
| AC8 stays green | existing 38 tests in `test_k4aa_atdd.py`, `test-production-config.py` | regression |

## Red run
- `cd apps/ml-service && pytest tests/test_k4aa_atdd.py -k review_env` : 16 failed (settings fields missing / empty SigLIP path), 38 deselected.
- `cd apps/api && npx vitest run src/__tests__/deploy/prod-compose-logo-env.atdd.test.ts` : 4 failed, 11 passed.

## Notes
- The `k4` fixture blanking of `K4AA_REVIEW_*` is part of the build (it would make every old test error in the red phase because the field does not exist yet); each new test sets all four values itself.
