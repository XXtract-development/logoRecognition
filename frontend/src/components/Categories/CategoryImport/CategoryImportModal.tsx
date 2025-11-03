/**
 * CategoryImportModal Component
 *
 * Main modal orchestrating the 3-step import workflow:
 * 1. Upload - Select and parse Excel file
 * 2. Preview - Review validation results
 * 3. Summary - View import results
 */

import React, { useState, useCallback } from 'react';
import { Modal, Steps, message } from 'antd';
import * as Sentry from '@sentry/react';
import CategoryImportUpload from './CategoryImportUpload';
import CategoryImportPreview from './CategoryImportPreview';
import CategoryImportSummary from './CategoryImportSummary';
import { categoryService } from '../../../services/categoryService';
import type {
  ImportValidationResult,
  ImportSummary,
} from '../../../types/category';

const { Step } = Steps;

interface CategoryImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Main modal for category import workflow
 *
 * Features:
 * - 3-step wizard interface
 * - File upload and validation
 * - Preview with statistics
 * - Import execution
 * - Results summary
 * - Error tracking via Sentry
 */
export const CategoryImportModal: React.FC<CategoryImportModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  /**
   * Handle upload completion with validation results
   */
  const handleUploadComplete = useCallback(
    (result: ImportValidationResult, file: File) => {
      setValidationResult(result);
      setUploadedFile(file);
      setCurrentStep(1);
    },
    []
  );

  /**
   * Handle import confirmation - execute API call
   */
  const handleImportConfirm = useCallback(async () => {
    if (!uploadedFile) {
      message.error('Geen bestand geselecteerd');
      return;
    }

    setLoading(true);

    try {
      // Call API with the file
      const response = await categoryService.importCategoriesFromFile(uploadedFile);

      if (response.success) {
        setImportSummary(response.summary);
        setCurrentStep(2);
        message.success(
          `${response.summary.imported} categorie${response.summary.imported !== 1 ? 'ën' : ''} geïmporteerd`
        );
        onSuccess?.();
      } else {
        throw new Error(response.message || 'Import gefaald');
      }
    } catch (error) {
      // Error handling with Sentry
      Sentry.captureException(error, {
        contexts: {
          import: {
            fileName: uploadedFile?.name,
            fileSize: uploadedFile?.size,
            validRows: validationResult?.validCount || 0,
            totalRows: validationResult?.totalRows || 0,
          },
        },
        tags: {
          feature: 'category-import',
          step: 'import-execution',
        },
      });

      message.error(
        error instanceof Error
          ? error.message
          : 'Import gefaald. Probeer opnieuw.'
      );

      console.error('Import error:', error);
    } finally {
      setLoading(false);
    }
  }, [uploadedFile, validationResult, onSuccess]);

  /**
   * Handle modal close - reset state
   */
  const handleClose = useCallback(() => {
    // Reset all state
    setCurrentStep(0);
    setValidationResult(null);
    setImportSummary(null);
    setUploadedFile(null);
    setLoading(false);

    onClose();
  }, [onClose]);

  /**
   * Handle cancel during preview
   */
  const handlePreviewCancel = useCallback(() => {
    setCurrentStep(0);
    setValidationResult(null);
    setUploadedFile(null);
  }, []);

  /**
   * Modal footer is handled by each step component
   */
  const getModalWidth = (): number => {
    if (currentStep === 1) return 1200; // Preview needs more space
    return 800;
  };

  return (
    <Modal
      title="Categorieën Importeren uit Excel"
      open={visible}
      onCancel={handleClose}
      width={getModalWidth()}
      footer={null}
      destroyOnHidden
      maskClosable={false}
      data-testid="category-import-modal"
    >
      {/* Steps Progress */}
      <Steps current={currentStep} style={{ marginBottom: 32 }}>
        <Step title="Upload" description="Selecteer Excel bestand" />
        <Step title="Preview" description="Controleer data" />
        <Step title="Voltooid" description="Import resultaten" />
      </Steps>

      {/* Step 1: Upload */}
      {currentStep === 0 && (
        <CategoryImportUpload
          onComplete={(result, file) => handleUploadComplete(result, file)}
        />
      )}

      {/* Step 2: Preview */}
      {currentStep === 1 && validationResult && (
        <CategoryImportPreview
          validationResult={validationResult}
          loading={loading}
          onConfirm={handleImportConfirm}
          onCancel={handlePreviewCancel}
        />
      )}

      {/* Step 3: Summary */}
      {currentStep === 2 && importSummary && (
        <CategoryImportSummary
          summary={importSummary}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
};

export default CategoryImportModal;