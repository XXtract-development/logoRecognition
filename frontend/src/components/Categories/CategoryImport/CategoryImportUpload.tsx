/**
 * CategoryImportUpload Component
 *
 * File upload area with drag & drop support and template download.
 * First step in the import workflow.
 */

import React, { useState, useCallback } from 'react';
import { Upload, Button, Alert, Space } from 'antd';
import { UploadOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadProps, UploadFile } from 'antd';
import { saveAs } from 'file-saver';
import { parseExcelFile, generateExcelTemplate } from '../../../utils/excelParser';
import type { ImportValidationResult } from '../../../types/category';
import * as Sentry from '@sentry/react';

const { Dragger } = Upload;

interface CategoryImportUploadProps {
  onComplete: (result: ImportValidationResult, file: File) => void;
}

/**
 * Upload component for category import
 *
 * Features:
 * - Drag & drop file upload
 * - Click to upload
 * - Template download
 * - File validation
 * - Progress feedback
 */
export const CategoryImportUpload: React.FC<CategoryImportUploadProps> = ({
  onComplete,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle file selection
   */
  const handleFileChange: UploadProps['onChange'] = useCallback(
    async ({ file }: { file: UploadFile }) => {
      if (file.status === 'uploading' && file.originFileObj) {
        setUploading(true);
        setError(null);

        try {
          // Parse and validate the Excel file
          const result = await parseExcelFile(file.originFileObj);

          // Pass result and file to parent
          onComplete(result, file.originFileObj);
        } catch (err) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Fout bij verwerken van bestand';

          setError(errorMessage);

          // Log error to Sentry
          Sentry.captureException(err, {
            contexts: {
              upload: {
                fileName: file.name,
                fileSize: file.size,
              },
            },
          });
        } finally {
          setUploading(false);
        }
      }
    },
    [onComplete]
  );

  /**
   * Download Excel template
   */
  const handleDownloadTemplate = useCallback(() => {
    try {
      const blob = generateExcelTemplate();
      saveAs(blob, 'categorieën_import_template.xlsx');
    } catch (err) {
      console.error('Failed to generate template:', err);
      Sentry.captureException(err);
    }
  }, []);

  /**
   * Custom upload request - prevents auto-upload
   */
  const customRequest: UploadProps['customRequest'] = useCallback(
    ({ onSuccess }) => {
      // Immediately call onSuccess to trigger onChange
      setTimeout(() => {
        onSuccess?.('ok');
      }, 0);
    },
    []
  );

  /**
   * Before upload validation
   */
  const beforeUpload: UploadProps['beforeUpload'] = useCallback((file) => {
    // Validate file type
    if (!file.name.endsWith('.xlsx')) {
      setError('Alleen .xlsx bestanden zijn toegestaan');
      return Upload.LIST_IGNORE;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Bestand te groot. Maximum 10MB toegestaan');
      return Upload.LIST_IGNORE;
    }

    return true;
  }, []);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Template Download Button */}
      <div style={{ textAlign: 'center' }}>
        <Button
          icon={<DownloadOutlined />}
          onClick={handleDownloadTemplate}
          type="link"
        >
          Download Excel Template
        </Button>
      </div>

      {/* Upload Area */}
      <Dragger
        name="file"
        multiple={false}
        accept=".xlsx"
        customRequest={customRequest}
        beforeUpload={beforeUpload}
        onChange={handleFileChange}
        showUploadList={false}
        disabled={uploading}
        data-testid="category-import-upload"
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
        </p>
        <p className="ant-upload-text">
          {uploading
            ? 'Bestand verwerken...'
            : 'Klik of sleep een Excel bestand hierheen'}
        </p>
        <p className="ant-upload-hint">
          Ondersteunt .xlsx bestanden tot 10MB met maximaal 10,000 rijen
        </p>
      </Dragger>

      {/* Error Display */}
      {error && (
        <Alert
          message="Upload Fout"
          description={error}
          type="error"
          closable
          onClose={() => setError(null)}
        />
      )}

      {/* Upload Button Alternative */}
      <div style={{ textAlign: 'center' }}>
        <Upload
          accept=".xlsx"
          customRequest={customRequest}
          beforeUpload={beforeUpload}
          onChange={handleFileChange}
          showUploadList={false}
          disabled={uploading}
        >
          <Button
            icon={<UploadOutlined />}
            loading={uploading}
            size="large"
            type="primary"
          >
            {uploading ? 'Verwerken...' : 'Selecteer Bestand'}
          </Button>
        </Upload>
      </div>
    </Space>
  );
};

export default CategoryImportUpload;