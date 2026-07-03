/**
 * KpiRow (Story 15.2, AC7 + AC2) — de KPI-tegelrij.
 *
 * Vijf tegels (DESIGN.md `{components.kpi-tile}`): gold-set-precisie, nieuwe
 * referenties, batches in quarantaine (+ ouderdom, SM-5), klassen aan cap,
 * GLN-dekkingsgraad (lege staat — Epic 18). Plus een zesde regel met de teller
 * "gemiste nominaties" per reden en de "laatste succesvolle run" (AC7).
 *
 * Kleursemantiek (UX-DR5): de quarantaine- en cap-icoon-container kleuren amber
 * zodra > 0 — de waarde-typografie blijft neutraal; nooit rood. KPI-klik
 * navigeert naar de bijbehorende sectie (Component Patterns): de quarantaine-
 * tegel scrollt naar de quarantainetabel.
 */

import React from 'react';
import { Card } from 'antd';
import { useTranslation } from 'react-i18next';
import { FLYWHEEL_COLORS as C } from './statusColors';
import type { KpiPanel } from '@/services/flywheelService';
import { isPanelError, type PanelError } from '@/services/flywheelService';

interface KpiRowProps {
  kpi: KpiPanel | PanelError;
  missedNominations: Record<string, number> | PanelError;
  missedNominationsTotal: number;
  lastSuccessfulPromotionRun: string | null | PanelError;
  /** Scroll-doel per tegel (KPI-klik-navigatie, Component Patterns). */
  onNavigate: (section: 'quarantine' | 'classCaps' | 'goldSet' | 'gln') => void;
}

type IconTone = 'navy' | 'teal' | 'green' | 'amber';

const iconToneStyle: Record<IconTone, { bg: string; fg: string }> = {
  navy: { bg: C.primaryLight, fg: C.primary },
  teal: { bg: C.secondaryLight, fg: C.secondary },
  green: { bg: C.successLight, fg: C.successDark },
  amber: { bg: C.warningLight, fg: C.warning },
};

function fmtPrecision(v: number | null): string {
  return v === null ? '—' : v.toFixed(2).replace('.', ',');
}

interface TileProps {
  testid: string;
  label: string;
  value: React.ReactNode;
  foot: React.ReactNode;
  tone: IconTone;
  onClick?: () => void;
}

const Tile: React.FC<TileProps> = ({ testid, label, value, foot, tone, onClick }) => {
  const it = iconToneStyle[tone];
  return (
    <Card
      data-testid={testid}
      styles={{ body: { padding: '18px 20px' } }}
      style={{ borderRadius: 12, cursor: onClick ? 'pointer' : 'default' }}
      hoverable={!!onClick}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.foregroundMuted }}>{label}</span>
        <span
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: it.bg,
            color: it.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: C.foreground }}>{value}</div>
      <div style={{ fontSize: 12, color: C.foregroundMuted, marginTop: 2 }}>{foot}</div>
    </Card>
  );
};

export const KpiRow: React.FC<KpiRowProps> = ({
  kpi,
  missedNominations,
  missedNominationsTotal,
  lastSuccessfulPromotionRun,
  onNavigate,
}) => {
  const { t } = useTranslation();

  if (isPanelError(kpi)) {
    return (
      <Card data-testid="kpi-error" style={{ borderRadius: 12, marginBottom: 20 }}>
        {t('flywheel.panelError', { defaultValue: 'Kerncijfers konden niet geladen worden.' })}
      </Card>
    );
  }

  const quarantineTone: IconTone = kpi.quarantine.count > 0 ? 'amber' : 'green';
  const capTone: IconTone = kpi.classesAtCap.count > 0 ? 'amber' : 'navy';

  const ageLabel =
    kpi.quarantine.oldestAgeHours !== null
      ? t('flywheel.kpi.oldestAge', {
          defaultValue: 'oudste {{hours}} u open',
          hours: kpi.quarantine.oldestAgeHours,
        })
      : t('flywheel.kpi.quarantineWaiting', { defaultValue: 'wacht op jouw beoordeling' });

  const lastRun = isPanelError(lastSuccessfulPromotionRun)
    ? '—'
    : lastSuccessfulPromotionRun
      ? new Date(lastSuccessfulPromotionRun).toLocaleString('nl-NL')
      : t('flywheel.kpi.noRun', { defaultValue: 'nog geen run' });

  return (
    <>
      <section
        data-testid="kpi-row"
        aria-label={t('flywheel.kpi.sectionLabel', { defaultValue: 'Kerncijfers' })}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 14 }}
      >
        <Tile
          testid="kpi-precision"
          tone="green"
          label={t('flywheel.kpi.precision', { defaultValue: 'Gold-set-precisie' })}
          value={fmtPrecision(kpi.goldSetPrecision)}
          foot={t('flywheel.kpi.tolerance', {
            defaultValue: 'tolerantie −{{pp}} pt',
            pp: 1,
          })}
        />
        <Tile
          testid="kpi-new-references"
          tone="navy"
          label={t('flywheel.kpi.newReferences', {
            defaultValue: 'Nieuwe referenties ({{days}} dgn)',
            days: kpi.newReferences.windowDays,
          })}
          value={kpi.newReferences.count}
          foot={t('flywheel.kpi.newReferencesFoot', {
            defaultValue: 'over {{classes}} klassen · {{batches}} promotiebatches',
            classes: kpi.newReferences.classCount,
            batches: kpi.newReferences.passedBatches,
          })}
        />
        <Tile
          testid="kpi-quarantine"
          tone={quarantineTone}
          label={t('flywheel.kpi.quarantine', { defaultValue: 'Batches in quarantaine' })}
          value={kpi.quarantine.count}
          foot={
            <span style={{ color: kpi.quarantine.count > 0 ? C.warningText : C.foregroundMuted, fontWeight: kpi.quarantine.count > 0 ? 600 : 400 }}>
              {ageLabel}
            </span>
          }
          onClick={() => onNavigate('quarantine')}
        />
        <Tile
          testid="kpi-classes-at-cap"
          tone={capTone}
          label={t('flywheel.kpi.classesAtCap', { defaultValue: 'Klassen aan cap' })}
          value={kpi.classesAtCap.count}
          foot={t('flywheel.kpi.classesAtCapFoot', { defaultValue: 'nominaties geweigerd: cap-bereikt' })}
          onClick={() => onNavigate('classCaps')}
        />
        <Tile
          testid="kpi-gln-coverage"
          tone="teal"
          label={t('flywheel.kpi.glnCoverage', { defaultValue: 'GLN-dekkingsgraad archief' })}
          value="—"
          foot={t('flywheel.kpi.glnPending', { defaultValue: 'nog niet beschikbaar' })}
          onClick={() => onNavigate('gln')}
        />
      </section>

      {/* AC7: gemiste nominaties per reden + laatste succesvolle run. */}
      <div
        data-testid="kpi-secondary"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          fontSize: 12,
          color: C.foregroundMuted,
          marginBottom: 20,
        }}
      >
        <span data-testid="missed-nominations">
          {t('flywheel.kpi.missedNominations', {
            defaultValue: 'Gemiste nominaties: {{total}}',
            total: missedNominationsTotal,
          })}
          {!isPanelError(missedNominations) && (
            <span style={{ marginLeft: 6 }}>
              (
              {Object.entries(missedNominations)
                .map(([reason, n]) => `${reason}: ${n}`)
                .join(' · ')}
              )
            </span>
          )}
        </span>
        <span data-testid="last-successful-run">
          {t('flywheel.kpi.lastRun', { defaultValue: 'Laatste succesvolle run: {{when}}', when: lastRun })}
        </span>
      </div>
    </>
  );
};

export default KpiRow;
