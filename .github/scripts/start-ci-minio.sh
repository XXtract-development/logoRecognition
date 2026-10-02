#!/usr/bin/env bash
# Disposable runner-local S3 storage; never connect to an external endpoint.
set -euo pipefail

: "${CI_BIN_DIR:?Set the directory containing the pinned source-built binaries}"
: "${RUNNER_TEMP:?Set a writable disposable runner directory}"
: "${GITHUB_ENV:?Set the runner environment file for cleanup}"
case "${MINIO_ENDPOINT:-localhost}" in
  localhost|127.0.0.1) ;;
  *) echo 'CI storage must use localhost' >&2; exit 1 ;;
esac
[[ "${MINIO_PORT:-9000}" == 9000 && "${MINIO_USE_SSL:-false}" == false ]] || {
  echo 'CI storage requires local port 9000 without TLS' >&2; exit 1;
}

attempts="${HEALTH_ATTEMPTS:-30}"
interval="${HEALTH_INTERVAL:-2}"
[[ "$attempts" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid health attempt count' >&2; exit 1; }
workspace=$(mktemp -d "$RUNNER_TEMP/minio-ci.XXXXXX")
log="$workspace/minio.log"
export MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin
"$CI_BIN_DIR/minio" server "$workspace/data" \
  --address 127.0.0.1:9000 --console-address 127.0.0.1:9001 > "$log" 2>&1 &
pid=$!
cleanup_on_failure() {
  status=$?
  if [[ "$status" != 0 ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    cat "$log" >&2
  fi
}
trap cleanup_on_failure EXIT
# Persist before probing so always() cleanup also covers failed startup/buckets.
printf 'MINIO_PID=%s\nMINIO_LOG=%s\n' "$pid" "$log" >> "$GITHUB_ENV"

healthy=false
for ((i=1; i<=attempts; i++)); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo 'CI MinIO exited before readiness' >&2
    exit 1
  fi
  if curl --fail --silent --show-error --connect-timeout 1 --max-time 2 \
    http://127.0.0.1:9000/minio/health/live; then
    # A healthy unrelated listener must not hide our process failing to bind.
    sleep 0.05
    kill -0 "$pid" 2>/dev/null || { echo 'CI MinIO exited during readiness' >&2; exit 1; }
    healthy=true
    break
  fi
  if ((i < attempts)); then sleep "$interval"; fi
done
[[ "$healthy" == true ]] || { echo 'CI MinIO readiness timed out' >&2; exit 1; }
export MC_HOST_local=http://minioadmin:minioadmin@127.0.0.1:9000
"$CI_BIN_DIR/mc" --config-dir "$workspace/mc-config" mb --ignore-existing \
  local/training-data local/models local/artwork
