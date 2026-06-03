/**
 * Training Types
 * Types for image management, annotations, categories and training
 */

// Image Management Types
export interface TrainingImage {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  uploadedAt: Date;
  annotationStatus: 'none' | 'partial' | 'complete';
  categoryId?: string;
  categoryName?: string;
  annotationCount: number;
  /** Part of the protected holdout evaluation set (Epic 7, Story 7.1). */
  holdout?: boolean;
}

export interface ImageUploadResult {
  success: boolean;
  image?: TrainingImage;
  error?: string;
}

export interface BatchUploadProgress {
  total: number;
  completed: number;
  failed: number;
  current?: string;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  color: string;
  imageCount: number;
  children?: Category[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryFormData {
  name: string;
  description?: string;
  parentId?: string;
  color: string;
}

// Annotation Types
export interface Annotation {
  id: string;
  imageId: string;
  categoryId: string;
  categoryName: string;
  type: 'bounding_box' | 'polygon';
  // Normalized coordinates (0-1)
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // For polygon type
  polygon?: Array<{ x: number; y: number }>;
  confidence?: number;
  createdAt: Date;
  createdBy: string;
  validated: boolean;
  validatedAt?: Date;
  validatedBy?: string;
}

export interface AnnotationFormData {
  categoryId: string;
  type: 'bounding_box' | 'polygon';
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  polygon?: Array<{ x: number; y: number }>;
}

// Smart Detection Types
export interface SmartDetectionResult {
  success: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence?: number;
  error?: string;
}

// Training Job Types
export interface TrainingConfig {
  name: string;
  categoryIds: string[];
  epochs: number;
  batchSize: number;
  learningRate: number;
  augmentationFactor: number;
  validationSplit: number;
  minAnnotationsPerCategory: number;
}

export interface TrainingJob {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: TrainingConfig;
  progress: TrainingProgress;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  modelVersionId?: string;
}

export interface TrainingProgress {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy: number;
  validationLoss: number;
  validationAccuracy: number;
  samplesProcessed: number;
  totalSamples: number;
  etaSeconds: number;
  currentLearningRate: number;
}

export interface TrainingMetrics {
  accuracy: number;
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1Score: Record<string, number>;
  confusionMatrix: number[][];
  categoryLabels: string[];
  trainingLossCurve: number[];
  validationLossCurve: number[];
}

// Model Types
/** Holdout-evaluation metrics for a model version (Epic 7, Story 7.2). */
export interface HoldoutMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  holdoutSize: number;
  holdoutHash: string | null;
}

export interface ModelVersion {
  id: string;
  version: number;
  name: string;
  status: 'training' | 'active' | 'inactive' | 'failed';
  accuracy: number;
  size: number; // in bytes
  trainingJobId: string;
  metrics?: TrainingMetrics;
  /** Holdout-evaluation metrics, distinct from train/val metrics (Story 7.2). */
  holdoutMetrics?: HoldoutMetrics | null;
  createdAt: Date;
  activatedAt?: Date;
  deactivatedAt?: Date;
}

export interface ModelComparison {
  model1: ModelVersion;
  model2: ModelVersion;
  accuracyDiff: number;
  categoryAccuracyDiff: Record<string, number>;
  speedDiff: number;
  recommendation: 'model1' | 'model2' | 'equal';
  reason: string;
}

// Review Types
export interface ReviewItem {
  id: string;
  image: TrainingImage;
  annotations: Annotation[];
  status: 'pending' | 'approved' | 'needs_correction';
  reviewedAt?: Date;
  reviewedBy?: string;
  notes?: string;
}

// Filter and Sort Types
export interface ImageFilters {
  status?: 'none' | 'partial' | 'complete';
  categoryId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface ImageSort {
  field: 'uploadedAt' | 'filename' | 'annotationStatus' | 'size';
  order: 'asc' | 'desc';
}

export type ViewMode = 'grid' | 'list';
