import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import React, { createContext, useContext, ReactNode } from 'react';

interface ThemeState {
  theme: 'light' | 'dark';
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      isDarkMode: false,
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: newTheme, isDarkMode: newTheme === 'dark' });
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      },
      setTheme: (theme) => {
        set({ theme, isDarkMode: theme === 'dark' });
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);

// Theme context for providers
const ThemeContext = createContext<ThemeState | null>(null);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const themeStore = useThemeStore();
  return React.createElement(ThemeContext.Provider, { value: themeStore }, children);
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
