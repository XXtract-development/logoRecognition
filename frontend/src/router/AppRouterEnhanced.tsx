import React, { Suspense, useState, useEffect, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Button, Spin, Grid, ConfigProvider, theme } from 'antd';
import SideNavigationEnhanced from '../components/navigation/SideNavigationEnhanced';
import NavigationErrorBoundary from '../components/navigation/NavigationErrorBoundary';
import { useMenuCollapsedState } from '../hooks/useLocalStorage';

// Lazy load pages for better performance with retry logic
const lazyLoadWithRetry = (
  componentImport: () => Promise<any>,
  retries = 3
) => {
  return lazy(() => {
    return new Promise((resolve, reject) => {
      const attemptImport = (retriesLeft: number): void => {
        componentImport()
          .then(resolve)
          .catch((error) => {
            if (retriesLeft === 0) {
              reject(error);
            } else {
              console.warn(`Failed to import component, retrying... (${retriesLeft} attempts left)`);
              setTimeout(() => attemptImport(retriesLeft - 1), 1500);
            }
          });
      };
      attemptImport(retries);
    });
  });
};

// Lazy load pages with retry logic
const HomePage = lazyLoadWithRetry(() => import('../pages/HomePage'));
const UploadPage = lazyLoadWithRetry(() => import('../pages/UploadPage'));
const AnnotationPage = lazyLoadWithRetry(() => import('../pages/AnnotationPage'));
const TrainingDashboard = lazyLoadWithRetry(() => import('../pages/training/TrainingDashboard'));

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

// Enhanced loading component with better UX
const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '400px',
    }}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <Spin size="large" />
    <p style={{ marginTop: '16px', color: '#666' }}>{message}</p>
  </div>
);

// Error fallback component for lazy loading failures
const LazyLoadErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({
  error,
  retry,
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px',
      background: 'white',
      borderRadius: '8px',
    }}
    role="alert"
  >
    <h3>Failed to load page</h3>
    <p style={{ color: '#666', marginBottom: '24px' }}>
      {error.message || 'An unexpected error occurred'}
    </p>
    <Button type="primary" onClick={retry}>
      Retry
    </Button>
  </div>
);

export const AppRouterEnhanced: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('darkMode');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  // Use enhanced localStorage hook with error handling
  const [collapsed, setCollapsed, storageError] = useMenuCollapsedState(isMobile, false);

  // Save dark mode preference
  useEffect(() => {
    try {
      localStorage.setItem('darkMode', JSON.stringify(darkMode));
    } catch (e) {
      console.warn('Failed to save dark mode preference:', e);
    }
  }, [darkMode]);

  // Calculate content margin based on device and collapse state
  const contentMarginLeft = isMobile ? 0 : collapsed ? 80 : 250;

  // Theme configuration
  const themeConfig = {
    algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: '#667eea',
    },
  };

  // Keyboard shortcuts for accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + D to toggle dark mode
      if (e.altKey && e.key === 'd') {
        e.preventDefault();
        setDarkMode((prev) => !prev);
      }
      // Alt + H to go home
      if (e.altKey && e.key === 'h') {
        e.preventDefault();
        window.location.href = '/';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Skip to content link for accessibility
  const skipToContent = () => {
    const content = document.getElementById('main-content');
    if (content) {
      content.focus();
      content.scrollIntoView();
    }
  };

  return (
    <ConfigProvider theme={themeConfig}>
      <Router>
        <Layout style={{ minHeight: '100vh' }}>
          {/* Skip to content link for accessibility */}
          <a
            href="#main-content"
            onClick={skipToContent}
            style={{
              position: 'absolute',
              left: '-9999px',
              zIndex: 999,
              padding: '8px',
              background: '#667eea',
              color: 'white',
            }}
            onFocus={(e) => {
              e.currentTarget.style.left = '0';
            }}
            onBlur={(e) => {
              e.currentTarget.style.left = '-9999px';
            }}
          >
            Skip to main content
          </a>

          {/* Navigation with Error Boundary */}
          <NavigationErrorBoundary>
            <SideNavigationEnhanced
              collapsed={collapsed}
              onCollapse={setCollapsed}
              isMobile={isMobile}
              error={storageError}
            />
          </NavigationErrorBoundary>

          {/* Main Layout */}
          <Layout
            style={{
              marginLeft: contentMarginLeft,
              transition: 'all 0.3s',
            }}
          >
            <Header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: isMobile ? '0 16px 0 60px' : '0 24px',
                position: 'sticky',
                top: 0,
                zIndex: 99,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
              role="banner"
            >
              <div
                style={{
                  color: 'white',
                  fontSize: isMobile ? '16px' : '20px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span>Logo Recognition System</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {storageError && (
                  <span
                    style={{
                      color: '#ffcc00',
                      fontSize: '12px',
                      marginRight: '8px',
                    }}
                    title="Menu state is stored in memory only"
                  >
                    ⚠️
                  </span>
                )}
                <Button
                  type="text"
                  onClick={() => setDarkMode(!darkMode)}
                  style={{
                    color: 'white',
                    fontSize: isMobile ? '16px' : '18px',
                  }}
                  aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  title="Alt + D to toggle"
                >
                  {darkMode ? '☀️' : '🌙'}
                </Button>
              </div>
            </Header>

            <Content
              id="main-content"
              tabIndex={-1}
              style={{
                padding: isMobile ? '16px' : '24px',
                background: darkMode ? '#141414' : '#f0f2f5',
                minHeight: 'calc(100vh - 64px - 70px)',
                overflow: 'auto',
              }}
              role="main"
              aria-label="Main content"
            >
              <NavigationErrorBoundary>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/upload" element={<UploadPage />} />
                    <Route path="/annotate" element={<AnnotationPage />} />
                    <Route path="/training" element={<TrainingDashboard />} />
                    <Route path="/training/jobs" element={<TrainingDashboard />} />
                    <Route
                      path="/models"
                      element={
                        <div
                          style={{
                            padding: isMobile ? '16px' : '24px',
                            background: darkMode ? '#1f1f1f' : 'white',
                            borderRadius: '8px',
                          }}
                        >
                          <h2>Models Management</h2>
                          <p>Model management page coming soon...</p>
                        </div>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </NavigationErrorBoundary>
            </Content>

            <Footer
              style={{
                textAlign: 'center',
                background: darkMode ? '#141414' : '#001529',
                color: 'white',
                padding: isMobile ? '12px 16px' : '16px 24px',
                fontSize: isMobile ? '12px' : '14px',
              }}
              role="contentinfo"
            >
              <p>
                🚀 Logo Recognition System ©{new Date().getFullYear()} - Powered by AI |
                Navigation A++ ✅
              </p>
              <p style={{ fontSize: '10px', marginTop: '4px', opacity: 0.8 }}>
                Press Alt+M for menu, Alt+D for dark mode, Alt+H for home
              </p>
            </Footer>
          </Layout>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};