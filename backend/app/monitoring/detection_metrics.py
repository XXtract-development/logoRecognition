"""
Detection service monitoring and metrics collection.
"""

from prometheus_client import Counter, Histogram, Gauge, Info
import time
from typing import Dict, Any, Optional
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Prometheus metrics - conditional registration to prevent duplication
try:
    detection_counter = Counter(
        'logo_detection_total',
        'Total number of detection requests',
        ['model_type', 'status']
    )

    detection_duration = Histogram(
        'logo_detection_duration_seconds',
        'Detection processing time in seconds',
        ['model_type'],
        buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
    )

    logos_detected_counter = Counter(
        'logos_detected_total',
        'Total number of logos detected',
        ['brand_name', 'category']
    )

    detection_confidence = Histogram(
        'logo_detection_confidence',
        'Detection confidence scores distribution',
        ['model_type'],
        buckets=(0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 1.0)
    )

    cache_hit_rate = Gauge(
        'logo_detection_cache_hit_rate',
        'Cache hit rate for detection results'
    )

    active_detections = Gauge(
        'logo_detection_active',
        'Number of currently processing detections'
    )

    model_load_time = Histogram(
        'logo_model_load_seconds',
        'Model loading time in seconds',
        ['model_type']
    )

    gpu_memory_usage = Gauge(
        'logo_detection_gpu_memory_bytes',
        'GPU memory usage in bytes',
        ['device']
    )

    model_info = Info(
        'logo_detection_model',
        'Information about the detection model'
    )
except ValueError:
    # Metrics already registered - retrieve existing collectors
    from prometheus_client import REGISTRY
    detection_counter = REGISTRY._names_to_collectors.get('logo_detection_total')
    detection_duration = REGISTRY._names_to_collectors.get('logo_detection_duration_seconds')
    logos_detected_counter = REGISTRY._names_to_collectors.get('logos_detected_total')
    detection_confidence = REGISTRY._names_to_collectors.get('logo_detection_confidence')
    cache_hit_rate = REGISTRY._names_to_collectors.get('logo_detection_cache_hit_rate')
    active_detections = REGISTRY._names_to_collectors.get('logo_detection_active')
    model_load_time = REGISTRY._names_to_collectors.get('logo_model_load_seconds')
    gpu_memory_usage = REGISTRY._names_to_collectors.get('logo_detection_gpu_memory_bytes')
    model_info = REGISTRY._names_to_collectors.get('logo_detection_model')


class DetectionMetrics:
    """
    Collects and manages detection service metrics.

    This class provides methods to track various metrics for monitoring
    the performance and health of the detection service.
    """

    def __init__(self):
        """
        Initialize metrics collector.
        """
        self.start_time = time.time()
        self.detection_history = []
        self.error_counts = {}
        self.model_versions = {}

    def record_detection_start(self, model_type: str) -> str:
        """
        Record the start of a detection.

        Args:
            model_type: Type of model being used.

        Returns:
            Tracking ID for this detection.
        """
        active_detections.inc()
        tracking_id = f"{model_type}_{time.time()}"
        return tracking_id

    def record_detection_complete(self, tracking_id: str, model_type: str,
                                 duration: float, success: bool,
                                 num_logos: int = 0) -> None:
        """
        Record completion of a detection.

        Args:
            tracking_id: Detection tracking ID.
            model_type: Type of model used.
            duration: Processing duration in seconds.
            success: Whether detection succeeded.
            num_logos: Number of logos detected.
        """
        active_detections.dec()

        status = "success" if success else "failed"
        detection_counter.labels(model_type=model_type, status=status).inc()
        detection_duration.labels(model_type=model_type).observe(duration)

        # Record in history
        self.detection_history.append({
            "timestamp": datetime.utcnow(),
            "model_type": model_type,
            "duration": duration,
            "success": success,
            "num_logos": num_logos
        })

        # Keep only last 1000 entries
        if len(self.detection_history) > 1000:
            self.detection_history = self.detection_history[-1000:]

        logger.debug(f"Detection {tracking_id} completed in {duration:.2f}s, "
                    f"status: {status}, logos: {num_logos}")

    def record_logo_detected(self, brand_name: str, category: str,
                            confidence: float, model_type: str) -> None:
        """
        Record a detected logo.

        Args:
            brand_name: Name of the detected brand.
            category: Category of the logo.
            confidence: Detection confidence score.
            model_type: Model that made the detection.
        """
        logos_detected_counter.labels(
            brand_name=brand_name,
            category=category
        ).inc()

        detection_confidence.labels(model_type=model_type).observe(confidence)

    def update_cache_metrics(self, hits: int, misses: int) -> None:
        """
        Update cache hit rate metrics.

        Args:
            hits: Number of cache hits.
            misses: Number of cache misses.
        """
        total = hits + misses
        if total > 0:
            hit_rate = hits / total
            cache_hit_rate.set(hit_rate)
            logger.debug(f"Cache hit rate: {hit_rate:.2%}")

    def record_model_load(self, model_type: str, load_time: float,
                         version: str) -> None:
        """
        Record model loading metrics.

        Args:
            model_type: Type of model loaded.
            load_time: Time taken to load model in seconds.
            version: Model version.
        """
        model_load_time.labels(model_type=model_type).observe(load_time)
        self.model_versions[model_type] = version

        model_info.info({
            'model_type': model_type,
            'version': version,
            'load_time': str(load_time)
        })

        logger.info(f"Model {model_type} v{version} loaded in {load_time:.2f}s")

    def record_error(self, error_type: str, model_type: str) -> None:
        """
        Record detection errors.

        Args:
            error_type: Type of error that occurred.
            model_type: Model where error occurred.
        """
        key = f"{model_type}_{error_type}"
        self.error_counts[key] = self.error_counts.get(key, 0) + 1

        detection_counter.labels(
            model_type=model_type,
            status=f"error_{error_type}"
        ).inc()

        logger.error(f"Detection error: {error_type} in {model_type}")

    def update_gpu_memory(self, device: str, memory_bytes: int) -> None:
        """
        Update GPU memory usage metrics.

        Args:
            device: GPU device name.
            memory_bytes: Memory usage in bytes.
        """
        gpu_memory_usage.labels(device=device).set(memory_bytes)

    def get_performance_summary(self) -> Dict[str, Any]:
        """
        Get performance summary statistics.

        Returns:
            Dictionary with performance metrics.
        """
        if not self.detection_history:
            return {
                "message": "No detection history available",
                "uptime_seconds": time.time() - self.start_time
            }

        recent_history = [
            d for d in self.detection_history
            if d["timestamp"] > datetime.utcnow() - timedelta(hours=1)
        ]

        if not recent_history:
            return {
                "message": "No recent detections in the last hour",
                "uptime_seconds": time.time() - self.start_time
            }

        durations = [d["duration"] for d in recent_history]
        success_rate = sum(1 for d in recent_history if d["success"]) / len(recent_history)
        avg_logos = sum(d["num_logos"] for d in recent_history) / len(recent_history)

        return {
            "last_hour_stats": {
                "total_detections": len(recent_history),
                "success_rate": round(success_rate, 3),
                "average_duration": round(sum(durations) / len(durations), 3),
                "p50_duration": round(sorted(durations)[len(durations) // 2], 3),
                "p95_duration": round(sorted(durations)[int(len(durations) * 0.95)], 3),
                "p99_duration": round(sorted(durations)[int(len(durations) * 0.99)], 3),
                "average_logos_per_image": round(avg_logos, 2)
            },
            "errors": self.error_counts,
            "model_versions": self.model_versions,
            "uptime_seconds": round(time.time() - self.start_time, 2)
        }

    def get_model_comparison(self) -> Dict[str, Any]:
        """
        Compare performance across different models.

        Returns:
            Model comparison statistics.
        """
        model_stats = {}

        for detection in self.detection_history:
            model = detection["model_type"]
            if model not in model_stats:
                model_stats[model] = {
                    "count": 0,
                    "total_duration": 0,
                    "successes": 0,
                    "total_logos": 0
                }

            model_stats[model]["count"] += 1
            model_stats[model]["total_duration"] += detection["duration"]
            if detection["success"]:
                model_stats[model]["successes"] += 1
            model_stats[model]["total_logos"] += detection["num_logos"]

        # Calculate averages
        comparison = {}
        for model, stats in model_stats.items():
            if stats["count"] > 0:
                comparison[model] = {
                    "total_detections": stats["count"],
                    "success_rate": round(stats["successes"] / stats["count"], 3),
                    "average_duration": round(stats["total_duration"] / stats["count"], 3),
                    "average_logos": round(stats["total_logos"] / stats["count"], 2)
                }

        return comparison

    def check_health(self) -> Dict[str, Any]:
        """
        Check health status of detection service.

        Returns:
            Health status dictionary.
        """
        # Calculate recent metrics
        recent = [
            d for d in self.detection_history[-100:]
            if d["timestamp"] > datetime.utcnow() - timedelta(minutes=5)
        ]

        if not recent:
            return {
                "status": "idle",
                "message": "No recent activity",
                "active_detections": active_detections._value
            }

        # Check for high error rate
        error_rate = 1.0 - (sum(1 for d in recent if d["success"]) / len(recent))

        if error_rate > 0.1:  # More than 10% errors
            return {
                "status": "degraded",
                "message": f"High error rate: {error_rate:.1%}",
                "active_detections": active_detections._value,
                "recent_errors": list(self.error_counts.keys())[-5:]
            }

        # Check for slow processing
        avg_duration = sum(d["duration"] for d in recent) / len(recent)

        if avg_duration > 5.0:  # Slower than 5 seconds average
            return {
                "status": "slow",
                "message": f"Slow processing: {avg_duration:.1f}s average",
                "active_detections": active_detections._value
            }

        return {
            "status": "healthy",
            "message": "Service operating normally",
            "active_detections": active_detections._value,
            "recent_stats": {
                "detections": len(recent),
                "avg_duration": round(avg_duration, 2),
                "error_rate": round(error_rate, 3)
            }
        }


# Global metrics instance
detection_metrics = DetectionMetrics()