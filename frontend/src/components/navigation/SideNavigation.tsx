import React, { useState, useEffect } from 'react';
import { Menu, Layout, Drawer, Button } from 'antd';
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
  TagsOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';

const { Sider } = Layout;

interface SideNavigationProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  isMobile: boolean;
}

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: string,
  icon?: React.ReactNode,
  children?: MenuItem[],
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
  } as MenuItem;
}

const SideNavigation: React.FC<SideNavigationProps> = ({ collapsed, onCollapse, isMobile }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedKey, setSelectedKey] = useState<string>('/');
  const [mobileDrawerVisible, setMobileDrawerVisible] = useState(false);

  // Menu items configuration
  const menuItems: MenuItem[] = [
    getItem('Dashboard', '/', <DashboardOutlined />),
    getItem('Upload Images', '/upload', <CloudUploadOutlined />),
    getItem('Annotate', '/annotate', <EditOutlined />),
    getItem('Categories', '/categories', <TagsOutlined />),
    getItem('Training', 'training', <ExperimentOutlined />, [
      getItem('Dashboard', '/training', <BarChartOutlined />),
      getItem('Jobs', '/training/jobs', <TeamOutlined />),
    ]),
    getItem('Models', '/models', <DatabaseOutlined />),
    getItem('Test Page', '/test', <EditOutlined />),
  ];

  // Debug: Log menu items on mount
  useEffect(() => {
    console.log('🔍 SideNavigation: Menu items:', menuItems);
    console.log('🔍 SideNavigation: Categories item:', menuItems.find(item => item && 'key' in item && item.key === '/categories'));
  }, []);

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
  }, [location.pathname]);

  // Handle menu item click
  const handleMenuClick: MenuProps['onClick'] = (e) => {
    // Don't navigate if it's a submenu parent
    if (e.key !== 'training') {
      navigate(e.key);
      // Close mobile drawer after navigation
      if (isMobile) {
        setMobileDrawerVisible(false);
      }
    }
  };

  // Get open keys for submenus
  const getOpenKeys = () => {
    if (location.pathname.startsWith('/training')) {
      return ['training'];
    }
    return [];
  };

  // Menu content component
  const MenuContent = () => (
    <>
      {/* Logo Section */}
      <div
        style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}
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

      {/* Navigation Menu */}
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
      />
    </>
  );

  // Mobile: Use Drawer
  if (isMobile) {
    return (
      <>
        {/* Mobile menu trigger button */}
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={() => setMobileDrawerVisible(true)}
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
          placement="left"
          closable={false}
          onClose={() => setMobileDrawerVisible(false)}
          open={mobileDrawerVisible}
          bodyStyle={{ padding: 0, background: '#001529' }}
          width={250}
        >
          <MenuContent />
        </Drawer>
      </>
    );
  }

  // Desktop: Use Sider
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
        <div style={{
          width: '100%',
          padding: '16px 0',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
      }
    >
      <MenuContent />
    </Sider>
  );
};

export default SideNavigation;