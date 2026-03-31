/**
 * Training Pipeline Page
 * Epic 5: Model Training Pipeline
 * Create and monitor training jobs with real-time progress tracking
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Table,
  Tag,
  Progress,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Slider,
  Statistic,
  Row,
  Col,
  message,
  Spin,
  Empty,
  Tooltip,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  StopOutlined,
  EyeOutlined,
  RocketOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
// Line chart used for loss visualization
import { useModelStore } from '@/stores/modelStore';
import { useTrainingStore } from '@/stores/trainingStore';
import {
  fetchTrainingJobs,
  createTrainingJob,
  cancelTrainingJob,
  getTrainingDataSummary,
} from '@/services/modelService';
import { fetchCategories } from '@/services/trainingService';
import type { TrainingJob, TrainingConfig } from '@/types/training.types';

const { Title, Text } = Typography;

const TrainingPipelinePage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Stores
  const {
    trainingJobs,
    setTrainingJobs,
    addTrainingJob,
    isLoadingJobs,
    setLoadingJobs,
  } = useModelStore();

  const { categories, setCategories } = useTrainingStore();

  // Local state
  const [form] = Form.useForm();
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<TrainingJob | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dataSummary, setDataSummary] = useState<{
    totalImages: number;
    annotatedImages: number;
    totalAnnotations: number;
    categoryCounts: Record<string, number>;
    estimatedDuration: number;
  } | null>(null);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoadingJobs(true);
      try {
        const [jobs, cats] = await Promise.all([
          fetchTrainingJobs(),
          fetchCategories(),
        ]);
        setTrainingJobs(jobs);
        setCategories(cats);
      } catch (error) {
        message.error(t('training.loadError', 'Failed to load training jobs'));
      } finally {
        setLoadingJobs(false);
      }
    };

    loadData();
  }, [setTrainingJobs, setCategories, setLoadingJobs, t]);

  // Simulated progress update for demo (development only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const runningJob = trainingJobs.find((j) => j.status === 'running');
    if (!runningJob) return;

    const interval = setInterval(() => {
      setTrainingJobs(
        trainingJobs.map((job) => {
          if (job.status !== 'running') return job;

          const newProgress = { ...job.progress };
          if (newProgress.epoch < newProgress.totalEpochs) {
            newProgress.epoch += 1;
            newProgress.samplesProcessed = Math.min(
              newProgress.totalSamples,
              newProgress.samplesProcessed + Math.floor(newProgress.totalSamples / newProgress.totalEpochs)
            );
            newProgress.loss = Math.max(0.01, newProgress.loss - 0.005 + Math.random() * 0.002);
            newProgress.accuracy = Math.min(0.99, newProgress.accuracy + 0.005 + Math.random() * 0.002);
            newProgress.validationLoss = Math.max(0.02, newProgress.validationLoss - 0.004 + Math.random() * 0.003);
            newProgress.validationAccuracy = Math.min(0.98, newProgress.validationAccuracy + 0.004 + Math.random() * 0.003);
            newProgress.etaSeconds = Math.max(0, (newProgress.totalEpochs - newProgress.epoch) * 36);
          }

          const isComplete = newProgress.epoch >= newProgress.totalEpochs;
          return {
            ...job,
            progress: newProgress,
            status: isComplete ? 'completed' as const : job.status,
            completedAt: isComplete ? new Date() : undefined,
          };
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [trainingJobs, setTrainingJobs]);

  // Handle category selection change for data summary
  const handleCategoryChange = useCallback(
    async (categoryIds: string[]) => {
      if (categoryIds.length === 0) {
        setDataSummary(null);
        return;
      }

      try {
        const summary = await getTrainingDataSummary(categoryIds);
        setDataSummary(summary);
      } catch (error) {
        console.error('Failed to get data summary');
      }
    },
    []
  );

  // Create new training job
  const handleCreateJob = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setIsCreating(true);

      const config: TrainingConfig = {
        name: values.name,
        categoryIds: values.categoryIds,
        epochs: values.epochs,
        batchSize: values.batchSize,
        learningRate: values.learningRate,
        augmentationFactor: values.augmentationFactor,
        validationSplit: values.validationSplit / 100,
        minAnnotationsPerCategory: values.minAnnotations,
      };

      const job = await createTrainingJob(config);
      addTrainingJob(job);

      message.success(t('training.jobCreated', 'Training job created successfully'));
      setCreateModalVisible(false);
      form.resetFields();
      setDataSummary(null);
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    } finally {
      setIsCreating(false);
    }
  }, [form, addTrainingJob, t]);

  // Cancel training job
  const handleCancelJob = useCallback(
    async (jobId: string) => {
      Modal.confirm({
        title: t('training.confirmCancel', 'Cancel Training Job'),
        content: t('training.confirmCancelContent', 'Are you sure you want to cancel this training job? This cannot be undone.'),
        okText: t('common.cancel', 'Cancel Job'),
        okType: 'danger',
        cancelText: t('common.goBack', 'Go Back'),
        onOk: async () => {
          try {
            await cancelTrainingJob(jobId);
            setTrainingJobs(
              trainingJobs.map((job) =>
                job.id === jobId ? { ...job, status: 'cancelled' as const } : job
              )
            );
            message.success(t('training.jobCancelled', 'Training job cancelled'));
          } catch (error) {
            message.error(t('training.cancelError', 'Failed to cancel training job'));
          }
        },
      });
    },
    [trainingJobs, setTrainingJobs, t]
  );

  // View job details
  const handleViewDetails = useCallback((job: TrainingJob) => {
    setSelectedJob(job);
    setDetailsModalVisible(true);
  }, []);

  // Get status color and icon
  const getStatusConfig = (status: TrainingJob['status']) => {
    switch (status) {
      case 'running':
        return { color: 'processing', icon: <LoadingOutlined spin /> };
      case 'completed':
        return { color: 'success', icon: <CheckCircleOutlined /> };
      case 'failed':
        return { color: 'error', icon: <ExclamationCircleOutlined /> };
      case 'cancelled':
        return { color: 'default', icon: <StopOutlined /> };
      case 'queued':
      default:
        return { color: 'warning', icon: <ClockCircleOutlined /> };
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  // Table columns
  const columns = [
    {
      title: t('training.jobName', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: TrainingJob) => (
        <div>
          <div className="font-medium">{name}</div>
          <Text type="secondary" className="text-xs">
            {new Date(record.createdAt).toLocaleString()}
          </Text>
        </div>
      ),
    },
    {
      title: t('training.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: TrainingJob['status']) => {
        const config = getStatusConfig(status);
        return (
          <Tag color={config.color} icon={config.icon}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Tag>
        );
      },
    },
    {
      title: t('training.progress', 'Progress'),
      key: 'progress',
      width: 200,
      render: (_: unknown, record: TrainingJob) => (
        <div>
          <Progress
            percent={Math.round((record.progress.epoch / record.progress.totalEpochs) * 100)}
            size="small"
            status={record.status === 'running' ? 'active' : undefined}
          />
          <Text type="secondary" className="text-xs">
            Epoch {record.progress.epoch}/{record.progress.totalEpochs}
          </Text>
        </div>
      ),
    },
    {
      title: t('training.accuracy', 'Accuracy'),
      key: 'accuracy',
      width: 100,
      render: (_: unknown, record: TrainingJob) => (
        <Text strong style={{ color: record.progress.accuracy > 0.9 ? '#52c41a' : undefined }}>
          {(record.progress.accuracy * 100).toFixed(1)}%
        </Text>
      ),
    },
    {
      title: t('training.eta', 'ETA'),
      key: 'eta',
      width: 100,
      render: (_: unknown, record: TrainingJob) =>
        record.status === 'running' ? (
          <Text>{formatDuration(record.progress.etaSeconds)}</Text>
        ) : record.status === 'completed' ? (
          <Tag color="green">{t('training.complete', 'Complete')}</Tag>
        ) : (
          '-'
        ),
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 150,
      render: (_: unknown, record: TrainingJob) => (
        <Space>
          <Tooltip title={t('training.viewDetails', 'View Details')}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record)}
            />
          </Tooltip>
          {record.status === 'running' && (
            <Tooltip title={t('training.cancelJob', 'Cancel Job')}>
              <Button
                type="text"
                danger
                icon={<StopOutlined />}
                onClick={() => handleCancelJob(record.id)}
              />
            </Tooltip>
          )}
          {record.status === 'completed' && record.modelVersionId && (
            <Tooltip title={t('training.viewModel', 'View Model')}>
              <Button
                type="text"
                icon={<RocketOutlined />}
                onClick={() => navigate(`/models/${record.modelVersionId}`)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  // Running job stats
  const runningJob = trainingJobs.find((j) => j.status === 'running');

  return (
    <div className="min-h-screen bg-neutral-50 p-4">
      <div className="max-w-7xl mx-auto">
        <Space direction="vertical" size="large" className="w-full">
          {/* Header */}
          <Card className="shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <Title level={2} className="mb-2">
                  {t('training.pipeline', 'Training Pipeline')}
                </Title>
                <Text type="secondary">
                  {t('training.pipelineDescription', 'Create and monitor ML training jobs')}
                </Text>
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
                disabled={!!runningJob}
              >
                {t('training.newJob', 'New Training Job')}
              </Button>
            </div>
          </Card>

          {/* Active Training Alert */}
          {runningJob && (
            <Alert
              message={`${t('training.activeTraining', 'Training in Progress')}: ${runningJob.name}`}
              description={
                <div className="mt-2">
                  <Progress
                    percent={Math.round((runningJob.progress.epoch / runningJob.progress.totalEpochs) * 100)}
                    status="active"
                  />
                  <Row gutter={16} className="mt-2">
                    <Col>
                      <Text>
                        {t('training.epoch', 'Epoch')}: {runningJob.progress.epoch}/{runningJob.progress.totalEpochs}
                      </Text>
                    </Col>
                    <Col>
                      <Text>
                        {t('training.accuracy', 'Accuracy')}: {(runningJob.progress.accuracy * 100).toFixed(1)}%
                      </Text>
                    </Col>
                    <Col>
                      <Text>
                        {t('training.loss', 'Loss')}: {runningJob.progress.loss.toFixed(4)}
                      </Text>
                    </Col>
                    <Col>
                      <Text>
                        ETA: {formatDuration(runningJob.progress.etaSeconds)}
                      </Text>
                    </Col>
                  </Row>
                </div>
              }
              type="info"
              showIcon
              icon={<LoadingOutlined spin />}
            />
          )}

          {/* Jobs Table */}
          <Card title={t('training.trainingJobs', 'Training Jobs')} className="shadow-sm">
            {isLoadingJobs ? (
              <div className="flex justify-center py-12">
                <Spin size="large" />
              </div>
            ) : trainingJobs.length === 0 ? (
              <Empty
                description={t('training.noJobs', 'No training jobs yet')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                  {t('training.createFirst', 'Create First Training Job')}
                </Button>
              </Empty>
            ) : (
              <Table
                dataSource={trainingJobs}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 10 }}
              />
            )}
          </Card>
        </Space>
      </div>

      {/* Create Job Modal */}
      <Modal
        title={t('training.createJob', 'Create Training Job')}
        open={createModalVisible}
        onOk={handleCreateJob}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
          setDataSummary(null);
        }}
        okText={t('training.startTraining', 'Start Training')}
        cancelText={t('common.cancel', 'Cancel')}
        confirmLoading={isCreating}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            epochs: 100,
            batchSize: 16,
            learningRate: 0.001,
            augmentationFactor: 50,
            validationSplit: 20,
            minAnnotations: 10,
          }}
        >
          <Form.Item
            name="name"
            label={t('training.jobName', 'Job Name')}
            rules={[{ required: true, message: t('training.nameRequired', 'Name is required') }]}
          >
            <Input placeholder="e.g., Logo Detection v2.1" />
          </Form.Item>

          <Form.Item
            name="categoryIds"
            label={t('training.selectCategories', 'Select Categories')}
            rules={[{ required: true, message: t('training.categoriesRequired', 'Select at least one category') }]}
          >
            <Select
              mode="multiple"
              placeholder={t('training.selectCategories', 'Select categories to include')}
              onChange={handleCategoryChange}
            >
              {categories.map((cat) => (
                <Select.Option key={cat.id} value={cat.id}>
                  <span style={{ color: cat.color }}>●</span> {cat.name} ({cat.imageCount} images)
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {/* Data Summary */}
          {dataSummary && (
            <Card size="small" className="mb-4 bg-blue-50">
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic title={t('training.images', 'Images')} value={dataSummary.totalImages} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('training.annotated', 'Annotated')} value={dataSummary.annotatedImages} />
                </Col>
                <Col span={6}>
                  <Statistic title={t('training.annotations', 'Annotations')} value={dataSummary.totalAnnotations} />
                </Col>
                <Col span={6}>
                  <Statistic
                    title={t('training.estimatedTime', 'Est. Time')}
                    value={formatDuration(dataSummary.estimatedDuration)}
                  />
                </Col>
              </Row>
            </Card>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="epochs"
                label={t('training.epochs', 'Epochs')}
                rules={[{ required: true }]}
              >
                <InputNumber min={10} max={500} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="batchSize"
                label={t('training.batchSize', 'Batch Size')}
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value={8}>8</Select.Option>
                  <Select.Option value={16}>16</Select.Option>
                  <Select.Option value={32}>32</Select.Option>
                  <Select.Option value={64}>64</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="learningRate"
            label={t('training.learningRate', 'Learning Rate')}
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value={0.0001}>0.0001 (Conservative)</Select.Option>
              <Select.Option value={0.0005}>0.0005</Select.Option>
              <Select.Option value={0.001}>0.001 (Default)</Select.Option>
              <Select.Option value={0.005}>0.005</Select.Option>
              <Select.Option value={0.01}>0.01 (Aggressive)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="augmentationFactor"
            label={t('training.augmentation', 'Data Augmentation Factor')}
          >
            <Slider min={0} max={100} marks={{ 0: 'None', 50: 'Medium', 100: 'Heavy' }} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="validationSplit"
                label={t('training.validationSplit', 'Validation Split %')}
              >
                <InputNumber min={10} max={40} style={{ width: '100%' }} addonAfter="%" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="minAnnotations"
                label={t('training.minAnnotations', 'Min. Annotations per Category')}
              >
                <InputNumber min={5} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Job Details Modal */}
      <Modal
        title={selectedJob?.name}
        open={detailsModalVisible}
        onCancel={() => {
          setDetailsModalVisible(false);
          setSelectedJob(null);
        }}
        footer={null}
        width={800}
      >
        {selectedJob && (
          <div className="space-y-4">
            {/* Status and Progress */}
            <Card size="small">
              <Row gutter={16}>
                <Col span={6}>
                  <Statistic
                    title={t('training.status', 'Status')}
                    valueRender={() => {
                      const config = getStatusConfig(selectedJob.status);
                      return (
                        <Tag color={config.color} icon={config.icon}>
                          {selectedJob.status.charAt(0).toUpperCase() + selectedJob.status.slice(1)}
                        </Tag>
                      );
                    }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title={t('training.accuracy', 'Accuracy')}
                    value={selectedJob.progress.accuracy * 100}
                    precision={1}
                    suffix="%"
                    valueStyle={{ color: selectedJob.progress.accuracy > 0.9 ? '#52c41a' : undefined }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title={t('training.loss', 'Loss')}
                    value={selectedJob.progress.loss}
                    precision={4}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title={t('training.epoch', 'Epoch')}
                    value={selectedJob.progress.epoch}
                    suffix={`/ ${selectedJob.progress.totalEpochs}`}
                  />
                </Col>
              </Row>
            </Card>

            {/* Training Config */}
            <Card size="small" title={t('training.configuration', 'Configuration')}>
              <Row gutter={[16, 8]}>
                <Col span={8}>
                  <Text type="secondary">{t('training.epochs', 'Epochs')}:</Text>{' '}
                  <Text strong>{selectedJob.config.epochs}</Text>
                </Col>
                <Col span={8}>
                  <Text type="secondary">{t('training.batchSize', 'Batch Size')}:</Text>{' '}
                  <Text strong>{selectedJob.config.batchSize}</Text>
                </Col>
                <Col span={8}>
                  <Text type="secondary">{t('training.learningRate', 'Learning Rate')}:</Text>{' '}
                  <Text strong>{selectedJob.config.learningRate}</Text>
                </Col>
                <Col span={8}>
                  <Text type="secondary">{t('training.augmentation', 'Augmentation')}:</Text>{' '}
                  <Text strong>{selectedJob.config.augmentationFactor}%</Text>
                </Col>
                <Col span={8}>
                  <Text type="secondary">{t('training.validationSplit', 'Validation')}:</Text>{' '}
                  <Text strong>{selectedJob.config.validationSplit * 100}%</Text>
                </Col>
                <Col span={8}>
                  <Text type="secondary">{t('training.categories', 'Categories')}:</Text>{' '}
                  <Text strong>{selectedJob.config.categoryIds.length}</Text>
                </Col>
              </Row>
            </Card>

            {/* Timestamps */}
            <Card size="small" title={t('training.timeline', 'Timeline')}>
              <Row gutter={16}>
                <Col span={8}>
                  <Text type="secondary">{t('training.created', 'Created')}:</Text>
                  <br />
                  <Text>{new Date(selectedJob.createdAt).toLocaleString()}</Text>
                </Col>
                {selectedJob.startedAt && (
                  <Col span={8}>
                    <Text type="secondary">{t('training.started', 'Started')}:</Text>
                    <br />
                    <Text>{new Date(selectedJob.startedAt).toLocaleString()}</Text>
                  </Col>
                )}
                {selectedJob.completedAt && (
                  <Col span={8}>
                    <Text type="secondary">{t('training.completed', 'Completed')}:</Text>
                    <br />
                    <Text>{new Date(selectedJob.completedAt).toLocaleString()}</Text>
                  </Col>
                )}
              </Row>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TrainingPipelinePage;
