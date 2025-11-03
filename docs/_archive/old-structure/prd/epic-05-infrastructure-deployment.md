# Epic: Infrastructure & Deployment

**Epic ID:** EPIC-05
**Priority:** Critical
**Sprint:** 13-16
**Status:** 📋 Planning

## Overview

The Infrastructure & Deployment epic establishes the complete self-hosted infrastructure using Coolify, container orchestration, CI/CD pipelines, and monitoring systems required for production deployment. This ensures scalability, reliability, and maintainability of the Logo Recognition System while maintaining cost efficiency.

## Key Features

### 1. Coolify Orchestration ✅ Production
- Self-hosted deployment platform setup
- Docker-based service orchestration
- Auto-scaling policies and resource management
- Traefik reverse proxy integration
- Domain management with SSL certificates
- Zero-downtime deployment strategies

### 2. Container Infrastructure ✅ Production
- Docker image optimization (<500MB)
- Multi-stage builds for efficiency
- Container registry integration
- Vulnerability scanning pipeline
- Image versioning and tagging strategy
- Base image security hardening

### 3. CI/CD Pipeline ✅ Production
- GitHub Actions workflows
- Automated testing gates
- Coolify webhook deployments
- Rollback capabilities via Git
- Environment promotion (dev→staging→prod)
- Secret management integration

### 4. Monitoring & Observability ✅ Production
- Prometheus metrics collection
- Grafana dashboards
- Application log aggregation
- Health check monitoring
- Alert management (email/Slack)
- SLA monitoring (99.9% uptime)

### 5. Self-hosted Architecture
- Single server or VPS deployment
- Resource isolation per service
- Database and cache management
- File storage with MinIO
- Backup and disaster recovery
- Cost-effective scaling strategies

### 6. Performance Optimization
- Traefik load balancing
- Database connection pooling
- Redis caching strategy
- ONNX runtime optimization
- Resource limit configuration
- Auto-scaling triggers

## User Stories

### Story 14: Production Deployment
**As a** DevOps Engineer (Sarah)
**I want** automated deployment pipelines via Coolify
**So that** releases are consistent and reliable

**Acceptance Criteria:**
- [ ] One-click deployment to any environment
- [ ] Automatic rollback on failure via Git
- [ ] Zero-downtime deployments through Coolify
- [ ] Deployment takes <10 minutes
- [ ] All secrets managed securely
- [ ] Audit trail for deployments

### Story 15: System Monitoring
**As a** System Administrator
**I want** comprehensive monitoring via Coolify
**So that** I can proactively prevent issues

**Acceptance Criteria:**
- [ ] Real-time metrics dashboard
- [ ] Alert thresholds configured
- [ ] Log aggregation working
- [ ] Performance bottleneck identification
- [ ] Cost monitoring integrated
- [ ] Security scanning automated

### Story 16: Auto-scaling
**As a** Platform Engineer
**I want** automatic scaling via Coolify
**So that** the system handles load efficiently

**Acceptance Criteria:**
- [ ] Container auto-scaling configured
- [ ] Resource-based scaling policies
- [ ] Scale based on custom metrics
- [ ] Cost-optimized scaling decisions
- [ ] Scale-down during low usage
- [ ] Service isolation maintained

### Story 17: Disaster Recovery
**As a** Business Owner
**I want** disaster recovery capabilities
**So that** business continuity is ensured

**Acceptance Criteria:**
- [ ] Automated backups running
- [ ] Multi-location backup storage
- [ ] RTO < 2 hours
- [ ] RPO < 1 hour
- [ ] Disaster recovery drills passed
- [ ] Documentation complete

## Technical Architecture

### Self-hosted Infrastructure
```yaml
Production Server:
  Specifications: 8vCPU, 16GB RAM, 250GB SSD
  Operating System: Ubuntu 22.04 LTS
  Location: EU data center

Coolify Setup:
  Version: 4.0+
  Database: PostgreSQL (for Coolify)
  Reverse Proxy: Traefik
  SSL: Let's Encrypt automatic

Services:
  - Frontend: Static site deployment
  - Backend: Docker service deployment
  - Database: PostgreSQL with pgvector
  - Cache: Redis cluster
  - Storage: MinIO object storage
  - Monitoring: Prometheus + Grafana
```

### Coolify Service Configuration
```yaml
# Frontend Application
frontend:
  type: static-site
  repository: github.com/org/logo-recognition
  build_command: "pnpm install && pnpm build:web"
  output_directory: "frontend/dist"
  domain: "logo-app.yourdomain.com"
  ssl: true

# Backend API
backend:
  type: docker-service
  dockerfile: "backend/Dockerfile"
  domain: "api.logo-app.yourdomain.com"
  port: 8000
  environment:
    - DATABASE_URL=postgresql://user:pass@postgres:5432/logo_recognition
    - REDIS_URL=redis://redis:6379
  healthcheck:
    path: "/health"
    interval: 30s

# Database
postgres:
  type: postgres
  version: "15"
  database: logo_recognition
  extensions: [pgvector]
  backup_schedule: "0 2 * * *"

# Cache
redis:
  type: redis
  version: "7"
  memory_limit: 512MB

# Object Storage
minio:
  type: minio
  access_key: ${MINIO_ACCESS_KEY}
  secret_key: ${MINIO_SECRET_KEY}
  buckets: [images, models, backups]
```

### CI/CD Pipeline
```yaml
name: Deploy to Coolify

on:
  push:
    branches: [main, staging]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          pnpm test
          python -m pytest backend/tests/

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Coolify
        run: |
          curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"ref": "${{ github.ref_name }}"}'
```

## Monitoring Stack

### Metrics to Track
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time | <500ms p95 | >1000ms |
| Error Rate | <0.1% | >1% |
| CPU Usage | <70% | >85% |
| Memory Usage | <80% | >90% |
| Disk Usage | <75% | >85% |
| Queue Depth | <100 | >500 |
| Model Inference Time | <200ms | >500ms |
| Database Connections | <80% | >90% |

### Dashboards
1. **System Overview** - Health status, uptime, error rates
2. **Performance** - Response times, throughput, latency
3. **ML Metrics** - Accuracy, inference time, model versions
4. **Business Metrics** - Usage, recognitions/hour, top users
5. **Cost Analysis** - Resource utilization, efficiency metrics

## Security Implementation

### Security Measures
- Automatic SSL certificates via Let's Encrypt
- Traefik rate limiting and WAF rules
- Container isolation and security policies
- Regular security updates via Coolify
- Backup encryption at rest
- Network firewall configuration
- VPN access for administrative tasks
- Security scanning integration

## Dependencies
- VPS or dedicated server (8vCPU, 16GB RAM minimum)
- Domain name with DNS management
- GitHub repository access
- Email/Slack for notifications
- Backup storage location (S3/MinIO)

## Success Metrics
- Deployment frequency: >2 per week
- Lead time: <2 hours
- MTTR: <30 minutes
- Change failure rate: <5%
- Uptime: 99.9%
- Infrastructure cost: <€100/month

## Risks & Mitigations
- **Single server dependency** → Implement backup server strategy
- **Cost management** → Implement resource monitoring and limits
- **Security vulnerabilities** → Automated scanning and updates
- **Performance bottlenecks** → Load testing and optimization
- **Data loss** → Comprehensive backup strategy

## Timeline
- **Week 13:** Server setup, Coolify installation, domain configuration
- **Week 14:** Service deployment, database setup, basic monitoring
- **Week 15:** CI/CD pipeline, security hardening, backup implementation
- **Week 16:** Load testing, performance optimization, go-live preparation

## Definition of Done
- [ ] All services deployed via Coolify
- [ ] CI/CD pipeline fully automated
- [ ] Monitoring dashboards operational
- [ ] Security scanning passing
- [ ] Load testing completed (1000 req/s)
- [ ] Backup and recovery tested
- [ ] Documentation complete
- [ ] SSL certificates configured
- [ ] Team trained on Coolify operations

## Cost Comparison

### Traditional Cloud vs Coolify
| Component | AWS/Azure Cost | Coolify Self-hosted |
|-----------|---------------|-------------------|
| Compute | €200-500/month | €80/month (VPS) |
| Load Balancer | €25/month | €0 (Traefik included) |
| SSL Certificates | €100/year | €0 (Let's Encrypt) |
| Monitoring | €50/month | €0 (Self-hosted) |
| **Total Monthly** | **€275-575** | **€80-100** |

### Cost Savings: 60-75% reduction

## Migration Benefits

### From Kubernetes to Coolify
- **Simplified Operations:** No Kubernetes complexity
- **Reduced Costs:** 60-75% infrastructure cost reduction
- **Faster Deployment:** Direct Docker deployment
- **Better Control:** Full infrastructure ownership
- **Easier Scaling:** Intuitive scaling controls
- **Integrated Monitoring:** Built-in observability

## Related Documents
- [Technical Architecture](./7-technical-architecture.md)
- [Deployment Architecture](../architecture/14-deployment-architecture.md)
- [Security Requirements](./6-non-functional-requirements.md)
- [Cost Analysis](../architecture/cost-comparison.md)