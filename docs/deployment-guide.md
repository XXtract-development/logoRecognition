# Deployment Gids

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive

---

## Deployment Platforms

Het project ondersteunt meerdere deployment methoden:

1. **Docker Compose** — Lokaal / klein formaat
2. **Coolify** — Managed deployment
3. **AWS EKS (Kubernetes)** — Productie schaal

---

## Docker Deployment

### Basis Stack

```bash
docker-compose up -d
```

Bevat: Web Frontend (port 3000) + API Backend (port 8000)

### Volledige Stack

```bash
docker-compose -f docker-compose.full.yml up -d
```

Bevat: Alle services inclusief PostgreSQL, Redis, MinIO, Prometheus, Grafana, Loki, pgAdmin, Redis Insight.

### Dockerfiles

| Service | Bestand | Basis Image | Poort |
|---------|---------|-------------|-------|
| Web Frontend | `apps/web/Dockerfile` | Node.js | 3000 |
| API Backend | `apps/api/Dockerfile` | Node.js | 8000 |
| ML Service | `apps/ml-service/Dockerfile` | python:3.11-slim (multi-stage) | 8001 |

---

## CI/CD Pipelines (GitHub Actions)

### Hoofd Pipeline (`ci-cd.yml`)
1. **test-node** — Node.js unit tests
2. **test-ml-service** — Python ML tests
3. **test-e2e** — Playwright browser tests
4. **build-images** — Docker image builds
5. **security-scan** — Dependency en code scanning
6. **deploy-staging** — Staging deployment
7. **deploy-production** — Productie deployment

### Coolify Deployment (`deploy-coolify.yml`)
- Frontend en backend apart deployen
- Slack notificaties

### AWS EKS Deployment (`deploy-production.yaml`)
- Kubernetes deployment met automatische rollback
- Smoke tests na deployment

### Security Pipeline (`security-a-plus-plus.yml`)
- Dagelijkse security scans
- Dependencies, code quality, penetration tests
- OWASP Top 10, GDPR, SOC2, ISO 27001 compliance

---

## Kubernetes Configuratie

### Manifests (`infrastructure/kubernetes/`)

| Resource | Beschrijving |
|----------|-------------|
| api-deployment | 3 replicas, HPA 3-20 |
| api-service | ClusterIP |
| celery-deployment | Background workers |
| postgres-statefulset | PostgreSQL met pgvector |
| redis-deployment | Redis cache |

### Health Probes
- **Readiness:** GET /health/ready (controleert ML service)
- **Liveness:** GET /health/live

---

## Infrastructure as Code

### Terraform (`infrastructure/terraform/`)
- Cloud infrastructuur definities
- Netwerking, compute, storage
- Database provisioning
- Monitoring stack

### Docker Configuraties (`infrastructure/docker/`)
- PostgreSQL init script (pgvector extensie, vector embeddings tabel, IVFFlat indexing)
- Prometheus configuratie
- Nginx met ModSecurity WAF
- Redis master configuratie

---

## Monitoring Stack

| Component | Versie | Poort | Doel |
|-----------|--------|-------|------|
| Prometheus | 3.0.1 | 9090 | Metrics verzameling |
| Grafana | 11.4.0 | 3001 | Dashboards |
| Jaeger | Latest | 16686 | Distributed tracing |
| OpenSearch | 2.18.0 | 9200 | Log search |
| OpenSearch Dashboards | 2.18.0 | 5601 | Log visualisatie |
| Loki | Latest | - | Log aggregatie |

---

## Kwaliteitspoorten

| Categorie | Drempel |
|-----------|---------|
| Code Coverage | 80-90% minimum |
| Auth Module Coverage | 100% |
| API Latency (p95) | <200ms |
| API Latency (p99) | <500ms |
| Error Rate | <1% |
| Security | OWASP Top 10 compliant |

---

## Scripts

| Script | Pad | Beschrijving |
|--------|-----|-------------|
| start-dev.sh | `scripts/start-dev.sh` | Development startup met prerequisite checks |
| start_backend.sh | `scripts/deployment/start_backend.sh` | Backend opstarten |
| start_uat.sh | `scripts/deployment/start_uat.sh` | UAT omgeving starten |
| run_comprehensive_tests.sh | `scripts/testing/run_comprehensive_tests.sh` | Alle tests uitvoeren |
| qa_validation_a_plus_plus.sh | `scripts/qa/qa_validation_a_plus_plus.sh` | QA validatie |
