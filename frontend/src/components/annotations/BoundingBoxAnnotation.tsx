import React, { useRef, useEffect, useState } from 'react';
import { Rect, Transformer, Text, Group } from 'react-konva';
import Konva from 'konva';
import { Annotation } from '../../types/annotation';

interface BoundingBoxAnnotationProps {
  annotation: Annotation;
  isSelected: boolean;
  onSelect: (id: string, shiftKey: boolean) => void;
  onChange: (id: string, updates: Partial<Annotation>) => void;
  onDelete: () => void;
}

const BoundingBoxAnnotation: React.FC<BoundingBoxAnnotationProps> = ({
  annotation,
  isSelected,
  onSelect,
  onChange,
  onDelete,
}) => {
  const shapeRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent>) => {
    onSelect(annotation.id, e.evt.shiftKey);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    onChange(annotation.id, {
      x: node.x(),
      y: node.y(),
    });
  };

  const handleTransformEnd = () => {
    const node = shapeRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and apply it to dimensions
    node.scaleX(1);
    node.scaleY(1);

    onChange(annotation.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(5, node.width() * scaleX),
      height: Math.max(5, node.height() * scaleY),
    });
  };

  const getStrokeColor = () => {
    if (isSelected) return '#0066ff';
    if (isHovered) return '#00aaff';
    return annotation.color || '#00ff00';
  };

  return (
    <Group>
      <Rect
        ref={shapeRef}
        x={annotation.x}
        y={annotation.y}
        width={annotation.width}
        height={annotation.height}
        stroke={getStrokeColor()}
        strokeWidth={isSelected ? 3 : 2}
        fill={`${getStrokeColor()}22`}
        onClick={handleSelect}
        onTap={handleSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={isSelected}
        cornerRadius={2}
      />

      {/* Label */}
      {(annotation.category || annotation.value) && (
        <Group>
          <Rect
            x={annotation.x}
            y={annotation.y! - 22}
            width={Math.max(80, (annotation.category?.length || 0) * 8 + 20)}
            height={20}
            fill={getStrokeColor()}
            cornerRadius={2}
          />
          <Text
            x={annotation.x! + 4}
            y={annotation.y! - 18}
            text={`${annotation.category}${annotation.value ? ': ' + annotation.value : ''}`}
            fontSize={12}
            fill="white"
            fontFamily="system-ui"
          />
        </Group>
      )}

      {/* Confidence score */}
      {annotation.confidence && (
        <Text
          x={annotation.x! + annotation.width! - 40}
          y={annotation.y! + 4}
          text={`${Math.round(annotation.confidence * 100)}%`}
          fontSize={10}
          fill={getStrokeColor()}
          fontFamily="system-ui"
        />
      )}

      {/* Transformer for resizing */}
      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Limit minimum size
            if (newBox.width < 10 || newBox.height < 10) {
              return oldBox;
            }
            return newBox;
          }}
          rotateEnabled={false}
          borderStroke="#0066ff"
          borderStrokeWidth={2}
          anchorStroke="#0066ff"
          anchorFill="white"
          anchorSize={8}
          anchorCornerRadius={2}
        />
      )}
    </Group>
  );
};

export default BoundingBoxAnnotation;