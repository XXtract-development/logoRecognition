import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Card, Progress, Badge, Button, List, Collapse, Space, Spin, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, ReloadOutlined, ApiOutlined } from '@ant-design/icons';
import styles from './HealthCheck.module.css';

const { Panel } = Collapse;
const { Text, Title } = Typography;

interface EndpointCheck {
  endpoint: string;
  method: string;
  status: 'pending' | 'checking' | 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  error?: string;
  required: boolean;
}

interface ServiceStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
}

interface HealthStatus {
  overall: 'healthy' | 'unhealthy' | 'degraded' | 'checking';
  services: ServiceStatus[];
  endpoints: EndpointCheck[];
  lastChecked?: Date;
}

const CRITICAL_ENDPOINTS = [
  { endpoint: '/health', method: 'GET', required: true },
  { endpoint: '/api/v1/logos', method: 'GET', required: true },
  { endpoint: '/api/v1/training/dataset', method: 'GET', required: true },
  { endpoint: '/api/v1/training/jobs', method: 'GET', required: true },
  { endpoint: '/api/training/readiness', method: 'GET', required: true },
  { endpoint: '/api/categories', method: 'GET', required: true },
];

const HealthCheck: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>({
    overall: 'checking',
    services: [],
    endpoints: CRITICAL_ENDPOINTS.map(ep => ({ ...ep, status: 'pending' })),
  });
  const [isChecking, setIsChecking] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [checkProgress, setCheckProgress] = useState(0);

  const checkEndpoint = async (endpoint: EndpointCheck): Promise<EndpointCheck> => {
    const startTime = Date.now();
    try {
      // Create an AbortController for timeout compatibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://localhost:8000${endpoint.endpoint}`, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;

      if (response.ok || response.status === 404) { // 404 might be expected for some endpoints
        return {
          ...endpoint,
          status: response.ok ? 'healthy' : 'degraded',
          responseTime,
        };
      } else {
        return {
          ...endpoint,
          status: 'unhealthy',
          responseTime,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      return {
        ...endpoint,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    setCheckProgress(0);

    // First check the main health endpoint
    try {
      const healthResponse = await fetch('http://localhost:8000/health', {
        signal: AbortSignal.timeout(5000),
      });

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();

        // If we have detailed health data, use it
        if (healthData.services) {
          setHealthStatus(prev => ({
            ...prev,
            services: Object.entries(healthData.services).map(([key, value]: [string, any]) => ({
              service: key,
              status: value.status,
              latency: value.latency_ms,
              error: value.error,
            })),
          }));
        }
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }

    // Check all critical endpoints
    const endpointResults: EndpointCheck[] = [];
    const totalEndpoints = CRITICAL_ENDPOINTS.length;

    for (let i = 0; i < totalEndpoints; i++) {
      const endpoint = CRITICAL_ENDPOINTS[i];
      const result = await checkEndpoint({ ...endpoint, status: 'checking' });
      endpointResults.push(result);
      setCheckProgress(((i + 1) / totalEndpoints) * 100);

      // Update status incrementally
      setHealthStatus(prev => ({
        ...prev,
        endpoints: [
          ...endpointResults,
          ...prev.endpoints.slice(endpointResults.length),
        ],
      }));
    }

    // Determine overall status
    const hasUnhealthyRequired = endpointResults.some(ep => ep.required && ep.status === 'unhealthy');
    const hasDegraded = endpointResults.some(ep => ep.status === 'degraded');

    const overallStatus = hasUnhealthyRequired ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    setHealthStatus({
      overall: overallStatus,
      services: healthStatus.services,
      endpoints: endpointResults,
      lastChecked: new Date(),
    });

    setIsChecking(false);
  }, []);

  useEffect(() => {
    // Initial check on component mount
    checkHealth();

    // Set up auto-check interval if enabled
    if (autoCheck) {
      const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoCheck, checkHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'unhealthy':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
      case 'degraded':
        return <WarningOutlined style={{ color: '#faad14' }} />;
      default:
        return <Spin size="small" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge status="success" text="Healthy" />;
      case 'unhealthy':
        return <Badge status="error" text="Unhealthy" />;
      case 'degraded':
        return <Badge status="warning" text="Degraded" />;
      default:
        return <Badge status="processing" text="Checking" />;
    }
  };

  return (
    <Card
      title={
        <Space>
          <ApiOutlined />
          <span>System Health Check</span>
        </Space>
      }
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined spin={isChecking} />}
            onClick={checkHealth}
            loading={isChecking}
          >
            Check Now
          </Button>
          <Button
            type={autoCheck ? 'primary' : 'default'}
            onClick={() => setAutoCheck(!autoCheck)}
          >
            Auto-Check: {autoCheck ? 'ON' : 'OFF'}
          </Button>
        </Space>
      }
    >
      {/* Overall Status Alert */}
      {healthStatus.overall === 'unhealthy' && (
        <Alert
          message="System Health Critical"
          description="Some required services or endpoints are not responding. Please check the details below."
          type="error"
          showIcon
          className={styles.alert}
        />
      )}
      {healthStatus.overall === 'degraded' && (
        <Alert
          message="System Partially Degraded"
          description="Some services are experiencing issues but the system is operational."
          type="warning"
          showIcon
          className={styles.alert}
        />
      )}
      {healthStatus.overall === 'healthy' && (
        <Alert
          message="All Systems Operational"
          description="All services and endpoints are responding normally."
          type="success"
          showIcon
          className={styles.alert}
        />
      )}

      {/* Progress Bar */}
      {isChecking && (
        <Progress
          percent={checkProgress}
          status="active"
          strokeColor={{
            '0%': '#108ee9',
            '100%': '#87d068',
          }}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Services Status */}
      {healthStatus.services.length > 0 && (
        <Collapse defaultActiveKey={['services']} style={{ marginBottom: 16 }}>
          <Panel
            header={
              <Space>
                <span>External Services</span>
                {getStatusBadge(
                  healthStatus.services.every(s => s.status === 'healthy')
                    ? 'healthy'
                    : healthStatus.services.some(s => s.status === 'unhealthy')
                    ? 'unhealthy'
                    : 'degraded'
                )}
              </Space>
            }
            key="services"
          >
            <List
              dataSource={healthStatus.services}
              renderItem={(service) => (
                <List.Item>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      {getStatusIcon(service.status)}
                      <Text strong>{service.service}</Text>
                    </Space>
                    <Space>
                      {service.latency && (
                        <Text type="secondary">{service.latency.toFixed(0)}ms</Text>
                      )}
                      {service.error && (
                        <Text type="danger">{service.error}</Text>
                      )}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          </Panel>
        </Collapse>
      )}

      {/* Endpoints Status */}
      <Collapse defaultActiveKey={['endpoints']}>
        <Panel
          header={
            <Space>
              <span>API Endpoints</span>
              {getStatusBadge(healthStatus.overall)}
            </Space>
          }
          key="endpoints"
        >
          <List
            dataSource={healthStatus.endpoints}
            renderItem={(endpoint) => (
              <List.Item>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    {getStatusIcon(endpoint.status)}
                    <Text code>{endpoint.method}</Text>
                    <Text>{endpoint.endpoint}</Text>
                    {endpoint.required && <Badge count="Required" style={{ backgroundColor: '#1890ff' }} />}
                  </Space>
                  <Space>
                    {endpoint.responseTime && (
                      <Text type="secondary">{endpoint.responseTime}ms</Text>
                    )}
                    {endpoint.error && (
                      <Text type="danger">{endpoint.error}</Text>
                    )}
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </Panel>
      </Collapse>

      {/* Last Checked */}
      {healthStatus.lastChecked && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary">
            Last checked: {healthStatus.lastChecked.toLocaleTimeString()}
          </Text>
        </div>
      )}
    </Card>
  );
};

export default HealthCheck;