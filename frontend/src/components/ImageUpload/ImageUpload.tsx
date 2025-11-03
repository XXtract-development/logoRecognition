import React, { useState, useCallback } from 'react';
import { DropZone } from './DropZone';
import { FileValidator } from './FileValidator';
import { ImagePreview } from './ImagePreview';
import { UploadProgress } from './UploadProgress';
import { UploadHistory } from './UploadHistory';
import { useFileUpload } from './hooks/useFileUpload';
import './ImageUpload.css';

export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  uploadId?: string;
  timestamp: Date;
}

export const ImageUpload: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<string>('button');
  const [concurrentUploads, setConcurrentUploads] = useState<number>(0);
  const MAX_CONCURRENT_UPLOADS = 3;

  const { upload, isUploading, progress, uploadError, estimatedTime } = useFileUpload();

  const handleFileSelect = useCallback(async (file: File, source: string = 'button') => {
    setError(null);
    setUploadMethod(source);

    // Check concurrent upload limit
    const activeUploads = uploadHistory.filter(u => u.status === 'uploading').length;
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      setError(`Maximum ${MAX_CONCURRENT_UPLOADS} concurrent uploads allowed. Please wait for current uploads to complete.`);
      return;
    }

    // Validate file format and size
    const validation = FileValidator.validate(file);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    // Validate dimensions asynchronously
    try {
      const dimensionValidation = await FileValidator.validateDimensions(file);
      if (!dimensionValidation.isValid) {
        setError(dimensionValidation.error || 'Invalid image dimensions');
        return;
      }
    } catch (err) {
      setError('Failed to validate image dimensions');
      return;
    }

    setSelectedFile(file);

    // Generate preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [uploadHistory]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    // Check concurrent upload limit again
    const activeUploads = uploadHistory.filter(u => u.status === 'uploading').length;
    if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
      setError(`Maximum ${MAX_CONCURRENT_UPLOADS} concurrent uploads allowed. Please wait for current uploads to complete.`);
      return;
    }

    const uploadFile: UploadedFile = {
      id: Date.now().toString(),
      file: selectedFile,
      preview,
      status: 'uploading',
      progress: 0,
      timestamp: new Date()
    };

    setUploadHistory(prev => [uploadFile, ...prev.slice(0, 4)]);
    setConcurrentUploads(prev => prev + 1);

    try {
      const result = await upload(selectedFile, uploadMethod);

      setUploadHistory(prev =>
        prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'success', progress: 100, uploadId: result.uploadId }
            : f
        )
      );

      // Clear selection after successful upload
      setSelectedFile(null);
      setPreview(null);
    } catch (err) {
      setUploadHistory(prev =>
        prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error: (err as Error).message }
            : f
        )
      );
    } finally {
      setConcurrentUploads(prev => prev - 1);
    }
  }, [selectedFile, preview, upload, uploadMethod, uploadHistory]);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          handleFileSelect(file, 'paste');
        }
      }
    }
  }, [handleFileSelect]);

  React.useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  return (
    <div className="image-upload-container">
      <h1>Upload Image for Logo Detection</h1>

      <DropZone onFileSelect={(file) => handleFileSelect(file, 'drag-drop')} />

      <div className="upload-controls">
        <label htmlFor="file-input" className="upload-button">
          Upload Image for Logo Detection
        </label>
        <input
          id="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml,image/bmp,image/gif"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          style={{ display: 'none' }}
          aria-label="Upload image file"
        />
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {preview && selectedFile && (
        <ImagePreview
          src={preview}
          alt={selectedFile.name}
          file={selectedFile}
        />
      )}

      {selectedFile && !isUploading && (
        <button
          className="upload-submit-button"
          onClick={handleUpload}
          aria-label="Submit image for upload"
        >
          Upload Image
        </button>
      )}

      {isUploading && (
        <UploadProgress progress={progress} />
      )}

      {uploadError && (
        <div className="upload-error" role="alert">
          Upload failed: {uploadError}
        </div>
      )}

      {uploadHistory.length > 0 && (
        <UploadHistory uploads={uploadHistory} />
      )}
    </div>
  );
};