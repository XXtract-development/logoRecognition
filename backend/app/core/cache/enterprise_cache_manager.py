"""Enterprise Cache Manager with ML optimization"""
import asyncio
import hashlib
import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from enum import Enum
from typing import Any, Dict, List, Optional, Callable, Union
from datetime import datetime, timedelta

import redis.asyncio as redis
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from prometheus_client import Counter, Histogram, Gauge

class CacheStrategy(Enum):
    LRU = "lru"
    LFU = "lfu"
    ADAPTIVE = "adaptive"
    ML_OPTIMIZED = "ml_optimized"

class CacheLevel(Enum):
    L1_MEMORY = "l1_memory"
    L2_REDIS = "l2_redis"
    L3_DISTRIBUTED = "l3_distributed"
    L4_CDN = "l4_cdn"

@dataclass
class CachePolicy:
    ttl: int
    strategy: CacheStrategy
    levels: List[CacheLevel]
    warming_enabled: bool = True
    compression_enabled: bool = True
    encryption_enabled: bool = False
    consistency_level: str = "eventual"  # immediate, strong, eventual
    invalidation_patterns: List[str] = None
    cost_optimization: bool = True
    ml_predictions: bool = True

@dataclass
class CacheMetrics:
    hit_rate: float
    miss_rate: float
    avg_response_time: float
    cache_size: int
    eviction_count: int
    warming_success_rate: float
    cost_per_request: float
    prediction_accuracy: float

class CacheEntry:
    def __init__(self, key: str, value: Any, policy: CachePolicy,
                 created_at: float = None, access_count: int = 0):
        self.key = key
        self.value = value
        self.policy = policy
        self.created_at = created_at or time.time()
        self.last_accessed = self.created_at
        self.access_count = access_count
        self.compressed_size = self._calculate_size()
        self.prediction_score = 0.0

    def _calculate_size(self) -> int:
        """Calculate compressed size of cache entry"""
        try:
            serialized = json.dumps(self.value, default=str)
            if self.policy.compression_enabled:
                import gzip
                compressed = gzip.compress(serialized.encode())
                return len(compressed)
            return len(serialized.encode())
        except:
            return 1024  # Default fallback size

    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.policy.ttl

    def access(self):
        self.last_accessed = time.time()
        self.access_count += 1

class PredictiveMLEngine:
    """Machine Learning engine for cache optimization"""

    def __init__(self):
        self.access_pattern_model = RandomForestRegressor(n_estimators=100)
        self.ttl_optimization_model = RandomForestRegressor(n_estimators=50)
        self.warming_prediction_model = RandomForestRegressor(n_estimators=75)
        self.is_trained = False
        self.training_data = []

    async def predict_access_probability(self, key: str, context: Dict) -> float:
        """Predict probability of cache key being accessed"""
        if not self.is_trained:
            return 0.5  # Default probability

        features = self._extract_features(key, context)
        try:
            probability = self.access_pattern_model.predict([features])[0]
            return max(0.0, min(1.0, probability))
        except:
            return 0.5

    async def predict_optimal_ttl(self, key: str, historical_data: Dict) -> int:
        """Predict optimal TTL for cache entry"""
        if not self.is_trained:
            return 300  # Default 5 minutes

        features = self._extract_ttl_features(key, historical_data)
        try:
            optimal_ttl = self.ttl_optimization_model.predict([features])[0]
            return max(60, min(86400, int(optimal_ttl)))  # Between 1 minute and 1 day
        except:
            return 300

    async def should_warm_cache(self, key: str, context: Dict) -> bool:
        """Determine if cache should be warmed for this key"""
        access_prob = await self.predict_access_probability(key, context)
        return access_prob > 0.7

    def _extract_features(self, key: str, context: Dict) -> List[float]:
        """Extract features for ML predictions"""
        current_time = time.time()
        hour_of_day = (current_time % 86400) / 3600
        day_of_week = ((current_time // 86400) % 7)

        features = [
            len(key),
            hash(key) % 1000000 / 1000000,  # Normalized key hash
            hour_of_day / 24,  # Normalized hour
            day_of_week / 7,   # Normalized day
            context.get('user_count', 0) / 1000,  # Normalized user count
            context.get('endpoint_popularity', 0),
            context.get('data_freshness', 1.0),
            context.get('cost_factor', 1.0),
        ]

        return features

    def _extract_ttl_features(self, key: str, historical_data: Dict) -> List[float]:
        """Extract features for TTL optimization"""
        features = [
            historical_data.get('avg_access_frequency', 0),
            historical_data.get('data_volatility', 0.5),
            historical_data.get('compute_cost', 1.0),
            historical_data.get('staleness_tolerance', 0.5),
            len(key) / 100,  # Normalized key length
            historical_data.get('user_sensitivity', 0.5),
        ]

        return features

    async def train_models(self, training_data: List[Dict]):
        """Train ML models with historical data"""
        if len(training_data) < 100:
            return  # Need minimum data for training

        try:
            # Prepare training data
            X_access = []
            y_access = []
            X_ttl = []
            y_ttl = []

            for data_point in training_data:
                if 'access_features' in data_point and 'was_accessed' in data_point:
                    X_access.append(data_point['access_features'])
                    y_access.append(float(data_point['was_accessed']))

                if 'ttl_features' in data_point and 'optimal_ttl' in data_point:
                    X_ttl.append(data_point['ttl_features'])
                    y_ttl.append(data_point['optimal_ttl'])

            # Train models
            if len(X_access) > 50:
                self.access_pattern_model.fit(X_access, y_access)

            if len(X_ttl) > 50:
                self.ttl_optimization_model.fit(X_ttl, y_ttl)

            self.is_trained = True

        except Exception as e:
            print(f"ML training failed: {e}")

class EnterpriseCacheManager:
    """Enterprise-grade cache manager with ML optimization"""

    def __init__(self, redis_urls: List[str], config: Dict):
        self.redis_clusters = []
        self.config = config
        self.ml_engine = PredictiveMLEngine()
        self.metrics = self._init_metrics()
        self.local_cache = {}  # L1 cache
        self.cache_policies = {}
        self.warming_tasks = set()
        self.consistency_locks = {}

        # Initialize Redis clusters
        for url in redis_urls:
            cluster = redis.Redis.from_url(url, decode_responses=True)
            self.redis_clusters.append(cluster)

        # Start background tasks
        asyncio.create_task(self._start_background_tasks())

    def _init_metrics(self):
        """Initialize Prometheus metrics"""
        return {
            'cache_hits': Counter('cache_hits_total', 'Total cache hits', ['level', 'key_pattern']),
            'cache_misses': Counter('cache_misses_total', 'Total cache misses', ['level', 'key_pattern']),
            'cache_response_time': Histogram('cache_response_time_seconds', 'Cache response time', ['operation']),
            'cache_size': Gauge('cache_size_bytes', 'Cache size in bytes', ['level']),
            'cache_warming_success': Counter('cache_warming_success_total', 'Successful cache warming operations'),
            'cache_warming_failures': Counter('cache_warming_failures_total', 'Failed cache warming operations'),
            'ml_prediction_accuracy': Gauge('ml_prediction_accuracy', 'ML prediction accuracy'),
        }

    async def get(self, key: str, policy: CachePolicy = None) -> Optional[Any]:
        """Get value from cache with multi-level fallback"""
        start_time = time.time()

        try:
            # L1: Local memory cache
            if CacheLevel.L1_MEMORY in (policy.levels if policy else [CacheLevel.L1_MEMORY]):
                if key in self.local_cache:
                    entry = self.local_cache[key]
                    if not entry.is_expired():
                        entry.access()
                        self.metrics['cache_hits'].labels(level='l1', key_pattern=self._get_key_pattern(key)).inc()
                        return entry.value
                    else:
                        del self.local_cache[key]

            # L2: Redis cache
            if CacheLevel.L2_REDIS in (policy.levels if policy else [CacheLevel.L2_REDIS]):
                for i, redis_client in enumerate(self.redis_clusters):
                    try:
                        cached_data = await redis_client.get(key)
                        if cached_data:
                            value = json.loads(cached_data)
                            self.metrics['cache_hits'].labels(level='l2', key_pattern=self._get_key_pattern(key)).inc()

                            # Promote to L1 if enabled
                            if policy and CacheLevel.L1_MEMORY in policy.levels:
                                await self._promote_to_l1(key, value, policy)

                            return value
                    except Exception as e:
                        print(f"Redis cluster {i} error: {e}")
                        continue

            # Cache miss
            self.metrics['cache_misses'].labels(level='all', key_pattern=self._get_key_pattern(key)).inc()
            return None

        finally:
            self.metrics['cache_response_time'].labels(operation='get').observe(time.time() - start_time)

    async def set(self, key: str, value: Any, policy: CachePolicy) -> bool:
        """Set value in cache with multi-level storage"""
        start_time = time.time()

        try:
            # Optimize TTL using ML if enabled
            if policy.ml_predictions:
                historical_data = await self._get_historical_data(key)
                optimized_ttl = await self.ml_engine.predict_optimal_ttl(key, historical_data)
                policy.ttl = optimized_ttl

            # Prepare cache entry
            entry = CacheEntry(key, value, policy)
            serialized_value = json.dumps(value, default=str)

            # Apply compression if enabled
            if policy.compression_enabled:
                import gzip
                serialized_value = gzip.compress(serialized_value.encode()).hex()

            # Apply encryption if enabled
            if policy.encryption_enabled:
                serialized_value = await self._encrypt_value(serialized_value)

            success = True

            # L1: Local memory cache
            if CacheLevel.L1_MEMORY in policy.levels:
                self.local_cache[key] = entry
                self._enforce_l1_limits()

            # L2: Redis cache
            if CacheLevel.L2_REDIS in policy.levels:
                for redis_client in self.redis_clusters:
                    try:
                        await redis_client.setex(key, policy.ttl, serialized_value)
                    except Exception as e:
                        print(f"Redis set error: {e}")
                        success = False

            # L3: Distributed cache (if configured)
            if CacheLevel.L3_DISTRIBUTED in policy.levels:
                await self._set_distributed_cache(key, serialized_value, policy)

            # Register cache policy
            self.cache_policies[key] = policy

            # Trigger predictive warming if enabled
            if policy.warming_enabled:
                asyncio.create_task(self._schedule_predictive_warming(key, policy))

            return success

        finally:
            self.metrics['cache_response_time'].labels(operation='set').observe(time.time() - start_time)

    async def invalidate(self, patterns: List[str], cascade: bool = True) -> int:
        """Invalidate cache entries matching patterns"""
        start_time = time.time()
        invalidated_count = 0

        try:
            # Build invalidation plan
            keys_to_invalidate = set()

            for pattern in patterns:
                # L1 invalidation
                for key in list(self.local_cache.keys()):
                    if self._matches_pattern(key, pattern):
                        keys_to_invalidate.add(key)

                # L2 invalidation
                for redis_client in self.redis_clusters:
                    try:
                        matching_keys = await redis_client.keys(pattern)
                        keys_to_invalidate.update(matching_keys)
                    except Exception as e:
                        print(f"Redis invalidation error: {e}")

            # Execute invalidation atomically
            async with self._get_consistency_lock(patterns):
                for key in keys_to_invalidate:
                    # Remove from L1
                    if key in self.local_cache:
                        del self.local_cache[key]
                        invalidated_count += 1

                    # Remove from L2
                    for redis_client in self.redis_clusters:
                        try:
                            await redis_client.delete(key)
                        except:
                            pass

                    # Remove from policy registry
                    if key in self.cache_policies:
                        del self.cache_policies[key]

                # Cascade invalidation if enabled
                if cascade:
                    cascade_patterns = await self._get_cascade_patterns(keys_to_invalidate)
                    if cascade_patterns:
                        invalidated_count += await self.invalidate(cascade_patterns, cascade=False)

            return invalidated_count

        finally:
            self.metrics['cache_response_time'].labels(operation='invalidate').observe(time.time() - start_time)

    async def warm_cache(self, key: str, fetch_function: Callable, policy: CachePolicy) -> bool:
        """Warm cache proactively"""
        try:
            # Check if warming is beneficial using ML
            context = await self._get_warming_context(key)
            should_warm = await self.ml_engine.should_warm_cache(key, context)

            if not should_warm and policy.ml_predictions:
                return False

            # Fetch data
            value = await fetch_function()

            # Store in cache
            success = await self.set(key, value, policy)

            if success:
                self.metrics['cache_warming_success'].inc()
            else:
                self.metrics['cache_warming_failures'].inc()

            return success

        except Exception as e:
            self.metrics['cache_warming_failures'].inc()
            print(f"Cache warming failed for {key}: {e}")
            return False

    async def get_cache_stats(self) -> CacheMetrics:
        """Get comprehensive cache statistics"""
        total_hits = sum(self.metrics['cache_hits']._value.values())
        total_misses = sum(self.metrics['cache_misses']._value.values())
        total_requests = total_hits + total_misses

        hit_rate = total_hits / total_requests if total_requests > 0 else 0
        miss_rate = 1 - hit_rate

        # Calculate cache sizes
        l1_size = sum(entry.compressed_size for entry in self.local_cache.values())
        l2_size = 0
        for redis_client in self.redis_clusters:
            try:
                info = await redis_client.info('memory')
                l2_size += info.get('used_memory', 0)
            except:
                pass

        return CacheMetrics(
            hit_rate=hit_rate,
            miss_rate=miss_rate,
            avg_response_time=self._get_avg_response_time(),
            cache_size=l1_size + l2_size,
            eviction_count=await self._get_eviction_count(),
            warming_success_rate=self._get_warming_success_rate(),
            cost_per_request=await self._calculate_cost_per_request(),
            prediction_accuracy=self._get_prediction_accuracy()
        )

    async def optimize_cache_automatically(self):
        """Run automatic cache optimization"""
        try:
            # Analyze access patterns
            access_patterns = await self._analyze_access_patterns()

            # Optimize TTL values
            await self._optimize_ttl_values(access_patterns)

            # Optimize cache levels
            await self._optimize_cache_levels(access_patterns)

            # Update ML models
            training_data = await self._collect_training_data()
            await self.ml_engine.train_models(training_data)

            # Cost optimization
            await self._optimize_costs()

        except Exception as e:
            print(f"Auto-optimization failed: {e}")

    # Helper methods
    async def _start_background_tasks(self):
        """Start background maintenance tasks"""
        asyncio.create_task(self._periodic_cleanup())
        asyncio.create_task(self._periodic_optimization())
        asyncio.create_task(self._health_monitoring())
        asyncio.create_task(self._cost_monitoring())

    async def _periodic_cleanup(self):
        """Clean up expired entries periodically"""
        while True:
            try:
                # Clean L1 cache
                expired_keys = [
                    key for key, entry in self.local_cache.items()
                    if entry.is_expired()
                ]
                for key in expired_keys:
                    del self.local_cache[key]

                await asyncio.sleep(60)  # Run every minute
            except Exception as e:
                print(f"Cleanup task error: {e}")
                await asyncio.sleep(60)

    async def _periodic_optimization(self):
        """Run optimization periodically"""
        while True:
            try:
                await asyncio.sleep(300)  # Run every 5 minutes
                await self.optimize_cache_automatically()
            except Exception as e:
                print(f"Optimization task error: {e}")

    async def _health_monitoring(self):
        """Monitor cache health and send alerts"""
        while True:
            try:
                stats = await self.get_cache_stats()

                # Check hit rate
                if stats.hit_rate < 0.7:  # Below 70%
                    await self._send_alert("Low cache hit rate", stats)

                # Check response time
                if stats.avg_response_time > 0.1:  # Above 100ms
                    await self._send_alert("High cache response time", stats)

                await asyncio.sleep(30)  # Check every 30 seconds
            except Exception as e:
                print(f"Health monitoring error: {e}")
                await asyncio.sleep(30)

    async def _cost_monitoring(self):
        """Monitor cache costs"""
        while True:
            try:
                await asyncio.sleep(3600)  # Check every hour
                cost = await self._calculate_cost_per_request()
                if cost > self.config.get('max_cost_per_request', 0.01):
                    await self._send_alert("Cache cost exceeded threshold", {"cost": cost})
            except Exception as e:
                print(f"Cost monitoring error: {e}")
                await asyncio.sleep(3600)

    def _get_key_pattern(self, key: str) -> str:
        """Extract pattern from cache key for metrics"""
        # Simple pattern extraction - in production, use more sophisticated logic
        parts = key.split(':')
        if len(parts) >= 2:
            return f"{parts[0]}:*"
        return "unknown"

    def _matches_pattern(self, key: str, pattern: str) -> bool:
        """Check if key matches invalidation pattern"""
        import fnmatch
        return fnmatch.fnmatch(key, pattern)

    async def _get_consistency_lock(self, patterns: List[str]):
        """Get distributed lock for consistency"""
        # Simplified implementation - use proper distributed locking in production
        class MockLock:
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass

        return MockLock()

    def _enforce_l1_limits(self):
        """Enforce L1 cache size limits"""
        max_size = self.config.get('l1_max_size', 100 * 1024 * 1024)  # 100MB default
        current_size = sum(entry.compressed_size for entry in self.local_cache.values())

        if current_size > max_size:
            # Evict least recently used entries
            sorted_entries = sorted(
                self.local_cache.items(),
                key=lambda x: x[1].last_accessed
            )

            for key, entry in sorted_entries:
                del self.local_cache[key]
                current_size -= entry.compressed_size
                if current_size <= max_size * 0.9:  # Leave 10% buffer
                    break

    async def _promote_to_l1(self, key: str, value: Any, policy: CachePolicy):
        """Promote cache entry to L1"""
        entry = CacheEntry(key, value, policy)
        self.local_cache[key] = entry
        self._enforce_l1_limits()

    async def _encrypt_value(self, value: str) -> str:
        """Encrypt cache value for security"""
        # Simplified implementation - use proper encryption in production
        return value  # Placeholder

    async def _set_distributed_cache(self, key: str, value: str, policy: CachePolicy):
        """Set value in distributed cache layer"""
        # Placeholder for distributed cache implementation
        pass

    async def _get_historical_data(self, key: str) -> Dict:
        """Get historical data for ML optimization"""
        # Placeholder - collect from monitoring systems
        return {
            'avg_access_frequency': 10,
            'data_volatility': 0.3,
            'compute_cost': 1.0,
            'staleness_tolerance': 0.5,
            'user_sensitivity': 0.7,
        }

    async def _get_warming_context(self, key: str) -> Dict:
        """Get context for cache warming decisions"""
        return {
            'user_count': 100,
            'endpoint_popularity': 0.8,
            'data_freshness': 0.9,
            'cost_factor': 1.0,
        }

    async def _schedule_predictive_warming(self, key: str, policy: CachePolicy):
        """Schedule predictive cache warming"""
        # Placeholder for predictive warming
        pass

    async def _get_cascade_patterns(self, keys: set) -> List[str]:
        """Get cascade invalidation patterns"""
        # Placeholder - implement based on relationships
        return []

    def _get_avg_response_time(self) -> float:
        """Calculate average response time"""
        # Simplified calculation
        return 0.05  # 50ms placeholder

    async def _get_eviction_count(self) -> int:
        """Get total eviction count"""
        return 0  # Placeholder

    def _get_warming_success_rate(self) -> float:
        """Calculate cache warming success rate"""
        total_warming = (self.metrics['cache_warming_success']._value.sum() +
                        self.metrics['cache_warming_failures']._value.sum())
        if total_warming == 0:
            return 1.0
        return self.metrics['cache_warming_success']._value.sum() / total_warming

    async def _calculate_cost_per_request(self) -> float:
        """Calculate cost per cache request"""
        # Simplified cost calculation
        return 0.001  # $0.001 per request placeholder

    def _get_prediction_accuracy(self) -> float:
        """Get ML prediction accuracy"""
        return 0.85  # 85% placeholder

    async def _analyze_access_patterns(self) -> Dict:
        """Analyze cache access patterns"""
        return {}  # Placeholder

    async def _optimize_ttl_values(self, patterns: Dict):
        """Optimize TTL values based on patterns"""
        pass  # Placeholder

    async def _optimize_cache_levels(self, patterns: Dict):
        """Optimize cache level distribution"""
        pass  # Placeholder

    async def _collect_training_data(self) -> List[Dict]:
        """Collect data for ML training"""
        return []  # Placeholder

    async def _optimize_costs(self):
        """Optimize cache costs"""
        pass  # Placeholder

    async def _send_alert(self, message: str, stats: Any):
        """Send monitoring alert"""
        print(f"CACHE ALERT: {message} - Stats: {stats}")

# Factory for creating cache policies
class CachePolicyFactory:
    """Factory for creating optimized cache policies"""

    @staticmethod
    def create_policy(endpoint_type: str, data_volatility: str = "medium") -> CachePolicy:
        """Create optimized cache policy based on endpoint characteristics"""

        policies = {
            "static_content": CachePolicy(
                ttl=86400,  # 1 day
                strategy=CacheStrategy.LRU,
                levels=[CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS, CacheLevel.L4_CDN],
                warming_enabled=True,
                compression_enabled=True,
                consistency_level="eventual"
            ),
            "user_data": CachePolicy(
                ttl=300,  # 5 minutes
                strategy=CacheStrategy.ADAPTIVE,
                levels=[CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS],
                warming_enabled=True,
                encryption_enabled=True,
                consistency_level="strong"
            ),
            "api_responses": CachePolicy(
                ttl=600,  # 10 minutes
                strategy=CacheStrategy.ML_OPTIMIZED,
                levels=[CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS, CacheLevel.L3_DISTRIBUTED],
                warming_enabled=True,
                ml_predictions=True,
                consistency_level="eventual"
            ),
            "real_time_data": CachePolicy(
                ttl=60,  # 1 minute
                strategy=CacheStrategy.LFU,
                levels=[CacheLevel.L1_MEMORY, CacheLevel.L2_REDIS],
                warming_enabled=False,
                consistency_level="immediate"
            )
        }

        base_policy = policies.get(endpoint_type, policies["api_responses"])

        # Adjust TTL based on data volatility
        volatility_multipliers = {"low": 2.0, "medium": 1.0, "high": 0.5}
        multiplier = volatility_multipliers.get(data_volatility, 1.0)
        base_policy.ttl = int(base_policy.ttl * multiplier)

        return base_policy