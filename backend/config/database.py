"""
Database configuration
STORY-001: Database Infrastructure with Monitoring
"""
import os
from typing import Dict, Any


class DatabaseConfig:
    """Database configuration settings"""

    def __init__(self):
        self.host = os.getenv('DB_HOST', 'localhost')
        self.port = int(os.getenv('DB_PORT', 5432))
        self.database = os.getenv('DB_NAME', 'logo_recognition')
        self.user = os.getenv('DB_USER', 'postgres')
        self.password = os.getenv('DB_PASSWORD', 'postgres')

        # Connection pool settings
        self.min_pool_size = int(os.getenv('DB_MIN_POOL_SIZE', 10))
        self.max_pool_size = int(os.getenv('DB_MAX_POOL_SIZE', 100))
        self.command_timeout = int(os.getenv('DB_COMMAND_TIMEOUT', 60))

        # PgBouncer settings
        self.pgbouncer_enabled = os.getenv('PGBOUNCER_ENABLED', 'true').lower() == 'true'
        self.pgbouncer_host = os.getenv('PGBOUNCER_HOST', 'localhost')
        self.pgbouncer_port = int(os.getenv('PGBOUNCER_PORT', 6432))
        self.pgbouncer_pool_mode = os.getenv('PGBOUNCER_POOL_MODE', 'transaction')

        # Vector search settings
        self.vector_dimension = int(os.getenv('VECTOR_DIMENSION', 512))
        self.ivfflat_lists = int(os.getenv('IVFFLAT_LISTS', 100))
        self.ivfflat_probes = int(os.getenv('IVFFLAT_PROBES', 10))

        # Backup settings
        self.backup_enabled = os.getenv('BACKUP_ENABLED', 'true').lower() == 'true'
        self.backup_interval_hours = int(os.getenv('BACKUP_INTERVAL_HOURS', 6))
        self.backup_retention_days = int(os.getenv('BACKUP_RETENTION_DAYS', 7))
        self.backup_dir = os.getenv('BACKUP_DIR', '/var/backups/postgresql')

        # Monitoring settings
        self.monitoring_enabled = os.getenv('MONITORING_ENABLED', 'true').lower() == 'true'
        self.metrics_port = int(os.getenv('METRICS_PORT', 9090))
        self.health_check_interval = int(os.getenv('HEALTH_CHECK_INTERVAL', 30))

    def get_connection_string(self) -> str:
        """Get PostgreSQL connection string"""
        if self.pgbouncer_enabled:
            return f"postgresql://{self.user}:{self.password}@{self.pgbouncer_host}:{self.pgbouncer_port}/{self.database}"
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

    def get_pool_config(self) -> Dict[str, Any]:
        """Get connection pool configuration"""
        return {
            'host': self.pgbouncer_host if self.pgbouncer_enabled else self.host,
            'port': self.pgbouncer_port if self.pgbouncer_enabled else self.port,
            'database': self.database,
            'user': self.user,
            'password': self.password,
            'min_size': self.min_pool_size,
            'max_size': self.max_pool_size,
            'command_timeout': self.command_timeout
        }

    def get_vector_config(self) -> Dict[str, Any]:
        """Get vector search configuration"""
        return {
            'dimension': self.vector_dimension,
            'lists': self.ivfflat_lists,
            'probes': self.ivfflat_probes
        }

    def get_backup_config(self) -> Dict[str, Any]:
        """Get backup configuration"""
        return {
            'enabled': self.backup_enabled,
            'interval_hours': self.backup_interval_hours,
            'retention_days': self.backup_retention_days,
            'backup_dir': self.backup_dir
        }


# Global config instance
db_config = DatabaseConfig()