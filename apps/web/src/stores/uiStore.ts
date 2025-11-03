/**
 * UI Store
 * Manages UI state including theme, language, modals, and notifications
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Notification } from '@/types';

interface UIState {
  theme: 'light' | 'dark' | 'system';
  language: string;
  sidebarOpen: boolean;
  modalStack: string[];
  notifications: Notification[];
}

interface UIActions {
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: string) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  closeAllModals: () => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  reset: () => void;
}

type UIStore = UIState & UIActions;

const initialState: UIState = {
  theme: 'system',
  language: 'en',
  sidebarOpen: true,
  modalStack: [],
  notifications: [],
};

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...initialState,

        setTheme: (theme: 'light' | 'dark' | 'system') =>
          set((state) => {
            state.theme = theme;
          }),

        setLanguage: (language: string) =>
          set((state) => {
            state.language = language;
          }),

        toggleSidebar: () =>
          set((state) => {
            state.sidebarOpen = !state.sidebarOpen;
          }),

        setSidebarOpen: (open: boolean) =>
          set((state) => {
            state.sidebarOpen = open;
          }),

        openModal: (modalId: string) =>
          set((state) => {
            if (!state.modalStack.includes(modalId)) {
              state.modalStack.push(modalId);
            }
          }),

        closeModal: (modalId: string) =>
          set((state) => {
            state.modalStack = state.modalStack.filter((id) => id !== modalId);
          }),

        closeAllModals: () =>
          set((state) => {
            state.modalStack = [];
          }),

        addNotification: (notification) =>
          set((state) => {
            const id = `notification-${Date.now()}-${Math.random()}`;
            state.notifications.push({
              ...notification,
              id,
              timestamp: new Date().toISOString(),
            });
            // Keep only last 10 notifications
            if (state.notifications.length > 10) {
              state.notifications = state.notifications.slice(-10);
            }
          }),

        removeNotification: (id: string) =>
          set((state) => {
            state.notifications = state.notifications.filter((n) => n.id !== id);
          }),

        clearNotifications: () =>
          set((state) => {
            state.notifications = [];
          }),

        reset: () => set({ ...initialState, language: 'en', theme: 'system' }),
      })),
      {
        name: 'ui-storage',
        partialize: (state) => ({
          theme: state.theme,
          language: state.language,
          sidebarOpen: state.sidebarOpen,
        }),
      }
    ),
    { name: 'UIStore' }
  )
);