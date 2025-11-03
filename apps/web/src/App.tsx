import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme, Spin } from 'antd';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { ThemeProvider, useThemeStore } from '@/stores/themeStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RecognitionInterface } from '@/components/recognition/RecognitionInterface';
import { useAccessibility } from '@/hooks/useAccessibility';
import './styles/globals.css';

// Lazy load pages for code splitting
const HomePage = React.lazy(() => import('@/pages/HomePage'));
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));

export const App: React.FC = () => {
  const { isDarkMode } = useThemeStore();
  const { setupAccessibility } = useAccessibility();

  useEffect(() => {
    setupAccessibility();
  }, [setupAccessibility]);

  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <ConfigProvider
          theme={{
            algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
            token: {
              colorPrimary: '#007AFF',
              borderRadius: 8,
              fontSize: 16,
            },
          }}
        >
          <ThemeProvider>
            <BrowserRouter>
              <Suspense fallback={<Spin size="large" />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/recognize" element={<RecognitionInterface />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ThemeProvider>
        </ConfigProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
};

export default App;
