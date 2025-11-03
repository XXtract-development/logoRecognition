# 10. Frontend Architecture

## 10.1 Component Architecture

### Component Organization
```
src/
├── components/
│   ├── common/          # Shared UI components
│   │   ├── Button/
│   │   ├── Modal/
│   │   └── LoadingSpinner/
│   ├── training/        # Training-specific components
│   │   ├── ImageUploader/
│   │   ├── AnnotationCanvas/
│   │   ├── CategorySelector/
│   │   └── TrainingProgress/
│   ├── recognition/     # Recognition components
│   │   ├── ImageInput/
│   │   ├── ResultsDisplay/
│   │   └── ConfidenceBar/
│   └── layout/          # Layout components
│       ├── Header/
│       ├── Sidebar/
│       └── Footer/
├── pages/               # Page components
│   ├── Training/
│   ├── Recognition/
│   ├── Dashboard/
│   └── Settings/
├── hooks/               # Custom React hooks
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   └── useApiClient.ts
├── services/            # API service layer
│   ├── api.ts
│   ├── auth.ts
│   └── training.ts
├── stores/              # Zustand stores
│   ├── authStore.ts
│   ├── trainingStore.ts
│   └── uiStore.ts
└── utils/               # Utility functions
    ├── validators.ts
    ├── formatters.ts
    └── constants.ts
```

### Component Template
```typescript
// components/training/AnnotationCanvas/AnnotationCanvas.tsx
import React, { useRef, useState, useCallback } from 'react';
import { useTrainingStore } from '@/stores/trainingStore';
import { BoundingBox } from '@/types';
import styles from './AnnotationCanvas.module.css';

interface AnnotationCanvasProps {
  imageUrl: string;
  onAnnotation: (bbox: BoundingBox) => void;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  imageUrl,
  onAnnotation
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const { smartDetect } = useTrainingStore();

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const boundary = await smartDetect(x, y);
    onAnnotation(boundary);
  }, [smartDetect, onAnnotation]);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={styles.canvas}
      />
    </div>
  );
};
```

## 10.2 State Management Architecture

### State Structure
```typescript
// stores/types.ts
interface AppState {
  auth: AuthState;
  training: TrainingState;
  recognition: RecognitionState;
  ui: UIState;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
}

interface TrainingState {
  currentBatch: TrainingBatch | null;
  annotations: Annotation[];
  trainingProgress: number;
  isTraining: boolean;
}

interface RecognitionState {
  lastResult: RecognitionResult | null;
  isProcessing: boolean;
  history: RecognitionResult[];
}
```

### State Management Patterns
- Use Zustand for global state management
- Implement optimistic updates for better UX
- Separate API state from UI state
- Use React Query for server state caching
- Implement undo/redo for annotations

## 10.3 Routing Architecture

### Route Organization
```
src/router/
├── index.tsx           # Main router configuration
├── routes.ts           # Route definitions
├── guards/             # Route guards
│   ├── AuthGuard.tsx
│   └── RoleGuard.tsx
└── layouts/            # Route layouts
    ├── AppLayout.tsx
    └── AuthLayout.tsx
```

### Protected Route Pattern
```typescript
// router/guards/AuthGuard.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export const AuthGuard: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

// Usage in router
<Route element={<AuthGuard />}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/training" element={<Training />} />
</Route>
```

## 10.4 Frontend Services Layer

### API Client Setup
```typescript
// services/api.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh
      await refreshToken();
    }
    return Promise.reject(error);
  }
);
```

### Service Example
```typescript
// services/training.ts
import { apiClient } from './api';
import { TrainingBatch, Annotation } from '@/types';

export const trainingService = {
  async uploadBatch(files: File[], name: string): Promise<TrainingBatch> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('batch_name', name);

    const { data } = await apiClient.post('/training/upload', formData);
    return data;
  },

  async smartDetect(fileId: string, x: number, y: number) {
    const { data } = await apiClient.post('/training/smart-detect', {
      file_id: fileId,
      click_x: x,
      click_y: y
    });
    return data.detected_boundary;
  },

  async saveAnnotations(annotations: Annotation[]) {
    const { data } = await apiClient.post('/training/annotate', {
      annotations
    });
    return data;
  }
};
```

---
