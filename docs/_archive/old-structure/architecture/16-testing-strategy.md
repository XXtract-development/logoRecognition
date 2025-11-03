# 16. Testing Strategy

## 16.1 Testing Pyramid

```
        E2E Tests (10%)
       /              \
    Integration Tests (30%)
    /                    \
Frontend Unit (30%)  Backend Unit (30%)
```

## 16.2 Test Organization

### Frontend Tests
```
apps/web/tests/
├── unit/
│   ├── components/
│   ├── hooks/
│   └── utils/
├── integration/
│   ├── pages/
│   └── services/
└── setup.ts
```

### Backend Tests
```
apps/api/tests/
├── unit/
│   ├── services/
│   ├── repositories/
│   └── ml/
├── integration/
│   ├── api/
│   └── tasks/
└── conftest.py
```

### E2E Tests
```
tests/e2e/
├── specs/
│   ├── training.spec.ts
│   ├── recognition.spec.ts
│   └── auth.spec.ts
├── fixtures/
└── playwright.config.ts
```

## 16.3 Test Examples

### Frontend Component Test
```typescript
// apps/web/tests/unit/components/AnnotationCanvas.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react';
import { AnnotationCanvas } from '@/components/training/AnnotationCanvas';

describe('AnnotationCanvas', () => {
  it('should detect boundary on click', async () => {
    const onAnnotation = vi.fn();
    const { container } = render(
      <AnnotationCanvas
        imageUrl="/test.jpg"
        onAnnotation={onAnnotation}
      />
    );

    const canvas = container.querySelector('canvas');
    fireEvent.click(canvas!, { clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(onAnnotation).toHaveBeenCalledWith(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number)
        })
      );
    });
  });
});
```

### Backend API Test
```python