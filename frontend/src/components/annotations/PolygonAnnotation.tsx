import React, { useRef, useEffect, useState } from 'react';
import { Line, Circle, Group, Text, Rect } from 'react-konva';
import Konva from 'konva';
import { Annotation, Point } from '../../types/annotation';

interface PolygonAnnotationProps {
  annotation: Annotation;
  isSelected: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onChange: (id: string, updates: Partial<Annotation>) => void;
  onDelete: () => void;
}

const PolygonAnnotation: React.FC<PolygonAnnotationProps> = ({
  annotation,
  isSelected,
  onSelect,
  onChange,
  onDelete,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [editingPoint, setEditingPoint] = useState<number | null>(null);

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onSelect(annotation.id, e.evt.shiftKey);
  };

  const handlePointDragEnd = (index: number, e: Konva.KonvaEventObject<DragEvent>) => {
    const points = [...(annotation.points || [])];
    points[index] = {
      x: e.target.x(),
      y: e.target.y(),
    };
    onChange(annotation.id, { points });
    setEditingPoint(null);
  };

  const handlePointDragStart = (index: number) => {
    setEditingPoint(index);
  };

  const addPoint = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isSelected || !e.evt.altKey) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const points = annotation.points || [];
    const newPoint = { x: pos.x, y: pos.y };

    // Find best position to insert the new point
    let bestIndex = points.length;
    let minDistance = Infinity;

    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      // Calculate distance from point to line segment
      const dist = pointToSegmentDistance(newPoint, p1, p2);
      if (dist < minDistance) {
        minDistance = dist;
        bestIndex = i + 1;
      }
    }

    const updatedPoints = [
      ...points.slice(0, bestIndex),
      newPoint,
      ...points.slice(bestIndex),
    ];

    onChange(annotation.id, { points: updatedPoints });
  };

  const removePoint = (index: number, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (annotation.points && annotation.points.length > 3) {
      const points = annotation.points.filter((_, i) => i !== index);
      onChange(annotation.id, { points });
    }
  };

  const getStrokeColor = () => {
    if (isSelected) return '#0066ff';
    if (isHovered) return '#00aaff';
    return annotation.color || '#00ff00';
  };

  const getCenter = (): Point => {
    const points = annotation.points || [];
    if (points.length === 0) return { x: 0, y: 0 };

    const sum = points.reduce((acc, p) => ({
      x: acc.x + p.x,
      y: acc.y + p.y,
    }), { x: 0, y: 0 });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length,
    };
  };

  if (!annotation.points || annotation.points.length < 3) {
    return null;
  }

  const flatPoints = annotation.points.flatMap(p => [p.x, p.y]);
  const center = getCenter();

  return (
    <Group>
      {/* Polygon shape */}
      <Line
        points={flatPoints}
        stroke={getStrokeColor()}
        strokeWidth={isSelected ? 3 : 2}
        fill={`${getStrokeColor()}22`}
        closed
        onClick={handleSelect}
        onTap={handleSelect}
        onDblClick={addPoint}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {/* Control points when selected */}
      {isSelected && annotation.points.map((point, index) => (
        <Circle
          key={index}
          x={point.x}
          y={point.y}
          radius={editingPoint === index ? 8 : 6}
          fill="white"
          stroke={getStrokeColor()}
          strokeWidth={2}
          draggable
          onDragStart={() => handlePointDragStart(index)}
          onDragEnd={(e) => handlePointDragEnd(index, e)}
          onDblClick={(e) => removePoint(index, e)}
          onMouseEnter={(e) => {
            const container = e.target.getStage()?.container();
            if (container) {
              container.style.cursor = 'move';
            }
          }}
          onMouseLeave={(e) => {
            const container = e.target.getStage()?.container();
            if (container) {
              container.style.cursor = 'default';
            }
          }}
        />
      ))}

      {/* Label */}
      {(annotation.category || annotation.value) && (
        <Group>
          <Rect
            x={center.x - 40}
            y={center.y - 10}
            width={80}
            height={20}
            fill={getStrokeColor()}
            cornerRadius={2}
            opacity={0.8}
          />
          <Text
            x={center.x - 36}
            y={center.y - 6}
            text={`${annotation.category}${annotation.value ? ': ' + annotation.value : ''}`}
            fontSize={12}
            fill="white"
            fontFamily="system-ui"
          />
        </Group>
      )}
    </Group>
  );
};

// Helper function to calculate distance from point to line segment
function pointToSegmentDistance(point: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (dx === 0 && dy === 0) {
    // p1 and p2 are the same point
    return Math.hypot(point.x - p1.x, point.y - p1.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (dx * dx + dy * dy)));
  const projection = {
    x: p1.x + t * dx,
    y: p1.y + t * dy,
  };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

export default PolygonAnnotation;