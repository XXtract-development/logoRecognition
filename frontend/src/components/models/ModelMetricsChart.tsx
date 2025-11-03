// Model Metrics Chart Component (US-015)
import React from 'react';
import { Radar } from '@ant-design/charts';
import { Card } from 'antd';
import { ModelVersion } from '../../types/models';

interface ModelMetricsChartProps {
  model: ModelVersion;
}

const ModelMetricsChart: React.FC<ModelMetricsChartProps> = ({ model }) => {
  const data = [
    { metric: 'Accuracy', value: model.metrics.accuracy * 100 },
    { metric: 'Precision', value: model.metrics.precision * 100 },
    { metric: 'Recall', value: model.metrics.recall * 100 },
    { metric: 'F1 Score', value: model.metrics.f1Score * 100 },
  ];

  const config = {
    data,
    xField: 'metric',
    yField: 'value',
    area: {
      style: {
        fillOpacity: 0.2,
      },
    },
    scale: {
      value: {
        min: 0,
        max: 100,
      },
    },
    point: {
      size: 3,
    },
    tooltip: {
      formatter: (datum: any) => ({
        name: datum.metric,
        value: `${datum.value.toFixed(2)}%`,
      }),
    },
  };

  return (
    <Card title="Performance Metrics" size="small">
      <Radar {...config} height={300} />
    </Card>
  );
};

export default ModelMetricsChart;