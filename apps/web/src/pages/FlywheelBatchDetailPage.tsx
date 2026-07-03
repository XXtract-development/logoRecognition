/**
 * FlywheelBatchDetailPage (Story 15.3) — quarantaine-afhandeling met volledig
 * bewijs, op route `/flywheel/batches/:id` (flat-page-conventie 15.1).
 *
 * Master-detail conform mock-quarantaine.html: faalreden-alert, batchvoortgang,
 * kandidatenlijst (master, ±320px) + per kandidaat het bewijspaneel (detail).
 * Per kandidaat afkeuren/vrijgeven via `candidates/:id/decision`; sneltoetsen
 * A/R/U/pijltjes/Esc conform het reviewstation (typing-guard, undo); auto-advance
 * naar de volgende onbeoordeelde kandidaat na elke beslissing; "Batch afsluiten"
 * met samenvattingsmodal zodra alle kandidaten beoordeeld zijn.
 *
 * KRITIEK (AD-15): het scherm draait NOOIT poortlogica. Afkeuren maakt een hard-
 * negative; vrijgeven zet de kandidaat terug op `candidate` — de worker herbundelt.
 * Kleursemantiek (UX-DR5): nergens rood; `afgekeurd` is neutraal grijs.
 *
 * State Patterns (EXPERIENCE.md): laden = skeleton; laadfout = sectie-lokale
 * foutkaart met "Opnieuw proberen"; faalpad-beslissing = toast, kandidaat behoudt
 * `te beoordelen`, dezelfde toets herhaalt de actie. Beslis-feedback `aria-live`.
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Card, Skeleton, Alert, Button, Modal, App, Progress } from 'antd';
import { useTranslation } from 'react-i18next';
import { FlywheelThemeProvider } from '@/components/flywheel/FlywheelThemeProvider';
import { FLYWHEEL_COLORS as C } from '@/components/flywheel/statusColors';
import { StatusBadge } from '@/components/flywheel/StatusBadge';
import { MaterialSymbol } from '@/components/flywheel/MaterialSymbol';
import { CandidateList } from '@/components/flywheel/CandidateList';
import { EvidencePanel } from '@/components/flywheel/EvidencePanel';
import { useCandidateKeyboard } from '@/components/flywheel/useCandidateKeyboard';
import { candidateStatusView } from '@/components/flywheel/candidateStatus';
import {
  fetchBatchDetail,
  decideCandidate,
  closeBatch,
  type BatchDetail,
  type BatchCandidateView,
  type CandidateDecisionKind,
} from '@/services/flywheelService';

const { Title, Text } = Typography;

const FlywheelBatchDetailContent: React.FC = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { id: batchId } = useParams<{ id: string }>();

  const [detail, setDetail] = React.useState<BatchDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [liveMessage, setLiveMessage] = React.useState('');

  const load = React.useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    setError(false);
    try {
      const data = await fetchBatchDetail(batchId);
      setDetail(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const candidates: BatchCandidateView[] = detail?.candidates ?? [];
  const current = candidates[selectedIndex];

  const reviewedCount = candidates.filter((c) => candidateStatusView(c.status).reviewed).length;
  const allReviewed = candidates.length > 0 && reviewedCount === candidates.length;
  const rejectedCount = candidates.filter((c) => c.status === 'rejected').length;
  const releasedCount = candidates.filter((c) => c.status === 'candidate').length;

  /** Selecteer de volgende ONBEOORDEELDE kandidaat (auto-advance, EXPERIENCE). */
  const advanceToNextUnreviewed = React.useCallback(
    (fromIndex: number, list: BatchCandidateView[]) => {
      for (let step = 1; step <= list.length; step += 1) {
        const idx = (fromIndex + step) % list.length;
        if (!candidateStatusView(list[idx].status).reviewed) {
          setSelectedIndex(idx);
          return;
        }
      }
      // Niets onbeoordeeld meer: blijf op de huidige (batch klaar om af te sluiten).
    },
    []
  );

  /** Voer een beslissing uit op de huidige kandidaat + auto-advance (AC2/AC3/AC4). */
  const decide = React.useCallback(
    async (decision: CandidateDecisionKind) => {
      if (!current || busy) return;
      // Undo alleen zinvol op een reeds beoordeelde kandidaat.
      if (decision === 'undo' && !candidateStatusView(current.status).reviewed) return;
      setBusy(true);
      try {
        const result = await decideCandidate(current.id, decision);
        // Lokale status bijwerken (optimistisch op basis van de serverrespons).
        const updated = candidates.map((c) => (c.id === current.id ? { ...c, status: result.status } : c));
        setDetail((d) => (d ? { ...d, candidates: updated } : d));

        if (decision === 'afkeuren') {
          setLiveMessage(t('flywheel.detail.rejected', { defaultValue: 'Kandidaat afgekeurd — wordt hard-negative.' }));
          advanceToNextUnreviewed(selectedIndex, updated);
        } else if (decision === 'vrijgeven') {
          setLiveMessage(
            t('flywheel.detail.released', { defaultValue: 'Kandidaat vrijgegeven — gaat opnieuw door de poort.' })
          );
          advanceToNextUnreviewed(selectedIndex, updated);
        } else {
          setLiveMessage(t('flywheel.detail.undone', { defaultValue: 'Beslissing ongedaan gemaakt.' }));
        }
      } catch {
        // Faalpad (Key Flow 1): toast, kandidaat behoudt `te beoordelen`, dezelfde
        // toets herhaalt de actie.
        message.error(
          t('flywheel.detail.saveError', { defaultValue: 'Beslissing niet opgeslagen — opnieuw proberen' })
        );
      } finally {
        setBusy(false);
      }
    },
    [current, busy, candidates, selectedIndex, advanceToNextUnreviewed, t, message]
  );

  const gotoRelative = React.useCallback(
    (delta: number) => {
      setSelectedIndex((i) => {
        const next = i + delta;
        if (next < 0 || next >= candidates.length) return i;
        return next;
      });
    },
    [candidates.length]
  );

  // Sneltoetsen (A/R/U/pijltjes/Esc), reviewstation-conform. Een open modal bezit
  // het toetsenbord (alleen Esc); tijdens laden/fout inactief.
  useCandidateKeyboard({
    onRelease: () => decide('vrijgeven'),
    onReject: () => decide('afkeuren'),
    onUndo: () => decide('undo'),
    onPrev: () => gotoRelative(-1),
    onNext: () => gotoRelative(1),
    onEscape: () => setSummaryOpen(false),
    modalOpen: summaryOpen,
    enabled: !loading && !error && candidates.length > 0,
  });

  const confirmClose = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      await closeBatch(batchId);
      message.success(t('flywheel.detail.closed', { defaultValue: 'Batch afgesloten.' }));
      setSummaryOpen(false);
      navigate('/flywheel');
    } catch {
      message.error(t('flywheel.detail.closeError', { defaultValue: 'Batch afsluiten mislukt — probeer opnieuw.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="flywheel-batch-detail-page"
      style={{ minHeight: '100vh', background: C.appBg, padding: '24px 28px' }}
    >
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        {/* Kruimelpad + terug */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.foregroundMuted, marginBottom: 14 }}>
          <a
            data-testid="breadcrumb-flywheel"
            onClick={(e) => {
              e.preventDefault();
              navigate('/flywheel');
            }}
            href="/flywheel"
            style={{ color: C.secondary, textDecoration: 'none', cursor: 'pointer' }}
          >
            {t('flywheel.pageTitle', { defaultValue: 'Vliegwiel' })}
          </a>
          <span style={{ color: C.border }}>›</span>
          <span>{t('flywheel.detail.crumb', { defaultValue: 'Promotiebatch' })}</span>
        </div>

        {/* Laadfout: sectie-lokale foutkaart. */}
        {error && (
          <Alert
            data-testid="batch-detail-error"
            type="error"
            showIcon
            style={{ marginBottom: 16, borderRadius: 10 }}
            message={t('flywheel.detail.errorTitle', { defaultValue: 'Batch kon niet geladen worden' })}
            action={
              <Button size="small" onClick={() => load()}>
                {t('flywheel.retry', { defaultValue: 'Opnieuw proberen' })}
              </Button>
            }
          />
        )}

        {/* Laden: skeleton in de master-detail-layout. */}
        {loading && (
          <div data-testid="batch-detail-loading" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
            <Card style={{ borderRadius: 12 }}>
              <Skeleton active paragraph={{ rows: 6 }} />
            </Card>
            <Card style={{ borderRadius: 12 }}>
              <Skeleton active paragraph={{ rows: 10 }} />
            </Card>
          </div>
        )}

        {!loading && !error && detail && (
          <>
            {/* Pagina-header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <div>
                <Title level={2} style={{ color: C.foregroundHeading, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {t('flywheel.detail.title', { defaultValue: 'Promotiebatch' })} {detail.batch.batchId.slice(0, 12)}
                  <StatusBadge tone="warn" data-testid="batch-quarantine-badge">
                    {t('flywheel.quarantine.waiting', { defaultValue: 'wacht op jouw beoordeling' })}
                  </StatusBadge>
                </Title>
                <Text style={{ color: C.foregroundMuted, fontSize: 13 }}>
                  {new Date(detail.batch.createdAt).toLocaleString('nl-NL')} · {detail.batch.candidateCount}{' '}
                  {t('flywheel.detail.candidates', { defaultValue: 'kandidaat-referenties' })}
                </Text>
              </div>
              <Button onClick={() => navigate('/flywheel')} icon={<MaterialSymbol name="arrow_back" size={16} />}>
                {t('flywheel.detail.back', { defaultValue: 'Terug naar overzicht' })}
              </Button>
            </div>

            {/* Faalreden-alert (amber, "wacht op jouw beoordeling"-toon, nooit fout). */}
            <div
              role="status"
              data-testid="batch-fail-reason"
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderRadius: 10,
                background: C.warningLight,
                border: '1px solid rgba(230,168,23,0.25)',
                color: C.warningText,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              <MaterialSymbol name="pending_actions" size={18} />
              <div>
                <b style={{ display: 'block', marginBottom: 2 }}>{detail.batch.failReason}</b>
                {detail.batch.mostAffectedClasses.length > 0 && (
                  <span>
                    {t('flywheel.detail.mostAffected', {
                      defaultValue: 'Meest getroffen klassen: {{classes}}.',
                      classes: detail.batch.mostAffectedClasses.join(', '),
                    })}{' '}
                  </span>
                )}
                {t('flywheel.detail.noneActive', { defaultValue: 'Geen enkele kandidaat is actief geworden.' })}
              </div>
            </div>

            {/* Batchvoortgang + "Batch afsluiten" */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 16,
                background: C.background,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: '12px 20px',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 500, color: C.foregroundMuted, whiteSpace: 'nowrap' }}>
                {t('flywheel.detail.progress', { defaultValue: 'Batchvoortgang' })}
              </span>
              <Progress
                data-testid="batch-progress"
                percent={candidates.length === 0 ? 0 : Math.round((reviewedCount / candidates.length) * 100)}
                showInfo={false}
                strokeColor={C.secondary}
                style={{ flex: 1, margin: 0 }}
                aria-label={`${reviewedCount} van ${candidates.length} kandidaten beoordeeld`}
              />
              <span style={{ fontSize: 12, color: C.foregroundMuted, whiteSpace: 'nowrap' }}>
                <b style={{ color: C.foreground }}>
                  {reviewedCount} {t('flywheel.detail.of', { defaultValue: 'van' })} {candidates.length}
                </b>{' '}
                {t('flywheel.detail.reviewed', { defaultValue: 'beoordeeld' })} · {rejectedCount}{' '}
                {t('flywheel.detail.rejectedShort', { defaultValue: 'afgekeurd' })} · {releasedCount}{' '}
                {t('flywheel.detail.releasedShort', { defaultValue: 'vrijgegeven' })}
              </span>
              <Button
                type="primary"
                size="small"
                data-testid="close-batch-button"
                disabled={!allReviewed || busy}
                onClick={() => setSummaryOpen(true)}
                title={
                  allReviewed
                    ? undefined
                    : t('flywheel.detail.closeDisabled', { defaultValue: 'Actief zodra alle kandidaten beoordeeld zijn' })
                }
              >
                {t('flywheel.detail.closeBatch', { defaultValue: 'Batch afsluiten' })}
              </Button>
            </div>

            {/* Master-detail */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }} data-testid="master-detail">
              <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.foregroundHeading }}>
                    {t('flywheel.detail.candidatesTitle', { defaultValue: 'Kandidaat-referenties' })}
                  </span>
                  <span style={{ fontSize: 12, color: C.foregroundMuted }}>{candidates.length}</span>
                </div>
                <CandidateList candidates={candidates} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
              </Card>

              <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
                {current ? (
                  <EvidencePanel
                    candidate={current}
                    index={selectedIndex}
                    total={candidates.length}
                    promotionThresholds={detail.promotionThresholds}
                    gateOutcomes={detail.batch.gateOutcomes}
                    onReject={() => decide('afkeuren')}
                    onRelease={() => decide('vrijgeven')}
                    busy={busy}
                  />
                ) : (
                  <div style={{ padding: 20, color: C.foregroundMuted }}>
                    {t('flywheel.detail.noCandidates', { defaultValue: 'Deze batch heeft geen kandidaten.' })}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {/* Beslis-feedback voor schermlezers (aria-live, UX-DR9). */}
        <div aria-live="polite" data-testid="decision-live" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {liveMessage}
        </div>

        {/* Samenvattingsmodal "Batch afsluiten". */}
        <Modal
          data-testid="close-summary-modal"
          title={t('flywheel.detail.summaryTitle', { defaultValue: 'Batch afsluiten' })}
          open={summaryOpen}
          onCancel={() => setSummaryOpen(false)}
          onOk={confirmClose}
          confirmLoading={busy}
          okButtonProps={{ 'data-testid': 'close-summary-confirm' }}
          okText={t('flywheel.detail.summaryConfirm', { defaultValue: 'Afsluiten' })}
          cancelText={t('flywheel.detail.summaryCancel', { defaultValue: 'Annuleren' })}
        >
          <p data-testid="close-summary-text" style={{ color: C.foreground, fontSize: 14 }}>
            {t('flywheel.detail.summaryText', {
              defaultValue:
                '{{rejected}} afgekeurd → hard-negative; {{released}} vrijgegeven → nieuwe promotiebatch, gaat opnieuw door de kwaliteitspoort.',
              rejected: rejectedCount,
              released: releasedCount,
            })}
          </p>
        </Modal>
      </div>
    </div>
  );
};

const FlywheelBatchDetailPage: React.FC = () => {
  return (
    <FlywheelThemeProvider>
      <App>
        <FlywheelBatchDetailContent />
      </App>
    </FlywheelThemeProvider>
  );
};

export default FlywheelBatchDetailPage;
