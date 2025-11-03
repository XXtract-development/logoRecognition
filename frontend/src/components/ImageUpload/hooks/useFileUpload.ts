import { useState, useCallback } from 'react';

interface UploadResult {
  uploadId: string;
  status: 'success' | 'error';
  message?: string;
}

interface UseFileUploadReturn {
  upload: (file: File, source?: string) => Promise<UploadResult>;
  isUploading: boolean;
  progress: number;
  uploadError: string | null;
  estimatedTime: number | null;
  reset: () => void;
}

export const useFileUpload = (): UseFileUploadReturn => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setUploadError(null);
    setEstimatedTime(null);
  }, []);

  const upload = useCallback(async (file: File, source: string = 'button'): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      setIsUploading(true);
      setProgress(0);
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', source);

      const xhr = new XMLHttpRequest();
      const startTime = Date.now();

      // Progress tracking
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);

          // Estimate remaining time
          const elapsedTime = Date.now() - startTime;
          const uploadSpeed = e.loaded / (elapsedTime / 1000); // bytes per second
          const remainingBytes = e.total - e.loaded;
          const remainingTime = Math.round(remainingBytes / uploadSpeed);
          setEstimatedTime(remainingTime);
        }
      });

      // Success handler
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            setIsUploading(false);
            setProgress(100);
            resolve({
              uploadId: response.uploadId || 'unknown',
              status: 'success'
            });
          } catch (error) {
            setUploadError('Invalid response from server');
            setIsUploading(false);
            reject(new Error('Invalid response from server'));
          }
        } else if (xhr.status === 413) {
          setUploadError('File size too large');
          setIsUploading(false);
          reject(new Error('File size too large'));
        } else if (xhr.status === 429) {
          setUploadError('Too many uploads. Please wait and try again.');
          setIsUploading(false);
          reject(new Error('Rate limit exceeded'));
        } else {
          setUploadError(`Upload failed with status ${xhr.status}`);
          setIsUploading(false);
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      // Error handler
      xhr.addEventListener('error', () => {
        setUploadError('Network error during upload');
        setIsUploading(false);
        reject(new Error('Network error during upload'));
      });

      // Abort handler
      xhr.addEventListener('abort', () => {
        setUploadError('Upload cancelled');
        setIsUploading(false);
        reject(new Error('Upload cancelled'));
      });

      // Send request
      xhr.open('POST', '/api/v1/images/upload');
      xhr.setRequestHeader('X-Upload-Source', source);
      xhr.send(formData);
    });
  }, []);

  return {
    upload,
    isUploading,
    progress,
    uploadError,
    estimatedTime,
    reset
  };
};
