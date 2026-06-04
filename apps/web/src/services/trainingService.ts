/**
 * Training Service
 * API calls for image management, categories, and annotations
 */
import apiClient from './apiClient';
import type {
  TrainingImage,
  Category,
  CategoryFormData,
  Annotation,
  AnnotationFormData,
  SmartDetectionResult,
  ImageFilters,
} from '@/types/training.types';

// Demo data generators (exported for development use, not used as API fallbacks)
export const generateDemoImages = (count: number): TrainingImage[] => {
  const statuses: Array<'none' | 'partial' | 'complete'> = ['none', 'partial', 'complete'];
  const formats: Array<'jpeg' | 'png' | 'webp'> = ['jpeg', 'png', 'webp'];

  return Array.from({ length: count }, (_, i) => ({
    id: `img-${Date.now()}-${i}`,
    filename: `image-${i + 1}.jpg`,
    originalName: `Sample Image ${i + 1}.jpg`,
    url: `https://picsum.photos/seed/${i}/800/600`,
    thumbnailUrl: `https://picsum.photos/seed/${i}/320/240`,
    size: Math.floor(Math.random() * 5000000) + 500000,
    width: 800,
    height: 600,
    format: formats[Math.floor(Math.random() * formats.length)],
    uploadedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    annotationStatus: statuses[Math.floor(Math.random() * statuses.length)],
    annotationCount: Math.floor(Math.random() * 5),
  }));
};

export const demoCategories: Category[] = [
  { id: 'cat-1', name: 'Technology', description: 'Tech company logos', color: '#007AFF', imageCount: 45, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-2', name: 'Automotive', description: 'Car brand logos', color: '#52c41a', imageCount: 32, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-3', name: 'Food & Beverage', description: 'Restaurant and food brand logos', color: '#faad14', imageCount: 28, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-4', name: 'Sports', description: 'Sports team and brand logos', color: '#ff4d4f', imageCount: 21, createdAt: new Date(), updatedAt: new Date() },
  { id: 'cat-5', name: 'Fashion', description: 'Fashion brand logos', color: '#722ed1', imageCount: 18, createdAt: new Date(), updatedAt: new Date() },
];

// ============ Images API ============

export async function fetchImages(filters?: ImageFilters): Promise<TrainingImage[]> {
  const response = await apiClient.get('/training/images', { params: filters });
  // API returns { data: [...], pagination: {...} }
  return response.data.data || response.data;
}

export async function uploadImage(file: File): Promise<TrainingImage> {
  const formData = new FormData();
  formData.append('image', file);
  const response = await apiClient.post('/training/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function uploadImages(files: File[]): Promise<TrainingImage[]> {
  const results: TrainingImage[] = [];
  for (const file of files) {
    const image = await uploadImage(file);
    results.push(image);
  }
  return results;
}

export async function deleteImage(id: string): Promise<void> {
  await apiClient.delete(`/training/images/${id}`);
}

/**
 * Mark or unmark a training-data record as part of the protected holdout set
 * (Epic 7, Story 7.1).
 */
export async function setImageHoldout(
  id: string,
  holdout: boolean
): Promise<{ id: string; holdout: boolean }> {
  const response = await apiClient.patch(`/training/data/${id}/holdout`, { holdout });
  return response.data;
}

export async function deleteImages(ids: string[]): Promise<void> {
  await apiClient.post('/training/images/bulk-delete', { ids });
}

export async function assignImagesToCategory(
  imageIds: string[],
  categoryId: string
): Promise<void> {
  await apiClient.post('/training/images/assign-category', { imageIds, categoryId });
}

// ============ Categories API ============

export async function fetchCategories(): Promise<Category[]> {
  const response = await apiClient.get('/training/categories');
  // API returns { data: { flat: [...], grouped: {...} } }
  const data = response.data.data;
  return data?.flat || data || response.data;
}

export async function createCategory(data: CategoryFormData): Promise<Category> {
  const response = await apiClient.post('/training/categories', data);
  return response.data;
}

export async function updateCategory(
  id: string,
  data: Partial<CategoryFormData>
): Promise<Category> {
  const response = await apiClient.patch(`/training/categories/${id}`, data);
  return response.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/training/categories/${id}`);
}

export async function mergeCategories(
  sourceId: string,
  targetId: string
): Promise<void> {
  await apiClient.post('/training/categories/merge', { sourceId, targetId });
}

// ============ Annotations API ============

export async function fetchAnnotations(imageId: string): Promise<Annotation[]> {
  const response = await apiClient.get(`/training/images/${imageId}/annotations`);
  return response.data;
}

export async function createAnnotation(
  imageId: string,
  data: AnnotationFormData
): Promise<Annotation> {
  const response = await apiClient.post(`/training/images/${imageId}/annotations`, data);
  return response.data;
}

export async function updateAnnotation(
  imageId: string,
  annotationId: string,
  data: Partial<AnnotationFormData>
): Promise<Annotation> {
  const response = await apiClient.patch(
    `/training/images/${imageId}/annotations/${annotationId}`,
    data
  );
  return response.data;
}

export async function deleteAnnotation(
  imageId: string,
  annotationId: string
): Promise<void> {
  await apiClient.delete(`/training/images/${imageId}/annotations/${annotationId}`);
}

export async function validateAnnotation(
  imageId: string,
  annotationId: string,
  validated: boolean
): Promise<void> {
  await apiClient.patch(`/training/images/${imageId}/annotations/${annotationId}/validate`, {
    validated,
  });
}

// ============ Smart Detection API ============

export async function smartDetect(
  imageId: string,
  clickX: number,
  clickY: number
): Promise<SmartDetectionResult> {
  const response = await apiClient.post('/ml/smart-detect', {
    imageId,
    clickX,
    clickY,
  });
  return response.data;
}

// ============ Review API ============

export async function fetchReviewItems(status?: string): Promise<TrainingImage[]> {
  const response = await apiClient.get('/training/review', { params: { status } });
  return response.data;
}

export async function approveImage(imageId: string): Promise<void> {
  await apiClient.post(`/training/review/${imageId}/approve`);
}

export async function rejectImage(imageId: string, notes: string): Promise<void> {
  await apiClient.post(`/training/review/${imageId}/reject`, { notes });
}
