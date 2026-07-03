/**
 * ThresholdModal (Story 15.4, AC2, Component Patterns threshold-input, UX-DR7).
 *
 * Knop "Drempels" in de pagina-header → modal met per methode (template/embedding/
 * classifier) één antd `InputNumber` (stap 0,01), met de huidige én vorige waarde
 * zichtbaar. Opslaan vereist een ingevulde reden (knop disabled zolang leeg); een
 * vaste caption-hint onder de velden: "Wijzigingen worden gelogd met oude en
 * nieuwe waarde." De wijzigingshistorie (datum, gebruiker, drempel, oud → nieuw,
 * reden) staat als tabel onder in de modal (UX-DR7).
 *
 * Focus-stijl per DESIGN.md (teal rand + zachte ring) is theming-scope van de
 * FlywheelThemeProvider; hier alleen gedrag + copy.
 */

import React from 'react';
import {
  Button,
  Modal,
  InputNumber,
  Input,
  Typography,
  Table,
  Space,
  Divider,
  App,
} from 'antd';
import { SlidersOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { FLYWHEEL_COLORS } from './statusColors';
import { FLYWHEEL_OVERVIEW_QUERY_KEY } from './useFlywheelOverview';
import {
  fetchThresholds,
  changeThreshold,
  type ThresholdsView,
  type ThresholdMethod,
} from '@/services/flywheelService';

const { Text } = Typography;

/** NL-label per methode. */
const METHOD_LABEL: Record<ThresholdMethod, string> = {
  template: 'Template-match',
  embedding: 'Embedding-match',
  classifier: 'Classifier',
};

export const ThresholdModal: React.FC = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<ThresholdsView | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [selectedMethod, setSelectedMethod] = React.useState<ThresholdMethod>('template');
  const [newValue, setNewValue] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchThresholds();
      setView(data);
      // Init het bewerkveld op de huidige waarde van de eerste methode.
      const first = data.methods[0];
      if (first) {
        setSelectedMethod(first.method);
        setNewValue(first.value);
      }
    } catch {
      message.error(t('flywheel.thresholds.loadFailed', { defaultValue: 'Drempels konden niet geladen worden.' }));
    } finally {
      setLoading(false);
    }
  }, [message, t]);

  const openModal = () => {
    setReason('');
    setOpen(true);
    void load();
  };

  const currentMethod = view?.methods.find((m) => m.method === selectedMethod);

  const onSelectMethod = (method: ThresholdMethod) => {
    setSelectedMethod(method);
    const m = view?.methods.find((x) => x.method === method);
    setNewValue(m ? m.value : null);
  };

  const canSave =
    !!currentMethod &&
    typeof newValue === 'number' &&
    reason.trim().length > 0 &&
    newValue !== currentMethod.value;

  const onSave = async () => {
    if (!canSave || typeof newValue !== 'number') return;
    setSaving(true);
    try {
      await changeThreshold(selectedMethod, newValue, reason.trim());
      message.success(t('flywheel.thresholds.saved', { defaultValue: 'Drempel bijgewerkt.' }));
      setReason('');
      await load();
      await queryClient.invalidateQueries({ queryKey: FLYWHEEL_OVERVIEW_QUERY_KEY });
    } catch (err: unknown) {
      const apiMsg =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      message.error(apiMsg || t('flywheel.thresholds.saveFailed', { defaultValue: 'Drempel wijzigen mislukt.' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button data-testid="thresholds-open" icon={<SlidersOutlined />} onClick={openModal}>
        {t('flywheel.thresholds.button', { defaultValue: 'Drempels' })}
      </Button>

      <Modal
        data-testid="threshold-modal"
        open={open}
        width={640}
        title={t('flywheel.thresholds.title', { defaultValue: 'Promotiedrempels' })}
        okText={t('flywheel.thresholds.save', { defaultValue: 'Opslaan' })}
        cancelText={t('common.close', { defaultValue: 'Sluiten' })}
        onOk={onSave}
        onCancel={() => setOpen(false)}
        okButtonProps={{ disabled: !canSave, loading: saving, 'data-testid': 'threshold-save' }}
        confirmLoading={saving}
      >
        {/* Per-methode-drempels: huidige én vorige (env-basis) waarde zichtbaar. */}
        <div data-testid="threshold-methods" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(view?.methods ?? []).map((m) => {
            const isSelected = m.method === selectedMethod;
            return (
              <button
                key={m.method}
                type="button"
                data-testid={`threshold-method-${m.method}`}
                onClick={() => onSelectMethod(m.method)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? FLYWHEEL_COLORS.secondary : FLYWHEEL_COLORS.border}`,
                  background: isSelected ? FLYWHEEL_COLORS.secondaryLight : FLYWHEEL_COLORS.background,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Text strong style={{ color: FLYWHEEL_COLORS.foreground }}>
                  {METHOD_LABEL[m.method]}
                </Text>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <Text data-testid={`threshold-value-${m.method}`} style={{ fontSize: 15, fontWeight: 700, color: FLYWHEEL_COLORS.primary }}>
                    {m.value.toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: 12, color: FLYWHEEL_COLORS.foregroundMuted }}>
                    {t('flywheel.thresholds.previous', { defaultValue: 'vorige: {{v}}', v: m.envValue.toFixed(2) })}
                  </Text>
                </span>
              </button>
            );
          })}
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* Bewerkveld voor de geselecteerde methode. */}
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text style={{ fontSize: 13, color: FLYWHEEL_COLORS.foregroundMuted }}>
            {t('flywheel.thresholds.editLabel', {
              defaultValue: 'Nieuwe waarde voor {{method}}',
              method: METHOD_LABEL[selectedMethod],
            })}
          </Text>
          <InputNumber
            data-testid="threshold-input"
            value={newValue}
            onChange={(v) => setNewValue(typeof v === 'number' ? v : null)}
            step={currentMethod?.step ?? 0.01}
            min={currentMethod?.min ?? 0.5}
            max={currentMethod?.max ?? 0.99}
            style={{ width: 160 }}
          />
          <Input.TextArea
            data-testid="threshold-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('flywheel.thresholds.reasonPlaceholder', { defaultValue: 'Reden voor de wijziging (verplicht)' })}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <Text data-testid="threshold-hint" style={{ fontSize: 12, color: FLYWHEEL_COLORS.foregroundMuted }}>
            {t('flywheel.thresholds.hint', {
              defaultValue: 'Wijzigingen worden gelogd met oude en nieuwe waarde.',
            })}
          </Text>
        </Space>

        {/* Wijzigingshistorie (UX-DR7). */}
        <Divider style={{ margin: '16px 0 8px' }} />
        <Text strong style={{ display: 'block', marginBottom: 8, color: FLYWHEEL_COLORS.foregroundHeading }}>
          {t('flywheel.thresholds.historyTitle', { defaultValue: 'Wijzigingshistorie' })}
        </Text>
        <Table
          data-testid="threshold-history"
          size="small"
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          locale={{ emptyText: t('flywheel.thresholds.historyEmpty', { defaultValue: 'Nog geen wijzigingen.' }) }}
          dataSource={view?.history ?? []}
          columns={[
            {
              title: t('flywheel.thresholds.colDate', { defaultValue: 'Datum' }),
              dataIndex: 'changedAt',
              key: 'changedAt',
              render: (v: string) => new Date(v).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }),
            },
            {
              title: t('flywheel.thresholds.colUser', { defaultValue: 'Gebruiker' }),
              dataIndex: 'userId',
              key: 'userId',
            },
            {
              title: t('flywheel.thresholds.colMethod', { defaultValue: 'Drempel' }),
              dataIndex: 'method',
              key: 'method',
              render: (m: ThresholdMethod | null) => (m ? METHOD_LABEL[m] : '—'),
            },
            {
              title: t('flywheel.thresholds.colChange', { defaultValue: 'Oud → nieuw' }),
              key: 'change',
              render: (_: unknown, row: { oldValue: string; newValue: string }) => `${row.oldValue} → ${row.newValue}`,
            },
            {
              title: t('flywheel.thresholds.colReason', { defaultValue: 'Reden' }),
              dataIndex: 'reason',
              key: 'reason',
              render: (r: string | null) => r || '—',
            },
          ]}
        />
      </Modal>
    </>
  );
};

export default ThresholdModal;
