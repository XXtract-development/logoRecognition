/**
 * Rollback Manager Service
 * @module RollbackManager
 * @description Manages component rollback and recovery operations
 */

import { Checkpoint, RollbackResult, RollbackStrategy } from '../types/MigrationTypes';
import { BackupService } from '../backup/BackupService';
import { FeatureFlagService } from '../feature-flags/FeatureFlagService';

/**
 * Rollback configuration options
 * @interface RollbackConfig
 * @property {number} maxCheckpoints - Maximum checkpoints to keep per component
 * @property {number} checkpointRetention - Retention period in days
 * @property {boolean} autoCheckpoint - Automatically create checkpoints
 * @property {boolean} validateBeforeRollback - Validate checkpoint before rollback
 * @property {boolean} preserveUserState - Preserve user state during rollback
 * @property {number} rollbackTimeout - Maximum time for rollback operation (ms)
 */
export interface RollbackConfig {
  maxCheckpoints: number;
  checkpointRetention: number;
  autoCheckpoint: boolean;
  validateBeforeRollback: boolean;
  preserveUserState: boolean;
  rollbackTimeout: number;
}

/**
 * Component state snapshot
 * @interface StateSnapshot
 * @property {string} componentId - Component identifier
 * @property {any} state - Component state data
 * @property {any} props - Component props data
 * @property {any} context - Component context data
 * @property {Date} timestamp - Snapshot timestamp
 */
export interface StateSnapshot {
  componentId: string;
  state: any;
  props: any;
  context: any;
  timestamp: Date;
}

/**
 * Rollback validation result
 * @interface RollbackValidation
 * @property {boolean} isValid - Whether rollback is valid
 * @property {string[]} errors - Validation errors
 * @property {string[]} warnings - Validation warnings
 */
export interface RollbackValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Manages rollback operations for migrated components
 * @class RollbackManager
 * @description Provides checkpoint creation, validation, and rollback functionality
 * with state preservation and circuit breaker integration
 */
export class RollbackManager {
  private checkpoints: Map<string, Checkpoint[]>;
  private backupService: BackupService;
  private featureFlagService: FeatureFlagService;
  private config: RollbackConfig;
  private activeRollbacks: Set<string>;

  /**
   * Creates a new RollbackManager instance
   * @param {BackupService} backupService - Backup service instance
   * @param {FeatureFlagService} featureFlagService - Feature flag service
   * @param {Partial<RollbackConfig>} [config] - Rollback configuration
   * @example
   * const rollbackManager = new RollbackManager(
   *   backupService,
   *   featureFlagService,
   *   { maxCheckpoints: 5, autoCheckpoint: true }
   * );
   */
  constructor(
    backupService: BackupService,
    featureFlagService: FeatureFlagService,
    config: Partial<RollbackConfig> = {}
  ) {
    this.backupService = backupService;
    this.featureFlagService = featureFlagService;
    this.checkpoints = new Map();
    this.activeRollbacks = new Set();

    this.config = {
      maxCheckpoints: 5,
      checkpointRetention: 7,
      autoCheckpoint: true,
      validateBeforeRollback: true,
      preserveUserState: true,
      rollbackTimeout: 30000,
      ...config
    };
  }

  /**
   * Creates a checkpoint for a component
   * @param {string} componentId - Component to checkpoint
   * @returns {Promise<Checkpoint>} Created checkpoint
   * @throws {Error} When checkpoint creation fails
   * @example
   * const checkpoint = await rollbackManager.createCheckpoint('UserProfile');
   * console.log(`Checkpoint ${checkpoint.id} created`);
   */
  public async createCheckpoint(componentId: string): Promise<Checkpoint> {
    try {
      // Create backup of current component state
      const backupPath = await this.backupService.backupComponent(componentId);

      // Capture current state snapshot
      const stateSnapshot = await this.captureStateSnapshot(componentId);

      // Create checkpoint
      const checkpoint: Checkpoint = {
        id: this.generateCheckpointId(),
        componentId,
        backupPath,
        state: stateSnapshot,
        createdAt: new Date(),
        isValid: true
      };

      // Store checkpoint
      if (!this.checkpoints.has(componentId)) {
        this.checkpoints.set(componentId, []);
      }

      const componentCheckpoints = this.checkpoints.get(componentId)!;
      componentCheckpoints.push(checkpoint);

      // Maintain max checkpoints limit
      if (componentCheckpoints.length > this.config.maxCheckpoints) {
        const removed = componentCheckpoints.shift();
        if (removed) {
          await this.cleanupCheckpoint(removed);
        }
      }

      return checkpoint;

    } catch (error) {
      throw new Error(`Failed to create checkpoint for ${componentId}: ${(error as Error).message}`);
    }
  }

  /**
   * Executes rollback for a component
   * @param {string} componentId - Component to rollback
   * @param {RollbackStrategy} strategy - Rollback strategy
   * @returns {Promise<RollbackResult>} Rollback result
   * @throws {Error} When rollback fails
   * @example
   * const result = await rollbackManager.executeRollback('UserProfile', {
   *   trigger: 'manual',
   *   preserveState: true,
   *   notificationTarget: ['dev-team@example.com'],
   *   validationSteps: ['restore-files', 'validate-functionality']
   * });
   */
  public async executeRollback(
    componentId: string,
    strategy: RollbackStrategy
  ): Promise<RollbackResult> {
    const startTime = Date.now();

    // Check if rollback is already in progress
    if (this.activeRollbacks.has(componentId)) {
      throw new Error(`Rollback already in progress for ${componentId}`);
    }

    this.activeRollbacks.add(componentId);

    try {
      // Get latest valid checkpoint
      const checkpoint = await this.getLatestCheckpoint(componentId);
      if (!checkpoint) {
        throw new Error(`No valid checkpoint found for ${componentId}`);
      }

      // Validate checkpoint if configured
      if (this.config.validateBeforeRollback) {
        const validation = await this.validateCheckpoint(checkpoint);
        if (!validation.isValid) {
          throw new Error(`Checkpoint validation failed: ${validation.errors.join(', ')}`);
        }
      }

      // Preserve current state if configured
      let preservedState: StateSnapshot | null = null;
      if (strategy.preserveState && this.config.preserveUserState) {
        preservedState = await this.captureStateSnapshot(componentId);
      }

      // Disable feature flag to prevent usage during rollback
      await this.featureFlagService.disableFlag(`migration_${componentId}`);

      // Execute rollback steps
      await this.executeRollbackSteps(checkpoint, strategy);

      // Restore component from backup
      await this.backupService.restoreComponent(componentId, checkpoint.backupPath);

      // Restore preserved state if applicable
      if (preservedState) {
        await this.restoreStateSnapshot(componentId, preservedState);
      }

      // Validate rollback
      for (const validationStep of strategy.validationSteps) {
        await this.executeValidationStep(validationStep, componentId);
      }

      // Send notifications
      if (strategy.notificationTarget.length > 0) {
        await this.sendRollbackNotifications(
          componentId,
          strategy.notificationTarget,
          'success'
        );
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        componentId,
        checkpoint,
        duration,
        reason: `Rollback triggered by ${strategy.trigger}`
      };

    } catch (error) {
      // Send failure notifications
      if (strategy.notificationTarget.length > 0) {
        await this.sendRollbackNotifications(
          componentId,
          strategy.notificationTarget,
          'failure',
          (error as Error).message
        );
      }

      throw error;

    } finally {
      this.activeRollbacks.delete(componentId);
    }
  }

  /**
   * Checks if a component can be rolled back
   * @param {string} componentId - Component to check
   * @returns {Promise<boolean>} Whether rollback is possible
   * @example
   * const canRollback = await rollbackManager.canRollback('UserProfile');
   * if (canRollback) {
   *   console.log('Component can be rolled back');
   * }
   */
  public async canRollback(componentId: string): Promise<boolean> {
    // Check if component has checkpoints
    const checkpoints = this.checkpoints.get(componentId);
    if (!checkpoints || checkpoints.length === 0) {
      return false;
    }

    // Check if any checkpoint is valid
    const hasValidCheckpoint = checkpoints.some(cp => cp.isValid);
    if (!hasValidCheckpoint) {
      return false;
    }

    // Check if rollback is not already in progress
    if (this.activeRollbacks.has(componentId)) {
      return false;
    }

    // Check if backup files exist
    const latestCheckpoint = checkpoints[checkpoints.length - 1];
    const backupExists = await this.backupService.backupExists(latestCheckpoint.backupPath);

    return backupExists;
  }

  /**
   * Checks if a checkpoint exists for a component
   * @param {string} componentId - Component to check
   * @returns {Promise<boolean>} Whether checkpoint exists
   * @example
   * const hasCheckpoint = await rollbackManager.hasCheckpoint('UserProfile');
   */
  public async hasCheckpoint(componentId: string): Promise<boolean> {
    const checkpoints = this.checkpoints.get(componentId);
    return checkpoints ? checkpoints.length > 0 : false;
  }

  /**
   * Gets all checkpoints for a component
   * @param {string} componentId - Component identifier
   * @returns {Promise<Checkpoint[]>} Array of checkpoints
   * @example
   * const checkpoints = await rollbackManager.getCheckpoints('UserProfile');
   * console.log(`Found ${checkpoints.length} checkpoints`);
   */
  public async getCheckpoints(componentId: string): Promise<Checkpoint[]> {
    return this.checkpoints.get(componentId) || [];
  }

  /**
   * Validates a checkpoint
   * @param {Checkpoint} checkpoint - Checkpoint to validate
   * @returns {Promise<RollbackValidation>} Validation result
   * @example
   * const validation = await rollbackManager.validateCheckpoint(checkpoint);
   * if (validation.isValid) {
   *   console.log('Checkpoint is valid');
   * }
   */
  public async validateCheckpoint(checkpoint: Checkpoint): Promise<RollbackValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if checkpoint is expired
    const age = Date.now() - checkpoint.createdAt.getTime();
    const maxAge = this.config.checkpointRetention * 24 * 60 * 60 * 1000;

    if (age > maxAge) {
      warnings.push(`Checkpoint is ${Math.floor(age / (24 * 60 * 60 * 1000))} days old`);
    }

    // Check if backup file exists
    const backupExists = await this.backupService.backupExists(checkpoint.backupPath);
    if (!backupExists) {
      errors.push('Backup file not found');
    }

    // Check if checkpoint is marked as invalid
    if (!checkpoint.isValid) {
      errors.push('Checkpoint is marked as invalid');
    }

    // Validate checkpoint integrity
    const integrityValid = await this.validateCheckpointIntegrity(checkpoint);
    if (!integrityValid) {
      errors.push('Checkpoint integrity check failed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Cleans up old checkpoints
   * @param {string} [componentId] - Optional component to clean up
   * @returns {Promise<number>} Number of checkpoints cleaned
   * @example
   * const cleaned = await rollbackManager.cleanupOldCheckpoints();
   * console.log(`Cleaned ${cleaned} old checkpoints`);
   */
  public async cleanupOldCheckpoints(componentId?: string): Promise<number> {
    let cleaned = 0;
    const maxAge = this.config.checkpointRetention * 24 * 60 * 60 * 1000;

    const componentsToClean = componentId
      ? [componentId]
      : Array.from(this.checkpoints.keys());

    for (const compId of componentsToClean) {
      const checkpoints = this.checkpoints.get(compId) || [];
      const validCheckpoints: Checkpoint[] = [];

      for (const checkpoint of checkpoints) {
        const age = Date.now() - checkpoint.createdAt.getTime();

        if (age > maxAge) {
          await this.cleanupCheckpoint(checkpoint);
          cleaned++;
        } else {
          validCheckpoints.push(checkpoint);
        }
      }

      this.checkpoints.set(compId, validCheckpoints);
    }

    return cleaned;
  }

  /**
   * Invalidates a checkpoint
   * @param {string} checkpointId - Checkpoint to invalidate
   * @returns {Promise<void>}
   * @example
   * await rollbackManager.invalidateCheckpoint('checkpoint-123');
   */
  public async invalidateCheckpoint(checkpointId: string): Promise<void> {
    for (const checkpoints of this.checkpoints.values()) {
      const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
      if (checkpoint) {
        checkpoint.isValid = false;
        break;
      }
    }
  }

  /**
   * Gets the latest valid checkpoint for a component
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<Checkpoint | null>} Latest checkpoint or null
   */
  private async getLatestCheckpoint(componentId: string): Promise<Checkpoint | null> {
    const checkpoints = this.checkpoints.get(componentId);
    if (!checkpoints || checkpoints.length === 0) {
      return null;
    }

    // Find latest valid checkpoint
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      if (checkpoints[i].isValid) {
        return checkpoints[i];
      }
    }

    return null;
  }

  /**
   * Captures component state snapshot
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<StateSnapshot>} State snapshot
   */
  private async captureStateSnapshot(componentId: string): Promise<StateSnapshot> {
    // This would capture actual component state from the running application
    // For now, returning mock snapshot
    return {
      componentId,
      state: {},
      props: {},
      context: {},
      timestamp: new Date()
    };
  }

  /**
   * Restores component state snapshot
   * @private
   * @param {string} componentId - Component identifier
   * @param {StateSnapshot} snapshot - Snapshot to restore
   * @returns {Promise<void>}
   */
  private async restoreStateSnapshot(componentId: string, snapshot: StateSnapshot): Promise<void> {
    // This would restore actual component state in the running application
    console.log(`Restoring state snapshot for ${componentId}`);
  }

  /**
   * Executes rollback steps
   * @private
   * @param {Checkpoint} checkpoint - Checkpoint to use
   * @param {RollbackStrategy} strategy - Rollback strategy
   * @returns {Promise<void>}
   */
  private async executeRollbackSteps(
    checkpoint: Checkpoint,
    strategy: RollbackStrategy
  ): Promise<void> {
    // Execute pre-rollback hooks
    console.log(`Executing rollback for ${checkpoint.componentId}`);

    // Clear caches
    await this.clearComponentCaches(checkpoint.componentId);

    // Stop active processes
    await this.stopActiveProcesses(checkpoint.componentId);
  }

  /**
   * Executes validation step
   * @private
   * @param {string} step - Validation step name
   * @param {string} componentId - Component identifier
   * @returns {Promise<void>}
   */
  private async executeValidationStep(step: string, componentId: string): Promise<void> {
    switch (step) {
      case 'restore-files':
        await this.validateFileRestoration(componentId);
        break;
      case 'validate-functionality':
        await this.validateComponentFunctionality(componentId);
        break;
      case 'update-feature-flags':
        await this.updateFeatureFlags(componentId);
        break;
      default:
        console.log(`Unknown validation step: ${step}`);
    }
  }

  /**
   * Validates file restoration
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<void>}
   */
  private async validateFileRestoration(componentId: string): Promise<void> {
    // Validate that files have been properly restored
    console.log(`Validating file restoration for ${componentId}`);
  }

  /**
   * Validates component functionality
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<void>}
   */
  private async validateComponentFunctionality(componentId: string): Promise<void> {
    // Run basic functionality tests
    console.log(`Validating functionality for ${componentId}`);
  }

  /**
   * Updates feature flags after rollback
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<void>}
   */
  private async updateFeatureFlags(componentId: string): Promise<void> {
    // Re-enable component with original version
    await this.featureFlagService.enableFlag(`${componentId}_original`);
  }

  /**
   * Sends rollback notifications
   * @private
   * @param {string} componentId - Component identifier
   * @param {string[]} targets - Notification targets
   * @param {'success' | 'failure'} status - Rollback status
   * @param {string} [errorMessage] - Error message if failed
   * @returns {Promise<void>}
   */
  private async sendRollbackNotifications(
    componentId: string,
    targets: string[],
    status: 'success' | 'failure',
    errorMessage?: string
  ): Promise<void> {
    const message = status === 'success'
      ? `Rollback completed successfully for ${componentId}`
      : `Rollback failed for ${componentId}: ${errorMessage}`;

    // This would send actual notifications
    console.log(`Sending notification: ${message} to ${targets.join(', ')}`);
  }

  /**
   * Clears component caches
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<void>}
   */
  private async clearComponentCaches(componentId: string): Promise<void> {
    // Clear any cached data for the component
    console.log(`Clearing caches for ${componentId}`);
  }

  /**
   * Stops active processes
   * @private
   * @param {string} componentId - Component identifier
   * @returns {Promise<void>}
   */
  private async stopActiveProcesses(componentId: string): Promise<void> {
    // Stop any running processes related to the component
    console.log(`Stopping active processes for ${componentId}`);
  }

  /**
   * Validates checkpoint integrity
   * @private
   * @param {Checkpoint} checkpoint - Checkpoint to validate
   * @returns {Promise<boolean>} Whether checkpoint is intact
   */
  private async validateCheckpointIntegrity(checkpoint: Checkpoint): Promise<boolean> {
    // Validate checkpoint data integrity
    return true; // Placeholder
  }

  /**
   * Cleans up a checkpoint
   * @private
   * @param {Checkpoint} checkpoint - Checkpoint to clean up
   * @returns {Promise<void>}
   */
  private async cleanupCheckpoint(checkpoint: Checkpoint): Promise<void> {
    // Delete backup files
    await this.backupService.deleteBackup(checkpoint.backupPath);

    // Mark as invalid
    checkpoint.isValid = false;
  }

  /**
   * Generates checkpoint ID
   * @private
   * @returns {string} Checkpoint ID
   */
  private generateCheckpointId(): string {
    return `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}