import { BoundingBox, CanvasSize, ClickCoordinates } from '../types/canvas';

export const boundingBoxUtils = {
  /**
   * Generate color based on bounding box index
   */
  generateColor: (index: number): string => {
    const colors = [
      '#1890ff', // Blue
      '#52c41a', // Green
      '#fa8c16', // Orange
      '#722ed1', // Purple
      '#eb2f96', // Magenta
      '#f5222d', // Red
      '#13c2c2', // Cyan
      '#a0d911', // Lime
      '#faad14', // Gold
      '#531dab'  // Violet
    ];
    return colors[index % colors.length];
  },

  /**
   * Generate unique ID for bounding box
   */
  generateId: (): string => {
    return `bbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Validate and constrain bounding box within canvas bounds
   */
  validateBounds: (box: BoundingBox, canvasSize: CanvasSize): BoundingBox => {
    const minSize = 20;

    // Ensure minimum size
    let width = Math.max(minSize, box.width);
    let height = Math.max(minSize, box.height);

    // Ensure box doesn't exceed canvas bounds
    let x = Math.max(0, Math.min(box.x, canvasSize.width - width));
    let y = Math.max(0, Math.min(box.y, canvasSize.height - height));

    // Adjust size if position + size exceeds canvas
    width = Math.min(width, canvasSize.width - x);
    height = Math.min(height, canvasSize.height - y);

    return {
      ...box,
      x,
      y,
      width,
      height
    };
  },

  /**
   * Calculate coordinates adjusted for zoom level
   */
  calculateZoomedCoordinates: (box: BoundingBox, zoom: number): BoundingBox => {
    return {
      ...box,
      x: box.x * zoom,
      y: box.y * zoom,
      width: box.width * zoom,
      height: box.height * zoom
    };
  },

  /**
   * Calculate actual coordinates from zoomed coordinates
   */
  calculateActualCoordinates: (box: BoundingBox, zoom: number): BoundingBox => {
    return {
      ...box,
      x: box.x / zoom,
      y: box.y / zoom,
      width: box.width / zoom,
      height: box.height / zoom
    };
  },

  /**
   * Create new bounding box at specified coordinates
   */
  createBoundingBox: (
    coordinates: ClickCoordinates,
    imageId: string,
    index: number,
    zoom: number = 1
  ): BoundingBox => {
    const defaultSize = 100; // Default size to match test expectations

    // Adjust coordinates for zoom level
    const actualX = coordinates.x / zoom;
    const actualY = coordinates.y / zoom;
    const actualSize = defaultSize / zoom;

    // Center the box on the click position
    const x = actualX - actualSize / 2;
    const y = actualY - actualSize / 2;

    return {
      id: boundingBoxUtils.generateId(),
      x: Math.max(0, x), // Ensure not negative
      y: Math.max(0, y), // Ensure not negative
      width: actualSize,
      height: actualSize,
      color: boundingBoxUtils.generateColor(index),
      imageId,
      selected: true,
      created: new Date()
    };
  },

  /**
   * Check if a point is within a bounding box
   */
  isPointInBoundingBox: (
    point: ClickCoordinates,
    box: BoundingBox,
    zoom: number = 1
  ): boolean => {
    const zoomedBox = boundingBoxUtils.calculateZoomedCoordinates(box, zoom);
    return (
      point.x >= zoomedBox.x &&
      point.x <= zoomedBox.x + zoomedBox.width &&
      point.y >= zoomedBox.y &&
      point.y <= zoomedBox.y + zoomedBox.height
    );
  },

  /**
   * Get resize handle at coordinates
   */
  getResizeHandle: (
    point: ClickCoordinates,
    box: BoundingBox,
    zoom: number = 1
  ): string | null => {
    const zoomedBox = boundingBoxUtils.calculateZoomedCoordinates(box, zoom);
    const handleSize = 8;
    const tolerance = 4;

    const handles = {
      'nw': { x: zoomedBox.x, y: zoomedBox.y },
      'ne': { x: zoomedBox.x + zoomedBox.width, y: zoomedBox.y },
      'sw': { x: zoomedBox.x, y: zoomedBox.y + zoomedBox.height },
      'se': { x: zoomedBox.x + zoomedBox.width, y: zoomedBox.y + zoomedBox.height },
      'n': { x: zoomedBox.x + zoomedBox.width / 2, y: zoomedBox.y },
      's': { x: zoomedBox.x + zoomedBox.width / 2, y: zoomedBox.y + zoomedBox.height },
      'w': { x: zoomedBox.x, y: zoomedBox.y + zoomedBox.height / 2 },
      'e': { x: zoomedBox.x + zoomedBox.width, y: zoomedBox.y + zoomedBox.height / 2 }
    };

    for (const [handle, pos] of Object.entries(handles)) {
      if (
        Math.abs(point.x - pos.x) <= handleSize + tolerance &&
        Math.abs(point.y - pos.y) <= handleSize + tolerance
      ) {
        return handle;
      }
    }

    return null;
  },

  /**
   * Calculate new bounding box dimensions when resizing
   */
  calculateResize: (
    box: BoundingBox,
    handle: string,
    deltaX: number,
    deltaY: number,
    zoom: number = 1
  ): BoundingBox => {
    const actualDeltaX = deltaX / zoom;
    const actualDeltaY = deltaY / zoom;
    let newBox = { ...box };

    switch (handle) {
      case 'nw':
        newBox.x += actualDeltaX;
        newBox.y += actualDeltaY;
        newBox.width -= actualDeltaX;
        newBox.height -= actualDeltaY;
        break;
      case 'ne':
        newBox.y += actualDeltaY;
        newBox.width += actualDeltaX;
        newBox.height -= actualDeltaY;
        break;
      case 'sw':
        newBox.x += actualDeltaX;
        newBox.width -= actualDeltaX;
        newBox.height += actualDeltaY;
        break;
      case 'se':
        newBox.width += actualDeltaX;
        newBox.height += actualDeltaY;
        break;
      case 'n':
        newBox.y += actualDeltaY;
        newBox.height -= actualDeltaY;
        break;
      case 's':
        newBox.height += actualDeltaY;
        break;
      case 'w':
        newBox.x += actualDeltaX;
        newBox.width -= actualDeltaX;
        break;
      case 'e':
        newBox.width += actualDeltaX;
        break;
    }

    // Ensure minimum size
    if (newBox.width < 20) {
      if (handle.includes('w')) {
        newBox.x = newBox.x + newBox.width - 20;
      }
      newBox.width = 20;
    }

    if (newBox.height < 20) {
      if (handle.includes('n')) {
        newBox.y = newBox.y + newBox.height - 20;
      }
      newBox.height = 20;
    }

    return newBox;
  }
};