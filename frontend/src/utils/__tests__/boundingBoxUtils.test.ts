import { boundingBoxUtils } from '../boundingBoxUtils';
import { BoundingBox, CanvasSize, ClickCoordinates } from '../../types/canvas';

describe('boundingBoxUtils', () => {
  describe('generateColor', () => {
    it('should return different colors for different indices', () => {
      const color1 = boundingBoxUtils.generateColor(0);
      const color2 = boundingBoxUtils.generateColor(1);
      expect(color1).not.toBe(color2);
    });

    it('should cycle through colors when index exceeds color array length', () => {
      const color1 = boundingBoxUtils.generateColor(0);
      const color11 = boundingBoxUtils.generateColor(10);
      expect(color1).toBe(color11);
    });

    it('should return valid hex color codes', () => {
      const color = boundingBoxUtils.generateColor(0);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = boundingBoxUtils.generateId();
      const id2 = boundingBoxUtils.generateId();
      expect(id1).not.toBe(id2);
    });

    it('should start with bbox_ prefix', () => {
      const id = boundingBoxUtils.generateId();
      expect(id).toMatch(/^bbox_/);
    });
  });

  describe('validateBounds', () => {
    const canvasSize: CanvasSize = { width: 800, height: 600 };

    const mockBox: BoundingBox = {
      id: 'test',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      color: '#1890ff',
      imageId: 'test-image',
      selected: false,
      created: new Date()
    };

    it('should not modify valid bounding box', () => {
      const result = boundingBoxUtils.validateBounds(mockBox, canvasSize);
      expect(result).toEqual(mockBox);
    });

    it('should constrain box that exceeds right boundary', () => {
      const outOfBoundsBox = { ...mockBox, x: 700, width: 200 };
      const result = boundingBoxUtils.validateBounds(outOfBoundsBox, canvasSize);
      expect(result.x + result.width).toBeLessThanOrEqual(canvasSize.width);
    });

    it('should constrain box that exceeds bottom boundary', () => {
      const outOfBoundsBox = { ...mockBox, y: 500, height: 200 };
      const result = boundingBoxUtils.validateBounds(outOfBoundsBox, canvasSize);
      expect(result.y + result.height).toBeLessThanOrEqual(canvasSize.height);
    });

    it('should enforce minimum size', () => {
      const tinyBox = { ...mockBox, width: 10, height: 10 };
      const result = boundingBoxUtils.validateBounds(tinyBox, canvasSize);
      expect(result.width).toBeGreaterThanOrEqual(20);
      expect(result.height).toBeGreaterThanOrEqual(20);
    });

    it('should constrain negative positions', () => {
      const negativeBox = { ...mockBox, x: -50, y: -30 };
      const result = boundingBoxUtils.validateBounds(negativeBox, canvasSize);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateZoomedCoordinates', () => {
    const mockBox: BoundingBox = {
      id: 'test',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      color: '#1890ff',
      imageId: 'test-image',
      selected: false,
      created: new Date()
    };

    it('should scale coordinates by zoom factor', () => {
      const zoom = 2;
      const result = boundingBoxUtils.calculateZoomedCoordinates(mockBox, zoom);

      expect(result.x).toBe(mockBox.x * zoom);
      expect(result.y).toBe(mockBox.y * zoom);
      expect(result.width).toBe(mockBox.width * zoom);
      expect(result.height).toBe(mockBox.height * zoom);
    });

    it('should preserve other properties', () => {
      const result = boundingBoxUtils.calculateZoomedCoordinates(mockBox, 1.5);

      expect(result.id).toBe(mockBox.id);
      expect(result.color).toBe(mockBox.color);
      expect(result.imageId).toBe(mockBox.imageId);
      expect(result.selected).toBe(mockBox.selected);
    });
  });

  describe('calculateActualCoordinates', () => {
    const mockBox: BoundingBox = {
      id: 'test',
      x: 200,
      y: 200,
      width: 400,
      height: 300,
      color: '#1890ff',
      imageId: 'test-image',
      selected: false,
      created: new Date()
    };

    it('should scale coordinates back from zoom factor', () => {
      const zoom = 2;
      const result = boundingBoxUtils.calculateActualCoordinates(mockBox, zoom);

      expect(result.x).toBe(mockBox.x / zoom);
      expect(result.y).toBe(mockBox.y / zoom);
      expect(result.width).toBe(mockBox.width / zoom);
      expect(result.height).toBe(mockBox.height / zoom);
    });
  });

  describe('createBoundingBox', () => {
    const coordinates: ClickCoordinates = { x: 150, y: 200 };
    const imageId = 'test-image';
    const index = 0;

    it('should create valid bounding box', () => {
      const result = boundingBoxUtils.createBoundingBox(coordinates, imageId, index);

      expect(result.imageId).toBe(imageId);
      expect(result.selected).toBe(true);
      expect(result.id).toMatch(/^bbox_/);
      expect(result.color).toBe(boundingBoxUtils.generateColor(index));
      expect(result.created).toBeInstanceOf(Date);
    });

    it('should adjust coordinates and size for zoom', () => {
      const zoom = 2;
      const result = boundingBoxUtils.createBoundingBox(coordinates, imageId, index, zoom);

      // The function centers the box on the click position
      // So the final x = (coordinates.x / zoom) - (defaultSize / zoom) / 2
      // x = (150 / 2) - (100 / 2) / 2 = 75 - 25 = 50
      expect(result.x).toBe((coordinates.x / zoom) - (100 / zoom) / 2);
      expect(result.y).toBe((coordinates.y / zoom) - (100 / zoom) / 2);
      expect(result.width).toBe(100 / zoom);
      expect(result.height).toBe(100 / zoom);
    });
  });

  describe('isPointInBoundingBox', () => {
    const mockBox: BoundingBox = {
      id: 'test',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      color: '#1890ff',
      imageId: 'test-image',
      selected: false,
      created: new Date()
    };

    it('should return true for point inside bounding box', () => {
      const point = { x: 150, y: 150 };
      const result = boundingBoxUtils.isPointInBoundingBox(point, mockBox);
      expect(result).toBe(true);
    });

    it('should return false for point outside bounding box', () => {
      const point = { x: 50, y: 50 };
      const result = boundingBoxUtils.isPointInBoundingBox(point, mockBox);
      expect(result).toBe(false);
    });

    it('should handle zoom factor correctly', () => {
      const point = { x: 300, y: 300 }; // Would be inside at 2x zoom
      const zoom = 2;
      const result = boundingBoxUtils.isPointInBoundingBox(point, mockBox, zoom);
      expect(result).toBe(true);
    });
  });

  describe('getResizeHandle', () => {
    const mockBox: BoundingBox = {
      id: 'test',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      color: '#1890ff',
      imageId: 'test-image',
      selected: false,
      created: new Date()
    };

    it('should return correct handle for corner positions', () => {
      const nwPoint = { x: 100, y: 100 };
      const result = boundingBoxUtils.getResizeHandle(nwPoint, mockBox);
      expect(result).toBe('nw');
    });

    it('should return null for points not near handles', () => {
      const centerPoint = { x: 200, y: 175 };
      const result = boundingBoxUtils.getResizeHandle(centerPoint, mockBox);
      expect(result).toBeNull();
    });
  });

  describe('calculateResize', () => {
    const mockBox: BoundingBox = {
      id: 'test',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      color: '#1890ff',
      imageId: 'test-image',
      selected: false,
      created: new Date()
    };

    it('should resize from southeast handle correctly', () => {
      const result = boundingBoxUtils.calculateResize(mockBox, 'se', 50, 30);

      expect(result.x).toBe(mockBox.x);
      expect(result.y).toBe(mockBox.y);
      expect(result.width).toBe(mockBox.width + 50);
      expect(result.height).toBe(mockBox.height + 30);
    });

    it('should resize from northwest handle correctly', () => {
      const result = boundingBoxUtils.calculateResize(mockBox, 'nw', 20, 15);

      expect(result.x).toBe(mockBox.x + 20);
      expect(result.y).toBe(mockBox.y + 15);
      expect(result.width).toBe(mockBox.width - 20);
      expect(result.height).toBe(mockBox.height - 15);
    });

    it('should enforce minimum size during resize', () => {
      const result = boundingBoxUtils.calculateResize(mockBox, 'se', -300, -200);

      expect(result.width).toBeGreaterThanOrEqual(20);
      expect(result.height).toBeGreaterThanOrEqual(20);
    });
  });
});