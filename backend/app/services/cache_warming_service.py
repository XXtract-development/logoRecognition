"""Intelligent Cache Warming Service with Predictive Analytics"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Callable, Any, Optional
from dataclasses import dataclass, asdict
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import schedule

from ..core.cache import (
    EnterpriseCacheManager,
    CachePolicy,
    CachePolicyFactory,
    CacheLevel,
    CacheStrategy
)

logger = logging.getLogger(__name__)

@dataclass
class WarmingTarget:
    """Target for cache warming"""
    key: str
    endpoint: str
    fetch_function: Callable
    priority: int = 5  # 1-10, 10 being highest
    schedule_pattern: Optional[str] = None  # cron-like pattern
    data_params: Optional[Dict] = None
    warm_dependencies: bool = True
    retry_on_failure: int = 3
    timeout: int = 30
    metadata: Optional[Dict] = None

@dataclass
class WarmingResult:
    """Result of cache warming operation"""
    target: WarmingTarget
    success: bool
    duration: float
    error: Optional[str] = None
    dependencies_warmed: int = 0
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()

class PredictiveWarmingEngine:
    """ML-based predictive cache warming"""

    def __init__(self):
        self.access_predictor = RandomForestRegressor(n_estimators=150)
        self.timing_predictor = RandomForestRegressor(n_estimators=100)
        self.scaler = StandardScaler()
        self.historical_data = []
        self.is_trained = False

    async def predict_warming_targets(self, context: Dict) -> List[str]:
        """Predict which cache keys should be warmed based on context"""
        if not self.is_trained:
            return []

        features = self._extract_context_features(context)
        scaled_features = self.scaler.transform([features])

        try:
            # Predict access probability for potential targets
            probabilities = self.access_predictor.predict_proba(scaled_features)

            # Select targets with probability > threshold
            threshold = 0.7
            predicted_targets = []

            for idx, prob in enumerate(probabilities[0]):
                if prob > threshold:
                    # Map index back to cache key
                    if idx < len(self.historical_data):
                        target_key = self.historical_data[idx].get('key')
                        if target_key:
                            predicted_targets.append(target_key)

            return predicted_targets[:20]  # Limit to top 20 targets

        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            return []

    async def predict_optimal_timing(self, target: WarmingTarget) -> datetime:
        """Predict optimal time to warm cache for target"""
        if not self.is_trained:
            return datetime.utcnow()

        features = self._extract_target_features(target)

        try:
            # Predict optimal time offset (in minutes)
            time_offset = self.timing_predictor.predict([features])[0]
            optimal_time = datetime.utcnow() + timedelta(minutes=max(0, time_offset))
            return optimal_time

        except Exception as e:
            logger.error(f"Timing prediction failed: {e}")
            return datetime.utcnow()

    def _extract_context_features(self, context: Dict) -> List[float]:
        """Extract features from context for ML predictions"""
        current_time = datetime.utcnow()

        return [
            current_time.hour / 24,  # Normalized hour
            current_time.weekday() / 7,  # Normalized day of week
            context.get('active_users', 0) / 1000,  # Normalized user count
            context.get('server_load', 0.5),  # Server load
            context.get('cache_hit_rate', 0.7),  # Current cache performance
            context.get('api_latency', 100) / 1000,  # Normalized latency
            context.get('error_rate', 0.01),  # Error rate
            context.get('data_freshness_score', 0.8),  # Data freshness
        ]

    def _extract_target_features(self, target: WarmingTarget) -> List[float]:
        """Extract features from target for timing prediction"""
        return [
            target.priority / 10,  # Normalized priority
            len(target.key) / 100,  # Normalized key length
            hash(target.endpoint) % 1000 / 1000,  # Endpoint hash
            1.0 if target.warm_dependencies else 0.0,
            target.retry_on_failure / 10,
            target.timeout / 60,  # Normalized timeout
        ]

    async def train(self, training_data: List[Dict]):
        """Train ML models with historical warming data"""
        if len(training_data) < 100:
            return  # Need minimum data

        try:
            # Prepare training data
            X_access = []
            y_access = []
            X_timing = []
            y_timing = []

            for record in training_data:
                if 'context_features' in record and 'was_accessed' in record:
                    X_access.append(record['context_features'])
                    y_access.append(record['was_accessed'])

                if 'target_features' in record and 'optimal_timing' in record:
                    X_timing.append(record['target_features'])
                    y_timing.append(record['optimal_timing'])

            # Scale features
            if X_access:
                X_access = self.scaler.fit_transform(X_access)
                self.access_predictor.fit(X_access, y_access)

            if X_timing:
                self.timing_predictor.fit(X_timing, y_timing)

            self.is_trained = True
            self.historical_data = training_data

        except Exception as e:
            logger.error(f"Training failed: {e}")

class EnterpriseCacheWarmingService:
    """Enterprise-grade cache warming service"""

    def __init__(self, cache_manager: EnterpriseCacheManager):
        self.cache_manager = cache_manager
        self.warming_targets: List[WarmingTarget] = []
        self.warming_results: List[WarmingResult] = []
        self.predictive_engine = PredictiveWarmingEngine()
        self.is_running = False
        self.warming_tasks = set()
        self.scheduler = schedule.Scheduler()
        self.stats = self._init_stats()

    def _init_stats(self) -> Dict:
        """Initialize warming statistics"""
        return {
            'total_warmings': 0,
            'successful_warmings': 0,
            'failed_warmings': 0,
            'total_duration': 0,
            'dependencies_warmed': 0,
            'last_run': None,
            'next_run': None
        }

    async def start(self):
        """Start the warming service"""
        if self.is_running:
            return

        self.is_running = True
        logger.info("Cache warming service started")

        # Start background tasks
        asyncio.create_task(self._warming_loop())
        asyncio.create_task(self._predictive_warming_loop())
        asyncio.create_task(self._health_check_loop())
        asyncio.create_task(self._training_loop())

    async def stop(self):
        """Stop the warming service"""
        self.is_running = False

        # Cancel all warming tasks
        for task in self.warming_tasks:
            task.cancel()

        await asyncio.gather(*self.warming_tasks, return_exceptions=True)
        logger.info("Cache warming service stopped")

    def register_target(self, target: WarmingTarget):
        """Register a new warming target"""
        self.warming_targets.append(target)

        # Schedule if pattern provided
        if target.schedule_pattern:
            self._schedule_target(target)

        logger.info(f"Registered warming target: {target.key}")

    def unregister_target(self, key: str):
        """Unregister a warming target"""
        self.warming_targets = [t for t in self.warming_targets if t.key != key]
        logger.info(f"Unregistered warming target: {key}")

    async def warm_target(self, target: WarmingTarget) -> WarmingResult:
        """Warm a specific cache target"""
        start_time = datetime.utcnow()

        try:
            # Fetch data using target's function
            if target.data_params:
                data = await target.fetch_function(**target.data_params)
            else:
                data = await target.fetch_function()

            # Create cache policy
            policy = CachePolicyFactory.create_policy(
                endpoint_type="api_responses",
                data_volatility="low"
            )

            # Store in cache
            success = await self.cache_manager.set(target.key, data, policy)

            # Warm dependencies if requested
            dependencies_warmed = 0
            if target.warm_dependencies and success:
                dependencies_warmed = await self._warm_dependencies(target, data)

            # Calculate duration
            duration = (datetime.utcnow() - start_time).total_seconds()

            # Create result
            result = WarmingResult(
                target=target,
                success=success,
                duration=duration,
                dependencies_warmed=dependencies_warmed
            )

            # Update stats
            self._update_stats(result)

            return result

        except Exception as e:
            logger.error(f"Failed to warm {target.key}: {e}")

            # Retry if configured
            if target.retry_on_failure > 0:
                target.retry_on_failure -= 1
                await asyncio.sleep(5)  # Wait before retry
                return await self.warm_target(target)

            return WarmingResult(
                target=target,
                success=False,
                duration=(datetime.utcnow() - start_time).total_seconds(),
                error=str(e)
            )

    async def warm_all(self, priority_threshold: int = 0) -> List[WarmingResult]:
        """Warm all registered targets above priority threshold"""
        results = []

        # Sort by priority
        sorted_targets = sorted(
            self.warming_targets,
            key=lambda t: t.priority,
            reverse=True
        )

        # Filter by threshold
        targets_to_warm = [
            t for t in sorted_targets
            if t.priority >= priority_threshold
        ]

        # Warm targets concurrently (with limit)
        batch_size = 10
        for i in range(0, len(targets_to_warm), batch_size):
            batch = targets_to_warm[i:i + batch_size]
            batch_results = await asyncio.gather(
                *[self.warm_target(t) for t in batch],
                return_exceptions=True
            )

            for result in batch_results:
                if isinstance(result, WarmingResult):
                    results.append(result)

        return results

    async def warm_predictive(self) -> List[WarmingResult]:
        """Warm cache based on ML predictions"""
        # Get current context
        context = await self._get_system_context()

        # Get predicted targets
        predicted_keys = await self.predictive_engine.predict_warming_targets(context)

        results = []
        for key in predicted_keys:
            # Find matching target
            target = next((t for t in self.warming_targets if t.key == key), None)

            if target:
                # Predict optimal timing
                optimal_time = await self.predictive_engine.predict_optimal_timing(target)

                # Schedule or warm immediately
                if optimal_time <= datetime.utcnow():
                    result = await self.warm_target(target)
                    results.append(result)
                else:
                    # Schedule for later
                    asyncio.create_task(self._delayed_warming(target, optimal_time))

        return results

    async def _warming_loop(self):
        """Main warming loop"""
        while self.is_running:
            try:
                # Run scheduled warmings
                self.scheduler.run_pending()

                # Check for targets needing warming
                await self._check_warming_needed()

                await asyncio.sleep(60)  # Check every minute

            except Exception as e:
                logger.error(f"Warming loop error: {e}")
                await asyncio.sleep(60)

    async def _predictive_warming_loop(self):
        """Predictive warming loop"""
        while self.is_running:
            try:
                # Run predictive warming every 5 minutes
                await asyncio.sleep(300)

                if self.predictive_engine.is_trained:
                    await self.warm_predictive()

            except Exception as e:
                logger.error(f"Predictive warming error: {e}")

    async def _health_check_loop(self):
        """Health check loop"""
        while self.is_running:
            try:
                await asyncio.sleep(120)  # Check every 2 minutes

                # Check warming success rate
                if self.stats['total_warmings'] > 0:
                    success_rate = self.stats['successful_warmings'] / self.stats['total_warmings']

                    if success_rate < 0.8:  # Below 80%
                        logger.warning(f"Low warming success rate: {success_rate:.2%}")

                # Check average warming duration
                if self.stats['successful_warmings'] > 0:
                    avg_duration = self.stats['total_duration'] / self.stats['successful_warmings']

                    if avg_duration > 10:  # Above 10 seconds
                        logger.warning(f"High average warming duration: {avg_duration:.2f}s")

            except Exception as e:
                logger.error(f"Health check error: {e}")

    async def _training_loop(self):
        """ML model training loop"""
        while self.is_running:
            try:
                await asyncio.sleep(3600)  # Train every hour

                # Collect training data
                training_data = await self._collect_training_data()

                if training_data:
                    await self.predictive_engine.train(training_data)

            except Exception as e:
                logger.error(f"Training loop error: {e}")

    async def _warm_dependencies(self, target: WarmingTarget, parent_data: Any) -> int:
        """Warm dependent cache entries"""
        dependencies_warmed = 0

        try:
            # Extract dependency keys from parent data
            dependency_keys = self._extract_dependency_keys(parent_data)

            for dep_key in dependency_keys:
                # Check if dependency target exists
                dep_target = next(
                    (t for t in self.warming_targets if t.key == dep_key),
                    None
                )

                if dep_target:
                    result = await self.warm_target(dep_target)
                    if result.success:
                        dependencies_warmed += 1

        except Exception as e:
            logger.error(f"Failed to warm dependencies: {e}")

        return dependencies_warmed

    def _extract_dependency_keys(self, data: Any) -> List[str]:
        """Extract dependency keys from data"""
        # Implementation depends on data structure
        # This is a placeholder
        dependency_keys = []

        if isinstance(data, dict):
            # Look for reference fields
            for key, value in data.items():
                if key.endswith('_id') or key.endswith('_ref'):
                    dependency_keys.append(f"entity:{value}")

        return dependency_keys

    async def _check_warming_needed(self):
        """Check if any targets need warming"""
        for target in self.warming_targets:
            # Check if cache entry exists and is still valid
            cached_value = await self.cache_manager.get(target.key)

            if cached_value is None:
                # Cache miss - warm it
                asyncio.create_task(self.warm_target(target))

    async def _delayed_warming(self, target: WarmingTarget, scheduled_time: datetime):
        """Warm target at scheduled time"""
        delay = (scheduled_time - datetime.utcnow()).total_seconds()

        if delay > 0:
            await asyncio.sleep(delay)

        await self.warm_target(target)

    def _schedule_target(self, target: WarmingTarget):
        """Schedule target warming based on pattern"""
        # Parse schedule pattern (cron-like)
        # This is a simplified implementation
        if target.schedule_pattern == "hourly":
            self.scheduler.every().hour.do(
                lambda: asyncio.create_task(self.warm_target(target))
            )
        elif target.schedule_pattern == "daily":
            self.scheduler.every().day.do(
                lambda: asyncio.create_task(self.warm_target(target))
            )
        # Add more patterns as needed

    async def _get_system_context(self) -> Dict:
        """Get current system context for predictions"""
        cache_stats = await self.cache_manager.get_cache_stats()

        return {
            'active_users': 100,  # Placeholder - get from system
            'server_load': 0.5,  # Placeholder - get from monitoring
            'cache_hit_rate': cache_stats.hit_rate,
            'api_latency': 50,  # Placeholder - get from metrics
            'error_rate': 0.01,  # Placeholder - get from monitoring
            'data_freshness_score': 0.9,  # Placeholder - calculate
        }

    async def _collect_training_data(self) -> List[Dict]:
        """Collect training data for ML models"""
        training_data = []

        for result in self.warming_results[-1000:]:  # Last 1000 results
            context = await self._get_system_context()

            training_record = {
                'key': result.target.key,
                'context_features': self.predictive_engine._extract_context_features(context),
                'target_features': self.predictive_engine._extract_target_features(result.target),
                'was_accessed': result.success,
                'optimal_timing': 0 if result.success else 30,  # Simplified
            }

            training_data.append(training_record)

        return training_data

    def _update_stats(self, result: WarmingResult):
        """Update warming statistics"""
        self.stats['total_warmings'] += 1

        if result.success:
            self.stats['successful_warmings'] += 1
            self.stats['total_duration'] += result.duration
            self.stats['dependencies_warmed'] += result.dependencies_warmed
        else:
            self.stats['failed_warmings'] += 1

        self.stats['last_run'] = datetime.utcnow()

        # Store result for analysis
        self.warming_results.append(result)

        # Keep only last 10000 results
        if len(self.warming_results) > 10000:
            self.warming_results = self.warming_results[-10000:]

    def get_stats(self) -> Dict:
        """Get warming service statistics"""
        stats = self.stats.copy()

        # Calculate additional metrics
        if stats['total_warmings'] > 0:
            stats['success_rate'] = stats['successful_warmings'] / stats['total_warmings']

            if stats['successful_warmings'] > 0:
                stats['avg_duration'] = stats['total_duration'] / stats['successful_warmings']
                stats['avg_dependencies'] = stats['dependencies_warmed'] / stats['successful_warmings']

        stats['active_targets'] = len(self.warming_targets)
        stats['pending_tasks'] = len(self.warming_tasks)

        return stats