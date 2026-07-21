#!/usr/bin/env bash
#
# Story 13.7 — Postgres-integratie-testrunner.
#
# Start een wegwerp-pgvector-Postgres, past de vliegwiel-migraties toe
# (`prisma migrate deploy`) en draait de vitest-integratietests
# (vitest.integration.config.ts) daartegen. Ruimt de container altijd op.
#
# Geen enkele credential wordt gecommit: de wegwerp-DSN gebruikt lokale
# throwaway-credentials (postgres/postgres) op een door Docker toegewezen poort.
# Draait NOOIT tegen ACC/productie.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${API_DIR}"

IMAGE="pgvector/pgvector:pg16"
CONTAINER_NAME="logoreco-itest-pg-$$"
PG_PASSWORD="postgres"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker niet gevonden — Postgres-integratietest (AC3) vereist een echte engine." >&2
  exit 2
fi

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Start wegwerp-Postgres (${IMAGE}) container ${CONTAINER_NAME}"
docker run -d --rm \
  --name "${CONTAINER_NAME}" \
  -e POSTGRES_PASSWORD="${PG_PASSWORD}" \
  -e POSTGRES_DB=postgres \
  -p 0:5432 \
  "${IMAGE}" >/dev/null

# Lees de door Docker toegewezen host-poort terug (vermijdt free-port-races).
HOST_PORT="$(docker port "${CONTAINER_NAME}" 5432/tcp | head -1 | sed 's/.*://')"
if [ -z "${HOST_PORT}" ]; then
  echo "ERROR: kon toegewezen Postgres-poort niet bepalen." >&2
  exit 1
fi
echo "==> Postgres op host-poort ${HOST_PORT}"

export DATABASE_URL="postgresql://postgres:${PG_PASSWORD}@localhost:${HOST_PORT}/postgres?schema=public"
# Env die de import-keten (core/db, ml-client) verwacht.
export NODE_ENV="test"
export ML_SERVICE_URL="${ML_SERVICE_URL:-http://localhost:8001}"

echo "==> Wacht tot Postgres accepteert"
for i in $(seq 1 60); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ "${i}" -eq 60 ]; then
    echo "ERROR: Postgres kwam niet online binnen 60s." >&2
    exit 1
  fi
done

echo "==> Applicatierol aanmaken (migraties 0007/0008 GRANT'en aan 'logorecognition')"
docker exec "${CONTAINER_NAME}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'logorecognition') THEN CREATE ROLE logorecognition; END IF; END \$\$;"

echo "==> Prisma-client genereren + migraties toepassen"
npx prisma generate >/dev/null
npx prisma migrate deploy

echo "==> Integratietests draaien"
npx vitest run --config vitest.integration.config.ts

echo "==> Klaar"
