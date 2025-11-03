// Performance Baseline UI Component
// Story: FE-001.0.1

import React, { useState, useEffect } from 'react';
import { Card, Button, Progress, Alert, Table, Statistic, Row, Col, Tag, Space, Typography } from 'antd';
import {
  ThunderboltOutlined,
  DownloadOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { baselineService, PerformanceBaseline } from './BaselineCapture';

const { Title, Text } = Typography;

interface PerformanceMetric {
  key: string;
  metric: string;
  current: string | number;
  target: string | number;
  status: 'good' | 'warning' | 'critical';
}

export const PerformanceBaselinePanel: React.FC = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [baseline, setBaseline] = useState<PerformanceBaseline | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<PerformanceBaseline[]>([]);

  useEffect(() => {
    loadHistoricalBaselines();
  }, []);

  const loadHistoricalBaselines = () => {
    try {
      const stored = localStorage.getItem('performance_baselines');
      if (stored) {
        const baselines = JSON.parse(stored);
        setHistoricalData(baselines);
        if (baselines.length > 0) {
          setBaseline(baselines[baselines.length - 1]);
          updateMetricsDisplay(baselines[baselines.length - 1]);
        }
      }
    } catch (e) {
      console.error('Failed to load historical baselines:', e);
    }
  };

  const updateMetricsDisplay = (baseline: PerformanceBaseline) => {
    const metricsData: PerformanceMetric[] = [
      {
        key: '1',
        metric: 'Bundle Size',
        current: `${(baseline.metrics.bundle.total / 1024 / 1024).toFixed(2)} MB`,
        target: '< 2.9 MB',
        status: baseline.metrics.bundle.total > 2900000 ? 'critical' : 'good',
      },
      {
        key: '2',
        metric: 'First Contentful Paint',
        current: `${baseline.metrics.runtime.fcp.toFixed(0)}ms`,
        target: '< 2100ms',
        status: baseline.metrics.runtime.fcp > 2500 ? 'critical' :
                baseline.metrics.runtime.fcp > 2100 ? 'warning' : 'good',
      },
      {
        key: '3',
        metric: 'Time to Interactive',
        current: `${baseline.metrics.runtime.tti.toFixed(0)}ms`,
        target: '< 3400ms',
        status: baseline.metrics.runtime.tti > 4000 ? 'critical' :
                baseline.metrics.runtime.tti > 3400 ? 'warning' : 'good',
      },
      {
        key: '4',
        metric: 'Largest Contentful Paint',
        current: `${baseline.metrics.runtime.lcp.toFixed(0)}ms`,
        target: '< 2500ms',
        status: baseline.metrics.runtime.lcp > 4000 ? 'critical' :
                baseline.metrics.runtime.lcp > 2500 ? 'warning' : 'good',
      },
      {
        key: '5',
        metric: 'Cumulative Layout Shift',
        current: baseline.metrics.runtime.cls.toFixed(3),
        target: '< 0.1',
        status: baseline.metrics.runtime.cls > 0.25 ? 'critical' :
                baseline.metrics.runtime.cls > 0.1 ? 'warning' : 'good',
      },
      {
        key: '6',
        metric: 'Memory Usage',
        current: `${(baseline.metrics.memory.heapUsed / 1024 / 1024).toFixed(0)} MB`,
        target: '< 340 MB',
        status: baseline.metrics.memory.heapUsed > 340 * 1024 * 1024 ? 'warning' : 'good',
      },
      {
        key: '7',
        metric: 'TypeScript Ratio',
        current: `${(baseline.metrics.bundle.jsVsTs.ratio * 100).toFixed(1)}%`,
        target: '100%',
        status: baseline.metrics.bundle.jsVsTs.ratio < 0.6 ? 'warning' : 'good',
      },
      {
        key: '8',
        metric: 'Lighthouse Score',
        current: baseline.metrics.lighthouse.performance,
        target: '> 90',
        status: baseline.metrics.lighthouse.performance < 70 ? 'critical' :
                baseline.metrics.lighthouse.performance < 90 ? 'warning' : 'good',
      },
    ];

    setMetrics(metricsData);
  };

  const handleCaptureBaseline = async () => {
    setIsCapturing(true);
    setError(null);
    setCaptureProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setCaptureProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const newBaseline = await baselineService.captureBaselines();

      clearInterval(progressInterval);
      setCaptureProgress(100);

      setBaseline(newBaseline);
      updateMetricsDisplay(newBaseline);

      // Update historical data
      setHistoricalData(prev => [...prev, newBaseline]);

      setTimeout(() => {
        setCaptureProgress(0);
        setIsCapturing(false);
      }, 1000);
    } catch (e) {
      setError('Failed to capture baseline: ' + (e as Error).message);
      setIsCapturing(false);
      setCaptureProgress(0);
    }
  };

  const getStatusTag = (status: 'good' | 'warning' | 'critical') => {
    switch (status) {
      case 'good':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Good</Tag>;
      case 'warning':
        return <Tag color="warning" icon={<WarningOutlined />}>Warning</Tag>;
      case 'critical':
        return <Tag color="error" icon={<WarningOutlined />}>Critical</Tag>;
    }
  };

  const columns = [
    {
      title: 'Metric',
      dataIndex: 'metric',
      key: 'metric',
      width: '30%',
    },
    {
      title: 'Current',
      dataIndex: 'current',
      key: 'current',
      width: '25%',
      render: (text: string | number, record: PerformanceMetric) => (
        <Text strong type={record.status === 'critical' ? 'danger' : undefined}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Target',
      dataIndex: 'target',
      key: 'target',
      width: '25%',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: '20%',
      render: (status: 'good' | 'warning' | 'critical') => getStatusTag(status),
    },
  ];

  const calculateOverallHealth = (): number => {
    if (!metrics.length) return 0;
    const goodCount = metrics.filter(m => m.status === 'good').length;
    return Math.round((goodCount / metrics.length) * 100);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={3}>
          <RocketOutlined /> Performance Baseline Capture
        </Title>

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: '16px' }}
          />
        )}

        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Overall Health"
                value={calculateOverallHealth()}
                suffix="%"
                valueStyle={{ color: calculateOverallHealth() > 70 ? '#52c41a' : '#ff4d4f' }}
                prefix={<ThunderboltOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Bundle Size"
                value={baseline ? (baseline.metrics.bundle.total / 1024 / 1024).toFixed(1) : '0'}
                suffix="MB"
                valueStyle={{ color: baseline && baseline.metrics.bundle.total > 3000000 ? '#ff4d4f' : '#52c41a' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="TypeScript Coverage"
                value={baseline ? (baseline.metrics.bundle.jsVsTs.ratio * 100).toFixed(0) : '0'}
                suffix="%"
                valueStyle={{ color: baseline && baseline.metrics.bundle.jsVsTs.ratio > 0.5 ? '#52c41a' : '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Memory Usage"
                value={baseline ? (baseline.metrics.memory.heapUsed / 1024 / 1024).toFixed(0) : '0'}
                suffix="MB"
                valueStyle={{ color: baseline && baseline.metrics.memory.heapUsed > 400 * 1024 * 1024 ? '#ff4d4f' : '#52c41a' }}
              />
            </Card>
          </Col>
        </Row>

        <Space style={{ marginBottom: '16px' }}>
          <Button
            type="primary"
            icon={<SyncOutlined spin={isCapturing} />}
            onClick={handleCaptureBaseline}
            loading={isCapturing}
            size="large"
          >
            {isCapturing ? 'Capturing Baseline...' : 'Capture New Baseline'}
          </Button>

          <Button
            icon={<DownloadOutlined />}
            disabled={!baseline}
            size="large"
          >
            Download Report
          </Button>
        </Space>

        {isCapturing && (
          <Progress
            percent={captureProgress}
            status="active"
            strokeColor={{
              '0%': '#108ee9',
              '100%': '#87d068',
            }}
            style={{ marginBottom: '16px' }}
          />
        )}

        {baseline && (
          <>
            <Card title="Performance Metrics" style={{ marginTop: '24px' }}>
              <Table
                columns={columns}
                dataSource={metrics}
                pagination={false}
                size="middle"
              />
            </Card>

            <Card title="User Journey Performance" style={{ marginTop: '16px' }}>
              <Row gutter={[16, 16]}>
                {baseline.userJourneys.map((journey, index) => (
                  <Col span={8} key={index}>
                    <Card type="inner">
                      <Statistic
                        title={journey.name}
                        value={journey.duration}
                        suffix="ms"
                        prefix={<RocketOutlined />}
                        valueStyle={{ fontSize: '20px' }}
                      />
                      <div style={{ marginTop: '8px' }}>
                        <Text type="secondary">Steps: {journey.steps}</Text>
                        <br />
                        <Text type="secondary">Errors: {journey.errors}</Text>
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>

            <Card title="API Performance (P50/P95/P99)" style={{ marginTop: '16px' }}>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Card type="inner">
                    <Text strong>Upload Latency</Text>
                    <div style={{ marginTop: '8px' }}>
                      {baseline.metrics.api.uploadLatency.p50}ms /
                      {baseline.metrics.api.uploadLatency.p95}ms /
                      {baseline.metrics.api.uploadLatency.p99}ms
                    </div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card type="inner">
                    <Text strong>Fetch Latency</Text>
                    <div style={{ marginTop: '8px' }}>
                      {baseline.metrics.api.fetchLatency.p50}ms /
                      {baseline.metrics.api.fetchLatency.p95}ms /
                      {baseline.metrics.api.fetchLatency.p99}ms
                    </div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card type="inner">
                    <Text strong>Annotation Save</Text>
                    <div style={{ marginTop: '8px' }}>
                      {baseline.metrics.api.annotationSave.p50}ms /
                      {baseline.metrics.api.annotationSave.p95}ms /
                      {baseline.metrics.api.annotationSave.p99}ms
                    </div>
                  </Card>
                </Col>
                <Col span={6}>
                  <Card type="inner">
                    <Text strong>Authentication</Text>
                    <div style={{ marginTop: '8px' }}>
                      {baseline.metrics.api.authenticationTime.p50}ms /
                      {baseline.metrics.api.authenticationTime.p95}ms /
                      {baseline.metrics.api.authenticationTime.p99}ms
                    </div>
                  </Card>
                </Col>
              </Row>
            </Card>

            <Card title="Historical Trends" style={{ marginTop: '16px' }}>
              <Text>
                Total baseline captures: {historicalData.length}
              </Text>
              {historicalData.length > 1 && (
                <div style={{ marginTop: '8px' }}>
                  <Text type="secondary">
                    Last captured: {new Date(baseline.timestamp).toLocaleString()}
                  </Text>
                </div>
              )}
            </Card>
          </>
        )}
      </Card>
    </div>
  );
};

export default PerformanceBaselinePanel;