/**
 * Feature Flag Service implementation
 * @module FeatureFlagService
 */

import {
  FeatureFlags,
  IFeatureFlagService,
  UserContext,
  FlagEvaluation,
  FeatureFlagServiceConfig,
  FlagConfig,
  CircuitState
} from './types';
import { CircuitBreaker, CRITICAL_FLAGS_CONFIG } from './CircuitBreaker';
import { hashString } from './utils';

/**
 * Main Feature Flag Service for managing feature toggles
 * @class FeatureFlagService
 * @implements {IFeatureFlagService}
 * @description Provides feature flag evaluation, caching, and circuit breaker functionality
 */
export class FeatureFlagService implements IFeatureFlagService {
  private flags: FeatureFlags = {} as FeatureFlags;
  private config: Required<FeatureFlagServiceConfig>;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private evaluationCache: Map<string, { value: any; timestamp: number }> = new Map();
  private updateCallbacks: Set<(flags: FeatureFlags) => void> = new Set();
  private ws: WebSocket | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  /**
   * Creates a new FeatureFlagService instance
   * @param {FeatureFlagServiceConfig} config - Service configuration
   */
  constructor(config: FeatureFlagServiceConfig = {}) {
    this.config = {
      apiUrl: config.apiUrl || '/api/feature-flags',
      wsUrl: config.wsUrl || 'ws://localhost:8080/feature-flags',
      pollingInterval: config.pollingInterval || 30000,
      cacheTimeout: config.cacheTimeout || 5000,
      analyticsEnabled: config.analyticsEnabled !== false,
      persistenceEnabled: config.persistenceEnabled !== false,
      circuitBreakerConfig: config.circuitBreakerConfig || CRITICAL_FLAGS_CONFIG
    };

    // Initialize critical circuit breakers
    this.initializeCircuitBreakers();
  }

  /**
   * Initializes the feature flag service
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load persisted flags first
      if (this.config.persistenceEnabled) {
        this.loadPersistedFlags();
      }

      // Fetch current flags from server
      await this.fetchFlags();

      // Setup real-time updates
      this.setupRealtimeUpdates();

      this.initialized = true;
      console.log('[FeatureFlagService] Initialized successfully');
    } catch (error) {
      console.error('[FeatureFlagService] Initialization failed, using fallback:', error);
      // Still mark as initialized if we have persisted flags
      this.initialized = true;
      // Setup real-time updates anyway
      this.setupRealtimeUpdates();
    }
  }

  /**
   * Checks if a feature flag is enabled
   * @param {keyof FeatureFlags} flagKey - The flag key to check
   * @returns {boolean} True if flag is enabled
   */
  public isEnabled(flagKey: keyof FeatureFlags): boolean {
    const evaluation = this.evaluate(flagKey);
    return Boolean(evaluation.value);
  }

  /**
   * Gets the raw value of a feature flag (not evaluated)
   * @param {keyof FeatureFlags} flagKey - The flag key to get
   * @returns {any} The flag value
   */
  public getValue(flagKey: keyof FeatureFlags): any {
    // For rollout flags, return the percentage value itself, not the evaluation
    if (String(flagKey).endsWith('.rollout')) {
      return this.flags[flagKey] ?? 0;
    }
    // For other flags, return the raw value
    return this.flags[flagKey] ?? false;
  }

  /**
   * Gets the evaluated value of a feature flag
   * @param {keyof FeatureFlags} flagKey - The flag key to evaluate
   * @param {UserContext} userContext - Optional user context
   * @returns {any} The evaluated flag value
   */
  public getEvaluatedValue(flagKey: keyof FeatureFlags, userContext?: UserContext): any {
    const evaluation = this.evaluate(flagKey, userContext);
    return evaluation.value;
  }

  /**
   * Evaluates a feature flag with optional user context
   * @param {keyof FeatureFlags} flagKey - The flag to evaluate
   * @param {UserContext} userContext - Optional user context for targeting
   * @returns {FlagEvaluation} The evaluation result
   */
  public evaluate(flagKey: keyof FeatureFlags, userContext?: UserContext): FlagEvaluation {
    const key = String(flagKey);

    // Check circuit breaker first
    const circuitBreaker = this.circuitBreakers.get(key);
    if (circuitBreaker && !circuitBreaker.canExecute()) {
      return {
        value: false,
        reason: 'circuit_breaker',
        timestamp: Date.now()
      };
    }

    // Check cache
    const cached = this.getCachedEvaluation(key);
    if (cached) {
      return cached;
    }

    // Perform evaluation
    let evaluation: FlagEvaluation;

    try {
      // Check for percentage rollout flags (ending with .rollout and containing a number)
      if (key.endsWith('.rollout')) {
        const rolloutPercentage = this.flags[flagKey];

        // If it's a number, evaluate as percentage rollout
        if (typeof rolloutPercentage === 'number') {
          const bucket = userContext?.percentageBucket ?? this.getUserBucket(userContext?.userId);
          evaluation = {
            value: bucket < rolloutPercentage,
            reason: 'rollout',
            timestamp: Date.now()
          };
        } else {
          // Return the raw value for rollout flags without percentage
          evaluation = {
            value: rolloutPercentage ?? 0,
            reason: 'default',
            timestamp: Date.now()
          };
        }
      } else {
        // Simple flag evaluation - return the actual value
        evaluation = {
          value: this.flags[flagKey] ?? false,
          reason: this.flags[flagKey] !== undefined ? 'targeting' : 'default',
          timestamp: Date.now()
        };
      }

      // Cache the evaluation
      this.cacheEvaluation(key, evaluation);

      // Track analytics
      if (this.config.analyticsEnabled) {
        this.trackEvaluation(key, evaluation, userContext);
      }

      // Record success with circuit breaker
      circuitBreaker?.recordSuccess();

      return evaluation;
    } catch (error) {
      // Record error with circuit breaker
      circuitBreaker?.recordError(error as Error);

      // Return safe default
      return {
        value: false,
        reason: 'default',
        timestamp: Date.now()
      };
    }
  }

  /**
   * Updates feature flags
   * @param {Partial<FeatureFlags>} flags - New flag values
   * @returns {void}
   */
  public updateFlags(flags: Partial<FeatureFlags>): void {
    this.flags = { ...this.flags, ...flags };

    // Persist if enabled
    if (this.config.persistenceEnabled) {
      this.persistFlags();
    }

    // Clear cache
    this.evaluationCache.clear();

    // Notify callbacks
    this.updateCallbacks.forEach(callback => callback(this.flags));

    console.log('[FeatureFlagService] Flags updated:', Object.keys(flags));
  }

  /**
   * Subscribes to flag updates
   * @param {Function} callback - Callback to invoke on updates
   * @returns {Function} Unsubscribe function
   */
  public onFlagUpdate(callback: (flags: FeatureFlags) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  /**
   * Gets the circuit breaker state for a flag
   * @param {string} flagKey - The flag key
   * @returns {CircuitState} The circuit state
   */
  public getCircuitState(flagKey: string): CircuitState {
    const breaker = this.circuitBreakers.get(flagKey);
    return breaker ? breaker.getState() : CircuitState.CLOSED;
  }

  /**
   * Reports an error for a specific flag
   * @param {string} flagKey - The flag key
   * @param {Error} error - The error that occurred
   * @returns {void}
   */
  public reportError(flagKey: string, error: Error): void {
    const breaker = this.circuitBreakers.get(flagKey);
    if (breaker) {
      breaker.recordError(error);
      console.error(`[FeatureFlagService] Error reported for flag ${flagKey}:`, error);
    }
  }

  /**
   * Cleans up resources
   * @returns {void}
   */
  public destroy(): void {
    if (this.ws) {
      this.ws.close();
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.updateCallbacks.clear();
    this.evaluationCache.clear();
    console.log('[FeatureFlagService] Service destroyed');
  }

  /**
   * Initializes circuit breakers for critical flags
   * @private
   */
  private initializeCircuitBreakers(): void {
    // Create circuit breakers for critical migration flags
    const criticalFlags = [
      'migration.upload.enabled',
      'migration.annotation.enabled',
      'migration.navigation.enabled'
    ];

    criticalFlags.forEach(flag => {
      this.circuitBreakers.set(flag, new CircuitBreaker(this.config.circuitBreakerConfig));
    });
  }

  /**
   * Fetches flags from the API
   * @private
   */
  private async fetchFlags(): Promise<void> {
    try {
      const response = await fetch(this.config.apiUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch flags: ${response.statusText}`);
      }
      const flags = await response.json();
      this.updateFlags(flags);
    } catch (error) {
      console.error('[FeatureFlagService] Failed to fetch flags:', error);
      // Use persisted flags as fallback
    }
  }

  /**
   * Sets up real-time updates via WebSocket with fallback to polling
   * @private
   */
  private setupRealtimeUpdates(): void {
    try {
      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onopen = () => {
        console.log('[FeatureFlagService] WebSocket connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          this.updateFlags(update);
        } catch (error) {
          console.error('[FeatureFlagService] Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[FeatureFlagService] WebSocket error:', error);
        this.fallbackToPolling();
      };

      this.ws.onclose = () => {
        console.log('[FeatureFlagService] WebSocket closed, falling back to polling');
        this.fallbackToPolling();
      };
    } catch (error) {
      console.error('[FeatureFlagService] Failed to setup WebSocket:', error);
      this.fallbackToPolling();
    }
  }

  /**
   * Falls back to polling when WebSocket fails
   * @private
   */
  private fallbackToPolling(): void {
    if (this.pollingInterval) {
      return; // Already polling
    }

    console.log('[FeatureFlagService] Starting polling fallback');
    this.pollingInterval = setInterval(() => {
      this.fetchFlags();
    }, this.config.pollingInterval);
  }

  /**
   * Loads persisted flags from localStorage
   * @private
   */
  private loadPersistedFlags(): void {
    try {
      const stored = localStorage.getItem('feature_flags');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.flags = { ...this.flags, ...parsed.flags };
        console.log('[FeatureFlagService] Loaded persisted flags');
      }
    } catch (error) {
      console.error('[FeatureFlagService] Failed to load persisted flags:', error);
    }
  }

  /**
   * Persists flags to localStorage
   * @private
   */
  private persistFlags(): void {
    try {
      localStorage.setItem('feature_flags', JSON.stringify({
        flags: this.flags,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('[FeatureFlagService] Failed to persist flags:', error);
    }
  }

  /**
   * Gets cached evaluation if valid
   * @private
   */
  private getCachedEvaluation(key: string): FlagEvaluation | null {
    const cached = this.evaluationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return {
        value: cached.value,
        reason: 'default',
        timestamp: cached.timestamp
      };
    }
    return null;
  }

  /**
   * Caches an evaluation
   * @private
   */
  private cacheEvaluation(key: string, evaluation: FlagEvaluation): void {
    this.evaluationCache.set(key, {
      value: evaluation.value,
      timestamp: evaluation.timestamp
    });
  }

  /**
   * Gets user bucket for percentage rollouts
   * @private
   */
  private getUserBucket(userId?: string): number {
    if (!userId) {
      return Math.random() * 100;
    }
    // Consistent hashing for user bucketing
    return hashString(userId) % 100;
  }

  /**
   * Tracks flag evaluation for analytics
   * @private
   */
  private trackEvaluation(key: string, evaluation: FlagEvaluation, userContext?: UserContext): void {
    // In production, this would send to analytics service
    if (this.config.analyticsEnabled) {
      console.log('[Analytics] Flag evaluated:', {
        flagKey: key,
        value: evaluation.value,
        reason: evaluation.reason,
        userContext: userContext?.userId
      });
    }
  }
}