import React, { useRef, useEffect, useCallback } from 'react';
import type { RecognitionResult, UploadedImage } from '@/types/recognition';

interface BoundingBoxCanvasProps {
  image: UploadedImage | null;
  results: RecognitionResult[];
  selectedResult: RecognitionResult | null;
  onResultSelect: (result: RecognitionResult) => void;
}

export const BoundingBoxCanvas: React.FC<BoundingBoxCanvasProps> = ({
  image,
  results,
  selectedResult,
  onResultSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img || !image) return;

    // Set canvas size to match image
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Draw image
    ctx.drawImage(img, 0, 0);

    // Draw bounding boxes
    results.forEach((result) => {
      if (!result.boundingBox) return;

      const { x, y, width, height } = result.boundingBox;
      const isSelected = selectedResult?.id === result.id;

      // Set style based on selection
      ctx.strokeStyle = isSelected ? '#007AFF' : '#52c41a';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash(isSelected ? [] : [5, 5]);

      // Draw rectangle
      ctx.strokeRect(x, y, width, height);

      // Draw label background
      const label = `${result.logoName} (${(result.confidence * 100).toFixed(0)}%)`;
      ctx.font = '14px sans-serif';
      const textMetrics = ctx.measureText(label);
      const textHeight = 18;
      const padding = 4;

      ctx.fillStyle = isSelected ? '#007AFF' : '#52c41a';
      ctx.fillRect(
        x,
        y - textHeight - padding,
        textMetrics.width + padding * 2,
        textHeight + padding
      );

      // Draw label text
      ctx.fillStyle = 'white';
      ctx.fillText(label, x + padding, y - padding);
    });
  }, [image, results, selectedResult]);

  useEffect(() => {
    if (!image?.dataUrl) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
    img.src = image.dataUrl;
  }, [image, drawCanvas]);

  useEffect(() => {
    drawCanvas();
  }, [results, selectedResult, drawCanvas]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Find clicked result
      const clickedResult = results.find((result) => {
        if (!result.boundingBox) return false;
        const { x: bx, y: by, width, height } = result.boundingBox;
        return x >= bx && x <= bx + width && y >= by && y <= by + height;
      });

      if (clickedResult) {
        onResultSelect(clickedResult);
      }
    },
    [results, onResultSelect]
  );

  if (!image) {
    return null;
  }

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{ cursor: 'pointer', maxWidth: '100%', height: 'auto' }}
        aria-label="Recognition results visualization"
      />
    </div>
  );
};

BoundingBoxCanvas.displayName = 'BoundingBoxCanvas';
