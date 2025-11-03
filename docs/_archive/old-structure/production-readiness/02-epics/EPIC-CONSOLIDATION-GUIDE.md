# 📋 Epic Consolidation Guide

**Created:** 2024-01-19
**Purpose:** Document which epics are duplicates and which should be kept

---

## ✅ MASTER EPICS TO KEEP

These are the authoritative epic documents after consolidation:

1. **EPIC-PORTFOLIO.md** - Master portfolio (UPDATED)
2. **EPIC-001**: Security & Compliance (Use epic-pr-01-security-compliance.md)
3. **EPIC-002**: Core Detection (Use epic-002-core-detection.md)
4. **EPIC-003**: Data Management (Use epic-003-data-management.md)
5. **EPIC-004**: Authentication (Use epic-004-authentication.md)
6. **EPIC-005**: Infrastructure (Use epic-05-infrastructure-deployment.md)

---

## ❌ DUPLICATE EPICS TO ARCHIVE/REMOVE

These epics contain duplicate or conflicting information:

### Database/Data Duplicates
- `epic-001-database-data.md` → DUPLICATE of EPIC-003
- `epic-003-ml-storage.md` → DUPLICATE of EPIC-003

### Authentication Duplicates
- `epic-002-authentication.md` → CONFLICTS with EPIC-004
- Second `epic-004-authentication.md` in different location

### Training System Duplicates
- `epic-01-training-system.md` → Partially covered in EPIC-002
- `epic-02-recognition-system.md` → DUPLICATE of EPIC-002
- `epic-03-self-learning-system.md` → Future phase, not v1.0

### UI/UX Duplicates
- `epic-04-ui-ux-design-system.md` → Covered in Frontend stories
- `EPIC-Frontend-Component-Consolidation.md` → Specific implementation
- `EPIC-Frontend-Component-Consolidation-A++.md` → Duplicate

### Other Redundant Epics
- `epic-06-real-time-processing.md` → Future phase
- `epic-07-industrial-features.md` → Future phase
- `epic-08-analytics-reporting.md` → Future phase
- `epic-stakeholder-review.md` → Not an epic

---

## 📊 CONSOLIDATION MAPPING

| Old Epic | Maps To | Status | Action |
|----------|---------|---------|---------|
| epic-001-database-data | EPIC-003 | 85% Complete | Archive |
| epic-002-authentication | EPIC-004 | 85% Complete | Archive |
| epic-002-core-detection | EPIC-002 | 70% Complete | KEEP |
| epic-003-data-management | EPIC-003 | 85% Complete | KEEP |
| epic-003-ml-storage | EPIC-003 | Merged | Archive |
| epic-004-authentication | EPIC-004 | 85% Complete | KEEP |
| epic-pr-01-security | EPIC-001 | 40% Complete | KEEP |
| epic-pr-02-performance | EPIC-005 | 0% Complete | Keep for Sprint 3 |
| epic-pr-03-devops | EPIC-005 | 10% Complete | Keep for Sprint 4 |
| epic-pr-04-monitoring | EPIC-005 | 60% Complete | Keep for Sprint 3 |
| epic-pr-05-data-infra | EPIC-003 | Merged | Archive |

---

## 🎯 FINAL EPIC STRUCTURE

After consolidation, we have 5 clear epics:

### Epic 1: Security & Compliance (40% Complete)
- **Points:** 25 (adjusted from 34)
- **Sprint:** 1
- **Status:** Critical gaps in secrets management

### Epic 2: Core Detection Platform (70% Complete)
- **Points:** 20 (adjusted from 22)
- **Sprint:** 1-2
- **Status:** Code ready, ONNX models missing

### Epic 3: Data Management (85% Complete)
- **Points:** 15 (adjusted from 18)
- **Sprint:** 1-2
- **Status:** Backend complete, frontend gaps

### Epic 4: Authentication (85% Complete)
- **Points:** 10 (adjusted from 13)
- **Sprint:** 1
- **Status:** Backend ready, no UI

### Epic 5: DevOps & Infrastructure (10% Complete)
- **Points:** 30 (adjusted from 40)
- **Sprint:** 3-4
- **Status:** Docker ready, no CI/CD

---

## 📝 RECOMMENDED ACTIONS

1. **Update EPIC-PORTFOLIO.md** ✅ DONE
2. **Archive duplicate epics** to `/02-epics/archived/`
3. **Update remaining epics** with actual status
4. **Create single epic tracking** in EPIC-PORTFOLIO.md
5. **Remove version numbers** from epic files

---

## 🚫 DO NOT DELETE YET

Keep these files until team confirms:
- All A++ completion reports
- Technical implementation details
- Architecture decisions
- Test results

---

**Next Step:** Run consolidation script to move duplicates to archive folder