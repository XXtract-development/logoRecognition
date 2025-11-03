// Model Registry Table Component (US-015)
import React, { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Button,
  Space,
  Select,
  InputNumber,
  Card,
  Row,
  Col,
  Typography,
  Tooltip,
  Badge,
  Dropdown,
  Modal,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  DownloadOutlined,
  RocketOutlined,
  EyeOutlined,
  MoreOutlined,
  FilterOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ModelVersion, ModelFilters } from '../../types/models';
import useModelRegistryStore from '../../store/modelRegistryStore';
import ModelDetailDrawer from './ModelDetailDrawer';
import ActivationDialog from './ActivationDialog';
import SmokeTestRunner from './SmokeTestRunner';

const { Text, Title } = Typography;
const { Option } = Select;

const ModelRegistryTable: React.FC = () => {
  const {
    models,
    activeModelId,
    isLoadingModels,
    filters,
    fetchModels,
    setFilter,
    clearFilters,
    getFilteredModels,
    deprecateModel,
    downloadModelArtifacts,
    exportModelHistory,
  } = useModelRegistryStore();

  const [selectedModel, setSelectedModel] = useState<ModelVersion | null>(null);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [activationDialogVisible, setActivationDialogVisible] = useState(false);
  const [smokeTestVisible, setSmokeTestVisible] = useState(false);

  // Load models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  // Get unique dataset versions for filter
  const datasetVersions = Array.from(new Set(models.map((m) => m.datasetVersionId)));

  // Handle model actions
  const handleViewDetails = (model: ModelVersion) => {
    setSelectedModel(model);
    setDetailDrawerVisible(true);
  };

  const handlePromoteModel = (model: ModelVersion) => {
    setSelectedModel(model);
    setActivationDialogVisible(true);
  };

  const handleRunSmokeTest = (model: ModelVersion) => {
    setSelectedModel(model);
    setSmokeTestVisible(true);
  };

  const handleDeprecateModel = async (model: ModelVersion) => {
    Modal.confirm({
      title: 'Deprecate Model',
      content: `Are you sure you want to deprecate model ${model.name} v${model.version}?`,
      okText: 'Yes, Deprecate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deprecateModel(model.id, 'Manual deprecation');
          message.success('Model deprecated successfully');
          fetchModels(); // Refresh list
        } catch (error: any) {
          message.error('Failed to deprecate model');
        }
      },
    });
  };

  const handleDownloadModel = async (model: ModelVersion) => {
    try {
      await downloadModelArtifacts(model.id);
      message.success('Download started');
    } catch (error) {
      message.error('Failed to download model');
    }
  };

  // Get status badge
  const getStatusBadge = (status: ModelVersion['status']) => {
    const statusConfig = {
      candidate: { color: 'processing', text: 'Candidate', icon: <ExperimentOutlined /> },
      active: { color: 'success', text: 'Active', icon: <CheckCircleOutlined /> },
      deprecated: { color: 'default', text: 'Deprecated', icon: null },
      failed: { color: 'error', text: 'Failed', icon: <CloseCircleOutlined /> },
    };

    const config = statusConfig[status];
    return (
      <Badge status={config.color as any} text={
        <Space>
          {config.icon}
          {config.text}
        </Space>
      } />
    );
  };

  // Table columns
  const columns: ColumnsType<ModelVersion> = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: ModelVersion['status'], record) => (
        <Space direction="vertical" size="small">
          {getStatusBadge(status)}
          {record.id === activeModelId && (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              ACTIVE
            </Tag>
          )}
        </Space>
      ),
      filters: [
        { text: 'Candidate', value: 'candidate' },
        { text: 'Active', value: 'active' },
        { text: 'Deprecated', value: 'deprecated' },
        { text: 'Failed', value: 'failed' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Version',
      key: 'version',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Text strong>{record.name}</Text>
          <Text type="secondary">v{record.version}</Text>
        </Space>
      ),
      sorter: (a, b) => a.version.localeCompare(b.version),
    },
    {
      title: 'Dataset',
      dataIndex: 'datasetVersionId',
      key: 'dataset',
      width: 120,
      render: (datasetId: string) => (
        <Tooltip title={`Dataset version: ${datasetId}`}>
          <Tag>{datasetId.substring(0, 8)}...</Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Accuracy',
      dataIndex: ['metrics', 'accuracy'],
      key: 'accuracy',
      width: 100,
      render: (accuracy: number) => (
        <Text strong style={{ color: accuracy >= 0.95 ? '#52c41a' : accuracy >= 0.9 ? '#faad14' : '#ff4d4f' }}>
          {(accuracy * 100).toFixed(1)}%
        </Text>
      ),
      sorter: (a, b) => a.metrics.accuracy - b.metrics.accuracy,
    },
    {
      title: 'Precision',
      dataIndex: ['metrics', 'precision'],
      key: 'precision',
      width: 100,
      render: (precision: number) => (
        <Text>{(precision * 100).toFixed(1)}%</Text>
      ),
    },
    {
      title: 'Recall',
      dataIndex: ['metrics', 'recall'],
      key: 'recall',
      width: 100,
      render: (recall: number) => (
        <Text>{(recall * 100).toFixed(1)}%</Text>
      ),
    },
    {
      title: 'F1 Score',
      dataIndex: ['metrics', 'f1Score'],
      key: 'f1Score',
      width: 100,
      render: (f1: number) => (
        <Text>{(f1 * 100).toFixed(1)}%</Text>
      ),
    },
    {
      title: 'Job ID',
      dataIndex: 'trainingJobId',
      key: 'jobId',
      width: 120,
      render: (jobId: string) => (
        <Tooltip title={`Training job: ${jobId}`}>
          <Text copyable={{ text: jobId }}>
            {jobId.substring(0, 8)}...
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString(),
      sorter: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const actions = [
          {
            key: 'view',
            label: 'View Details',
            icon: <EyeOutlined />,
            onClick: () => handleViewDetails(record),
          },
          {
            key: 'smoke-test',
            label: 'Run Smoke Test',
            icon: <ExperimentOutlined />,
            onClick: () => handleRunSmokeTest(record),
            disabled: record.status === 'deprecated' || record.status === 'failed',
          },
          {
            key: 'promote',
            label: 'Promote to Active',
            icon: <RocketOutlined />,
            onClick: () => handlePromoteModel(record),
            disabled: record.status !== 'candidate',
          },
          {
            key: 'download',
            label: 'Download Model',
            icon: <DownloadOutlined />,
            onClick: () => handleDownloadModel(record),
          },
          {
            key: 'deprecate',
            label: 'Deprecate',
            danger: true,
            onClick: () => handleDeprecateModel(record),
            disabled: record.status === 'deprecated' || record.status === 'failed',
          },
        ];

        return (
          <Dropdown
            menu={{ items: actions }}
            trigger={['click']}
          >
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <>
      <Card
        title={
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={4} style={{ margin: 0 }}>Model Registry</Title>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => fetchModels()}
                  loading={isLoadingModels}
                >
                  Refresh
                </Button>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'csv',
                        label: 'Export as CSV',
                        icon: <ExportOutlined />,
                        onClick: () => exportModelHistory('csv'),
                      },
                      {
                        key: 'json',
                        label: 'Export as JSON',
                        icon: <ExportOutlined />,
                        onClick: () => exportModelHistory('json'),
                      },
                    ],
                  }}
                >
                  <Button icon={<ExportOutlined />}>Export</Button>
                </Dropdown>
              </Space>
            </Col>
          </Row>
        }
        bordered={false}
      >
        {/* Filters */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Select
              style={{ width: '100%' }}
              placeholder="Filter by Status"
              allowClear
              value={filters.status === 'all' ? undefined : filters.status}
              onChange={(value) => setFilter({ status: value || 'all' })}
            >
              <Option value="candidate">Candidate</Option>
              <Option value="active">Active</Option>
              <Option value="deprecated">Deprecated</Option>
              <Option value="failed">Failed</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Select
              style={{ width: '100%' }}
              placeholder="Filter by Dataset"
              allowClear
              value={filters.datasetVersion}
              onChange={(value) => setFilter({ datasetVersion: value })}
            >
              {datasetVersions.map((version) => (
                <Option key={version} value={version}>
                  {version}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="Min Accuracy (%)"
              min={0}
              max={100}
              value={filters.minAccuracy ? filters.minAccuracy * 100 : undefined}
              onChange={(value) => setFilter({ minAccuracy: value ? value / 100 : null })}
              formatter={(value) => `${value}%`}
              parser={(value) => parseFloat(value!.replace('%', ''))}
            />
          </Col>
          <Col span={6}>
            <Button onClick={clearFilters} icon={<FilterOutlined />}>
              Clear Filters
            </Button>
          </Col>
        </Row>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={getFilteredModels()}
          rowKey="id"
          loading={isLoadingModels}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} models`,
          }}
          scroll={{ x: 1500 }}
        />
      </Card>

      {/* Detail Drawer */}
      {selectedModel && (
        <ModelDetailDrawer
          model={selectedModel}
          visible={detailDrawerVisible}
          onClose={() => {
            setDetailDrawerVisible(false);
            setSelectedModel(null);
          }}
          onPromote={() => {
            setDetailDrawerVisible(false);
            setActivationDialogVisible(true);
          }}
          onRunSmokeTest={() => {
            setDetailDrawerVisible(false);
            setSmokeTestVisible(true);
          }}
        />
      )}

      {/* Activation Dialog */}
      {selectedModel && (
        <ActivationDialog
          model={selectedModel}
          visible={activationDialogVisible}
          onClose={() => {
            setActivationDialogVisible(false);
            setSelectedModel(null);
          }}
          onSuccess={() => {
            setActivationDialogVisible(false);
            setSelectedModel(null);
            fetchModels();
          }}
        />
      )}

      {/* Smoke Test Runner */}
      {selectedModel && (
        <SmokeTestRunner
          model={selectedModel}
          visible={smokeTestVisible}
          onClose={() => {
            setSmokeTestVisible(false);
            setSelectedModel(null);
          }}
        />
      )}
    </>
  );
};

export default ModelRegistryTable;