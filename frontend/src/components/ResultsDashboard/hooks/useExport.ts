import { useState, useCallback } from 'react';
import { Detection } from '../ResultsDashboard';
import { Filters } from './useFilters';

interface ExportData {
  detectionId: string;
  detections: Detection[];
  format: 'json' | 'csv' | 'pdf' | 'xlsx';
  filters: Filters;
  imageMetadata?: any;
}

export const useExport = () => {
  const [exportStatus, setExportStatus] = useState<'idle' | 'generating' | 'complete' | 'error'>('idle');

  const exportData = useCallback(async (data: ExportData) => {
    setExportStatus('generating');

    try {
      const { detectionId, detections, format, filters, imageMetadata } = data;

      // Prepare export data
      const exportPayload = {
        metadata: {
          exportDate: new Date().toISOString(),
          detectionId,
          imageInfo: imageMetadata,
          appliedFilters: filters,
          format
        },
        summary: {
          totalLogos: detections.length,
          uniqueBrands: Array.from(new Set(detections.map(d => d.brand))).length,
          averageConfidence: detections.length > 0
            ? detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
            : 0
        },
        detections: detections.map(d => ({
          id: d.id,
          brand: d.brand,
          category: d.category,
          confidence: d.confidence,
          boundingBox: d.boundingBox,
          attributes: d.attributes,
          timestamp: d.timestamp
        }))
      };

      if (format === 'json') {
        // Generate JSON export
        const jsonData = JSON.stringify(exportPayload, null, 2);
        downloadFile(jsonData, `logo-detection-${detectionId}.json`, 'application/json');
      } else if (format === 'csv') {
        // Generate CSV export
        const csvData = generateCSV(detections);
        downloadFile(csvData, `logo-detection-${detectionId}.csv`, 'text/csv');
      } else if (format === 'xlsx' || format === 'pdf') {
        // For Excel and PDF, would typically call backend API
        await callExportAPI(detectionId, format, exportPayload);
      }

      setExportStatus('complete');
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
      throw error;
    }
  }, []);

  const generateCSV = (detections: Detection[]): string => {
    const headers = ['ID', 'Brand', 'Category', 'Confidence', 'X', 'Y', 'Width', 'Height', 'Timestamp'];
    const rows = detections.map(d => [
      d.id,
      d.brand,
      d.category || '',
      (d.confidence * 100).toFixed(2) + '%',
      d.boundingBox.x,
      d.boundingBox.y,
      d.boundingBox.width,
      d.boundingBox.height,
      d.timestamp || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const callExportAPI = async (detectionId: string, format: string, payload: any) => {
    const response = await fetch('/api/v1/export/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        detectionId,
        format,
        options: {
          includeImage: false,
          includeAnnotations: true,
          data: payload
        }
      })
    });

    if (!response.ok) {
      throw new Error('Export API call failed');
    }

    const result = await response.json();

    // Download from provided URL
    if (result.downloadUrl) {
      window.open(result.downloadUrl, '_blank');
    }
  };

  return {
    exportData,
    exportStatus
  };
};