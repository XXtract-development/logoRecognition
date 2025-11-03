import { ErrorInfo } from 'react';
import { ErrorClassification } from '../components/ErrorBoundary/EnterpriseErrorBoundary';

interface ErrorContext {
  level: string;
  criticalPath?: boolean;
  routeInfo: string;
  userAgent: string;
  timestamp: number;
}

interface MLModelPrediction {
  category: string;
  confidence: number;
  suggestedAction: string;
  similarErrors: Array<{
    id: string;
    similarity: number;
    resolution: string;
  }>;
}

export class ErrorClassificationService {
  private readonly errorPatterns = new Map<RegExp, Partial<ErrorClassification>>();
  private mlModel: any = null;
  private errorHistory: Array<{ error: Error; classification: ErrorClassification; timestamp: number }> = [];
  private readonly MAX_HISTORY_SIZE = 100;

  constructor() {
    this.initializeErrorPatterns();
    this.loadMLModel();
  }

  private initializeErrorPatterns() {
    // Network errors
    this.errorPatterns.set(/NetworkError|fetch|ERR_NETWORK/i, {
      category: 'network',
      recoverable: true,
      severity: 'medium',
    });

    // Chunk loading errors
    this.errorPatterns.set(/ChunkLoadError|Loading chunk|failed to fetch dynamically/i, {
      category: 'network',
      recoverable: true,
      severity: 'medium',
    });

    // Permission errors
    this.errorPatterns.set(/Permission denied|Unauthorized|403|401/i, {
      category: 'user',
      recoverable: false,
      severity: 'high',
    });

    // Memory errors
    this.errorPatterns.set(/out of memory|Maximum call stack/i, {
      category: 'system',
      recoverable: false,
      severity: 'critical',
    });

    // React errors
    this.errorPatterns.set(/Cannot read prop|undefined is not|null is not/i, {
      category: 'logic',
      recoverable: true,
      severity: 'low',
    });

    // API errors
    this.errorPatterns.set(/API|endpoint|service unavailable|500|502|503|504/i, {
      category: 'external',
      recoverable: true,
      severity: 'high',
    });

    // Validation errors
    this.errorPatterns.set(/validation|invalid|schema/i, {
      category: 'user',
      recoverable: true,
      severity: 'low',
    });
  }

  private async loadMLModel() {
    try {
      // In production, this would load a real ML model
      // For now, we'll use a mock implementation
      this.mlModel = {
        predict: this.mockMLPredict.bind(this),
      };
    } catch (error) {
      console.error('Failed to load ML model for error classification:', error);
    }
  }

  async classifyError(
    error: Error,
    errorInfo: ErrorInfo,
    context: ErrorContext
  ): Promise<ErrorClassification> {
    // Start with basic classification
    let classification: ErrorClassification = {
      severity: 'medium',
      category: 'logic',
      recoverable: true,
      userImpact: 'medium',
      businessImpact: 'low',
    };

    // Apply pattern matching
    const patternClassification = this.applyPatternMatching(error);
    if (patternClassification) {
      classification = { ...classification, ...patternClassification };
    }

    // Apply ML prediction if available
    if (this.mlModel) {
      const mlPrediction = await this.predictWithML(error, errorInfo, context);
      if (mlPrediction) {
        classification = this.mergeMlPrediction(classification, mlPrediction);
      }
    }

    // Analyze error impact
    classification = this.analyzeImpact(classification, error, context);

    // Check similarity with previous errors
    const similarityAnalysis = this.analyzeSimilarity(error);
    if (similarityAnalysis.score > 0.8) {
      classification.similarityScore = similarityAnalysis.score;
      classification.predictedCause = similarityAnalysis.predictedCause;
    }

    // Store in history for future analysis
    this.addToHistory(error, classification);

    return classification;
  }

  private applyPatternMatching(error: Error): Partial<ErrorClassification> | null {
    const errorString = `${error.name} ${error.message} ${error.stack || ''}`;

    for (const [pattern, classification] of this.errorPatterns) {
      if (pattern.test(errorString)) {
        return classification;
      }
    }

    return null;
  }

  private async predictWithML(
    error: Error,
    errorInfo: ErrorInfo,
    context: ErrorContext
  ): Promise<MLModelPrediction | null> {
    try {
      return await this.mlModel.predict({
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        componentStack: errorInfo.componentStack,
        context,
      });
    } catch (predictionError) {
      console.error('ML prediction failed:', predictionError);
      return null;
    }
  }

  private mockMLPredict(data: any): MLModelPrediction {
    // Mock ML prediction for development
    const errorString = `${data.errorName} ${data.errorMessage}`.toLowerCase();

    if (errorString.includes('network') || errorString.includes('fetch')) {
      return {
        category: 'network',
        confidence: 0.85,
        suggestedAction: 'Retry with exponential backoff',
        similarErrors: [],
      };
    }

    if (errorString.includes('permission') || errorString.includes('auth')) {
      return {
        category: 'user',
        confidence: 0.9,
        suggestedAction: 'Re-authenticate user',
        similarErrors: [],
      };
    }

    return {
      category: 'logic',
      confidence: 0.6,
      suggestedAction: 'Report to development team',
      similarErrors: [],
    };
  }

  private mergeMlPrediction(
    classification: ErrorClassification,
    prediction: MLModelPrediction
  ): ErrorClassification {
    if (prediction.confidence > 0.7) {
      classification.category = prediction.category as any;

      // Adjust severity based on ML insights
      if (prediction.category === 'system' || prediction.category === 'external') {
        classification.severity = 'high';
      }
    }

    return classification;
  }

  private analyzeImpact(
    classification: ErrorClassification,
    error: Error,
    context: ErrorContext
  ): ErrorClassification {
    // Critical path errors have higher impact
    if (context.criticalPath) {
      classification.userImpact = 'high';
      classification.businessImpact = 'high';

      if (classification.severity === 'low') {
        classification.severity = 'medium';
      }
    }

    // Analyze route-specific impact
    const criticalRoutes = ['/checkout', '/payment', '/auth', '/dashboard'];
    if (criticalRoutes.some(route => context.routeInfo.includes(route))) {
      classification.businessImpact = 'critical';
      classification.userImpact = 'high';
    }

    // System errors always have high impact
    if (classification.category === 'system') {
      classification.userImpact = 'critical';
      classification.businessImpact = 'critical';
      classification.severity = 'critical';
      classification.recoverable = false;
    }

    return classification;
  }

  private analyzeSimilarity(error: Error): {
    score: number;
    predictedCause: string;
  } {
    if (this.errorHistory.length === 0) {
      return { score: 0, predictedCause: '' };
    }

    let maxSimilarity = 0;
    let mostSimilarError: any = null;

    for (const historicalError of this.errorHistory) {
      const similarity = this.calculateSimilarity(
        error,
        historicalError.error
      );

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarError = historicalError;
      }
    }

    if (maxSimilarity > 0.8 && mostSimilarError) {
      return {
        score: maxSimilarity,
        predictedCause: `Similar to previous ${mostSimilarError.classification.category} error`,
      };
    }

    return { score: maxSimilarity, predictedCause: '' };
  }

  private calculateSimilarity(error1: Error, error2: Error): number {
    // Simple similarity calculation based on error properties
    let similarity = 0;

    if (error1.name === error2.name) similarity += 0.3;
    if (error1.message === error2.message) similarity += 0.4;

    // Calculate stack trace similarity
    if (error1.stack && error2.stack) {
      const stack1Lines = error1.stack.split('\n').slice(0, 5);
      const stack2Lines = error2.stack.split('\n').slice(0, 5);

      const commonLines = stack1Lines.filter(line =>
        stack2Lines.some(line2 => line2.includes(line))
      );

      similarity += (commonLines.length / Math.max(stack1Lines.length, stack2Lines.length)) * 0.3;
    }

    return similarity;
  }

  private addToHistory(error: Error, classification: ErrorClassification) {
    this.errorHistory.push({
      error,
      classification,
      timestamp: Date.now(),
    });

    // Keep history size manageable
    if (this.errorHistory.length > this.MAX_HISTORY_SIZE) {
      this.errorHistory = this.errorHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  public getErrorStatistics() {
    const stats = {
      total: this.errorHistory.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      recoveryRate: 0,
    };

    for (const item of this.errorHistory) {
      const { category, severity, recoverable } = item.classification;

      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;

      if (recoverable) {
        stats.recoveryRate++;
      }
    }

    if (stats.total > 0) {
      stats.recoveryRate = (stats.recoveryRate / stats.total) * 100;
    }

    return stats;
  }
}