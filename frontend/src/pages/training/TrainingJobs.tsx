// Training Jobs Management Page
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
  Typography,
  Badge,
  Dropdown,
  Modal,
  message,
  Input,
  Select,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  FilterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  EyeOutlined,
  DeleteOutlined,
  RedoOutlined,
  MoreOutlined,
  StopOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { TrainingJobStatus } from '../../types/training';
import useTrainingJobsStore from '../../store/trainingJobsStore';
import TrainingLauncher from '../../components/training/TrainingLauncher';
import JobProgressDashboard from '../../components/training/JobProgressDashboard';

const { Content, Header } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const TrainingJobs: React.FC = () => {
  const [launcherVisible, setLauncherVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<any>(null);

  const {
    jobs: jobsRaw,
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

  // Filter jobs based on search and filters
  const filteredJobs = jobs.filter(job => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      if (
        !job.jobId?.toLowerCase().includes(searchLower) &&
        !job.datasetVersionId?.toLowerCase().includes(searchLower) &&
        !job.status?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'running') {
        if (!['preparing', 'augmenting', 'training', 'validating'].includes(job.status)) {
          return false;
        }
      } else if (job.status !== statusFilter) {
        return false;
      }
    }

    // Date range filter
    if (dateRange && dateRange.length === 2) {
      const jobDate = new Date(job.startedAt);
      const [startDate, endDate] = dateRange;
      if (jobDate < startDate || jobDate > endDate) {
        return false;
      }
    }

    return true;
  });

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

  const handleBulkDelete = () => {
    const completedJobs = filteredJobs.filter(
      job => job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
    );

    if (completedJobs.length === 0) {
      message.info('No completed, failed, or cancelled jobs to delete');
      return;
    }

    Modal.confirm({
      title: 'Bulk Delete Jobs',
      content: `Are you sure you want to delete ${completedJobs.length} finished jobs? This action cannot be undone.`,
      okText: 'Yes, Delete All',
      okType: 'danger',
      onOk: async () => {
        let deleted = 0;
        for (const job of completedJobs) {
          try {
            await deleteJob(job.jobId);
            deleted++;
          } catch (error) {
            console.error(`Failed to delete job ${job.jobId}:`, error);
          }
        }
        message.success(`Successfully deleted ${deleted} jobs`);
      },
    });
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

  // Calculate job statistics
  const getJobStats = () => {
    const total = filteredJobs.length;
    const completed = filteredJobs.filter(j => j.status === 'completed').length;
    const running = filteredJobs.filter(j =>
      ['preparing', 'augmenting', 'training', 'validating'].includes(j.status)
    ).length;
    const failed = filteredJobs.filter(j => j.status === 'failed').length;
    const queued = filteredJobs.filter(j => j.status === 'queued').length;

    return { total, completed, running, failed, queued };
  };

  const stats = getJobStats();

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
              <HistoryOutlined /> Training Jobs Management
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
                Start New Job
              </Button>
            </Space>
          </Col>
        </Row>
      </Header>

      <Content style={{ padding: '24px' }}>
        {/* Statistics Cards */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Total Jobs</Text>
                <Title level={3} style={{ margin: 0 }}>
                  <RocketOutlined /> {stats.total}
                </Title>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Running</Text>
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                  {stats.running > 0 ? <LoadingOutlined spin /> : <ClockCircleOutlined />} {stats.running}
                </Title>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Completed</Text>
                <Title level={3} style={{ margin: 0, color: '#52c41a' }}>
                  <CheckCircleOutlined /> {stats.completed}
                </Title>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text type="secondary">Failed</Text>
                <Title level={3} style={{ margin: 0, color: '#ff4d4f' }}>
                  <CloseCircleOutlined /> {stats.failed}
                </Title>
              </Space>
            </Card>
          </Col>
        </Row>

        {/* Filters and Search */}
        <Card style={{ marginBottom: 16 }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap>
              <Input
                placeholder="Search by Job ID or Dataset..."
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: 250 }}
              />

              <Select
                placeholder="Filter by Status"
                style={{ width: 150 }}
                value={statusFilter}
                onChange={setStatusFilter}
                allowClear
              >
                <Option value="all">All Status</Option>
                <Option value="queued">Queued</Option>
                <Option value="running">Running</Option>
                <Option value="completed">Completed</Option>
                <Option value="failed">Failed</Option>
                <Option value="cancelled">Cancelled</Option>
              </Select>

              <RangePicker
                onChange={(dates) => setDateRange(dates)}
                placeholder={['Start Date', 'End Date']}
              />
            </Space>

            <Space>
              {(searchTerm || statusFilter || dateRange) && (
                <Button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter(null);
                    setDateRange(null);
                  }}
                >
                  Clear Filters
                </Button>
              )}

              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleBulkDelete}
                disabled={stats.completed + stats.failed === 0}
              >
                Clean Up Old Jobs
              </Button>
            </Space>
          </Space>
        </Card>

        {/* Jobs Table */}
        <Card title={`Training Jobs (${filteredJobs.length} results)`} bordered={false}>
          <Table
            columns={columns}
            dataSource={filteredJobs}
            rowKey="jobId"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} jobs`,
              showQuickJumper: true,
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
          onClose={() => setLauncherVisible(false)}
          onSuccess={(jobId) => {
            handleViewDetails(jobId);
            setLauncherVisible(false);
          }}
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

export default TrainingJobs;