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

// Pipeline service account key (Epic 9, Story 9.1)
// Matches the 'test-service-key' fallback in the ATDD fixture:
//   isServiceRequest({ headers: { 'x-api-key': process.env.PIPELINE_SERVICE_KEY || 'test-service-key' } })
process.env.PIPELINE_SERVICE_KEY = 'test-service-key';

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
      groupBy: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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
    retrainingNotification: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    modelActivationLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    // Referentie-vliegwiel (Story 13.2)
    referenceCandidate: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'cand-1' }),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      count: vi.fn(),
    },
    candidateEmbedding: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    referenceEmbedding: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    hardNegative: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: 'hn-1' }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn(),
    },
    // Promotie-batch (Story 13.4)
    promotionBatch: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'batch-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    // Gold-set (Story 13.3)
    goldSetRecord: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'gold-1' }),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
      count: vi.fn(),
    },
    // System settings (Story 13.6) — persistente pauze + baseline-stale-marker.
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      count: vi.fn(),
    },
    // Threshold-/pauze-audittrail (Story 15.4) — drempelwijzigingen + pauze-overgangen.
    thresholdChange: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'tc-1', changedAt: new Date('2026-07-03T09:00:00Z') }),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    // Outlier findings (Story 14.3) — wekelijkse bibliotheek-outlier-audit.
    outlierFinding: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'outlier-1' }),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    // Mismatch-events (Story 16.1) — registratie + aggregatiebron (FR-14).
    mismatchEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },
    // Bootstrap-wachtrij (Story 16.2) — structurele werkvoorraad (FR-15).
    bootstrapQueue: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'bq-1' }),
      upsert: vi.fn().mockResolvedValue({ id: 'bq-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
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

  // Minimal `Prisma` namespace mock. `$queryRaw`/`$executeRaw` are mocked to
  // return canned values regardless of the SQL argument, so the tagged-template
  // helpers only need to produce inert placeholder objects that don't throw.
  const makeSqlFragment = () => ({ strings: [''], values: [] });
  const Prisma = {
    sql: (..._args: unknown[]) => makeSqlFragment(),
    join: (..._args: unknown[]) => makeSqlFragment(),
    raw: (..._args: unknown[]) => makeSqlFragment(),
    empty: makeSqlFragment(),
  };

  return {
    PrismaClient: vi.fn(() => mockPrismaClient),
    Prisma,
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
  downloadImage: vi.fn(),
  downloadTrainingObject: vi.fn(),
  listTrainingObjectKeys: vi.fn().mockResolvedValue([]),
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
    localizeArtwork: vi.fn().mockResolvedValue({ detections: [], truncated: false }),
    classifyArtwork: vi.fn().mockResolvedValue({ results: [] }),
    reloadTemplates: vi.fn().mockResolvedValue(undefined),
    getTrainingStatus: vi.fn().mockRejectedValue(Object.assign(new Error('Job not found'), { statusCode: 404 })),
    buildSyntheticBatch: vi.fn().mockResolvedValue({ batches: [], shortfall_reported: {} }),
    activateModel: vi.fn().mockResolvedValue({ message: 'Model activated' }),
    startTraining: vi.fn().mockResolvedValue({ job_id: 'mock-job-1', status: 'queued' }),
    listModels: vi.fn().mockResolvedValue({ models: [], total: 0 }),
    listTrainingJobs: vi.fn().mockResolvedValue([]),
    cancelTraining: vi.fn().mockResolvedValue(undefined),
    registerReference: vi.fn().mockResolvedValue({ added: true, reason: 'added' }),
    computePhash: vi.fn().mockResolvedValue({ content_hash: 'hash-default', phash: 'phash-default' }),
    generateEmbeddingFromBuffer: vi.fn().mockResolvedValue(new Array(512).fill(0.1)),
    outlierAudit: vi.fn().mockResolvedValue({ t3777_code: 'X', centroid_size: 0, threshold: 0, results: [] }),
    outlierAuditLibrary: vi.fn().mockResolvedValue({ t3777_code: 'X', centroid_size: 0, results: [] }),
    regressionEval: vi.fn().mockResolvedValue({
      precision: 1,
      total: 0,
      correct: 0,
      per_class: {},
      samples: [],
    }),
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

// Mock Socket.IO manager (Epic 9 — broadcastAll used by trigger.ts, quality-gate.ts)
vi.mock('../services/socket-io-manager', () => {
  const mockManager = {
    broadcastAll: vi.fn(),
    notifyTrainingStarted: vi.fn(),
    sendTrainingUpdate: vi.fn(),
    notifyFeedbackReceived: vi.fn(),
    notifyRetrainingTriggered: vi.fn(),
    notifyTrainingCompleted: vi.fn(),
    notifyTrainingFailed: vi.fn(),
    sendRecognitionUpdate: vi.fn(),
    isInitialized: vi.fn(() => true),
    getClientCount: vi.fn(() => 0),
  };
  return {
    socketIOManager: mockManager,
    default: mockManager,
  };
});

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

// Mock BullMQ (Epic 9) — prevents Redis connection attempts during unit tests
vi.mock('bullmq', () => {
  const mockJob = {
    id: 'job-failed-1',
    state: 'failed',
    failedReason: 'Mock failure reason',
    retryable: true,
    progress: 0,
    data: {},
    getState: vi.fn().mockResolvedValue('failed'),
  };

  const Queue = vi.fn().mockImplementation(() => ({
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    },
    add: vi.fn().mockResolvedValue(mockJob),
    // Story 13.4: modern Job Schedulers API (BullMQ 5.63) — not the deprecated
    // repeat: { pattern }. Registers repeatable jobs idempotently.
    upsertJobScheduler: vi.fn().mockResolvedValue(mockJob),
    getJob: vi.fn().mockImplementation((id: string) => {
      if (id === 'job-failed-1') return Promise.resolve({ ...mockJob, id });
      return Promise.resolve(null);
    }),
    close: vi.fn().mockResolvedValue(undefined),
    addBulk: vi.fn(),
    getJobs: vi.fn().mockResolvedValue([]),
    obliterate: vi.fn(),
  }));

  const QueueEvents = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  }));

  const Worker = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
    run: vi.fn(),
  }));

  const FlowProducer = vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ job: { id: 'flow-1' } }),
    close: vi.fn(),
  }));

  return { Queue, QueueEvents, Worker, FlowProducer };
});

// Mock ioredis (Epic 9) — prevents Redis connection attempts during unit tests
vi.mock('ioredis', () => {
  const Redis = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
  }));
  return { default: Redis };
});
