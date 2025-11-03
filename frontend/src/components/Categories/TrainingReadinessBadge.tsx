/**
 * Training Readiness Badge Component
 *
 * Displays training readiness percentage with color-coded badge and detailed tooltip.
 * Used in the Categories table to show which categories are ready for training.
 */

import React from 'react';
import { Badge, Tooltip, Progress } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { CategoryReadiness } from '../../types/category';

interface TrainingReadinessBadgeProps {
  readiness: CategoryReadiness;
  showDetails?: boolean;
}

export const TrainingReadinessBadge: React.FC<TrainingReadinessBadgeProps> = ({
  readiness,
  showDetails = false,
}) => {
  const getIcon = () => {
    if (readiness.readinessPercentage >= 95) return <CheckCircleOutlined />;
    if (readiness.readinessPercentage >= 70) return <ExclamationCircleOutlined />;
    return <CloseCircleOutlined />;
  };

  const getStatusText = () => {
    if (readiness.readinessPercentage >= 95) return 'Ready for training';
    if (readiness.readinessPercentage >= 85) return 'Almost ready';
    if (readiness.readinessPercentage >= 70) return 'Need more data';
    if (readiness.readinessPercentage >= 50) return 'Insufficient';
    return 'Critical - more data needed';
  };

  const tooltipContent = (
    <div style={{ maxWidth: 300 }}>
      <div style={{ marginBottom: 8 }}>
        <strong>Training Readiness: {readiness.readinessPercentage.toFixed(1)}%</strong>
      </div>
      <Progress
        percent={readiness.readinessPercentage}
        strokeColor={readiness.readinessColor}
        size="small"
        showInfo={false}
      />
      <div style={{ marginTop: 8, fontSize: 12 }}>
        <div>📊 Annotations: {readiness.annotationCount}</div>
        <div>🖼️ Unique Images: {readiness.uniqueImages}</div>
        <div>
          🎯 Estimated Accuracy: {readiness.estimatedAccuracyRange[0]}%-
          {readiness.estimatedAccuracyRange[1]}%
        </div>
        {readiness.requiredAdditionalAnnotations > 0 && (
          <div style={{ marginTop: 4, color: '#faad14' }}>
            ⚠️ Need {readiness.requiredAdditionalAnnotations} more annotations for 95% target
          </div>
        )}
      </div>
      {readiness.recommendations.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.9 }}>
          <div><strong>Recommendations:</strong></div>
          {readiness.recommendations.slice(0, 3).map((rec, idx) => (
            <div key={idx}>• {rec}</div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="left">
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        tabIndex={0}
        role="button"
        aria-label={`Training readiness: ${readiness.readinessPercentage.toFixed(0)}%`}
      >
        <Badge
          count={`${readiness.readinessPercentage.toFixed(0)}%`}
          style={{
            backgroundColor: readiness.readinessColor,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        />
        {showDetails && (
          <span style={{ fontSize: 12, color: '#666' }}>
            {getStatusText()}
          </span>
        )}
      </span>
    </Tooltip>
  );
};
