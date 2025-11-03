// Service exports for cleaner imports
export { default as apiService } from './api';
export { default as imageService } from './imageService';
export { default as annotationsService } from './annotationsService';
// export { default as annotationService } from './annotationService'; // No default export
export { errorService } from './errorService';
export { performanceService } from './performanceService';

// Re-export types
export type {
  UploadedImage,
  ImageUploadResponse,
  ImageUploadProgress,
  ImageListResponse,
  BatchUploadResult
} from './imageService';

export type {
  BoundingBox,
  Annotation,
  AnnotationBatchResult
} from './annotationService';

export type {
  ErrorCategory,
  ErrorSeverity,
  AppError
} from './errorService';