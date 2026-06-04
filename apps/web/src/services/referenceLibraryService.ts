/**
 * Reference Library Service (Epic 7, Story 7.3)
 * API calls for the keurmerk reference library.
 */
import apiClient from './apiClient';

export interface ReferenceLogo {
  id: string;
  t3777Code: string;
  variantLabel: string;
  source: string | null;
  storagePath: string;
  active: boolean;
  logoId: string | null;
  createdAt?: string;
  previewUrl?: string | null;
}

export interface ReferenceLogoUpload {
  t3777Code: string;
  variantLabel: string;
  source?: string;
  file: File;
}

/** Fetch reference variants, optionally filtered by T3777 code. */
export const fetchReferenceLogos = async (code?: string): Promise<ReferenceLogo[]> => {
  const response = await apiClient.get('/reference-logos', {
    params: code ? { code } : undefined,
  });
  return response.data?.data ?? [];
};

/** Upload a new reference variant (multipart/form-data). */
export const uploadReferenceLogo = async (
  input: ReferenceLogoUpload
): Promise<ReferenceLogo> => {
  const formData = new FormData();
  formData.append('t3777Code', input.t3777Code);
  formData.append('variantLabel', input.variantLabel);
  if (input.source) formData.append('source', input.source);
  formData.append('file', input.file);

  const response = await apiClient.post('/reference-logos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

/** Soft delete (deactivate) a reference variant; the record is preserved. */
export const deactivateReferenceLogo = async (id: string): Promise<ReferenceLogo> => {
  const response = await apiClient.patch(`/reference-logos/${id}/deactivate`);
  return response.data;
};
