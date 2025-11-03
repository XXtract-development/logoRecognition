# US-013-A++: Production Monitoring & Observability (New Story)

**Sprint:** 2
**Points:** 2
**Epic:** EPIC-004 (Infrastructure)
**Assignee:** DevOps Engineer
**Priority:** 🔴 CRITICAL
**Status:** 🚀 A++ READY

---

## 📋 User Story

**As an** Operations Team
**I want to** have complete visibility into production systems
**So that** we can maintain 99.99% uptime and detect issues before users

---

## 🎯 A++ Acceptance Criteria

```gherkin
GIVEN the production system is running
WHEN metrics are collected
THEN all KPIs are visible in real-time dashboards

GIVEN an anomaly occurs
WHEN thresholds are exceeded
THEN alerts trigger within 30 seconds

GIVEN a service degrades
WHEN SLO is violated
THEN automatic remediation attempts begin

GIVEN an incident occurs
WHEN investigating the issue
THEN distributed traces show the complete request flow
```

---

## 🚀 A++ Implementation Plan

### Day 4: Full Implementation
```yaml
Hours 1-2: Prometheus Setup
  - Deploy Prometheus server
  - Configure service discovery
  - Setup metric exporters
  - Create recording rules

Hours 3-4: Grafana Dashboards
  - Import dashboard templates
  - Create custom dashboards
  - Setup alerting panels
  - Configure data sources

Hours 5-6: Alert Configuration
  - Define alert rules
  - Setup PagerDuty integration
  - Configure Slack notifications
  - Create escalation policies

Hours 7-8: Distributed Tracing
  - Deploy Jaeger
  - Instrument services
  - Setup sampling
  - Create trace dashboards
```

---

## 💻 Technical Implementation

### Prometheus Configuration
```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'production'
    region: 'us-east-1'

# Alert manager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

# Recording rules for optimized queries
rule_files:
  - '/etc/prometheus/rules/*.yml'

scrape_configs:
  # Backend services
  - job_name: 'backend'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - production
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)

  # ML services with GPU metrics
  - job_name: 'ml-service'
    static_configs:
      - targets: ['ml-service:8001']
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'gpu_.*'
        action: keep

  # MinIO storage
  - job_name: 'minio'
    bearer_token: '${MINIO_PROMETHEUS_TOKEN}'
    metrics_path: /minio/v2/metrics/cluster
    static_configs:
      - targets: ['minio:9000']

  # Node exporters
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Custom Metrics Implementation
```python
# monitoring/metrics.py
from prometheus_client import Counter, Histogram, Gauge, Summary
from functools import wraps
import time

# Business metrics
detection_counter = Counter(
    'logo_detections_total',
    'Total number of logo detections',
    ['model_version', 'logo_class', 'confidence_bucket']
)

detection_latency = Histogram(
    'detection_latency_seconds',
    'Logo detection latency',
    ['model_version', 'batch_size'],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)

active_models = Gauge(
    'active_model_versions',
    'Currently active model versions',
    ['version', 'status']
)

gpu_utilization = Gauge(
    'gpu_utilization_percent',
    'GPU utilization percentage',
    ['gpu_id', 'metric_type']
)

storage_usage = Gauge(
    'storage_usage_bytes',
    'Storage usage in bytes',
    ['bucket', 'tier']
)

# SLO metrics
slo_availability = Gauge(
    'slo_availability_ratio',
    'Service availability SLO',
    ['service', 'window']
)

error_budget = Gauge(
    'error_budget_remaining',
    'Remaining error budget',
    ['service', 'slo_target']
)

# Decorator for automatic metrics
def track_metrics(model_version=None):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()

            try:
                result = await func(*args, **kwargs)

                # Track successful detection
                if result and 'detections' in result:
                    for detection in result['detections']:
                        confidence_bucket = 'high' if detection['confidence'] > 0.9 else 'medium'
                        detection_counter.labels(
                            model_version=model_version or 'unknown',
                            logo_class=detection['class'],
                            confidence_bucket=confidence_bucket
                        ).inc()

                return result

            except Exception as e:
                # Track errors
                detection_counter.labels(
                    model_version=model_version or 'unknown',
                    logo_class='error',
                    confidence_bucket='error'
                ).inc()
                raise

            finally:
                # Track latency
                duration = time.time() - start_time
                detection_latency.labels(
                    model_version=model_version or 'unknown',
                    batch_size=kwargs.get('batch_size', 1)
                ).observe(duration)

        return wrapper
    return decorator

# GPU monitoring
class GPUMonitor:
    def __init__(self):
        import pynvml
        pynvml.nvmlInit()
        self.device_count = pynvml.nvmlDeviceGetCount()

    def collect_metrics(self):
        import pynvml

        for i in range(self.device_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)

            # GPU utilization
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_utilization.labels(
                gpu_id=str(i),
                metric_type='compute'
            ).set(util.gpu)

            gpu_utilization.labels(
                gpu_id=str(i),
                metric_type='memory'
            ).set(util.memory)

            # Temperature
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            gpu_utilization.labels(
                gpu_id=str(i),
                metric_type='temperature'
            ).set(temp)
```

### Grafana Dashboard Configuration
```json
{
  "dashboard": {
    "title": "Logo Recognition A++ Dashboard",
    "panels": [
      {
        "title": "Detection Rate",
        "targets": [
          {
            "expr": "rate(logo_detections_total[5m])",
            "legendFormat": "{{logo_class}} - {{confidence_bucket}}"
          }
        ],
        "type": "graph"
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(detection_latency_seconds_bucket[5m]))",
            "legendFormat": "P95 Latency"
          }
        ],
        "type": "gauge",
        "thresholds": {
          "mode": "absolute",
          "steps": [
            { "color": "green", "value": null },
            { "color": "yellow", "value": 0.1 },
            { "color": "red", "value": 0.2 }
          ]
        }
      },
      {
        "title": "Error Budget",
        "targets": [
          {
            "expr": "error_budget_remaining",
            "legendFormat": "{{service}}"
          }
        ],
        "type": "stat",
        "thresholds": {
          "mode": "percentage",
          "steps": [
            { "color": "red", "value": null },
            { "color": "yellow", "value": 10 },
            { "color": "green", "value": 30 }
          ]
        }
      },
      {
        "title": "GPU Utilization",
        "targets": [
          {
            "expr": "gpu_utilization_percent{metric_type='compute'}",
            "legendFormat": "GPU {{gpu_id}}"
          }
        ],
        "type": "timeseries"
      }
    ]
  }
}
```

### Alert Rules
```yaml
# prometheus/rules/alerts.yml
groups:
  - name: detection_alerts
    interval: 30s
    rules:
      - alert: HighDetectionLatency
        expr: |
          histogram_quantile(0.95, rate(detection_latency_seconds_bucket[5m])) > 0.2
        for: 2m
        labels:
          severity: warning
          team: ml
        annotations:
          summary: "High detection latency detected"
          description: "P95 latency is {{ $value }}s (threshold: 200ms)"

      - alert: LowDetectionAccuracy
        expr: |
          rate(logo_detections_total{confidence_bucket="low"}[5m]) /
          rate(logo_detections_total[5m]) > 0.2
        for: 5m
        labels:
          severity: critical
          team: ml
        annotations:
          summary: "Low detection accuracy"
          description: "More than 20% of detections have low confidence"

      - alert: GPUHighTemperature
        expr: gpu_utilization_percent{metric_type="temperature"} > 85
        for: 1m
        labels:
          severity: critical
          team: infrastructure
        annotations:
          summary: "GPU temperature critical"
          description: "GPU {{ $labels.gpu_id }} temperature is {{ $value }}°C"

      - alert: StorageCapacity
        expr: |
          storage_usage_bytes / storage_capacity_bytes > 0.8
        for: 10m
        labels:
          severity: warning
          team: infrastructure
        annotations:
          summary: "Storage capacity warning"
          description: "Storage usage at {{ $value | humanizePercentage }}"

      - alert: ErrorBudgetExhausted
        expr: error_budget_remaining < 10
        for: 5m
        labels:
          severity: critical
          team: all
          page: true
        annotations:
          summary: "Error budget nearly exhausted"
          description: "Only {{ $value }}% error budget remaining for {{ $labels.service }}"
```

### Distributed Tracing
```python
# tracing/instrumentation.py
from opentelemetry import trace
from opentelemetry.exporter.jaeger import JaegerExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

def setup_tracing(service_name: str):
    """Setup distributed tracing with Jaeger"""

    # Create Jaeger exporter
    jaeger_exporter = JaegerExporter(
        agent_host_name="jaeger",
        agent_port=6831,
        max_tag_value_length=65536
    )

    # Setup tracer provider
    provider = TracerProvider()
    processor = BatchSpanProcessor(jaeger_exporter)
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

    # Auto-instrument libraries
    FastAPIInstrumentor.instrument()
    RedisInstrumentor.instrument()
    RequestsInstrumentor.instrument()

    return trace.get_tracer(service_name)

# Usage in service
tracer = setup_tracing("detection-service")

@app.post("/detect")
async def detect_logo(image: UploadFile):
    with tracer.start_as_current_span("detect_logo") as span:
        span.set_attribute("image.size", image.size)
        span.set_attribute("image.filename", image.filename)

        # Preprocessing span
        with tracer.start_as_current_span("preprocessing"):
            preprocessed = await preprocess_image(image)

        # Inference span
        with tracer.start_as_current_span("inference") as inference_span:
            inference_span.set_attribute("model.version", MODEL_VERSION)
            result = await run_inference(preprocessed)

        # Postprocessing span
        with tracer.start_as_current_span("postprocessing"):
            final_result = await postprocess_results(result)

        span.set_attribute("detection.count", len(final_result["detections"]))
        return final_result
```

### SLO Monitoring
```yaml
# slo/definitions.yml
service_level_objectives:
  - name: API Availability
    description: API endpoints should be available
    service: backend
    sli:
      type: availability
      query: |
        sum(rate(http_requests_total{status!~"5.."}[5m])) /
        sum(rate(http_requests_total[5m]))
    target: 0.999  # 99.9%
    window: 30d

  - name: Detection Latency
    description: Detection should be fast
    service: ml-service
    sli:
      type: latency
      query: |
        histogram_quantile(0.95,
          rate(detection_latency_seconds_bucket[5m])
        )
    target: 0.2  # 200ms
    window: 7d

  - name: Storage Durability
    description: No data loss
    service: storage
    sli:
      type: custom
      query: |
        1 - (
          sum(rate(storage_object_lost_total[30d])) /
          sum(rate(storage_object_created_total[30d]))
        )
    target: 0.999999  # 99.9999%
    window: 30d
```

---

## 📊 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Metric Collection | < 15s interval | Prometheus config |
| Alert Latency | < 30s | AlertManager |
| Dashboard Load Time | < 2s | Grafana performance |
| Trace Sampling | 10% traffic | Jaeger config |
| Log Ingestion | < 1min delay | Loki metrics |
| SLO Accuracy | 100% | SLO reports |

---

## ✅ Definition of Done

- [ ] Prometheus deployed and collecting metrics
- [ ] Grafana dashboards created and populated
- [ ] Alert rules configured and tested
- [ ] PagerDuty integration working
- [ ] Slack notifications configured
- [ ] Jaeger tracing operational
- [ ] Custom metrics instrumented
- [ ] SLOs defined and tracked
- [ ] Runbook documentation complete
- [ ] Team trained on dashboards

---

**Status:** A++ READY FOR IMPLEMENTATION
**Last Updated:** Sprint 2 Planning
**Next Review:** Sprint 2, Day 4