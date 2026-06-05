/**
 * Retraining Notification Banner (Epic 9, Story 9.2)
 *
 * Displays persistent retraining recommendations fetched from the API.
 * Uses TanStack Query with refetchOnMount so even cold page visits show
 * previously-sent notifications (AC3: offline managers never miss a trigger).
 *
 * data-testids:
 *   retraining-notification  — the root notification element
 */
import { memo } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const { Text } = Typography;

// ============================================
// Types
// ============================================

interface RetrainingNotification {
  id: string;
  triggerId: string;
  reasons: string[];
  status: 'unread' | 'read';
  createdAt: string;
  readAt?: string;
}

// ============================================
// API helpers
// ============================================

async function fetchNotifications(): Promise<RetrainingNotification[]> {
  const res = await axios.get<{ data: RetrainingNotification[] }>('/api/v1/pipeline/notifications');
  return res.data.data;
}

async function markNotificationRead(id: string): Promise<void> {
  await axios.patch(`/api/v1/pipeline/notifications/${id}/read`);
}

// ============================================
// Component
// ============================================

const RetrainingNotificationBanner = memo(() => {
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery<RetrainingNotification[]>({
    queryKey: ['retraining-notifications'],
    queryFn: fetchNotifications,
    refetchOnMount: true, // always refetch on mount — AC3 offline requirement
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retraining-notifications'] });
    },
  });

  const unread = notifications.filter((n) => n.status === 'unread');

  if (unread.length === 0) return null;

  return (
    <>
      {unread.map((notification) => (
        <Alert
          key={notification.id}
          data-testid="retraining-notification"
          type="warning"
          showIcon
          icon={<BellOutlined />}
          style={{
            marginBottom: 8,
            border: '1px solid #B7D945',
            background: '#f6ffe0',
          }}
          message={
            <Space>
              <Text strong style={{ color: '#1E293B' }}>
                Hertraining aanbevolen
              </Text>
              <Text style={{ color: '#1E293B', fontSize: 13 }}>
                {notification.reasons.join('; ')}
              </Text>
            </Space>
          }
          action={
            <Button
              size="small"
              icon={<CheckOutlined />}
              onClick={() => markReadMutation.mutate(notification.id)}
              loading={markReadMutation.isPending}
              style={{ color: '#2F5A7A', borderColor: '#2F5A7A' }}
            >
              Gelezen
            </Button>
          }
          closable={false}
        />
      ))}
    </>
  );
});

RetrainingNotificationBanner.displayName = 'RetrainingNotificationBanner';

export { RetrainingNotificationBanner };
