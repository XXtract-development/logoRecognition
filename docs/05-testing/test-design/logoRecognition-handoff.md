---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments:
  - docs/05-testing/test-design-architecture.md
  - docs/05-testing/test-design-qa.md
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-04-03'
projectName: 'logoRecognition'
---

# TEA → BMAD Integration Handoff

## Purpose

This document bridges TEA's test design outputs with BMAD's epic/story decomposition workflow (`create-epics-and-stories`). It provides structured integration guidance so that quality requirements, risk assessments, and test strategies flow into implementation planning.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
|----------|------|------------------------|
| Architecture Test Design | `docs/05-testing/test-design-architecture.md` | Epic quality requirements, architectural blockers |
| QA Test Design | `docs/05-testing/test-design-qa.md` | Story acceptance criteria, test coverage plan |
| Risk Assessment | (embedded in both documents) | Epic risk classification, story priority |
| Coverage Strategy | (embedded in QA doc) | Story test requirements, P0-P3 prioritization |

## Epic-Level Integration Guidance

### Risk References

The following high-priority risks (score ≥6) should appear as epic-level quality gates:

| Risk ID | Category | Score | Epic Impact | Quality Gate |
|---------|----------|-------|-------------|-------------|
| R-001 | TECH | 6 | Epic 5 (Model Training Pipeline) | Automated mAP evaluation must pass before epic completion |
| R-002 | PERF | 6 | Epic 3 (Logo Recognition) | P95 <100ms inference validated under load |
| R-006 | SEC | 6 | Epic 1 (Foundation & Infrastructure) | Tenant isolation verified across all data access |
| R-009 | TECH | 6 | Epic 5 (Model Training Pipeline) | ONNX export → inference compatibility validated |
| R-012 | DATA | 6 | Epic 4 (Training Annotation) | Concurrent annotation writes tested with locking |

### Quality Gates

| Epic | Recommended Quality Gate |
|------|------------------------|
| Epic 1: Foundation & Infrastructure | All P0 security tests passing (P0-003, P0-004, P0-008); Prisma migrations clean (P0-010) |
| Epic 2: Image Upload & Management | File upload validation passing (P0-002, P0-007); S3 integration tested |
| Epic 3: Logo Recognition | Recognition accuracy test passing (P0-001); Latency P95 <100ms (P0-006) |
| Epic 4: Training Annotation | Concurrent data integrity verified (R-012); Smart click detection E2E passing |
| Epic 5: Model Training Pipeline | ONNX compatibility validated (R-009); Model evaluation pipeline functional (R-001) |
| Epic 6: Self-Learning System | Active learning feedback loop E2E tested; Model versioning rollback verified |

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

The following critical test scenarios MUST be included as acceptance criteria in their corresponding stories:

| Test ID | Scenario | Recommended Story | Acceptance Criterion |
|---------|----------|-------------------|---------------------|
| P0-001 | Recognition returns correct predictions | Story 3.x (Recognition API) | Given a trained model, when an image is submitted, then predictions include correct logo with confidence >0.8 |
| P0-003 | JWT auth enforcement | Story 1.x (Auth setup) | Given an expired JWT token, when any API request is made, then 401 is returned |
| P0-004 | RBAC enforcement | Story 1.x (Auth setup) | Given a USER role, when accessing /admin/* endpoints, then 403 is returned |
| P0-006 | Inference latency <100ms | Story 3.x (Recognition API) | Given concurrent requests, when recognition is called, then P95 response time <100ms |
| P0-008 | User data isolation | Story 1.x (Multi-tenant) | Given user A uploads images, when user B queries images, then user A's images are not visible |
| P1-003 | WebSocket training progress | Story 5.x (Training pipeline) | Given training is in progress, when a model trains, then WebSocket emits progress events |
| P1-008 | Concurrent training safety | Story 4.x (Annotation) | Given multiple concurrent annotation updates, when optimistic locking detects conflict, then update is rejected with clear error |

### Data-TestId Requirements

For E2E testability, the following `data-testid` attributes are recommended:

| Component | Recommended data-testid | Used in Test |
|-----------|------------------------|-------------|
| Image upload dropzone | `image-upload-dropzone` | P0-002, P1-001 |
| Recognition results container | `recognition-results` | P1-004 |
| Confidence score display | `confidence-score` | P0-001 |
| Bounding box overlay | `bounding-box-overlay` | P1-004 |
| Training progress bar | `training-progress` | P1-003 |
| Category selector | `category-selector` | P1-002 |
| Annotation canvas | `annotation-canvas` | P1-005 |
| Model version selector | `model-version-select` | P1-007 |

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic | Test Level |
|---------|----------|-----|----------------------|-----------|
| R-001 | TECH | 2×3=6 | Epic 5: Model Training Pipeline | Unit + API |
| R-002 | PERF | 2×3=6 | Epic 3: Logo Recognition | Load (k6) |
| R-003 | TECH | 2×2=4 | Epic 5: Model Training Pipeline | API + E2E |
| R-005 | SEC | 2×2=4 | Epic 2: Image Upload & Management | API |
| R-006 | SEC | 2×3=6 | Epic 1: Foundation & Infrastructure | API |
| R-008 | PERF | 2×2=4 | Epic 6: Self-Learning (WebSocket heavy) | Nightly |
| R-009 | TECH | 2×3=6 | Epic 5: Model Training Pipeline | Unit + Integration |
| R-010 | PERF | 2×2=4 | Epic 1: Foundation & Infrastructure | Nightly |
| R-012 | DATA | 2×3=6 | Epic 4: Training Annotation | Integration |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`) → produces this handoff document ✅ COMPLETE
2. **BMAD Create Epics & Stories** → consumes this handoff, embeds quality requirements
3. **TEA ATDD** (`AT`) → generates acceptance tests per story
4. **BMAD Implementation** → developers implement with test-first guidance
5. **TEA Automate** (`TA`) → generates full test suite
6. **TEA Trace** (`TR`) → validates coverage completeness

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
|-----------|----------|--------------|
| Test Design | Epic/Story Creation | All P0 risks have mitigation strategy (5/5 complete) |
| Epic/Story Creation | ATDD | Stories have acceptance criteria from test design |
| ATDD | Implementation | Failing acceptance tests exist for all P0/P1 scenarios |
| Implementation | Test Automation | All acceptance tests pass |
| Test Automation | Release | Trace matrix shows ≥80% coverage of P0/P1 requirements |
