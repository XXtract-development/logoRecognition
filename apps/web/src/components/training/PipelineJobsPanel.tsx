/**
 * Pipeline Jobs Panel (Epic 9, Story 9.1)
 *
 * Shows BullMQ pipeline jobs with their current status.
 * Failed jobs display their failedReason and a retry action.
 * Listens for live updates via Socket.IO `pipeline_job_update` events.
 *
 * data-testids (required by e2e tests):
 *   pipeline-jobs-panel    — root container
 *   pipeline-job-row       — one row per job
 */
import React, { memo, useEffect } from 'react';
import { Table, Tag, Button, Tooltip, Space, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const { Text } = Typography;

// ============================================
// Types
// ============================================

interface PipelineJob {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'not_found';
  failedReason?: string;
  retryable?: boolean;
  progress?: number | object;
  data?: unknown;
}

interface PipelineJobsPanelProps {
  /** List of job IDs to display — passed by the parent. */
  jobIds?: string[];
}

// ============================================
// Helpers
// ============================================

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  waiting: { color: '#B7D945', icon: <ClockCircleOutlined />, label: 'Waiting' },
  active: { color: '#54949E', icon: <LoadingOutlined spin />, label: 'Active' },
  completed: { color: '#B7D945', icon: <CheckCircleOutlined />, label: 'Completed' },
  failed: { color: '#D64545', icon: <CloseCircleOutlined />, label: 'Failed' },
  delayed: { color: '#2F5A7A', icon: <SyncOutlined spin />, label: 'Delayed' },
  not_found: { color: '#E2E8F0', icon: null, label: 'Not found' },
};

function getStatusConfig(state: string) {
  return STATUS_CONFIG[state] ?? STATUS_CONFIG.not_found;
}

async function retryPipelineJob(jobId: string): Promise<void> {
  await axios.post(`/api/v1/pipeline/jobs/${jobId}/retry`);
}

// ============================================
// Component
// ============================================

const PipelineJobsPanel = memo<PipelineJobsPanelProps>(({ jobIds = [] }) => {
  const queryClient = useQueryClient();

  // Fetch job statuses
  const { data: jobs = [], isLoading } = useQuery<PipelineJob[]>({
    queryKey: ['pipeline-jobs', jobIds],
    queryFn: async () => {
      if (jobIds.length === 0) return [];
      const results = await Promise.all(
        jobIds.map((id) =>
          axios
            .get<PipelineJob>(`/api/v1/pipeline/jobs/${id}`)
            .then((r) => r.data)
            .catch(() => ({ id, state: 'not_found' as const, retryable: false }))
        )
      );
      return results;
    },
    refetchInterval: 5000, // poll every 5s for live updates
    enabled: jobIds.length > 0,
  });

  // Listen for Socket.IO pipeline_job_update events
  useEffect(() => {
    // Invalidate the query when a socket event arrives
    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-jobs'] });
    };

    // Socket.IO client is attached to window by the existing hook in the app
    const socket = (window as unknown as { _ioSocket?: { on: (ev: string, cb: () => void) => void; off: (ev: string, cb: () => void) => void } })._ioSocket;
    if (socket) {
      socket.on('pipeline_job_update', handleUpdate);
      return () => {
        socket.off('pipeline_job_update', handleUpdate);
      };
    }
    return undefined;
  }, [queryClient]);

  const columns = [
    {
      title: 'Job ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <Text
          copyable={{ text: id }}
          style={{ fontSize: 12, fontFamily: 'monospace', color: '#1E293B' }}
        >
          {id.length > 20 ? `${id.slice(0, 20)}…` : id}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'state',
      key: 'state',
      width: 130,
      render: (state: string) => {
        const cfg = getStatusConfig(state);
        return (
          <Tag
            icon={cfg.icon}
            style={{
              color: state === 'failed' ? '#fff' : '#1E293B',
              background: cfg.color,
              border: 'none',
            }}
          >
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: 'Details / Error',
      key: 'details',
      render: (_: unknown, record: PipelineJob) => {
        if (record.state === 'failed' && record.failedReason) {
          return (
            <Text type="danger" style={{ fontSize: 12 }}>
              {record.failedReason}
            </Text>
          );
        }
        return null;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: PipelineJob) => {
        if (record.state !== 'failed' || !record.retryable) return null;
        return (
          <Space>
            <Tooltip title="Restart job">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={() => retryPipelineJob(record.id)}
                style={{ color: '#2F5A7A' }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div data-testid="pipeline-jobs-panel">
      <Table
        dataSource={jobs}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        pagination={false}
        onRow={() => ({ 'data-testid': 'pipeline-job-row' } as React.HTMLAttributes<HTMLElement>)}
        locale={{ emptyText: 'No pipeline jobs' }}
      />
    </div>
  );
});

PipelineJobsPanel.displayName = 'PipelineJobsPanel';

export { PipelineJobsPanel };
