import React, { useState, useCallback, DragEvent } from 'react';
import './DropZone.css';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  maxFiles?: number;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFileSelect,
  disabled = false,
  maxFiles = 1
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
      setError(null);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);

    if (files.length === 0) {
      setError('No files dropped');
      return;
    }

    if (files.length > maxFiles) {
      setError(`Maximum ${maxFiles} file(s) allowed`);
      return;
    }

    // Filter for image files
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setError('Please drop image files only');
      return;
    }

    // Process first image file
    onFileSelect(imageFiles[0]);
    setError(null);
  }, [disabled, maxFiles, onFileSelect]);

  return (
    <div
      className={`drop-zone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      role="region"
      aria-label="Drag and drop zone for image upload"
    >
      <div className="drop-zone-content">
        <svg
          className="drop-zone-icon"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 2L12 14M12 2L8 6M12 2L16 6"
          />
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            d="M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19L22 17"
          />
        </svg>
        <p className="drop-zone-text">
          {isDragging ? 'Drop your image here' : 'Drag & drop your image here'}
        </p>
        <p className="drop-zone-hint">
          or click the button below to browse
        </p>
        {error && (
          <p className="drop-zone-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
