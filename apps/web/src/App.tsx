import React, { Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { ConfigProvider, theme, Spin } from 'antd';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n';
import { ThemeProvider, useThemeStore } from '@/stores/themeStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BackendStatusProvider } from '@/contexts/BackendStatusContext';
import { OfflineBanner } from '@/components/common/ConnectionStatus';
import { AppLayout } from '@/components/common/AppLayout';
import { RecognitionInterface } from '@/components/recognition/RecognitionInterface';
import { useAccessibility } from '@/hooks/useAccessibility';
import './styles/globals.css';

// Lazy load pages for code splitting
const HomePage = React.lazy(() => import('@/pages/HomePage'));
const DashboardPage = React.lazy(() => import('@/pages/DashboardPage'));
const TrainingPage = React.lazy(() => import('@/pages/TrainingPage'));
const AnnotationPage = React.lazy(() => import('@/pages/AnnotationPage'));
const TrainingPipelinePage = React.lazy(() => import('@/pages/TrainingPipelinePage'));
const ModelsPage = React.lazy(() => import('@/pages/ModelsPage'));

/**
 * Root Layout Component
 * Wraps all routes with common providers and layout
 */
const RootLayout: React.FC = () => {
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
            <BackendStatusProvider
              pollingInterval={30000}
              timeout={5000}
              autoStart={true}
            >
              <div style={{ minHeight: '100vh' }}>
                <OfflineBanner />
                <Suspense
                  fallback={
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      height: '100vh'
                    }}>
                      <Spin size="large" />
                    </div>
                  }
                >
                  <Outlet />
                </Suspense>
              </div>
            </BackendStatusProvider>
          </ThemeProvider>
        </ConfigProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
};

/**
 * Create router with future flags to prevent deprecation warnings
 * All v7 flags enabled to suppress warnings and prepare for React Router v7
 */
const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      children: [
        // Pages with global navigation header
        {
          element: <AppLayout />,
          children: [
            {
              index: true,
              element: <HomePage />,
            },
            {
              path: 'dashboard',
              element: <DashboardPage />,
            },
            {
              path: 'recognize',
              element: <RecognitionInterface />,
            },
            {
              path: 'training',
              element: <TrainingPage />,
            },
            {
              path: 'training/pipeline',
              element: <TrainingPipelinePage />,
            },
            {
              path: 'models',
              element: <ModelsPage />,
            },
          ],
        },
        // Annotation page without header (full-screen canvas mode)
        {
          path: 'training/annotate/:imageId',
          element: <AnnotationPage />,
        },
      ],
    },
  ],
  {
    future: {
      // Opt-in to all v7 future flags to prevent deprecation warnings
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  }
);

export const App: React.FC = () => {
  return (
    <RouterProvider
      router={router}
      future={{
        v7_startTransition: true,
      }}
    />
  );
};

export default App;
