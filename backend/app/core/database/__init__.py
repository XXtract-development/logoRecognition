"""Enterprise Database Management Module"""

# Import get_db first for backwards compatibility
from .enterprise_database_manager import get_db

from .enterprise_database_manager import (
    EnterpriseDatabaseManager,
    ConnectionPool,
    QueryOptimizer,
    IndexManager,
    ShardManager,
    ReplicationManager,
    BackupManager,
    QueryPlan,
    QueryMetrics,
    DatabaseMetrics,
    OptimizationRecommendation
)
from .optimization_manager import (
    DatabaseOptimizationManager,
    QueryAnalyzer,
    PerformanceMonitor,
    AutoVacuumManager,
    StatisticsCollector,
    DeadlockResolver
)

__all__ = [
    'EnterpriseDatabaseManager',
    'ConnectionPool',
    'QueryOptimizer',
    'IndexManager',
    'ShardManager',
    'ReplicationManager',
    'BackupManager',
    'QueryPlan',
    'QueryMetrics',
    'DatabaseMetrics',
    'OptimizationRecommendation',
    'DatabaseOptimizationManager',
    'QueryAnalyzer',
    'PerformanceMonitor',
    'AutoVacuumManager',
    'StatisticsCollector',
    'DeadlockResolver'
]