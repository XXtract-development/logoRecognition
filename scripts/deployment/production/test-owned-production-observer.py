#!/usr/bin/env python3
"""Offline observer checks. No production network, Docker, systemd or writes."""
import copy
import datetime as dt
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "observer", Path(__file__).with_name("observe-owned-production.py")
)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
NOW = dt.datetime.now(dt.timezone.utc)


def fixture():
    targets = {
        s: {
            "container": s + "-owned",
            "image": "sha256:" + "a" * 64,
            "restart_count": 0,
        }
        for s in observer.SERVICES
    }
    env = {
        "PRODUCTION_RESOURCE_NAME": observer.RESOURCE,
        "POSTGRES_DB": "owned_db",
        "POSTGRES_ADMIN_USER": "owned_owner",
        "POSTGRES_ADMIN_PASSWORD": "private",
    }
    infos = {}
    for service, target in targets.items():
        info = {
            "Config": {"Labels": {"com.docker.compose.service": service}, "Env": []},
            "State": {
                "Running": True,
                "Health": {"Status": "healthy"},
                "OOMKilled": False,
            },
            "Image": target["image"],
            "RestartCount": 0,
            "Mounts": [],
        }
        if service == "postgres":
            info["Config"]["Env"] = [
                "POSTGRES_DB=owned_db",
                "POSTGRES_USER=owned_owner",
                "POSTGRES_PASSWORD=private",
            ]
            info["Mounts"] = [
                {
                    "Destination": "/var/lib/postgresql/data",
                    "Type": "volume",
                    "Name": observer.RESOURCE + "-postgres-data",
                }
            ]
        if service == "minio":
            info["Mounts"] = [
                {
                    "Destination": "/data",
                    "Type": "bind",
                    "Source": str(observer.BACKUPS.parent / "minio-data"),
                }
            ]
        infos[target["container"]] = info
    return targets, env, infos


class Contracts(unittest.TestCase):
    def test_five_containers_strict_frozen_identity_health_oom_and_restarts(self):
        targets, env, infos = fixture()

        def inspect(args, *_):
            return json.dumps([infos[args[-1]]]).encode()

        with patch.object(observer, "run", side_effect=inspect):
            self.assertEqual(
                set(observer.containers(targets, env, time.monotonic() + 10)),
                observer.SERVICES,
            )
            original = copy.deepcopy(infos)
            for mutation in [
                lambda i: i["app-owned"]["State"].update(OOMKilled=True),
                lambda i: i["ml-service-owned"]["State"]["Health"].update(
                    Status="unhealthy"
                ),
                lambda i: i["app-owned"].update(RestartCount=1),
                lambda i: i["app-owned"].update(Image="sha256:" + "b" * 64),
                lambda i: i["postgres-owned"]["Mounts"][0].update(Name="other-volume"),
                lambda i: i["minio-owned"]["Mounts"][0].update(Source="/tmp/data"),
            ]:
                infos.clear()
                infos.update(copy.deepcopy(original))
                mutation(infos)
                with self.assertRaises(ValueError):
                    observer.containers(targets, env, time.monotonic() + 10)

    def test_public_health_contract_requires_new_fresh_json_not_old_legacy_health(self):
        class Response(io.BytesIO):
            status = 200
            headers = {"Content-Type": "application/json"}

        def check(data):
            opener = type(
                "Opener",
                (),
                {"open": lambda *_args, **_kwargs: Response(json.dumps(data).encode())},
            )()
            with patch.object(
                observer.urllib.request, "build_opener", return_value=opener
            ):
                return observer.public_health(
                    "https://public.example/health", time.monotonic() + 10, NOW
                )

        self.assertEqual(
            check({"status": "ok", "timestamp": NOW.isoformat()})["status"], "passed"
        )
        for data in [
            {"status": "healthy"},
            {"status": "ok", "timestamp": (NOW - dt.timedelta(minutes=2)).isoformat()},
            {"status": "ok", "timestamp": (NOW + dt.timedelta(minutes=1)).isoformat()},
        ]:
            with self.assertRaises((ValueError, KeyError)):
                check(data)
        for url in [
            "http://public.example/health",
            "https://private:secret@public.example/health",
            "https://public.example/health?x=1",
            "https://public.example/not-health",
        ]:
            with self.assertRaises(ValueError):
                observer.public_health(url, time.monotonic() + 10, NOW)

    def test_exact_active_vector_count_and_read_only_statement(self):
        targets, env, _ = fixture()
        with patch.object(observer, "run", return_value=b"542|542\n") as run:
            self.assertEqual(
                observer.vectors(targets, env, time.monotonic() + 10)[
                    "active_complete_vectors"
                ],
                542,
            )
            sql = run.call_args.args[2]
            self.assertIn(b"BEGIN READ ONLY", sql)
            self.assertIn(b"statement_timeout='3s'", sql)
            self.assertIn(b"rl.active=true", sql)
            self.assertIn(b"vector_dims(re.embedding)=512", sql)
            self.assertIn(
                b"SELECT count(*) FROM public.reference_logos WHERE active=true", sql
            )
            self.assertIn(b"count(DISTINCT rl.id)", sql)
        for count in [b"543|542", b"542|541", b"541|541", b"542|543", b"0|0"]:
            with patch.object(observer, "run", return_value=count):
                with self.assertRaises(ValueError):
                    observer.vectors(targets, env, time.monotonic() + 10)

    def test_completed_successful_systemd_backup_and_active_future_timer(self):
        service = b"Result=success\nExecMainStatus=0\nExecMainCode=1\nExecMainExitTimestampMonotonic=90000000\nActiveState=inactive\n"
        timer = b"ActiveState=active\nNextElapseUSecRealtime=next UTC\n"
        with patch.object(observer, "run", side_effect=[service, timer]), patch.object(
            Path, "read_text", return_value="100 0"
        ):
            self.assertTrue(
                observer.systemd_backup(time.monotonic() + 10, NOW)["timer_active"]
            )
        for bad in [
            service.replace(b"Result=success", b"Result=exit-code"),
            service.replace(b"ExecMainStatus=0", b"ExecMainStatus=1"),
            service.replace(b"90000000", b"0"),
        ]:
            with patch.object(observer, "run", return_value=bad), patch.object(
                Path, "read_text", return_value="100 0"
            ):
                with self.assertRaises(ValueError):
                    observer.systemd_backup(time.monotonic() + 10, NOW)
        with patch.object(
            observer,
            "run",
            side_effect=[
                service,
                timer.replace(b"ActiveState=active", b"ActiveState=inactive"),
            ],
        ), patch.object(Path, "read_text", return_value="100 0"):
            with self.assertRaises(ValueError):
                observer.systemd_backup(time.monotonic() + 10, NOW)

    def test_private_baseline_and_paths_fail_before_check(self):
        targets, _, _ = fixture()
        with tempfile.TemporaryDirectory() as temp:
            parent = Path(temp).resolve()
            parent.chmod(0o700)
            file = parent / "targets.json"
            file.write_text(
                json.dumps({"resource": observer.RESOURCE, "services": targets})
            )
            file.chmod(0o600)
            self.assertEqual(observer.load_targets(file), targets)
            file.chmod(0o644)
            with self.assertRaises(ValueError):
                observer.load_targets(file)
            file.chmod(0o600)
            file.write_text(json.dumps({"resource": "wrong", "services": targets}))
            with self.assertRaises(ValueError):
                observer.load_targets(file)
            with self.assertRaises(ValueError):
                observer.observe(file, file, "https://public.example/health", parent)

    def test_only_sanitized_observations_written_and_failure_visible(self):
        targets, env, _ = fixture()
        with tempfile.TemporaryDirectory() as temp:
            release = Path(temp).resolve()
            release.chmod(0o700)
            with patch.object(observer, "RELEASE", release), patch.object(
                observer, "load_env", return_value=env
            ), patch.object(
                observer, "load_targets", return_value=targets
            ), patch.object(
                Path, "is_socket", return_value=True
            ), patch.dict(
                observer.os.environ, {}, clear=True
            ), patch.object(
                observer,
                "public_health",
                side_effect=RuntimeError("private password must not leak"),
            ), patch.object(
                observer, "containers", return_value={"status": "passed"}
            ), patch.object(
                observer, "vectors", return_value={"active_complete_vectors": 542}
            ), patch.object(
                observer, "systemd_backup", return_value={"timer_active": True}
            ), patch.object(
                observer, "latest_backup", return_value={"objects": 1069}
            ):
                proof = observer.observe(
                    release / "env",
                    release / "targets",
                    "https://public.example/health",
                    release,
                )
                self.assertEqual(proof["status"], "failed")
                self.assertEqual(
                    proof["checks"]["public_health"]["failure_type"], "RuntimeError"
                )
                files = list((release / "observations").iterdir())
                self.assertEqual(len(files), 1)
                data = files[0].read_text()
                self.assertNotIn("password", data)
                self.assertNotIn("public.example", data)
                self.assertEqual(json.loads(data), proof)
                self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)


class EncryptedReceipt(unittest.TestCase):
    def test_latest_ciphertext_hash_counts_resource_cleanup_and_no_key_read(self):
        with tempfile.TemporaryDirectory() as temp:
            mount = Path(temp).resolve()
            backups = mount / "backups"
            backups.mkdir()
            name = "20261006T002500Z-abcdef12"
            folder = backups / name
            folder.mkdir()
            data = b"ciphertext only"
            payload = folder / "payload.aes256gcm"
            payload.write_bytes(data)
            receipt = {
                "status": "passed",
                "authenticated_readback_verified": True,
                "private_stage_removed": True,
                "header": {
                    "format": "logo-owned-backup-aes256gcm-v1",
                    "resource": observer.RESOURCE,
                    "backup": name,
                    "completed_at": NOW.isoformat(),
                    "objects": 1069,
                    "tables": 35,
                    "nonce": "a" * 24,
                    "plaintext_bytes": len(data),
                },
                "tag": "b" * 32,
                "encrypted_bytes": len(data),
                "encrypted_sha256": hashlib.sha256(data).hexdigest(),
            }
            path = folder / "receipt.json"
            path.write_text(json.dumps(receipt))
            with patch.object(observer, "MOUNT", mount), patch.object(
                observer, "BACKUPS", backups
            ), patch.object(Path, "is_mount", return_value=True):
                proof = observer.latest_backup(time.monotonic() + 10, NOW)
                self.assertEqual(proof["objects"], 1069)
                self.assertIn("no key read", proof["scope"])
                original = copy.deepcopy(receipt)
                for mutate in [
                    lambda r: r.update(private_stage_removed=False),
                    lambda r: r["header"].update(resource="other"),
                    lambda r: r["header"].update(objects=1068),
                    lambda r: r.update(encrypted_sha256="0" * 64),
                ]:
                    receipt = copy.deepcopy(original)
                    mutate(receipt)
                    path.write_text(json.dumps(receipt))
                    with self.assertRaises(ValueError):
                        observer.latest_backup(time.monotonic() + 10, NOW)
                path.write_text(json.dumps(original))
                (folder / "roles.sql").write_text("forbidden plaintext")
                with self.assertRaises(ValueError):
                    observer.latest_backup(time.monotonic() + 10, NOW)


if __name__ == "__main__":
    unittest.main()
