import React, { useEffect, useState, useCallback } from 'react';
import { Card, Typography, Statistic, Row, Col, Table, Tag, Spin, Alert, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileImageOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  fetchDashboardStats,
  addDemoData,
  type DashboardStats,
  type RecentActivity,
} from '@/services/dashboardService';

const { Title } = Typography;

const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchDashboardStats();
      setStats(response.stats);
      setRecentActivity(response.recentActivity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddDemoData = useCallback(async () => {
    await addDemoData();
    await loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadStats();

    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const columns = [
    { title: t('dashboard.image', 'Image'), dataIndex: 'image', key: 'image' },
    { title: t('dashboard.logosFound', 'Logos Found'), dataIndex: 'logos', key: 'logos' },
    {
      title: t('dashboard.confidence', 'Confidence'),
      dataIndex: 'confidence',
      key: 'confidence',
      render: (conf: number) => (
        <Tag color={conf >= 0.9 ? 'green' : conf >= 0.7 ? 'orange' : 'red'}>
          {(conf * 100).toFixed(0)}%
        </Tag>
      ),
    },
    { title: t('dashboard.time', 'Time'), dataIndex: 'time', key: 'time' },
  ];

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-neutral-50 p-4 flex items-center justify-center">
        <Spin size="large">
          <div className="pt-8 text-gray-500">{t('dashboard.loading', 'Loading statistics...')}</div>
        </Spin>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <Title level={2}>{t('dashboard.title', 'Dashboard')}</Title>
          <div className="flex gap-2">
            {import.meta.env.DEV && (
              <Button onClick={handleAddDemoData} disabled={loading}>
                Add Demo Data
              </Button>
            )}
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={loadStats}
              disabled={loading}
            >
              {t('dashboard.refresh', 'Refresh')}
            </Button>
          </div>
        </div>

        {error && (
          <Alert
            message={t('dashboard.error', 'Error loading statistics')}
            description={error}
            type="error"
            showIcon
            className="mb-4"
            action={
              <Button size="small" onClick={loadStats}>
                {t('dashboard.retry', 'Retry')}
              </Button>
            }
          />
        )}

        {/* Stats Cards */}
        <Row gutter={[16, 16]} className="mb-4">
          <Col xs={24} sm={12} lg={6}>
            <Card className="shadow-sm">
              <Statistic
                title={t('dashboard.totalRecognitions', 'Total Recognitions')}
                value={stats?.totalRecognitions ?? 0}
                prefix={<FileImageOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="shadow-sm">
              <Statistic
                title={t('dashboard.successRate', 'Success Rate')}
                value={stats?.successRate ?? 0}
                suffix="%"
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="shadow-sm">
              <Statistic
                title={t('dashboard.avgTime', 'Avg. Processing Time')}
                value={stats?.averageTime ?? 0}
                suffix="s"
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="shadow-sm">
              <Statistic
                title={t('dashboard.today', 'Today')}
                value={stats?.todayCount ?? 0}
                prefix={<FileImageOutlined />}
                valueStyle={{ color: '#007AFF' }}
              />
            </Card>
          </Col>
        </Row>

        {/* Recent Activity */}
        <Card
          title={t('dashboard.recentActivity', 'Recent Activity')}
          className="shadow-sm"
          extra={loading && <Spin size="small" />}
        >
          {recentActivity.length > 0 ? (
            <Table dataSource={recentActivity} columns={columns} pagination={false} />
          ) : (
            <div className="text-center text-gray-500 py-8">
              {t('dashboard.noActivity', 'No recent activity. Start recognizing logos to see stats here.')}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
