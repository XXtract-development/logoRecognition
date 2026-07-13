# Retrospective — Epic 12, Story 12.13 (rate-limit 429 + thumbnail-flood)

Date: 2026-07-13
Scope: single bugfix story in `apps/api`.

## What went well
- The story file already contained a proven root cause (byte-identical read-only reproduction with headers/body evidence) before any code was touched, so the fix could be scoped precisely instead of guessing at the mechanism.
- Reading the actual `@fastify/rate-limit@9.1.0` source (`index.js`) rather than trusting its published TypeScript types caught a real library-vs-types drift (`errorResponseBuilderContext` doesn't declare `statusCode` even though the runtime object carries it) — this shaped a cleaner fix (branch on `context.ban` initially, then simplified once its uselessness was clear).
- The parallel three-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) caught a real HIGH-severity issue that a single-pass self-review likely would have missed: the first implementation's `rateLimit: false` traded one bug (false-positive 429) for a worse one (unbounded, unauthenticated resource exhaustion on a DB+MinIO+sharp-backed route). Two independent reviewers converging on the same finding gave high confidence it was real, not a false positive.
- Checking the actual frontend code (`MobileReviewDeck.tsx`'s `pickList.slice(0, 80)`) before picking a bounded limit turned "raise the limit by some plausible-sounding number" into a number grounded in the real worst-case fanout.

## What broke / needed rework
- The environment needed two non-trivial fixes before tests could even run: a full `pnpm install` (workspace `vitest` is only declared in `apps/web`'s `package.json` and relies on `shamefully-hoist` to reach `apps/api`'s scripts — a pre-existing implicit dependency, not something this story should "fix" but worth flagging), and a `prisma generate` (the checked-out worktree had no generated client, causing ~80 unrelated `tsc` errors that looked like real type bugs at first glance until traced to a missing generation step).
- The first-pass fix (`rateLimit: false`) was the "obvious" reading of the story's Task 2 wording ("uitzonderen van de limiter") but turned out to be the wrong end of the story's own explicitly offered spectrum ("uitzonderen ... en/of de limiet passend ophogen"). Worth remembering: when a story offers two options, the adversarial review is exactly the mechanism meant to catch picking the riskier one.

## Patterns / agreements to carry forward
- For any future rate-limit or route-exemption change: always check whether the target route has a real auth gate before exempting it from throttling — `optionalAuth` (attaches user if present, never rejects) is easy to misread as "this route is protected."
- When wrapping a third-party plugin's error-building hook, prefer throwing a real `Error` (matching the plugin's own convention) over a plain object literal — plain objects silently break `error.message`/`error.stack` in generic logging code downstream.
- Missing `prisma generate` after a fresh worktree checkout produces `tsc` errors that look exactly like real Prisma-usage bugs (`Namespace has no exported member 'InputJsonValue'`, etc.) — worth a fast sanity check (`node_modules/.prisma` exists?) before diagnosing those as code defects in future stories touching this repo.

## Outcome
- Story 12.13: `review` (code + tests + adversarial review PASS committed; deploy is permission-gated, not performed).
- Gates: `tsc --noEmit` 0; full `apps/api` vitest suite 912 passed / 2 skipped / 0 failed (was 907 before this story).
