# Project Structuur Analyse & Opschoningsplan

**Datum:** 3 November 2024
**Analyst:** Mary (Business Analyst)
**Status:** 🔴 KRITIEKE STRUCTURELE PROBLEMEN GEÏDENTIFICEERD

---

## 🚨 KRITIEKE BEVINDINGEN

### Probleem #1: TRIPLE DIRECTORY STRUCTURE CONFLICT

Het project heeft **3 verschillende, conflicterende structuren** tegelijk:

#### Structure 1: Modern Monorepo Workspace (ACTIEF)
```
apps/
├── web/          # Modern React app (Vite + TypeScript)
└── api/          # Modern Node.js API

packages/
├── shared/       # Shared code
└── ui/           # UI components
```
**Status:** ✅ Dit is de ACTIEVE structuur (zie package.json workspaces)
**Grootte:** 204KB

---

#### Structure 2: Legacy Standalone (VEROUDERD maar GROOT)
```
backend/          # Oude Python FastAPI backend (433MB!)
└── backend/      # DUPLICATION: backend/backend/

frontend/         # Oude React app (1.4GB!)
└── frontend/     # DUPLICATION: frontend/frontend/
```
**Status:** ❌ DEPRECATED maar bevat nog code
**Grootte:** 1.8GB (!)
**Probleem:** Nested duplication (backend/backend/, frontend/frontend/)

---

#### Structure 3: Ancient Legacy (ZEER OUD)
```
src/              # Zeer oude Python source code (36KB)
├── api/
├── models/
├── preprocessing/
└── training/
```
**Status:** ❌ ZEER VEROUDERD
**Grootte:** 36KB
**Probleem:** Volledig overbodig, duplicate van moderne structuur

---

### Probleem #2: DUPLICATE & CONFLICTERENDE DIRECTORIES

| Directory | Grootte | Status | Probleem |
|-----------|---------|--------|----------|
| `backend/` | 433MB | Legacy | Duplicate van `apps/api/` |
| `frontend/` | 1.4GB | Legacy | Duplicate van `apps/web/` |
| `src/` | 36KB | Ancient | Duplicate van `apps/api/src/` |
| `backend/backend/` | - | Nested | Directory in zichzelf |
| `frontend/frontend/` | - | Nested | Directory in zichzelf |
| `public/` | ? | Root | Duplicate van `apps/web/public/` |
| `models/` | 65MB | Root | Zou in `backend/` moeten |
| `uploads/` | ? | Root | Zou in `backend/` moeten |
| `data/` | ? | Root | Zou in `backend/` moeten |

---

### Probleem #3: LEGE & ONGEBRUIKTE DIRECTORIES

**Volledig leeg (0 bytes):**
- ✅ `checkpoints/` - KAN VERWIJDERD
- ✅ `configs/` - KAN VERWIJDERD
- ✅ `validations/` - KAN VERWIJDERD

**Backup directories (tijdelijk):**
- ✅ `backup-20251103-193641/` (1.9MB) - Kan na 30 dagen weg
- ✅ `v4-backup/` (824KB) - Kan weg
- ✅ `temp/` - Kan leeg gemaakt worden

---

### Probleem #4: GENERATED/COVERAGE DIRECTORIES

**Build artifacts (5.1MB):**
- ✅ `htmlcov/` - Python coverage reports (GENERATED)
- ✅ `frontend/coverage/` - Frontend coverage (GENERATED)
- ✅ `.pytest_cache/` - Pytest cache (GENERATED)
- ✅ `.mypy_cache/` - MyPy cache (GENERATED)

**Status:** Deze horen in `.gitignore` en kunnen verwijderd worden

---

### Probleem #5: INFRASTRUCTURE SPRAWL

**Meerdere infra directories:**
```
infrastructure/    # 84KB - Docker/K8s configs
k8s/              # 24KB - Kubernetes manifests
k6/               # 28KB - Load tests
cypress/          # 80KB - E2E tests
```

**Probleem:** Ongeorganiseerde verdeling van infra code

---

## 📊 DIRECTORY GROOTTE ANALYSE

| Directory | Grootte | Type | Actie |
|-----------|---------|------|-------|
| `node_modules/` | 1.7GB | Dependencies | BEHOUDEN |
| `frontend/` | 1.4GB | **LEGACY** | **VERWIJDEREN** |
| `backend/` | 433MB | **LEGACY** | **VERWIJDEREN** |
| `exampleLabels/` | 185MB | Data | VERPLAATSEN |
| `models/` | 65MB | ML Models | VERPLAATSEN |
| `docs/` | 5.8MB | Documentatie | BEHOUDEN |
| `htmlcov/` | 5.1MB | **GENERATED** | **VERWIJDEREN** |
| `bmad/` | 2.7MB | Framework | BEHOUDEN |
| `scripts/` | 2.1MB | Scripts | BEHOUDEN |
| `backup-20251103-193641/` | 1.9MB | **BACKUP** | **VERWIJDEREN** |
| `v4-backup/` | 824KB | **BACKUP** | **VERWIJDEREN** |
| `tests/` | 372KB | Tests | REORGANISEREN |
| `apps/` | 204KB | **ACTIEF** | **BEHOUDEN** |
| `packages/` | 128KB | **ACTIEF** | **BEHOUDEN** |
| `src/` | 36KB | **ANCIENT** | **VERWIJDEREN** |
| `checkpoints/` | 0B | **LEEG** | **VERWIJDEREN** |
| `configs/` | 0B | **LEEG** | **VERWIJDEREN** |
| `validations/` | 0B | **LEEG** | **VERWIJDEREN** |

**Totaal te verwijderen:** ~1.9GB (!)

---

## 🎯 AANBEVOLEN DIRECTORY STRUCTUUR

### Doel: Clean Monorepo met Duidelijke Scheiding

```
logoRecognition/                    # Root
│
├── apps/                           # ✅ ACTIEF - Applications
│   ├── web/                        # Frontend React app (Vite)
│   └── api/                        # Backend Node.js API
│
├── packages/                       # ✅ ACTIEF - Shared packages
│   ├── shared/                     # Shared utilities
│   └── ui/                         # UI components
│
├── backend-python/                 # 🔄 HERNOEM - Legacy Python backend
│   ├── app/                        # FastAPI application
│   ├── models/                     # ML models (van /models)
│   ├── data/                       # Data files (van /data)
│   ├── uploads/                    # Upload directory (van /uploads)
│   └── tests/                      # Python tests
│
├── infrastructure/                 # 🔄 CONSOLIDEER - Alle infra
│   ├── docker/                     # Docker configs
│   ├── kubernetes/                 # K8s manifests (van /k8s)
│   └── terraform/                  # IaC (als aanwezig)
│
├── tests/                          # 🔄 REORGANISEER - Alle tests
│   ├── e2e/                        # Playwright E2E (van root)
│   ├── integration/                # Integration tests
│   ├── load/                       # K6 load tests (van /k6)
│   ├── cypress/                    # Cypress tests (van /cypress)
│   └── validation/                 # Validation scripts
│
├── scripts/                        # ✅ BEHOUDEN - Utility scripts
│   ├── deployment/
│   ├── testing/
│   ├── qa/
│   └── development/
│
├── docs/                           # ✅ BEHOUDEN - Documentation
│   ├── api/
│   ├── architecture/
│   └── guides/
│
├── bmad/                           # ✅ BEHOUDEN - BMAD framework
│
├── .github/                        # ✅ BEHOUDEN - GitHub configs
├── .claude/                        # ✅ BEHOUDEN - Claude configs
│
├── package.json                    # Root package.json
├── pnpm-workspace.yaml             # Workspace config
├── README.md                       # Project README
├── .gitignore                      # Git ignore
└── .env.example                    # Environment template

# ❌ VERWIJDEREN:
# - backend/          (1.4GB - DUPLICATE)
# - frontend/         (433MB - DUPLICATE)
# - src/              (36KB - ANCIENT DUPLICATE)
# - htmlcov/          (5.1MB - GENERATED)
# - backup-*/         (2.7MB - TEMPORARY)
# - v4-backup/        (824KB - OLD BACKUP)
# - checkpoints/      (EMPTY)
# - configs/          (EMPTY)
# - validations/      (EMPTY)
# - temp/             (TEMPORARY)
# - public/           (DUPLICATE van apps/web/public)
# - exampleLabels/    (VERPLAATS naar backend-python/data/)
```

---

## 📋 ACTIEPLAN

### Fase 1: BACKUP & VOORBEREIDING ⏰ 5 min

```bash
# Maak volledige backup
tar -czf backup-before-cleanup-$(date +%Y%m%d).tar.gz \
  backend/ frontend/ src/ models/ data/ uploads/ exampleLabels/

# Verify backup
tar -tzf backup-before-cleanup-*.tar.gz | wc -l
```

**Verwachte backup grootte:** ~2.2GB

---

### Fase 2: VERWIJDER DUPLICATES & DEPRECATED ⏰ 2 min

```bash
# ❌ Verwijder legacy directories (na backup!)
rm -rf frontend/                    # 1.4GB - DUPLICATE
rm -rf backend/                     # 433MB - DUPLICATE
rm -rf src/                         # 36KB - ANCIENT

# ❌ Verwijder generated/cache
rm -rf htmlcov/                     # 5.1MB - Coverage reports
rm -rf .pytest_cache/
rm -rf .mypy_cache/
rm -rf frontend/.pytest_cache/ 2>/dev/null
rm -rf backend/.pytest_cache/ 2>/dev/null

# ❌ Verwijder old backups
rm -rf backup-20251103-193641/      # 1.9MB
rm -rf v4-backup/                   # 824KB

# ❌ Verwijder lege directories
rm -rf checkpoints/
rm -rf configs/
rm -rf validations/
rm -rf temp/

# ⚠️ Optioneel: Verwijder duplicate public (als apps/web/public bestaat)
# rm -rf public/
```

**Geschatte ruimte bespaard:** ~1.9GB

---

### Fase 3: HERNOEM & CONSOLIDEER ⏰ 3 min

```bash
# Hernoem oude Python backend (als je die wilt behouden)
# mv backend/ backend-python/  # ALLEEN als backend niet verwijderd

# Consolideer infrastructure
mkdir -p infrastructure/docker infrastructure/kubernetes
mv k8s/* infrastructure/kubernetes/ 2>/dev/null
rmdir k8s/ 2>/dev/null

# Consolideer tests
mkdir -p tests/load tests/cypress
mv k6/* tests/load/ 2>/dev/null
mv cypress/* tests/cypress/ 2>/dev/null
rmdir k6/ cypress/ 2>/dev/null

# Verplaats data naar logische locaties
# mkdir -p backend-python/data
# mv models/ backend-python/ 2>/dev/null
# mv data/ backend-python/ 2>/dev/null
# mv uploads/ backend-python/ 2>/dev/null
# mv exampleLabels/ backend-python/data/examples/ 2>/dev/null
```

---

### Fase 4: UPDATE CONFIGURATIES ⏰ 5 min

**Update .gitignore:**
```gitignore
# Build artifacts
htmlcov/
coverage/
.pytest_cache/
.mypy_cache/
*.pyc
__pycache__/

# Temporary
temp/
*.tmp
*.log

# Backups
backup-*/
*-backup/

# IDE
.vscode/
.idea/
```

**Update package.json scripts:** (al gedaan in vorige sessie)

---

### Fase 5: VERIFICATIE & TESTEN ⏰ 10 min

```bash
# Test workspace
npm install

# Test apps
npm run dev           # Start beide apps
npm run build         # Build alles
npm run test          # Run tests

# Verify structure
ls -lah              # Check root directory
du -sh */            # Check directory sizes
```

---

## ⚠️ RISICO ANALYSE

### LAAG RISICO (SAFE)
✅ Verwijderen `htmlcov/`, `.pytest_cache/`, `.mypy_cache/` - GENERATED
✅ Verwijderen `checkpoints/`, `configs/`, `validations/` - LEEG
✅ Verwijderen `backup-*/`, `v4-backup/` - OUDE BACKUPS
✅ Verwijderen `temp/` - TEMPORARY

### MEDIUM RISICO (VOORZICHTIG)
⚠️ Verwijderen `frontend/`, `backend/` - Grote directories, maar duplicates
⚠️ Verwijderen `src/` - Oude code, mogelijk nog referenties
⚠️ Verwijderen `public/` - Check eerst of apps/web/public alles heeft

### HOOG RISICO (BACKUP EERST!)
🔴 Verplaatsen `models/`, `data/`, `uploads/` - Bevat data
🔴 Consolideren `k8s/`, `cypress/`, `k6/` - Actieve infra code

---

## 📝 ROLLBACK PLAN

Als er problemen ontstaan:

```bash
# Restore van backup
tar -xzf backup-before-cleanup-YYYYMMDD.tar.gz

# Of specifieke directories
tar -xzf backup-before-cleanup-YYYYMMDD.tar.gz backend/
tar -xzf backup-before-cleanup-YYYYMMDD.tar.gz frontend/
```

---

## 🎯 VERWACHTE RESULTATEN

### Voor Cleanup
- **Root directories:** 28
- **Totale grootte:** ~4GB
- **Legacy code:** 3 verschillende structuren
- **Lege directories:** 3
- **Generated files:** ~5MB

### Na Cleanup
- **Root directories:** 12-15 (schoner!)
- **Totale grootte:** ~2GB (1.9GB bespaard)
- **Legacy code:** 0 (alleen moderne workspace)
- **Lege directories:** 0
- **Generated files:** 0 (in .gitignore)

### Voordelen
✅ **50% minder root directories**
✅ **1.9GB disk ruimte bespaard**
✅ **Geen conflicterende structures**
✅ **Duidelijke, moderne monorepo**
✅ **Snellere builds** (minder te indexeren)
✅ **Betere developer experience**

---

## 🚀 UITVOERING

**Status:** Wacht op bevestiging

Wil je dat ik dit opschoningsplan **uitvoer**?

**Opties:**
1. **Volledige cleanup** - Alle stappen (aanbevolen)
2. **Conservative cleanup** - Alleen safe items (laag risico)
3. **Custom cleanup** - Jij kiest welke stappen
4. **Analyse only** - Alleen rapport, geen wijzigingen

---

**Geschatte tijd:** 25 minuten totaal
**Geschatte ruimte bespaard:** ~1.9GB
**Risico level:** Medium (met backup: LOW)

---

**Document status:** ANALYSE COMPLEET - WACHT OP GOEDKEURING
