#!/usr/bin/env python3
"""Read-only post-cutover checks. Writes only own sanitized observation JSON.
Never installs units, starts/stops containers, changes rows, or reads backup keys.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time
import urllib.parse
import urllib.request

RESOURCE = "logo-production-20261005"
RELEASE = Path("/root/logo-production-20261005-release")
MOUNT = Path("/mnt/storagebox-home")
BACKUPS = MOUNT / "prod" / RESOURCE / "backups"
SERVICES = {"app", "ml-service", "postgres", "redis", "minio"}
DOCKER = ["docker", "--host", "unix:///var/run/docker.sock"]
BACKUP_UNIT = RESOURCE + "-backup.service"
BACKUP_TIMER = RESOURCE + "-backup.timer"
MAX_SECONDS = 120


def remaining(deadline):
    value = deadline - time.monotonic()
    if value <= 0:
        raise TimeoutError("Observation deadline exceeded")
    return value


def run(command, deadline, data=None):
    result = subprocess.run(
        command, input=data, capture_output=True, timeout=min(10, remaining(deadline))
    )
    if result.returncode:
        raise RuntimeError("Read-only check failed; private output withheld")
    if len(result.stdout) > 4 * 1024 * 1024:
        raise ValueError("Read-only check response too large")
    return result.stdout


def private_directory(path):
    info = path.lstat()
    if (
        path.resolve() != path
        or not stat.S_ISDIR(info.st_mode)
        or info.st_uid != os.geteuid()
        or stat.S_IMODE(info.st_mode) != 0o700
    ):
        raise ValueError("Actual owned private directory required")


def private_file(path):
    private_directory(path.parent)
    info = path.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.geteuid()
        or stat.S_IMODE(info.st_mode) != 0o600
        or info.st_size > 1024 * 1024
    ):
        raise ValueError("Actual owned private file required")
    return path.read_text()


def load_env(path):
    values = {}
    for line in private_file(path).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    if values.get("PRODUCTION_RESOURCE_NAME") != RESOURCE or any(
        not values.get(k)
        for k in ["POSTGRES_DB", "POSTGRES_ADMIN_USER", "POSTGRES_ADMIN_PASSWORD"]
    ):
        raise ValueError("Dedicated production configuration required")
    return values


def load_targets(path):
    targets = json.loads(private_file(path))
    if (
        targets.get("resource") != RESOURCE
        or set(targets.get("services", {})) != SERVICES
    ):
        raise ValueError("Exact five owned services required")
    for target in targets["services"].values():
        if not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", target.get("container", "")
        ) or not re.fullmatch(r"sha256:[a-f0-9]{64}", target.get("image", "")):
            raise ValueError("Exact frozen container/image identity required")
        if (
            not isinstance(target.get("restart_count"), int)
            or isinstance(target.get("restart_count"), bool)
        ) or target["restart_count"] < 0:
            raise ValueError("Restart baseline required")
    return targets["services"]


def age_seconds(timestamp, now, max_age):
    value = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Timezone-aware observation timestamp required")
    age = (now - value).total_seconds()
    if age < -10 or age > max_age:
        raise ValueError("Stale or future observation timestamp")
    return round(max(0, age), 3)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        raise ValueError("Health redirects forbidden")


def public_health(url, deadline, now):
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.port not in (None, 443)
        or parsed.path != "/health"
    ):
        raise ValueError("Exact public HTTPS /health URL required")
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "Cache-Control": "no-cache"}
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=min(5, remaining(deadline))) as response:
        if response.status != 200 or "application/json" not in response.headers.get(
            "Content-Type", ""
        ):
            raise ValueError("Public health unavailable")
        chunks = []
        size = 0
        body_deadline = min(deadline, time.monotonic() + 5)
        while True:
            remaining(body_deadline)
            chunk = response.read1(min(4096, 16385 - size))
            if not chunk:
                break
            size += len(chunk)
            if size > 16384:
                raise ValueError("Public health response too large")
            chunks.append(chunk)
        data = b"".join(chunks)
    health = json.loads(data)
    if health.get("status") != "ok":
        raise ValueError("New public health contract missing")
    return {
        "status": "passed",
        "fresh_timestamp_age_seconds": age_seconds(health["timestamp"], now, 60),
    }


def containers(targets, env, deadline):
    result = {}
    for service, target in sorted(targets.items()):
        records = json.loads(run(DOCKER + ["inspect", target["container"]], deadline))
        if len(records) != 1:
            raise ValueError("Unambiguous container required")
        info = records[0]
        state = info["State"]
        if (
            info["Config"].get("Labels", {}).get("com.docker.compose.service")
            != service
            or info.get("Image") != target["image"]
        ):
            raise ValueError("Frozen owned service identity mismatch")
        if (
            not state.get("Running")
            or state.get("OOMKilled")
            or state.get("Health", {}).get("Status") != "healthy"
            or info.get("RestartCount") != target["restart_count"]
        ):
            raise ValueError("Container unhealthy, OOM or new restart")
        if service == "postgres":
            actual = dict(
                item.split("=", 1) for item in info["Config"]["Env"] if "=" in item
            )
            if any(
                actual.get(a) != env[b]
                for a, b in [
                    ("POSTGRES_DB", "POSTGRES_DB"),
                    ("POSTGRES_USER", "POSTGRES_ADMIN_USER"),
                    ("POSTGRES_PASSWORD", "POSTGRES_ADMIN_PASSWORD"),
                ]
            ):
                raise ValueError("Owned PostgreSQL identity mismatch")
            mounts = [
                m
                for m in info["Mounts"]
                if m.get("Destination") == "/var/lib/postgresql/data"
            ]
            if (
                len(mounts) != 1
                or mounts[0].get("Type") != "volume"
                or mounts[0].get("Name") != RESOURCE + "-postgres-data"
            ):
                raise ValueError("Owned PostgreSQL volume mismatch")
        if service == "minio":
            mounts = [m for m in info["Mounts"] if m.get("Destination") == "/data"]
            if (
                len(mounts) != 1
                or mounts[0].get("Type") != "bind"
                or mounts[0].get("Source") != str(BACKUPS.parent / "minio-data")
            ):
                raise ValueError("Owned MinIO volume mismatch")
        result[service] = {
            "status": "healthy",
            "oom": False,
            "restart_count": target["restart_count"],
            "frozen_image_match": True,
        }
    return result


def vectors(targets, env, deadline):
    sql = b"BEGIN READ ONLY; SET LOCAL statement_timeout='3s'; SELECT (SELECT count(*) FROM public.reference_logos WHERE active=true), (SELECT count(DISTINCT rl.id) FROM public.reference_embeddings re JOIN public.reference_logos rl ON re.reference_logo_id=rl.id WHERE rl.active=true AND re.embedding IS NOT NULL AND vector_dims(re.embedding)=512); ROLLBACK;\n"
    output = (
        run(
            DOCKER
            + [
                "exec",
                "-i",
                targets["postgres"]["container"],
                "psql",
                "-X",
                "-qAt",
                "-v",
                "ON_ERROR_STOP=1",
                "-U",
                env["POSTGRES_ADMIN_USER"],
                "-d",
                env["POSTGRES_DB"],
            ],
            deadline,
            sql,
        )
        .decode()
        .strip()
    )
    if output != "542|542":
        raise ValueError("Expected 542 active complete vectors missing")
    return {
        "status": "passed",
        "active_complete_vectors": 542,
        "active_references": 542,
        "dimensions": 512,
    }


def systemd_backup(deadline, now):
    properties = [
        "Result",
        "ExecMainStatus",
        "ExecMainCode",
        "ExecMainExitTimestampMonotonic",
        "ActiveState",
    ]
    raw = run(
        ["systemctl", "show", BACKUP_UNIT, *["--property=" + p for p in properties]],
        deadline,
    ).decode()
    values = dict(line.split("=", 1) for line in raw.splitlines() if "=" in line)
    exited = int(values.get("ExecMainExitTimestampMonotonic", "0"))
    uptime = float(Path("/proc/uptime").read_text().split()[0])
    since = uptime - exited / 1000000
    if (
        values.get("Result") != "success"
        or values.get("ExecMainStatus") != "0"
        or values.get("ExecMainCode") != "1"
        or exited <= 0
        or since < -1
        or since > 30 * 3600
        or values.get("ActiveState") not in ("inactive", "active")
    ):
        raise ValueError("Scheduled backup has no fresh successful completed run")
    timer = run(
        [
            "systemctl",
            "show",
            BACKUP_TIMER,
            "--property=ActiveState",
            "--property=NextElapseUSecRealtime",
        ],
        deadline,
    ).decode()
    fields = dict(line.split("=", 1) for line in timer.splitlines() if "=" in line)
    if fields.get("ActiveState") != "active" or fields.get(
        "NextElapseUSecRealtime"
    ) in (None, "", "n/a", "0"):
        raise ValueError("Daily backup timer inactive or unscheduled")
    return {
        "status": "passed",
        "last_success_age_seconds": round(max(0, since), 3),
        "timer_active": True,
    }


def latest_backup(deadline, now):
    if not MOUNT.is_mount() or MOUNT.resolve() != MOUNT or BACKUPS.resolve() != BACKUPS:
        raise ValueError("External backup mount identity missing")
    folders = []
    for index, path in enumerate(BACKUPS.iterdir()):
        if index >= 10000:
            raise ValueError("Backup inventory outside reviewed bound")
        if re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{8}", path.name):
            if path.is_symlink() or not path.is_dir():
                raise ValueError("Invalid external backup entry")
            folders.append(path)
    if not folders:
        raise ValueError("No completed encrypted backup")
    folder = max(folders, key=lambda p: p.name)
    if {p.name for p in folder.iterdir()} != {"payload.aes256gcm", "receipt.json"}:
        raise ValueError("Unexpected plaintext or extra external backup files")
    receipt_path = folder / "receipt.json"
    payload = folder / "payload.aes256gcm"
    if (
        receipt_path.is_symlink()
        or payload.is_symlink()
        or receipt_path.stat().st_size > 16384
        or not payload.is_file()
    ):
        raise ValueError("Invalid encrypted backup files")
    receipt = json.loads(receipt_path.read_text())
    header = receipt.get("header", {})
    if (
        receipt.get("status") != "passed"
        or receipt.get("authenticated_readback_verified") is not True
        or receipt.get("private_stage_removed") is not True
        or header.get("format") != "logo-owned-backup-aes256gcm-v1"
        or header.get("resource") != RESOURCE
        or header.get("backup") != folder.name
    ):
        raise ValueError("Owned authenticated encrypted backup receipt required")
    if (
        (
            not isinstance(header.get("objects"), int)
            or isinstance(header.get("objects"), bool)
        )
        or header["objects"] < 1069
        or header.get("tables") != 35
        or not re.fullmatch(r"[a-f0-9]{24}", header.get("nonce", ""))
        or not re.fullmatch(r"[a-f0-9]{32}", receipt.get("tag", ""))
        or not re.fullmatch(r"[a-f0-9]{64}", receipt.get("encrypted_sha256", ""))
    ):
        raise ValueError("Invalid encrypted backup coverage or format")
    age = age_seconds(header["completed_at"], now, 30 * 3600)
    before = payload.stat()
    if (
        not 0 < before.st_size <= 512 * 1024 * 1024
        or receipt.get("encrypted_bytes") != before.st_size
        or header.get("plaintext_bytes") != before.st_size
    ):
        raise ValueError("Encrypted backup size mismatch")
    digest = hashlib.sha256()
    with payload.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            remaining(deadline)
            digest.update(chunk)
    after = payload.stat()
    if digest.hexdigest() != receipt["encrypted_sha256"] or (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
    ) != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns):
        raise ValueError("Encrypted backup changed or hash mismatch")
    return {
        "status": "passed",
        "objects": header["objects"],
        "tables": 35,
        "age_seconds": age,
        "ciphertext_sha256": digest.hexdigest(),
        "private_stage_removed": True,
        "scope": "stored authenticated-readback receipt plus current ciphertext hash; no key read or fresh decryption",
    }


def observe(env_path, targets_path, health_url, release=RELEASE):
    os.umask(0o077)
    if release != RELEASE:
        raise ValueError("Exact dedicated release directory required")
    private_directory(release)
    env = load_env(env_path)
    targets = load_targets(targets_path)
    output = release / "observations"
    output.mkdir(mode=0o700, exist_ok=True)
    private_directory(output)
    if (
        os.environ.get("DOCKER_CONTEXT")
        or os.environ.get("DOCKER_HOST", "unix:///var/run/docker.sock")
        != "unix:///var/run/docker.sock"
        or not Path("/var/run/docker.sock").is_socket()
    ):
        raise ValueError("Local production Docker socket required")
    now = dt.datetime.now(dt.timezone.utc)
    deadline = time.monotonic() + MAX_SECONDS
    proof = {
        "resource": RESOURCE,
        "observed_at": now.isoformat(),
        "status": "passed",
        "read_only": True,
        "checks": {},
    }
    for name, check in [
        ("public_health", lambda: public_health(health_url, deadline, now)),
        ("containers", lambda: containers(targets, env, deadline)),
        ("vectors", lambda: vectors(targets, env, deadline)),
        ("scheduled_backup", lambda: systemd_backup(deadline, now)),
        ("encrypted_backup", lambda: latest_backup(deadline, now)),
    ]:
        try:
            proof["checks"][name] = check()
        except Exception as error:
            proof["status"] = "failed"
            proof["checks"][name] = {
                "status": "failed",
                "failure_type": type(error).__name__,
            }
    name = now.strftime("%Y%m%dT%H%M%SZ") + "-" + os.urandom(4).hex() + ".json"
    with (output / name).open("x") as file:
        file.write(json.dumps(proof, indent=2) + "\n")
    return proof


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", required=True)
    parser.add_argument("--targets", required=True)
    parser.add_argument("--health-url", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        raise SystemExit(
            "Explicit --execute required to save only owned observation JSON"
        )
    try:
        proof = observe(Path(args.env), Path(args.targets), args.health_url)
        print(json.dumps(proof))
        raise SystemExit(0 if proof["status"] == "passed" else 1)
    except Exception as error:
        raise SystemExit(
            "Production observation failed: "
            + type(error).__name__
            + "; private details withheld"
        )


if __name__ == "__main__":
    main()
