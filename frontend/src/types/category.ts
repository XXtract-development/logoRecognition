/**
 * Category Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the Category feature,
 * including CRUD operations and Excel import functionality.
 */

/**
 * Base Category interface with extended fields
 */
export interface Category {
  id?: number;
  categorie: string;
  categorie_naam?: string | null;
  code: string;
  code_naam?: string | null;
  definitie?: string | null;
  annotation_count: number;         // Number of annotations using this category
  created_at?: string;
  updated_at?: string;
}

/**
 * Raw row from Excel file before validation
 */
export interface CategoryImportRow {
  categorie: string;           // Verplicht
  categorie_naam?: string;     // Optioneel
  code: string;                // Verplicht
  code_naam?: string;          // Optioneel
  definitie?: string;          // Optioneel

  // Internal tracking
  _rowNumber?: number;         // 1-based row number from Excel
}

/**
 * Validation result for a single row
 */
export interface RowValidationResult {
  row: CategoryImportRow;
  rowNumber: number;
  valid: boolean;
  isDuplicate: boolean;
  errors: string[];            // Array of error messages for this row
}

/**
 * Complete validation result for entire import
 */
export interface ImportValidationResult {
  valid: RowValidationResult[];      // Valid rows ready to import
  duplicates: RowValidationResult[]; // Duplicates (will be skipped)
  errors: RowValidationResult[];     // Invalid rows with errors
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
}

/**
 * Error detail for import summary
 */
export interface ImportErrorDetail {
  rowNumber: number;
  categorie?: string;
  code?: string;
  errors: string[];
}

/**
 * Summary after import execution
 */
export interface ImportSummary {
  total: number;           // Total rows processed
  imported: number;        // Successfully imported
  skipped: number;         // Duplicates skipped
  failed: number;          // Failed validations
  errorDetails?: ImportErrorDetail[];
}

/**
 * API request for import
 */
export interface CategoryImportRequest {
  rows: CategoryImportRow[];
  skipDuplicates: boolean;   // Always true for US-014
}

/**
 * API response from import
 */
export interface CategoryImportResponse {
  success: boolean;
  summary: ImportSummary;
  message: string;
}

/**
 * Category list response with filtering support
 */
export interface CategoryListResponse {
  categories: Category[];
  total: number;                  // Total categories in database
  filtered: number;                // Categories after search filter applied
  page?: number;
  pageSize?: number;
  search_term?: string;            // Applied search filter
}

/**
 * Category create/update request
 */
export interface CategoryRequest {
  categorie: string;
  categorie_naam?: string | null;
  code: string;
  code_naam?: string | null;
  definitie?: string | null;
}

// ===== Training Readiness Types =====

/**
 * Training readiness status levels
 */
export enum ReadinessStatus {
  INSUFFICIENT = 'insufficient',
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

/**
 * Training readiness information for a category
 */
export interface CategoryReadiness {
  categoryId: number;
  categorie: string;
  categorieNaam?: string | null;
  code: string;
  codeNaam?: string | null;
  annotationCount: number;
  uniqueImages: number;
  readinessPercentage: number;
  readinessStatus: ReadinessStatus;
  readinessColor: string;
  requiredAdditionalAnnotations: number;
  estimatedAccuracyRange: [number, number];
  recommendations: string[];
}

/**
 * Summary statistics for training readiness
 */
export interface ReadinessSummary {
  totalCategories: number;
  readyForTraining: number;
  needMoreData: number;
  insufficient: number;
  avgReadiness: number;
}

/**
 * Paginated list of category training readiness
 */
export interface CategoryReadinessListResponse {
  categories: CategoryReadiness[];
  total: number;
  page: number;
  page_size: number;
  summary: ReadinessSummary;
}