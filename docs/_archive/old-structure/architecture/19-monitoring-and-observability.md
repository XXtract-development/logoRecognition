# 19. Monitoring and Observability

## 19.1 Monitoring Stack

- **Frontend Monitoring:** Sentry for error tracking, Google Analytics for usage
- **Backend Monitoring:** Prometheus metrics + Grafana dashboards
- **Error Tracking:** Sentry with source maps for frontend, full stack traces for backend
- **Performance Monitoring:** New Relic APM for full-stack performance insights
- **Log Aggregation:** ELK Stack (Elasticsearch, Logstash, Kibana)
- **Uptime Monitoring:** Pingdom for endpoint availability

## 19.2 Key Metrics

**Frontend Metrics:**
- Core Web Vitals (LCP, FID, CLS)
- JavaScript error rate
- API response times
- User interaction events
- Page load times
- Bundle size tracking

**Backend Metrics:**
- Request rate (req/sec)
- Error rate (5xx errors/min)
- Response time (p50, p95, p99)
- Database query performance
- Cache hit rate
- Queue depth (Celery tasks)
- Model inference time
- Training job duration

**ML-Specific Metrics:**
- Recognition accuracy over time
- Confidence score distribution
- False positive/negative rates
- Model version performance
- Training data growth
- Feedback incorporation rate

## 19.3 Monitoring Implementation

```python