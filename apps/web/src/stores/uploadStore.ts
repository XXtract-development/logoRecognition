/**
 * Upload Store
 * Manages file upload state and progress
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { UploadProgress, UploadStatus } from '@/types';

interface UploadState {
  uploads: Map<string, UploadProgress>;
  activeUploads: number;
  completedUploads: number;
  failedUploads: number;
}

interface UploadActions {
  addUpload: (upload: UploadProgress) => void;
  updateUpload: (fileId: string, updates: Partial<UploadProgress>) => void;
  removeUpload: (fileId: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  cancelUpload: (fileId: string) => void;
  reset: () => void;
}

type UploadStore = UploadState & UploadActions;

const initialState: UploadState = {
  uploads: new Map(),
  activeUploads: 0,
  completedUploads: 0,
  failedUploads: 0,
};

export const useUploadStore = create<UploadStore>()(
  devtools(
    immer((set) => ({
      ...initialState,

      addUpload: (upload: UploadProgress) =>
        set((state) => {
          state.uploads.set(upload.fileId, upload);
          if (upload.status === UploadStatus.UPLOADING) {
            state.activeUploads++;
          }
        }),

      updateUpload: (fileId: string, updates: Partial<UploadProgress>) =>
        set((state) => {
          const upload = state.uploads.get(fileId);
          if (upload !== undefined) {
            const oldStatus = upload.status;
            const newUpload = { ...upload, ...updates };
            state.uploads.set(fileId, newUpload);

            // Update counters
            if (oldStatus === UploadStatus.UPLOADING && updates.status !== UploadStatus.UPLOADING) {
              state.activeUploads = Math.max(0, state.activeUploads - 1);
            }
            if (updates.status === UploadStatus.COMPLETED) {
              state.completedUploads++;
            }
            if (updates.status === UploadStatus.FAILED) {
              state.failedUploads++;
            }
          }
        }),

      removeUpload: (fileId: string) =>
        set((state) => {
          const upload = state.uploads.get(fileId);
          if (upload !== undefined) {
            if (upload.status === UploadStatus.UPLOADING) {
              state.activeUploads = Math.max(0, state.activeUploads - 1);
            }
            state.uploads.delete(fileId);
          }
        }),

      clearCompleted: () =>
        set((state) => {
          const toRemove: string[] = [];
          state.uploads.forEach((upload, fileId) => {
            if (
              upload.status === UploadStatus.COMPLETED ||
              upload.status === UploadStatus.FAILED
            ) {
              toRemove.push(fileId);
            }
          });
          toRemove.forEach((fileId) => state.uploads.delete(fileId));
          state.completedUploads = 0;
          state.failedUploads = 0;
        }),

      clearAll: () =>
        set((state) => {
          state.uploads.clear();
          state.activeUploads = 0;
          state.completedUploads = 0;
          state.failedUploads = 0;
        }),

      cancelUpload: (fileId: string) =>
        set((state) => {
          const upload = state.uploads.get(fileId);
          if (upload !== undefined) {
            upload.status = UploadStatus.CANCELLED;
            state.uploads.set(fileId, upload);
            if (upload.status === UploadStatus.UPLOADING) {
              state.activeUploads = Math.max(0, state.activeUploads - 1);
            }
          }
        }),

      reset: () => set(initialState),
    })),
    { name: 'UploadStore' }
  )
);