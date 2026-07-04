/**
 * Signaalpanelen (Story 15.2, AC1/AC6) — de rechterkolom van het overzicht.
 *
 * - ClassCapsPanel: klassen aan cap (amber badge + geweigerde nominaties).
 * - OutlierPanel: openstaande outlier-meldingen; doorklik opent een
 *   vergelijkingsweergave (referentie vs. klasse-genoten) met Behouden/Deactiveren
 *   (AC6). Deactiveren = soft-delete + baseline-invalidatie (server-side, AD-5).
 * - Empty-state-panelen (bootstrap-wachtrij, mismatch-trends, GLN-dekking): lege
 *   staat tot de bron-epic landt (UX-DR8) — geen kaal vlak, geen fout.
 *
 * Kleursemantiek (UX-DR5): amber voor cap/outliers; de Deactiveren-knop is in
 * ruststand NOOIT rood (default antd-knop) — deactiveren is regulier curatie-werk.
 */

import React from 'react';
import { Card, Button, Empty, Modal, Descriptions, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { FLYWHEEL_COLORS as C } from './statusColors';
import { StatusBadge } from './StatusBadge';
import { decideOutlier } from '@/services/flywheelService';
import type { ClassCapsPanel as ClassCapsData, OutliersPanel, OutlierPanelItem, EmptyPanel, MismatchTrendsPanel as MismatchTrendsData } from '@/services/flywheelService';
import { isPanelError, type PanelError } from '@/services/flywheelService';

// ── Klassen aan cap ─────────────────────────────────────────────────────────

export const ClassCapsPanel: React.FC<{ classCaps: ClassCapsData | PanelError }> = ({ classCaps }) => {
  const { t } = useTranslation();
  if (isPanelError(classCaps)) {
    return (
      <Card data-testid="class-caps-error" title={t('flywheel.classCaps.title', { defaultValue: 'Klassen aan cap' })} style={{ borderRadius: 12, marginBottom: 16 }}>
        {t('flywheel.panelError', { defaultValue: 'Dit paneel kon niet geladen worden.' })}
      </Card>
    );
  }
  return (
    <Card
      data-testid="class-caps-panel"
      title={t('flywheel.classCaps.title', { defaultValue: 'Klassen aan cap' })}
      extra={<StatusBadge tone="warn">{classCaps.classes.length}</StatusBadge>}
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {classCaps.classes.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('flywheel.classCaps.empty', { defaultValue: 'Geen klassen aan hun cap.' })} />
      ) : (
        classCaps.classes.map((c) => (
          <div key={c.t3777Code} style={{ padding: '8px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{c.t3777Code}</div>
            <div style={{ fontSize: 11, color: C.foregroundMuted }}>
              {t('flywheel.classCaps.detail', {
                defaultValue: '{{active}}/{{cap}} promotie-referenties · {{rejected}} nominaties geweigerd (cap-bereikt)',
                active: c.activeCount,
                cap: c.cap,
                rejected: c.rejectedNominations,
              })}
            </div>
          </div>
        ))
      )}
    </Card>
  );
};

// ── Outlier-meldingen + beoordelingsflow ────────────────────────────────────

export const OutlierPanel: React.FC<{
  outliers: OutliersPanel | PanelError;
  onDecided?: () => void;
}> = ({ outliers, onDecided }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [selected, setSelected] = React.useState<OutlierPanelItem | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const decide = async (decision: 'behouden' | 'deactiveren') => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await decideOutlier(selected.id, decision);
      message.success(
        decision === 'deactiveren'
          ? t('flywheel.outlier.deactivated', { defaultValue: 'Referentie gedeactiveerd.' })
          : t('flywheel.outlier.kept', { defaultValue: 'Referentie behouden.' })
      );
      setSelected(null);
      onDecided?.();
    } catch {
      message.error(t('flywheel.outlier.error', { defaultValue: 'Beoordeling mislukt — probeer opnieuw.' }));
    } finally {
      setSubmitting(false);
    }
  };

  if (isPanelError(outliers)) {
    return (
      <Card data-testid="outlier-error" title={t('flywheel.outlier.title', { defaultValue: 'Outlier-meldingen' })} style={{ borderRadius: 12, marginBottom: 16 }}>
        {t('flywheel.panelError', { defaultValue: 'Dit paneel kon niet geladen worden.' })}
      </Card>
    );
  }

  return (
    <Card
      data-testid="outlier-panel"
      title={t('flywheel.outlier.title', { defaultValue: 'Outlier-meldingen' })}
      extra={<StatusBadge tone="warn">{t('flywheel.outlier.open', { defaultValue: '{{n}} open', n: outliers.openCount })}</StatusBadge>}
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {outliers.openFindings.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('flywheel.outlier.empty', { defaultValue: 'Geen openstaande outlier-meldingen.' })} />
      ) : (
        outliers.openFindings.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>
                {f.t3777Code} · {f.variantLabel}
              </div>
              <div style={{ fontSize: 11, color: C.foregroundMuted }}>
                {t('flywheel.outlier.finding', {
                  defaultValue: 'wekelijkse outlier-audit · afstand p{{pct}}',
                  pct: Math.round(f.percentile * 100),
                })}
              </div>
            </div>
            <Button size="small" data-testid="outlier-review" onClick={() => setSelected(f)}>
              {t('flywheel.outlier.review', { defaultValue: 'Beoordelen' })}
            </Button>
          </div>
        ))
      )}

      {/* Vergelijkingsweergave + beslissing (AC6). */}
      <Modal
        data-testid="outlier-modal"
        title={t('flywheel.outlier.modalTitle', { defaultValue: 'Outlier beoordelen' })}
        open={selected !== null}
        onCancel={() => setSelected(null)}
        footer={[
          <Button key="cancel" onClick={() => setSelected(null)}>
            {t('flywheel.outlier.cancel', { defaultValue: 'Annuleren' })}
          </Button>,
          <Button
            key="keep"
            data-testid="outlier-keep"
            loading={submitting}
            onClick={() => decide('behouden')}
          >
            {t('flywheel.outlier.keep', { defaultValue: 'Behouden' })}
          </Button>,
          <Button
            key="deactivate"
            type="primary"
            data-testid="outlier-deactivate"
            loading={submitting}
            onClick={() => decide('deactiveren')}
          >
            {t('flywheel.outlier.deactivate', { defaultValue: 'Deactiveren' })}
          </Button>,
        ]}
      >
        {selected && (
          <>
            <p style={{ fontSize: 13, color: C.foregroundMuted }}>
              {t('flywheel.outlier.compareIntro', {
                defaultValue: 'De gemarkeerde referentie vergeleken met haar klasse-genoten.',
              })}
            </p>
            {/* Vergelijkingsweergave: referentie naast klasse-genoten (evidence-panel-stijl). */}
            <div data-testid="outlier-comparison" style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.foregroundMuted, marginBottom: 6 }}>
                  {t('flywheel.outlier.thisRef', { defaultValue: 'Deze referentie' })}
                </div>
                <div style={{ fontWeight: 500 }}>{selected.variantLabel}</div>
              </div>
              <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: C.foregroundMuted, marginBottom: 6 }}>
                  {t('flywheel.outlier.classPeers', { defaultValue: 'Klasse-genoten' })}
                </div>
                <div style={{ fontWeight: 500 }}>{selected.t3777Code}</div>
              </div>
            </div>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('flywheel.outlier.distance', { defaultValue: 'Afstand tot centrum' })}>
                {selected.distance.toFixed(3)}
              </Descriptions.Item>
              <Descriptions.Item label={t('flywheel.outlier.percentile', { defaultValue: 'Percentiel' })}>
                p{Math.round(selected.percentile * 100)}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>
    </Card>
  );
};

// ── Lege-staat-panelen (UX-DR8) ─────────────────────────────────────────────

const EmptyStatePanel: React.FC<{ testid: string; title: string; hint: string }> = ({
  testid,
  title,
  hint,
}) => (
  <Card data-testid={testid} title={title} style={{ borderRadius: 12, marginBottom: 16 }}>
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: C.foregroundMuted }}>{hint}</span>} />
  </Card>
);

/**
 * De lege-staat-panelen accepteren de (nu lege) `panel`-payload zodat de props-
 * vorm stabiel blijft: zodra de bron-epic landt, vervangt hij deze component door
 * een echte weergave met dezelfde prop en hoeft de pagina niet te veranderen.
 *
 * Story 17.2 verving het bootstrap-wachtrij-lege-staat-paneel door het echte,
 * zelf-ophalende `BootstrapQueuePanel` (components/flywheel/BootstrapQueuePanel.tsx).
 */

/**
 * Story 16.1 levert de mismatch-aggregatie in de backend; het volledige
 * dashboard-paneel (charts per code/GLN + trend) is Story 15.2/15.x-werk. Zolang
 * dat er niet is, toont dit paneel bewust zijn lege staat (AC5, UX-DR8) —
 * ongeacht of de payload al data of een fout draagt. De prop-vorm accepteert nu
 * de echte backend-payload zodat het volgende story-werk alleen dit component
 * hoeft in te vullen, niet de pagina.
 */
export const MismatchTrendsPanel: React.FC<{ panel: MismatchTrendsData | PanelError }> = () => {
  const { t } = useTranslation();
  return (
    <EmptyStatePanel
      testid="mismatch-trends-panel"
      title={t('flywheel.mismatch.title', { defaultValue: 'Mismatch-trends' })}
      hint={t('flywheel.mismatch.empty', { defaultValue: 'Nog niet beschikbaar — komt met de mismatch-registratie (Epic 16).' })}
    />
  );
};

export const GlnCoveragePanel: React.FC<{ panel: EmptyPanel }> = () => {
  const { t } = useTranslation();
  return (
    <EmptyStatePanel
      testid="gln-coverage-panel"
      title={t('flywheel.gln.title', { defaultValue: 'GLN-dekkingsgraad' })}
      hint={t('flywheel.gln.empty', { defaultValue: 'Nog niet beschikbaar — komt met de GLN-backfill (Epic 18).' })}
    />
  );
};
