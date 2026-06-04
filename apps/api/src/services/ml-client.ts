/**
 * ML Service Client
 * Handles communication between API Gateway (Fastify) and ML Service (FastAPI)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../core/logger';

// ============================================
// Types
// ============================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  category: string;
  value: string;
  confidence: number;
  bbox: BoundingBox;
  embedding?: number[];
}

export interface DetectionRequest {
  image: string; // base64 encoded
  confidence_threshold?: number;
  return_embeddings?: boolean;
}

export interface DetectionResponse {
  request_id: string;
  detections: Detection[];
  processing_time_ms: number;
  image_hash: string;
  model_version: string;
}

export interface EmbeddingRequest {
  image: string; // base64 encoded
}

export interface EmbeddingResponse {
  embedding: number[];
  dimension: number;
  processing_time_ms: number;
}

export interface TrainingConfig {
  batch_size?: number;
  epochs?: number;
  learning_rate?: number;
  augmentation_factor?: number;
  validation_split?: number;
  early_stopping_patience?: number;
}

export interface TrainingRequest {
  batch_id: string;
  config?: TrainingConfig;
  model_name?: string;
}

export interface TrainingJob {
  job_id: string;
  batch_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_epoch?: number;
  total_epochs?: number;
  current_accuracy?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface ModelInfo {
  id: string;
  version: string;
  model_type: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  training_samples: number;
  is_active: boolean;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
  models_loaded: boolean;
  gpu_available: boolean;
}

// Artwork rasterization (Epic 8, Story 8.2)
export interface RasterizedPage {
  source_file: string;
  page: number;
  image_path: string; // MinIO object key of the page PNG
  dpi: number;
}

export interface RasterizeResponse {
  storage_path: string;
  dpi: number;
  pages: RasterizedPage[];
  error?: string | null;
}

// ============================================
// ML Client Class
// ============================================

export class MLClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.ML_SERVICE_URL || 'http://localhost:8011';

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000, // 2 minutes for long operations
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('ML Service request', {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error('ML Service request error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('ML Service response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error('ML Service response error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  // ==========================================
  // Health Check
  // ==========================================

  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await this.client.get<HealthStatus>('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Health check failed');
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.status === 'healthy' && health.models_loaded;
    } catch {
      return false;
    }
  }

  // ==========================================
  // Detection
  // ==========================================

  async detectLogos(request: DetectionRequest): Promise<DetectionResponse> {
    try {
      const response = await this.client.post<DetectionResponse>('/ml/detect', request);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Logo detection failed');
    }
  }

  async detectLogosFromBuffer(
    imageBuffer: Buffer,
    options: { confidenceThreshold?: number; returnEmbeddings?: boolean } = {}
  ): Promise<DetectionResponse> {
    const base64Image = imageBuffer.toString('base64');

    return this.detectLogos({
      image: base64Image,
      confidence_threshold: options.confidenceThreshold ?? 0.99,
      return_embeddings: options.returnEmbeddings ?? false,
    });
  }

  // ==========================================
  // Embeddings
  // ==========================================

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      const response = await this.client.post<EmbeddingResponse>('/ml/embed', request);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Embedding generation failed');
    }
  }

  async generateEmbeddingFromBuffer(imageBuffer: Buffer): Promise<number[]> {
    const base64Image = imageBuffer.toString('base64');
    const response = await this.generateEmbedding({ image: base64Image });
    return response.embedding;
  }

  // ==========================================
  // Training
  // ==========================================

  async startTraining(request: TrainingRequest): Promise<TrainingJob> {
    try {
      const response = await this.client.post<TrainingJob>('/ml/train', request);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Training start failed');
    }
  }

  async getTrainingStatus(jobId: string): Promise<TrainingJob> {
    try {
      const response = await this.client.get<TrainingJob>(`/ml/train/${jobId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Get training status failed');
    }
  }

  async listTrainingJobs(status?: string, limit = 10): Promise<TrainingJob[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      params.append('limit', limit.toString());

      const response = await this.client.get<TrainingJob[]>(`/ml/train?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'List training jobs failed');
    }
  }

  async cancelTraining(jobId: string): Promise<void> {
    try {
      await this.client.delete(`/ml/train/${jobId}`);
    } catch (error) {
      throw this.handleError(error, 'Cancel training failed');
    }
  }

  // ==========================================
  // Artwork (Epic 8, Story 8.2)
  // ==========================================

  /**
   * Rasterize a cached PDF artwork to per-page PNGs (Story 8.2, FR45).
   * The ML service downloads the PDF from the training bucket, rasterizes each
   * page at `dpi`, uploads the page PNGs next to the source, and returns the
   * page list with MinIO object keys.
   *
   * A corrupt/protected PDF yields an empty `pages` list with an `error` reason
   * (HTTP 200) — the caller records this softly without failing the import.
   */
  async rasterizeArtwork(storagePath: string, dpi?: number): Promise<RasterizeResponse> {
    try {
      const response = await this.client.post<RasterizeResponse>('/ml/artwork/rasterize', {
        storage_path: storagePath,
        ...(dpi !== undefined ? { dpi } : {}),
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Artwork rasterization failed');
    }
  }

  // ==========================================
  // Models
  // ==========================================

  async listModels(): Promise<{ models: ModelInfo[]; active_model?: string }> {
    try {
      const response = await this.client.get('/ml/models');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'List models failed');
    }
  }

  async getModel(modelId: string): Promise<ModelInfo> {
    try {
      const response = await this.client.get<ModelInfo>(`/ml/models/${modelId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Get model failed');
    }
  }

  async activateModel(modelId: string): Promise<void> {
    try {
      await this.client.post(`/ml/models/${modelId}/activate`);
    } catch (error) {
      throw this.handleError(error, 'Activate model failed');
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    try {
      await this.client.delete(`/ml/models/${modelId}`);
    } catch (error) {
      throw this.handleError(error, 'Delete model failed');
    }
  }

  async reloadModels(): Promise<void> {
    try {
      await this.client.post('/ml/models/reload');
    } catch (error) {
      throw this.handleError(error, 'Reload models failed');
    }
  }

  // ==========================================
  // Error Handling
  // ==========================================

  private handleError(error: unknown, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ detail?: string }>;

      if (axiosError.response) {
        const detail = axiosError.response.data?.detail || axiosError.message;
        return new MLServiceError(
          `${message}: ${detail}`,
          axiosError.response.status,
          detail
        );
      }

      if (axiosError.code === 'ECONNREFUSED') {
        return new MLServiceError(
          'ML Service is not available',
          503,
          'Service unavailable'
        );
      }

      if (axiosError.code === 'ETIMEDOUT') {
        return new MLServiceError('ML Service request timed out', 504, 'Timeout');
      }
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}

// ============================================
// Custom Error Class
// ============================================

export class MLServiceError extends Error {
  public statusCode: number;
  public detail: string;

  constructor(message: string, statusCode: number, detail: string) {
    super(message);
    this.name = 'MLServiceError';
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

// ============================================
// Singleton Instance
// ============================================

export const mlClient = new MLClient();

// ============================================
// Export default
// ============================================

export default mlClient;
