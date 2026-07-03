/**
 * QuarantineCard (Story 15.2, AC1/AC3/AC5) — quarantainetabel + Historie-tab.
 *
 * Twee tabs (het enige tab-gebruik op het overzicht, EXPERIENCE.md IA):
 *   - Quarantaine: openstaande quarantainebatches met faalreden (altijd als
 *     tekst, badge is aanvullend). Rijklik/"Openen" → batch-detail. Zolang de
 *     15.3-route niet bestaat: een Drawer met de poort-uitkomsten uit de
 *     overview-data (gedocumenteerd in het Dev Agent Record). Positieve empty
 *     state bij lege tabel (groen, UX State Patterns).
 *   - Historie: gepasseerde én teruggedraaide batches met een rollback-actie
 *     achter een bevestigingsmodal met VERPLICHT redenveld (UX-DR11); opslaan
 *     disabled zolang leeg. Een teruggedraaide batch draagt de neutrale badge
 *     `teruggedraaid` (géén rood).
 *
 * Kleursemantiek (UX-DR5): quarantaine amber, `teruggedraaid` neutraal, nooit rood.
 */

import React from 'react';
import { Card, Tabs, Table, Button, Drawer, Modal, Input, Descriptions, Empty, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { FLYWHEEL_COLORS as C } from './statusColors';
import { StatusBadge } from './StatusBadge';
import { rollbackBatch } from '@/services/flywheelService';
import type { QuarantinePanel, QuarantineRow, HistoryPanel, HistoryRow } from '@/services/flywheelService';
import { isPanelError, type PanelError } from '@/services/flywheelService';

interface QuarantineCardProps {
  quarantine: QuarantinePanel | PanelError;
  history: HistoryPanel | PanelError;
  /** Verplaats naar batch-detail (15.3). Ontbreekt de route → Drawer-fallback. */
  onOpenBatch?: (batchId: string) => void;
  /** Aangeroepen na een geslaagde rollback (parent kan refetchen). */
  onRolledBack?: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const QuarantineCard: React.FC<QuarantineCardProps> = ({
  quarantine,
  history,
  onOpenBatch,
  onRolledBack,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [drawerBatch, setDrawerBatch] = React.useState<QuarantineRow | null>(null);
  const [rollbackTarget, setRollbackTarget] = React.useState<HistoryRow | null>(null);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const openBatch = (row: QuarantineRow) => {
    if (onOpenBatch) onOpenBatch(row.batchId);
    else setDrawerBatch(row); // Fallback tot 15.3-route bestaat.
  };

  const confirmRollback = async () => {
    if (!rollbackTarget || reason.trim().length === 0) return;
    setSubmitting(true);
    try {
      await rollbackBatch(rollbackTarget.batchId, reason.trim());
      message.success(
        t('flywheel.rollback.success', { defaultValue: 'Batch teruggedraaid.' })
      );
      setRollbackTarget(null);
      setReason('');
      onRolledBack?.();
    } catch {
      message.error(
        t('flywheel.rollback.error', { defaultValue: 'Terugdraaien mislukt — probeer opnieuw.' })
      );
    } finally {
      setSubmitting(false);
    }
  };

  const quarantineRows = isPanelError(quarantine) ? [] : quarantine.rows;
  const historyRows = isPanelError(history) ? [] : history.rows;

  const quarantineTab = isPanelError(quarantine) ? (
    <div data-testid="quarantine-error">
      {t('flywheel.panelError', { defaultValue: 'Dit paneel kon niet geladen worden.' })}
    </div>
  ) : quarantineRows.length === 0 ? (
    <Empty
      data-testid="quarantine-empty"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <span style={{ color: C.successDark }}>
          {t('flywheel.quarantine.empty', {
            defaultValue: 'Alle batches passeerden de kwaliteitspoort.',
          })}
        </span>
      }
    />
  ) : (
    <Table<QuarantineRow>
      data-testid="quarantine-table"
      rowKey="batchId"
      dataSource={quarantineRows}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      onRow={(row) => ({ onClick: () => openBatch(row), style: { cursor: 'pointer' } })}
      columns={[
        {
          title: t('flywheel.quarantine.colBatch', { defaultValue: 'Promotiebatch' }),
          dataIndex: 'batchId',
          render: (_: string, row) => (
            <div>
              <div style={{ fontWeight: 500 }}>{row.batchId.slice(0, 12)}</div>
              <div style={{ fontSize: 11, color: C.foregroundMuted }}>{fmtDate(row.createdAt)}</div>
            </div>
          ),
        },
        {
          title: t('flywheel.quarantine.colCandidates', { defaultValue: 'Kandidaten' }),
          dataIndex: 'candidateCount',
          sorter: (a, b) => a.candidateCount - b.candidateCount,
        },
        {
          title: t('flywheel.quarantine.colReason', { defaultValue: 'Faalreden' }),
          dataIndex: 'failReason',
          render: (v: string, row) => (
            <div>
              <div style={{ fontWeight: 500 }}>{v}</div>
              {row.mostAffectedClasses.length > 0 && (
                <div style={{ fontSize: 11, color: C.foregroundMuted }}>
                  {t('flywheel.quarantine.mostAffected', {
                    defaultValue: 'meest getroffen: {{classes}}',
                    classes: row.mostAffectedClasses.join(', '),
                  })}
                </div>
              )}
            </div>
          ),
        },
        {
          title: t('flywheel.quarantine.colStatus', { defaultValue: 'Status' }),
          dataIndex: 'status',
          render: () => (
            <StatusBadge tone="warn" data-testid="quarantine-status-badge">
              {t('flywheel.quarantine.waiting', { defaultValue: 'wacht op jouw beoordeling' })}
            </StatusBadge>
          ),
        },
        {
          title: '',
          key: 'action',
          align: 'right',
          render: (_: unknown, row) => (
            <Button
              type="primary"
              size="small"
              data-testid="quarantine-open"
              onClick={(e) => {
                e.stopPropagation();
                openBatch(row);
              }}
            >
              {t('flywheel.quarantine.open', { defaultValue: 'Openen' })}
            </Button>
          ),
        },
      ]}
    />
  );

  const historyTab = isPanelError(history) ? (
    <div data-testid="history-error">
      {t('flywheel.panelError', { defaultValue: 'Dit paneel kon niet geladen worden.' })}
    </div>
  ) : (
    <Table<HistoryRow>
      data-testid="history-table"
      rowKey="batchId"
      dataSource={historyRows}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      columns={[
        {
          title: t('flywheel.history.colBatch', { defaultValue: 'Promotiebatch' }),
          dataIndex: 'batchId',
          render: (v: string, row) => (
            <div>
              <div style={{ fontWeight: 500 }}>{v.slice(0, 12)}</div>
              <div style={{ fontSize: 11, color: C.foregroundMuted }}>
                {row.closedAt ? fmtDate(row.closedAt) : fmtDate(row.createdAt)}
              </div>
            </div>
          ),
        },
        {
          title: t('flywheel.history.colPrecision', { defaultValue: 'Precisie' }),
          dataIndex: 'precision',
          render: (v: number | null) => (v === null ? '—' : v.toFixed(3).replace('.', ',')),
        },
        {
          title: t('flywheel.history.colStatus', { defaultValue: 'Status' }),
          key: 'status',
          render: (_: unknown, row) =>
            row.rolledBack ? (
              <StatusBadge tone="neutral" data-testid="history-rolled-back-badge">
                {t('flywheel.history.rolledBack', { defaultValue: 'teruggedraaid' })}
              </StatusBadge>
            ) : (
              <StatusBadge tone="ok" data-testid="history-passed-badge">
                {t('flywheel.history.passed', { defaultValue: 'gepasseerd' })}
              </StatusBadge>
            ),
        },
        {
          title: '',
          key: 'action',
          align: 'right',
          render: (_: unknown, row) =>
            row.rolledBack ? null : (
              <Button
                size="small"
                data-testid="history-rollback"
                onClick={() => {
                  setRollbackTarget(row);
                  setReason('');
                }}
              >
                {t('flywheel.history.rollback', { defaultValue: 'Terugdraaien' })}
              </Button>
            ),
        },
      ]}
    />
  );

  return (
    <Card data-testid="quarantine-card" style={{ borderRadius: 12, marginBottom: 16 }} styles={{ body: { paddingTop: 0 } }}>
      <Tabs
        data-testid="quarantine-tabs"
        items={[
          {
            key: 'quarantine',
            label: t('flywheel.quarantine.tab', {
              defaultValue: 'Quarantaine ({{n}})',
              n: quarantineRows.length,
            }),
            children: quarantineTab,
          },
          {
            key: 'history',
            label: t('flywheel.history.tab', {
              defaultValue: 'Historie ({{n}})',
              n: historyRows.length,
            }),
            children: historyTab,
          },
        ]}
      />

      {/* Batch-detail-drawer (fallback tot 15.3-route). */}
      <Drawer
        data-testid="batch-drawer"
        title={t('flywheel.drawer.title', { defaultValue: 'Batch-poortuitkomsten' })}
        open={drawerBatch !== null}
        onClose={() => setDrawerBatch(null)}
        width={420}
      >
        {drawerBatch && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('flywheel.drawer.batch', { defaultValue: 'Batch' })}>
              {drawerBatch.batchId}
            </Descriptions.Item>
            <Descriptions.Item label={t('flywheel.drawer.reason', { defaultValue: 'Faalreden' })}>
              {drawerBatch.failReason}
            </Descriptions.Item>
            <Descriptions.Item label={t('flywheel.drawer.gate', { defaultValue: 'Poort-uitkomsten' })}>
              <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(drawerBatch.gateResults, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* Rollback-bevestigingsmodal met VERPLICHT redenveld (UX-DR11). */}
      <Modal
        data-testid="rollback-modal"
        title={t('flywheel.rollback.title', { defaultValue: 'Batch terugdraaien' })}
        open={rollbackTarget !== null}
        onCancel={() => {
          setRollbackTarget(null);
          setReason('');
        }}
        onOk={confirmRollback}
        okButtonProps={{
          disabled: reason.trim().length === 0,
          loading: submitting,
          'data-testid': 'rollback-confirm',
        }}
        okText={t('flywheel.rollback.confirm', { defaultValue: 'Terugdraaien' })}
        cancelText={t('flywheel.rollback.cancel', { defaultValue: 'Annuleren' })}
      >
        <p style={{ color: C.foregroundMuted, fontSize: 13 }}>
          {t('flywheel.rollback.explain', {
            defaultValue:
              'Terugdraaien deactiveert de gepromoveerde referenties van deze batch (soft-delete) en herstelt de baseline. Reden is verplicht (wie/wanneer/waarom).',
          })}
        </p>
        <Input.TextArea
          data-testid="rollback-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('flywheel.rollback.reasonPlaceholder', { defaultValue: 'Reden voor terugdraaien' })}
          rows={3}
          autoFocus
        />
      </Modal>
    </Card>
  );
};

export default QuarantineCard;
