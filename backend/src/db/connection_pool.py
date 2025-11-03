"""
Database Connection Pooling System
US-017: Database Optimization - Database connection pooling
"""

import logging
import asyncio
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
import asyncpg
import psutil
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine
from sqlalchemy.pool import QueuePool, NullPool
import threading

logger = logging.getLogger(__name__)

@dataclass
class ConnectionMetrics:
    """Connection pool metrics"""
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0
    waiting_connections: int = 0
    max_connections: int = 0
    connection_attempts: int = 0
    failed_connections: int = 0
    average_wait_time: float = 0.0
    peak_usage: int = 0
    timestamp: datetime = field(default_factory=datetime.now)

@dataclass
class ConnectionInfo:
    """Individual connection information"""
    connection_id: str
    created_at: datetime
    last_used: datetime
    is_active: bool
    query_count: int = 0
    total_time: float = 0.0
    error_count: int = 0

class EnhancedConnectionPool:
    """Enhanced database connection pool with monitoring and optimization"""

    def __init__(self, database_url: str, **kwargs):
        self.database_url = database_url
        self.pool_config = {
            'pool_size': kwargs.get('pool_size', 20),
            'max_overflow': kwargs.get('max_overflow', 30),
            'pool_timeout': kwargs.get('pool_timeout', 30),
            'pool_recycle': kwargs.get('pool_recycle', 3600),  # 1 hour
            'pool_pre_ping': kwargs.get('pool_pre_ping', True),
            'connect_args': kwargs.get('connect_args', {})
        }

        self.engine: Optional[AsyncEngine] = None
        self.native_pool: Optional[asyncpg.Pool] = None
        self.metrics = ConnectionMetrics()
        self.connection_history = []
        self.connection_info = {}
        self.monitoring_enabled = kwargs.get('monitoring_enabled', True)
        self.health_check_interval = kwargs.get('health_check_interval', 60)
        self.optimization_enabled = kwargs.get('optimization_enabled', True)

        self._lock = threading.Lock()
        self._monitoring_task = None
        self._optimization_task = None

    async def initialize(self):
        """Initialize the connection pool"""

        try:
            # Create SQLAlchemy engine with custom pool
            self.engine = create_async_engine(
                self.database_url,
                poolclass=QueuePool,
                **self.pool_config,
                echo=False,  # Set to True for SQL debugging
            )

            # Create native asyncpg pool for direct access
            self.native_pool = await asyncpg.create_pool(
                self.database_url,
                min_size=self.pool_config['pool_size'] // 2,
                max_size=self.pool_config['pool_size'],
                command_timeout=60,
                server_settings={
                    'jit': 'off',  # Disable JIT for better connection performance
                    'application_name': 'LogoRecognitionApp'
                }
            )

            # Initialize metrics
            self.metrics.max_connections = self.pool_config['pool_size'] + self.pool_config['max_overflow']

            # Start monitoring tasks
            if self.monitoring_enabled:
                self._monitoring_task = asyncio.create_task(self._monitoring_loop())

            if self.optimization_enabled:
                self._optimization_task = asyncio.create_task(self._optimization_loop())

            logger.info(f"Connection pool initialized with {self.pool_config['pool_size']} base connections")

        except Exception as e:
            logger.error(f"Failed to initialize connection pool: {e}")
            raise

    async def close(self):
        """Close the connection pool and cleanup"""

        try:
            # Cancel monitoring tasks
            if self._monitoring_task:
                self._monitoring_task.cancel()
                try:
                    await self._monitoring_task
                except asyncio.CancelledError:
                    pass

            if self._optimization_task:
                self._optimization_task.cancel()
                try:
                    await self._optimization_task
                except asyncio.CancelledError:
                    pass

            # Close pools
            if self.native_pool:
                await self.native_pool.close()

            if self.engine:
                await self.engine.dispose()

            logger.info("Connection pool closed successfully")

        except Exception as e:
            logger.error(f"Error closing connection pool: {e}")

    @asynccontextmanager
    async def get_connection(self):
        """Get a connection from the pool with monitoring"""

        start_time = time.time()
        connection = None

        try:
            self.metrics.connection_attempts += 1

            # Get connection from SQLAlchemy engine
            async with self.engine.begin() as conn:
                connection_id = id(conn)

                # Track connection usage
                self._track_connection_usage(connection_id, start_time)

                yield conn

                # Update connection metrics
                end_time = time.time()
                self._update_connection_metrics(connection_id, end_time - start_time)

        except Exception as e:
            self.metrics.failed_connections += 1
            logger.error(f"Connection error: {e}")
            raise

        finally:
            # Update wait time metrics
            wait_time = time.time() - start_time
            self._update_wait_time_metrics(wait_time)

    @asynccontextmanager
    async def get_native_connection(self):
        """Get a native asyncpg connection for high-performance operations"""

        start_time = time.time()

        try:
            self.metrics.connection_attempts += 1

            async with self.native_pool.acquire() as conn:
                connection_id = id(conn)

                # Track connection usage
                self._track_connection_usage(connection_id, start_time)

                yield conn

                # Update connection metrics
                end_time = time.time()
                self._update_connection_metrics(connection_id, end_time - start_time)

        except Exception as e:
            self.metrics.failed_connections += 1
            logger.error(f"Native connection error: {e}")
            raise

        finally:
            # Update wait time metrics
            wait_time = time.time() - start_time
            self._update_wait_time_metrics(wait_time)

    def _track_connection_usage(self, connection_id: str, start_time: float):
        """Track connection usage for monitoring"""

        with self._lock:
            if connection_id not in self.connection_info:
                self.connection_info[connection_id] = ConnectionInfo(
                    connection_id=str(connection_id),
                    created_at=datetime.now(),
                    last_used=datetime.now(),
                    is_active=True
                )

            conn_info = self.connection_info[connection_id]
            conn_info.last_used = datetime.now()
            conn_info.is_active = True
            conn_info.query_count += 1

    def _update_connection_metrics(self, connection_id: str, execution_time: float):
        """Update connection execution metrics"""

        with self._lock:
            if connection_id in self.connection_info:
                conn_info = self.connection_info[connection_id]
                conn_info.total_time += execution_time
                conn_info.is_active = False

    def _update_wait_time_metrics(self, wait_time: float):
        """Update wait time metrics"""

        with self._lock:
            # Update average wait time
            total_attempts = self.metrics.connection_attempts
            if total_attempts > 1:
                self.metrics.average_wait_time = (
                    (self.metrics.average_wait_time * (total_attempts - 1) + wait_time) /
                    total_attempts
                )
            else:
                self.metrics.average_wait_time = wait_time

    async def _monitoring_loop(self):
        """Continuous monitoring of connection pool health"""

        while True:
            try:
                await self._update_pool_metrics()
                await self._log_pool_status()
                await self._cleanup_old_connections()

                await asyncio.sleep(self.health_check_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitoring loop error: {e}")
                await asyncio.sleep(5)  # Short delay on error

    async def _optimization_loop(self):
        """Continuous optimization of connection pool"""

        while True:
            try:
                await self._optimize_pool_size()
                await self._analyze_connection_patterns()
                await self._suggest_optimizations()

                await asyncio.sleep(300)  # Run every 5 minutes

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Optimization loop error: {e}")
                await asyncio.sleep(30)  # Longer delay on error

    async def _update_pool_metrics(self):
        """Update current pool metrics"""

        try:
            # Get SQLAlchemy pool status
            if self.engine and hasattr(self.engine.pool, 'size'):
                pool = self.engine.pool
                self.metrics.total_connections = pool.size()
                self.metrics.active_connections = pool.checkedout()
                self.metrics.idle_connections = pool.checkedin()

            # Get native pool status
            if self.native_pool:
                self.metrics.total_connections += len(self.native_pool._holders)

            # Update peak usage
            current_active = self.metrics.active_connections
            if current_active > self.metrics.peak_usage:
                self.metrics.peak_usage = current_active

            self.metrics.timestamp = datetime.now()

        except Exception as e:
            logger.error(f"Failed to update pool metrics: {e}")

    async def _log_pool_status(self):
        """Log current pool status"""

        if logger.isEnabledFor(logging.INFO):
            logger.info(
                f"Pool Status - Total: {self.metrics.total_connections}, "
                f"Active: {self.metrics.active_connections}, "
                f"Idle: {self.metrics.idle_connections}, "
                f"Peak: {self.metrics.peak_usage}, "
                f"Avg Wait: {self.metrics.average_wait_time:.3f}s"
            )

    async def _cleanup_old_connections(self):
        """Cleanup old connection tracking data"""

        cutoff_time = datetime.now() - timedelta(hours=1)

        with self._lock:
            expired_connections = [
                conn_id for conn_id, info in self.connection_info.items()
                if info.last_used < cutoff_time and not info.is_active
            ]

            for conn_id in expired_connections:
                del self.connection_info[conn_id]

            if expired_connections:
                logger.debug(f"Cleaned up {len(expired_connections)} old connection records")

    async def _optimize_pool_size(self):
        """Dynamically optimize pool size based on usage patterns"""

        if not self.optimization_enabled:
            return

        try:
            # Analyze recent usage patterns
            usage_ratio = self.metrics.active_connections / self.metrics.max_connections
            peak_ratio = self.metrics.peak_usage / self.metrics.max_connections

            recommendations = []

            # Pool too small if consistently high usage
            if usage_ratio > 0.8 and peak_ratio > 0.9:
                recommendations.append({
                    'type': 'increase_pool_size',
                    'current_size': self.pool_config['pool_size'],
                    'suggested_size': min(self.pool_config['pool_size'] + 5, 50),
                    'reason': 'High connection usage detected'
                })

            # Pool too large if consistently low usage
            elif usage_ratio < 0.3 and peak_ratio < 0.5:
                recommendations.append({
                    'type': 'decrease_pool_size',
                    'current_size': self.pool_config['pool_size'],
                    'suggested_size': max(self.pool_config['pool_size'] - 5, 10),
                    'reason': 'Low connection usage detected'
                })

            # Log recommendations
            for rec in recommendations:
                logger.info(f"Pool optimization suggestion: {rec}")

        except Exception as e:
            logger.error(f"Pool optimization error: {e}")

    async def _analyze_connection_patterns(self):
        """Analyze connection usage patterns for optimization"""

        try:
            # Analyze connection lifetimes
            active_connections = [
                info for info in self.connection_info.values()
                if info.is_active
            ]

            if active_connections:
                avg_queries_per_conn = sum(info.query_count for info in active_connections) / len(active_connections)
                avg_time_per_conn = sum(info.total_time for info in active_connections) / len(active_connections)

                logger.debug(
                    f"Connection patterns - Avg queries/conn: {avg_queries_per_conn:.1f}, "
                    f"Avg time/conn: {avg_time_per_conn:.3f}s"
                )

        except Exception as e:
            logger.error(f"Connection pattern analysis error: {e}")

    async def _suggest_optimizations(self):
        """Suggest pool configuration optimizations"""

        suggestions = []

        # Check for high wait times
        if self.metrics.average_wait_time > 1.0:  # 1 second
            suggestions.append({
                'type': 'reduce_wait_time',
                'current_wait': self.metrics.average_wait_time,
                'suggestion': 'Consider increasing pool_size or max_overflow',
                'priority': 'high'
            })

        # Check for high failure rate
        if self.metrics.connection_attempts > 0:
            failure_rate = self.metrics.failed_connections / self.metrics.connection_attempts
            if failure_rate > 0.05:  # 5% failure rate
                suggestions.append({
                    'type': 'high_failure_rate',
                    'failure_rate': failure_rate * 100,
                    'suggestion': 'Investigate connection failures and database health',
                    'priority': 'critical'
                })

        # Log suggestions
        for suggestion in suggestions:
            level = logging.WARNING if suggestion['priority'] in ['high', 'critical'] else logging.INFO
            logger.log(level, f"Pool optimization suggestion: {suggestion}")

    async def get_pool_health(self) -> Dict:
        """Get comprehensive pool health status"""

        await self._update_pool_metrics()

        health_status = {
            'overall_health': 'healthy',
            'metrics': {
                'total_connections': self.metrics.total_connections,
                'active_connections': self.metrics.active_connections,
                'idle_connections': self.metrics.idle_connections,
                'max_connections': self.metrics.max_connections,
                'usage_percentage': (self.metrics.active_connections / self.metrics.max_connections) * 100,
                'peak_usage': self.metrics.peak_usage,
                'average_wait_time': self.metrics.average_wait_time,
                'connection_attempts': self.metrics.connection_attempts,
                'failed_connections': self.metrics.failed_connections,
                'success_rate': (
                    (self.metrics.connection_attempts - self.metrics.failed_connections) /
                    max(self.metrics.connection_attempts, 1) * 100
                )
            },
            'configuration': self.pool_config,
            'active_connections_info': [
                {
                    'id': info.connection_id,
                    'created_at': info.created_at.isoformat(),
                    'last_used': info.last_used.isoformat(),
                    'query_count': info.query_count,
                    'total_time': info.total_time,
                    'avg_query_time': info.total_time / max(info.query_count, 1)
                }
                for info in self.connection_info.values()
                if info.is_active
            ]
        }

        # Determine overall health
        metrics = health_status['metrics']
        if metrics['success_rate'] < 95:
            health_status['overall_health'] = 'unhealthy'
        elif metrics['usage_percentage'] > 90 or metrics['average_wait_time'] > 2.0:
            health_status['overall_health'] = 'degraded'

        return health_status

    async def execute_maintenance(self) -> Dict:
        """Execute pool maintenance operations"""

        maintenance_results = {
            'timestamp': datetime.now().isoformat(),
            'operations': []
        }

        try:
            # Test connection health
            test_result = await self._test_connections()
            maintenance_results['operations'].append({
                'operation': 'connection_test',
                'status': 'success' if test_result else 'failed',
                'details': 'Tested connection health'
            })

            # Cleanup expired connections
            await self._cleanup_old_connections()
            maintenance_results['operations'].append({
                'operation': 'cleanup_connections',
                'status': 'success',
                'details': 'Cleaned up expired connection records'
            })

            # Reset metrics if they're getting too large
            if len(self.connection_history) > 10000:
                self.connection_history = self.connection_history[-1000:]
                maintenance_results['operations'].append({
                    'operation': 'reset_metrics',
                    'status': 'success',
                    'details': 'Reset connection history metrics'
                })

        except Exception as e:
            maintenance_results['operations'].append({
                'operation': 'maintenance_error',
                'status': 'failed',
                'details': str(e)
            })

        return maintenance_results

    async def _test_connections(self) -> bool:
        """Test connection health"""

        try:
            async with self.get_connection() as conn:
                result = await conn.execute("SELECT 1")
                return result.scalar() == 1

        except Exception as e:
            logger.error(f"Connection health test failed: {e}")
            return False

    def get_connection_statistics(self) -> Dict:
        """Get detailed connection statistics"""

        with self._lock:
            active_connections = [info for info in self.connection_info.values() if info.is_active]
            total_queries = sum(info.query_count for info in self.connection_info.values())
            total_time = sum(info.total_time for info in self.connection_info.values())

        return {
            'pool_metrics': self.metrics.__dict__,
            'connection_count': {
                'total_tracked': len(self.connection_info),
                'currently_active': len(active_connections),
                'total_queries_executed': total_queries,
                'total_execution_time': total_time,
                'average_query_time': total_time / max(total_queries, 1)
            },
            'pool_configuration': self.pool_config
        }


# Global pool instance
_connection_pool: Optional[EnhancedConnectionPool] = None

async def initialize_connection_pool(database_url: str, **kwargs) -> EnhancedConnectionPool:
    """Initialize the global connection pool"""

    global _connection_pool

    if _connection_pool:
        await _connection_pool.close()

    _connection_pool = EnhancedConnectionPool(database_url, **kwargs)
    await _connection_pool.initialize()

    return _connection_pool

def get_connection_pool() -> Optional[EnhancedConnectionPool]:
    """Get the global connection pool instance"""

    return _connection_pool

async def close_connection_pool():
    """Close the global connection pool"""

    global _connection_pool

    if _connection_pool:
        await _connection_pool.close()
        _connection_pool = None


# Context managers for easy usage
@asynccontextmanager
async def get_db_connection():
    """Context manager for getting database connections"""

    pool = get_connection_pool()
    if not pool:
        raise RuntimeError("Connection pool not initialized")

    async with pool.get_connection() as conn:
        yield conn

@asynccontextmanager
async def get_native_db_connection():
    """Context manager for getting native asyncpg connections"""

    pool = get_connection_pool()
    if not pool:
        raise RuntimeError("Connection pool not initialized")

    async with pool.get_native_connection() as conn:
        yield conn


if __name__ == "__main__":
    # Example usage
    async def example_usage():
        # Initialize pool
        pool = await initialize_connection_pool(
            "postgresql+asyncpg://user:pass@localhost/db",
            pool_size=20,
            max_overflow=30,
            monitoring_enabled=True
        )

        # Use connection
        async with get_db_connection() as conn:
            result = await conn.execute("SELECT 1")
            print(result.scalar())

        # Get health status
        health = await pool.get_pool_health()
        print(f"Pool health: {health['overall_health']}")

        # Close pool
        await close_connection_pool()

    # asyncio.run(example_usage())