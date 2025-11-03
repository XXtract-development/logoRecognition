/**
 * Tests for Image Service
 */

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

import imageService from '../imageService';
import apiService from '../api';
import { Security } from '../securityService';
import { errorService } from '../errorService';

// Mock the api service
jest.mock('../api');
jest.mock('../securityService');
jest.mock('../errorService');

describe('ImageService', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;
  const mockSecurity = Security as jest.Mocked<typeof Security>;
  const mockErrorService = errorService as jest.Mocked<typeof errorService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    mockSecurity.InputValidator = {
      validateFile: jest.fn(() => ({ valid: true, data: {} })),
      sanitizeString: jest.fn((str) => str),
      validatePagination: jest.fn(() => ({ valid: true, page: 1, pageSize: 10 })),
      validateUrl: jest.fn(() => true),
    } as any;

    mockErrorService.handleError = jest.fn((error) => {
      throw new Error(error.message || 'Upload failed');
    });

    // Setup default API responses
    mockApiService.uploadFile = jest.fn(() => Promise.resolve({
      file_id: 'default-id',
      filename: 'default.jpg',
      url: '/api/v1/logos/default-id/image'
    }));
    mockApiService.get = jest.fn(() => Promise.resolve({
      images: [],
      total: 0,
      page: 1,
      pageSize: 10
    }));
    mockApiService.post = jest.fn(() => Promise.resolve({}));
    mockApiService.delete = jest.fn(() => Promise.resolve({}));
  });

  describe('uploadImage', () => {
    it('should upload a single image successfully', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockResponse = {
        file_id: '123',
        filename: 'test.jpg',
        url: '/api/v1/logos/123/image'
      };

      mockApiService.uploadFile.mockResolvedValue(mockResponse);

      const result = await imageService.uploadImage(mockFile);

      expect(mockApiService.uploadFile).toHaveBeenCalledWith(
        '/v1/logos/upload',
        mockFile,
        undefined
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle upload progress', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockProgress = jest.fn();
      const mockResponse = {
        file_id: '123',
        filename: 'test.jpg',
        url: '/api/v1/logos/123/image'
      };

      mockApiService.uploadFile.mockResolvedValue(mockResponse);

      await imageService.uploadImage(mockFile, mockProgress);

      expect(mockApiService.uploadFile).toHaveBeenCalledWith(
        '/v1/logos/upload',
        mockFile,
        mockProgress
      );
    });

    it('should handle upload errors', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockError = new Error('Upload failed');

      mockApiService.uploadFile.mockRejectedValue(mockError);

      await expect(imageService.uploadImage(mockFile)).rejects.toThrow('Upload failed');
    });
  });

  describe('getImages', () => {
    it('should fetch images with pagination', async () => {
      const mockResponse = {
        images: [
          { id: '1', file_id: '1', filename: 'test1.jpg', url: '/api/v1/logos/1/image' },
          { id: '2', file_id: '2', filename: 'test2.jpg', url: '/api/v1/logos/2/image' }
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        hasMore: false
      };

      mockApiService.get.mockResolvedValue(mockResponse);

      const result = await imageService.getImages(1, 20);

      expect(mockApiService.get).toHaveBeenCalledWith('/v1/logos?page=1&page_size=20');
      expect(result).toEqual(mockResponse);
    });

    it('should return empty list on error', async () => {
      mockApiService.get.mockRejectedValue(new Error('Network error'));

      const result = await imageService.getImages();

      expect(result).toEqual({
        images: [],
        total: 0,
        page: 1,
        pageSize: 20,
        hasMore: false
      });
    });
  });

  describe('deleteImage', () => {
    it('should delete an image successfully', async () => {
      mockApiService.delete.mockResolvedValue(undefined);

      await imageService.deleteImage('123');

      expect(mockApiService.delete).toHaveBeenCalledWith('/v1/logos/123');
    });

    it('should throw error on delete failure', async () => {
      const mockError = new Error('Delete failed');
      mockApiService.delete.mockRejectedValue(mockError);

      await expect(imageService.deleteImage('123')).rejects.toThrow('Delete failed');
    });
  });

  describe('getRecentImages', () => {
    it('should fetch recent images', async () => {
      const mockImages = [
        { id: '1', file_id: '1', filename: 'recent1.jpg', url: '/api/v1/logos/1/image' },
        { id: '2', file_id: '2', filename: 'recent2.jpg', url: '/api/v1/logos/2/image' }
      ];

      mockApiService.get.mockResolvedValue(mockImages);

      const result = await imageService.getRecentImages(10);

      expect(mockApiService.get).toHaveBeenCalledWith('/v1/logos/recent?limit=10');
      expect(result).toEqual(mockImages);
    });

    it('should return empty array on error', async () => {
      mockApiService.get.mockRejectedValue(new Error('Failed to fetch'));

      const result = await imageService.getRecentImages();

      expect(result).toEqual([]);
    });
  });

  describe('uploadMultiple', () => {
    it('should upload multiple images', async () => {
      const mockFiles = [
        new File(['test1'], 'test1.jpg', { type: 'image/jpeg' }),
        new File(['test2'], 'test2.jpg', { type: 'image/jpeg' })
      ];
      const mockResponse = [
        { file_id: '1', filename: 'test1.jpg', url: '/api/v1/logos/1/image' },
        { file_id: '2', filename: 'test2.jpg', url: '/api/v1/logos/2/image' }
      ];

      mockApiService.post.mockResolvedValue(mockResponse);

      const result = await imageService.uploadMultiple(mockFiles);

      expect(mockApiService.post).toHaveBeenCalledWith(
        '/v1/logos/upload/batch',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('markForTraining', () => {
    it('should mark images for training', async () => {
      const imageIds = ['1', '2', '3'];
      mockApiService.post.mockResolvedValue(undefined);

      await imageService.markForTraining(imageIds);

      expect(mockApiService.post).toHaveBeenCalledWith(
        '/v1/logos/mark-for-training',
        { image_ids: imageIds }
      );
    });
  });
});