/**
 * Migration Dashboard Component
 * @module MigrationDashboard
 * @description Real-time monitoring dashboard for component migration progress
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layout,
  Card,
  Row,
  Col,
  Progress,
  Table,
  Tag,
  Button,
  Statistic,
  Alert,
  Space,
  Typography,
  Tooltip,
  Badge,
  Timeline,
  Dropdown,
  Menu,
  Modal,
  notification
} from 'antd';
import {
  CheckCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  RocketOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  SafetyOutlined,
  BarChartOutlined,
  RollbackOutlined,
  DownloadOutlined,
  SettingOutlined
} from '@ant-design/icons';
import {
  MigrationPlan,
  MigrationStatus,
  ComponentMigrationStep,
  MigrationMetrics,
  ValidationResult
} from '../types/MigrationTypes';
import { MigrationOrchestrator, MigrationProgressEvent } from '../orchestrator/MigrationOrchestrator';
import { Chart } from '@antv/g2';

const { Header, Content, Sider } = Layout;
const { Title, Text, Paragraph } = Typography;

/**
 * Dashboard props interface
 * @interface MigrationDashboardProps
 * @property {MigrationOrchestrator} orchestrator - Migration orchestrator instance
 * @property {MigrationPlan | null} currentPlan - Current migration plan
 * @property {() => void} [onRefresh] - Refresh callback
 * @property {(componentId: string) => void} [onRollback] - Rollback callback
 */
interface MigrationDashboardProps {
  orchestrator: MigrationOrchestrator;
  currentPlan: MigrationPlan | null;
  onRefresh?: () => void;
  onRollback?: (componentId: string) => void;
}

/**
 * Component statistics interface
 * @interface ComponentStats
 * @property {number} total - Total components
 * @property {number} completed - Completed components
 * @property {number} inProgress - In progress components
 * @property {number} failed - Failed components
 * @property {number} pending - Pending components
 */
interface ComponentStats {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  pending: number;
}

/**
 * Performance data point interface
 * @interface PerformanceDataPoint
 * @property {string} time - Timestamp
 * @property {number} value - Metric value
 * @property {string} metric - Metric name
 */
interface PerformanceDataPoint {
  time: string;
  value: number;
  metric: string;
}

/**
 * Migration Monitoring Dashboard Component
 * @component MigrationDashboard
 * @description Provides real-time monitoring of migration progress with
 * performance metrics, error tracking, and component status visualization
 * @example
 * <MigrationDashboard
 *   orchestrator={orchestrator}
 *   currentPlan={plan}
 *   onRollback={handleRollback}
 * />
 */
export const MigrationDashboard: React.FC<MigrationDashboardProps> = ({
  orchestrator,
  currentPlan,
  onRefresh,
  onRollback
}) => {
  // State management
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgressEvent | null>(null);
  const [componentStats, setComponentStats] = useState<ComponentStats>({
    total: 0,
    completed: 0,
    inProgress: 0,
    failed: 0,
    pending: 0
  });
  const [performanceData, setPerformanceData] = useState<PerformanceDataPoint[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [errorLog, setErrorLog] = useState<any[]>([]);

  /**
   * Sets up event listeners for migration progress
   */
  useEffect(() => {
    if (!orchestrator) return;

    const handleProgress = (event: MigrationProgressEvent) => {
      setMigrationProgress(event);
      updatePerformanceData(event);
    };

    const handleError = (error: any) => {
      setErrorLog(prev => [...prev, { ...error, timestamp: new Date() }]);
      notification.error({
        message: 'Migration Error',
        description: error.error?.message || 'An error occurred during migration'
      });
    };

    const handleCompleted = (result: any) => {
      notification.success({
        message: 'Migration Completed',
        description: `Successfully migrated ${result.results?.length || 0} components`
      });
    };

    orchestrator.on('migration:progress', handleProgress);
    orchestrator.on('migration:error', handleError);
    orchestrator.on('migration:completed', handleCompleted);

    return () => {
      orchestrator.off('migration:progress', handleProgress);
      orchestrator.off('migration:error', handleError);
      orchestrator.off('migration:completed', handleCompleted);
    };
  }, [orchestrator]);

  /**
   * Auto-refresh timer
   */
  useEffect(() => {
    if (!isAutoRefresh) return;

    const interval = setInterval(() => {
      refreshDashboard();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [isAutoRefresh]);

  /**
   * Updates component statistics based on plan
   */
  useEffect(() => {
    if (!currentPlan) {
      setComponentStats({
        total: 0,
        completed: 0,
        inProgress: 0,
        failed: 0,
        pending: 0
      });
      return;
    }

    const stats = currentPlan.components.reduce((acc, component) => {
      acc.total++;
      switch (component.status) {
        case MigrationStatus.COMPLETED:
          acc.completed++;
          break;
        case MigrationStatus.IN_PROGRESS:
        case MigrationStatus.ANALYZING:
        case MigrationStatus.VALIDATING:
          acc.inProgress++;
          break;
        case MigrationStatus.FAILED:
        case MigrationStatus.ROLLED_BACK:
          acc.failed++;
          break;
        default:
          acc.pending++;
      }
      return acc;
    }, { total: 0, completed: 0, inProgress: 0, failed: 0, pending: 0 });

    setComponentStats(stats);
  }, [currentPlan]);

  /**
   * Updates performance data
   */
  const updatePerformanceData = useCallback((event: MigrationProgressEvent) => {
    const newPoint: PerformanceDataPoint = {
      time: new Date().toLocaleTimeString(),
      value: event.overallProgress,
      metric: 'progress'
    };

    setPerformanceData(prev => {
      const updated = [...prev, newPoint];
      // Keep only last 50 data points
      return updated.slice(-50);
    });
  }, []);

  /**
   * Refreshes dashboard data
   */
  const refreshDashboard = useCallback(async () => {
    if (currentPlan && orchestrator) {
      try {
        const progress = await orchestrator.getMigrationProgress(currentPlan.id);
        setMigrationProgress(progress);
      } catch (error) {
        console.error('Failed to refresh dashboard:', error);
      }
    }
    onRefresh?.();
  }, [currentPlan, orchestrator, onRefresh]);

  /**
   * Handles component rollback
   */
  const handleRollback = useCallback((componentId: string) => {
    Modal.confirm({
      title: 'Confirm Rollback',
      content: `Are you sure you want to rollback ${componentId}? This will restore the original version.`,
      onOk: async () => {
        try {
          await orchestrator.rollbackMigration(componentId);
          notification.success({
            message: 'Rollback Successful',
            description: `Component ${componentId} has been rolled back`
          });
          onRollback?.(componentId);
        } catch (error) {
          notification.error({
            message: 'Rollback Failed',
            description: (error as Error).message
          });
        }
      }
    });
  }, [orchestrator, onRollback]);

  /**
   * Calculates estimated time remaining
   */
  const estimatedTimeRemaining = useMemo(() => {
    if (!migrationProgress || migrationProgress.overallProgress === 0) {
      return 'Calculating...';
    }

    // This is a simplified calculation
    const progressPerSecond = migrationProgress.overallProgress / 60; // Assume 60 seconds elapsed
    const remainingProgress = 100 - migrationProgress.overallProgress;
    const secondsRemaining = remainingProgress / progressPerSecond;

    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = Math.floor(secondsRemaining % 60);

    return `${minutes}m ${seconds}s`;
  }, [migrationProgress]);

  /**
   * Component status icon
   */
  const getStatusIcon = (status: MigrationStatus) => {
    switch (status) {
      case MigrationStatus.COMPLETED:
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case MigrationStatus.IN_PROGRESS:
      case MigrationStatus.ANALYZING:
      case MigrationStatus.VALIDATING:
        return <SyncOutlined spin style={{ color: '#1890ff' }} />;
      case MigrationStatus.FAILED:
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
      case MigrationStatus.ROLLED_BACK:
        return <RollbackOutlined style={{ color: '#fa8c16' }} />;
      default:
        return <ClockCircleOutlined style={{ color: '#8c8c8c' }} />;
    }
  };

  /**
   * Component table columns
   */
  const componentColumns = [
    {
      title: 'Component',
      dataIndex: 'componentId',
      key: 'componentId',
      render: (text: string, record: ComponentMigrationStep) => (
        <Space>
          {getStatusIcon(record.status)}
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: MigrationStatus) => {
        const color = {
          [MigrationStatus.COMPLETED]: 'success',
          [MigrationStatus.IN_PROGRESS]: 'processing',
          [MigrationStatus.FAILED]: 'error',
          [MigrationStatus.ROLLED_BACK]: 'warning',
          [MigrationStatus.PENDING]: 'default'
        }[status] || 'default';

        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number) => (
        <Progress percent={progress} size="small" />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ComponentMigrationStep) => (
        <Space>
          {record.status === MigrationStatus.FAILED && (
            <Button
              size="small"
              icon={<RollbackOutlined />}
              onClick={() => handleRollback(record.componentId)}
            >
              Rollback
            </Button>
          )}
          <Button
            size="small"
            onClick={() => {
              setSelectedComponent(record.componentId);
              setShowDetails(true);
            }}
          >
            Details
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Layout className="migration-dashboard">
      <Header style={{ background: '#fff', padding: '0 24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <DashboardOutlined /> Component Migration Dashboard
            </Title>
          </Col>
          <Col>
            <Space>
              <Badge dot={isAutoRefresh}>
                <Button
                  icon={<SyncOutlined />}
                  onClick={refreshDashboard}
                >
                  Refresh
                </Button>
              </Badge>
              <Button
                type={isAutoRefresh ? 'primary' : 'default'}
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              >
                Auto-Refresh: {isAutoRefresh ? 'ON' : 'OFF'}
              </Button>
              <Dropdown
                overlay={
                  <Menu>
                    <Menu.Item key="export">
                      <DownloadOutlined /> Export Report
                    </Menu.Item>
                    <Menu.Item key="settings">
                      <SettingOutlined /> Settings
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button icon={<SettingOutlined />} />
              </Dropdown>
            </Space>
          </Col>
        </Row>
      </Header>

      <Content style={{ padding: '24px' }}>
        {/* Overall Progress Section */}
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card>
              <Row gutter={[16, 16]} align="middle">
                <Col span={12}>
                  <Title level={4}>Overall Migration Progress</Title>
                  <Progress
                    percent={migrationProgress?.overallProgress || 0}
                    status={
                      migrationProgress?.status === MigrationStatus.FAILED ? 'exception' :
                      migrationProgress?.status === MigrationStatus.COMPLETED ? 'success' :
                      'active'
                    }
                    strokeWidth={20}
                  />
                  {migrationProgress?.message && (
                    <Text type="secondary">{migrationProgress.message}</Text>
                  )}
                </Col>
                <Col span={12}>
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <Statistic
                        title="Estimated Time Remaining"
                        value={estimatedTimeRemaining}
                        prefix={<ClockCircleOutlined />}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="Success Rate"
                        value={componentStats.total > 0
                          ? ((componentStats.completed / componentStats.total) * 100).toFixed(1)
                          : 0}
                        suffix="%"
                        prefix={<ThunderboltOutlined />}
                        valueStyle={{
                          color: componentStats.failed > 0 ? '#cf1322' : '#3f8600'
                        }}
                      />
                    </Col>
                  </Row>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        {/* Statistics Cards */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Total Components"
                value={componentStats.total}
                prefix={<RocketOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Completed"
                value={componentStats.completed}
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="In Progress"
                value={componentStats.inProgress}
                prefix={<SyncOutlined spin />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Failed"
                value={componentStats.failed}
                prefix={<CloseCircleOutlined />}
                valueStyle={{ color: componentStats.failed > 0 ? '#f5222d' : '#8c8c8c' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Component Status Table */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card title="Component Migration Status">
              <Table
                columns={componentColumns}
                dataSource={currentPlan?.components || []}
                rowKey="componentId"
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Card>
          </Col>
        </Row>

        {/* Error Log */}
        {errorLog.length > 0 && (
          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Alert
                message="Migration Errors"
                description={
                  <Timeline>
                    {errorLog.slice(-5).map((error, index) => (
                      <Timeline.Item
                        key={index}
                        color="red"
                        dot={<CloseCircleOutlined />}
                      >
                        <Text strong>{error.error?.componentId || 'Unknown'}</Text>: {' '}
                        {error.error?.message || 'Unknown error'}
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(error.timestamp).toLocaleString()}
                        </Text>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                }
                type="error"
                closable
                onClose={() => setErrorLog([])}
              />
            </Col>
          </Row>
        )}

        {/* Performance Metrics */}
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title="Performance Metrics">
              <div id="performance-chart" style={{ height: 300 }} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Migration Activity">
              <Timeline>
                <Timeline.Item color="green">
                  Migration started
                </Timeline.Item>
                <Timeline.Item color="blue">
                  Component analysis in progress
                </Timeline.Item>
                <Timeline.Item dot={<SyncOutlined spin />}>
                  Converting to TypeScript...
                </Timeline.Item>
              </Timeline>
            </Card>
          </Col>
        </Row>
      </Content>

      {/* Component Details Modal */}
      <Modal
        title={`Component Details: ${selectedComponent}`}
        visible={showDetails}
        onCancel={() => setShowDetails(false)}
        footer={null}
        width={800}
      >
        {selectedComponent && (
          <div>
            <Paragraph>
              Detailed information about the selected component migration would be displayed here.
            </Paragraph>
          </div>
        )}
      </Modal>
    </Layout>
  );
};

export default MigrationDashboard;