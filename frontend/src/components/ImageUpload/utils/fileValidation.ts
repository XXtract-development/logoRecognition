export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/gif'
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MIN_IMAGE_DIMENSIONS = { width: 100, height: 100 };
export const MAX_IMAGE_DIMENSIONS = { width: 10000, height: 10000 };

export interface FileValidationError {
  type: 'format' | 'size' | 'dimensions' | 'corrupt';
  message: string;
}

export const validateFileFormat = (file: File): FileValidationError | null => {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return {
      type: 'format',
      message: `Invalid file format. Accepted formats: JPEG, PNG, WebP, SVG, BMP, GIF`
    };
  }
  return null;
};

export const validateFileSize = (file: File): FileValidationError | null => {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      type: 'size',
      message: `File size (${sizeMB}MB) exceeds maximum allowed size of 10MB`
    };
  }
  return null;
};

export const validateImageDimensions = async (
  file: File
): Promise<FileValidationError | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (img.width < MIN_IMAGE_DIMENSIONS.width || img.height < MIN_IMAGE_DIMENSIONS.height) {
        resolve({
          type: 'dimensions',
          message: `Image dimensions (${img.width}x${img.height}) are below minimum required (${MIN_IMAGE_DIMENSIONS.width}x${MIN_IMAGE_DIMENSIONS.height})`
        });
      } else if (img.width > MAX_IMAGE_DIMENSIONS.width || img.height > MAX_IMAGE_DIMENSIONS.height) {
        resolve({
          type: 'dimensions',
          message: `Image dimensions (${img.width}x${img.height}) exceed maximum allowed (${MAX_IMAGE_DIMENSIONS.width}x${MAX_IMAGE_DIMENSIONS.height})`
        });
      } else {
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        type: 'corrupt',
        message: 'Failed to load image. File may be corrupt.'
      });
    };

    img.src = url;
  });
};

export const validateFile = async (file: File): Promise<FileValidationError | null> => {
  // Check format
  const formatError = validateFileFormat(file);
  if (formatError) return formatError;

  // Check size
  const sizeError = validateFileSize(file);
  if (sizeError) return sizeError;

  // Check dimensions (async)
  const dimensionError = await validateImageDimensions(file);
  if (dimensionError) return dimensionError;

  return null;
};