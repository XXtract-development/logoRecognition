/**
 * Annotation Canvas Component
 * Epic 4.1 & 4.2: Interactive Konva canvas for drawing and editing bounding boxes
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Image, Rect, Transformer, Circle, Text, Group } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { TrainingImage, Annotation, Category } from '@/types/training.types';

interface AnnotationCanvasProps {
  image: TrainingImage;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  activeTool: 'select' | 'box' | 'smart';
  zoom: number;
  selectedCategory?: Category;
  onBoxCreated: (box: { x: number; y: number; width: number; height: number }) => void;
  onSmartClick: (x: number, y: number) => void;
  onAnnotationSelect: (id: string | null) => void;
}

interface DrawingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  image,
  annotations,
  selectedAnnotationId,
  activeTool,
  zoom,
  selectedCategory,
  onBoxCreated,
  onSmartClick,
  onAnnotationSelect,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingBox, setDrawingBox] = useState<DrawingBox | null>(null);
  const [smartClickPos, setSmartClickPos] = useState<{ x: number; y: number } | null>(null);

  // Load image
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = image.url;
    img.onload = () => {
      setLoadedImage(img);
      // Set stage size based on image and container
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const scale = Math.min(
          containerWidth / img.width,
          containerHeight / img.height,
          1
        );
        setStageSize({
          width: img.width * scale,
          height: img.height * scale,
        });
      }
    };
  }, [image.url]);

  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    const selectedNode = stageRef.current.findOne(`#annotation-${selectedAnnotationId}`);
    if (selectedNode) {
      transformerRef.current.nodes([selectedNode]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedAnnotationId]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && loadedImage) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const scale = Math.min(
          containerWidth / loadedImage.width,
          containerHeight / loadedImage.height,
          1
        );
        setStageSize({
          width: loadedImage.width * scale,
          height: loadedImage.height * scale,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadedImage]);

  // Convert pixel coordinates to normalized (0-1)
  const pixelToNormalized = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!loadedImage) return { x: 0, y: 0, width: 0, height: 0 };
      const imgWidth = stageSize.width;
      const imgHeight = stageSize.height;
      return {
        x: x / imgWidth,
        y: y / imgHeight,
        width: width / imgWidth,
        height: height / imgHeight,
      };
    },
    [loadedImage, stageSize]
  );

  // Convert normalized to pixel coordinates
  const normalizedToPixel = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const imgWidth = stageSize.width;
      const imgHeight = stageSize.height;
      return {
        x: x * imgWidth,
        y: y * imgHeight,
        width: width * imgWidth,
        height: height * imgHeight,
      };
    },
    [stageSize]
  );

  // Handle mouse down
  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      // Deselect if clicking on stage background
      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        onAnnotationSelect(null);
      }

      // Don't start drawing if clicking on an annotation
      if (e.target.name() === 'annotation') return;

      const stage = stageRef.current;
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Adjust for zoom
      const scale = zoom / 100;
      const adjustedX = pos.x / scale;
      const adjustedY = pos.y / scale;

      if (activeTool === 'box') {
        setIsDrawing(true);
        setDrawingBox({
          x: adjustedX,
          y: adjustedY,
          width: 0,
          height: 0,
        });
      } else if (activeTool === 'smart') {
        // Normalize the click position
        const normalized = pixelToNormalized(adjustedX, adjustedY, 0, 0);
        setSmartClickPos({ x: adjustedX, y: adjustedY });
        onSmartClick(normalized.x, normalized.y);
        // Clear after animation
        setTimeout(() => setSmartClickPos(null), 500);
      }
    },
    [activeTool, zoom, onAnnotationSelect, onSmartClick, pixelToNormalized]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (_e: KonvaEventObject<MouseEvent>) => {
      if (!isDrawing || activeTool !== 'box' || !drawingBox) return;

      const stage = stageRef.current;
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Adjust for zoom
      const scale = zoom / 100;
      const adjustedX = pos.x / scale;
      const adjustedY = pos.y / scale;

      setDrawingBox((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          width: adjustedX - prev.x,
          height: adjustedY - prev.y,
        };
      });
    },
    [isDrawing, activeTool, drawingBox, zoom]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !drawingBox) {
      setIsDrawing(false);
      setDrawingBox(null);
      return;
    }

    // Normalize the box (handle negative width/height from drawing right-to-left or bottom-to-top)
    const normalizedBox = {
      x: drawingBox.width < 0 ? drawingBox.x + drawingBox.width : drawingBox.x,
      y: drawingBox.height < 0 ? drawingBox.y + drawingBox.height : drawingBox.y,
      width: Math.abs(drawingBox.width),
      height: Math.abs(drawingBox.height),
    };

    // Only create if box is larger than minimum size
    if (normalizedBox.width > 10 && normalizedBox.height > 10) {
      // Convert to normalized coordinates
      const normalized = pixelToNormalized(
        normalizedBox.x,
        normalizedBox.y,
        normalizedBox.width,
        normalizedBox.height
      );
      onBoxCreated(normalized);
    }

    setIsDrawing(false);
    setDrawingBox(null);
  }, [isDrawing, drawingBox, pixelToNormalized, onBoxCreated]);

  // Get annotation color based on category
  const getAnnotationColor = (annotation: Annotation) => {
    if (annotation.id === selectedAnnotationId) {
      return '#007AFF';
    }
    // Find category color or use default
    return selectedCategory?.id === annotation.categoryId
      ? selectedCategory.color
      : '#52c41a';
  };

  // Render cursor based on active tool
  const getCursor = () => {
    switch (activeTool) {
      case 'box':
        return 'crosshair';
      case 'smart':
        return 'cell';
      case 'select':
      default:
        return 'default';
    }
  };

  const scale = zoom / 100;

  return (
    <div
      ref={containerRef}
      className="annotation-canvas-container"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        cursor: getCursor(),
      }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width * scale}
        height={stageSize.height * scale}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Layer>
          {/* Background Image */}
          {loadedImage && (
            <Image
              image={loadedImage}
              width={stageSize.width}
              height={stageSize.height}
            />
          )}

          {/* Existing Annotations */}
          {annotations.map((annotation) => {
            const pixelBox = normalizedToPixel(
              annotation.boundingBox.x,
              annotation.boundingBox.y,
              annotation.boundingBox.width,
              annotation.boundingBox.height
            );
            const isSelected = annotation.id === selectedAnnotationId;
            const color = getAnnotationColor(annotation);

            return (
              <Group key={annotation.id}>
                <Rect
                  id={`annotation-${annotation.id}`}
                  name="annotation"
                  x={pixelBox.x}
                  y={pixelBox.y}
                  width={pixelBox.width}
                  height={pixelBox.height}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                  dash={isSelected ? [] : [5, 5]}
                  fill={`${color}20`}
                  draggable={activeTool === 'select'}
                  onClick={() => onAnnotationSelect(annotation.id)}
                  onTap={() => onAnnotationSelect(annotation.id)}
                />
                {/* Label */}
                <Rect
                  x={pixelBox.x}
                  y={pixelBox.y - 22}
                  width={Math.max(80, annotation.categoryName.length * 8 + 16)}
                  height={20}
                  fill={color}
                  cornerRadius={2}
                />
                <Text
                  x={pixelBox.x + 4}
                  y={pixelBox.y - 18}
                  text={annotation.categoryName}
                  fontSize={12}
                  fill="white"
                />
              </Group>
            );
          })}

          {/* Drawing Box (while drawing) */}
          {isDrawing && drawingBox && (
            <Rect
              x={drawingBox.width < 0 ? drawingBox.x + drawingBox.width : drawingBox.x}
              y={drawingBox.height < 0 ? drawingBox.y + drawingBox.height : drawingBox.y}
              width={Math.abs(drawingBox.width)}
              height={Math.abs(drawingBox.height)}
              stroke={selectedCategory?.color || '#007AFF'}
              strokeWidth={2}
              dash={[5, 5]}
              fill={`${selectedCategory?.color || '#007AFF'}20`}
            />
          )}

          {/* Smart Click Indicator */}
          {smartClickPos && (
            <Circle
              x={smartClickPos.x}
              y={smartClickPos.y}
              radius={8}
              fill="#007AFF"
              stroke="white"
              strokeWidth={2}
              shadowColor="black"
              shadowBlur={10}
              shadowOpacity={0.5}
            />
          )}

          {/* Transformer for selected annotation */}
          {activeTool === 'select' && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // Limit minimum size
                if (newBox.width < 20 || newBox.height < 20) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
};

AnnotationCanvas.displayName = 'AnnotationCanvas';
