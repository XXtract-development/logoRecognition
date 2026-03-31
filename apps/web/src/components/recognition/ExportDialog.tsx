import React, { useState } from 'react';
import { Modal, Select, Button, message } from 'antd';
import { useTranslation } from 'react-i18next';
import type { RecognitionResult, UploadedImage } from '@/types/recognition';
import { downloadBlob } from '@/utils/export';

interface ExportDialogProps {
  visible: boolean;
  results: RecognitionResult[];
  image: UploadedImage | null;
  onClose: () => void;
}

type ExportFormat = 'json' | 'csv' | 'xml';

export const ExportDialog: React.FC<ExportDialogProps> = ({
  visible,
  results,
  image,
  onClose,
}) => {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>('json');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);

    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      const exportData = {
        image: image ? { name: image.name, size: image.size } : null,
        results: results.map((r) => ({
          logoName: r.logoName,
          confidence: r.confidence,
          category: r.category,
          boundingBox: r.boundingBox,
        })),
        exportedAt: new Date().toISOString(),
      };

      switch (format) {
        case 'json':
          content = JSON.stringify(exportData, null, 2);
          filename = 'recognition-results.json';
          mimeType = 'application/json';
          break;
        case 'csv':
          const headers = ['Logo Name', 'Confidence', 'Category', 'X', 'Y', 'Width', 'Height'];
          const rows = results.map((r) => [
            r.logoName,
            r.confidence,
            r.category || '',
            r.boundingBox?.x || '',
            r.boundingBox?.y || '',
            r.boundingBox?.width || '',
            r.boundingBox?.height || '',
          ]);
          content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
          filename = 'recognition-results.csv';
          mimeType = 'text/csv';
          break;
        case 'xml':
          content = `<?xml version="1.0" encoding="UTF-8"?>
<recognitionResults>
  <exportedAt>${new Date().toISOString()}</exportedAt>
  <results>
    ${results
      .map(
        (r) => `
    <result>
      <logoName>${r.logoName}</logoName>
      <confidence>${r.confidence}</confidence>
      <category>${r.category || ''}</category>
      ${
        r.boundingBox
          ? `<boundingBox x="${r.boundingBox.x}" y="${r.boundingBox.y}" width="${r.boundingBox.width}" height="${r.boundingBox.height}" />`
          : ''
      }
    </result>`
      )
      .join('')}
  </results>
</recognitionResults>`;
          filename = 'recognition-results.xml';
          mimeType = 'application/xml';
          break;
      }

      // Create download
      const blob = new Blob([content], { type: mimeType });
      downloadBlob(blob, filename);

      message.success(t('recognition.exported'));
      onClose();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Export error:', error);
      }
      message.error(t('recognition.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      title={t('recognition.export')}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
        <Button key="export" type="primary" onClick={handleExport} loading={exporting}>
          {t('common.export')}
        </Button>,
      ]}
    >
      <div className="py-4">
        <label className="block mb-2">{t('export.selectFormat')}:</label>
        <Select
          value={format}
          onChange={setFormat}
          style={{ width: '100%' }}
          options={[
            { value: 'json', label: 'JSON' },
            { value: 'csv', label: 'CSV' },
            { value: 'xml', label: 'XML' },
          ]}
        />
        <p className="mt-4 text-sm text-gray-500">
          {t('export.resultsCount', { count: results.length })}
        </p>
      </div>
    </Modal>
  );
};

ExportDialog.displayName = 'ExportDialog';
