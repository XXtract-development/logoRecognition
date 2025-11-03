import React, { useRef, useEffect, useState } from 'react';
import { List, Card, Tag, Badge, Radio, Empty, Space } from 'antd';
import { EyeOutlined, AppstoreOutlined, UnorderedListOutlined, GroupOutlined } from '@ant-design/icons';
import { Detection } from '../ResultsDashboard';
import { LogoCard } from './LogoCard';
import { VirtualizedResultsGrid } from './VirtualizedResultsGrid';
import './ResultsGrid.css';

interface ResultsGridProps {
  detections: Detection[];
  selectedIds: string[];
  viewMode: 'grid' | 'list' | 'grouped';
  onDetectionClick: (id: string, multiSelect: boolean) => void;
  onViewModeChange: (mode: 'grid' | 'list' | 'grouped') => void;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({
  detections,
  selectedIds,
  viewMode,
  onDetectionClick,
  onViewModeChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Update container size on mount and resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  // Group detections by brand for grouped view
  const groupedDetections = React.useMemo(() => {
    const groups: Record<string, Detection[]> = {};
    detections.forEach(detection => {
      if (!groups[detection.brand]) {
        groups[detection.brand] = [];
      }
      groups[detection.brand].push(detection);
    });
    return groups;
  }, [detections]);

  if (detections.length === 0) {
    return (
      <Empty
        description="No logos detected"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: '40px 0' }}
      />
    );
  }

  // Use virtualization for large datasets
  const USE_VIRTUALIZATION_THRESHOLD = 50;
  const shouldVirtualize = detections.length > USE_VIRTUALIZATION_THRESHOLD;

  return (
    <div className="results-grid-container" ref={containerRef}>
      <div className="results-header">
        <div className="results-count">
          <Badge count={detections.length} showZero>
            <span>Detections</span>
          </Badge>
          {shouldVirtualize && (
            <Tag color="blue" style={{ marginLeft: 8 }}>
              Virtualized
            </Tag>
          )}
        </div>
        <Radio.Group
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value)}
          size="small"
        >
          <Radio.Button value="grid">
            <AppstoreOutlined />
          </Radio.Button>
          <Radio.Button value="list">
            <UnorderedListOutlined />
          </Radio.Button>
          <Radio.Button value="grouped">
            <GroupOutlined />
          </Radio.Button>
        </Radio.Group>
      </div>

      {shouldVirtualize && viewMode !== 'grouped' ? (
        // Use virtualized grid for large datasets
        <div className="results-virtualized" style={{ flex: 1 }}>
          <VirtualizedResultsGrid
            detections={detections}
            selectedIds={selectedIds}
            viewMode={viewMode}
            onDetectionClick={onDetectionClick}
            height={containerSize.height - 60} // Subtract header height
            width={containerSize.width}
          />
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="grouped-results">
          {Object.entries(groupedDetections)
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([brand, brandDetections]) => (
              <Card
                key={brand}
                size="small"
                className="brand-group-card"
                title={
                  <Space>
                    <span>{brand}</span>
                    <Tag color="blue">{brandDetections.length}</Tag>
                  </Space>
                }
              >
                <List
                  dataSource={brandDetections}
                  renderItem={(detection) => (
                    <LogoCard
                      key={detection.id}
                      detection={detection}
                      isSelected={selectedIds.includes(detection.id)}
                      onClick={(e) => onDetectionClick(detection.id, e.shiftKey || e.metaKey)}
                      viewMode="compact"
                    />
                  )}
                />
              </Card>
            ))}
        </div>
      ) : (
        <List
          className={`results-${viewMode}`}
          grid={viewMode === 'grid' ? { gutter: 8, column: 2 } : undefined}
          dataSource={detections}
          renderItem={(detection) => (
            <List.Item key={detection.id}>
              <LogoCard
                detection={detection}
                isSelected={selectedIds.includes(detection.id)}
                onClick={(e) => onDetectionClick(detection.id, e.shiftKey || e.metaKey)}
                viewMode={viewMode === 'grid' ? 'card' : 'list'}
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
};