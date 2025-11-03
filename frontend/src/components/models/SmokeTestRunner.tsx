// Smoke Test Runner Component (US-015)
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Upload,
  Button,
  List,
  Card,
  Row,
  Col,
  Space,
  Tag,
  Progress,
  Typography,
  Select,
  Alert,
  Divider,
  Image,
  Table,
  message,
} from 'antd';
import {
  UploadOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CloudUploadOutlined,
  FileImageOutlined,
} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { ModelVersion, SmokeTestConfiguration, SmokeTestRun, DetectionResult } from '../../types/models';
import useModelRegistryStore from '../../store/modelRegistryStore';
import modelRegistryService from '../../services/models/ModelRegistryService';

const { Text, Title } = Typography;
const { Option } = Select;
const { Dragger } = Upload;

interface SmokeTestRunnerProps {
  model: ModelVersion;
  visible: boolean;
  onClose: () => void;
}

const SmokeTestRunner: React.FC<SmokeTestRunnerProps> = ({
  model,
  visible,
  onClose,
}) => {
  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [customImages, setCustomImages] = useState<UploadFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<SmokeTestRun | null>(null);
  const [configurations, setConfigurations] = useState<SmokeTestConfiguration[]>([]);

  const { runSmokeTest, fetchSmokeTestConfigurations } = useModelRegistryStore();

  // Load smoke test configurations
  useEffect(() => {
    if (visible) {
      loadConfigurations();
    }
  }, [visible]);

  const loadConfigurations = async () => {
    try {
      await fetchSmokeTestConfigurations();
      const configs = await modelRegistryService.getSmokeTestConfigurations();
      setConfigurations(configs);
      if (configs.length > 0) {
        setSelectedConfig(configs[0].id);
      }
    } catch (error) {
      console.error('Failed to load smoke test configurations:', error);
    }
  };

  // Handle file upload
  const handleUpload = (info: any) => {
    const { fileList } = info;
    // Filter to only image files
    const images = fileList.filter((file: UploadFile) => {
      if (file.type) {
        return file.type.startsWith('image/');
      }
      return true;
    });
    setCustomImages(images.slice(-5)); // Keep last 5 images
  };

  // Run smoke test
  const handleRunTest = async () => {
    setIsRunning(true);
    try {
      const result = await runSmokeTest(model.id, selectedConfig || undefined);
      setTestResults(result);

      if (result.status === 'passed') {
        message.success('Smoke test completed successfully!');
      } else {
        message.error('Smoke test failed. Please review the results.');
      }
    } catch (error: any) {
      message.error(`Failed to run smoke test: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Get test status icon
  const getTestStatusIcon = (passed: boolean) => {
    return passed ? (
      <CheckCircleOutlined style={{ color: '#52c41a' }} />
    ) : (
      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    );
  };

  // Calculate IoU for bounding boxes
  const calculateIoU = (box1: DetectionResult['boundingBox'], box2: DetectionResult['boundingBox']) => {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (x2 < x1 || y2 < y1) return 0;

    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;

    return intersection / union;
  };

  // Render test results
  const renderTestResults = () => {
    if (!testResults) return null;

    const columns = [
      {
        title: 'Test',
        dataIndex: 'imageId',
        key: 'imageId',
        render: (text: string) => <Text>{text}</Text>,
      },
      {
        title: 'Status',
        dataIndex: 'passed',
        key: 'passed',
        render: (passed: boolean) => (
          <Tag color={passed ? 'success' : 'error'} icon={getTestStatusIcon(passed)}>
            {passed ? 'PASSED' : 'FAILED'}
          </Tag>
        ),
      },
      {
        title: 'Precision',
        dataIndex: ['metrics', 'precision'],
        key: 'precision',
        render: (value: number) => `${(value * 100).toFixed(1)}%`,
      },
      {
        title: 'Recall',
        dataIndex: ['metrics', 'recall'],
        key: 'recall',
        render: (value: number) => `${(value * 100).toFixed(1)}%`,
      },
      {
        title: 'IoU',
        dataIndex: ['metrics', 'iou'],
        key: 'iou',
        render: (value: number) => value.toFixed(3),
      },
      {
        title: 'Time (ms)',
        dataIndex: 'executionTime',
        key: 'executionTime',
        render: (value: number) => `${value}ms`,
      },
    ];

    return (
      <div>
        {/* Summary Card */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <Space direction="vertical" align="center" style={{ width: '100%' }}>
                <Text type="secondary">Overall Status</Text>
                <Tag
                  color={testResults.status === 'passed' ? 'success' : 'error'}
                  icon={getTestStatusIcon(testResults.status === 'passed')}
                  style={{ fontSize: 16, padding: '4px 12px' }}
                >
                  {testResults.status.toUpperCase()}
                </Tag>
              </Space>
            </Col>
            <Col span={6}>
              <Space direction="vertical" align="center" style={{ width: '100%' }}>
                <Text type="secondary">Tests Run</Text>
                <Text strong style={{ fontSize: 24 }}>
                  {testResults.summary.totalTests}
                </Text>
              </Space>
            </Col>
            <Col span={6}>
              <Space direction="vertical" align="center" style={{ width: '100%' }}>
                <Text type="secondary">Success Rate</Text>
                <Progress
                  type="circle"
                  percent={(testResults.summary.passed / testResults.summary.totalTests) * 100}
                  width={60}
                  format={(percent) => `${percent?.toFixed(0)}%`}
                />
              </Space>
            </Col>
            <Col span={6}>
              <Space direction="vertical" align="center" style={{ width: '100%' }}>
                <Text type="secondary">Avg Time</Text>
                <Text strong style={{ fontSize: 24 }}>
                  {testResults.summary.avgExecutionTime.toFixed(0)}ms
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Detailed Results Table */}
        <Table
          columns={columns}
          dataSource={testResults.results}
          rowKey="imageId"
          pagination={false}
          size="small"
        />

        {/* Failed Tests Details */}
        {testResults.summary.failed > 0 && (
          <Alert
            message="Failed Tests"
            description={
              <List
                size="small"
                dataSource={testResults.results.filter((r) => !r.passed)}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical">
                      <Text strong>{item.imageId}</Text>
                      <Text type="secondary">
                        Expected {item.expectedDetections.length} detections, got {item.detections.length}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            }
            type="error"
            style={{ marginTop: 16 }}
          />
        )}
      </div>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <ExperimentOutlined />
          <span>Run Smoke Test</span>
          <Tag>{model.name} v{model.version}</Tag>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="run"
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={handleRunTest}
          loading={isRunning}
          disabled={!selectedConfig && customImages.length === 0}
        >
          Run Test
        </Button>,
      ]}
    >
      {!testResults ? (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Configuration Selection */}
          <Card title="Test Configuration" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select
                style={{ width: '100%' }}
                placeholder="Select a predefined test configuration"
                value={selectedConfig}
                onChange={setSelectedConfig}
                allowClear
              >
                {configurations.map((config) => (
                  <Option key={config.id} value={config.id}>
                    {config.name} ({config.referenceImages.length} images)
                  </Option>
                ))}
              </Select>

              {selectedConfig && (
                <Alert
                  message="Configuration Details"
                  description={
                    <Space direction="vertical">
                      <Text>
                        Images: {configurations.find((c) => c.id === selectedConfig)?.referenceImages.length}
                      </Text>
                      <Text>
                        Pass Threshold: {((configurations.find((c) => c.id === selectedConfig)?.passThreshold || 0) * 100).toFixed(0)}%
                      </Text>
                    </Space>
                  }
                  type="info"
                />
              )}
            </Space>
          </Card>

          <Divider>OR</Divider>

          {/* Custom Image Upload */}
          <Card title="Upload Custom Test Images" size="small">
            <Dragger
              multiple
              accept="image/*"
              fileList={customImages}
              onChange={handleUpload}
              beforeUpload={() => false} // Prevent auto upload
              maxCount={5}
            >
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined />
              </p>
              <p className="ant-upload-text">
                Click or drag images to test
              </p>
              <p className="ant-upload-hint">
                Support for up to 5 images. Images should contain logos for detection.
              </p>
            </Dragger>

            {customImages.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">
                  {customImages.length} image(s) selected for testing
                </Text>
              </div>
            )}
          </Card>

          {/* Model Info */}
          <Alert
            message="Model Information"
            description={
              <Space direction="vertical">
                <Text>Model: {model.name} v{model.version}</Text>
                <Text>Accuracy: {(model.metrics.accuracy * 100).toFixed(1)}%</Text>
                <Text>Categories: {model.metadata.categories.join(', ')}</Text>
              </Space>
            }
            type="info"
            icon={<FileImageOutlined />}
          />
        </Space>
      ) : (
        renderTestResults()
      )}
    </Modal>
  );
};

export default SmokeTestRunner;