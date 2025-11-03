import React, { useEffect, useRef, useMemo, memo } from 'react';
import { Tooltip } from 'antd';
import { Detection } from '../ResultsDashboard';
import './BoundingBoxLayer.css';

interface BoundingBoxLayerProps {
  detections: Detection[];
  selectedIds: string[];
  hoveredId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  onDetectionClick: (id: string, multiSelect: boolean) => void;
  onDetectionHover: (id: string | null) => void;
  containerWidth?: number;
  containerHeight?: number;
  imageWidth?: number;
  imageHeight?: number;
}

export const BoundingBoxLayer = memo<BoundingBoxLayerProps>(({
  detections,
  selectedIds,
  hoveredId,
  zoom,
  pan,
  onDetectionClick,
  onDetectionHover,
  containerWidth = 800,
  containerHeight = 600,
  imageWidth = 1920,
  imageHeight = 1080
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate scale to fit image in container
  const baseScale = useMemo(() => {
    return Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  }, [containerWidth, containerHeight, imageWidth, imageHeight]);

  const scale = baseScale * zoom;

  // Calculate centered position
  const imageX = (containerWidth - imageWidth * scale) / 2 + pan.x;
  const imageY = (containerHeight - imageHeight * scale) / 2 + pan.y;

  // Get color based on confidence
  const getBoxColor = (confidence: number, isSelected: boolean, isHovered: boolean) => {
    if (isSelected) return '#1890ff';
    if (isHovered) return '#40a9ff';

    if (confidence >= 0.9) return '#52c41a'; // Green - high confidence
    if (confidence >= 0.7) return '#faad14'; // Orange - medium confidence
    return '#f5222d'; // Red - low confidence
  };

  // Handle click on detection
  const handleBoxClick = (e: React.MouseEvent, detectionId: string) => {
    e.stopPropagation();
    onDetectionClick(detectionId, e.shiftKey || e.metaKey);
  };

  return (
    <svg
      ref={svgRef}
      className="bounding-box-layer"
      width={containerWidth}
      height={containerHeight}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 10
      }}
    >
      <g transform={`translate(${imageX}, ${imageY})`}>
        {detections.map((detection) => {
          const isSelected = selectedIds.includes(detection.id);
          const isHovered = hoveredId === detection.id;
          const color = getBoxColor(detection.confidence, isSelected, isHovered);

          // Scale bounding box coordinates
          const x = detection.boundingBox.x * scale;
          const y = detection.boundingBox.y * scale;
          const width = detection.boundingBox.width * scale;
          const height = detection.boundingBox.height * scale;

          return (
            <g key={detection.id} className="detection-group">
              {/* Bounding box */}
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill="none"
                stroke={color}
                strokeWidth={isSelected || isHovered ? 3 : 2}
                strokeDasharray={isSelected ? '0' : '5,5'}
                opacity={isHovered ? 1 : 0.8}
                style={{
                  pointerEvents: 'all',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={(e) => handleBoxClick(e, detection.id)}
                onMouseEnter={() => onDetectionHover(detection.id)}
                onMouseLeave={() => onDetectionHover(null)}
              />

              {/* Corner indicators for selected */}
              {isSelected && (
                <>
                  <circle cx={x} cy={y} r="4" fill={color} />
                  <circle cx={x + width} cy={y} r="4" fill={color} />
                  <circle cx={x} cy={y + height} r="4" fill={color} />
                  <circle cx={x + width} cy={y + height} r="4" fill={color} />
                </>
              )}

              {/* Label background */}
              <rect
                x={x}
                y={y - 24}
                width={Math.max(100, detection.brand.length * 8 + 50)}
                height={22}
                fill={color}
                opacity={0.9}
                rx="3"
                ry="3"
              />

              {/* Label text */}
              <text
                x={x + 4}
                y={y - 7}
                fill="white"
                fontSize="12"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {detection.brand}
              </text>

              {/* Confidence badge */}
              <text
                x={x + detection.brand.length * 8 + 12}
                y={y - 7}
                fill="white"
                fontSize="11"
                fontWeight="400"
                style={{ pointerEvents: 'none' }}
              >
                {(detection.confidence * 100).toFixed(0)}%
              </text>

              {/* Hover tooltip area */}
              {isHovered && (
                <foreignObject x={x} y={y + height + 5} width="200" height="100">
                  <div className="detection-tooltip">
                    <div className="tooltip-content">
                      <strong>{detection.brand}</strong>
                      <div>Confidence: {(detection.confidence * 100).toFixed(1)}%</div>
                      <div>Size: {detection.boundingBox.width} × {detection.boundingBox.height}px</div>
                      {detection.category && <div>Category: {detection.category}</div>}
                    </div>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}, (prevProps, nextProps) => {
  // Optimized comparison - only re-render when necessary
  const detectionsEqual =
    prevProps.detections.length === nextProps.detections.length &&
    prevProps.detections.every((d, i) =>
      d.id === nextProps.detections[i].id &&
      d.confidence === nextProps.detections[i].confidence
    );

  const selectedIdsEqual =
    prevProps.selectedIds.length === nextProps.selectedIds.length &&
    prevProps.selectedIds.every((id, i) => id === nextProps.selectedIds[i]);

  return (
    detectionsEqual &&
    selectedIdsEqual &&
    prevProps.hoveredId === nextProps.hoveredId &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.pan.x === nextProps.pan.x &&
    prevProps.pan.y === nextProps.pan.y &&
    prevProps.containerWidth === nextProps.containerWidth &&
    prevProps.containerHeight === nextProps.containerHeight &&
    prevProps.imageWidth === nextProps.imageWidth &&
    prevProps.imageHeight === nextProps.imageHeight
  );
});

BoundingBoxLayer.displayName = 'BoundingBoxLayer';