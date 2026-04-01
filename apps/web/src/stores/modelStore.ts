/**
 * Model Store
 * State management for training jobs and model versions
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  TrainingJob,
  TrainingProgress,
  ModelVersion,
} from '@/types/training.types';

interface ModelState {
  // Training Jobs
  trainingJobs: TrainingJob[];
  currentJob: TrainingJob | null;
  isCreatingJob: boolean;

  // Models
  models: ModelVersion[];
  activeModel: ModelVersion | null;
  selectedModelId: string | null;

  // UI State
  isLoadingJobs: boolean;
  isLoadingModels: boolean;
  error: string | null;

  // Actions - Training Jobs
  setTrainingJobs: (jobs: TrainingJob[]) => void;
  addTrainingJob: (job: TrainingJob) => void;
  updateTrainingJob: (id: string, updates: Partial<TrainingJob>) => void;
  updateJobProgress: (jobId: string, progress: TrainingProgress) => void;
  setCurrentJob: (job: TrainingJob | null) => void;
  setCreatingJob: (creating: boolean) => void;
  cancelJob: (id: string) => void;

  // Actions - Models
  setModels: (models: ModelVersion[]) => void;
  addModel: (model: ModelVersion) => void;
  updateModel: (id: string, updates: Partial<ModelVersion>) => void;
  removeModel: (id: string) => void;
  setActiveModel: (model: ModelVersion | null) => void;
  selectModel: (id: string | null) => void;
  activateModel: (id: string) => void;
  deactivateModel: (id: string) => void;

  // Actions - UI State
  setLoadingJobs: (loading: boolean) => void;
  setLoadingModels: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  trainingJobs: [],
  currentJob: null,
  isCreatingJob: false,
  models: [],
  activeModel: null,
  selectedModelId: null,
  isLoadingJobs: false,
  isLoadingModels: false,
  error: null,
};

export const useModelStore = create<ModelState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        // Training Job Actions
        setTrainingJobs: (jobs) =>
          set((state) => {
            state.trainingJobs = jobs;
          }),

        addTrainingJob: (job) =>
          set((state) => {
            state.trainingJobs.unshift(job);
          }),

        updateTrainingJob: (id, updates) =>
          set((state) => {
            const index = state.trainingJobs.findIndex((job) => job.id === id);
            if (index !== -1) {
              Object.assign(state.trainingJobs[index], updates);
            }
            if (state.currentJob?.id === id) {
              Object.assign(state.currentJob, updates);
            }
          }),

        updateJobProgress: (jobId, progress) =>
          set((state) => {
            const job = state.trainingJobs.find((j) => j.id === jobId);
            if (job) {
              job.progress = progress;
            }
            if (state.currentJob?.id === jobId) {
              state.currentJob.progress = progress;
            }
          }),

        setCurrentJob: (job) =>
          set((state) => {
            state.currentJob = job;
          }),

        setCreatingJob: (creating) =>
          set((state) => {
            state.isCreatingJob = creating;
          }),

        cancelJob: (id) =>
          set((state) => {
            const job = state.trainingJobs.find((j) => j.id === id);
            if (job) {
              job.status = 'cancelled';
            }
            if (state.currentJob?.id === id) {
              state.currentJob.status = 'cancelled';
            }
          }),

        // Model Actions
        setModels: (models) =>
          set((state) => {
            state.models = models;
            state.activeModel = models.find((m) => m.status === 'active') || null;
          }),

        addModel: (model) =>
          set((state) => {
            state.models.unshift(model);
          }),

        updateModel: (id, updates) =>
          set((state) => {
            const index = state.models.findIndex((m) => m.id === id);
            if (index !== -1) {
              Object.assign(state.models[index], updates);
            }
            if (state.activeModel?.id === id) {
              Object.assign(state.activeModel, updates);
            }
          }),

        removeModel: (id) =>
          set((state) => {
            state.models = state.models.filter((m) => m.id !== id);
            if (state.selectedModelId === id) {
              state.selectedModelId = null;
            }
            if (state.activeModel?.id === id) {
              state.activeModel = null;
            }
          }),

        setActiveModel: (model) =>
          set((state) => {
            state.activeModel = model;
          }),

        selectModel: (id) =>
          set((state) => {
            state.selectedModelId = id;
          }),

        activateModel: (id) =>
          set((state) => {
            // Deactivate current active model
            state.models.forEach((m) => {
              if (m.status === 'active') {
                m.status = 'inactive';
                m.deactivatedAt = new Date();
              }
            });
            // Activate new model
            const model = state.models.find((m) => m.id === id);
            if (model) {
              model.status = 'active';
              model.activatedAt = new Date();
              state.activeModel = model;
            }
          }),

        deactivateModel: (id) =>
          set((state) => {
            const model = state.models.find((m) => m.id === id);
            if (model) {
              model.status = 'inactive';
              model.deactivatedAt = new Date();
            }
            if (state.activeModel?.id === id) {
              state.activeModel = null;
            }
          }),

        // UI State Actions
        setLoadingJobs: (loading) =>
          set((state) => {
            state.isLoadingJobs = loading;
          }),

        setLoadingModels: (loading) =>
          set((state) => {
            state.isLoadingModels = loading;
          }),

        setError: (error) =>
          set((state) => {
            state.error = error;
          }),

        reset: () => set(initialState),
      })),
      {
        name: 'model-store',
        partialize: () => ({}), // Don't persist model state
      }
    ),
    { name: 'ModelStore' }
  )
);
