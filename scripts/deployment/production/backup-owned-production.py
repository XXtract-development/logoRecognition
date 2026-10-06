#!/usr/bin/env python3
"""Read-only daily backup of the exact owned production DB and current private buckets.
No container lifecycle actions, restores, source/backup deletion or stale transfer manifest.
Only this run's authenticated and published temporary plaintext is cleaned up.
Requires Python cryptography and the local Docker CLI.
"""
import argparse
import datetime as dt
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import resource
import shutil
import stat
import selectors
import subprocess
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

RESOURCE = "logo-production-20261005"
MOUNT = Path("/mnt/storagebox-home")
ROOT = MOUNT / "prod" / RESOURCE / "backups"
BUCKETS = ("training-images", "recognition-images", "thumbnails", "models")
MAX_OBJECT_BYTES = 128 * 1024 * 1024
MAX_LIST_BYTES = 4 * 1024 * 1024
MAX_OBJECTS = 100000
MAX_RUN_SECONDS = 3600
MAX_PACKAGE_BYTES = 512 * 1024 * 1024
STAGING = Path("/root/logo-production-20261005/private-backup-staging")
DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]
PG_DIGEST = "sha256:d88687938e7336e1ecd1d8c2f29a750e6ab033e511b04a57a1f2d6d2219a0435"


def check_deadline(deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Backup total deadline exceeded")
    return remaining


def run(command, *, deadline, output=None, data=None, source=None):
    result = subprocess.run(
        command,
        input=data,
        stdin=source,
        stdout=output or subprocess.PIPE,
        stderr=subprocess.PIPE,
        preexec_fn=(
            (
                lambda: resource.setrlimit(
                    resource.RLIMIT_FSIZE, (MAX_PACKAGE_BYTES, MAX_PACKAGE_BYTES)
                )
            )
            if output
            else None
        ),
        timeout=min(600, check_deadline(deadline)),
    )
    if result.returncode:
        raise RuntimeError("Backup subprocess failed; private output withheld")
    return result.stdout


def read_env(path):
    path = Path(path)
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError("Private environment file permissions required")
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    for key in (
        "PRODUCTION_RESOURCE_NAME",
        "POSTGRES_DB",
        "POSTGRES_ADMIN_USER",
        "POSTGRES_ADMIN_PASSWORD",
        "MINIO_ROOT_USER",
        "MINIO_ROOT_PASSWORD",
        "MINIO_APP_ACCESS_KEY",
        "MINIO_APP_SECRET_KEY",
    ):
        if not values.get(key):
            raise ValueError("Required private backup configuration absent")
    if values["PRODUCTION_RESOURCE_NAME"] != RESOURCE:
        raise ValueError("Wrong dedicated resource")
    return values


def require_mount():
    if not MOUNT.is_mount() or MOUNT.resolve() != MOUNT:
        raise ValueError("Verified external StorageBox mount required")
    if (
        ROOT.parent.resolve() != ROOT.parent
        or ROOT.parent.parent.resolve() != ROOT.parent.parent
    ):
        raise ValueError("Dedicated backup parents cannot be symlinks")
    if ROOT.is_symlink():
        raise ValueError("Backup directory cannot be a symlink")
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    if ROOT.resolve() != ROOT or any(
        p.is_symlink() for p in (ROOT, ROOT.parent, ROOT.parent.parent)
    ):
        raise ValueError("Backup path cannot redirect outside dedicated StorageBox")


def env_of(info):
    return dict(item.split("=", 1) for item in info["Config"]["Env"] if "=" in item)


def validate_identity(pg, minio, env):
    for info, service in ((pg, "postgres"), (minio, "minio")):
        if (
            not info["State"]["Running"]
            or info["Config"].get("Labels", {}).get("com.docker.compose.service")
            != service
        ):
            raise ValueError("Wrong or stopped owned service")
        if any(info["HostConfig"].get("PortBindings", {}).values()):
            raise ValueError("Production storage services must remain private")
    pg_env = env_of(pg)
    if any(
        pg_env.get(actual) != env[expected]
        for actual, expected in (
            ("POSTGRES_DB", "POSTGRES_DB"),
            ("POSTGRES_USER", "POSTGRES_ADMIN_USER"),
            ("POSTGRES_PASSWORD", "POSTGRES_ADMIN_PASSWORD"),
        )
    ):
        raise ValueError("Owned DB identity mismatch")
    mounts = [m for m in pg["Mounts"] if m["Destination"] == "/var/lib/postgresql/data"]
    if (
        len(mounts) != 1
        or mounts[0].get("Type") != "volume"
        or mounts[0].get("Name") != RESOURCE + "-postgres-data"
    ):
        raise ValueError("Owned PostgreSQL volume mismatch")
    minio_env = env_of(minio)
    if (
        minio_env.get("MINIO_ROOT_USER") != env["MINIO_ROOT_USER"]
        or minio_env.get("MINIO_ROOT_PASSWORD") != env["MINIO_ROOT_PASSWORD"]
    ):
        raise ValueError("Owned MinIO identity mismatch")
    mounts = [m for m in minio["Mounts"] if m["Destination"] == "/data"]
    if (
        len(mounts) != 1
        or mounts[0].get("Type") != "bind"
        or mounts[0].get("Source") != str(ROOT.parent / "minio-data")
    ):
        raise ValueError("Owned MinIO StorageBox bind mismatch")
    shared = set(pg["NetworkSettings"]["Networks"]) & set(
        minio["NetworkSettings"]["Networks"]
    )
    addresses = {
        minio["NetworkSettings"]["Networks"][n].get("IPAddress") for n in shared
    }
    addresses.discard("")
    if len(addresses) != 1:
        raise ValueError("Unambiguous shared private storage network required")
    address = addresses.pop()
    if (
        not ipaddress.ip_address(address).is_private
        or ipaddress.ip_address(address).version != 4
    ):
        raise ValueError("Private owned MinIO IPv4 required")
    return "http://" + address + ":9000"


def valid_key(key):
    return (
        isinstance(key, str)
        and 0 < len(key) <= 1024
        and not any(ord(c) < 32 or ord(c) == 127 for c in key)
        and "\\" not in key
        and all(p not in ("", ".", "..") for p in key.split("/"))
    )


def storage_reference(path):
    if not isinstance(path, str) or not valid_key(path) or "://" in path:
        raise ValueError("Unsafe or unsupported DB storage reference")
    first, _, remainder = path.partition("/")
    return (
        (first, remainder)
        if first in BUCKETS and remainder
        else ("training-images", path)
    )


def bounded_response(response, limit, deadline):
    chunks, size = [], 0
    while True:
        check_deadline(deadline)
        chunk = response.read1(min(65536, limit + 1 - size))
        if not chunk:
            return b"".join(chunks)
        size += len(chunk)
        if size > limit:
            raise ValueError("Storage response exceeds bound")
        chunks.append(chunk)


def json_references(value):
    result = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if (
                key
                in {
                    "storagePath",
                    "storage_path",
                    "cropPath",
                    "crop_path",
                    "thumbnailPath",
                    "thumbnail_path",
                    "imagePath",
                    "image_path",
                    "page_key",
                }
                and item
            ):
                result.add(storage_reference(item))
            else:
                result.update(json_references(item))
    elif isinstance(value, list):
        for item in value:
            result.update(json_references(item))
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Storage redirects forbidden")


class S3:
    def __init__(self, endpoint, access, secret, deadline):
        self.endpoint, self.access, self.secret, self.deadline = (
            endpoint,
            access,
            secret,
            deadline,
        )
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )

    def request(self, bucket, key="", query=None, extra_headers=None):
        if bucket not in BUCKETS or (key and not valid_key(key)):
            raise ValueError("Only exact private bucket keys supported")
        now = dt.datetime.now(dt.timezone.utc)
        stamp, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
        path = (
            "/" + bucket + ("/" + urllib.parse.quote(key, safe="/-_.~") if key else "")
        )
        query_string = "&".join(
            urllib.parse.quote(str(k), safe="-_.~")
            + "="
            + urllib.parse.quote(str(v), safe="-_.~")
            for k, v in sorted((query or {}).items())
        )
        headers = {
            "host": urllib.parse.urlsplit(self.endpoint).netloc,
            "x-amz-date": stamp,
            "x-amz-content-sha256": hashlib.sha256(b"").hexdigest(),
            **(extra_headers or {}),
        }
        names = ";".join(sorted(headers))
        canonical = (
            "GET\n"
            + path
            + "\n"
            + query_string
            + "\n"
            + "".join(k + ":" + headers[k].strip() + "\n" for k in sorted(headers))
            + "\n"
            + names
            + "\n"
            + headers["x-amz-content-sha256"]
        )
        scope = day + "/us-east-1/s3/aws4_request"
        to_sign = (
            "AWS4-HMAC-SHA256\n"
            + stamp
            + "\n"
            + scope
            + "\n"
            + hashlib.sha256(canonical.encode()).hexdigest()
        )
        signing_key = ("AWS4" + self.secret).encode()
        for part in (day, "us-east-1", "s3", "aws4_request"):
            signing_key = hmac.new(signing_key, part.encode(), hashlib.sha256).digest()
        signature = hmac.new(signing_key, to_sign.encode(), hashlib.sha256).hexdigest()
        headers["Authorization"] = (
            "AWS4-HMAC-SHA256 Credential="
            + self.access
            + "/"
            + scope
            + ", SignedHeaders="
            + names
            + ", Signature="
            + signature
        )
        response = self.opener.open(
            urllib.request.Request(
                self.endpoint + path + ("?" + query_string if query_string else ""),
                headers=headers,
            ),
            timeout=min(15, check_deadline(self.deadline)),
        )
        if response.status != 200:
            response.close()
            raise ValueError("Private storage read failed")
        return response

    def inventory(self):
        entries = {}
        for bucket in BUCKETS:
            token = None
            seen_tokens = set()
            while True:
                query = {"list-type": "2", "max-keys": "1000"}
                if token:
                    query["continuation-token"] = token
                with self.request(bucket, query=query) as response:
                    data = bounded_response(response, MAX_LIST_BYTES, self.deadline)
                if len(data) > MAX_LIST_BYTES:
                    raise ValueError("Storage listing too large")
                root = ET.fromstring(data)
                ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
                for item in root.findall("s:Contents", ns):
                    key, size, etag = (
                        item.findtext("s:Key", namespaces=ns),
                        int(item.findtext("s:Size", namespaces=ns)),
                        item.findtext("s:ETag", namespaces=ns),
                    )
                    if (
                        not valid_key(key)
                        or not etag
                        or size < 0
                        or size > MAX_OBJECT_BYTES
                        or (bucket, key) in entries
                    ):
                        raise ValueError(
                            "Unsafe, duplicate or oversized current object"
                        )
                    entries[(bucket, key)] = {"size": size, "etag": etag}
                    if len(entries) > MAX_OBJECTS:
                        raise ValueError(
                            "Current inventory exceeds reviewed backup bound"
                        )
                truncated = root.findtext("s:IsTruncated", namespaces=ns)
                if truncated == "false":
                    break
                token = root.findtext("s:NextContinuationToken", namespaces=ns)
                if truncated != "true" or not token or token in seen_tokens:
                    raise ValueError("Malformed or repeating listing pagination")
                seen_tokens.add(token)
        return entries

    def copy_object(self, bucket, key, expected, output):
        digest = hashlib.sha256()
        size = 0
        with self.request(
            bucket, key, extra_headers={"if-match": expected["etag"]}
        ) as response:
            if (
                response.headers.get("ETag") != expected["etag"]
                or int(response.headers.get("Content-Length", "-1")) != expected["size"]
            ):
                raise ValueError("Object changed before read")
            while True:
                check_deadline(self.deadline)
                chunk = response.read1(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > expected["size"] or size > MAX_OBJECT_BYTES:
                    raise ValueError("Object read exceeds declared bound")
                digest.update(chunk)
                output.write(chunk)
        if size != expected["size"]:
            raise ValueError("Partial object read")
        return {
            "bucket": bucket,
            "key": key,
            "size": size,
            "sha256": digest.hexdigest(),
            "etag": expected["etag"],
        }


class Snapshot:
    def __init__(self, container, env, deadline):
        self.command = DOCKER + [
            "exec",
            "-i",
            container,
            "psql",
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            env["POSTGRES_ADMIN_USER"],
            "-d",
            env["POSTGRES_DB"],
        ]
        self.deadline = deadline
        self.process = None
        self.pending = b""

    def __enter__(self):
        self.process = subprocess.Popen(
            self.command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=0,
        )
        try:
            self.query(
                "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='3700s';"
            )
            self.token = self.query("SELECT pg_export_snapshot();")[0]
            if not re.fullmatch(r"[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+", self.token):
                raise ValueError("Invalid database snapshot token")
            return self
        except BaseException:
            self.__exit__(None, None, None)
            raise

    def query(self, sql):
        marker = "BACKUP_END_" + os.urandom(8).hex()
        self.process.stdin.write((sql + "\n\\echo " + marker + "\n").encode())
        lines = []
        deadline = min(self.deadline, time.monotonic() + 45)
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout, selectors.EVENT_READ)
            while True:
                while b"\n" in self.pending:
                    line, self.pending = self.pending.split(b"\n", 1)
                    if line.decode() == marker:
                        return lines
                    lines.append(line.decode())
                if not selector.select(check_deadline(deadline)):
                    raise TimeoutError("Snapshot query timed out")
                data = os.read(self.process.stdout.fileno(), 65536)
                if not data:
                    raise RuntimeError("Snapshot session ended unexpectedly")
                self.pending += data
                if (
                    len(self.pending) + sum(len(line) for line in lines)
                    > 32 * 1024 * 1024
                ):
                    raise ValueError("Snapshot metadata exceeds reviewed bound")

    def __exit__(self, *_):
        if self.process:
            self.process.stdin.close()  # EOF closes transaction: rollback, never mutate production.
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)


def snapshot_metadata(snapshot):
    tables = json.loads(
        snapshot.query(
            "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public';"
        )[0]
    )
    if not {
        "_prisma_migrations",
        "reference_logos",
        "logo_images",
        "reference_embeddings",
    } <= set(tables):
        raise ValueError("Required production tables missing")
    counts, references = {}, set()
    for table in tables:
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", table):
            raise ValueError("Unexpected table identifier")
        counts[table] = int(
            snapshot.query('SELECT count(*) FROM public."' + table + '";')[0]
        )
        columns = json.loads(
            snapshot.query(
                "SELECT coalesce(json_agg(column_name),'[]') FROM information_schema.columns WHERE table_schema='public' AND table_name='"
                + table
                + "' AND column_name IN ('storage_path','crop_path','thumbnail_path');"
            )[0]
        )
        for column in columns:
            paths = json.loads(
                snapshot.query(
                    'SELECT coalesce(json_agg(DISTINCT "'
                    + column
                    + "\"),'[]') FROM public.\""
                    + table
                    + '" WHERE "'
                    + column
                    + '" IS NOT NULL AND "'
                    + column
                    + "\" <> '';"
                )[0]
            )
            references.update(storage_reference(path) for path in paths)
        json_columns = json.loads(
            snapshot.query(
                "SELECT coalesce(json_agg(column_name),'[]') FROM information_schema.columns WHERE table_schema='public' AND table_name='"
                + table
                + "' AND data_type IN ('json','jsonb');"
            )[0]
        )
        for column in json_columns:
            if not re.fullmatch(r"[a-z_][a-z0-9_]*", column):
                raise ValueError("Unexpected JSON column identifier")
            values = json.loads(
                snapshot.query(
                    'SELECT coalesce(json_agg("'
                    + column
                    + "\"),'[]') FROM public.\""
                    + table
                    + '" WHERE "'
                    + column
                    + '" IS NOT NULL;'
                )[0]
            )
            references.update(json_references(values))
    return {"table_counts": counts, "storage_references": sorted(references)}


def sha_file(path, deadline):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            check_deadline(deadline)
            digest.update(chunk)
    return digest.hexdigest()


def verify_archive(path, manifest, deadline):
    expected = {
        "objects/" + item["bucket"] + "/" + item["key"]: item for item in manifest
    }
    with tarfile.open(path) as archive:
        members = archive.getmembers()
        if (
            len(members) != len(expected)
            or {m.name for m in members} != set(expected)
            or any(not m.isfile() for m in members)
        ):
            raise ValueError("Backup tar does not match complete current inventory")
        for member in members:
            digest = hashlib.sha256()
            with archive.extractfile(member) as source:
                for chunk in iter(lambda: source.read(65536), b""):
                    check_deadline(deadline)
                    digest.update(chunk)
            item = expected[member.name]
            if member.size != item["size"] or digest.hexdigest() != item["sha256"]:
                raise ValueError("Backup tar hash readback mismatch")


def require_private_directory(path):
    if path.is_symlink() or path.resolve() != path or not path.is_dir():
        raise ValueError("Real private local directory required")
    info = path.stat()
    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("Actual owner-only directory permissions required")


def require_private_staging(path):
    if not path.is_absolute() or path.resolve() != path or path.is_relative_to(MOUNT):
        raise ValueError(
            "Plaintext staging must be a real local path outside StorageBox"
        )
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require_private_directory(path)
    if MOUNT.exists() and path.stat().st_dev == MOUNT.stat().st_dev:
        raise ValueError("Plaintext cannot use the external mount filesystem")
    return path


def read_encryption_key(path):
    path = Path(path)
    require_private_directory(path.parent)
    info = path.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.geteuid()
        or stat.S_IMODE(info.st_mode) != 0o600
    ):
        raise ValueError("Actual owner-only regular encryption key required")
    with path.open("rb") as source:
        key = source.read(33)
    if len(key) != 32:
        raise ValueError("Exactly 32 raw encryption-key bytes required")
    return key


def require_local_space(folder, predicted=None):
    size = sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
    if size > MAX_PACKAGE_BYTES or (
        predicted is not None and predicted > MAX_PACKAGE_BYTES
    ):
        raise ValueError("Plaintext package exceeds reviewed local bound")
    # Reserve room for package, decrypted authenticated validation copy and growth, not only current objects.
    if shutil.disk_usage(folder).free < 3 * MAX_PACKAGE_BYTES:
        raise ValueError("Insufficient local private staging capacity")


def canonical_header(header):
    return json.dumps(header, sort_keys=True, separators=(",", ":")).encode()


def encrypt_package(source, destination, key, header, deadline):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    encryptor = Cipher(
        algorithms.AES(key), modes.GCM(bytes.fromhex(header["nonce"]))
    ).encryptor()
    encryptor.authenticate_additional_data(canonical_header(header))
    with source.open("rb") as plain, destination.open("xb") as output:
        for chunk in iter(lambda: plain.read(1024 * 1024), b""):
            check_deadline(deadline)
            output.write(encryptor.update(chunk))
        output.write(encryptor.finalize())
        output.flush()
        os.fsync(output.fileno())
    return encryptor.tag.hex()


def decrypt_package(source, destination, key, header, tag, deadline):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

    if source.resolve() == destination.resolve():
        raise ValueError("Ciphertext and private validation output must be distinct")
    expected_bytes = header["plaintext_bytes"]
    if (
        not isinstance(expected_bytes, int)
        or expected_bytes < 0
        or expected_bytes > MAX_PACKAGE_BYTES
        or source.stat().st_size != expected_bytes
    ):
        raise ValueError("Encrypted payload size outside reviewed bound")
    decryptor = Cipher(
        algorithms.AES(key),
        modes.GCM(bytes.fromhex(header["nonce"]), bytes.fromhex(tag)),
    ).decryptor()
    decryptor.authenticate_additional_data(canonical_header(header))
    size = 0
    created_identity = None
    try:
        with source.open("rb") as encrypted, destination.open("xb") as output:
            info = os.fstat(output.fileno())
            created_identity = (info.st_dev, info.st_ino)
            for chunk in iter(lambda: encrypted.read(1024 * 1024), b""):
                check_deadline(deadline)
                size += len(chunk)
                if size > expected_bytes:
                    raise ValueError("Encrypted payload changed during readback")
                output.write(decryptor.update(chunk))
            if size != expected_bytes:
                raise ValueError("Partial encrypted payload readback")
            output.write(
                decryptor.finalize()
            )  # Authentication must pass before plaintext is used or published.
    except BaseException:
        # Exclusive-open failure never grants ownership of an existing file or symlink.
        if created_identity is not None:
            try:
                info = destination.lstat()
            except FileNotFoundError:
                pass
            else:
                if (
                    stat.S_ISREG(info.st_mode)
                    and (info.st_dev, info.st_ino) == created_identity
                ):
                    destination.unlink()  # Only our own unauthenticated validation output.
        raise


def verify_package(path, expected, deadline):
    with tarfile.open(path) as package:
        members = package.getmembers()
        if (
            len(members) != len(expected)
            or {m.name for m in members} != set(expected)
            or any(not m.isfile() for m in members)
        ):
            raise ValueError(
                "Encrypted package entries differ from verified private files"
            )
        for member in members:
            digest = hashlib.sha256()
            with package.extractfile(member) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    check_deadline(deadline)
                    digest.update(chunk)
            if (
                member.size != expected[member.name]["bytes"]
                or digest.hexdigest() != expected[member.name]["sha256"]
            ):
                raise ValueError("Decrypted package entry hash mismatch")


def publish_encrypted(folder, name, key, objects, tables, deadline):
    require_private_directory(folder)
    files = [p for p in folder.iterdir() if p.is_file()]
    if any(
        p.is_symlink()
        or p.stat().st_uid != os.geteuid()
        or stat.S_IMODE(p.stat().st_mode) != 0o600
        for p in files
    ):
        raise ValueError("Actual plaintext-file permissions required before encryption")
    require_local_space(folder)
    expected = {
        p.name: {"bytes": p.stat().st_size, "sha256": sha_file(p, deadline)}
        for p in files
    }
    package = folder / "package.tar"
    with tarfile.open(package, "x") as archive:
        for path in files:
            archive.add(path, arcname=path.name, recursive=False)
    if package.stat().st_size > MAX_PACKAGE_BYTES:
        raise ValueError("Encrypted package input exceeds reviewed bound")
    header = {
        "format": "logo-owned-backup-aes256gcm-v1",
        "resource": RESOURCE,
        "backup": name,
        "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "nonce": os.urandom(12).hex(),
        "objects": objects,
        "tables": tables,
        "plaintext_bytes": package.stat().st_size,
        "plaintext_sha256": sha_file(package, deadline),
    }
    public = ROOT / (".incomplete-" + name)
    public.mkdir(mode=0o700)
    payload = public / "payload.aes256gcm"
    tag = encrypt_package(package, payload, key, header, deadline)
    # Read the actual external ciphertext back, authenticate, then compare every decrypted package entry.
    validation = folder / "authenticated-readback.tar"
    decrypt_package(payload, validation, key, header, tag, deadline)
    if sha_file(validation, deadline) != header["plaintext_sha256"]:
        raise ValueError("Authenticated package readback mismatch")
    verify_package(validation, expected, deadline)
    receipt = {
        "status": "passed",
        "restore_tested": False,
        "authenticated_readback_verified": True,
        "private_stage_removed": False,
        "header": header,
        "tag": tag,
        "encrypted_bytes": payload.stat().st_size,
        "encrypted_sha256": sha_file(payload, deadline),
    }
    (public / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    with (public / "receipt.json").open("rb") as handle:
        os.fsync(handle.fileno())
    if set(p.name for p in public.iterdir()) != {"payload.aes256gcm", "receipt.json"}:
        raise ValueError(
            "External backup may contain only ciphertext and sanitized receipt"
        )
    if (ROOT / name).exists():
        raise ValueError("Existing external backup will never be replaced")
    os.rename(public, ROOT / name)


def cleanup_own_private_run(folder, staging, created_identity):
    require_private_directory(staging)
    require_private_directory(folder)
    info = folder.stat()
    if folder.parent != staging or (info.st_dev, info.st_ino) != created_identity:
        raise ValueError("Refuse cleanup of any directory not created by this run")
    shutil.rmtree(folder)
    if folder.exists():
        raise RuntimeError("Owned private staging cleanup incomplete")


def record_successful_cleanup(name):
    receipt_path = ROOT / name / "receipt.json"
    proof = json.loads(receipt_path.read_text())
    if proof.get("status") != "passed" or not proof.get(
        "authenticated_readback_verified"
    ):
        raise ValueError(
            "Verified external publication required before recording cleanup"
        )
    proof["private_stage_removed"] = True
    temporary = receipt_path.with_suffix(".json.pending")
    with temporary.open("x") as output:
        output.write(json.dumps(proof, indent=2) + "\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, receipt_path)


def backup(env, pg_container, minio_container, key_path, staging=STAGING):
    deadline = time.monotonic() + MAX_RUN_SECONDS
    os.umask(0o077)
    require_mount()
    encryption_key = read_encryption_key(key_path)
    staging = require_private_staging(Path(staging))
    # Refuse remote Docker contexts: this helper must run on the production host itself.
    if (
        os.environ.get("DOCKER_CONTEXT")
        or os.environ.get("DOCKER_HOST", "unix:///var/run/docker.sock")
        != "unix:///var/run/docker.sock"
        or not Path("/var/run/docker.sock").is_socket()
    ):
        raise ValueError("Local production Docker socket required")
    pg, minio = [
        json.loads(run(DOCKER + ["inspect", c], deadline=deadline))[0]
        for c in (pg_container, minio_container)
    ]
    endpoint = validate_identity(pg, minio, env)
    image = json.loads(
        run(DOCKER + ["image", "inspect", pg["Image"]], deadline=deadline)
    )[0]
    if not any(
        digest.endswith("@" + PG_DIGEST) for digest in image.get("RepoDigests", [])
    ):
        raise ValueError("Owned PostgreSQL image digest mismatch")
    client = S3(
        endpoint, env["MINIO_APP_ACCESS_KEY"], env["MINIO_APP_SECRET_KEY"], deadline
    )
    name = (
        dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-"
        + os.urandom(4).hex()
    )
    folder = staging / name
    folder.mkdir(mode=0o700)
    require_private_directory(folder)
    created_identity = (folder.stat().st_dev, folder.stat().st_ino)
    try:
        before = client.inventory()
        expected_bytes = sum(item["size"] for item in before.values())
        require_local_space(folder, expected_bytes + 64 * 1024 * 1024)
        with Snapshot(pg_container, env, deadline) as snapshot:
            metadata = snapshot_metadata(snapshot)
            if not set(map(tuple, metadata["storage_references"])) <= set(before):
                raise ValueError(
                    "Database snapshot references absent from current private inventory"
                )
            with (folder / "database.dump").open("xb") as output:
                run(
                    DOCKER
                    + [
                        "exec",
                        pg_container,
                        "pg_dump",
                        "-U",
                        env["POSTGRES_ADMIN_USER"],
                        "-d",
                        env["POSTGRES_DB"],
                        "--format=custom",
                        "--snapshot=" + snapshot.token,
                    ],
                    deadline=deadline,
                    output=output,
                )
        require_local_space(folder)
        with (folder / "roles.sql").open("xb") as output:
            run(
                DOCKER
                + [
                    "exec",
                    pg_container,
                    "pg_dumpall",
                    "-U",
                    env["POSTGRES_ADMIN_USER"],
                    "--roles-only",
                ],
                deadline=deadline,
                output=output,
            )
        with (folder / "database.dump").open("rb") as source:
            toc = run(
                DOCKER + ["exec", "-i", pg_container, "pg_restore", "--list"],
                deadline=deadline,
                source=source,
            ).decode()
        for table in metadata["table_counts"]:
            if not re.search(r" TABLE DATA public " + re.escape(table) + r" ", toc):
                raise ValueError("Database archive missing snapshot table data")
        (folder / "database-toc.txt").write_text(toc)
        manifest = []
        with tarfile.open(folder / "objects.tar", "w") as archive:
            for (bucket, key), expected in sorted(before.items()):
                check_deadline(deadline)
                with tempfile.TemporaryFile(dir=folder) as output:
                    item = client.copy_object(bucket, key, expected, output)
                    output.seek(0)
                    info = tarfile.TarInfo("objects/" + bucket + "/" + key)
                    info.size, info.mode = item["size"], 0o600
                    archive.addfile(info, output)
                    manifest.append(item)
                    require_local_space(folder)
        if client.inventory() != before:
            raise ValueError("Private inventory changed during backup; retry a new run")
        verify_archive(folder / "objects.tar", manifest, deadline)
        check_deadline(deadline)
        proof = {
            "status": "passed",
            "resource": RESOURCE,
            "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "scope": "consistent exported DB snapshot; stable before/after current four-bucket inventory; all snapshot path references resolved; tar hash readback verified",
            "restore_tested": False,
            "objects": len(manifest),
            **metadata,
            "files": {
                p.name: {"bytes": p.stat().st_size, "sha256": sha_file(p, deadline)}
                for p in folder.iterdir()
                if p.is_file()
            },
        }
        (folder / "object-manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n"
        )
        proof["files"]["object-manifest.json"] = {
            "bytes": (folder / "object-manifest.json").stat().st_size,
            "sha256": sha_file(folder / "object-manifest.json", deadline),
        }
        (folder / "receipt.json").write_text(json.dumps(proof, indent=2) + "\n")
        for file in folder.iterdir():
            with file.open("rb") as handle:
                os.fsync(handle.fileno())
        publish_encrypted(
            folder,
            name,
            encryption_key,
            len(manifest),
            len(metadata["table_counts"]),
            deadline,
        )
        cleanup_own_private_run(folder, staging, created_identity)
        record_successful_cleanup(name)
        return {
            "status": "passed",
            "private_stage_removed": True,
            "resource": RESOURCE,
            "backup": name,
            "objects": len(manifest),
            "tables": len(metadata["table_counts"]),
        }
    except Exception as error:
        if (
            folder.is_dir()
            and folder.resolve() == folder
            and (folder.stat().st_dev, folder.stat().st_ino) == created_identity
        ):
            (folder / "failed.json").write_text(
                json.dumps({"status": "failed", "failure_type": type(error).__name__})
                + "\n"
            )
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True)
    parser.add_argument("--postgres-container", required=True)
    parser.add_argument("--minio-container", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--staging", default=str(STAGING))
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        raise SystemExit(
            "Explicit --execute required for mounted backup files; sources remain read-only"
        )
    try:
        print(
            json.dumps(
                backup(
                    read_env(args.env),
                    args.postgres_container,
                    args.minio_container,
                    args.key,
                    Path(args.staging),
                )
            )
        )
    except Exception as error:
        raise SystemExit(
            "Owned production backup failed: "
            + type(error).__name__
            + "; private details withheld"
        )


if __name__ == "__main__":
    main()
