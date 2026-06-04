/**
 * Mock Data for Tests
 * Reusable test fixtures
 */

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4xU.HLPLl0oLwKzy', // "password123"
  role: 'USER' as const,
  organizationId: null,
  isActive: true,
  lastLoginAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockAdminUser = {
  ...mockUser,
  id: 'admin-user-id',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
};

// Reference keurmerk logo fixture (Epic 7, Story 7.3)
export const mockReferenceLogo = {
  id: 'b1b2c3d4-0000-0000-0000-000000000001',
  t3777Code: 'EU_ORGANIC_FARMING',
  variantLabel: 'kleur-nl',
  source: 'https://agriculture.ec.europa.eu/farming/organic-farming/organic-logo_en',
  storagePath: 'reference-logos/EU_ORGANIC_FARMING/kleur-nl.png',
  active: true,
  logoId: null,
  createdAt: new Date('2026-06-03T10:00:00Z'),
};

export const mockImage = {
  id: 'test-image-id',
  filename: 'test-logo.jpg',
  storagePath: 'training/test-image-id.jpg',
  brandName: null,
  metadata: {
    width: 800,
    height: 600,
    format: 'jpeg',
    size: 50000,
    thumbnailPath: 'training/thumbnails/test-image-id.jpg',
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockCategory = {
  id: 'test-category-id',
  category: 'Automotive',
  value: 'BMW',
  confidenceThreshold: 0.99,
  trainingSamples: 100,
  accuracy: 0.95,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Training-data fixture incl. holdout flag (Epic 7, Story 7.1).
export const mockTrainingData = {
  id: 'test-training-data-id',
  imageId: 'test-image-id',
  label: 'EU_ORGANIC_FARMING',
  confidence: 0.97,
  validated: true,
  holdout: false,
  validationDate: new Date(),
  validatedBy: 'test-user-id',
  createdAt: new Date(),
};

export const mockAnnotation = {
  id: 'test-annotation-id',
  imageId: 'test-image-id',
  logoId: 'test-category-id',
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  rotation: 0,
  confidence: 1.0,
  verificationStatus: 'VERIFIED' as const,
  annotatorId: 'test-user-id',
  reviewerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockRecognitionLog = {
  id: 'test-log-id',
  requestId: 'test-request-id',
  imageHash: 'abc123def456',
  userId: 'test-user-id',
  processingTimeMs: 150,
  detectionCount: 2,
  confidenceThreshold: 0.99,
  createdAt: new Date(),
};

export const mockDetectionResult = {
  request_id: 'test-request-id',
  detections: [
    {
      category: 'Automotive',
      value: 'BMW',
      confidence: 0.995,
      bbox: { x: 100, y: 100, width: 200, height: 200 },
    },
    {
      category: 'Sports',
      value: 'Nike',
      confidence: 0.982,
      bbox: { x: 400, y: 150, width: 150, height: 150 },
    },
  ],
  processing_time_ms: 145,
  model_version: '1.0.0',
};

export const mockFeedback = {
  id: 'test-feedback-id',
  logId: 'test-log-id',
  resultIndex: 0,
  isCorrect: true,
  correctedCategory: null,
  correctedValue: null,
  userId: 'test-user-id',
  createdAt: new Date(),
};

// Model-version fixture incl. holdout metrics block (Epic 7, Story 7.2).
export const mockModelVersion = {
  id: 'test-model-version-id',
  version: 'v20260603_120000',
  modelType: 'EfficientNet-B0',
  accuracy: 0.96,
  precisionScore: 0.95,
  recallScore: 0.94,
  f1Score: 0.945,
  isActive: true,
  config: {},
  metrics: {
    holdout: {
      accuracy: 0.93,
      precision: 0.92,
      recall: 0.91,
      f1: 0.915,
      holdout_size: 250,
      holdout_hash: 'sha256:abc123',
    },
  },
  createdAt: new Date(),
};

export const mockTrainingJob = {
  id: 'test-job-id',
  batchId: 'test-batch-id',
  status: 'COMPLETED' as const,
  config: {
    epochs: 10,
    batchSize: 32,
    learningRate: 0.001,
  },
  progress: 100,
  currentEpoch: 10,
  metrics: {
    accuracy: 0.95,
    loss: 0.05,
    f1Score: 0.94,
  },
  modelPath: 'models/test-model.pt',
  startedAt: new Date(),
  completedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};
