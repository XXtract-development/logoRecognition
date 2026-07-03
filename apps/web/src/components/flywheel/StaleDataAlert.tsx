/**
 * StaleDataAlert (Story 15.2, AC8, UX-DR8) — de rustige "verouderde data"-melding.
 *
 * Verschijnt wanneer de getoonde snapshot ouder is dan een drempel. GEEN
 * auto-reload, GEEN polling: alleen een knop "Vernieuwen" die een handmatige
 * refetch triggert. `aria-live="polite"` zodat schermlezers de melding rustig
 * aankondigen (Accessibility Floor).
 */

import React from 'react';
import { Alert, Button } from 'antd';
import { useTranslation } from 'react-i18next';

interface StaleDataAlertProps {
  /** Server-tijdstempel van de getoonde snapshot (ISO). */
  generatedAt: string | undefined;
  /** Drempel in milliseconden waarboven de data als verouderd geldt. */
  staleThresholdMs?: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const DEFAULT_STALE_MS = 5 * 60 * 1000; // 5 minuten

export const StaleDataAlert: React.FC<StaleDataAlertProps> = ({
  generatedAt,
  staleThresholdMs = DEFAULT_STALE_MS,
  onRefresh,
  isRefreshing,
}) => {
  const { t } = useTranslation();
  // Herbereken periodiek zodat de melding vanzelf verschijnt zonder polling van
  // de server (alleen een lokale klok-tik, geen netwerkverkeer).
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!generatedAt) return null;
  const ageMs = now - new Date(generatedAt).getTime();
  if (ageMs < staleThresholdMs) return null;

  return (
    <div aria-live="polite">
      <Alert
        data-testid="stale-data-alert"
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 10 }}
        message={t('flywheel.stale.message', {
          defaultValue: 'Bijgewerkt — deze weergave is mogelijk verouderd.',
        })}
        action={
          <Button size="small" data-testid="stale-refresh" loading={isRefreshing} onClick={onRefresh}>
            {t('flywheel.stale.refresh', { defaultValue: 'Vernieuwen' })}
          </Button>
        }
      />
    </div>
  );
};

export default StaleDataAlert;
