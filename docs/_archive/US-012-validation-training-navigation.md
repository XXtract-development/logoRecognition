# User Story US-012: Validation & Training Navigation

**Story ID:** US-012
**Epic:** EPIC-01 Training System
**Priority:** High
**Sprint:** 9
**Story Points:** 5
**Status:** 📋 Ready for Development
**Dependencies:** US-011 (Category Management)

---

## 🎯 **Story Definition**

**Als** Data Manager
**Wil ik** alleen naar de training stap kunnen gaan als alle logo's correct gecategoriseerd zijn
**Zodat** het machine learning model getraind wordt met complete en accurate data

---

## ✅ **Acceptance Criteria**

### **AC1: Validation Rules**
- [ ] "Continue to Training" button is disabled totdat alle bounding boxes category + value hebben
- [ ] Real-time validatie updates button status bij elke wijziging
- [ ] Clear visual indicator toont welke logos nog incomplete zijn
- [ ] Validation error messages zijn specifiek en actionable

### **AC2: Progress Feedback**
- [ ] Progress bar toont percentage complete annotations
- [ ] Counter toont "X of Y logos categorized"
- [ ] Visual indicators bij elke preview card (✅ complete, ⚠️ incomplete)
- [ ] Summary overzicht van alle category-value paren

### **AC3: Validation Messages**
- [ ] "All logos must be categorized before training" message bij incomplete state
- [ ] Highlight incomplete preview cards met rode border
- [ ] Tooltip op disabled button verklaart vereisten
- [ ] Success message bij 100% completion

### **AC4: Navigation Flow**
- [ ] Continue button navigeert naar training page
- [ ] Training data wordt doorgegeven aan training interface
- [ ] Back button behoudt annotation state
- [ ] Confirm dialog bij navigation zonder save

### **AC5: Data Validation**
- [ ] Prevent duplicate category-value combinations binnen zelfde image
- [ ] Validate category en value niet leeg zijn
- [ ] Check bounding box coordinaten zijn valid
- [ ] Ensure minimum 1 annotation per image

### **AC6: Error Recovery**
- [ ] Save progress automatisch elke 30 seconden
- [ ] Recovery na browser refresh/crash
- [ ] Clear error states na correction
- [ ] Undo/redo functionaliteit voor annotations

---

## 🎨 **UI/UX Specifications**

### **Validation States Overview**
```
┌─────────────────────────────┐
│ Annotation Validation       │
├─────────────────────────────┤
│                             │
│ Progress: ████████░░ 80%    │
│ Completed: 4 of 5 logos     │
│                             │
│ ⚠️  Missing Information:    │
│ • Logo 3: Category missing  │
│ • Logo 5: Value missing     │
│                             │
│ [Continue to Training] 🔒   │
│ Must complete all logos     │
│                             │
└─────────────────────────────┘
```

### **Complete State**
```
┌─────────────────────────────┐
│ Annotation Complete ✅      │
├─────────────────────────────┤
│                             │
│ Progress: ██████████ 100%   │
│ All 5 logos categorized     │
│                             │
│ 📊 Summary:                 │
│ • Merk: 3 logos             │
│ • Recycling: 2 logos        │
│                             │
│ ✅ Ready for training       │
│                             │
│ [Continue to Training] →    │
│                             │
└─────────────────────────────┘
```

### **Incomplete Preview Card Highlighting**
```
┌─────────────────────────────┐ 🗑️
│ ┌─────────────────────────┐ │
│ │                         │ │ ⚠️
│ │    Cropped Logo         │ │
│ │                         │ │
│ └─────────────────────────┘ │
│ ⚠️ Missing: Value           │
│                             │
│ Category: [Merk        ▼]   │
│ Value:    [____________] ←── │
│                             │
│ ID: box-003                 │
└─────────────────────────────┘
    ↑ Red border for incomplete
```

---

## 🛠️ **Technical Implementation**

### **Validation State Management**
```typescript
interface ValidationState {
  isComplete: boolean;
  completedCount: number;
  totalCount: number;
  incompleteAnnotations: string[];  // IDs of incomplete annotations
  validationErrors: ValidationError[];
  canProceedToTraining: boolean;
}

interface ValidationError {
  id: string;
  annotationId: string;
  type: 'missing_category' | 'missing_value' | 'duplicate' | 'invalid_coordinates';
  message: string;
  field?: 'category' | 'value';
}

const useValidation = (annotations: LogoAnnotation[]): ValidationState => {
  return useMemo(() => {
    const errors: ValidationError[] = [];
    const incompleteIds: string[] = [];

    // Check each annotation for completeness
    annotations.forEach(annotation => {
      if (!annotation.category) {
        errors.push({
          id: `${annotation.id}-category`,
          annotationId: annotation.id,
          type: 'missing_category',
          message: 'Category is required',
          field: 'category'
        });
        incompleteIds.push(annotation.id);
      }

      if (!annotation.value || !annotation.value.value.trim()) {
        errors.push({
          id: `${annotation.id}-value`,
          annotationId: annotation.id,
          type: 'missing_value',
          message: 'Value is required',
          field: 'value'
        });
        if (!incompleteIds.includes(annotation.id)) {
          incompleteIds.push(annotation.id);
        }
      }
    });

    // Check for duplicates
    const combinations = new Map<string, string[]>();
    annotations.forEach(annotation => {
      if (annotation.category && annotation.value) {
        const key = `${annotation.category.name}-${annotation.value.value}`;
        if (!combinations.has(key)) {
          combinations.set(key, []);
        }
        combinations.get(key)!.push(annotation.id);
      }
    });

    combinations.forEach((ids, combination) => {
      if (ids.length > 1) {
        ids.forEach(id => {
          errors.push({
            id: `${id}-duplicate`,
            annotationId: id,
            type: 'duplicate',
            message: `Duplicate combination: ${combination}`
          });
        });
      }
    });

    const completedCount = annotations.length - incompleteIds.length;
    const isComplete = incompleteIds.length === 0 && annotations.length > 0;

    return {
      isComplete,
      completedCount,
      totalCount: annotations.length,
      incompleteAnnotations: incompleteIds,
      validationErrors: errors,
      canProceedToTraining: isComplete && errors.length === 0
    };
  }, [annotations]);
};
```

### **Validation Summary Component**
```typescript
const ValidationSummary: React.FC<{
  validationState: ValidationState;
  annotations: LogoAnnotation[];
  onContinueToTraining: () => void;
}> = ({ validationState, annotations, onContinueToTraining }) => {
  const { isComplete, completedCount, totalCount, validationErrors, canProceedToTraining } = validationState;

  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const getCategorySummary = () => {
    const categoryCount = new Map<string, number>();
    annotations
      .filter(a => a.isComplete && a.category)
      .forEach(a => {
        const categoryName = a.category!.name;
        categoryCount.set(categoryName, (categoryCount.get(categoryName) || 0) + 1);
      });
    return Array.from(categoryCount.entries());
  };

  const getIncompleteDetails = () => {
    return validationErrors
      .filter(error => error.type === 'missing_category' || error.type === 'missing_value')
      .reduce((acc, error) => {
        const existing = acc.find(item => item.annotationId === error.annotationId);
        if (existing) {
          existing.missing.push(error.field!);
        } else {
          acc.push({
            annotationId: error.annotationId,
            missing: [error.field!]
          });
        }
        return acc;
      }, [] as Array<{ annotationId: string; missing: string[] }>);
  };

  return (
    <Card
      title={
        <div className="validation-header">
          {isComplete ? (
            <>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>Annotation Complete</span>
            </>
          ) : (
            <>
              <ExclamationCircleOutlined style={{ color: '#faad14' }} />
              <span>Annotation Validation</span>
            </>
          )}
        </div>
      }
      className={`validation-summary ${isComplete ? 'complete' : 'incomplete'}`}
    >
      {/* Progress Section */}
      <div className="progress-section">
        <Progress
          percent={Math.round(progressPercent)}
          status={isComplete ? 'success' : 'active'}
          strokeColor={isComplete ? '#52c41a' : '#1890ff'}
        />
        <div className="progress-text">
          Completed: {completedCount} of {totalCount} logos
        </div>
      </div>

      {/* Incomplete Details */}
      {!isComplete && (
        <div className="incomplete-section">
          <div className="section-title">⚠️ Missing Information:</div>
          <ul className="incomplete-list">
            {getIncompleteDetails().map(item => {
              const annotation = annotations.find(a => a.id === item.annotationId);
              return (
                <li key={item.annotationId}>
                  Logo {annotation?.boundingBoxId}: {item.missing.join(', ')} missing
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Category Summary */}
      {isComplete && (
        <div className="summary-section">
          <div className="section-title">📊 Summary:</div>
          <ul className="category-summary">
            {getCategorySummary().map(([category, count]) => (
              <li key={category}>
                {category}: {count} logo{count !== 1 ? 's' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Continue Button */}
      <div className="continue-section">
        {isComplete && (
          <div className="ready-message">
            ✅ Ready for training
          </div>
        )}

        <Tooltip
          title={
            !canProceedToTraining
              ? "Complete all logo categorization before proceeding"
              : "Start model training with annotated data"
          }
        >
          <Button
            type="primary"
            size="large"
            disabled={!canProceedToTraining}
            onClick={onContinueToTraining}
            icon={<ArrowRightOutlined />}
            block
          >
            Continue to Training
          </Button>
        </Tooltip>

        {!canProceedToTraining && (
          <div className="validation-message">
            All logos must be categorized before training
          </div>
        )}
      </div>
    </Card>
  );
};
```

### **Enhanced Preview Card with Validation**
```typescript
const ValidatedPreviewCard: React.FC<{
  preview: LogoPreview;
  annotation: LogoAnnotation;
  validationErrors: ValidationError[];
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ preview, annotation, validationErrors, isSelected, onSelect, onDelete }) => {
  const hasErrors = validationErrors.some(error => error.annotationId === annotation.id);
  const isComplete = annotation.isComplete && !hasErrors;

  const getErrorMessages = () => {
    return validationErrors
      .filter(error => error.annotationId === annotation.id)
      .map(error => error.message);
  };

  return (
    <div
      className={`preview-card ${isSelected ? 'selected' : ''} ${hasErrors ? 'has-errors' : ''} ${isComplete ? 'complete' : ''}`}
      onClick={onSelect}
    >
      {/* Status Indicator */}
      <div className="status-indicator">
        {isComplete ? (
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
        ) : (
          <ExclamationCircleOutlined style={{ color: '#faad14' }} />
        )}
      </div>

      {/* Preview Image */}
      <div className="preview-image-container">
        <img src={preview.imageUrl} alt={`Logo preview ${preview.id}`} />
        <Button
          className="delete-button"
          type="text"
          icon={<DeleteOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          danger
        />
      </div>

      {/* Category Assignment */}
      <CategoryValueAssignment
        annotation={annotation}
        categories={categories}
        onUpdate={onUpdateAnnotation}
      />

      {/* Error Messages */}
      {hasErrors && (
        <div className="error-messages">
          {getErrorMessages().map((message, index) => (
            <div key={index} className="error-message">
              ⚠️ {message}
            </div>
          ))}
        </div>
      )}

      {/* Completion Status */}
      <div className="completion-status">
        {isComplete ? (
          <span className="complete-badge">✅ Complete</span>
        ) : (
          <span className="incomplete-badge">⚠️ Incomplete</span>
        )}
      </div>
    </div>
  );
};
```

### **Auto-Save Hook**
```typescript
const useAutoSave = (annotations: LogoAnnotation[], intervalMs: number = 30000) => {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  useEffect(() => {
    const interval = setInterval(async () => {
      if (annotations.length === 0) return;

      setSaveStatus('saving');
      try {
        await fetch('/api/v1/training/annotations/autosave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ annotations })
        });

        setLastSaved(new Date());
        setSaveStatus('saved');
      } catch (error) {
        console.error('Auto-save failed:', error);
        setSaveStatus('error');

        // Fallback to localStorage
        localStorage.setItem('annotations-backup', JSON.stringify({
          annotations,
          timestamp: new Date().toISOString()
        }));
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [annotations, intervalMs]);

  return { lastSaved, saveStatus };
};
```

### **Navigation Guard Hook**
```typescript
const useNavigationGuard = (hasUnsavedChanges: boolean) => {
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const confirmNavigation = (callback: () => void) => {
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: 'Unsaved Changes',
        content: 'You have unsaved changes. Are you sure you want to continue?',
        onOk: callback,
        okText: 'Continue',
        cancelText: 'Stay'
      });
    } else {
      callback();
    }
  };

  return { confirmNavigation };
};
```

---

## 🧪 **Testing Requirements**

### **Unit Tests**
- [ ] Validation logic for all annotation states
- [ ] Progress calculation accuracy
- [ ] Error message generation
- [ ] Auto-save functionality
- [ ] Navigation guard behavior

### **Integration Tests**
- [ ] Real-time validation updates
- [ ] Complete annotation workflow
- [ ] Auto-save and recovery
- [ ] Navigation between pages

### **E2E Tests**
- [ ] End-to-end validation workflow
- [ ] Training navigation with complete data
- [ ] Error recovery scenarios
- [ ] Browser refresh recovery

---

## 📊 **Performance Requirements**

- [ ] Validation checks complete within 50ms
- [ ] Real-time updates without lag
- [ ] Auto-save completes within 2 seconds
- [ ] Smooth UI updates during validation
- [ ] Efficient rendering with many annotations

---

## 🔗 **Dependencies**

### **Prerequisite Stories**
- ✅ US-008: Interactive Canvas
- ✅ US-009: Detection Modes
- ✅ US-010: Preview Panel
- ✅ US-011: Category Management

### **Next Stories**
- Training page implementation
- Model training workflow
- Results visualization

---

## 📋 **Definition of Done**

- [ ] All validation rules implemented and tested
- [ ] Real-time feedback working correctly
- [ ] Auto-save functionality reliable
- [ ] Navigation guards preventing data loss
- [ ] Error recovery mechanisms functional
- [ ] Performance requirements met
- [ ] Accessibility compliance
- [ ] Code review completed
- [ ] Unit tests ≥90% coverage

---

## 📝 **Implementation Notes**

### **Validation Strategy**
- Client-side validation for immediate feedback
- Server-side validation for data integrity
- Optimistic updates with rollback capability
- Graceful degradation for offline scenarios

### **UX Considerations**
- Clear visual hierarchy for validation states
- Helpful error messages with actionable guidance
- Progress indicators to motivate completion
- Non-blocking validation that doesn't interrupt flow

### **Performance Optimizations**
- Debounced validation to avoid excessive computation
- Memoized validation results
- Efficient re-rendering strategies
- Background auto-save without UI blocking

This story ensures data quality and provides a smooth transition to the training phase, completing the annotation workflow with robust validation and user guidance.