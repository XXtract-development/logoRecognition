"""
Database Optimization Testing Suite
US-017: Database Optimization - Comprehensive database tests
"""

import pytest
import asyncio
import time
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta

# Import the modules to test
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from db.indexes import DatabaseIndexManager, create_database_indexes
from db.query_optimizer import QueryOptimizer, optimize_application_queries
from db.connection_pool import EnhancedConnectionPool, initialize_connection_pool
from monitoring.db_metrics import DatabaseMonitor, initialize_db_monitoring


class TestDatabaseIndexManager:
    """Test database index management functionality"""

    @pytest.fixture
    def mock_engine(self):
        engine = Mock()
        engine.begin = AsyncMock()
        return engine

    @pytest.fixture
    def index_manager(self, mock_engine):
        return DatabaseIndexManager(mock_engine)

    @pytest.mark.asyncio
    async def test_create_optimization_indexes(self, index_manager):
        """Test creating optimization indexes"""

        # Mock the index creation methods
        index_manager.create_index = AsyncMock(return_value={
            'name': 'test_index',
            'status': 'created',
            'duration': 100.5
        })

        index_manager.index_exists = AsyncMock(return_value=False)

        results = await index_manager.create_optimization_indexes()

        assert len(results) > 0
        assert all('name' in result for result in results)

    @pytest.mark.asyncio
    async def test_index_exists_check(self, index_manager):
        """Test checking if an index exists"""

        mock_conn = Mock()
        mock_result = Mock()
        mock_result.fetchone.return_value = True
        mock_conn.execute.return_value = mock_result

        index_manager.engine.begin.return_value.__aenter__.return_value = mock_conn

        exists = await index_manager.index_exists('test_index')

        assert exists is True
        mock_conn.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_drop_index(self, index_manager):
        """Test dropping an index"""

        mock_conn = Mock()
        mock_conn.execute = AsyncMock()
        mock_conn.commit = AsyncMock()

        index_manager.engine.begin.return_value.__aenter__.return_value = mock_conn

        result = await index_manager.drop_index('test_index')

        assert result is True
        mock_conn.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_analyze_index_usage(self, index_manager):
        """Test analyzing index usage statistics"""

        mock_conn = Mock()
        mock_result = Mock()
        mock_row = Mock()
        mock_row.schemaname = 'public'
        mock_row.tablename = 'test_table'
        mock_row.indexname = 'test_index'
        mock_row.idx_scan = 1000
        mock_row.idx_tup_read = 5000
        mock_row.idx_tup_fetch = 4500
        mock_row.index_size = '1 MB'

        mock_result.fetchall.return_value = [mock_row]
        mock_conn.execute.return_value = mock_result

        index_manager.engine.begin.return_value.__aenter__.return_value = mock_conn

        stats = await index_manager.analyze_index_usage()

        assert 'total_indexes' in stats
        assert 'indexes' in stats
        assert len(stats['indexes']) == 1
        assert stats['indexes'][0]['usage_category'] == 'high_usage'

    @pytest.mark.asyncio
    async def test_suggest_indexes(self, index_manager):
        """Test index suggestions"""

        # Mock methods that would be called
        index_manager._get_slow_queries = AsyncMock(return_value=[
            {
                'query': 'SELECT * FROM users WHERE email = ?',
                'mean_time': 150,
                'calls': 1000
            }
        ])

        index_manager._check_missing_foreign_key_indexes = AsyncMock(return_value=[
            {
                'table': 'orders',
                'column': 'user_id',
                'suggested_index': 'idx_orders_user_id'
            }
        ])

        index_manager._analyze_frequent_where_columns = AsyncMock(return_value=[
            {
                'table': 'products',
                'column': 'category_id',
                'frequency': 2000
            }
        ])

        suggestions = await index_manager.suggest_indexes()

        assert len(suggestions) >= 2  # At least FK and frequent column suggestions

    def test_generate_index_sql(self, index_manager):
        """Test SQL generation for different index types"""

        # Test basic index
        basic_index = {
            'name': 'idx_test_basic',
            'table': 'test_table',
            'columns': ['column1'],
            'type': 'btree'
        }

        sql = index_manager._generate_index_sql(basic_index)
        assert 'CREATE INDEX CONCURRENTLY idx_test_basic' in sql
        assert 'ON test_table (column1)' in sql

        # Test unique index
        unique_index = {
            'name': 'idx_test_unique',
            'table': 'test_table',
            'columns': ['email'],
            'type': 'unique'
        }

        sql = index_manager._generate_index_sql(unique_index)
        assert 'CREATE UNIQUE INDEX CONCURRENTLY' in sql

        # Test partial index
        partial_index = {
            'name': 'idx_test_partial',
            'table': 'test_table',
            'columns': ['status'],
            'type': 'btree',
            'condition': 'active = true'
        }

        sql = index_manager._generate_index_sql(partial_index)
        assert 'WHERE active = true' in sql

    @pytest.mark.asyncio
    async def test_optimize_existing_indexes(self, index_manager):
        """Test optimizing existing indexes"""

        mock_conn = Mock()
        mock_result = Mock()
        mock_row = Mock()
        mock_row.indexname = 'test_index'
        mock_row.tablename = 'test_table'

        mock_result.fetchall.return_value = [mock_row]
        mock_conn.execute.return_value = mock_result

        index_manager.engine.begin.return_value.__aenter__.return_value = mock_conn

        results = await index_manager.optimize_existing_indexes()

        assert 'reindexed' in results
        assert 'analyzed' in results
        assert 'errors' in results


class TestQueryOptimizer:
    """Test query optimization functionality"""

    @pytest.fixture
    def mock_engine(self):
        return Mock()

    @pytest.fixture
    def query_optimizer(self, mock_engine):
        return QueryOptimizer(mock_engine)

    @pytest.mark.asyncio
    async def test_analyze_query(self, query_optimizer):
        """Test query analysis for optimization opportunities"""

        test_query = "SELECT * FROM users WHERE name LIKE '%john%'"

        analysis = await query_optimizer.analyze_query(test_query)

        assert 'query_hash' in analysis
        assert 'suggestions' in analysis
        assert 'severity' in analysis
        assert len(analysis['suggestions']) > 0

    @pytest.mark.asyncio
    async def test_optimize_query(self, query_optimizer):
        """Test automatic query optimization"""

        test_query = "SELECT * FROM users ORDER BY created_at"

        result = await query_optimizer.optimize_query(test_query)

        assert 'original_query' in result
        assert 'optimized_query' in result
        assert 'applied_optimizations' in result
        assert 'estimated_improvement' in result

    @pytest.mark.asyncio
    async def test_benchmark_query(self, query_optimizer):
        """Test query benchmarking"""

        mock_conn = Mock()
        mock_result = Mock()
        mock_result.fetchall.return_value = [{'id': 1}, {'id': 2}]
        mock_conn.execute.return_value = mock_result

        query_optimizer.engine.begin.return_value.__aenter__.return_value = mock_conn

        test_query = "SELECT * FROM test_table LIMIT 10"

        benchmark = await query_optimizer.benchmark_query(test_query, iterations=3)

        assert 'avg_execution_time' in benchmark
        assert 'min_execution_time' in benchmark
        assert 'max_execution_time' in benchmark
        assert 'total_rows' in benchmark
        assert benchmark['iterations'] == 3

    @pytest.mark.asyncio
    async def test_compare_queries(self, query_optimizer):
        """Test query comparison"""

        query_optimizer.benchmark_query = AsyncMock(side_effect=[
            {
                'avg_execution_time': 150,
                'min_execution_time': 140,
                'max_execution_time': 160,
                'total_rows': 100
            },
            {
                'avg_execution_time': 100,
                'min_execution_time': 95,
                'max_execution_time': 105,
                'total_rows': 100
            }
        ])

        query1 = "SELECT * FROM users"
        query2 = "SELECT id, name FROM users"

        comparison = await query_optimizer.compare_queries(query1, query2)

        assert 'query1' in comparison
        assert 'query2' in comparison
        assert 'performance_improvement' in comparison
        assert comparison['performance_improvement'] > 0  # query2 should be better

    def test_query_optimization_rules(self, query_optimizer):
        """Test optimization rule application"""

        # Test SELECT * optimization
        result = query_optimizer._optimize_select_star("SELECT * FROM users")
        assert result['modified'] is True
        assert 'SELECT id, name, created_at' in result['query']

        # Test LIMIT addition
        result = query_optimizer._optimize_limit_usage("SELECT * FROM users ORDER BY created_at")
        assert result['modified'] is True
        assert 'LIMIT 100' in result['query']

    def test_query_classification(self, query_optimizer):
        """Test query pattern classification"""

        # Test WHERE column extraction
        where_columns = query_optimizer._extract_where_columns(
            "SELECT * FROM users WHERE email = 'test@example.com' AND status = 'active'"
        )

        assert 'users' in where_columns
        assert 'email' in where_columns['users']
        assert 'status' in where_columns['users']

        # Test JOIN column extraction
        join_columns = query_optimizer._extract_join_columns(
            "SELECT u.*, p.title FROM users u JOIN posts p ON u.id = p.user_id"
        )

        assert len(join_columns) == 2
        assert any(col['table'] == 'users' and col['column'] == 'id' for col in join_columns)
        assert any(col['table'] == 'posts' and col['column'] == 'user_id' for col in join_columns)

    @pytest.mark.asyncio
    async def test_slow_query_tracking(self, query_optimizer):
        """Test slow query detection and tracking"""

        # Record a slow query
        await query_optimizer.record_query_metrics("SELECT * FROM large_table", 2000, 1000)

        slow_queries = await query_optimizer.get_slow_queries()

        assert len(slow_queries) > 0
        assert slow_queries[0]['avg_time'] >= query_optimizer.slow_query_threshold

    def test_query_statistics(self, query_optimizer):
        """Test query statistics calculation"""

        # Add some mock metrics
        query_optimizer.metrics_history = [
            Mock(execution_time=100, timestamp=datetime.now()),
            Mock(execution_time=200, timestamp=datetime.now()),
            Mock(execution_time=1500, timestamp=datetime.now()),  # slow query
        ]

        stats = query_optimizer.get_query_statistics()

        assert stats['total_queries'] == 3
        assert stats['slow_queries'] == 1
        assert stats['slow_query_percentage'] > 0


class TestEnhancedConnectionPool:
    """Test database connection pool functionality"""

    @pytest.fixture
    def connection_pool(self):
        return EnhancedConnectionPool(
            "postgresql+asyncpg://test:test@localhost/test",
            pool_size=5,
            max_overflow=10,
            monitoring_enabled=False  # Disable monitoring for tests
        )

    @pytest.mark.asyncio
    async def test_pool_initialization(self, connection_pool):
        """Test connection pool initialization"""

        with patch('sqlalchemy.ext.asyncio.create_async_engine') as mock_engine:
            with patch('asyncpg.create_pool') as mock_pool:
                mock_engine.return_value = Mock()
                mock_pool.return_value = Mock()

                await connection_pool.initialize()

                assert connection_pool.engine is not None
                assert connection_pool.native_pool is not None
                assert connection_pool.metrics.max_connections == 15  # pool_size + max_overflow

    @pytest.mark.asyncio
    async def test_get_connection_context_manager(self, connection_pool):
        """Test connection context manager"""

        mock_engine = Mock()
        mock_conn = Mock()
        mock_engine.begin.return_value.__aenter__.return_value = mock_conn
        connection_pool.engine = mock_engine

        async with connection_pool.get_connection() as conn:
            assert conn == mock_conn

        assert connection_pool.metrics.connection_attempts == 1

    @pytest.mark.asyncio
    async def test_connection_error_handling(self, connection_pool):
        """Test connection error handling"""

        mock_engine = Mock()
        mock_engine.begin.side_effect = Exception("Connection failed")
        connection_pool.engine = mock_engine

        with pytest.raises(Exception, match="Connection failed"):
            async with connection_pool.get_connection():
                pass

        assert connection_pool.metrics.failed_connections == 1

    @pytest.mark.asyncio
    async def test_pool_health_monitoring(self, connection_pool):
        """Test pool health monitoring"""

        # Mock pool states
        connection_pool.engine = Mock()
        connection_pool.engine.pool = Mock()
        connection_pool.engine.pool.size.return_value = 5
        connection_pool.engine.pool.checkedout.return_value = 2
        connection_pool.engine.pool.checkedin.return_value = 3

        connection_pool.native_pool = Mock()
        connection_pool.native_pool._holders = [Mock(), Mock()]

        await connection_pool._update_pool_metrics()

        assert connection_pool.metrics.total_connections == 7  # 5 + 2 from native pool
        assert connection_pool.metrics.active_connections == 2

    @pytest.mark.asyncio
    async def test_pool_optimization(self, connection_pool):
        """Test pool size optimization"""

        # Simulate high usage
        connection_pool.metrics.active_connections = 14
        connection_pool.metrics.peak_usage = 15
        connection_pool.metrics.max_connections = 15

        await connection_pool._optimize_pool_size()

        # Should suggest pool size increase

    @pytest.mark.asyncio
    async def test_connection_cleanup(self, connection_pool):
        """Test connection cleanup"""

        # Add old connection info
        old_time = datetime.now() - timedelta(hours=2)
        connection_pool.connection_info['old_conn'] = Mock(
            last_used=old_time,
            is_active=False
        )

        await connection_pool._cleanup_old_connections()

        assert 'old_conn' not in connection_pool.connection_info

    @pytest.mark.asyncio
    async def test_pool_maintenance(self, connection_pool):
        """Test pool maintenance operations"""

        connection_pool._test_connections = AsyncMock(return_value=True)
        connection_pool._cleanup_old_connections = AsyncMock()

        results = await connection_pool.execute_maintenance()

        assert 'operations' in results
        assert any(op['operation'] == 'connection_test' for op in results['operations'])

    def test_connection_statistics(self, connection_pool):
        """Test connection statistics calculation"""

        # Add mock connection info
        connection_pool.connection_info = {
            'conn1': Mock(query_count=10, total_time=1000, is_active=True),
            'conn2': Mock(query_count=5, total_time=500, is_active=False),
        }

        stats = connection_pool.get_connection_statistics()

        assert 'pool_metrics' in stats
        assert 'connection_count' in stats
        assert stats['connection_count']['total_tracked'] == 2
        assert stats['connection_count']['total_queries_executed'] == 15


class TestDatabaseMonitor:
    """Test database monitoring functionality"""

    @pytest.fixture
    def mock_engine(self):
        return Mock()

    @pytest.fixture
    def db_monitor(self, mock_engine):
        monitor = DatabaseMonitor(mock_engine)
        monitor.monitoring_enabled = False  # Disable automatic monitoring for tests
        return monitor

    @pytest.mark.asyncio
    async def test_collect_connection_metrics(self, db_monitor):
        """Test connection metrics collection"""

        mock_conn = Mock()
        mock_result = Mock()
        mock_row = Mock()
        mock_row.total_connections = 10
        mock_row.active_connections = 3
        mock_row.idle_connections = 7

        mock_result.fetchone.return_value = mock_row
        mock_conn.execute.return_value = mock_result

        db_monitor.engine.begin.return_value.__aenter__.return_value = mock_conn

        metrics = await db_monitor.collect_metrics()

        assert metrics.total_connections == 10
        assert metrics.active_connections == 3
        assert metrics.idle_connections == 7

    @pytest.mark.asyncio
    async def test_collect_query_metrics(self, db_monitor):
        """Test query metrics collection"""

        mock_conn = Mock()
        mock_check_result = Mock()
        mock_check_result.fetchone.return_value = True

        mock_query_result = Mock()
        mock_row1 = Mock()
        mock_row1.calls = 1000
        mock_row1.total_exec_time = 5000
        mock_row1.mean_exec_time = 5
        mock_row1.rows = 100

        mock_row2 = Mock()
        mock_row2.calls = 100
        mock_row2.total_exec_time = 200000  # Slow query
        mock_row2.mean_exec_time = 2000
        mock_row2.rows = 50

        mock_query_result.fetchall.return_value = [mock_row1, mock_row2]

        # Mock the two execute calls
        mock_conn.execute.side_effect = [mock_check_result, mock_query_result]

        db_monitor.engine.begin.return_value.__aenter__.return_value = mock_conn

        metrics = await db_monitor.collect_metrics()

        assert metrics.slow_queries == 1  # One query above threshold

    @pytest.mark.asyncio
    async def test_alert_checking(self, db_monitor):
        """Test alert threshold checking"""

        # Mock a metrics object with alert conditions
        metrics = Mock()
        metrics.cache_hit_ratio = 85  # Below threshold
        metrics.slow_queries = 5
        metrics.deadlocks = 1
        metrics.cpu_usage = 90  # Above threshold
        metrics.memory_usage = 95  # Above threshold

        # Mock engine pool for connection usage calculation
        db_monitor.engine.pool = Mock()
        db_monitor.engine.pool.size.return_value = 10
        db_monitor.engine.pool._max_overflow = 10
        metrics.active_connections = 18  # High usage

        db_monitor._process_alert = AsyncMock()

        await db_monitor._check_alerts(metrics)

        # Should have called _process_alert multiple times for different alerts
        assert db_monitor._process_alert.call_count >= 4

    @pytest.mark.asyncio
    async def test_health_report_generation(self, db_monitor):
        """Test health report generation"""

        # Mock current metrics
        mock_metrics = Mock()
        mock_metrics.total_connections = 10
        mock_metrics.active_connections = 3
        mock_metrics.queries_per_second = 100
        mock_metrics.average_query_time = 50
        mock_metrics.cache_hit_ratio = 95
        mock_metrics.cpu_usage = 60
        mock_metrics.memory_usage = 70
        mock_metrics.database_size = 1000000
        mock_metrics.deadlocks = 0
        mock_metrics.conflicts = 0
        mock_metrics.commits = 10000
        mock_metrics.rollbacks = 10

        db_monitor.get_current_metrics = Mock(return_value=mock_metrics)
        db_monitor.get_performance_trends = Mock(return_value={})

        report = await db_monitor.generate_health_report()

        assert 'overall_health' in report
        assert 'health_scores' in report
        assert 'current_metrics' in report
        assert 'recommendations' in report

    def test_metrics_history_management(self, db_monitor):
        """Test metrics history management and cleanup"""

        # Add old metrics
        old_time = datetime.now() - timedelta(days=8)
        recent_time = datetime.now() - timedelta(hours=1)

        old_metric = Mock()
        old_metric.timestamp = old_time

        recent_metric = Mock()
        recent_metric.timestamp = recent_time

        db_monitor.metrics_history = [old_metric, recent_metric]

        asyncio.run(db_monitor._cleanup_old_metrics())

        # Should only keep recent metrics
        assert len(db_monitor.metrics_history) == 1
        assert db_monitor.metrics_history[0] == recent_metric

    def test_alert_callback_registration(self, db_monitor):
        """Test alert callback registration and execution"""

        callback_called = []

        async def test_callback(alert):
            callback_called.append(alert)

        db_monitor.register_alert_callback(test_callback)

        test_alert = {'type': 'test', 'message': 'Test alert'}

        asyncio.run(db_monitor._process_alert(test_alert))

        assert len(callback_called) == 1
        assert callback_called[0] == test_alert

    @pytest.mark.asyncio
    async def test_metrics_export(self, db_monitor):
        """Test metrics data export"""

        # Add some mock metrics
        mock_metric = Mock()
        mock_metric.timestamp = datetime.now()
        mock_metric.total_connections = 5
        mock_metric.active_connections = 2
        mock_metric.queries_per_second = 50
        mock_metric.cache_hit_ratio = 95
        mock_metric.cpu_usage = 60
        mock_metric.database_size = 1000000
        mock_metric.table_sizes = {}
        mock_metric.index_sizes = {}

        db_monitor.metrics_history = [mock_metric]

        exported_data = await db_monitor.export_metrics(hours=1, format='json')

        assert '"total_connections": 5' in exported_data
        assert '"active_connections": 2' in exported_data

    def test_performance_trends_calculation(self, db_monitor):
        """Test performance trends calculation"""

        # Create mock metrics with trends
        metrics = []
        for i in range(10):
            metric = Mock()
            metric.timestamp = datetime.now() - timedelta(hours=i)
            metric.average_query_time = 50 + i * 5  # Increasing trend
            metric.queries_per_second = 100 - i * 2  # Decreasing trend
            metric.cpu_usage = 60 + i
            metrics.append(metric)

        db_monitor.metrics_history = metrics

        trends = db_monitor.get_performance_trends(hours=24)

        assert 'query_performance' in trends
        assert 'resource_usage' in trends
        assert 'database_health' in trends


class TestIntegration:
    """Integration tests for database optimization components"""

    @pytest.mark.asyncio
    async def test_end_to_end_optimization_workflow(self):
        """Test complete optimization workflow"""

        # Mock database engine
        mock_engine = Mock()

        # Test index creation workflow
        index_manager = DatabaseIndexManager(mock_engine)
        index_manager.index_exists = AsyncMock(return_value=False)
        index_manager.create_index = AsyncMock(return_value={
            'name': 'test_index',
            'status': 'created'
        })

        # Test query optimization workflow
        query_optimizer = QueryOptimizer(mock_engine)

        test_query = "SELECT * FROM users WHERE email = 'test@example.com'"
        analysis = await query_optimizer.analyze_query(test_query)

        assert 'suggestions' in analysis
        assert len(analysis['suggestions']) > 0

    @pytest.mark.asyncio
    async def test_monitoring_integration(self):
        """Test monitoring integration with optimization components"""

        mock_engine = Mock()

        # Initialize monitoring
        monitor = DatabaseMonitor(mock_engine)
        monitor.monitoring_enabled = False

        # Test metrics collection
        mock_conn = Mock()
        mock_result = Mock()
        mock_result.fetchone.return_value = Mock(
            total_connections=5,
            active_connections=2,
            idle_connections=3
        )
        mock_conn.execute.return_value = mock_result

        monitor.engine.begin.return_value.__aenter__.return_value = mock_conn

        metrics = await monitor.collect_metrics()

        assert metrics.total_connections == 5
        assert metrics.active_connections == 2

    def test_configuration_management(self):
        """Test configuration management across components"""

        # Test connection pool configuration
        pool_config = {
            'pool_size': 10,
            'max_overflow': 20,
            'pool_timeout': 30,
            'monitoring_enabled': True
        }

        pool = EnhancedConnectionPool("test://", **pool_config)

        assert pool.pool_config['pool_size'] == 10
        assert pool.pool_config['max_overflow'] == 20
        assert pool.monitoring_enabled is True

    @pytest.mark.asyncio
    async def test_error_handling_across_components(self):
        """Test error handling across all optimization components"""

        mock_engine = Mock()
        mock_engine.begin.side_effect = Exception("Database error")

        # Test index manager error handling
        index_manager = DatabaseIndexManager(mock_engine)

        with pytest.raises(Exception):
            await index_manager.index_exists('test_index')

        # Test query optimizer error handling
        query_optimizer = QueryOptimizer(mock_engine)

        with pytest.raises(Exception):
            await query_optimizer.benchmark_query("SELECT 1")

    def test_performance_measurement(self):
        """Test performance measurement across components"""

        # Test query optimizer performance tracking
        optimizer = QueryOptimizer(Mock())

        # Record some metrics
        optimizer.metrics_history = [
            Mock(execution_time=100, timestamp=datetime.now()),
            Mock(execution_time=200, timestamp=datetime.now()),
            Mock(execution_time=1500, timestamp=datetime.now()),
        ]

        stats = optimizer.get_query_statistics()

        assert stats['total_queries'] == 3
        assert stats['average_execution_time'] > 0
        assert stats['slowest_query'] == 1500

if __name__ == '__main__':
    pytest.main([__file__])