// Resource Monitor Component for GPU/CPU Usage (US-014)
import React from 'react';
import { Row, Col, Card, Progress, Statistic, Space, Typography, Tag } from 'antd';
import {
  ThunderboltOutlined,
  DesktopOutlined,
  FireOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { Gauge } from '@ant-design/charts';

const { Text } = Typography;

interface ResourceMonitorProps {
  resources: {
    gpuMemory: number; // GB
    gpuTemp: number; // Celsius
    cpuPercent: number;
  };
}

const ResourceMonitor: React.FC<ResourceMonitorProps> = ({ resources }) => {
  // GPU temperature gauge config
  const tempGaugeConfig = {
    percent: resources.gpuTemp / 100,
    range: {
      ticks: [0, 1 / 3, 2 / 3, 1],
      color: ['#30BF78', '#FAAD14', '#F4664A'],
    },
    indicator: {
      pointer: {
        style: {
          stroke: '#D0D0D0',
        },
      },
      pin: {
        style: {
          stroke: '#D0D0D0',
        },
      },
    },
    statistic: {
      content: {
        style: {
          fontSize: '36px',
          lineHeight: '36px',
        },
        formatter: () => `${resources.gpuTemp}°C`,
      },
    },
  };

  // CPU usage gauge config
  const cpuGaugeConfig = {
    percent: resources.cpuPercent / 100,
    range: {
      ticks: [0, 1 / 3, 2 / 3, 1],
      color: ['#30BF78', '#FAAD14', '#F4664A'],
    },
    indicator: {
      pointer: {
        style: {
          stroke: '#D0D0D0',
        },
      },
      pin: {
        style: {
          stroke: '#D0D0D0',
        },
      },
    },
    statistic: {
      content: {
        style: {
          fontSize: '36px',
          lineHeight: '36px',
        },
        formatter: () => `${resources.cpuPercent}%`,
      },
    },
  };

  const getTemperatureStatus = (temp: number) => {
    if (temp < 60) return { color: 'success', text: 'Normal' };
    if (temp < 75) return { color: 'warning', text: 'Warm' };
    if (temp < 85) return { color: 'orange', text: 'Hot' };
    return { color: 'error', text: 'Critical' };
  };

  const getMemoryStatus = (used: number, total = 10) => {
    const percent = (used / total) * 100;
    if (percent < 70) return { color: 'success', text: 'Healthy' };
    if (percent < 85) return { color: 'warning', text: 'High' };
    return { color: 'error', text: 'Critical' };
  };

  const tempStatus = getTemperatureStatus(resources.gpuTemp);
  const memoryStatus = getMemoryStatus(resources.gpuMemory);

  return (
    <div>
      {/* Resource Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title={
                <Space>
                  <ThunderboltOutlined />
                  GPU Memory
                </Space>
              }
              value={resources.gpuMemory}
              precision={1}
              suffix="GB / 10GB"
              valueStyle={{ color: memoryStatus.color === 'error' ? '#ff4d4f' : undefined }}
            />
            <Progress
              percent={(resources.gpuMemory / 10) * 100}
              strokeColor={
                memoryStatus.color === 'success'
                  ? '#52c41a'
                  : memoryStatus.color === 'warning'
                  ? '#faad14'
                  : '#ff4d4f'
              }
              showInfo={false}
              style={{ marginTop: 8 }}
            />
            <Tag color={memoryStatus.color as string} style={{ marginTop: 8 }}>
              {memoryStatus.text}
            </Tag>
          </Card>
        </Col>

        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title={
                <Space>
                  <FireOutlined />
                  GPU Temperature
                </Space>
              }
              value={resources.gpuTemp}
              suffix="°C"
              valueStyle={{ color: tempStatus.color === 'error' ? '#ff4d4f' : undefined }}
            />
            <Progress
              percent={resources.gpuTemp}
              strokeColor={{
                '0%': '#30BF78',
                '60%': '#FAAD14',
                '100%': '#F4664A',
              }}
              showInfo={false}
              style={{ marginTop: 8 }}
            />
            <Tag color={tempStatus.color as string} style={{ marginTop: 8 }}>
              {tempStatus.text}
            </Tag>
          </Card>
        </Col>

        <Col span={8}>
          <Card bordered={false}>
            <Statistic
              title={
                <Space>
                  <DesktopOutlined />
                  CPU Usage
                </Space>
              }
              value={resources.cpuPercent}
              suffix="%"
              valueStyle={{
                color: resources.cpuPercent > 90 ? '#ff4d4f' : undefined,
              }}
            />
            <Progress
              percent={resources.cpuPercent}
              strokeColor={
                resources.cpuPercent < 70
                  ? '#52c41a'
                  : resources.cpuPercent < 90
                  ? '#faad14'
                  : '#ff4d4f'
              }
              showInfo={false}
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Gauge Charts */}
      <Row gutter={16}>
        <Col span={12}>
          <Card title="GPU Temperature" bordered={false}>
            <Gauge {...tempGaugeConfig} height={200} />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Space direction="vertical" size="small">
                <Text type="secondary">Safe operating range: 40-80°C</Text>
                <Text type="secondary">Throttling begins at: 83°C</Text>
              </Space>
            </div>
          </Card>
        </Col>

        <Col span={12}>
          <Card title="CPU Usage" bordered={false}>
            <Gauge {...cpuGaugeConfig} height={200} />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Space direction="vertical" size="small">
                <Text type="secondary">Cores utilized: {Math.ceil(resources.cpuPercent / 12.5)}/8</Text>
                <Text type="secondary">Process priority: Normal</Text>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* System Information */}
      <Card title="System Information" bordered={false} style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Space direction="vertical" size="small">
              <Text strong>GPU Model</Text>
              <Text>NVIDIA RTX 4090</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical" size="small">
              <Text strong>CUDA Version</Text>
              <Text>12.1</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical" size="small">
              <Text strong>Driver Version</Text>
              <Text>535.154.05</Text>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Warnings */}
      {(tempStatus.color === 'error' || memoryStatus.color === 'error') && (
        <Card
          title="⚠️ Resource Warnings"
          bordered={false}
          style={{ marginTop: 16, backgroundColor: '#fff2f0' }}
        >
          <Space direction="vertical">
            {tempStatus.color === 'error' && (
              <Text type="danger">
                • GPU temperature is critically high. Training may be throttled to prevent damage.
              </Text>
            )}
            {memoryStatus.color === 'error' && (
              <Text type="danger">
                • GPU memory usage is near maximum. Consider reducing batch size.
              </Text>
            )}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default ResourceMonitor;