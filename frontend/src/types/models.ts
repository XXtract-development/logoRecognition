// Model Registry Types for US-015

export interface ModelVersion {
  id: string;
  name: string;
  version: string;
  status: 'candidate' | 'active' | 'deprecated' | 'failed';
  trainingJobId: string;        // Reference to US-014
  datasetVersionId: string;     // Reference to US-013
  modelPath: string;             // S3 path
  embeddingsPath: string;        // S3 path
  format: 'sklearn' | 'onnx' | 'tensorflow' | 'pytorch';

  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    support: number;
    confusionMatrix: number[][];
    perCategoryMetrics: Record<string, {
      accuracy: number;
      precision: number;
      recall: number;
    }>;
  };

  metadata: {
    categories: string[];
    inputShape: [number, number, number];  // [height, width, channels]
    preprocessingConfig: {
      normalization: 'standard' | 'minmax' | 'none';
      resizeMode: 'stretch' | 'pad' | 'crop';
    };
  };

  createdAt: string;
  createdBy: string;
  promotedAt?: string;
  promotedBy?: string;
  deprecatedAt?: string;
  deprecatedReason?: string;
}

export interface SmokeTestConfiguration {
  id: string;
  name: string;
  referenceImages: {
    imageId: string;
    imagePath: string;
    expectedDetections: DetectionResult[];
    minAccuracy: number;
  }[];
  passThreshold: number;  // e.g., 0.8 = 80% of tests must pass
}

export interface SmokeTestRun {
  id: string;
  modelId: string;
  configurationId: string;
  status: 'running' | 'passed' | 'failed' | 'timeout';
  startedAt: string;
  completedAt?: string;

  results: {
    imageId: string;
    passed: boolean;
    detections: DetectionResult[];
    expectedDetections: DetectionResult[];
    metrics: {
      precision: number;
      recall: number;
      iou: number;  // Intersection over Union
    };
    executionTime: number;  // ms
  }[];

  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    avgExecutionTime: number;
    overallAccuracy: number;
  };
}

export interface ModelActivation {
  id: string;
  modelId: string;
  previousModelId?: string;
  activatedBy: string;
  activatedAt: string;
  releaseNotes: string;
  smokeTestRunId: string;

  rollback?: {
    triggeredAt: string;
    reason: 'smoke_test_failed' | 'manual' | 'performance_degradation';
    rollbackToModelId: string;
  };
}

export interface DetectionResult {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  categoryId: string;
  valueId: string;
  confidence: number;
  processingTime?: number;
}

export interface ModelFilters {
  status: ModelVersion['status'] | 'all';
  datasetVersion: string | null;
  minAccuracy: number | null;
}