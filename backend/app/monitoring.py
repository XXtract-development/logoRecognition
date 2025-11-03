"""
Database Monitoring with Prometheus and Grafana
STORY-001: Database Infrastructure with Monitoring
"""
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from typing import Dict, List, Any, Optional
import time
import json
from datetime import datetime, timedelta


class DatabaseMetrics:
    """Prometheus metrics for database monitoring"""

    def __init__(self):
        # Connection metrics
        self.connection_count = Gauge(
            'pg_connections_active',
            'Number of active database connections'
        )

        # Query metrics
        self.query_duration_histogram = Histogram(
            'pg_query_duration_seconds',
            'Database query duration in seconds',
            ['query_type'],
            buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
        )

        # Vector operation metrics
        self.vector_operations_counter = Counter(
            'pg_vector_operations_total',
            'Total number of vector operations',
            ['operation_type']
        )

        # Pool metrics
        self.pool_size = Gauge(
            'pg_pool_size',
            'Database connection pool size'
        )

        self.pool_available = Gauge(
            'pg_pool_available',
            'Available connections in pool'
        )

        # Performance metrics
        self.cache_hit_ratio = Gauge(
            'pg_cache_hit_ratio',
            'Database cache hit ratio'
        )

        self.replication_lag = Gauge(
            'pg_replication_lag_seconds',
            'Replication lag in seconds'
        )

    def track_query_duration(self, query_type: str, duration: float):
        """Track query execution duration"""
        self.query_duration_histogram.labels(query_type=query_type).observe(duration)

    def increment_vector_operations(self, operation_type: str):
        """Increment vector operation counter"""
        self.vector_operations_counter.labels(operation_type=operation_type).inc()

    def update_connection_metrics(self, active: int, pool_size: int, available: int):
        """Update connection pool metrics"""
        self.connection_count.set(active)
        self.pool_size.set(pool_size)
        self.pool_available.set(available)

    def update_performance_metrics(self, cache_hit_ratio: float, replication_lag: float):
        """Update performance metrics"""
        self.cache_hit_ratio.set(cache_hit_ratio)
        self.replication_lag.set(replication_lag)

    def export(self) -> str:
        """Export metrics in Prometheus format"""
        return generate_latest().decode('utf-8')


class GrafanaDashboard:
    """Grafana dashboard configuration and queries"""

    def __init__(self):
        self.panels = {
            'connections': {
                'title': 'Database Connections',
                'type': 'graph',
                'targets': [
                    {
                        'expr': 'pg_connections_active',
                        'legendFormat': 'Active Connections'
                    }
                ]
            },
            'query_time': {
                'title': 'Query Duration',
                'type': 'graph',
                'targets': [
                    {
                        'expr': 'rate(pg_query_duration_seconds_sum[5m]) / rate(pg_query_duration_seconds_count[5m])',
                        'legendFormat': '{{query_type}}'
                    }
                ]
            },
            'vector_operations': {
                'title': 'Vector Operations',
                'type': 'counter',
                'targets': [
                    {
                        'expr': 'rate(pg_vector_operations_total[5m])',
                        'legendFormat': '{{operation_type}}'
                    }
                ]
            },
            'cache_hit_ratio': {
                'title': 'Cache Hit Ratio',
                'type': 'gauge',
                'targets': [
                    {
                        'expr': 'pg_cache_hit_ratio',
                        'legendFormat': 'Cache Hit %'
                    }
                ]
            },
            'replication_lag': {
                'title': 'Replication Lag',
                'type': 'graph',
                'targets': [
                    {
                        'expr': 'pg_replication_lag_seconds',
                        'legendFormat': 'Lag (seconds)'
                    }
                ]
            }
        }

        # Mock data storage for testing
        self._mock_data = {
            'connections': self._generate_mock_time_series(20, 30),
            'query_time': self._generate_mock_time_series(0.01, 0.05),
            'vector_operations': self._generate_mock_time_series(100, 200),
            'cache_hit_ratio': self._generate_mock_time_series(0.85, 0.95),
            'replication_lag': self._generate_mock_time_series(0.1, 0.5)
        }

    def get_panels(self) -> List[str]:
        """Get list of dashboard panels"""
        return list(self.panels.keys())

    def query_metric(self, metric_name: str, time_range: str = '1h') -> List[Dict[str, Any]]:
        """Query metric data for a specific time range"""
        if metric_name not in self._mock_data:
            return []

        # Return mock data for testing
        return self._mock_data[metric_name]

    def _generate_mock_time_series(self, min_val: float, max_val: float, points: int = 60) -> List[Dict[str, Any]]:
        """Generate mock time series data for testing"""
        import random
        data = []
        base_time = datetime.now() - timedelta(hours=1)

        for i in range(points):
            timestamp = base_time + timedelta(minutes=i)
            value = random.uniform(min_val, max_val)
            data.append({
                'timestamp': timestamp.isoformat(),
                'value': value
            })

        return data

    def export_dashboard_json(self) -> str:
        """Export dashboard configuration as JSON"""
        dashboard_config = {
            'title': 'PostgreSQL Database Monitoring',
            'panels': [],
            'refresh': '5s',
            'time': {
                'from': 'now-6h',
                'to': 'now'
            }
        }

        for i, (key, panel) in enumerate(self.panels.items()):
            dashboard_config['panels'].append({
                'id': i + 1,
                'gridPos': {
                    'x': (i % 2) * 12,
                    'y': (i // 2) * 8,
                    'w': 12,
                    'h': 8
                },
                **panel
            })

        return json.dumps(dashboard_config, indent=2)


class AlertManager:
    """Manage monitoring alerts"""

    def __init__(self):
        self.alert_rules = {
            'high_connection_count': {
                'condition': 'pg_connections_active > 80',
                'severity': 'warning',
                'message': 'Database connection pool usage is high'
            },
            'slow_queries': {
                'condition': 'pg_query_duration_seconds > 0.1',
                'severity': 'warning',
                'message': 'Slow database queries detected'
            },
            'low_cache_hit_ratio': {
                'condition': 'pg_cache_hit_ratio < 0.8',
                'severity': 'warning',
                'message': 'Database cache hit ratio is low'
            },
            'high_replication_lag': {
                'condition': 'pg_replication_lag_seconds > 5',
                'severity': 'critical',
                'message': 'Database replication lag is high'
            }
        }

    def check_alerts(self, metrics: Dict[str, float]) -> List[Dict[str, Any]]:
        """Check metrics against alert rules"""
        triggered_alerts = []

        # Mock alert checking for testing
        if metrics.get('pg_connections_active', 0) > 80:
            triggered_alerts.append({
                'name': 'high_connection_count',
                'severity': 'warning',
                'message': 'Database connection pool usage is high',
                'value': metrics['pg_connections_active']
            })

        return triggered_alerts

    def send_alert(self, alert: Dict[str, Any], channels: List[str]):
        """Send alert to configured channels"""
        for channel in channels:
            if channel == 'slack':
                self._send_slack_alert(alert)
            elif channel == 'pagerduty':
                self._send_pagerduty_alert(alert)
            elif channel == 'email':
                self._send_email_alert(alert)

    def _send_slack_alert(self, alert: Dict[str, Any]):
        """Send alert to Slack"""
        # Mock implementation for testing
        pass

    def _send_pagerduty_alert(self, alert: Dict[str, Any]):
        """Send alert to PagerDuty"""
        # Mock implementation for testing
        pass

    def _send_email_alert(self, alert: Dict[str, Any]):
        """Send alert via email"""
        # Mock implementation for testing
        pass