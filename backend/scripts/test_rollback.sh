#!/bin/bash
# US-INT-001: Quick rollback speed test
# This script tests that database migration rollback completes in < 5 seconds

set -e

echo "=========================================="
echo "US-INT-001: Rollback Speed Test"
echo "=========================================="
echo ""

# Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/logo_recognition}"
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MAX_ROLLBACK_TIME=5.0

cd "$BACKEND_DIR"

# Check if database is accessible
echo "1. Checking database connectivity..."
if ! python3 -c "import psycopg2; psycopg2.connect('$DATABASE_URL').close()" 2>/dev/null; then
    echo "   ❌ Cannot connect to database"
    echo "   Please start PostgreSQL: docker-compose up -d postgres"
    exit 1
fi
echo "   ✓ Database connected"

# Ensure we're at the latest migration
echo ""
echo "2. Upgrading to head revision..."
export DATABASE_URL="$DATABASE_URL"
alembic upgrade head
echo "   ✓ At head revision"

# Count tables before rollback
echo ""
echo "3. Counting tables before rollback..."
TABLES_BEFORE=$(python3 -c "
import psycopg2
conn = psycopg2.connect('$DATABASE_URL')
cur = conn.cursor()
cur.execute(\"\"\"
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('training_jobs', 'model_registry', 'categories')
\"\"\")
print(cur.fetchone()[0])
conn.close()
")
echo "   ✓ Tables before rollback: $TABLES_BEFORE"

# Measure rollback time
echo ""
echo "4. Measuring rollback time..."
START=$(python3 -c "import time; print(time.time())")

alembic downgrade -1

END=$(python3 -c "import time; print(time.time())")
ROLLBACK_TIME=$(python3 -c "print(f'{$END - $START:.3f}')")

echo "   ⏱️  Rollback completed in: ${ROLLBACK_TIME}s"

# Verify tables were dropped
echo ""
echo "5. Verifying tables dropped..."
TABLES_AFTER=$(python3 -c "
import psycopg2
conn = psycopg2.connect('$DATABASE_URL')
cur = conn.cursor()
cur.execute(\"\"\"
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('training_jobs', 'model_registry', 'categories')
\"\"\")
print(cur.fetchone()[0])
conn.close()
")
echo "   ✓ Tables after rollback: $TABLES_AFTER"

# Restore migration
echo ""
echo "6. Restoring migration..."
alembic upgrade head
echo "   ✓ Migration restored"

# Verify restoration
TABLES_RESTORED=$(python3 -c "
import psycopg2
conn = psycopg2.connect('$DATABASE_URL')
cur = conn.cursor()
cur.execute(\"\"\"
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('training_jobs', 'model_registry', 'categories')
\"\"\")
print(cur.fetchone()[0])
conn.close()
")
echo "   ✓ Tables restored: $TABLES_RESTORED"

# Results
echo ""
echo "=========================================="
echo "TEST RESULTS"
echo "=========================================="
echo "Rollback Time:     ${ROLLBACK_TIME}s"
echo "Max Allowed:       ${MAX_ROLLBACK_TIME}s"
echo "Tables Dropped:    $([ "$TABLES_AFTER" -eq 0 ] && echo '✅ YES' || echo '❌ NO')"
echo "Tables Restored:   $([ "$TABLES_RESTORED" -eq 3 ] && echo '✅ YES' || echo '❌ NO')"

# Check if rollback time is within limit
if [ "$(python3 -c "print($ROLLBACK_TIME < $MAX_ROLLBACK_TIME)")" == "True" ]; then
    echo "Status:            ✅ PASS"
    echo "=========================================="
    echo ""
    echo "✅ US-INT-001 Rollback Verification: PASSED"
    exit 0
else
    echo "Status:            ❌ FAIL"
    echo "=========================================="
    echo ""
    echo "❌ Rollback took ${ROLLBACK_TIME}s, exceeds ${MAX_ROLLBACK_TIME}s requirement"
    exit 1
fi
