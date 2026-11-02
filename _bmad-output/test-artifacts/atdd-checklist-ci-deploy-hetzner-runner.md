---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-02'
---

# ATDD-checklist — ACC-uitrol via uitroltak en Coolify-webhook

- **Spec:** `_bmad-output/specs/spec-ci-deploy-hetzner-runner/SPEC.md` (v3.3)
- **Stack:** backend (pyproject + pytest/unittest); testkader: `unittest` in `.github/tests/` (draait in `ci-cd.yml` via `python -m unittest discover -s .github/tests`)
- **Modus:** AI-generatie, sequentieel (één klein testbestand; geen browser, geen API-servers)
- **Testbestand:** `.github/tests/test_acc_deploy_branch.py` (22 tests)

## Strategie (criterium → testniveau → prioriteit)

| Criterium | Tests | Niveau | Prio |
|---|---|---|---|
| CAP-1 tak verschuift na beide builds | `WorkflowShapeTests.test_job_runs_on_github_runner_after_both_builds`, `test_job_moves_branch_with_script_and_commit_sha`, `MoveBranchScriptTests.test_moves_existing_branch_with_force`, `test_creates_missing_branch` | statisch + script met nep-`gh` | P0 |
| CAP-2 image = uitgecheckte commit, faalt dicht | `ComposeImageTagTests.*` (4) | statisch + `docker compose config` | P0 |
| CAP-3 alleen acc, oude stappen weg, geen eigen runner | `test_job_only_for_acc_push_or_manual_start`, `test_job_may_only_write_contents`, `test_old_coolify_api_steps_are_gone`, `test_no_workflow_uses_a_self_hosted_runner`, `test_no_workflow_listens_on_the_deploy_branch`, `test_concurrency_still_cancels_older_runs` | statisch | P0/P1 |
| Constraint: luid falen, nooit terug | `test_stale_rerun_*`, `test_same_sha_*`, `test_write_failure_is_red`, `test_create_failure_is_red`, `test_unreadable_acc_head_is_red`, `test_other_read_error_*`, `test_missing_sha_is_red` | script met nep-`gh` | P0 |
| CAP-4 runbook | `DocsTests.test_runbook_describes_branch_route_and_rollback` | statisch | P2 |
| Eerste echte run (a)(b)(c) | niet lokaal te toetsen — handmatige controle na merge (zie SPEC) | — | P0 |

## Rode fase (vóór implementatie)

Commando: `python3 -m unittest discover -s .github/tests -p "test_acc_deploy_branch.py" -v`
Uitkomst 2026-11-02: **FAILED (failures=16, errors=1)** van 22. Groen al vóór de bouw (regressiewachten, bewust): `test_source_commit_never_in_environment_blocks`, `test_concurrency_still_cancels_older_runs`, `test_job_runs_on_github_runner_after_both_builds`, `test_no_workflow_listens_on_the_deploy_branch`, `test_no_workflow_uses_a_self_hosted_runner`.

## Aannames en risico's

- `docker compose config` vereist docker lokaal en op de CI-runner; anders worden die twee tests overgeslagen (`skipUnless`).
- Wat Coolify en de GitHub-webhook werkelijk doen is alleen bij de eerste echte run te bewijzen.

Volgende stap: `bmad-build`.
