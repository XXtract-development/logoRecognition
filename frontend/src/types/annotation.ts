export type AnnotationType = 'boundingBox' | 'polygon' | 'point';

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  imageId: string;
  datasetId?: string;

  // Common properties
  category: string;
  value: string;
  confidence?: number;
  color?: string;
  tags?: string[];
  metadata?: Record<string, any>;

  // Bounding box properties
  x?: number;
  y?: number;
  width?: number;
  height?: number;

  // Polygon properties
  points?: Point[];

  // Timestamps
  created: Date;
  updated: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface AnnotationHistory {
  id: string;
  annotationId: string;
  action: 'create' | 'update' | 'delete';
  changes: Partial<Annotation>;
  userId: string;
  timestamp: Date;
}

export interface ConflictResolution {
  type: 'auto' | 'manual';
  strategy: 'merge' | 'replace' | 'reject';
  resolvedBy?: string;
  resolvedAt?: Date;
}

export interface AnnotationConflict {
  id: string;
  annotationId: string;
  conflictingAnnotationId: string;
  iou: number;
  resolution?: ConflictResolution;
}