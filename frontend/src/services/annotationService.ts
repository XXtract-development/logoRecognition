import { apiClient } from './api';
import {
  AnnotationBox,
  AnnotationConflict,
  AnnotationDiffSummary,
  AnnotationSaveResponse,
  AnnotationSubmission,
  AnnotationSummary,
} from '../types/annotations';

// Export interfaces for store compatibility
export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category?: string;
  value?: string;
  confidence?: number;
}

export interface Annotation {
  id: string;
  image_id: string;
  bbox: BoundingBox;
  label?: string;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AnnotationBatchResult {
  successful: Annotation[];
  failed: Array<{ annotation: any; error: string }>;
  totalTime: number;
}

interface ApiAnnotationBox {
  id: string;
  image_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  category: string;
  value: string;
  category_id?: string;
  value_id?: string;
  confidence?: number;
  tags?: string[];
  metadata?: Record<string, string>;
  created?: string;
  updated?: string;
  image_width?: number;
  image_height?: number;
}

interface ApiAnnotationSubmission {
  dataset_id: string;
  user_id: string;
  annotations: ApiAnnotationBox[];
  status: 'draft' | 'final';
  base_version_id?: string;
  conflict_resolutions?: Record<string, string>;
  tags?: string[];
  feature_flag_snapshot?: Record<string, boolean>;
}

interface ApiAnnotationSaveResponse {
  status: 'saved' | 'draft' | 'conflict' | 'noop';
  dataset_version_id?: string;
  version_number?: number;
  checksum?: string;
  total_annotations: number;
  total_images: number;
  diff: AnnotationDiffSummary;
  conflicts: ApiAnnotationConflict[];
  saved_at: string;
  message?: string;
}

interface ApiAnnotationConflict {
  conflict_id: string;
  reason: string;
  overlap_ratio: number;
  existing_annotation: ApiAnnotationBox;
  incoming_annotation: ApiAnnotationBox;
}

interface ApiAnnotationSummary {
  dataset_version_id: string;
  version_number: number;
  status: 'draft' | 'final';
  total_annotations: number;
  total_images: number;
  checksum: string;
  created_at: string;
  created_by: string;
  tags: string[];
  added: number;
  updated: number;
  removed: number;
}

const mapBoxToApi = (box: AnnotationBox): ApiAnnotationBox => ({
  id: box.id,
  image_id: box.imageId,
  x: box.x,
  y: box.y,
  width: box.width,
  height: box.height,
  category: box.category,
  value: box.value,
  category_id: box.categoryId,
  value_id: box.valueId,
  confidence: box.confidence,
  tags: box.tags,
  metadata: box.metadata,
  created: box.created,
  updated: box.updated,
  image_width: box.imageWidth,
  image_height: box.imageHeight,
});

const mapBoxFromApi = (box: ApiAnnotationBox): AnnotationBox => ({
  id: box.id,
  imageId: box.image_id,
  x: box.x,
  y: box.y,
  width: box.width,
  height: box.height,
  category: box.category,
  value: box.value,
  categoryId: box.category_id,
  valueId: box.value_id,
  confidence: box.confidence,
  tags: box.tags ?? [],
  metadata: box.metadata ?? {},
  created: box.created,
  updated: box.updated,
  imageWidth: box.image_width,
  imageHeight: box.image_height,
});

const mapSubmissionToApi = (submission: AnnotationSubmission): ApiAnnotationSubmission => ({
  dataset_id: submission.datasetId,
  user_id: submission.userId,
  annotations: submission.annotations.map(mapBoxToApi),
  status: submission.status,
  base_version_id: submission.baseVersionId,
  conflict_resolutions: submission.conflictResolutions,
  tags: submission.tags,
  feature_flag_snapshot: submission.featureFlagSnapshot,
});

const mapSaveResponseFromApi = (response: ApiAnnotationSaveResponse): AnnotationSaveResponse => ({
  status: response.status,
  datasetVersionId: response.dataset_version_id,
  versionNumber: response.version_number,
  checksum: response.checksum,
  totalAnnotations: response.total_annotations,
  totalImages: response.total_images,
  diff: response.diff,
  conflicts: response.conflicts.map(mapConflictFromApi),
  savedAt: response.saved_at,
  message: response.message,
});

const mapConflictFromApi = (conflict: ApiAnnotationConflict): AnnotationConflict => ({
  conflictId: conflict.conflict_id,
  reason: conflict.reason,
  overlapRatio: conflict.overlap_ratio,
  existingAnnotation: mapBoxFromApi(conflict.existing_annotation),
  incomingAnnotation: mapBoxFromApi(conflict.incoming_annotation),
});

const mapSummaryFromApi = (summary: ApiAnnotationSummary): AnnotationSummary => ({
  datasetVersionId: summary.dataset_version_id,
  versionNumber: summary.version_number,
  status: summary.status,
  totalAnnotations: summary.total_annotations,
  totalImages: summary.total_images,
  checksum: summary.checksum,
  createdAt: summary.created_at,
  createdBy: summary.created_by,
  tags: summary.tags,
  added: summary.added,
  updated: summary.updated,
  removed: summary.removed,
});

export const annotationService = {
  async saveAnnotations(submission: AnnotationSubmission): Promise<AnnotationSaveResponse> {
    const payload = mapSubmissionToApi(submission);
    const response = await apiClient.post<ApiAnnotationSaveResponse>('/v1/training/annotations', payload);
    return mapSaveResponseFromApi(response);
  },

  async listVersions(datasetId: string): Promise<AnnotationSummary[]> {
    const response = await apiClient.get<ApiAnnotationSummary[]>(`/v1/training/dataset/versions`, {
      params: { dataset_id: datasetId },
    });
    return response.map(mapSummaryFromApi);
  },

  async loadVersion(datasetId: string, versionId: string): Promise<AnnotationBox[]> {
    const response = await apiClient.get<ApiAnnotationBox[]>(
      `/v1/training/dataset/versions/${versionId}`,
      { params: { dataset_id: datasetId } }
    );
    return response.map(mapBoxFromApi);
  },

  async loadAudit(datasetId: string): Promise<Record<string, string>[]> {
    return apiClient.get(`/v1/training/dataset/audit`, {
      params: { dataset_id: datasetId, limit: 5 },
    });
  },
};
