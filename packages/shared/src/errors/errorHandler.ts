import { v4 as uuidv4 } from 'uuid';

// RFC 7807 compliant error format
export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  timestamp: string;
  requestId: string;
  suggestions?: string[];
  metadata?: Record<string, any>;
}

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
}

export class IntelligentErrorHandler {
  private static errorBudget = {
    threshold: 0.001, // 0.1% error rate
    window: 3600000, // 1 hour in ms
    errors: [] as number[],
  };

  static formatError(
    error: Error,
    context: {
      requestId?: string;
      userId?: string;
      path?: string;
      method?: string;
    } = {}
  ): ApiError {
    const errorId = uuidv4();
    const errorCode = this.classifyError(error);

    return {
      type: `/errors/${errorCode}`,
      title: this.getErrorTitle(errorCode),
      status: this.getStatusCode(errorCode),
      detail: this.getSafeErrorDetail(error),
      instance: `/errors/${errorId}`,
      timestamp: new Date().toISOString(),
      requestId: context.requestId || uuidv4(),
      suggestions: this.getRecoverySuggestions(errorCode),
      metadata: {
        userId: context.userId,
        path: context.path,
        method: context.method,
        errorId,
      },
    };
  }

  private static classifyError(error: Error): ErrorCode {
    if (error.name === 'ValidationError') return ErrorCode.VALIDATION_ERROR;
    if (error.name === 'AuthenticationError') return ErrorCode.AUTH_ERROR;
    if (error.name === 'RateLimitError') return ErrorCode.RATE_LIMIT_ERROR;
    if (error.name === 'NotFoundError') return ErrorCode.NOT_FOUND;
    if (error.name === 'ConflictError') return ErrorCode.CONFLICT;
    if (error.name === 'TimeoutError') return ErrorCode.TIMEOUT_ERROR;
    if (error.name === 'ServiceUnavailableError') return ErrorCode.SERVICE_UNAVAILABLE;
    return ErrorCode.INTERNAL_ERROR;
  }

  private static getErrorTitle(code: ErrorCode): string {
    const titles: Record<ErrorCode, string> = {
      [ErrorCode.VALIDATION_ERROR]: 'Invalid Request Data',
      [ErrorCode.AUTH_ERROR]: 'Authentication Failed',
      [ErrorCode.RATE_LIMIT_ERROR]: 'Too Many Requests',
      [ErrorCode.NOT_FOUND]: 'Resource Not Found',
      [ErrorCode.CONFLICT]: 'Resource Conflict',
      [ErrorCode.INTERNAL_ERROR]: 'Internal Server Error',
      [ErrorCode.SERVICE_UNAVAILABLE]: 'Service Temporarily Unavailable',
      [ErrorCode.TIMEOUT_ERROR]: 'Request Timeout',
      [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'Insufficient Permissions',
      [ErrorCode.PAYMENT_REQUIRED]: 'Payment Required',
    };
    return titles[code];
  }

  private static getStatusCode(code: ErrorCode): number {
    const statusCodes: Record<ErrorCode, number> = {
      [ErrorCode.VALIDATION_ERROR]: 400,
      [ErrorCode.AUTH_ERROR]: 401,
      [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
      [ErrorCode.NOT_FOUND]: 404,
      [ErrorCode.CONFLICT]: 409,
      [ErrorCode.RATE_LIMIT_ERROR]: 429,
      [ErrorCode.INTERNAL_ERROR]: 500,
      [ErrorCode.SERVICE_UNAVAILABLE]: 503,
      [ErrorCode.TIMEOUT_ERROR]: 504,
      [ErrorCode.PAYMENT_REQUIRED]: 402,
    };
    return statusCodes[code];
  }

  private static getSafeErrorDetail(error: Error): string {
    // In production, don't leak sensitive details
    if (process.env.NODE_ENV === 'production') {
      return 'An error occurred processing your request. Please try again.';
    }
    return error.message;
  }

  private static getRecoverySuggestions(code: ErrorCode): string[] {
    const suggestions: Record<ErrorCode, string[]> = {
      [ErrorCode.VALIDATION_ERROR]: [
        'Check your input data format',
        'Ensure all required fields are provided',
        'Verify data types match the expected format',
      ],
      [ErrorCode.AUTH_ERROR]: [
        'Check your credentials',
        'Ensure your session has not expired',
        'Try logging in again',
      ],
      [ErrorCode.RATE_LIMIT_ERROR]: [
        'Wait a moment before retrying',
        'Reduce the frequency of requests',
        'Consider implementing request batching',
      ],
      [ErrorCode.NOT_FOUND]: [
        'Verify the resource ID is correct',
        'Check if the resource was deleted',
        'Ensure you have access to this resource',
      ],
      [ErrorCode.CONFLICT]: [
        'Refresh and try again',
        'Check for duplicate entries',
        'Resolve conflicting changes',
      ],
      [ErrorCode.INTERNAL_ERROR]: [
        'Try again in a few moments',
        'If the problem persists, contact support',
      ],
      [ErrorCode.SERVICE_UNAVAILABLE]: [
        'Service is temporarily down for maintenance',
        'Please try again in a few minutes',
      ],
      [ErrorCode.TIMEOUT_ERROR]: [
        'Check your internet connection',
        'Try again with a smaller request',
        'Contact support if the issue persists',
      ],
      [ErrorCode.INSUFFICIENT_PERMISSIONS]: [
        'Contact your administrator for access',
        'Verify you are using the correct account',
      ],
      [ErrorCode.PAYMENT_REQUIRED]: [
        'Update your payment information',
        'Contact billing support',
      ],
    };
    return suggestions[code] || ['Please try again later'];
  }

  static checkErrorBudget(): boolean {
    const now = Date.now();
    this.errorBudget.errors = this.errorBudget.errors.filter(
      (timestamp) => now - timestamp < this.errorBudget.window
    );

    const errorRate = this.errorBudget.errors.length / this.errorBudget.window;
    return errorRate < this.errorBudget.threshold;
  }

  static recordError(): void {
    this.errorBudget.errors.push(Date.now());
  }
}
