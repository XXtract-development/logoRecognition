# Investigation: isolated backend-review tests

Symptom: initial test file creation used a non-existing `src/__tests__/routes` directory; after directory creation the first Vitest run failed all 20 tests with missing `reviewGhs` / missing `MLClient` export. The next run passed 19 and failed auth expectation (403 vs expected 401).

Evidence: Python 22 tests pass; TypeScript build passes; real MLClient.reviewGhs compiles. Vitest names the `../services/ml-client` mock. Global `apps/api/src/__tests__/setup.ts` mocks both MLClient and auth middleware; its auth implementation infers test role from header text instead of verifying JWT.

Hypotheses: production method missing refuted by source/build; invalid real JWT behavior not established because real auth never ran; global test doubles masking the new contract confirmed by source and Vitest diagnostics. Directory missing confirmed by filesystem inventory and shell error.

Owner: API tests. Fix direction: create dedicated test directory, explicitly unmock ML client and auth middleware only for this suite; locally mock HTTP and use signed tokens. Keep global mocks unchanged for all existing tests. No live effects.
