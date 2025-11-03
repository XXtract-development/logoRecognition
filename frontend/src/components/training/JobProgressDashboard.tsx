// Job Progress Dashboard Component with Real-time Updates (US-014)
import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Progress,
  Tag,
  Typography,
  Space,
  Statistic,
  List,
  Button,
  Tooltip,
  Badge,
  Alert,
  Divider,
} from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  WifiOutlined,
  DisconnectOutlined,
  ThunderboltOutlined,
  FireOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import { TrainingJobStatus, TrainingLog } from '../../types/training';
import useTrainingJobsStore from '../../store/trainingJobsStore';
import trainingWebSocketService from '../../services/training/TrainingWebSocketService';
import MetricsCharts from './MetricsCharts';
import LogViewer from './LogViewer';
import ResourceMonitor from './ResourceMonitor';

const { Title, Text, Paragraph } = Typography;

interface JobProgressDashboardProps {
  jobId: string;
  onClose?: () => void;
}

const JobProgressDashboard: React.FC<JobProgressDashboardProps> = ({ jobId, onClose }) => {
  const {
    jobs,
    selectedJobId,
    connectionStatus,
    connectWebSocket,
    disconnectWebSocket,
    updateJobStatus,
  } = useTrainingJobsStore();

  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'metrics' | 'logs' | 'resources'>('metrics');

  const job = jobs.find((j) => j.jobId === jobId);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWebSocket(jobId);

    return () => {
      disconnectWebSocket();
    };
  }, [jobId, connectWebSocket, disconnectWebSocket]);

  // Handle manual reconnect
  const handleReconnect = () => {
    connectWebSocket(jobId);
  };

  // Get status color
  const getStatusColor = (status: TrainingJobStatus['status']) => {
    const statusColors = {
      queued: 'default',
      preparing: 'processing',
      augmenting: 'processing',
      training: 'processing',
      validating: 'processing',
      completed: 'success',
      failed: 'error',
    };
    return statusColors[status] || 'default';
  };

  // Get status icon
  const getStatusIcon = (status: TrainingJobStatus['status']) => {
    const statusIcons = {
      queued: <ClockCircleOutlined />,
      preparing: <LoadingOutlined spin />,
      augmenting: <LoadingOutlined spin />,
      training: <LoadingOutlined spin />,
      validating: <LoadingOutlined spin />,
      completed: <CheckCircleOutlined />,
      failed: <CloseCircleOutlined />,
    };
    return statusIcons[status] || null;
  };

  // Calculate ETA
  const calculateETA = () => {
    if (!job?.eta) return '--:--';
    const eta = new Date(job.eta);
    const now = new Date();
    const diff = eta.getTime() - now.getTime();
    if (diff <= 0) return 'Soon';
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  // Get phase progress
  const getPhaseProgress = (phase: keyof NonNullable<TrainingJobStatus['phaseProgress']>) => {
    return job?.phaseProgress?.[phase] || 0;
  };

  // Connection status indicator
  const ConnectionStatus = () => (
    <Badge
      status={
        connectionStatus === 'connected'
          ? 'success'
          : connectionStatus === 'reconnecting'
          ? 'processing'
          : 'error'
      }
      text={
        <Space>
          {connectionStatus === 'connected' ? (
            <WifiOutlined />
          ) : (
            <DisconnectOutlined />
          )}
          <Text type="secondary">
            {connectionStatus === 'connected'
              ? 'Connected'
              : connectionStatus === 'reconnecting'
              ? 'Reconnecting...'
              : 'Disconnected'}
          </Text>
          {connectionStatus !== 'connected' && (
            <Button size="small" icon={<ReloadOutlined />} onClick={handleReconnect}>
              Reconnect
            </Button>
          )}
        </Space>
      }
    />
  );

  if (!job) {
    return (
      <Alert
        message="Job Not Found"
        description={`Training job ${jobId} not found. It may have been deleted or you may not have permission to view it.`}
        type="error"
        showIcon
      />
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space direction="vertical" size="small">
              <Space>
                <Title level={4} style={{ margin: 0 }}>
                  Job #{job.jobId}
                </Title>
                <Tag color={getStatusColor(job.status)} icon={getStatusIcon(job.status)}>
                  {job.status.toUpperCase()}
                </Tag>
                {job.currentEpoch && job.totalEpochs && (
                  <Tag>
                    Epoch {job.currentEpoch}/{job.totalEpochs}
                  </Tag>
                )}
              </Space>
              <Space split={<Divider type="vertical" />}>
                <Text type="secondary">Dataset: {job.datasetVersionId}</Text>
                <ConnectionStatus />
              </Space>
            </Space>
          </Col>
          <Col>
            <Space>
              {job.status === 'completed' && (
                <Button icon={<DownloadOutlined />}>Download Report</Button>
              )}
              {onClose && (
                <Button onClick={onClose}>Close</Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Overall Progress */}
      <Card title="Overall Progress" bordered={false} style={{ marginBottom: 16 }}>
        <Progress
          percent={job.progress}
          status={job.status === 'failed' ? 'exception' : 'active'}
          strokeColor={{
            '0%': '#108ee9',
            '100%': '#87d068',
          }}
        />
        <Row gutter={16} style={{ marginTop: 24 }}>
          <Col span={6}>
            <Statistic
              title="ETA"
              value={calculateETA()}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Started"
              value={new Date(job.startedAt).toLocaleTimeString()}
            />
          </Col>
          {job.finishedAt && (
            <Col span={6}>
              <Statistic
                title="Finished"
                value={new Date(job.finishedAt).toLocaleTimeString()}
              />
            </Col>
          )}
          {job.error && (
            <Col span={6}>
              <Alert message="Error" description={job.error} type="error" showIcon />
            </Col>
          )}
        </Row>
      </Card>

      {/* Phase Progress */}
      <Card title="Training Phases" bordered={false} style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Space style={{ marginBottom: 8 }}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <Text strong>Queue</Text>
            </Space>
            <Progress percent={getPhaseProgress('queue')} size="small" />
          </div>

          <div>
            <Space style={{ marginBottom: 8 }}>
              {getPhaseProgress('augmentation') === 100 ? (
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              ) : (
                <LoadingOutlined spin />
              )}
              <Text strong>Augmentation</Text>
            </Space>
            <Progress percent={getPhaseProgress('augmentation')} size="small" />
          </div>

          <div>
            <Space style={{ marginBottom: 8 }}>
              {getPhaseProgress('training') === 100 ? (
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              ) : getPhaseProgress('training') > 0 ? (
                <LoadingOutlined spin />
              ) : (
                <ClockCircleOutlined />
              )}
              <Text strong>Training</Text>
            </Space>
            <Progress percent={getPhaseProgress('training')} size="small" />
          </div>

          <div>
            <Space style={{ marginBottom: 8 }}>
              {getPhaseProgress('validation') === 100 ? (
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
              ) : getPhaseProgress('validation') > 0 ? (
                <LoadingOutlined spin />
              ) : (
                <ClockCircleOutlined />
              )}
              <Text strong>Validation</Text>
            </Space>
            <Progress percent={getPhaseProgress('validation')} size="small" />
          </div>
        </Space>
      </Card>

      {/* Tabs for Metrics, Logs, Resources */}
      <Card
        bordered={false}
        tabList={[
          {
            key: 'metrics',
            tab: (
              <Space>
                <ThunderboltOutlined />
                Metrics
              </Space>
            ),
          },
          {
            key: 'logs',
            tab: (
              <Space>
                <FireOutlined />
                Logs
                {job.logs.length > 0 && (
                  <Badge count={job.logs.length} showZero />
                )}
              </Space>
            ),
          },
          {
            key: 'resources',
            tab: (
              <Space>
                <DesktopOutlined />
                Resources
              </Space>
            ),
          },
        ]}
        activeTabKey={selectedTab}
        onTabChange={(key) => setSelectedTab(key as any)}
      >
        {selectedTab === 'metrics' && job.metrics && (
          <MetricsCharts metrics={job.metrics} currentEpoch={job.currentEpoch} />
        )}

        {selectedTab === 'logs' && (
          <LogViewer
            logs={job.logs}
            autoScroll={autoScroll}
            onAutoScrollChange={setAutoScroll}
            jobId={job.jobId}
          />
        )}

        {selectedTab === 'resources' && job.resources && (
          <ResourceMonitor resources={job.resources} />
        )}
      </Card>
    </div>
  );
};

export default JobProgressDashboard;