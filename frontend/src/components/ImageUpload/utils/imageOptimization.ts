export interface OptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
}

export const optimizeImage = async (
  file: File,
  options: OptimizationOptions = {}
): Promise<File> => {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 0.85,
    format = 'jpeg'
  } = options;

  // Only optimize if file is between 5MB and 10MB
  if (file.size < 5 * 1024 * 1024 || file.size > 10 * 1024 * 1024) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        if (width > height) {
          width = maxWidth;
          height = Math.floor(maxWidth / aspectRatio);
        } else {
          height = maxHeight;
          width = Math.floor(maxHeight * aspectRatio);
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to optimize image'));
            return;
          }

          // Create new file from blob
          const optimizedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, `.${format}`),
            { type: `image/${format}` }
          );

          resolve(optimizedFile);
        },
        `image/${format}`,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for optimization'));
    };

    img.src = url;
  });
};

export const shouldOptimizeImage = (file: File): boolean => {
  return file.size >= 5 * 1024 * 1024 && file.size <= 10 * 1024 * 1024;
};

export const estimateOptimizedSize = (
  originalSize: number,
  quality: number = 0.85
): number => {
  // Rough estimate based on quality setting
  return Math.floor(originalSize * quality * 0.7);
};