/**
 * Logo Recognition Domain Types
 * Comprehensive type definitions for logo recognition system
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogoDetection {
  id: string;
  brandName: string;
  confidence: number;
  boundingBox: BoundingBox;
  metadata?: {
    color?: string;
    category?: string;
    tags?: string[];
  };
}

export interface RecognitionResult {
  id: string;
  imageUrl: string;
  detections: LogoDetection[];
  processedAt: string;
  processingTime: number;
  status: RecognitionStatus;
  error?: string;
}

export enum RecognitionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  status: UploadStatus;
  error?: string;
}

export enum UploadStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  aspectRatio: number;
}

export interface RecognitionRequest {
  image: File | Blob;
  options?: RecognitionOptions;
}

export interface RecognitionOptions {
  minConfidence?: number;
  maxResults?: number;
  regions?: BoundingBox[];
}

export interface ExportFormat {
  type: 'json' | 'csv' | 'pdf';
  options?: ExportOptions;
}

export interface ExportOptions {
  includeMetadata?: boolean;
  includeImages?: boolean;
  dateFormat?: string;
}

export interface FilterOptions {
  minConfidence?: number;
  maxConfidence?: number;
  brands?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface SortOptions {
  field: 'confidence' | 'date' | 'brand';
  direction: 'asc' | 'desc';
}