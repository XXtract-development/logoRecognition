/**
 * Migration State Manager
 * @module MigrationStateManager
 * @description Manages migration state persistence and recovery
 */

import { MigrationPlan, MigrationStatus, MigrationResult, MigrationError } from '../types/MigrationTypes';

/**
 * Migration state information
 * @interface MigrationState
 * @property {string} planId - Migration plan identifier
 * @property {MigrationStatus} status - Current migration status
 * @property {string | null} currentComponent - Component currently being migrated
 * @property {number} overallProgress - Overall progress percentage (0-100)
 * @property {number} completedComponents - Number of completed components
 * @property {number} totalComponents - Total number of components
 * @property {Date} startedAt - Migration start timestamp
 * @property {Date | null} completedAt - Migration completion timestamp
 * @property {Date} lastUpdated - Last state update timestamp
 * @property {boolean} isPaused - Whether migration is paused
 * @property {MigrationError[]} errors - Errors encountered during migration
 * @property {string | null} message - Current status message
 */
export interface MigrationState {
  planId: string;
  status: MigrationStatus;
  currentComponent: string | null;
  overallProgress: number;
  completedComponents: number;
  totalComponents: number;
  startedAt: Date;
  completedAt: Date | null;
  lastUpdated: Date;
  isPaused: boolean;
  errors: MigrationError[];
  message: string | null;
}

/**
 * Storage adapter interface for state persistence
 * @interface StorageAdapter
 */
export interface StorageAdapter {
  /**
   * Saves state to storage
   * @param {string} key - Storage key
   * @param {MigrationState} state - State to save
   * @returns {Promise<void>}
   */
  save(key: string, state: MigrationState): Promise<void>;

  /**
   * Loads state from storage
   * @param {string} key - Storage key
   * @returns {Promise<MigrationState | null>} Loaded state or null
   */
  load(key: string): Promise<MigrationState | null>;

  /**
   * Deletes state from storage
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  delete(key: string): Promise<void>;

  /**
   * Lists all stored states
   * @returns {Promise<string[]>} List of storage keys
   */
  list(): Promise<string[]>;
}

/**
 * Local storage adapter implementation
 * @class LocalStorageAdapter
 * @implements {StorageAdapter}
 * @description Persists migration state to browser localStorage
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly prefix = 'migration_state_';

  /**
   * Saves state to localStorage
   * @param {string} key - Storage key
   * @param {MigrationState} state - State to save
   * @returns {Promise<void>}
   */
  async save(key: string, state: MigrationState): Promise<void> {
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(`${this.prefix}${key}`, serialized);
    } catch (error) {
      console.error('Failed to save migration state:', error);
      throw new Error(`Failed to save migration state: ${(error as Error).message}`);
    }
  }

  /**
   * Loads state from localStorage
   * @param {string} key - Storage key
   * @returns {Promise<MigrationState | null>} Loaded state or null
   */
  async load(key: string): Promise<MigrationState | null> {
    try {
      const serialized = localStorage.getItem(`${this.prefix}${key}`);
      if (!serialized) return null;

      const state = JSON.parse(serialized);
      // Convert date strings back to Date objects
      state.startedAt = new Date(state.startedAt);
      state.completedAt = state.completedAt ? new Date(state.completedAt) : null;
      state.lastUpdated = new Date(state.lastUpdated);

      if (state.errors) {
        state.errors = state.errors.map((error: any) => ({
          ...error,
          timestamp: new Date(error.timestamp)
        }));
      }

      return state;
    } catch (error) {
      console.error('Failed to load migration state:', error);
      return null;
    }
  }

  /**
   * Deletes state from localStorage
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async delete(key: string): Promise<void> {
    localStorage.removeItem(`${this.prefix}${key}`);
  }

  /**
   * Lists all stored states
   * @returns {Promise<string[]>} List of storage keys
   */
  async list(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keys.push(key.replace(this.prefix, ''));
      }
    }
    return keys;
  }
}

/**
 * Manages migration state with persistence and recovery
 * @class MigrationStateManager
 * @description Handles state management for migration operations with
 * support for pause/resume, error tracking, and state recovery
 */
export class MigrationStateManager {
  private states: Map<string, MigrationState>;
  private storageAdapter: StorageAdapter | null;

  /**
   * Creates a new MigrationStateManager instance
   * @param {boolean} persistState - Whether to persist state to storage
   * @param {StorageAdapter} [adapter] - Optional custom storage adapter
   * @example
   * const stateManager = new MigrationStateManager(true);
   * await stateManager.createState(migrationPlan);
   */
  constructor(persistState: boolean, adapter?: StorageAdapter) {
    this.states = new Map();
    this.storageAdapter = persistState ? (adapter || new LocalStorageAdapter()) : null;

    // Load existing states from storage
    if (this.storageAdapter) {
      this.loadPersistedStates();
    }
  }

  /**
   * Creates initial state for a migration plan
   * @param {MigrationPlan} plan - Migration plan
   * @returns {Promise<MigrationState>} Created state
   * @example
   * const state = await stateManager.createState(migrationPlan);
   * console.log(`Migration ${state.planId} initialized`);
   */
  public async createState(plan: MigrationPlan): Promise<MigrationState> {
    const state: MigrationState = {
      planId: plan.id,
      status: MigrationStatus.PENDING,
      currentComponent: null,
      overallProgress: 0,
      completedComponents: 0,
      totalComponents: plan.components.length,
      startedAt: new Date(),
      completedAt: null,
      lastUpdated: new Date(),
      isPaused: false,
      errors: [],
      message: 'Migration initialized'
    };

    this.states.set(plan.id, state);
    await this.persistState(plan.id, state);

    return state;
  }

  /**
   * Gets current state for a migration plan
   * @param {string} planId - Migration plan ID
   * @returns {Promise<MigrationState | null>} Current state or null
   * @example
   * const state = await stateManager.getState('plan-123');
   * if (state) console.log(`Progress: ${state.overallProgress}%`);
   */
  public async getState(planId: string): Promise<MigrationState | null> {
    let state = this.states.get(planId);

    // Try to load from storage if not in memory
    if (!state && this.storageAdapter) {
      state = await this.storageAdapter.load(planId);
      if (state) {
        this.states.set(planId, state);
      }
    }

    return state || null;
  }

  /**
   * Updates component migration status
   * @param {string} componentId - Component ID
   * @param {MigrationStatus} status - New status
   * @returns {Promise<void>}
   * @example
   * await stateManager.updateComponentStatus('UserProfile', MigrationStatus.COMPLETED);
   */
  public async updateComponentStatus(componentId: string, status: MigrationStatus): Promise<void> {
    // Find the plan containing this component
    for (const [planId, state] of this.states) {
      if (state.currentComponent === componentId) {
        state.status = status;
        state.lastUpdated = new Date();

        if (status === MigrationStatus.COMPLETED) {
          state.completedComponents++;
          state.overallProgress = Math.round(
            (state.completedComponents / state.totalComponents) * 100
          );
        }

        await this.persistState(planId, state);
        break;
      }
    }
  }

  /**
   * Updates migration progress
   * @param {string} planId - Migration plan ID
   * @param {string} componentId - Current component ID
   * @param {number} progress - Progress percentage
   * @param {string} [message] - Optional status message
   * @returns {Promise<void>}
   * @example
   * await stateManager.updateProgress('plan-123', 'UserProfile', 50, 'Converting to TypeScript');
   */
  public async updateProgress(
    planId: string,
    componentId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    const state = await this.getState(planId);
    if (!state) return;

    state.currentComponent = componentId;
    state.overallProgress = progress;
    state.lastUpdated = new Date();

    if (message) {
      state.message = message;
    }

    await this.persistState(planId, state);
  }

  /**
   * Pauses a migration
   * @param {string} planId - Migration plan ID
   * @returns {Promise<void>}
   * @example
   * await stateManager.pauseMigration('plan-123');
   */
  public async pauseMigration(planId: string): Promise<void> {
    const state = await this.getState(planId);
    if (!state) return;

    state.isPaused = true;
    state.status = MigrationStatus.PENDING;
    state.message = 'Migration paused';
    state.lastUpdated = new Date();

    await this.persistState(planId, state);
  }

  /**
   * Resumes a paused migration
   * @param {string} planId - Migration plan ID
   * @returns {Promise<void>}
   * @example
   * await stateManager.resumeMigration('plan-123');
   */
  public async resumeMigration(planId: string): Promise<void> {
    const state = await this.getState(planId);
    if (!state) return;

    state.isPaused = false;
    state.status = MigrationStatus.IN_PROGRESS;
    state.message = 'Migration resumed';
    state.lastUpdated = new Date();

    await this.persistState(planId, state);
  }

  /**
   * Records an error during migration
   * @param {string} planId - Migration plan ID
   * @param {MigrationError} error - Error details
   * @returns {Promise<void>}
   * @example
   * await stateManager.recordError('plan-123', migrationError);
   */
  public async recordError(planId: string, error: MigrationError): Promise<void> {
    const state = await this.getState(planId);
    if (!state) return;

    state.errors.push(error);

    // Update status based on error severity
    if (error.severity === 'critical') {
      state.status = MigrationStatus.FAILED;
      state.message = `Critical error: ${error.message}`;
    }

    state.lastUpdated = new Date();
    await this.persistState(planId, state);
  }

  /**
   * Completes a migration
   * @param {string} planId - Migration plan ID
   * @param {MigrationResult[]} results - Migration results
   * @returns {Promise<void>}
   * @example
   * await stateManager.completeState('plan-123', results);
   */
  public async completeState(planId: string, results: MigrationResult[]): Promise<void> {
    const state = await this.getState(planId);
    if (!state) return;

    const allSuccessful = results.every(r => r.success);

    state.status = allSuccessful ? MigrationStatus.COMPLETED : MigrationStatus.FAILED;
    state.completedAt = new Date();
    state.overallProgress = 100;
    state.completedComponents = state.totalComponents;
    state.message = allSuccessful
      ? 'Migration completed successfully'
      : `Migration completed with ${results.filter(r => !r.success).length} failures`;
    state.lastUpdated = new Date();

    await this.persistState(planId, state);
  }

  /**
   * Clears state for a migration plan
   * @param {string} planId - Migration plan ID
   * @returns {Promise<void>}
   * @example
   * await stateManager.clearState('plan-123');
   */
  public async clearState(planId: string): Promise<void> {
    this.states.delete(planId);

    if (this.storageAdapter) {
      await this.storageAdapter.delete(planId);
    }
  }

  /**
   * Gets all active migration states
   * @returns {Promise<MigrationState[]>} Array of active states
   * @example
   * const activeStates = await stateManager.getAllActiveStates();
   * console.log(`${activeStates.length} migrations in progress`);
   */
  public async getAllActiveStates(): Promise<MigrationState[]> {
    const activeStates: MigrationState[] = [];

    for (const state of this.states.values()) {
      if (
        state.status === MigrationStatus.IN_PROGRESS ||
        state.status === MigrationStatus.ANALYZING ||
        state.status === MigrationStatus.VALIDATING
      ) {
        activeStates.push(state);
      }
    }

    return activeStates;
  }

  /**
   * Recovers interrupted migrations
   * @returns {Promise<MigrationState[]>} Recovered states
   * @example
   * const recovered = await stateManager.recoverInterruptedMigrations();
   * console.log(`Recovered ${recovered.length} interrupted migrations`);
   */
  public async recoverInterruptedMigrations(): Promise<MigrationState[]> {
    if (!this.storageAdapter) return [];

    const recovered: MigrationState[] = [];
    const keys = await this.storageAdapter.list();

    for (const key of keys) {
      const state = await this.storageAdapter.load(key);
      if (state && !state.completedAt && !state.isPaused) {
        // Mark as interrupted and needs recovery
        state.message = 'Migration interrupted - recovery needed';
        state.isPaused = true;
        recovered.push(state);
        this.states.set(key, state);
      }
    }

    return recovered;
  }

  /**
   * Persists state to storage
   * @private
   * @param {string} planId - Migration plan ID
   * @param {MigrationState} state - State to persist
   * @returns {Promise<void>}
   */
  private async persistState(planId: string, state: MigrationState): Promise<void> {
    if (this.storageAdapter) {
      await this.storageAdapter.save(planId, state);
    }
  }

  /**
   * Loads persisted states from storage
   * @private
   * @returns {Promise<void>}
   */
  private async loadPersistedStates(): Promise<void> {
    if (!this.storageAdapter) return;

    try {
      const keys = await this.storageAdapter.list();

      for (const key of keys) {
        const state = await this.storageAdapter.load(key);
        if (state) {
          this.states.set(key, state);
        }
      }
    } catch (error) {
      console.error('Failed to load persisted states:', error);
    }
  }
}