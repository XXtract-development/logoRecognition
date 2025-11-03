/**
 * CategoryImportSummary Component
 *
 * Displays final import results with statistics.
 * Final step in the import workflow.
 */

import React, { useCallback } from 'react';
import { Result, Button, Descriptions, Tag, Alert } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import type { ImportSummary } from '../../../types/category';

interface CategoryImportSummaryProps {
  summary: ImportSummary;
  onClose: () => void;
}

/**
 * Summary component showing import results
 *
 * Features:
 * - Success/warning status based on results
 * - Statistics display
 * - Error details with download option
 * - Close action
 */
export const CategoryImportSummary: React.FC<CategoryImportSummaryProps> = ({
  summary,
  onClose,
}) => {
  /**
   * Download error details as Excel
   */
  const handleDownloadErrors = useCallback(() => {
    if (!summary.errorDetails || summary.errorDetails.length === 0) {
      return;
    }

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Create worksheet data
    const wsData = [
      ['Rij', 'Categorie', 'Code', 'Foutmeldingen'],
      ...summary.errorDetails.map((error) => [
        error.rowNumber,
        error.categorie || '',
        error.code || '',
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

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Fouten');

    // Write and download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    saveAs(blob, 'import_fouten.xlsx');
  }, [summary]);

  /**
   * Determine result status
   */
  const getResultStatus = (): 'success' | 'warning' | 'error' => {
    if (summary.imported === summary.total && summary.failed === 0) {
      return 'success';
    }
    if (summary.imported > 0) {
      return 'warning';
    }
    return 'error';
  };

  /**
   * Get result message
   */
  const getResultMessage = (): string => {
    const status = getResultStatus();

    if (status === 'success') {
      return 'Import Succesvol Voltooid!';
    }
    if (status === 'warning') {
      return 'Import Gedeeltelijk Voltooid';
    }
    return 'Import Mislukt';
  };

  /**
   * Get result subTitle
   */
  const getResultSubTitle = (): string => {
    const status = getResultStatus();

    if (status === 'success') {
      return `Alle ${summary.imported} categorieën zijn succesvol geïmporteerd.`;
    }
    if (status === 'warning') {
      return `${summary.imported} van ${summary.total} categorieën zijn geïmporteerd. ${summary.skipped + summary.failed} records zijn overgeslagen of gefaald.`;
    }
    return 'Er zijn geen categorieën geïmporteerd. Controleer de fouten en probeer opnieuw.';
  };

  const status = getResultStatus();
  const hasErrors = summary.failed > 0;

  return (
    <div>
      <Result
        status={status}
        title={getResultMessage()}
        subTitle={getResultSubTitle()}
        extra={[
          <Button type="primary" key="close" onClick={onClose}>
            Sluiten
          </Button>,
        ]}
      >
        {/* Statistics */}
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item
            label="Totaal Records"
            contentStyle={{ fontWeight: 'bold' }}
          >
            {summary.total}
          </Descriptions.Item>

          <Descriptions.Item
            label={
              <span>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                Geïmporteerd
              </span>
            }
            contentStyle={{ color: '#52c41a', fontWeight: 'bold' }}
          >
            {summary.imported}
          </Descriptions.Item>

          <Descriptions.Item
            label={
              <span>
                <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
                Overgeslagen (Duplicaten)
              </span>
            }
            contentStyle={{ color: '#faad14', fontWeight: 'bold' }}
          >
            {summary.skipped}
          </Descriptions.Item>

          <Descriptions.Item
            label={
              <span>
                <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                Gefaald
              </span>
            }
            contentStyle={{ color: '#ff4d4f', fontWeight: 'bold' }}
          >
            {summary.failed}
          </Descriptions.Item>
        </Descriptions>

        {/* Error Details */}
        {hasErrors && summary.errorDetails && summary.errorDetails.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <Alert
              message="Fouten Gedetecteerd"
              description={
                <div>
                  <p>
                    Er zijn {summary.failed} records gefaald door validatie fouten.
                  </p>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={handleDownloadErrors}
                    type="link"
                    style={{ paddingLeft: 0 }}
                  >
                    Download Foutrapport (Excel)
                  </Button>

                  {/* Show first few errors */}
                  {summary.errorDetails.slice(0, 5).map((error, idx) => (
                    <div
                      key={idx}
                      style={{
                        marginTop: 8,
                        padding: 8,
                        background: '#fff2f0',
                        border: '1px solid #ffccc7',
                        borderRadius: 4,
                      }}
                    >
                      <strong>Rij {error.rowNumber}:</strong>{' '}
                      {error.categorie && <Tag>{error.categorie}</Tag>}
                      {error.code && <Tag>{error.code}</Tag>}
                      <br />
                      <span style={{ color: '#ff4d4f' }}>
                        {error.errors.join(', ')}
                      </span>
                    </div>
                  ))}

                  {summary.errorDetails.length > 5 && (
                    <p style={{ marginTop: 8, fontStyle: 'italic' }}>
                      ... en {summary.errorDetails.length - 5} meer fouten.
                      Download het rapport voor alle details.
                    </p>
                  )}
                </div>
              }
              type="error"
              showIcon
            />
          </div>
        )}
      </Result>
    </div>
  );
};

export default CategoryImportSummary;