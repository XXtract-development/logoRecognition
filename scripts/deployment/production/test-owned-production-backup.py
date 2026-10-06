#!/usr/bin/env python3
"""Fail-closed contract tests; no Docker, production, mount, or remote writes."""
import copy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "owned_backup", Path(__file__).with_name("backup-owned-production.py")
)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def fixture():
    env = dict(
        PRODUCTION_RESOURCE_NAME=backup.RESOURCE,
        POSTGRES_DB="owned_db",
        POSTGRES_ADMIN_USER="owned_admin",
        POSTGRES_ADMIN_PASSWORD="private",
        MINIO_ROOT_USER="owned_minio",
        MINIO_ROOT_PASSWORD="private_root",
        MINIO_APP_ACCESS_KEY="reader",
        MINIO_APP_SECRET_KEY="private_reader",
    )
    base = {
        "State": {"Running": True},
        "HostConfig": {"PortBindings": {}},
        "NetworkSettings": {"Networks": {"dedicated": {"IPAddress": "172.23.0.4"}}},
    }
    pg, minio = copy.deepcopy(base), copy.deepcopy(base)
    pg["Config"] = {
        "Env": [
            "POSTGRES_DB=owned_db",
            "POSTGRES_USER=owned_admin",
            "POSTGRES_PASSWORD=private",
        ],
        "Labels": {"com.docker.compose.service": "postgres"},
    }
    pg["Mounts"] = [
        {
            "Destination": "/var/lib/postgresql/data",
            "Type": "volume",
            "Name": backup.RESOURCE + "-postgres-data",
        }
    ]
    minio["Config"] = {
        "Env": ["MINIO_ROOT_USER=owned_minio", "MINIO_ROOT_PASSWORD=private_root"],
        "Labels": {"com.docker.compose.service": "minio"},
    }
    minio["Mounts"] = [
        {
            "Destination": "/data",
            "Type": "bind",
            "Source": str(backup.ROOT.parent / "minio-data"),
        }
    ]
    return env, pg, minio


class Guards(unittest.TestCase):
    def test_only_exact_owned_identity(self):
        env, pg, minio = fixture()
        self.assertEqual(
            backup.validate_identity(pg, minio, env), "http://172.23.0.4:9000"
        )
        for mutate in [
            lambda p, m: p["Mounts"][0].update(Name="other-postgres-data"),
            lambda p, m: p["Config"]["Env"].__setitem__(
                0, "POSTGRES_DB=production_other"
            ),
            lambda p, m: m["Mounts"][0].update(Source="/tmp/minio-data"),
            lambda p, m: m["Config"]["Labels"].update(
                {"com.docker.compose.service": "app"}
            ),
            lambda p, m: m["HostConfig"].update(
                PortBindings={"9000/tcp": [{"HostPort": "9000"}]}
            ),
            lambda p, m: p["State"].update(Running=False),
            lambda p, m: m["NetworkSettings"].update(
                Networks={"public": {"IPAddress": "8.8.8.8"}}
            ),
        ]:
            a, b = copy.deepcopy(pg), copy.deepcopy(minio)
            mutate(a, b)
            with self.assertRaises(ValueError):
                backup.validate_identity(a, b, env)

    def test_missing_mount_fails_before_creating_fallback_directory(self):
        with patch.object(Path, "is_mount", return_value=False), patch.object(
            Path, "mkdir"
        ) as mkdir:
            with self.assertRaises(ValueError):
                backup.require_mount()
            mkdir.assert_not_called()

    def test_mount_cannot_redirect_through_resource_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            mount = Path(temp)
            (mount / "prod").mkdir()
            (mount / "other").mkdir()
            (mount / "prod" / backup.RESOURCE).symlink_to(
                mount / "other", target_is_directory=True
            )
            root = mount / "prod" / backup.RESOURCE / "backups"
            with patch.object(backup, "MOUNT", mount), patch.object(
                backup, "ROOT", root
            ), patch.object(Path, "is_mount", return_value=True):
                with self.assertRaises(ValueError):
                    backup.require_mount()
            self.assertFalse((mount / "other" / "backups").exists())

    def test_private_env_and_exact_resource(self):
        env, _, _ = fixture()
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "private.env"
            path.write_text("\n".join(k + "=" + v for k, v in env.items()))
            path.chmod(0o600)
            self.assertEqual(backup.read_env(path), env)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                backup.read_env(path)
            path.chmod(0o600)
            path.write_text("PRODUCTION_RESOURCE_NAME=another\n")
            with self.assertRaises(ValueError):
                backup.read_env(path)

    def test_all_known_snapshot_reference_forms_including_json_pages(self):
        self.assertEqual(
            backup.storage_reference("models/new.pt"), ("models", "new.pt")
        )
        self.assertEqual(
            backup.storage_reference("reference-logos/X/new.png"),
            ("training-images", "reference-logos/X/new.png"),
        )
        self.assertEqual(
            backup.json_references(
                {
                    "pages": [{"imagePath": "artwork/new-page.png"}],
                    "metadata": {"thumbnailPath": "thumbnails/new.jpg"},
                    "irrelevant": "external text",
                }
            ),
            {("training-images", "artwork/new-page.png"), ("thumbnails", "new.jpg")},
        )
        for path in [
            "../x",
            "a//b",
            "a/../b",
            "/root/x",
            "https://external/x",
            "a\\b",
            "a\x00b",
        ]:
            with self.assertRaises(ValueError):
                backup.storage_reference(path)

    def test_deadline_fails_closed(self):
        with self.assertRaises(TimeoutError):
            backup.check_deadline(time.monotonic() - 1)
        with self.assertRaises(TimeoutError):
            backup.bounded_response(io.BytesIO(b"a"), 1, time.monotonic() - 1)


class Objects(unittest.TestCase):
    def test_archive_proves_every_current_object_and_fails_missing_or_changed(self):
        data = b"future upload never present in original transfer"
        manifest = [
            dict(
                bucket="recognition-images",
                key="future/own.png",
                size=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
            )
        ]
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "objects.tar"
            with tarfile.open(path, "w") as archive:
                member = tarfile.TarInfo("objects/recognition-images/future/own.png")
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
            backup.verify_archive(path, manifest, time.monotonic() + 10)
            bad = copy.deepcopy(manifest)
            bad[0]["sha256"] = "0" * 64
            with self.assertRaises(ValueError):
                backup.verify_archive(path, bad, time.monotonic() + 10)
            with self.assertRaises(ValueError):
                backup.verify_archive(path, [], time.monotonic() + 10)

    def test_bounded_partial_reads_and_conditional_etag(self):
        class Response(io.BytesIO):
            headers = {"ETag": '"v1"', "Content-Length": "5"}

            def read1(self, size):
                return self.read(size)

        client = backup.S3(
            "http://127.0.0.1:9000", "key", "secret", time.monotonic() + 10
        )
        with patch.object(client, "request", return_value=Response(b"123")) as request:
            with self.assertRaises(ValueError):
                client.copy_object(
                    "training-images",
                    "new.png",
                    {"size": 5, "etag": '"v1"'},
                    io.BytesIO(),
                )
            self.assertEqual(
                request.call_args.kwargs["extra_headers"], {"if-match": '"v1"'}
            )
        with patch.object(client, "request", return_value=Response(b"123456")):
            with self.assertRaises(ValueError):
                client.copy_object(
                    "training-images",
                    "new.png",
                    {"size": 5, "etag": '"v1"'},
                    io.BytesIO(),
                )
        with patch.object(client, "request", return_value=Response(b"12345")):
            output = io.BytesIO()
            item = client.copy_object(
                "training-images", "new.png", {"size": 5, "etag": '"v1"'}, output
            )
            self.assertEqual(output.getvalue(), b"12345")
            self.assertEqual(item["sha256"], hashlib.sha256(b"12345").hexdigest())

    def test_real_http_signed_paginated_inventory_all_buckets_and_new_upload(self):
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path, dict(self.headers)))
                if (
                    self.path.startswith("/training-images?")
                    and "continuation-token" not in self.path
                ):
                    xml = "<Contents><Key>new-upload.png</Key><Size>3</Size><ETag>&quot;v1&quot;</ETag></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>a+/=</NextContinuationToken>"
                else:
                    xml = "<IsTruncated>false</IsTruncated>"
                data = (
                    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
                    + xml
                    + "</ListBucketResult>"
                ).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            client = backup.S3(
                "http://127.0.0.1:" + str(server.server_port),
                "reader",
                "secret",
                time.monotonic() + 10,
            )
            inventory = client.inventory()
            self.assertEqual(
                inventory,
                {("training-images", "new-upload.png"): {"size": 3, "etag": '"v1"'}},
            )
            self.assertEqual(len(requests), 5)
            self.assertTrue(
                any("continuation-token=a%2B%2F%3D" in url for url, _ in requests)
            )
            self.assertEqual(
                {url.split("?")[0][1:] for url, _ in requests}, set(backup.BUCKETS)
            )
            for _, headers in requests:
                self.assertTrue(
                    headers["Authorization"].startswith(
                        "AWS4-HMAC-SHA256 Credential=reader/"
                    )
                )
                self.assertNotIn("secret", headers["Authorization"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_malformed_or_repeating_listing_is_failure_not_empty_success(self):
        class Response(io.BytesIO):
            def read1(self, size):
                return self.read(size)

        client = backup.S3(
            "http://127.0.0.1:9000", "key", "secret", time.monotonic() + 10
        )
        xml = b'<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><IsTruncated>true</IsTruncated><NextContinuationToken>same</NextContinuationToken></ListBucketResult>'
        with patch.object(
            client, "request", side_effect=lambda *_args, **_kw: Response(xml)
        ):
            with self.assertRaises(ValueError):
                client.inventory()
        with patch.object(client, "request", return_value=Response(b"<bad/>")):
            with self.assertRaises(ValueError):
                client.inventory()


class Publication(unittest.TestCase):
    def test_full_new_inventory_publication_and_changed_inventory_never_success(self):
        from contextlib import ExitStack

        env, pg, minio = fixture()
        pg["Image"] = "owned-pg-image"
        data = b"new upload"
        inventory = {
            ("recognition-images", "future.png"): {"size": len(data), "etag": '"new"'}
        }
        metadata = {
            "table_counts": {
                "_prisma_migrations": 21,
                "reference_logos": 604,
                "logo_images": 877,
                "reference_embeddings": 542,
            },
            "storage_references": [("recognition-images", "future.png")],
        }

        class FakeSnapshot:
            token = "00000003-0000000A-1"

            def __init__(self, *_):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_):
                pass

        def fake_run(command, **kwargs):
            if "inspect" in command:
                if "image" in command:
                    return json.dumps(
                        [{"RepoDigests": ["pgvector@" + backup.PG_DIGEST]}]
                    ).encode()
                return json.dumps([pg if command[-1] == "pg-owned" else minio]).encode()
            if "pg_dump" in command:
                self.assertIn("--snapshot=" + FakeSnapshot.token, command)
                kwargs["output"].write(b"consistent archive")
                return None
            if "pg_dumpall" in command:
                kwargs["output"].write(b"private roles")
                return None
            if "pg_restore" in command:
                return "".join(
                    "1; 1 1 TABLE DATA public " + t + " owner\n"
                    for t in metadata["table_counts"]
                ).encode()
            self.fail("Unexpected operation " + str(command))

        for changed, cleanup_failure in [(False, False), (True, False), (False, True)]:
            with tempfile.TemporaryDirectory() as temp, ExitStack() as stack:
                root = Path(temp).resolve() / "external"
                root.mkdir()
                staging = Path(temp).resolve() / "local"
                staging.mkdir(mode=0o700)
                prior = staging / "first-run"
                prior.mkdir(mode=0o700)
                (prior / "previous-private-proof").write_bytes(b"retain old run")
                key_path = staging / "backup.key"
                key_path.write_bytes(b"k" * 32)
                key_path.chmod(0o600)
                stack.enter_context(patch.object(backup, "ROOT", root))
                stack.enter_context(patch.object(backup, "require_mount"))
                stack.enter_context(patch.object(Path, "is_socket", return_value=True))
                stack.enter_context(patch.dict(backup.os.environ, {}, clear=True))
                stack.enter_context(
                    patch.object(
                        backup,
                        "validate_identity",
                        return_value="http://172.23.0.4:9000",
                    )
                )
                stack.enter_context(patch.object(backup, "run", side_effect=fake_run))
                stack.enter_context(patch.object(backup, "Snapshot", FakeSnapshot))
                stack.enter_context(
                    patch.object(backup, "snapshot_metadata", return_value=metadata)
                )
                client = stack.enter_context(patch.object(backup, "S3")).return_value
                after = (
                    {
                        **inventory,
                        ("training-images", "newer.png"): {"size": 1, "etag": '"next"'},
                    }
                    if changed
                    else inventory
                )
                client.inventory.side_effect = [inventory, after]

                def copy(bucket, key, expected, output):
                    output.write(data)
                    return {
                        "bucket": bucket,
                        "key": key,
                        "size": len(data),
                        "etag": expected["etag"],
                        "sha256": hashlib.sha256(data).hexdigest(),
                    }

                client.copy_object.side_effect = copy
                if cleanup_failure:

                    def fail_cleanup(folder, *_):
                        proof = json.loads(
                            (root / folder.name / "receipt.json").read_text()
                        )
                        self.assertTrue(proof["authenticated_readback_verified"])
                        raise OSError("synthetic cleanup failure")

                    stack.enter_context(
                        patch.object(
                            backup, "cleanup_own_private_run", side_effect=fail_cleanup
                        )
                    )
                if cleanup_failure:
                    with self.assertRaises(OSError):
                        backup.backup(env, "pg-owned", "minio-owned", key_path, staging)
                    published = list(root.iterdir())[0]
                    self.assertFalse(
                        json.loads((published / "receipt.json").read_text())[
                            "private_stage_removed"
                        ]
                    )
                    self.assertTrue((staging / published.name / "failed.json").exists())
                elif changed:
                    with self.assertRaises(ValueError):
                        backup.backup(env, "pg-owned", "minio-owned", key_path, staging)
                    self.assertEqual(list(root.iterdir()), [])
                    folders = [
                        p for p in staging.iterdir() if p.is_dir() and p != prior
                    ]
                    self.assertTrue((folders[0] / "failed.json").exists())
                    self.assertFalse((folders[0] / "receipt.json").exists())
                else:
                    result = backup.backup(
                        env, "pg-owned", "minio-owned", key_path, staging
                    )
                    self.assertEqual(result["objects"], 1)
                    folder = root / result["backup"]
                    self.assertFalse(folder.name.startswith(".incomplete"))
                    proof = json.loads((folder / "receipt.json").read_text())
                    self.assertEqual(proof["status"], "passed")
                    self.assertFalse(proof["restore_tested"])
                    self.assertTrue(proof["authenticated_readback_verified"])
                    self.assertEqual(
                        {p.name for p in folder.iterdir()},
                        {"payload.aes256gcm", "receipt.json"},
                    )
                    self.assertNotIn(
                        "future.png", (folder / "receipt.json").read_text()
                    )
                    private = staging / result["backup"]
                    self.assertFalse(private.exists())
                    self.assertTrue(proof["private_stage_removed"])
                    self.assertTrue(result["private_stage_removed"])
                    validation = staging / "independent-validation.tar"
                    backup.decrypt_package(
                        folder / "payload.aes256gcm",
                        validation,
                        b"k" * 32,
                        proof["header"],
                        proof["tag"],
                        time.monotonic() + 10,
                    )
                    with tarfile.open(validation) as package:
                        manifest = json.load(
                            package.extractfile("object-manifest.json")
                        )
                        self.assertEqual(manifest[0]["key"], "future.png")
                        private_proof = json.load(package.extractfile("receipt.json"))
                        self.assertEqual(
                            private_proof["storage_references"],
                            [["recognition-images", "future.png"]],
                        )
                self.assertEqual(
                    (prior / "previous-private-proof").read_bytes(), b"retain old run"
                )
                self.assertEqual(key_path.read_bytes(), b"k" * 32)

    def test_cleanup_refuses_wrong_inode_or_parent(self):
        with tempfile.TemporaryDirectory() as temp:
            staging = Path(temp).resolve()
            staging.chmod(0o700)
            run = staging / "new-owned-run"
            run.mkdir(mode=0o700)
            (run / "own.txt").write_text("own")
            identity = (run.stat().st_dev, run.stat().st_ino)
            with self.assertRaises(ValueError):
                backup.cleanup_own_private_run(
                    run, staging, (identity[0], identity[1] + 1)
                )
            self.assertTrue((run / "own.txt").exists())
            with self.assertRaises(ValueError):
                backup.cleanup_own_private_run(run, run, identity)
            self.assertTrue((run / "own.txt").exists())
            backup.cleanup_own_private_run(run, staging, identity)
            self.assertFalse(run.exists())


class Encryption(unittest.TestCase):
    def test_real_aes256gcm_roundtrip_and_all_tampering_fails_before_use(self):
        from cryptography.exceptions import InvalidTag

        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp).resolve()
            source = folder / "plain"
            encrypted = folder / "encrypted"
            source.write_bytes(b"private roles and product rows" * 50000)
            key = b"k" * 32
            header = {
                "nonce": "01" * 12,
                "resource": backup.RESOURCE,
                "objects": 1069,
                "plaintext_bytes": source.stat().st_size,
            }
            deadline = time.monotonic() + 10
            tag = backup.encrypt_package(source, encrypted, key, header, deadline)
            self.assertNotIn(b"private roles", encrypted.read_bytes())
            output = folder / "authenticated"
            backup.decrypt_package(encrypted, output, key, header, tag, deadline)
            self.assertEqual(source.read_bytes(), output.read_bytes())
            for changed_key, changed_header, changed_tag in [
                (b"x" * 32, header, tag),
                (key, {**header, "objects": 1070}, tag),
                (key, header, "00" * 16),
            ]:
                bad = folder / "unauthenticated"
                with self.assertRaises(InvalidTag):
                    backup.decrypt_package(
                        encrypted,
                        bad,
                        changed_key,
                        changed_header,
                        changed_tag,
                        deadline,
                    )
                self.assertFalse(bad.exists())
            changed = bytearray(encrypted.read_bytes())
            changed[50] ^= 1
            encrypted.write_bytes(changed)
            with self.assertRaises(InvalidTag):
                backup.decrypt_package(
                    encrypted, folder / "modified", key, header, tag, deadline
                )
            self.assertFalse((folder / "modified").exists())

    def test_decrypt_preserves_existing_destination_symlink_and_ciphertext(self):
        from cryptography.exceptions import InvalidTag

        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp).resolve()
            plain = folder / "plain"
            cipher = folder / "cipher"
            plain.write_bytes(b"original private data" * 60000)
            key = b"k" * 32
            header = {"nonce": "ab" * 12, "plaintext_bytes": plain.stat().st_size}
            deadline = time.monotonic() + 10
            tag = backup.encrypt_package(plain, cipher, key, header, deadline)
            original_cipher = cipher.read_bytes()
            existing = folder / "existing"
            existing.write_bytes(b"do not delete prior data")
            with self.assertRaises(FileExistsError):
                backup.decrypt_package(cipher, existing, key, header, tag, deadline)
            self.assertEqual(existing.read_bytes(), b"do not delete prior data")
            link = folder / "existing-link"
            link.symlink_to(existing)
            with self.assertRaises(FileExistsError):
                backup.decrypt_package(cipher, link, key, header, tag, deadline)
            self.assertTrue(link.is_symlink())
            self.assertEqual(existing.read_bytes(), b"do not delete prior data")
            with self.assertRaises(ValueError):
                backup.decrypt_package(cipher, cipher, key, header, tag, deadline)
            self.assertEqual(cipher.read_bytes(), original_cipher)
            partial = folder / "new-partial"
            with self.assertRaises(InvalidTag):
                backup.decrypt_package(
                    cipher, partial, key, header, "00" * 16, deadline
                )
            self.assertFalse(partial.exists())
            self.assertEqual(cipher.read_bytes(), original_cipher)

    def test_actual_permission_and_key_length_checks_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp).resolve()
            folder.chmod(0o700)
            key = folder / "backup.key"
            key.write_bytes(b"k" * 32)
            key.chmod(0o600)
            self.assertEqual(backup.read_encryption_key(key), b"k" * 32)
            for mode in [0o644, 0o755]:
                key.chmod(mode)
                with self.assertRaises(ValueError):
                    backup.read_encryption_key(key)
            key.chmod(0o600)
            key.write_bytes(b"k" * 31)
            with self.assertRaises(ValueError):
                backup.read_encryption_key(key)
            key.write_bytes(b"k" * 32)
            link = folder / "link"
            link.symlink_to(key)
            with self.assertRaises(ValueError):
                backup.read_encryption_key(link)
            folder.chmod(0o755)
            with self.assertRaises(ValueError):
                backup.require_private_directory(folder)
            folder.chmod(0o700)

    def test_space_guard_and_external_staging_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp).resolve()
            folder.chmod(0o700)
            with patch.object(backup, "MOUNT", folder):
                with self.assertRaises(ValueError):
                    backup.require_private_staging(folder / "plaintext")
            with patch.object(
                backup.shutil,
                "disk_usage",
                return_value=type("Space", (), {"free": 1})(),
            ):
                with self.assertRaises(ValueError):
                    backup.require_local_space(folder)
            with self.assertRaises(ValueError):
                backup.require_local_space(folder, backup.MAX_PACKAGE_BYTES + 1)

    def test_interrupted_encryption_never_publishes_plaintext_or_success_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp).resolve()
            private = base / "private"
            private.mkdir(mode=0o700)
            source = private / "roles.sql"
            source.write_bytes(b"secret private roles")
            source.chmod(0o600)
            external = base / "box"
            external.mkdir()

            def interrupt(_source, dest, *_):
                dest.write_bytes(b"encrypted partial only")
                raise KeyboardInterrupt()

            with patch.object(backup, "ROOT", external), patch.object(
                backup, "encrypt_package", side_effect=interrupt
            ):
                with self.assertRaises(KeyboardInterrupt):
                    backup.publish_encrypted(
                        private, "test-run", b"k" * 32, 1, 35, time.monotonic() + 10
                    )
            self.assertTrue(source.exists())
            self.assertEqual(
                {p.name for p in (external / ".incomplete-test-run").iterdir()},
                {"payload.aes256gcm"},
            )
            self.assertNotIn(
                b"secret private roles",
                (external / ".incomplete-test-run" / "payload.aes256gcm").read_bytes(),
            )


if __name__ == "__main__":
    unittest.main()
