"""
Application Performance Monitoring (APM) solution.
Provides comprehensive monitoring, tracing, and alerting capabilities.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import aiohttp
import psutil
import redis
from datadog import initialize, statsd
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_client import Counter, Gauge, Histogram, Summary, generate_latest
from pydantic import BaseModel


class MetricType(Enum):
    """Types of metrics collected."""

    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


class AlertSeverity(Enum):
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class PerformanceMetrics(BaseModel):
    """Performance metrics model."""

    timestamp: str
    endpoint: str
    method: str
    status_code: int
    response_time_ms: float
    cpu_percent: float
    memory_percent: float
    error: Optional[str] = None
    trace_id: Optional[str] = None
    user_id: Optional[str] = None


class Alert(BaseModel):
    """Alert model."""

    id: str
    severity: AlertSeverity
    title: str
    message: str
    metric: str
    threshold: float
    current_value: float
    timestamp: str
    resolved: bool = False
    resolved_at: Optional[str] = None


class APMConfig:
    """APM configuration."""

    # DataDog configuration
    DATADOG_API_KEY = "your-datadog-api-key"
    DATADOG_APP_KEY = "your-datadog-app-key"
    DATADOG_HOST = "https://api.datadoghq.com"

    # OpenTelemetry configuration
    OTLP_ENDPOINT = "localhost:4317"
    SERVICE_NAME = "logo-recognition-api"

    # Prometheus configuration
    PROMETHEUS_PORT = 9090

    # Alert thresholds
    ALERT_THRESHOLDS = {
        "error_rate": 0.05,  # 5% error rate
        "response_time_p95": 1000,  # 1 second
        "cpu_usage": 80,  # 80%
        "memory_usage": 85,  # 85%
        "queue_depth": 1000,  # 1000 items
        "model_accuracy": 0.85,  # 85% minimum
    }

    # Monitoring intervals
    METRICS_INTERVAL = 10  # seconds
    HEALTH_CHECK_INTERVAL = 30  # seconds
    CLEANUP_INTERVAL = 3600  # 1 hour


class MetricsCollector:
    """Collects and aggregates metrics."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url, decode_responses=True)

        # Prometheus metrics
        self.request_count = Counter(
            "http_requests_total",
            "Total HTTP requests",
            ["method", "endpoint", "status"]
        )

        self.request_duration = Histogram(
            "http_request_duration_seconds",
            "HTTP request duration",
            ["method", "endpoint"]
        )

        self.active_connections = Gauge(
            "active_connections",
            "Number of active connections"
        )

        self.error_rate = Gauge(
            "error_rate",
            "Current error rate"
        )

        self.model_accuracy = Gauge(
            "model_accuracy",
            "Current model accuracy",
            ["model_id"]
        )

        self.training_jobs = Gauge(
            "training_jobs",
            "Number of training jobs",
            ["status"]
        )

        self.annotation_operations = Counter(
            "annotation_operations_total",
            "Total annotation operations",
            ["operation"]
        )

        # In-memory metrics storage
        self.metrics_buffer = deque(maxlen=10000)
        self.error_counts = defaultdict(int)
        self.response_times = defaultdict(list)

    def record_request(
        self,
        method: str,
        endpoint: str,
        status_code: int,
        response_time: float,
        error: Optional[str] = None,
        trace_id: Optional[str] = None,
        user_id: Optional[str] = None
    ):
        """Record HTTP request metrics."""
        # Update Prometheus metrics
        self.request_count.labels(
            method=method,
            endpoint=endpoint,
            status=str(status_code)
        ).inc()

        self.request_duration.labels(
            method=method,
            endpoint=endpoint
        ).observe(response_time / 1000)  # Convert to seconds

        # Record error
        if status_code >= 400:
            self.error_counts[endpoint] += 1

        # Store response time
        self.response_times[endpoint].append(response_time)
        if len(self.response_times[endpoint]) > 1000:
            self.response_times[endpoint] = self.response_times[endpoint][-1000:]

        # Create metric object
        metric = PerformanceMetrics(
            timestamp=datetime.now(timezone.utc).isoformat(),
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            response_time_ms=response_time,
            cpu_percent=psutil.cpu_percent(),
            memory_percent=psutil.virtual_memory().percent,
            error=error,
            trace_id=trace_id,
            user_id=user_id
        )

        # Buffer metric
        self.metrics_buffer.append(metric)

        # Store in Redis
        metric_key = f"metrics:{endpoint}:{int(time.time())}"
        self.redis.setex(
            metric_key,
            3600,  # 1 hour TTL
            json.dumps(metric.dict())
        )

        # Update error rate
        self._update_error_rate()

    def _update_error_rate(self):
        """Update current error rate."""
        total_requests = sum(
            self.request_count._metrics.values()
        ) if self.request_count._metrics else 0

        error_requests = sum(
            count for (method, endpoint, status), count
            in self.request_count._metrics.items()
            if int(status) >= 400
        ) if self.request_count._metrics else 0

        if total_requests > 0:
            rate = error_requests / total_requests
            self.error_rate.set(rate)

    def record_model_metrics(
        self,
        model_id: str,
        accuracy: float,
        precision: float,
        recall: float
    ):
        """Record model performance metrics."""
        self.model_accuracy.labels(model_id=model_id).set(accuracy)

        # Store in Redis for history
        metric_key = f"model_metrics:{model_id}:{int(time.time())}"
        self.redis.setex(
            metric_key,
            86400,  # 24 hours
            json.dumps({
                "accuracy": accuracy,
                "precision": precision,
                "recall": recall,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        )

    def record_training_job(self, status: str, job_id: str):
        """Record training job metrics."""
        self.training_jobs.labels(status=status).inc()

        # Store job status
        job_key = f"training_job:{job_id}"
        self.redis.setex(
            job_key,
            86400,
            json.dumps({
                "status": status,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        )

    def record_annotation_operation(
        self,
        operation: str,
        count: int = 1,
        dataset_id: Optional[str] = None
    ):
        """Record annotation operations."""
        self.annotation_operations.labels(operation=operation).inc(count)

        if dataset_id:
            op_key = f"annotation_op:{dataset_id}:{operation}"
            self.redis.incr(op_key, count)
            self.redis.expire(op_key, 3600)

    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get summary of current metrics."""
        # Calculate percentiles for response times
        percentiles = {}
        for endpoint, times in self.response_times.items():
            if times:
                sorted_times = sorted(times)
                percentiles[endpoint] = {
                    "p50": sorted_times[len(times) // 2],
                    "p95": sorted_times[int(len(times) * 0.95)],
                    "p99": sorted_times[int(len(times) * 0.99)]
                }

        return {
            "total_requests": sum(self.request_count._metrics.values())
            if self.request_count._metrics else 0,
            "error_rate": self.error_rate._value if hasattr(self.error_rate, '_value') else 0,
            "active_connections": self.active_connections._value
            if hasattr(self.active_connections, '_value') else 0,
            "response_time_percentiles": percentiles,
            "system_metrics": {
                "cpu_percent": psutil.cpu_percent(),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_usage": psutil.disk_usage("/").percent,
            }
        }


class AlertManager:
    """Manages alerts and notifications."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url, decode_responses=True)
        self.config = APMConfig()
        self.active_alerts: Dict[str, Alert] = {}

    def check_thresholds(self, metrics: Dict[str, Any]):
        """Check if metrics exceed thresholds."""
        alerts = []

        # Check error rate
        error_rate = metrics.get("error_rate", 0)
        if error_rate > self.config.ALERT_THRESHOLDS["error_rate"]:
            alerts.append(
                self._create_alert(
                    severity=AlertSeverity.WARNING,
                    title="High Error Rate",
                    message=f"Error rate is {error_rate:.2%}, threshold is {self.config.ALERT_THRESHOLDS['error_rate']:.2%}",
                    metric="error_rate",
                    threshold=self.config.ALERT_THRESHOLDS["error_rate"],
                    current_value=error_rate
                )
            )

        # Check response times
        for endpoint, percentiles in metrics.get("response_time_percentiles", {}).items():
            p95 = percentiles.get("p95", 0)
            if p95 > self.config.ALERT_THRESHOLDS["response_time_p95"]:
                alerts.append(
                    self._create_alert(
                        severity=AlertSeverity.WARNING,
                        title=f"Slow Response Time: {endpoint}",
                        message=f"P95 response time is {p95:.0f}ms, threshold is {self.config.ALERT_THRESHOLDS['response_time_p95']:.0f}ms",
                        metric=f"response_time_p95_{endpoint}",
                        threshold=self.config.ALERT_THRESHOLDS["response_time_p95"],
                        current_value=p95
                    )
                )

        # Check system resources
        system = metrics.get("system_metrics", {})
        cpu = system.get("cpu_percent", 0)
        if cpu > self.config.ALERT_THRESHOLDS["cpu_usage"]:
            alerts.append(
                self._create_alert(
                    severity=AlertSeverity.ERROR if cpu > 90 else AlertSeverity.WARNING,
                    title="High CPU Usage",
                    message=f"CPU usage is {cpu:.1f}%, threshold is {self.config.ALERT_THRESHOLDS['cpu_usage']:.1f}%",
                    metric="cpu_usage",
                    threshold=self.config.ALERT_THRESHOLDS["cpu_usage"],
                    current_value=cpu
                )
            )

        memory = system.get("memory_percent", 0)
        if memory > self.config.ALERT_THRESHOLDS["memory_usage"]:
            alerts.append(
                self._create_alert(
                    severity=AlertSeverity.ERROR if memory > 95 else AlertSeverity.WARNING,
                    title="High Memory Usage",
                    message=f"Memory usage is {memory:.1f}%, threshold is {self.config.ALERT_THRESHOLDS['memory_usage']:.1f}%",
                    metric="memory_usage",
                    threshold=self.config.ALERT_THRESHOLDS["memory_usage"],
                    current_value=memory
                )
            )

        return alerts

    def _create_alert(
        self,
        severity: AlertSeverity,
        title: str,
        message: str,
        metric: str,
        threshold: float,
        current_value: float
    ) -> Alert:
        """Create alert object."""
        import uuid

        alert = Alert(
            id=str(uuid.uuid4()),
            severity=severity,
            title=title,
            message=message,
            metric=metric,
            threshold=threshold,
            current_value=current_value,
            timestamp=datetime.now(timezone.utc).isoformat()
        )

        # Check if alert already exists
        if metric not in self.active_alerts:
            self.active_alerts[metric] = alert
            self._send_notification(alert)
        else:
            # Update existing alert
            self.active_alerts[metric].current_value = current_value
            self.active_alerts[metric].timestamp = alert.timestamp

        # Store in Redis
        alert_key = f"alert:{alert.id}"
        self.redis.setex(
            alert_key,
            86400,
            json.dumps(alert.dict())
        )

        return alert

    def resolve_alert(self, metric: str):
        """Resolve an active alert."""
        if metric in self.active_alerts:
            alert = self.active_alerts[metric]
            alert.resolved = True
            alert.resolved_at = datetime.now(timezone.utc).isoformat()

            # Update in Redis
            alert_key = f"alert:{alert.id}"
            self.redis.setex(
                alert_key,
                86400,
                json.dumps(alert.dict())
            )

            # Remove from active alerts
            del self.active_alerts[metric]

    def _send_notification(self, alert: Alert):
        """Send alert notification."""
        # Log alert
        logging.warning(f"Alert: {alert.title} - {alert.message}")

        # Send to monitoring services
        if alert.severity in [AlertSeverity.ERROR, AlertSeverity.CRITICAL]:
            # Send to PagerDuty, Slack, etc.
            self._send_to_slack(alert)
            self._send_to_pagerduty(alert)

        # Send to DataDog
        statsd.event(
            alert.title,
            alert.message,
            alert_type="error" if alert.severity == AlertSeverity.ERROR else "warning",
            tags=[f"metric:{alert.metric}", f"severity:{alert.severity.value}"]
        )

    async def _send_to_slack(self, alert: Alert):
        """Send alert to Slack."""
        webhook_url = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

        payload = {
            "text": f"🚨 *{alert.title}*",
            "attachments": [{
                "color": "danger" if alert.severity in [AlertSeverity.ERROR, AlertSeverity.CRITICAL] else "warning",
                "fields": [
                    {"title": "Message", "value": alert.message, "short": False},
                    {"title": "Metric", "value": alert.metric, "short": True},
                    {"title": "Current Value", "value": str(alert.current_value), "short": True},
                    {"title": "Threshold", "value": str(alert.threshold), "short": True},
                    {"title": "Severity", "value": alert.severity.value, "short": True}
                ],
                "timestamp": alert.timestamp
            }]
        }

        async with aiohttp.ClientSession() as session:
            try:
                await session.post(webhook_url, json=payload)
            except Exception as e:
                logging.error(f"Failed to send Slack notification: {e}")

    async def _send_to_pagerduty(self, alert: Alert):
        """Send alert to PagerDuty."""
        if alert.severity not in [AlertSeverity.ERROR, AlertSeverity.CRITICAL]:
            return

        routing_key = "YOUR_PAGERDUTY_ROUTING_KEY"
        url = "https://events.pagerduty.com/v2/enqueue"

        payload = {
            "routing_key": routing_key,
            "event_action": "trigger",
            "payload": {
                "summary": alert.title,
                "source": "APM",
                "severity": alert.severity.value,
                "custom_details": {
                    "message": alert.message,
                    "metric": alert.metric,
                    "current_value": alert.current_value,
                    "threshold": alert.threshold
                }
            }
        }

        async with aiohttp.ClientSession() as session:
            try:
                await session.post(url, json=payload)
            except Exception as e:
                logging.error(f"Failed to send PagerDuty alert: {e}")


class APMService:
    """Main APM service orchestrator."""

    def __init__(self):
        self.metrics_collector = MetricsCollector()
        self.alert_manager = AlertManager()
        self.tracer = self._setup_tracing()
        self._setup_datadog()
        self._setup_instrumentations()

    def _setup_tracing(self):
        """Setup OpenTelemetry tracing."""
        resource = Resource.create({
            "service.name": APMConfig.SERVICE_NAME,
            "service.version": "1.0.0",
            "deployment.environment": "production"
        })

        provider = TracerProvider(resource=resource)
        processor = BatchSpanProcessor(
            OTLPSpanExporter(endpoint=APMConfig.OTLP_ENDPOINT, insecure=True)
        )
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)

        return trace.get_tracer(__name__)

    def _setup_datadog(self):
        """Setup DataDog integration."""
        initialize(
            api_key=APMConfig.DATADOG_API_KEY,
            app_key=APMConfig.DATADOG_APP_KEY
        )

    def _setup_instrumentations(self):
        """Setup automatic instrumentations."""
        # FastAPI
        FastAPIInstrumentor.instrument()

        # Redis
        RedisInstrumentor.instrument()

        # SQLAlchemy
        SQLAlchemyInstrumentor.instrument()

    async def run_monitoring_loop(self):
        """Run continuous monitoring loop."""
        while True:
            try:
                # Collect metrics
                metrics = self.metrics_collector.get_metrics_summary()

                # Check thresholds and create alerts
                alerts = self.alert_manager.check_thresholds(metrics)

                # Send metrics to DataDog
                for key, value in metrics.items():
                    if isinstance(value, (int, float)):
                        statsd.gauge(f"app.{key}", value)

                # Sleep
                await asyncio.sleep(APMConfig.METRICS_INTERVAL)

            except Exception as e:
                logging.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(APMConfig.METRICS_INTERVAL)

    def get_prometheus_metrics(self) -> bytes:
        """Get metrics in Prometheus format."""
        return generate_latest()

    def get_health_status(self) -> Dict[str, Any]:
        """Get application health status."""
        try:
            metrics = self.metrics_collector.get_metrics_summary()
            return {
                "status": "healthy" if metrics["error_rate"] < 0.05 else "degraded",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "metrics": metrics,
                "active_alerts": [
                    alert.dict() for alert in self.alert_manager.active_alerts.values()
                ]
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }


# Global APM instance
apm = APMService()


# FastAPI middleware for automatic request tracking
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class APMMiddleware(BaseHTTPMiddleware):
    """Middleware for automatic APM tracking."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()
        trace_id = None

        # Start trace
        with apm.tracer.start_as_current_span(
            f"{request.method} {request.url.path}"
        ) as span:
            trace_id = span.get_span_context().trace_id

            try:
                response = await call_next(request)
                response_time = (time.time() - start_time) * 1000

                # Record metrics
                apm.metrics_collector.record_request(
                    method=request.method,
                    endpoint=request.url.path,
                    status_code=response.status_code,
                    response_time=response_time,
                    trace_id=hex(trace_id) if trace_id else None,
                    user_id=getattr(request.state, "user_id", None)
                )

                # Add trace ID to response
                response.headers["X-Trace-ID"] = hex(trace_id) if trace_id else ""

                return response

            except Exception as e:
                response_time = (time.time() - start_time) * 1000

                # Record error
                apm.metrics_collector.record_request(
                    method=request.method,
                    endpoint=request.url.path,
                    status_code=500,
                    response_time=response_time,
                    error=str(e),
                    trace_id=hex(trace_id) if trace_id else None
                )

                # Log exception
                logging.error(f"Request error: {traceback.format_exc()}")

                raise