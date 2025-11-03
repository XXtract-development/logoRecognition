import React, { memo } from 'react';
import { Progress, Space, Typography } from 'antd';
import './ConfidenceMeter.css';

const { Text } = Typography;

interface ConfidenceMeterProps {
  value: number; // 0-1 scale
  size?: 'small' | 'default' | 'large';
  showLabel?: boolean;
  showPercentage?: boolean;
  className?: string;
}

export const ConfidenceMeter = memo<ConfidenceMeterProps>(({
  value,
  size = 'default',
  showLabel = false,
  showPercentage = false,
  className = ''
}) => {
  const percentage = Math.round(value * 100);

  // Determine color based on confidence level
  const getColor = () => {
    if (percentage >= 90) return '#52c41a'; // Green
    if (percentage >= 70) return '#faad14'; // Orange
    return '#f5222d'; // Red
  };

  const getStatus = () => {
    if (percentage >= 90) return 'High';
    if (percentage >= 70) return 'Medium';
    return 'Low';
  };

  const getProgressSize = () => {
    switch (size) {
      case 'small':
        return { width: 60, strokeWidth: 4 };
      case 'large':
        return { width: 120, strokeWidth: 8 };
      default:
        return { width: 80, strokeWidth: 6 };
    }
  };

  const progressProps = getProgressSize();

  return (
    <div className={`confidence-meter confidence-meter-${size} ${className}`}>
      <Space direction="vertical" align="center" size={4}>
        {showLabel && (
          <Text type="secondary" className="confidence-label">
            Confidence
          </Text>
        )}

        <Progress
          type="circle"
          percent={percentage}
          strokeColor={getColor()}
          strokeWidth={progressProps.strokeWidth}
          width={progressProps.width}
          format={(percent) => (
            <span className="confidence-value">
              {showPercentage ? `${percent}%` : percent}
            </span>
          )}
        />

        {showLabel && (
          <Text strong className={`confidence-status confidence-status-${getStatus().toLowerCase()}`}>
            {getStatus()}
          </Text>
        )}
      </Space>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if value or display props change
  return (
    prevProps.value === nextProps.value &&
    prevProps.size === nextProps.size &&
    prevProps.showLabel === nextProps.showLabel &&
    prevProps.showPercentage === nextProps.showPercentage &&
    prevProps.className === nextProps.className
  );
});

ConfidenceMeter.displayName = 'ConfidenceMeter';