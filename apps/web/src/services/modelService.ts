/**
 * Model Service
 * API calls for training jobs and model management
 */
import axios from 'axios';
import type {
  TrainingJob,
  TrainingConfig,
  ModelVersion,
  ModelComparison,
} from '@/types/training.types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Demo data (exported for development use, not used as API fallbacks)
export const generateDemoJobs = (): TrainingJob[] => [
  {
    id: 'job-1',
    name: 'Logo Detection v2.1',
    status: 'completed',
    config: {
      name: 'Logo Detection v2.1',
      categoryIds: ['cat-1', 'cat-2'],
      epochs: 100,
      batchSize: 16,
      learningRate: 0.001,
      augmentationFactor: 50,
      validationSplit: 0.2,
      minAnnotationsPerCategory: 10,
    },
    progress: {
      epoch: 100,
      totalEpochs: 100,
      loss: 0.0234,
      accuracy: 0.967,
      validationLoss: 0.0312,
      validationAccuracy: 0.954,
      samplesProcessed: 5000,
      totalSamples: 5000,
      etaSeconds: 0,
      currentLearningRate: 0.0001,
    },
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    modelVersionId: 'model-1',
  },
  {
    id: 'job-2',
    name: 'Logo Detection v2.0',
    status: 'completed',
    config: {
      name: 'Logo Detection v2.0',
      categoryIds: ['cat-1'],
      epochs: 80,
      batchSize: 16,
      learningRate: 0.001,
      augmentationFactor: 40,
      validationSplit: 0.2,
      minAnnotationsPerCategory: 10,
    },
    progress: {
      epoch: 80,
      totalEpochs: 80,
      loss: 0.0456,
      accuracy: 0.923,
      validationLoss: 0.0512,
      validationAccuracy: 0.912,
      samplesProcessed: 3000,
      totalSamples: 3000,
      etaSeconds: 0,
      currentLearningRate: 0.0001,
    },
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    modelVersionId: 'model-2',
  },
];

export const generateDemoModels = (): ModelVersion[] => [
  {
    id: 'model-1',
    version: 2,
    name: 'Logo Detection v2.1',
    status: 'active',
    accuracy: 0.967,
    size: 52428800, // 50MB
    trainingJobId: 'job-1',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    activatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    metrics: {
      accuracy: 0.967,
      precision: { 'Technology': 0.98, 'Automotive': 0.95 },
      recall: { 'Technology': 0.96, 'Automotive': 0.94 },
      f1Score: { 'Technology': 0.97, 'Automotive': 0.945 },
      confusionMatrix: [[95, 5], [6, 94]],
      categoryLabels: ['Technology', 'Automotive'],
      trainingLossCurve: Array.from({ length: 100 }, (_, i) => 0.5 - 0.4 * (i / 100) + Math.random() * 0.05),
      validationLossCurve: Array.from({ length: 100 }, (_, i) => 0.55 - 0.4 * (i / 100) + Math.random() * 0.08),
    },
  },
  {
    id: 'model-2',
    version: 1,
    name: 'Logo Detection v2.0',
    status: 'inactive',
    accuracy: 0.923,
    size: 48234496, // ~46MB
    trainingJobId: 'job-2',
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    deactivatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    metrics: {
      accuracy: 0.923,
      precision: { 'Technology': 0.94 },
      recall: { 'Technology': 0.91 },
      f1Score: { 'Technology': 0.925 },
      confusionMatrix: [[91, 9]],
      categoryLabels: ['Technology'],
      trainingLossCurve: Array.from({ length: 80 }, (_, i) => 0.6 - 0.45 * (i / 80) + Math.random() * 0.06),
      validationLossCurve: Array.from({ length: 80 }, (_, i) => 0.65 - 0.45 * (i / 80) + Math.random() * 0.1),
    },
  },
];

// ============ Training Jobs API ============

export async function fetchTrainingJobs(): Promise<TrainingJob[]> {
  try {
    const response = await api.get('/training/jobs');
    // API returns { data: [...] }
    return response.data.data || response.data;
  } catch (error) {
    throw error;
  }
}

export async function fetchTrainingJob(id: string): Promise<TrainingJob | null> {
  try {
    const response = await api.get(`/training/jobs/${id}`);
    // API returns { data: {...} }
    return response.data.data || response.data;
  } catch (error) {
    throw error;
  }
}

export async function createTrainingJob(config: TrainingConfig): Promise<TrainingJob> {
  try {
    const response = await api.post('/training/start', config);
    return response.data;
  } catch (error) {
    throw error;
  }
}

export async function cancelTrainingJob(id: string): Promise<void> {
  try {
    await api.post(`/training/jobs/${id}/cancel`);
  } catch (error) {
    throw error;
  }
}

export async function pauseTrainingJob(id: string): Promise<void> {
  try {
    await api.post(`/training/jobs/${id}/pause`);
  } catch (error) {
    throw error;
  }
}

export async function resumeTrainingJob(id: string): Promise<void> {
  try {
    await api.post(`/training/jobs/${id}/resume`);
  } catch (error) {
    throw error;
  }
}

// ============ Models API ============

export async function fetchModels(): Promise<ModelVersion[]> {
  try {
    const response = await api.get('/models');
    // API returns { data: [...] }
    return response.data.data || response.data;
  } catch (error) {
    throw error;
  }
}

export async function fetchModel(id: string): Promise<ModelVersion | null> {
  try {
    const response = await api.get(`/models/${id}`);
    // API returns { data: {...} }
    return response.data.data || response.data;
  } catch (error) {
    throw error;
  }
}

export async function activateModel(id: string): Promise<void> {
  try {
    await api.post(`/models/${id}/activate`);
  } catch (error) {
    throw error;
  }
}

export async function deactivateModel(id: string): Promise<void> {
  try {
    await api.post(`/models/${id}/deactivate`);
  } catch (error) {
    throw error;
  }
}

export async function deleteModel(id: string): Promise<void> {
  try {
    await api.delete(`/models/${id}`);
  } catch (error) {
    throw error;
  }
}

export async function downloadModel(id: string): Promise<Blob> {
  try {
    const response = await api.get(`/models/${id}/download`, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    throw new Error('Download failed');
  }
}

export async function compareModels(
  model1Id: string,
  model2Id: string
): Promise<ModelComparison> {
  try {
    const response = await api.post('/models/compare', { model1Id, model2Id });
    return response.data;
  } catch (error) {
    throw error;
  }
}

// ============ Training Stats API ============

export interface TrainingDataSummary {
  totalImages: number;
  annotatedImages: number;
  totalAnnotations: number;
  categoryCounts: Record<string, number>;
  estimatedDuration: number; // in seconds
}

export async function getTrainingDataSummary(
  categoryIds: string[]
): Promise<TrainingDataSummary> {
  try {
    const response = await api.post('/training/summary', { categoryIds });
    return response.data;
  } catch (error) {
    throw error;
  }
}
