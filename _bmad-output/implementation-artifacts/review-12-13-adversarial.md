# Adversarial Review — Story 12.13 (rate-limit 429 + thumbnail-flood)

reviewed_commit: 61753e1fa1b6e078c6395a15d54603c3ca924be2
verdict: PASS
epic: 12
story: 12-13-rate-limit-429-en-thumbnail-flood
branch: epic-12-story-12.13
review_layers: Blind Hunter (bmad-review-adversarial-general), Edge Case Hunter (bmad-review-edge-case-hunter), Acceptance Auditor (vs story spec)

## Diff scope
- `apps/api/src/main.ts` — rate-limit `errorResponseBuilder`
- `apps/api/src/api/v1/reference-logos.ts` — `GET /reference-logos/code/:code/image` route config
- `apps/api/src/__tests__/api/rate-limit.routes.test.ts` (new)
- No other repo touched (frontend, ml-service, migrations untouched — confirmed via `git diff --stat` against base 81c1012)

## Round 1 findings (pre-fix) → resolution

| # | Severity | File:evidence | Finding | Fix (this commit) |
|---|---|---|---|---|
| 1 | HIGH | `reference-logos.ts` (route config) | `config: { rateLimit: false }` fully removed the only throttling on an unauthenticated route (`optionalAuth` never rejects) that does a DB lookup + MinIO download + synchronous `sharp` resize per hit — an unbounded resource-exhaustion regression, contradicting AC3 ("geen versoepeling van de beveiliging"). Flagged independently by both Blind Hunter and Edge Case Hunter. | Replaced with a bounded per-route override `config: { rateLimit: { max: 300, timeWindow: 60000 } }` (3x the global budget). Sized against the review-UI's actual worst case: `MobileReviewDeck.tsx`'s `pickList` caps at `.slice(0, 80)`, so 300/60s comfortably covers several full picker-opens per minute while still capping sustained abuse. |
| 2 | MEDIUM | `main.ts` `errorResponseBuilder` | `context.ban ? 403 : 429` branch is unreachable — `ban` is never configured on this plugin registration (confirmed default `-1`/disabled in `@fastify/rate-limit` source) — added complexity for a feature not in use. | Simplified: `errorResponseBuilder` now always sets `statusCode = 429` (ban path removed; can be reintroduced if/when a `ban` option is ever actually configured). |
| 3 | MEDIUM | `main.ts` `errorResponseBuilder` | The builder returned a plain object literal (not a real `Error`), so `errorHandler.ts`'s `logger.error(..., { error: error.message, stack: error.stack })` would log `undefined`/`undefined` for every rate-limit rejection — losing diagnostic fidelity for a different reason than the original bug. | `errorResponseBuilder` now throws a real `Error` instance (`new Error('Too many requests, please slow down')`) with `.statusCode = 429` set, mirroring the plugin's own default builder convention. |
| 4 | LOW | `rate-limit.routes.test.ts` | The AC4 test's title said "(400/401/403/404/413/415)" but the assertion table also included a 429 case — enumeration in the test name didn't match its own coverage. | Test title corrected to explicitly mention the 429 fix alongside the pre-existing mappings. |
| 5 | LOW (noted, not actioned) | `rate-limit.routes.test.ts` | Prisma mock built via `new PrismaClient() as vi.Mocked<PrismaClient>` relies on `setup.ts`'s global `vi.mock('@prisma/client', ...)` returning a shared instance per call — an implicit coupling. | Pre-existing pattern already used identically in `reference-logos.routes.test.ts` and other test files across this suite; refactoring the project's global Prisma test-mocking convention is out of scope for this bugfix story. No change made. |
| 6 | LOW (noted, not actioned) | `reference-logos.ts` docstring | The route's existing docstring ("Cookie-auth same-origin…") pre-dates this story and does not reflect that the route has no actual auth gate — a pre-existing doc/code mismatch, not introduced by this diff. | Out of scope; left unchanged. Flagging for a future dedicated docs/auth-hardening story if the team decides this route should in fact require auth. |
| 7 | — (confirmed compliant) | story spec vs diff | AC1 (429 not 500), AC2 (thumbnail fanout doesn't self-DoS via the queue), AC3 (no global weakening; accept-route/auth-rate-limit/errorHandler.ts untouched — confirmed via `git diff`), AC4 (test coverage for all 4 sub-cases) | No fix needed — confirmed correct by Acceptance Auditor against the story's explicit "NIET doen" list. |

## Round 2 (post-fix) — re-verification
- `tsc --noEmit`: 0 errors (re-run after fixes).
- Full `apps/api` vitest suite: 912 passed / 2 skipped / 37 todo / 0 failed (baseline before story: 907 passed; +5 new tests in `rate-limit.routes.test.ts`).
- `git diff 81c1012..61753e1 --stat`: only the 6 files listed under "Diff scope" plus the story/sprint-status/versions.md bookkeeping files — no unrelated changes.
- Accept-route (`artwork-pipeline.ts`), `errorHandler.ts`, and `services/auth.ts` (auth rate-limit): zero diff — confirmed untouched.

## Acceptance audit (per story AC)
- **AC1 (429 not 500):** PASS — `errorResponseBuilder` now sets `statusCode = 429` on a real `Error`; `errorHandler.ts`'s pre-existing 429-branch (unmodified) fires; headers preserved (set by the plugin independently of the builder). Covered by `rate-limit.routes.test.ts`'s first test.
- **AC2 (thumbnail bulk-load doesn't eat the budget):** PASS — bounded per-route override covers the review-UI's actual worst case (80 requests/open) with headroom; covered by the "realistic bulk-fanout" test.
- **AC3 (no security regression):** PASS — the override is bounded (not a bypass), global config unchanged, accept/auth/write paths untouched (git-confirmed); covered by the "bounded, not fully unmetered" test and the "no budget leakage" test.
- **AC4 (tests):** PASS — all 4 sub-cases (a-d) covered in `rate-limit.routes.test.ts`.

## Fix-log
- Round 1 fixes applied directly on top of the initial implementation, before the single commit `61753e1` (no intermediate commit exists for the pre-fix state — the adversarial review ran against the working tree, findings were fixed, then everything was committed together as `61753e1`).

## Verdict
**PASS** — all HIGH/MEDIUM findings fixed and re-verified against the actual `reviewed_commit`; two LOW findings explicitly logged as out-of-scope with rationale (no waiver needed — they are pre-existing conventions/gaps this bugfix story does not touch).
