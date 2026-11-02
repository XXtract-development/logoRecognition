---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-02'
gate: PASS
---

# Trace — ACC-uitrol via uitroltak en Coolify-webhook

- **Bronnen:** `_bmad-output/specs/spec-ci-deploy-hetzner-runner/SPEC.md` (v3.3, CAP-1..4) en `_bmad-output/implementation-artifacts/spec-ci-acc-deploy-branch.md` (4 AC's + I/O-matrix van 7 rijen)
- **Tests:** `.github/tests/test_acc_deploy_branch.py` (23), commit `9d2a0a8bfb977d1551b453992e9fd7d64c27497b`
- **Groene run:** `python3 -m unittest discover -s .github/tests -p "test_acc_deploy_branch.py" -v` → 23/23 ok, 0 overgeslagen (de twee `docker compose config`-tests liepen echt). Hele map: 35/35. actionlint en shellcheck: 0.
- **Rode run (ATDD):** 16 failures + 1 error van 22 vóór de bouw; zie `atdd-checklist-ci-deploy-hetzner-runner.md`.
- **Modus:** sequentieel (één testbestand).

## Matrix

| # | Criterium | Prio | Tests | Niveau | Dekking |
|---|---|---|---|---|---|
| 1 | CAP-1 / AC1: na beide builds wordt `acc-deploy` op de merge-SHA gezet | P0 | `test_job_runs_on_github_runner_after_both_builds`, `test_job_moves_branch_with_script_and_commit_sha`, `test_moves_existing_branch_with_force` | statisch + script | FULL |
| 2 | CAP-2 / AC2: app- en ml-image op `SOURCE_COMMIT`, dicht falen | P0 | `test_app_and_ml_images_use_source_commit`, `test_compose_renders_both_images_on_the_commit`, `test_compose_refuses_without_source_commit` | statisch + `docker compose config` | FULL |
| 3 | CAP-3 / AC3: alleen acc push/dispatch, geen Coolify-API, geen self-hosted, geen trigger op `acc-deploy` | P0 | `test_job_only_for_acc_push_or_manual_start`, `test_job_may_only_write_contents`, `test_old_coolify_api_steps_are_gone`, `test_no_workflow_uses_a_self_hosted_runner`, `test_no_workflow_listens_on_the_deploy_branch` | statisch | FULL (AC3 geldt voor de ACC-route; `deploy-coolify.yml` uitgesteld, deferred-work) |
| 4 | Matrix: normaal (PATCH force + samenvatting) | P0 | `test_moves_existing_branch_with_force` | script | FULL |
| 5 | Matrix: eerste keer (404 → POST) | P0 | `test_creates_missing_branch` | script | FULL |
| 6 | Matrix: oude rerun schrijft niets | P0 | `test_stale_rerun_does_not_move_branch_back` | script | FULL |
| 7 | Matrix: zelfde SHA schrijft niets, wijst naar Coolify | P0 | `test_same_sha_writes_nothing_and_points_to_coolify_button` | script | FULL |
| 8 | Matrix: schrijffout rood (PATCH en POST) | P0 | `test_write_failure_is_red`, `test_create_failure_is_red` | script | FULL |
| 9 | Matrix: leesfout rood, niets geschreven | P0 | `test_unreadable_acc_head_is_red`, `test_other_read_error_on_deploy_branch_is_red_not_create` | script | FULL |
| 10 | Matrix: geen SHA rood | P0 | `test_missing_sha_is_red` | script | FULL |
| 11 | `SOURCE_COMMIT` nooit in `environment:`/`build` | P1 | `test_source_commit_never_in_environment_blocks` | statisch | FULL |
| 12 | Codeversie van de app volgt `SOURCE_COMMIT` (stale `LOGO_IMAGE_TAG` leeg) | P1 | `test_app_blanks_stale_logo_image_tag` | statisch | FULL |
| 13 | Checkout vóór het script | P1 | `test_job_moves_branch_with_script_and_commit_sha` | statisch | FULL |
| 14 | Oudere run wordt geannuleerd (concurrency) | P1 | `test_concurrency_still_cancels_older_runs` | statisch | FULL |
| 15 | CAP-4 / AC4: runbook met route, verificatie beide containers, rollback | P2 | `test_runbook_describes_branch_route_and_rollback` | statisch | PARTIAL (trefwoorden; de grenzen zelf zijn inhoudelijk nagelezen in de review, niet getest) |

## Gaten en heuristiek

- P0: 10/10 FULL (100%). P1: 4/4 FULL (100%). P2: 0/1 FULL. Totaal FULL: 14/15 (93%).
- Foutpaden gedekt: elke schrijf- en leesfout in de matrix heeft een rode test.
- Niet lokaal te toetsen en daarom **geen** onderdeel van deze dekking (ook niet als waiver): het succes-signaal en de eerste-run-bewijzen (a) webhook komt aan bij een push door de workflow, (b) beide containers draaien `revision` = `SOURCE_COMMIT` = merge-SHA met lege `LOGO_IMAGE_TAG` in de app, (c) gedrag als de webhook uitblijft. Die horen bij de controle na merge (runbook "Eerste echte run").

## Gate

**PASS** — P0 100%, P1 100% (≥ 90%), totaal 93% (≥ 80%). De open live-bewijzen hierboven blijven een voorwaarde voor "werkt op ACC", niet voor deze gate.
