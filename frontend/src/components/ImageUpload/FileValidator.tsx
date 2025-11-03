export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class FileValidator {
  private static readonly ACCEPTED_FORMATS = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/gif'
  ];

  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MIN_DIMENSIONS = { width: 100, height: 100 };
  private static readonly MAX_DIMENSIONS = { width: 10000, height: 10000 };

  static validate(file: File): ValidationResult {
    // Check file format
    if (!this.ACCEPTED_FORMATS.includes(file.type)) {
      return {
        isValid: false,
        error: `Invalid file format. Accepted formats: JPEG, PNG, WebP, SVG, BMP, GIF`
      };
    }

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return {
        isValid: false,
        error: `File size (${sizeMB}MB) exceeds maximum allowed size of 10MB`
      };
    }

    // For client-side dimension validation, we'd need to load the image
    // This is async, so we'll handle it separately if needed

    return { isValid: true };
  }

  static async validateDimensions(file: File): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        if (img.width < this.MIN_DIMENSIONS.width || img.height < this.MIN_DIMENSIONS.height) {
          resolve({
            isValid: false,
            error: `Image dimensions (${img.width}x${img.height}) are below minimum required (${this.MIN_DIMENSIONS.width}x${this.MIN_DIMENSIONS.height})`
          });
        } else if (img.width > this.MAX_DIMENSIONS.width || img.height > this.MAX_DIMENSIONS.height) {
          resolve({
            isValid: false,
            error: `Image dimensions (${img.width}x${img.height}) exceed maximum allowed (${this.MAX_DIMENSIONS.width}x${this.MAX_DIMENSIONS.height})`
          });
        } else {
          resolve({ isValid: true });
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          isValid: false,
          error: 'Failed to load image for dimension validation'
        });
      };

      img.src = url;
    });
  }

  static shouldOptimize(file: File): boolean {
    return file.size >= 5 * 1024 * 1024 && file.size <= this.MAX_FILE_SIZE;
  }
}