export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export class FileValidator {
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MIN_DIMENSION = 100;
  private static readonly MAX_DIMENSION = 5000;
  private static readonly ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/gif'
  ];

  static validate(file: File): ValidationResult {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size exceeds ${this.MAX_FILE_SIZE / (1024 * 1024)}MB limit`
      };
    }

    if (file.size === 0) {
      return {
        isValid: false,
        error: 'File is empty'
      };
    }

    // Check file type
    if (!this.ALLOWED_TYPES.includes(file.type)) {
      return {
        isValid: false,
        error: `Invalid file type. Allowed: ${this.ALLOWED_TYPES.join(', ')}`
      };
    }

    return { isValid: true };
  }

  static async validateDimensions(file: File): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        if (img.width < this.MIN_DIMENSION || img.height < this.MIN_DIMENSION) {
          resolve({
            isValid: false,
            error: `Image too small. Minimum dimensions: ${this.MIN_DIMENSION}x${this.MIN_DIMENSION}px`
          });
        } else if (img.width > this.MAX_DIMENSION || img.height > this.MAX_DIMENSION) {
          resolve({
            isValid: false,
            error: `Image too large. Maximum dimensions: ${this.MAX_DIMENSION}x${this.MAX_DIMENSION}px`
          });
        } else {
          resolve({ isValid: true });
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({
          isValid: false,
          error: 'Failed to validate image dimensions'
        });
      };

      img.src = url;
    });
  }

  static async validateBatch(files: File[]): Promise<Map<File, ValidationResult>> {
    const results = new Map<File, ValidationResult>();

    for (const file of files) {
      const basicValidation = this.validate(file);
      if (!basicValidation.isValid) {
        results.set(file, basicValidation);
        continue;
      }

      const dimensionValidation = await this.validateDimensions(file);
      results.set(file, dimensionValidation);
    }

    return results;
  }
}
