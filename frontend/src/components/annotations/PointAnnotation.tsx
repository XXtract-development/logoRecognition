import React, { useState } from 'react';
import { Circle, Text, Group, Rect } from 'react-konva';
import Konva from 'konva';
import { Annotation } from '../../types/annotation';

interface PointAnnotationProps {
  annotation: Annotation;
  isSelected: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onChange: (id: string, updates: Partial<Annotation>) => void;
  onDelete: () => void;
}

const PointAnnotation: React.FC<PointAnnotationProps> = ({
  annotation,
  isSelected,
  onSelect,
  onChange,
  onDelete,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onSelect(annotation.id, e.evt.shiftKey);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onChange(annotation.id, {
      x: e.target.x(),
      y: e.target.y(),
    });
  };

  const getStrokeColor = () => {
    if (isSelected) return '#0066ff';
    if (isHovered) return '#00aaff';
    return annotation.color || '#ff0066';
  };

  return (
    <Group>
      {/* Outer ring for visibility */}
      <Circle
        x={annotation.x}
        y={annotation.y}
        radius={isSelected ? 12 : 10}
        stroke={getStrokeColor()}
        strokeWidth={2}
        fill={`${getStrokeColor()}33`}
        opacity={isHovered || isSelected ? 1 : 0.7}
      />

      {/* Center point */}
      <Circle
        x={annotation.x}
        y={annotation.y}
        radius={isSelected ? 6 : 4}
        fill={getStrokeColor()}
        stroke="white"
        strokeWidth={1}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={isSelected}
      />

      {/* Crosshair when selected */}
      {isSelected && (
        <>
          <Rect
            x={annotation.x! - 1}
            y={annotation.y! - 15}
            width={2}
            height={30}
            fill={getStrokeColor()}
            opacity={0.5}
          />
          <Rect
            x={annotation.x! - 15}
            y={annotation.y! - 1}
            width={30}
            height={2}
            fill={getStrokeColor()}
            opacity={0.5}
          />
        </>
      )}

      {/* Label */}
      {(annotation.category || annotation.value || annotation.confidence) && (
        <Group>
          <Rect
            x={annotation.x! + 15}
            y={annotation.y! - 10}
            width={Math.max(60, (annotation.category?.length || 0) * 7 + 20)}
            height={18}
            fill={getStrokeColor()}
            cornerRadius={2}
            opacity={0.9}
          />
          <Text
            x={annotation.x! + 18}
            y={annotation.y! - 7}
            text={`${annotation.category || 'point'}${annotation.value ? ': ' + annotation.value : ''}${annotation.confidence ? ` (${Math.round(annotation.confidence * 100)}%)` : ''}`}
            fontSize={11}
            fill="white"
            fontFamily="system-ui"
          />
        </Group>
      )}
    </Group>
  );
};

export default PointAnnotation;