/**
 * PauseSwitch (Story 15.4, AC3/AC4, Component Patterns pause-switch).
 *
 * Schakelaar in de pagina-header met label "Vliegwiel actief" / "Gepauzeerd".
 * Omzetten opent ALTIJD een bevestigingsmodal:
 *  - naar pauze → consequentie-tekst "Nominatie en promotie stoppen; detectie en
 *    trainingsdata-registratie lopen door." (pauze-scope AD-11).
 *  - naar hervatten → dezelfde expliciete bevestiging; toont eventuele openstaande
 *    quarantaines als WAARSCHUWING ("N batches wachten nog op jouw beoordeling.")
 *    ZONDER te blokkeren (FR-19, Key Flow 2-faalpad).
 *
 * De schakelaar wordt NOOIT rood (UX-DR5): neutraal grijs met amber statuslabel
 * bij pauze. Na een succesvolle actie invalideert de component de overview-query
 * zodat banner en KPI-tegels bijwerken.
 */

import React from 'react';
import { Switch, Modal, Typography, Space, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { FLYWHEEL_COLORS } from './statusColors';
import { FLYWHEEL_OVERVIEW_QUERY_KEY } from './useFlywheelOverview';
import { pauseFlywheel, resumeFlywheel } from '@/services/flywheelService';

const { Text } = Typography;

interface PauseSwitchProps {
  /** Is het vliegwiel momenteel gepauzeerd (handmatig of automatisch)? */
  paused: boolean;
  /** Openstaande quarantaines (voor de hervat-waarschuwing). */
  openQuarantines: number;
  /** Is dit een automatische stilstand (label toont dan "Gepauzeerd (automatisch)")? */
  auto?: boolean;
}

export const PauseSwitch: React.FC<PauseSwitchProps> = ({ paused, openQuarantines, auto }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [resumeOpen, setResumeOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Omzetten opent altijd de juiste bevestigingsmodal (nooit direct schakelen).
  const onToggle = () => {
    if (paused) {
      setResumeOpen(true);
    } else {
      setConfirmOpen(true);
    }
  };

  const doPause = async () => {
    setBusy(true);
    try {
      await pauseFlywheel();
      message.success(t('flywheel.pause.paused', { defaultValue: 'Vliegwiel gepauzeerd.' }));
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: FLYWHEEL_OVERVIEW_QUERY_KEY });
    } catch {
      message.error(t('flywheel.pause.failed', { defaultValue: 'Pauzeren mislukt — probeer opnieuw.' }));
    } finally {
      setBusy(false);
    }
  };

  const doResume = async () => {
    setBusy(true);
    try {
      await resumeFlywheel();
      message.success(t('flywheel.pause.resumed', { defaultValue: 'Vliegwiel hervat.' }));
      setResumeOpen(false);
      await queryClient.invalidateQueries({ queryKey: FLYWHEEL_OVERVIEW_QUERY_KEY });
    } catch {
      message.error(t('flywheel.pause.resumeFailed', { defaultValue: 'Hervatten mislukt — probeer opnieuw.' }));
    } finally {
      setBusy(false);
    }
  };

  const label = paused
    ? auto
      ? t('flywheel.pause.labelAuto', { defaultValue: 'Gepauzeerd (automatisch)' })
      : t('flywheel.pause.labelPaused', { defaultValue: 'Gepauzeerd' })
    : t('flywheel.pause.labelActive', { defaultValue: 'Vliegwiel actief' });

  return (
    <div data-testid="pause-switch" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Switch
        data-testid="pause-toggle"
        checked={!paused}
        onChange={onToggle}
        aria-label={t('flywheel.pause.switchAria', { defaultValue: 'Vliegwiel pauzeren of hervatten' })}
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: paused ? FLYWHEEL_COLORS.warningText : FLYWHEEL_COLORS.foreground,
        }}
      >
        {label}
      </Text>

      {/* Bevestigingsmodal — pauzeren (consequenties benoemd, AD-11). */}
      <Modal
        data-testid="pause-confirm-modal"
        open={confirmOpen}
        title={t('flywheel.pause.confirmTitle', { defaultValue: 'Vliegwiel pauzeren?' })}
        okText={t('flywheel.pause.confirmOk', { defaultValue: 'Pauzeren' })}
        cancelText={t('common.cancel', { defaultValue: 'Annuleren' })}
        onOk={doPause}
        onCancel={() => setConfirmOpen(false)}
        okButtonProps={{ loading: busy, 'data-testid': 'pause-confirm-ok' }}
      >
        <Text data-testid="pause-consequence">
          {t('flywheel.pause.consequence', {
            defaultValue:
              'Nominatie en promotie stoppen; detectie en trainingsdata-registratie lopen door.',
          })}
        </Text>
      </Modal>

      {/* Hervat-modal — waarschuwt over openstaande quarantaines, blokkeert niet. */}
      <Modal
        data-testid="resume-modal"
        open={resumeOpen}
        title={t('flywheel.pause.resumeTitle', { defaultValue: 'Vliegwiel hervatten?' })}
        okText={t('flywheel.pause.resumeOk', { defaultValue: 'Hervatten' })}
        cancelText={t('common.cancel', { defaultValue: 'Annuleren' })}
        onOk={doResume}
        onCancel={() => setResumeOpen(false)}
        okButtonProps={{ loading: busy, 'data-testid': 'resume-confirm-ok' }}
      >
        <Space direction="vertical" size={8}>
          <Text>
            {t('flywheel.pause.resumeBody', {
              defaultValue:
                'Nominatie en promotie starten weer. Detectie en trainingsdata-registratie liepen door.',
            })}
          </Text>
          {openQuarantines > 0 && (
            <Text data-testid="resume-quarantine-warning" style={{ color: FLYWHEEL_COLORS.warningText }}>
              {t('flywheel.pause.resumeWarning', {
                defaultValue:
                  '{{count}} batches wachten nog op jouw beoordeling. Hervatten kan — de batches blijven veilig in quarantaine.',
                count: openQuarantines,
              })}
            </Text>
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default PauseSwitch;
