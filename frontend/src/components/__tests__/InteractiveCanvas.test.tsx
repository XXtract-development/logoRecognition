import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import InteractiveCanvas from '../InteractiveCanvas';
import { BoundingBox } from '../../types/canvas';

// Mock Konva components since they require Canvas API
jest.mock('react-konva', () => ({
  Stage: ({ children, ...props }: any) => <div data-testid="konva-stage" {...props}>{children}</div>,
  Layer: ({ children, ...props }: any) => <div data-testid="konva-layer" {...props}>{children}</div>,
  Image: ({ ...props }: any) => <div data-testid="konva-image" {...props} />,
  Rect: ({ ...props }: any) => <div data-testid="konva-rect" {...props} />,
  Text: ({ ...props }: any) => <div data-testid="konva-text" {...props} />
}));

// Mock HTMLImageElement
Object.defineProperty(global.Image.prototype, 'onload', {
  set(fn: Function) {
    // Simulate image loading
    setTimeout(() => {
      this.width = 800;
      this.height = 600;
      fn();
    }, 0);
  }
});

describe('InteractiveCanvas Integration Tests', () => {
  const mockProps = {
    imageUrl: 'data:image/png;base64,test',
    imageId: 'test-image',
    onBoundingBoxCreate: jest.fn(),
    onBoundingBoxUpdate: jest.fn(),
    onBoundingBoxDelete: jest.fn(),
    zoom: 1,
    maxBoxes: 10
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render canvas toolbar with zoom controls', () => {
    render(<InteractiveCanvas {...mockProps} />);

    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom Out')).toBeInTheDocument();
    expect(screen.getByTitle('Reset Zoom')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('Boxes: 0/10')).toBeInTheDocument();
  });

  it('should show loading state when image is not loaded', () => {
    render(<InteractiveCanvas {...mockProps} />);

    expect(screen.getByText('Loading image...')).toBeInTheDocument();
  });

  it('should disable zoom in button at maximum zoom', () => {
    render(<InteractiveCanvas {...mockProps} zoom={4} />);

    const zoomInButton = screen.getByTitle('Zoom In');
    expect(zoomInButton).toBeDisabled();
  });

  it('should disable zoom out button at minimum zoom', () => {
    render(<InteractiveCanvas {...mockProps} zoom={0.5} />);

    const zoomOutButton = screen.getByTitle('Zoom Out');
    expect(zoomOutButton).toBeDisabled();
  });

  it('should display correct zoom percentage', () => {
    render(<InteractiveCanvas {...mockProps} zoom={1.5} />);

    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('should display correct box count', () => {
    render(<InteractiveCanvas {...mockProps} maxBoxes={5} />);

    expect(screen.getByText('Boxes: 0/5')).toBeInTheDocument();
  });

  it('should have proper CSS classes for styling', () => {
    render(<InteractiveCanvas {...mockProps} />);

    const toolbar = screen.getByText('100%').closest('.canvas-toolbar');
    expect(toolbar).toBeInTheDocument();

    const container = screen.getByText('Loading image...').closest('.canvas-container');
    expect(container).toBeInTheDocument();

    const canvas = container?.closest('.interactive-canvas');
    expect(canvas).toBeInTheDocument();
  });
});

describe('InteractiveCanvas Error Handling', () => {
  const mockProps = {
    imageUrl: 'invalid-url',
    imageId: 'test-image',
    onBoundingBoxCreate: jest.fn(),
    onBoundingBoxUpdate: jest.fn(),
    onBoundingBoxDelete: jest.fn(),
    zoom: 1,
    maxBoxes: 10
  };

  it('should handle invalid image URLs gracefully', () => {
    render(<InteractiveCanvas {...mockProps} />);

    // Should still render the component structure
    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.getByText('Loading image...')).toBeInTheDocument();
  });

  it('should handle edge case zoom values', () => {
    render(<InteractiveCanvas {...mockProps} zoom={0} />);

    // Should still render without errors
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

describe('InteractiveCanvas Undo/Redo Functionality', () => {
  const mockProps = {
    imageUrl: 'data:image/png;base64,test',
    imageId: 'test-image',
    onBoundingBoxCreate: jest.fn(),
    onBoundingBoxUpdate: jest.fn(),
    onBoundingBoxDelete: jest.fn(),
    zoom: 1,
    maxBoxes: 10
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render undo and redo buttons', () => {
    render(<InteractiveCanvas {...mockProps} />);

    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeInTheDocument();
    expect(screen.getByTitle('Redo (Ctrl+Y)')).toBeInTheDocument();
  });

  it('should disable undo button initially', () => {
    render(<InteractiveCanvas {...mockProps} />);

    const undoButton = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoButton).toBeDisabled();
  });

  it('should disable redo button initially', () => {
    render(<InteractiveCanvas {...mockProps} />);

    const redoButton = screen.getByTitle('Redo (Ctrl+Y)');
    expect(redoButton).toBeDisabled();
  });
});

describe('InteractiveCanvas Accessibility', () => {
  const mockProps = {
    imageUrl: 'data:image/png;base64,test',
    imageId: 'test-image',
    onBoundingBoxCreate: jest.fn(),
    onBoundingBoxUpdate: jest.fn(),
    onBoundingBoxDelete: jest.fn(),
    zoom: 1,
    maxBoxes: 10
  };

  it('should have focusable canvas container', () => {
    render(<InteractiveCanvas {...mockProps} />);

    const canvas = screen.getByText('Loading image...').closest('.interactive-canvas');
    expect(canvas).toHaveAttribute('tabIndex', '0');
  });

  it('should provide proper ARIA labels for buttons', () => {
    render(<InteractiveCanvas {...mockProps} />);

    expect(screen.getByTitle('Zoom In')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom Out')).toBeInTheDocument();
    expect(screen.getByTitle('Reset Zoom')).toBeInTheDocument();
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeInTheDocument();
    expect(screen.getByTitle('Redo (Ctrl+Y)')).toBeInTheDocument();
  });
});