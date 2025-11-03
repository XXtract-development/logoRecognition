/**
 * Feature Flag Admin UI component
 * @module FeatureFlagAdmin
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Table,
  Switch,
  Slider,
  Tag,
  Alert,
  Button,
  Space,
  Tooltip,
  Badge,
  Modal,
  Input,
  Select,
  Form,
  Statistic,
  Row,
  Col,
  Typography,
  Divider
} from 'antd';
import {
  SettingOutlined,
  ReloadOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import { useFeatureFlagContext, useCircuitBreakerState } from './FeatureFlagProvider';
import { CircuitState, FeatureFlags } from './types';
import { getFlagMetadata, formatFlagValue } from './utils';

const { Title, Text } = Typography;
const { Option } = Select;

/**
 * Feature Flag Admin component for managing flags
 * @component FeatureFlagAdmin
 * @description Provides UI for real-time feature flag management with circuit breaker status
 * @returns {JSX.Element} Admin UI component
 */
export const FeatureFlagAdmin: React.FC = () => {
  const { flags, service, loading } = useFeatureFlagContext();
  const [editingFlag, setEditingFlag] = useState<string | null>(null);
  const [flagStats, setFlagStats] = useState<Map<string, any>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  // Convert flags to table data
  const dataSource = useMemo(() => {
    return Object.entries(flags).map(([key, value]) => {
      const metadata = getFlagMetadata(key);
      return {
        key,
        value,
        ...metadata
      };
    });
  }, [flags]);

  /**
   * Handles flag toggle
   */
  const handleToggle = (key: string, checked: boolean) => {
    service.updateFlags({ [key]: checked });
  };

  /**
   * Handles rollout percentage change
   */
  const handleRolloutChange = (key: string, percentage: number) => {
    service.updateFlags({ [key]: percentage });
  };

  /**
   * Refreshes flag data
   */
  const handleRefresh = async () => {
    setRefreshing(true);
    await service.initialize();
    setRefreshing(false);
  };

  /**
   * Circuit breaker status component
   */
  const CircuitBreakerStatus: React.FC<{ flagKey: string }> = ({ flagKey }) => {
    const state = useCircuitBreakerState(flagKey);

    const getStatusTag = () => {
      switch (state) {
        case CircuitState.CLOSED:
          return <Tag color="green" icon={<CheckCircleOutlined />}>CLOSED</Tag>;
        case CircuitState.OPEN:
          return <Tag color="red" icon={<CloseCircleOutlined />}>OPEN</Tag>;
        case CircuitState.HALF_OPEN:
          return <Tag color="orange" icon={<WarningOutlined />}>HALF OPEN</Tag>;
        default:
          return <Tag>UNKNOWN</Tag>;
      }
    };

    return (
      <Tooltip title={`Circuit breaker state: ${state}`}>
        {getStatusTag()}
      </Tooltip>
    );
  };

  /**
   * Table columns configuration
   */
  const columns = [
    {
      title: 'Flag',
      dataIndex: 'key',
      key: 'key',
      width: '30%',
      render: (key: string, record: any) => (
        <Space direction="vertical" size="small">
          <Text strong>{key}</Text>
          <Space>
            {record.isCritical && (
              <Tag color="red" icon={<WarningOutlined />}>Critical</Tag>
            )}
            {record.isRollout && (
              <Tag color="blue" icon={<ExperimentOutlined />}>Rollout</Tag>
            )}
            <Tag>{record.category}</Tag>
          </Space>
        </Space>
      ),
      sorter: (a: any, b: any) => a.key.localeCompare(b.key)
    },
    {
      title: 'Status',
      dataIndex: 'value',
      key: 'status',
      width: '15%',
      render: (value: any, record: any) => {
        if (typeof value === 'boolean') {
          return (
            <Switch
              checked={value}
              onChange={(checked) => handleToggle(record.key, checked)}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          );
        }
        return <Text>{formatFlagValue(value)}</Text>;
      }
    },
    {
      title: 'Rollout %',
      key: 'rollout',
      width: '20%',
      render: (record: any) => {
        if (record.isRollout && typeof record.value === 'number') {
          return (
            <div style={{ width: 120 }}>
              <Slider
                value={record.value}
                onChange={(value) => handleRolloutChange(record.key, value)}
                tooltipVisible
                marks={{
                  0: '0%',
                  50: '50%',
                  100: '100%'
                }}
              />
            </div>
          );
        }
        return <Text type="secondary">N/A</Text>;
      }
    },
    {
      title: 'Circuit Status',
      key: 'circuit',
      width: '15%',
      render: (record: any) => {
        if (record.isCritical) {
          return <CircuitBreakerStatus flagKey={record.key} />;
        }
        return <Text type="secondary">No Circuit</Text>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '20%',
      render: (record: any) => (
        <Space>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={() => setEditingFlag(record.key)}
          >
            Configure
          </Button>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => service.reportError(record.key, new Error('Test error'))}
            danger
          >
            Test Error
          </Button>
        </Space>
      )
    }
  ];

  /**
   * Statistics cards
   */
  const renderStatistics = () => {
    const totalFlags = Object.keys(flags).length;
    const enabledFlags = Object.values(flags).filter(v => v === true).length;
    const criticalFlags = dataSource.filter(d => d.isCritical).length;
    const rolloutFlags = dataSource.filter(d => d.isRollout).length;

    return (
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Total Flags"
              value={totalFlags}
              prefix={<InfoCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Enabled"
              value={enabledFlags}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Critical"
              value={criticalFlags}
              valueStyle={{ color: '#cf1322' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Rollouts"
              value={rolloutFlags}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ExperimentOutlined />}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  /**
   * Configuration modal
   */
  const renderConfigModal = () => {
    if (!editingFlag) return null;

    const currentValue = flags[editingFlag as keyof FeatureFlags];
    const metadata = getFlagMetadata(editingFlag);

    return (
      <Modal
        title={`Configure: ${editingFlag}`}
        visible={!!editingFlag}
        onCancel={() => setEditingFlag(null)}
        footer={[
          <Button key="cancel" onClick={() => setEditingFlag(null)}>
            Cancel
          </Button>,
          <Button key="save" type="primary" onClick={() => setEditingFlag(null)}>
            Save
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="Flag Key">
            <Input value={editingFlag} disabled />
          </Form.Item>
          <Form.Item label="Category">
            <Tag>{metadata.category}</Tag>
          </Form.Item>
          <Form.Item label="Current Value">
            <Text strong>{formatFlagValue(currentValue)}</Text>
          </Form.Item>
          {metadata.isCritical && (
            <Alert
              message="Critical Flag"
              description="This flag has circuit breaker protection. It will automatically disable if errors exceed threshold."
              type="warning"
              showIcon
            />
          )}
        </Form>
      </Modal>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>
        <SettingOutlined /> Feature Flag Management
      </Title>

      <Alert
        message="Circuit Breaker Active"
        description="Critical migration flags are protected by circuit breakers. They will automatically rollback on error threshold."
        type="info"
        showIcon
        icon={<ThunderboltOutlined />}
        style={{ marginBottom: 24 }}
      />

      {renderStatistics()}

      <Card
        title="Feature Flags"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              loading={refreshing}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={dataSource}
          columns={columns}
          loading={loading}
          pagination={{
            pageSize: 20,
            showTotal: (total) => `Total ${total} flags`
          }}
          rowKey="key"
          size="middle"
        />
      </Card>

      {renderConfigModal()}
    </div>
  );
};

/**
 * Compact feature flag status component for integration
 * @component FeatureFlagStatus
 */
export const FeatureFlagStatus: React.FC = () => {
  const { flags } = useFeatureFlagContext();

  const enabledCount = Object.values(flags).filter(v => v === true).length;
  const totalCount = Object.keys(flags).length;

  return (
    <Badge count={enabledCount} style={{ backgroundColor: '#52c41a' }}>
      <Tag icon={<SettingOutlined />}>
        Flags: {enabledCount}/{totalCount}
      </Tag>
    </Badge>
  );
};