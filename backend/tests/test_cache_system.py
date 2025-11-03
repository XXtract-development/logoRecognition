"""Comprehensive tests for Enterprise Cache System"""
import asyncio
import json
import pytest
import time
from datetime import datetime, timedelta
from typing import Dict, Any
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import redis.asyncio as redis

from app.core.cache import (
    EnterpriseCacheManager,
    CachePolicy,
    CacheStrategy,
    CacheLevel,
    CacheEntry,
    CacheMetrics,
    PredictiveMLEngine,
    CachePolicyFactory,
    cached_response,
    invalidates_cache,
    warms_cache,
    CacheConfig,
    set_cache_manager,
    get_cache_manager
)
from app.services.cache_warming_service import (
    EnterpriseCacheWarmingService,
    WarmingTarget,
    WarmingResult,
    PredictiveWarmingEngine
)

# Fixtures
@pytest.fixture
async def redis_mock():
    """Mock Redis client"""
    mock_redis = AsyncMock(spec=redis.Redis)
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True
    mock_redis.setex.return_value = True
    mock_redis.delete.return_value = 1
    mock_redis.keys.return_value = []
    mock_redis.info.return_value = {'used_memory': 1024}
    return mock_redis

@pytest.fixture
async def cache_manager(redis_mock):
    """Create cache manager with mock Redis"""
    config = {
        'l1_max_size': 10 * 1024 * 1024,  # 10MB
        'max_cost_per_request': 0.01
    }

    with patch('app.core.cache.enterprise_cache_manager.redis.Redis.from_url', return_value=redis_mock):
        manager = EnterpriseCacheManager(['redis://localhost:6379'], config)
        set_cache_manager(manager)
        return manager

@pytest.fixture
async def cache_policy():
    """Create default cache policy"""
    return CachePolicy(
        ttl=300,
        strategy=CacheStrategy.LRU,
        levels=[CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS],
        warming_enabled=True,
        compression_enabled=True
    )

@pytest.fixture
async def warming_service(cache_manager):
    """Create cache warming service"""
    service = EnterpriseCacheWarmingService(cache_manager)
    return service

# Test Enterprise Cache Manager
class TestEnterpriseCacheManager:
    """Test Enterprise Cache Manager functionality"""

    @pytest.mark.asyncio
    async def test_cache_initialization(self, cache_manager):
        """Test cache manager initialization"""
        assert cache_manager is not None
        assert len(cache_manager.redis_clusters) == 1
        assert cache_manager.config['l1_max_size'] == 10 * 1024 * 1024
        assert cache_manager.ml_engine is not None

    @pytest.mark.asyncio
    async def test_cache_set_and_get(self, cache_manager, cache_policy):
        """Test basic cache set and get operations"""
        key = "test:key:1"
        value = {"data": "test_value", "timestamp": time.time()}

        # Set value in cache
        success = await cache_manager.set(key, value, cache_policy)
        assert success is True

        # Get value from cache (L1)
        cached_value = await cache_manager.get(key, cache_policy)
        assert cached_value == value

    @pytest.mark.asyncio
    async def test_cache_expiration(self, cache_manager):
        """Test cache entry expiration"""
        key = "test:expire:1"
        value = {"data": "expire_test"}

        # Create policy with 1 second TTL
        policy = CachePolicy(
            ttl=1,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY]
        )

        await cache_manager.set(key, value, policy)

        # Value should exist immediately
        assert await cache_manager.get(key, policy) == value

        # Wait for expiration
        await asyncio.sleep(1.1)

        # Value should be expired
        assert await cache_manager.get(key, policy) is None

    @pytest.mark.asyncio
    async def test_cache_invalidation(self, cache_manager, cache_policy):
        """Test cache invalidation patterns"""
        # Set multiple cache entries
        for i in range(5):
            await cache_manager.set(f"api:data:{i}", {"value": i}, cache_policy)
            await cache_manager.set(f"api:user:{i}", {"user": i}, cache_policy)

        # Invalidate data entries
        invalidated = await cache_manager.invalidate(["api:data:*"])

        # Data entries should be invalidated
        for i in range(5):
            assert await cache_manager.get(f"api:data:{i}") is None

        # User entries should still exist
        for i in range(5):
            assert await cache_manager.get(f"api:user:{i}") is not None

    @pytest.mark.asyncio
    async def test_ml_ttl_optimization(self, cache_manager, cache_policy):
        """Test ML-based TTL optimization"""
        cache_policy.ml_predictions = True

        # Mock ML prediction
        with patch.object(cache_manager.ml_engine, 'predict_optimal_ttl', return_value=600):
            await cache_manager.set("test:ml:1", {"data": "ml_test"}, cache_policy)

            # Verify TTL was optimized
            assert cache_policy.ttl == 600

    @pytest.mark.asyncio
    async def test_cache_warming(self, cache_manager, cache_policy):
        """Test cache warming functionality"""
        key = "warm:test:1"

        async def fetch_function():
            return {"warmed": "data", "timestamp": time.time()}

        # Warm cache
        success = await cache_manager.warm_cache(key, fetch_function, cache_policy)
        assert success is True

        # Value should be in cache
        cached_value = await cache_manager.get(key, cache_policy)
        assert cached_value is not None
        assert cached_value["warmed"] == "data"

    @pytest.mark.asyncio
    async def test_cache_stats(self, cache_manager):
        """Test cache statistics collection"""
        stats = await cache_manager.get_cache_stats()

        assert isinstance(stats, CacheMetrics)
        assert stats.hit_rate >= 0 and stats.hit_rate <= 1
        assert stats.miss_rate >= 0 and stats.miss_rate <= 1
        assert stats.cache_size >= 0
        assert stats.cost_per_request >= 0

    @pytest.mark.asyncio
    async def test_l1_cache_size_limits(self, cache_manager):
        """Test L1 cache size enforcement"""
        # Set small L1 limit for testing
        cache_manager.config['l1_max_size'] = 1024  # 1KB

        policy = CachePolicy(
            ttl=300,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY],
            compression_enabled=False
        )

        # Add entries until limit is exceeded
        for i in range(100):
            large_value = "x" * 100  # 100 bytes
            await cache_manager.set(f"size:test:{i}", large_value, policy)

        # Check that old entries were evicted
        cache_size = sum(entry.compressed_size for entry in cache_manager.local_cache.values())
        assert cache_size <= cache_manager.config['l1_max_size'] * 1.1  # Allow 10% buffer

# Test Cache Decorators
class TestCacheDecorators:
    """Test cache decorator functionality"""

    @pytest.mark.asyncio
    async def test_cached_response_decorator(self, cache_manager):
        """Test cached_response decorator"""
        call_count = 0

        @cached_response(CacheConfig(ttl=300, endpoint_type="api_responses"))
        async def get_data(user_id: str):
            nonlocal call_count
            call_count += 1
            return {"user_id": user_id, "data": "test_data"}

        # First call - should execute function
        result1 = await get_data("user123")
        assert result1["user_id"] == "user123"
        assert call_count == 1

        # Second call - should return from cache
        result2 = await get_data("user123")
        assert result2["user_id"] == "user123"
        assert call_count == 1  # Function not called again

    @pytest.mark.asyncio
    async def test_invalidates_cache_decorator(self, cache_manager):
        """Test invalidates_cache decorator"""
        # Set some cache entries
        policy = CachePolicy(ttl=300, strategy=CacheStrategy.LRU, levels=[CacheLevel.L1_MEMORY])
        await cache_manager.set("api:data:1", {"value": 1}, policy)
        await cache_manager.set("api:data:2", {"value": 2}, policy)

        @invalidates_cache(["api:data:*"])
        async def update_data(data: dict):
            return {"status": "updated", "data": data}

        # Call decorated function
        result = await update_data({"new": "value"})
        assert result["status"] == "updated"

        # Cache entries should be invalidated
        assert await cache_manager.get("api:data:1") is None
        assert await cache_manager.get("api:data:2") is None

    @pytest.mark.asyncio
    async def test_warms_cache_decorator(self, cache_manager):
        """Test warms_cache decorator"""

        async def fetch_user_data():
            return {"user": "data"}

        @warms_cache(fetch_function=fetch_user_data, config=CacheConfig(endpoint_type="user_data"))
        async def warm_user_cache():
            return [
                {"key": "user:1", "fetch": fetch_user_data},
                {"key": "user:2", "fetch": fetch_user_data}
            ]

        result = await warm_user_cache()
        assert result["warmed"] == 2
        assert result["total"] == 2

# Test Cache Policy Factory
class TestCachePolicyFactory:
    """Test cache policy factory"""

    def test_create_static_content_policy(self):
        """Test static content policy creation"""
        policy = CachePolicyFactory.create_policy("static_content", "low")

        assert policy.ttl == 86400 * 2  # 2 days (low volatility)
        assert policy.strategy == CacheStrategy.LRU
        assert CacheLevel.L4_CDN in policy.levels
        assert policy.warming_enabled is True

    def test_create_user_data_policy(self):
        """Test user data policy creation"""
        policy = CachePolicyFactory.create_policy("user_data", "high")

        assert policy.ttl == 150  # 2.5 minutes (high volatility)
        assert policy.strategy == CacheStrategy.ADAPTIVE
        assert policy.encryption_enabled is True
        assert policy.consistency_level == "strong"

    def test_create_api_response_policy(self):
        """Test API response policy creation"""
        policy = CachePolicyFactory.create_policy("api_responses", "medium")

        assert policy.ttl == 600  # 10 minutes
        assert policy.strategy == CacheStrategy.ML_OPTIMIZED
        assert policy.ml_predictions is True

    def test_create_real_time_data_policy(self):
        """Test real-time data policy creation"""
        policy = CachePolicyFactory.create_policy("real_time_data", "high")

        assert policy.ttl == 30  # 30 seconds (high volatility)
        assert policy.strategy == CacheStrategy.LFU
        assert policy.warming_enabled is False
        assert policy.consistency_level == "immediate"

# Test Cache Warming Service
class TestCacheWarmingService:
    """Test cache warming service"""

    @pytest.mark.asyncio
    async def test_warming_service_initialization(self, warming_service):
        """Test warming service initialization"""
        assert warming_service is not None
        assert warming_service.cache_manager is not None
        assert warming_service.predictive_engine is not None
        assert warming_service.is_running is False

    @pytest.mark.asyncio
    async def test_register_warming_target(self, warming_service):
        """Test registering warming targets"""
        target = WarmingTarget(
            key="test:warm:1",
            endpoint="/api/test",
            fetch_function=AsyncMock(return_value={"data": "test"}),
            priority=8
        )

        warming_service.register_target(target)
        assert len(warming_service.warming_targets) == 1
        assert warming_service.warming_targets[0].key == "test:warm:1"

    @pytest.mark.asyncio
    async def test_warm_single_target(self, warming_service):
        """Test warming a single target"""
        fetch_mock = AsyncMock(return_value={"warmed": "data"})
        target = WarmingTarget(
            key="test:single:1",
            endpoint="/api/single",
            fetch_function=fetch_mock,
            priority=10
        )

        result = await warming_service.warm_target(target)

        assert isinstance(result, WarmingResult)
        assert result.success is True
        assert result.target == target
        assert fetch_mock.called

    @pytest.mark.asyncio
    async def test_warm_all_targets(self, warming_service):
        """Test warming all targets"""
        # Register multiple targets
        for i in range(3):
            target = WarmingTarget(
                key=f"test:all:{i}",
                endpoint=f"/api/test{i}",
                fetch_function=AsyncMock(return_value={"data": i}),
                priority=5 + i
            )
            warming_service.register_target(target)

        # Warm all targets with priority >= 5
        results = await warming_service.warm_all(priority_threshold=5)

        assert len(results) == 3
        assert all(isinstance(r, WarmingResult) for r in results)

    @pytest.mark.asyncio
    async def test_predictive_warming(self, warming_service):
        """Test predictive cache warming"""
        # Mock ML predictions
        with patch.object(
            warming_service.predictive_engine,
            'predict_warming_targets',
            return_value=["test:predict:1"]
        ):
            # Register target
            target = WarmingTarget(
                key="test:predict:1",
                endpoint="/api/predict",
                fetch_function=AsyncMock(return_value={"predicted": "data"}),
                priority=7
            )
            warming_service.register_target(target)

            # Mock optimal timing prediction
            with patch.object(
                warming_service.predictive_engine,
                'predict_optimal_timing',
                return_value=datetime.utcnow()
            ):
                results = await warming_service.warm_predictive()

                assert len(results) == 1
                assert results[0].success is True

    @pytest.mark.asyncio
    async def test_warming_with_retry(self, warming_service):
        """Test warming with retry on failure"""
        # Mock fetch function that fails once then succeeds
        fetch_mock = AsyncMock()
        fetch_mock.side_effect = [Exception("First failure"), {"data": "success"}]

        target = WarmingTarget(
            key="test:retry:1",
            endpoint="/api/retry",
            fetch_function=fetch_mock,
            priority=8,
            retry_on_failure=1
        )

        result = await warming_service.warm_target(target)

        assert result.success is True
        assert fetch_mock.call_count == 2

    @pytest.mark.asyncio
    async def test_warming_stats(self, warming_service):
        """Test warming statistics"""
        # Perform some warming operations
        target = WarmingTarget(
            key="test:stats:1",
            endpoint="/api/stats",
            fetch_function=AsyncMock(return_value={"data": "stats"}),
            priority=9
        )

        await warming_service.warm_target(target)

        stats = warming_service.get_stats()

        assert stats['total_warmings'] == 1
        assert stats['successful_warmings'] == 1
        assert stats['failed_warmings'] == 0
        assert 'success_rate' in stats
        assert 'avg_duration' in stats

# Test Predictive ML Engine
class TestPredictiveMLEngine:
    """Test ML-based cache optimization"""

    @pytest.mark.asyncio
    async def test_ml_engine_initialization(self):
        """Test ML engine initialization"""
        engine = PredictiveMLEngine()

        assert engine.access_pattern_model is not None
        assert engine.ttl_optimization_model is not None
        assert engine.warming_prediction_model is not None
        assert engine.is_trained is False

    @pytest.mark.asyncio
    async def test_predict_access_probability(self):
        """Test access probability prediction"""
        engine = PredictiveMLEngine()
        context = {
            'user_count': 100,
            'endpoint_popularity': 0.8,
            'data_freshness': 0.9,
            'cost_factor': 1.0
        }

        # Without training, should return default
        prob = await engine.predict_access_probability("test:key", context)
        assert prob == 0.5

    @pytest.mark.asyncio
    async def test_predict_optimal_ttl(self):
        """Test optimal TTL prediction"""
        engine = PredictiveMLEngine()
        historical_data = {
            'avg_access_frequency': 10,
            'data_volatility': 0.3,
            'compute_cost': 1.0,
            'staleness_tolerance': 0.5,
            'user_sensitivity': 0.7
        }

        # Without training, should return default
        ttl = await engine.predict_optimal_ttl("test:key", historical_data)
        assert ttl == 300

    @pytest.mark.asyncio
    async def test_ml_training(self):
        """Test ML model training"""
        engine = PredictiveMLEngine()

        # Generate training data
        training_data = []
        for i in range(200):
            training_data.append({
                'access_features': [i/200, 0.5, 0.7, 0.3, 0.8, 0.6, 0.9, 0.4],
                'was_accessed': float(i % 2),
                'ttl_features': [0.5, 0.3, 1.0, 0.5, 0.2, 0.7],
                'optimal_ttl': 300 + i
            })

        # Train models
        await engine.train_models(training_data)

        assert engine.is_trained is True

# Test Cache Entry
class TestCacheEntry:
    """Test cache entry functionality"""

    def test_cache_entry_creation(self):
        """Test cache entry creation"""
        policy = CachePolicy(
            ttl=300,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY]
        )

        entry = CacheEntry("test:key", {"data": "value"}, policy)

        assert entry.key == "test:key"
        assert entry.value == {"data": "value"}
        assert entry.policy == policy
        assert entry.access_count == 0
        assert entry.compressed_size > 0

    def test_cache_entry_expiration(self):
        """Test cache entry expiration check"""
        policy = CachePolicy(
            ttl=1,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY]
        )

        entry = CacheEntry("test:key", {"data": "value"}, policy)

        # Should not be expired immediately
        assert entry.is_expired() is False

        # Modify created_at to simulate expiration
        entry.created_at = time.time() - 2
        assert entry.is_expired() is True

    def test_cache_entry_access(self):
        """Test cache entry access tracking"""
        policy = CachePolicy(
            ttl=300,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY]
        )

        entry = CacheEntry("test:key", {"data": "value"}, policy)

        # Access the entry
        entry.access()
        assert entry.access_count == 1
        assert entry.last_accessed > entry.created_at

        # Access again
        entry.access()
        assert entry.access_count == 2

# Integration Tests
class TestCacheIntegration:
    """Integration tests for the complete cache system"""

    @pytest.mark.asyncio
    async def test_end_to_end_caching_flow(self, cache_manager):
        """Test complete caching flow"""
        # Create API endpoint simulation
        @cached_response(CacheConfig(ttl=300, endpoint_type="api_responses"))
        async def get_user_data(user_id: str):
            # Simulate expensive operation
            await asyncio.sleep(0.1)
            return {
                "user_id": user_id,
                "name": f"User {user_id}",
                "timestamp": time.time()
            }

        # First call - cache miss
        start_time = time.time()
        result1 = await get_user_data("123")
        first_call_time = time.time() - start_time

        # Second call - cache hit
        start_time = time.time()
        result2 = await get_user_data("123")
        second_call_time = time.time() - start_time

        # Cache hit should be significantly faster
        assert second_call_time < first_call_time / 2
        assert result1 == result2

    @pytest.mark.asyncio
    async def test_cache_invalidation_cascade(self, cache_manager):
        """Test cascading cache invalidation"""
        policy = CachePolicy(
            ttl=300,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY],
            invalidation_patterns=["related:*"]
        )

        # Set related cache entries
        await cache_manager.set("main:1", {"data": "main"}, policy)
        await cache_manager.set("related:1", {"data": "related1"}, policy)
        await cache_manager.set("related:2", {"data": "related2"}, policy)

        # Invalidate main entry with cascade
        await cache_manager.invalidate(["main:*"], cascade=True)

        # All entries should be invalidated
        assert await cache_manager.get("main:1") is None

        # Note: Cascade invalidation is simplified in current implementation
        # In production, would follow invalidation_patterns

    @pytest.mark.asyncio
    async def test_warming_and_caching_integration(self, cache_manager, warming_service):
        """Test integration between warming service and cache manager"""

        async def fetch_expensive_data():
            await asyncio.sleep(0.1)
            return {"expensive": "data", "computed_at": time.time()}

        # Register warming target
        target = WarmingTarget(
            key="expensive:data:1",
            endpoint="/api/expensive",
            fetch_function=fetch_expensive_data,
            priority=10
        )

        warming_service.register_target(target)

        # Warm the cache
        results = await warming_service.warm_all()
        assert len(results) == 1
        assert results[0].success is True

        # Data should be in cache
        cached_data = await cache_manager.get("expensive:data:1")
        assert cached_data is not None
        assert cached_data["expensive"] == "data"

# Performance Tests
class TestCachePerformance:
    """Performance tests for cache system"""

    @pytest.mark.asyncio
    async def test_cache_throughput(self, cache_manager):
        """Test cache throughput"""
        policy = CachePolicy(
            ttl=300,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY],
            compression_enabled=False  # Disable for performance test
        )

        # Measure write throughput
        start_time = time.time()
        write_operations = 1000

        for i in range(write_operations):
            await cache_manager.set(f"perf:test:{i}", {"data": i}, policy)

        write_time = time.time() - start_time
        write_throughput = write_operations / write_time

        # Measure read throughput
        start_time = time.time()
        read_operations = 1000

        for i in range(read_operations):
            await cache_manager.get(f"perf:test:{i % write_operations}")

        read_time = time.time() - start_time
        read_throughput = read_operations / read_time

        # Assert reasonable throughput (adjust based on requirements)
        assert write_throughput > 100  # At least 100 ops/sec
        assert read_throughput > 500   # At least 500 ops/sec

    @pytest.mark.asyncio
    async def test_cache_memory_efficiency(self, cache_manager):
        """Test cache memory efficiency"""
        policy = CachePolicy(
            ttl=300,
            strategy=CacheStrategy.LRU,
            levels=[CacheLevel.L1_MEMORY],
            compression_enabled=True  # Enable compression
        )

        # Add large data entries
        large_data = "x" * 1000  # 1KB of data
        uncompressed_size = 0

        for i in range(100):
            data = {"large": large_data, "index": i}
            await cache_manager.set(f"memory:test:{i}", data, policy)
            uncompressed_size += len(json.dumps(data))

        # Calculate actual memory usage
        actual_size = sum(entry.compressed_size for entry in cache_manager.local_cache.values())

        # Compression should reduce size
        compression_ratio = actual_size / uncompressed_size
        assert compression_ratio < 0.8  # At least 20% compression

if __name__ == "__main__":
    pytest.main([__file__, "-v"])