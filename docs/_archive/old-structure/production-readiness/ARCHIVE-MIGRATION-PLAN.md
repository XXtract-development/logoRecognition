# 📦 Archive Migration Plan - Document Consolidation

**Created:** 2024-01-19
**Purpose:** Organize and archive superseded planning documents

---

## 🎯 CONSOLIDATION SUMMARY

### New Master Documents (Keep Active)
```
docs/production-readiness/
├── CONSOLIDATED-MASTER-PLAN.md          # ✅ NEW - Single source of truth
├── IMMEDIATE-ACTION-PLANS.md            # ✅ NEW - Week 1 actions
└── ARCHIVE-MIGRATION-PLAN.md            # ✅ THIS DOCUMENT
```

### Documents to Archive
```
docs/production-readiness/
├── 02-epics/                            # 🗄️ ARCHIVE - 27 conflicting epics
├── 03-sprints/                          # 🗄️ ARCHIVE - 10+ conflicting sprints
└── 04-user-stories/all-stories-backup/  # 🗄️ ALREADY BACKED UP
```

---

## 📂 RECOMMENDED FOLDER STRUCTURE

```bash
docs/production-readiness/
├── ACTIVE/
│   ├── CONSOLIDATED-MASTER-PLAN.md      # Master planning document
│   ├── IMMEDIATE-ACTION-PLANS.md        # Current sprint actions
│   └── implementation-status.md         # Real-time status tracker
│
├── COMPLETED/
│   ├── US-003-frontend-integration.md   # A++ Completed
│   ├── US-008-detection-pipeline.md     # A++ Completed
│   ├── US-009-minio-storage.md          # A++ Completed
│   └── [other completed stories]
│
└── ARCHIVED-2024-01-19/
    ├── 02-epics-legacy/                 # Old epic documents
    ├── 03-sprints-legacy/               # Old sprint plans
    └── 04-user-stories-legacy/          # Old story format
```

---

## 🔧 MIGRATION SCRIPT

```bash
#!/bin/bash
# archive-old-docs.sh

# Set base directory
BASE_DIR="/Users/frisovanweelden/Documents/projects/logoRecognition/docs/production-readiness"
ARCHIVE_DATE=$(date +%Y-%m-%d)
ARCHIVE_DIR="$BASE_DIR/ARCHIVED-$ARCHIVE_DATE"

echo "🗄️ Starting document consolidation archive..."

# Create archive structure
mkdir -p "$ARCHIVE_DIR"
mkdir -p "$BASE_DIR/ACTIVE"
mkdir -p "$BASE_DIR/COMPLETED"

# Move old planning documents to archive
echo "📦 Archiving old epic documents..."
mv "$BASE_DIR/02-epics" "$ARCHIVE_DIR/02-epics-legacy" 2>/dev/null || echo "  Already moved"

echo "📦 Archiving old sprint plans..."
mv "$BASE_DIR/03-sprints" "$ARCHIVE_DIR/03-sprints-legacy" 2>/dev/null || echo "  Already moved"

echo "📦 Archiving old user stories..."
mv "$BASE_DIR/04-user-stories" "$ARCHIVE_DIR/04-user-stories-legacy" 2>/dev/null || echo "  Already moved"

# Move active documents to ACTIVE folder
echo "✅ Organizing active documents..."
cp "$BASE_DIR/CONSOLIDATED-MASTER-PLAN.md" "$BASE_DIR/ACTIVE/" 2>/dev/null
cp "$BASE_DIR/IMMEDIATE-ACTION-PLANS.md" "$BASE_DIR/ACTIVE/" 2>/dev/null

# Extract completed stories to COMPLETED folder
echo "📋 Extracting completed stories..."
# This would need to parse and extract completed stories

echo "✅ Archive complete!"
echo "📍 Archived to: $ARCHIVE_DIR"
echo "📍 Active docs: $BASE_DIR/ACTIVE"
```

---

## ⚠️ IMPORTANT DECISIONS NEEDED

### 1. What to Keep from Old Documents?

#### KEEP (Extract and Preserve):
- ✅ All A++ completion reports
- ✅ QA reports showing success
- ✅ Technical implementation details
- ✅ Test results and coverage reports
- ✅ Architectural decisions

#### ARCHIVE (Reference only):
- ❌ Conflicting sprint plans
- ❌ Duplicate epic definitions
- ❌ Outdated status reports
- ❌ Superseded user stories

#### DELETE (After review):
- ❌ Temporary planning documents
- ❌ Draft versions
- ❌ Old backup folders

---

## 📊 DOCUMENT CONFLICT RESOLUTION

### Epic Conflicts to Resolve:
| Original | Duplicates | Resolution |
|----------|------------|------------|
| epic-001-database-data.md | epic-001-security.md | Use CONSOLIDATED-MASTER-PLAN Epic 1 |
| epic-002-core-detection.md | epic-002-authentication.md | Use CONSOLIDATED-MASTER-PLAN Epic 2 |
| epic-003-data-management.md | epic-003-ml-storage.md | Use CONSOLIDATED-MASTER-PLAN Epic 3 |
| epic-004-authentication.md | Multiple versions | Use CONSOLIDATED-MASTER-PLAN Epic 4 |

### Sprint Conflicts to Resolve:
| Document | Status | Resolution |
|----------|--------|------------|
| sprint-1-planning.md | Multiple versions | Use CONSOLIDATED-MASTER-PLAN Sprint 1 |
| sprint-07/planning.md | Different timeline | Archive - different sprint system |
| master-sprint-planning.md | Outdated | Archive - replaced by consolidated |

---

## 🚀 RECOMMENDED ACTIONS

### Step 1: Backup Everything (TODAY)
```bash
# Create full backup before changes
tar -czf production-readiness-backup-$(date +%Y%m%d).tar.gz docs/production-readiness/
```

### Step 2: Run Archive Script
```bash
# Execute the migration
bash archive-old-docs.sh
```

### Step 3: Update Git
```bash
# Commit the reorganization
git add .
git commit -m "docs: Consolidate production planning documents

- Archive old conflicting plans in ARCHIVED-2024-01-19/
- Create single source of truth in CONSOLIDATED-MASTER-PLAN.md
- Extract completed stories to COMPLETED/
- Organize active documents in ACTIVE/"
```

### Step 4: Notify Team
Send message to team:
```
📢 Documentation Consolidation Complete

Old location: docs/production-readiness/02-epics, 03-sprints, 04-user-stories
New location: docs/production-readiness/ACTIVE/CONSOLIDATED-MASTER-PLAN.md

All old documents archived in: ARCHIVED-2024-01-19/
Please use only the consolidated plan going forward.
```

---

## ✅ VALIDATION CHECKLIST

Before archiving:
- [ ] All A++ completed work documented in consolidated plan
- [ ] No active work items lost
- [ ] Team informed of changes
- [ ] Backup created
- [ ] Git history preserved

After archiving:
- [ ] Single source of truth established
- [ ] No conflicting documents active
- [ ] Clear folder structure
- [ ] Team using new structure
- [ ] Old documents accessible if needed

---

## 🔍 WHAT'S IN THE CONSOLIDATED PLAN?

The CONSOLIDATED-MASTER-PLAN.md contains:
1. **Accurate Status**: 45% complete (not 12%)
2. **5 Clear Epics** (not 27+ duplicates)
3. **4 Realistic Sprints** (not conflicting 4 vs 9 sprints)
4. **12 Completed Stories** with A++ grade
5. **Real Story Points**: 25/sprint (not 120/sprint)
6. **Clear Priorities**: Security → Frontend → ML → DevOps
7. **Actual Dependencies**: Based on real implementation

---

**Document Status:** READY FOR EXECUTION
**Decision Needed:** Approve archiving of old documents
**Risk Level:** LOW (everything backed up)