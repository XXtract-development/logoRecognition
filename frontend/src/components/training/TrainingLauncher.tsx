// Training Launcher Modal Component (US-014)
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Button,
  Alert,
  Space,
  Typography,
  Divider,
  Tag,
  Tooltip,
} from 'antd';
import {
  RocketOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { TrainingJobRequest, DatasetVersion } from '../../types/training';
import useTrainingJobsStore from '../../store/trainingJobsStore';
import trainingJobService from '../../services/training/TrainingJobService';

const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface TrainingLauncherProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (jobId: string) => void;
  preselectedDataset?: string;
}

const TrainingLauncher: React.FC<TrainingLauncherProps> = ({
  visible,
  onClose,
  onSuccess,
  preselectedDataset,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<DatasetVersion | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number>(0);
  const [gpuRequired, setGpuRequired] = useState<string>('');

  const { startJob } = useTrainingJobsStore();

  // Load available datasets on mount
  useEffect(() => {
    loadDatasets();
  }, []);

  // Pre-select dataset if provided
  useEffect(() => {
    if (preselectedDataset && datasets.length > 0) {
      const dataset = datasets.find((d) => d.id === preselectedDataset);
      if (dataset) {
        form.setFieldsValue({ datasetVersionId: dataset.id });
        setSelectedDataset(dataset);
      }
    }
  }, [preselectedDataset, datasets, form]);

  const loadDatasets = async () => {
    try {
      const availableDatasets = await trainingJobService.getAvailableDatasetVersions();
      setDatasets(availableDatasets);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    }
  };

  const handleDatasetChange = (datasetId: string) => {
    const dataset = datasets.find((d) => d.id === datasetId);
    setSelectedDataset(dataset || null);

    // Update estimated duration based on dataset size and augmentation
    if (dataset) {
      const augmentation = form.getFieldValue('augmentationFactor') || 50;
      updateEstimates(dataset, augmentation);
    }
  };

  const handleAugmentationChange = (factor: number) => {
    if (selectedDataset) {
      updateEstimates(selectedDataset, factor);
    }
  };

  const updateEstimates = (dataset: DatasetVersion, augmentation: number) => {
    // Rough estimates based on dataset size and augmentation
    const baseMinutes = Math.ceil(dataset.totalLogos / 10);
    const augmentationMultiplier = augmentation / 25;
    const estimated = Math.ceil(baseMinutes * augmentationMultiplier);
    setEstimatedDuration(estimated);

    // GPU requirements based on augmentation
    if (augmentation <= 25) {
      setGpuRequired('4GB VRAM');
    } else if (augmentation <= 50) {
      setGpuRequired('8GB VRAM');
    } else {
      setGpuRequired('16GB VRAM');
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const request: TrainingJobRequest = {
        datasetVersionId: values.datasetVersionId,
        modelName: values.modelName,
        augmentationFactor: values.augmentationFactor,
        targetCategories: values.targetCategories || selectedDataset?.categories || [],
        notes: values.notes,
        notifications: {
          email: values.emailNotifications || false,
          slackWebhookUrl: values.slackWebhookUrl,
        },
        accuracyThreshold: values.accuracyThreshold || 0.8,
      };

      const jobId = await startJob(request);

      Modal.success({
        title: 'Training Job Started',
        content: `Job ${jobId} has been queued successfully. You will receive notifications about its progress.`,
      });

      onSuccess?.(jobId);
      onClose();
      form.resetFields();
    } catch (error: any) {
      Modal.error({
        title: 'Failed to Start Training',
        content: error.message || 'An error occurred while starting the training job.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <RocketOutlined />
          <span>Start Training</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={650}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<RocketOutlined />}
          loading={loading}
          onClick={() => form.submit()}
        >
          Start Job
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          augmentationFactor: 50,
          emailNotifications: true,
          accuracyThreshold: 0.8,
        }}
      >
        <Form.Item
          name="datasetVersionId"
          label="Dataset Version"
          rules={[{ required: true, message: 'Please select a dataset version' }]}
        >
          <Select
            placeholder="Select a dataset version"
            onChange={handleDatasetChange}
            showSearch
            filterOption={(input, option) =>
              (option?.children as unknown as string).toLowerCase().includes(input.toLowerCase())
            }
          >
            {datasets.map((dataset) => (
              <Option key={dataset.id} value={dataset.id}>
                {dataset.version} - {dataset.totalLogos} logos
                {dataset.status === 'final' && (
                  <Tag color="green" style={{ marginLeft: 8 }}>
                    Final
                  </Tag>
                )}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {selectedDataset && (
          <Alert
            message={
              <Space direction="vertical" size="small">
                <Text>
                  <strong>Dataset Details:</strong>
                </Text>
                <Text>Total Logos: {selectedDataset.totalLogos}</Text>
                <Text>Categories: {selectedDataset.categories.join(', ')}</Text>
              </Space>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          name="modelName"
          label="Model Name"
          rules={[
            { required: true, message: 'Please enter a model name' },
            { pattern: /^[a-z0-9-]+$/, message: 'Use lowercase letters, numbers, and hyphens only' },
          ]}
        >
          <Input placeholder="e.g., retail-brand-v2" />
        </Form.Item>

        <Form.Item
          name="augmentationFactor"
          label={
            <Space>
              Augmentation Factor
              <Tooltip title="Higher values create more training samples but take longer">
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
          }
          rules={[{ required: true }]}
        >
          <Select onChange={handleAugmentationChange}>
            <Option value={10}>10x - Light</Option>
            <Option value={25}>25x - Standard</Option>
            <Option value={50}>50x - Recommended</Option>
            <Option value={75}>75x - Heavy</Option>
            <Option value={100}>100x - Maximum</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="targetCategories"
          label="Target Categories"
          tooltip="Select specific categories to train on, or leave empty for all"
        >
          <Select
            mode="multiple"
            placeholder="Select categories (optional)"
            disabled={!selectedDataset}
          >
            {selectedDataset?.categories.map((category) => (
              <Option key={category} value={category}>
                {category}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="accuracyThreshold"
          label="Minimum Accuracy Threshold"
          tooltip="Training will continue until this accuracy is reached"
        >
          <InputNumber
            min={0.5}
            max={1.0}
            step={0.05}
            style={{ width: '100%' }}
            formatter={(value) => `${(value as number * 100).toFixed(0)}%`}
            parser={(value) => (parseFloat(value!.replace('%', '')) / 100) as any}
          />
        </Form.Item>

        <Form.Item name="notes" label="Notes (Optional)">
          <TextArea
            rows={3}
            placeholder="Add any notes about this training job..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Divider>Notifications</Divider>

        <Form.Item name="emailNotifications" valuePropName="checked">
          <Space>
            <Switch />
            <Text>Send email notifications</Text>
          </Space>
        </Form.Item>

        <Form.Item
          name="slackWebhookUrl"
          label="Slack Webhook URL (Optional)"
          tooltip="Receive notifications in your Slack channel"
        >
          <Input placeholder="https://hooks.slack.com/services/..." />
        </Form.Item>

        {(estimatedDuration > 0 || gpuRequired) && (
          <Alert
            message="Resource Requirements"
            description={
              <Space direction="vertical">
                <Text>
                  <ClockCircleOutlined /> Estimated Duration: {estimatedDuration} minutes
                </Text>
                <Text>
                  <ThunderboltOutlined /> GPU Required: {gpuRequired}
                </Text>
              </Space>
            }
            type="warning"
            showIcon
          />
        )}
      </Form>
    </Modal>
  );
};

export default TrainingLauncher;