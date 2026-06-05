/**
 * Approval Queue Page (Epic 9, Story 9.5)
 *
 * Displays challengers that passed the quality gate and await human approval.
 * Per challenger a full evaluation report is shown (challenger vs champion,
 * holdout metrics side-by-side, diff per metric, dataset growth, trigger reason).
 *
 * One-click activation: a single confirm dialog is the only required action per model.
 * KPI: doorlooptijd feedback → actief model, displayed as "Doorlooptijd: X dagen".
 *
 * data-testid attributes (AC5):
 *   - "approval-queue-page"     — root element
 *   - "evaluation-report"       — per challenger card
 *   - "activate-model-button"   — activation button per challenger
 */

import { useState } from 'react';
import {
  Card,
  Button,
  Statistic,
  Row,
  Col,
  Tag,
  Modal,
  Typography,
  Space,
  Alert,
  Spin,
  Empty,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  RocketOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { message } from 'antd';

const { Title, Text } = Typography;

// ============================================
// Types
// ============================================

interface EvaluationReport {
  challenger: { holdoutAccuracy: number | null; holdoutHash?: string | null };
  champion: { holdoutAccuracy: number | null } | null;
  diff: { accuracy: number } | null;
  datasetGrowth: number | null;
  triggerReasons: string[];
}

interface ApprovalQueueItem {
  id: string;
  version: string;
  createdAt: string;
  evaluationReport: EvaluationReport;
}

// ============================================
// API calls
// ============================================

async function fetchApprovalQueue(): Promise<ApprovalQueueItem[]> {
  const response = await fetch('/api/v1/models/approval-queue', {
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to fetch approval queue');
  const body = await response.json();
  return body.data ?? [];
}

async function activateModel(modelId: string): Promise<void> {
  const response = await fetch(`/api/v1/models/${modelId}/activate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Activation failed (${response.status})`);
  }
}

// ============================================
// Component
// ============================================

export function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['approval-queue'],
    queryFn: fetchApprovalQueue,
    refetchOnMount: true,
    staleTime: 30_000,
  });

  const activateMutation = useMutation({
    mutationFn: activateModel,
    onSuccess: () => {
      message.success('Model geactiveerd');
      queryClient.invalidateQueries({ queryKey: ['approval-queue'] });
      setActivatingId(null);
    },
    onError: (err: Error) => {
      message.error(err.message || 'Activatie mislukt');
      setActivatingId(null);
    },
  });

  function handleActivate(item: ApprovalQueueItem) {
    Modal.confirm({
      title: 'Model activeren?',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>Weet je zeker dat je <b>{item.version}</b> wilt activeren als actief model?</p>
          {item.evaluationReport.diff && (
            <p>
              Verbetering t.o.v. huidige champion:{' '}
              <b>+{(item.evaluationReport.diff.accuracy * 100).toFixed(1)}%</b> nauwkeurigheid
            </p>
          )}
          <p style={{ color: '#D64545' }}>
            Deze actie vervangt het huidig actief model.
          </p>
        </div>
      ),
      okText: 'Activeren',
      okType: 'primary',
      cancelText: 'Annuleren',
      onOk: () => {
        setActivatingId(item.id);
        activateMutation.mutate(item.id);
      },
    });
  }

  if (isLoading) {
    return (
      <div data-testid="approval-queue-page" style={{ padding: 32, textAlign: 'center' }}>
        <Spin size="large" tip="Goedkeurings-queue laden..." />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="approval-queue-page" style={{ padding: 32 }}>
        <Alert
          type="error"
          message="Kan de goedkeurings-queue niet laden"
          description={(error as Error).message}
        />
      </div>
    );
  }

  return (
    <div data-testid="approval-queue-page" style={{ padding: 24 }}>
      <Title level={2}>
        <CheckCircleOutlined style={{ color: '#54949E', marginRight: 8 }} />
        Modellen klaar voor goedkeuring
      </Title>
      <Text type="secondary">
        Onderstaande modellen hebben de kwaliteitsgate gehaald en wachten op uw goedkeuring.
        Uw enige actie: bekijk het rapport en klik op Activeren.
      </Text>

      {items.length === 0 ? (
        <Card style={{ marginTop: 24 }}>
          <Empty description="Geen modellen klaar voor goedkeuring" />
        </Card>
      ) : (
        <div style={{ marginTop: 24 }}>
          {items.map((item) => (
            <Card
              key={item.id}
              data-testid="evaluation-report"
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  <Tag color="#2F5A7A">{item.version}</Tag>
                  <Text type="secondary">
                    <ClockCircleOutlined /> {new Date(item.createdAt).toLocaleDateString('nl-NL')}
                  </Text>
                </Space>
              }
              extra={
                <Button
                  data-testid="activate-model-button"
                  type="primary"
                  icon={<RocketOutlined />}
                  loading={activatingId === item.id}
                  onClick={() => handleActivate(item)}
                  style={{ backgroundColor: '#2F5A7A', borderColor: '#2F5A7A' }}
                >
                  Activeren
                </Button>
              }
            >
              <Row gutter={[24, 16]}>
                {/* Challenger metrics */}
                <Col span={8}>
                  <Card size="small" title="Challenger (nieuw model)">
                    <Statistic
                      title="Holdout nauwkeurigheid"
                      value={
                        item.evaluationReport.challenger.holdoutAccuracy != null
                          ? (item.evaluationReport.challenger.holdoutAccuracy * 100).toFixed(1)
                          : '—'
                      }
                      suffix="%"
                      valueStyle={{ color: '#B7D945' }}
                    />
                  </Card>
                </Col>

                {/* Champion metrics */}
                <Col span={8}>
                  <Card size="small" title="Huidig actief model (champion)">
                    {item.evaluationReport.champion ? (
                      <Statistic
                        title="Holdout nauwkeurigheid"
                        value={
                          item.evaluationReport.champion.holdoutAccuracy != null
                            ? (item.evaluationReport.champion.holdoutAccuracy * 100).toFixed(1)
                            : '—'
                        }
                        suffix="%"
                      />
                    ) : (
                      <Text type="secondary">Geen actief model (eerste run)</Text>
                    )}
                  </Card>
                </Col>

                {/* Diff */}
                <Col span={8}>
                  <Card size="small" title="Verbetering">
                    {item.evaluationReport.diff ? (
                      <Statistic
                        title="Verschil nauwkeurigheid"
                        value={(item.evaluationReport.diff.accuracy * 100).toFixed(1)}
                        prefix={item.evaluationReport.diff.accuracy >= 0 ? '+' : ''}
                        suffix="%"
                        valueStyle={{
                          color: item.evaluationReport.diff.accuracy >= 0 ? '#B7D945' : '#D64545',
                        }}
                      />
                    ) : (
                      <Text type="secondary">—</Text>
                    )}
                  </Card>
                </Col>
              </Row>

              {/* Trigger reasons */}
              {item.evaluationReport.triggerReasons.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Text strong>Trigger-reden: </Text>
                  {item.evaluationReport.triggerReasons.map((reason, idx) => (
                    <Tag key={idx} color="#54949E">
                      {reason}
                    </Tag>
                  ))}
                </div>
              )}

              {/* Dataset growth */}
              {item.evaluationReport.datasetGrowth != null && (
                <div style={{ marginTop: 8 }}>
                  <Tooltip title="Aantal nieuwe gevalideerde annotaties ten opzichte van de vorige training">
                    <Text>
                      <Text strong>Datasetgroei: </Text>
                      +{item.evaluationReport.datasetGrowth} annotaties
                    </Text>
                  </Tooltip>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default ApprovalQueuePage;
