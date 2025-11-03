# Coding Standards

> Version: 1.0.0
> Last Updated: 2025-09-29
> Status: Active

## Overview

This document establishes the coding standards for the logoRecognition project. All developers must adhere to these standards to ensure code quality, maintainability, and consistency across the codebase.

## General Principles

### Core Values
- **Clarity over Cleverness**: Write code that is easy to understand
- **Consistency**: Follow established patterns throughout the codebase
- **Type Safety**: Use strong typing in both Python and TypeScript
- **Documentation**: Document complex logic and public APIs
- **Testing**: Maintain 100% test coverage for critical paths
- **Performance**: Optimize for both developer experience and runtime performance

## Python Standards (Backend)

### File Organization

```python
# Standard import order
1. Standard library imports
2. Third-party library imports
3. Local application imports

# Example:
import os
import sys
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, validator
import numpy as np

from app.core.database import get_db
from app.models.image import Image
from app.services.ml_service import MLService
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Files** | snake_case | `image_processor.py` |
| **Classes** | PascalCase | `ImageProcessor` |
| **Functions** | snake_case | `process_image()` |
| **Variables** | snake_case | `image_count` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_IMAGE_SIZE` |
| **Private methods** | Leading underscore | `_validate_input()` |

### Type Hints

**Required for all functions and methods:**

```python
from typing import Optional, List, Dict, Any, Union, Tuple
from datetime import datetime

def process_batch_images(
    images: List[bytes],
    model_name: str,
    config: Optional[Dict[str, Any]] = None,
    threshold: float = 0.5
) -> Tuple[List[DetectionResult], Dict[str, float]]:
    """
    Process multiple images in batch.

    Args:
        images: List of image bytes
        model_name: Name of the ML model to use
        config: Optional processing configuration
        threshold: Confidence threshold for detections

    Returns:
        Tuple of detection results and performance metrics

    Raises:
        ValueError: If images list is empty
        HTTPException: If model not found
    """
    if not images:
        raise ValueError("Images list cannot be empty")

    # Implementation
    return results, metrics
```

### Docstrings

Use **Google-style docstrings** for all public functions, classes, and modules:

```python
class ImageAnnotationService:
    """
    Service for managing image annotations.

    This service handles CRUD operations for annotations,
    validation of bounding boxes, and format conversions.

    Attributes:
        db: Database session
        cache: Redis cache client
        storage: MinIO storage client
    """

    def create_annotation(
        self,
        image_id: str,
        bounding_box: BoundingBox,
        label: str,
        confidence: float = 1.0
    ) -> Annotation:
        """
        Create a new annotation for an image.

        Args:
            image_id: Unique identifier of the image
            bounding_box: Coordinates of the bounding box
            label: Class label for the annotation
            confidence: Confidence score (0-1)

        Returns:
            Created annotation object

        Raises:
            ImageNotFoundError: If image doesn't exist
            InvalidBoundingBoxError: If coordinates are invalid

        Example:
            >>> service = ImageAnnotationService(db)
            >>> annotation = service.create_annotation(
            ...     image_id="img_123",
            ...     bounding_box=BoundingBox(x=10, y=20, w=100, h=150),
            ...     label="logo"
            ... )
        """
        pass
```

### Pydantic Models

Always use Pydantic for data validation:

```python
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime

class ImageUploadRequest(BaseModel):
    """Request model for image upload."""

    name: str = Field(..., min_length=1, max_length=255, description="Image filename")
    tags: List[str] = Field(default=[], max_items=10, description="Image tags")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")

    class Config:
        schema_extra = {
            "example": {
                "name": "company_logo.png",
                "tags": ["logo", "brand", "company"],
                "metadata": {"source": "website", "version": 2}
            }
        }

    @validator('name')
    def validate_filename(cls, v: str) -> str:
        """Validate filename format."""
        if not v.strip():
            raise ValueError("Filename cannot be empty")
        if not any(v.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
            raise ValueError("Invalid file extension")
        return v.strip()

    @validator('tags', pre=True)
    def validate_tags(cls, v: List[str]) -> List[str]:
        """Clean and validate tags."""
        if v:
            return [tag.strip().lower() for tag in v if tag.strip()]
        return []
```

### Error Handling

```python
# Custom exceptions
class LogoRecognitionError(Exception):
    """Base exception for the application."""
    pass

class ImageProcessingError(LogoRecognitionError):
    """Raised when image processing fails."""
    pass

class ModelNotFoundError(LogoRecognitionError):
    """Raised when ML model is not available."""
    pass

# Exception handling in routes
@router.post("/process")
async def process_image(
    request: ImageProcessRequest,
    db: Session = Depends(get_db)
):
    try:
        result = await image_service.process(request)
        return {"status": "success", "data": result}
    except ImageNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ImageProcessingError as e:
        logger.error(f"Processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Image processing failed")
    except Exception as e:
        logger.critical(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
```

### Async/Await Best Practices

```python
import asyncio
from typing import List, Coroutine

# Use async context managers
async def process_with_resources():
    async with get_db_session() as db:
        async with storage_client() as storage:
            # Process with resources
            pass

# Concurrent execution
async def process_multiple_images(image_ids: List[str]):
    """Process multiple images concurrently."""
    tasks = [process_single_image(id) for id in image_ids]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Handle exceptions
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Failed to process image {image_ids[i]}: {result}")

    return [r for r in results if not isinstance(r, Exception)]
```

### Testing Standards

```python
import pytest
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient

# Test file naming: test_<module_name>.py

class TestImageService:
    """Test suite for ImageService."""

    @pytest.fixture
    def service(self):
        """Create service instance with mocked dependencies."""
        return ImageService(
            db=Mock(),
            cache=Mock(),
            storage=Mock()
        )

    @pytest.mark.asyncio
    async def test_process_image_success(self, service):
        """Test successful image processing."""
        # Arrange
        image_data = b"fake_image_data"
        expected_result = ProcessingResult(detections=[], confidence=0.95)
        service.ml_client.process = AsyncMock(return_value=expected_result)

        # Act
        result = await service.process_image(image_data)

        # Assert
        assert result == expected_result
        service.ml_client.process.assert_called_once_with(image_data)

    @pytest.mark.parametrize("invalid_input,expected_error", [
        (b"", ValueError),
        (None, TypeError),
        (b"x" * (10 * 1024 * 1024 + 1), ValueError),  # > 10MB
    ])
    async def test_process_image_invalid_input(
        self, service, invalid_input, expected_error
    ):
        """Test processing with invalid inputs."""
        with pytest.raises(expected_error):
            await service.process_image(invalid_input)
```

## TypeScript/React Standards (Frontend)

### File Organization

```typescript
// Standard import order
1. React and core libraries
2. Third-party libraries
3. Local components
4. Local utilities
5. Types and interfaces
6. Styles

// Example:
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { Button, Card, Spin } from 'antd';
import { Canvas } from '@react-konva/konva';

import { ImageViewer } from '@/components/ImageViewer';
import { AnnotationToolbar } from '@/components/AnnotationToolbar';

import { useImageStore } from '@/stores/imageStore';
import { formatDate, calculateBoundingBox } from '@/utils';

import type { ImageAnnotation, BoundingBox } from '@/types';

import styles from './AnnotationPage.module.css';
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Component files** | PascalCase | `ImageViewer.tsx` |
| **Utility files** | camelCase | `imageUtils.ts` |
| **Components** | PascalCase | `ImageViewer` |
| **Functions** | camelCase | `processImage()` |
| **Variables** | camelCase | `imageCount` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_IMAGE_SIZE` |
| **Types/Interfaces** | PascalCase | `ImageMetadata` |
| **Enums** | PascalCase | `ImageStatus` |

### TypeScript Best Practices

```typescript
// Always use strict types - avoid 'any'
interface ImageProcessingConfig {
  maxSize: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
  preserveMetadata?: boolean;
}

// Use type guards
function isValidAnnotation(obj: unknown): obj is ImageAnnotation {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'boundingBox' in obj &&
    'label' in obj
  );
}

// Use generics for reusable components
interface DataListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
  onItemClick?: (item: T) => void;
}

function DataList<T>({ items, renderItem, keyExtractor, onItemClick }: DataListProps<T>) {
  return (
    <div className="data-list">
      {items.map(item => (
        <div
          key={keyExtractor(item)}
          onClick={() => onItemClick?.(item)}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
```

### React Component Standards

```typescript
// Functional components with TypeScript
interface ImageViewerProps {
  imageUrl: string;
  annotations?: ImageAnnotation[];
  onAnnotationChange?: (annotations: ImageAnnotation[]) => void;
  className?: string;
  loading?: boolean;
}

/**
 * ImageViewer component for displaying and annotating images.
 *
 * @component
 * @example
 * <ImageViewer
 *   imageUrl="/api/images/123"
 *   annotations={annotations}
 *   onAnnotationChange={handleAnnotationChange}
 * />
 */
export const ImageViewer: React.FC<ImageViewerProps> = React.memo(({
  imageUrl,
  annotations = [],
  onAnnotationChange,
  className,
  loading = false
}) => {
  // State management
  const [selectedAnnotation, setSelectedAnnotation] = useState<ImageAnnotation | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Custom hooks
  const { user } = useAuth();
  const { showNotification } = useNotification();

  // Memoized values
  const sortedAnnotations = useMemo(
    () => annotations.sort((a, b) => a.confidence - b.confidence),
    [annotations]
  );

  // Callbacks
  const handleAnnotationSelect = useCallback((annotation: ImageAnnotation) => {
    setSelectedAnnotation(annotation);
    showNotification({
      type: 'info',
      message: `Selected: ${annotation.label}`
    });
  }, [showNotification]);

  // Effects
  useEffect(() => {
    if (imageUrl) {
      preloadImage(imageUrl).then(() => setImageLoaded(true));
    }
  }, [imageUrl]);

  // Early returns
  if (loading) {
    return <Spin size="large" />;
  }

  if (!imageUrl) {
    return <EmptyState message="No image selected" />;
  }

  // Main render
  return (
    <div className={cn(styles.container, className)}>
      <img
        src={imageUrl}
        alt="Annotated"
        onLoad={() => setImageLoaded(true)}
      />
      {imageLoaded && (
        <AnnotationOverlay
          annotations={sortedAnnotations}
          selected={selectedAnnotation}
          onSelect={handleAnnotationSelect}
        />
      )}
    </div>
  );
});

ImageViewer.displayName = 'ImageViewer';
```

### Custom Hooks

```typescript
// hooks/useImageUpload.ts
import { useState, useCallback } from 'react';
import { message } from 'antd';
import { imageService } from '@/services/imageService';

interface UseImageUploadOptions {
  onSuccess?: (image: Image) => void;
  onError?: (error: Error) => void;
  maxSize?: number; // in MB
}

export function useImageUpload({
  onSuccess,
  onError,
  maxSize = 10
}: UseImageUploadOptions = {}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const upload = useCallback(async (file: File) => {
    // Validation
    if (file.size > maxSize * 1024 * 1024) {
      const error = new Error(`File size exceeds ${maxSize}MB limit`);
      onError?.(error);
      message.error(error.message);
      return null;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const image = await imageService.upload(formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
          );
          setProgress(percentCompleted);
        }
      });

      onSuccess?.(image);
      message.success('Image uploaded successfully');
      return image;

    } catch (error) {
      const err = error instanceof Error ? error : new Error('Upload failed');
      onError?.(err);
      message.error(err.message);
      return null;

    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [onSuccess, onError, maxSize]);

  return {
    upload,
    uploading,
    progress
  };
}
```

### State Management (Zustand)

```typescript
// stores/imageStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface ImageState {
  images: Image[];
  selectedImageId: string | null;
  filter: ImageFilter;

  // Actions
  setImages: (images: Image[]) => void;
  addImage: (image: Image) => void;
  updateImage: (id: string, updates: Partial<Image>) => void;
  deleteImage: (id: string) => void;
  selectImage: (id: string | null) => void;
  setFilter: (filter: Partial<ImageFilter>) => void;

  // Computed
  getSelectedImage: () => Image | undefined;
  getFilteredImages: () => Image[];
}

export const useImageStore = create<ImageState>()(
  devtools(
    persist(
      immer((set, get) => ({
        // State
        images: [],
        selectedImageId: null,
        filter: {
          search: '',
          tags: [],
          dateRange: null
        },

        // Actions
        setImages: (images) => set((state) => {
          state.images = images;
        }),

        addImage: (image) => set((state) => {
          state.images.push(image);
        }),

        updateImage: (id, updates) => set((state) => {
          const index = state.images.findIndex(img => img.id === id);
          if (index !== -1) {
            Object.assign(state.images[index], updates);
          }
        }),

        deleteImage: (id) => set((state) => {
          state.images = state.images.filter(img => img.id !== id);
          if (state.selectedImageId === id) {
            state.selectedImageId = null;
          }
        }),

        selectImage: (id) => set((state) => {
          state.selectedImageId = id;
        }),

        setFilter: (filter) => set((state) => {
          Object.assign(state.filter, filter);
        }),

        // Computed
        getSelectedImage: () => {
          const state = get();
          return state.images.find(img => img.id === state.selectedImageId);
        },

        getFilteredImages: () => {
          const state = get();
          return state.images.filter(image => {
            // Apply filters
            if (state.filter.search) {
              const search = state.filter.search.toLowerCase();
              if (!image.name.toLowerCase().includes(search)) {
                return false;
              }
            }

            if (state.filter.tags.length > 0) {
              const hasTag = state.filter.tags.some(tag =>
                image.tags.includes(tag)
              );
              if (!hasTag) return false;
            }

            return true;
          });
        }
      })),
      {
        name: 'image-store',
        partialize: (state) => ({
          filter: state.filter
        })
      }
    ),
    { name: 'ImageStore' }
  )
);
```

## Code Quality Standards

### Complexity Limits

- **Cyclomatic complexity**: Maximum 10 per function
- **File length**: Maximum 500 lines per file
- **Function length**: Maximum 50 lines per function
- **Class size**: Maximum 20 public methods
- **Component props**: Maximum 7 props (use composition for more)

### Performance Standards

- **API response time**: < 50ms for cached, < 200ms for uncached
- **Frontend FPS**: Maintain 60 FPS for animations
- **Bundle size**: < 200KB for initial load (gzipped)
- **Time to Interactive (TTI)**: < 3 seconds
- **Lighthouse score**: > 90 for all categories

### Security Standards

- **Input validation**: Validate all user inputs
- **SQL injection**: Use parameterized queries only
- **XSS prevention**: Sanitize all rendered content
- **CORS**: Whitelist allowed origins
- **Authentication**: JWT with refresh tokens
- **Passwords**: Argon2id hashing only
- **Secrets**: Never commit secrets to code
- **File uploads**: Validate type and size
- **Rate limiting**: Implement on all endpoints

## Git Commit Standards

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting)
- **refactor**: Code refactoring
- **perf**: Performance improvements
- **test**: Test additions/changes
- **build**: Build system changes
- **ci**: CI/CD changes
- **chore**: Maintenance tasks

### Examples

```bash
feat(api): add batch image upload endpoint

- Support up to 100 images per batch
- Implement async processing with Celery
- Add progress tracking via WebSocket

Closes #123
```

```bash
fix(auth): resolve token refresh race condition

Prevent multiple simultaneous refresh attempts by implementing
a token refresh queue with mutex locking.

Fixes #456
```

## Code Review Checklist

Before submitting a PR, ensure:

### General
- [ ] Code follows naming conventions
- [ ] All functions have type hints/annotations
- [ ] Complex logic is documented
- [ ] No commented-out code
- [ ] No console.log/print statements

### Backend
- [ ] Pydantic models for all requests/responses
- [ ] Error handling with appropriate HTTP codes
- [ ] Database queries are optimized
- [ ] Async functions used appropriately
- [ ] Tests cover all new code

### Frontend
- [ ] No TypeScript 'any' types
- [ ] Components are properly memoized
- [ ] Custom hooks extract complex logic
- [ ] Accessibility standards met
- [ ] Bundle size impact assessed

### Security
- [ ] Input validation implemented
- [ ] Authentication/authorization checked
- [ ] No sensitive data in logs
- [ ] Rate limiting considered
- [ ] OWASP guidelines followed

## Tools Configuration

### Python (Backend)

**.flake8**
```ini
[flake8]
max-line-length = 100
exclude = .git,__pycache__,venv,migrations
ignore = E203, W503
max-complexity = 10
```

**pyproject.toml**
```toml
[tool.black]
line-length = 100
target-version = ['py311']

[tool.mypy]
python_version = "3.11"
disallow_untyped_defs = true
ignore_missing_imports = true

[tool.pytest.ini_options]
minversion = "7.0"
addopts = "-ra -q --cov=app --cov-report=html"
testpaths = ["tests"]
```

### TypeScript (Frontend)

**tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "esnext",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**.eslintrc.js**
```javascript
module.exports = {
  extends: [
    'react-app',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    'no-console': 'error'
  }
};
```

## Enforcement

These standards are enforced through:

1. **Pre-commit hooks**: Automatic formatting and linting
2. **CI/CD pipeline**: Automated testing and validation
3. **Code reviews**: Manual verification by team members
4. **SonarQube**: Continuous code quality monitoring
5. **Documentation**: Regular updates and team training

---

**Note**: This document is a living standard and will be updated as the project evolves. All developers must review updates and provide feedback through the established review process.