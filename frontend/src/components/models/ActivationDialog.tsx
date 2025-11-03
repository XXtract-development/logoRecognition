// Model Activation Dialog Component (US-015)
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Alert,
  Space,
  Typography,
  Divider,
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Checkbox,
  Button,
  Progress,
  List,
  message,
} from 'antd';
import {
  RocketOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { ModelVersion } from '../../types/models';
import useModelRegistryStore from '../../store/modelRegistryStore';
import modelRegistryService from '../../services/models/ModelRegistryService';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface ActivationDialogProps {
  model: ModelVersion;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ActivationDialog: React.FC<ActivationDialogProps> = ({
  model,
  visible,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [smokeTestStatus, setSmokeTestStatus] = useState<'pending' | 'running' | 'passed' | 'failed'>('pending');
  const [smokeTestResults, setSmokeTestResults] = useState<any>(null);
  const [currentActiveModel, setCurrentActiveModel] = useState<ModelVersion | null>(null);

  const { activateModel, getActiveModel, runSmokeTest } = useModelRegistryStore();

  // Load current active model
  useEffect(() => {
    if (visible) {
      const activeModel = getActiveModel();
      setCurrentActiveModel(activeModel || null);
      setSmokeTestStatus('pending');
      setSmokeTestResults(null);
    }
  }, [visible]);

  // Run smoke test
  const handleRunSmokeTest = async () => {
    setSmokeTestStatus('running');
    try {
      const result = await runSmokeTest(model.id);
      setSmokeTestResults(result);
      setSmokeTestStatus(result.status === 'passed' ? 'passed' : 'failed');

      if (result.status === 'passed') {
        message.success('Smoke test passed successfully!');
      } else {
        message.error('Smoke test failed. Please review the results.');
      }
    } catch (error) {
      setSmokeTestStatus('failed');
      message.error('Failed to run smoke test');
    }
  };

  // Handle activation
  const handleActivate = async (values: any) => {
    // Validate release notes are not empty
    if (!values.releaseNotes?.trim()) {
      message.error('Release notes are required for model activation');
      return;
    }

    // Check if model metrics meet minimum thresholds
    const MIN_ACCURACY_THRESHOLD = 0.85; // 85% minimum accuracy
    if (model.metrics.accuracy < MIN_ACCURACY_THRESHOLD) {
      Modal.confirm({
        title: 'Low Accuracy Warning',
        content: `This model has accuracy of ${(model.metrics.accuracy * 100).toFixed(1)}% which is below the recommended threshold of ${MIN_ACCURACY_THRESHOLD * 100}%. Are you sure you want to activate it?`,
        okText: 'Yes, Continue',
        okType: 'danger',
        cancelText: 'Cancel',
        onOk: () => {
          if (smokeTestStatus !== 'passed') {
            confirmSmokeTestBypass(values);
          } else {
            performActivation(values);
          }
        },
      });
      return;
    }

    if (smokeTestStatus !== 'passed') {
      confirmSmokeTestBypass(values);
    } else {
      performActivation(values);
    }
  };

  const confirmSmokeTestBypass = (values: any) => {
    Modal.confirm({
      title: 'Smoke Test Not Passed',
      content: 'The smoke test has not passed. Activating without passing smoke tests may cause production issues. Are you sure you want to continue?',
      okText: 'Yes, Continue at Risk',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => performActivation(values),
    });
  };

  const performActivation = async (values: any) => {
    setLoading(true);
    try {
      // Add audit log entry
      const activationData = {
        modelId: model.id,
        modelVersion: model.version,
        previousModelId: currentActiveModel?.id,
        releaseNotes: values.releaseNotes.trim(),
        smokeTestPassed: smokeTestStatus === 'passed',
        notifyTeam: values.notifyTeam,
        createRollbackPoint: values.createRollbackPoint,
        timestamp: new Date().toISOString(),
      };

      // Log activation attempt
      console.log('Activation attempt:', activationData);

      await activateModel(model.id, values.releaseNotes.trim());

      message.success({
        content: 'Model activated successfully! The new model is now serving recognition requests.',
        duration: 5,
      });

      if (values.notifyTeam) {
        // Send notifications (would be handled by backend)
        console.log('Sending team notifications...');
      }

      onSuccess();
      form.resetFields();
    } catch (error: any) {
      // Log error for debugging
      console.error('Model activation failed:', error);

      message.error({
        content: `Failed to activate model: ${error.message || 'Unknown error occurred'}`,
        duration: 5,
      });

      // Offer rollback suggestion if activation failed
      if (currentActiveModel) {
        Modal.info({
          title: 'Rollback Available',
          content: `You can rollback to the previous model (${currentActiveModel.name} v${currentActiveModel.version}) if needed.`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate improvements
  const calculateImprovement = (newValue: number, oldValue: number) => {
    // Handle division by zero
    if (oldValue === 0) {
      return {
        value: newValue,
        percentage: 'N/A',
        improved: newValue > 0,
      };
    }

    const diff = newValue - oldValue;
    const percentage = ((diff / oldValue) * 100).toFixed(1);
    return {
      value: diff,
      percentage,
      improved: diff > 0,
    };
  };

  const improvements = currentActiveModel ? {
    accuracy: calculateImprovement(model.metrics.accuracy, currentActiveModel.metrics.accuracy),
    precision: calculateImprovement(model.metrics.precision, currentActiveModel.metrics.precision),
    recall: calculateImprovement(model.metrics.recall, currentActiveModel.metrics.recall),
    f1Score: calculateImprovement(model.metrics.f1Score, currentActiveModel.metrics.f1Score),
  } : null;

  return (
    <Modal
      title={
        <Space>
          <RocketOutlined />
          <span>Promote Model to Active</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={700}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="activate"
          type="primary"
          icon={<RocketOutlined />}
          loading={loading}
          disabled={smokeTestStatus === 'running'}
          onClick={() => form.submit()}
        >
          Activate Model
        </Button>,
      ]}
    >
      <Alert
        message="Impact Warning"
        description="This will affect all recognition operations immediately. The new model will start serving requests as soon as activation is complete."
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        style={{ marginBottom: 16 }}
      />

      {/* Current vs New Model Comparison */}
      {currentActiveModel && (
        <Card title="Model Comparison" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Card type="inner" title="Current Active Model" size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Version: {currentActiveModel.name} v{currentActiveModel.version}</Text>
                  <Text>Accuracy: {(currentActiveModel.metrics.accuracy * 100).toFixed(1)}%</Text>
                  <Text>Active Since: {new Date(currentActiveModel.promotedAt!).toLocaleDateString()}</Text>
                </Space>
              </Card>
            </Col>
            <Col span={12}>
              <Card type="inner" title="New Model (Candidate)" size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Version: {model.name} v{model.version}</Text>
                  <Text>Accuracy: {(model.metrics.accuracy * 100).toFixed(1)}%</Text>
                  <Text>Created: {new Date(model.createdAt).toLocaleDateString()}</Text>
                </Space>
              </Card>
            </Col>
          </Row>

          {improvements && (
            <div style={{ marginTop: 16 }}>
              <Text strong>Improvements:</Text>
              <List
                size="small"
                dataSource={[
                  {
                    metric: 'Accuracy',
                    ...improvements.accuracy,
                  },
                  {
                    metric: 'Precision',
                    ...improvements.precision,
                  },
                  {
                    metric: 'Recall',
                    ...improvements.recall,
                  },
                  {
                    metric: 'F1 Score',
                    ...improvements.f1Score,
                  },
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <Space>
                      {item.improved ? (
                        <ArrowUpOutlined style={{ color: '#52c41a' }} />
                      ) : (
                        <ArrowDownOutlined style={{ color: '#ff4d4f' }} />
                      )}
                      <Text>{item.metric}:</Text>
                      <Text type={item.improved ? 'success' : 'danger'}>
                        {item.improved ? '+' : ''}{item.percentage}%
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          )}
        </Card>
      )}

      {/* Smoke Test Section */}
      <Card title="Smoke Test" size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Text>Status:</Text>
            {smokeTestStatus === 'pending' && <Tag>Not Run</Tag>}
            {smokeTestStatus === 'running' && <Tag color="processing" icon={<LoadingOutlined />}>Running...</Tag>}
            {smokeTestStatus === 'passed' && <Tag color="success" icon={<CheckCircleOutlined />}>Passed</Tag>}
            {smokeTestStatus === 'failed' && <Tag color="error">Failed</Tag>}
          </Space>

          {smokeTestStatus === 'pending' && (
            <Button onClick={handleRunSmokeTest} type="dashed">
              Run Smoke Test Now
            </Button>
          )}

          {smokeTestResults && (
            <Card type="inner" size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Tests Run: {smokeTestResults.summary?.totalTests || 0}</Text>
                <Text type="success">Passed: {smokeTestResults.summary?.passed || 0}</Text>
                <Text type="danger">Failed: {smokeTestResults.summary?.failed || 0}</Text>
                <Progress
                  percent={
                    smokeTestResults.summary
                      ? (smokeTestResults.summary.passed / smokeTestResults.summary.totalTests) * 100
                      : 0
                  }
                  status={smokeTestStatus === 'passed' ? 'success' : 'exception'}
                />
              </Space>
            </Card>
          )}
        </Space>
      </Card>

      {/* Activation Form */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleActivate}
        initialValues={{
          notifyTeam: true,
          createRollbackPoint: true,
        }}
      >
        <Form.Item
          name="releaseNotes"
          label="Release Notes"
          rules={[
            { required: true, message: 'Please provide release notes' },
            { min: 10, message: 'Release notes should be at least 10 characters' },
          ]}
        >
          <TextArea
            rows={4}
            placeholder="Describe what improvements this model brings and any important changes..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item name="notifyTeam" valuePropName="checked">
          <Checkbox>Send notification to team</Checkbox>
        </Form.Item>

        <Form.Item name="createRollbackPoint" valuePropName="checked">
          <Checkbox>Create automatic rollback point</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ActivationDialog;