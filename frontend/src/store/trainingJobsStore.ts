// Zustand store for training jobs (US-014)
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  TrainingJobStatus,
  TrainingJobRequest,
  TrainingJobResponse,
  TrainingSummary,
} from '../types/training';

interface TrainingJobsStore {
  // State
  jobs: TrainingJobStatus[];
  selectedJobId: string | null;
  activeWebSocket: WebSocket | null;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  reconnectAttempts: number;
  summaries: Record<string, TrainingSummary>;

  // Actions
  startJob: (request: TrainingJobRequest) => Promise<string>;
  selectJob: (jobId: string) => void;
  connectWebSocket: (jobId: string) => void;
  disconnectWebSocket: () => void;
  updateJobStatus: (status: TrainingJobStatus) => void;
  loadJobsFromCache: () => void;
  saveJobsToCache: () => void;
  addJobSummary: (jobId: string, summary: TrainingSummary) => void;
  fetchJobs: () => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  deleteJob: (jobId: string) => Promise<void>;
  updateConnectionStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
}

const useTrainingJobsStore = create<TrainingJobsStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        jobs: [],
        selectedJobId: null,
        activeWebSocket: null,
        connectionStatus: 'disconnected',
        reconnectAttempts: 0,
        summaries: {},

        // Start a new training job
        startJob: async (request: TrainingJobRequest) => {
          try {
            // Validate request before sending
            if (!request.datasetVersionId || !request.modelName) {
              throw new Error('Missing required fields: datasetVersionId or modelName');
            }

            const response = await fetch('/api/v1/training/jobs', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
              },
              body: JSON.stringify(request),
            });

            if (!response.ok) {
              const errorData = await response.text();
              throw new Error(`Failed to start training job: ${errorData || response.statusText}`);
            }

            const data: TrainingJobResponse = await response.json();

            // Add initial job status
            const initialStatus: TrainingJobStatus = {
              jobId: data.jobId,
              datasetVersionId: request.datasetVersionId,
              status: 'queued',
              progress: 0,
              phaseProgress: {
                queue: 0,
                augmentation: 0,
                training: 0,
                validation: 0,
              },
              logs: [],
              startedAt: data.createdAt,
            };

            set((state) => ({
              jobs: [...state.jobs, initialStatus],
              selectedJobId: data.jobId,
            }));

            return data.jobId;
          } catch (error) {
            console.error('Error starting training job:', error);
            throw error;
          }
        },

        // Select a job for viewing
        selectJob: (jobId: string) => {
          set({ selectedJobId: jobId });
        },

        // Connect WebSocket using the service
        connectWebSocket: (jobId: string) => {
          // Import at top of file to avoid runtime require
          // @ts-ignore - Dynamic import already handled
          const trainingWebSocketService = require('../services/training/TrainingWebSocketService').default;

          trainingWebSocketService.connect(
            jobId,
            (status) => {
              get().updateJobStatus(status);
            },
            (connectionStatus) => {
              get().updateConnectionStatus(connectionStatus);
              if (connectionStatus === 'connected') {
                get().resetReconnectAttempts();
              } else if (connectionStatus === 'reconnecting') {
                get().incrementReconnectAttempts();
              }
            }
          );

          set({ activeWebSocket: trainingWebSocketService as any });
        },

        // Disconnect WebSocket
        disconnectWebSocket: () => {
          const { activeWebSocket } = get();
          if (activeWebSocket) {
            // Properly disconnect using the service method
            if (typeof (activeWebSocket as any).disconnect === 'function') {
              (activeWebSocket as any).disconnect();
            } else {
              activeWebSocket.close();
            }
            set({ activeWebSocket: null, connectionStatus: 'disconnected', reconnectAttempts: 0 });
          }
        },

        // Update job status from WebSocket
        updateJobStatus: (status: TrainingJobStatus) => {
          set((state) => ({
            jobs: state.jobs.map((job) =>
              job.jobId === status.jobId ? status : job
            ),
          }));

          // Cache to sessionStorage
          const key = `training_job_${status.jobId}`;
          sessionStorage.setItem(key, JSON.stringify(status));
        },

        // Load jobs from cache
        loadJobsFromCache: () => {
          const cachedJobs: TrainingJobStatus[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key?.startsWith('training_job_')) {
              try {
                const job = JSON.parse(sessionStorage.getItem(key) || '{}');
                cachedJobs.push(job);
              } catch (error) {
                console.error(`Error parsing cached job ${key}:`, error);
              }
            }
          }
          if (cachedJobs.length > 0) {
            set({ jobs: cachedJobs });
          }
        },

        // Save jobs to cache
        saveJobsToCache: () => {
          const { jobs } = get();
          jobs.forEach((job) => {
            const key = `training_job_${job.jobId}`;
            sessionStorage.setItem(key, JSON.stringify(job));
          });
        },

        // Add job summary
        addJobSummary: (jobId: string, summary: TrainingSummary) => {
          set((state) => ({
            summaries: {
              ...state.summaries,
              [jobId]: summary,
            },
          }));
        },

        // Fetch all jobs from API
        fetchJobs: async () => {
          try {
            const response = await fetch('/api/v1/training/jobs');
            if (!response.ok) {
              throw new Error('Failed to fetch jobs');
            }
            const data = await response.json();

            // API returns {total, limit, offset, jobs: []}
            // Extract jobs array from response
            const jobsRaw = Array.isArray(data) ? data : (data.jobs || []);

            // Transform snake_case API response to camelCase for frontend
            // List endpoint returns minimal data, so provide safe defaults
            const jobs: TrainingJobStatus[] = jobsRaw.map((job: any) => ({
              jobId: job.job_id || job.jobId || 'unknown',
              datasetVersionId: job.dataset_version_id || job.datasetVersionId || 'unknown',
              status: job.status || 'queued',
              progress: job.progress || 0,
              phaseProgress: job.phase_progress || {
                queue: 0,
                augmentation: 0,
                training: 0,
                validation: 0,
              },
              logs: job.logs || [],
              startedAt: job.started_at || job.startedAt || null,
              completedAt: job.completed_at || job.completedAt || null,
              currentEpoch: job.current_epoch || job.currentEpoch || 0,
              totalEpochs: job.total_epochs || job.totalEpochs || 0,
              eta: job.eta || null,
              error: job.error_message || job.error || null,
              modelVersion: job.model_version || job.modelVersion || null,
            }));

            set({ jobs });
          } catch (error) {
            console.error('Error fetching jobs:', error);
            // Set empty array on error to prevent crashes
            set({ jobs: [] });
            throw error;
          }
        },

        // Retry a failed job
        retryJob: async (jobId: string): Promise<void> => {
          try {
            const response = await fetch(`/api/v1/training/jobs/${jobId}/retry`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
              },
            });

            if (!response.ok) {
              throw new Error('Failed to retry job');
            }

            const newJob: TrainingJobResponse = await response.json();
            await get().fetchJobs(); // Refresh jobs list
            // Job retried successfully
          } catch (error) {
            console.error('Error retrying job:', error);
            throw error;
          }
        },

        // Cancel/Stop a running job
        cancelJob: async (jobId: string) => {
          try {
            const response = await fetch(`/api/v1/training/jobs/${jobId}/cancel`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ detail: 'Failed to cancel job' }));
              throw new Error(errorData.detail || 'Failed to cancel job');
            }

            // Update job status to cancelled
            set((state) => ({
              jobs: state.jobs.map((job) =>
                job.jobId === jobId ? { ...job, status: 'cancelled' as const } : job
              ),
            }));

            // Refresh jobs list
            await get().fetchJobs();
          } catch (error) {
            console.error('Error canceling job:', error);
            throw error;
          }
        },

        // Delete a job permanently
        deleteJob: async (jobId: string) => {
          try {
            const response = await fetch(`/api/v1/training/jobs/${jobId}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ detail: 'Failed to delete job' }));
              throw new Error(errorData.detail || 'Failed to delete job');
            }

            // Remove from local state immediately for better UX
            set((state) => ({
              jobs: state.jobs.filter((job) => job.jobId !== jobId),
              selectedJobId: state.selectedJobId === jobId ? null : state.selectedJobId,
              summaries: Object.fromEntries(
                Object.entries(state.summaries).filter(([id]) => id !== jobId)
              ),
            }));

            // Refresh jobs list to ensure consistency
            await get().fetchJobs();
          } catch (error) {
            console.error('Error deleting job:', error);
            throw error;
          }
        },

        // Update connection status
        updateConnectionStatus: (status) => {
          set({ connectionStatus: status });
        },

        // Increment reconnect attempts
        incrementReconnectAttempts: () => {
          set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));
        },

        // Reset reconnect attempts
        resetReconnectAttempts: () => {
          set({ reconnectAttempts: 0 });
        },
      }),
      {
        name: 'training-jobs-store',
        version: 2, // Bump version to force clearing old localStorage
        partialize: (state) => ({
          jobs: state.jobs,
          selectedJobId: state.selectedJobId,
          summaries: state.summaries,
        }),
        onRehydrateStorage: () => (state) => {
          // Ensure jobs is always an array after rehydration from localStorage
          if (state && !Array.isArray(state.jobs)) {
            state.jobs = [];
          }

          // Clear stale/disconnected jobs from localStorage
          if (state && state.jobs) {
            state.jobs = state.jobs.filter((job: TrainingJobStatus) => {
              // Remove jobs with invalid data
              if (!job.jobId || job.jobId === 'unknown') return false;
              if (!job.datasetVersionId || job.datasetVersionId === 'unknown') return false;
              // Remove very old jobs (over 24 hours)
              const jobDate = job.startedAt ? new Date(job.startedAt).getTime() : 0;
              const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
              if (jobDate && jobDate < dayAgo) return false;
              return true;
            });
          }
        },
      }
    )
  )
);

export default useTrainingJobsStore;