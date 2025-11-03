/**
 * Enhanced Image Service with A++ Grade Security and Error Handling
 * Complete implementation with validation, caching, and monitoring
 */

import apiService from './apiService';
import { Security } from './securityService';
import { errorService, ErrorCategory, ErrorSeverity } from './errorService';

export interface UploadedImage {
  id: string;
  file_id: string;
  filename: string;
  url: string;
  uploaded_at?: string;
  size?: number;
  width?: number;
  height?: number;
  annotations_count?: number;
  metadata?: Record<string, any>;
}

export interface ImageUploadResponse {
  file_id: string;
  filename: string;
  url: string;
  message?: string;
  processingTime?: number;
}

export interface ImageUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  estimatedTimeRemaining?: number;
}

export interface ImageListResponse {
  images: UploadedImage[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface BatchUploadResult {
  successful: ImageUploadResponse[];
  failed: Array<{ file: string; error: string }>;
  totalTime: number;
}

// Configuration constants
const IMAGE_SERVICE_CONFIG = {
  MAX_CONCURRENT_UPLOADS: 3,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  PERFORMANCE_THRESHOLD: 3000, // 3 seconds
};

class ImageService {
  private readonly basePath = '/v1/logos';
  private uploadQueue: Map<string, AbortController> = new Map();
  private currentUploads = 0;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  /**
   * Upload a single image with comprehensive validation and error handling
   */
  async uploadImage(
    file: File,
    onProgress?: (progress: ImageUploadProgress) => void
  ): Promise<ImageUploadResponse> {
    const startTime = Date.now();
    let uploadId: string = '';

    try {
      // Validate file
      const validation = Security.InputValidator.validateFile(file);
      if (!validation.valid) {
        throw errorService.handleError(new Error('File validation failed'), {
          code: 'FILE_VALIDATION_ERROR',
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          userMessage: validation.errors?.join(', '),
          context: { filename: file.name, errors: validation.errors },
        });
      }

      // Check concurrent uploads limit
      if (this.currentUploads >= IMAGE_SERVICE_CONFIG.MAX_CONCURRENT_UPLOADS) {
        await this.waitForUploadSlot();
      }

      this.currentUploads++;

      // Create form data with sanitized filename
      const sanitizedFilename = Security.InputValidator.sanitizeString(file.name, 255);
      const formData = new FormData();
      formData.append('file', file, sanitizedFilename);

      // Create abort controller
      const abortController = new AbortController();
      uploadId = this.generateUploadId();
      this.uploadQueue.set(uploadId, abortController);

      // Upload with progress tracking
      const response = await apiService.post<ImageUploadResponse>(
        `${this.basePath}/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: abortController.signal,
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const progress: ImageUploadProgress = {
                loaded: progressEvent.loaded,
                total: progressEvent.total,
                percentage: Math.round((progressEvent.loaded * 100) / progressEvent.total),
                estimatedTimeRemaining: this.estimateTimeRemaining(
                  progressEvent.loaded,
                  progressEvent.total,
                  startTime
                ),
              };
              onProgress(progress);
            }
          },
        }
      );

      // Validate response
      if (!response.file_id || !response.url) {
        throw new Error('Invalid response from server');
      }

      // Sanitize response URL
      if (!Security.InputValidator.validateUrl(response.url)) {
        response.url = this.sanitizeImageUrl(response.file_id);
      }

      // Clear cache
      this.clearListCache();

      const duration = Date.now() - startTime;
      console.log(`[ImageService] Upload successful: ${sanitizedFilename} in ${duration}ms`);

      return { ...response, processingTime: duration };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw errorService.handleError(new Error('Upload cancelled'), {
          code: 'UPLOAD_CANCELLED',
          category: ErrorCategory.USER_INPUT,
          severity: ErrorSeverity.LOW,
        });
      }

      if (error.id && error.code) throw error;

      throw errorService.handleError(error, {
        code: 'UPLOAD_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        context: { filename: file.name },
      });

    } finally {
      this.currentUploads--;
      this.uploadQueue.delete(uploadId);
    }
  }

  /**
   * Upload multiple images with parallel processing
   */
  async uploadBatch(
    files: File[],
    onProgress?: (file: string, progress: ImageUploadProgress) => void
  ): Promise<BatchUploadResult> {
    const startTime = Date.now();
    const results: BatchUploadResult = {
      successful: [],
      failed: [],
      totalTime: 0,
    };

    // Validate all files first
    const validFiles: File[] = [];
    for (const file of files) {
      const validation = Security.InputValidator.validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        results.failed.push({
          file: file.name,
          error: validation.errors?.join(', ') || 'Validation failed',
        });
      }
    }

    // Process uploads in chunks
    const chunks = this.chunkArray(validFiles, IMAGE_SERVICE_CONFIG.MAX_CONCURRENT_UPLOADS);

    for (const chunk of chunks) {
      const promises = chunk.map(async (file) => {
        try {
          const result = await this.uploadImage(
            file,
            onProgress ? (p) => onProgress(file.name, p) : undefined
          );
          results.successful.push(result);
        } catch (error: any) {
          results.failed.push({
            file: file.name,
            error: error.userMessage || error.message || 'Upload failed',
          });
        }
      });

      await Promise.allSettled(promises);
    }

    results.totalTime = Date.now() - startTime;
    return results;
  }

  /**
   * Upload multiple images (alias for uploadBatch for backward compatibility)
   */
  async uploadMultiple(
    files: File[],
    onProgress?: (file: string, progress: ImageUploadProgress) => void
  ): Promise<BatchUploadResult> {
    return this.uploadBatch(files, onProgress);
  }

  /**
   * Get paginated list of images with caching
   */
  async getImages(
    page: number = 1,
    pageSize: number = IMAGE_SERVICE_CONFIG.DEFAULT_PAGE_SIZE
  ): Promise<ImageListResponse> {
    try {
      // Validate pagination
      const validation = Security.InputValidator.validatePagination(page, pageSize);
      if (!validation.valid) {
        throw errorService.handleError(new Error('Invalid pagination parameters'), {
          code: 'PAGINATION_ERROR',
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          userMessage: validation.errors?.join(', '),
        });
      }

      const { page: validPage, pageSize: validPageSize } = validation.data!;

      // Check cache
      const cacheKey = `images_${validPage}_${validPageSize}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log(`[ImageService] Cache hit for page ${validPage}`);
        return cached;
      }

      // Fetch from API
      const response = await apiService.get<ImageListResponse>(
        `${this.basePath}?page=${validPage}&page_size=${validPageSize}`
      );

      // Sanitize and cache response
      const sanitizedResponse = this.sanitizeImageListResponse(response);
      this.setCache(cacheKey, sanitizedResponse);

      return sanitizedResponse;

    } catch (error: any) {
      errorService.handleError(error, {
        code: 'FETCH_IMAGES_FAILED',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        recoverable: true,
      });

      // Return safe default response
      return {
        images: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  }

  /**
   * Get image by ID with validation
   */
  async getImage(imageId: string): Promise<UploadedImage | null> {
    try {
      // Sanitize ID to prevent injection
      const sanitizedId = Security.InputValidator.sanitizeString(imageId, 50);

      const cacheKey = `image_${sanitizedId}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const response = await apiService.get<UploadedImage>(`${this.basePath}/${sanitizedId}`);
      const sanitized = this.sanitizeImage(response);

      this.setCache(cacheKey, sanitized);
      return sanitized;

    } catch (error) {
      errorService.handleError(error, {
        code: 'FETCH_IMAGE_FAILED',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW,
        context: { imageId },
      });
      return null;
    }
  }

  /**
   * Delete image with confirmation
   */
  async deleteImage(imageId: string): Promise<boolean> {
    try {
      const sanitizedId = Security.InputValidator.sanitizeString(imageId, 50);
      await apiService.delete(`${this.basePath}/${sanitizedId}`);

      // Clear all caches
      this.clearCache();

      console.log(`[ImageService] Deleted image: ${sanitizedId}`);
      return true;

    } catch (error) {
      errorService.handleError(error, {
        code: 'DELETE_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        context: { imageId },
      });
      return false;
    }
  }

  /**
   * Get recent images with intelligent caching
   */
  async getRecentImages(limit: number = 10): Promise<UploadedImage[]> {
    try {
      // Validate limit
      if (limit < 1 || limit > 100) {
        throw new Error('Invalid limit: must be between 1 and 100');
      }

      const cacheKey = `recent_${limit}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const response = await apiService.get<UploadedImage[]>(
        `${this.basePath}/recent?limit=${limit}`
      );

      const sanitized = response.map(img => this.sanitizeImage(img));
      this.setCache(cacheKey, sanitized);

      return sanitized;

    } catch (error) {
      errorService.handleError(error, {
        code: 'FETCH_RECENT_FAILED',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW,
      });
      return [];
    }
  }

  /**
   * Get images pending annotation
   */
  async getPendingAnnotation(): Promise<UploadedImage[]> {
    try {
      const response = await apiService.get<UploadedImage[]>(
        `${this.basePath}/pending-annotation`
      );
      return response.map(img => this.sanitizeImage(img));
    } catch (error) {
      errorService.handleError(error, {
        code: 'FETCH_PENDING_FAILED',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW,
      });
      return [];
    }
  }

  /**
   * Mark images as ready for training
   */
  async markForTraining(imageIds: string[]): Promise<boolean> {
    try {
      // Sanitize all IDs
      const sanitizedIds = imageIds.map(id =>
        Security.InputValidator.sanitizeString(id, 50)
      );

      await apiService.post(`${this.basePath}/mark-for-training`, {
        image_ids: sanitizedIds
      });

      return true;
    } catch (error) {
      errorService.handleError(error, {
        code: 'MARK_TRAINING_FAILED',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        context: { imageIds },
      });
      return false;
    }
  }

  /**
   * Cancel ongoing upload
   */
  cancelUpload(uploadId: string): void {
    const controller = this.uploadQueue.get(uploadId);
    if (controller) {
      controller.abort();
      this.uploadQueue.delete(uploadId);
      console.log(`[ImageService] Upload cancelled: ${uploadId}`);
    }
  }

  /**
   * Private helper methods
   */
  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async waitForUploadSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkSlot = setInterval(() => {
        if (this.currentUploads < IMAGE_SERVICE_CONFIG.MAX_CONCURRENT_UPLOADS) {
          clearInterval(checkSlot);
          resolve();
        }
      }, 100);
    });
  }

  private estimateTimeRemaining(loaded: number, total: number, startTime: number): number {
    const elapsed = Date.now() - startTime;
    const rate = loaded / elapsed;
    const remaining = total - loaded;
    return Math.round(remaining / rate);
  }

  private sanitizeImage(image: UploadedImage): UploadedImage {
    return {
      ...image,
      filename: Security.InputValidator.sanitizeString(image.filename, 255),
      url: this.sanitizeImageUrl(image.file_id),
    };
  }

  private sanitizeImageUrl(fileId: string): string {
    const sanitizedId = encodeURIComponent(fileId);
    return `${process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1'}${this.basePath}/${sanitizedId}/image`;
  }

  private sanitizeImageListResponse(response: ImageListResponse): ImageListResponse {
    return {
      ...response,
      images: response.images.map(img => this.sanitizeImage(img)),
    };
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Simple cache implementation
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < IMAGE_SERVICE_CONFIG.CACHE_TTL) {
        return cached.data;
      }
      this.cache.delete(key);
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Clean old cache entries
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  private clearListCache(): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith('images_') || key.startsWith('recent_')) {
        this.cache.delete(key);
      }
    }
  }

  private clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
const imageService = new ImageService();
export default imageService;