import { useState, useEffect } from 'react';

export const useImagePreview = (file: File | null) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('File is not an image');
      return;
    }

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      setPreview(e.target?.result as string);
      setIsLoading(false);
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setIsLoading(false);
    };

    reader.readAsDataURL(file);

    return () => {
      reader.abort();
    };
  }, [file]);

  return { preview, isLoading, error };
};