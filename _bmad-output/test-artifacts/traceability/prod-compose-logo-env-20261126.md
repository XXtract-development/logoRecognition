---
title: Traceability R1 prod compose logo-scan variables
date: 2026-11-26
commit: c83b6ebc0ebba27c4a0e4112823f38140c834c30
spec: _bmad-output/implementation-artifacts/spec-prod-compose-logo-env.md
gate: PASS
---

| AC | Requirement | Evidence | Result |
|---|---|---|---|
| 1 | app: 6 value-less names + `LOGO_IMAGE_TAG: ${RELEASE_SHA:?}`; ml-service: `NUTRISCORE_READER_MIN_RATIO`; no `SOURCE_COMMIT` | vitest `prod-compose-logo-env.atdd.test.ts` (it.each x6, LOGO_IMAGE_TAG, SOURCE_COMMIT absent, ml-service); red before build (9 failed / 2 passed), green after (11/11) | PASS |
| 2 | every `LOGO_*` read in app source is passed | vitest drift test (scan finds 7 names incl. `envInt`) | PASS |
| 3 | existing lines unchanged | `git diff docker-compose.prod.yml`: +10 / -0 | PASS |
| 4 | `docker compose config` semantics | filled-required-vars env file: unset -> `null`; `LOGO_SCAN_ROUTE=k4aa` and `NUTRISCORE_READER_MIN_RATIO=1.2` via env-file -> value; `LOGO_IMAGE_TAG` = RELEASE_SHA. One-off measurement, not automated (docker not assumed in CI) | PASS |
| 5 | production config checker green | `python3 scripts/deployment/production/test-production-config.py`: 34 tests OK | PASS |

Extra (no-default-interpolation, no env_file) covered by vitest. Reviews: spec (Opus, 8 findings) and diff (Opus, 11 findings) all processed; see spec "Open" for what goes to R4.

Gate: PASS. Residual: Coolify behaviour for unset names is INFERENCE until the R4 `docker inspect` check.
