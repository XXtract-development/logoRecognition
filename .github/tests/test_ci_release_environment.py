"""Release checks must fail on unavailable storage or failing ML tests."""
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github/workflows/ci-cd.yml'


class ReleaseEnvironmentTests(unittest.TestCase):
    def storage_setup(self, healthy=True, bucket_exit=0, endpoint="localhost", dead=False, env_failure=False):
        helper = ROOT / '.github/scripts/start-ci-minio.sh'
        self.assertTrue(helper.exists(), 'Storage setup must have a testable fail-closed helper')
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            bins = base / 'bin'
            bins.mkdir()
            scripts = {
                'minio': '#!/bin/sh\n' + ('exit 9\n' if dead else 'echo $$ > "$MINIO_TEST_PID"\nexec sleep 30\n'),
                'curl': '#!/bin/sh\nif [ "$MOCK_DEAD" = 1 ]; then pid=$(sed -n "s/^MINIO_PID=//p" "$GITHUB_ENV"); for i in $(seq 1 100); do kill -0 "$pid" 2>/dev/null || break; sleep 0.01; done; fi\necho health >> "$CALL_LOG"\nexit ' + ('0' if healthy else '22') + '\n',
                'mc': '#!/bin/sh\necho "$*" >> "$CALL_LOG"\nexit ' + str(bucket_exit) + '\n',
            }
            for name, source in scripts.items():
                path = bins / name
                path.write_text(source)
                path.chmod(0o755)
            env = {**os.environ, 'PATH': str(bins) + ':' + os.environ['PATH'],
                   'CI_BIN_DIR': str(bins), 'RUNNER_TEMP': str(base),
                   'GITHUB_ENV': str(base if env_failure else base / 'github-env'), 'MINIO_TEST_PID': str(base / 'minio-pid'), 'CALL_LOG': str(base / 'calls'),
                   'HEALTH_ATTEMPTS': '2', 'HEALTH_INTERVAL': '0.01', 'MINIO_ENDPOINT': endpoint, 'MOCK_DEAD': '1' if dead else '0'}
            result = subprocess.run(['bash', '-x', str(helper)] if env_failure else ['bash', str(helper)], env=env, capture_output=True,
                                    text=True, timeout=5)
            result.process_alive = False
            result.pid_saved = False
            state = base / 'github-env'
            if state.is_file():
                for line in state.read_text().splitlines():
                    if line.startswith('MINIO_PID='):
                        result.pid_saved = True
                        try:
                            os.kill(int(line.split('=', 1)[1]), 0)
                            result.process_alive = True
                        except ProcessLookupError:
                            pass
                        try:
                            os.kill(int(line.split('=', 1)[1]), signal.SIGTERM)
                        except ProcessLookupError:
                            pass
            if env_failure:
                pid_match = re.search(r'\+ pid=(\d+)', result.stderr)
                self.assertIsNotNone(pid_match, 'Trace must identify only the process this test started')
                pid = int(pid_match.group(1))
                try:
                    os.kill(pid, 0)
                    result.process_alive = True
                except ProcessLookupError:
                    pass
                finally:
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            calls = (base / 'calls').read_text() if (base / 'calls').exists() else ''
            return result, calls

    def test_shared_browser_budget_is_scoped_to_e2e_job(self):
        workflow = yaml.safe_load(WORKFLOW.read_text())
        self.assertEqual(workflow['jobs']['test-e2e']['env']['RATE_LIMIT_MAX'], '10000')
        self.assertNotIn('RATE_LIMIT_MAX', workflow.get('env', {}))
        for name, job in workflow['jobs'].items():
            if name != 'test-e2e':
                self.assertNotIn('RATE_LIMIT_MAX', job.get('env', {}), name)
        production = (ROOT / 'docker-compose.prod.yml').read_text()
        self.assertNotIn('RATE_LIMIT_MAX', production, 'Test-only budget cannot relax production')

    def test_environment_write_failure_cleans_up_own_storage(self):
        result, calls = self.storage_setup(env_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(result.process_alive, 'Environment append failure must not leak its process')
        self.assertNotIn('mb ', calls)

    def test_storage_health_timeout_blocks_bucket_creation(self):
        result, calls = self.storage_setup(healthy=False)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(calls.count('health'), 2)
        self.assertNotIn('mb ', calls)
        self.assertTrue(result.pid_saved)
        self.assertFalse(result.process_alive)

    def test_storage_bucket_failure_blocks_release(self):
        result, calls = self.storage_setup(bucket_exit=17)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('mb ', calls)
        self.assertTrue(result.pid_saved)
        self.assertFalse(result.process_alive)

    def test_storage_creates_all_required_buckets(self):
        result, calls = self.storage_setup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for bucket in ('training-data', 'models', 'artwork'):
            self.assertIn('local/' + bucket, calls)

    def test_storage_rejects_remote_endpoint(self):
        result, calls = self.storage_setup(endpoint="acc-storage.example")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, '')

    def test_dead_storage_cannot_pass_health_probe(self):
        result, calls = self.storage_setup(dead=True, healthy=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('mb ', calls)

    def test_acc_storage_reuses_only_verified_cached_image(self):
        compose = (ROOT / 'docker-compose.acc.yml').read_text()
        service = re.search(r'^  minio:\n(.*?)(?=^  \S|\Z)', compose, re.M | re.S).group(1)
        self.assertIn('minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e', service)
        self.assertIn('pull_policy: never', service)
        baseline = (ROOT / '.github/tests/fixtures/acc-minio-service.yml').read_text()
        expected = baseline.replace('    image: minio/minio:latest\n', '')
        actual = service.replace('    image: minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e\n', '').replace('    pull_policy: never\n', '')
        self.assertEqual(actual.rstrip('\n'), expected.rstrip('\n'), 'All other MinIO service fields must remain identical')

    def test_pytest_failure_reaches_job_exit(self):
        workflow = WORKFLOW.read_text().split('  test-ml-service:', 1)[1].split('  test-e2e:', 1)[0]
        command = re.search(r'      - name: Run tests\n        run: \|\n(.*?)(?=        env:)', workflow, re.S).group(1)
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            (base / 'apps/ml-service').mkdir(parents=True)
            mock = base / 'pytest'
            mock.write_text('#!/bin/sh\nexit 13\n')
            mock.chmod(0o755)
            result = subprocess.run(['bash', '-e', '-c', command], cwd=base,
                                    env={**os.environ, 'PATH': str(base) + ':' + os.environ['PATH'],
                                         'MODEL_PATH': str(base / 'models'), 'TORCH_HOME': str(base / 'models/torch')},
                                    capture_output=True, text=True)
        self.assertEqual(result.returncode, 13, result.stdout + result.stderr)

    def test_ml_rejects_checkout_dotenv_before_pytest(self):
        workflow = WORKFLOW.read_text().split('  test-ml-service:', 1)[1].split('  test-e2e:', 1)[0]
        command = re.search(r'      - name: Run tests\n        run: \|\n(.*?)(?=        env:)', workflow, re.S).group(1)
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            service = base / 'apps/ml-service'
            service.mkdir(parents=True)
            (service / '.env').write_text('DATABASE_URL=postgresql://external.invalid/live\n')
            result = subprocess.run(['bash', '-e', '-c', command], cwd=base, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Unexpected ML dotenv in CI', result.stderr)

    def test_storage_source_is_immutable_and_integrity_checked(self):
        workflow = WORKFLOW.read_text().split('  test-e2e:', 1)[1].split('  build-images:', 1)[0]
        for commit in ('9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a',
                       '7394ce0dd2a80935aded936b09fa12cbb3cb8096'):
            self.assertIn(commit, workflow)
        self.assertIn('GOSUMDB: sum.golang.org', workflow)
        self.assertNotIn('minio/minio server', workflow)
        self.assertNotIn('minio/mc mb', workflow)
        cleanup = workflow.split('      - name: Stop CI services', 1)[1]
        self.assertRegex(cleanup, r'if: always\(\)')
        self.assertIn('kill "$MINIO_PID"', cleanup)

    def test_ml_paths_are_runner_temporary_and_settings_local(self):
        workflow = WORKFLOW.read_text().split('  test-ml-service:', 1)[1].split('  test-e2e:', 1)[0]
        for setting in ('MODEL_PATH', 'TORCH_HOME', 'ONNX_MODEL_PATH'):
            self.assertRegex(workflow, setting + r':.*runner.temp')
        self.assertIn('MINIO_ENDPOINT: localhost:9000', workflow)
        self.assertIn('MINIO_ACCESS_KEY: ci-test', workflow)


if __name__ == '__main__':
    unittest.main()
