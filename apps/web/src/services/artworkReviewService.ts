/**
 * Artwork Review Service (Epic 8, Story 8.5 — AC3)
 *
 * API calls for the artwork review queue: open review items produced by the
 * T3777 crosscheck, plus the accept/reject/catch-up actions that push approved
 * crops into training data (provenance flow, Story 8.6).
 *
 * Mutating actions require the ADMIN role server-side; the UI hides/disables
 * them for non-admins (see useCurrentUser).
 */
import apiClient from './apiClient';

/** Bounding box of a detected crop within its source artwork file. */
export interface ReviewItemBbox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/** An open artwork review item awaiting human judgement. */
export interface ArtworkReviewItem {
  id: string;
  gtin: string;
  t3777Code: string;
  cropPath: string | null;
  bbox: ReviewItemBbox;
  confidence: number | null;
  /** Detection method (template/embedding/classifier); may be absent. */
  method: string | null;
  /** Discrepancy reason — why this item needs review. */
  reason: string;
  /** Source artwork filename (provenance). */
  sourceFile: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptResult {
  status: string;
  registered: number;
  skipped: number;
}

export interface ProcessAcceptedResult {
  processed: number;
  registered: number;
  skipped: number;
}

/** Fetch all open artwork review items (newest first, server-ordered). */
export const fetchReviewQueue = async (
  params?: { q?: string; take?: number }
): Promise<ArtworkReviewItem[]> => {
  const response = await apiClient.get('/artwork/review-queue', { params });
  return response.data?.data ?? [];
};

/**
 * On-view presigned URL for a single item's crop. Returns null when the item
 * has no crop (the UI then renders an empty-preview state). Called lazily when
 * an item is opened, never eagerly for the whole queue.
 */
export const fetchReviewItemCropUrl = async (id: string): Promise<string | null> => {
  const response = await apiClient.get(`/artwork/review-items/${id}/crop-url`);
  return response.data?.cropUrl ?? null;
};

/**
 * Reopen a previously accepted/rejected item (set back to 'open'); deactivates
 * any training-data row created from its crop. Used by the mobile deck's undo /
 * change-decision controls.
 */
export const reopenReviewItem = async (
  id: string
): Promise<{ status: string; deactivatedTrainingData: number }> => {
  const response = await apiClient.patch(`/artwork/review-items/${id}/reopen`);
  return response.data;
};

/**
 * Fetch the crop as an authenticated blob and return an object URL. Loading the
 * bytes through apiClient (cookie auth + correct baseURL) guarantees the image
 * renders regardless of how an <img> would handle auth/origin. The caller is
 * responsible for URL.revokeObjectURL when the URL is no longer needed.
 */
export const fetchReviewItemCropBlob = async (id: string): Promise<string | null> => {
  const response = await apiClient.get(`/artwork/review-items/${id}/crop`, {
    responseType: 'blob',
  });
  return response.data ? URL.createObjectURL(response.data as Blob) : null;
};

/** Accept an item → push to training-data registration (ADMIN). */
export const acceptReviewItem = async (
  id: string,
  t3777Code?: string
): Promise<AcceptResult> => {
  const response = await apiClient.patch(
    `/artwork/review-items/${id}/accept`,
    t3777Code ? { t3777Code } : {}
  );
  return response.data;
};

/** Reject an item (no training data created; not deleted) (ADMIN). */
export const rejectReviewItem = async (id: string): Promise<{ status: string }> => {
  const response = await apiClient.patch(`/artwork/review-items/${id}/reject`);
  return response.data;
};

/** Catch-up: register all previously-accepted items that still carry crops (ADMIN). */
export const processAcceptedReviewItems = async (): Promise<ProcessAcceptedResult> => {
  const response = await apiClient.post('/artwork/review-items/process-accepted');
  return response.data;
};

/**
 * An uncertain recognition prediction awaiting feedback (the pre-existing
 * uncertainty queue, GET /feedback/uncertain). Shown read-only in the same
 * review page so reviewers see BOTH sources in one place (Story 8.5 Task 2 —
 * UI merge), each with a source label. Its shape differs from artwork review
 * items (no crop/source file — these are recognition-time predictions).
 */
export interface UncertainPrediction {
  resultId: string;
  logId: string;
  requestId: string;
  imageHash: string;
  prediction: {
    category: string;
    value: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  };
  logo: { id: string; name?: string } | null;
  createdAt: string;
}

/** Fetch uncertain recognition predictions (read-only feedback queue). */
export const fetchUncertainPredictions = async (
  limit = 20
): Promise<UncertainPrediction[]> => {
  const response = await apiClient.get('/feedback/uncertain', { params: { limit } });
  return response.data?.data ?? [];
};
