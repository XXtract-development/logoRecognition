import { create } from 'zustand';

interface AppStore {
  darkMode: boolean;
  toggleDarkMode: () => void;
  user: any | null;
  setUser: (user: any) => void;
  uploadProgress: Record<string, number>;
  setUploadProgress: (fileId: string, progress: number) => void;
  isTraining: boolean;
  setIsTraining: (training: boolean) => void;
}

export const useStore = create<AppStore>()((set, get) => ({
  darkMode: false,
  toggleDarkMode: () => set({ darkMode: !get().darkMode }),
  user: null,
  setUser: (user) => set({ user }),
  uploadProgress: {},
  setUploadProgress: (fileId, progress) =>
    set({
      uploadProgress: {
        ...get().uploadProgress,
        [fileId]: progress
      }
    }),
  isTraining: false,
  setIsTraining: (training) => set({ isTraining: training }),
}));