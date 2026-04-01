/**
 * HomePage - Redesigned with clear user journey paths
 * Two primary paths: Recognition and Training
 */
import React from 'react';
import { Card, Typography, Button, Row, Col, Divider } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CameraOutlined,
  DashboardOutlined,
  RocketOutlined,
  PictureOutlined,
  ExperimentOutlined,
  AppstoreOutlined,
  ArrowRightOutlined,
  ThunderboltOutlined,
  AimOutlined,
  ExportOutlined,
  DatabaseOutlined,
  EditOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useThemeStore } from '@/stores/themeStore';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

const { Title, Paragraph, Text } = Typography;

// Feature card component for the two main paths
interface PathCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  features: { icon: React.ReactNode; text: string }[];
  buttonText: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

const PathCard: React.FC<PathCardProps> = ({
  icon,
  iconBg,
  title,
  description,
  features,
  buttonText,
  onClick,
  disabled,
  disabledReason,
}) => {
  const { isDarkMode } = useThemeStore();

  return (
    <Card
      className={`h-full transition-all duration-300 hover:shadow-lg ${
        isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white'
      } ${disabled ? 'opacity-60' : 'cursor-pointer hover:-translate-y-1'}`}
      onClick={disabled ? undefined : onClick}
      bordered
      styles={{ body: { padding: 24, height: '100%' } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            backgroundColor: iconBg,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 28, color: 'white', display: 'flex' }}>
            {icon}
          </span>
        </div>

        {/* Title & Description */}
        <Title level={3} style={{ marginBottom: 8 }}>
          {title}
        </Title>
        <Paragraph style={{ marginBottom: 16, color: isDarkMode ? '#a3a3a3' : '#525252' }}>
          {description}
        </Paragraph>

        {/* Features list */}
        <div style={{ flex: 1, marginBottom: 24 }}>
          {features.map((feature, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: isDarkMode ? '#737373' : '#a3a3a3' }}>
                {feature.icon}
              </span>
              <Text style={{ color: isDarkMode ? '#d4d4d4' : '#404040' }}>
                {feature.text}
              </Text>
            </div>
          ))}
        </div>

        {/* Action button */}
        <Button
          type="primary"
          size="large"
          block
          icon={<ArrowRightOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          disabled={disabled}
          style={{ marginTop: 'auto' }}
        >
          {disabled ? disabledReason : buttonText}
        </Button>
      </div>
    </Card>
  );
};

// Quick action link component
interface QuickLinkProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const QuickLink: React.FC<QuickLinkProps> = ({ icon, label, onClick }) => {
  const { isDarkMode } = useThemeStore();

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-colors ${
        isDarkMode
          ? 'hover:bg-neutral-700 text-neutral-300 hover:text-white'
          : 'hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <Text className={`text-sm ${isDarkMode ? 'text-inherit' : ''}`}>{label}</Text>
    </button>
  );
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isDarkMode } = useThemeStore();
  const { isApiHealthy } = useBackendStatus();

  const recognitionFeatures = [
    { icon: <ThunderboltOutlined />, text: t('home.features.realtime', 'Real-time processing with WebSocket') },
    { icon: <AimOutlined />, text: t('home.features.highAccuracy', 'High-accuracy ML detection') },
    { icon: <ExportOutlined />, text: t('home.features.export', 'Export to JSON, CSV, or XML') },
  ];

  const trainingFeatures = [
    { icon: <PictureOutlined />, text: t('home.features.batchUpload', 'Batch upload training images') },
    { icon: <EditOutlined />, text: t('home.features.annotate', 'Visual annotation tools') },
    { icon: <CheckCircleOutlined />, text: t('home.features.fewShot', 'Few-shot learning support') },
  ];

  return (
    <div className={`min-h-screen p-6 ${isDarkMode ? 'bg-neutral-900' : 'bg-neutral-50'}`}>
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: '#007AFF' }}
            >
              <RocketOutlined style={{ fontSize: 40, color: 'white' }} />
            </div>
          </div>
          <Title
            level={1}
            className={`mb-4 ${isDarkMode ? 'text-white' : ''}`}
          >
            {t('home.title', 'Logo Recognition System')}
          </Title>
          <Paragraph
            className={`text-lg max-w-2xl mx-auto ${
              isDarkMode ? 'text-neutral-400' : 'text-neutral-600'
            }`}
          >
            {t(
              'home.subtitle',
              'Detect and identify logos in images using advanced AI. Train custom models or use pre-trained ones for instant recognition.'
            )}
          </Paragraph>
        </div>

        {/* Main Action Question */}
        <div className="text-center mb-8">
          <Text
            strong
            className={`text-xl ${isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}`}
          >
            {t('home.question', 'What would you like to do today?')}
          </Text>
        </div>

        {/* Two Main Paths */}
        <Row gutter={[24, 24]} className="mb-12">
          <Col xs={24} lg={12}>
            <PathCard
              icon={<CameraOutlined />}
              iconBg="#007AFF"
              title={t('home.paths.recognize.title', 'Recognize Logos')}
              description={t(
                'home.paths.recognize.description',
                'Upload an image and instantly detect logos using trained AI models.'
              )}
              features={recognitionFeatures}
              buttonText={t('home.paths.recognize.button', 'Start Recognition')}
              onClick={() => navigate('/recognize')}
              disabled={!isApiHealthy}
              disabledReason={t('home.paths.recognize.offline', 'Backend offline')}
            />
          </Col>
          <Col xs={24} lg={12}>
            <PathCard
              icon={<DatabaseOutlined />}
              iconBg="#52C41A"
              title={t('home.paths.train.title', 'Train a Model')}
              description={t(
                'home.paths.train.description',
                'Upload training images, annotate logos, and create custom detection models.'
              )}
              features={trainingFeatures}
              buttonText={t('home.paths.train.button', 'Start Training')}
              onClick={() => navigate('/training')}
            />
          </Col>
        </Row>

        {/* Divider with Quick Links */}
        <Divider className={isDarkMode ? 'border-neutral-700' : ''}>
          <Text className={isDarkMode ? 'text-neutral-500' : 'text-neutral-400'}>
            {t('home.quickLinks', 'Or go directly to')}
          </Text>
        </Divider>

        {/* Quick Links */}
        <div className="flex justify-center gap-4 flex-wrap mb-12">
          <QuickLink
            icon={<DashboardOutlined />}
            label={t('home.links.dashboard', 'Dashboard')}
            onClick={() => navigate('/dashboard')}
          />
          <QuickLink
            icon={<AppstoreOutlined />}
            label={t('home.links.models', 'Model Management')}
            onClick={() => navigate('/models')}
          />
          <QuickLink
            icon={<ExperimentOutlined />}
            label={t('home.links.pipeline', 'Training Pipeline')}
            onClick={() => navigate('/training/pipeline')}
          />
        </div>

        {/* Stats/Info Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card
              className={`text-center ${
                isDarkMode ? 'bg-neutral-800 border-neutral-700' : ''
              }`}
            >
              <ThunderboltOutlined
                style={{ fontSize: 28, color: '#007AFF', marginBottom: 8 }}
              />
              <Title level={5} className={isDarkMode ? 'text-white' : ''}>
                {t('home.stats.fast.title', 'Fast Processing')}
              </Title>
              <Paragraph
                className={`mb-0 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}
              >
                {t('home.stats.fast.description', 'Real-time detection with WebSocket streaming for instant results')}
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              className={`text-center ${
                isDarkMode ? 'bg-neutral-800 border-neutral-700' : ''
              }`}
            >
              <AimOutlined
                style={{ fontSize: 28, color: '#52C41A', marginBottom: 8 }}
              />
              <Title level={5} className={isDarkMode ? 'text-white' : ''}>
                {t('home.stats.accurate.title', 'High Accuracy')}
              </Title>
              <Paragraph
                className={`mb-0 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}
              >
                {t('home.stats.accurate.description', 'Advanced ML models for precise logo identification')}
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card
              className={`text-center ${
                isDarkMode ? 'bg-neutral-800 border-neutral-700' : ''
              }`}
            >
              <ExportOutlined
                style={{ fontSize: 28, color: '#FAAD14', marginBottom: 8 }}
              />
              <Title level={5} className={isDarkMode ? 'text-white' : ''}>
                {t('home.stats.export.title', 'Export Results')}
              </Title>
              <Paragraph
                className={`mb-0 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}
              >
                {t('home.stats.export.description', 'Export recognition results in JSON, CSV, or XML format')}
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default HomePage;
