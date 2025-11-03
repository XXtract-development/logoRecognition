import React, { Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, Button, Spin, Grid } from 'antd';
import SideNavigation from '../components/navigation/SideNavigation';
import { DebugRouter } from '../DebugRouter';

// Import pages directly (temporary test - remove lazy loading for Categories)
const HomePage = React.lazy(() => import('../pages/HomePage'));
const UploadPage = React.lazy(() => import('../pages/UploadPage'));
const AnnotationPage = React.lazy(() => import('../pages/AnnotationPage'));
const TrainingDashboard = React.lazy(() => import('../pages/training/TrainingDashboard'));
const TrainingJobs = React.lazy(() => import('../pages/training/TrainingJobs'));
// Direct imports for testing
import CategoriesPage from '../pages/CategoriesPage';
import CategoriesPageSimple from '../pages/CategoriesPageSimple';
import TestPage from '../pages/TestPage';

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '400px'
  }}>
    <Spin size="large" />
  </div>
);

export const AppRouter: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    console.log('🔍 AppRouter: Rendering with location:', location.pathname);
  }, [location]);

  const [darkMode, setDarkMode] = useState(false);
  const screens = useBreakpoint();
  const isMobile = !screens.md; // Mobile if screen is smaller than md breakpoint

  const [collapsed, setCollapsed] = useState(() => {
    // Load collapsed state from localStorage (only for desktop)
    if (!isMobile) {
      const savedState = localStorage.getItem('menuCollapsed');
      return savedState ? JSON.parse(savedState) : false;
    }
    return false;
  });

  // Save collapsed state to localStorage when it changes (only for desktop)
  useEffect(() => {
    if (!isMobile) {
      localStorage.setItem('menuCollapsed', JSON.stringify(collapsed));
    }
  }, [collapsed, isMobile]);

  // Calculate content margin based on device and collapse state
  const contentMarginLeft = isMobile ? 0 : (collapsed ? 80 : 250);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Side Navigation */}
      <SideNavigation
        collapsed={collapsed}
        onCollapse={setCollapsed}
        isMobile={isMobile}
      />

        {/* Main Layout */}
        <Layout style={{
          marginLeft: contentMarginLeft,
          transition: 'all 0.3s',
        }}>
          <Header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: isMobile ? '0 16px 0 60px' : '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 99,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              color: 'white',
              fontSize: isMobile ? '16px' : '20px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center'
            }}>
              {/* Header title - responsive sizing */}
              <span>Logo Recognition System</span>
            </div>
            <Button
              type="text"
              onClick={() => setDarkMode(!darkMode)}
              style={{
                color: 'white',
                fontSize: isMobile ? '16px' : '18px'
              }}
            >
              {darkMode ? '☀️' : '🌙'}
            </Button>
          </Header>

          <Content style={{
            padding: isMobile ? '16px' : '24px',
            background: '#f0f2f5',
            minHeight: 'calc(100vh - 64px - 70px)', // Header height - Footer height
            overflow: 'auto'
          }}>
            <DebugRouter />
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/annotate" element={<AnnotationPage />} />
                <Route path="/test" element={<TestPage />} />
                <Route path="/categories-simple" element={<CategoriesPageSimple />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/training" element={<TrainingDashboard />} />
                <Route path="/training/jobs" element={<TrainingJobs />} />
                <Route path="/models" element={
                  <div style={{
                    padding: isMobile ? '16px' : '24px',
                    background: 'white',
                    borderRadius: '8px'
                  }}>
                    <h2>Models Management</h2>
                    <p>Model management page coming soon...</p>
                  </div>
                } />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Content>

          <Footer style={{
            textAlign: 'center',
            background: '#001529',
            color: 'white',
            padding: isMobile ? '12px 16px' : '16px 24px',
            fontSize: isMobile ? '12px' : '14px'
          }}>
            🚀 Logo Recognition System ©{new Date().getFullYear()} - Powered by AI | Navigation Ready ✅
          </Footer>
        </Layout>
    </Layout>
  );
};

export default AppRouter;