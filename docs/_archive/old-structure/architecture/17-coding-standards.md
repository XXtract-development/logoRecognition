# 17. Coding Standards

## 17.1 Critical Fullstack Rules

- **Type Sharing:** Always define types in packages/shared and import from there
- **API Calls:** Never make direct HTTP calls - use the service layer
- **Environment Variables:** Access only through config objects, never process.env directly
- **Error Handling:** All API routes must use the standard error handler
- **State Updates:** Never mutate state directly - use proper state management patterns
- **Async Operations:** Always handle loading and error states in UI
- **Database Queries:** Use repository pattern, never raw SQL in services
- **File Uploads:** Validate size and type on both frontend and backend
- **Authentication:** Check permissions in both UI and API layers
- **Logging:** Use structured logging with correlation IDs
- **Documentation:** ALL public functions, interfaces, and classes MUST have JSDoc/docstring comments

## 17.2 Documentation Standards

### TypeScript/JavaScript - JSDoc Requirements

**MANDATORY:** Every public function, interface, class, and type MUST have complete JSDoc documentation.

#### Function Documentation
```typescript
/**
 * Detects logo boundaries using smart click detection algorithm
 * @param {number} x - The x-coordinate of the click position
 * @param {number} y - The y-coordinate of the click position
 * @param {ImageData} imageData - The image data for boundary detection
 * @returns {Promise<BoundingBox>} The detected bounding box for the logo
 * @throws {DetectionError} When no clear boundary can be detected
 * @example
 * const boundary = await smartDetect(100, 200, imageData);
 * console.log(boundary); // { x: 95, y: 195, width: 120, height: 80 }
 */
export async function smartDetect(x: number, y: number, imageData: ImageData): Promise<BoundingBox> {
  // Implementation
}
```

#### Interface Documentation
```typescript
/**
 * Represents a logo detection result with confidence scoring
 * @interface Detection
 * @property {string} category - The category of the detected logo (e.g., 'brand', 'recycling')
 * @property {string} value - The specific value/name of the logo (e.g., 'nike', 'PET')
 * @property {number} confidence - Confidence score between 0 and 1
 * @property {BoundingBox} bbox - The bounding box coordinates of the detected logo
 */
export interface Detection {
  category: string;
  value: string;
  confidence: number;
  bbox: BoundingBox;
}
```

#### Class Documentation
```typescript
/**
 * Service for managing logo training operations
 * @class TrainingService
 * @description Handles all training-related operations including batch upload,
 * annotation management, and model training coordination
 */
export class TrainingService {
  /**
   * Creates a new training batch
   * @param {File[]} files - Array of image files to upload
   * @param {string} batchName - Name for the training batch
   * @param {string} userId - ID of the user creating the batch
   * @returns {Promise<TrainingBatch>} The created training batch
   */
  async createBatch(files: File[], batchName: string, userId: string): Promise<TrainingBatch> {
    // Implementation
  }
}
```

### Python - Docstring Requirements

**MANDATORY:** Every public function, class, and method MUST have complete docstrings following Google style.

#### Function Documentation
```python
def smart_detect(x: int, y: int, image_path: str) -> Dict[str, int]:
    """
    Detects logo boundaries using smart click detection algorithm.

    Args:
        x: The x-coordinate of the click position.
        y: The y-coordinate of the click position.
        image_path: Path to the image file for boundary detection.

    Returns:
        A dictionary containing the bounding box coordinates:
        {'x': int, 'y': int, 'width': int, 'height': int}

    Raises:
        DetectionError: When no clear boundary can be detected.
        FileNotFoundError: When the image file doesn't exist.

    Example:
        >>> boundary = smart_detect(100, 200, '/path/to/image.jpg')
        >>> print(boundary)
        {'x': 95, 'y': 195, 'width': 120, 'height': 80}
    """
    # Implementation
```

#### Class Documentation
```python
class TrainingService:
    """
    Service for managing logo training operations.

    This service handles all training-related operations including batch upload,
    annotation management, and model training coordination. It integrates with
    the ML pipeline and manages the training queue.

    Attributes:
        db: Database session for persistence operations.
        storage: S3 storage client for image management.
        ml_client: Machine learning pipeline client.
    """

    def create_batch(self, files: List[UploadFile], batch_name: str, user_id: str) -> TrainingBatch:
        """
        Creates a new training batch.

        Args:
            files: List of image files to upload.
            batch_name: Name for the training batch.
            user_id: ID of the user creating the batch.

        Returns:
            The created TrainingBatch object with metadata.

        Raises:
            ValidationError: When files don't meet requirements.
            StorageError: When file upload fails.
        """
        # Implementation
```

### Documentation Enforcement Rules

1. **No Undocumented Public APIs:** The developer agent MUST NOT create any public function, method, interface, or class without complete documentation
2. **Parameter Documentation:** Every parameter MUST be documented with type and description
3. **Return Value Documentation:** Every return value MUST be documented with type and description
4. **Error Documentation:** All possible exceptions/errors MUST be documented
5. **Examples:** Complex functions SHOULD include usage examples
6. **Update Documentation:** When modifying code, documentation MUST be updated accordingly

## 17.3 Naming Conventions

| Element | Frontend | Backend | Example |
|---------|----------|---------|---------|
| Components | PascalCase | - | `UserProfile.tsx` |
| Hooks | camelCase with 'use' | - | `useAuth.ts` |
| API Routes | - | kebab-case | `/api/user-profile` |
| Database Tables | - | snake_case | `user_profiles` |
| Environment Vars | SCREAMING_SNAKE | SCREAMING_SNAKE | `API_BASE_URL` |
| CSS Classes | kebab-case | - | `button-primary` |
| Python Classes | - | PascalCase | `TrainingService` |
| Python Functions | - | snake_case | `get_user_by_id` |

---
