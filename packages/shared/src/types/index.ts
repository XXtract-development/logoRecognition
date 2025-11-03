export interface RecognitionResult {
  requestId: string;
  detections: Detection[];
  processingTime: number;
  imageMetadata: ImageMetadata;
  timestamp: string;
}

export interface Detection {
  brand: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

export interface User {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}
