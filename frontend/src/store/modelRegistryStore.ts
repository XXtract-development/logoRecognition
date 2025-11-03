// Zustand store for model registry (US-015)
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  ModelVersion,
  SmokeTestRun,
  ModelActivation,
  ModelFilters,
  SmokeTestConfiguration,
} from '../types/models';

interface ModelRegistryStore {
  // State
  models: ModelVersion[];
  activeModelId: string | null;
  selectedModelId: string | null;
  smokeTestRuns: Record<string, SmokeTestRun>;
  smokeTestConfigurations: SmokeTestConfiguration[];
  activationHistory: ModelActivation[];
  isActivating: boolean;
  isLoadingModels: boolean;

  // Filters
  filters: ModelFilters;

  // Actions
  fetchModels: () => Promise<void>;
  selectModel: (modelId: string | null) => void;
  runSmokeTest: (modelId: string, configId?: string) => Promise<SmokeTestRun>;
  activateModel: (modelId: string, releaseNotes: string) => Promise<void>;
  rollbackModel: (reason: string) => Promise<void>;
  setFilter: (filter: Partial<ModelFilters>) => void;
  clearFilters: () => void;
  linkTrainingJob: (jobId: string) => Promise<ModelVersion>;
  deprecateModel: (modelId: string, reason: string) => Promise<void>;
  fetchSmokeTestConfigurations: () => Promise<void>;
  fetchActivationHistory: () => Promise<void>;
  getFilteredModels: () => ModelVersion[];
  getModelById: (modelId: string) => ModelVersion | undefined;
  getActiveModel: () => ModelVersion | undefined;
  downloadModelArtifacts: (modelId: string) => Promise<void>;
  exportModelHistory: (format: 'csv' | 'json') => void;
}

const useModelRegistryStore = create<ModelRegistryStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        models: [],
        activeModelId: null,
        selectedModelId: null,
        smokeTestRuns: {},
        smokeTestConfigurations: [],
        activationHistory: [],
        isActivating: false,
        isLoadingModels: false,

        // Initial filters
        filters: {
          status: 'all',
          datasetVersion: null,
          minAccuracy: null,
        },

        // Fetch all models from API
        fetchModels: async () => {
          set({ isLoadingModels: true });
          try {
            const response = await fetch('/api/v1/models');
            if (!response.ok) {
              throw new Error('Failed to fetch models');
            }
            const data = await response.json();

            // Find the active model
            const activeModel = data.find((m: ModelVersion) => m.status === 'active');

            set({
              models: data,
              activeModelId: activeModel?.id || null,
              isLoadingModels: false,
            });
          } catch (error) {
            console.error('Error fetching models:', error);
            set({ isLoadingModels: false });
            throw error;
          }
        },

        // Select a model for detailed view
        selectModel: (modelId: string | null) => {
          set({ selectedModelId: modelId });
        },

        // Run smoke test on a model
        runSmokeTest: async (modelId: string, configId?: string) => {
          try {
            const response = await fetch(`/api/v1/models/${modelId}/smoke-test`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ configurationId: configId }),
            });

            if (!response.ok) {
              throw new Error('Failed to run smoke test');
            }

            const testRun: SmokeTestRun = await response.json();

            set((state) => ({
              smokeTestRuns: {
                ...state.smokeTestRuns,
                [modelId]: testRun,
              },
            }));

            return testRun;
          } catch (error) {
            console.error('Error running smoke test:', error);
            throw error;
          }
        },

        // Activate a model
        activateModel: async (modelId: string, releaseNotes: string) => {
          set({ isActivating: true });
          try {
            const response = await fetch(`/api/v1/models/${modelId}/activate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ releaseNotes }),
            });

            if (!response.ok) {
              throw new Error('Failed to activate model');
            }

            const activation: ModelActivation = await response.json();

            // Update model status in store
            set((state) => ({
              models: state.models.map((model) => {
                if (model.id === modelId) {
                  return { ...model, status: 'active' as const };
                } else if (model.id === state.activeModelId) {
                  return { ...model, status: 'deprecated' as const };
                }
                return model;
              }),
              activeModelId: modelId,
              activationHistory: [activation, ...state.activationHistory],
              isActivating: false,
            }));

            // Notify success
            console.log('Model activated successfully:', activation);
          } catch (error) {
            console.error('Error activating model:', error);
            set({ isActivating: false });
            throw error;
          }
        },

        // Rollback to previous model
        rollbackModel: async (reason: string) => {
          const { activationHistory, activeModelId } = get();
          const lastActivation = activationHistory[0];

          if (!lastActivation?.previousModelId) {
            throw new Error('No previous model to rollback to');
          }

          try {
            const response = await fetch(`/api/v1/models/${activeModelId}/rollback`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            });

            if (!response.ok) {
              throw new Error('Failed to rollback model');
            }

            // Re-fetch models to get updated states
            await get().fetchModels();
          } catch (error) {
            console.error('Error rolling back model:', error);
            throw error;
          }
        },

        // Set filter
        setFilter: (filter: Partial<ModelFilters>) => {
          set((state) => ({
            filters: {
              ...state.filters,
              ...filter,
            },
          }));
        },

        // Clear all filters
        clearFilters: () => {
          set({
            filters: {
              status: 'all',
              datasetVersion: null,
              minAccuracy: null,
            },
          });
        },

        // Link a training job to create a candidate model
        linkTrainingJob: async (jobId: string) => {
          try {
            const response = await fetch(`/api/v1/training/jobs/${jobId}/register`, {
              method: 'POST',
            });

            if (!response.ok) {
              throw new Error('Failed to register model from training job');
            }

            const model: ModelVersion = await response.json();

            set((state) => ({
              models: [...state.models, model],
            }));

            return model;
          } catch (error) {
            console.error('Error linking training job:', error);
            throw error;
          }
        },

        // Deprecate a model
        deprecateModel: async (modelId: string, reason: string) => {
          try {
            const response = await fetch(`/api/v1/models/${modelId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            });

            if (!response.ok) {
              throw new Error('Failed to deprecate model');
            }

            set((state) => ({
              models: state.models.map((model) =>
                model.id === modelId
                  ? { ...model, status: 'deprecated' as const, deprecatedReason: reason }
                  : model
              ),
            }));
          } catch (error) {
            console.error('Error deprecating model:', error);
            throw error;
          }
        },

        // Fetch smoke test configurations
        fetchSmokeTestConfigurations: async () => {
          try {
            const response = await fetch('/api/v1/models/smoke-tests/configurations');
            if (!response.ok) {
              throw new Error('Failed to fetch smoke test configurations');
            }
            const configs = await response.json();
            set({ smokeTestConfigurations: configs });
          } catch (error) {
            console.error('Error fetching smoke test configurations:', error);
            throw error;
          }
        },

        // Fetch activation history
        fetchActivationHistory: async () => {
          try {
            const response = await fetch('/api/v1/models/activations');
            if (!response.ok) {
              throw new Error('Failed to fetch activation history');
            }
            const history = await response.json();
            set({ activationHistory: history });
          } catch (error) {
            console.error('Error fetching activation history:', error);
            throw error;
          }
        },

        // Get filtered models
        getFilteredModels: () => {
          const { models, filters } = get();

          return models.filter((model) => {
            if (filters.status !== 'all' && model.status !== filters.status) {
              return false;
            }
            if (filters.datasetVersion && model.datasetVersionId !== filters.datasetVersion) {
              return false;
            }
            if (filters.minAccuracy && model.metrics.accuracy < filters.minAccuracy) {
              return false;
            }
            return true;
          });
        },

        // Get model by ID
        getModelById: (modelId: string) => {
          return get().models.find((model) => model.id === modelId);
        },

        // Get active model
        getActiveModel: () => {
          const { models, activeModelId } = get();
          return models.find((model) => model.id === activeModelId);
        },

        // Download model artifacts
        downloadModelArtifacts: async (modelId: string) => {
          try {
            const response = await fetch(`/api/v1/models/${modelId}/download`);
            if (!response.ok) {
              throw new Error('Failed to download model');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `model-${modelId}.pkl`;
            a.click();
            window.URL.revokeObjectURL(url);
          } catch (error) {
            console.error('Error downloading model:', error);
            throw error;
          }
        },

        // Export model history
        exportModelHistory: (format: 'csv' | 'json') => {
          const { models } = get();

          if (format === 'json') {
            const dataStr = JSON.stringify(models, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const exportFileDefaultName = 'model-history.json';
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
          } else if (format === 'csv') {
            // CSV export implementation
            const headers = ['ID', 'Name', 'Version', 'Status', 'Accuracy', 'Created'];
            const rows = models.map((m) => [
              m.id,
              m.name,
              m.version,
              m.status,
              m.metrics.accuracy.toFixed(3),
              m.createdAt,
            ]);

            const csvContent = [headers, ...rows]
              .map((row) => row.join(','))
              .join('\n');

            const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
            const exportFileDefaultName = 'model-history.csv';
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
          }
        },
      }),
      {
        name: 'model-registry-store',
        partialize: (state) => ({
          models: state.models,
          activeModelId: state.activeModelId,
          smokeTestRuns: state.smokeTestRuns,
          activationHistory: state.activationHistory,
          filters: state.filters,
        }),
      }
    )
  )
);

export default useModelRegistryStore;