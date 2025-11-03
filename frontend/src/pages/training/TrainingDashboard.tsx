// Training Dashboard Page (US-014)
import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Button,
  Table,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Typography,
  Badge,
  Dropdown,
  Modal,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  RocketOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  EyeOutlined,
  DeleteOutlined,
  RedoOutlined,
  MoreOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { TrainingJobStatus } from '../../types/training';
import useTrainingJobsStore from '../../store/trainingJobsStore';
import TrainingLauncher from '../../components/training/TrainingLauncher';
import JobProgressDashboard from '../../components/training/JobProgressDashboard';
import TrainingReadinessOverview from '../../components/training/TrainingReadinessOverview';
// import type { CategoryValueReadiness } from '../../components/training/TrainingReadinessOverview';

const { Content, Header } = Layout;
const { Title, Text } = Typography;

const TrainingDashboard: React.FC = () => {
  const [launcherVisible, setLauncherVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedReadyItems, setSelectedReadyItems] = useState<any[]>([]);

  const {
    jobs: jobsRaw,
    selectedJobId,
    fetchJobs,
    selectJob,
    cancelJob,
    deleteJob,
    retryJob,
  } = useTrainingJobsStore();

  // Defensive: ensure jobs is always an array
  const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];

  // Load jobs on mount and periodically refresh
  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run once on mount

  // Get job statistics
  const getJobStats = () => {
    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === 'completed').length;
    const running = jobs.filter((j) =>
      ['preparing', 'augmenting', 'training', 'validating'].includes(j.status)
    ).length;
    const failed = jobs.filter((j) => j.status === 'failed').length;
    const queued = jobs.filter((j) => j.status === 'queued').length;

    return { total, completed, running, failed, queued };
  };

  const stats = getJobStats();

  // Handle job actions
  const handleViewDetails = (jobId: string) => {
    setSelectedJob(jobId);
    setDetailsVisible(true);
  };

  const handleCancelJob = async (jobId: string) => {
    Modal.confirm({
      title: 'Stop Training Job',
      content: 'Are you sure you want to stop this training job? The job will be cancelled and can be retried later.',
      okText: 'Yes, Stop Job',
      okType: 'danger',
      onOk: async () => {
        try {
          await cancelJob(jobId);
          message.success('Training job stopped');
        } catch (error: any) {
          message.error(error.message || 'Failed to stop job');
        }
      },
    });
  };

  const handleDeleteJob = async (jobId: string) => {
    Modal.confirm({
      title: 'Delete Training Job',
      content: 'Are you sure you want to permanently delete this training job? This action cannot be undone.',
      okText: 'Yes, Delete Job',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteJob(jobId);
          message.success('Training job deleted');
        } catch (error: any) {
          message.error(error.message || 'Failed to delete job');
        }
      },
    });
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await retryJob(jobId);
      message.success('Job retry initiated');
    } catch (error) {
      message.error('Failed to retry job');
    }
  };

  // Get status icon
  const getStatusIcon = (status: TrainingJobStatus['status']) => {
    const icons = {
      queued: <ClockCircleOutlined />,
      preparing: <LoadingOutlined spin />,
      augmenting: <LoadingOutlined spin />,
      training: <LoadingOutlined spin />,
      validating: <LoadingOutlined spin />,
      completed: <CheckCircleOutlined />,
      failed: <CloseCircleOutlined />,
      cancelled: <StopOutlined />,
      pending: <ClockCircleOutlined />,
      running: <LoadingOutlined spin />,
    };
    return icons[status] || null;
  };

  // Get status color
  const getStatusColor = (status: TrainingJobStatus['status']) => {
    const colors = {
      queued: 'default',
      preparing: 'processing',
      augmenting: 'processing',
      training: 'processing',
      validating: 'processing',
      completed: 'success',
      failed: 'error',
      cancelled: 'warning',
      pending: 'default',
      running: 'processing',
    };
    return colors[status] || 'default';
  };

  // Table columns
  const columns: ColumnsType<TrainingJobStatus> = [
    {
      title: 'Job ID',
      dataIndex: 'jobId',
      key: 'jobId',
      width: 150,
      render: (text: string) => (
        <Text copyable={{ text }} style={{ fontFamily: 'monospace' }}>
          {text ? text.substring(0, 12) + '...' : 'N/A'}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: TrainingJobStatus['status']) => (
        <Badge status={getStatusColor(status) as any} text={
          <Space>
            {getStatusIcon(status)}
            <span>{status.toUpperCase()}</span>
          </Space>
        } />
      ),
      filters: [
        { text: 'Queued', value: 'queued' },
        { text: 'Running', value: 'running' },
        { text: 'Completed', value: 'completed' },
        { text: 'Failed', value: 'failed' },
      ],
      onFilter: (value, record) => {
        if (value === 'running') {
          return ['preparing', 'augmenting', 'training', 'validating'].includes(record.status);
        }
        return record.status === value;
      },
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      width: 100,
      render: (progress: number, record) => (
        <Space direction="vertical" size="small">
          <Text>{progress}%</Text>
          {record.currentEpoch && record.totalEpochs && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Epoch {record.currentEpoch}/{record.totalEpochs}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Dataset',
      dataIndex: 'datasetVersionId',
      key: 'dataset',
      width: 120,
      render: (datasetId: string) => (
        <Tag>{datasetId ? datasetId.substring(0, 8) + '...' : 'N/A'}</Tag>
      ),
    },
    {
      title: 'Started',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 150,
      render: (date: string) => date ? new Date(date).toLocaleString() : 'Not started',
      sorter: (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      defaultSortOrder: 'descend',
    },
    {
      title: 'Duration',
      key: 'duration',
      width: 100,
      render: (_, record) => {
        if (!record.finishedAt) {
          const start = new Date(record.startedAt);
          const now = new Date();
          const diff = now.getTime() - start.getTime();
          const minutes = Math.floor(diff / 60000);
          return `${minutes}m`;
        } else {
          const start = new Date(record.startedAt);
          const end = new Date(record.finishedAt);
          const diff = end.getTime() - start.getTime();
          const minutes = Math.floor(diff / 60000);
          return `${minutes}m`;
        }
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => {
        const items = [
          {
            key: 'view',
            label: 'View Details',
            icon: <EyeOutlined />,
            onClick: () => handleViewDetails(record.jobId),
          },
          {
            key: 'retry',
            label: 'Retry Job',
            icon: <RedoOutlined />,
            onClick: () => handleRetryJob(record.jobId),
            disabled: record.status !== 'failed',
          },
          {
            key: 'cancel',
            label: 'Stop Job',
            icon: <StopOutlined />,
            danger: true,
            onClick: () => handleCancelJob(record.jobId),
            disabled: !['queued', 'pending', 'running', 'preparing', 'augmenting', 'training', 'validating'].includes(record.status),
          },
          {
            key: 'delete',
            label: 'Delete Job',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDeleteJob(record.jobId),
            disabled: ['queued', 'pending', 'running', 'preparing', 'augmenting', 'training', 'validating'].includes(record.status),
          },
        ];

        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button icon={<MoreOutlined />} size="small" />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <Layout>
      <Header style={{ background: '#fff', padding: '16px 24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <RocketOutlined /> Training Dashboard
            </Title>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => fetchJobs()}>
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setLauncherVisible(true)}
              >
                Start Training
              </Button>
            </Space>
          </Col>
        </Row>
      </Header>

      <Content style={{ padding: '24px' }}>
        {/* Training Readiness Overview */}
        <Card style={{ marginBottom: 24 }}>
          <TrainingReadinessOverview
            onTrainSelected={(items) => {
              setSelectedReadyItems(items);
              setLauncherVisible(true);
            }}
          />
        </Card>

        {/* Statistics Cards */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Jobs"
                value={stats.total}
                prefix={<RocketOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Running"
                value={stats.running}
                valueStyle={{ color: '#1890ff' }}
                prefix={stats.running > 0 ? <LoadingOutlined spin /> : <ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Completed"
                value={stats.completed}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Failed"
                value={stats.failed}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* Jobs Table */}
        <Card title="Training Jobs" bordered={false}>
          <Table
            columns={columns}
            dataSource={jobs}
            rowKey="jobId"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} jobs`,
            }}
            scroll={{ x: 1200 }}
            onRow={(record) => ({
              onClick: () => handleViewDetails(record.jobId),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>

        {/* Training Launcher Modal */}
        <TrainingLauncher
          visible={launcherVisible}
          onClose={() => {
            setLauncherVisible(false);
            setSelectedReadyItems([]);
          }}
          onSuccess={(jobId) => {
            handleViewDetails(jobId);
            setLauncherVisible(false);
            setSelectedReadyItems([]);
          }}
          preselectedItems={selectedReadyItems}
        />

        {/* Job Details Modal */}
        <Modal
          title="Training Job Details"
          open={detailsVisible && !!selectedJob}
          onCancel={() => {
            setDetailsVisible(false);
            setSelectedJob(null);
          }}
          width="90%"
          style={{ top: 20 }}
          footer={null}
        >
          {selectedJob && (
            <JobProgressDashboard
              jobId={selectedJob}
              onClose={() => {
                setDetailsVisible(false);
                setSelectedJob(null);
              }}
            />
          )}
        </Modal>
      </Content>
    </Layout>
  );
};

export default TrainingDashboard;