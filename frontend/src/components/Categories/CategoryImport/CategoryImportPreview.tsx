/**
 * CategoryImportPreview Component
 *
 * Preview table showing validation results with color-coded status.
 * Second step in the import workflow.
 */

import React, { useMemo, useCallback } from 'react';
import { Table, Button, Space, Alert, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { saveAs } from 'file-saver';
import { generateErrorReport } from '../../../utils/excelParser';
import type {
  ImportValidationResult,
  RowValidationResult,
} from '../../../types/category';

const { Title, Paragraph } = Typography;

interface CategoryImportPreviewProps {
  validationResult: ImportValidationResult;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Preview component for import validation results
 *
 * Features:
 * - Color-coded status indicators
 * - Preview first 50 rows
 * - Statistics summary
 * - Download error report
 * - Confirm/Cancel actions
 */
export const CategoryImportPreview: React.FC<CategoryImportPreviewProps> = ({
  validationResult,
  loading,
  onConfirm,
  onCancel,
}) => {
  /**
   * Combine all rows for display (limit to 50 for preview)
   */
  const previewData = useMemo(() => {
    const allRows = [
      ...validationResult.valid,
      ...validationResult.duplicates,
      ...validationResult.errors,
    ];

    // Sort by row number
    allRows.sort((a, b) => a.rowNumber - b.rowNumber);

    // Limit to first 50 rows
    return allRows.slice(0, 50);
  }, [validationResult]);

  /**
   * Download error report
   */
  const handleDownloadErrors = useCallback(() => {
    const blob = generateErrorReport(validationResult);
    saveAs(blob, 'import_errors.xlsx');
  }, [validationResult]);

  /**
   * Get status tag based on validation result
   */
  const getStatusTag = (result: RowValidationResult) => {
    if (result.valid && !result.isDuplicate) {
      return <Tag color="success" icon={<CheckCircleOutlined />}>Valide</Tag>;
    }

    if (result.isDuplicate) {
      return (
        <Tag color="warning" icon={<ExclamationCircleOutlined />}>
          Duplicaat
        </Tag>
      );
    }

    return <Tag color="error" icon={<CloseCircleOutlined />}>Fout</Tag>;
  };

  /**
   * Table columns definition
   */
  const columns: ColumnsType<RowValidationResult> = [
    {
      title: 'Rij',
      dataIndex: 'rowNumber',
      key: 'rowNumber',
      width: 70,
      fixed: 'left',
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      fixed: 'left',
      render: (_, record) => getStatusTag(record),
    },
    {
      title: 'Categorie',
      dataIndex: ['row', 'categorie'],
      key: 'categorie',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Code',
      dataIndex: ['row', 'code'],
      key: 'code',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Categorie Naam',
      dataIndex: ['row', 'categorie_naam'],
      key: 'categorie_naam',
      width: 200,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Code Naam',
      dataIndex: ['row', 'code_naam'],
      key: 'code_naam',
      width: 200,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Fouten',
      dataIndex: 'errors',
      key: 'errors',
      width: 300,
      render: (errors: string[]) => {
        if (errors.length === 0) return <span style={{ color: '#52c41a' }}>Geen fouten</span>;
        return (
          <ul style={{ margin: 0, paddingLeft: 20, color: '#ff4d4f' }}>
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        );
      },
    },
  ];

  /**
   * Check if import can proceed
   */
  const canImport = validationResult.validCount > 0;
  const hasErrors =
    validationResult.errorCount > 0 || validationResult.duplicateCount > 0;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Statistics Summary */}
      <div>
        <Title level={4}>Validatie Resultaten</Title>
        <Space size="large" wrap>
          <div>
            <Tag color="default" style={{ fontSize: 16, padding: '4px 12px' }}>
              Totaal: <strong>{validationResult.totalRows}</strong>
            </Tag>
          </div>
          <div>
            <Tag color="success" style={{ fontSize: 16, padding: '4px 12px' }}>
              ✅ Valide: <strong>{validationResult.validCount}</strong>
            </Tag>
          </div>
          <div>
            <Tag color="warning" style={{ fontSize: 16, padding: '4px 12px' }}>
              ⚠️ Duplicaten: <strong>{validationResult.duplicateCount}</strong>
            </Tag>
          </div>
          <div>
            <Tag color="error" style={{ fontSize: 16, padding: '4px 12px' }}>
              ❌ Fouten: <strong>{validationResult.errorCount}</strong>
            </Tag>
          </div>
        </Space>
      </div>

      {/* Warning/Info Messages */}
      {!canImport && (
        <Alert
          message="Geen Valide Records"
          description="Er zijn geen valide records gevonden om te importeren. Corrigeer de fouten in het bestand en probeer opnieuw."
          type="error"
          showIcon
        />
      )}

      {canImport && !hasErrors && (
        <Alert
          message="Alles Valide"
          description={`Alle ${validationResult.validCount} records zijn valide en klaar voor import.`}
          type="success"
          showIcon
        />
      )}

      {canImport && hasErrors && (
        <Alert
          message="Gedeeltelijke Import"
          description={`${validationResult.validCount} valide records zullen worden geïmporteerd. ${validationResult.duplicateCount} duplicaten en ${validationResult.errorCount} fouten zullen worden overgeslagen.`}
          type="warning"
          showIcon
        />
      )}

      {/* Error Download Button */}
      {hasErrors && (
        <div>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadErrors}
            type="link"
          >
            Download Foutrapport (Excel)
          </Button>
        </div>
      )}

      {/* Preview Table */}
      <div>
        <Paragraph type="secondary">
          Eerste {Math.min(50, validationResult.totalRows)} rijen weergegeven
        </Paragraph>
        <Table
          dataSource={previewData}
          columns={columns}
          rowKey="rowNumber"
          pagination={false}
          scroll={{ x: 1200, y: 400 }}
          size="small"
          bordered
        />
      </div>

      {/* Action Buttons */}
      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel} disabled={loading}>
            Annuleren
          </Button>
          <Button
            type="primary"
            onClick={onConfirm}
            loading={loading}
            disabled={!canImport || loading}
          >
            {loading ? 'Importeren...' : `Importeer ${validationResult.validCount} Categorieën`}
          </Button>
        </Space>
      </div>
    </Space>
  );
};

export default CategoryImportPreview;