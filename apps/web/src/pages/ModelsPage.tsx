/**
 * Models Page
 * Epic 5.4 & 5.5: Model Version Management and Activation
 * View, compare, activate, and manage trained models
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Table,
  Tag,
  Modal,
  Statistic,
  Row,
  Col,
  message,
  Spin,
  Empty,
  Tooltip,
  Popconfirm,
  Alert,
  Tabs,
} from 'antd';
import {
  RocketOutlined,
  DownloadOutlined,
  DeleteOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  StarFilled,
  EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Line } from '@ant-design/plots';
import { useModelStore } from '@/stores/modelStore';
import {
  fetchModels,
  activateModel,
  deactivateModel,
  deleteModel,
  downloadModel,
  compareModels,
} from '@/services/modelService';
import type { ModelVersion, ModelComparison, TrainingMetrics } from '@/types/training.types';

const { Title, Text, Paragraph } = Typography;

const ModelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Store
  const {
    models,
    setModels,
    activeModel,
    setActiveModel,
    isLoadingModels,
    setLoadingModels,
  } = useModelStore();

  // Local state
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [compareModalVisible, setCompareModalVisible] = useState(false);
  const [selectedModelForDetails, setSelectedModelForDetails] = useState<ModelVersion | null>(null);
  const [comparison, setComparison] = useState<ModelComparison | null>(null);
  const [compareModel1, setCompareModel1] = useState<string>('');
  const [compareModel2, setCompareModel2] = useState<string>('');
  const [isActivating, setIsActivating] = useState(false);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      setLoadingModels(true);
      try {
        const modelsData = await fetchModels();
        setModels(modelsData);
        const active = modelsData.find((m) => m.status === 'active');
        if (active) setActiveModel(active);
      } catch (error) {
        message.error(t('models.loadError', 'Failed to load models'));
      } finally {
        setLoadingModels(false);
      }
    };

    loadModels();
  }, [setModels, setActiveModel, setLoadingModels, t]);

  // Handle activate model
  const handleActivate = useCallback(
    async (modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return;

      Modal.confirm({
        title: t('models.confirmActivate', 'Activate Model'),
        content: (
          <div>
            <Paragraph>
              {t('models.activateWarning', 'This will make this model the active model for all recognition requests.')}
            </Paragraph>
            {activeModel && (
              <Alert
                type="warning"
                message={t('models.currentActiveWillDeactivate', 'Current active model will be deactivated')}
                description={`${activeModel.name} (${(activeModel.accuracy * 100).toFixed(1)}% accuracy)`}
              />
            )}
          </div>
        ),
        okText: t('models.activate', 'Activate'),
        onOk: async () => {
          setIsActivating(true);
          try {
            await activateModel(modelId);

            // Update local state
            setModels(
              models.map((m) => ({
                ...m,
                status:
                  m.id === modelId
                    ? 'active' as const
                    : m.status === 'active'
                    ? 'inactive' as const
                    : m.status,
                activatedAt: m.id === modelId ? new Date() : m.activatedAt,
                deactivatedAt: m.status === 'active' && m.id !== modelId ? new Date() : m.deactivatedAt,
              }))
            );
            setActiveModel(model);
            message.success(t('models.activateSuccess', 'Model activated successfully'));
          } catch (error) {
            message.error(t('models.activateError', 'Failed to activate model'));
          } finally {
            setIsActivating(false);
          }
        },
      });
    },
    [models, activeModel, setModels, setActiveModel, t]
  );

  // Handle deactivate model
  const handleDeactivate = useCallback(
    async (modelId: string) => {
      try {
        await deactivateModel(modelId);
        setModels(
          models.map((m) =>
            m.id === modelId
              ? { ...m, status: 'inactive' as const, deactivatedAt: new Date() }
              : m
          )
        );
        if (activeModel?.id === modelId) {
          setActiveModel(null);
        }
        message.success(t('models.deactivateSuccess', 'Model deactivated'));
      } catch (error) {
        message.error(t('models.deactivateError', 'Failed to deactivate model'));
      }
    },
    [models, activeModel, setModels, setActiveModel, t]
  );

  // Handle delete model
  const handleDelete = useCallback(
    async (modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (model?.accuracy && model.accuracy > 0.95) {
        Modal.warning({
          title: t('models.highAccuracyWarning', 'High Accuracy Model'),
          content: t('models.highAccuracyWarningContent', 'This model has >95% accuracy. Are you sure you want to delete it?'),
        });
      }

      try {
        await deleteModel(modelId);
        setModels(models.filter((m) => m.id !== modelId));
        message.success(t('models.deleteSuccess', 'Model deleted'));
      } catch (error) {
        message.error(t('models.deleteError', 'Failed to delete model'));
      }
    },
    [models, setModels, t]
  );

  // Handle download model
  const handleDownload = useCallback(
    async (modelId: string, modelName: string) => {
      try {
        message.loading({ content: t('models.downloading', 'Downloading...'), key: 'download' });
        const blob = await downloadModel(modelId);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${modelName.replace(/\s+/g, '_')}.onnx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        message.success({ content: t('models.downloadSuccess', 'Download started'), key: 'download' });
      } catch (error) {
        message.error({ content: t('models.downloadError', 'Download failed'), key: 'download' });
      }
    },
    [t]
  );

  // Handle compare
  const handleCompare = useCallback(async () => {
    if (!compareModel1 || !compareModel2) {
      message.warning(t('models.selectBothModels', 'Please select two models to compare'));
      return;
    }

    try {
      const result = await compareModels(compareModel1, compareModel2);
      setComparison(result);
    } catch (error) {
      message.error(t('models.compareError', 'Failed to compare models'));
    }
  }, [compareModel1, compareModel2, t]);

  // View model details
  const handleViewDetails = useCallback((model: ModelVersion) => {
    setSelectedModelForDetails(model);
    setDetailsModalVisible(true);
  }, []);

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get status config
  const getStatusConfig = (status: ModelVersion['status']) => {
    switch (status) {
      case 'active':
        return { color: 'success', icon: <CheckCircleOutlined />, text: 'Active' };
      case 'training':
        return { color: 'processing', icon: <LoadingOutlined spin />, text: 'Training' };
      case 'failed':
        return { color: 'error', icon: <ExclamationCircleOutlined />, text: 'Failed' };
      case 'inactive':
      default:
        return { color: 'default', icon: <ClockCircleOutlined />, text: 'Inactive' };
    }
  };

  // Table columns
  const columns = [
    {
      title: '',
      key: 'active',
      width: 40,
      render: (_: unknown, record: ModelVersion) =>
        record.status === 'active' ? (
          <Tooltip title={t('models.activeModel', 'Active Model')}>
            <StarFilled style={{ color: '#faad14' }} />
          </Tooltip>
        ) : null,
    },
    {
      title: t('models.name', 'Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ModelVersion) => (
        <div>
          <div className="font-medium">{name}</div>
          <Text type="secondary" className="text-xs">
            v{record.version} • {new Date(record.createdAt).toLocaleDateString()}
          </Text>
        </div>
      ),
    },
    {
      title: t('models.status', 'Status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ModelVersion['status']) => {
        const config = getStatusConfig(status);
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      },
    },
    {
      title: t('models.accuracy', 'Accuracy'),
      dataIndex: 'accuracy',
      key: 'accuracy',
      width: 100,
      render: (accuracy: number) => (
        <Text
          strong
          style={{ color: accuracy >= 0.95 ? '#52c41a' : accuracy >= 0.9 ? '#faad14' : undefined }}
        >
          {(accuracy * 100).toFixed(1)}%
        </Text>
      ),
    },
    {
      title: t('models.size', 'Size'),
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size: number) => <Text>{formatSize(size)}</Text>,
    },
    {
      title: t('common.actions', 'Actions'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: ModelVersion) => (
        <Space>
          <Tooltip title={t('models.viewDetails', 'View Details')}>
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetails(record)}
            />
          </Tooltip>
          {record.status === 'inactive' && (
            <Tooltip title={t('models.activate', 'Activate')}>
              <Button
                type="text"
                icon={<RocketOutlined />}
                onClick={() => handleActivate(record.id)}
                loading={isActivating}
              />
            </Tooltip>
          )}
          {record.status === 'active' && (
            <Tooltip title={t('models.deactivate', 'Deactivate')}>
              <Button
                type="text"
                icon={<RocketOutlined />}
                onClick={() => handleDeactivate(record.id)}
              />
            </Tooltip>
          )}
          <Tooltip title={t('models.download', 'Download')}>
            <Button
              type="text"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(record.id, record.name)}
            />
          </Tooltip>
          <Popconfirm
            title={t('models.confirmDelete', 'Delete this model?')}
            onConfirm={() => handleDelete(record.id)}
            disabled={record.status === 'active'}
          >
            <Tooltip title={record.status === 'active' ? t('models.cannotDeleteActive', 'Cannot delete active model') : t('common.delete', 'Delete')}>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={record.status === 'active'}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Loss curve data for chart
  const getLossCurveData = (metrics: TrainingMetrics | undefined) => {
    if (!metrics) return [];
    return metrics.trainingLossCurve.map((loss: number, idx: number) => ({
      epoch: idx + 1,
      value: loss,
      type: 'Training',
    })).concat(
      metrics.validationLossCurve.map((loss: number, idx: number) => ({
        epoch: idx + 1,
        value: loss,
        type: 'Validation',
      }))
    );
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-4">
      <div className="max-w-7xl mx-auto">
        <Space direction="vertical" size="large" className="w-full">
          {/* Header */}
          <Card className="shadow-sm">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <Title level={2} className="mb-2">
                  {t('models.title', 'Model Management')}
                </Title>
                <Text type="secondary">
                  {t('models.description', 'View, compare, and manage trained logo detection models')}
                </Text>
              </div>
              <Space>
                <Button
                  icon={<SwapOutlined />}
                  onClick={() => setCompareModalVisible(true)}
                  disabled={models.length < 2}
                >
                  {t('models.compare', 'Compare Models')}
                </Button>
                <Button
                  type="primary"
                  icon={<RocketOutlined />}
                  onClick={() => navigate('/training/pipeline')}
                >
                  {t('models.trainNew', 'Train New Model')}
                </Button>
              </Space>
            </div>

            {/* Active Model Info */}
            {activeModel && (
              <Alert
                className="mt-4"
                message={`${t('models.activeModel', 'Active Model')}: ${activeModel.name}`}
                description={`${t('models.accuracy', 'Accuracy')}: ${(activeModel.accuracy * 100).toFixed(1)}% • ${t('models.activatedOn', 'Activated')}: ${activeModel.activatedAt ? new Date(activeModel.activatedAt).toLocaleDateString() : 'N/A'}`}
                type="success"
                showIcon
                icon={<StarFilled />}
              />
            )}
          </Card>

          {/* Models Table */}
          <Card title={t('models.allModels', 'All Models')} className="shadow-sm">
            {isLoadingModels ? (
              <div className="flex justify-center py-12">
                <Spin size="large" />
              </div>
            ) : models.length === 0 ? (
              <Empty
                description={t('models.noModels', 'No models trained yet')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" icon={<RocketOutlined />} onClick={() => navigate('/training/pipeline')}>
                  {t('models.trainFirst', 'Train First Model')}
                </Button>
              </Empty>
            ) : (
              <Table
                dataSource={models}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                onRow={(record) => ({
                  'data-testid': 'model-row',
                  onClick: () => handleViewDetails(record),
                })}
              />
            )}
          </Card>
        </Space>
      </div>

      {/* Model Details Modal */}
      <Modal
        title={selectedModelForDetails?.name}
        open={detailsModalVisible}
        onCancel={() => {
          setDetailsModalVisible(false);
          setSelectedModelForDetails(null);
        }}
        footer={null}
        width={900}
      >
        {selectedModelForDetails && (
          <Tabs
            items={[
              {
                key: 'overview',
                label: t('models.overview', 'Overview'),
                children: (
                  <div className="space-y-4">
                    <Row gutter={16}>
                      <Col span={6}>
                        <Statistic
                          title={t('models.accuracy', 'Accuracy')}
                          value={selectedModelForDetails.accuracy * 100}
                          precision={1}
                          suffix="%"
                          valueStyle={{ color: selectedModelForDetails.accuracy >= 0.95 ? '#52c41a' : undefined }}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title={t('models.version', 'Version')}
                          value={selectedModelForDetails.version}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title={t('models.size', 'Size')}
                          value={formatSize(selectedModelForDetails.size)}
                        />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title={t('models.status', 'Status')}
                          valueRender={() => {
                            const config = getStatusConfig(selectedModelForDetails.status);
                            return <Tag color={config.color}>{config.text}</Tag>;
                          }}
                        />
                      </Col>
                    </Row>

                    {/* Holdout-evaluation metrics — fixed, protected set (Story 7.2) */}
                    {selectedModelForDetails.holdoutMetrics && (
                      <Card
                        size="small"
                        data-testid="holdout-metrics-panel"
                        title={t('models.holdoutMetrics', 'Holdout metrics')}
                      >
                        <Row gutter={16}>
                          <Col span={6}>
                            <Statistic
                              title={t('models.holdoutAccuracy', 'Holdout accuracy')}
                              value={selectedModelForDetails.holdoutMetrics.accuracy * 100}
                              precision={1}
                              suffix="%"
                            />
                          </Col>
                          <Col span={6}>
                            <Statistic
                              title={t('models.holdoutPrecision', 'Precision')}
                              value={selectedModelForDetails.holdoutMetrics.precision * 100}
                              precision={1}
                              suffix="%"
                            />
                          </Col>
                          <Col span={6}>
                            <Statistic
                              title={t('models.holdoutRecall', 'Recall')}
                              value={selectedModelForDetails.holdoutMetrics.recall * 100}
                              precision={1}
                              suffix="%"
                            />
                          </Col>
                          <Col span={6}>
                            <Statistic
                              title={t('models.holdoutF1', 'F1')}
                              value={selectedModelForDetails.holdoutMetrics.f1 * 100}
                              precision={1}
                              suffix="%"
                            />
                          </Col>
                        </Row>
                        <div className="mt-2 text-sm text-gray-500">
                          {t('models.evaluatedOn', 'Evaluated on')}{' '}
                          {selectedModelForDetails.holdoutMetrics.holdoutSize}{' '}
                          {t('models.items', 'items')}
                        </div>
                      </Card>
                    )}
                  </div>
                ),
              },
              {
                key: 'metrics',
                label: t('models.metrics', 'Metrics'),
                children: selectedModelForDetails.metrics ? (
                  <div className="space-y-4">
                    {/* Category Metrics */}
                    <Card size="small" title={t('models.categoryMetrics', 'Per-Category Metrics')}>
                      <Table
                        size="small"
                        pagination={false}
                        dataSource={selectedModelForDetails.metrics.categoryLabels.map((cat) => ({
                          key: cat,
                          category: cat,
                          precision: selectedModelForDetails.metrics!.precision[cat] || 0,
                          recall: selectedModelForDetails.metrics!.recall[cat] || 0,
                          f1: selectedModelForDetails.metrics!.f1Score[cat] || 0,
                        }))}
                        columns={[
                          { title: 'Category', dataIndex: 'category', key: 'category' },
                          {
                            title: 'Precision',
                            dataIndex: 'precision',
                            key: 'precision',
                            render: (v: number) => `${(v * 100).toFixed(1)}%`,
                          },
                          {
                            title: 'Recall',
                            dataIndex: 'recall',
                            key: 'recall',
                            render: (v: number) => `${(v * 100).toFixed(1)}%`,
                          },
                          {
                            title: 'F1 Score',
                            dataIndex: 'f1',
                            key: 'f1',
                            render: (v: number) => `${(v * 100).toFixed(1)}%`,
                          },
                        ]}
                      />
                    </Card>

                    {/* Loss Curve */}
                    <Card size="small" title={t('models.lossCurve', 'Training Loss Curve')}>
                      <Line
                        data={getLossCurveData(selectedModelForDetails.metrics)}
                        xField="epoch"
                        yField="value"
                        seriesField="type"
                        height={250}
                        color={['#1890ff', '#ff7875']}
                      />
                    </Card>
                  </div>
                ) : (
                  <Empty description={t('models.noMetrics', 'No metrics available')} />
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* Compare Modal */}
      <Modal
        title={t('models.compareModels', 'Compare Models')}
        open={compareModalVisible}
        onOk={handleCompare}
        onCancel={() => {
          setCompareModalVisible(false);
          setComparison(null);
          setCompareModel1('');
          setCompareModel2('');
        }}
        okText={t('models.compare', 'Compare')}
        width={800}
      >
        <div className="space-y-4">
          <Row gutter={16}>
            <Col span={12}>
              <Text strong>{t('models.model1', 'Model 1')}</Text>
              <select
                className="w-full p-2 border rounded mt-1"
                value={compareModel1}
                onChange={(e) => setCompareModel1(e.target.value)}
              >
                <option value="">{t('models.selectModel', 'Select model...')}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({(m.accuracy * 100).toFixed(1)}%)
                  </option>
                ))}
              </select>
            </Col>
            <Col span={12}>
              <Text strong>{t('models.model2', 'Model 2')}</Text>
              <select
                className="w-full p-2 border rounded mt-1"
                value={compareModel2}
                onChange={(e) => setCompareModel2(e.target.value)}
              >
                <option value="">{t('models.selectModel', 'Select model...')}</option>
                {models
                  .filter((m) => m.id !== compareModel1)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({(m.accuracy * 100).toFixed(1)}%)
                    </option>
                  ))}
              </select>
            </Col>
          </Row>

          {comparison && (
            <Card className="mt-4">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title={comparison.model1.name}
                    value={comparison.model1.accuracy * 100}
                    precision={1}
                    suffix="%"
                  />
                </Col>
                <Col span={8} className="text-center">
                  <div className="text-lg font-bold">
                    {comparison.accuracyDiff > 0 ? '+' : ''}
                    {(comparison.accuracyDiff * 100).toFixed(1)}%
                  </div>
                  <Tag color={comparison.accuracyDiff > 0 ? 'green' : comparison.accuracyDiff < 0 ? 'red' : 'default'}>
                    {comparison.recommendation === 'model1'
                      ? `${comparison.model1.name} recommended`
                      : comparison.recommendation === 'model2'
                      ? `${comparison.model2.name} recommended`
                      : 'Equal performance'}
                  </Tag>
                </Col>
                <Col span={8}>
                  <Statistic
                    title={comparison.model2.name}
                    value={comparison.model2.accuracy * 100}
                    precision={1}
                    suffix="%"
                  />
                </Col>
              </Row>
              <Paragraph className="mt-4 text-center text-gray-500">
                {comparison.reason}
              </Paragraph>

              {/* Holdout comparison — both models on the SAME protected set (Story 7.2) */}
              <table
                data-testid="model-comparison-table"
                className="w-full mt-4 text-sm border-collapse"
              >
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{t('models.model', 'Model')}</th>
                    <th className="text-left p-2">{t('models.holdout', 'Holdout')}</th>
                    <th className="text-left p-2">{t('models.holdoutSet', 'Holdout set')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[comparison.model1, comparison.model2].map((m) => (
                    <tr key={m.id} className="border-b">
                      <td className="p-2">{m.name}</td>
                      <td className="p-2">
                        {m.holdoutMetrics
                          ? `${(m.holdoutMetrics.accuracy * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="p-2" data-testid="holdout-set-id">
                        {m.holdoutMetrics
                          ? `${m.holdoutMetrics.holdoutSize} • ${
                              m.holdoutMetrics.holdoutHash ?? '—'
                            }`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ModelsPage;
