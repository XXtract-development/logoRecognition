import React, { useState } from 'react';
import { Card, Button, Radio, Space, Progress, Typography, message } from 'antd';
import {
  DownloadOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import './ExportPanel.css';

const { Text, Title } = Typography;

interface ExportPanelProps {
  onExport: (format: 'json' | 'csv' | 'pdf' | 'xlsx') => Promise<void>;
  exportStatus: 'idle' | 'generating' | 'complete' | 'error';
  detectionsCount: number;
}

const ExportPanel: React.FC<ExportPanelProps> = ({
  onExport,
  exportStatus,
  detectionsCount
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'json' | 'csv' | 'pdf' | 'xlsx'>('json');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (detectionsCount === 0) {
      message.warning('No detections to export');
      return;
    }

    setIsExporting(true);
    try {
      await onExport(selectedFormat);
      message.success(`Export to ${selectedFormat.toUpperCase()} completed`);
    } catch (error) {
      message.error('Export failed. Please try again.');
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportFormats = [
    { value: 'json', label: 'JSON', icon: <FileDoneOutlined /> },
    { value: 'csv', label: 'CSV', icon: <FileTextOutlined /> },
    { value: 'xlsx', label: 'Excel', icon: <FileExcelOutlined /> },
    { value: 'pdf', label: 'PDF', icon: <FilePdfOutlined /> }
  ];

  return (
    <Card
      title="Export Results"
      className="export-panel"
      extra={
        <Text type="secondary">
          {detectionsCount} detection{detectionsCount !== 1 ? 's' : ''}
        </Text>
      }
    >
      <div className="export-content">
        <div className="format-selection">
          <Text strong className="section-label">Select Format:</Text>
          <Radio.Group
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="format-radio-group"
          >
            <Space direction="vertical">
              {exportFormats.map((format) => (
                <Radio key={format.value} value={format.value}>
                  <Space>
                    {format.icon}
                    <span>{format.label}</span>
                  </Space>
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </div>

        <div className="export-info">
          <Text type="secondary" className="info-item">
            • Include all filtered results
          </Text>
          <Text type="secondary" className="info-item">
            • Bounding box coordinates
          </Text>
          <Text type="secondary" className="info-item">
            • Confidence scores
          </Text>
          <Text type="secondary" className="info-item">
            • Detection metadata
          </Text>
        </div>

        {isExporting && (
          <Progress
            percent={75}
            status="active"
            showInfo={false}
            className="export-progress"
          />
        )}

        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExport}
          loading={isExporting}
          disabled={detectionsCount === 0}
          block
          size="large"
          className="export-button"
        >
          {isExporting ? 'Generating Export...' : `Export as ${selectedFormat.toUpperCase()}`}
        </Button>
      </div>
    </Card>
  );
};

export default ExportPanel;