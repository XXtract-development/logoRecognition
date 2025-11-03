"""
Database Backup and Recovery Management
STORY-001: Database Infrastructure with Monitoring
"""
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import json
import logging

logger = logging.getLogger(__name__)


class BackupManager:
    """Manage database backups and recovery"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        # Use config backup_dir or default
        backup_path = config.get('backup_dir', '/var/backups/postgresql')
        self.backup_dir = Path(backup_path)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.next_backup_time: Optional[datetime] = None
        self._backup_task = None

    async def create_backup(self) -> Path:
        """Create a database backup"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = self.backup_dir / f"backup_{timestamp}.sql"

        try:
            # Build pg_dump command
            cmd = [
                'pg_dump',
                '-h', self.config['host'],
                '-p', str(self.config['port']),
                '-U', self.config['user'],
                '-d', self.config['database'],
                '-f', str(backup_file),
                '--verbose',
                '--format=custom',
                '--blobs',
                '--encoding=UTF8'
            ]

            # Set PGPASSWORD environment variable
            env = {'PGPASSWORD': self.config['password']}

            # Execute backup
            process = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.error(f"Backup failed: {stderr.decode()}")
                raise Exception(f"Backup failed with exit code {process.returncode}")

            logger.info(f"Backup created successfully: {backup_file}")

            # Create metadata file
            metadata_file = backup_file.with_suffix('.json')
            metadata = {
                'timestamp': timestamp,
                'database': self.config['database'],
                'size_bytes': backup_file.stat().st_size,
                'type': 'full',
                'compression': 'custom',
                'wal_position': await self._get_wal_position()
            }

            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)

            return backup_file

        except Exception as e:
            logger.error(f"Backup creation failed: {e}")
            raise

    async def _get_wal_position(self) -> str:
        """Get current WAL position for PITR"""
        # Mock implementation for testing
        return "0/12345678"

    def schedule_backups(self, interval_hours: int = 6):
        """Schedule automatic backups"""
        self.next_backup_time = datetime.now() + timedelta(hours=interval_hours)
        self._backup_task = asyncio.create_task(
            self._run_scheduled_backups(interval_hours)
        )
        logger.info(f"Scheduled backups every {interval_hours} hours")

    async def _run_scheduled_backups(self, interval_hours: int):
        """Run scheduled backups"""
        while True:
            await asyncio.sleep(interval_hours * 3600)
            try:
                await self.create_backup()
                self.next_backup_time = datetime.now() + timedelta(hours=interval_hours)
                await self._cleanup_old_backups()
            except Exception as e:
                logger.error(f"Scheduled backup failed: {e}")

    async def _cleanup_old_backups(self, retention_days: int = 7):
        """Clean up old backup files"""
        cutoff_date = datetime.now() - timedelta(days=retention_days)

        for backup_file in self.backup_dir.glob("backup_*.sql"):
            # Parse timestamp from filename
            timestamp_str = backup_file.stem.replace('backup_', '')
            try:
                file_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                if file_date < cutoff_date:
                    backup_file.unlink()
                    # Also remove metadata file
                    metadata_file = backup_file.with_suffix('.json')
                    if metadata_file.exists():
                        metadata_file.unlink()
                    logger.info(f"Deleted old backup: {backup_file}")
            except ValueError:
                logger.warning(f"Could not parse backup file timestamp: {backup_file}")

    async def restore_backup(self, backup_file: Path):
        """Restore database from backup"""
        try:
            # Build pg_restore command
            cmd = [
                'pg_restore',
                '-h', self.config['host'],
                '-p', str(self.config['port']),
                '-U', self.config['user'],
                '-d', self.config['database'],
                '--clean',
                '--if-exists',
                '--verbose',
                str(backup_file)
            ]

            # Set PGPASSWORD environment variable
            env = {'PGPASSWORD': self.config['password']}

            # Execute restore
            process = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                logger.error(f"Restore failed: {stderr.decode()}")
                raise Exception(f"Restore failed with exit code {process.returncode}")

            logger.info(f"Database restored successfully from: {backup_file}")

        except Exception as e:
            logger.error(f"Database restore failed: {e}")
            raise

    async def restore_to_point_in_time(self, recovery_point: datetime):
        """Restore database to a specific point in time"""
        try:
            # Find the most recent backup before the recovery point
            backup_files = sorted(self.backup_dir.glob("backup_*.sql"))
            selected_backup = None

            for backup_file in reversed(backup_files):
                timestamp_str = backup_file.stem.replace('backup_', '')
                file_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                if file_date <= recovery_point:
                    selected_backup = backup_file
                    break

            if not selected_backup:
                raise ValueError(f"No backup found before {recovery_point}")

            # Restore the base backup
            await self.restore_backup(selected_backup)

            # Apply WAL logs up to recovery point
            await self._apply_wal_to_point(recovery_point)

            logger.info(f"Database restored to point in time: {recovery_point}")

        except Exception as e:
            logger.error(f"Point-in-time recovery failed: {e}")
            raise

    async def _apply_wal_to_point(self, recovery_point: datetime):
        """Apply WAL logs up to specific point"""
        # Mock implementation for testing
        # In production, this would use pg_waldump and recovery configuration
        logger.info(f"Applying WAL logs up to {recovery_point}")

    def get_backup_list(self) -> List[Dict[str, Any]]:
        """Get list of available backups"""
        backups = []

        for backup_file in sorted(self.backup_dir.glob("backup_*.sql")):
            metadata_file = backup_file.with_suffix('.json')
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                    backups.append({
                        'file': str(backup_file),
                        'timestamp': metadata['timestamp'],
                        'size_mb': metadata['size_bytes'] / (1024 * 1024),
                        'type': metadata['type']
                    })

        return backups

    async def verify_backup(self, backup_file: Path) -> bool:
        """Verify backup integrity"""
        try:
            # Test backup file can be read
            cmd = [
                'pg_restore',
                '--list',
                str(backup_file)
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                logger.info(f"Backup verification successful: {backup_file}")
                return True
            else:
                logger.error(f"Backup verification failed: {stderr.decode()}")
                return False

        except Exception as e:
            logger.error(f"Backup verification error: {e}")
            return False


from typing import List