import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Menu, Layout, Drawer, Button, Skeleton, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  CloudUploadOutlined,
  EditOutlined,
  ExperimentOutlined,
  DatabaseOutlined,
  HighlightOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  BarChartOutlined,
  MenuOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Sider } = Layout;

interface SideNavigationProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  isMobile: boolean;
  loading?: boolean;
  error?: Error | null;
}

type MenuItem = Required<MenuProps>['items'][number];

// Memoized helper function for creating menu items
const getItem = (
  label: React.ReactNode,
  key: string,
  icon?: React.ReactNode,
  children?: MenuItem[],
): MenuItem => ({
  key,
  icon,
  children,
  label,
} as MenuItem);

const SideNavigationEnhanced: React.FC<SideNavigationProps> = ({
  collapsed,
  onCollapse,
  isMobile,
  loading = false,
  error = null,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState<string>('/');
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  // Memoized menu items configuration for performance
  const menuItems: MenuItem[] = useMemo(() => [
    getItem('Dashboard', '/', <DashboardOutlined aria-label="Dashboard" />),
    getItem('Upload Images', '/upload', <CloudUploadOutlined aria-label="Upload Images" />),
    getItem('Annotate', '/annotate', <EditOutlined aria-label="Annotate" />),
    getItem('Training', 'training', <ExperimentOutlined aria-label="Training" />, [
      getItem('Dashboard', '/training', <BarChartOutlined aria-label="Training Dashboard" />),
      getItem('Jobs', '/training/jobs', <TeamOutlined aria-label="Training Jobs" />),
    ]),
    getItem('Models', '/models', <DatabaseOutlined aria-label="Models" />),
  ], []);

  // Update selected key when location changes
  useEffect(() => {
    const currentPath = location.pathname;

    // Find exact match or parent route
    const findSelectedKey = (items: MenuItem[], parentKey?: string): string => {
      for (const item of items) {
        if (item && 'key' in item) {
          if (item.key === currentPath) {
            return currentPath;
          }
          if ('children' in item && item.children) {
            const childKey = findSelectedKey(item.children as MenuItem[], item.key as string);
            if (childKey) return childKey;
          }
        }
      }
      return parentKey || '/';
    };

    const key = findSelectedKey(menuItems);
    setSelectedKey(key);
  }, [location.pathname, menuItems]);

  // Memoized navigation handler with error handling
  const handleMenuClick = useCallback<MenuProps['onClick']>(
    async (e) => {
      // Don't navigate if it's a submenu parent
      if (e.key === 'training') return;

      setIsNavigating(true);
      setNavigationError(null);

      try {
        // Add timeout for navigation
        const navigationTimeout = setTimeout(() => {
          setIsNavigating(false);
          setNavigationError('Navigation timeout. Please try again.');
        }, 5000);

        navigate(e.key);
        clearTimeout(navigationTimeout);

        // Close mobile drawer after successful navigation
        if (isMobile) {
          setMobileDrawerVisible(false);
        }
      } catch (error) {
        console.error('Navigation error:', error);
        setNavigationError('Failed to navigate. Please try again.');
        message.error('Navigation failed. Please try again.');
      } finally {
        setIsNavigating(false);
      }
    },
    [navigate, isMobile]
  );

  // Get open keys for submenus
  const getOpenKeys = useCallback(() => {
    if (location.pathname.startsWith('/training')) {
      return ['training'];
    }
    return [];
  }, [location.pathname]);

  // Handle drawer visibility with keyboard support
  const handleDrawerToggle = useCallback((visible: boolean) => {
    setMobileDrawerVisible(visible);
  }, []);

  // Keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + M to toggle menu (desktop only)
      if (!isMobile && e.altKey && e.key === 'm') {
        e.preventDefault();
        onCollapse(!collapsed);
      }
      // Escape to close mobile drawer
      if (isMobile && e.key === 'Escape' && mobileDrawerVisible) {
        setMobileDrawerVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collapsed, onCollapse, isMobile, mobileDrawerVisible]);

  // Loading state
  if (loading) {
    return (
      <div style={{ width: collapsed ? 80 : 250, padding: '16px' }}>
        <Skeleton active />
        <Skeleton active />
        <Skeleton active />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        style={{
          width: collapsed ? 80 : 250,
          padding: '16px',
          background: '#001529',
          height: '100vh',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p>Navigation Error</p>
        <Button
          type="primary"
          size="small"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    );
  }

  // Menu content component with accessibility enhancements
  const MenuContent = () => (
    <>
      {/* Logo Section with accessibility */}
      <div
        role="banner"
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}
        aria-label="Logo Recognition System"
      >
        <div
          style={{
            color: 'white',
            fontSize: collapsed && !isMobile ? '20px' : '18px',
            fontWeight: 'bold',
            textAlign: 'center',
            transition: 'all 0.3s',
          }}
        >
          {collapsed && !isMobile ? '🚀' : '🚀 Logo Recognition'}
        </div>
      </div>

      {/* Navigation Menu with ARIA attributes */}
      <nav role="navigation" aria-label="Main navigation">
        <Menu
          theme="dark"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={getOpenKeys()}
          mode="inline"
          onClick={handleMenuClick}
          items={menuItems}
          style={{
            borderRight: 0,
            marginTop: '16px',
          }}
          inlineCollapsed={collapsed && !isMobile}
          aria-label="Site navigation menu"
        />
      </nav>

      {/* Navigation status indicator */}
      {isNavigating && (
        <div
          style={{
            position: 'absolute',
            bottom: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            fontSize: '12px',
          }}
        >
          <LoadingOutlined /> Navigating...
        </div>
      )}

      {/* Error message */}
      {navigationError && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '10px',
            right: '10px',
            color: '#ff4d4f',
            fontSize: '12px',
            textAlign: 'center',
          }}
        >
          {navigationError}
        </div>
      )}
    </>
  );

  // Mobile: Use Drawer with accessibility
  if (isMobile) {
    return (
      <>
        {/* Mobile menu trigger button with accessibility */}
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={() => handleDrawerToggle(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileDrawerVisible}
          aria-controls="mobile-navigation-drawer"
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            zIndex: 101,
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            border: 'none',
          }}
        />

        <Drawer
          id="mobile-navigation-drawer"
          placement="left"
          closable={true}
          onClose={() => handleDrawerToggle(false)}
          open={mobileDrawerVisible}
          styles={{ body: { padding: 0, background: '#001529' } }}
          width={250}
          title={null}
          aria-label="Navigation menu drawer"
        >
          <Suspense fallback={<Skeleton active />}>
            <MenuContent />
          </Suspense>
        </Drawer>
      </>
    );
  }

  // Desktop: Use Sider with accessibility
  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      theme="dark"
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 100,
      }}
      width={250}
      collapsedWidth={80}
      trigger={
        <div
          role="button"
          tabIndex={0}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-pressed={collapsed}
          style={{
            width: '100%',
            padding: '16px 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
          onClick={() => onCollapse(!collapsed)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCollapse(!collapsed);
            }
          }}
        >
          {collapsed ? (
            <MenuUnfoldOutlined aria-hidden="true" />
          ) : (
            <MenuFoldOutlined aria-hidden="true" />
          )}
        </div>
      }
    >
      <Suspense fallback={<Skeleton active />}>
        <MenuContent />
      </Suspense>
    </Sider>
  );
};

// Wrap component with React.memo for performance optimization
export default React.memo(SideNavigationEnhanced);