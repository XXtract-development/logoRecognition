/**
 * Bootstrap-wachtrij-paneel (Story 17.2, FR-13, AC2/AC3/AC4).
 *
 * Toont de wachtrij op declaratiefrequentie geprioriteerd (effectieve volgorde uit
 * de API: override eerst, dan frequentie), met per klasse de status als badge
 * (UX-DR5-semantiek: amber=wachtend, groen=gevuld, neutraal=leeg/uitgesloten/
 * gedraaid). De datamanager kan:
 *   - een klasse uitsluiten / weer insluiten (AC2);
 *   - een klasse toevoegen (AC2);
 *   - een bootstrap-run agenderen (taak 5, hergebruikt 17.1);
 *   - via een "nieuw geactiveerde klasse"-melding doorklikken naar de batch-detail
 *     (AC3/AC4) — read-side bepaald, geen aparte notificatie-infra.
 *
 * Verversing: refresh-on-mount, GEEN polling (UX-DR8). NL-teksten via i18next-keys
 * (UX-DR10). Het paneel laadt zijn eigen endpoint (`/flywheel/bootstrap-queue`),
 * losgekoppeld van het overzicht — de prioritering/beheer-data is 17.2-eigen.
 */

import React from 'react';
import { Card, Button, Empty, Table, Space, Modal, Input, App, Skeleton, Alert } from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FLYWHEEL_COLORS as C } from './statusColors';
import { StatusBadge } from './StatusBadge';
import type { BadgeTone } from './statusColors';
import {
  fetchBootstrapQueue,
  setBootstrapExcluded,
  addBootstrapClass,
  enqueueBootstrapRun,
  type BootstrapQueueItem,
  type BootstrapQueueView,
} from '@/services/flywheelService';

export const BOOTSTRAP_QUEUE_QUERY_KEY = ['flywheel-bootstrap-queue'] as const;

/** Status → badge-tint (UX-DR5): amber=wachtend, groen=gevuld, neutraal=rest. */
function statusTone(status: string): BadgeTone {
  if (status === 'gevuld') return 'ok';
  if (status === 'wachtend') return 'warn';
  return 'neutral'; // gedraaid / leeg / uitgesloten
}

export const BootstrapQueuePanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { data, isLoading, isError, refetch } = useQuery<BootstrapQueueView>({
    queryKey: BOOTSTRAP_QUEUE_QUERY_KEY,
    queryFn: fetchBootstrapQueue,
    refetchOnMount: true,
    staleTime: 30_000,
  });

  const [addOpen, setAddOpen] = React.useState(false);
  const [newCode, setNewCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const statusLabel = (status: string): string =>
    t(`flywheel.bootstrap.status.${status}`, { defaultValue: status });

  const toggleExcluded = async (item: BootstrapQueueItem) => {
    setBusy(true);
    try {
      await setBootstrapExcluded(item.t3777Code, !item.excluded);
      message.success(
        item.excluded
          ? t('flywheel.bootstrap.included', { defaultValue: 'Klasse weer opgenomen.' })
          : t('flywheel.bootstrap.excluded', { defaultValue: 'Klasse uitgesloten.' })
      );
      await refetch();
    } catch {
      message.error(t('flywheel.bootstrap.mutationError', { defaultValue: 'Wijziging mislukt — probeer opnieuw.' }));
    } finally {
      setBusy(false);
    }
  };

  const addClass = async () => {
    const code = newCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      await addBootstrapClass(code);
      message.success(t('flywheel.bootstrap.added', { defaultValue: 'Klasse toegevoegd.' }));
      setNewCode('');
      setAddOpen(false);
      await refetch();
    } catch {
      message.error(t('flywheel.bootstrap.addError', { defaultValue: 'Toevoegen mislukt — probeer opnieuw.' }));
    } finally {
      setBusy(false);
    }
  };

  const enqueue = async (item: BootstrapQueueItem) => {
    setBusy(true);
    try {
      await enqueueBootstrapRun(item.t3777Code);
      message.success(t('flywheel.bootstrap.enqueued', { defaultValue: 'Bootstrap-run geagendeerd.' }));
    } catch {
      message.error(t('flywheel.bootstrap.enqueueError', { defaultValue: 'Agenderen mislukt — probeer opnieuw.' }));
    } finally {
      setBusy(false);
    }
  };

  const title = t('flywheel.bootstrap.title', { defaultValue: 'Bootstrap-wachtrij' });

  const newlyActivated = data?.items.filter((i) => i.newlyActivated) ?? [];

  const columns = [
    {
      title: t('flywheel.bootstrap.col.code', { defaultValue: 'Klasse' }),
      dataIndex: 't3777Code',
      key: 'code',
      render: (code: string, row: BootstrapQueueItem) => (
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {code}
          {row.priorityOverride !== null && (
            <span style={{ marginLeft: 6, fontSize: 11, color: C.foregroundMuted }}>
              {t('flywheel.bootstrap.overrideTag', { defaultValue: '(prioriteit {{n}})', n: row.priorityOverride })}
            </span>
          )}
        </span>
      ),
    },
    {
      title: t('flywheel.bootstrap.col.frequency', { defaultValue: 'Declaratiefrequentie' }),
      dataIndex: 'declarationFrequency',
      key: 'freq',
      align: 'right' as const,
      render: (f: number) => <span style={{ fontSize: 13, color: C.foreground }}>{f.toLocaleString('nl-NL')}</span>,
    },
    {
      title: t('flywheel.bootstrap.col.status', { defaultValue: 'Status' }),
      dataIndex: 'status',
      key: 'status',
      render: (status: string, row: BootstrapQueueItem) => (
        <Space size={6}>
          <StatusBadge tone={statusTone(status)} data-testid={`bootstrap-status-${row.t3777Code}`}>
            {statusLabel(status)}
          </StatusBadge>
          {row.newlyActivated && (
            <StatusBadge tone="ok" data-testid={`bootstrap-newly-${row.t3777Code}`}>
              {t('flywheel.bootstrap.newlyActivated', { defaultValue: 'nieuw geactiveerd' })}
            </StatusBadge>
          )}
        </Space>
      ),
    },
    {
      title: t('flywheel.bootstrap.col.actions', { defaultValue: 'Acties' }),
      key: 'actions',
      render: (_: unknown, row: BootstrapQueueItem) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<PlayCircleOutlined />}
            disabled={busy || row.excluded}
            data-testid={`bootstrap-enqueue-${row.t3777Code}`}
            onClick={() => enqueue(row)}
          >
            {t('flywheel.bootstrap.enqueueAction', { defaultValue: 'Run' })}
          </Button>
          <Button
            size="small"
            type="text"
            disabled={busy}
            data-testid={`bootstrap-exclude-${row.t3777Code}`}
            onClick={() => toggleExcluded(row)}
          >
            {row.excluded
              ? t('flywheel.bootstrap.include', { defaultValue: 'Insluiten' })
              : t('flywheel.bootstrap.exclude', { defaultValue: 'Uitsluiten' })}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      data-testid="bootstrap-queue-panel"
      title={title}
      extra={
        <Button
          size="small"
          icon={<PlusOutlined />}
          data-testid="bootstrap-add-open"
          onClick={() => setAddOpen(true)}
        >
          {t('flywheel.bootstrap.add', { defaultValue: 'Klasse toevoegen' })}
        </Button>
      }
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {/* "Nieuw geactiveerde klasse"-melding (AC3) + doorklik (AC4). */}
      {newlyActivated.length > 0 && (
        <Alert
          type="success"
          showIcon
          data-testid="bootstrap-newly-activated-alert"
          style={{ marginBottom: 12, borderRadius: 10 }}
          message={t('flywheel.bootstrap.newlyActivatedTitle', {
            defaultValue: '{{n}} nieuw geactiveerde klasse(n)',
            n: newlyActivated.length,
          })}
          description={
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              {newlyActivated.map((i) => (
                <Button
                  key={i.t3777Code}
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  data-testid={`bootstrap-drilldown-${i.t3777Code}`}
                  onClick={() => navigate(`/flywheel/batches/${i.t3777Code}`)}
                >
                  {t('flywheel.bootstrap.viewEvidence', {
                    defaultValue: '{{code}} — bekijk gepromoveerde referenties',
                    code: i.t3777Code,
                  })}
                </Button>
              ))}
            </Space>
          }
        />
      )}

      {isLoading && <Skeleton active paragraph={{ rows: 3 }} />}

      {isError && (
        <Alert
          type="error"
          showIcon
          data-testid="bootstrap-queue-error"
          message={t('flywheel.bootstrap.loadError', { defaultValue: 'Wachtrij kon niet geladen worden.' })}
          action={
            <Button size="small" onClick={() => refetch()}>
              {t('flywheel.retry', { defaultValue: 'Opnieuw proberen' })}
            </Button>
          }
        />
      )}

      {!isLoading && !isError && data && data.items.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('flywheel.bootstrap.empty', {
            defaultValue: 'Nog geen klassen in de wachtrij — vul de wachtrij met de seed-bootstrap.',
          })}
        />
      )}

      {!isLoading && !isError && data && data.items.length > 0 && (
        <Table<BootstrapQueueItem>
          data-testid="bootstrap-queue-table"
          rowKey="t3777Code"
          size="small"
          pagination={false}
          columns={columns}
          dataSource={data.items}
        />
      )}

      {/* Klasse toevoegen (AC2). */}
      <Modal
        title={t('flywheel.bootstrap.addTitle', { defaultValue: 'Klasse toevoegen aan wachtrij' })}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        okButtonProps={{ 'data-testid': 'bootstrap-add-submit', loading: busy, disabled: !newCode.trim() } as never}
        onOk={addClass}
        okText={t('flywheel.bootstrap.add', { defaultValue: 'Klasse toevoegen' })}
        cancelText={t('flywheel.bootstrap.cancel', { defaultValue: 'Annuleren' })}
      >
        <Input
          data-testid="bootstrap-add-input"
          placeholder={t('flywheel.bootstrap.codePlaceholder', { defaultValue: 'T3777-code' })}
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          onPressEnter={addClass}
        />
      </Modal>
    </Card>
  );
};

export default BootstrapQueuePanel;
