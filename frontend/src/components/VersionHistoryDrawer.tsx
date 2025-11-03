import React from 'react';
import { Drawer, List, Space, Typography, Tag, Button } from 'antd';
import { AnnotationSummary } from '../types/annotations';

const { Text } = Typography;

interface VersionHistoryDrawerProps {
  open: boolean;
  loading?: boolean;
  versions: AnnotationSummary[];
  onClose: () => void;
  onLoadVersion: (versionId: string) => void;
}

const formatChangeStats = (summary: AnnotationSummary) => {
  const tokens: string[] = [];
  if (summary.added) tokens.push(`Added: ${summary.added}`);
  if (summary.updated) tokens.push(`Updated: ${summary.updated}`);
  if (summary.removed) tokens.push(`Removed: ${summary.removed}`);
  return tokens.join(' | ') || 'No changes recorded';
};

export const VersionHistoryDrawer: React.FC<VersionHistoryDrawerProps> = ({
  open,
  loading = false,
  versions,
  onClose,
  onLoadVersion,
}) => (
  <Drawer
    title="Version History"
    open={open}
    width={420}
    onClose={onClose}
    destroyOnHidden
  >
    <List
      loading={loading}
      dataSource={versions}
      locale={{ emptyText: 'No versions available yet' }}
      renderItem={(item) => (
        <List.Item
          key={item.datasetVersionId}
          actions={[
            <Button
              key="view"
              size="small"
              onClick={() => onLoadVersion(item.datasetVersionId)}
            >
              Load read-only
            </Button>,
          ]}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <Space size={8}>
              <Text strong>v{item.versionNumber}</Text>
              <Tag color={item.status === 'final' ? 'blue' : 'gold'}>{item.status.toUpperCase()}</Tag>
              <Text type="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
            </Space>
            <Text>{formatChangeStats(item)}</Text>
            <Text type="secondary">{item.totalAnnotations} annotations · {item.totalImages} images</Text>
            {item.tags?.length ? (
              <Space size={4} wrap>
                {item.tags.map((tag) => (
                  <Tag key={tag} color="geekblue">{tag}</Tag>
                ))}
              </Space>
            ) : null}
          </Space>
        </List.Item>
      )}
    />
  </Drawer>
);

export default VersionHistoryDrawer;
