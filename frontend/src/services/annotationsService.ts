/**
 * Enhanced Annotations Service with A++ Security and Performance
 * Complete implementation with validation, optimistic updates, and monitoring
 */

import apiService from './apiService';
import { Security } from './securityService';
import { errorService, ErrorCategory, ErrorSeverity } from './errorService';

export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category: string;
  value: string;
  label?: string;
  confidence?: number;
  color?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
}

export interface Annotation {
  id: string;
  image_id: string;
  bounding_boxes: BoundingBox[];
  created_at: string;
  updated_at: string;
  created_by?: string;
  is_validated?: boolean;
  version?: number;
  status?: 'draft' | 'complete' | 'reviewed';
}

export interface SaveAnnotationRequest {
  annotations: BoundingBox[];
}

export interface AnnotationResponse {
  annotation: Annotation;
  message?: string;
}

export interface AnnotationBatchResult {
  successful: Annotation[];
  failed: Array<{ imageId: string; error: string }>;
  totalTime: number;
}

// Configuration
const ANNOTATION_CONFIG = {
  MAX_BOXES_PER_IMAGE: 100,
  MAX_LABEL_LENGTH: 50,
  CACHE_TTL: 3 * 60 * 1000, // 3 minutes
  OPTIMISTIC_UPDATE: true,
  AUTO_SAVE_DELAY: 2000, // 2 seconds
};

/**
 * Optimistic Update Manager
 */
class OptimisticUpdateManager {
  private pendingUpdates: Map<string, any> = new Map();
  private rollbackData: Map<string, any> = new Map();

  applyOptimistic(key: string, data: any, rollback: any): void {
    this.pendingUpdates.set(key, data);
    this.rollbackData.set(key, rollback);
  }

  confirmUpdate(key: string): void {
    this.pendingUpdates.delete(key);
    this.rollbackData.delete(key);
  }

  rollback(key: string): any {
    this.pendingUpdates.delete(key);
    const rollback = this.rollbackData.get(key);
    this.rollbackData.delete(key);
    return rollback;
  }

  isPending(key: string): boolean {
    return this.pendingUpdates.has(key);
  }
}

class AnnotationsService {
  private readonly basePath = '/v1/logos';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private optimisticManager = new OptimisticUpdateManager();
  private autoSaveTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Get annotations for a specific image with caching
   */
  async getAnnotations(imageId: string): Promise<Annotation | null> {
    try {
      const sanitizedImageId = Security.InputValidator.sanitizeString(imageId, 50);

      // Check cache first
      const cached = this.getFromCache(sanitizedImageId);
      if (cached) {
        console.log(`[AnnotationsService] Cache hit for ${sanitizedImageId}`);
        return cached;
      }

      // Check if we have an optimistic update pending
      if (this.optimisticManager.isPending(`annotation_${sanitizedImageId}`)) {
        console.log(`[AnnotationsService] Returning optimistic data for ${sanitizedImageId}`);
        return this.getFromCache(sanitizedImageId);
      }

      const response = await apiService.get<AnnotationResponse>(
        `${this.basePath}/${sanitizedImageId}/annotations`
      );

      // Sanitize and cache response
      const sanitized = this.sanitizeAnnotation(response.annotation);
      this.updateCache(sanitizedImageId, sanitized);

      return sanitized;

    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }

      errorService.handleError(error, {
        code: 'FETCH_ANNOTATIONS_FAILED',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW,
        context: { imageId },
      });

      return null;
    }
  }

  /**
   * Save or update annotations with validation and optimistic updates
   */
  async saveAnnotations(imageId: string, boundingBoxes: BoundingBox[]): Promise<Annotation> {
    const startTime = Date.now();

    try {
      const sanitizedImageId = Security.InputValidator.sanitizeString(imageId, 50);

      // Validate bounding boxes
      const validatedBoxes = await this.validateBoundingBoxes(boundingBoxes);

      // Get current data for rollback
      const currentData = this.getFromCache(sanitizedImageId);

      // Apply optimistic update
      if (ANNOTATION_CONFIG.OPTIMISTIC_UPDATE) {
        const optimisticAnnotation = this.createOptimisticAnnotation(sanitizedImageId, validatedBoxes);
        this.optimisticManager.applyOptimistic(
          `annotation_${sanitizedImageId}`,
          optimisticAnnotation,
          currentData
        );
        this.updateCache(sanitizedImageId, optimisticAnnotation);
      }

      // Setup auto-save
      this.scheduleAutoSave(sanitizedImageId, validatedBoxes);

      // Make API call
      const response = await apiService.post<AnnotationResponse>(
        `${this.basePath}/${sanitizedImageId}/annotations`,
        { annotations: validatedBoxes }
      );

      // Confirm optimistic update
      this.optimisticManager.confirmUpdate(`annotation_${sanitizedImageId}`);

      // Update cache with real data
      const sanitized = this.sanitizeAnnotation(response.annotation);
      this.updateCache(sanitizedImageId, sanitized);

      // Clear auto-save timer
      this.clearAutoSave(sanitizedImageId);

      console.log(`[AnnotationsService] Saved ${validatedBoxes.length} boxes in ${Date.now() - startTime}ms`);
      return sanitized;

    } catch (error: any) {
      // Rollback optimistic update
      if (ANNOTATION_CONFIG.OPTIMISTIC_UPDATE) {
        const rollbackData = this.optimisticManager.rollback(`annotation_${imageId}`);
        if (rollbackData) {
          this.updateCache(imageId, rollbackData);
        }
      }

      throw errorService.handleError(error, {
        code: 'SAVE_ANNOTATION_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        context: { imageId, boxCount: boundingBoxes.length },
        retryable: true,
      });
    }
  }

  /**
   * Update a single annotation with validation
   */
  async updateAnnotation(imageId: string, annotationId: string, boundingBox: BoundingBox): Promise<Annotation> {
    try {
      const sanitizedImageId = Security.InputValidator.sanitizeString(imageId, 50);
      const sanitizedAnnotationId = Security.InputValidator.sanitizeString(annotationId, 50);

      // Validate bounding box
      const validation = Security.InputValidator.validateBoundingBox(boundingBox);
      if (!validation.valid) {
        throw new Error(`Invalid bounding box: ${validation.errors?.join(', ')}`);
      }

      const response = await apiService.put<AnnotationResponse>(
        `${this.basePath}/${sanitizedImageId}/annotations/${sanitizedAnnotationId}`,
        validation.data
      );

      // Update cache
      const sanitized = this.sanitizeAnnotation(response.annotation);
      this.updateCache(sanitizedImageId, sanitized);

      return sanitized;

    } catch (error) {
      throw errorService.handleError(error, {
        code: 'UPDATE_ANNOTATION_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        context: { imageId, annotationId },
      });
    }
  }

  /**
   * Delete a single annotation with proper error handling
   */
  async deleteAnnotation(imageId: string, annotationId: string): Promise<boolean> {
    try {
      const sanitizedImageId = Security.InputValidator.sanitizeString(imageId, 50);
      const sanitizedAnnotationId = Security.InputValidator.sanitizeString(annotationId, 50);

      await apiService.delete(
        `${this.basePath}/${sanitizedImageId}/annotations/${sanitizedAnnotationId}`
      );

      // Clear cache
      this.clearCache(sanitizedImageId);

      console.log(`[AnnotationsService] Deleted annotation ${sanitizedAnnotationId}`);
      return true;

    } catch (error) {
      errorService.handleError(error, {
        code: 'DELETE_ANNOTATION_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.LOW,
        context: { imageId, annotationId },
      });
      return false;
    }
  }

  /**
   * Validate annotations for an image
   */
  async validateAnnotations(imageId: string): Promise<{ isValid: boolean; errors?: string[] }> {
    try {
      const sanitizedImageId = Security.InputValidator.sanitizeString(imageId, 50);

      const response = await apiService.post<{ isValid: boolean; errors?: string[] }>(
        `${this.basePath}/${sanitizedImageId}/annotations/validate`,
        {}
      );

      return response;

    } catch (error) {
      errorService.handleError(error, {
        code: 'VALIDATION_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.LOW,
        context: { imageId },
      });

      return { isValid: false, errors: ['Validation service unavailable'] };
    }
  }

  /**
   * Get all annotations with pagination validation
   */
  async getAllAnnotations(page: number = 1, pageSize: number = 50): Promise<{
    annotations: Annotation[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    try {
      // Validate pagination
      const validation = Security.InputValidator.validatePagination(page, pageSize);
      if (!validation.valid) {
        throw new Error(`Invalid pagination: ${validation.errors?.join(', ')}`);
      }

      const { page: validPage, pageSize: validPageSize } = validation.data!;

      const response = await apiService.get<{
        annotations: Annotation[];
        total: number;
        page: number;
        pageSize: number;
      }>(`${this.basePath}/annotations?page=${validPage}&page_size=${validPageSize}`);

      // Sanitize all annotations
      response.annotations = response.annotations.map(a => this.sanitizeAnnotation(a));

      return response;

    } catch (error) {
      errorService.handleError(error, {
        code: 'FETCH_ALL_ANNOTATIONS_FAILED',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
      });

      return {
        annotations: [],
        total: 0,
        page,
        pageSize,
      };
    }
  }

  /**
   * Export annotations in specific format
   */
  async exportAnnotations(format: 'coco' | 'yolo' | 'pascal_voc' | 'json' | 'csv' = 'coco'): Promise<Blob> {
    try {
      const response = await apiService.get<Blob>(
        `${this.basePath}/annotations/export?format=${format}`,
        { responseType: 'blob' }
      );

      return response;

    } catch (error) {
      throw errorService.handleError(error, {
        code: 'EXPORT_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        context: { format },
      });
    }
  }

  /**
   * Batch update annotations with validation
   */
  async batchUpdateAnnotations(
    updates: { imageId: string; annotations: BoundingBox[] }[]
  ): Promise<AnnotationBatchResult> {
    const startTime = Date.now();
    const results: AnnotationBatchResult = {
      successful: [],
      failed: [],
      totalTime: 0,
    };

    // Process in chunks
    const chunks = this.chunkArray(updates, 5);

    for (const chunk of chunks) {
      const promises = chunk.map(async ({ imageId, annotations }) => {
        try {
          const result = await this.saveAnnotations(imageId, annotations);
          results.successful.push(result);
        } catch (error: any) {
          results.failed.push({
            imageId,
            error: error.userMessage || error.message || 'Failed to update annotations',
          });
        }
      });

      await Promise.allSettled(promises);
    }

    results.totalTime = Date.now() - startTime;
    console.log(`[AnnotationsService] Batch updated ${results.successful.length} annotations in ${results.totalTime}ms`);

    return results;
  }

  /**
   * Private helper methods
   */
  private async validateBoundingBoxes(boxes: BoundingBox[]): Promise<BoundingBox[]> {
    if (boxes.length > ANNOTATION_CONFIG.MAX_BOXES_PER_IMAGE) {
      throw new Error(`Maximum ${ANNOTATION_CONFIG.MAX_BOXES_PER_IMAGE} boxes per image allowed`);
    }

    const validated: BoundingBox[] = [];

    for (const box of boxes) {
      const validation = Security.InputValidator.validateBoundingBox(box);
      if (!validation.valid) {
        throw new Error(`Invalid bounding box: ${validation.errors?.join(', ')}`);
      }

      // Sanitize text fields
      const sanitizedBox = {
        ...validation.data,
        category: Security.InputValidator.sanitizeString(box.category || '', ANNOTATION_CONFIG.MAX_LABEL_LENGTH),
        value: Security.InputValidator.sanitizeString(box.value || '', ANNOTATION_CONFIG.MAX_LABEL_LENGTH),
        label: box.label ? Security.InputValidator.sanitizeString(box.label, ANNOTATION_CONFIG.MAX_LABEL_LENGTH) : undefined,
        id: box.id || this.generateBoxId(),
      } as BoundingBox;

      validated.push(sanitizedBox);
    }

    return validated;
  }

  private createOptimisticAnnotation(imageId: string, boxes: BoundingBox[]): Annotation {
    return {
      id: `temp_${Date.now()}`,
      image_id: imageId,
      bounding_boxes: boxes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'draft',
      version: 1,
    };
  }

  private sanitizeAnnotation(annotation: Annotation): Annotation {
    return {
      ...annotation,
      bounding_boxes: annotation.bounding_boxes.map(box => ({
        ...box,
        category: Security.InputValidator.sanitizeString(box.category, ANNOTATION_CONFIG.MAX_LABEL_LENGTH),
        value: Security.InputValidator.sanitizeString(box.value, ANNOTATION_CONFIG.MAX_LABEL_LENGTH),
      })),
    };
  }

  private scheduleAutoSave(imageId: string, boxes: BoundingBox[]): void {
    // Clear existing timer
    this.clearAutoSave(imageId);

    // Schedule new save
    const timer = setTimeout(async () => {
      try {
        await this.saveAnnotations(imageId, boxes);
        console.log(`[AnnotationsService] Auto-saved annotations for ${imageId}`);
      } catch (error) {
        console.error(`[AnnotationsService] Auto-save failed for ${imageId}`, error);
      }
    }, ANNOTATION_CONFIG.AUTO_SAVE_DELAY);

    this.autoSaveTimers.set(imageId, timer);
  }

  private clearAutoSave(imageId: string): void {
    const timer = this.autoSaveTimers.get(imageId);
    if (timer) {
      clearTimeout(timer);
      this.autoSaveTimers.delete(imageId);
    }
  }

  private generateBoxId(): string {
    return `box_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Cache management
  private getFromCache(imageId: string): Annotation | null {
    const cached = this.cache.get(imageId);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < ANNOTATION_CONFIG.CACHE_TTL) {
        return cached.data;
      }
      this.cache.delete(imageId);
    }
    return null;
  }

  private updateCache(imageId: string, data: Annotation): void {
    this.cache.set(imageId, {
      data,
      timestamp: Date.now(),
    });
  }

  private clearCache(imageId: string): void {
    this.cache.delete(imageId);
  }
}

// Singleton instance
const annotationsService = new AnnotationsService();
export default annotationsService;