// Model Comparison Component (US-015)
import React, { useState, useEffect } from 'react';
import {
  Select,
  Card,
  Table,
  Space,
  Tag,
  Typography,
  Row,
  Col,
} from 'antd';
import { Column } from '@ant-design/charts';
import { ModelVersion } from '../../types/models';
import useModelRegistryStore from '../../store/modelRegistryStore';

const { Text } = Typography;
const { Option } = Select;

interface ModelComparisonProps {
  currentModel: ModelVersion;
}

const ModelComparison: React.FC<ModelComparisonProps> = ({ currentModel }) => {
  const { models } = useModelRegistryStore();
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<any[]>([]);

  // Initialize with current model
  useEffect(() => {
    setSelectedModels([currentModel.id]);
  }, [currentModel.id]);

  // Update comparison data when models change
  useEffect(() => {
    const data: any[] = [];
    const modelsToCompare = models.filter((m) =>
      selectedModels.includes(m.id) || m.id === currentModel.id
    );

    ['accuracy', 'precision', 'recall', 'f1Score'].forEach((metric) => {
      modelsToCompare.forEach((model) => {
        data.push({
          metric: metric.replace(/([A-Z])/g, ' $1').trim(),
          model: `${model.name} v${model.version}`,
          value: (model.metrics[metric as keyof typeof model.metrics] as number) * 100,
          isCurrent: model.id === currentModel.id,
        });
      });
    });

    setComparisonData(data);
  }, [selectedModels, models, currentModel]);

  // Chart config
  const chartConfig = {
    data: comparisonData,
    xField: 'metric',
    yField: 'value',
    seriesField: 'model',
    isGroup: true,
    columnStyle: {
      radius: [4, 4, 0, 0],
    },
    label: {
      position: 'top' as const,
      formatter: (datum: any) => `${datum.value.toFixed(1)}%`,
      style: {
        fontSize: 10,
      },
    },
    yAxis: {
      label: {
        formatter: (v: string) => `${v}%`,
      },
      max: 100,
    },
    tooltip: {
      formatter: (datum: any) => ({
        name: datum.model,
        value: `${datum.value.toFixed(2)}%`,
      }),
    },
    legend: {
      position: 'top' as const,
    },
  };

  // Comparison table columns
  const tableColumns = [
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      render: (text: string, record: any) => (
        <Space>
          <Text>{text}</Text>
          {record.id === currentModel.id && <Tag color="blue">Current</Tag>}
        </Space>
      ),
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
    {
      title: 'F1 Score',
      dataIndex: 'f1Score',
      key: 'f1Score',
      render: (value: number) => `${(value * 100).toFixed(2)}%`,
      sorter: (a: any, b: any) => a.f1Score - b.f1Score,
    },
  ];

  const tableData = models
    .filter((m) => selectedModels.includes(m.id) || m.id === currentModel.id)
    .map((m) => ({
      key: m.id,
      id: m.id,
      model: `${m.name} v${m.version}`,
      accuracy: m.metrics.accuracy,
      precision: m.metrics.precision,
      recall: m.metrics.recall,
      f1Score: m.metrics.f1Score,
    }));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Model Selection */}
      <Card size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>Select models to compare with {currentModel.name} v{currentModel.version}:</Text>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Select models to compare"
            value={selectedModels.filter((id) => id !== currentModel.id)}
            onChange={(values) => setSelectedModels([currentModel.id, ...values])}
          >
            {models
              .filter((m) => m.id !== currentModel.id)
              .map((model) => (
                <Option key={model.id} value={model.id}>
                  {model.name} v{model.version} - {model.status}
                </Option>
              ))}
          </Select>
        </Space>
      </Card>

      {/* Comparison Chart */}
      {comparisonData.length > 0 && (
        <Card title="Performance Comparison" size="small">
          <Column {...chartConfig} height={300} />
        </Card>
      )}

      {/* Comparison Table */}
      <Card title="Detailed Metrics" size="small">
        <Table
          columns={tableColumns}
          dataSource={tableData}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Per-Category Comparison */}
      {selectedModels.length > 1 && (
        <Card title="Category Performance Comparison" size="small">
          <Row gutter={16}>
            {currentModel.metadata.categories.map((category) => (
              <Col span={12} key={category}>
                <Card type="inner" title={category} size="small" style={{ marginBottom: 16 }}>
                  <Table
                    size="small"
                    pagination={false}
                    columns={[
                      { title: 'Model', dataIndex: 'model', key: 'model' },
                      {
                        title: 'Accuracy',
                        dataIndex: 'accuracy',
                        key: 'accuracy',
                        render: (v: number) => `${(v * 100).toFixed(1)}%`,
                      },
                    ]}
                    dataSource={models
                      .filter((m) => selectedModels.includes(m.id))
                      .map((m) => ({
                        key: m.id,
                        model: `${m.name} v${m.version}`,
                        accuracy: m.metrics.perCategoryMetrics[category]?.accuracy || 0,
                      }))}
                  />
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </Space>
  );
};

export default ModelComparison;