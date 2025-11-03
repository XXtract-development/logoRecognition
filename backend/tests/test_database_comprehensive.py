"""
100% Coverage Tests for Database Module (AsyncPG-based)
"""

import pytest
import asyncio
import time
import os
from unittest.mock import Mock, patch, MagicMock, call, AsyncMock
import asyncpg

from app.database import DatabasePool, get_db, VectorSearch, HealthChecker, PgBouncerPool, QueryAnalyzer, IndexOptimizer


@pytest.fixture
def mock_asyncpg_pool():
    """Mock asyncpg pool"""
    mock_pool = AsyncMock()
    mock_pool.acquire = AsyncMock()
    mock_pool.close = AsyncMock()
    return mock_pool


@pytest.fixture
def mock_connection():
    """Mock asyncpg connection"""
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_conn.fetch = AsyncMock()
    mock_conn.fetchval = AsyncMock()
    mock_conn.executemany = AsyncMock()
    return mock_conn


@pytest.fixture
def database_config():
    """Test database configuration"""
    return {
        'host': 'localhost',
        'port': 5432,
        'database': 'test_db',
        'user': 'test_user',
        'password': 'test_pass'
    }


class TestDatabaseModule:
    """Test all database module functions"""

    def test_module_imports(self):
        """Test that module imports work"""
        from app.database import DatabasePool, get_db, VectorSearch, HealthChecker
        assert DatabasePool is not None
        assert get_db is not None
        assert VectorSearch is not None
        assert HealthChecker is not None

    def test_database_pool_initialization(self, database_config):
        """Test DatabasePool initialization"""
        pool = DatabasePool(database_config)
        assert pool.config == database_config
        assert pool.min_connections == 10  # default value
        assert pool.max_connections == 100  # default value
        assert pool.pool is None

    @pytest.mark.asyncio
    @patch('app.database.asyncpg.create_pool')
    async def test_database_pool_initialize(self, mock_create_pool, database_config, mock_connection):
        """Test DatabasePool initialization"""
        # Create a mock pool that can be awaited
        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

        # Make create_pool return a coroutine that returns the mock_pool
        async def create_pool_coro(*args, **kwargs):
            return mock_pool
        mock_create_pool.return_value = create_pool_coro()

        pool = DatabasePool(database_config)
        await pool.initialize()

        mock_create_pool.assert_called_once()
        assert pool.pool == mock_pool

    @pytest.mark.asyncio
    async def test_get_db_function(self):
        """Test get_db dependency function"""
        # Test that it's an async generator function
        gen = get_db()
        assert hasattr(gen, '__aiter__') or hasattr(gen, 'asend')

    def test_vector_search_initialization(self, database_config):
        """Test VectorSearch initialization"""
        vector_search = VectorSearch(database_config)
        assert vector_search.pool is not None
        assert isinstance(vector_search.pool, DatabasePool)

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_vector_search_create_table(self, mock_acquire, database_config, mock_connection):
        """Test VectorSearch create_vector_table"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)

        vector_search = VectorSearch(database_config)
        await vector_search.create_vector_table("test_table", 128)

        # Should call execute twice - for table creation and index creation
        assert mock_connection.execute.call_count == 2

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_vector_search_bulk_insert(self, mock_acquire, database_config, mock_connection):
        """Test VectorSearch bulk_insert_vectors"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)

        vector_search = VectorSearch(database_config)
        vectors = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
        metadata = [{"id": 1}, {"id": 2}]

        await vector_search.bulk_insert_vectors("test_table", vectors, metadata)
        mock_connection.executemany.assert_called_once()

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_vector_search_similarity_search(self, mock_acquire, database_config, mock_connection):
        """Test VectorSearch similarity_search"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_connection.fetch.return_value = [{"id": 1, "distance": 0.1}]

        vector_search = VectorSearch(database_config)
        query_vector = [0.1, 0.2, 0.3]

        results = await vector_search.similarity_search("test_table", query_vector, limit=5)
        assert len(results) == 1
        assert results[0]["id"] == 1

    def test_health_checker_initialization(self, database_config):
        """Test HealthChecker initialization"""
        pool = DatabasePool(database_config)
        health_checker = HealthChecker(pool)
        assert health_checker.pool == pool
        assert health_checker.is_running == False

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_health_checker_check_health(self, mock_acquire, database_config, mock_connection):
        """Test HealthChecker check_health"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_connection.fetchval.side_effect = [1, True]  # For health check and pgvector check

        pool = DatabasePool(database_config)
        health_checker = HealthChecker(pool)

        result = await health_checker.check_health()
        assert result["status"] == "healthy"
        assert result["pgvector"] == "enabled"

    def test_pgbouncer_pool_initialization(self):
        """Test PgBouncerPool initialization"""
        bouncer = PgBouncerPool(max_connections=50, pool_mode="session")
        assert bouncer.max_connections == 50
        assert bouncer.pool_mode == "session"

    @pytest.mark.asyncio
    async def test_pgbouncer_pool_acquire_release(self):
        """Test PgBouncerPool acquire and release"""
        bouncer = PgBouncerPool(max_connections=2)

        # Acquire a connection
        conn = await bouncer.acquire(timeout=1)
        assert conn is not None

        # Release the connection
        await bouncer.release(conn)

    def test_query_analyzer_initialization(self, database_config):
        """Test QueryAnalyzer initialization"""
        analyzer = QueryAnalyzer(database_config)
        assert analyzer.pool is not None
        assert isinstance(analyzer.pool, DatabasePool)

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_query_analyzer_get_slow_queries(self, mock_acquire, database_config, mock_connection):
        """Test QueryAnalyzer get_slow_queries"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_connection.fetch.return_value = [{"query": "SELECT * FROM test", "mean_exec_time": 150}]

        analyzer = QueryAnalyzer(database_config)
        slow_queries = await analyzer.get_slow_queries(threshold_ms=100)

        assert len(slow_queries) == 1
        assert slow_queries[0]["mean_exec_time"] == 150

    def test_index_optimizer_initialization(self, database_config):
        """Test IndexOptimizer initialization"""
        optimizer = IndexOptimizer(database_config)
        assert optimizer.pool is not None
        assert isinstance(optimizer.pool, DatabasePool)

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_index_optimizer_analyze_indexes(self, mock_acquire, database_config, mock_connection):
        """Test IndexOptimizer analyze_indexes"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_connection.fetch.return_value = [{
            "schemaname": "public",
            "tablename": "test_table",
            "attname": "test_column",
            "n_distinct": 200,
            "correlation": 0.05
        }]

        optimizer = IndexOptimizer(database_config)
        suggestions = await optimizer.analyze_indexes()

        assert len(suggestions) == 1
        assert "CREATE INDEX" in suggestions[0]["recommended_index"]

    @pytest.mark.asyncio
    async def test_environment_variables(self):
        """Test environment variable usage"""
        with patch.dict(os.environ, {
            'DB_HOST': 'test_host',
            'DB_PORT': '5433',
            'DB_NAME': 'test_name',
            'DB_USER': 'test_user',
            'DB_PASSWORD': 'test_password'
        }):
            # Reset the global db_pool to test initialization
            import app.database
            app.database.db_pool = None

            # This should use environment variables
            gen = get_db()
            assert gen is not None


class TestVectorSearchComplete:
    """Additional tests for VectorSearch complete coverage"""

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_vector_search_drop_table(self, mock_acquire, database_config, mock_connection):
        """Test VectorSearch drop_table"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)

        vector_search = VectorSearch(database_config)
        await vector_search.drop_table("test_table")

        mock_connection.execute.assert_called_once()
        args = mock_connection.execute.call_args[0]
        assert "DROP TABLE" in args[0]


class TestHealthCheckerComplete:
    """Additional tests for HealthChecker complete coverage"""

    @pytest.mark.asyncio
    async def test_health_checker_automatic_checks(self, database_config):
        """Test HealthChecker automatic checks"""
        pool = DatabasePool(database_config)
        health_checker = HealthChecker(pool)

        # Start automatic checks
        health_checker.start_automatic_checks(interval=0.1)
        assert health_checker.is_running == True

        # Wait a bit and stop
        await asyncio.sleep(0.2)
        await health_checker.stop()
        assert health_checker.is_running == False

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_health_checker_error_handling(self, mock_acquire, database_config):
        """Test HealthChecker error handling"""
        mock_acquire.side_effect = Exception("Connection failed")

        pool = DatabasePool(database_config)
        health_checker = HealthChecker(pool)

        result = await health_checker.check_health()
        assert result["status"] == "unhealthy"
        assert "error" in result


class TestQueryAnalyzerComplete:
    """Additional tests for QueryAnalyzer complete coverage"""

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_query_analyzer_check_alerts(self, mock_acquire, database_config, mock_connection):
        """Test QueryAnalyzer check_query_alerts"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_connection.fetch.return_value = [
            {"query": "SELECT * FROM test", "mean_exec_time": 150, "calls": 100},
            {"query": "SELECT * FROM slow", "mean_exec_time": 600, "calls": 50}
        ]

        analyzer = QueryAnalyzer(database_config)
        alerts = await analyzer.check_query_alerts()

        assert len(alerts) == 2
        assert alerts[0]["severity"] == "warning"
        assert alerts[1]["severity"] == "critical"


class TestIndexOptimizerComplete:
    """Additional tests for IndexOptimizer complete coverage"""

    @pytest.mark.asyncio
    @patch('app.database.DatabasePool.acquire')
    async def test_index_optimizer_optimize_vector_index(self, mock_acquire, database_config, mock_connection):
        """Test IndexOptimizer optimize_vector_index"""
        mock_acquire.return_value.__aenter__ = AsyncMock(return_value=mock_connection)
        mock_acquire.return_value.__aexit__ = AsyncMock(return_value=None)

        optimizer = IndexOptimizer(database_config)
        result = await optimizer.optimize_vector_index("test_table", lists=50, probes=5)

        assert "recall" in result
        assert "search_time_ms" in result
        assert result["lists"] == 50
        assert result["probes"] == 5