/**
 * StandstillBanner (Story 15.4, AC3/AC5, UX-DR5/DR6, State Patterns).
 *
 * Twee banners, gestuurd door de `standstill.mode` uit de overview-payload:
 *  - `manual` → AMBER pauzebanner (`role="alert"`) onder de pagina-header: wie/
 *    wanneer pauzeerde. Amber = gepauzeerd/wachtend, GÉÉN fout (UX-DR5).
 *  - `auto`   → RODE stilstand-banner (`role="alert"`) bovenaan vóór alle content:
 *    de aanleiding (K opeenvolgende quarantaines) + links naar de betrokken
 *    batch-detailpagina's. Dit is — naast het regressie-meetpunt — de ENIGE rode
 *    toestand in het scherm; de pauzeschakelaar zelf wordt nooit rood.
 *
 * Accessibility (UX-DR9): beide banners zijn `role="alert"`, status via icoon +
 * tekst (nooit kleur alleen). NL-copy via i18next met vaste defaults.
 */

import React from 'react';
import { Typography } from 'antd';
import { PauseCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FLYWHEEL_COLORS } from './statusColors';
import { isPanelError, type StandstillPanel } from '@/services/flywheelService';

const { Text } = Typography;

interface StandstillBannerProps {
  standstill: StandstillPanel | { error: string } | undefined;
  /** Toon alleen de amber (manual) of alleen de rode (auto) variant. */
  variant: 'manual' | 'auto';
}

/** Formatteer een ISO-tijdstip naar NL datum+tijd (bv. "3 jul 2026, 09:14"). */
function formatSince(since: string | null): string {
  if (!since) return '';
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const StandstillBanner: React.FC<StandstillBannerProps> = ({ standstill, variant }) => {
  const { t } = useTranslation();

  if (!standstill || isPanelError(standstill)) return null;
  if (!standstill.paused) return null;

  // ── Rode stilstand-banner (automatische stilstand) ──────────────────────────
  if (variant === 'auto') {
    if (standstill.mode !== 'auto') return null;
    const k = standstill.k ?? standstill.batchIds.length;
    return (
      <div
        data-testid="standstill-banner"
        role="alert"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: FLYWHEEL_COLORS.destructiveLight,
          border: `1px solid ${FLYWHEEL_COLORS.destructive}`,
          borderRadius: 10,
          padding: '12px 16px',
          marginBottom: 16,
        }}
      >
        <WarningOutlined style={{ color: FLYWHEEL_COLORS.destructive, fontSize: 18, marginTop: 2 }} />
        <div>
          <Text strong style={{ color: FLYWHEEL_COLORS.destructive, display: 'block' }}>
            {t('flywheel.standstill.title', {
              defaultValue:
                'Automatische stilstand: {{k}} opeenvolgende promotiebatches in quarantaine. Hervatten kan na beoordeling.',
              k,
            })}
          </Text>
          {standstill.batchIds.length > 0 && (
            <div data-testid="standstill-batch-links" style={{ marginTop: 4, fontSize: 13 }}>
              <Text style={{ color: FLYWHEEL_COLORS.foregroundMuted, marginRight: 6 }}>
                {t('flywheel.standstill.batchesLabel', { defaultValue: 'Betrokken batches:' })}
              </Text>
              {standstill.batchIds.map((id, i) => (
                <React.Fragment key={id}>
                  {i > 0 && <span style={{ color: FLYWHEEL_COLORS.foregroundMuted }}>, </span>}
                  <Link
                    data-testid={`standstill-batch-link-${id}`}
                    to={`/flywheel/batches/${id}`}
                    style={{ color: FLYWHEEL_COLORS.destructive, textDecoration: 'underline' }}
                  >
                    {id.slice(0, 8)}
                  </Link>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Amber pauzebanner (handmatige pauze) ────────────────────────────────────
  if (standstill.mode !== 'manual') return null;
  const who = standstill.by ?? t('flywheel.pause.unknownUser', { defaultValue: 'onbekend' });
  const when = formatSince(standstill.since);
  return (
    <div
      data-testid="pause-banner"
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: FLYWHEEL_COLORS.warningLight,
        border: `1px solid ${FLYWHEEL_COLORS.warning}`,
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
      }}
    >
      <PauseCircleOutlined style={{ color: FLYWHEEL_COLORS.warning, fontSize: 18 }} />
      <Text style={{ color: FLYWHEEL_COLORS.warningText }}>
        {t('flywheel.pause.banner', {
          defaultValue:
            'Vliegwiel gepauzeerd door {{who}} op {{when}} — nominatie en promotie staan stil.',
          who,
          when,
        })}
      </Text>
    </div>
  );
};

export default StandstillBanner;
