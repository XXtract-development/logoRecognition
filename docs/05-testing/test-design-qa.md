---
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
lastSaved: '2026-04-05'
workflowType: 'testarch-test-design'
inputDocuments:
  - docs/01-product/prd.md
  - docs/02-architecture/overview.md
  - docs/02-architecture/tech-stack.md
  - docs/epics.md
lastValidated: '2026-04-05'
validationReport: docs/05-testing/test-design-validation-report.md
---

# Test Design for QA: Logo Recognition System

**Purpose:** Test execution recipe for QA team. Defines what to test, how to test it, and what QA needs from other teams.

**Date:** 2026-04-03 (updated 2026-04-05)
**Author:** TEA Master Test Architect
**Status:** Draft (validated 2026-04-05)
**Project:** Logo Recognition & Training System

**Related:** See Architecture doc (test-design-architecture.md) for testability concerns and architectural blockers.

---

## Executive Summary

**Scope:** System-level test coverage for the Logo Recognition & Training System across all three application layers (web, api, ml-service).

**Risk Summary:**

- Total Risks: 12 (4 high-priority score ≥6, 5 medium, 3 low)
- Critical Categories: TECH (3), SEC (1 high + 1 medium), PERF (2)

**Coverage Summary:**

- P0 tests: ~10 (core recognition, security, data integrity)
- P1 tests: ~14 (integration flows, WebSocket, concurrency)
- P2 tests: ~10 (UI flows, export, i18n, responsive)
- P3 tests: ~6 (load testing, benchmarks, accessibility)
- **Total**: ~40 tests (~3–5 sprints with 1 QA + dev support)

---

## Not in Scope

| Item | Reasoning | Mitigation |
|------|-----------|------------|
| **PLC/SCADA integrations** | Phase 4 feature, not yet implemented | Will be covered in dedicated epic-level test design |
| **Multi-logo detection** | Phase 4 feature, not yet implemented | Deferred to epic-level testing |
| **Chaos/failover testing** | No Kubernetes chaos tooling available | Accepted risk for Phase 1; revisit post-GA |
| **Mobile native apps** | Web-only product, responsive design tested | Responsive E2E tests cover mobile viewports |

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these items from other teams.

### Backend/Architecture Dependencies (Pre-Implementation)

**Source:** See Architecture doc "Quick Guide" for detailed mitigation plans

1. **ML Backend mock service** — ML Team — Pre-implementation
   - QA needs stub endpoints returning fixture recognition results and training status
   - Blocks all API integration tests that involve ML inference

2. **Test data seeding endpoints** — Backend Team — Pre-implementation
   - QA needs POST endpoints to create logos, categories, images, annotations
   - Blocks all test scenarios requiring specific data states

3. **S3/MinIO test configuration** — DevOps — Pre-implementation
   - QA needs LocalStack or test-mode file storage for CI
   - Blocks image upload and model storage tests in CI pipeline

### QA Infrastructure Setup (Pre-Implementation)

1. **Test Data Factories** — QA
   - Logo, Category, Image, User factories with faker-based randomization
   - Auto-cleanup fixtures for parallel safety

2. **Test Environments** — QA
   - Local: Docker Compose with all services
   - CI/CD: GitHub Actions with Docker Compose test environment
   - Staging: Coolify deployment with test database

**Example factory pattern:**

```typescript
// tests/factories/logo.factory.ts
import { faker } from '@faker-js/faker';

export function createLogo(overrides?: Partial<Logo>) {
  return {
    name: faker.company.name(),
    category: faker.commerce.department(),
    imageUrl: faker.image.url(),
    ...overrides,
  };
}

export function createUser(overrides?: Partial<User>) {
  return {
    email: faker.internet.email(),
    password: 'test-password-123',
    role: 'USER',
    ...overrides,
  };
}
```

---

## Risk Assessment

**Note:** Full risk details in Architecture doc. This section summarizes risks relevant to QA test planning.

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Score | QA Test Coverage |
|---------|----------|-------------|-------|------------------|
| **R-001** | TECH | ML model accuracy regression | **6** | Automated mAP evaluation after training; baseline comparison test |
| **R-002** | PERF | Inference latency >100ms under load | **6** | k6 load test targeting P95 <100ms at 100 concurrent users |
| **R-006** | SEC | Cross-tenant data leakage (write ops only) | **4** | Write endpoints require auth; reads are public (Phase 1). Re-evaluate at multi-tenancy. |
| **R-009** | TECH | ONNX model version mismatch | **6** | Integration test: export model → load → verify inference output |
| **R-012** | DATA | Concurrent annotation data corruption | **6** | Parallel write test with optimistic locking verification |

### Medium/Low-Priority Risks

| Risk ID | Category | Description | Score | QA Test Coverage |
|---------|----------|-------------|-------|------------------|
| R-003 | TECH | Training pipeline silent failures | 4 | WebSocket notification test; job status API verification |
| R-005 | SEC | File upload abuse | 4 | Upload validation: oversized files, invalid types, malicious content |
| R-008 | PERF | WebSocket memory leaks | 4 | Sustained connection test (nightly) |
| R-010 | PERF | Redis pool exhaustion | 4 | Connection pool monitoring under load (nightly) |
| R-004 | SEC | SQL injection | 3 | Input validation tests with malicious payloads |
| R-007 | DATA | ChromaDB corruption | 3 | Vector search consistency test |
| R-011 | OPS | S3 unavailability | 3 | Health check endpoint verification |

---

## Entry Criteria

- [ ] All requirements and assumptions agreed upon by QA, Dev, PM
- [ ] Test environments provisioned (Docker Compose, CI pipeline)
- [ ] Test data factories and seeding endpoints ready
- [ ] Pre-implementation blockers resolved (ML mock, S3 test config)
- [ ] At least one trained ONNX model available for inference testing
- [ ] Prisma schema stable (core tables finalized)

## Exit Criteria

- [ ] All P0 tests passing (100%)
- [ ] All P1 tests passing (≥95% or failures triaged and accepted)
- [ ] No open high-priority / high-severity bugs
- [ ] Code coverage ≥80% (API), ≥70% (web)
- [ ] Performance baselines met (P95 <100ms recognition)
- [ ] High-risk mitigations (R-001, R-002, R-009, R-012) validated

---

## Test Coverage Plan

**IMPORTANT:** P0/P1/P2/P3 = **priority and risk level** (what to focus on if time-constrained), NOT execution timing. See "Execution Strategy" for when tests run.

### P0 (Critical)

**Criteria:** Blocks core functionality + High risk (≥6) + No workaround

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|------------|-----------|-------|
| **P0-001** | Logo recognition returns correct predictions | API | R-001 | Core product value |
| **P0-002** | Image upload accepts JPG/PNG/WEBP, rejects invalid | API | R-005 | Security boundary |
| **P0-003** | JWT auth on write endpoints: valid accepted, expired/invalid rejected | API | — | Security-critical. Read endpoints use optionalAuth (no 401). Write endpoints (POST/PATCH/DELETE) require auth. |
| **P0-004** | RBAC: USER cannot access ADMIN write endpoints | API | R-006 | Role isolation on mutations only |
| **P0-005** | Training pipeline starts, progresses, completes via /training/jobs | API | R-003 | Core workflow. Use `/training/jobs` (frontend path) |
| **P0-006** | Recognition API P95 <100ms (single request) | API | R-002 | Key SLA |
| **P0-007** | File upload rejects >10MB files | API | R-005 | Security boundary. Upload requires auth. |
| **P0-008** | Write operations scoped to authenticated user | API | R-006 | Read endpoints are public; write endpoints require auth |
| **P0-009** | ONNX model loads and produces valid output | Unit | R-009 | Model compatibility |
| **P0-010** | Prisma migrations apply cleanly | Integration | — | Data integrity |

**Total P0:** ~10 tests

---

### P1 (High)

**Criteria:** Important features + Medium risk + Common workflows

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|------------|-----------|-------|
| **P1-001** | Batch image upload (multiple files) | API | — | Common workflow |
| **P1-002** | Category CRUD at /training/categories | API | — | Core data management. Routes moved to /training/categories |
| **P1-003** | Training progress via WebSocket | E2E | R-003 | Real-time feedback |
| **P1-004** | Recognition results with bounding boxes | E2E | — | Core UX |
| **P1-005** | Smart click detection annotation | E2E | — | Key differentiator |
| **P1-006** | Rate limiting enforcement | API | — | Security |
| **P1-007** | Model versioning: list, compare, rollback | API | R-009 | ML lifecycle |
| **P1-008** | Concurrent training data integrity | Integration | R-012 | Concurrency safety |
| **P1-009** | Redis pool under sustained load | API | R-010 | Infrastructure |
| **P1-010** | API ↔ ML Backend health + integration | API | — | Service boundary |
| **P1-011** | ML Backend down → graceful empty response (200) | API | — | Error handling. Models and training jobs return empty arrays, not 500. |
| **P1-012** | Security headers (CSP, HSTS, X-Frame) | API | — | Security compliance |
| **P1-013** | Data augmentation produces valid images | Unit | R-001 | Training pipeline |
| **P1-014** | Model export to ONNX validates | Unit | R-009 | Export integrity |

**Total P1:** ~14 tests

---

### P2 (Medium)

**Criteria:** Secondary features + Low risk + Edge cases

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---------|-------------|------------|-----------|-------|
| **P2-001** | Multi-language support (NL/EN) | E2E | — | i18n |
| **P2-002** | Responsive design on mobile/tablet | E2E | — | Viewport tests |
| **P2-003** | Keyboard shortcuts in annotation | E2E | — | Accessibility |
| **P2-004** | CSV/PDF export of results | API | — | Data export |
| **P2-005** | Batch recognition (multiple images) | API | — | Efficiency |
| **P2-006** | Training metrics dashboard | E2E | — | Data visualization |
| **P2-007** | WebSocket reconnection after disconnect | E2E | — | Resilience |
| **P2-008** | Pagination/virtual scrolling on large datasets | E2E | — | Performance UX |
| **P2-009** | Audit logging for data mutations | API | — | Compliance |
| **P2-010** | S3/MinIO presigned URL upload | API | — | Storage integration |

**Total P2:** ~10 tests

---

### P3 (Low)

**Criteria:** Nice-to-have + Exploratory + Benchmarks

| Test ID | Requirement | Test Level | Notes |
|---------|-------------|------------|-------|
| **P3-001** | 1000 req/sec recognition throughput | Load (k6) | NFR-PERF-004 benchmark |
| **P3-002** | 10,000+ categories query performance | Load (k6) | NFR-SCALE-001 benchmark |
| **P3-003** | Training time <30min for 1000 images | Benchmark | NFR-PERF-002 benchmark |
| **P3-004** | Accessibility audit (axe-core) | E2E | NFR-USE compliance |
| **P3-005** | Visual regression (screenshot diff) | E2E | UI consistency |
| **P3-006** | Redis restart during active training | Chaos | Infrastructure resilience |

**Total P3:** ~6 tests

---

## Execution Strategy

**Philosophy:** Run everything in PRs unless significant infrastructure overhead. Playwright with parallelization handles 100s of tests in ~10-15 min.

**Organized by TOOL TYPE:**

### Every PR: Functional Tests (~15 min)

**All functional tests** (from any priority level):

- Vitest unit tests (web): `pnpm --filter web test`
- Jest unit + integration tests (api): `pnpm --filter api test`
- pytest unit + integration tests (ml): `cd backend && pytest`
- Playwright E2E smoke suite: `pnpm --filter web test:e2e --grep "@P0|@P1"`
- Parallelized across 4 shards
- Total: ~34 functional tests (P0 + P1 + P2)

**Why run in PRs:** Fast feedback, no expensive infrastructure

### Nightly: Performance Tests (~45 min)

**All performance and extended tests:**

- k6 load tests: recognition throughput, concurrent users
- Full Playwright E2E suite (all priorities): `pnpm --filter web test:e2e`
- Security header validation
- Total: ~6 performance + load tests

**Why defer to nightly:** k6 requires dedicated load generation, longer runtime

### Weekly: Benchmarks & Exploratory (~2 hours)

**Special infrastructure tests:**

- Scalability benchmark (10,000+ categories)
- Training time benchmark (1000 images)
- Accessibility audit (axe-core + Lighthouse)
- Visual regression (screenshot comparison)
- Chaos test: Redis restart during training

**Why defer to weekly:** Very long-running, infrastructure-intensive

---

## QA Effort Estimate

**QA test development effort only** (excludes DevOps, Backend, ML team work):

| Priority | Count | Effort Range | Notes |
|----------|-------|-------------|-------|
| P0 | ~10 | ~25–40 hours | Complex: security, multi-user, ML integration |
| P1 | ~14 | ~30–50 hours | Integration flows, WebSocket, concurrency |
| P2 | ~10 | ~15–25 hours | UI flows, export, responsive |
| P3 | ~6 | ~10–20 hours | Load test setup, benchmarks, a11y |
| **Total** | ~40 | **~80–135 hours** | **~3–5 sprints (1 QA, full-time)** |

**Assumptions:**

- Includes test design, implementation, debugging, CI integration
- Excludes ongoing maintenance (~10% effort)
- Assumes test infrastructure (factories, fixtures, seeding) ready before QA starts

---

## Interworking & Regression

| Service/Component | Impact | Regression Scope | Validation Steps |
|-------------------|--------|-----------------|------------------|
| **Fastify API** | Core gateway for all requests | All API tests must pass | PR pipeline: Jest + integration tests |
| **FastAPI ML Backend** | Training + inference engine | ML integration tests must pass | PR pipeline: pytest suite |
| **React Frontend** | User-facing interface | E2E smoke tests must pass | PR pipeline: Playwright P0/P1 suite |
| **PostgreSQL** | Data integrity | Migration tests + CRUD tests | PR pipeline: Prisma migrate + Jest |
| **Redis** | Cache + sessions + queue | Connection pool + BullMQ tests | Nightly: sustained load tests |
| **S3/MinIO** | Image + model storage | Upload/download tests | PR pipeline: presigned URL tests |

**Regression test strategy:**

- All existing unit + integration tests must pass before any merge
- E2E smoke suite (@P0 + @P1) runs on every PR
- Full regression suite runs nightly

---

## Appendix A: Code Examples & Tagging

**Playwright Tags for Selective Execution:**

```typescript
import { test, expect } from '@playwright/test';

// P0 critical test — write endpoints require auth
test('@P0 @API @Security unauthenticated write returns 401', async ({ request }) => {
  const response = await request.post('/api/v1/training/categories', {
    data: { category: 'test', value: 'test' },
  });
  expect(response.status()).toBe(401);
});

// P0 — read endpoints are public (optionalAuth)
test('@P0 @API public read endpoints return 200 without auth', async ({ request }) => {
  const response = await request.get('/api/v1/training/categories');
  expect(response.status()).toBe(200);
});

// P1 integration test
test('@P1 @Integration training job creates WebSocket notification', async ({ request, page }) => {
  // Login and start training via API
  const loginResponse = await request.post('/api/auth/login', {
    data: { email: 'test@example.com', password: 'password123' },
  });
  expect(loginResponse.status()).toBe(200);

  // Listen for WebSocket training update
  const wsPromise = page.waitForEvent('websocket');
  // ... trigger training and verify notification
});
```

**Run specific tags:**

```bash
# Run only P0 tests
npx playwright test --grep @P0

# Run P0 + P1 tests (PR pipeline)
npx playwright test --grep "@P0|@P1"

# Run only security tests
npx playwright test --grep @Security

# Run all tests (nightly)
npx playwright test
```

---

## Appendix B: Knowledge Base References

- **Risk Governance**: `risk-governance.md` — Risk scoring methodology (P x I = 1-9)
- **Test Priorities Matrix**: `test-priorities-matrix.md` — P0-P3 classification criteria
- **Test Levels Framework**: `test-levels-framework.md` — E2E vs API vs Unit selection guide
- **Test Quality**: `test-quality.md` — Definition of Done (no hard waits, <300 lines, <1.5 min, self-cleaning)

---

**Generated by:** BMad TEA Agent
**Workflow:** `_bmad/tea/testarch/bmad-testarch-test-design`
