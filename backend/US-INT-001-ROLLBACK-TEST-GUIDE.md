# US-INT-001: Rollback Verification Test Guide

## Overview
This guide explains how to test that the database migration rollback completes in < 5 seconds, as required by US-INT-001.

## Requirement
**Rollback verification must complete in < 5 seconds**

This ensures that:
- Database schema changes can be quickly reverted in production
- Deployment rollbacks are fast and safe
- Testing iterations are efficient

## Test Files Created

### 1. Python Test: `tests/test_migration_rollback.py`
Comprehensive pytest test suite for rollback verification.

**Features**:
- ✅ Measures rollback time
- ✅ Verifies tables are dropped
- ✅ Tests migration re-application
- ✅ Tests rollback idempotency
- ✅ Tests CASCADE delete behavior

**Usage**:
```bash
cd backend

# Run all rollback tests
pytest tests/test_migration_rollback.py -v

# Run specific test
pytest tests/test_migration_rollback.py::TestMigrationRollback::test_rollback_speed -v

# Run manual test
python tests/test_migration_rollback.py
```

### 2. Shell Script: `scripts/test_rollback.sh`
Quick shell script for manual rollback testing.

**Features**:
- ✅ Fast execution
- ✅ Colorful output
- ✅ Automatic cleanup
- ✅ Exit codes for CI/CD

**Usage**:
```bash
cd backend

# Run test
./scripts/test_rollback.sh

# Run with custom database URL
DATABASE_URL="postgresql://user:pass@host:5432/db" ./scripts/test_rollback.sh
```

## Prerequisites

### 1. Start PostgreSQL
```bash
# From project root
docker-compose up -d postgres

# Verify it's running
docker ps | grep postgres
```

### 2. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 3. Ensure Migration is Applied
```bash
cd backend
alembic upgrade head
```

## Running the Tests

### Method 1: Shell Script (Recommended for Quick Tests)
```bash
cd backend
./scripts/test_rollback.sh
```

**Expected Output**:
```
==========================================
US-INT-001: Rollback Speed Test
==========================================

1. Checking database connectivity...
   ✓ Database connected

2. Upgrading to head revision...
   ✓ At head revision

3. Counting tables before rollback...
   ✓ Tables before rollback: 3

4. Measuring rollback time...
   ⏱️  Rollback completed in: 1.234s

5. Verifying tables dropped...
   ✓ Tables after rollback: 0

6. Restoring migration...
   ✓ Migration restored
   ✓ Tables restored: 3

==========================================
TEST RESULTS
==========================================
Rollback Time:     1.234s
Max Allowed:       5.0s
Tables Dropped:    ✅ YES
Tables Restored:   ✅ YES
Status:            ✅ PASS
==========================================

✅ US-INT-001 Rollback Verification: PASSED
```

### Method 2: Python Test (Recommended for CI/CD)
```bash
cd backend
pytest tests/test_migration_rollback.py -v
```

**Expected Output**:
```
======================== test session starts =========================
tests/test_migration_rollback.py::TestMigrationRollback::test_rollback_speed

📋 Step 1: Upgrading to head...
   ✓ Tables before rollback: 3

⏱️  Step 2: Measuring rollback time...
   ⏱️  Rollback completed in: 1.234 seconds
   📊 Requirement: < 5.0 seconds

🔍 Step 3: Verifying tables were dropped...
   ✓ Tables after rollback: 0

♻️  Step 4: Re-applying migration...
   ✓ Tables restored: 3

============================================================
📊 TEST RESULTS:
============================================================
Rollback Time:    1.234s (max: 5.0s)
Tables Dropped:   True
Migration Reapplied: True
============================================================

✅ US-INT-001 Rollback Verification: PASSED

PASSED                                                      [100%]

========================= 1 passed in 3.45s ==========================
```

## Test Scenarios Covered

### 1. **Rollback Speed** (`test_rollback_speed`)
- ✅ Measures actual rollback time
- ✅ Asserts time < 5 seconds
- ✅ Verifies all tables dropped
- ✅ Verifies migration can be re-applied

### 2. **Idempotency** (`test_rollback_idempotency`)
- ✅ Rollback can be performed multiple times
- ✅ Results are consistent
- ✅ No side effects

### 3. **CASCADE Deletes** (`test_cascade_delete_on_rollback`)
- ✅ Foreign key constraints handled properly
- ✅ model_registry deleted before training_jobs
- ✅ No constraint violations

## Troubleshooting

### Database Connection Error
```
❌ Cannot connect to database
```

**Solution**:
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for it to be ready
docker-compose logs -f postgres
# Press Ctrl+C when you see "database system is ready to accept connections"

# Test connection
psql postgresql://postgres:postgres@localhost:5432/logo_recognition -c "SELECT 1"
```

### Rollback Takes Too Long (> 5 seconds)
If the test fails because rollback is too slow:

1. **Check database load**: Ensure no other processes are using the database
2. **Check disk performance**: Slow I/O can cause delays
3. **Check migration complexity**: Review the downgrade() function for optimization opportunities
4. **Increase max time temporarily**: Only for development/testing

**Optimize migration**:
```python
# In the migration file, ensure indexes are dropped efficiently
def downgrade() -> None:
    # Drop indexes first (faster)
    op.drop_index('idx_training_jobs_status_created', table_name='training_jobs')

    # Then drop tables with CASCADE
    op.drop_table('model_registry')  # Foreign key holder first
    op.drop_table('training_jobs')   # Parent table last
```

### Tables Not Dropped After Rollback
```
Tables after rollback: 3 (expected: 0)
```

**Solution**:
- Check the `downgrade()` function in the migration file
- Ensure all CREATE TABLE statements have corresponding DROP TABLE in downgrade
- Verify CASCADE deletes are properly configured

## CI/CD Integration

### GitHub Actions Example
```yaml
name: US-INT-001 Rollback Test

on: [push, pull_request]

jobs:
  test-rollback:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: logo_recognition
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.10'

      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt

      - name: Run rollback test
        run: |
          cd backend
          pytest tests/test_migration_rollback.py -v
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/logo_recognition

      - name: Run shell script test
        run: |
          cd backend
          ./scripts/test_rollback.sh
```

## Performance Benchmarks

**Expected rollback times** (based on schema complexity):

| Scenario | Expected Time | Status |
|----------|--------------|--------|
| Empty database | < 0.5s | ✅ Excellent |
| With test data | < 2.0s | ✅ Good |
| Production-like data | < 5.0s | ✅ Acceptable |
| > 5 seconds | - | ❌ Requires optimization |

## Success Criteria

✅ **Test PASSES if**:
1. Rollback completes in < 5 seconds
2. All tables (training_jobs, model_registry, categories) are dropped
3. Migration can be re-applied successfully
4. No database errors or constraint violations

❌ **Test FAILS if**:
1. Rollback takes ≥ 5 seconds
2. Tables remain after rollback
3. Migration cannot be re-applied
4. Constraint violations occur

## Next Steps After Passing

Once the rollback test passes:

1. ✅ Mark US-INT-001 as complete
2. ✅ Document rollback time in deployment guide
3. ✅ Add rollback test to CI/CD pipeline
4. ✅ Move to US-INT-002 (Production API Endpoints)

## Related Documentation

- **Migration Script**: `backend/alembic/versions/b8d46cdab736_us_int_001_add_training_jobs_and_model_.py`
- **Alembic Config**: `backend/alembic.ini`
- **Database Models**: `backend/app/models/training.py`
- **User Story**: `docs/sprints/sprint-integration-training/US-INT-001-database-migration.md`

---

**Test Implementation Date**: 2025-10-02
**Requirement**: < 5 seconds rollback time
**Status**: ✅ READY FOR TESTING
