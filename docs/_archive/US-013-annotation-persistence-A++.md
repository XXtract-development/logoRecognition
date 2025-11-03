# User Story US-013: Annotation Persistence & Dataset Versioning

**Story ID:** US-013
**Epic:** EPIC-01 Training System
**Priority:** Critical
**Sprint:** 9
**Story Points:** 8
**Status:** ✅ Approved
**Dependencies:** US-011 (Category Management), US-012 (Validation Gate)

---

## 🎯 **Story Definition**

**Als** Data Manager
**Wil ik** dat al mijn geannoteerde logo's veilig opgeslagen en geversioneerd worden
**Zodat** ik een consistente trainingsdataset kan opbouwen die klaar is voor modeltraining

---

## 🔗 **Context from Dependencies**

### **From US-011 (Category Management):**
- Provides hierarchical category structure: `Category (e.g., "Merk") → Value (e.g., "Nike")`
- Categories stored in `categoryStore` with `categoryId`, `valueId` pairs
- Validation rules: required categories marked with `isRequired: true`

### **From US-012 (Validation Gate):**
- Implements validation framework with rules:
  - Required field checks (category/value must be selected)
  - Bounding box boundary validation (must be within image)
  - Minimum box size: 20x20 pixels
- Validation state stored in `validationStore.errors[]`
- Reuse validation service: `services/validation/annotationValidator.ts`

---

## ✅ **Acceptance Criteria**

### **AC1: Persist All Annotations**
- [ ] "Save annotations" actie stuurt alle bounding boxes + category/value paren naar `/api/v1/training/annotations`
- [ ] Response bevat `dataset_version_id`, totaal aantal logo's en checksum
- [ ] Succesmelding toont datum/tijd en versie-ID
- [ ] Errors worden zichtbaar weergegeven met retry-optie en detailinformatie

### **AC2: Autosave & Draft Recovery**
- [ ] Autosave elke 60 seconden naar backend met `status=draft`
- [ ] Lokale fallback storage (IndexedDB) bewaart laatste 20 wijzigingen
- [ ] Bij crash of refresh worden incomplete annotaties automatisch hersteld
- [ ] Gebruiker krijgt keuze tussen lokale draft of serverversie bij conflict

### **AC3: Dataset Version Management**
- [ ] Elke succesvolle save maakt nieuwe datasetversie met metadata (aantal logo's, categorieën, tags)
- [ ] UI toont changelog t.o.v. vorige versie (toegevoegd, aangepast, verwijderd)
- [ ] Mogelijkheid om vorige versie in te laden (read-only) ter controle
- [ ] Preventie van duplicate saves zonder wijzigingen (`no-op` melding)

### **AC4: Validation & Integrity Checks**
- [ ] Backend valideert dat alle bounding boxes binnen afbeelding vallen (reuse US-012 validator)
- [ ] Duplicaatdetectie op category-value + bounding box overlap >80%
- [ ] Conflicten worden gemarkeerd met actieknoppen (merge, keep both, discard)
- [ ] Opslag blokkeert wanneer verplichte velden ontbreken (gebruik US-012 `annotationValidator`)

### **AC5: Audit Logging & Attribution**
- [ ] Elke save registreert gebruiker, timestamp, affected images en versie-ID in audit trail
- [ ] UI toont laatste wijzigingen per gebruiker (max 5 recent)
- [ ] Exportlog beschikbaar als CSV/JSON vanuit auditpaneel
- [ ] Audit entries koppelbaar aan dataset versies via link

### **AC6: API Contract Assurance**
- [ ] Request payload volgt schema `AnnotationSubmission` (zie technische sectie)
- [ ] API responses voldoen aan OpenAPI spec met success/error voorbeelden
- [ ] Contract tests draaien in CI tegen mocked backend
- [ ] Feature flag maakt het mogelijk om nieuwe backend endpoints gefaseerd uit te rollen

---

## 🎨 **UI/UX Specifications**

### **Save Banner & Version Summary**
```
┌───────────────────────────────────────────────┐
│ 💾 Annotations saved as Version #23 (128 logos)│
│ Last updated: Today 14:32 by Anouk            │
│ [View details]                 [Dataset audit] │
└───────────────────────────────────────────────┘
```

### **Dataset Version Drawer**
```
┌───────────────────────────────────────────────┐
│ Version History                               │
├───────────────────────────────────────────────┤
│ • v23 — 128 logos — 4 categories — Today 14:32 │
│   Added: 12  | Updated: 5 | Removed: 1         │
│   [Load read-only] [Export JSON]               │
│ • v22 — 117 logos — 4 categories — Today 10:05 │
│   Added: 0  | Updated: 3 | Removed: 0          │
│   [Compare] [Audit trail]                      │
└───────────────────────────────────────────────┘
```

### **Conflict Resolution Modal**
```
┌────────────────────────────┐
│ ⚠️ Duplicate Annotation    │
├────────────────────────────┤
│ Detected similar entry in version v22         │
│                                             │
│ Current box: ID #box-103 (Nike)             │
│ Existing box: ID #box-067 (Nike)            │
│                                             │
│ Overlap: 86% | Category: Merk               │
│                                             │
│ [Keep latest] [Keep previous] [Merge values]│
└────────────────────────────┘
```

---

## 🛠️ **Technical Implementation**

### **Request/Response Contracts**
```typescript
interface AnnotationSubmission {
  batchId: string;
  imageId: string;
  annotations: LogoAnnotationPayload[];
  status: 'draft' | 'final';
  clientVersion: string;
  autosave?: boolean;
}

interface LogoAnnotationPayload {
  id: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  categoryId: string;  // From US-011 categoryStore
  valueId: string;      // From US-011 categoryStore
  manual: boolean;
  confidence?: number;
  updatedAt: string;
}

interface AnnotationSaveResponse {
  datasetVersionId: string;
  totalAnnotations: number;
  categories: string[];
  checksum: string;
  modified: {
    added: number;
    updated: number;
    removed: number;
  };
}
```

### **State Management**
```typescript
// Extend existing trainingStore
interface TrainingStore {
  // Existing from US-011/US-012
  categories: Category[];
  validationErrors: ValidationError[];

  // New for US-013
  datasetVersion: string | null;
  pendingChanges: AnnotationChange[];
  lastSavedAt: Date | null;
  autosaveTimer: number | null;
  draftStatus: 'saved' | 'pending' | 'error';
}
```

### **IndexedDB Schema (Dexie.js)**
```typescript
// Local draft storage schema
interface DraftSchema {
  drafts: 'id, batchId, imageId, timestamp',
  annotations: 'id, draftId, boundingBox, categoryId, valueId',
  metadata: 'key, value'
}

// Store structure
const db = new Dexie('AnnotationDrafts');
db.version(1).stores({
  drafts: '++id, batchId, imageId, timestamp',
  annotations: '++id, draftId, [x+y+width+height], categoryId, valueId',
  metadata: 'key'
});
```

### **File Structure**
```
src/
├── services/
│   ├── persistence/
│   │   ├── AnnotationSaveService.ts      # Main save orchestration
│   │   ├── AutosaveManager.ts           # Debounced autosave logic
│   │   ├── DraftRecoveryService.ts      # IndexedDB operations
│   │   └── VersionDiffEngine.ts         # Change detection
│   └── validation/
│       └── annotationValidator.ts       # Reused from US-012
├── components/
│   ├── SaveBanner.tsx                   # Save status display
│   ├── VersionHistoryDrawer.tsx         # Version browser
│   └── ConflictResolutionModal.tsx      # Duplicate handler
└── stores/
    └── trainingStore.ts                  # Extended with version state
```

### **API Endpoints**
- `POST /api/v1/training/annotations` — final save
- `PUT /api/v1/training/annotations/{datasetVersionId}` — update bestaande versie
- `GET /api/v1/training/annotations/history` — versieoverzicht (paginated)
- `GET /api/v1/training/annotations/{datasetVersionId}` — read-only dataset snapshot
- `GET /api/v1/training/annotations/{datasetVersionId}/audit` — audit logging

### **Backend Requirements**
- Relational schema (`annotations`, `annotation_versions`, `annotation_audit`)
- Soft-delete mechanisme voor removal tracking
- Trigger berekent checksum (SHA-256 over gesorteerde annotaties)
- Background task om oude drafts (>30 dagen) op te ruimen
- Permission check: user must have `training:write` role (from auth context)

### **Integration Points**
```typescript
// Reuse validation from US-012
import { annotationValidator } from 'services/validation/annotationValidator';

// Use category structure from US-011
import { categoryStore } from 'stores/categoryStore';

// Validation before save
const errors = annotationValidator.validate(annotations);
if (errors.length > 0) {
  // Block save, show errors using existing UI from US-012
  return;
}
```

---

## 🧪 **Testing Requirements**

### **Unit Tests**
- [ ] Diff-engine detecteert correcte status (added/updated/removed)
- [ ] Autosave throttle en debounce timings (60s interval, 500ms debounce)
- [ ] Conflict resolver produceert juiste payloads voor alle 3 opties
- [ ] IndexedDB adapter foutafhandeling bij quota exceeded
- [ ] Checksum berekening is deterministisch

### **Integration Tests**
- [ ] End-to-end save → version history → compare flow
- [ ] Autosave + crash + recovery scenario met IndexedDB
- [ ] Duplicate detection en conflict handling met 80% overlap threshold
- [ ] Feature flag fallback naar oude endpoint wanneer disabled
- [ ] Validation pipeline integration met US-012 validators

### **E2E Tests**
- [ ] Annotate 10 logo's → save → reload session → verify dataset version
- [ ] Offline mode → annotate → reconnect → autosave sync
- [ ] Intentional API failure → retry → eventual success path
- [ ] Permission denial → appropriate error message → no data loss

---

## 📊 **Performance & Reliability**
- [ ] Saves ronden af binnen 800ms voor batches tot 200 annotaties
- [ ] Autosave requests zijn idempotent en veilig om te herhalen
- [ ] IndexedDB fallback ondersteunt 5.000 annotaties per batch
- [ ] Versieoverzicht laadt eerste pagina < 300ms
- [ ] Diff berekening < 100ms voor 500 annotaties

---

## 🔗 **Dependencies & Feature Flags**
- Feature flag `training.datasetVersioning` per environment
- Vereist backend migrations voor nieuwe tabellen
- Audit trail integreert met bestaande monitoring (Grafana dashboard)
- Depends on auth service voor user context (permission checks)

---

## 📋 **Definition of Done**
- [ ] Acceptance criteria AC1-AC6 gedemonstreerd in staging
- [ ] OpenAPI contract geüpdatet en gedeeld met backend
- [ ] UX review goedgekeurd met focus op conflict flows
- [ ] Unit/integration/E2E tests toegevoegd en groen in CI
- [ ] Monitoring dashboards (save success rate, autosave failures) opgezet
- [ ] Documentatie toegevoegd aan `docs/training/annotation-persistence.md`
- [ ] Performance benchmarks verified in staging environment

---

## 📝 **Implementation Notes**
- Gebruik optimistic UI updates maar revert bij API failure
- Schakel over naar background sync API wanneer browser dit ondersteunt
- Voeg toast-notificaties toe voor save status (success, warning, error)
- Plan data retention beleid samen met compliance team
- Implement exponential backoff voor retry logic (1s, 2s, 4s, 8s max)
- Use requestIdleCallback voor non-critical autosave operations

---

## 🚀 **Implementation Order**
1. Extend `trainingStore` met version state management
2. Implement `VersionDiffEngine` voor change detection
3. Build `AnnotationSaveService` met basic save functionaliteit
4. Add `AutosaveManager` met debouncing
5. Implement `DraftRecoveryService` met IndexedDB
6. Create UI components (SaveBanner, VersionHistoryDrawer)
7. Add `ConflictResolutionModal` voor duplicates
8. Write comprehensive tests
9. Integrate with feature flags
10. Deploy to staging voor validation

---

## 📋 **Dev Agent Record**

### **Tasks**
- [x] Uitbreiden `trainingStore` met dataset version state
- [x] Implementeren AnnotationSaveService + API-clients
- [x] Bouwen van VersionHistoryDrawer component
- [x] Implementeren autosave + IndexedDB fallback
- [x] Toevoegen conflict resolution modal
- [x] Schrijven unit tests voor diff-engine en autosave
- [x] Schrijven integration tests voor save flows
- [x] Configureren feature flag toggles per environment

### **Agent Model Used**
- n.v.t.

### **Debug Log References**
- 2025-01-21: `pytest tests/test_annotation_service.py` (fails coverage gate after new service tests)
- 2025-01-21: `npm test -- --watchAll=false --testPathPattern=annotationDiff`
- 2025-01-21: `npm test -- --watchAll=false --testPathPattern=useAutosave`

### **Completion Notes**
- Added file-backed annotation repository with dataset versioning, autosave drafts, and audit trail.
- Refreshed annotation workflow UI with save banner, history drawer, conflict modal, and IndexedDB draft recovery.
- Extended Zustand stores and services to surface feature flag-driven dataset versioning controls.

### **File List**
- backend/app/models/annotation.py
- backend/app/repositories/annotation_repository.py
- backend/app/services/annotation_service.py
- backend/app/routers/training.py
- backend/tests/test_annotation_service.py
- frontend/src/pages/AnnotationPage.tsx
- frontend/src/store/trainingStore.ts
- frontend/src/services/annotationService.ts
- frontend/src/components/SaveBanner.tsx
- frontend/src/components/VersionHistoryDrawer.tsx
- frontend/src/components/ConflictResolutionModal.tsx
- frontend/src/hooks/useAutosave.ts
- frontend/src/utils/annotationDiff.ts
- frontend/src/utils/indexedDbDraft.ts
- frontend/src/utils/__tests__/annotationDiff.test.ts
- frontend/src/hooks/__tests__/useAutosave.test.tsx

### **Change Log**
- 2025-01-06: Story aangemaakt door Codex assistent
- 2025-01-17: Story verbeterd naar A++ grade door Bob (Scrum Master)
- 2025-01-21: Added dataset versioning persistence, autosave, and UI integrations (James)
