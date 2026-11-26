---
title: 'K4-aa letter reader gets its own provider settings (K4AA_REVIEW_BASE_URL / K4AA_REVIEW_API_KEY)'
type: 'feature'
created: '2026-11-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5b149617193de2ca8318df7408433966ec0389bc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-prod-compose-logo-env.md'
  - '{project-root}/docs/04-deployment/logo-scan-route-k4aa.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `k4aa._config()` reads `GHS_REVIEW_BASE_URL` / `GHS_REVIEW_API_KEY` and refuses any base other than `https://openrouter.ai/api/v1`. On production those two point to Google for the existing GHS review and must stay there, so the K4-aa letter reader cannot be switched on in production without breaking GHS review.

**Approach:** Add `K4AA_REVIEW_BASE_URL` and `K4AA_REVIEW_API_KEY` settings that `_config()` prefers; empty (after strip) falls back to the `GHS_REVIEW_*` value so ACC, which sets only `GHS_REVIEW_*`, is unchanged. The OpenRouter-only host rule is applied to the resolved base. Pass both names through `docker-compose.prod.yml` for ml-service.

## Boundaries & Constraints

**Always:**
- Settings: `K4AA_REVIEW_BASE_URL: str = ""`, `K4AA_REVIEW_API_KEY: SecretStr = SecretStr("")` in `apps/ml-service/app/core/config.py`. No `K4AA_MODEL` (model stays the constant).
- Resolution: each K4AA value counts when non-empty after `.strip()`. Base: K4AA else GHS, then `.rstrip("/")`, must equal `OPENROUTER` else `K4aaError("provider_unavailable")` before any request. Key: K4AA; the GHS key only when the K4AA base is ALSO empty (mixed-pair guard, see Design Notes); stripped, must be non-empty. Own base set + own key empty = `provider_unavailable`, so a Google key is never sent to OpenRouter.
- `get_embedder()` treats an empty or whitespace `K4AA_SIGLIP_PATH` like an unset one (`(os.environ.get(...) or "").strip() or default`), because an image-level or operator-set value can be blank.
- The key is never logged and never appears in an exception text; `_config()` keeps returning `(base, key)` and raises only `K4aaError` with the class string.
- Prod compose, ml-service `environment:`: `K4AA_REVIEW_BASE_URL:` and `K4AA_REVIEW_API_KEY:` as value-less pass-throughs, additions only, same style and comment convention as commit 5b14961. `K4AA_SIGLIP_PATH` is NOT passed through: the ml Dockerfile sets it (`ENV K4AA_SIGLIP_PATH=/opt/siglip2-vision`) and a value-less pass-through of an empty host value would blank that image default. The drift test names it as an explicit image-default exception and asserts it stays unpassed.
- `scripts/deployment/production/production.env.example` gets a commented hint only (no assignment: the checker `read_env` ignores comments; the three FROZEN values and every required key stay as they are).
- Docs: short section plus the CONCEPT prod manifest rows in `docs/04-deployment/logo-scan-route-k4aa.md` (prod needs BOTH `K4AA_REVIEW_BASE_URL` and `K4AA_REVIEW_API_KEY`; an exported shell `K4AA_*` overrides the env file for value-less pass-throughs and the offline checker cannot see it, so deploy from a clean shell). Commented hints also in root `.env.example`.
- `apps/ml-service/scripts/k4aa_vergelijk.py` sets `K4AA_REVIEW_*` next to `GHS_REVIEW_*` so an exported `K4AA_*` cannot override its measurement setup.

**Never:** change or remove an existing compose line; add `env_file` or `${NAME:-}` defaults; touch `RELEASE_SHA`, digests or `FROZEN` (separate later story); touch `docker-compose.acc.yml`; change `ghs_review.py` or the GHS review settings; log or echo a key value; add a K4AA model setting; Coolify, containers, ssh, production, merge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|----------|--------------|----------|----------------|
| Own vars win | K4AA base+key = OpenRouter+K1, GHS base=Google URL, GHS key=G1 | `_config()` = (OpenRouter, K1); scan sends `Bearer K1` | N/A |
| ACC fallback | K4AA empty, GHS base=OpenRouter, key=G1 | (OpenRouter, G1) | N/A |
| Whitespace own | K4AA base/key = "  " / "\t", GHS valid | falls back to GHS (both) | N/A |
| Own non-OpenRouter base | K4AA base=`https://provider.example/v1`, key=K1 | `K4aaError("provider_unavailable")`, zero HTTP requests | refuse |
| Prod: GHS=Google, K4AA empty | GHS base=Google | `provider_unavailable`, zero requests, GHS key not sent anywhere | refuse |
| Mixed: own base, no own key | K4AA base=OpenRouter, key empty, GHS key=G1 | `provider_unavailable`, G1 never sent | refuse |
| Own key, no own base (ACC) | K4AA key=K1, K4AA base empty, GHS base=OpenRouter | (OpenRouter, K1) | N/A |
| Own key, no own base (prod) | K4AA key=K1, K4AA base empty, GHS base=Google | `provider_unavailable`, zero requests, K1 not sent; docs say set both on prod | refuse |
| Empty SigLIP path | `K4AA_SIGLIP_PATH=""` | default `/opt/siglip2-vision` is used | N/A |
| Trailing slash | K4AA base=`https://openrouter.ai/api/v1/` | accepted (rstrip) | N/A |
| Key in logs | any path (refusal, 401, success) | neither K1 nor G1 appears in captured log records or exception text | N/A |

</frozen-after-approval>

## Code Map

- `apps/ml-service/app/services/k4aa.py` -- `_config()` (line ~530) is the only app-code reader of the review base/key; `OPENROUTER` constant (line 39); `os.environ.get("K4AA_SIGLIP_PATH")` (line ~455) is the only other env read.
- `apps/ml-service/app/core/config.py` -- `Settings`, GHS block at lines 49-54; `extra="ignore"`.
- `apps/ml-service/app/ghs_review.py` -- reads `GHS_REVIEW_*` for GHS review; must not change.
- `apps/ml-service/tests/test_k4aa_atdd.py` -- fixture `k4` sets `GHS_REVIEW_*` via `monkeypatch.setattr(settings, ...)`; it must also blank `K4AA_REVIEW_*` (Settings reads the OS env and `.env`, so an ambient value would flip the old tests). `test_cap5_route_refuses_a_non_openrouter_host` must stay green. The new tests are appended to this file (no conftest exists; a sibling file would need fixture imports).
- `apps/ml-service/scripts/k4aa_vergelijk.py:243-249` -- second reader/writer of `GHS_REVIEW_*` (measurement script).
- `.env.example` (lines ~178-179) -- GHS_REVIEW_* hints; K4AA hints go next to them.
- `docker-compose.prod.yml` -- ml-service `environment:` (after `NUTRISCORE_READER_MIN_RATIO:`); `check-production-config.py` compares only the keys it lists, extra keys are tolerated (as in R1, commit 5b14961). Its `validate_shell` only covers `REQUIRED`, so a stray shell `K4AA_*` is not caught: handled by the docs note, not by the checker (same as R1's stray `LOGO_*`).
- `apps/api/src/__tests__/deploy/prod-compose-logo-env.atdd.test.ts` -- R1 drift test; the ml-service drift check is added here.
- `scripts/deployment/production/production.env.example`, `test-production-config.py` -- stay consistent, must stay green (34 tests).
- `docs/04-deployment/logo-scan-route-k4aa.md` -- new short section.

## Tasks & Acceptance

**Execution:**
- [x] `apps/ml-service/tests/test_k4aa_atdd.py` -- `k4` fixture blanks `K4AA_REVIEW_*`; new tests (red first) for every I/O row and the key-never-logged rule -- ATDD
- [x] `apps/api/src/__tests__/deploy/prod-compose-logo-env.atdd.test.ts` -- pass-through tests for the two names + drift test (K4AA_SIGLIP_PATH as named image-default exception): every `settings.K4AA_*|GHS_REVIEW_*`, `getattr(settings, "K4AA_*")`, `os.environ[.get]` or `os.getenv` of a `K4AA_*|GHS_REVIEW_*` name in `apps/ml-service/app/**/*.py` is in the prod ml-service environment; floor assertion that the scan found at least `K4AA_REVIEW_BASE_URL`, `K4AA_REVIEW_API_KEY`, `K4AA_SIGLIP_PATH`, `GHS_REVIEW_BASE_URL`, `GHS_REVIEW_API_KEY` -- ATDD
- [x] `apps/ml-service/app/core/config.py` -- two settings -- Always
- [x] `apps/ml-service/app/services/k4aa.py` -- `_config()` resolution + guard; `get_embedder()` empty path -- Always
- [x] `apps/ml-service/scripts/k4aa_vergelijk.py` -- also set `K4AA_REVIEW_*` -- Always
- [x] `docker-compose.prod.yml` -- two value-less names (additions only) -- Always
- [x] `scripts/deployment/production/check-production-config.py` + `test-production-config.py` -- optional K4AA pair: both or neither, OpenRouter only, shell conflict detected; tests -- Always
- [x] `scripts/deployment/production/production.env.example` -- commented hint -- Always
- [x] `.env.example` -- commented K4AA hints -- Always
- [x] `docs/04-deployment/logo-scan-route-k4aa.md` -- section + manifest rows -- Always

**Acceptance Criteria:**
- AC1 Given K4AA vars and different GHS vars, when `_config()` runs, then the K4AA pair is used.
- AC2 Given K4AA empty or whitespace, when `_config()` runs, then the GHS pair is used (ACC unchanged).
- AC3 Given the resolved base is not exactly the OpenRouter base, when a scan starts, then `provider_unavailable` is raised and no HTTP request is sent (own base and GHS-fallback base both).
- AC4 Given own base set and own key empty, when `_config()` runs, then `provider_unavailable` (GHS key never used with an own base).
- AC5 Given any resolution path, then neither key value appears in log records or exception text.
- AC6 Given `docker-compose.prod.yml`, then ml-service has the two names value-less, `git diff --numstat 5b14961 -- docker-compose.prod.yml` shows 0 deletions (a command in Verification and in the trace, vitest cannot see a diff), `env_file` and `${X:-}` stay absent.
- AC9 Given `K4AA_SIGLIP_PATH` is empty or whitespace, then the default path is used.
- AC10 Given the offline production checker, then a K4AA pair that is half-set, not OpenRouter, or has a placeholder key is reported, a shell `K4AA_*` that differs from the env file is reported, and a file without K4AA stays valid.
- AC11 Given the letter stage of a scan, then it sends the own key (not the GHS key) like the window stage.
- AC7 Given ml-service app code reads a K4AA_*/GHS_REVIEW_* env name, then it is present in the prod ml-service environment (drift test, with a floor so a regex miss cannot pass vacuously).
- AC8 `python scripts/deployment/production/test-production-config.py`, `apps/ml-service/tests/test_k4aa_atdd.py`, `test_k4aa_letterlezer_atdd.py` and the GHS review tests stay green.

## Implementation Notes

- `_config()` strips both values, applies the mixed-pair guard, and logs only a reason code (`base_not_openrouter` or `key_missing`) on refusal, never a value.
- `k4aa_vergelijk.py` now prefers `K4AA_REVIEW_API_KEY` for the key and sets both pairs. No automated test: `route()` is a manual, networked measurement run (UNVERIFIED by test; confirmed by reading the diff only).
- Docs text says "K4-aa route (window and letter calls)": both stages go through `_config()`.

## Spec Change Log

- Build review: `K4AA_SIGLIP_PATH:` removed from the compose pass-through (it would blank the Dockerfile ENV default when the host value is empty); the drift test carries it as a named exception. Added the checker validation (AC10) and the letter-stage test (AC11). Frozen intent unchanged; the Always bullets above were corrected to match.

## Review Triage Log

Spec review (Opus, bmad-review lenses adversarial, edge-case-hunter, structure, prose): 16 findings.
Applied: fixture blanking K4AA (test_k4aa_atdd.py in footprint); prod row own key without own base + docs both vars; k4aa_vergelijk.py; empty SigLIP path; drift floor; drift scope app/**/*.py with getenv/getattr; additions-only command; shell-override note (docs, not checker); manifest rows in docs; .env.example hints; structure merge of key bullet; R1 commit reference; premise marked UNVERIFIED; sibling-file fixture problem solved by appending to the existing file.
Rejected (reason recorded in Design Notes): key-only simplification.
Deferred: none.

Diff review (Opus: Blind Hunter, Edge Case Hunter, Verification Gap, bmad-review): findings triaged below, none dropped.
Applied: SigLIP whitespace strip + test; refusal reason code logged + test; drop `K4AA_SIGLIP_PATH` pass-through (image default would be blanked) and reword the compose comment; drift test names the image-default exception and asserts it stays unpassed; `k4aa_vergelijk.py` key order K4AA, GHS, OPENROUTER_KEY; checker validation of the K4AA pair and shell conflict, with tests; docs wording (route, not only letter reader) and manifest row title; test for provider error body echoing the key; test for whitespace own base; letter-stage own-key test; env example comments reworded.
Applied with a test although first filed as defer: verification-gap finding on the letter stage using the own key.
Rejected: automated test for `k4aa_vergelijk.route()` (manual networked measurement script; extracting a helper only for a test is out of scope). Noted under Implementation Notes.
Deferred: none.

## Design Notes

- Rejected review suggestion "key-only" (drop `K4AA_REVIEW_BASE_URL`): the base variable is an explicit requirement of the story; it is kept, the guard covers the risk.
- Premise: "prod GHS = Google, ACC GHS = OpenRouter" comes from the story brief. UNVERIFIED here (no Coolify access); INFERENCE for ACC: the route runs on ACC today and the host rule demands OpenRouter. Confirm with `docker inspect`-free means: read the Coolify env metadata for both apps.
- Mixed-pair guard: the literal rule "each variable falls back to the matching GHS value" would, with `K4AA_REVIEW_BASE_URL=OpenRouter` and no `K4AA_REVIEW_API_KEY`, send the Google GHS key to OpenRouter on production. Fail-closed wins: the GHS key is only a fallback together with the GHS base. The reverse (own key, GHS base) is already safe: the host rule refuses a non-OpenRouter GHS base before anything is sent.
- `versions.md`: no entry (checked: it lists end-user changes only; this is env plumbing and deploy config). Internal env plumbing plus deploy config; no end-user-visible change (R1 and docs-only #41 set the precedent).
- Gate facts: intent gaps none (mixed-pair and `K4AA_SIGLIP_PATH` decided above); irreversibles: the compose change reaches production only at a later deploy (no deploy here); footprint: 3 ml-service files (config, k4aa, vergelijk script), 1 compose, 2 env examples, 1 doc, 2 production-config scripts, 3 test files.

## Verification

**Commands:**
- `cd apps/ml-service && pytest tests/test_k4aa_atdd.py tests/test_k4aa_letterlezer_atdd.py -q` -- expected: all pass
- `pnpm --filter @logo-recognition/api exec vitest run src/__tests__/deploy/prod-compose-logo-env.atdd.test.ts` -- expected: all pass
- `python3 scripts/deployment/production/test-production-config.py` -- expected: OK
- `git diff --numstat 5b14961 -- docker-compose.prod.yml` -- expected: deletions column 0
