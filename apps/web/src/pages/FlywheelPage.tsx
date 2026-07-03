/**
 * FlywheelPage (Story 15.1) — het casco van het vliegwiel-overzicht.
 *
 * Deze story levert de route `/flywheel`, de gescopeerde XXtract-theming
 * (FlywheelThemeProvider), de lege/ladende staten en de i18next-basis. De
 * inhoudelijke dashboard-panelen (KPI-tegels, precisietrend, quarantainetabel,
 * signaalpanelen) komen in Story 15.2; de batch-detailpagina in 15.3.
 *
 * State Patterns (EXPERIENCE.md, UX-DR8):
 *  - Laden = skeleton-tegels/-rijen in de verwachte layout (géén spinner-op-wit).
 *  - Leeg (vers systeem) = richtinggevende empty state, geen kale vlakken.
 *  - Fout = sectie-lokale foutkaart met "Opnieuw proberen".
 *
 * Kleursemantiek (UX-DR5): amber = quarantaine/wachtend (géén fout); rood
 * uitsluitend regressie-alarm/stilstand — die toestanden komen in latere stories.
 */

import React from 'react';
import { Typography, Card, Skeleton, Empty, Alert, Button, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { FlywheelThemeProvider } from '@/components/flywheel/FlywheelThemeProvider';
import { useFlywheelOverview } from '@/components/flywheel/useFlywheelOverview';

const { Title, Text } = Typography;

/** Pagina-achtergrond binnen de flywheel-subtree (DESIGN.md app-bg). */
const APP_BG = '#EDF1F7';

const FlywheelPage: React.FC = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useFlywheelOverview();

  return (
    <FlywheelThemeProvider>
      <div
        data-testid="flywheel-page"
        style={{ minHeight: '100vh', background: APP_BG, padding: '24px 28px' }}
      >
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          {/* Pagina-header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div>
              <Title
                level={2}
                style={{
                  color: '#2F5A7A',
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {t('flywheel.pageTitle', { defaultValue: 'Vliegwiel' })}
              </Title>
              <Text style={{ color: '#64748B', fontSize: 13 }}>
                {t('flywheel.pageSubtitle', {
                  defaultValue: 'Referentie-vliegwiel — gezondheid in één blik',
                })}
              </Text>
            </div>
            <Button
              icon={<ReloadOutlined spin={isFetching} />}
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {t('flywheel.refresh', { defaultValue: 'Vernieuwen' })}
            </Button>
          </div>

          {/* Fout: sectie-lokale foutkaart, rest van het dashboard blijft bruikbaar. */}
          {isError && (
            <Alert
              data-testid="flywheel-error"
              type="error"
              showIcon
              style={{ marginBottom: 16, borderRadius: 10 }}
              message={t('flywheel.errorTitle', {
                defaultValue: 'Overzicht kon niet geladen worden',
              })}
              description={t('flywheel.errorDescription', {
                defaultValue: 'Probeer het overzicht opnieuw te laden.',
              })}
              action={
                <Button size="small" onClick={() => refetch()}>
                  {t('flywheel.retry', { defaultValue: 'Opnieuw proberen' })}
                </Button>
              }
            />
          )}

          {/* Laden: skeleton-tegels in de verwachte KPI-layout (5-koloms grid). */}
          {isLoading && (
            <div
              data-testid="flywheel-loading"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 14,
              }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <Card style={{ borderRadius: 12 }} key={i}>
                  <Skeleton active paragraph={{ rows: 1 }} title />
                </Card>
              ))}
            </div>
          )}

          {/* Geladen: casco met richtinggevende empty state (panelen = Story 15.2). */}
          {!isLoading && !isError && (
            <Card data-testid="flywheel-empty" style={{ borderRadius: 12 }}>
              <Empty
                description={
                  <Space direction="vertical" size={4}>
                    <Text strong style={{ color: '#1E293B' }}>
                      {t('flywheel.emptyTitle', {
                        defaultValue:
                          'Nog geen promotiebatches — het vliegwiel nomineert bij de volgende verwerking.',
                      })}
                    </Text>
                    <Text style={{ color: '#64748B', fontSize: 13 }}>
                      {t('flywheel.emptyQuarantine', {
                        defaultValue: '{{count}} batch wacht op jouw beoordeling.',
                        count: data?.quarantineCount ?? 0,
                      })}
                    </Text>
                  </Space>
                }
              />
            </Card>
          )}
        </div>
      </div>
    </FlywheelThemeProvider>
  );
};

export default FlywheelPage;
