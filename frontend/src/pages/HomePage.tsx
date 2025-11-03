/**
 * Home Page Component
 * Sprint 2: Landing page with navigation to core features
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Row, Col, Typography, Space, Statistic } from 'antd';
import {
  UploadOutlined,
  EditOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
// import useAppStore from '../store/appStore';
// import featureFlags from '../utils/featureFlags';

const { Title, Paragraph } = Typography;

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  // const { user, uploadFiles, currentDetections } = useAppStore();
  const user = null;
  const uploadFiles: any[] = [];
  const currentDetections: any[] = [];

  // Feature flag checks
  // const canUseBatchUpload = featureFlags.isEnabled('BATCH_UPLOAD');
  // const canUseSmartDetection = featureFlags.isEnabled('SMART_DETECTION');
  const canUseBatchUpload = true;
  const canUseSmartDetection = true;

  const features = [
    {
      title: 'Batch Upload',
      description: 'Upload up to 50 images at once for efficient processing',
      icon: <UploadOutlined style={{ fontSize: 32 }} />,
      action: () => navigate('/upload'),
      enabled: canUseBatchUpload,
      color: '#1890ff',
    },
    {
      title: 'Smart Detection',
      description: 'AI-powered logo detection with 80% accuracy target',
      icon: <ThunderboltOutlined style={{ fontSize: 32 }} />,
      action: () => navigate('/annotate'),
      enabled: canUseSmartDetection,
      color: '#52c41a',
    },
    {
      title: 'Annotation Canvas',
      description: 'Interactive canvas for precise logo boundary marking',
      icon: <EditOutlined style={{ fontSize: 32 }} />,
      action: () => navigate('/annotate'),
      enabled: true,
      color: '#fa8c16',
    },
    {
      title: 'Training Data',
      description: 'Manage and organize your training datasets',
      icon: <DatabaseOutlined style={{ fontSize: 32 }} />,
      action: () => navigate('/datasets'),
      enabled: false, // Sprint 3
      color: '#722ed1',
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Welcome Section */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2}>Welcome to Logo Recognition System</Title>
          <Paragraph>
            {user ? `Hello, ${user.name}!` : ''} Start by uploading images or jump directly into annotation.
          </Paragraph>
        </div>

        {/* Statistics */}
        <Row gutter={16} style={{ marginBottom: 32 }}>
          <Col span={8}>
            <Card>
              <Statistic
                title="Images Uploaded"
                value={uploadFiles.length}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Detections Made"
                value={currentDetections.length}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="Accuracy Target"
                value={80}
                suffix="%"
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Feature Cards */}
        <Row gutter={[16, 16]}>
          {features.map((feature, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Card
                hoverable={feature.enabled}
                style={{
                  height: '100%',
                  opacity: feature.enabled ? 1 : 0.6,
                  borderTop: `3px solid ${feature.color}`,
                }}
                onClick={feature.enabled ? feature.action : undefined}
              >
                <Space direction="vertical" align="center" style={{ width: '100%' }}>
                  <div style={{ color: feature.color }}>{feature.icon}</div>
                  <Title level={4}>{feature.title}</Title>
                  <Paragraph style={{ textAlign: 'center' }}>
                    {feature.description}
                  </Paragraph>
                  {!feature.enabled && (
                    <Typography.Text type="secondary">Coming in Sprint 3</Typography.Text>
                  )}
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Quick Actions */}
        <Card title="Quick Actions" style={{ marginTop: 32 }}>
          <Space size="middle">
            <Button
              type="primary"
              size="large"
              icon={<UploadOutlined />}
              onClick={() => navigate('/upload')}
            >
              Upload Images
            </Button>
            <Button
              size="large"
              icon={<EditOutlined />}
              onClick={() => navigate('/annotate')}
            >
              Start Annotating
            </Button>
          </Space>
        </Card>

        {/* Sprint 2 Info */}
        <Card title="Sprint 2 Features" bordered={false} style={{ marginTop: 32 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Title level={5}>✅ Completed</Title>
              <ul>
                <li>Frontend Bootstrap with TypeScript</li>
                <li>WebSocket Connection</li>
                <li>State Management (Zustand)</li>
                <li>Feature Flags System</li>
                <li>API Service Layer</li>
              </ul>
            </Col>
            <Col span={12}>
              <Title level={5}>🚧 In Progress</Title>
              <ul>
                <li>Smart Click Detection (80% accuracy)</li>
                <li>Batch Upload (50 files)</li>
                <li>Basic Canvas Annotation</li>
                <li>Design System (Ant Design)</li>
                <li>Data Augmentation (20x)</li>
              </ul>
            </Col>
          </Row>
        </Card>
      </Space>
    </div>
  );
};

export default HomePage;