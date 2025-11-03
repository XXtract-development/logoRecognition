/**
 * Export Utilities
 * Functions for exporting data to various formats
 */

import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RecognitionResult } from '@/types';
import { formatDate, formatConfidence } from './format';

export const exportToJSON = (results: RecognitionResult[]): void => {
  const dataStr = JSON.stringify(results, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  downloadBlob(dataBlob, `logo-recognition-results-${Date.now()}.json`);
};

export const exportToCSV = (results: RecognitionResult[]): void => {
  const flatData = results.flatMap((result) =>
    result.detections.map((detection) => ({
      'Result ID': result.id,
      'Image URL': result.imageUrl,
      'Brand Name': detection.brandName,
      'Confidence': formatConfidence(detection.confidence),
      'Bounding Box X': detection.boundingBox.x,
      'Bounding Box Y': detection.boundingBox.y,
      'Bounding Box Width': detection.boundingBox.width,
      'Bounding Box Height': detection.boundingBox.height,
      'Processed At': formatDate(result.processedAt),
      'Processing Time': `${result.processingTime}ms`,
      'Status': result.status,
    }))
  );

  const csv = Papa.unparse(flatData);
  const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(csvBlob, `logo-recognition-results-${Date.now()}.csv`);
};

export const exportToPDF = (results: RecognitionResult[]): void => {
  const doc = new jsPDF();

  // Add title
  doc.setFontSize(18);
  doc.text('Logo Recognition Results', 14, 22);

  // Add metadata
  doc.setFontSize(10);
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 30);
  doc.text(`Total Results: ${results.length}`, 14, 36);

  // Prepare table data
  const tableData = results.flatMap((result) =>
    result.detections.map((detection) => [
      result.id.slice(0, 8),
      detection.brandName,
      formatConfidence(detection.confidence),
      `${detection.boundingBox.x},${detection.boundingBox.y}`,
      formatDate(result.processedAt, 'YYYY-MM-DD HH:mm'),
      result.status,
    ])
  );

  // Add table
  autoTable(doc, {
    head: [['ID', 'Brand', 'Confidence', 'Position', 'Processed', 'Status']],
    body: tableData,
    startY: 42,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [24, 144, 255] },
  });

  // Save PDF
  doc.save(`logo-recognition-results-${Date.now()}.pdf`);
};

const downloadBlob = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};