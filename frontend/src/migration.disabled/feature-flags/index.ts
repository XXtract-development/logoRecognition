/**
 * Feature Flag System exports
 * @module FeatureFlagIndex
 */

// Types
export type {
  FeatureFlags,
  MigrationFeatureFlags,
  UserContext,
  FlagConfig,
  FlagEvaluation,
  TargetingRule,
  CircuitBreakerConfig,
  FeatureFlagServiceConfig,
  FeatureFlagContextType,
  IFeatureFlagService,
  FlagAnalyticsEvent
} from './types';

export { CircuitState } from './types';

// Core Service
export { FeatureFlagService } from './FeatureFlagService';
export { CircuitBreaker, CRITICAL_FLAGS_CONFIG } from './CircuitBreaker';

// React Components and Hooks
export {
  FeatureFlagProvider,
  useFeatureFlagContext,
  useFeatureFlag,
  useFeatureFlagValue,
  useCircuitBreakerState,
  useFeatureFlagError,
  useABTest,
  withFeatureFlag,
  FeatureGate
} from './FeatureFlagProvider';

// Admin UI
export { FeatureFlagAdmin, FeatureFlagStatus } from './FeatureFlagAdmin';

// Utility Functions
export {
  hashString,
  isValidFlagKey,
  parseFlagKey,
  createFlagKey,
  matchesTargetingRules,
  getNestedValue,
  debounce,
  throttle,
  exponentialBackoff,
  isValidFlagConfig,
  mergeFlagConfig,
  formatFlagValue,
  getFlagMetadata
} from './utils';

/**
 * Default feature flag configuration for the migration project
 */
export const DEFAULT_MIGRATION_FLAGS: Partial<MigrationFeatureFlags> = {
  'migration.upload.enabled': false,
  'migration.upload.rollout': 0,
  'migration.annotation.enabled': false,
  'migration.annotation.rollout': 0,
  'migration.navigation.enabled': false,
  'migration.navigation.rollout': 0,
  'features.bulkUpload.enabled': false,
  'features.virusScanning.enabled': false,
  'features.realtimeSync.enabled': false,
  'features.versionHistory.enabled': false,
  'perf.lazyLoading.enabled': true,
  'perf.virtualScrolling.enabled': true,
  'perf.webWorkers.enabled': false
};