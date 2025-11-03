#!/usr/bin/env python3
"""
US-INT-001: Data Migration Script - JSON to PostgreSQL
This script migrates training job data from JSON files to PostgreSQL database.

CRITICAL REQUIREMENT: After this migration, ALL JSON file I/O must be eliminated.
"""

import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from uuid import UUID
import psycopg2
from psycopg2.extras import Json
from psycopg2.extensions import connection

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))


class TrainingJobMigrator:
    """Migrate training jobs from JSON to PostgreSQL"""

    def __init__(self, db_url: str, json_file_path: str):
        self.db_url = db_url
        self.json_file_path = Path(json_file_path)
        self.conn: Optional[connection] = None

    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(self.db_url)
            print(f"✓ Connected to PostgreSQL database")
        except Exception as e:
            print(f"✗ Failed to connect to database: {e}")
            raise

    def load_json_data(self) -> List[Dict[str, Any]]:
        """Load training jobs from JSON file"""
        if not self.json_file_path.exists():
            print(f"⚠ JSON file not found: {self.json_file_path}")
            return []

        try:
            with open(self.json_file_path, 'r') as f:
                data = json.load(f)
            print(f"✓ Loaded {len(data)} training jobs from JSON")
            return data
        except Exception as e:
            print(f"✗ Failed to load JSON data: {e}")
            raise

    def map_json_to_db_record(self, json_job: Dict[str, Any]) -> Dict[str, Any]:
        """Map JSON training job to database record structure"""

        # Parse timestamps
        created_at = None
        if 'created_at' in json_job:
            try:
                created_at = datetime.fromisoformat(json_job['created_at'].replace('Z', '+00:00'))
            except:
                created_at = datetime.utcnow()

        started_at = None
        if 'start_ts' in json_job:
            try:
                started_at = datetime.fromtimestamp(json_job['start_ts'])
            except:
                pass

        completed_at = None
        if 'finished_at' in json_job:
            try:
                completed_at = datetime.fromisoformat(json_job['finished_at'].replace('Z', '+00:00'))
            except:
                pass

        # Extract dataset info
        dataset = json_job.get('dataset', {})

        # Build config from existing data
        config = {
            'dataset': dataset,
            'migrated_from_json': True,
            'original_json_keys': list(json_job.keys())
        }

        # Build metrics from progress/duration
        metrics = {}
        if 'progress' in json_job:
            metrics['progress'] = json_job['progress']
        if 'duration_seconds' in json_job:
            metrics['duration_seconds'] = json_job['duration_seconds']

        # Calculate epochs if available
        current_epoch = None
        total_epochs = None
        if 'progress' in json_job:
            progress = json_job['progress']
            if progress == 100.0:
                current_epoch = 100
                total_epochs = 100

        # Build the database record
        return {
            'id': json_job['id'],
            'status': json_job.get('status', 'unknown'),
            'created_at': created_at or datetime.utcnow(),
            'started_at': started_at,
            'completed_at': completed_at,
            'config': config,
            'metrics': metrics if metrics else None,
            'phase_progress': None,
            'resources': None,
            'current_epoch': current_epoch,
            'total_epochs': total_epochs,
            'notifications': None,
            'celery_task_id': None,
            'error_message': None,
            'model_version': None,
            'user_id': None,
            'dataset_info': dataset if dataset else None
        }

    def insert_training_job(self, cursor, record: Dict[str, Any]):
        """Insert a training job into the database"""
        sql = """
            INSERT INTO training_jobs (
                id, status, created_at, started_at, completed_at,
                config, metrics, phase_progress, resources,
                current_epoch, total_epochs, notifications,
                celery_task_id, error_message, model_version,
                user_id, dataset_info
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s
            )
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                completed_at = EXCLUDED.completed_at,
                metrics = EXCLUDED.metrics
        """

        cursor.execute(sql, (
            record['id'],
            record['status'],
            record['created_at'],
            record['started_at'],
            record['completed_at'],
            Json(record['config']),
            Json(record['metrics']) if record['metrics'] else None,
            Json(record['phase_progress']) if record['phase_progress'] else None,
            Json(record['resources']) if record['resources'] else None,
            record['current_epoch'],
            record['total_epochs'],
            Json(record['notifications']) if record['notifications'] else None,
            record['celery_task_id'],
            record['error_message'],
            record['model_version'],
            record['user_id'],
            Json(record['dataset_info']) if record['dataset_info'] else None
        ))

    def migrate(self) -> bool:
        """Execute the full migration"""
        print("\n" + "="*60)
        print("US-INT-001: JSON → PostgreSQL Migration")
        print("="*60 + "\n")

        try:
            # Connect to database
            self.connect()

            # Load JSON data
            json_jobs = self.load_json_data()

            if not json_jobs:
                print("\n⚠ No training jobs to migrate")
                return True

            # Start transaction
            cursor = self.conn.cursor()

            print(f"\n🔄 Migrating {len(json_jobs)} training jobs...")

            migrated_count = 0
            failed_count = 0

            for i, json_job in enumerate(json_jobs, 1):
                try:
                    # Map JSON to DB record
                    db_record = self.map_json_to_db_record(json_job)

                    # Insert into database
                    self.insert_training_job(cursor, db_record)

                    migrated_count += 1
                    print(f"  {i}/{len(json_jobs)} ✓ Migrated job {db_record['id'][:8]}... (status: {db_record['status']})")

                except Exception as e:
                    failed_count += 1
                    job_id = json_job.get('id', 'unknown')
                    print(f"  {i}/{len(json_jobs)} ✗ Failed to migrate job {job_id[:8] if len(job_id) > 8 else job_id}: {e}")

            # Commit transaction
            self.conn.commit()

            print(f"\n{'='*60}")
            print(f"Migration Summary:")
            print(f"  Total jobs: {len(json_jobs)}")
            print(f"  ✓ Migrated: {migrated_count}")
            print(f"  ✗ Failed: {failed_count}")
            print(f"{'='*60}\n")

            # Verify migration
            cursor.execute("SELECT COUNT(*) FROM training_jobs")
            db_count = cursor.fetchone()[0]
            print(f"✓ Verification: {db_count} training jobs now in database\n")

            return failed_count == 0

        except Exception as e:
            print(f"\n✗ Migration failed: {e}")
            if self.conn:
                self.conn.rollback()
                print("✓ Transaction rolled back")
            return False

        finally:
            if self.conn:
                self.conn.close()
                print("✓ Database connection closed\n")


def main():
    """Main entry point"""
    import os

    # Configuration
    DB_URL = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/logo_recognition'
    )

    JSON_FILE = os.getenv(
        'TRAINING_JOBS_JSON',
        str(Path(__file__).parent.parent / 'uploads' / 'training_jobs.json')
    )

    print(f"Configuration:")
    print(f"  Database: {DB_URL.split('@')[1] if '@' in DB_URL else DB_URL}")
    print(f"  JSON File: {JSON_FILE}\n")

    # Run migration
    migrator = TrainingJobMigrator(DB_URL, JSON_FILE)
    success = migrator.migrate()

    if success:
        print("✅ Migration completed successfully!")
        print("\n⚠️  IMPORTANT: After verifying data, remove JSON file operations from:")
        print("    - API endpoints (training.py)")
        print("    - Celery tasks (training_pipeline.py)")
        print("    - All other training-related code")
        sys.exit(0)
    else:
        print("❌ Migration failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
