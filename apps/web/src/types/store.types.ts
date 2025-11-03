/**
 * Store Types
 * Type definitions for Zustand stores
 */

import { RecognitionResult, UploadProgress, FilterOptions, SortOptions } from './logo.types';
import { WebSocketStore } from './websocket.types';

export interface RecognitionStore {
  // State
  results: RecognitionResult[];
  selectedResult: RecognitionResult | null;
  isProcessing: boolean;
  error: Error | null;

  // Actions
  addResult: (result: RecognitionResult) => void;
  updateResult: (id: string, updates: Partial<RecognitionResult>) => void;
  removeResult: (id: string) => void;
  selectResult: (id: string | null) => void;
  clearResults: () => void;
  setProcessing: (processing: boolean) => void;
  setError: (error: Error | null) => void;
}

export interface UploadStore {
  // State
  uploads: Map<string, UploadProgress>;
  activeUploads: number;
  completedUploads: number;
  failedUploads: number;

  // Actions
  addUpload: (upload: UploadProgress) => void;
  updateUpload: (fileId: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (fileId: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  cancelUpload: (fileId: string) => void;
}

export interface UIStore {
  // State
  theme: 'light' | 'dark' | 'system';
  language: string;
  sidebarOpen: boolean;
  modalStack: string[];
  notifications: Notification[];

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: string) => void;
  toggleSidebar: () => void;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  description?: string;
  duration?: number;
  timestamp: string;
}

export interface FilterStore {
  // State
  filters: FilterOptions;
  sort: SortOptions;
  searchQuery: string;

  // Actions
  setFilters: (filters: Partial<FilterOptions>) => void;
  setSort: (sort: SortOptions) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
  resetAll: () => void;
}

export interface AppStore {
  recognition: RecognitionStore;
  upload: UploadStore;
  ui: UIStore;
  filter: FilterStore;
  websocket: WebSocketStore;
}