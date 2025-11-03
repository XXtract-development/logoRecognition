import React, { memo } from 'react';
import { Detection } from '../ResultsDashboard';
import { LogoCard } from './LogoCard';
import './VirtualizedResultsGrid.css';

interface VirtualizedResultsGridProps {
  detections: Detection[];
  selectedIds?: string[];
  viewMode?: 'grid' | 'list';
  onDetectionSelect?: (id: string) => void;
  onDetectionClick?: (id: string, multiSelect: boolean) => void;
  height: number;
  width: number;
  loadMoreItems?: (startIndex: number, stopIndex: number) => Promise<void>;
  hasNextPage?: boolean;
  isNextPageLoading?: boolean;
}

// Temporary fallback implementation while react-window import issues are resolved
export const VirtualizedResultsGrid: React.FC<VirtualizedResultsGridProps> = memo(({
  detections,
  selectedIds = [],
  viewMode = 'grid',
  onDetectionSelect,
  onDetectionClick,
  height,
  width
}) => {
  return (
    <div
      className="virtualized-results-fallback"
      style={{
        height,
        width,
        overflow: 'auto',
        display: viewMode === 'grid' ? 'grid' : 'block',
        gridTemplateColumns: viewMode === 'grid' ? 'repeat(auto-fill, minmax(200px, 1fr))' : undefined,
        gap: '16px',
        padding: '16px'
      }}
    >
      {detections.map((detection) => (
        <div
          key={detection.id}
          style={{
            border: selectedIds.includes(detection.id) ? '2px solid #1890ff' : '1px solid #d9d9d9',
            borderRadius: '8px',
            padding: '12px',
            cursor: 'pointer',
            backgroundColor: selectedIds.includes(detection.id) ? '#f0f8ff' : 'white'
          }}
          onClick={() => onDetectionClick?.(detection.id, false)}
        >
          <div style={{ fontWeight: 'bold' }}>{detection.brand || 'Unknown Brand'}</div>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            Confidence: {Math.round((detection.confidence || 0) * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
});

VirtualizedResultsGrid.displayName = 'VirtualizedResultsGrid';

export default VirtualizedResultsGrid;