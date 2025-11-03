import { useState, useCallback } from 'react';
import { ZoomControls } from '../types/canvas';

export const useCanvasZoom = (initialZoom: number = 1): ZoomControls => {
  const [zoom, setZoom] = useState(initialZoom);

  const zoomIn = useCallback(() => {
    // 20% zoom in (1.2x)
    setZoom(prev => Math.min(prev * 1.2, 4));
  }, []);

  const zoomOut = useCallback(() => {
    // 20% zoom out (0.8333x to match 20% decrease)
    setZoom(prev => Math.max(prev / 1.2, 0.5));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  return { zoom, zoomIn, zoomOut, resetZoom };
};