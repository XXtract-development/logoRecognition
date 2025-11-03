/**
 * Header Component with Authentication Controls
 * @module components/Layout/Header
 * @description Application header with user menu and logout functionality
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Button, Badge, message } from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  BellOutlined,
  DashboardOutlined,
  UploadOutlined,
  FileImageOutlined,
  TeamOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { authService } from '../../services/authService';
import './Header.css';

const { Header: AntHeader } = Layout;

/**
 * Application Header Component
 * @component
 * @description Main navigation header with user authentication controls
 * @returns {JSX.Element} Header component
 */
const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  // Get current user
  const currentUser = authService.getCachedUser();
  const isAuthenticated = authService.isAuthenticated();

  /**
   * Handles user logout
   * @returns {Promise<void>}
   */
  const handleLogout = async (): Promise<void> => {
    setLoading(true);
    try {
      await authService.logout();
      message.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      message.error('Logout failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * User dropdown menu items
   */
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
      onClick: () => navigate('/profile'),
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => navigate('/settings'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: handleLogout,
      disabled: loading,
    },
  ];

  /**
   * Main navigation menu items
   */
  const navigationItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
      onClick: () => navigate('/dashboard'),
    },
    {
      key: 'upload',
      icon: <UploadOutlined />,
      label: 'Upload',
      onClick: () => navigate('/upload'),
    },
    {
      key: 'annotation',
      icon: <FileImageOutlined />,
      label: 'Annotation',
      onClick: () => navigate('/annotation'),
    },
    {
      key: 'training',
      icon: <TeamOutlined />,
      label: 'Training',
      onClick: () => navigate('/training'),
    },
  ];

  // Get current active menu key based on location
  const getActiveKey = (): string => {
    const path = location.pathname;
    if (path.includes('dashboard')) return 'dashboard';
    if (path.includes('upload')) return 'upload';
    if (path.includes('annotation')) return 'annotation';
    if (path.includes('training')) return 'training';
    return '';
  };

  return (
    <AntHeader className="app-header">
      <div className="header-container">
        <div className="header-left">
          <div className="header-logo" onClick={() => navigate('/')}>
            <img
              src="/logo.png"
              alt="Logo"
              className="logo-image"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="logo-text">Logo Recognition</span>
          </div>

          {isAuthenticated && (
            <Menu
              mode="horizontal"
              selectedKeys={[getActiveKey()]}
              items={navigationItems}
              className="header-menu"
            />
          )}
        </div>

        <div className="header-right">
          {isAuthenticated ? (
            <Space size="middle">
              <Badge count={5} size="small">
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  className="header-notification-btn"
                  onClick={() => navigate('/notifications')}
                />
              </Badge>

              <Dropdown
                menu={{ items: userMenuItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <div className="header-user">
                  <Avatar
                    size="default"
                    icon={<UserOutlined />}
                    className="header-avatar"
                    style={{ backgroundColor: '#667eea' }}
                  >
                    {currentUser?.name?.[0]?.toUpperCase()}
                  </Avatar>
                  <div className="header-user-info">
                    <span className="header-user-name">{currentUser?.name || 'User'}</span>
                    <span className="header-user-role">
                      {currentUser?.roles?.includes('admin') ? 'Administrator' : 'User'}
                    </span>
                  </div>
                </div>
              </Dropdown>
            </Space>
          ) : (
            <Space>
              <Button type="default" onClick={() => navigate('/login')}>
                Sign In
              </Button>
              <Button type="primary" onClick={() => navigate('/register')}>
                Sign Up
              </Button>
            </Space>
          )}
        </div>
      </div>
    </AntHeader>
  );
};

export default Header;