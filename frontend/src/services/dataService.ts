/**
 * Data Service - Manages all data operations with backend API
 * @module services/dataService
 * @description Handles CRUD operations for logos, batches, and annotations
 */

import { apiClient } from './api';

/**
 * Logo detection result interface
 * @interface LogoDetection
 * @property {string} id - Unique detection identifier
 * @property {string} imageUrl - URL of the source image
 * @property {string} category - Logo category (e.g., 'brand', 'recycling')
 * @property {string} value - Specific logo value/name
 * @property {number} confidence - Confidence score (0-1)
 * @property {BoundingBox} bbox - Bounding box coordinates
 * @property {string} userId - ID of user who created the detection
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 */
interface LogoDetection {
  id: string;
  imageUrl: string;
  category: string;
  value: string;
  confidence: number;
  bbox: BoundingBox;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bounding box coordinates interface
 * @interface BoundingBox
 * @property {number} x - X coordinate (top-left)
 * @property {number} y - Y coordinate (top-left)
 * @property {number} width - Box width
 * @property {number} height - Box height
 */
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Training batch interface
 * @interface TrainingBatch
 * @property {string} id - Unique batch identifier
 * @property {string} name - Batch name
 * @property {string} description - Batch description
 * @property {number} imageCount - Number of images in batch
 * @property {number} annotationCount - Number of annotations
 * @property {string} status - Batch status ('pending', 'processing', 'completed', 'failed')
 * @property {string} userId - ID of user who created the batch
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} completedAt - Completion timestamp (if applicable)
 */
interface TrainingBatch {
  id: string;
  name: string;
  description?: string;
  imageCount: number;
  annotationCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  userId: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Annotation interface for training data
 * @interface Annotation
 * @property {string} id - Unique annotation identifier
 * @property {string} imageId - Associated image ID
 * @property {string} batchId - Associated batch ID
 * @property {string} category - Logo category
 * @property {string} value - Specific logo value
 * @property {BoundingBox} bbox - Bounding box coordinates
 * @property {string} userId - ID of user who created annotation
 * @property {boolean} verified - Whether annotation has been verified
 * @property {Date} createdAt - Creation timestamp
 */
interface Annotation {
  id: string;
  imageId: string;
  batchId: string;
  category: string;
  value: string;
  bbox: BoundingBox;
  userId: string;
  verified: boolean;
  createdAt: Date;
}

/**
 * Pagination parameters interface
 * @interface PaginationParams
 * @property {number} page - Page number (1-based)
 * @property {number} limit - Items per page
 * @property {string} sortBy - Field to sort by
 * @property {string} sortOrder - Sort order ('asc' or 'desc')
 */
interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response interface
 * @interface PaginatedResponse<T>
 * @property {T[]} items - Array of items
 * @property {number} total - Total number of items
 * @property {number} page - Current page number
 * @property {number} pages - Total number of pages
 * @property {number} limit - Items per page
 */
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

/**
 * Data Service Class
 * @class DataService
 * @description Manages all data operations with the backend API
 */
class DataService {
  /**
   * Detects logos in an uploaded image
   * @param {File} file - Image file to process
   * @param {Function} onProgress - Upload progress callback
   * @returns {Promise<LogoDetection[]>} Array of detected logos
   * @throws {Error} When detection fails
   * @example
   * const file = new File(['...'], 'image.jpg');
   * const detections = await dataService.detectLogos(file);
   */
  public async detectLogos(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<LogoDetection[]> {
    // Create multipart/form-data for file upload
    const formData = new FormData();
    formData.append('file', file);

    // Upload with multipart/form-data content type
    const response = await apiClient.uploadFile(
      '/detect',
      formData,
      onProgress ? (progressEvent: any) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      } : undefined
    );

    return response.detections;
  }

  /**
   * Gets all logo detections with pagination
   * @param {PaginationParams} params - Pagination parameters
   * @returns {Promise<PaginatedResponse<LogoDetection>>} Paginated detections
   * @example
   * const detections = await dataService.getDetections({ page: 1, limit: 20 });
   */
  public async getDetections(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<LogoDetection>> {
    const queryParams = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 20),
      sort_by: params.sortBy || 'created_at',
      sort_order: params.sortOrder || 'desc',
    });

    return apiClient.get(`/detections?${queryParams}`);
  }

  /**
   * Gets a single detection by ID
   * @param {string} id - Detection ID
   * @returns {Promise<LogoDetection>} Detection details
   * @example
   * const detection = await dataService.getDetection('detection-123');
   */
  public async getDetection(id: string): Promise<LogoDetection> {
    return apiClient.get(`/detections/${id}`);
  }

  /**
   * Deletes a detection
   * @param {string} id - Detection ID to delete
   * @returns {Promise<void>}
   * @example
   * await dataService.deleteDetection('detection-123');
   */
  public async deleteDetection(id: string): Promise<void> {
    await apiClient.delete(`/detections/${id}`);
  }

  /**
   * Creates a new training batch
   * @param {string} name - Batch name
   * @param {string} description - Batch description
   * @param {File[]} files - Array of image files
   * @param {Function} onProgress - Upload progress callback
   * @returns {Promise<TrainingBatch>} Created batch
   * @example
   * const files = [new File(['...'], 'image1.jpg'), new File(['...'], 'image2.jpg')];
   * const batch = await dataService.createBatch('Batch 1', 'Test batch', files);
   */
  public async createBatch(
    name: string,
    description: string,
    files: File[],
    onProgress?: (progress: number) => void
  ): Promise<TrainingBatch> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);

    files.forEach((file) => {
      formData.append('files', file);
    });

    return apiClient.uploadFile(
      '/training/batches',
      formData,
      onProgress ? (progressEvent: any) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      } : undefined
    );
  }

  /**
   * Gets all training batches with pagination
   * @param {PaginationParams} params - Pagination parameters
   * @returns {Promise<PaginatedResponse<TrainingBatch>>} Paginated batches
   * @example
   * const batches = await dataService.getBatches({ page: 1, limit: 10 });
   */
  public async getBatches(
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<TrainingBatch>> {
    const queryParams = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 10),
      sort_by: params.sortBy || 'created_at',
      sort_order: params.sortOrder || 'desc',
    });

    return apiClient.get(`/training/batches?${queryParams}`);
  }

  /**
   * Gets a single batch by ID
   * @param {string} id - Batch ID
   * @returns {Promise<TrainingBatch>} Batch details
   * @example
   * const batch = await dataService.getBatch('batch-123');
   */
  public async getBatch(id: string): Promise<TrainingBatch> {
    return apiClient.get(`/training/batches/${id}`);
  }

  /**
   * Creates an annotation for a training image
   * @param {Omit<Annotation, 'id' | 'createdAt'>} annotation - Annotation data
   * @returns {Promise<Annotation>} Created annotation
   * @example
   * const annotation = await dataService.createAnnotation({
   *   imageId: 'img-123',
   *   batchId: 'batch-123',
   *   category: 'brand',
   *   value: 'nike',
   *   bbox: { x: 10, y: 10, width: 100, height: 100 },
   *   userId: 'user-123',
   *   verified: false
   * });
   */
  public async createAnnotation(
    annotation: Omit<Annotation, 'id' | 'createdAt'>
  ): Promise<Annotation> {
    return apiClient.post('/training/annotations', annotation);
  }

  /**
   * Gets annotations for a batch
   * @param {string} batchId - Batch ID
   * @param {PaginationParams} params - Pagination parameters
   * @returns {Promise<PaginatedResponse<Annotation>>} Paginated annotations
   * @example
   * const annotations = await dataService.getBatchAnnotations('batch-123');
   */
  public async getBatchAnnotations(
    batchId: string,
    params: PaginationParams = {}
  ): Promise<PaginatedResponse<Annotation>> {
    const queryParams = new URLSearchParams({
      page: String(params.page || 1),
      limit: String(params.limit || 50),
    });

    return apiClient.get(`/training/batches/${batchId}/annotations?${queryParams}`);
  }

  /**
   * Updates an annotation
   * @param {string} id - Annotation ID
   * @param {Partial<Annotation>} updates - Updates to apply
   * @returns {Promise<Annotation>} Updated annotation
   * @example
   * const updated = await dataService.updateAnnotation('ann-123', { verified: true });
   */
  public async updateAnnotation(
    id: string,
    updates: Partial<Annotation>
  ): Promise<Annotation> {
    return apiClient.patch(`/training/annotations/${id}`, updates);
  }

  /**
   * Deletes an annotation
   * @param {string} id - Annotation ID
   * @returns {Promise<void>}
   * @example
   * await dataService.deleteAnnotation('ann-123');
   */
  public async deleteAnnotation(id: string): Promise<void> {
    await apiClient.delete(`/training/annotations/${id}`);
  }

  /**
   * Starts training with a batch
   * @param {string} batchId - Batch ID to train with
   * @returns {Promise<{ taskId: string }>} Training task ID
   * @example
   * const { taskId } = await dataService.startTraining('batch-123');
   */
  public async startTraining(batchId: string): Promise<{ taskId: string }> {
    return apiClient.post(`/training/batches/${batchId}/train`);
  }

  /**
   * Gets training status
   * @param {string} taskId - Training task ID
   * @returns {Promise<{ status: string; progress: number; message?: string }>} Training status
   * @example
   * const status = await dataService.getTrainingStatus('task-123');
   */
  public async getTrainingStatus(
    taskId: string
  ): Promise<{ status: string; progress: number; message?: string }> {
    return apiClient.get(`/training/tasks/${taskId}/status`);
  }

  /**
   * Exports data in specified format
   * @param {string} format - Export format ('csv', 'json', 'excel')
   * @param {string} type - Data type ('detections', 'annotations')
   * @returns {Promise<Blob>} Exported data as blob
   * @example
   * const blob = await dataService.exportData('csv', 'detections');
   * // Create download link
   * const url = URL.createObjectURL(blob);
   */
  public async exportData(
    format: 'csv' | 'json' | 'excel',
    type: 'detections' | 'annotations'
  ): Promise<Blob> {
    const response = await apiClient.get(`/export/${type}?format=${format}`, {
      responseType: 'blob',
    });
    return new Blob([response], { type: this.getMimeType(format) });
  }

  /**
   * Gets MIME type for export format
   * @private
   * @param {string} format - Export format
   * @returns {string} MIME type
   */
  private getMimeType(format: string): string {
    const mimeTypes: { [key: string]: string } = {
      csv: 'text/csv',
      json: 'application/json',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return mimeTypes[format] || 'application/octet-stream';
  }
}

// Export singleton instance
export const dataService = new DataService();

// Export types
export type {
  LogoDetection,
  BoundingBox,
  TrainingBatch,
  Annotation,
  PaginationParams,
  PaginatedResponse,
};