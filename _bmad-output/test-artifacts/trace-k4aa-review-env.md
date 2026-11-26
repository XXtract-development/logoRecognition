---
workflowType: 'testarch-trace'
story: 'spec-k4aa-review-env'
date: '2026-11-26'
gate: 'PASS'
---

# Traceability Matrix and Gate Decision - spec-k4aa-review-env

Spec: `_bmad-output/implementation-artifacts/spec-k4aa-review-env.md`. Baseline 5b14961. All tests are fake-provider (httpx MockTransport) or text parsing; no network.

## Coverage Summary

| Priority | Criteria | FULL | Coverage |
|---|---|---|---|
| P0 (AC1-AC6, AC9-AC11) | 9 | 9 | 100% |
| P1 (AC7, AC8) | 2 | 2 | 100% |
| Total | 11 | 11 | 100% |

## Detailed Mapping

| AC | Tests | Coverage |
|---|---|---|
| AC1 own vars win | `test_k4aa_atdd.py::test_review_env_own_vars_win_over_ghs` | FULL |
| AC2 empty or whitespace falls back (ACC unchanged) | `test_review_env_empty_or_whitespace_own_vars_fall_back_to_ghs` (3 params), `test_review_env_whitespace_own_base_falls_back_but_keeps_own_key_pairing`, `test_review_env_own_key_without_own_base_uses_the_ghs_base_when_it_is_openrouter`; existing GHS-based tests via the `k4` fixture | FULL |
| AC3 non-OpenRouter base refused, zero requests | `test_review_env_own_non_openrouter_base_is_refused_without_a_request`, `test_review_env_prod_shape_ghs_on_google_and_no_own_vars_is_refused`, `test_review_env_own_key_without_own_base_on_prod_shape_is_refused`, `test_review_env_trailing_slash_on_own_base_is_accepted`; existing `test_cap5_route_refuses_a_non_openrouter_host` | FULL |
| AC4 own base without own key refused | `test_review_env_own_base_without_own_key_never_uses_the_ghs_key`, `test_review_env_refusal_logs_a_reason_code_without_values` | FULL |
| AC5 key never in logs or exception text | `test_review_env_key_values_never_appear_in_logs_or_exception_text` (5 params: success, 401, three refusals), `test_review_env_provider_error_body_echoing_the_key_stays_out_of_logs_and_errors`, `test_review_env_refusal_logs_a_reason_code_without_values` | FULL |
| AC6 prod compose pass-throughs, additions only | `prod-compose-logo-env.atdd.test.ts` "[P0] ml-service passes %s without a value" (2 names) + "no default interpolation and no env_file"; command `git diff --numstat 5b14961 -- docker-compose.prod.yml` = `3 0` | FULL |
| AC7 drift test | `prod-compose-logo-env.atdd.test.ts` "[P1] drift: every K4AA_*/GHS_REVIEW_* env name ..." (floor assertion, image-default exception asserted unpassed) | FULL |
| AC8 existing suites green | production-config python test 36 OK; `test_k4aa_atdd.py` + `test_k4aa_letterlezer_atdd.py` 89 passed; vitest deploy dir 14 passed; tsc clean | FULL |
| AC9 empty or whitespace SigLIP path | `test_review_env_empty_siglip_path_falls_back_to_the_default`, `test_review_env_whitespace_siglip_path_falls_back_to_the_default` | FULL |
| AC10 offline checker | `test-production-config.py::test_k4aa_provider_pair_is_optional_but_all_or_nothing_and_openrouter_only`, `::test_shell_k4aa_conflict_is_reported` | FULL |
| AC11 letter stage uses own key | `test_k4aa_letterlezer_atdd.py::test_review_env_letter_stage_uses_the_own_key_not_the_ghs_key` | FULL |

## Gaps and notes

- No test for `apps/ml-service/scripts/k4aa_vergelijk.py::route()` key order (manual networked measurement script). Recorded in the spec; not a criterion.
- Environment-only failures on this machine (torch/OpenCV/sklearn missing: `tests/test_ghs_specialist.py` 43, two nutriscore reader tests) are in files this change does not touch. Baseline comparison not run: UNVERIFIED.
- Premise "prod GHS points to Google, ACC to OpenRouter" is from the story brief; UNVERIFIED (no Coolify access).

## Gate Decision: PASS

P0 100%, P1 100%, no FULL-coverage gaps. Residual risk: the compose pass-through reaches production only at a later deploy, and a shell-exported K4AA_* overrides the env file (documented, deploy from a clean shell).
