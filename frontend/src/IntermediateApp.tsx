import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, Button, Grid } from 'antd';
import SideNavigation from './components/navigation/SideNavigation';

// Direct imports - no lazy loading yet
import HomePage from './pages/HomePage';
import CategoriesPage from './pages/CategoriesPage';
import TestPage from './pages/TestPage';

const { Header, Content, Footer } = Layout;
const { useBreakpoint } = Grid;

const DebugRouter: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    console.log('🔍 IntermediateApp DebugRouter: Current location:', location.pathname);
  }, [location]);
  return null;
};

const IntermediateAppContent: React.FC = () => {
  const location = useLocation();
  const [darkMode, setDarkMode] = useState(false);
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    console.log('🔍 IntermediateApp: Rendering with location:', location.pathname);
    console.log('🔍 IntermediateApp: isMobile:', isMobile, 'collapsed:', collapsed);
  }, [location, isMobile, collapsed]);

  const contentMarginLeft = isMobile ? 0 : (collapsed ? 80 : 250);

  console.log('🔍 IntermediateApp: About to render SideNavigation');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <SideNavigation
        collapsed={collapsed}
        onCollapse={setCollapsed}
        isMobile={isMobile}
      />

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
          minHeight: 'calc(100vh - 64px - 70px)',
          overflow: 'auto'
        }}>
          <DebugRouter />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/test" element={<TestPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>

        <Footer style={{
          textAlign: 'center',
          background: '#001529',
          color: 'white',
          padding: isMobile ? '12px 16px' : '16px 24px',
          fontSize: isMobile ? '12px' : '14px'
        }}>
          🚀 Logo Recognition System - Intermediate Test (Layout + Routing)
        </Footer>
      </Layout>
    </Layout>
  );
};

export const IntermediateApp: React.FC = () => {
  console.log('🔍 IntermediateApp: Starting with Layout and Ant Design');

  return (
    <BrowserRouter>
      <IntermediateAppContent />
    </BrowserRouter>
  );
};

export default IntermediateApp;