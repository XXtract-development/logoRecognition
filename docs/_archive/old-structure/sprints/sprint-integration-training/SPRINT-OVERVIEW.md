# Sprint: Training System Integration

**Sprint Goal:** Integreer bestaande training componenten tot een volledig werkend production-ready training systeem

**Sprint Duration:** 3 weken (15 werkdagen)

**Team Capacity:** 1 developer, 8 uur/dag = 120 uur totaal

## Context

Uit de gap analysis blijkt dat **60-70% van de training infrastructuur al bestaat** maar niet geïntegreerd is:

### Bestaande Componenten (NIET aangesloten)
- ✅ `TrainingPipeline` met GPU support, mixed precision, early stopping
- ✅ `EnhancedTrainingPipelineOrchestrator` met A/B testing, drift detection, auto-deployment
- ✅ `TrainingWebSocketManager` voor real-time progress updates
- ✅ Celery infrastructuur met monitoring, queues, metrics
- ✅ Database models (basis velden aanwezig)

### Ontbrekende Integratie
- ❌ Production API endpoints (alleen mock data)
- ❌ Service layer voor business logic
- ❌ Celery tasks voor training (alleen image optimization bestaat)
- ❌ WebSocket verbinding met daadwerkelijke training
- ❌ Notification service
- ❌ 13 database velden

## Sprint Stories (A++ Quality Enhanced)

| ID | Story | ACs | Story Points | Priority | Week | Key Features |
|---|---|---|---|---|---|---|
| US-INT-001 | Database schema migration | 7 | 3 | HIGH | 1 | Rollback verification, monitoring, security |
| US-INT-002 | Production API endpoints | 7 | 5 | HIGH | 1 | JWT auth, rate limiting, CORS |
| US-INT-003 | Service layer | 8 | 5 | HIGH | 1-2 | Optimistic locking, Redis caching |
| US-INT-004 | Celery integration | 7 | 8 | HIGH | 2 | Flower dashboard, DLQ, monitoring |
| US-INT-005 | WebSocket integration | 7 | 3 | MEDIUM | 2 | JWT auth, Redis pub/sub scaling |
| US-INT-006 | Notification service | 7 | 5 | MEDIUM | 3 | Throttling, audit trail, GDPR |
| US-INT-007 | E2E testing | 8 | 8 | HIGH | 3 | CI/CD, Docker Compose, Codecov |

**Total Story Points:** 37
**Total Acceptance Criteria:** 51 (avg 7.3 per story)
**Quality Level:** A++ (production-ready with full security & operational readiness)

## Success Criteria

### Functional Requirements
1. ✅ http://localhost:4001/training laadt LIVE data (geen mock/cache)
2. ✅ Nieuwe training job kan gestart worden via UI
3. ✅ Real-time progress updates via WebSocket
4. ✅ Email/Slack notificaties bij completion/failure
5. ✅ Celery tasks verwerken training asynchroon
6. ✅ Database bevat alle benodigde velden
7. ✅ Volledige end-to-end flow werkt: UI → API → Celery → Training → WebSocket → Notification

### Security Requirements (NEW)
8. ✅ JWT authentication op alle API endpoints (100 req/min rate limit)
9. ✅ WebSocket authentication met token validation
10. ✅ Database credentials in environment variables (SSL/TLS in production)
11. ✅ No sensitive data in notifications (GDPR compliant)
12. ✅ Input validation prevents SQL injection/XSS

### Operational Requirements (NEW)
13. ✅ Monitoring: Prometheus metrics voor API, Celery, WebSocket
14. ✅ Logging: Structured JSON logs met correlation IDs
15. ✅ Health checks: /health endpoints voor alle services
16. ✅ Alerting: Alerts configured voor failures, performance
17. ✅ Runbooks: 7 troubleshooting guides created
18. ✅ CI/CD: GitHub Actions pipeline met Codecov integration

### Quality Requirements
19. ✅ 90%+ test coverage op nieuwe integratie code
20. ✅ All tests pass in CI/CD (< 5 min execution)
21. ✅ Performance benchmarks met: API < 200ms, DB updates < 10ms
22. ✅ Zero JSON file operations detected in all tests

## Technical Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (React)                                              │
│  - TrainingDashboard.tsx ✅                                   │
│  - TrainingLauncher.tsx ✅                                    │
│  - trainingJobsStore.ts ✅                                    │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP + WebSocket
┌────────────────────────▼─────────────────────────────────────┐
│ API Layer (FastAPI) - NEW                                     │
│  - POST /api/v1/training/jobs ❌                              │
│  - GET /api/v1/training/jobs ❌                               │
│  - DELETE /api/v1/training/jobs/{id} ❌                       │
│  - WS /ws/training/{job_id} ✅ (exists, needs integration)   │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│ Service Layer - NEW                                           │
│  - TrainingJobService ❌                                      │
│  - NotificationService ❌                                     │
└────────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼────────┐              ┌─────────▼────────────────────┐
│ Database       │              │ Celery (Redis)               │
│  - TrainingJob │              │  - execute_training_task ❌  │
│    +13 fields ❌│              │  - prepare_data_task ❌      │
└────────────────┘              └──────────┬───────────────────┘
                                           │
                                ┌──────────▼──────────────────┐
                                │ Training Pipeline ✅         │
                                │  - TrainingPipeline          │
                                │  - Enhanced Orchestrator     │
                                └──────────┬──────────────────┘
                                           │
                        ┌──────────────────┴─────────────┐
                        │                                │
                ┌───────▼────────┐              ┌────────▼──────┐
                │ WebSocket ✅    │              │ Notification ❌│
                │  - Manager      │              │  - Email       │
                │    exists       │              │  - Slack       │
                └─────────────────┘              └────────────────┘
```

## Risk Management

### High Risk Items
1. **Database migration rollback:** Maak backup voor migratie
   - **Mitigation:** AC7 added - rollback verified (<5s), backup permissions (chmod 600)

2. **Breaking existing mock endpoints:** Feature flag voor geleidelijke rollout
   - **Mitigation:** Mock endpoints blijven beschikbaar achter feature flag tijdens transitie

3. **WebSocket connection stability:** Implementeer reconnection logic (bestaat al ✅)
   - **Mitigation:** AC7 added - Redis pub/sub scaling, max 1000 connections, heartbeat

4. **Celery worker crashes:** Monitor met Flower, health checks
   - **Mitigation:** AC7 added - Flower dashboard, DLQ, task monitoring, alerts

5. **Security vulnerabilities (NEW):** Authentication bypass, SQL injection
   - **Mitigation:** JWT authentication, rate limiting, input validation, security audits

6. **Performance degradation (NEW):** Slow API responses, database bottlenecks
   - **Mitigation:** Redis caching (60% query reduction), optimistic locking, performance benchmarks

7. **Operational blindness (NEW):** No visibility into production issues
   - **Mitigation:** Prometheus monitoring, structured logging, health checks, 7 runbooks

### Mitigation Strategies
- ✅ Database migration met alembic rollback script + verification tests
- ✅ Extensive logging in alle integratie punten (structured JSON logs)
- ✅ Health checks voor alle async componenten (/health endpoints)
- ✅ Security: JWT auth, rate limiting, input validation, HTTPS only
- ✅ Monitoring: Prometheus metrics, Flower dashboard, Codecov
- ✅ Alerting: PagerDuty/Slack alerts voor failures, performance degradation
- ✅ Runbooks: 7 troubleshooting guides for common issues

## Definition of Done ✅

### Per Story (Standardized 4-Category Structure)

**Functional Requirements:**
- [ ] All acceptance criteria verified (7-8 ACs per story)
- [ ] Code geïmplementeerd volgens acceptance criteria
- [ ] Edge cases handled (errors, timeouts, invalid input)

**Technical Requirements:**
- [ ] Code reviewed and approved
- [ ] Unit tests pass (≥90% coverage)
- [ ] Integration tests pass
- [ ] Performance benchmarks met
- [ ] No security vulnerabilities (SQL injection, XSS)

**Documentation:**
- [ ] Architecture docs updated
- [ ] API documentation updated (OpenAPI/Swagger)
- [ ] Runbook created for troubleshooting
- [ ] README updated where applicable

**Deployment Readiness:**
- [ ] Environment variables configured
- [ ] Monitoring/alerting configured
- [ ] Health checks implemented
- [ ] Database migrations tested

### Per Sprint

**Core Functionality:**
- [ ] Alle 7 stories completed (51 ACs total)
- [ ] End-to-end flow werkend (UI → API → Celery → Training → WS → Notification)
- [ ] Performance test: 10 concurrent jobs

**Security & Operations:**
- [ ] All security considerations addressed (JWT, rate limiting, encryption)
- [ ] All operational readiness items complete (monitoring, logging, alerts)
- [ ] 7 runbooks created and tested

**Quality Assurance:**
- [ ] CI/CD pipeline working (GitHub Actions)
- [ ] Code coverage ≥90% (Codecov reporting)
- [ ] Zero JSON file operations detected
- [ ] All performance targets met

**Deliverables:**
- [ ] Deployment guide geschreven
- [ ] Demo klaar voor stakeholders
- [ ] Retrospective completed

## Sprint Planning

### Week 1: Foundation (US-INT-001, US-INT-002, start US-INT-003)
**Focus:** Database + API endpoints

**Deliverables:**
- Database migratie uitgevoerd
- API endpoints werkend (zonder Celery)
- Service layer basis

### Week 2: Core Integration (US-INT-003, US-INT-004, US-INT-005)
**Focus:** Celery + WebSocket

**Deliverables:**
- Celery tasks verwerken training
- WebSocket connected to pipeline
- Real-time progress updates werkend

### Week 3: Polish & Test (US-INT-006, US-INT-007)
**Focus:** Notificaties + Testing

**Deliverables:**
- Email/Slack notificaties
- Volledige test suite
- Performance tests
- Deployment ready

## Resources

### Existing Code to Reuse
- `backend/app/ml/training/pipeline.py` - TrainingPipeline class
- `backend/app/training/pipeline/enhanced_orchestrator.py` - EnhancedTrainingPipelineOrchestrator
- `backend/app/api/websocket/training_events.py` - TrainingWebSocketManager
- `backend/app/celery_app.py` - Celery configuration
- `frontend/src/store/trainingJobsStore.ts` - Frontend state management

### New Files to Create

**Core Implementation:**
- `backend/app/routers/training_jobs.py` - Production API endpoints (JWT auth, rate limiting)
- `backend/app/services/training_job_service.py` - Business logic (optimistic locking, caching)
- `backend/app/services/notification_service.py` - Email/Slack (throttling, audit trail)
- `backend/app/tasks/training_tasks.py` - Celery tasks for training (DLQ support)
- `backend/alembic/versions/xxx_add_training_fields.py` - Database migration

**Security & Middleware:**
- `backend/app/middleware/rate_limit.py` - Rate limiting middleware (slowapi)
- `backend/app/core/auth.py` - JWT authentication helpers
- `backend/app/api/websocket/pubsub.py` - Redis pub/sub for WebSocket scaling

**Testing & CI/CD:**
- `tests/integration/test_end_to_end_database_only.py` - E2E tests (NO JSON)
- `docker-compose.test.yml` - Test environment (isolated DB)
- `.github/workflows/test.yml` - GitHub Actions CI/CD
- `backend/seeds/test_data.sql` - Test fixtures

**Monitoring & Operations:**
- `backend/app/monitoring/prometheus.py` - Metrics export
- `backend/app/monitoring/health.py` - Health check endpoints
- `docs/runbooks/database-migration.md` - Migration troubleshooting
- `docs/runbooks/api-troubleshooting.md` - API issues
- `docs/runbooks/service-layer-troubleshooting.md` - Service layer issues
- `docs/runbooks/celery-troubleshooting.md` - Celery worker issues
- `docs/runbooks/websocket-troubleshooting.md` - WebSocket connection issues
- `docs/runbooks/notification-troubleshooting.md` - Email/Slack issues
- `docs/runbooks/testing-troubleshooting.md` - Test environment issues

**Configuration:**
- `.env.example` - Environment variables template (SMTP, JWT, etc.)
- `backend/app/core/config.py` - Updated settings (rate limits, Redis, etc.)

## A++ Quality Enhancements Summary

This sprint includes comprehensive production-readiness improvements across all stories:

### Security Enhancements 🔒
- **Authentication:** JWT tokens on all endpoints (API, WebSocket)
- **Authorization:** User-level access control, admin roles
- **Rate Limiting:** 100 req/min API, 10 conn/min WebSocket
- **Input Validation:** SQL injection, XSS prevention
- **Data Privacy:** GDPR compliance, no PII in logs/notifications
- **Encryption:** HTTPS/WSS only in production, database SSL/TLS

### Operational Readiness 📊
- **Monitoring:** Prometheus metrics (API response time, task queue depth, etc.)
- **Logging:** Structured JSON logs with correlation IDs
- **Health Checks:** /health endpoints for API, DB, Redis, Celery
- **Alerting:** PagerDuty/Slack alerts for failures, performance degradation
- **Runbooks:** 7 troubleshooting guides for common production issues
- **Performance:** Benchmarks with targets (API <200ms, DB updates <10ms)

### Testing & CI/CD 🧪
- **Test Environment:** Docker Compose with isolated test database
- **GitHub Actions:** Automated testing on every PR
- **Code Coverage:** Codecov integration (≥90% target)
- **E2E Tests:** Complete flow validation (NO JSON file operations)
- **Performance Tests:** 10 concurrent jobs, benchmark validation

### Advanced Features ⚡
- **Optimistic Locking:** Prevents concurrent update conflicts (version field)
- **Redis Caching:** 60% query reduction (30s TTL)
- **WebSocket Scaling:** Redis pub/sub for multi-server deployment
- **Notification Throttling:** Prevents spam (1 email/hour, 1 Slack/5min)
- **Dead Letter Queue:** Failed Celery tasks captured for debugging
- **Audit Trail:** notification_log table for compliance

### Documentation 📚
- **7 Runbooks:** Production troubleshooting guides
- **API Docs:** OpenAPI/Swagger with authentication examples
- **Architecture Guides:** Updated with security & operational patterns
- **Deployment Guide:** Complete production deployment checklist

## Performance Targets

| Metric | Target | Story |
|--------|--------|-------|
| API Response Time (avg) | < 200ms | US-INT-002 |
| API Response Time (P95) | < 500ms | US-INT-002 |
| Database UPDATE | < 10ms | US-INT-003 |
| WebSocket Latency | < 100ms | US-INT-005 |
| Cache Hit Rate | > 80% | US-INT-003 |
| Concurrent Jobs | 10+ | US-INT-007 |
| Test Execution Time | < 5 min | US-INT-007 |
| Code Coverage | ≥ 90% | All stories |

## Sprint Retrospective Template

**What went well:**
- [To be filled after sprint]

**What could be improved:**
- [To be filled after sprint]

**Action items for next sprint:**
- [To be filled after sprint]

**Quality Metrics Achieved:**
- [ ] All 51 acceptance criteria met
- [ ] 90%+ code coverage achieved
- [ ] All performance targets met
- [ ] Zero security vulnerabilities
- [ ] All 7 runbooks created
- [ ] CI/CD pipeline green

---

**Sprint Start:** [TBD]
**Sprint End:** [TBD]
**Sprint Master:** [TBD]
**Quality Grade:** A++ (Production-Ready)
