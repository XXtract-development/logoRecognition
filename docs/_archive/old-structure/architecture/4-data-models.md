# 4. Data Models

## 4.1 User Model

**Purpose:** Represents system users who train and use the logo recognition system

**Key Attributes:**
- id: UUID - Unique identifier
- email: string - User email (unique)
- role: enum - User role (admin/user/viewer)
- organization_id: UUID - Organization reference
- created_at: timestamp - Account creation time

**TypeScript Interface:**
```typescript
interface User {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships:**
- Has many TrainingBatches
- Belongs to Organization
- Has many RecognitionLogs

## 4.2 TrainingBatch Model

**Purpose:** Groups uploaded images for training sessions

**Key Attributes:**
- id: UUID - Unique identifier
- name: string - Batch name
- status: enum - Upload/processing status
- user_id: UUID - Creator reference
- file_count: integer - Number of images

**TypeScript Interface:**
```typescript
interface TrainingBatch {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  userId: string;
  fileCount: number;
  createdAt: Date;
}
```

**Relationships:**
- Belongs to User
- Has many Images
- Has many Annotations

## 4.3 Logo Model

**Purpose:** Represents a trained logo with its category and value

**Key Attributes:**
- id: UUID - Unique identifier
- category: string - Logo category (e.g., 'brand', 'recycling')
- value: string - Logo value (e.g., 'nike', 'PET')
- confidence_threshold: float - Minimum confidence for positive match
- training_samples: integer - Number of training samples

**TypeScript Interface:**
```typescript
interface Logo {
  id: string;
  category: string;
  value: string;
  confidenceThreshold: number;
  trainingSamples: number;
  accuracy: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Relationships:**
- Has many Annotations
- Has many LogoEmbeddings
- Has many RecognitionResults

## 4.4 Annotation Model

**Purpose:** Represents a single logo annotation on an image

**Key Attributes:**
- id: UUID - Unique identifier
- image_id: UUID - Source image reference
- bbox: object - Bounding box coordinates
- logo_id: UUID - Associated logo
- confidence: float - Annotation confidence

**TypeScript Interface:**
```typescript
interface Annotation {
  id: string;
  imageId: string;
  logoId: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  createdBy: string;
  createdAt: Date;
}
```

**Relationships:**
- Belongs to Image
- Belongs to Logo
- Created by User

## 4.5 RecognitionResult Model

**Purpose:** Stores logo recognition results for analysis and feedback

**Key Attributes:**
- id: UUID - Unique identifier
- request_id: string - API request identifier
- detections: JSON - Array of detected logos
- processing_time_ms: integer - Processing duration
- confidence_threshold: float - Applied threshold

**TypeScript Interface:**
```typescript
interface RecognitionResult {
  id: string;
  requestId: string;
  imageHash: string;
  detections: Array<{
    logoId: string;
    category: string;
    value: string;
    confidence: number;
    bbox: BoundingBox;
  }>;
  processingTimeMs: number;
  confidenceThreshold: number;
  createdAt: Date;
}
```

**Relationships:**
- Belongs to User
- References Model version
- May have FeedbackEntry

---
