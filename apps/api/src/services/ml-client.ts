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

// Synthetic training-data generation (Epic 8, Story 8.7)
export interface SynthesizedSample {
  t3777_code: string;
  crop_path: string; // MinIO key synthetic/{t3777Code}/{seed}.png
  source_file: string; // background object key (provenance.sourceFile)
  bbox: { x: number; y: number; width: number; height: number };
  method: string; // always 'synthetic'
  confidence: number;
  seed: number;
}

export interface SynthesizeResponse {
  t3777_code: string;
  generated: number;
  samples: SynthesizedSample[];
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

  /**
   * Generate synthetic training composites for one keurmerk class (Story 8.7).
   *
   * The ML service loads the active reference variants + real cached artwork
   * backgrounds, composes `count` deterministic samples (scale/rotation/HSV/
   * blur via a seeded RandomState), writes each PNG to MinIO under
   * `synthetic/{t3777Code}/{seed}.png`, and returns crop descriptors. The caller
   * registers these through the 8.6 registration path (no second write path).
   *
   * Returns `generated: 0` with an empty `samples` list when no usable
   * references/backgrounds exist (open-input gate) — not an error.
   */
  async synthesizeArtwork(
    t3777Code: string,
    count: number,
    seed?: number
  ): Promise<SynthesizeResponse> {
    try {
      const response = await this.client.post<SynthesizeResponse>('/ml/artwork/synthesize', {
        t3777_code: t3777Code,
        count,
        ...(seed !== undefined ? { seed } : {}),
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Artwork synthesis failed');
    }
  }

  /**
   * Localize certification marks on an artwork image (Story 8.3/8.3R, called
   * server-side by the detection worker — Story 8-3O).
   *
   * `templates` is OPTIONAL (8-3O decision 2): when omitted the ML service loads
   * the active reference library itself (TTL-cached). Callers that supply
   * templates (meet-scripts, tests) keep the existing behaviour. Returns the
   * detections with absolute bbox coordinates + per-detection threshold.
   */
  async localizeArtwork(request: {
    storage_path?: string;
    image_b64?: string;
    templates?: Array<{ t3777_code: string; image_b64: string }>;
  }): Promise<{ detections: Array<Record<string, unknown>>; truncated: boolean }> {
    try {
      const response = await this.client.post<{
        detections: Array<Record<string, unknown>>;
        truncated: boolean;
      }>('/ml/artwork/localize', request);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Artwork localization failed');
    }
  }

  /**
   * Classify localised regions to T3777 keurmerk codes (Story 8.4, called
   * server-side by the detection worker — Story 8-3O).
   *
   * `gtin` + `persist_crops` are the 8-3O extension (decision 3): with
   * persist_crops=true the ML service writes each crop to MinIO under
   * artwork-crops/{gtin}/{sha1(...)} and returns `crop_path` per result, which
   * the registration path (8.6) requires. Existing callers omit both fields and
   * are unaffected.
   */
  async classifyArtwork(request: {
    storage_path?: string;
    image_b64?: string;
    crops?: Array<{ x: number; y: number; width: number; height: number }>;
    confidence_threshold?: number;
    gtin?: string;
    persist_crops?: boolean;
  }): Promise<{
    results: Array<{
      bbox?: { x: number; y: number; width: number; height: number } | null;
      t3777_code: string;
      confidence: number;
      method: string;
      uncertain?: boolean;
      crop_path?: string | null;
    }>;
  }> {
    try {
      const response = await this.client.post('/ml/artwork/classify', request);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Artwork classification failed');
    }
  }

  /**
   * Ask the ML service to drop its cached reference-template library (Story
   * 8-3O decision 2). Best-effort: called by the Node side after reference
   * library mutations so the next localize picks up the change without waiting
   * for the TTL to expire.
   */
  async reloadTemplates(): Promise<void> {
    try {
      await this.client.post('/ml/artwork/reload-templates');
    } catch (error) {
      throw this.handleError(error, 'Reload templates failed');
    }
  }

  /**
   * Rebuild the reference keurmerk embedding index (Story 12.1). Unlike
   * reloadTemplates (which only busts the localize template cache), this
   * regenerates the pgvector reference embeddings so newly seeded codes become
   * *classifiable* without an ML-service restart. Call after bulk-seeding the
   * reference library, before reloadTemplates. Returns the ML rebuild summary.
   */
  async rebuildReferenceEmbeddings(): Promise<Record<string, unknown>> {
    try {
      const res = await this.client.post('/ml/artwork/rebuild-reference-embeddings');
      return res.data as Record<string, unknown>;
    } catch (error) {
      throw this.handleError(error, 'Rebuild reference embeddings failed');
    }
  }

  /**
   * Register a human-confirmed review crop as a live reference embedding
   * (Story 12.3 — review→reference loop). Idempotent + near-duplicate-guarded
   * on the ML side. Returns the service result; the caller treats it as
   * best-effort (a failure must not fail the accept).
   */
  async registerReference(
    cropPath: string,
    t3777Code: string
  ): Promise<{ added: boolean; reason: string; reference_logo_id?: string }> {
    const res = await this.client.post('/ml/artwork/register-reference', {
      crop_path: cropPath,
      t3777_code: t3777Code,
    });
    return res.data as { added: boolean; reason: string; reference_logo_id?: string };
  }

  /**
   * Compute the canonical content-hash + perceptual hash (pHash) for a crop
   * (Story 13.1, AD-14). This is the ONLY route by which Node obtains a crop
   * content-hash — the API never computes an image content-hash itself and there
   * is no Node fallback (fail-closed: if the ml-service is unreachable the caller
   * must refuse, not invent a hash).
   *
   * NOTE — distinct from `ArtworkImport.sha256Hash`: that hashes the raw source
   * *file bytes* (a different key, AD-12) and stays untouched. The content-hash
   * here is SHA-256 over the *normalized pixel buffer* (RGB, pinned N×N resize),
   * the single key for nomination-uniqueness and hard-negatives (13.2/13.4/14.1).
   *
   * @param cropPath  MinIO object key of the crop
   * @returns `{ content_hash, phash }`
   */
  async computePhash(
    cropPath: string
  ): Promise<{ content_hash: string; phash: string }> {
    const res = await this.client.post('/ml/phash', {
      crop_path: cropPath,
    });
    return res.data as { content_hash: string; phash: string };
  }

  // ==========================================
  // Synthetic batch fill (Epic 9, Story 9.3 — wiring of deferred 8.7 hook)
  // ==========================================

  /**
   * Request a synthetic batch plan from the ML service.
   *
   * The ML service's `build_synthetic_batch` function evaluates under-represented
   * classes and returns crop descriptors + shortfall entries.
   * Ratio cap wins over min_per_class (conflict-resolution decision 2026-06-04).
   *
   * @param opts.minPerClass  minimum samples per class before synthetic fill kicks in
   * @param opts.ratio        maximum synthetic-to-real ratio (cap)
   */
  async buildSyntheticBatch(opts: {
    minPerClass: number;
    ratio: number;
  }): Promise<{ batches: unknown[]; shortfall_reported: Record<string, number> }> {
    try {
      const response = await this.client.post('/ml/pipeline/build-synthetic-batch', {
        min_per_class: opts.minPerClass,
        real_synthetic_ratio: opts.ratio,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Build synthetic batch failed');
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
