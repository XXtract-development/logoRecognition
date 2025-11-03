import React, { memo } from 'react';
import { Card, Tag, Progress, Space, Typography, Tooltip } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Detection } from '../ResultsDashboard';
import { ConfidenceMeter } from './ConfidenceMeter';
import './LogoCard.css';

const { Text } = Typography;

interface LogoCardProps {
  detection: Detection;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  viewMode: 'card' | 'list' | 'compact';
}

export const LogoCard = memo<LogoCardProps>(({
  detection,
  isSelected,
  onClick,
  viewMode
}) => {
  const confidence = detection.confidence * 100;
  const confidenceColor = confidence >= 90 ? 'success' : confidence >= 70 ? 'warning' : 'error';

  if (viewMode === 'compact') {
    return (
      <div
        className={`logo-card-compact ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
      >
        <Space size="small">
          {isSelected && <CheckCircleOutlined style={{ color: '#1890ff' }} />}
          <ConfidenceMeter value={detection.confidence} size="small" />
          <Text type="secondary" className="detection-id">
            #{detection.id.slice(-4)}
          </Text>
        </Space>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div
        className={`logo-card-list ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
      >
        <Space className="card-content" align="center">
          {isSelected && <CheckCircleOutlined style={{ color: '#1890ff' }} />}

          <div className="brand-info">
            <Text strong>{detection.brand}</Text>
            {detection.category && (
              <Tag size="small" className="category-tag">
                {detection.category}
              </Tag>
            )}
          </div>

          <ConfidenceMeter value={detection.confidence} showLabel />

          <div className="detection-meta">
            <Tooltip title="Bounding Box Size">
              <Text type="secondary" className="size-info">
                {detection.boundingBox.width}×{detection.boundingBox.height}
              </Text>
            </Tooltip>
          </div>
        </Space>
      </div>
    );
  }

  // Card view (grid)
  return (
    <Card
      className={`logo-card ${isSelected ? 'selected' : ''}`}
      size="small"
      onClick={onClick}
      hoverable
    >
      <div className="card-header">
        <Space>
          <Text strong>{detection.brand}</Text>
          {isSelected && <CheckCircleOutlined style={{ color: '#1890ff' }} />}
        </Space>
      </div>

      <div className="card-body">
        <ConfidenceMeter value={detection.confidence} showLabel showPercentage />

        {detection.category && (
          <Tag className="category-tag" color="blue">
            {detection.category}
          </Tag>
        )}

        <div className="detection-details">
          <Tooltip title="Detection ID">
            <Text type="secondary" className="detail-item">
              ID: {detection.id.slice(-6)}
            </Text>
          </Tooltip>

          <Tooltip title="Bounding Box Dimensions">
            <Text type="secondary" className="detail-item">
              <InfoCircleOutlined /> {detection.boundingBox.width}×{detection.boundingBox.height}px
            </Text>
          </Tooltip>

          <Tooltip title="Position">
            <Text type="secondary" className="detail-item">
              📍 ({detection.boundingBox.x}, {detection.boundingBox.y})
            </Text>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for performance optimization
  return (
    prevProps.detection.id === nextProps.detection.id &&
    prevProps.detection.confidence === nextProps.detection.confidence &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.viewMode === nextProps.viewMode
  );
});

LogoCard.displayName = 'LogoCard';