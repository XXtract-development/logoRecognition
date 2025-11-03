/**
 * Error Fallback UI Components
 * US-013: Error Boundaries & Recovery - Fallback UI components
 */

import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Typography,
  Space,
  Alert,
  Progress,
  Steps,
  Result,
  Tooltip,
  Tag
} from 'antd';
import {
  ReloadOutlined,
  BugOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  HomeOutlined,
  SafetyOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

/**
 * Main Error Fallback Component
 */
const ErrorFallback = ({
  error,
  errorInfo,
  onRetry,
  onReload,
  onReport,
  canRetry = true,
  retryCount = 0,
  maxRetries = 3,
  isRecovering = false,
  userMessage,
  errorLevel = 'error',
  showDetails = false,
}) => {
  const [autoRetryCountdown, setAutoRetryCountdown] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(showDetails);

  // Auto-retry countdown for certain error types
  useEffect(() => {
    if (errorLevel === 'warning' && canRetry && retryCount === 0) {
      let countdown = 10;
      setAutoRetryCountdown(countdown);

      const timer = setInterval(() => {
        countdown -= 1;
        setAutoRetryCountdown(countdown);

        if (countdown <= 0) {
          clearInterval(timer);
          setAutoRetryCountdown(null);
          onRetry();
        }
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [errorLevel, canRetry, retryCount, onRetry]);

  const getIcon = () => {
    switch (errorLevel) {
      case 'warning':
        return <WarningOutlined style={{ fontSize: '48px', color: '#faad14' }} />;
      case 'info':
        return <InfoCircleOutlined style={{ fontSize: '48px', color: '#1890ff' }} />;
      default:
        return <ExclamationCircleOutlined style={{ fontSize: '48px', color: '#ff4d4f' }} />;
    }
  };

  const getResultStatus = () => {
    switch (errorLevel) {
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'error';
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <Result
        icon={getIcon()}
        title={userMessage?.title || 'Something went wrong'}
        subTitle={userMessage?.description || 'An unexpected error occurred'}
        status={getResultStatus()}
        extra={
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Auto-retry countdown */}
            {autoRetryCountdown !== null && (
              <Alert
                message={`Auto-retry in ${autoRetryCountdown} seconds`}
                type="info"
                showIcon
                icon={<ClockCircleOutlined />}
                action={
                  <Button
                    size="small"
                    onClick={() => setAutoRetryCountdown(null)}
                  >
                    Cancel
                  </Button>
                }
              />
            )}

            {/* Recovery progress */}
            {isRecovering && (
              <Card size="small">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text>Attempting to recover...</Text>
                  <Progress
                    percent={100}
                    status="active"
                    showInfo={false}
                    strokeColor={{
                      '0%': '#108ee9',
                      '100%': '#87d068',
                    }}
                  />
                </Space>
              </Card>
            )}

            {/* Error details */}
            <Alert
              message={
                <Space>
                  <span>Error Details</span>
                  <Tag color={errorLevel === 'error' ? 'red' : 'orange'}>
                    ID: {error?.name || 'Unknown'}
                  </Tag>
                </Space>
              }
              description={error?.message || 'No error message available'}
              type={errorLevel}
              showIcon
              style={{ textAlign: 'left' }}
            />

            {/* Retry progress */}
            {maxRetries > 1 && (
              <Card size="small" title="Recovery Attempts">
                <Steps
                  current={retryCount}
                  status={canRetry ? 'process' : 'error'}
                  size="small"
                >
                  {Array.from({ length: maxRetries }, (_, index) => (
                    <Step
                      key={index}
                      title={`Attempt ${index + 1}`}
                      description={
                        index < retryCount ? 'Failed' :
                        index === retryCount ? (isRecovering ? 'Retrying...' : 'Current') :
                        'Pending'
                      }
                      icon={
                        index < retryCount ? <ExclamationCircleOutlined /> :
                        index === retryCount && isRecovering ? <ReloadOutlined spin /> :
                        undefined
                      }
                    />
                  ))}
                </Steps>
              </Card>
            )}

            {/* Action buttons */}
            <Space size="middle" wrap>
              {canRetry && !isRecovering && autoRetryCountdown === null && (
                <Tooltip title={`${retryCount}/${maxRetries} attempts used`}>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={onRetry}
                    size="large"
                  >
                    Try Again
                  </Button>
                </Tooltip>
              )}

              <Button
                icon={<ReloadOutlined />}
                onClick={onReload}
                size="large"
              >
                Refresh Page
              </Button>

              <Button
                icon={<HomeOutlined />}
                onClick={() => window.location.href = '/'}
                size="large"
              >
                Go Home
              </Button>

              <Button
                icon={<BugOutlined />}
                onClick={onReport}
                size="large"
              >
                Report Issue
              </Button>
            </Space>

            {/* Developer details toggle */}
            {process.env.NODE_ENV === 'development' && (
              <Button
                type="link"
                onClick={() => setDetailsVisible(!detailsVisible)}
                icon={<InfoCircleOutlined />}
              >
                {detailsVisible ? 'Hide' : 'Show'} Developer Details
              </Button>
            )}
          </Space>
        }
      />

      {/* Developer details */}
      {detailsVisible && process.env.NODE_ENV === 'development' && (
        <DeveloperDetails error={error} errorInfo={errorInfo} />
      )}
    </div>
  );
};

/**
 * Developer Details Component
 */
const DeveloperDetails = ({ error, errorInfo }) => (
  <Card
    title="Developer Information"
    style={{ marginTop: '24px', textAlign: 'left' }}
    extra={<SafetyOutlined />}
  >
    <Space direction="vertical" style={{ width: '100%' }}>
      <div>
        <Title level={5}>Error Stack:</Title>
        <pre style={{
          background: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {error?.stack || 'No stack trace available'}
        </pre>
      </div>

      <div>
        <Title level={5}>Component Stack:</Title>
        <pre style={{
          background: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '12px',
          overflow: 'auto',
          maxHeight: '200px'
        }}>
          {errorInfo?.componentStack || 'No component stack available'}
        </pre>
      </div>

      <div>
        <Title level={5}>Environment:</Title>
        <ul style={{ fontSize: '12px' }}>
          <li><strong>User Agent:</strong> {navigator.userAgent}</li>
          <li><strong>URL:</strong> {window.location.href}</li>
          <li><strong>Timestamp:</strong> {new Date().toISOString()}</li>
          <li><strong>Memory:</strong> {
            performance.memory ?
            `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB` :
            'N/A'
          }</li>
        </ul>
      </div>
    </Space>
  </Card>
);

/**
 * Minimal Error Fallback for nested components
 */
export const MinimalErrorFallback = ({
  error,
  onRetry,
  message = "Something went wrong"
}) => (
  <div style={{
    padding: '16px',
    textAlign: 'center',
    background: '#fff2f0',
    border: '1px solid #ffccc7',
    borderRadius: '4px',
    margin: '8px 0'
  }}>
    <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: '8px' }} />
    <Text type="secondary">{message}</Text>
    {onRetry && (
      <Button
        type="link"
        size="small"
        icon={<ReloadOutlined />}
        onClick={onRetry}
        style={{ marginLeft: '8px' }}
      >
        Retry
      </Button>
    )}
  </div>
);

/**
 * Network Error Fallback
 */
export const NetworkErrorFallback = ({ onRetry, onGoOffline }) => (
  <Result
    icon={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
    title="Connection Lost"
    subTitle="Unable to connect to the server. Please check your internet connection."
    extra={
      <Space>
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          Try Again
        </Button>
        {onGoOffline && (
          <Button icon={<SafetyOutlined />} onClick={onGoOffline}>
            Work Offline
          </Button>
        )}
      </Space>
    }
  />
);

/**
 * Chunk Load Error Fallback
 */
export const ChunkLoadErrorFallback = ({ onReload }) => (
  <Result
    icon={<WarningOutlined style={{ color: '#faad14' }} />}
    title="Update Available"
    subTitle="A new version of the application is available. Please refresh to get the latest features."
    extra={
      <Button type="primary" icon={<ReloadOutlined />} onClick={onReload}>
        Refresh Now
      </Button>
    }
  />
);

/**
 * Permission Error Fallback
 */
export const PermissionErrorFallback = ({ onGoHome, onContactSupport }) => (
  <Result
    status="403"
    title="Access Denied"
    subTitle="You don't have permission to access this resource."
    extra={
      <Space>
        <Button type="primary" icon={<HomeOutlined />} onClick={onGoHome}>
          Go Home
        </Button>
        {onContactSupport && (
          <Button icon={<BugOutlined />} onClick={onContactSupport}>
            Contact Support
          </Button>
        )}
      </Space>
    }
  />
);

/**
 * Loading Error Fallback with retry capability
 */
export const LoadingErrorFallback = ({
  onRetry,
  isRetrying = false,
  message = "Failed to load content"
}) => (
  <div style={{
    padding: '48px 24px',
    textAlign: 'center',
    background: '#fafafa',
    borderRadius: '8px',
    border: '1px dashed #d9d9d9'
  }}>
    <ExclamationCircleOutlined
      style={{
        fontSize: '32px',
        color: '#faad14',
        marginBottom: '16px'
      }}
    />
    <Title level={4}>{message}</Title>
    <Button
      type="primary"
      icon={<ReloadOutlined />}
      onClick={onRetry}
      loading={isRetrying}
    >
      {isRetrying ? 'Retrying...' : 'Try Again'}
    </Button>
  </div>
);

export default ErrorFallback;