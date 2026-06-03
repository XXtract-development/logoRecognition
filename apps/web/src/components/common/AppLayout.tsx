/**
 * AppLayout - Global Navigation Layout
 * Provides consistent navigation header across all pages
 */
import React from 'react';
import { Layout, Menu, Typography, Space, Dropdown, Button, Badge } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  CameraOutlined,
  DatabaseOutlined,
  RocketOutlined,
  DashboardOutlined,
  SettingOutlined,
  HomeOutlined,
  PictureOutlined,
  ExperimentOutlined,
  AppstoreOutlined,
  GlobalOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import { useThemeStore } from '@/stores/themeStore';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

const { Header, Content } = Layout;
const { Text } = Typography;

// Navigation items configuration - simplified for better fit
const getNavigationItems = (t: TFunction) => [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: t('nav.home', { defaultValue: 'Home' }),
  },
  {
    key: '/recognize',
    icon: <CameraOutlined />,
    label: t('nav.recognize', { defaultValue: 'Recognize' }),
  },
  {
    key: 'training-group',
    icon: <DatabaseOutlined />,
    label: t('nav.training', { defaultValue: 'Training' }),
    children: [
      {
        key: '/training',
        icon: <PictureOutlined />,
        label: t('nav.imageLibrary', { defaultValue: 'Images' }),
      },
      {
        key: '/training/pipeline',
        icon: <ExperimentOutlined />,
        label: t('nav.trainModel', { defaultValue: 'Train' }),
      },
    ],
  },
  {
    key: '/models',
    icon: <AppstoreOutlined />,
    label: t('nav.models', { defaultValue: 'Models' }),
  },
  {
    key: '/reference-library',
    icon: <PictureOutlined />,
    label: t('nav.referenceLibrary', { defaultValue: 'Referenties' }),
  },
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: t('nav.dashboard', { defaultValue: 'Dashboard' }),
  },
];

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { isDarkMode, toggleTheme } = useThemeStore();
  const { isApiHealthy, isWebSocketHealthy } = useBackendStatus();

  // Determine active menu key based on current path
  const getActiveKey = () => {
    const path = location.pathname;
    if (path.startsWith('/training/annotate')) return '/training';
    if (path.startsWith('/training/pipeline')) return '/training/pipeline';
    if (path.startsWith('/training')) return '/training';
    if (path.startsWith('/recognize')) return '/recognize';
    if (path.startsWith('/models')) return '/models';
    if (path.startsWith('/reference-library')) return '/reference-library';
    if (path.startsWith('/dashboard')) return '/dashboard';
    return '/';
  };

  const handleMenuClick = ({ key }: { key: string }) => {
    if (!key.includes('-group')) {
      navigate(key);
    }
  };

  // Connection status indicator
  const getConnectionStatus = () => {
    if (!isApiHealthy) {
      return { status: 'error' as const, text: t('connection.offline', 'Offline') };
    }
    if (!isWebSocketHealthy) {
      return { status: 'warning' as const, text: t('connection.limited', 'Limited') };
    }
    return { status: 'success' as const, text: t('connection.online', 'Online') };
  };

  const connectionStatus = getConnectionStatus();

  // Language menu items
  const languageItems = [
    { key: 'en', label: 'English' },
    { key: 'nl', label: 'Nederlands' },
    { key: 'de', label: 'Deutsch' },
    { key: 'fr', label: 'Fran\u00e7ais' },
    { key: 'es', label: 'Espa\u00f1ol' },
  ];

  const handleLanguageChange = ({ key }: { key: string }) => {
    i18n.changeLanguage(key);
  };

  return (
    <Layout className="min-h-screen">
      <Header
        className={`sticky top-0 z-50 flex items-center justify-between px-4 ${
          isDarkMode ? 'bg-neutral-900' : 'bg-white'
        } shadow-sm`}
        style={{
          height: 64,
          lineHeight: '64px',
          padding: '0 24px',
        }}
      >
        {/* Logo and Brand */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => navigate('/')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/')}
        >
          <div className="text-2xl">
            <RocketOutlined style={{ color: '#007AFF' }} />
          </div>
          <Text
            strong
            className={`text-lg hidden sm:block ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}
          >
            Logo Recognition
          </Text>
        </div>

        {/* Main Navigation */}
        <Menu
          mode="horizontal"
          selectedKeys={[getActiveKey()]}
          onClick={handleMenuClick}
          items={getNavigationItems(t)}
          style={{
            flex: 1,
            minWidth: 0,
            marginLeft: 24,
            marginRight: 24,
            border: 'none',
            background: 'transparent',
          }}
          overflowedIndicator={null}
        />

        {/* Right Side Actions */}
        <Space size="middle" className="flex items-center">
          {/* Connection Status Badge */}
          <Badge
            status={connectionStatus.status}
            text={
              <Text
                className={`text-xs hidden md:inline ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}
              >
                {connectionStatus.text}
              </Text>
            }
          />

          {/* Language Selector */}
          <Dropdown
            menu={{
              items: languageItems,
              onClick: handleLanguageChange,
              selectedKeys: [i18n.language?.split('-')[0] || 'en'],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              icon={<GlobalOutlined />}
              className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}
            />
          </Dropdown>

          {/* Theme Toggle */}
          <Button
            type="text"
            icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleTheme}
            className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          />

          {/* Settings */}
          <Button
            type="text"
            icon={<SettingOutlined />}
            className={isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}
          />
        </Space>
      </Header>

      <Content className={isDarkMode ? 'bg-neutral-900' : 'bg-neutral-50'}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default AppLayout;
