import { ErrorClassification, ErrorBudgetStatus, PreservedState } from '../components/ErrorBoundary/EnterpriseErrorBoundary';

interface EmergencyActivationParams {
  errorId: string;
  classification: ErrorClassification;
  budgetStatus: ErrorBudgetStatus;
  preservedState: PreservedState;
}

interface EmergencyStatus {
  isActive: boolean;
  activationTime?: Date;
  reason?: string;
  affectedComponents: string[];
  fallbackMode: 'minimal' | 'degraded' | 'readonly' | 'maintenance';
  estimatedRecovery?: Date;
}

interface FeatureToggle {
  feature: string;
  enabled: boolean;
  reason: string;
}

export class EmergencyProtocol {
  private emergencyStatus: EmergencyStatus = {
    isActive: false,
    affectedComponents: [],
    fallbackMode: 'minimal',
  };

  private disabledFeatures: Map<string, FeatureToggle> = new Map();
  private readonly RECOVERY_CHECK_INTERVAL = 30000; // 30 seconds
  private recoveryCheckTimer?: NodeJS.Timeout;
  private activationHistory: EmergencyActivationParams[] = [];
  private readonly MAX_HISTORY = 10;

  async activate(params: EmergencyActivationParams): Promise<void> {
    console.warn('🚨 EMERGENCY PROTOCOL ACTIVATED', params);

    // Update emergency status
    this.emergencyStatus = {
      isActive: true,
      activationTime: new Date(),
      reason: this.determineReason(params),
      affectedComponents: this.identifyAffectedComponents(params),
      fallbackMode: this.determineFallbackMode(params),
      estimatedRecovery: this.estimateRecovery(params),
    };

    // Store activation in history
    this.addToHistory(params);

    // Execute emergency procedures
    await this.executeEmergencyProcedures(params);

    // Start recovery monitoring
    this.startRecoveryMonitoring();

    // Notify relevant parties
    await this.sendEmergencyNotifications(params);
  }

  private determineReason(params: EmergencyActivationParams): string {
    if (params.budgetStatus.isExceeded) {
      return 'Error budget exceeded - system stability at risk';
    }

    if (params.classification.severity === 'critical') {
      return `Critical ${params.classification.category} error detected`;
    }

    if (params.classification.businessImpact === 'critical') {
      return 'Critical business impact detected';
    }

    return 'Multiple system errors detected';
  }

  private identifyAffectedComponents(params: EmergencyActivationParams): string[] {
    const affected: string[] = [];

    // Based on error category, identify affected components
    switch (params.classification.category) {
      case 'network':
        affected.push('api-client', 'data-sync', 'real-time-updates');
        break;
      case 'system':
        affected.push('core-runtime', 'memory-management', 'performance-monitoring');
        break;
      case 'external':
        affected.push('third-party-integrations', 'payment-processing', 'analytics');
        break;
      case 'logic':
        affected.push('business-logic', 'validation', 'calculations');
        break;
      case 'user':
        affected.push('authentication', 'authorization', 'user-preferences');
        break;
    }

    return affected;
  }

  private determineFallbackMode(params: EmergencyActivationParams): 'minimal' | 'degraded' | 'readonly' | 'maintenance' {
    // Critical errors go to maintenance mode
    if (params.classification.severity === 'critical' && !params.classification.recoverable) {
      return 'maintenance';
    }

    // Budget exceeded goes to readonly
    if (params.budgetStatus.isExceeded) {
      return 'readonly';
    }

    // High severity goes to degraded
    if (params.classification.severity === 'high') {
      return 'degraded';
    }

    // Default to minimal
    return 'minimal';
  }

  private estimateRecovery(params: EmergencyActivationParams): Date {
    const now = new Date();
    let estimatedMinutes = 5; // Default 5 minutes

    // Adjust based on severity
    switch (params.classification.severity) {
      case 'critical':
        estimatedMinutes = 30;
        break;
      case 'high':
        estimatedMinutes = 15;
        break;
      case 'medium':
        estimatedMinutes = 10;
        break;
    }

    // Adjust based on recoverability
    if (!params.classification.recoverable) {
      estimatedMinutes *= 2;
    }

    return new Date(now.getTime() + estimatedMinutes * 60000);
  }

  private async executeEmergencyProcedures(params: EmergencyActivationParams): Promise<void> {
    // 1. Disable non-critical features
    await this.disableNonCriticalFeatures(params);

    // 2. Enable circuit breakers
    await this.enableCircuitBreakers();

    // 3. Increase cache TTL
    await this.increaseCacheTTL();

    // 4. Reduce API rate limits
    await this.reduceRateLimits();

    // 5. Enable read-only mode if necessary
    if (this.emergencyStatus.fallbackMode === 'readonly' || this.emergencyStatus.fallbackMode === 'maintenance') {
      await this.enableReadOnlyMode();
    }

    // 6. Save user state
    await this.saveUserStateToCloud(params.preservedState);

    // 7. Clear non-essential background tasks
    await this.clearBackgroundTasks();

    // 8. Optimize resource usage
    await this.optimizeResourceUsage();
  }

  private async disableNonCriticalFeatures(params: EmergencyActivationParams): Promise<void> {
    const criticalFeatures = [
      'authentication',
      'core-navigation',
      'data-display',
      'error-reporting',
    ];

    // Get all features
    const allFeatures = this.getAllFeatures();

    // Disable non-critical features
    allFeatures.forEach(feature => {
      if (!criticalFeatures.includes(feature)) {
        this.disabledFeatures.set(feature, {
          feature,
          enabled: false,
          reason: `Disabled due to emergency protocol: ${params.classification.severity} error`,
        });
      }
    });

    // Apply feature toggles
    await this.applyFeatureToggles();
  }

  private getAllFeatures(): string[] {
    // In production, this would fetch from feature flag service
    return [
      'authentication',
      'core-navigation',
      'data-display',
      'error-reporting',
      'analytics',
      'social-sharing',
      'advanced-search',
      'real-time-updates',
      'notifications',
      'file-upload',
      'export-functionality',
      'third-party-integrations',
    ];
  }

  private async applyFeatureToggles(): Promise<void> {
    // Apply feature toggles to the application
    const toggles: Record<string, boolean> = {};

    this.disabledFeatures.forEach((toggle, feature) => {
      toggles[feature] = toggle.enabled;
    });

    // Store in localStorage for immediate effect
    localStorage.setItem('emergency-feature-toggles', JSON.stringify(toggles));

    // Dispatch event for React components to re-render
    window.dispatchEvent(new CustomEvent('emergency-features-updated', { detail: toggles }));
  }

  private async enableCircuitBreakers(): Promise<void> {
    // Enable circuit breakers for external services
    const circuitBreakers = {
      api: { enabled: true, threshold: 3, timeout: 30000 },
      database: { enabled: true, threshold: 5, timeout: 20000 },
      cache: { enabled: true, threshold: 10, timeout: 10000 },
      thirdParty: { enabled: true, threshold: 2, timeout: 45000 },
    };

    localStorage.setItem('circuit-breakers', JSON.stringify(circuitBreakers));
  }

  private async increaseCacheTTL(): Promise<void> {
    // Increase cache TTL to reduce load
    const cacheConfig = {
      defaultTTL: 3600000, // 1 hour
      maxTTL: 7200000, // 2 hours
      emergencyMode: true,
    };

    localStorage.setItem('cache-config-emergency', JSON.stringify(cacheConfig));
  }

  private async reduceRateLimits(): Promise<void> {
    // Reduce API rate limits to prevent overload
    const rateLimits = {
      api: { requestsPerMinute: 10, requestsPerHour: 300 },
      search: { requestsPerMinute: 5, requestsPerHour: 100 },
      upload: { requestsPerMinute: 1, requestsPerHour: 10 },
    };

    localStorage.setItem('rate-limits-emergency', JSON.stringify(rateLimits));
  }

  private async enableReadOnlyMode(): Promise<void> {
    // Enable read-only mode
    document.body.classList.add('emergency-readonly-mode');

    // Disable all forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      (form as HTMLFormElement).setAttribute('disabled', 'true');
    });

    // Disable all input fields
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      (input as HTMLInputElement).disabled = true;
    });

    // Show read-only banner
    this.showReadOnlyBanner();
  }

  private showReadOnlyBanner(): void {
    const banner = document.createElement('div');
    banner.id = 'emergency-readonly-banner';
    banner.className = 'emergency-banner';
    banner.innerHTML = `
      <div class="emergency-banner-content">
        <span class="emergency-icon">⚠️</span>
        <span class="emergency-message">
          System is currently in read-only mode due to technical issues.
          Your data is safe and we're working on a fix.
          Estimated recovery: ${this.emergencyStatus.estimatedRecovery?.toLocaleTimeString()}
        </span>
      </div>
    `;

    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #FFA500;
      color: #000;
      padding: 12px;
      z-index: 99999;
      text-align: center;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;

    document.body.prepend(banner);
  }

  private async saveUserStateToCloud(state: PreservedState): Promise<void> {
    try {
      // Save user state to cloud storage for recovery
      await fetch('/api/emergency/save-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          timestamp: Date.now(),
          sessionId: this.generateSessionId(),
        }),
      });
    } catch (error) {
      console.error('Failed to save user state to cloud:', error);
      // Fall back to local storage
      localStorage.setItem('emergency-user-state', JSON.stringify(state));
    }
  }

  private async clearBackgroundTasks(): Promise<void> {
    // Clear all non-essential intervals and timeouts
    const highestId = setTimeout(() => {}, 0);

    for (let i = 0; i < highestId; i++) {
      clearTimeout(i);
      clearInterval(i);
    }

    // Keep only emergency recovery timer
    this.startRecoveryMonitoring();
  }

  private async optimizeResourceUsage(): Promise<void> {
    // Reduce animation frame rate
    document.body.style.setProperty('--animation-play-state', 'paused');

    // Disable heavy animations
    document.body.classList.add('reduce-motion');

    // Clear unused caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const nonEssentialCaches = cacheNames.filter(name => !name.includes('essential'));
      await Promise.all(nonEssentialCaches.map(name => caches.delete(name)));
    }

    // Trigger garbage collection if available
    if (typeof (window as any).gc === 'function') {
      (window as any).gc();
    }
  }

  private startRecoveryMonitoring(): void {
    // Clear existing timer
    if (this.recoveryCheckTimer) {
      clearInterval(this.recoveryCheckTimer);
    }

    // Start new monitoring
    this.recoveryCheckTimer = setInterval(() => {
      this.checkRecoveryStatus();
    }, this.RECOVERY_CHECK_INTERVAL);
  }

  private async checkRecoveryStatus(): Promise<void> {
    try {
      // Check system health
      const healthResponse = await fetch('/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (healthResponse.ok) {
        const health = await healthResponse.json();

        if (health.status === 'healthy') {
          await this.initiateRecovery();
        }
      }
    } catch (error) {
      console.error('Recovery check failed:', error);
    }
  }

  private async initiateRecovery(): Promise<void> {
    console.log('🟢 Initiating system recovery...');

    // 1. Re-enable features gradually
    await this.reEnableFeatures();

    // 2. Restore normal cache settings
    this.restoreCacheSettings();

    // 3. Restore rate limits
    this.restoreRateLimits();

    // 4. Disable read-only mode
    this.disableReadOnlyMode();

    // 5. Clear emergency status
    this.emergencyStatus = {
      isActive: false,
      affectedComponents: [],
      fallbackMode: 'minimal',
    };

    // 6. Stop recovery monitoring
    if (this.recoveryCheckTimer) {
      clearInterval(this.recoveryCheckTimer);
    }

    // 7. Notify recovery complete
    await this.notifyRecoveryComplete();
  }

  private async reEnableFeatures(): Promise<void> {
    // Re-enable features gradually
    this.disabledFeatures.clear();
    localStorage.removeItem('emergency-feature-toggles');
    window.dispatchEvent(new CustomEvent('emergency-features-updated', { detail: {} }));
  }

  private restoreCacheSettings(): void {
    localStorage.removeItem('cache-config-emergency');
  }

  private restoreRateLimits(): void {
    localStorage.removeItem('rate-limits-emergency');
  }

  private disableReadOnlyMode(): void {
    document.body.classList.remove('emergency-readonly-mode');

    // Re-enable forms
    const forms = document.querySelectorAll('form[disabled]');
    forms.forEach(form => {
      form.removeAttribute('disabled');
    });

    // Re-enable inputs
    const inputs = document.querySelectorAll('input:disabled, textarea:disabled, select:disabled');
    inputs.forEach(input => {
      (input as HTMLInputElement).disabled = false;
    });

    // Remove banner
    const banner = document.getElementById('emergency-readonly-banner');
    if (banner) {
      banner.remove();
    }
  }

  private async sendEmergencyNotifications(params: EmergencyActivationParams): Promise<void> {
    try {
      await fetch('/api/emergency/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorId: params.errorId,
          classification: params.classification,
          budgetStatus: params.budgetStatus,
          emergencyStatus: this.emergencyStatus,
          timestamp: Date.now(),
        }),
      });
    } catch (error) {
      console.error('Failed to send emergency notifications:', error);
    }
  }

  private async notifyRecoveryComplete(): Promise<void> {
    try {
      await fetch('/api/emergency/recovery-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recoveryTime: Date.now(),
          activationHistory: this.activationHistory,
        }),
      });
    } catch (error) {
      console.error('Failed to notify recovery complete:', error);
    }

    // Show recovery message to users
    this.showRecoveryMessage();
  }

  private showRecoveryMessage(): void {
    const message = document.createElement('div');
    message.className = 'recovery-message';
    message.innerHTML = `
      <span>✅ System has been recovered successfully. All features are now available.</span>
    `;

    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 16px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(message);

    setTimeout(() => {
      message.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        message.remove();
      }, 300);
    }, 5000);
  }

  async activateFallback(): Promise<void> {
    // Simplified fallback activation for critical failures
    this.emergencyStatus = {
      isActive: true,
      activationTime: new Date(),
      reason: 'Critical system failure',
      affectedComponents: ['all'],
      fallbackMode: 'maintenance',
    };

    // Show maintenance page
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;">
        <h1>System Maintenance</h1>
        <p>We're experiencing technical difficulties. Please try again later.</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }

  private addToHistory(params: EmergencyActivationParams): void {
    this.activationHistory.push(params);

    if (this.activationHistory.length > this.MAX_HISTORY) {
      this.activationHistory = this.activationHistory.slice(-this.MAX_HISTORY);
    }
  }

  private generateSessionId(): string {
    return `emergency_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStatus(): EmergencyStatus {
    return { ...this.emergencyStatus };
  }

  getDisabledFeatures(): FeatureToggle[] {
    return Array.from(this.disabledFeatures.values());
  }

  getActivationHistory(): EmergencyActivationParams[] {
    return [...this.activationHistory];
  }
}