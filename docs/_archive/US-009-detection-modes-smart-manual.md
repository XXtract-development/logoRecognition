# User Story US-009: Detection Modes (Smart & Manual)

**Story ID:** US-009
**Epic:** EPIC-01 Training System
**Priority:** Critical
**Sprint:** 8
**Story Points:** 13
**Status:** 📋 Ready for Development
**Dependencies:** US-008 (Interactive Canvas)

---

## 🎯 **Story Definition**

**Als** Data Manager
**Wil ik** kunnen kiezen tussen automatische logo detectie en handmatige selectie
**Zodat** ik efficiënt en accuraat logo's kan annoteren afhankelijk van de situatie

---

## ✅ **Acceptance Criteria**

### **AC1: Mode Toggle Switch**
- [ ] Toggle switch bovenin interface: "Smart Detection" ⭄ "Manual Mode"
- [ ] Default mode is "Smart Detection"
- [ ] Mode switch is altijd zichtbaar en toegankelijk
- [ ] Visual indicator toont active mode duidelijk
- [ ] Mode persists gedurende annotatie sessie

### **AC2: Smart Detection Mode**
- [ ] Single click op afbeelding triggert automatische boundary detectie
- [ ] Loading indicator toont tijdens AI processing (max 2 seconden)
- [ ] Gedetecteerde boundary wordt getoond als preview (dashed line)
- [ ] Confidence score wordt getoond (bijv. "85% confident")
- [ ] Accept/Reject opties worden getoond onder preview

### **AC3: Smart Detection Preview State**
- [ ] Preview boundary heeft dashed border (#1890ff)
- [ ] Semi-transparante achtergrond (rgba(24, 144, 255, 0.15))
- [ ] Confidence badge rechtsboven boundary
- [ ] "Accept" (✅) en "Reject" (❌) buttons onder boundary
- [ ] "Adjust" (✏️) button voor manual fine-tuning

### **AC4: Manual Mode**
- [ ] Cursor verandert naar crosshair over canvas
- [ ] Click en drag om rectangle te tekenen
- [ ] Real-time preview tijdens drag operatie
- [ ] Minimale grootte enforcement (20x20px)
- [ ] Rectangle wordt automatisch geaccepteerd na release

### **AC5: Smart Detection Fallback**
- [ ] Bij lage confidence (<60%) automatisch fallback naar manual
- [ ] Duidelijke boodschap: "Auto-detection uncertain, please draw manually"
- [ ] Bij API error graceful fallback naar manual mode
- [ ] Retry optie voor smart detection

### **AC6: Detection Success Handling**
- [ ] Accepted boundary wordt converted naar standaard bounding box
- [ ] Bounding box krijgt standaard styling (solid border)
- [ ] Mode blijft behouden voor volgende detection
- [ ] Success feedback via korte animation

---

## 🎨 **UI/UX Specifications**

### **Mode Toggle Interface**
```
┌─────────────────────────────────────┐
│ 🎯 Smart Detection ⭄ 🖱️ Manual     │
│ ┌─────────────┐   ┌─────────────┐   │
│ │ ● Smart     │   │   Manual  ○ │   │
│ └─────────────┘   └─────────────┘   │
├─────────────────────────────────────┤
│                                     │
│    Canvas Area                      │
│                                     │
└─────────────────────────────────────┘
```

### **Smart Detection States**

#### **Detecting State**
```
┌─────────────────────┐
│   📸 Image          │
│                     │
│  📍 Click Point     │
│  ⏳ Detecting...    │
│                     │
└─────────────────────┘
```

#### **Preview State**
```
┌─────────────────────┐
│   📸 Image          │
│                     │
│  ┌ ┅ ┅ ┅ ┅ ┅ ┅ ┐  │
│  ┊ Logo Preview ┊  │ 85% confident
│  └ ┅ ┅ ┅ ┅ ┅ ┅ ┘  │
│                     │
│  ✅ Accept  ❌ Reject │
│      ✏️ Adjust      │
└─────────────────────┘
```

#### **Manual Drawing State**
```
┌─────────────────────┐
│   📸 Image          │
│                     │
│  ┌─ ─ ─ ─ ─ ─ ─ ┐  │ (drawing)
│  │               │  │
│  └─ ─ ─ ─ ─ ─ ─ ┘  │
│                     │
└─────────────────────┘
```

---

## 🛠️ **Technical Implementation**

### **Detection Mode State**
```typescript
type DetectionMode = 'smart' | 'manual';

interface DetectionState {
  mode: DetectionMode;
  isDetecting: boolean;
  preview: {
    boundary: BoundingBox | null;
    confidence: number;
    visible: boolean;
  };
  manualDrawing: {
    isDrawing: boolean;
    startPoint: { x: number; y: number } | null;
    currentRect: BoundingBox | null;
  };
}

const useDetectionMode = () => {
  const [state, setState] = useState<DetectionState>({
    mode: 'smart',
    isDetecting: false,
    preview: { boundary: null, confidence: 0, visible: false },
    manualDrawing: { isDrawing: false, startPoint: null, currentRect: null }
  });

  const toggleMode = () => {
    setState(prev => ({
      ...prev,
      mode: prev.mode === 'smart' ? 'manual' : 'smart',
      preview: { boundary: null, confidence: 0, visible: false }
    }));
  };

  return { state, setState, toggleMode };
};
```

### **Smart Detection Implementation**
```typescript
const handleSmartDetection = async (clickPoint: { x: number; y: number }) => {
  setState(prev => ({ ...prev, isDetecting: true }));

  try {
    const response = await fetch('/api/v1/training/smart-detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: imageId,
        click_x: clickPoint.x,
        click_y: clickPoint.y
      })
    });

    const result = await response.json();

    if (result.confidence < 0.6) {
      // Fallback to manual
      message.warning('Auto-detection uncertain, please draw manually');
      toggleToManualMode();
      return;
    }

    // Show preview
    setState(prev => ({
      ...prev,
      isDetecting: false,
      preview: {
        boundary: result.detected_boundary,
        confidence: result.confidence,
        visible: true
      }
    }));

  } catch (error) {
    console.error('Smart detection failed:', error);
    message.error('Detection failed, switching to manual mode');
    toggleToManualMode();
  }
};
```

### **Manual Drawing Implementation**
```typescript
const handleManualDrawing = {
  start: (event: MouseEvent) => {
    const point = getCanvasCoordinates(event);
    setState(prev => ({
      ...prev,
      manualDrawing: {
        isDrawing: true,
        startPoint: point,
        currentRect: null
      }
    }));
  },

  update: (event: MouseEvent) => {
    if (!state.manualDrawing.isDrawing || !state.manualDrawing.startPoint) return;

    const currentPoint = getCanvasCoordinates(event);
    const rect = calculateRectangle(state.manualDrawing.startPoint, currentPoint);

    setState(prev => ({
      ...prev,
      manualDrawing: {
        ...prev.manualDrawing,
        currentRect: rect
      }
    }));
  },

  finish: () => {
    if (state.manualDrawing.currentRect) {
      const validatedRect = validateMinimumSize(state.manualDrawing.currentRect);
      if (validatedRect) {
        onBoundingBoxCreate(validatedRect);
      }
    }

    setState(prev => ({
      ...prev,
      manualDrawing: {
        isDrawing: false,
        startPoint: null,
        currentRect: null
      }
    }));
  }
};
```

### **Mode Toggle Component**
```typescript
const DetectionModeToggle: React.FC<{
  mode: DetectionMode;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ mode, onToggle, disabled = false }) => {
  return (
    <div className="detection-mode-toggle">
      <Radio.Group
        value={mode}
        onChange={(e) => onToggle()}
        disabled={disabled}
        buttonStyle="solid"
        size="large"
      >
        <Radio.Button value="smart">
          🎯 Smart Detection
        </Radio.Button>
        <Radio.Button value="manual">
          🖱️ Manual Mode
        </Radio.Button>
      </Radio.Group>

      <div className="mode-description">
        {mode === 'smart'
          ? "Click on logos for automatic detection"
          : "Click and drag to draw bounding boxes"
        }
      </div>
    </div>
  );
};
```

### **Preview Actions Component**
```typescript
const DetectionPreview: React.FC<{
  boundary: BoundingBox;
  confidence: number;
  onAccept: () => void;
  onReject: () => void;
  onAdjust: () => void;
}> = ({ boundary, confidence, onAccept, onReject, onAdjust }) => {
  return (
    <>
      {/* Dashed preview boundary */}
      <div
        className="detection-preview"
        style={{
          position: 'absolute',
          left: boundary.x,
          top: boundary.y,
          width: boundary.width,
          height: boundary.height,
          border: '2px dashed #1890ff',
          backgroundColor: 'rgba(24, 144, 255, 0.15)',
          pointerEvents: 'none'
        }}
      >
        {/* Confidence badge */}
        <div className="confidence-badge">
          {Math.round(confidence * 100)}% confident
        </div>
      </div>

      {/* Action buttons */}
      <div className="preview-actions">
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={onAccept}
        >
          Accept
        </Button>
        <Button
          icon={<EditOutlined />}
          onClick={onAdjust}
        >
          Adjust
        </Button>
        <Button
          icon={<CloseOutlined />}
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
    </>
  );
};
```

---

## 🧪 **Testing Requirements**

### **Unit Tests**
- [ ] Mode toggle state management
- [ ] Smart detection API integration
- [ ] Manual drawing calculations
- [ ] Fallback logic for failed detections
- [ ] Confidence threshold handling

### **Integration Tests**
- [ ] Smart detection → preview → accept flow
- [ ] Smart detection → manual fallback flow
- [ ] Manual drawing complete workflow
- [ ] Mode switching during active operations
- [ ] Error handling and recovery

### **E2E Tests**
- [ ] Complete smart detection workflow
- [ ] Complete manual detection workflow
- [ ] Mode switching scenarios
- [ ] API failure scenarios
- [ ] Performance under load

---

## 📊 **Performance Requirements**

- [ ] Smart detection completes within 2 seconds
- [ ] Manual drawing provides real-time feedback (60fps)
- [ ] Mode switching is instantaneous (<100ms)
- [ ] API failures handled gracefully with 3-second timeout
- [ ] Memory usage remains stable during extended use

---

## 🎛️ **API Specifications**

### **Smart Detection Endpoint**
```typescript
// POST /api/v1/training/smart-detect
interface SmartDetectRequest {
  file_id: string;
  click_x: number;
  click_y: number;
  detection_model?: string;
}

interface SmartDetectResponse {
  success: boolean;
  detected_boundary: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  processing_time_ms: number;
  fallback_needed: boolean;
  error?: string;
}
```

---

## 🔗 **Dependencies**

### **Prerequisite Stories**
- ✅ US-008: Interactive Canvas with Bounding Boxes

### **Required APIs**
- Smart detection endpoint (AI/ML team)
- Image preprocessing service
- Error logging service

### **External Libraries**
- Ant Design components (Radio, Button)
- Canvas interaction library
- Throttle/debounce utilities

---

## 📋 **Definition of Done**

- [ ] Both detection modes fully functional
- [ ] Smooth transitions between modes
- [ ] All error scenarios handled gracefully
- [ ] API integration tested and documented
- [ ] Performance requirements met
- [ ] Accessibility compliance (keyboard shortcuts)
- [ ] Code review completed
- [ ] Unit tests ≥90% coverage
- [ ] User acceptance testing passed

---

## 📝 **Implementation Notes**

### **Smart Detection Algorithm**
The backend AI service should implement:
- Region of Interest (ROI) extraction around click point
- Edge detection using Canny or similar
- Contour finding and boundary calculation
- Confidence scoring based on edge strength and contour completeness

### **Fallback Strategy**
- Confidence < 60%: Automatic fallback
- API timeout (>2s): Graceful degradation
- Server error: Cached fallback with retry option
- Network error: Offline mode with manual only

### **UX Considerations**
- Provide clear visual feedback for all states
- Maintain user context when switching modes
- Offer keyboard shortcuts for power users
- Include help tooltips for new users

This story provides the core detection functionality that enables efficient logo annotation through both automated and manual methods.