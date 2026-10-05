#!/usr/bin/env python3
"""Offline, fail-closed validation. Does not connect, start services or print values.

Requires PyYAML locally. Use an explicit env file. Relevant shell variables must
be absent or identical to that file; nonempty COMPOSE_* selection overrides are
rejected. Use the same unchanged shell for subsequent Compose config --quiet,
--env-file and -f arguments; profiles are explicit CLI options only after approval.
Never print rendered config (contains secrets).
"""
import argparse
import ipaddress
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit, unquote

FROZEN_MINIO_IMAGE_ID = "sha256:69b2ec208575b69597784255eec6fa6a2985ee9e1a47f4411a51f7f5fdd193a9"
DEDICATED_RESOURCE = "logo-production-20261005"
DEDICATED_MINIO_PATH = "/mnt/storagebox-home/prod/logo-production-20261005/minio-data"

FROZEN = {
    "RELEASE_SHA": "f247881863ac218690e1af93de1ac6141e77f8c7",
    "APP_IMAGE_DIGEST": "sha256:8d9295e9a2de75eea770f5a295954dac35538e3285966342d8429e9bade6b556",
    "ML_IMAGE_DIGEST": "sha256:1c7862d4833fb47701e6c0037f162819296be49f99a731c2f7f0c9d121a846dc",
}
REQUIRED = tuple(FROZEN) + (
    "PRODUCTION_RESOURCE_NAME", "PRODUCTION_HOSTNAME", "COOLIFY_PROXY_NETWORK", "MINIO_DATA_PATH",
    "POSTGRES_DB", "POSTGRES_ADMIN_USER", "POSTGRES_ADMIN_PASSWORD",
    "APP_DATABASE_URL", "ML_DATABASE_URL", "AUTH_DATABASE_URL", "MEDIASERVER_DOMAIN", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD",
    "MINIO_APP_ACCESS_KEY", "MINIO_APP_SECRET_KEY", "JWT_SECRET", "COOKIE_SECRET",
    "LEGACY_DETECTION_API_KEY", "PIPELINE_SERVICE_KEY", "CATALOG_API_BASE", "CATALOG_API_KEY",
    "GHS_REVIEW_INTERNAL_KEY", "GHS_REVIEW_BASE_URL", "GHS_REVIEW_API_KEY",
    "GHS_REVIEW_MODEL_A", "GHS_REVIEW_MODEL_B",
)
SECRETS = ("POSTGRES_ADMIN_PASSWORD", "MINIO_ROOT_PASSWORD", "MINIO_APP_SECRET_KEY",
           "JWT_SECRET", "COOKIE_SECRET", "LEGACY_DETECTION_API_KEY", "PIPELINE_SERVICE_KEY", "GHS_REVIEW_INTERNAL_KEY")
SUBSTITUTION = re.compile(r"\$\{([A-Z0-9_]+):\?[^}]*\}")


def read_env(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in result:
            raise ValueError("Invalid or duplicate env assignment")
        if len(value) >= 2 and value[0] == value[-1] == "'":
            value = value[1:-1]
            if any(char in value for char in ("'", '"', "\\")) or any(ord(char) < 32 for char in value):
                raise ValueError("Unsupported quoted literal syntax")
        # Restrict syntax to a subset with identical offline/Compose meaning.
        # Single quotes allow literal dollar signs; use URL encoding in DB URLs.
        elif any(char in value for char in ('$', '"', "'", '#', '\\')) or value != value.strip():
            raise ValueError("Unsupported env syntax; use single-quoted literal values")
        result[key] = value
    return result


def valid_dns(host):
    return (len(host) <= 253 and "." in host and all(
        1 <= len(label) <= 63 and re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", label)
        for label in host.split(".")))


def production_host(host):
    if host in ("10.0.0.5", "10.0.0.6"):
        return False  # Existing ACC application/database hosts.
    if not host or re.search(r"(^|[-_.])(?:acc|stage|test|dev|localhost)([-_.]|$)", host.lower()):
        return False
    try:
        address = ipaddress.ip_address(host)
        return not (address.is_loopback or address.is_unspecified or address.is_link_local)
    except ValueError:
        return valid_dns(host.lower())


def validate_shell(env, shell=None):
    shell = os.environ if shell is None else shell
    errors = [f"Shell input conflicts with validated env file: {key}"
              for key in REQUIRED if key in shell and shell[key] != env.get(key)]
    for key, value in shell.items():
        if key.startswith("COMPOSE_") and value:
            errors.append(f"Shell Compose override must be unset: {key}")
    return errors


def validate_env(env):
    errors = [f"Missing required input: {key}" for key in REQUIRED if not env.get(key)]
    for key, value in env.items():
        if key.startswith("COMPOSE_") and value:
            errors.append(f"Env-file Compose override must be absent: {key}")
    if errors:
        return errors
    for key, expected in FROZEN.items():
        if env[key] != expected:
            errors.append(f"Frozen ACC release mismatch: {key}")
    for key in REQUIRED:
        value = env[key].lower()
        if any(token in value for token in ("minioadmin", "change-me", "changeme", "replace_me", "<", ">")):
            errors.append(f"Placeholder/default input rejected: {key}")
    for key in SECRETS:
        if len(env[key]) < 32:
            errors.append(f"Secret must have at least 32 characters: {key}")
    if len({env[key] for key in SECRETS}) != len(SECRETS):
        errors.append("Production secrets must be distinct")
    if not re.fullmatch(r"logo-production-[a-z0-9][a-z0-9-]*", env["PRODUCTION_RESOURCE_NAME"]):
        errors.append("Dedicated production resource name required")
    for key in ("PRODUCTION_RESOURCE_NAME", "PRODUCTION_HOSTNAME", "POSTGRES_DB", "POSTGRES_ADMIN_USER", "COOLIFY_PROXY_NETWORK"):
        if re.search(r"(^|[-_.])(?:acc|stage|test|dev)([-_.]|$)", env[key].lower()):
            errors.append(f"Non-production target rejected: {key}")
    if not valid_dns(env["PRODUCTION_HOSTNAME"]):
        errors.append("Production hostname must be a valid bare DNS name")
    if env["PRODUCTION_HOSTNAME"].lower() == "logo-detection.xxtract.com":
        errors.append("Legacy live hostname cannot be claimed by prepared runtime")
    if env["PRODUCTION_RESOURCE_NAME"] != DEDICATED_RESOURCE or env["MINIO_DATA_PATH"] != DEDICATED_MINIO_PATH:
        errors.append("Frozen dedicated production resource and StorageBox path required")
    resource = env["PRODUCTION_RESOURCE_NAME"]
    storage = env["MINIO_DATA_PATH"]
    if (not storage.startswith("/mnt/storagebox-home/") or "//" in storage
            or any(part in (".", "..") for part in storage.split("/"))
            or not storage.endswith("/" + resource + "/minio-data")
            or re.search(r"(^|[-_/])(?:acc|stage|test|dev)([-_/]|$)", storage.lower())
            or not re.fullmatch(r"/[A-Za-z0-9_/-]+", storage)):
        errors.append("Dedicated production StorageBox directory required")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", env["COOLIFY_PROXY_NETWORK"]):
        errors.append("Invalid proxy network name")
    for key in ("POSTGRES_DB", "POSTGRES_ADMIN_USER"):
        if not re.fullmatch(r"[a-z][a-z0-9_]*", env[key]):
            errors.append(f"Invalid PostgreSQL identifier: {key}")
    if env["POSTGRES_DB"] in ("postgres", "logo_recognition", "logorecognition"):
        errors.append("New dedicated production database name required")
    for key in ("APP_DATABASE_URL", "ML_DATABASE_URL"):
        try:
            url = urlsplit(env[key])
            if (url.scheme != "postgresql" or url.hostname != "postgres" or url.port != 5432
                    or unquote(url.path) != "/" + env["POSTGRES_DB"] or not url.username
                    or not url.password or len(unquote(url.password)) < 32 or url.fragment
                    or url.query or unquote(url.username) in (env["POSTGRES_ADMIN_USER"], "postgres")):
                errors.append(f"Dedicated internal non-admin database connection required: {key}")
            if re.search(r"(^|[-_])acc([-_]|$)", unquote(url.username or "").lower()):
                errors.append(f"ACC database role rejected: {key}")
        except ValueError:
            errors.append(f"Invalid database connection: {key}")
    if env["MINIO_APP_ACCESS_KEY"] == env["MINIO_ROOT_USER"] or env["MINIO_APP_SECRET_KEY"] == env["MINIO_ROOT_PASSWORD"]:
        errors.append("Application storage credentials must differ from root")
    try:
        auth = urlsplit(env["AUTH_DATABASE_URL"])
        if (auth.scheme != "mysql" or not production_host(auth.hostname)
                or auth.port is not None and not 1 <= auth.port <= 65535
                or not auth.username or not auth.password or not auth.path.strip("/")
                or auth.query or auth.fragment
                or re.search(r"(^|[-_/])(?:acc|stage|test|dev)([-_/]|$)", unquote(auth.path).lower())):
            errors.append("Explicit production MySQL authentication connection required")
    except ValueError:
        errors.append("Invalid production MySQL authentication connection")
    for key in ("CATALOG_API_BASE", "GHS_REVIEW_BASE_URL", "MEDIASERVER_DOMAIN"):
        try:
            url = urlsplit(env[key])
            # Existing production media identity verified on Banana by the coordinator.
            # This historical hostname exception applies to this exact input only.
            approved_media = key == "MEDIASERVER_DOMAIN" and env[key] == "https://media.stage.xxtract.com"
            approved_catalog = key == "CATALOG_API_BASE" and env[key] == "https://catalog.stage.xxtract.com"
            if (url.scheme != "https" or (not production_host(url.hostname) and not approved_media and not approved_catalog) or url.username or url.password
                    or url.port is not None and not 1 <= url.port <= 65535
                    or url.query or url.fragment or re.search(r"(^|\.)acc\.", url.hostname)):
                errors.append(f"Explicit production HTTPS service URL required: {key}")
        except ValueError:
            errors.append(f"Invalid service URL: {key}")
    if env["GHS_REVIEW_MODEL_A"] == env["GHS_REVIEW_MODEL_B"]:
        errors.append("Distinct visual review models required")
    return errors


def validate_compose(source, env):
    import yaml
    errors = []
    # Only mandatory substitutions and escaped in-container dollars are allowed.
    substituted = SUBSTITUTION.sub(lambda match: env[match[1]], source)
    if "${" in substituted.replace("$${", ""):
        return ["Compose has unsupported/default interpolation"]
    # Parse templates first; secret values must never be interpreted as YAML.
    doc = yaml.safe_load(source)
    services = doc.get("services", {})
    if doc.get("name") != "${PRODUCTION_RESOURCE_NAME:?required dedicated production resource name}":
        errors.append("Explicit dedicated project name required")
    if set(services) != {"postgres", "redis", "minio", "initialize-buckets", "app", "ml-service"}:
        errors.append("Unexpected/missing production services")
    expected_profiles = {"app": ["runtime"], "ml-service": ["runtime"], "initialize-buckets": ["provisioning"]}
    for name, service in services.items():
        if service.get("profiles", []) != expected_profiles.get(name, []):
            errors.append(f"Unsafe service profile: {name}")
        if any(key in service for key in ("build", "ports", "network_mode", "env_file", "privileged", "devices")):
            errors.append(f"Forbidden production service setting: {name}")
        networks = service.get("networks", [])
        expected_networks = {"private", "proxy"} if name == "app" else ({"private", "ml-egress"} if name == "ml-service" else {"private"})
        if set(networks) != expected_networks:
            errors.append(f"Unsafe network attachments: {name}")
        image = SUBSTITUTION.sub(lambda match: env[match[1]], service.get("image", ""))
        if name == "minio":
            if image != FROZEN_MINIO_IMAGE_ID:
                errors.append("Exact verified local MinIO image configuration ID required")
        elif not re.fullmatch(r"[\w./:-]+@sha256:[0-9a-f]{64}", image):
            errors.append(f"Immutable image required: {name}")
        if name in ("app", "ml-service", "initialize-buckets"):
            kind = "app" if name == "app" else "ml"
            digest = env["APP_IMAGE_DIGEST"] if kind == "app" else env["ML_IMAGE_DIGEST"]
            if image != f"ghcr.io/xxtract-development/logo-recognition-{kind}:{env['RELEASE_SHA']}@{digest}":
                errors.append(f"Inconsistent frozen image pair: {name}")
        # Reject implicit startup writers reached through infrastructure dependencies.
        dependencies = service.get("depends_on", {})
        allowed_dependencies = {"postgres", "redis", "minio"}
        if name == "app":
            allowed_dependencies.add("ml-service")
        if name in ("postgres", "redis", "minio") and dependencies:
            errors.append(f"Infrastructure must not start dependent services: {name}")
        elif not set(dependencies).issubset(allowed_dependencies):
            errors.append(f"Unexpected startup dependency: {name}")
        if "devices" in str(service.get("deploy", {})) or "gpu" in str(service.get("deploy", {})).lower():
            errors.append(f"GPU must not be required: {name}")
        expected_mounts = {
            "postgres": ["postgres-data:/var/lib/postgresql/data"],
            "redis": ["redis-data:/data"], "minio": [{
                "type": "bind", "source": DEDICATED_MINIO_PATH,
                "target": "/data", "bind": {"create_host_path": False},
            }],
            "app": [], "ml-service": ["torch-cache:/app/models/torch"],
            "initialize-buckets": ["./scripts/deployment/production/initialize-buckets.py:/provisioning/initialize-buckets.py:ro"],
        }
        if service.get("volumes", []) != expected_mounts.get(name):
            errors.append(f"Unsafe or missing production storage mount: {name}")
        logging = {"driver": "json-file", "options": {"max-size": "10m", "max-file": "3"}}
        if service.get("logging") != logging:
            errors.append(f"Bounded production logs required: {name}")
        budgets = {"postgres": ("1.0", "2G"), "redis": ("0.5", "512M"),
                   "minio": ("1.0", "1G"), "initialize-buckets": ("0.5", "1G"),
                   "app": ("2.0", "2G"), "ml-service": ("4.0", "8G")}
        cpu, memory = budgets[name]
        if service.get("deploy", {}).get("resources", {}).get("limits") != {"cpus": cpu, "memory": memory}:
            errors.append(f"Provisional production resource ceilings required: {name}")
        for mount in service.get("volumes", []):
            if isinstance(mount, dict):
                continue  # Exact MinIO long bind syntax checked above.
            if ":/" in mount and mount.split(":", 1)[0] not in doc.get("volumes", {}):
                if name != "initialize-buckets" or mount != "./scripts/deployment/production/initialize-buckets.py:/provisioning/initialize-buckets.py:ro":
                    errors.append(f"Unexpected/shared bind mount: {name}")
    if doc.get("networks", {}).get("private", {}).get("internal") is not True:
        errors.append("Private infrastructure network must be internal")
    proxy = doc.get("networks", {}).get("proxy", {})
    if proxy.get("external") is not True or proxy.get("name") != "${COOLIFY_PROXY_NETWORK:?required existing proxy network}":
        errors.append("Explicit external proxy network required")
    if set(doc.get("volumes", {})) != {"postgres-data", "redis-data", "torch-cache"}:
        errors.append("Unexpected or missing production named volumes")
    for name, volume in doc.get("volumes", {}).items():
        if volume.get("name") != "${PRODUCTION_RESOURCE_NAME:?required dedicated production resource name}-" + name or volume.get("external") or volume.get("driver_opts"):
            errors.append(f"Production-owned named volume required: {name}")
    pg = services.get("postgres", {})
    if pg.get("image") != "pgvector/pgvector:0.6.0-pg16@sha256:d88687938e7336e1ecd1d8c2f29a750e6ab033e511b04a57a1f2d6d2219a0435" or pg.get("platform") != "linux/amd64":
        errors.append("Verified PostgreSQL16/vector0.6 AMD64 image required")
    initializer = services.get("initialize-buckets", {})
    if initializer.get("entrypoint") != ["python", "/provisioning/initialize-buckets.py"] or initializer.get("command") != "":
        errors.append("Provisioning must bypass application startup")
    required_runtime_env = {
        "app": {
            "DATABASE_URL": "${APP_DATABASE_URL:?required dedicated production app connection}",
            "AUTH_DATABASE_URL": "${AUTH_DATABASE_URL:?required explicit production MySQL auth connection}",
            "MEDIASERVER_DOMAIN": "${MEDIASERVER_DOMAIN:?required explicit production media URL}",
            "JWT_SECRET": "${JWT_SECRET:?required production signing secret}",
            "COOKIE_SECRET": "${COOKIE_SECRET:?required production cookie secret}",
            "LEGACY_DETECTION_API_KEY": "${LEGACY_DETECTION_API_KEY:?required existing production integration key}",
            "PIPELINE_SERVICE_KEY": "${PIPELINE_SERVICE_KEY:?required production service key}",
            "GHS_REVIEW_INTERNAL_KEY": "${GHS_REVIEW_INTERNAL_KEY:?required production review key}",
            "MINIO_ACCESS_KEY": "${MINIO_APP_ACCESS_KEY:?required nonroot production storage key}",
            "MINIO_SECRET_KEY": "${MINIO_APP_SECRET_KEY:?required nonroot production storage secret}",
            "MINIO_ENDPOINT": "minio", "MINIO_PORT": "9000", "MINIO_USE_SSL": "false",
            "REDIS_URL": "redis://redis:6379", "ML_SERVICE_URL": "http://ml-service:8001",
            "CATALOG_API_BASE": "${CATALOG_API_BASE:?required explicit production catalog URL}",
            "CATALOG_API_KEY": "${CATALOG_API_KEY:?required production catalog key}",
        },
        "ml-service": {
            "DATABASE_URL": "${ML_DATABASE_URL:?required dedicated production ML connection}",
            "PIPELINE_SERVICE_KEY": "${PIPELINE_SERVICE_KEY:?required production service key}",
            "GHS_REVIEW_INTERNAL_KEY": "${GHS_REVIEW_INTERNAL_KEY:?required production review key}",
            "GHS_REVIEW_BASE_URL": "${GHS_REVIEW_BASE_URL:?required approved provider URL}",
            "GHS_REVIEW_API_KEY": "${GHS_REVIEW_API_KEY:?required production provider key}",
            "GHS_REVIEW_MODEL_A": "${GHS_REVIEW_MODEL_A:?required first reviewer model}",
            "GHS_REVIEW_MODEL_B": "${GHS_REVIEW_MODEL_B:?required distinct second reviewer model}",
            "MINIO_ACCESS_KEY": "${MINIO_APP_ACCESS_KEY:?required nonroot production storage key}",
            "MINIO_SECRET_KEY": "${MINIO_APP_SECRET_KEY:?required nonroot production storage secret}",
            "MINIO_ENDPOINT": "minio:9000", "MINIO_USE_SSL": "false",
            "REDIS_URL": "redis://redis:6379", "TORCH_HOME": "/app/models/torch", "ENABLE_GPU": "false",
        },
    }
    expected_labels = [
        "traefik.enable=true",
        "traefik.docker.network=${COOLIFY_PROXY_NETWORK:?required existing proxy network}",
        "traefik.http.routers.logo-production-prepared.rule=Host(`${PRODUCTION_HOSTNAME:?required dedicated production hostname}`)",
        "traefik.http.routers.logo-production-prepared.entrypoints=https",
        "traefik.http.routers.logo-production-prepared.tls=true",
        "traefik.http.routers.logo-production-prepared.tls.certresolver=letsencrypt",
        "traefik.http.services.logo-production-prepared.loadbalancer.server.port=8000",
    ]
    if services.get("app", {}).get("labels") != expected_labels:
        errors.append("Exact sequence-form proxy labels required for Coolify compatibility")
    required_infra_env = {
        "postgres": {
            "POSTGRES_DB": "${POSTGRES_DB:?required new production database}",
            "POSTGRES_USER": "${POSTGRES_ADMIN_USER:?required new provisioning owner}",
            "POSTGRES_PASSWORD": "${POSTGRES_ADMIN_PASSWORD:?required production owner password}",
        },
        "minio": {
            "MINIO_ROOT_USER": "${MINIO_ROOT_USER:?required production provisioning owner}",
            "MINIO_ROOT_PASSWORD": "${MINIO_ROOT_PASSWORD:?required production owner password}",
        },
        "initialize-buckets": {
            "MINIO_ENDPOINT": "minio:9000",
            "MINIO_ROOT_USER": "${MINIO_ROOT_USER:?required production provisioning owner}",
            "MINIO_ROOT_PASSWORD": "${MINIO_ROOT_PASSWORD:?required production owner password}",
        },
    }
    for name, expected_env in required_infra_env.items():
        if services.get(name, {}).get("environment", {}) != expected_env:
            errors.append(f"Exact provisioning environment required: {name}")
    for name, expected_env in required_runtime_env.items():
        actual = services.get(name, {}).get("environment", {})
        for key, value in expected_env.items():
            if actual.get(key) != value:
                errors.append(f"Unsafe/missing runtime wiring: {name}.{key}")
        if any("MINIO_ROOT" in str(value) or "POSTGRES_ADMIN" in str(value) for value in actual.values()):
            errors.append(f"Provisioning root credentials forbidden at runtime: {name}")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--compose-file", default=str(Path(__file__).resolve().parents[3] / "docker-compose.prod.yml"))
    args = parser.parse_args()
    try:
        env = read_env(args.env_file)
        errors = validate_env(env) + validate_shell(env)
        if not errors:
            errors.extend(validate_compose(Path(args.compose_file).read_text(), env))
    except Exception:
        # YAML/IO/parser exceptions can include actual input, including secrets.
        errors = ["Cannot safely parse inputs; check file access, env syntax and local PyYAML installation"]
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("Production preparation configuration valid (offline only; no execution authorized).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
