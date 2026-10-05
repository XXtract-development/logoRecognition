#!/usr/bin/env python3
"""Offline acceptance tests; fake clients only, never a live database/storage."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


checker = load_module("production_config", "check-production-config.py")
buckets = load_module("production_buckets", "initialize-buckets.py")
COMPOSE = (ROOT / "docker-compose.prod.yml").read_text()


def fixture():
    # Fictitious test values only: never deploy this fixture.
    env = {key: f"test-only-{key.lower()}-" + "a" * 40 for key in checker.REQUIRED}
    env.update(checker.FROZEN)
    env.update(
        PRODUCTION_RESOURCE_NAME="logo-production-20261005",
        PRODUCTION_HOSTNAME="logo-production-fixture.example.com",
        COOLIFY_PROXY_NETWORK="fixture-proxy",
        MINIO_DATA_PATH="/mnt/storagebox-home/prod/logo-production-20261005/minio-data",
        AUTH_DATABASE_URL="mysql://fixture_auth:fixture-password@10.0.0.8:3306/authentication",
        MEDIASERVER_DOMAIN="https://media.example.com",
        POSTGRES_DB="logo_production_fixture", POSTGRES_ADMIN_USER="fixture_owner",
        APP_DATABASE_URL="postgresql://fixture_app:" + "a" * 40 + "@postgres:5432/logo_production_fixture",
        ML_DATABASE_URL="postgresql://fixture_ml:" + "b" * 40 + "@postgres:5432/logo_production_fixture",
        CATALOG_API_BASE="https://catalog.example.com", GHS_REVIEW_BASE_URL="https://review.example.com/v1",
        GHS_REVIEW_MODEL_A="fixture-review-a", GHS_REVIEW_MODEL_B="fixture-review-b",
    )
    return env


class NoPolicy(Exception):
    code = "NoSuchBucketPolicy"


class FakeStorage:
    def __init__(self, existing=(), policy=None, failure=None):
        self.existing = set(existing)
        self.created = []
        self.read = []
        self.policy = policy
        self.failure = failure

    def bucket_exists(self, bucket):
        return bucket in self.existing

    def make_bucket(self, bucket):
        self.created.append(bucket)
        self.existing.add(bucket)

    def get_bucket_policy(self, bucket):
        if self.failure:
            raise self.failure
        if self.policy is not None:
            return self.policy
        raise NoPolicy()

    def list_objects(self, bucket, recursive=False):
        self.read.append(bucket)
        yield SimpleNamespace(object_name="existing")

    def get_object(self, bucket, key, length):
        class Response(io.BytesIO):
            def release_conn(self):
                pass
        return Response(b"x")


class ConfigurationTests(unittest.TestCase):
    def test_complete_config_and_separate_roles(self):
        env = fixture()
        self.assertEqual([], checker.validate_env(env))
        self.assertEqual([], checker.validate_compose(COMPOSE, env))

    def test_every_required_input_missing_or_empty(self):
        for key in checker.REQUIRED:
            with self.subTest(key=key):
                env = fixture()
                del env[key]
                self.assertTrue(checker.validate_env(env))
                env[key] = ""
                self.assertTrue(checker.validate_env(env))

    def test_image_pair_and_release_are_frozen(self):
        for key in checker.FROZEN:
            env = fixture()
            env[key] = "f" * 64
            self.assertTrue(checker.validate_env(env))

    def test_exact_existing_production_media_identity_only(self):
        env = fixture()
        env["MEDIASERVER_DOMAIN"] = "https://media.stage.xxtract.com"
        self.assertEqual([], checker.validate_env(env))
        for key, value in (
            ("MEDIASERVER_DOMAIN", "https://media.acc.xxtract.com"),
            ("MEDIASERVER_DOMAIN", "https://other.stage.xxtract.com"),
            ("MEDIASERVER_DOMAIN", "https://media.stage.xxtract.com:444"),
            ("MEDIASERVER_DOMAIN", "https://media.stage.xxtract.com/path"),
            ("CATALOG_API_BASE", "https://media.stage.xxtract.com"),
            ("GHS_REVIEW_BASE_URL", "https://media.stage.xxtract.com"),
        ):
            env = fixture()
            env[key] = value
            self.assertTrue(checker.validate_env(env))

    def test_exact_existing_production_catalog_identity_only(self):
        env = fixture()
        env["CATALOG_API_BASE"] = "https://catalog.stage.xxtract.com"
        self.assertEqual([], checker.validate_env(env))
        for key, value in (
            ("CATALOG_API_BASE", "https://catalog.acc.xxtract.com"),
            ("CATALOG_API_BASE", "https://other.stage.xxtract.com"),
            ("CATALOG_API_BASE", "https://catalog.stage.xxtract.com:444"),
            ("CATALOG_API_BASE", "https://catalog.stage.xxtract.com/path"),
            ("MEDIASERVER_DOMAIN", "https://catalog.stage.xxtract.com"),
            ("GHS_REVIEW_BASE_URL", "https://catalog.stage.xxtract.com"),
        ):
            env = fixture()
            env[key] = value
            self.assertTrue(checker.validate_env(env))

    def test_acc_inputs_rejected(self):
        for key, value in {
            "APP_DATABASE_URL": "postgresql://acc:password@10.0.0.6:5432/logo_recognition",
            "PRODUCTION_HOSTNAME": "logo-detection.acc.xxtract.com",
            "CATALOG_API_BASE": "https://catalog.acc.xxtract.com",
            "PRODUCTION_RESOURCE_NAME": "logo-production-acc",
            "POSTGRES_DB": "logo_recognition",
            "MINIO_ROOT_PASSWORD": "minioadmin",
        }.items():
            with self.subTest(key=key):
                env = fixture()
                env[key] = value
                self.assertTrue(checker.validate_env(env))

    def test_invalid_database_connections(self):
        for value in ("not-a-url", "postgresql://owner:pw@postgres:invalid/db",
                      "postgresql://fixture_owner:" + "a" * 40 + "@postgres:5432/logo_production_fixture",
                      "postgresql://app:" + "a" * 40 + "@localhost:5432/logo_production_fixture",
                      "postgresql://app:" + "a" * 40 + "@postgres:5432/wrong",
                      "postgresql://app:" + "a" * 40 + "@postgres:5432/logo_production_fixture?host=10.0.0.6"):
            env = fixture()
            env["ML_DATABASE_URL"] = value
            self.assertTrue(checker.validate_env(env))

    def test_root_storage_credentials_rejected_for_app(self):
        for app, root in (("MINIO_APP_ACCESS_KEY", "MINIO_ROOT_USER"), ("MINIO_APP_SECRET_KEY", "MINIO_ROOT_PASSWORD")):
            env = fixture()
            env[app] = env[root]
            self.assertTrue(checker.validate_env(env))

    def test_default_profiles_have_only_infrastructure(self):
        doc = yaml.safe_load(COMPOSE)
        default = {name for name, service in doc["services"].items() if not service.get("profiles")}
        self.assertEqual({"postgres", "redis", "minio"}, default)
        runtime = default | {name for name, service in doc["services"].items() if "runtime" in service.get("profiles", [])}
        self.assertEqual({"postgres", "redis", "minio", "app", "ml-service"}, runtime)
        self.assertNotIn("initialize-buckets", runtime)

    def test_unsafe_compose_mutations(self):
        for field, value in (("build", "."), ("ports", ["8000:8000"]), ("network_mode", "host"),
                             ("profiles", []), ("networks", ["private", "proxy"]),
                             ("image", "ghcr.io/xxtract-development/logo-recognition-ml:acc")):
            doc = yaml.safe_load(COMPOSE)
            doc["services"]["ml-service"][field] = value
            self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))

    def test_initializer_never_launches_lifespan(self):
        doc = yaml.safe_load(COMPOSE)
        init = doc["services"]["initialize-buckets"]
        self.assertEqual(["python", "/provisioning/initialize-buckets.py"], init["entrypoint"])
        self.assertEqual([], init["command"])
        self.assertEqual({"disable": True}, init["healthcheck"])

    def test_runtime_wiring_and_infrastructure_dependency_rejected(self):
        for service, key, value in (
            ("ml-service", "DATABASE_URL", "postgresql://acc:secret@10.0.0.6/db"),
            ("app", "MINIO_ACCESS_KEY", "${MINIO_ROOT_USER:?root}"),
            ("app", "CATALOG_API_BASE", "https://catalog.acc.xxtract.com"),
        ):
            doc = yaml.safe_load(COMPOSE)
            doc["services"][service]["environment"][key] = value
            self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))
        doc = yaml.safe_load(COMPOSE)
        doc["services"]["postgres"]["depends_on"] = {"app": {"condition": "service_started"}}
        self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))

    def test_shared_volumes_rejected(self):
        doc = yaml.safe_load(COMPOSE)
        doc["volumes"]["postgres-data"]["name"] = "old-acc-minio-data"
        self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))

    def test_env_parser_literal_dollars_and_reject_duplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.env"
            path.write_text("JWT_SECRET='literal$secret'\n")
            self.assertEqual("literal$secret", checker.read_env(path)["JWT_SECRET"])
            for source in ("JWT_SECRET=$EXPANDED\n", "JWT_SECRET=one\nJWT_SECRET=two\n", "JWT_SECRET=bad #comment\n", "JWT_SECRET='bad'quote'\n",
                           "JWT_SECRET='bad\\quote'\n", "JWT_SECRET='bad\"quote'\n", "JWT_SECRET=bad'quote\n"):
                path.write_text(source)
                with self.assertRaises(ValueError):
                    checker.read_env(path)

    def test_auth_media_and_invalid_url_ports(self):
        for key, values in {
            "AUTH_DATABASE_URL": ("postgresql://auth:pw@10.0.0.8/auth", "mysql://auth:pw@mysql.acc.example.com/auth",
                                  "mysql://auth:pw@10.0.0.8:99999/auth", "mysql://auth:pw@10.0.0.6/auth", "mysql://auth:pw@10.0.0.8/auth_acc"),
            "MEDIASERVER_DOMAIN": ("https://media.acc.example.com", "http://media.example.com", "https://media.example.com:bad"),
            "CATALOG_API_BASE": ("https://catalog.example.com:65536", "https://catalog.example.com:0"),
            "GHS_REVIEW_BASE_URL": ("https://provider.example.com:invalid",),
        }.items():
            for value in values:
                env = fixture()
                env[key] = value
                with self.subTest(key=key, value=value):
                    self.assertTrue(checker.validate_env(env))

    def test_legacy_route_and_dns_labels_rejected(self):
        for hostname in ("logo-detection.xxtract.com", "logo..example.com", "logo.-bad.com",
                         "logo.bad-.com", "a" * 64 + ".example.com", "a." * 127 + "com"):
            env = fixture()
            env["PRODUCTION_HOSTNAME"] = hostname
            self.assertTrue(checker.validate_env(env))

    def test_coolify_literal_bind_and_sequence_labels(self):
        doc = yaml.safe_load(COMPOSE)
        self.assertEqual(checker.DEDICATED_MINIO_PATH, doc["services"]["minio"]["volumes"][0]["source"])
        self.assertTrue(all(isinstance(label, str) and "=" in label for label in doc["services"]["app"]["labels"]))
        for source in ("${MINIO_DATA_PATH:?required path}", "${MINIO_DATA_PATH}", "/mnt/storagebox-home/prod/old-service/minio-data"):
            mutated = yaml.safe_load(COMPOSE)
            mutated["services"]["minio"]["volumes"][0]["source"] = source
            self.assertTrue(checker.validate_compose(yaml.safe_dump(mutated), fixture()))
        mutated = yaml.safe_load(COMPOSE)
        mutated["services"]["app"]["labels"] = {label.split("=", 1)[0]: label.split("=", 1)[1] for label in mutated["services"]["app"]["labels"]}
        self.assertTrue(checker.validate_compose(yaml.safe_dump(mutated), fixture()))
        env = fixture()
        env["PRODUCTION_RESOURCE_NAME"] = "logo-production-other"
        env["MINIO_DATA_PATH"] = "/mnt/storagebox-home/prod/logo-production-other/minio-data"
        self.assertTrue(checker.validate_env(env))

    def test_storagebox_contract(self):
        for value in ("/tmp/logo-production-fixture/minio-data", "/mnt/storagebox-home/acc/logo-production-fixture/minio-data",
                      "/mnt/storagebox-home/prod/old-service/minio-data",
                      "/mnt/storagebox-home/prod/../logo-production-fixture/minio-data",
                      "/mnt/storagebox-home//logo-production-fixture/minio-data"):
            env = fixture()
            env["MINIO_DATA_PATH"] = value
            self.assertTrue(checker.validate_env(env))
        doc = yaml.safe_load(COMPOSE)
        self.assertFalse(doc["services"]["minio"]["volumes"][0]["bind"]["create_host_path"])
        doc["services"]["minio"]["volumes"] = ["old-acc-volume:/data"]
        self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))

    def test_shell_conflicts_and_selection_overrides(self):
        env = fixture()
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual([], checker.validate_shell(env))
        with patch.dict(os.environ, {"POSTGRES_DB": env["POSTGRES_DB"]}, clear=True):
            self.assertEqual([], checker.validate_shell(env))
        for key, value in (("LEGACY_DETECTION_API_KEY", "OVERRIDE_SECRET_MARKER"), ("POSTGRES_DB", "ACC_SECRET_MARKER"), ("COMPOSE_PROFILES", "runtime"),
                           ("COMPOSE_PROJECT_NAME", "old-live"), ("COMPOSE_FILE", "other.yml")):
            with patch.dict(os.environ, {key: value}, clear=True):
                errors = checker.validate_shell(env)
                self.assertTrue(errors)
                self.assertNotIn(value, "\n".join(errors))

    def test_env_file_cannot_enable_profiles_or_project_overrides(self):
        for key in ("COMPOSE_PROFILES", "COMPOSE_PROJECT_NAME", "COMPOSE_FILE"):
            env = fixture()
            env[key] = "runtime"
            self.assertTrue(checker.validate_env(env))

    def test_exact_provisioning_and_sensitive_runtime_wiring(self):
        for service in ("postgres", "minio", "initialize-buckets"):
            for key in yaml.safe_load(COMPOSE)["services"][service]["environment"]:
                doc = yaml.safe_load(COMPOSE)
                doc["services"][service]["environment"][key] = "unsafe"
                self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))
        for service, keys in {
            "app": ("AUTH_DATABASE_URL", "MEDIASERVER_DOMAIN", "JWT_SECRET", "COOKIE_SECRET", "GHS_REVIEW_INTERNAL_KEY", "PIPELINE_SERVICE_KEY", "LEGACY_DETECTION_API_KEY"),
            "ml-service": ("GHS_REVIEW_BASE_URL", "GHS_REVIEW_API_KEY", "GHS_REVIEW_MODEL_A", "GHS_REVIEW_MODEL_B", "GHS_REVIEW_INTERNAL_KEY", "PIPELINE_SERVICE_KEY"),
        }.items():
            for key in keys:
                doc = yaml.safe_load(COMPOSE)
                doc["services"][service]["environment"][key] = "unsafe"
                self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))

    def test_bounded_logs_and_resource_ceilings(self):
        for service in yaml.safe_load(COMPOSE)["services"]:
            for key in ("logging", "deploy"):
                doc = yaml.safe_load(COMPOSE)
                del doc["services"][service][key]
                self.assertTrue(checker.validate_compose(yaml.safe_dump(doc), fixture()))

    def test_ci_invokes_offline_suite(self):
        doc = yaml.safe_load((ROOT / ".github/workflows/ci-cd.yml").read_text())
        steps = doc["jobs"]["test-ml-service"]["steps"]
        self.assertTrue(any("scripts/deployment/production/test-production-config.py" in step.get("run", "")
                            and "PyYAML" in step.get("run", "") for step in steps))


    def test_cli_has_no_secret_output_or_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.env"
            env = fixture()
            env["APP_DATABASE_URL"] = "postgresql://acc:SUPER_SENSITIVE@10.0.0.6:5432/logo_recognition"
            path.write_text("\n".join(f"{key}={value}" for key, value in env.items()))
            result = subprocess.run([sys.executable, str(HERE / "check-production-config.py"), "--env-file", str(path)], capture_output=True, text=True, env={})
            self.assertEqual(1, result.returncode)
            self.assertNotIn("SUPER_SENSITIVE", result.stdout + result.stderr)
            self.assertNotIn(env["MINIO_ROOT_PASSWORD"], result.stdout + result.stderr)
            self.assertEqual([path], list(Path(directory).iterdir()))


class BucketTests(unittest.TestCase):
    def test_empty_and_repeatable(self):
        client = FakeStorage()
        self.assertEqual(buckets.BUCKETS, buckets.initialize_buckets(client))
        buckets.initialize_buckets(client)
        self.assertEqual(list(buckets.BUCKETS), client.created)
        self.assertEqual(8, len(client.read))

    def test_partially_existing_preserved(self):
        client = FakeStorage(existing=("models", "training-images"))
        buckets.initialize_buckets(client)
        self.assertEqual(["recognition-images", "thumbnails"], client.created)

    def test_policy_and_unverified_policy_fail_closed(self):
        for client in (FakeStorage(policy='{"Statement":[{"Principal":"*"}]}'),
                       FakeStorage(policy=""), FakeStorage(failure=PermissionError("secret"))):
            with self.assertRaises(RuntimeError):
                buckets.initialize_buckets(client)

    def test_get_failure_is_observed(self):
        class UnreadableObject(FakeStorage):
            def get_object(self, bucket, key, length):
                raise PermissionError("unreadable object")
        with self.assertRaises(PermissionError):
            buckets.initialize_buckets(UnreadableObject())

    def test_empty_storage_lists_without_object_read(self):
        class EmptyStorage(FakeStorage):
            def list_objects(self, bucket, recursive=False):
                self.read.append(bucket)
                return iter(())
            def get_object(self, bucket, key, length):
                raise AssertionError("Empty bucket must not attempt object read")
        client = EmptyStorage()
        buckets.initialize_buckets(client)
        self.assertEqual(set(buckets.BUCKETS), set(client.read))

    def test_main_failure_returns_nonzero_without_secret_or_success(self):
        def fail_client(*args, **kwargs):
            raise RuntimeError("ENTRYPOINT_SECRET_MARKER")
        for changes in ({}, {"MINIO_ENDPOINT": "unsafe:9000"}, {"MINIO_ROOT_PASSWORD": ""}):
            env = {"MINIO_ENDPOINT": "minio:9000", "MINIO_ROOT_USER": "fixture_owner",
                   "MINIO_ROOT_PASSWORD": "a" * 40}
            env.update(changes)
            output, error = io.StringIO(), io.StringIO()
            with patch.dict(os.environ, env, clear=True), patch.dict(sys.modules, {"minio": SimpleNamespace(Minio=fail_client)}), contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                self.assertEqual(1, buckets.main())
            self.assertNotIn("Verified", output.getvalue())
            self.assertNotIn("ENTRYPOINT_SECRET_MARKER", output.getvalue() + error.getvalue())
            self.assertNotIn("a" * 40, output.getvalue() + error.getvalue())

    def test_main_success_uses_only_provisioning_client(self):
        client = FakeStorage()
        output = io.StringIO()
        env = {"MINIO_ENDPOINT": "minio:9000", "MINIO_ROOT_USER": "fixture_owner", "MINIO_ROOT_PASSWORD": "a" * 40}
        with patch.dict(os.environ, env, clear=True), patch.dict(sys.modules, {"minio": SimpleNamespace(Minio=lambda *args, **kwargs: client)}), contextlib.redirect_stdout(output):
            self.assertEqual(0, buckets.main())
        self.assertIn("Verified all four", output.getvalue())
        self.assertEqual(list(buckets.BUCKETS), client.created)
        self.assertEqual(list(buckets.BUCKETS), client.read)


    def test_listing_failure_is_observed(self):
        class Unreadable(FakeStorage):
            def list_objects(self, bucket, recursive=False):
                raise PermissionError("unreadable")
                yield  # lazy generator error must be observed
        with self.assertRaises(PermissionError):
            buckets.initialize_buckets(Unreadable())


if __name__ == "__main__":
    unittest.main(verbosity=2)
