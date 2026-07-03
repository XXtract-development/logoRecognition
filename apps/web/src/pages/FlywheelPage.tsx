/**
 * FlywheelPage (Story 15.1 casco + Story 15.2 overzichtsscherm).
 *
 * Het volledige vliegwiel-overzicht conform mock-overzicht.html: KPI-tegelrij,
 * gold-set-precisietrend, quarantainetabel (+ Historie-tab met rollback),
 * gold-set-samenstellingspaneel, en de signaalpanelen (klassen-aan-cap, outlier-
 * meldingen met beoordelingsflow, bootstrap-wachtrij/mismatch-trends/GLN-dekking
 * als lege staat tot hun bron-epic landt).
 *
 * State Patterns (EXPERIENCE.md, UX-DR8):
 *  - Laden = skeleton-tegels/-rijen in de verwachte layout (géén spinner-op-wit).
 *  - Fout = sectie-lokale foutkaart met "Opnieuw proberen" (rest bruikbaar).
 *  - Verouderde data = rustige "Bijgewerkt — vernieuwen"-melding, GEEN polling.
 *
 * Kleursemantiek (UX-DR5): amber = quarantaine/wachtend (géén fout); rood
 * uitsluitend regressie-alarm/stilstand (15.4). Verversing: refresh-on-load +
 * handmatige verversknop, géén live-polling (Component Patterns).
 */

import React from 'react';
import { Typography, Card, Skeleton, Alert, Button, App } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FlywheelThemeProvider } from '@/components/flywheel/FlywheelThemeProvider';
import { useFlywheelOverview } from '@/components/flywheel/useFlywheelOverview';
import { KpiRow } from '@/components/flywheel/KpiRow';
import { PrecisionTrendCard } from '@/components/flywheel/PrecisionTrendCard';
import { QuarantineCard } from '@/components/flywheel/QuarantineCard';
import { GoldSetCompositionCard } from '@/components/flywheel/GoldSetCompositionCard';
import {
  ClassCapsPanel,
  OutlierPanel,
  BootstrapQueuePanel,
  MismatchTrendsPanel,
  GlnCoveragePanel,
} from '@/components/flywheel/SignalPanels';
import { StaleDataAlert } from '@/components/flywheel/StaleDataAlert';

const { Title, Text } = Typography;

const APP_BG = '#EDF1F7';

const FlywheelContent: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useFlywheelOverview();

  const quarantineRef = React.useRef<HTMLDivElement>(null);
  const classCapsRef = React.useRef<HTMLDivElement>(null);
  const goldSetRef = React.useRef<HTMLDivElement>(null);
  const glnRef = React.useRef<HTMLDivElement>(null);

  const scrollTo = (section: 'quarantine' | 'classCaps' | 'goldSet' | 'gln') => {
    const map = {
      quarantine: quarantineRef,
      classCaps: classCapsRef,
      goldSet: goldSetRef,
      gln: glnRef,
    };
    map[section].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Batch-detail (Story 15.3): navigeer naar /flywheel/batches/:id. Met
  // onOpenBatch doorgegeven vervalt de 15.2-Drawer-fallback in QuarantineCard.

  return (
    <div data-testid="flywheel-page" style={{ minHeight: '100vh', background: APP_BG, padding: '24px 28px' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        {/* Pagina-header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div>
            <Title level={2} style={{ color: '#2F5A7A', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
              {t('flywheel.pageTitle', { defaultValue: 'Vliegwiel' })}
            </Title>
            <Text style={{ color: '#64748B', fontSize: 13 }}>
              {t('flywheel.pageSubtitle', { defaultValue: 'Referentie-vliegwiel — gezondheid in één blik' })}
            </Text>
          </div>
          <Button
            data-testid="flywheel-refresh"
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {t('flywheel.refresh', { defaultValue: 'Vernieuwen' })}
          </Button>
        </div>

        {/* Verouderde-data-melding (AC8) — geen polling, alleen handmatig. */}
        {!isLoading && !isError && (
          <StaleDataAlert generatedAt={data?.generatedAt} onRefresh={() => refetch()} isRefreshing={isFetching} />
        )}

        {/* Volledige laad-fout (netwerk): sectie-lokale foutkaart. */}
        {isError && (
          <Alert
            data-testid="flywheel-error"
            type="error"
            showIcon
            style={{ marginBottom: 16, borderRadius: 10 }}
            message={t('flywheel.errorTitle', { defaultValue: 'Overzicht kon niet geladen worden' })}
            description={t('flywheel.errorDescription', { defaultValue: 'Probeer het overzicht opnieuw te laden.' })}
            action={
              <Button size="small" onClick={() => refetch()}>
                {t('flywheel.retry', { defaultValue: 'Opnieuw proberen' })}
              </Button>
            }
          />
        )}

        {/* Laden: skeleton-tegels in de verwachte KPI-layout. */}
        {isLoading && (
          <div
            data-testid="flywheel-loading"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <Card style={{ borderRadius: 12 }} key={i}>
                <Skeleton active paragraph={{ rows: 1 }} title />
              </Card>
            ))}
          </div>
        )}

        {/* Geladen dashboard. */}
        {!isLoading && !isError && data && (
          <>
            <KpiRow
              kpi={data.kpi}
              missedNominations={data.missedNominations}
              missedNominationsTotal={data.missedNominationsTotal}
              lastSuccessfulPromotionRun={data.lastSuccessfulPromotionRun}
              onNavigate={scrollTo}
            />

            <div
              data-testid="flywheel-grid"
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}
            >
              {/* Linkerkolom */}
              <div>
                <div ref={goldSetRef}>
                  <PrecisionTrendCard trend={data.precisionTrend} goldSet={data.goldSetComposition} />
                </div>
                <div ref={quarantineRef}>
                  <QuarantineCard
                    quarantine={data.quarantine}
                    history={data.history}
                    onOpenBatch={(batchId) => navigate(`/flywheel/batches/${batchId}`)}
                    onRolledBack={() => refetch()}
                  />
                </div>
                <MismatchTrendsPanel panel={data.mismatchTrends} />
              </div>

              {/* Rechterkolom: signaalpanelen */}
              <div>
                <GoldSetCompositionCard goldSet={data.goldSetComposition} />
                <div ref={classCapsRef}>
                  <ClassCapsPanel classCaps={data.classCaps} />
                </div>
                <OutlierPanel outliers={data.outliers} onDecided={() => refetch()} />
                <BootstrapQueuePanel panel={data.bootstrapQueue} />
                <div ref={glnRef}>
                  <GlnCoveragePanel panel={data.glnCoverage} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const FlywheelPage: React.FC = () => {
  return (
    <FlywheelThemeProvider>
      <App>
        <FlywheelContent />
      </App>
    </FlywheelThemeProvider>
  );
};

export default FlywheelPage;
