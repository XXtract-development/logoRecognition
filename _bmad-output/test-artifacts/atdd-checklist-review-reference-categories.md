---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: step-05-validate-and-complete
lastSaved: '2026-10-02'
inputDocuments: ['_bmad-output/implementation-artifacts/spec-review-reference-categories.md', '_bmad-output/specs/spec-review-reference-categories/SPEC.md', '_bmad-output/specs/spec-review-reference-categories/contract.md', '_bmad/tea/config.yaml', 'apps/api/vitest.config.ts']
---
# ATDD: juiste referentiecategorieën
Backend scope: bestaande Vitest, Python pytest met offline mocks. Goedgekeurde specificatie bevat alle invoer, uitkomsten en grenzen. docs/project-context.md bestaat niet.
Create-workflow gelezen: preflight → AI-generatie → teststrategie → sequentiële API-/servicegeneratie → aggregatie → validatie. Runtime heeft interne agentcapaciteit; opdrachtgever vereist één sequentiële schrijver. Geen UI/reis/browserwerk; E2E N/A. Spec vereist daadwerkelijk uitgevoerde failing tests; daarom geen overgeslagen tests uit het generieke workflowtemplate.
Kennis: data-factories, component-tdd, test-quality, test-healing-patterns, test-levels-framework, test-priorities-matrix, ci-burn-in, contract-testing. Fixtures zijn mocks zonder DB, storage, modellen of omgevingbestanden.

| Acceptatie | Testniveau | Prioriteit |
|---|---|---|
| Elke categorie en gedeelde mapping | TS/Python unit/parity en ML-request | P1 |
| Ongeldige code/velden vóór werk | client, endpoint, service | P1 |
| Zelfde pad inclusief inactief/mixed-code | gemockte registratie | P1 |
| Nieuwe referentie en duplicate guards | gemockte registratie | P1 |
| Exact manifest en stale code/active/metadata | Vitest transactie mocks | P1 |
| Seed/live en runtime mapping | direct writer en packaging | P1 |

## RED evidence
Uitgevoerde eerste RED: API18failed/10passed; Python39failed/3passed. Volledige opvolgende evidence staat hieronder.

## Generated tests / RED
Three Vitest files: API registration, exact backfill manifest/races, seed writer. Python unit file: new categories, invalid endpoint/direct calls, same-path repairs/mixed conflicts, guards, parity/runtime data, live writer.
All tests run rather than being skipped (approved spec overrides workflow template). No UI E2E generation needed. Fixture infrastructure is contained in test files and restores imports.
RED logs: reference-contract-red-api.log and reference-contract-red-python.log. Stale backfill evidence and test-fixture investigation captured in implementation-followups companion before production repair.

## Final validation
Create steps completed: preflight, generation mode, strategy, sequential generation, aggregation, validation. Actual RED preceded implementation: API18failed/10passed, Python39failed/3passed. Seed re-registration later RED1failed/1passed preceded metadata-only fix and is tracked in investigation companion.
Final GREEN: API50tests/5files, Python46tests. No skipped changed-contract tests. TypeScript full API typecheck passed before final seed metadata-only edit; final check repeated for that edit.
Acceptance scenarios are all covered: canonical categories, invalid types/metadata without work, inactive/same-path and mixed-code repair/conflict, preserved near-duplicate/unique/load-failure guards, exact scoped manifest with code/active/metadata race guards, full validation before any transaction, seed/live writers, shared mapping parity and runtime layout.
No UI scope, browser session, live DB or container work. Temporary Python test environment and compiled runtime probes live under /tmp. No deployment, external repair, push, merge or commit by implementation agent. Root owns versions/review/trace/commit. Existing gitignore/research/versions remain untouched.

### Commands / evidence
From apps/api:
- `../../node_modules/.bin/vitest run src/__tests__/services/reference-registration-contract.test.ts src/__tests__/services/field-type-mapping.test.ts src/__tests__/scripts/backfill-reference-manifest.test.ts src/__tests__/scripts/backfill-reference-logo-field-type.test.ts src/__tests__/scripts/seed-reference-category.test.ts --maxWorkers=2 --minWorkers=1` — 50 passed.
- `../../node_modules/.bin/tsc --noEmit` — full API typecheck; reference-contract-typecheck.log.
- `../../node_modules/.bin/vitest run` — broad attempted: first1171passed/1timeout; second3unrelatedtimeouts plus concurrently introduced seedRED. Not full GREEN. Isolated orchestration17/17passed. No further broad reruns.
- `../../node_modules/.bin/tsc src/services/field-type-mapping.ts --outDir /tmp/logo-reference-contract-built --module commonjs --target ES2022 --esModuleInterop --resolveJsonModule --skipLibCheck --types node` followed by Node require — emitted JSON and resolved NUTRISCORE_A from isolated build output.
From /tmp:
- `env -i PATH=/usr/bin:/bin PYTHONPATH=/Users/frisovanweelden/Documents/projects/logoRecognition/apps/ml-service /tmp/logo-reference-contract-venv/bin/python -m pytest /Users/frisovanweelden/Documents/projects/logoRecognition/apps/ml-service/tests/unit/test_reference_registration_contract.py -q` — 46 passed.
- Broad Python uses same empty environment plus MODEL_PATH=/tmp/logo-reference-contract-models, DATABASE_URL=postgresql://offline:offline@127.0.0.1:1/offline, CORS_ORIGINS=["http://localhost"] — 294passed/20failed/2skipped. All20failures reproduced on originalHEAD archive in five affected testfiles (49pass). Logs and classification in investigation companion; no unrelated fixes.
- Rootmanifest319items validated using temporary Vitest with mocked Prisma and runBackfill --manifest only. Result319validated, zero database reads/transactions. Original rootplan/manifest unchanged, not implementation-owned/staged.

### Review handoff
Next: fresh code review of category contract, row-lock repair and manifest safety. No new permission needed for local review. External execution stays prohibited; future repair command would be `npx tsx src/scripts/backfill-reference-logo-field-type.ts --apply --manifest <approved-version2-manifest>` only after separate external authorization, using original source preconditions. This command was not executed.

## Fresh repair RED (2026-10-02)
Review dispatch/context loaded in full. Added scoped safety tests before code changes: API 16 failed / 12 passed (2 files); Python 3 failed / 46 passed. Exact logs /tmp/reference-repair-red-api.log and /tmp/reference-repair-red-python.log. Wrong-target, private writer, v2 schema, all row race reasons, actual file zero-Prisma preview, seed missing artwork/relabel, same-path/different-code concurrency, independent paths, transactional embedding rollback, development mapping mount. Existing investigation companion contains confirmed structural findings before edits.

## Review repair final evidence (supersedes earlier counts/manifest version)
- Actual pre-repair RED: API16failed/12passed; Python3failed/46passed. CLI teardown RED:1failed/28passed, demonstrating unconditional disconnect in the actual main wrapper. All product edits followed investigation evidence and meaningful failing tests.
- Final API:64passed in6files, comprising63durable tests in5files plus1temporary exact-rootv2 parser/preview check. Temporary rootcheck removed after verification, durable valid-file and actualCLI preview tests remain. Rootmanifest319items accepted with zero all mocked Prisma calls, SHA25679c6db273a11876d40d6c485b1d5861e4e835a6f7528726b16eeb04c1748dc15 unchanged.
- Final Python:49passed, one external Starlette/httpx deprecation warning. Includes deterministic samepath/differentcode blocking, independentpath registration, and atomic embeddingfailure rollback under transactional offline mocks.
- Full APItypecheck after final TypeScript code/tests:passed. Compiled resolver+JSON Node runtime:passed. Pythonbundledlayout, canonicalmapping parity, read-only composemount:passed. Pinned ruff0.1.14/black24.1.1/isort5.13.2 checks on app/api/artwork.py, app/services/similarity.py, app/services/reference_category.py:passed. Diff whitespace check:passed.
- No additional broad-suite retry; previously documented baseline limitations unchanged. CI pytest fallback untouched. No live DB/containers/deploy/restart/migrate/gitwrite/external operations. No commit/stage.

### Final exact commands
From apps/api:
`../../node_modules/.bin/vitest run src/__tests__/services/reference-registration-contract.test.ts src/__tests__/services/field-type-mapping.test.ts src/__tests__/scripts/backfill-reference-manifest.test.ts src/__tests__/scripts/backfill-reference-logo-field-type.test.ts src/__tests__/scripts/seed-reference-category.test.ts src/__tests__/scripts/reference-root-preview-temporary.test.ts --maxWorkers=1 --minWorkers=1` —64passed; final temporary file removed, durable five-file command has63tests.
`../../node_modules/.bin/tsc --noEmit` —passed after final TSedit.
`../../node_modules/.bin/tsc src/services/field-type-mapping.ts --outDir /tmp/logo-reference-repair-built --module commonjs --target ES2022 --esModuleInterop --resolveJsonModule --skipLibCheck --types node` then `node -e 'const m=require("/tmp/logo-reference-repair-built/field-type-mapping.js"); if(m.resolveFieldType("NUTRISCORE_A").fieldType!=="NutritionalScore") process.exit(1); console.log("Bundled JS and canonical JSON runtime OK")'` —passed.
From /tmp:
`env -i PATH=/usr/bin:/bin PYTHONPATH=/Users/frisovanweelden/Documents/projects/logoRecognition/apps/ml-service /tmp/logo-reference-contract-venv/bin/python -m pytest /Users/frisovanweelden/Documents/projects/logoRecognition/apps/ml-service/tests/unit/test_reference_registration_contract.py -q` —49passed.
From root, each `/tmp/logo-reference-contract-venv/bin/ruff check`, `/tmp/logo-reference-contract-venv/bin/black --check`, `/tmp/logo-reference-contract-venv/bin/isort --check-only` with `apps/ml-service/app/services/similarity.py apps/ml-service/app/services/reference_category.py apps/ml-service/app/api/artwork.py` —passed,3files.

### Repair cleanup and next step
Temporary exact-rootpreviewtest, compiled runtimeprobe folder and this repair's pytesttemporarylayout folders removed after evidence capture. Existing local offline dependencyenvironment retained at /tmp/logo-reference-contract-venv for parent verification. No running own processes. Next step:parent targetedreview and bookkeeping; no further user approval needed for local review. External execution remains prohibited.
