/**
 * Migration Types and Interfaces
 * @module MigrationTypes
 * @description Core type definitions for the component migration infrastructure
 */

/**
 * Represents the overall migration infrastructure components
 * @interface MigrationInfrastructure
 * @property {MigrationOrchestrator} orchestrator - Manages migration workflow and state
 * @property {TypeScriptConverter} converter - Handles JS to TS conversion
 * @property {MigrationValidator} validator - Validates migration quality
 * @property {RollbackManager} rollback - Manages rollback operations
 * @property {MigrationMonitor} monitoring - Tracks migration metrics
 * @property {TestSuite} testing - Comprehensive testing framework
 */
export interface MigrationInfrastructure {
  orchestrator: MigrationOrchestrator;
  converter: TypeScriptConverter;
  validator: MigrationValidator;
  rollback: RollbackManager;
  monitoring: MigrationMonitor;
  testing: TestSuite;
}

/**
 * Component migration status enumeration
 * @enum {string}
 */
export enum MigrationStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  IN_PROGRESS = 'in_progress',
  VALIDATING = 'validating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

/**
 * Migration strategy types
 * @enum {string}
 */
export enum MigrationStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  PHASED = 'phased'
}

/**
 * Dependency graph node for migration ordering
 * @interface DependencyNode
 * @property {string} id - Unique identifier for the component
 * @property {string} filePath - Path to the component file
 * @property {string[]} dependencies - List of component dependencies
 * @property {string[]} dependents - Components that depend on this one
 * @property {number} migrationOrder - Calculated migration order
 */
export interface DependencyNode {
  id: string;
  filePath: string;
  dependencies: string[];
  dependents: string[];
  migrationOrder: number;
}

/**
 * Complete dependency graph for migration planning
 * @interface DependencyGraph
 * @property {Map<string, DependencyNode>} nodes - All component nodes
 * @property {string[]} migrationOrder - Ordered list for migration
 * @property {boolean} hasCycles - Whether circular dependencies exist
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  migrationOrder: string[];
  hasCycles: boolean;
}

/**
 * Rollback strategy configuration
 * @interface RollbackStrategy
 * @property {'manual' | 'automatic' | 'circuit-breaker'} trigger - Rollback trigger type
 * @property {boolean} preserveState - Whether to preserve component state
 * @property {string[]} notificationTarget - Email/Slack targets for notifications
 * @property {string[]} validationSteps - Steps to validate rollback success
 */
export interface RollbackStrategy {
  trigger: 'manual' | 'automatic' | 'circuit-breaker';
  preserveState: boolean;
  notificationTarget: string[];
  validationSteps: string[];
}

/**
 * Validation suite configuration
 * @interface ValidationSuite
 * @property {boolean} visualRegression - Enable visual regression testing
 * @property {boolean} functionalTesting - Enable functional equivalence testing
 * @property {boolean} performanceTesting - Enable performance comparison
 * @property {boolean} accessibilityTesting - Enable accessibility validation
 * @property {boolean} securityScanning - Enable security vulnerability scanning
 */
export interface ValidationSuite {
  visualRegression: boolean;
  functionalTesting: boolean;
  performanceTesting: boolean;
  accessibilityTesting: boolean;
  securityScanning: boolean;
}

/**
 * Individual component migration step
 * @interface ComponentMigrationStep
 * @property {string} componentId - Component identifier
 * @property {string} sourceFile - Original JS file path
 * @property {string} targetFile - Target TS file path
 * @property {MigrationStatus} status - Current migration status
 * @property {number} progress - Progress percentage (0-100)
 * @property {Date} startedAt - Migration start timestamp
 * @property {Date | null} completedAt - Migration completion timestamp
 * @property {MigrationMetrics} metrics - Migration performance metrics
 */
export interface ComponentMigrationStep {
  componentId: string;
  sourceFile: string;
  targetFile: string;
  status: MigrationStatus;
  progress: number;
  startedAt: Date;
  completedAt: Date | null;
  metrics: MigrationMetrics;
}

/**
 * Complete migration plan for a set of components
 * @interface MigrationPlan
 * @property {string} id - Unique plan identifier
 * @property {ComponentMigrationStep[]} components - Components to migrate
 * @property {DependencyGraph} dependencies - Component dependency graph
 * @property {MigrationStrategy} strategy - Migration execution strategy
 * @property {RollbackStrategy} rollbackPlan - Rollback configuration
 * @property {ValidationSuite} validation - Validation configuration
 * @property {Date} createdAt - Plan creation timestamp
 * @property {string} createdBy - User who created the plan
 */
export interface MigrationPlan {
  id: string;
  components: ComponentMigrationStep[];
  dependencies: DependencyGraph;
  strategy: MigrationStrategy;
  rollbackPlan: RollbackStrategy;
  validation: ValidationSuite;
  createdAt: Date;
  createdBy: string;
}

/**
 * Migration performance metrics
 * @interface MigrationMetrics
 * @property {number} conversionTime - Time to convert JS to TS (ms)
 * @property {number} validationTime - Time to validate migration (ms)
 * @property {number} testingTime - Time to run tests (ms)
 * @property {number} totalTime - Total migration time (ms)
 * @property {number} linesOfCode - Lines of code migrated
 * @property {number} typesCoverage - Percentage of code with types
 * @property {number} testsCoverage - Test coverage percentage
 * @property {number} bundleSizeBefore - Bundle size before migration (KB)
 * @property {number} bundleSizeAfter - Bundle size after migration (KB)
 */
export interface MigrationMetrics {
  conversionTime: number;
  validationTime: number;
  testingTime: number;
  totalTime: number;
  linesOfCode: number;
  typesCoverage: number;
  testsCoverage: number;
  bundleSizeBefore: number;
  bundleSizeAfter: number;
}

/**
 * Migration result with complete details
 * @interface MigrationResult
 * @property {boolean} success - Whether migration was successful
 * @property {string} componentId - Component that was migrated
 * @property {MigrationMetrics} metrics - Performance metrics
 * @property {ValidationResult} validation - Validation results
 * @property {MigrationError[]} errors - Any errors encountered
 * @property {string[]} warnings - Non-critical warnings
 */
export interface MigrationResult {
  success: boolean;
  componentId: string;
  metrics: MigrationMetrics;
  validation: ValidationResult;
  errors: MigrationError[];
  warnings: string[];
}

/**
 * Validation result details
 * @interface ValidationResult
 * @property {boolean} passed - Overall validation pass/fail
 * @property {number} score - Validation score (0-100)
 * @property {TestResult} visualRegression - Visual regression test results
 * @property {TestResult} functionalTests - Functional test results
 * @property {TestResult} performanceTests - Performance test results
 * @property {TestResult} accessibilityTests - Accessibility test results
 * @property {TestResult} securityTests - Security scan results
 */
export interface ValidationResult {
  passed: boolean;
  score: number;
  visualRegression: TestResult;
  functionalTests: TestResult;
  performanceTests: TestResult;
  accessibilityTests: TestResult;
  securityTests: TestResult;
}

/**
 * Individual test result
 * @interface TestResult
 * @property {boolean} passed - Test pass/fail status
 * @property {number} testsRun - Number of tests executed
 * @property {number} testsPassed - Number of tests passed
 * @property {number} testsFailed - Number of tests failed
 * @property {number} duration - Test execution duration (ms)
 * @property {string[]} failures - Failure descriptions
 */
export interface TestResult {
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  duration: number;
  failures: string[];
}

/**
 * Migration error details
 * @interface MigrationError
 * @property {string} componentId - Component where error occurred
 * @property {'critical' | 'high' | 'medium' | 'low'} severity - Error severity
 * @property {string} step - Migration step where error occurred
 * @property {string} message - Error message
 * @property {string} stack - Error stack trace
 * @property {Date} timestamp - When error occurred
 */
export interface MigrationError {
  componentId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  step: string;
  message: string;
  stack: string;
  timestamp: Date;
}

/**
 * Checkpoint for rollback operations
 * @interface Checkpoint
 * @property {string} id - Checkpoint identifier
 * @property {string} componentId - Component being checkpointed
 * @property {string} backupPath - Path to backup file
 * @property {any} state - Component state snapshot
 * @property {Date} createdAt - Checkpoint creation time
 * @property {boolean} isValid - Whether checkpoint is still valid
 */
export interface Checkpoint {
  id: string;
  componentId: string;
  backupPath: string;
  state: any;
  createdAt: Date;
  isValid: boolean;
}

/**
 * Rollback result details
 * @interface RollbackResult
 * @property {boolean} success - Whether rollback was successful
 * @property {string} componentId - Component that was rolled back
 * @property {Checkpoint} checkpoint - Checkpoint used for rollback
 * @property {number} duration - Rollback duration (ms)
 * @property {string} reason - Reason for rollback
 */
export interface RollbackResult {
  success: boolean;
  componentId: string;
  checkpoint: Checkpoint;
  duration: number;
  reason: string;
}

// Type exports for external modules
export type MigrationOrchestrator = any; // Will be implemented in orchestrator module
export type TypeScriptConverter = any; // Will be implemented in converter module
export type MigrationValidator = any; // Will be implemented in validator module
export type RollbackManager = any; // Will be implemented in rollback module
export type MigrationMonitor = any; // Will be implemented in monitoring module
export type TestSuite = any; // Will be implemented in testing module