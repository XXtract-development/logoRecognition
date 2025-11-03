import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Line, Transformer, Group, Text } from 'react-konva';
import Konva from 'konva';
import { useHotkeys } from 'react-hotkeys-hook';
import { useAnnotationStore } from '../../stores/annotationStore';
import { useWebSocketConnection } from '../../hooks/useWebSocketConnection';
import { AnnotationType, Annotation, Point } from '../../types/annotation';
import BoundingBoxAnnotation from './BoundingBoxAnnotation';
import PolygonAnnotation from './PolygonAnnotation';
import PointAnnotation from './PointAnnotation';
import SelectionBox from './SelectionBox';
import CursorTracker from './CursorTracker';

interface AnnotationCanvasProps {
  imageUrl: string;
  datasetId: string;
  imageId: string;
  width: number;
  height: number;
  onAnnotationCreate?: (annotation: Annotation) => void;
  onAnnotationUpdate?: (id: string, updates: Partial<Annotation>) => void;
  onAnnotationDelete?: (id: string) => void;
}

const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  imageUrl,
  datasetId,
  imageId,
  width,
  height,
  onAnnotationCreate,
  onAnnotationUpdate,
  onAnnotationDelete,
}) => {
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const [tool, setTool] = useState<AnnotationType>('boundingBox');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Partial<Annotation> | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scale, setScale] = useState(1);
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 });

  const {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    selectedAnnotations,
    selectAnnotation,
    deselectAll,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useAnnotationStore();

  const {
    isConnected,
    sendMessage,
    collaborators,
    cursorPositions
  } = useWebSocketConnection(datasetId);

  // Keyboard shortcuts
  useHotkeys('ctrl+z, cmd+z', () => canUndo && undo(), [canUndo]);
  useHotkeys('ctrl+y, cmd+y', () => canRedo && redo(), [canRedo]);
  useHotkeys('delete, backspace', () => {
    selectedIds.forEach(id => {
      deleteAnnotation(id);
      onAnnotationDelete?.(id);
      sendMessage({
        type: 'annotation_delete',
        annotation_id: id,
      });
    });
  }, [selectedIds]);
  useHotkeys('escape', () => {
    setIsDrawing(false);
    setCurrentAnnotation(null);
    deselectAll();
    setSelectedIds([]);
  });
  useHotkeys('b', () => setTool('boundingBox'));
  useHotkeys('p', () => setTool('polygon'));
  useHotkeys('o', () => setTool('point'));
  useHotkeys('ctrl+a, cmd+a', (e) => {
    e.preventDefault();
    const allIds = annotations.map(a => a.id);
    setSelectedIds(allIds);
  }, [annotations]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== stageRef.current) return;

    const pos = stageRef.current!.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - stagePosition.x) / scale;
    const y = (pos.y - stagePosition.y) / scale;

    if (tool === 'boundingBox') {
      setIsDrawing(true);
      const newAnnotation: Partial<Annotation> = {
        id: `temp_${Date.now()}`,
        type: 'boundingBox',
        x,
        y,
        width: 0,
        height: 0,
        category: 'logo',
        value: '',
        imageId,
      };
      setCurrentAnnotation(newAnnotation);
    } else if (tool === 'polygon') {
      if (!currentAnnotation) {
        const newAnnotation: Partial<Annotation> = {
          id: `temp_${Date.now()}`,
          type: 'polygon',
          points: [{ x, y }],
          category: 'logo',
          value: '',
          imageId,
        };
        setCurrentAnnotation(newAnnotation);
        setIsDrawing(true);
      } else if (currentAnnotation.type === 'polygon') {
        const points = [...(currentAnnotation.points || []), { x, y }];
        setCurrentAnnotation({ ...currentAnnotation, points });
      }
    } else if (tool === 'point') {
      const newAnnotation: Annotation = {
        id: `ann_${Date.now()}`,
        type: 'point',
        x,
        y,
        category: 'keypoint',
        value: '',
        imageId,
        created: new Date(),
        updated: new Date(),
      };
      addAnnotation(newAnnotation);
      onAnnotationCreate?.(newAnnotation);
      sendMessage({
        type: 'annotation_create',
        annotation: newAnnotation,
      });
    }
  }, [tool, scale, stagePosition, currentAnnotation, imageId]);

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;

    const x = (pos.x - stagePosition.x) / scale;
    const y = (pos.y - stagePosition.y) / scale;

    // Send cursor position to collaborators
    sendMessage({
      type: 'cursor_move',
      position: { x, y },
    });

    if (isDrawing && currentAnnotation) {
      if (currentAnnotation.type === 'boundingBox') {
        const width = x - currentAnnotation.x!;
        const height = y - currentAnnotation.y!;
        setCurrentAnnotation({ ...currentAnnotation, width, height });
      }
    }
  }, [isDrawing, currentAnnotation, scale, stagePosition]);

  const handleMouseUp = useCallback(() => {
    if (isDrawing && currentAnnotation) {
      if (currentAnnotation.type === 'boundingBox') {
        // Normalize negative dimensions
        let { x, y, width, height } = currentAnnotation as any;
        if (width! < 0) {
          x += width!;
          width = Math.abs(width!);
        }
        if (height! < 0) {
          y += height!;
          height = Math.abs(height!);
        }

        // Only create if area > minimum threshold
        if (width! > 10 && height! > 10) {
          const newAnnotation: Annotation = {
            ...currentAnnotation as Annotation,
            id: `ann_${Date.now()}`,
            x,
            y,
            width,
            height,
            created: new Date(),
            updated: new Date(),
          };
          addAnnotation(newAnnotation);
          onAnnotationCreate?.(newAnnotation);
          sendMessage({
            type: 'annotation_create',
            annotation: newAnnotation,
          });
        }
        setIsDrawing(false);
        setCurrentAnnotation(null);
      }
    }
  }, [isDrawing, currentAnnotation]);

  // Polygon completion on double-click
  const handleDoubleClick = useCallback(() => {
    if (tool === 'polygon' && currentAnnotation?.type === 'polygon') {
      const points = currentAnnotation.points || [];
      if (points.length >= 3) {
        const newAnnotation: Annotation = {
          ...currentAnnotation as Annotation,
          id: `ann_${Date.now()}`,
          created: new Date(),
          updated: new Date(),
        };
        addAnnotation(newAnnotation);
        onAnnotationCreate?.(newAnnotation);
        sendMessage({
          type: 'annotation_create',
          annotation: newAnnotation,
        });
      }
      setIsDrawing(false);
      setCurrentAnnotation(null);
    }
  }, [tool, currentAnnotation]);

  // Zoom handling
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = stageRef.current!;
    const oldScale = scale;
    const pointer = stage.getPointerPosition()!;

    const mousePointTo = {
      x: (pointer.x - stagePosition.x) / oldScale,
      y: (pointer.y - stagePosition.y) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    setScale(clampedScale);
    setStagePosition({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, [scale, stagePosition]);

  // Selection handling
  const handleAnnotationSelect = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey) {
      setSelectedIds(prev =>
        prev.includes(id)
          ? prev.filter(sid => sid !== id)
          : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
    selectAnnotation(id);
  }, []);

  const handleAnnotationChange = useCallback((id: string, updates: Partial<Annotation>) => {
    updateAnnotation(id, updates);
    onAnnotationUpdate?.(id, updates);
    sendMessage({
      type: 'annotation_update',
      annotation_id: id,
      updates,
    });
  }, []);

  return (
    <div className="annotation-canvas-container">
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseup={handleMouseUp}
        onDblClick={handleDoubleClick}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={stagePosition.x}
        y={stagePosition.y}
        draggable={!isDrawing}
      >
        <Layer ref={layerRef}>
          {/* Render existing annotations */}
          {annotations.map(annotation => {
            if (annotation.type === 'boundingBox') {
              return (
                <BoundingBoxAnnotation
                  key={annotation.id}
                  annotation={annotation}
                  isSelected={selectedIds.includes(annotation.id)}
                  onSelect={handleAnnotationSelect}
                  onChange={handleAnnotationChange}
                  onDelete={() => {
                    deleteAnnotation(annotation.id);
                    onAnnotationDelete?.(annotation.id);
                  }}
                />
              );
            } else if (annotation.type === 'polygon') {
              return (
                <PolygonAnnotation
                  key={annotation.id}
                  annotation={annotation}
                  isSelected={selectedIds.includes(annotation.id)}
                  onSelect={handleAnnotationSelect}
                  onChange={handleAnnotationChange}
                  onDelete={() => {
                    deleteAnnotation(annotation.id);
                    onAnnotationDelete?.(annotation.id);
                  }}
                />
              );
            } else if (annotation.type === 'point') {
              return (
                <PointAnnotation
                  key={annotation.id}
                  annotation={annotation}
                  isSelected={selectedIds.includes(annotation.id)}
                  onSelect={handleAnnotationSelect}
                  onChange={handleAnnotationChange}
                  onDelete={() => {
                    deleteAnnotation(annotation.id);
                    onAnnotationDelete?.(annotation.id);
                  }}
                />
              );
            }
            return null;
          })}

          {/* Render current drawing annotation */}
          {currentAnnotation && currentAnnotation.type === 'boundingBox' && (
            <Rect
              x={currentAnnotation.x}
              y={currentAnnotation.y}
              width={currentAnnotation.width}
              height={currentAnnotation.height}
              stroke="#00ff00"
              strokeWidth={2}
              dash={[5, 5]}
              fill="rgba(0, 255, 0, 0.1)"
            />
          )}

          {currentAnnotation && currentAnnotation.type === 'polygon' && currentAnnotation.points && (
            <>
              <Line
                points={currentAnnotation.points.flatMap(p => [p.x, p.y])}
                stroke="#00ff00"
                strokeWidth={2}
                dash={[5, 5]}
              />
              {currentAnnotation.points.map((point, idx) => (
                <Circle
                  key={idx}
                  x={point.x}
                  y={point.y}
                  radius={4}
                  fill="#00ff00"
                />
              ))}
            </>
          )}

          {/* Render collaborator cursors */}
          {Object.entries(cursorPositions).map(([userId, position]) => (
            <CursorTracker
              key={userId}
              userId={userId}
              position={position}
              color={collaborators.find(c => c.id === userId)?.color || '#888'}
              name={collaborators.find(c => c.id === userId)?.name || 'Unknown'}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
};

export default AnnotationCanvas;