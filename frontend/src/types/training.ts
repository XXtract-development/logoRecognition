// Training Job Types for US-014

export interface TrainingJobRequest {
  datasetVersionId: string;  // From US-013 dataset version
  modelName: string;
  augmentationFactor: 10 | 25 | 50 | 75 | 100;
  targetCategories: string[];
  notes?: string;
  notifications: {
    email: boolean;
    slackWebhookUrl?: string;
  };
  accuracyThreshold?: number;  // Default: 0.8
}

export interface TrainingJobResponse {
  jobId: string;
  estimatedDuration: number;  // minutes
  gpuRequired: string;        // e.g., "8GB"
  queuePosition: number;
  createdAt: string;
}

export interface TrainingJobStatus {
  jobId: string;
  datasetVersionId: string;  // Link back to US-013
  status: 'queued' | 'preparing' | 'augmenting' | 'training' | 'validating' | 'completed' | 'failed';
  progress: number;          // Overall 0-100
  phaseProgress: {
    queue: number;
    augmentation: number;
    training: number;
    validation: number;
  };
  currentEpoch?: number;
  totalEpochs?: number;
  metrics?: {
    accuracy: number[];      // Per epoch
    loss: number[];
    precision: number[];
    recall: number[];
    f1Score: number[];
  };
  resources?: {
    gpuMemory: number;       // GB
    gpuTemp: number;         // Celsius
    cpuPercent: number;
  };
  logs: TrainingLog[];
  eta?: string;              // ISO duration
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface TrainingLog {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface TrainingSummary {
  jobId: string;
  datasetVersion: {
    id: string;
    totalLogos: number;
    categories: string[];
  };
  finalMetrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    confusionMatrix: number[][];
    perCategoryMetrics: Record<string, {
      accuracy: number;
      precision: number;
      recall: number;
    }>;
  };
  artifacts: {
    modelPath: string;        // S3 URL
    embeddingsPath: string;   // S3 URL
    reportPdf: string;        // S3 URL
    reportJson: string;       // S3 URL
  };
  duration: number;           // minutes
  resourcesUsed: {
    peakGpuMemory: number;
    totalGpuHours: number;
    augmentedSamples: number;
  };
}

// Dataset types (from US-013 dependencies)
export interface DatasetVersion {
  id: string;
  version: string;
  status: 'draft' | 'final';
  totalLogos: number;
  categories: string[];
  checksum: string;
  validationErrors: string[];
  createdAt: string;
  createdBy: string;
}

export interface DatasetMetadata {
  id: string;
  status: 'draft' | 'final';
  totalLogos: number;
  categories: string[];
  validationErrors: string[];
}