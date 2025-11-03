// Model Detail Drawer Component (US-015)
import React from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Button,
  Space,
  Tabs,
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Table,
  Alert,
  Timeline,
  Badge,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  ExperimentOutlined,
  DownloadOutlined,
  FileTextOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { ModelVersion } from '../../types/models';
import ModelMetricsChart from './ModelMetricsChart';
import ModelComparison from './ModelComparison';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

interface ModelDetailDrawerProps {
  model: ModelVersion;
  visible: boolean;
  onClose: () => void;
  onPromote?: () => void;
  onRunSmokeTest?: () => void;
}

const ModelDetailDrawer: React.FC<ModelDetailDrawerProps> = ({
  model,
  visible,
  onClose,
  onPromote,
  onRunSmokeTest,
}) => {
  // Get status color
  const getStatusColor = (status: ModelVersion['status']) => {
    const colors = {
      candidate: 'processing',
      active: 'success',
      deprecated: 'default',
      failed: 'error',
    };
    return colors[status] || 'default';
  };

  // Format confusion matrix
  const renderConfusionMatrix = () => {
    if (!model.metrics.confusionMatrix || model.metrics.confusionMatrix.length === 0) {
      return <Text type="secondary">No confusion matrix data available</Text>;
    }

    const categories = model.metadata.categories;
    const matrix = model.metrics.confusionMatrix;

    const columns = [
      {
        title: 'Actual \\ Predicted',
        dataIndex: 'actual',
        key: 'actual',
        fixed: 'left' as const,
        width: 150,
        render: (text: string) => <Text strong>{text}</Text>,
      },
      ...categories.map((cat, index) => ({
        title: cat,
        dataIndex: `pred_${index}`,
        key: `pred_${index}`,
        width: 100,
        align: 'center' as const,
        render: (value: number) => {
          const total = matrix[index].reduce((a, b) => a + b, 0);
          const percentage = total > 0 ? (value / total) * 100 : 0;
          return (
            <span
              style={{
                backgroundColor: percentage > 80 ? '#f6ffed' : percentage > 50 ? '#fff7e6' : '#fff2f0',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              {value}
            </span>
          );
        },
      })),
    ];

    const dataSource = categories.map((cat, rowIndex) => {
      const row: any = {
        key: rowIndex,
        actual: cat,
      };
      categories.forEach((_, colIndex) => {
        row[`pred_${colIndex}`] = matrix[rowIndex][colIndex];
      });
      return row;
    });

    return (
      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
        scroll={{ x: categories.length * 100 + 150 }}
      />
    );
  };

  // Per-category metrics table
  const renderPerCategoryMetrics = () => {
    const data = Object.entries(model.metrics.perCategoryMetrics).map(([category, metrics]) => ({
      category,
      ...metrics,
    }));

    const columns = [
      {
        title: 'Category',
        dataIndex: 'category',
        key: 'category',
        render: (text: string) => <Tag>{text}</Tag>,
      },
      {
        title: 'Accuracy',
        dataIndex: 'accuracy',
        key: 'accuracy',
        render: (value: number) => `${(value * 100).toFixed(2)}%`,
        sorter: (a: any, b: any) => a.accuracy - b.accuracy,
      },
      {
        title: 'Precision',
        dataIndex: 'precision',
        key: 'precision',
        render: (value: number) => `${(value * 100).toFixed(2)}%`,
        sorter: (a: any, b: any) => a.precision - b.precision,
      },
      {
        title: 'Recall',
        dataIndex: 'recall',
        key: 'recall',
        render: (value: number) => `${(value * 100).toFixed(2)}%`,
        sorter: (a: any, b: any) => a.recall - b.recall,
      },
    ];

    return (
      <Table
        columns={columns}
        dataSource={data}
        pagination={false}
        size="small"
      />
    );
  };

  return (
    <Drawer
      title={
        <Space>
          <Text>Model:</Text>
          <Text strong>{model.name}</Text>
          <Tag>v{model.version}</Tag>
          <Badge status={getStatusColor(model.status) as any} text={model.status.toUpperCase()} />
        </Space>
      }
      width={800}
      open={visible}
      onClose={onClose}
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Close</Button>
          {model.status === 'candidate' && (
            <>
              <Button icon={<ExperimentOutlined />} onClick={onRunSmokeTest}>
                Run Smoke Test
              </Button>
              <Button type="primary" icon={<RocketOutlined />} onClick={onPromote}>
                Promote to Active
              </Button>
            </>
          )}
        </Space>
      }
    >
      <Tabs defaultActiveKey="overview">
        <TabPane
          tab={
            <Space>
              <FileTextOutlined />
              Overview
            </Space>
          }
          key="overview"
        >
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="Model ID" span={2}>
              <Text copyable>{model.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Badge status={getStatusColor(model.status) as any} text={model.status.toUpperCase()} />
            </Descriptions.Item>
            <Descriptions.Item label="Format">
              <Tag>{model.format.toUpperCase()}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Training Job ID" span={2}>
              <Text copyable>{model.trainingJobId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Dataset Version" span={2}>
              <Text copyable>{model.datasetVersionId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Created At">
              {new Date(model.createdAt).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Created By">
              {model.createdBy}
            </Descriptions.Item>
            {model.promotedAt && (
              <>
                <Descriptions.Item label="Promoted At">
                  {new Date(model.promotedAt).toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Promoted By">
                  {model.promotedBy}
                </Descriptions.Item>
              </>
            )}
            {model.deprecatedAt && (
              <>
                <Descriptions.Item label="Deprecated At">
                  {new Date(model.deprecatedAt).toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Deprecation Reason">
                  {model.deprecatedReason}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>

          <Card title="Model Configuration" style={{ marginTop: 16 }} size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Categories" span={2}>
                <Space wrap>
                  {model.metadata.categories.map((cat) => (
                    <Tag key={cat}>{cat}</Tag>
                  ))}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Input Shape">
                {model.metadata.inputShape.join(' × ')}
              </Descriptions.Item>
              <Descriptions.Item label="Normalization">
                <Tag>{model.metadata.preprocessingConfig.normalization}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Resize Mode">
                <Tag>{model.metadata.preprocessingConfig.resizeMode}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Support">
                {model.metrics.support} samples
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Artifacts" style={{ marginTop: 16 }} size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                icon={<DownloadOutlined />}
                block
                onClick={() => window.open(model.modelPath, '_blank')}
              >
                Download Model File
              </Button>
              <Button
                icon={<DownloadOutlined />}
                block
                onClick={() => window.open(model.embeddingsPath, '_blank')}
              >
                Download Embeddings
              </Button>
            </Space>
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <BarChartOutlined />
              Performance
            </Space>
          }
          key="performance"
        >
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card bordered={false}>
                <Statistic
                  title="Accuracy"
                  value={model.metrics.accuracy * 100}
                  precision={2}
                  suffix="%"
                  valueStyle={{
                    color: model.metrics.accuracy >= 0.95 ? '#52c41a' : model.metrics.accuracy >= 0.9 ? '#faad14' : '#ff4d4f',
                  }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card bordered={false}>
                <Statistic
                  title="F1 Score"
                  value={model.metrics.f1Score * 100}
                  precision={2}
                  suffix="%"
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card bordered={false}>
                <Statistic
                  title="Precision"
                  value={model.metrics.precision * 100}
                  precision={2}
                  suffix="%"
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card bordered={false}>
                <Statistic
                  title="Recall"
                  value={model.metrics.recall * 100}
                  precision={2}
                  suffix="%"
                />
              </Card>
            </Col>
          </Row>

          <Card title="Per Category Performance" style={{ marginTop: 16 }} size="small">
            {renderPerCategoryMetrics()}
          </Card>

          <Card title="Confusion Matrix" style={{ marginTop: 16 }} size="small">
            {renderConfusionMatrix()}
          </Card>
        </TabPane>

        <TabPane
          tab={
            <Space>
              <ThunderboltOutlined />
              Comparison
            </Space>
          }
          key="comparison"
        >
          <ModelComparison currentModel={model} />
        </TabPane>
      </Tabs>
    </Drawer>
  );
};

export default ModelDetailDrawer;