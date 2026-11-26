---
title: 'R1: docker-compose.prod.yml passes the logo-scan variables to the containers'
type: 'chore'
created: '2026-11-26'
status: 'in-progress'
route: 'spec'
baseline_commit: '0bd9cb4'
context:
  - 'aiService repo: _bmad-output/analysis/manifest-nutriscore-productie-2026-11-26.md (section 1.6, item R1)'
---

## Intent

**Problem:** `docker-compose.prod.yml` has no `env_file`; it passes a fixed list of variables. The logo-scan variables the app reads (`LOGO_PIPELINE_KEYS`, `LOGO_PIPELINE_KEYS_EXTRA`, `LOGO_SCAN_ROUTE`, `LOGO_MODEL_VERSION`, `LOGO_IMAGE_TAG`, `LOGO_SCAN_MAX_QUEUED`, `LOGO_SCAN_CONCURRENCY`) and the ml-service reads (`NUTRISCORE_READER_MIN_RATIO`) are not in it, so on production they could be set in Coolify and still never reach the code. (ACC works via `env_file`.)

**Approach:** Add each name to the `environment:` map of the service that reads it. Optional tuning variables are value-less pass-throughs (`NAME:`): compose sets them in the container only when defined in the deploy environment and leaves them unset otherwise, so code defaults stay in force. The one exception is `LOGO_IMAGE_TAG: ${RELEASE_SHA:?...}`: production images are chosen by `RELEASE_SHA`, so the code version must follow it (review finding 1). `SOURCE_COMMIT` is deliberately NOT passed (deviation from the manifest list, see Open).

## Boundaries & Constraints

**Always:**
- Pass-through form `NAME:`, never `${NAME:-}`: `scripts/deployment/production/check-production-config.py` rejects default interpolation, and an empty string is not unset (`resultModelVersion()` returns the raw env value on the legacy route).
- app gets: `LOGO_PIPELINE_KEYS`, `LOGO_PIPELINE_KEYS_EXTRA`, `LOGO_SCAN_ROUTE`, `LOGO_MODEL_VERSION`, `LOGO_SCAN_MAX_QUEUED`, `LOGO_SCAN_CONCURRENCY` (value-less) and `LOGO_IMAGE_TAG: ${RELEASE_SHA:?required frozen ACC release}`. ml-service gets `NUTRISCORE_READER_MIN_RATIO` (value-less).
- The drift test also matches `envInt('LOGO_*')` (dynamic `process.env[name]`).

**Never:** change or remove an existing line; add `env_file`; pass `SOURCE_COMMIT`; touch `docker-compose.acc.yml`, Coolify, containers or production; merge or deploy.

## Code Map

- `docker-compose.prod.yml` (app and ml-service `environment:`)
- `apps/api/src/__tests__/deploy/prod-compose-logo-env.atdd.test.ts` (new)
- `scripts/deployment/production/test-production-config.py` stays green (CI runs it)
- `versions.md`: no entry, no end-user-visible change (deploy config only; the docs-only commit #41 did not touch it either).

## Acceptance Criteria

1. Prod `app` environment has the six value-less names and `LOGO_IMAGE_TAG: ${RELEASE_SHA:?...}`; prod `ml-service` has `NUTRISCORE_READER_MIN_RATIO` value-less. `SOURCE_COMMIT` is absent. (vitest, text parse)
2. Drift: every `process.env.LOGO_*` / `envInt('LOGO_*')` in non-test `apps/api/src` is present in the prod app environment. (vitest)
3. Existing lines unchanged: the diff of `docker-compose.prod.yml` is additions only. (git diff, in trace)
4. `docker compose -f docker-compose.prod.yml --profile runtime --env-file <filled copy of scripts/deployment/production/production.env.example> config` (the example leaves required values blank) shows the value-less names as `null`, and with a value when defined in an extra env file. (one-off measurement, in trace)
5. `python scripts/deployment/production/test-production-config.py` is green.

## Open for the orchestrator

- R1 does nothing until the frozen release moves forward: `RELEASE_SHA` in `check-production-config.py:23` is `2c5bdab` (6 Oct), which has none of the logo-scan code. Moving it (SHA + both digests, in the checker, `production.env.example` and the test fixture) is part of R4, not R1.
- A variable that exists but is empty passes through as `''`; the app handles that (`envInt`, route, keys), but legacy `LOGO_MODEL_VERSION=''` stores an empty model version. Keep the R4 `docker inspect` check.
- A stray `LOGO_*` in the operator's shell reaches the production container; deploy from a clean environment.

- Deviation: `SOURCE_COMMIT` not passed. On prod it could be filled by Coolify with the checkout commit (not the release image) and give a wrong reuse key, or be blanked as on ACC. `LOGO_IMAGE_TAG` wins over it in `codeVersion()` anyway.
- R4 check after the first Coolify deploy: read the real container environment (`docker inspect`) to confirm Coolify leaves unset names unset (not `NAME=`), and that `GHS_REVIEW_BASE_URL` is `https://openrouter.ai/api/v1` (K4-aa precondition, `k4aa.py:39`).
- `NUTRISCORE_A2_MIN_CONF/MODEL_KEY/META_KEY` (read in `classification.py`) are not part of R1; add only if the manifest wants to tune them on prod.
