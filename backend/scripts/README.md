# Database Migration Scripts

## US-INT-001: JSON to PostgreSQL Migration

### Overview
This directory contains scripts for migrating training job data from JSON files to PostgreSQL database as part of the JSON→PostgreSQL migration (Sprint: Integration & Training).

### Migration Script: `migrate_json_to_db.py`

**Purpose**: Migrate all training jobs from `uploads/training_jobs.json` to the `training_jobs` PostgreSQL table.

**Usage**:

```bash
# Basic usage (uses defaults)
cd backend
python3 scripts/migrate_json_to_db.py

# With custom database URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
python3 scripts/migrate_json_to_db.py

# With custom JSON file location
export TRAINING_JOBS_JSON="/path/to/training_jobs.json"
python3 scripts/migrate_json_to_db.py
```

**Features**:
- ✅ Transactional (automatic rollback on errors)
- ✅ Idempotent (safe to run multiple times with ON CONFLICT handling)
- ✅ Maps all JSON fields to database schema
- ✅ Validates data before insertion
- ✅ Provides detailed migration summary

**What it migrates**:
- Training job ID (UUID)
- Status (pending, running, completed, failed)
- Timestamps (created_at, started_at, completed_at)
- Configuration (stored as JSONB)
- Metrics (progress, duration, etc.)
- Dataset information

**Example Output**:

```
============================================================
US-INT-001: JSON → PostgreSQL Migration
============================================================

✓ Connected to PostgreSQL database
✓ Loaded 2 training jobs from JSON

🔄 Migrating 2 training jobs...
  1/2 ✓ Migrated job 6ca06304... (status: completed)
  2/2 ✓ Migrated job 8eff455a... (status: completed)

============================================================
Migration Summary:
  Total jobs: 2
  ✓ Migrated: 2
  ✗ Failed: 0
============================================================

✓ Verification: 2 training jobs now in database
✓ Database connection closed

✅ Migration completed successfully!
```

### Prerequisites

1. **Database Setup**:
   ```bash
   # Ensure PostgreSQL is running
   docker-compose up -d postgres

   # Run Alembic migrations
   cd backend
   alembic upgrade head
   ```

2. **Dependencies**:
   ```bash
   pip install psycopg2-binary sqlalchemy alembic
   ```

### Post-Migration Steps

**CRITICAL**: After verifying the migration:

1. **Remove JSON file I/O** from:
   - `app/routers/training.py` - API endpoints
   - `app/training/training_pipeline.py` - Celery tasks
   - Any other training-related code

2. **Replace with database queries** using:
   - `TrainingJobService` (US-INT-003)
   - SQLAlchemy ORM models
   - Direct PostgreSQL queries via asyncpg

3. **Delete or archive** the JSON files:
   ```bash
   # Backup first!
   mv uploads/training_jobs.json uploads/backup/training_jobs_$(date +%Y%m%d).json.bak
   ```

4. **Verify ZERO JSON operations** (US-INT-007):
   - Run E2E tests that track file operations
   - Ensure no `json.load()` or `json.dump()` calls for training data

### Rollback

If migration fails or needs to be reversed:

```sql
-- Clear migrated data
TRUNCATE TABLE training_jobs CASCADE;

-- Or rollback the entire migration
cd backend
alembic downgrade -1
```

### Troubleshooting

**Connection Refused**:
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Verify connection
psql postgresql://postgres:postgres@localhost:5432/logo_recognition -c "SELECT 1"
```

**Permission Denied**:
```bash
# Make script executable
chmod +x scripts/migrate_json_to_db.py
```

**JSON File Not Found**:
```bash
# Check file location
ls -la uploads/training_jobs.json

# Specify custom path
export TRAINING_JOBS_JSON="/path/to/file.json"
```

### Related User Stories

- **US-INT-001**: Database Migration Setup (this script)
- **US-INT-002**: Production API Endpoints (uses migrated data)
- **US-INT-003**: Service Layer (TrainingJobService)
- **US-INT-004**: Celery Integration (database-backed tasks)
- **US-INT-007**: Integration Testing (validates zero JSON ops)
