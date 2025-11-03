// Log Viewer Component for Training Logs (US-014)
import React, { useRef, useEffect } from 'react';
import { List, Tag, Typography, Space, Button, Switch, Input } from 'antd';
import {
  DownloadOutlined,
  ClearOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { TrainingLog } from '../../types/training';
import trainingJobService from '../../services/training/TrainingJobService';

const { Text, Paragraph } = Typography;
const { Search } = Input;

interface LogViewerProps {
  logs: TrainingLog[];
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
  jobId: string;
}

const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  autoScroll,
  onAutoScrollChange,
  jobId,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState<'all' | 'info' | 'warning' | 'error'>('all');

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Download logs
  const handleDownload = async () => {
    try {
      const blob = await trainingJobService.downloadTrainingLogs(jobId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training-logs-${jobId}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download logs:', error);
    }
  };

  // Clear logs from view (not from server)
  const handleClear = () => {
    // This would typically clear from a local state
    // For now, we just reset the filter
    setFilter('');
    setLevelFilter('all');
  };

  // Get level color
  const getLevelColor = (level: TrainingLog['level']) => {
    const colors = {
      info: 'blue',
      warning: 'orange',
      error: 'red',
    };
    return colors[level] || 'default';
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesText = !filter || log.message.toLowerCase().includes(filter.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    return matchesText && matchesLevel;
  });

  return (
    <div>
      {/* Controls */}
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Search
            placeholder="Search logs..."
            allowClear
            onSearch={setFilter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
          />
          <Button.Group>
            <Button
              type={levelFilter === 'all' ? 'primary' : 'default'}
              onClick={() => setLevelFilter('all')}
            >
              All
            </Button>
            <Button
              type={levelFilter === 'info' ? 'primary' : 'default'}
              onClick={() => setLevelFilter('info')}
            >
              Info
            </Button>
            <Button
              type={levelFilter === 'warning' ? 'primary' : 'default'}
              onClick={() => setLevelFilter('warning')}
            >
              Warning
            </Button>
            <Button
              type={levelFilter === 'error' ? 'primary' : 'default'}
              onClick={() => setLevelFilter('error')}
            >
              Error
            </Button>
          </Button.Group>
        </Space>
        <Space>
          <Switch
            checked={autoScroll}
            onChange={onAutoScrollChange}
            checkedChildren="Auto-scroll"
            unCheckedChildren="Manual"
          />
          <Button icon={<ClearOutlined />} onClick={handleClear}>
            Clear
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload}>
            Download
          </Button>
        </Space>
      </Space>

      {/* Log List */}
      <div
        ref={listRef}
        style={{
          height: 400,
          overflowY: 'auto',
          border: '1px solid #f0f0f0',
          borderRadius: 4,
          padding: '8px 0',
          backgroundColor: '#fafafa',
        }}
      >
        <List
          size="small"
          dataSource={filteredLogs}
          renderItem={(log, index) => (
            <List.Item
              key={index}
              style={{
                padding: '4px 16px',
                borderBottom: '1px solid #f0f0f0',
                backgroundColor: log.level === 'error' ? '#fff2f0' : 'white',
              }}
            >
              <Space style={{ width: '100%' }}>
                <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </Text>
                <Tag color={getLevelColor(log.level)} style={{ margin: 0 }}>
                  {log.level.toUpperCase()}
                </Tag>
                <Paragraph
                  style={{
                    margin: 0,
                    flex: 1,
                    fontFamily: 'monospace',
                    fontSize: 13,
                  }}
                  copyable
                >
                  {log.message}
                </Paragraph>
              </Space>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div style={{ marginTop: 4, paddingLeft: 120 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                    {JSON.stringify(log.metadata)}
                  </Text>
                </div>
              )}
            </List.Item>
          )}
          locale={{ emptyText: 'No logs to display' }}
        />
      </div>

      {/* Status Bar */}
      <div style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Showing {filteredLogs.length} of {logs.length} log entries
        </Text>
      </div>
    </div>
  );
};

export default LogViewer;