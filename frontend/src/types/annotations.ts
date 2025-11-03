export type AnnotationStatus = 'draft' | 'final';

export type ConflictResolutionOption = 'merge' | 'keep_new' | 'discard_new' | 'keep_both';

export interface AnnotationBox {
  id: string;
  imageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category: string;
  value: string;
  categoryId?: string;
  valueId?: string;
  confidence?: number;
  tags: string[];
  metadata: Record<string, string>;
  created?: string;
  updated?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface AnnotationSubmission {
  datasetId: string;
  userId: string;
  annotations: AnnotationBox[];
  status: AnnotationStatus;
  baseVersionId?: string;
  conflictResolutions?: Record<string, ConflictResolutionOption>;
  tags?: string[];
  featureFlagSnapshot?: Record<string, boolean>;
}

export interface AnnotationDiffSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

export interface AnnotationConflict {
  conflictId: string;
  reason: string;
  overlapRatio: number;
  existingAnnotation: AnnotationBox;
  incomingAnnotation: AnnotationBox;
}

export interface AnnotationSaveResponse {
  status: 'saved' | 'draft' | 'conflict' | 'noop';
  datasetVersionId?: string;
  versionNumber?: number;
  checksum?: string;
  totalAnnotations: number;
  totalImages: number;
  diff: AnnotationDiffSummary;
  conflicts: AnnotationConflict[];
  savedAt: string;
  message?: string;
}

export interface AnnotationSummary {
  datasetVersionId: string;
  versionNumber: number;
  status: AnnotationStatus;
  totalAnnotations: number;
  totalImages: number;
  checksum: string;
  createdAt: string;
  createdBy: string;
  tags: string[];
  added: number;
  updated: number;
  removed: number;
}

