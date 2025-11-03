import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { RecognitionResult, UploadedImage } from '@types/recognition';

interface RecognitionState {
  // State
  currentImage: UploadedImage | null;
  results: RecognitionResult[];
  isProcessing: boolean;
  progress: number;
  error: string | null;
  history: Array<{
    image: UploadedImage;
    results: RecognitionResult[];
    timestamp: Date;
  }>;

  // Actions
  setCurrentImage: (image: UploadedImage | null) => void;
  setResults: (results: RecognitionResult[]) => void;
  setProcessing: (processing: boolean) => void;
  setProgress: (progress: number) => void;
  setError: (error: string | null) => void;
  clearResults: () => void;
  addToHistory: (image: UploadedImage, results: RecognitionResult[]) => void;
  clearHistory: () => void;
  reset: () => void;
}

const initialState = {
  currentImage: null,
  results: [],
  isProcessing: false,
  progress: 0,
  error: null,
  history: [],
};

export const useRecognitionStore = create<RecognitionState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setCurrentImage: (image) =>
          set((state) => {
            state.currentImage = image;
            state.error = null;
          }),

        setResults: (results) =>
          set((state) => {
            state.results = results;
            if (state.currentImage && results.length > 0) {
              state.history.push({
                image: state.currentImage,
                results,
                timestamp: new Date(),
              });
              // Keep only last 10 items in history
              if (state.history.length > 10) {
                state.history.shift();
              }
            }
          }),

        setProcessing: (processing) =>
          set((state) => {
            state.isProcessing = processing;
            if (processing) {
              state.error = null;
            }
          }),

        setProgress: (progress) =>
          set((state) => {
            state.progress = Math.min(100, Math.max(0, progress));
          }),

        setError: (error) =>
          set((state) => {
            state.error = error;
            state.isProcessing = false;
            state.progress = 0;
          }),

        clearResults: () =>
          set((state) => {
            state.results = [];
            state.progress = 0;
          }),

        addToHistory: (image, results) =>
          set((state) => {
            state.history.push({
              image,
              results,
              timestamp: new Date(),
            });
            if (state.history.length > 10) {
              state.history.shift();
            }
          }),

        clearHistory: () =>
          set((state) => {
            state.history = [];
          }),

        reset: () => set(initialState),
      })),
      {
        name: 'recognition-store',
        partialize: (state) => ({
          history: state.history.slice(-5), // Only persist last 5 history items
        }),
      }
    ),
    {
      name: 'RecognitionStore',
    }
  )
);