/**
 * Vitest Test Setup
 * Global mocks and configuration for API tests
 */

import { vi } from 'vitest';

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9000';
process.env.MINIO_ACCESS_KEY = 'test-key';
process.env.MINIO_SECRET_KEY = 'test-secret';
process.env.ML_SERVICE_URL = 'http://localhost:8001';

// Mock Prisma
vi.mock('@prisma/client', () => {
  const mockPrismaClient = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    logoImage: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 'img-001', storagePath: 'x' }),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    logo: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    referenceLogo: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    annotation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    recognitionLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    recognitionResult: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    trainingData: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    feedbackEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    trainingJob: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    trainingBatch: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    modelVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    artworkImportRun: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    artworkImport: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    artworkReviewItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    // Supports both Prisma transaction forms:
    //  - array form: prisma.$transaction([op1, op2, ...])
    //  - interactive form: prisma.$transaction(async (tx) => { ... })
    // In the interactive form the same mock client is handed back as `tx`,
    // so per-call assertions on mockPrismaClient.* keep working.
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(mockPrismaClient)
        : Promise.all(arg as unknown[])
    ),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
    UserRole: {
      USER: 'USER',
      ADMIN: 'ADMIN',
      ANNOTATOR: 'ANNOTATOR',
    },
    FeedbackType: {
      CORRECT: 'CORRECT',
      INCORRECT: 'INCORRECT',
      UNCERTAIN: 'UNCERTAIN',
    },
  };
});

// Mock logger
vi.mock('../core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock storage service
vi.mock('../services/storage', () => ({
  uploadImage: vi.fn(),
  uploadReferenceLogo: vi.fn(),
  uploadArtwork: vi.fn().mockResolvedValue(undefined),
  getSignedUrl: vi.fn(),
  getReferenceLogoUrl: vi.fn(),
  deleteImage: vi.fn(),
  validateImage: vi.fn(),
  generateThumbnail: vi.fn(),
  BUCKETS: {
    TRAINING: 'training',
    RECOGNITION: 'recognition',
    MODELS: 'models',
  },
}));

// Mock mediaserver client (Epic 8, Story 8.1)
vi.mock('../services/mediaserver-client', () => {
  const mockDiscover = vi.fn().mockImplementation(async (gtin: string) => {
    // Known test GTIN: returns one PACKAGING_ARTWORK item
    if (gtin === '08718989912451') {
      return [
        {
          id: 'media-id-0001',
          fileName: '08718989912451_46182_001.jpg',
          previewUrl:
            '/8718989000000/PACKAGING_ARTWORK/1717500000000/08718989912451_46182_001/sha256abc.jpg',
          typeInfo: 'PACKAGING_ARTWORK',
          active: true,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];
    }
    // Unknown GTIN: simulate discovery failure (not found = empty array)
    return [];
  });

  const mockDownload = vi.fn().mockResolvedValue({
    buffer: Buffer.from('fake-image-data'),
    mimeType: 'image/jpeg',
  });

  return {
    MediaServerClient: vi.fn(() => ({
      discoverArtwork: mockDiscover,
      downloadFile: mockDownload,
    })),
    MediaServerError: class MediaServerError extends Error {
      statusCode?: number;
      gtin?: string;
      constructor(message: string, statusCode?: number, gtin?: string) {
        super(message);
        this.statusCode = statusCode;
        this.gtin = gtin;
        this.name = 'MediaServerError';
      }
    },
    mediaServerClient: {
      discoverArtwork: mockDiscover,
      downloadFile: mockDownload,
    },
  };
});

// Mock ML client
vi.mock('../services/ml-client', () => ({
  mlClient: {
    isHealthy: vi.fn(),
    detectLogos: vi.fn(),
    detectLogosFromBuffer: vi.fn(),
    generateEmbedding: vi.fn(),
    rasterizeArtwork: vi.fn(),
    synthesizeArtwork: vi.fn(),
  },
  MLServiceError: class MLServiceError extends Error {
    statusCode: number;
    detail?: string;
    constructor(message: string, statusCode: number, detail?: string) {
      super(message);
      this.statusCode = statusCode;
      this.detail = detail;
    }
  },
}));

// Mock WebSocket manager
vi.mock('../services/websocket-manager', () => ({
  wsManager: {
    registerClient: vi.fn(),
    unregisterClient: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    sendToClient: vi.fn(),
    broadcastToTopic: vi.fn(),
    broadcastAll: vi.fn(),
    sendTrainingUpdate: vi.fn(),
    notifyTrainingStarted: vi.fn(),
    notifyTrainingCompleted: vi.fn(),
    notifyTrainingFailed: vi.fn(),
    sendRecognitionUpdate: vi.fn(),
    notifyFeedbackReceived: vi.fn(),
    notifyRetrainingTriggered: vi.fn(),
    handlePing: vi.fn(),
    getClientCount: vi.fn(),
    closeAll: vi.fn(),
  },
}));

// Mock auth middleware - automatically authenticate test requests
vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn(async (request, _reply) => {
    // If user already set by test preHandler, skip
    if (request.user) return;

    // Check for test auth cookie or header
    const authHeader = request.headers.authorization;
    const cookie = request.headers.cookie;

    if (authHeader?.startsWith('Bearer ') || cookie?.includes('access_token=')) {
      // Attach test user to request
      request.user = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER',
      };
    }
  }),
  requireRole: vi.fn((...roles: string[]) => {
    return async (request: any, reply: any) => {
      // If user already set by test preHandler, just check role
      if (request.user) {
        if (!roles.includes(request.user.role)) {
          return reply.status(403).send({
            error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
          });
        }
        return;
      }

      const authHeader = request.headers.authorization;
      const cookie = request.headers.cookie;

      if (!authHeader?.startsWith('Bearer ') && !cookie?.includes('access_token=')) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      // Check for admin role in test
      const isAdmin = cookie?.includes('role=ADMIN') || authHeader?.includes('admin');
      const userRole = isAdmin ? 'ADMIN' : 'USER';

      request.user = {
        userId: isAdmin ? 'admin-user-id' : 'test-user-id',
        email: isAdmin ? 'admin@example.com' : 'test@example.com',
        role: userRole,
      };

      if (!roles.includes(userRole)) {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        });
      }
    };
  }),
  optionalAuth: vi.fn(async (request, _reply) => {
    // If user already set by test preHandler, skip
    if (request.user) return;

    const authHeader = request.headers.authorization;
    const cookie = request.headers.cookie;

    if (authHeader?.startsWith('Bearer ') || cookie?.includes('access_token=')) {
      request.user = {
        userId: 'test-user-id',
        email: 'test@example.com',
        role: 'USER',
      };
    }
  }),
  apiKeyAuth: vi.fn(async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    if (!apiKey) {
      return reply.status(401).send({
        error: { code: 'API_KEY_REQUIRED', message: 'API key is required' },
      });
    }
  }),
}));
