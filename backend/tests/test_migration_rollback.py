#!/usr/bin/env python3
"""
US-INT-001: Rollback Verification Test
Test that database migration rollback completes in < 5 seconds

Requirements:
- Rollback time must be < 5 seconds
- All tables must be properly dropped
- Migration must be re-applicable after rollback
"""

import sys
import time
import pytest
from pathlib import Path
from alembic.config import Config
from alembic import command
import psycopg2

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/logo_recognition"
ALEMBIC_INI = str(Path(__file__).parent.parent / "alembic.ini")
MAX_ROLLBACK_TIME = 5.0  # seconds


class TestMigrationRollback:
    """Test suite for database migration rollback"""

    @pytest.fixture
    def alembic_config(self):
        """Create Alembic configuration"""
        config = Config(ALEMBIC_INI)
        config.set_main_option("sqlalchemy.url", DATABASE_URL)
        return config

    @pytest.fixture
    def db_connection(self):
        """Create database connection"""
        conn = psycopg2.connect(DATABASE_URL)
        yield conn
        conn.close()

    def test_rollback_speed(self, alembic_config, db_connection):
        """
        US-INT-001 Requirement: Rollback must complete in < 5 seconds

        This test:
        1. Ensures migration is at head
        2. Measures rollback time
        3. Verifies tables are dropped
        4. Re-applies migration
        """

        # Step 1: Ensure we're at the latest migration
        print("\n📋 Step 1: Upgrading to head...")
        command.upgrade(alembic_config, "head")

        # Verify tables exist before rollback
        cursor = db_connection.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('training_jobs', 'model_registry', 'categories')
        """)
        tables_before = cursor.fetchone()[0]
        print(f"   ✓ Tables before rollback: {tables_before}")
        assert tables_before == 3, "Expected all 3 tables to exist before rollback"

        # Step 2: Measure rollback time
        print("\n⏱️  Step 2: Measuring rollback time...")
        start_time = time.time()

        command.downgrade(alembic_config, "-1")

        rollback_time = time.time() - start_time

        print(f"   ⏱️  Rollback completed in: {rollback_time:.3f} seconds")
        print(f"   📊 Requirement: < {MAX_ROLLBACK_TIME} seconds")

        # Step 3: Verify tables are dropped
        print("\n🔍 Step 3: Verifying tables were dropped...")
        db_connection.commit()  # Ensure we see the latest state
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('training_jobs', 'model_registry', 'categories')
        """)
        tables_after = cursor.fetchone()[0]
        print(f"   ✓ Tables after rollback: {tables_after}")

        # Step 4: Re-apply migration
        print("\n♻️  Step 4: Re-applying migration...")
        command.upgrade(alembic_config, "head")

        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('training_jobs', 'model_registry', 'categories')
        """)
        tables_restored = cursor.fetchone()[0]
        print(f"   ✓ Tables restored: {tables_restored}")

        # Assertions
        print("\n" + "="*60)
        print("📊 TEST RESULTS:")
        print("="*60)
        print(f"Rollback Time:    {rollback_time:.3f}s (max: {MAX_ROLLBACK_TIME}s)")
        print(f"Tables Dropped:   {tables_after == 0}")
        print(f"Migration Reapplied: {tables_restored == 3}")
        print("="*60)

        assert rollback_time < MAX_ROLLBACK_TIME, \
            f"Rollback took {rollback_time:.3f}s, exceeds {MAX_ROLLBACK_TIME}s requirement"
        assert tables_after == 0, "Tables should be dropped after rollback"
        assert tables_restored == 3, "All tables should be restored after re-applying migration"

        print("\n✅ US-INT-001 Rollback Verification: PASSED")

    def test_rollback_idempotency(self, alembic_config, db_connection):
        """
        Test that rollback can be performed multiple times safely
        """
        print("\n🔄 Testing rollback idempotency...")

        # Ensure at head
        command.upgrade(alembic_config, "head")

        # First rollback
        command.downgrade(alembic_config, "-1")

        cursor = db_connection.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('training_jobs', 'model_registry', 'categories')
        """)
        count_after_first = cursor.fetchone()[0]

        # Restore
        command.upgrade(alembic_config, "head")

        # Second rollback
        command.downgrade(alembic_config, "-1")

        db_connection.commit()
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('training_jobs', 'model_registry', 'categories')
        """)
        count_after_second = cursor.fetchone()[0]

        # Restore again
        command.upgrade(alembic_config, "head")

        assert count_after_first == count_after_second, \
            "Rollback should be idempotent"

        print("   ✓ Rollback is idempotent")

    def test_cascade_delete_on_rollback(self, alembic_config, db_connection):
        """
        Test that rollback properly handles CASCADE deletes
        (model_registry should be dropped before training_jobs)
        """
        print("\n🔗 Testing CASCADE delete behavior...")

        # Ensure at head
        command.upgrade(alembic_config, "head")

        # Insert test data with foreign key relationship
        cursor = db_connection.cursor()
        cursor.execute("""
            INSERT INTO training_jobs (id, status, config)
            VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'test', '{}')
        """)
        cursor.execute("""
            INSERT INTO model_registry (id, version, training_job_id, model_path)
            VALUES (
                '00000000-0000-0000-0000-000000000002'::uuid,
                'test-v1',
                '00000000-0000-0000-0000-000000000001'::uuid,
                '/models/test.onnx'
            )
        """)
        db_connection.commit()

        # Perform rollback (should not fail due to foreign key constraints)
        try:
            command.downgrade(alembic_config, "-1")
            cascade_success = True
        except Exception as e:
            cascade_success = False
            print(f"   ✗ CASCADE delete failed: {e}")

        # Restore
        command.upgrade(alembic_config, "head")

        assert cascade_success, "Rollback should handle CASCADE deletes properly"
        print("   ✓ CASCADE delete handled correctly")


def test_rollback_manual():
    """
    Manual test function that can be run standalone

    Usage:
        python -m pytest tests/test_migration_rollback.py::test_rollback_manual -v
    """
    print("\n" + "="*60)
    print("US-INT-001: Manual Rollback Speed Test")
    print("="*60)

    config = Config(ALEMBIC_INI)
    config.set_main_option("sqlalchemy.url", DATABASE_URL)

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # Upgrade to head
        print("\n1. Upgrading to head...")
        command.upgrade(config, "head")

        # Measure rollback
        print("2. Measuring rollback time...")
        start = time.time()
        command.downgrade(config, "-1")
        rollback_time = time.time() - start

        # Verify
        print("3. Verifying tables dropped...")
        conn.commit()
        cursor.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        remaining_tables = [row[0] for row in cursor.fetchall()]

        # Restore
        print("4. Restoring migration...")
        command.upgrade(config, "head")

        # Results
        print("\n" + "="*60)
        print("RESULTS:")
        print(f"  Rollback Time: {rollback_time:.3f}s")
        print(f"  Max Allowed:   {MAX_ROLLBACK_TIME}s")
        print(f"  Status:        {'✅ PASS' if rollback_time < MAX_ROLLBACK_TIME else '❌ FAIL'}")
        print(f"  Tables After:  {remaining_tables}")
        print("="*60 + "\n")

        conn.close()

        assert rollback_time < MAX_ROLLBACK_TIME, \
            f"Rollback exceeded {MAX_ROLLBACK_TIME}s limit"

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        raise


if __name__ == "__main__":
    """
    Run standalone for manual testing

    Usage:
        cd backend
        python tests/test_migration_rollback.py
    """
    test_rollback_manual()
