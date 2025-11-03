# User Story US-010: Cropped Preview Panel

**Story ID:** US-010
**Epic:** EPIC-01 Training System
**Priority:** High
**Sprint:** 8
**Story Points:** 5
**Status:** 📋 Ready for Development
**Dependencies:** US-008 (Canvas), US-009 (Detection Modes)

---

## 🎯 **Story Definition**

**Als** Data Manager
**Wil ik** automatisch uitgesneden logo previews zien van alle bounding boxes
**Zodat** ik direct kan controleren welke logo's correct zijn geselecteerd voordat ik ze categoriseer

---

## ✅ **Acceptance Criteria**

### **AC1: Automatic Preview Generation**
- [ ] Zodra bounding box wordt gemaakt verschijnt cropped preview in rechterpanel
- [ ] Preview toont exact de afbeelding binnen bounding box coordinaten
- [ ] Preview behoudt originele aspect ratio van bounding box
- [ ] Preview wordt real-time bijgewerkt bij bounding box resize

### **AC2: Preview Panel Layout**
- [ ] Rechterpanel heeft vaste breedte (300px) en scroll bij overflow
- [ ] Elke preview heeft standaard grootte 150x150px (max)
- [ ] Previews worden getoond in chronologische volgorde van creatie
- [ ] Leeg panel toont "No logos selected yet" placeholder

### **AC3: Preview Card Information**
- [ ] Elke preview card toont: cropped image, bounding box ID, coordinates
- [ ] Preview card heeft hover state met subtiele highlight
- [ ] Preview card heeft delete button (🗑️) rechtsboven
- [ ] Selected preview card heeft visuele indicator (blue border)

### **AC4: Bidirectional Synchronization**
- [ ] Klik op preview card selecteert bijbehorende bounding box op canvas
- [ ] Delete preview card verwijdert bounding box van canvas
- [ ] Delete bounding box van canvas verwijdert preview card
- [ ] Hover preview card highlight bijbehorende bounding box

### **AC5: Preview Quality & Performance**
- [ ] Cropped previews zijn scherp en goed leesbaar
- [ ] Preview generatie duurt max 100ms per bounding box
- [ ] Smooth scroll in preview panel bij veel previews
- [ ] Lazy loading voor previews buiten viewport

### **AC6: Empty States**
- [ ] Friendly message bij geen bounding boxes
- [ ] Loading state tijdens preview generatie
- [ ] Error state bij preview generatie problemen
- [ ] Retry functionaliteit bij failures

---

## 🎨 **UI/UX Specifications**

### **Panel Layout**
```
┌─────────────────┬─────────────────────────┐
│                 │   Logo Previews         │
│                 │  ┌─────────────────┐    │
│     Canvas      │  │ 🖼️ Logo 1      │🗑️ │
│                 │  │ ID: box-001     │    │
│                 │  │ (150,200,80,60) │    │
│                 │  └─────────────────┘    │
│                 │  ┌─────────────────┐    │
│                 │  │ 🖼️ Logo 2      │🗑️ │
│                 │  │ ID: box-002     │    │
│                 │  │ (300,100,60,90) │    │
│                 │  └─────────────────┘    │
│                 │                         │
│                 │  + More previews...     │
└─────────────────┴─────────────────────────┘
```

### **Preview Card Design**
```
┌─────────────────────────────┐
│ ┌─────────────────────────┐ │ 🗑️
│ │                         │ │
│ │    Cropped Logo         │ │
│ │                         │ │
│ └─────────────────────────┘ │
│ ID: box-001                 │
│ (x:150, y:200, w:80, h:60)  │
│ Size: 150x150px             │
└─────────────────────────────┘
```

### **Empty State**
```
┌─────────────────────────────┐
│     Logo Previews           │
│                             │
│      📸                     │
│                             │
│   No logos selected yet     │
│                             │
│  Create bounding boxes on   │
│  the left to see previews   │
│                             │
└─────────────────────────────┘
```

---

## 🛠️ **Technical Implementation**

### **Preview Data Structure**
```typescript
interface LogoPreview {
  id: string;
  boundingBoxId: string;
  imageUrl: string;        // Base64 or blob URL of cropped image
  thumbnail: string;       // Smaller version for performance
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  originalImageId: string;
  createdAt: Date;
  fileSize: number;
  selected: boolean;
}

interface PreviewPanelState {
  previews: LogoPreview[];
  selectedPreviewId: string | null;
  isGenerating: boolean;
  errors: Record<string, string>;
}
```

### **Preview Generation Service**
```typescript
class PreviewGenerator {
  static async generatePreview(
    originalImage: HTMLImageElement,
    boundingBox: BoundingBox,
    maxSize: number = 150
  ): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Calculate scaled dimensions
    const scale = Math.min(maxSize / boundingBox.width, maxSize / boundingBox.height);
    canvas.width = boundingBox.width * scale;
    canvas.height = boundingBox.height * scale;

    // Draw cropped and scaled image
    ctx.drawImage(
      originalImage,
      boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height,
      0, 0, canvas.width, canvas.height
    );

    return canvas.toDataURL('image/jpeg', 0.9);
  }

  static async generateThumbnail(previewUrl: string, size: number = 75): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = size;
        canvas.height = size;

        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = previewUrl;
    });
  }
}
```

### **Preview Panel Component**
```typescript
const PreviewPanel: React.FC<{
  previews: LogoPreview[];
  selectedPreviewId?: string;
  onPreviewSelect: (id: string) => void;
  onPreviewDelete: (id: string) => void;
  onRetryGeneration: (boundingBoxId: string) => void;
}> = ({
  previews,
  selectedPreviewId,
  onPreviewSelect,
  onPreviewDelete,
  onRetryGeneration
}) => {
  return (
    <div className="preview-panel">
      <div className="preview-header">
        <h3>Logo Previews ({previews.length})</h3>
      </div>

      <div className="preview-list">
        {previews.length === 0 ? (
          <EmptyState />
        ) : (
          previews.map(preview => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              isSelected={preview.id === selectedPreviewId}
              onSelect={() => onPreviewSelect(preview.id)}
              onDelete={() => onPreviewDelete(preview.id)}
              onRetry={() => onRetryGeneration(preview.boundingBoxId)}
            />
          ))
        )}
      </div>
    </div>
  );
};
```

### **Preview Card Component**
```typescript
const PreviewCard: React.FC<{
  preview: LogoPreview;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRetry?: () => void;
}> = ({ preview, isSelected, onSelect, onDelete, onRetry }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={`preview-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="preview-image-container">
        {!imageLoaded && !imageError && (
          <div className="loading-placeholder">
            <Spin size="small" />
          </div>
        )}

        {imageError ? (
          <div className="error-placeholder">
            <div>❌</div>
            <div>Failed to load</div>
            {onRetry && (
              <Button size="small" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        ) : (
          <img
            src={preview.imageUrl}
            alt={`Logo preview ${preview.id}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            style={{ display: imageLoaded ? 'block' : 'none' }}
          />
        )}

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

      <div className="preview-info">
        <div className="preview-id">ID: {preview.boundingBoxId}</div>
        <div className="preview-coordinates">
          ({preview.coordinates.x}, {preview.coordinates.y},
           {preview.coordinates.width}, {preview.coordinates.height})
        </div>
        <div className="preview-size">
          {preview.coordinates.width}×{preview.coordinates.height}px
        </div>
      </div>
    </div>
  );
};
```

### **Preview Synchronization Hook**
```typescript
const usePreviewSync = (
  boundingBoxes: BoundingBox[],
  originalImage: HTMLImageElement | null
) => {
  const [previews, setPreviews] = useState<LogoPreview[]>([]);
  const [generating, setGenerating] = useState<Set<string>>(new Set());

  // Generate preview when new bounding box is created
  useEffect(() => {
    const newBoxes = boundingBoxes.filter(
      box => !previews.some(preview => preview.boundingBoxId === box.id)
    );

    newBoxes.forEach(async (box) => {
      if (!originalImage || generating.has(box.id)) return;

      setGenerating(prev => new Set(prev).add(box.id));

      try {
        const previewUrl = await PreviewGenerator.generatePreview(originalImage, box);
        const thumbnail = await PreviewGenerator.generateThumbnail(previewUrl);

        const preview: LogoPreview = {
          id: `preview-${box.id}`,
          boundingBoxId: box.id,
          imageUrl: previewUrl,
          thumbnail,
          coordinates: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          },
          originalImageId: box.imageId,
          createdAt: new Date(),
          fileSize: previewUrl.length,
          selected: false
        };

        setPreviews(prev => [...prev, preview]);

      } catch (error) {
        console.error('Preview generation failed:', error);
      } finally {
        setGenerating(prev => {
          const newSet = new Set(prev);
          newSet.delete(box.id);
          return newSet;
        });
      }
    });
  }, [boundingBoxes, originalImage, previews, generating]);

  // Remove previews when bounding boxes are deleted
  useEffect(() => {
    const currentBoxIds = new Set(boundingBoxes.map(box => box.id));
    setPreviews(prev => prev.filter(preview => currentBoxIds.has(preview.boundingBoxId)));
  }, [boundingBoxes]);

  return { previews, setPreviews, generating };
};
```

---

## 🧪 **Testing Requirements**

### **Unit Tests**
- [ ] Preview generation with various bounding box sizes
- [ ] Thumbnail generation and quality
- [ ] Bidirectional synchronization logic
- [ ] Error handling for invalid coordinates
- [ ] Performance with multiple previews

### **Integration Tests**
- [ ] Canvas ↔ Preview panel synchronization
- [ ] Delete operations from both sides
- [ ] Real-time updates during bounding box resize
- [ ] Memory management with many previews

### **Visual Tests**
- [ ] Preview quality at different scales
- [ ] UI layout with various numbers of previews
- [ ] Responsive behavior of preview panel
- [ ] Loading and error states

---

## 📊 **Performance Requirements**

- [ ] Preview generation completes within 100ms per box
- [ ] Smooth scrolling in preview panel (60fps)
- [ ] Memory usage <50MB for 20 previews
- [ ] No memory leaks during extended use
- [ ] Efficient canvas operations without blocking UI

---

## 🎯 **Accessibility Requirements**

- [ ] Keyboard navigation between preview cards
- [ ] Screen reader support for preview information
- [ ] Focus indicators for interactive elements
- [ ] Alternative text for preview images
- [ ] High contrast mode support

---

## 🔗 **Dependencies**

### **Prerequisite Stories**
- ✅ US-008: Interactive Canvas with Bounding Boxes
- ✅ US-009: Detection Modes (Smart & Manual)

### **Technical Dependencies**
- Canvas API for image manipulation
- File/Blob API for preview storage
- Intersection Observer for lazy loading

---

## 📋 **Definition of Done**

- [ ] All acceptance criteria met and tested
- [ ] Preview generation working for all bounding box sizes
- [ ] Bidirectional synchronization functioning correctly
- [ ] Performance requirements satisfied
- [ ] Error handling comprehensive
- [ ] Accessibility requirements met
- [ ] Code review completed
- [ ] Unit tests ≥85% coverage
- [ ] Visual regression tests passing

---

## 📝 **Implementation Notes**

### **Preview Quality Optimization**
- Use high-quality JPEG encoding (0.9) for previews
- Implement smart scaling to preserve detail
- Consider WebP format for better compression
- Cache previews to avoid regeneration

### **Memory Management**
- Use object URLs for large previews
- Implement cleanup for removed previews
- Consider virtualization for >50 previews
- Monitor memory usage in development

### **Error Recovery**
- Graceful handling of invalid coordinates
- Retry mechanism for failed generations
- Fallback to placeholder images
- User feedback for persistent errors

This story provides essential visual feedback that helps users validate their logo selections before proceeding to categorization.