import { useRef, useState, useCallback, useEffect } from 'react';

interface PanState {
  x: number;
  y: number;
}

export const useCanvas = () => {
  const canvasRef = useRef<any>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<PanState>({ x: 0, y: 0 });

  // Reset view to default
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Fit to screen
  const fitToScreen = useCallback(() => {
    if (!canvasRef.current) return;

    // Calculate optimal zoom to fit the entire image
    setZoom(0.9); // Slight padding
    setPan({ x: 0, y: 0 });
  }, []);

  // Handle mouse wheel for zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      // Check if mouse is over canvas
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(Math.max(zoom * delta, 0.5), 5);

        // Calculate zoom center point
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Adjust pan to zoom towards mouse position
        const zoomRatio = newZoom / zoom;
        const newPan = {
          x: mouseX - (mouseX - pan.x) * zoomRatio,
          y: mouseY - (mouseY - pan.y) * zoomRatio
        };

        setZoom(newZoom);
        setPan(newPan);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [zoom, pan]);

  // Handle mouse drag for pan
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - pan.x,
          y: e.clientY - pan.y
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPan({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (zoom > 1) {
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, pan, zoom]);

  // Zoom to specific area
  const zoomToArea = useCallback((x: number, y: number, width: number, height: number) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Calculate zoom level to fit the area
    const zoomX = canvasWidth / width;
    const zoomY = canvasHeight / height;
    const newZoom = Math.min(zoomX, zoomY) * 0.8; // 80% to add padding

    // Center the area
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    setPan({
      x: canvasWidth / 2 - centerX * newZoom,
      y: canvasHeight / 2 - centerY * newZoom
    });

    setZoom(newZoom);
  }, []);

  return {
    canvasRef,
    zoom,
    pan,
    isDragging,
    setZoom,
    setPan,
    resetView,
    fitToScreen,
    zoomToArea
  };
};