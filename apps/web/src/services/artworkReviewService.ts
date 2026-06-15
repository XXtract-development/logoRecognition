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
 * On-view media URLs for a single item. `cropUrl` is the detected crop (null
 * when the item has no crop). `artworkUrl` is the full-artwork fallback for
 * crop-less "declared but not found" items, resolved by GTIN, so the reviewer
 * can still hunt for the declared keurmerk on the whole pack. Called lazily
 * when an item is opened, never eagerly for the whole queue.
 */
export const fetchReviewItemCropUrl = async (
  id: string
): Promise<{ cropUrl: string | null; artworkUrl: string | null }> => {
  const response = await apiClient.get(`/artwork/review-items/${id}/crop-url`);
  return {
    cropUrl: response.data?.cropUrl ?? null,
    artworkUrl: response.data?.artworkUrl ?? null,
  };
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

/**
 * Fetch the full (downscaled) artwork for the item's GTIN as an authenticated
 * blob URL — the fallback shown when an item has no crop ("declared but not
 * found"). Returns null when no artwork is stored for the GTIN. The caller
 * revokes the object URL when done.
 */
export const fetchReviewItemArtworkBlob = async (id: string): Promise<string | null> => {
  try {
    const response = await apiClient.get(`/artwork/review-items/${id}/artwork`, {
      responseType: 'blob',
    });
    return response.data ? URL.createObjectURL(response.data as Blob) : null;
  } catch {
    return null;
  }
};

/** A GS1 mark declared on the GTIN's packaging (Story 12.7 label-prior). */
export interface DeclaredMark {
  code: string;
  /** GS1 codelist name (= reference_logos.fieldType), e.g. DietTypeCode. */
  fieldType: string;
}

export interface DeclaredMarksResult {
  gtin: string;
  marks: DeclaredMark[];
  /** Distinct fail-safe reason: 'ok' | 'lege-declaratie' | 'gln-ontbreekt' | … */
  reason: string;
}

/**
 * Fetch the GTIN's declared GS1 marks (Story 12.7). Lazy/on-view, like the crop
 * URL. Fail-safe: returns marks=[] with a reason on any miss (never throws on a
 * 200). The deck uses it to pin/flag a detection against the declaration.
 */
export const fetchDeclaredMarks = async (gtin: string): Promise<DeclaredMarksResult> => {
  try {
    const response = await apiClient.get(`/artwork/declared-marks/${encodeURIComponent(gtin)}`);
    return {
      gtin,
      marks: response.data?.marks ?? [],
      reason: response.data?.reason ?? 'onbekend',
    };
  } catch {
    // Network/HTTP error → behave like an empty prior (graceful fallback).
    return { gtin, marks: [], reason: 'fetch-fout' };
  }
};

/**
 * Fetch the FULL source artwork as an authenticated blob (object URL). The deck
 * overlays the item's bbox on this so partial/tight crops stay interpretable
 * ("bekijk in context"). Caller revokes the URL when done.
 */
export const fetchReviewItemSourceBlob = async (id: string): Promise<string | null> => {
  try {
    const response = await apiClient.get(`/artwork/review-items/${id}/source`, {
      responseType: 'blob',
    });
    return response.data ? URL.createObjectURL(response.data as Blob) : null;
  } catch {
    return null;
  }
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
