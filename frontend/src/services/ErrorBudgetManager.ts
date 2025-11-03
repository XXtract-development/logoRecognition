import { ErrorClassification, ErrorBudgetStatus } from '../components/ErrorBoundary/EnterpriseErrorBoundary';

interface ErrorBudgetConfig {
  threshold: number; // Maximum errors allowed
  timeWindow: number; // Time window in milliseconds
  alertThreshold: number; // Percentage of budget consumed before alerting (0-1)
  criticalThreshold: number; // Percentage threshold for critical alerts (0-1)
}

interface ErrorRecord {
  id: string;
  timestamp: number;
  classification: ErrorClassification;
  consumed: number; // Budget points consumed
}

interface BudgetAlert {
  type: 'warning' | 'critical' | 'exhausted';
  message: string;
  budgetStatus: ErrorBudgetStatus;
  timestamp: number;
}

export class ErrorBudgetManager {
  private readonly budgetId: string;
  private config: ErrorBudgetConfig;
  private errorRecords: ErrorRecord[] = [];
  private alertCallbacks: ((alert: BudgetAlert) => void)[] = [];
  private lastAlertTimestamp = 0;
  private readonly MIN_ALERT_INTERVAL = 60000; // 1 minute between similar alerts

  private readonly DEFAULT_CONFIGS: Record<string, ErrorBudgetConfig> = {
    global: {
      threshold: 100,
      timeWindow: 3600000, // 1 hour
      alertThreshold: 0.7,
      criticalThreshold: 0.9,
    },
    route: {
      threshold: 50,
      timeWindow: 1800000, // 30 minutes
      alertThreshold: 0.6,
      criticalThreshold: 0.8,
    },
    component: {
      threshold: 20,
      timeWindow: 900000, // 15 minutes
      alertThreshold: 0.5,
      criticalThreshold: 0.75,
    },
    feature: {
      threshold: 10,
      timeWindow: 600000, // 10 minutes
      alertThreshold: 0.4,
      criticalThreshold: 0.7,
    },
  };

  constructor(budgetId: string) {
    this.budgetId = budgetId;
    this.config = this.DEFAULT_CONFIGS[budgetId] || this.DEFAULT_CONFIGS.component;
    this.loadPersistedData();
    this.startCleanupInterval();
  }

  private loadPersistedData() {
    try {
      const stored = localStorage.getItem(`error-budget-${this.budgetId}`);
      if (stored) {
        const data = JSON.parse(stored);
        this.errorRecords = data.records || [];
        // Clean up old records on load
        this.cleanupOldRecords();
      }
    } catch (error) {
      console.error('Failed to load error budget data:', error);
    }
  }

  private persistData() {
    try {
      localStorage.setItem(
        `error-budget-${this.budgetId}`,
        JSON.stringify({
          records: this.errorRecords,
          lastUpdate: Date.now(),
        })
      );
    } catch (error) {
      console.error('Failed to persist error budget data:', error);
    }
  }

  private startCleanupInterval() {
    setInterval(() => {
      this.cleanupOldRecords();
    }, 60000); // Clean up every minute
  }

  private cleanupOldRecords() {
    const cutoff = Date.now() - this.config.timeWindow;
    const oldCount = this.errorRecords.length;

    this.errorRecords = this.errorRecords.filter(
      record => record.timestamp > cutoff
    );

    if (oldCount !== this.errorRecords.length) {
      this.persistData();
    }
  }

  async recordError(
    classification: ErrorClassification,
    errorId: string
  ): Promise<ErrorBudgetStatus> {
    this.cleanupOldRecords();

    const consumed = this.calculateBudgetConsumption(classification);

    const record: ErrorRecord = {
      id: errorId,
      timestamp: Date.now(),
      classification,
      consumed,
    };

    this.errorRecords.push(record);
    this.persistData();

    const status = this.getCurrentStatus();

    // Check if we need to send alerts
    await this.checkAndSendAlerts(status, classification);

    // Predict exhaustion if trend continues
    if (status.consumed > 0) {
      status.predictedExhaustion = this.predictExhaustionTime(status);
    }

    return status;
  }

  private calculateBudgetConsumption(classification: ErrorClassification): number {
    let consumption = 1; // Base consumption

    // Severity multipliers
    const severityMultipliers = {
      low: 0.5,
      medium: 1,
      high: 2,
      critical: 5,
    };

    consumption *= severityMultipliers[classification.severity];

    // Business impact multipliers
    const impactMultipliers = {
      none: 0.25,
      low: 0.5,
      medium: 1,
      high: 2,
      critical: 4,
    };

    consumption *= impactMultipliers[classification.businessImpact];

    // Non-recoverable errors consume more budget
    if (!classification.recoverable) {
      consumption *= 1.5;
    }

    // Critical path errors consume more budget
    if (classification.userImpact === 'critical') {
      consumption *= 2;
    }

    return consumption;
  }

  getCurrentStatus(): ErrorBudgetStatus {
    this.cleanupOldRecords();

    const consumed = this.errorRecords.reduce(
      (sum, record) => sum + record.consumed,
      0
    );

    const remaining = Math.max(0, this.config.threshold - consumed);
    const isExceeded = consumed >= this.config.threshold;

    return {
      remaining,
      consumed,
      threshold: this.config.threshold,
      timeWindow: this.config.timeWindow,
      isExceeded,
    };
  }

  private predictExhaustionTime(status: ErrorBudgetStatus): Date | undefined {
    if (this.errorRecords.length < 2) {
      return undefined;
    }

    // Calculate rate of consumption over the last 5 minutes
    const fiveMinutesAgo = Date.now() - 300000;
    const recentErrors = this.errorRecords.filter(
      r => r.timestamp > fiveMinutesAgo
    );

    if (recentErrors.length === 0) {
      return undefined;
    }

    const recentConsumption = recentErrors.reduce(
      (sum, r) => sum + r.consumed,
      0
    );

    const timeSpan = Date.now() - recentErrors[0].timestamp;
    const consumptionRate = recentConsumption / timeSpan; // per millisecond

    if (consumptionRate <= 0) {
      return undefined;
    }

    const remainingBudget = status.remaining;
    const timeToExhaustion = remainingBudget / consumptionRate;

    return new Date(Date.now() + timeToExhaustion);
  }

  private async checkAndSendAlerts(
    status: ErrorBudgetStatus,
    classification: ErrorClassification
  ) {
    const consumptionRatio = status.consumed / status.threshold;

    let alert: BudgetAlert | null = null;

    if (status.isExceeded) {
      alert = {
        type: 'exhausted',
        message: `Error budget exhausted for ${this.budgetId}. All errors will trigger emergency mode.`,
        budgetStatus: status,
        timestamp: Date.now(),
      };
    } else if (consumptionRatio >= this.config.criticalThreshold) {
      alert = {
        type: 'critical',
        message: `Critical: ${Math.round(consumptionRatio * 100)}% of error budget consumed for ${this.budgetId}`,
        budgetStatus: status,
        timestamp: Date.now(),
      };
    } else if (consumptionRatio >= this.config.alertThreshold) {
      alert = {
        type: 'warning',
        message: `Warning: ${Math.round(consumptionRatio * 100)}% of error budget consumed for ${this.budgetId}`,
        budgetStatus: status,
        timestamp: Date.now(),
      };
    }

    if (alert && this.shouldSendAlert(alert.type)) {
      this.lastAlertTimestamp = Date.now();
      await this.sendAlert(alert);

      // Notify all registered callbacks
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert);
        } catch (error) {
          console.error('Error in alert callback:', error);
        }
      });
    }
  }

  private shouldSendAlert(type: string): boolean {
    // Don't send similar alerts too frequently
    if (Date.now() - this.lastAlertTimestamp < this.MIN_ALERT_INTERVAL) {
      return false;
    }

    return true;
  }

  private async sendAlert(alert: BudgetAlert) {
    try {
      // Send to monitoring service
      await fetch('/api/monitoring/error-budget-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...alert,
          budgetId: this.budgetId,
          environment: process.env.NODE_ENV,
        }),
      });
    } catch (error) {
      console.error('Failed to send error budget alert:', error);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Error Budget Alert:', alert);
    }
  }

  onAlert(callback: (alert: BudgetAlert) => void) {
    this.alertCallbacks.push(callback);
  }

  removeAlertListener(callback: (alert: BudgetAlert) => void) {
    this.alertCallbacks = this.alertCallbacks.filter(cb => cb !== callback);
  }

  getStatistics() {
    this.cleanupOldRecords();

    const stats = {
      totalErrors: this.errorRecords.length,
      consumptionRate: 0,
      averageConsumptionPerError: 0,
      errorsByCategory: {} as Record<string, number>,
      errorsBySeverity: {} as Record<string, number>,
      timeToRecovery: 0,
    };

    if (this.errorRecords.length === 0) {
      return stats;
    }

    // Calculate consumption rate
    const totalConsumption = this.errorRecords.reduce(
      (sum, r) => sum + r.consumed,
      0
    );
    stats.averageConsumptionPerError = totalConsumption / this.errorRecords.length;

    // Group by category and severity
    this.errorRecords.forEach(record => {
      const { category, severity } = record.classification;

      stats.errorsByCategory[category] = (stats.errorsByCategory[category] || 0) + 1;
      stats.errorsBySeverity[severity] = (stats.errorsBySeverity[severity] || 0) + 1;
    });

    // Calculate time to recovery (time until budget recovers to 100%)
    const currentStatus = this.getCurrentStatus();
    if (currentStatus.consumed > 0) {
      const oldestError = this.errorRecords[0];
      const timeUntilOldestExpires =
        (oldestError.timestamp + this.config.timeWindow) - Date.now();
      stats.timeToRecovery = Math.max(0, timeUntilOldestExpires);
    }

    return stats;
  }

  reset() {
    this.errorRecords = [];
    this.persistData();
  }

  updateConfig(config: Partial<ErrorBudgetConfig>) {
    this.config = { ...this.config, ...config };
    // Recheck status with new config
    const status = this.getCurrentStatus();
    this.checkAndSendAlerts(status, {} as ErrorClassification);
  }
}