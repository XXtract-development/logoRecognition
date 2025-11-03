import React from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { CheckCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { AnnotationSaveResponse } from '../types/annotations';

const { Text } = Typography;

interface SaveBannerProps {
  response?: AnnotationSaveResponse;
  onViewDetails?: () => void;
  onOpenAudit?: () => void;
}

const formatSummary = (response: AnnotationSaveResponse): string => {
  const { versionNumber, totalAnnotations, diff } = response;
  const parts: string[] = [];
  if (versionNumber !== undefined) {
    parts.push(`Version #${versionNumber}`);
  }
  parts.push(`${totalAnnotations} logos`);
  if (diff) {
    const changeTokens: string[] = [];
    if (diff.added) changeTokens.push(`+${diff.added}`);
    if (diff.updated) changeTokens.push(`~${diff.updated}`);
    if (diff.removed) changeTokens.push(`-${diff.removed}`);
    if (changeTokens.length > 0) {
      parts.push(changeTokens.join(' '));
    }
  }
  return parts.join(' · ');
};

export const SaveBanner: React.FC<SaveBannerProps> = ({ response, onViewDetails, onOpenAudit }) => {
  if (!response) {
    return null;
  }

  const isSuccess = response.status === 'saved';
  const icon = isSuccess ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : <WarningTwoTone twoToneColor="#faad14" />;
  const message = isSuccess ? 'Annotations saved' : 'Annotations saved as draft';

  return (
    <Alert
      type={isSuccess ? 'success' : 'info'}
      icon={icon}
      message={
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text strong>{message}</Text>
          <Text type="secondary">{formatSummary(response)}</Text>
          <Space>
            {onViewDetails && (
              <Button size="small" onClick={onViewDetails} data-testid="save-banner-details">
                View details
              </Button>
            )}
            {onOpenAudit && (
              <Button size="small" onClick={onOpenAudit} data-testid="save-banner-audit">
                Dataset audit
              </Button>
            )}
          </Space>
        </Space>
      }
    />
  );
};

export default SaveBanner;
