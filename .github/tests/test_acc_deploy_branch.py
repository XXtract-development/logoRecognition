"""ACC deploys go through the acc-deploy branch and the Coolify webhook.

Spec: _bmad-output/specs/spec-ci-deploy-hetzner-runner/SPEC.md (v3.3).
GitHub-hosted runners cannot reach the Coolify API (firewall-2 since
2026-10-21), so the workflow only moves a branch; Coolify deploys it on the
GitHub webhook and picks both images by the commit it checked out.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'
BUILD_PUSH = WORKFLOWS / 'build-push.yml'
SCRIPT = ROOT / '.github/scripts/move-acc-deploy-branch.sh'
COMPOSE = ROOT / 'docker-compose.acc.yml'
DOCS = ROOT / 'docs/04-deployment/ci-bouwstraat.md'
SHA = 'a' * 40
OLD = 'b' * 40

# Fake gh: answers the reads from env, logs every call, fails writes on request.
FAKE_GH = r'''#!/bin/bash
echo "$*" >> "$CALL_LOG"
case "$*" in
  *"git/ref/heads/acc-deploy"*)
    if [ -n "$FAKE_DEPLOY_ERR" ]; then echo "$FAKE_DEPLOY_ERR" >&2; exit 1; fi
    if [ -z "$FAKE_DEPLOY_SHA" ]; then echo "gh: Not Found (HTTP 404)" >&2; exit 1; fi
    echo "$FAKE_DEPLOY_SHA";;
  *"git/ref/heads/acc"*)
    if [ -n "$FAKE_ACC_ERR" ]; then echo "$FAKE_ACC_ERR" >&2; exit 1; fi
    echo "$FAKE_ACC_SHA";;
  *"-X PATCH"*) [ -n "$FAKE_WRITE_ERR" ] && { echo "$FAKE_WRITE_ERR" >&2; exit 1; }; echo '{}';;
  *"-X POST"*) [ -n "$FAKE_WRITE_ERR" ] && { echo "$FAKE_WRITE_ERR" >&2; exit 1; }; echo '{}';;
  *) echo "unexpected gh call: $*" >&2; exit 99;;
esac
'''


def deploy_job():
    return yaml.safe_load(BUILD_PUSH.read_text())['jobs']['deploy-acc']


class WorkflowShapeTests(unittest.TestCase):
    """CAP-1, CAP-2, CAP-3: the job only moves the branch, after both builds."""

    def test_job_runs_on_github_runner_after_both_builds(self):
        job = deploy_job()
        self.assertEqual(job['runs-on'], 'ubuntu-latest')
        self.assertEqual(set(job['needs']), {'build-app', 'build-ml'})

    def test_job_only_for_acc_push_or_manual_start(self):
        cond = deploy_job()['if']
        self.assertEqual(cond, "github.ref == 'refs/heads/acc' && "
                               "(github.event_name == 'push' || github.event_name == 'workflow_dispatch')")

    def test_job_may_only_write_contents(self):
        self.assertEqual(deploy_job()['permissions'], {'contents': 'write'})

    def test_job_moves_branch_with_script_and_commit_sha(self):
        steps = deploy_job()['steps']
        runs = [s for s in steps if 'move-acc-deploy-branch.sh' in s.get('run', '')]
        self.assertEqual(len(runs), 1, 'exactly one step moves acc-deploy')
        checkout = [i for i, s in enumerate(steps) if s.get('uses', '').startswith('actions/checkout@')]
        self.assertTrue(checkout and checkout[0] < steps.index(runs[0]), 'checkout must precede the script step')
        env = runs[0].get('env', {})
        self.assertEqual(env.get('DEPLOY_SHA'), '${{ github.sha }}')
        self.assertEqual(env.get('GH_TOKEN'), '${{ github.token }}')
        self.assertEqual(env.get('REPO'), '${{ github.repository }}')

    def test_old_coolify_api_steps_are_gone(self):
        job = deploy_job()
        names = [s.get('name', '') for s in job['steps']]
        self.assertNotIn('Pin image tag in Coolify', names)
        self.assertNotIn('Trigger Coolify deployment', names)
        text = yaml.safe_dump(job)
        for needle in ('COOLIFY_', '/api/v1/', 'curl'):
            self.assertNotIn(needle, text)

    def test_concurrency_still_cancels_older_runs(self):
        wf = yaml.safe_load(BUILD_PUSH.read_text())
        self.assertTrue(wf['concurrency']['cancel-in-progress'])

    def test_no_workflow_uses_a_self_hosted_runner(self):
        for path in sorted(WORKFLOWS.glob('*.y*ml')):
            self.assertNotIn('self-hosted', path.read_text(), path.name)

    def test_no_workflow_listens_on_the_deploy_branch(self):
        for path in sorted(WORKFLOWS.glob('*.y*ml')):
            self.assertNotIn('acc-deploy', yaml.safe_dump(yaml.safe_load(path.read_text()).get(True, {})), path.name)


class MoveBranchScriptTests(unittest.TestCase):
    """CAP-1, CAP-3 and constraint: fail loud on write errors, never move backwards."""

    def run_script(self, acc=SHA, deploy=OLD, sha=SHA, **fake):
        self.assertTrue(SCRIPT.exists(), 'move-acc-deploy-branch.sh must exist')
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            (base / 'bin').mkdir()
            gh = base / 'bin/gh'
            gh.write_text(FAKE_GH)
            gh.chmod(0o755)
            env = {**os.environ, 'PATH': f"{base / 'bin'}:{os.environ['PATH']}",
                   'CALL_LOG': str(base / 'calls'), 'GITHUB_STEP_SUMMARY': str(base / 'summary'),
                   'REPO': 'XXtract-development/logoRecognition', 'DEPLOY_SHA': sha,
                   'FAKE_ACC_SHA': acc, 'FAKE_DEPLOY_SHA': deploy, **fake}
            if sha is None:
                env.pop('DEPLOY_SHA')
            result = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True, timeout=10)
            calls = (base / 'calls').read_text() if (base / 'calls').exists() else ''
            summary = (base / 'summary').read_text() if (base / 'summary').exists() else ''
            return result, calls, summary

    def test_moves_existing_branch_with_force(self):
        result, calls, summary = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        patch = [c for c in calls.splitlines() if '-X PATCH' in c]
        self.assertEqual(len(patch), 1, calls)
        self.assertIn('repos/XXtract-development/logoRecognition/git/refs/heads/acc-deploy', patch[0])
        self.assertIn(f'sha={SHA}', patch[0])
        self.assertIn('-F force=true', patch[0])
        self.assertNotIn('-X POST', calls)
        self.assertIn(SHA, summary)
        self.assertIn('Coolify', summary)
        self.assertIn('Controle na deze run', summary)

    def test_creates_missing_branch(self):
        result, calls, _ = self.run_script(deploy='')
        self.assertEqual(result.returncode, 0, result.stderr)
        post = [c for c in calls.splitlines() if '-X POST' in c]
        self.assertEqual(len(post), 1, calls)
        self.assertIn('ref=refs/heads/acc-deploy', post[0])
        self.assertIn(f'sha={SHA}', post[0])
        self.assertNotIn('-X PATCH', calls)

    def test_stale_rerun_does_not_move_branch_back(self):
        result, calls, summary = self.run_script(acc=OLD)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('-X PATCH', calls)
        self.assertNotIn('-X POST', calls)
        self.assertIn('oude run', result.stdout + result.stderr)
        self.assertIn('oude run', summary)

    def test_same_sha_writes_nothing_and_points_to_coolify_button(self):
        result, calls, _ = self.run_script(deploy=SHA)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('-X PATCH', calls)
        self.assertNotIn('-X POST', calls)
        self.assertIn('Coolify', result.stdout + result.stderr)

    def test_write_failure_is_red(self):
        result, _, _ = self.run_script(FAKE_WRITE_ERR='gh: Resource not accessible by integration (HTTP 403)')
        self.assertNotEqual(result.returncode, 0)

    def test_create_failure_is_red(self):
        result, _, _ = self.run_script(deploy='', FAKE_WRITE_ERR='gh: Validation Failed (HTTP 422)')
        self.assertNotEqual(result.returncode, 0)

    def test_unreadable_acc_head_is_red(self):
        result, calls, _ = self.run_script(FAKE_ACC_ERR='gh: Server Error (HTTP 502)')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('-X ', calls)

    def test_other_read_error_on_deploy_branch_is_red_not_create(self):
        result, calls, _ = self.run_script(FAKE_DEPLOY_ERR='gh: Server Error (HTTP 500)')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('-X ', calls)

    def test_missing_sha_is_red(self):
        result, calls, _ = self.run_script(sha=None)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('-X ', calls)


class ComposeImageTagTests(unittest.TestCase):
    """CAP-2: both images follow the commit Coolify checked out, fail closed."""

    def services(self):
        return yaml.safe_load(COMPOSE.read_text())['services']

    def test_app_and_ml_images_use_source_commit(self):
        for name in ('app', 'ml-service'):
            image = self.services()[name]['image']
            self.assertRegex(image, r':\$\{SOURCE_COMMIT:\?[^}]+\}$', name)
            self.assertNotIn('LOGO_IMAGE_TAG', image)

    def test_source_commit_never_in_environment_blocks(self):
        # Coolify only fills SOURCE_COMMIT when no user variable of that name exists, and it
        # registers user variables from environment: blocks. Naming it there would blank the tag.
        for name, svc in self.services().items():
            self.assertNotIn('SOURCE_COMMIT', yaml.safe_dump(svc.get('environment', {})), name)
            self.assertNotIn('SOURCE_COMMIT', yaml.safe_dump(svc.get('build', {})), name)

    def test_app_blanks_stale_logo_image_tag(self):
        # The app prefers LOGO_IMAGE_TAG over SOURCE_COMMIT as code version; the stale Coolify pin must not win.
        env = self.services()['app']['environment']
        self.assertIn('LOGO_IMAGE_TAG=', env)
        self.assertEqual([e for e in env if e.startswith('LOGO_IMAGE_TAG')], ['LOGO_IMAGE_TAG='])

    def compose_config(self, source_commit):
        with tempfile.TemporaryDirectory() as temp:
            shutil.copy(COMPOSE, Path(temp) / 'docker-compose.yml')
            (Path(temp) / '.env').write_text('')
            env = {k: v for k, v in os.environ.items() if k not in ('SOURCE_COMMIT', 'LOGO_IMAGE_TAG')}
            if source_commit:
                env['SOURCE_COMMIT'] = source_commit
            return subprocess.run(['docker', 'compose', '-f', str(Path(temp) / 'docker-compose.yml'), 'config', '--images'],
                                  env=env, capture_output=True, text=True, timeout=60)

    @unittest.skipUnless(shutil.which('docker'), 'docker compose not available')
    def test_compose_renders_both_images_on_the_commit(self):
        result = self.compose_config(SHA)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'ghcr.io/xxtract-development/logo-recognition-app:{SHA}', result.stdout)
        self.assertIn(f'ghcr.io/xxtract-development/logo-recognition-ml:{SHA}', result.stdout)

    @unittest.skipUnless(shutil.which('docker'), 'docker compose not available')
    def test_compose_refuses_without_source_commit(self):
        result = self.compose_config(None)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SOURCE_COMMIT', result.stderr)


class DocsTests(unittest.TestCase):
    """CAP-4: the runbook describes the new route and a rollback without the Coolify API."""

    def test_runbook_describes_branch_route_and_rollback(self):
        text = DOCS.read_text()
        for needle in ('acc-deploy', 'SOURCE_COMMIT', 'gh api', 'ml-service', 'webhook'):
            self.assertIn(needle, text)
        self.assertNotIn('Git-auto-deploy staat UIT', text)
        self.assertNotIn('pint de merge-SHA in Coolify-env', text)


if __name__ == '__main__':
    unittest.main()
