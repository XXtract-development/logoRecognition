/**
 * Excel Parser Utility for Category Import
 *
 * This module provides functionality to parse and validate Excel files
 * for the category import feature.
 *
 * Features:
 * - Parse .xlsx files using SheetJS (xlsx library)
 * - Validate file size and format
 * - Normalize column names (case-insensitive)
 * - Validate required fields
 * - Detect duplicates within file
 * - Generate validation results
 */

import * as XLSX from 'xlsx';
import type {
  CategoryImportRow,
  ImportValidationResult,
  RowValidationResult,
} from '../types/category';

// Validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 10000;
const MAX_CATEGORIE_LENGTH = 100;
const MAX_CODE_LENGTH = 100; // Increased to support longer logo codes
const MAX_NAME_DEFINITION_LENGTH = 2000; // Increased to support longer definitions (max found: 1521 chars)

// Required columns (case-insensitive)
const REQUIRED_COLUMNS = ['categorie', 'code'];

/**
 * Parse Excel file and validate contents
 *
 * @param file - File object from file input or drag & drop
 * @returns Validation result with valid/duplicate/error rows
 * @throws Error if file is invalid format or size
 */
export async function parseExcelFile(
  file: File
): Promise<ImportValidationResult> {
  // Validate file type
  if (!file.name.endsWith('.xlsx')) {
    throw new Error('Alleen .xlsx bestanden toegestaan');
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `Bestand te groot. Maximum ${MAX_FILE_SIZE / 1024 / 1024}MB toegestaan`
    );
  }

  // Read file as array buffer
  const arrayBuffer = await file.arrayBuffer();

  // Parse with SheetJS
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Get first sheet
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Excel bestand bevat geen werkbladen');
  }

  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON with headers
  const data: any[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: undefined,
    blankrows: false,
  });

  if (data.length === 0) {
    throw new Error('Excel bestand bevat geen data');
  }

  // Validate row count
  if (data.length > MAX_ROWS) {
    throw new Error(`Maximum ${MAX_ROWS} rijen toegestaan`);
  }

  // Normalize column names and convert to CategoryImportRow[]
  console.log('📊 Excel Parser: Processing rows from Excel file');
  console.log('📊 Total rows in Excel:', data.length);

  const rows: CategoryImportRow[] = data.map((row, index) => {
    const normalized: any = {};
    Object.keys(row).forEach((key) => {
      // Normalize: lowercase, trim, and replace spaces with underscores
      const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '_');
      normalized[normalizedKey] = row[key];
    });

    // Add row number for tracking
    normalized._rowNumber = index + 2; // +2 for header and 0-based index

    // Log first row to see column structure
    if (index === 0) {
      console.log('📊 First row columns detected:', Object.keys(normalized).filter(k => k !== '_rowNumber'));
      console.log('📊 First row data sample:', normalized);
    }

    return normalized as CategoryImportRow;
  });

  // Validate required columns exist
  const firstRow = rows[0];
  const availableColumns = Object.keys(firstRow).filter(
    (k) => k !== '_rowNumber'
  );
  const hasRequiredColumns = REQUIRED_COLUMNS.every((col) =>
    availableColumns.includes(col)
  );

  if (!hasRequiredColumns) {
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !availableColumns.includes(col)
    );
    throw new Error(
      `Verplichte kolommen ontbreken: ${missingColumns.join(', ')}`
    );
  }

  // Validate each row
  console.log('📊 Starting validation of', rows.length, 'rows');
  const validationResults: RowValidationResult[] = rows.map((row) =>
    validateImportRow(row, row._rowNumber || 0)
  );

  // Log validation statistics
  const validCount = validationResults.filter(r => r.valid).length;
  const invalidCount = validationResults.filter(r => !r.valid).length;
  console.log('📊 Validation complete - Valid:', validCount, 'Invalid:', invalidCount);

  // Log first 5 errors for debugging
  const firstErrors = validationResults.filter(r => !r.valid).slice(0, 5);
  if (firstErrors.length > 0) {
    console.log('📊 First 5 validation errors:');
    firstErrors.forEach(err => {
      console.log(`   Row ${err.rowNumber}:`, err.errors, '| Data:', err.row);
    });
  }

  // Detect duplicates within file
  const seenKeys = new Set<string>();
  const duplicateIndices = new Set<number>();

  validationResults.forEach((result, index) => {
    if (result.valid) {
      const key = `${result.row.categorie}|${result.row.code}`;
      if (seenKeys.has(key)) {
        duplicateIndices.add(index);
      } else {
        seenKeys.add(key);
      }
    }
  });

  // Mark duplicates
  duplicateIndices.forEach((index) => {
    validationResults[index].isDuplicate = true;
    validationResults[index].errors.push(
      'Duplicaat: Deze combinatie van categorie en code komt al voor in het bestand'
    );
  });

  // Categorize results
  const valid = validationResults.filter(
    (r) => r.valid && !r.isDuplicate
  );
  const duplicates = validationResults.filter((r) => r.isDuplicate);
  const errors = validationResults.filter(
    (r) => !r.valid && !r.isDuplicate
  );

  return {
    valid,
    duplicates,
    errors,
    totalRows: rows.length,
    validCount: valid.length,
    duplicateCount: duplicates.length,
    errorCount: errors.length,
  };
}

/**
 * Validate a single import row
 *
 * Validation rules:
 * - Categorie: required, max 100 chars
 * - Code: required, max 100 chars, alphanumeric + underscore + common special chars (+, -, (), .)
 * - Categorie_naam and code_naam: max 2000 chars
 * - Definitie: max 2000 chars (supports detailed descriptions)
 *
 * @param row - Row data from Excel
 * @param rowNumber - Row number for error reporting (1-based)
 * @returns Validation result
 */
export function validateImportRow(
  row: CategoryImportRow,
  rowNumber: number
): RowValidationResult {
  const errors: string[] = [];

  // Validate categorie (required)
  if (!row.categorie || row.categorie.trim() === '') {
    errors.push('Categorie is verplicht');
  } else if (row.categorie.length > MAX_CATEGORIE_LENGTH) {
    errors.push(
      `Categorie mag maximaal ${MAX_CATEGORIE_LENGTH} karakters bevatten`
    );
  }

  // Validate code (required)
  if (!row.code || row.code.trim() === '') {
    errors.push('Code is verplicht');
  } else {
    // Type validation - ensure code is a string
    const codeValue = String(row.code).trim();

    if (codeValue.length > MAX_CODE_LENGTH) {
      errors.push(
        `Code mag maximaal ${MAX_CODE_LENGTH} karakters bevatten`
      );
    }

    // Validate code format (alphanumeric + underscore + common special chars)
    // Allow: letters, digits, underscore, plus, minus, parentheses, dot
    const codePattern = /^[a-zA-Z0-9_+\-().]+$/;
    if (!codePattern.test(codeValue)) {
      errors.push(
        `Code bevat ongeldige karakters (gevonden: "${codeValue}")`
      );
    }
  }

  // Validate optional fields length
  if (
    row.categorie_naam &&
    row.categorie_naam.length > MAX_NAME_DEFINITION_LENGTH
  ) {
    errors.push(
      `Categorie naam mag maximaal ${MAX_NAME_DEFINITION_LENGTH} karakters bevatten`
    );
  }

  if (row.code_naam && row.code_naam.length > MAX_NAME_DEFINITION_LENGTH) {
    errors.push(
      `Code naam mag maximaal ${MAX_NAME_DEFINITION_LENGTH} karakters bevatten`
    );
  }

  if (row.definitie && row.definitie.length > MAX_NAME_DEFINITION_LENGTH) {
    errors.push(
      `Definitie mag maximaal ${MAX_NAME_DEFINITION_LENGTH} karakters bevatten`
    );
  }

  return {
    row,
    rowNumber,
    valid: errors.length === 0,
    isDuplicate: false, // Will be set later in parseExcelFile
    errors,
  };
}

/**
 * Generate a downloadable Excel template file
 *
 * Creates an Excel file with the correct column structure
 * and example data to guide users.
 *
 * @returns Blob containing Excel file
 */
export function generateExcelTemplate(): Blob {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // Create worksheet with headers and example data
  // Note: Headers can use either spaces or underscores - both are normalized
  const wsData = [
    ['Categorie', 'Categorie naam', 'Code', 'Code naam', 'Definitie'],
    ['A', 'Type A', 'CODE_001', 'Code 001', 'Voorbeeld definitie voor Type A'],
    ['B', 'Type B', 'CODE_002', 'Code 002', 'Voorbeeld definitie voor Type B'],
    ['C', 'Type C', 'ENERGY_LABEL_A+', 'Energy Label A+', 'Energie label voorbeeld met +'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Categorie
    { wch: 20 }, // Categorie naam
    { wch: 10 }, // Code
    { wch: 20 }, // Code naam
    { wch: 40 }, // Definitie
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Categorieën');

  // Write to array buffer
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Return as Blob
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Generate error report Excel file
 *
 * Creates an Excel file containing all validation errors
 * to help users correct their data.
 *
 * @param validationResult - Validation result containing errors
 * @returns Blob containing Excel file with errors
 */
export function generateErrorReport(
  validationResult: ImportValidationResult
): Blob {
  const wb = XLSX.utils.book_new();

  // Combine errors and duplicates
  const allErrors = [...validationResult.errors, ...validationResult.duplicates];

  // Create data for worksheet
  const wsData = [
    [
      'Rij',
      'Categorie',
      'Code',
      'Foutmeldingen',
    ],
    ...allErrors.map((error) => [
      error.rowNumber,
      error.row.categorie || '',
      error.row.code || '',
      error.errors.join('; '),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 8 },  // Rij
    { wch: 20 }, // Categorie
    { wch: 15 }, // Code
    { wch: 60 }, // Foutmeldingen
  ];

  // Add worksheet
  XLSX.utils.book_append_sheet(wb, ws, 'Fouten');

  // Write to array buffer
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // Return as Blob
  return new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Clean and normalize row data before API submission
 *
 * Removes internal tracking fields and trims strings
 *
 * @param row - Raw import row
 * @returns Cleaned row data
 */
export function cleanRowData(row: CategoryImportRow): CategoryImportRow {
  const cleaned: CategoryImportRow = {
    categorie: row.categorie.trim(),
    code: row.code.trim(),
  };

  if (row.categorie_naam) {
    cleaned.categorie_naam = row.categorie_naam.trim();
  }

  if (row.code_naam) {
    cleaned.code_naam = row.code_naam.trim();
  }

  if (row.definitie) {
    cleaned.definitie = row.definitie.trim();
  }

  return cleaned;
}