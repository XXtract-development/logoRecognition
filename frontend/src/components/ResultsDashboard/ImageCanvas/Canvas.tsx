import React, { forwardRef, useEffect, useRef, useImperativeHandle, useState, memo } from 'react';
import './Canvas.css';

interface CanvasProps {
  imageUrl: string;
  width: number;
  height: number;
  zoom: number;
  pan: { x: number; y: number };
  onImageLoad?: () => void;
  onImageError?: (error: string) => void;
}

export interface CanvasHandle {
  width: number;
  height: number;
  getContext: () => CanvasRenderingContext2D | null;
  toDataURL: (type?: string, quality?: number) => string;
}

const CanvasComponent = ({
  imageUrl,
  width,
  height,
  zoom,
  pan,
  onImageLoad,
  onImageError
}: CanvasProps, ref: React.ForwardedRef<CanvasHandle>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Update container size on mount and resize
  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current?.parentElement) {
        const rect = canvasRef.current.parentElement.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Expose canvas methods through ref
  useImperativeHandle(ref, () => ({
    width: containerSize.width,
    height: containerSize.height,
    getContext: () => canvasRef.current?.getContext('2d') || null,
    toDataURL: (type?: string, quality?: number) =>
      canvasRef.current?.toDataURL(type, quality) || ''
  }), [containerSize]);

  // Load and render image
  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to container size
    canvas.width = containerSize.width;
    canvas.height = containerSize.height;

    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      imageRef.current = img;
      setIsImageLoaded(true);
      onImageLoad?.();
      renderImage();
    };

    img.onerror = () => {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load image:', imageUrl);
      }
      onImageError?.('Failed to load image');
      setIsImageLoaded(false);
    };

    img.src = imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl, containerSize, onImageLoad, onImageError]);

  // Render image with zoom and pan
  useEffect(() => {
    if (isImageLoaded && imageRef.current) {
      renderImage();
    }
  }, [zoom, pan, isImageLoaded, containerSize]);

  const renderImage = () => {
    if (!canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate scaled dimensions
    const scale = Math.min(
      canvas.width / img.width,
      canvas.height / img.height
    ) * zoom;

    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    // Center image with pan offset
    const x = (canvas.width - scaledWidth) / 2 + pan.x;
    const y = (canvas.height - scaledHeight) / 2 + pan.y;

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(x, y);

    // Draw image
    ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

    // Restore context
    ctx.restore();
  };

  return (
    <canvas
      ref={canvasRef}
      className="results-canvas"
      role="img"
      aria-label={`Detection results image with ${zoom > 1 ? 'zoom applied' : 'normal view'}`}
      tabIndex={0}
      style={{
        width: '100%',
        height: '100%',
        cursor: zoom > 1 ? 'move' : 'default'
      }}
    />
  );
};

// Wrap with forwardRef and memo for performance
export const Canvas = memo(forwardRef<CanvasHandle, CanvasProps>(CanvasComponent), (prevProps, nextProps) => {
  // Only re-render if critical props change
  return (
    prevProps.imageUrl === nextProps.imageUrl &&
    prevProps.zoom === nextProps.zoom &&
    prevProps.pan.x === nextProps.pan.x &&
    prevProps.pan.y === nextProps.pan.y &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height
  );
});

Canvas.displayName = 'Canvas';