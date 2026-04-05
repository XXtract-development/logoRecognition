/**
 * Training Routes Tests
 * Integration tests for training job management and model endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { mlClient, MLServiceError } from '../../services/ml-client';
import { mockUser } from '../helpers/mock-data';

// Add training-related methods to mlClient mock
const mockedMlClient = mlClient as vi.Mocked<typeof mlClient> & {
  startTraining: ReturnType<typeof vi.fn>;
  getTrainingStatus: ReturnType<typeof vi.fn>;
  listTrainingJobs: ReturnType<typeof vi.fn>;
  cancelTraining: ReturnType<typeof vi.fn>;
  listModels: ReturnType<typeof vi.fn>;
  activateModel: ReturnType<typeof vi.fn>;
};

// Ensure training methods exist on the mock
if (!mockedMlClient.startTraining) {
  (mockedMlClient as any).startTraining = vi.fn();
}
if (!mockedMlClient.getTrainingStatus) {
  (mockedMlClient as any).getTrainingStatus = vi.fn();
}
if (!mockedMlClient.listTrainingJobs) {
  (mockedMlClient as any).listTrainingJobs = vi.fn();
}
if (!mockedMlClient.cancelTraining) {
  (mockedMlClient as any).cancelTraining = vi.fn();
}
if (!mockedMlClient.listModels) {
  (mockedMlClient as any).listModels = vi.fn();
}
if (!mockedMlClient.activateModel) {
  (mockedMlClient as any).activateModel = vi.fn();
}

// Mock socket-io-manager
vi.mock('../../services/socket-io-manager', () => ({
  socketIOManager: {
    notifyTrainingStarted: vi.fn(),
    sendTrainingUpdate: vi.fn(),
    isInitialized: vi.fn(() => true),
    getClientCount: vi.fn(() => 0),
  },
}));

const mockTrainingJobResponse = {
  job_id: 'job-123',
  status: 'running',
  batch_id: 'batch-456',
  progress: 0,
  created_at: new Date().toISOString(),
};

const mockCompletedJob = {
  job_id: 'job-123',
  status: 'completed',
  batch_id: 'batch-456',
  progress: 100,
  metrics: { accuracy: 0.95, loss: 0.05 },
  created_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
};

const mockModelList = {
  models: [
    { id: 'model-1', name: 'v1.0', version: '1.0.0', is_active: true, created_at: new Date().toISOString() },
    { id: 'model-2', name: 'v2.0', version: '2.0.0', is_active: false, created_at: new Date().toISOString() },
  ],
  active_model: 'model-1',
};

describe('Training Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });

    // Mock authenticated user
    app.addHook('preHandler', async (request) => {
      (request as any).user = {
        userId: mockUser.id,
        email: mockUser.email,
        role: 'USER',
      };
    });

    const { trainingRoutes } = await import('../../api/v1/training');
    await app.register(trainingRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // ============================================
  // POST /training/start
  // ============================================

  describe('POST /training/start', () => {
    it('should start a training job with batch_id', async () => {
      mockedMlClient.startTraining.mockResolvedValue(mockTrainingJobResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {
          batch_id: 'batch-456',
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.job_id).toBe('job-123');
      expect(body.status).toBe('running');
    });

    it('should start a training job with custom config', async () => {
      mockedMlClient.startTraining.mockResolvedValue(mockTrainingJobResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {
          batch_id: 'batch-456',
          config: {
            batch_size: 32,
            epochs: 50,
            learning_rate: 0.0005,
          },
          model_name: 'my-model-v2',
        },
      });

      expect(response.statusCode).toBe(202);
      expect(mockedMlClient.startTraining).toHaveBeenCalledWith(
        expect.objectContaining({
          batch_id: 'batch-456',
          config: expect.objectContaining({
            batch_size: 32,
            epochs: 50,
            learning_rate: 0.0005,
          }),
          model_name: 'my-model-v2',
        })
      );
    });

    it('should return 400 when batch_id is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle ML service errors', async () => {
      mockedMlClient.startTraining.mockRejectedValue(
        new MLServiceError('Training queue full', 503, 'Max concurrent jobs reached')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {
          batch_id: 'batch-456',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Training Error');
      expect(body.message).toBe('Training queue full');
    });

    it('should return 500 for unexpected errors', async () => {
      mockedMlClient.startTraining.mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/training/start',
        payload: {
          batch_id: 'batch-456',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });
  });

  // ============================================
  // GET /training/:jobId
  // ============================================

  describe('GET /training/:jobId', () => {
    it('should return training job status', async () => {
      mockedMlClient.getTrainingStatus.mockResolvedValue(mockCompletedJob);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/job-123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.job_id).toBe('job-123');
      expect(body.status).toBe('completed');
      expect(body.progress).toBe(100);
    });

    it('should return 404 when job not found', async () => {
      mockedMlClient.getTrainingStatus.mockRejectedValue(
        new MLServiceError('Job not found', 404)
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/non-existent-job',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not Found');
    });

    it('should return 500 for unexpected errors', async () => {
      mockedMlClient.getTrainingStatus.mockRejectedValue(new Error('Connection timeout'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/job-123',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });
  });

  // ============================================
  // GET /training/jobs and GET /training
  // ============================================

  describe('GET /training/jobs', () => {
    it('should list training jobs', async () => {
      const jobs = [mockTrainingJobResponse, mockCompletedJob];
      mockedMlClient.listTrainingJobs.mockResolvedValue(jobs);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/jobs',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobs).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it('should filter by status', async () => {
      mockedMlClient.listTrainingJobs.mockResolvedValue([mockCompletedJob]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/jobs?status=completed',
      });

      expect(response.statusCode).toBe(200);
      expect(mockedMlClient.listTrainingJobs).toHaveBeenCalledWith('completed', 10);
    });

    it('should accept limit parameter', async () => {
      mockedMlClient.listTrainingJobs.mockResolvedValue([mockTrainingJobResponse]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/jobs?limit=5',
      });

      expect(response.statusCode).toBe(200);
      expect(mockedMlClient.listTrainingJobs).toHaveBeenCalledWith(undefined, 5);
    });

    it('should return empty list when ML service is down', async () => {
      mockedMlClient.listTrainingJobs.mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training/jobs',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobs).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('GET /training (alias)', () => {
    it('should list training jobs via alias route', async () => {
      const jobs = [mockTrainingJobResponse];
      mockedMlClient.listTrainingJobs.mockResolvedValue(jobs);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/training',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.jobs).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  // ============================================
  // DELETE /training/:jobId
  // ============================================

  describe('DELETE /training/:jobId', () => {
    it('should cancel a training job', async () => {
      mockedMlClient.cancelTraining.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/job-123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Training job cancelled');
      expect(body.job_id).toBe('job-123');
    });

    it('should handle ML service errors when cancelling', async () => {
      mockedMlClient.cancelTraining.mockRejectedValue(
        new MLServiceError('Job already completed', 409)
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/job-123',
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Cancel Error');
    });

    it('should return 500 for unexpected errors', async () => {
      mockedMlClient.cancelTraining.mockRejectedValue(new Error('Network error'));

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/training/job-123',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });
  });

  // ============================================
  // GET /models
  // ============================================

  describe('GET /models', () => {
    it('should list available models', async () => {
      mockedMlClient.listModels.mockResolvedValue(mockModelList);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/models',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.models).toHaveLength(2);
      expect(body.active_model).toBe('model-1');
    });

    it('should return empty list when ML service is down', async () => {
      mockedMlClient.listModels.mockRejectedValue(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/models',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.models).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // ============================================
  // POST /models/:modelId/activate
  // ============================================

  describe('POST /models/:modelId/activate', () => {
    it('should activate a model', async () => {
      mockedMlClient.activateModel.mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/models/model-2/activate',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Model activated');
      expect(body.model_id).toBe('model-2');
    });

    it('should handle ML service errors', async () => {
      mockedMlClient.activateModel.mockRejectedValue(
        new MLServiceError('Model not found', 404)
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/models/non-existent/activate',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Activation Error');
    });

    it('should return 500 for unexpected errors', async () => {
      mockedMlClient.activateModel.mockRejectedValue(new Error('Disk full'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/models/model-2/activate',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });
  });
});
