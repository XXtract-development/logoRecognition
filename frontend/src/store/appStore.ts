/**
 * Zustand Store for Application State Management
 * Sprint 2: Core application state
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  result?: any;
  thumbnailUrl?: string;
}

export interface Detection {
  id: string;
  imageId: string;
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  algorithm: string;
  timestamp: number;
}

export interface AppState {
  // User state
  user: User | null;
  isAuthenticated: boolean;

  // Upload state
  uploadFiles: UploadFile[];
  isUploading: boolean;
  uploadProgress: number;

  // Detection state
  currentDetections: Detection[];
  selectedDetection: Detection | null;
  detectionAccuracy: number;

  // UI state
  isLoading: boolean;
  error: string | null;
  notification: {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
  } | null;

  // Canvas state
  canvasZoom: number;
  canvasMode: 'select' | 'draw' | 'pan';

  // Feature flags
  featureFlags: {
    smartDetection: boolean;
    batchUpload: boolean;
    advancedCanvas: boolean;
    trainingDatasetVersioning: boolean;
  };

  // Actions
  setUser: (user: User | null) => void;
  login: (user: User) => void;
  logout: () => void;

  // Upload actions
  addUploadFiles: (files: File[]) => void;
  updateFileStatus: (fileId: string, status: UploadFile['status'], progress?: number) => void;
  removeUploadFile: (fileId: string) => void;
  clearUploadFiles: () => void;

  // Detection actions
  setDetections: (detections: Detection[]) => void;
  addDetection: (detection: Detection) => void;
  selectDetection: (detection: Detection | null) => void;
  updateDetection: (id: string, updates: Partial<Detection>) => void;

  // UI actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  showNotification: (type: AppState['notification']['type'], message: string) => void;
  clearNotification: () => void;

  // Canvas actions
  setCanvasZoom: (zoom: number) => void;
  setCanvasMode: (mode: AppState['canvasMode']) => void;

  // Feature flag actions
  setFeatureFlag: (flag: keyof AppState['featureFlags'], value: boolean) => void;
}

const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state
        user: null,
        isAuthenticated: false,
        uploadFiles: [],
        isUploading: false,
        uploadProgress: 0,
        currentDetections: [],
        selectedDetection: null,
        detectionAccuracy: 80, // Sprint 2 target
        isLoading: false,
        error: null,
        notification: null,
        canvasZoom: 1,
        canvasMode: 'select',
        featureFlags: {
          smartDetection: true,
          batchUpload: true,
          advancedCanvas: false, // Deferred to Sprint 3
          trainingDatasetVersioning: true,
        },

        // User actions
        setUser: (user) => set({ user, isAuthenticated: !!user }),
        login: (user) => set({ user, isAuthenticated: true }),
        logout: () => set({ user: null, isAuthenticated: false }),

        // Upload actions
        addUploadFiles: (files) =>
          set((state) => ({
            uploadFiles: [
              ...state.uploadFiles,
              ...files.map((file) => ({
                id: `${Date.now()}-${Math.random()}`,
                file,
                status: 'pending' as const,
                progress: 0,
              })),
            ],
          })),

        updateFileStatus: (fileId, status, progress) =>
          set((state) => ({
            uploadFiles: state.uploadFiles.map((f) =>
              f.id === fileId ? { ...f, status, progress: progress ?? f.progress } : f
            ),
          })),

        removeUploadFile: (fileId) =>
          set((state) => ({
            uploadFiles: state.uploadFiles.filter((f) => f.id !== fileId),
          })),

        clearUploadFiles: () => set({ uploadFiles: [] }),

        // Detection actions
        setDetections: (detections) => set({ currentDetections: detections }),

        addDetection: (detection) =>
          set((state) => ({
            currentDetections: [...state.currentDetections, detection],
          })),

        selectDetection: (detection) => set({ selectedDetection: detection }),

        updateDetection: (id, updates) =>
          set((state) => ({
            currentDetections: state.currentDetections.map((d) =>
              d.id === id ? { ...d, ...updates } : d
            ),
          })),

        // UI actions
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),

        showNotification: (type, message) =>
          set({ notification: { type, message } }),

        clearNotification: () => set({ notification: null }),

        // Canvas actions
        setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),
        setCanvasMode: (mode) => set({ canvasMode: mode }),

        // Feature flag actions
        setFeatureFlag: (flag, value) =>
          set((state) => ({
            featureFlags: { ...state.featureFlags, [flag]: value },
          })),
      }),
      {
        name: 'app-store',
        partialize: (state) => ({
          user: state.user,
          featureFlags: state.featureFlags,
        }),
      }
    )
  )
);

export default useAppStore;
