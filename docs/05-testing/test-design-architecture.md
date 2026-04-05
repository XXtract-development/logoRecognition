---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-04-05'
workflowType: 'testarch-test-design'
inputDocuments:
  - docs/01-product/prd.md
  - docs/02-architecture/overview.md
  - docs/02-architecture/tech-stack.md
  - docs/02-architecture/security.md
  - docs/epics.md
lastValidated: '2026-04-05'
validationReport: docs/05-testing/test-design-validation-report.md
---

# Test Design for Architecture: Logo Recognition System

**Purpose:** Architectural concerns, testability gaps, and NFR requirements for review by Architecture/Dev teams. Serves as a contract between QA and Engineering on what must be addressed before test development begins.

**Date:** 2026-04-03 (updated 2026-04-05)
**Author:** TEA Master Test Architect
**Status:** Architecture Review Pending (validated 2026-04-05)
**Project:** Logo Recognition & Training System
**PRD Reference:** docs/01-product/prd.md (v2.0.0)
**Architecture Reference:** docs/02-architecture/overview.md

---

## Executive Summary

**Scope:** Full system-level test design covering the Logo Recognition & Training System — a multi-layer monorepo with React frontend, Fastify API, and FastAPI ML backend.

**Business Context** (from PRD):

- **Impact:** Industrial logo recognition with >99% accuracy target
- **Problem:** Current solutions require extensive manual annotation, large datasets, and ML expertise
- **Scale:** 10,000+ logo categories, <100ms inference, 1000 req/sec

**Architecture:**

- **Key Decision 1:** Monorepo with pnpm workspaces (apps/web, apps/api, backend/)
- **Key Decision 2:** Fastify API Gateway + FastAPI ML Backend (polyglot architecture)
- **Key Decision 3:** ONNX Runtime for production inference, PyTorch for training

**Expected Scale:**

- 1000 req/sec recognition throughput, 100+ concurrent users, 10,000+ logo categories

**Risk Summary:**

- **Total risks**: 12
- **High-priority (≥6)**: 4 risks requiring immediate mitigation (R-006 downgraded from 6→4 after auth refactor)
- **Test effort**: ~40 test scenarios (~3–5 sprints for 1 QA + dev support)

---

## Quick Guide

### 🚨 BLOCKERS - Team Must Decide

**Pre-Implementation Critical Path** — these MUST be completed before QA can write integration tests:

1. **T-1: ML Backend mock service** — Provide mock/stub endpoints for ML inference and training APIs so API tests can run without a trained model (recommended owner: ML Team)
2. **T-2: Test data seeding** — Implement seeding endpoints or scripts for logos, categories, images, and training data (recommended owner: Backend Team)
3. **T-3: S3/MinIO test configuration** — Provide LocalStack setup or test-mode file storage for CI environments without S3 (recommended owner: DevOps)

**What we need from team:** Complete these 3 items pre-implementation or test development is blocked.

---

### ⚠️ HIGH PRIORITY - Team Should Validate

1. **R-006: Write-operation auth enforcement** — Read endpoints are now public (optionalAuth). Validate that all write endpoints (POST/PATCH/DELETE) enforce authMiddleware. Re-evaluate tenant isolation when multi-tenancy is implemented (Phase 2)
2. **R-009: ONNX model compatibility** — Pin ONNX opset versions between PyTorch export and ONNX Runtime inference. ML team to validate compatibility matrix (implementation phase)
3. **R-012: Concurrent training data corruption** — Implement database transactions and optimistic locking for annotation data during concurrent training jobs (implementation phase)

**What we need from team:** Review recommendations and approve (or suggest changes).

---

### 📋 INFO ONLY - Solutions Provided

1. **Test strategy**: API-heavy testing (Fastify + FastAPI), E2E for critical user journeys only
2. **Tooling**: Vitest (web), Jest (api), pytest (ml), Playwright (E2E), k6 (load)
3. **CI/CD tiers**: PR (<15 min), Nightly (<45 min), Weekly (<2 hours)
4. **Coverage**: ~40 test scenarios prioritized P0–P3 with risk-based classification
5. **Quality gates**: P0 = 100% pass, P1 ≥ 95%, code coverage ≥ 80% (API)

**What we need from team:** Review and acknowledge.

---

## For Architects and Devs - Open Topics 👷

### Risk Assessment

**Total risks identified**: 12 (4 high-priority score ≥6, 5 medium, 3 low)

#### High-Priority Risks (Score ≥6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---------|----------|-------------|-------------|--------|-------|------------|-------|----------|
| **R-001** | **TECH** | ML model accuracy regression after retraining | 2 | 3 | **6** | Automated model evaluation pipeline with baseline mAP comparison | ML Team | Pre-release |
| **R-002** | **PERF** | Inference latency exceeds 100ms under concurrent load | 2 | 3 | **6** | Load test with k6, ONNX optimization, response caching | Backend Team | Pre-release |
| **R-006** | **SEC** | Cross-tenant data leakage on write operations | 2 | 2 | **4** | Read endpoints are now public (optionalAuth). Enforce user scoping on write operations (POST/PATCH/DELETE). Re-evaluate when multi-tenancy is implemented. | API Team | Implementation |
| **R-009** | **TECH** | ONNX model version mismatch between training and inference | 2 | 3 | **6** | Pin ONNX opset versions, add compatibility validation on model load | ML Team | Implementation |
| **R-012** | **DATA** | Annotation data loss during concurrent training | 2 | 3 | **6** | Database transactions, optimistic locking, concurrent write tests | API + ML Team | Implementation |

#### Medium-Priority Risks (Score 4)

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner |
|---------|----------|-------------|-------------|--------|-------|------------|-------|
| R-003 | TECH | Training pipeline fails silently | 2 | 2 | 4 | WebSocket error notifications, job status logging | Backend Team |
| R-005 | SEC | File upload abuse (oversized/malicious files) | 2 | 2 | 4 | Content validation, magic number checks | API Team |
| R-008 | PERF | WebSocket connection memory leaks | 2 | 2 | 4 | Connection pool monitoring, graceful cleanup | API Team |
| R-010 | PERF | Redis connection pool exhaustion | 2 | 2 | 4 | Pool monitoring, consider separate Redis instances | DevOps |

#### Low-Priority Risks (Score 3)

| Risk ID | Category | Description | Probability | Impact | Score | Action |
|---------|----------|-------------|-------------|--------|-------|--------|
| R-004 | SEC | SQL injection via search queries | 1 | 3 | 3 | Monitor — Prisma parameterized queries mitigate |
| R-007 | DATA | ChromaDB vector index corruption | 1 | 3 | 3 | Monitor — health checks and backup procedures |
| R-011 | OPS | S3/MinIO storage unavailability | 1 | 3 | 3 | Monitor — health checks, graceful degradation |

#### Risk Category Legend

- **TECH**: Technical/Architecture (integration, compatibility, scalability)
- **SEC**: Security (access controls, data exposure, input validation)
- **PERF**: Performance (SLA violations, resource limits)
- **DATA**: Data Integrity (loss, corruption, inconsistency)
- **OPS**: Operations (deployment, monitoring, infrastructure)

---

### Testability Concerns and Architectural Gaps

**🚨 ACTIONABLE CONCERNS - Architecture Team Must Address**

#### 1. Blockers to Fast Feedback

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
|---------|--------|-------------------------------|-------|----------|
| **No ML mock endpoints** | Cannot run API integration tests without trained model + running ML service | Mock/stub ML service with fixture responses for inference and training status | ML Team | Pre-implementation |
| **No test data seeding** | Cannot create test scenarios programmatically; manual DB setup required | POST /api/test-data seeding endpoints (dev/staging only) or seed scripts | Backend Team | Pre-implementation |
| **S3/MinIO required for all image tests** | CI pipeline cannot run without object storage | LocalStack configuration or in-memory file storage adapter for test mode | DevOps | Pre-implementation |

#### 2. Architectural Improvements Needed

1. **BullMQ async job testability**
   - **Current problem**: No documented pattern for testing async training workflows end-to-end
   - **Required change**: Document test patterns for job completion waiting; consider test-mode synchronous execution
   - **Impact if not fixed**: Flaky E2E tests relying on arbitrary timeouts
   - **Owner**: Backend Team
   - **Timeline**: Implementation phase

2. **ChromaDB test isolation**
   - **Current problem**: No test-mode configuration for vector database; tests may pollute shared index
   - **Required change**: Per-test-run collection namespace or in-memory alternative
   - **Impact if not fixed**: Non-deterministic vector search results in tests
   - **Owner**: ML Team
   - **Timeline**: Implementation phase

---

### Testability Assessment Summary

**📊 CURRENT STATE - FYI**

#### What Works Well

- ✅ API-first design: all business logic accessible via REST endpoints (Fastify + FastAPI)
- ✅ Schema validation at boundaries: TypeBox (Fastify) + Pydantic (FastAPI)
- ✅ Comprehensive testing frameworks already configured: Vitest, Jest, pytest, Playwright
- ✅ Observability stack in place: Sentry, OpenTelemetry, Prometheus, Winston
- ✅ Docker Compose for reproducible test environments
- ✅ Prisma ORM with type-safe queries and auto-generated migrations

#### Accepted Trade-offs

- **No contract testing between Fastify API and FastAPI ML Backend** — acceptable for monorepo where both sides are maintained by the same team. API integration tests cover the boundary.
- **No chaos testing infrastructure** — acceptable for Phase 1. Can be added when production scale demands it.

---

### Risk Mitigation Plans (High-Priority Risks ≥6)

#### R-001: ML Model Accuracy Regression (Score: 6)

**Mitigation Strategy:**

1. Implement automated model evaluation script that runs after each training cycle
2. Compare mAP@0.5 against stored baseline; fail if regression >1%
3. Store evaluation metrics in PostgreSQL for trend analysis

**Owner:** ML Team
**Timeline:** Pre-release
**Status:** Planned
**Verification:** Training pipeline rejects models below accuracy threshold

#### R-002: Inference Latency Exceeds 100ms (Score: 6)

**Mitigation Strategy:**

1. Set up k6 load test targeting /api/recognize endpoint with concurrent users
2. Profile ONNX Runtime inference under load; optimize model quantization if needed
3. Implement response caching for repeated inference on identical images

**Owner:** Backend Team
**Timeline:** Pre-release
**Status:** Planned
**Verification:** k6 test confirms P95 <100ms at 100 concurrent users

#### R-006: Cross-Tenant Data Leakage (Score: 4 — downgraded)

**Mitigation Strategy:**

1. Read endpoints now use `optionalAuth` — all data is publicly readable (no multi-tenancy in Phase 1)
2. Write operations (POST/PATCH/DELETE) require `authMiddleware` — enforced per-route
3. When multi-tenancy is implemented, re-evaluate: add user scoping to Prisma queries and upgrade risk score back to 6

**Owner:** API Team
**Timeline:** Phase 2 (when multi-tenancy is added)
**Status:** Partially mitigated (write-side auth enforced, read-side public by design)
**Verification:** Write operations return 401 without valid JWT; read operations return 200 without auth

#### R-009: ONNX Model Compatibility (Score: 6)

**Mitigation Strategy:**

1. Pin ONNX opset version in training export configuration
2. Add model validation step on load: verify opset compatibility with ONNX Runtime version
3. Integration test: export model → load in inference engine → verify output shape

**Owner:** ML Team
**Timeline:** Implementation phase
**Status:** Planned
**Verification:** CI test exports and loads model in single pipeline

#### R-012: Concurrent Annotation Data Corruption (Score: 6)

**Mitigation Strategy:**

1. Wrap annotation mutations in database transactions (Prisma interactive transactions)
2. Implement optimistic locking with version field on training_data table
3. Test concurrent writes from multiple API instances

**Owner:** API + ML Team
**Timeline:** Implementation phase
**Status:** Planned
**Verification:** Concurrent update test detects and handles conflicts

---

### Assumptions and Dependencies

#### Assumptions

1. PostgreSQL + pgvector is the single source of truth for all relational data
2. ML Backend (FastAPI) is deployed as a single instance for Phase 1 (no horizontal scaling of ML workers yet)
3. ONNX Runtime is the only inference engine in production (no TensorFlow Serving)
4. Redis is shared for cache, sessions, and BullMQ (not yet separated)

#### Dependencies

1. **Docker Compose test environment** — Required before test development starts
2. **Prisma schema stability** — Migrations must be finalized for core tables before QA writes integration tests
3. **ML model baseline** — At least one trained model available for inference testing

#### Risks to Plan

- **Risk**: ML Backend team unavailable to create mock endpoints
  - **Impact**: API integration tests blocked; QA limited to unit tests
  - **Contingency**: QA creates lightweight FastAPI mock service independently

---

**End of Architecture Document**

**Next Steps for Architecture Team:**

1. Review Quick Guide (🚨/⚠️/📋) and prioritize blockers
2. Assign owners and timelines for high-priority risks (≥6)
3. Validate assumptions and dependencies
4. Provide feedback to QA on testability gaps

**Next Steps for QA Team:**

1. Wait for pre-implementation blockers to be resolved
2. Refer to companion QA doc (test-design-qa.md) for test scenarios
3. Begin test infrastructure setup (factories, fixtures, environments)
