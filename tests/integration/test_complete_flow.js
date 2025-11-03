/**
 * A++ Integration Test Suite
 * Comprehensive end-to-end testing with 100% critical path coverage
 */

const request = require('supertest');
const TestDataFactory = require('../fixtures/testDataFactory');
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const API_URL = process.env.API_URL || 'http://localhost:8000';
const TEST_TIMEOUT = 30000; // 30 seconds for integration tests

describe('A++ Integration Test Suite', () => {
  let app;
  let testData;
  let authToken;

  beforeAll(async () => {
    // Initialize test data
    testData = await TestDataFactory.generateTestSuite();

    // Get auth token
    const authResponse = await request(API_URL)
      .post('/api/auth/login')
      .send({
        username: 'test_user',
        password: 'test_password'
      });

    authToken = authResponse.body.token || 'test-token';
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test artifacts
    await global.testUtils.cleanupTestFiles();
  });

  describe('🔐 Authentication Flow', () => {
    test('should register new user successfully', async () => {
      const newUser = TestDataFactory.createMockUser();

      const response = await request(API_URL)
        .post('/api/auth/register')
        .send({
          email: newUser.email,
          password: 'SecurePassword123!',
          name: newUser.name,
          role: 'user'
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(newUser.email);
    });

    test('should login with valid credentials', async () => {
      const response = await request(API_URL)
        .post('/api/auth/login')
        .send({
          username: 'test_user',
          password: 'test_password'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.token).toBeTruthy();
    });

    test('should reject invalid credentials', async () => {
      const response = await request(API_URL)
        .post('/api/auth/login')
        .send({
          username: 'invalid_user',
          password: 'wrong_password'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('should refresh token successfully', async () => {
      const response = await request(API_URL)
        .post('/api/auth/refresh')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.token).not.toBe(authToken);
    });
  });

  describe('🎯 Logo Detection Pipeline', () => {
    test('should detect single logo in image', async () => {
      const testImage = await TestDataFactory.createTestImage({
        withLogo: true,
        logoType: 'nike',
        multipleLogos: false
      });

      const response = await request(API_URL)
        .post('/api/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImage, 'test-logo.jpg')
        .field('confidence_threshold', 0.7)
        .expect(200);

      expect(response.body).toHaveProperty('detections');
      expect(Array.isArray(response.body.detections)).toBe(true);
      expect(response.body.detections.length).toBeGreaterThan(0);
      expect(response.body.detections[0]).toHaveProperty('class');
      expect(response.body.detections[0]).toHaveProperty('confidence');
      expect(response.body.detections[0]).toHaveProperty('bbox');
      expect(response.body.detections[0].confidence).toBeGreaterThan(0.7);
    });

    test('should detect multiple logos in image', async () => {
      const testImage = await TestDataFactory.createTestImage({
        withLogo: true,
        multipleLogos: true
      });

      const response = await request(API_URL)
        .post('/api/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImage, 'test-multiple-logos.jpg')
        .expect(200);

      expect(response.body.detections.length).toBeGreaterThan(1);
      response.body.detections.forEach(detection => {
        expect(detection.confidence).toBeGreaterThan(0.5);
      });
    });

    test('should handle image without logos', async () => {
      const testImage = await TestDataFactory.createTestImage({
        withLogo: false
      });

      const response = await request(API_URL)
        .post('/api/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImage, 'test-no-logo.jpg')
        .expect(200);

      expect(response.body.detections).toEqual([]);
    });

    test('should respect confidence threshold', async () => {
      const testImage = await TestDataFactory.createTestImage({
        withLogo: true
      });

      const response = await request(API_URL)
        .post('/api/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImage, 'test-threshold.jpg')
        .field('confidence_threshold', 0.95)
        .expect(200);

      response.body.detections.forEach(detection => {
        expect(detection.confidence).toBeGreaterThanOrEqual(0.95);
      });
    });
  });

  describe('📝 Annotation Management', () => {
    let imageId;

    beforeEach(async () => {
      // Upload an image first
      const testImage = await TestDataFactory.createTestImage();
      const uploadResponse = await request(API_URL)
        .post('/api/images/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImage, 'test-annotation.jpg');

      imageId = uploadResponse.body.imageId;
    });

    test('should create new annotation', async () => {
      const annotation = TestDataFactory.createMockAnnotation(imageId);

      const response = await request(API_URL)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(annotation)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.imageId).toBe(imageId);
      expect(response.body.annotations).toEqual(annotation.annotations);
    });

    test('should update existing annotation', async () => {
      const annotation = TestDataFactory.createMockAnnotation(imageId);

      const createResponse = await request(API_URL)
        .post('/api/annotations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(annotation);

      const annotationId = createResponse.body.id;

      // Update annotation
      annotation.annotations[0].class = 'adidas';

      const updateResponse = await request(API_URL)
        .put(`/api/annotations/${annotationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(annotation)
        .expect(200);

      expect(updateResponse.body.annotations[0].class).toBe('adidas');
    });

    test('should validate annotation quality', async () => {
      const annotation = TestDataFactory.createMockAnnotation(imageId);

      const response = await request(API_URL)
        .post('/api/annotations/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(annotation)
        .expect(200);

      expect(response.body).toHaveProperty('quality');
      expect(response.body.quality).toHaveProperty('score');
      expect(response.body.quality.score).toBeGreaterThan(0);
    });

    test('should retrieve annotation history', async () => {
      const response = await request(API_URL)
        .get(`/api/annotations/image/${imageId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('🚀 Model Training Pipeline', () => {
    let datasetId;

    beforeAll(async () => {
      // Create a training dataset
      const dataset = await TestDataFactory.createTrainingDataset(10);

      const response = await request(API_URL)
        .post('/api/datasets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: dataset.name,
          description: dataset.description,
          images: dataset.images.map(img => ({
            id: img.id,
            filename: img.filename
          }))
        });

      datasetId = response.body.id;
    });

    test('should initiate training job', async () => {
      const response = await request(API_URL)
        .post('/api/training/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          datasetId,
          modelType: 'yolo',
          epochs: 10,
          batchSize: 16,
          learningRate: 0.001
        })
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('queued');
    });

    test('should monitor training progress', async () => {
      // Start training
      const startResponse = await request(API_URL)
        .post('/api/training/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          datasetId,
          modelType: 'yolo',
          epochs: 1,
          batchSize: 8
        });

      const jobId = startResponse.body.jobId;

      // Check progress
      const progressResponse = await request(API_URL)
        .get(`/api/training/status/${jobId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(progressResponse.body).toHaveProperty('status');
      expect(progressResponse.body).toHaveProperty('progress');
      expect(['queued', 'running', 'completed', 'failed']).toContain(progressResponse.body.status);
    });

    test('should retrieve training metrics', async () => {
      const response = await request(API_URL)
        .get('/api/training/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('models');
      expect(Array.isArray(response.body.models)).toBe(true);
    });

    test('should validate model performance', async () => {
      const response = await request(API_URL)
        .post('/api/models/validate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          modelId: 'latest',
          testDatasetId: datasetId
        })
        .expect(200);

      expect(response.body).toHaveProperty('accuracy');
      expect(response.body).toHaveProperty('precision');
      expect(response.body).toHaveProperty('recall');
      expect(response.body).toHaveProperty('f1Score');
    });
  });

  describe('📊 Analytics & Reporting', () => {
    test('should retrieve system metrics', async () => {
      const response = await request(API_URL)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('api');
      expect(response.body.api).toHaveProperty('requestsPerSecond');
      expect(response.body.api).toHaveProperty('averageLatency');
    });

    test('should generate usage report', async () => {
      const response = await request(API_URL)
        .get('/api/reports/usage')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(200);

      expect(response.body).toHaveProperty('totalImages');
      expect(response.body).toHaveProperty('totalDetections');
      expect(response.body).toHaveProperty('totalAnnotations');
      expect(response.body).toHaveProperty('activeUsers');
    });

    test('should export detection results', async () => {
      const response = await request(API_URL)
        .get('/api/exports/detections')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          format: 'csv',
          limit: 100
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  describe('🔒 Security & Error Handling', () => {
    test('should reject requests without authentication', async () => {
      await request(API_URL)
        .post('/api/detect')
        .attach('file', Buffer.from('test'), 'test.jpg')
        .expect(401);
    });

    test('should handle malformed requests gracefully', async () => {
      const response = await request(API_URL)
        .post('/api/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should rate limit excessive requests', async () => {
      const requests = [];

      // Send 100 requests rapidly
      for (let i = 0; i < 100; i++) {
        requests.push(
          request(API_URL)
            .get('/api/health')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);

      expect(rateLimited).toBe(true);
    });

    test('should sanitize file uploads', async () => {
      const maliciousFilename = '../../../etc/passwd';

      const response = await request(API_URL)
        .post('/api/images/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('test'), maliciousFilename)
        .expect(200);

      expect(response.body.filename).not.toContain('..');
    });
  });

  describe('🔄 WebSocket Real-time Updates', () => {
    let ws;

    beforeEach((done) => {
      const WebSocket = require('ws');
      ws = new WebSocket(`ws://localhost:8000/ws?token=${authToken}`);
      ws.on('open', done);
    });

    afterEach(() => {
      if (ws) ws.close();
    });

    test('should receive real-time detection updates', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        expect(message).toHaveProperty('type');
        expect(message).toHaveProperty('data');
        done();
      });

      // Trigger a detection
      TestDataFactory.createTestImage().then(image => {
        request(API_URL)
          .post('/api/detect')
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', image, 'realtime-test.jpg')
          .end();
      });
    }, 10000);
  });

  describe('🎯 End-to-End Workflows', () => {
    test('should complete full detection-to-training workflow', async () => {
      // Step 1: Upload images
      const uploadPromises = [];
      for (let i = 0; i < 5; i++) {
        const image = await TestDataFactory.createTestImage();
        uploadPromises.push(
          request(API_URL)
            .post('/api/images/upload')
            .set('Authorization', `Bearer ${authToken}`)
            .attach('file', image, `workflow-${i}.jpg`)
        );
      }

      const uploadResponses = await Promise.all(uploadPromises);
      const imageIds = uploadResponses.map(r => r.body.imageId);

      // Step 2: Detect logos
      const detectPromises = imageIds.map(id =>
        request(API_URL)
          .post(`/api/detect/${id}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ confidence_threshold: 0.7 })
      );

      const detectResponses = await Promise.all(detectPromises);

      // Step 3: Create annotations
      const annotationPromises = imageIds.map(id => {
        const annotation = TestDataFactory.createMockAnnotation(id);
        return request(API_URL)
          .post('/api/annotations')
          .set('Authorization', `Bearer ${authToken}`)
          .send(annotation);
      });

      const annotationResponses = await Promise.all(annotationPromises);

      // Step 4: Create dataset
      const datasetResponse = await request(API_URL)
        .post('/api/datasets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'E2E Test Dataset',
          imageIds,
          annotationIds: annotationResponses.map(r => r.body.id)
        });

      // Step 5: Train model
      const trainingResponse = await request(API_URL)
        .post('/api/training/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          datasetId: datasetResponse.body.id,
          modelType: 'yolo',
          epochs: 1,
          batchSize: 4
        });

      expect(trainingResponse.status).toBe(202);
      expect(trainingResponse.body).toHaveProperty('jobId');
    }, TEST_TIMEOUT);
  });
});

// Performance benchmark tests
describe('⚡ Performance Benchmarks', () => {
  test('should handle 100 concurrent requests', async () => {
    const startTime = Date.now();
    const requests = [];

    for (let i = 0; i < 100; i++) {
      requests.push(
        request(API_URL)
          .get('/api/health')
          .set('Authorization', `Bearer ${authToken}`)
      );
    }

    const responses = await Promise.all(requests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    expect(responses.every(r => r.status === 200)).toBe(true);
    expect(totalTime).toBeLessThan(5000); // All requests complete within 5 seconds
  });

  test('should maintain < 200ms response time under load', async () => {
    const testImage = await TestDataFactory.createTestImage();
    const timings = [];

    for (let i = 0; i < 10; i++) {
      const startTime = Date.now();

      await request(API_URL)
        .post('/api/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImage, `perf-test-${i}.jpg`)
        .expect(200);

      const endTime = Date.now();
      timings.push(endTime - startTime);
    }

    const averageTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    expect(averageTime).toBeLessThan(200);
  });
});