/**
 * Category Service
 *
 * API service for category management including CRUD operations
 * and Excel import functionality.
 */

import axios from 'axios';
import type {
  Category,
  CategoryListResponse,
  CategoryRequest,
  CategoryImportRequest,
  CategoryImportResponse,
  CategoryReadinessListResponse,
} from '../types/category';

const API_BASE_URL = '/api/categories';

/**
 * Get all categories with optional pagination and search
 */
export async function getCategories(
  page?: number,
  pageSize?: number
): Promise<CategoryListResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.append('page', page.toString());
  if (pageSize !== undefined) params.append('page_size', pageSize.toString());

  const response = await axios.get<CategoryListResponse>(
    `${API_BASE_URL}?${params.toString()}`
  );
  return response.data;
}

/**
 * Get categories with search, filtering, and sorting
 */
export async function getCategoriesWithSearch(
  search?: string,
  page?: number,
  pageSize?: number,
  sortBy?: 'categorie' | 'annotation_count' | 'created_at',
  sortOrder?: 'asc' | 'desc'
): Promise<CategoryListResponse> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (page !== undefined) params.append('page', page.toString());
  if (pageSize !== undefined) params.append('page_size', pageSize.toString());
  if (sortBy) params.append('sort_by', sortBy);
  if (sortOrder) params.append('sort_order', sortOrder);

  const response = await axios.get<CategoryListResponse>(
    `${API_BASE_URL}?${params.toString()}`
  );

  // Ensure backward compatibility
  if (!response.data.filtered) {
    response.data.filtered = response.data.total;
  }

  return response.data;
}

/**
 * Get a single category by ID
 */
export async function getCategory(id: number): Promise<Category> {
  const response = await axios.get<Category>(`${API_BASE_URL}/${id}`);
  return response.data;
}

/**
 * Create a new category
 */
export async function createCategory(
  data: CategoryRequest
): Promise<Category> {
  const response = await axios.post<Category>(API_BASE_URL, data);
  return response.data;
}

/**
 * Update an existing category
 */
export async function updateCategory(
  id: number,
  data: CategoryRequest
): Promise<Category> {
  const response = await axios.put<Category>(`${API_BASE_URL}/${id}`, data);
  return response.data;
}

/**
 * Delete a category
 */
export async function deleteCategory(id: number): Promise<void> {
  await axios.delete(`${API_BASE_URL}/${id}`);
}

/**
 * Import categories from Excel file
 *
 * This endpoint handles the bulk import of categories.
 * The file is sent as FormData, and the backend processes it.
 *
 * @param file - Excel file to import
 * @returns Import summary with results
 * @throws Error if import fails
 */
export async function importCategoriesFromFile(
  file: File
): Promise<CategoryImportResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<CategoryImportResponse>(
    `${API_BASE_URL}/import`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000, // 60 second timeout for large files
    }
  );

  return response.data;
}

/**
 * Get categories with training readiness metrics
 *
 * Fetches categories with calculated training readiness percentages,
 * status indicators, and recommendations. Results are cached server-side
 * for 5 minutes for performance.
 *
 * @param page - Page number (1-indexed)
 * @param pageSize - Items per page (max 100)
 * @param minReadiness - Optional minimum readiness percentage filter (0-100)
 * @returns Paginated list with readiness data and summary statistics
 */
export async function getCategoriesWithReadiness(
  page: number = 1,
  pageSize: number = 20,
  minReadiness?: number
): Promise<CategoryReadinessListResponse> {
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('page_size', pageSize.toString());
  if (minReadiness !== undefined) {
    params.append('min_readiness', minReadiness.toString());
  }

  const response = await axios.get<CategoryReadinessListResponse>(
    `${API_BASE_URL}/training-readiness?${params.toString()}`
  );

  return response.data;
}

/**
 * Category service object for easy access
 */
export const categoryService = {
  getCategories,
  getCategoriesWithSearch,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  importCategoriesFromFile,
  getCategoriesWithReadiness,
};

export default categoryService;