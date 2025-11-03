// Metrics Charts Component for Training Visualization (US-014)
import React from 'react';
import { Line } from '@ant-design/charts';
import { Row, Col, Card, Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

interface MetricsChartsProps {
  metrics: {
    accuracy: number[];
    loss: number[];
    precision: number[];
    recall: number[];
    f1Score: number[];
  };
  currentEpoch?: number;
}

const MetricsCharts: React.FC<MetricsChartsProps> = ({ metrics, currentEpoch }) => {
  // Prepare data for charts
  const prepareChartData = (metricName: string, values: number[]) => {
    return values.map((value, index) => ({
      epoch: index + 1,
      value: value,
      metric: metricName,
    }));
  };

  const accuracyData = prepareChartData('Accuracy', metrics.accuracy);
  const lossData = prepareChartData('Loss', metrics.loss);
  const combinedMetricsData = [
    ...prepareChartData('Precision', metrics.precision),
    ...prepareChartData('Recall', metrics.recall),
    ...prepareChartData('F1 Score', metrics.f1Score),
  ];

  // Get latest values
  const getLatestValue = (arr: number[]) => arr[arr.length - 1] || 0;
  const getPreviousValue = (arr: number[]) => arr[arr.length - 2] || 0;

  const latestAccuracy = getLatestValue(metrics.accuracy);
  const latestLoss = getLatestValue(metrics.loss);
  const latestPrecision = getLatestValue(metrics.precision);
  const latestRecall = getLatestValue(metrics.recall);

  const accuracyTrend = latestAccuracy - getPreviousValue(metrics.accuracy);
  const lossTrend = latestLoss - getPreviousValue(metrics.loss);

  const accuracyConfig = {
    data: accuracyData,
    xField: 'epoch',
    yField: 'value',
    smooth: true,
    color: '#52c41a',
    point: {
      size: 3,
      shape: 'circle',
    },
    yAxis: {
      label: {
        formatter: (v: string) => `${(parseFloat(v) * 100).toFixed(1)}%`,
      },
      max: 1,
      min: 0,
    },
    tooltip: {
      formatter: (datum: any) => {
        return {
          name: 'Accuracy',
          value: `${(datum.value * 100).toFixed(2)}%`,
        };
      },
    },
    annotations: currentEpoch ? [
      {
        type: 'line',
        start: [currentEpoch, 'min'],
        end: [currentEpoch, 'max'],
        style: {
          stroke: '#ff4d4f',
          lineDash: [2, 2],
        },
      },
    ] : [],
  };

  const lossConfig = {
    data: lossData,
    xField: 'epoch',
    yField: 'value',
    smooth: true,
    color: '#ff4d4f',
    point: {
      size: 3,
      shape: 'circle',
    },
    yAxis: {
      label: {
        formatter: (v: string) => parseFloat(v).toFixed(3),
      },
    },
    tooltip: {
      formatter: (datum: any) => {
        return {
          name: 'Loss',
          value: datum.value.toFixed(4),
        };
      },
    },
  };

  const combinedConfig = {
    data: combinedMetricsData,
    xField: 'epoch',
    yField: 'value',
    seriesField: 'metric',
    smooth: true,
    yAxis: {
      label: {
        formatter: (v: string) => `${(parseFloat(v) * 100).toFixed(1)}%`,
      },
      max: 1,
      min: 0,
    },
    tooltip: {
      formatter: (datum: any) => {
        return {
          name: datum.metric,
          value: `${(datum.value * 100).toFixed(2)}%`,
        };
      },
    },
    legend: {
      position: 'top' as const,
    },
  };

  return (
    <div>
      {/* Summary Statistics */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="Current Accuracy"
              value={latestAccuracy * 100}
              precision={2}
              valueStyle={{ color: accuracyTrend >= 0 ? '#52c41a' : '#ff4d4f' }}
              prefix={accuracyTrend >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="Current Loss"
              value={latestLoss}
              precision={4}
              valueStyle={{ color: lossTrend <= 0 ? '#52c41a' : '#ff4d4f' }}
              prefix={lossTrend <= 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="Precision"
              value={latestPrecision * 100}
              precision={2}
              suffix="%"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic
              title="Recall"
              value={latestRecall * 100}
              precision={2}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row gutter={16}>
        <Col span={12}>
          <Card title="Accuracy" bordered={false} style={{ marginBottom: 16 }}>
            <Line {...accuracyConfig} height={200} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Loss" bordered={false} style={{ marginBottom: 16 }}>
            <Line {...lossConfig} height={200} />
          </Card>
        </Col>
      </Row>

      <Card title="Precision, Recall & F1 Score" bordered={false}>
        <Line {...combinedConfig} height={250} />
      </Card>
    </div>
  );
};

export default MetricsCharts;