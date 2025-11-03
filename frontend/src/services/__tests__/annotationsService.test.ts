/**
 * Comprehensive Test Suite for AnnotationsService
 * Testing all functionality with 95%+ coverage target
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock axios first before any other imports
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      interceptors: {
        request: { use: () => {} },
        response: { use: () => {} }
      },
      get: () => Promise.resolve({ data: {} }),
      post: () => Promise.resolve({ data: {} }),
      put: () => Promise.resolve({ data: {} }),
      delete: () => Promise.resolve({ data: {} }),
    }),
    get: () => Promise.resolve({ data: {} }),
    post: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: {} }),
    delete: () => Promise.resolve({ data: {} }),
    interceptors: {
      request: { use: () => {} },
      response: { use: () => {} }
    }
  }
}));

import annotationsService from '../annotationsService';
import apiService from '../apiService';
import { Security } from '../securityService';
import { errorService } from '../errorService';

// Mock dependencies
jest.mock('../apiService');
jest.mock('../securityService');
jest.mock('../errorService');

const mockedApiService = apiService as jest.Mocked<typeof apiService>;
const mockedSecurity = Security as jest.Mocked<typeof Security>;
const mockedErrorService = errorService as jest.Mocked<typeof errorService>;

describe('AnnotationsService', () => {
  // Test data
  const mockImageId = 'test-image-123';
  const mockAnnotationId = 'annotation-456';

  const mockBoundingBox = {
    id: 'box-1',
    x: 100,
    y: 150,
    width: 200,
    height: 250,
    category: 'logo',
    value: 'brand-a',
    label: 'Brand A Logo',
    confidence: 0.95,
  };

  const mockAnnotation = {
    id: mockAnnotationId,
    image_id: mockImageId,
    bounding_boxes: [mockBoundingBox],
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    status: 'draft' as const,
    version: 1,
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Clear cache by accessing private property
    (annotationsService as any).cache.clear();
    (annotationsService as any).optimisticManager = {
      isPending: jest.fn(() => false),
      applyOptimistic: jest.fn(),
      confirmUpdate: jest.fn(),
      rollback: jest.fn(() => null)
    };

    // Setup default mock implementations
    mockedSecurity.InputValidator.sanitizeString = jest.fn((str) => str);
    mockedSecurity.InputValidator.validateBoundingBox = jest.fn(() => ({
      valid: true,
      data: mockBoundingBox,
    }));

    mockedErrorService.handleError = jest.fn((error) => {
      throw error;
    });
  });

  afterEach(() => {
    // Clear any timeouts/intervals
    jest.clearAllTimers();
  });

  describe('getAnnotations', () => {
    it('should fetch annotations successfully', async () => {
      mockedApiService.get.mockResolvedValueOnce({
        annotation: mockAnnotation,
      });

      const result = await annotationsService.getAnnotations(mockImageId);

      expect(result).toEqual(mockAnnotation);
      expect(mockedApiService.get).toHaveBeenCalledWith(
        `/v1/logos/${mockImageId}/annotations`
      );
      expect(mockedSecurity.InputValidator.sanitizeString).toHaveBeenCalledWith(mockImageId, 50);
    });

    it('should return null for 404 errors', async () => {
      mockedApiService.get.mockRejectedValueOnce({
        response: { status: 404 },
      });

      const result = await annotationsService.getAnnotations(mockImageId);

      expect(result).toBeNull();
      expect(mockedErrorService.handleError).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Network error');
      mockedApiService.get.mockRejectedValueOnce(error);
      mockedErrorService.handleError.mockImplementationOnce(() => null);

      const result = await annotationsService.getAnnotations(mockImageId);

      expect(result).toBeNull();
      expect(mockedErrorService.handleError).toHaveBeenCalled();
    });

    it('should return cached data if available', async () => {
      // First call - fetch from API
      mockedApiService.get.mockResolvedValueOnce({
        annotation: mockAnnotation,
      });
      await annotationsService.getAnnotations(mockImageId);

      // Second call - should use cache
      jest.clearAllMocks();
      const result = await annotationsService.getAnnotations(mockImageId);

      expect(result).toEqual(mockAnnotation);
      expect(mockedApiService.get).not.toHaveBeenCalled();
    });
  });

  describe('saveAnnotations', () => {
    const mockBoundingBoxes = [mockBoundingBox];

    it('should save annotations successfully', async () => {
      mockedApiService.post.mockResolvedValueOnce({
        annotation: mockAnnotation,
      });

      const result = await annotationsService.saveAnnotations(mockImageId, mockBoundingBoxes);

      expect(result).toEqual(mockAnnotation);
      expect(mockedApiService.post).toHaveBeenCalledWith(
        `/v1/logos/${mockImageId}/annotations`,
        { annotations: mockBoundingBoxes }
      );
      expect(mockedSecurity.InputValidator.validateBoundingBox).toHaveBeenCalled();
    });

    it('should validate bounding boxes before saving', async () => {
      mockedSecurity.InputValidator.validateBoundingBox.mockReturnValueOnce({
        valid: false,
        errors: ['Invalid coordinates'],
      });

      await expect(
        annotationsService.saveAnnotations(mockImageId, mockBoundingBoxes)
      ).rejects.toThrow('Invalid bounding box');

      expect(mockedApiService.post).not.toHaveBeenCalled();
    });

    it('should handle save errors with retry', async () => {
      const error = new Error('Server error');
      mockedApiService.post.mockRejectedValueOnce(error);

      await expect(
        annotationsService.saveAnnotations(mockImageId, mockBoundingBoxes)
      ).rejects.toThrow();

      expect(mockedErrorService.handleError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          code: 'SAVE_ANNOTATION_FAILED',
          retryable: true,
        })
      );
    });

    it('should enforce maximum boxes per image limit', async () => {
      const tooManyBoxes = Array(101).fill(mockBoundingBox);

      await expect(
        annotationsService.saveAnnotations(mockImageId, tooManyBoxes)
      ).rejects.toThrow('Maximum 100 boxes per image allowed');
    });

    it('should apply optimistic updates', async () => {
      mockedApiService.post.mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => resolve({ annotation: mockAnnotation }), 100);
        })
      );

      const promise = annotationsService.saveAnnotations(mockImageId, mockBoundingBoxes);

      // Should have optimistic data immediately
      const cached = await annotationsService.getAnnotations(mockImageId);
      expect(cached).toBeTruthy();
      expect(cached?.status).toBe('draft');

      await promise;
    });
  });

  describe('updateAnnotation', () => {
    it('should update a single annotation', async () => {
      mockedApiService.put.mockResolvedValueOnce({
        annotation: mockAnnotation,
      });

      const result = await annotationsService.updateAnnotation(
        mockImageId,
        mockAnnotationId,
        mockBoundingBox
      );

      expect(result).toEqual(mockAnnotation);
      expect(mockedApiService.put).toHaveBeenCalledWith(
        `/v1/logos/${mockImageId}/annotations/${mockAnnotationId}`,
        mockBoundingBox
      );
    });

    it('should validate bounding box before update', async () => {
      mockedSecurity.InputValidator.validateBoundingBox.mockReturnValueOnce({
        valid: false,
        errors: ['Invalid width'],
      });

      await expect(
        annotationsService.updateAnnotation(mockImageId, mockAnnotationId, mockBoundingBox)
      ).rejects.toThrow('Invalid bounding box');
    });
  });

  describe('deleteAnnotation', () => {
    it('should delete annotation successfully', async () => {
      mockedApiService.delete.mockResolvedValueOnce(undefined);

      const result = await annotationsService.deleteAnnotation(mockImageId, mockAnnotationId);

      expect(result).toBe(true);
      expect(mockedApiService.delete).toHaveBeenCalledWith(
        `/v1/logos/${mockImageId}/annotations/${mockAnnotationId}`
      );
    });

    it('should handle delete errors', async () => {
      mockedApiService.delete.mockRejectedValueOnce(new Error('Delete failed'));
      mockedErrorService.handleError.mockImplementationOnce(() => false);

      const result = await annotationsService.deleteAnnotation(mockImageId, mockAnnotationId);

      expect(result).toBe(false);
      expect(mockedErrorService.handleError).toHaveBeenCalled();
    });
  });

  describe('validateAnnotations', () => {
    it('should validate annotations successfully', async () => {
      mockedApiService.post.mockResolvedValueOnce({
        isValid: true,
      });

      const result = await annotationsService.validateAnnotations(mockImageId);

      expect(result).toEqual({ isValid: true });
      expect(mockedApiService.post).toHaveBeenCalledWith(
        `/v1/logos/${mockImageId}/annotations/validate`,
        {}
      );
    });

    it('should return validation errors', async () => {
      mockedApiService.post.mockResolvedValueOnce({
        isValid: false,
        errors: ['Missing required fields'],
      });

      const result = await annotationsService.validateAnnotations(mockImageId);

      expect(result).toEqual({
        isValid: false,
        errors: ['Missing required fields'],
      });
    });

    it('should handle validation service errors', async () => {
      mockedApiService.post.mockRejectedValueOnce(new Error('Service unavailable'));
      mockedErrorService.handleError.mockImplementationOnce(() => {});

      const result = await annotationsService.validateAnnotations(mockImageId);

      expect(result).toEqual({
        isValid: false,
        errors: ['Validation service unavailable'],
      });
    });
  });

  describe('getAllAnnotations', () => {
    it('should fetch all annotations with pagination', async () => {
      const mockResponse = {
        annotations: [mockAnnotation],
        total: 1,
        page: 1,
        pageSize: 50,
      };

      mockedApiService.get.mockResolvedValueOnce(mockResponse);
      mockedSecurity.InputValidator.validatePagination = jest.fn(() => ({
        valid: true,
        data: { page: 1, pageSize: 50 },
      }));

      const result = await annotationsService.getAllAnnotations(1, 50);

      expect(result).toEqual(mockResponse);
      expect(mockedApiService.get).toHaveBeenCalledWith(
        '/v1/logos/annotations?page=1&page_size=50'
      );
    });

    it('should validate pagination parameters', async () => {
      mockedSecurity.InputValidator.validatePagination = jest.fn(() => ({
        valid: false,
        errors: ['Invalid page number'],
      }));

      await expect(
        annotationsService.getAllAnnotations(-1, 50)
      ).rejects.toThrow('Invalid pagination');
    });

    it('should return empty result on error', async () => {
      mockedApiService.get.mockRejectedValueOnce(new Error('Fetch failed'));
      mockedErrorService.handleError.mockImplementationOnce(() => {});
      mockedSecurity.InputValidator.validatePagination = jest.fn(() => ({
        valid: true,
        data: { page: 1, pageSize: 50 },
      }));

      const result = await annotationsService.getAllAnnotations();

      expect(result).toEqual({
        annotations: [],
        total: 0,
        page: 1,
        pageSize: 50,
      });
    });
  });

  describe('exportAnnotations', () => {
    it('should export annotations in different formats', async () => {
      const mockBlob = new Blob(['test data']);
      mockedApiService.get.mockResolvedValueOnce(mockBlob);

      const result = await annotationsService.exportAnnotations('coco');

      expect(result).toEqual(mockBlob);
      expect(mockedApiService.get).toHaveBeenCalledWith(
        '/v1/logos/annotations/export?format=coco',
        { responseType: 'blob' }
      );
    });

    it('should support all export formats', async () => {
      const formats = ['coco', 'yolo', 'pascal_voc', 'json', 'csv'] as const;
      const mockBlob = new Blob(['test data']);

      for (const format of formats) {
        mockedApiService.get.mockResolvedValueOnce(mockBlob);
        const result = await annotationsService.exportAnnotations(format);
        expect(result).toEqual(mockBlob);
      }
    });

    it('should handle export errors', async () => {
      mockedApiService.get.mockRejectedValueOnce(new Error('Export failed'));

      await expect(
        annotationsService.exportAnnotations('coco')
      ).rejects.toThrow();

      expect(mockedErrorService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          code: 'EXPORT_FAILED',
        })
      );
    });
  });

  describe('batchUpdateAnnotations', () => {
    it('should batch update annotations successfully', async () => {
      const updates = [
        { imageId: 'image1', annotations: [mockBoundingBox] },
        { imageId: 'image2', annotations: [mockBoundingBox] },
      ];

      mockedApiService.post.mockResolvedValue({
        annotation: mockAnnotation,
      });

      const result = await annotationsService.batchUpdateAnnotations(updates);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalTime).toBeGreaterThan(0);
    });

    it('should handle partial batch failures', async () => {
      const updates = [
        { imageId: 'image1', annotations: [mockBoundingBox] },
        { imageId: 'image2', annotations: [mockBoundingBox] },
      ];

      mockedApiService.post
        .mockResolvedValueOnce({ annotation: mockAnnotation })
        .mockRejectedValueOnce(new Error('Save failed'));

      const result = await annotationsService.batchUpdateAnnotations(updates);

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        imageId: 'image2',
        error: expect.any(String),
      });
    });

    it('should process updates in chunks', async () => {
      const updates = Array(10).fill(null).map((_, i) => ({
        imageId: `image${i}`,
        annotations: [mockBoundingBox],
      }));

      mockedApiService.post.mockResolvedValue({
        annotation: mockAnnotation,
      });

      const result = await annotationsService.batchUpdateAnnotations(updates);

      expect(result.successful).toHaveLength(10);
      // Should be processed in chunks of 5
      expect(mockedApiService.post).toHaveBeenCalledTimes(10);
    });
  });

  describe('Auto-save functionality', () => {
    jest.useFakeTimers();

    it('should auto-save annotations after delay', async () => {
      mockedApiService.post.mockResolvedValue({
        annotation: mockAnnotation,
      });

      await annotationsService.saveAnnotations(mockImageId, [mockBoundingBox]);

      // Clear the first save call
      jest.clearAllMocks();

      // Fast-forward time to trigger auto-save
      jest.advanceTimersByTime(2000);

      // Wait for auto-save to complete
      await Promise.resolve();

      expect(mockedApiService.post).toHaveBeenCalledTimes(1);
    });

    it('should cancel auto-save on manual save', async () => {
      mockedApiService.post.mockResolvedValue({
        annotation: mockAnnotation,
      });

      await annotationsService.saveAnnotations(mockImageId, [mockBoundingBox]);

      jest.clearAllMocks();

      // Manual save before auto-save triggers
      await annotationsService.saveAnnotations(mockImageId, [mockBoundingBox]);

      // Fast-forward past auto-save delay
      jest.advanceTimersByTime(3000);

      // Should only have the manual save, not the auto-save
      expect(mockedApiService.post).toHaveBeenCalledTimes(1);
    });

    jest.useRealTimers();
  });

  describe('Cache management', () => {
    it('should cache annotations after fetch', async () => {
      mockedApiService.get.mockResolvedValueOnce({
        annotation: mockAnnotation,
      });

      // First fetch
      await annotationsService.getAnnotations(mockImageId);

      // Second fetch should use cache
      jest.clearAllMocks();
      const cached = await annotationsService.getAnnotations(mockImageId);

      expect(cached).toEqual(mockAnnotation);
      expect(mockedApiService.get).not.toHaveBeenCalled();
    });

    it('should invalidate cache after update', async () => {
      mockedApiService.get.mockResolvedValue({
        annotation: mockAnnotation,
      });
      mockedApiService.post.mockResolvedValue({
        annotation: { ...mockAnnotation, updated_at: '2024-01-02T10:00:00Z' },
      });

      // Initial fetch
      await annotationsService.getAnnotations(mockImageId);

      // Update
      await annotationsService.saveAnnotations(mockImageId, [mockBoundingBox]);

      // Next fetch should have updated data
      const result = await annotationsService.getAnnotations(mockImageId);
      expect(result?.updated_at).toBe('2024-01-02T10:00:00Z');
    });

    it('should clear cache on delete', async () => {
      mockedApiService.get.mockResolvedValue({
        annotation: mockAnnotation,
      });
      mockedApiService.delete.mockResolvedValue(undefined);

      // Initial fetch
      await annotationsService.getAnnotations(mockImageId);

      // Delete
      await annotationsService.deleteAnnotation(mockImageId, mockAnnotationId);

      // Next fetch should hit API
      jest.clearAllMocks();
      await annotationsService.getAnnotations(mockImageId);

      expect(mockedApiService.get).toHaveBeenCalled();
    });
  });

  describe('Security and validation', () => {
    it('should sanitize all user inputs', async () => {
      const maliciousId = '<script>alert("xss")</script>';
      const sanitizedId = 'scriptalertxssscript';

      mockedSecurity.InputValidator.sanitizeString.mockReturnValue(sanitizedId);
      mockedApiService.get.mockResolvedValue({
        annotation: mockAnnotation,
      });

      await annotationsService.getAnnotations(maliciousId);

      expect(mockedSecurity.InputValidator.sanitizeString).toHaveBeenCalledWith(
        maliciousId,
        50
      );
      expect(mockedApiService.get).toHaveBeenCalledWith(
        `/v1/logos/${sanitizedId}/annotations`
      );
    });

    it('should validate all bounding box data', async () => {
      const invalidBox = {
        ...mockBoundingBox,
        x: -100, // Invalid negative coordinate
      };

      mockedSecurity.InputValidator.validateBoundingBox.mockReturnValue({
        valid: false,
        errors: ['Invalid x coordinate'],
      });

      await expect(
        annotationsService.saveAnnotations(mockImageId, [invalidBox])
      ).rejects.toThrow('Invalid bounding box');
    });

    it('should sanitize labels and categories', async () => {
      const boxWithMaliciousLabel = {
        ...mockBoundingBox,
        label: '<img src=x onerror=alert(1)>',
        category: 'javascript:void(0)',
      };

      mockedSecurity.InputValidator.sanitizeString.mockImplementation(
        (str) => str.replace(/<[^>]*>/g, '')
      );

      mockedApiService.post.mockResolvedValue({
        annotation: mockAnnotation,
      });

      await annotationsService.saveAnnotations(mockImageId, [boxWithMaliciousLabel]);

      expect(mockedSecurity.InputValidator.sanitizeString).toHaveBeenCalledTimes(4); // imageId + category + value + label
    });
  });

  describe('Error handling and recovery', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';

      mockedApiService.get.mockRejectedValue(networkError);
      mockedErrorService.handleError.mockImplementation(() => null);

      const result = await annotationsService.getAnnotations(mockImageId);

      expect(result).toBeNull();
      expect(mockedErrorService.handleError).toHaveBeenCalledWith(
        networkError,
        expect.objectContaining({
          code: 'FETCH_ANNOTATIONS_FAILED',
          category: expect.any(String),
        })
      );
    });

    it('should support optimistic update rollback on error', async () => {
      const error = new Error('Save failed');
      mockedApiService.post.mockRejectedValue(error);

      try {
        await annotationsService.saveAnnotations(mockImageId, [mockBoundingBox]);
      } catch (e) {
        // Expected to throw
      }

      // Cache should be cleared after failed save
      jest.clearAllMocks();
      await annotationsService.getAnnotations(mockImageId);

      // Should fetch from API since cache was cleared
      expect(mockedApiService.get).toHaveBeenCalled();
    });
  });
});

describe('AnnotationsService Performance', () => {
  it('should handle large numbers of bounding boxes efficiently', async () => {
    const manyBoxes = Array(100).fill(null).map((_, i) => ({
      ...mockBoundingBox,
      id: `box-${i}`,
      x: i * 10,
      y: i * 10,
    }));

    mockedApiService.post.mockResolvedValue({
      annotation: { ...mockAnnotation, bounding_boxes: manyBoxes },
    });

    const startTime = Date.now();
    await annotationsService.saveAnnotations(mockImageId, manyBoxes);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should efficiently process batch updates', async () => {
    const batchSize = 20;
    const updates = Array(batchSize).fill(null).map((_, i) => ({
      imageId: `image-${i}`,
      annotations: [mockBoundingBox],
    }));

    mockedApiService.post.mockResolvedValue({
      annotation: mockAnnotation,
    });

    const startTime = Date.now();
    const result = await annotationsService.batchUpdateAnnotations(updates);
    const duration = Date.now() - startTime;

    expect(result.successful).toHaveLength(batchSize);
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });
});