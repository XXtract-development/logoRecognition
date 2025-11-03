/**
 * Feature flag system type definitions
 * @module FeatureFlagTypes
 */

/**
 * Migration-specific feature flags for component migration
 * @interface MigrationFeatureFlags
 */
export interface MigrationFeatureFlags {
  // Component migrations
  'migration.upload.enabled': boolean;
  'migration.upload.rollout': number;
  'migration.annotation.enabled': boolean;
  'migration.annotation.rollout': number;
  'migration.navigation.enabled': boolean;
  'migration.navigation.rollout': number;

  // Feature-specific flags
  'features.bulkUpload.enabled': boolean;
  'features.virusScanning.enabled': boolean;
  'features.realtimeSync.enabled': boolean;
  'features.versionHistory.enabled': boolean;

  // Performance optimizations
  'perf.lazyLoading.enabled': boolean;
  'perf.virtualScrolling.enabled': boolean;
  'perf.webWorkers.enabled': boolean;
}

/**
 * Complete feature flags type including migration flags
 * @type FeatureFlags
 */
export type FeatureFlags = MigrationFeatureFlags & {
  [key: string]: boolean | number | string;
};

/**
 * User context for feature flag targeting
 * @interface UserContext
 */
export interface UserContext {
  userId: string;
  email?: string;
  groups?: string[];
  attributes?: Record<string, any>;
  percentageBucket?: number; // 0-100 for percentage rollouts
}

/**
 * Feature flag configuration
 * @interface FlagConfig
 */
export interface FlagConfig {
  key: string;
  defaultValue: boolean | number | string;
  description?: string;
  rolloutPercentage?: number;
  targetingRules?: TargetingRule[];
  circuitBreakerEnabled?: boolean;
}

/**
 * Targeting rule for user segmentation
 * @interface TargetingRule
 */
export interface TargetingRule {
  attribute: string;
  operator: 'equals' | 'contains' | 'in' | 'greaterThan' | 'lessThan';
  value: any;
}

/**
 * Flag evaluation result with metadata
 * @interface FlagEvaluation
 */
export interface FlagEvaluation {
  value: boolean | number | string;
  reason: 'default' | 'targeting' | 'rollout' | 'override' | 'circuit_breaker';
  timestamp: number;
}

/**
 * Circuit breaker states
 * @enum CircuitState
 */
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker configuration
 * @interface CircuitBreakerConfig
 */
export interface CircuitBreakerConfig {
  errorThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
  onOpen?: () => void;
  onClose?: () => void;
  onHalfOpen?: () => void;
}

/**
 * Feature flag service configuration
 * @interface FeatureFlagServiceConfig
 */
export interface FeatureFlagServiceConfig {
  apiUrl?: string;
  wsUrl?: string;
  pollingInterval?: number;
  cacheTimeout?: number;
  analyticsEnabled?: boolean;
  persistenceEnabled?: boolean;
  circuitBreakerConfig?: CircuitBreakerConfig;
}

/**
 * Feature flag context type for React Context
 * @interface FeatureFlagContextType
 */
export interface FeatureFlagContextType {
  flags: FeatureFlags;
  service: IFeatureFlagService;
  userContext?: UserContext;
  loading: boolean;
  error?: Error;
}

/**
 * Feature flag service interface
 * @interface IFeatureFlagService
 */
export interface IFeatureFlagService {
  initialize(): Promise<void>;
  isEnabled(flagKey: keyof FeatureFlags): boolean;
  getValue(flagKey: keyof FeatureFlags): any;
  evaluate(flagKey: keyof FeatureFlags, userContext?: UserContext): FlagEvaluation;
  updateFlags(flags: Partial<FeatureFlags>): void;
  onFlagUpdate(callback: (flags: FeatureFlags) => void): () => void;
  getCircuitState(flagKey: string): CircuitState;
  reportError(flagKey: string, error: Error): void;
  destroy(): void;
}

/**
 * Analytics event for flag evaluation
 * @interface FlagAnalyticsEvent
 */
export interface FlagAnalyticsEvent {
  flagKey: string;
  value: any;
  reason: string;
  userContext?: UserContext;
  timestamp: number;
  metadata?: Record<string, any>;
}