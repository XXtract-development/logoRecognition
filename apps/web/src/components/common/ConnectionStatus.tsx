/**
 * Connection Status Component
 * Displays the current backend connection status
 */

import React from 'react';
import { Badge, Tooltip, Button, Space, Typography, Popover } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  ApiOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { useBackendStatus } from '@/contexts/BackendStatusContext';

const { Text } = Typography;

interface ConnectionStatusProps {
  /** Show detailed status in a popover */
  showDetails?: boolean;
  /** Show as a badge or inline status */
  variant?: 'badge' | 'inline' | 'minimal';
  /** Custom className */
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  showDetails = true,
  variant = 'badge',
  className,
}) => {
  const { isHealthy, isChecking, lastCheck, error, checkHealth } = useBackendStatus();

  const getStatusIcon = () => {
    if (isChecking) {
      return <LoadingOutlined spin style={{ color: '#1890ff' }} />;
    }
    if (isHealthy) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
    return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
  };

  const getStatusText = () => {
    if (isChecking) return 'Checking...';
    if (isHealthy) return 'Connected';
    return 'Disconnected';
  };

  const getStatusColor = (): 'success' | 'error' | 'processing' | 'default' => {
    if (isChecking) return 'processing';
    if (isHealthy) return 'success';
    return 'error';
  };

  const detailsContent = (
    <div style={{ maxWidth: 280 }}>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Space>
          <ApiOutlined />
          <Text>API:</Text>
          {lastCheck?.api ? (
            <Text type="success">Online</Text>
          ) : (
            <Text type="danger">Offline</Text>
          )}
        </Space>

        <Space>
          <CloudServerOutlined />
          <Text>WebSocket:</Text>
          {lastCheck?.websocket ? (
            <Text type="success">Available</Text>
          ) : (
            <Text type="danger">Unavailable</Text>
          )}
        </Space>

        {lastCheck?.latency !== undefined && (
          <Text type="secondary">Latency: {lastCheck.latency}ms</Text>
        )}

        {error && (
          <Text type="danger" style={{ fontSize: 12 }}>
            {error}
          </Text>
        )}

        {lastCheck?.timestamp && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            Last check: {new Date(lastCheck.timestamp).toLocaleTimeString()}
          </Text>
        )}

        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => checkHealth()}
          loading={isChecking}
          style={{ marginTop: 8 }}
        >
          Refresh
        </Button>
      </Space>
    </div>
  );

  if (variant === 'minimal') {
    return (
      <Tooltip title={getStatusText()}>
        <span className={className}>{getStatusIcon()}</span>
      </Tooltip>
    );
  }

  if (variant === 'inline') {
    const content = (
      <Space className={className}>
        {getStatusIcon()}
        <Text>{getStatusText()}</Text>
      </Space>
    );

    if (showDetails) {
      return (
        <Popover content={detailsContent} title="Connection Status" trigger="click">
          <span style={{ cursor: 'pointer' }}>{content}</span>
        </Popover>
      );
    }

    return content;
  }

  // Badge variant (default)
  const badge = (
    <Badge
      status={getStatusColor()}
      text={getStatusText()}
      className={className}
    />
  );

  if (showDetails) {
    return (
      <Popover content={detailsContent} title="Connection Status" trigger="click">
        <span style={{ cursor: 'pointer' }}>{badge}</span>
      </Popover>
    );
  }

  return badge;
};

/**
 * Offline Banner Component
 * Shows a banner when backend is not available
 */
export const OfflineBanner: React.FC = () => {
  const { isHealthy, isChecking, error, checkHealth } = useBackendStatus();

  if (isHealthy || isChecking) {
    return null;
  }

  return (
    <div
      style={{
        background: '#fff2e8',
        border: '1px solid #ffbb96',
        borderRadius: 4,
        padding: '8px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Space>
        <CloseCircleOutlined style={{ color: '#fa541c' }} />
        <Text>
          Backend services are currently unavailable.
          {error && <Text type="secondary"> ({error})</Text>}
        </Text>
      </Space>
      <Button
        size="small"
        onClick={() => checkHealth()}
        icon={<ReloadOutlined />}
      >
        Retry
      </Button>
    </div>
  );
};

export default ConnectionStatus;
