/**
 * GoldSetCompositionCard (Story 15.2, AC4, FR-11) — het gold-set-
 * samenstellingspaneel.
 *
 * Toont omvang, ECHT/VALS-verdeling, de top-5 meest/minst vertegenwoordigde
 * klassen en de scheefgroei-signalen (uit Story 14.2's on-read-berekening).
 * Signalen zijn amber en informatief geformuleerd (géén fout, UX-DR5).
 */

import React from 'react';
import { Card, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { FLYWHEEL_COLORS as C } from './statusColors';
import { StatusBadge } from './StatusBadge';
import type { GoldSetComposition } from '@/services/flywheelService';
import { isPanelError, type PanelError } from '@/services/flywheelService';

const { Text } = Typography;

interface GoldSetCompositionCardProps {
  goldSet: GoldSetComposition | PanelError;
}

function skewLabel(
  s: { type: string; klasse?: string; waarde: number; drempel: number },
  t: TFunction
): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  if (s.type === 'set-leeg') {
    return t('flywheel.goldSet.skewEmpty', { defaultValue: 'De actieve gold-set is leeg.' });
  }
  if (s.type === 'klasse-oververtegenwoordigd') {
    return t('flywheel.goldSet.skewClass', {
      defaultValue: 'Klasse {{klasse}} is {{waarde}} van de set (signaalgrens {{drempel}}).',
      klasse: s.klasse,
      waarde: pct(s.waarde),
      drempel: pct(s.drempel),
    });
  }
  return t('flywheel.goldSet.skewBand', {
    defaultValue: 'ECHT-aandeel {{waarde}} ligt buiten de gezonde band.',
    waarde: pct(s.waarde),
  });
}

export const GoldSetCompositionCard: React.FC<GoldSetCompositionCardProps> = ({ goldSet }) => {
  const { t } = useTranslation();

  if (isPanelError(goldSet)) {
    return (
      <Card
        data-testid="gold-set-error"
        title={t('flywheel.goldSet.title', { defaultValue: 'Gold-set-samenstelling' })}
        style={{ borderRadius: 12, marginBottom: 16 }}
      >
        {t('flywheel.panelError', { defaultValue: 'Dit paneel kon niet geladen worden.' })}
      </Card>
    );
  }

  const echtPct = Math.round(goldSet.labelDistribution.echtRatio * 100);

  return (
    <Card
      data-testid="gold-set-composition"
      title={t('flywheel.goldSet.title', { defaultValue: 'Gold-set-samenstelling' })}
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      <div data-testid="gold-set-size" style={{ fontSize: 13, marginBottom: 8 }}>
        {t('flywheel.goldSet.size', {
          defaultValue: '{{size}} samples · {{classes}} klassen',
          size: goldSet.size,
          classes: goldSet.classCount,
        })}
      </div>
      <div data-testid="gold-set-labels" style={{ fontSize: 13, color: C.foregroundMuted, marginBottom: 12 }}>
        {t('flywheel.goldSet.labels', {
          defaultValue: 'ECHT {{echt}} ({{echtPct}}%) / VALS {{vals}}',
          echt: goldSet.labelDistribution.echt,
          echtPct,
          vals: goldSet.labelDistribution.vals,
        })}
      </div>

      <Text strong style={{ fontSize: 12, color: C.foregroundHeading }}>
        {t('flywheel.goldSet.top', { defaultValue: 'Meest vertegenwoordigd' })}
      </Text>
      <div data-testid="gold-set-top" style={{ marginTop: 4, marginBottom: 12 }}>
        {goldSet.topClasses.map((c) => (
          <div key={c.t3777Code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
            <span>{c.t3777Code}</span>
            <span style={{ color: C.foregroundMuted }}>{c.count} ({Math.round(c.share * 100)}%)</span>
          </div>
        ))}
      </div>

      <Text strong style={{ fontSize: 12, color: C.foregroundHeading }}>
        {t('flywheel.goldSet.bottom', { defaultValue: 'Minst vertegenwoordigd' })}
      </Text>
      <div data-testid="gold-set-bottom" style={{ marginTop: 4, marginBottom: 12 }}>
        {goldSet.bottomClasses.map((c) => (
          <div key={c.t3777Code} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
            <span>{c.t3777Code}</span>
            <span style={{ color: C.foregroundMuted }}>{c.count} ({Math.round(c.share * 100)}%)</span>
          </div>
        ))}
      </div>

      {goldSet.skewSignals.length > 0 && (
        <div data-testid="gold-set-skew">
          <Text strong style={{ fontSize: 12, color: C.foregroundHeading }}>
            {t('flywheel.goldSet.skewTitle', { defaultValue: 'Scheefgroei-signalen' })}
          </Text>
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {goldSet.skewSignals.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusBadge tone="warn">{t('flywheel.goldSet.signal', { defaultValue: 'signaal' })}</StatusBadge>
                <span style={{ fontSize: 12, color: C.warningText }}>{skewLabel(s, t)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

export default GoldSetCompositionCard;
