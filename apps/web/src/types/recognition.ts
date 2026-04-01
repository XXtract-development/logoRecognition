export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecognitionResult {
  id: string;
  logoName: string;
  confidence: number;
  category?: string;
  boundingBox?: BoundingBox;
  metadata?: Record<string, unknown>;
}

export interface UploadedImage {
  id: string;
  file: File;
  dataUrl: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
}

export interface RecognitionRequest {
  imageId: string;
  imageData: string;
  options?: RecognitionOptions;
}

export interface RecognitionOptions {
  detectMultiple?: boolean;
  minConfidence?: number;
  maxResults?: number;
}

export interface RecognitionResponse {
  type: 'recognition_progress' | 'recognition_complete' | 'recognition_error';
  progress?: number;
  results?: RecognitionResult[];
  error?: string;
}

export type ExportFormat = 'json' | 'csv' | 'xml';
