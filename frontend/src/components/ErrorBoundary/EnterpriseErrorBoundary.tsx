import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorClassificationService } from '../../services/ErrorClassificationService';
import { ErrorBudgetManager } from '../../services/ErrorBudgetManager';
import { UserStatePreservation } from '../../services/UserStatePreservation';
import { ErrorRecoveryOrchestrator } from '../../services/ErrorRecoveryOrchestrator';
import ErrorFallbackRenderer from './ErrorFallbackRenderer';
import { ErrorReporting } from '../../services/ErrorReporting';
import { EmergencyProtocol } from '../../services/EmergencyProtocol';

interface Props {
  children: ReactNode;
  level: 'global' | 'route' | 'component' | 'feature';
  criticalPath?: boolean;
  fallbackComponent?: ReactNode;
  errorBudgetId?: string;
  recovery?: RecoveryConfig;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  errorClassification: ErrorClassification | null;
  recoveryAttempts: number;
  emergencyMode: boolean;
  userState: PreservedState | null;
}

export interface ErrorClassification {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'user' | 'network' | 'logic' | 'system' | 'external';
  recoverable: boolean;
  userImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  businessImpact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  similarityScore?: number;
  predictedCause?: string;
}

export interface RecoveryConfig {
  maxAttempts: number;
  strategies: RecoveryStrategy[];
  emergencyFallback: ReactNode;
  preserveState: boolean;
  notifyUser: boolean;
}

export interface RecoveryStrategy {
  type: 'retry' | 'reload' | 'fallback' | 'redirect' | 'reset';
  delay?: number;
  maxRetries?: number;
  condition?: (error: Error, attempts: number) => boolean;
}

export interface PreservedState {
  formData: Record<string, any>;
  scrollPosition: number;
  routeParams: Record<string, string>;
  userPreferences: Record<string, any>;
  temporaryData: Record<string, any>;
  timestamp: number;
}

export interface ErrorBudgetStatus {
  remaining: number;
  consumed: number;
  threshold: number;
  timeWindow: number;
  isExceeded: boolean;
  predictedExhaustion?: Date;
}

export class EnterpriseErrorBoundary extends Component<Props, State> {
  private errorClassificationService: ErrorClassificationService;
  private errorBudgetManager: ErrorBudgetManager;
  private userStatePreservation: UserStatePreservation;
  private recoveryOrchestrator: ErrorRecoveryOrchestrator;
  private errorReporting: ErrorReporting;
  private emergencyProtocol: EmergencyProtocol;
  private performanceObserver?: PerformanceObserver;
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: Props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      errorClassification: null,
      recoveryAttempts: 0,
      emergencyMode: false,
      userState: null,
    };

    this.errorClassificationService = new ErrorClassificationService();
    this.errorBudgetManager = new ErrorBudgetManager(props.errorBudgetId || props.level);
    this.userStatePreservation = new UserStatePreservation();
    this.recoveryOrchestrator = new ErrorRecoveryOrchestrator();
    this.errorReporting = new ErrorReporting();
    this.emergencyProtocol = new EmergencyProtocol();

    this.setupPerformanceMonitoring();
  }

  private setupPerformanceMonitoring() {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.entryType === 'measure' && entry.name.includes('error-boundary')) {
            this.errorReporting.recordPerformanceMetric({
              name: entry.name,
              duration: entry.duration,
              timestamp: entry.startTime,
              level: this.props.level,
            });
          }
        });
      });

      this.performanceObserver.observe({ entryTypes: ['measure'] });
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    performance.mark('error-boundary-start');

    return {
      hasError: true,
      error,
      errorId,
    };
  }

  async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    performance.mark('error-boundary-classification-start');

    try {
      const classification = await this.errorClassificationService.classifyError(
        error,
        errorInfo,
        {
          level: this.props.level,
          criticalPath: this.props.criticalPath,
          routeInfo: window.location.pathname,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        }
      );

      const userState = await this.userStatePreservation.preserveCurrentState({
        includeFormData: true,
        includeScrollPosition: true,
        includeTemporaryData: true,
        includeUserPreferences: true,
      });

      const budgetStatus = await this.errorBudgetManager.recordError(
        classification,
        this.state.errorId!
      );

      const shouldActivateEmergency = this.shouldActivateEmergencyMode(
        classification,
        budgetStatus
      );

      if (shouldActivateEmergency) {
        await this.emergencyProtocol.activate({
          errorId: this.state.errorId!,
          classification,
          budgetStatus,
          preservedState: userState,
        });
      }

      await this.errorReporting.reportError({
        error,
        errorInfo,
        errorId: this.state.errorId!,
        classification,
        budgetStatus,
        userState,
        level: this.props.level,
        criticalPath: this.props.criticalPath,
        recoveryAttempts: this.state.recoveryAttempts,
        emergencyMode: shouldActivateEmergency,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: Date.now(),
        sessionId: this.userStatePreservation.getSessionId(),
        userId: await this.userStatePreservation.getUserId(),
        buildVersion: process.env.REACT_APP_VERSION,
        featureFlags: await this.userStatePreservation.getFeatureFlags(),
      });

      if (classification.recoverable && this.props.recovery) {
        this.initiateRecovery();
      }

      this.setState({
        errorInfo,
        errorClassification: classification,
        emergencyMode: shouldActivateEmergency,
        userState,
      });

      performance.mark('error-boundary-classification-end');
      performance.measure(
        'error-boundary-classification',
        'error-boundary-classification-start',
        'error-boundary-classification-end'
      );

    } catch (processingError) {
      console.error('Error in error boundary processing:', processingError);

      this.setState({
        errorInfo,
        errorClassification: {
          severity: 'critical',
          category: 'system',
          recoverable: false,
          userImpact: 'critical',
          businessImpact: 'critical',
        },
        emergencyMode: true,
      });

      await this.emergencyProtocol.activateFallback();
    }
  }

  private shouldActivateEmergencyMode(
    classification: ErrorClassification,
    budgetStatus: ErrorBudgetStatus
  ): boolean {
    if (classification.severity === 'critical') return true;
    if (classification.businessImpact === 'critical') return true;
    if (budgetStatus.isExceeded) return true;
    if (budgetStatus.remaining / budgetStatus.threshold < 0.1) return true;
    if (this.state.recoveryAttempts > 3) return true;

    return false;
  }

  private async initiateRecovery() {
    const { recovery } = this.props;
    if (!recovery || this.state.recoveryAttempts >= recovery.maxAttempts) {
      this.handleRecoveryFailure();
      return;
    }

    const nextAttempt = this.state.recoveryAttempts + 1;
    this.setState({ recoveryAttempts: nextAttempt });

    for (const strategy of recovery.strategies) {
      if (strategy.condition && !strategy.condition(this.state.error!, nextAttempt)) {
        continue;
      }

      const success = await this.executeRecoveryStrategy(strategy);
      if (success) {
        await this.handleRecoverySuccess();
        return;
      }
    }

    this.handleRecoveryFailure();
  }

  private async executeRecoveryStrategy(strategy: RecoveryStrategy): Promise<boolean> {
    try {
      switch (strategy.type) {
        case 'retry':
          return await this.recoveryOrchestrator.retryComponent(
            this.props.children,
            strategy.delay || 1000
          );

        case 'reload':
          return await this.recoveryOrchestrator.reloadComponent();

        case 'fallback':
          return await this.recoveryOrchestrator.loadFallback(
            this.props.fallbackComponent
          );

        case 'redirect':
          return await this.recoveryOrchestrator.redirectToSafePage();

        case 'reset':
          return await this.recoveryOrchestrator.resetApplicationState();

        default:
          return false;
      }
    } catch (strategyError) {
      console.error(`Recovery strategy ${strategy.type} failed:`, strategyError);
      return false;
    }
  }

  private async handleRecoverySuccess() {
    this.setState({ hasError: false, recoveryAttempts: 0 });

    await this.errorReporting.recordRecoverySuccess({
      errorId: this.state.errorId!,
      attempts: this.state.recoveryAttempts,
      classification: this.state.errorClassification!,
    });

    if (this.state.userState) {
      await this.userStatePreservation.restoreState(this.state.userState);
    }
  }

  private handleRecoveryFailure() {
    this.setState({ emergencyMode: true });

    this.errorReporting.recordRecoveryFailure({
      errorId: this.state.errorId!,
      attempts: this.state.recoveryAttempts,
      classification: this.state.errorClassification!,
    });
  }

  componentWillUnmount() {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.performanceObserver?.disconnect();
  }

  render() {
    if (this.state.hasError) {
      if (this.state.emergencyMode && this.props.recovery?.emergencyFallback) {
        return <>{this.props.recovery.emergencyFallback}</>;
      }

      return (
        <ErrorFallbackRenderer
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          classification={this.state.errorClassification}
          level={this.props.level}
          isEmergencyMode={this.state.emergencyMode}
          onRetry={() => this.initiateRecovery()}
          onReport={(feedback) => this.errorReporting.submitUserFeedback(
            this.state.errorId!,
            feedback
          )}
        />
      );
    }

    return this.props.children;
  }
}

export default EnterpriseErrorBoundary;