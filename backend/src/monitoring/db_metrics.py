"""
Database Monitoring and Metrics System
US-017: Database Optimization - Database monitoring
"""

import logging
import asyncio
import time
import psutil
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import json
import statistics

logger = logging.getLogger(__name__)

@dataclass
class DatabaseMetrics:
    """Database performance metrics"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Connection metrics
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0

    # Query metrics
    queries_per_second: float = 0.0
    slow_queries: int = 0
    average_query_time: float = 0.0

    # Database size metrics
    database_size: int = 0
    table_sizes: Dict[str, int] = field(default_factory=dict)
    index_sizes: Dict[str, int] = field(default_factory=dict)

    # Performance metrics
    cache_hit_ratio: float = 0.0
    buffer_hit_ratio: float = 0.0
    deadlocks: int = 0
    conflicts: int = 0

    # System metrics
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    disk_io_read: int = 0
    disk_io_write: int = 0

    # Transaction metrics
    commits: int = 0
    rollbacks: int = 0

    # Replication metrics (if applicable)
    replication_lag: Optional[float] = None

class DatabaseMonitor:
    """Comprehensive database monitoring system"""

    def __init__(self, db_engine):
        self.engine = db_engine
        self.metrics_history = []
        self.alert_thresholds = {
            'slow_query_threshold': 1000,  # ms
            'connection_threshold': 80,    # % of max connections
            'cache_hit_threshold': 90,     # %
            'disk_usage_threshold': 85,    # %
            'cpu_threshold': 80,           # %
            'memory_threshold': 85         # %
        }

        self.monitoring_enabled = True
        self.collection_interval = 60  # seconds
        self.retention_days = 7

        self._monitoring_task = None
        self._alert_callbacks = []

    async def start_monitoring(self):
        """Start the monitoring system"""

        if self._monitoring_task is None:
            self._monitoring_task = asyncio.create_task(self._monitoring_loop())
            logger.info("Database monitoring started")

    async def stop_monitoring(self):
        """Stop the monitoring system"""

        if self._monitoring_task:
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass
            self._monitoring_task = None
            logger.info("Database monitoring stopped")

    async def _monitoring_loop(self):
        """Main monitoring loop"""

        while self.monitoring_enabled:
            try:
                metrics = await self.collect_metrics()
                self.metrics_history.append(metrics)

                # Clean old metrics
                await self._cleanup_old_metrics()

                # Check for alerts
                await self._check_alerts(metrics)

                # Log metrics summary
                await self._log_metrics_summary(metrics)

                await asyncio.sleep(self.collection_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")
                await asyncio.sleep(10)  # Short delay on error

    async def collect_metrics(self) -> DatabaseMetrics:
        """Collect comprehensive database metrics"""

        metrics = DatabaseMetrics()

        try:
            # Collect database-specific metrics
            await self._collect_connection_metrics(metrics)
            await self._collect_query_metrics(metrics)
            await self._collect_size_metrics(metrics)
            await self._collect_performance_metrics(metrics)
            await self._collect_transaction_metrics(metrics)

            # Collect system metrics
            self._collect_system_metrics(metrics)

            return metrics

        except Exception as e:
            logger.error(f"Error collecting metrics: {e}")
            return metrics

    async def _collect_connection_metrics(self, metrics: DatabaseMetrics):
        """Collect connection-related metrics"""

        sql = """
        SELECT
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity
        WHERE datname = current_database()
        """

        try:
            async with self.engine.begin() as conn:
                result = await conn.execute(text(sql))
                row = result.fetchone()

                if row:
                    metrics.total_connections = row.total_connections
                    metrics.active_connections = row.active_connections
                    metrics.idle_connections = row.idle_connections

        except Exception as e:
            logger.error(f"Failed to collect connection metrics: {e}")

    async def _collect_query_metrics(self, metrics: DatabaseMetrics):
        """Collect query performance metrics"""

        # Get query statistics from pg_stat_statements if available
        sql = """
        SELECT
            calls,
            total_exec_time,
            mean_exec_time,
            rows
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        ORDER BY mean_exec_time DESC
        LIMIT 100
        """

        try:
            async with self.engine.begin() as conn:
                # Check if pg_stat_statements is available
                check_sql = "SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'"
                result = await conn.execute(text(check_sql))

                if result.fetchone():
                    result = await conn.execute(text(sql))
                    rows = result.fetchall()

                    if rows:
                        total_calls = sum(row.calls for row in rows)
                        total_time = sum(row.total_exec_time for row in rows)

                        # Calculate QPS (approximate)
                        time_window = self.collection_interval
                        metrics.queries_per_second = total_calls / time_window if time_window > 0 else 0

                        # Calculate average query time
                        metrics.average_query_time = total_time / total_calls if total_calls > 0 else 0

                        # Count slow queries
                        slow_threshold = self.alert_thresholds['slow_query_threshold']
                        metrics.slow_queries = sum(1 for row in rows if row.mean_exec_time > slow_threshold)

        except Exception as e:
            logger.warning(f"Failed to collect query metrics: {e}")

    async def _collect_size_metrics(self, metrics: DatabaseMetrics):
        """Collect database and table size metrics"""

        # Database size
        db_size_sql = "SELECT pg_database_size(current_database())"

        # Table sizes
        table_size_sql = """
        SELECT
            schemaname,
            tablename,
            pg_total_relation_size(schemaname||'.'||tablename) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY size DESC
        """

        # Index sizes
        index_size_sql = """
        SELECT
            schemaname,
            indexname,
            pg_relation_size(indexrelid) as size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY size DESC
        """

        try:
            async with self.engine.begin() as conn:
                # Database size
                result = await conn.execute(text(db_size_sql))
                metrics.database_size = result.scalar() or 0

                # Table sizes
                result = await conn.execute(text(table_size_sql))
                for row in result.fetchall():
                    table_name = f"{row.schemaname}.{row.tablename}"
                    metrics.table_sizes[table_name] = row.size

                # Index sizes
                result = await conn.execute(text(index_size_sql))
                for row in result.fetchall():
                    index_name = f"{row.schemaname}.{row.indexname}"
                    metrics.index_sizes[index_name] = row.size

        except Exception as e:
            logger.error(f"Failed to collect size metrics: {e}")

    async def _collect_performance_metrics(self, metrics: DatabaseMetrics):
        """Collect database performance metrics"""

        sql = """
        SELECT
            (SELECT CASE WHEN blks_hit + blks_read = 0 THEN 100
                    ELSE (blks_hit::float / (blks_hit + blks_read)) * 100 END
             FROM pg_stat_database WHERE datname = current_database()) as cache_hit_ratio,

            (SELECT checkpoints_req + checkpoints_timed
             FROM pg_stat_bgwriter) as checkpoints,

            (SELECT deadlocks
             FROM pg_stat_database WHERE datname = current_database()) as deadlocks,

            (SELECT conflicts
             FROM pg_stat_database WHERE datname = current_database()) as conflicts
        """

        try:
            async with self.engine.begin() as conn:
                result = await conn.execute(text(sql))
                row = result.fetchone()

                if row:
                    metrics.cache_hit_ratio = row.cache_hit_ratio or 0
                    metrics.deadlocks = row.deadlocks or 0
                    metrics.conflicts = row.conflicts or 0

        except Exception as e:
            logger.error(f"Failed to collect performance metrics: {e}")

    async def _collect_transaction_metrics(self, metrics: DatabaseMetrics):
        """Collect transaction metrics"""

        sql = """
        SELECT
            xact_commit as commits,
            xact_rollback as rollbacks
        FROM pg_stat_database
        WHERE datname = current_database()
        """

        try:
            async with self.engine.begin() as conn:
                result = await conn.execute(text(sql))
                row = result.fetchone()

                if row:
                    metrics.commits = row.commits or 0
                    metrics.rollbacks = row.rollbacks or 0

        except Exception as e:
            logger.error(f"Failed to collect transaction metrics: {e}")

    def _collect_system_metrics(self, metrics: DatabaseMetrics):
        """Collect system-level metrics"""

        try:
            # CPU usage
            metrics.cpu_usage = psutil.cpu_percent()

            # Memory usage
            memory = psutil.virtual_memory()
            metrics.memory_usage = memory.percent

            # Disk I/O
            disk_io = psutil.disk_io_counters()
            if disk_io:
                metrics.disk_io_read = disk_io.read_bytes
                metrics.disk_io_write = disk_io.write_bytes

        except Exception as e:
            logger.error(f"Failed to collect system metrics: {e}")

    async def _cleanup_old_metrics(self):
        """Remove old metrics based on retention policy"""

        cutoff_time = datetime.now() - timedelta(days=self.retention_days)

        original_count = len(self.metrics_history)
        self.metrics_history = [
            m for m in self.metrics_history
            if m.timestamp > cutoff_time
        ]

        removed_count = original_count - len(self.metrics_history)
        if removed_count > 0:
            logger.debug(f"Cleaned up {removed_count} old metrics records")

    async def _check_alerts(self, metrics: DatabaseMetrics):
        """Check metrics against alert thresholds"""

        alerts = []

        # Connection usage alert
        if hasattr(self.engine.pool, 'size'):
            max_connections = self.engine.pool.size() + getattr(self.engine.pool, '_max_overflow', 0)
            connection_usage = (metrics.active_connections / max_connections) * 100

            if connection_usage > self.alert_thresholds['connection_threshold']:
                alerts.append({
                    'type': 'high_connection_usage',
                    'severity': 'warning',
                    'message': f"Connection usage at {connection_usage:.1f}%",
                    'value': connection_usage,
                    'threshold': self.alert_thresholds['connection_threshold']
                })

        # Cache hit ratio alert
        if metrics.cache_hit_ratio < self.alert_thresholds['cache_hit_threshold']:
            alerts.append({
                'type': 'low_cache_hit_ratio',
                'severity': 'warning',
                'message': f"Cache hit ratio at {metrics.cache_hit_ratio:.1f}%",
                'value': metrics.cache_hit_ratio,
                'threshold': self.alert_thresholds['cache_hit_threshold']
            })

        # Slow queries alert
        if metrics.slow_queries > 0:
            alerts.append({
                'type': 'slow_queries_detected',
                'severity': 'warning',
                'message': f"{metrics.slow_queries} slow queries detected",
                'value': metrics.slow_queries,
                'threshold': 0
            })

        # System resource alerts
        if metrics.cpu_usage > self.alert_thresholds['cpu_threshold']:
            alerts.append({
                'type': 'high_cpu_usage',
                'severity': 'warning',
                'message': f"CPU usage at {metrics.cpu_usage:.1f}%",
                'value': metrics.cpu_usage,
                'threshold': self.alert_thresholds['cpu_threshold']
            })

        if metrics.memory_usage > self.alert_thresholds['memory_threshold']:
            alerts.append({
                'type': 'high_memory_usage',
                'severity': 'warning',
                'message': f"Memory usage at {metrics.memory_usage:.1f}%",
                'value': metrics.memory_usage,
                'threshold': self.alert_thresholds['memory_threshold']
            })

        # Deadlock alert
        if metrics.deadlocks > 0:
            alerts.append({
                'type': 'deadlocks_detected',
                'severity': 'error',
                'message': f"{metrics.deadlocks} deadlocks detected",
                'value': metrics.deadlocks,
                'threshold': 0
            })

        # Process alerts
        for alert in alerts:
            await self._process_alert(alert)

    async def _process_alert(self, alert: Dict):
        """Process and handle alerts"""

        # Log the alert
        severity = alert['severity']
        message = alert['message']

        if severity == 'error':
            logger.error(f"DATABASE ALERT: {message}")
        elif severity == 'warning':
            logger.warning(f"DATABASE ALERT: {message}")
        else:
            logger.info(f"DATABASE ALERT: {message}")

        # Call registered alert callbacks
        for callback in self._alert_callbacks:
            try:
                await callback(alert)
            except Exception as e:
                logger.error(f"Alert callback failed: {e}")

    async def _log_metrics_summary(self, metrics: DatabaseMetrics):
        """Log a summary of current metrics"""

        if logger.isEnabledFor(logging.INFO):
            logger.info(
                f"DB Metrics - Connections: {metrics.active_connections}/{metrics.total_connections}, "
                f"QPS: {metrics.queries_per_second:.1f}, "
                f"Avg Query Time: {metrics.average_query_time:.2f}ms, "
                f"Cache Hit: {metrics.cache_hit_ratio:.1f}%, "
                f"CPU: {metrics.cpu_usage:.1f}%, "
                f"Memory: {metrics.memory_usage:.1f}%"
            )

    def register_alert_callback(self, callback):
        """Register a callback function for alerts"""

        self._alert_callbacks.append(callback)

    def get_current_metrics(self) -> Optional[DatabaseMetrics]:
        """Get the most recent metrics"""

        return self.metrics_history[-1] if self.metrics_history else None

    def get_metrics_history(self, hours: int = 24) -> List[DatabaseMetrics]:
        """Get metrics history for specified hours"""

        cutoff_time = datetime.now() - timedelta(hours=hours)

        return [
            m for m in self.metrics_history
            if m.timestamp > cutoff_time
        ]

    def get_performance_trends(self, hours: int = 24) -> Dict:
        """Get performance trends over time"""

        recent_metrics = self.get_metrics_history(hours)

        if not recent_metrics:
            return {}

        trends = {
            'query_performance': {
                'avg_query_time': [m.average_query_time for m in recent_metrics],
                'queries_per_second': [m.queries_per_second for m in recent_metrics],
                'slow_queries': [m.slow_queries for m in recent_metrics]
            },
            'resource_usage': {
                'cpu_usage': [m.cpu_usage for m in recent_metrics],
                'memory_usage': [m.memory_usage for m in recent_metrics],
                'connection_usage': [m.active_connections for m in recent_metrics]
            },
            'database_health': {
                'cache_hit_ratio': [m.cache_hit_ratio for m in recent_metrics],
                'deadlocks': [m.deadlocks for m in recent_metrics],
                'conflicts': [m.conflicts for m in recent_metrics]
            }
        }

        # Calculate trend statistics
        for category, metrics in trends.items():
            for metric_name, values in metrics.items():
                if values:
                    trends[category][f"{metric_name}_stats"] = {
                        'min': min(values),
                        'max': max(values),
                        'avg': statistics.mean(values),
                        'trend': 'increasing' if len(values) > 1 and values[-1] > values[0] else 'stable'
                    }

        return trends

    async def generate_health_report(self) -> Dict:
        """Generate comprehensive database health report"""

        current_metrics = self.get_current_metrics()
        trends = self.get_performance_trends()

        if not current_metrics:
            return {'error': 'No metrics available'}

        # Calculate health scores
        health_scores = {
            'connection_health': min(100, 100 - (current_metrics.active_connections / 100) * 100),
            'query_performance': min(100, 100 - (current_metrics.average_query_time / 100)),
            'cache_efficiency': current_metrics.cache_hit_ratio,
            'system_resources': min(
                100 - current_metrics.cpu_usage,
                100 - current_metrics.memory_usage
            )
        }

        overall_health = statistics.mean(health_scores.values())

        # Determine health status
        if overall_health >= 90:
            health_status = 'excellent'
        elif overall_health >= 75:
            health_status = 'good'
        elif overall_health >= 60:
            health_status = 'fair'
        else:
            health_status = 'poor'

        return {
            'timestamp': datetime.now().isoformat(),
            'overall_health': {
                'status': health_status,
                'score': overall_health
            },
            'health_scores': health_scores,
            'current_metrics': {
                'connections': {
                    'total': current_metrics.total_connections,
                    'active': current_metrics.active_connections,
                    'idle': current_metrics.idle_connections
                },
                'performance': {
                    'queries_per_second': current_metrics.queries_per_second,
                    'average_query_time': current_metrics.average_query_time,
                    'slow_queries': current_metrics.slow_queries,
                    'cache_hit_ratio': current_metrics.cache_hit_ratio
                },
                'resources': {
                    'cpu_usage': current_metrics.cpu_usage,
                    'memory_usage': current_metrics.memory_usage,
                    'database_size': current_metrics.database_size
                },
                'reliability': {
                    'deadlocks': current_metrics.deadlocks,
                    'conflicts': current_metrics.conflicts,
                    'commits': current_metrics.commits,
                    'rollbacks': current_metrics.rollbacks
                }
            },
            'trends': trends,
            'recommendations': self._generate_recommendations(current_metrics, trends)
        }

    def _generate_recommendations(self, metrics: DatabaseMetrics, trends: Dict) -> List[Dict]:
        """Generate optimization recommendations based on metrics"""

        recommendations = []

        # Query performance recommendations
        if metrics.average_query_time > 100:  # 100ms
            recommendations.append({
                'category': 'query_performance',
                'priority': 'high',
                'title': 'Optimize slow queries',
                'description': f'Average query time is {metrics.average_query_time:.2f}ms. Consider adding indexes or optimizing queries.',
                'action': 'Review slow query log and add appropriate indexes'
            })

        # Cache recommendations
        if metrics.cache_hit_ratio < 95:
            recommendations.append({
                'category': 'cache_performance',
                'priority': 'medium',
                'title': 'Improve cache hit ratio',
                'description': f'Cache hit ratio is {metrics.cache_hit_ratio:.1f}%. Consider increasing shared_buffers.',
                'action': 'Increase PostgreSQL shared_buffers setting'
            })

        # Connection recommendations
        if metrics.active_connections > 50:  # Arbitrary threshold
            recommendations.append({
                'category': 'connection_management',
                'priority': 'medium',
                'title': 'High connection usage',
                'description': f'{metrics.active_connections} active connections. Consider connection pooling.',
                'action': 'Implement or tune connection pooling'
            })

        # Resource recommendations
        if metrics.cpu_usage > 80:
            recommendations.append({
                'category': 'system_resources',
                'priority': 'high',
                'title': 'High CPU usage',
                'description': f'CPU usage is {metrics.cpu_usage:.1f}%. Consider scaling or optimization.',
                'action': 'Scale database server or optimize resource-intensive queries'
            })

        return recommendations

    async def export_metrics(self, hours: int = 24, format: str = 'json') -> str:
        """Export metrics data in specified format"""

        metrics_data = []
        recent_metrics = self.get_metrics_history(hours)

        for metric in recent_metrics:
            metric_dict = {
                'timestamp': metric.timestamp.isoformat(),
                'connections': {
                    'total': metric.total_connections,
                    'active': metric.active_connections,
                    'idle': metric.idle_connections
                },
                'queries': {
                    'per_second': metric.queries_per_second,
                    'average_time': metric.average_query_time,
                    'slow_queries': metric.slow_queries
                },
                'performance': {
                    'cache_hit_ratio': metric.cache_hit_ratio,
                    'deadlocks': metric.deadlocks,
                    'conflicts': metric.conflicts
                },
                'system': {
                    'cpu_usage': metric.cpu_usage,
                    'memory_usage': metric.memory_usage
                },
                'size': {
                    'database_size': metric.database_size,
                    'table_count': len(metric.table_sizes),
                    'index_count': len(metric.index_sizes)
                }
            }
            metrics_data.append(metric_dict)

        if format.lower() == 'json':
            return json.dumps(metrics_data, indent=2)
        else:
            # Could add CSV, XML formats here
            return json.dumps(metrics_data, indent=2)


# Global monitor instance
_db_monitor: Optional[DatabaseMonitor] = None

async def initialize_db_monitoring(db_engine, **kwargs) -> DatabaseMonitor:
    """Initialize the global database monitor"""

    global _db_monitor

    if _db_monitor:
        await _db_monitor.stop_monitoring()

    _db_monitor = DatabaseMonitor(db_engine)

    # Configure thresholds if provided
    if 'alert_thresholds' in kwargs:
        _db_monitor.alert_thresholds.update(kwargs['alert_thresholds'])

    await _db_monitor.start_monitoring()

    return _db_monitor

def get_db_monitor() -> Optional[DatabaseMonitor]:
    """Get the global database monitor instance"""

    return _db_monitor

async def stop_db_monitoring():
    """Stop the global database monitor"""

    global _db_monitor

    if _db_monitor:
        await _db_monitor.stop_monitoring()
        _db_monitor = None


if __name__ == "__main__":
    # Example usage
    async def example_usage():
        from sqlalchemy.ext.asyncio import create_async_engine

        engine = create_async_engine("postgresql+asyncpg://user:pass@localhost/db")

        # Initialize monitoring
        monitor = await initialize_db_monitoring(engine)

        # Wait for some metrics collection
        await asyncio.sleep(120)

        # Generate health report
        health_report = await monitor.generate_health_report()
        print(f"Database health: {health_report['overall_health']['status']}")

        # Stop monitoring
        await stop_db_monitoring()

    # asyncio.run(example_usage())