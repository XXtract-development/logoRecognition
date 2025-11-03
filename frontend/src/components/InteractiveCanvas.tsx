import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text } from 'react-konva';
import { Button, Space, message, Modal } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined, ReloadOutlined, UndoOutlined, RedoOutlined } from '@ant-design/icons';
import Konva from 'konva';
import { BoundingBox, CanvasProps, DragState } from '../types/canvas';
import { boundingBoxUtils } from '../utils/boundingBoxUtils';
import { useCanvasZoom } from '../hooks/useCanvasZoom';
import { useUndoRedo } from '../hooks/useUndoRedo';
import './InteractiveCanvas.css';

const areBoundingBoxesEqual = (a: BoundingBox[] = [], b: BoundingBox[] = []) => {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const boxA = a[i];
    const boxB = b[i];
    if (!boxB) return false;
    const createdA = boxA.created instanceof Date ? boxA.created.getTime() : new Date(boxA.created).getTime();
    const createdB = boxB.created instanceof Date ? boxB.created.getTime() : new Date(boxB.created).getTime();

    if (
      boxA.id !== boxB.id ||
      boxA.x !== boxB.x ||
      boxA.y !== boxB.y ||
      boxA.width !== boxB.width ||
      boxA.height !== boxB.height ||
      boxA.color !== boxB.color ||
      boxA.imageId !== boxB.imageId ||
      boxA.selected !== boxB.selected ||
      createdA !== createdB ||
      boxA.category !== boxB.category ||
      boxA.value !== boxB.value
    ) {
      return false;
    }
  }

  return true;
};

const InteractiveCanvas: React.FC<CanvasProps> = ({
  imageUrl,
  imageId,
  onBoundingBoxCreate,
  onBoundingBoxUpdate,
  onBoundingBoxDelete,
  zoom: externalZoom,
  maxBoxes = 10,
  onImageLoad,
  externalBoundingBoxes = [],
  selectedBoundingBoxId,
  onBoundingBoxSelect,
}) => {
  const [boundingBoxes, undoRedoActions] = useUndoRedo<BoundingBox[]>(externalBoundingBoxes);
  const [selectedBox, setSelectedBox] = useState<string | null>(selectedBoundingBoxId ?? null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [hoveredBox, setHoveredBox] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingBox, setDrawingBox] = useState<BoundingBox | null>(null);
  const [drawStartPos, setDrawStartPos] = useState<{ x: number; y: number } | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [panStartPos, setPanStartPos] = useState<{ x: number; y: number } | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { zoom, zoomIn, zoomOut, resetZoom } = useCanvasZoom(externalZoom);
  const boundingBoxesRef = useRef<BoundingBox[]>(externalBoundingBoxes);
  const previousExternalRef = useRef<BoundingBox[]>(externalBoundingBoxes);

  useEffect(() => {
    boundingBoxesRef.current = boundingBoxes;
  }, [boundingBoxes]);

  useEffect(() => {
    setSelectedBox(selectedBoundingBoxId ?? null);
  }, [selectedBoundingBoxId]);

  useEffect(() => {
    const normalized = externalBoundingBoxes || [];
    if (!areBoundingBoxesEqual(previousExternalRef.current, normalized)) {
      if (!areBoundingBoxesEqual(boundingBoxesRef.current, normalized)) {
        undoRedoActions.set(normalized);
      }
    }
    previousExternalRef.current = normalized;
  }, [externalBoundingBoxes, undoRedoActions]);

  useEffect(() => {
    if (selectedBox && !boundingBoxes.some(box => box.id === selectedBox)) {
      setSelectedBox(null);
    }
  }, [boundingBoxes, selectedBox]);

  useEffect(() => {
    if (onBoundingBoxSelect) {
      onBoundingBoxSelect(selectedBox ?? null);
    }
  }, [selectedBox, onBoundingBoxSelect]);

  // Load image
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      // Adjust stage size to fit image while maintaining aspect ratio
      const maxWidth = 800;
      const maxHeight = 600;
      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;
      const aspectRatio = naturalWidth && naturalHeight
        ? naturalWidth / naturalHeight
        : 1;

      let width = naturalWidth;
      let height = naturalHeight;

      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }

      setStageSize({ width, height });
      // Call the onImageLoad callback with the display size once ready
      if (onImageLoad) {
        onImageLoad(img, { width, height });
      }
    };
    img.src = imageUrl;
  }, [imageUrl, onImageLoad]);

  // Handle panning with space bar
  const handlePanStart = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!spacePressed) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    setIsPanning(true);
    setPanStartPos({
      x: pointerPosition.x - panOffset.x,
      y: pointerPosition.y - panOffset.y
    });
  }, [spacePressed, panOffset]);

  const handlePanMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPanning || !panStartPos || !spacePressed) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    setPanOffset({
      x: pointerPosition.x - panStartPos.x,
      y: pointerPosition.y - panStartPos.y
    });
  }, [isPanning, panStartPos, spacePressed]);

  // Handle double click zoom (20% in/out)
  const handleDoubleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage || !image) return;

    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    // Zoom in 20% or out 20% based on shift key
    if (e.evt.shiftKey) {
      // Zoom out 20%
      zoomOut();
    } else {
      // Zoom in 20%
      zoomIn();
    }
  }, [image, zoomIn, zoomOut]);

  // Handle mouse down to start drawing bounding box
  const handleStageMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage || !image) return;

    // If space is pressed, start panning instead of drawing
    if (spacePressed) {
      handlePanStart(e);
      return;
    }

    // Get pointer position relative to the stage
    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    // Convert stage coordinates to actual image coordinates
    const actualPos = {
      x: pointerPosition.x / zoom,
      y: pointerPosition.y / zoom
    };

    // Check if clicking on stage background or image (not a bounding box)
    const targetName = e.target.name();
    const isBackgroundClick = e.target === e.target.getStage() ||
                             e.target.className === 'Image' ||
                             !targetName ||
                             targetName === '' ||
                             !targetName.startsWith('bbox-');

    if (isBackgroundClick) {
      // Deselect current box
      setSelectedBox(null);

      // Start drawing new bounding box if under max limit
      if (boundingBoxes.length < maxBoxes) {
        setIsDrawing(true);
        setDrawStartPos(actualPos);

        // Create initial box with zero size
        const newBox: BoundingBox = {
          id: boundingBoxUtils.generateId(),
          x: actualPos.x,
          y: actualPos.y,
          width: 0,
          height: 0,
          color: boundingBoxUtils.generateColor(boundingBoxes.length),
          imageId,
          selected: true,
          created: new Date()
        };
        setDrawingBox(newBox);
      } else {
        message.warning(`Maximum ${maxBoxes} bounding boxes per image`);
      }
    }
  }, [boundingBoxes, imageId, image, maxBoxes, zoom, spacePressed, handlePanStart]);

  // Handle mouse move while drawing
  const handleStageMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // If panning, handle pan move instead
    if (isPanning && spacePressed) {
      handlePanMove(e);
      return;
    }

    if (!isDrawing || !drawStartPos || !drawingBox) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPosition = stage.getPointerPosition();
    if (!pointerPosition) return;

    const actualPos = {
      x: pointerPosition.x / zoom,
      y: pointerPosition.y / zoom
    };

    // Calculate box dimensions based on start and current position
    const minX = Math.min(drawStartPos.x, actualPos.x);
    const minY = Math.min(drawStartPos.y, actualPos.y);
    const maxX = Math.max(drawStartPos.x, actualPos.x);
    const maxY = Math.max(drawStartPos.y, actualPos.y);

    const updatedBox: BoundingBox = {
      ...drawingBox,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };

    setDrawingBox(updatedBox);
  }, [isDrawing, drawStartPos, drawingBox, zoom, isPanning, spacePressed, handlePanMove]);

  // Handle mouse up to finish drawing
  const handleStageMouseUp = useCallback(() => {
    if (!isDrawing || !drawingBox || !image) return;

    // Only create box if it has minimum size
    const MIN_SIZE = 10;
    if (drawingBox.width >= MIN_SIZE && drawingBox.height >= MIN_SIZE) {
      // Validate bounds
      const validatedBox = boundingBoxUtils.validateBounds(drawingBox, {
        width: image.width,
        height: image.height
      });

      const newBoxes = [...boundingBoxes, validatedBox];
      undoRedoActions.push(newBoxes);
      setSelectedBox(validatedBox.id);
      onBoundingBoxCreate(validatedBox);
    }

    // Reset drawing state
    setIsDrawing(false);
    setDrawingBox(null);
    setDrawStartPos(null);
  }, [isDrawing, drawingBox, image, boundingBoxes, undoRedoActions, onBoundingBoxCreate]);

  // Handle bounding box selection
  const handleBoxClick = useCallback((boxId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    setSelectedBox(selectedBox === boxId ? null : boxId);
  }, [selectedBox]);

  // Handle bounding box drag
  const handleBoxDragStart = useCallback((boxId: string) => {
    setDragState({
      isDragging: true,
      boxId,
      startPosition: { x: 0, y: 0 }
    });
  }, []);

  const handleBoxDragMove = useCallback((boxId: string, pos: { x: number; y: number }) => {
    const newBoxes = boundingBoxes.map(box =>
      box.id === boxId
        ? { ...box, x: pos.x, y: pos.y }
        : box
    );
    undoRedoActions.push(newBoxes);
  }, [boundingBoxes, undoRedoActions]);

  const handleBoxDragEnd = useCallback((boxId: string) => {
    setDragState(null);
    const updatedBox = boundingBoxes.find(box => box.id === boxId);
    if (updatedBox && image) {
      const validatedBox = boundingBoxUtils.validateBounds(updatedBox, {
        width: image.width,
        height: image.height
      });
      const newBoxes = boundingBoxes.map(box =>
        box.id === boxId ? validatedBox : box
      );
      undoRedoActions.push(newBoxes);
      onBoundingBoxUpdate(boxId, validatedBox);
    }
  }, [boundingBoxes, image, onBoundingBoxUpdate, undoRedoActions]);

  // Handle bounding box deletion
  const handleBoxDelete = useCallback((boxId: string) => {
    const isLastBox = boundingBoxes.length === 1;

    const performDelete = () => {
      const newBoxes = boundingBoxes.filter(box => box.id !== boxId);
      undoRedoActions.push(newBoxes);
      setSelectedBox(null);
      onBoundingBoxDelete(boxId);
    };

    if (isLastBox) {
      Modal.confirm({
        title: 'Delete Last Bounding Box',
        content: 'Are you sure you want to delete the last bounding box?',
        okText: 'Yes, Delete',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: performDelete
      });
    } else {
      performDelete();
    }
  }, [boundingBoxes, onBoundingBoxDelete, undoRedoActions]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo shortcuts - temporarily disabled
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undoRedoActions.undo();
          return;
        }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          undoRedoActions.redo();
          return;
        }
      }

      // Only handle keys when canvas is focused
      if (!canvasRef.current?.contains(document.activeElement)) return;

      const selectedBoxData = selectedBox ? boundingBoxes.find(box => box.id === selectedBox) : null;
      if (!selectedBoxData) return;

      const moveStep = e.shiftKey ? 10 : 1;
      let newBox = { ...selectedBoxData };

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          newBox.x = Math.max(0, newBox.x - moveStep);
          break;
        case 'ArrowRight':
          e.preventDefault();
          newBox.x = Math.min((image?.width || 800) - newBox.width, newBox.x + moveStep);
          break;
        case 'ArrowUp':
          e.preventDefault();
          newBox.y = Math.max(0, newBox.y - moveStep);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newBox.y = Math.min((image?.height || 600) - newBox.height, newBox.y + moveStep);
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          handleBoxDelete(selectedBox);
          break;
        case 'Escape':
          e.preventDefault();
          setSelectedBox(null);
          break;
        default:
          return;
      }

      if (newBox.x !== selectedBoxData.x || newBox.y !== selectedBoxData.y) {
        const newBoxes = boundingBoxes.map(box =>
          box.id === selectedBox ? newBox : box
        );
        undoRedoActions.push(newBoxes);
        onBoundingBoxUpdate(selectedBox, newBox);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedBox, boundingBoxes, handleBoxDelete, onBoundingBoxUpdate, image, undoRedoActions]);

  // Space bar for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressed && !isDrawing) {
        e.preventDefault();
        console.log('🟢 Space pressed - panning mode activated');
        setSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        console.log('🔴 Space released - panning mode deactivated');
        setSpacePressed(false);
        setIsPanning(false);
        setPanStartPos(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed, isDrawing]);

  // Update cursor based on space bar state
  useEffect(() => {
    const container = canvasRef.current;
    const stage = stageRef.current;

    console.log('🖱️ Cursor update:', { spacePressed, isPanning });

    // Get the canvas element from Konva Stage
    if (stage) {
      const stageContainer = stage.container();
      const canvas = stageContainer?.querySelector('canvas');

      if (canvas) {
        // Remove all cursor classes
        canvas.classList.remove('panning', 'grabbing');

        // Add appropriate cursor class
        if (spacePressed && isPanning) {
          canvas.classList.add('grabbing');
          console.log('✅ Canvas cursor: grabbing');
        } else if (spacePressed && !isPanning) {
          canvas.classList.add('panning');
          console.log('✅ Canvas cursor: grab (panning)');
        } else {
          console.log('✅ Canvas cursor: default (crosshair)');
        }
      }
    }

    // Also set cursor on container div as backup
    if (container) {
      if (spacePressed && isPanning) {
        container.style.cursor = 'grabbing';
      } else if (spacePressed && !isPanning) {
        container.style.cursor = 'grab';
      } else {
        container.style.cursor = 'default';
      }
    }
  }, [spacePressed, isPanning]);

  // Handle resize start
  const handleResizeStart = useCallback((boxId: string, handle: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    setIsResizing(true);
    setResizeHandle(handle);
    setSelectedBox(boxId);

    const pos = e.target.getStage()?.getPointerPosition();
    if (pos) {
      setDragState({
        isDragging: false,
        boxId,
        startPosition: pos
      });
    }
  }, []);

  // Handle resize move
  const handleResizeMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isResizing || !resizeHandle || !dragState?.boxId || !dragState?.startPosition) return;

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos || !image) return;

    const deltaX = (pos.x - dragState.startPosition.x) / zoom;
    const deltaY = (pos.y - dragState.startPosition.y) / zoom;

    const newBoxes = boundingBoxes.map(box => {
      if (box.id !== dragState.boxId) return box;

      const resizedBox = boundingBoxUtils.calculateResize(box, resizeHandle, deltaX, deltaY, 1);
      return boundingBoxUtils.validateBounds(resizedBox, {
        width: image.width,
        height: image.height
      });
    });
    undoRedoActions.push(newBoxes);

    // Update start position for next move
    setDragState(prev => prev ? { ...prev, startPosition: pos } : null);
  }, [isResizing, resizeHandle, dragState, zoom, image, boundingBoxes, undoRedoActions]);

  // Handle resize end
  const handleResizeEnd = useCallback(() => {
    if (isResizing && dragState?.boxId) {
      const updatedBox = boundingBoxes.find(box => box.id === dragState.boxId);
      if (updatedBox) {
        onBoundingBoxUpdate(dragState.boxId, updatedBox);
      }
    }

    setIsResizing(false);
    setResizeHandle(null);
    setDragState(null);
  }, [isResizing, dragState, boundingBoxes, onBoundingBoxUpdate]);

  // Handle mouse enter/leave for hover effects
  const handleBoxMouseEnter = useCallback((boxId: string) => {
    setHoveredBox(boxId);
  }, []);

  const handleBoxMouseLeave = useCallback(() => {
    setHoveredBox(null);
  }, []);

  // Render bounding box with all interactions
  const renderBoundingBox = useCallback((box: BoundingBox) => {
    const isSelected = selectedBox === box.id;
    const isHovered = hoveredBox === box.id;
    // Don't apply zoom here since Stage already handles scaling
    // Bounding boxes should use original coordinates

    const strokeWidth = isSelected || isHovered ? 3 : 2;
    const stroke = isSelected ? '#ff4d4f' : box.color;

    return (
      <React.Fragment key={box.id}>
        {/* Main bounding box rectangle */}
        <Rect
          name={`bbox-${box.id}`}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill={`${box.color}1A`} // 10% opacity
          draggable={!isResizing}
          onDragStart={() => !isResizing && handleBoxDragStart(box.id)}
          onDragMove={(e) => !isResizing && handleBoxDragMove(box.id, e.target.position())}
          onDragEnd={() => !isResizing && handleBoxDragEnd(box.id)}
          onClick={(e) => handleBoxClick(box.id, e)}
          onMouseEnter={() => handleBoxMouseEnter(box.id)}
          onMouseLeave={handleBoxMouseLeave}
          shadowColor={isSelected || isHovered ? box.color : undefined}
          shadowBlur={isSelected || isHovered ? 10 : 0}
          shadowOpacity={0.3}
        />

        {/* Delete icon on hover */}
        {isHovered && (
          <>
            <Rect
              x={box.x + box.width - 12}
              y={box.y - 12}
              width={24}
              height={24}
              fill="#ff4d4f"
              cornerRadius={12}
              onClick={() => handleBoxDelete(box.id)}
            />
            <Text
              x={box.x + box.width - 8}
              y={box.y - 8}
              text="🗑️"
              fontSize={16}
              fill="white"
              onClick={() => handleBoxDelete(box.id)}
            />
          </>
        )}

        {/* Resize handles for selected box */}
        {isSelected && (
          <>
            {/* Corner handles */}
            {['nw', 'ne', 'sw', 'se'].map((handle) => {
              let x = box.x;
              let y = box.y;

              if (handle.includes('e')) x += box.width;
              if (handle.includes('s')) y += box.height;

              return (
                <Rect
                  key={handle}
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  fill="#1890ff"
                  stroke="white"
                  strokeWidth={1}
                  onMouseDown={(e) => handleResizeStart(box.id, handle, e)}
                  style={{ cursor: `${handle}-resize` }}
                />
              );
            })}

            {/* Side handles */}
            {['n', 's', 'w', 'e'].map((handle) => {
              let x = box.x;
              let y = box.y;

              if (handle === 'n' || handle === 's') {
                x += box.width / 2;
                if (handle === 's') y += box.height;
              } else {
                y += box.height / 2;
                if (handle === 'e') x += box.width;
              }

              return (
                <Rect
                  key={handle}
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  fill="#1890ff"
                  stroke="white"
                  strokeWidth={1}
                  onMouseDown={(e) => handleResizeStart(box.id, handle, e)}
                  style={{ cursor: `${handle}-resize` }}
                />
              );
            })}
          </>
        )}
      </React.Fragment>
    );
  }, [
    selectedBox,
    hoveredBox,
    handleBoxClick,
    handleBoxDragStart,
    handleBoxDragMove,
    handleBoxDragEnd,
    handleBoxDelete,
    handleBoxMouseEnter,
    handleBoxMouseLeave,
    handleResizeStart,
    isResizing
  ]);

  return (
    <div className="interactive-canvas" ref={canvasRef} tabIndex={0}>
      {/* Toolbar */}
      <div className="canvas-toolbar">
        <Space>
          <Button
            icon={<ZoomInOutlined />}
            onClick={zoomIn}
            disabled={zoom >= 4}
            title="Zoom In"
          />
          <Button
            icon={<ZoomOutOutlined />}
            onClick={zoomOut}
            disabled={zoom <= 0.5}
            title="Zoom Out"
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={resetZoom}
            title="Reset Zoom"
          />
          <span className="zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            icon={<UndoOutlined />}
            onClick={() => undoRedoActions.undo()}
            disabled={!undoRedoActions.canUndo}
            title="Undo (Ctrl+Z)"
          />
          <Button
            icon={<RedoOutlined />}
            onClick={() => undoRedoActions.redo()}
            disabled={!undoRedoActions.canRedo}
            title="Redo (Ctrl+Y)"
          />
          <span className="box-count">
            Boxes: {boundingBoxes.length}/{maxBoxes}
          </span>
        </Space>
      </div>

      {/* Canvas */}
      <div className="canvas-container">
        {!image ? (
          <div style={{
            width: stageSize.width,
            height: stageSize.height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f5f5f5',
            border: '2px dashed #d9d9d9',
            borderRadius: '8px'
          }}>
            Loading image...
          </div>
        ) : (
          <Stage
            ref={stageRef}
            width={stageSize.width * zoom}
            height={stageSize.height * zoom}
            onMouseDown={handleStageMouseDown}
            onMouseMove={(e) => {
              handleStageMouseMove(e);
              handleResizeMove(e);
            }}
            onMouseUp={() => {
              handleStageMouseUp();
              handleResizeEnd();
            }}
            onDblClick={handleDoubleClick}
            scaleX={zoom}
            scaleY={zoom}
            x={panOffset.x}
            y={panOffset.y}
          >
            <Layer>
              {/* Background image */}
              <KonvaImage
                image={image}
                width={stageSize.width}
                height={stageSize.height}
              />

              {/* Bounding boxes */}
              {boundingBoxes.map(renderBoundingBox)}

              {/* Drawing box preview */}
              {isDrawing && drawingBox && (
                <Rect
                  x={drawingBox.x}
                  y={drawingBox.y}
                  width={drawingBox.width}
                  height={drawingBox.height}
                  stroke="#1890ff"
                  strokeWidth={2}
                  dash={[5, 5]}
                  fill="rgba(24, 144, 255, 0.1)"
                />
              )}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
};

export default InteractiveCanvas;
