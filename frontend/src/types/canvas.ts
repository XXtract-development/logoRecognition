export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  imageId: string;
  selected: boolean;
  created: Date;
  category?: string;
  value?: string;
  categoryId?: string;
  valueId?: string;
  tags?: string[];
  metadata?: Record<string, string>;
  confidence?: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface CanvasProps {
  imageUrl: string;
  imageId: string;
  onBoundingBoxCreate: (bbox: BoundingBox) => void;
  onBoundingBoxUpdate: (id: string, bbox: BoundingBox) => void;
  onBoundingBoxDelete: (id: string) => void;
  zoom: number;
  maxBoxes?: number;
  onImageLoad?: (image: HTMLImageElement, displaySize: CanvasSize) => void;
  externalBoundingBoxes?: BoundingBox[];
  selectedBoundingBoxId?: string | null;
  onBoundingBoxSelect?: (id: string | null) => void;
}

export interface DragState {
  isDragging: boolean;
  boxId: string | null;
  startPosition: { x: number; y: number };
  resizeHandle?: ResizeHandle;
}

export interface ResizeHandle {
  type: 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right';
  position: { x: number; y: number };
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface ZoomControls {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export interface ClickCoordinates {
  x: number;
  y: number;
}

export interface BoundingBoxEvent {
  boxId: string;
  action: 'select' | 'deselect' | 'delete' | 'move' | 'resize';
  position?: ClickCoordinates;
}
