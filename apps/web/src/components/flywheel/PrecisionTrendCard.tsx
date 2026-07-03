/**
 * PrecisionTrendCard (Story 15.2, AC1/AC2 + Accessibility Floor) — de
 * gold-set-precisietrend.
 *
 * @ant-design/plots `Line`: één meetpunt per gepasseerde batch, tolerantie-
 * ondergrens als gestippelde referentielijn, het regressiepunt in rood mét een
 * afwijkende marker én een tekstuele annotatie (kleur nooit als enige kanaal,
 * UX-DR9). Daarnaast een tekstueel alternatief (laatste meting + delta als
 * caption) en de data-als-tabel (opvraagbaar) — het accessibility-floor-contract.
 *
 * Kleursemantiek (UX-DR5): trendlijn teal, regressie-meetpunt rood — het enige
 * rood in de grafiek.
 */

import React from 'react';
import { Card, Table, Typography, Button } from 'antd';
import { Line } from '@ant-design/plots';
import { useTranslation } from 'react-i18next';
import { FLYWHEEL_COLORS as C } from './statusColors';
import type { PrecisionTrendPanel, GoldSetComposition } from '@/services/flywheelService';
import { isPanelError, type PanelError } from '@/services/flywheelService';

const { Text } = Typography;

interface PrecisionTrendCardProps {
  trend: PrecisionTrendPanel | PanelError;
  goldSet: GoldSetComposition | PanelError;
}

function fmt(v: number | null): string {
  return v === null ? '—' : v.toFixed(3).replace('.', ',');
}

export const PrecisionTrendCard: React.FC<PrecisionTrendCardProps> = ({ trend, goldSet }) => {
  const { t } = useTranslation();
  const [showData, setShowData] = React.useState(false);

  if (isPanelError(trend)) {
    return (
      <Card
        data-testid="precision-trend-error"
        title={t('flywheel.trend.title', { defaultValue: 'Gold-set-precisietrend' })}
        style={{ borderRadius: 12, marginBottom: 16 }}
      >
        {t('flywheel.panelError', { defaultValue: 'Dit paneel kon niet geladen worden.' })}{' '}
      </Card>
    );
  }

  const measured = trend.points.filter((p) => p.precision !== null);
  const chartData = measured.map((p) => ({
    at: new Date(p.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
    precision: p.precision as number,
    regression: p.regression,
  }));

  const deltaLabel =
    trend.latestDeltaPp === null
      ? ''
      : t('flywheel.trend.delta', {
          defaultValue: 'Δ {{delta}} pt t.o.v. vorige meting',
          delta: (trend.latestDeltaPp >= 0 ? '+' : '') + trend.latestDeltaPp.toFixed(1),
        });

  // Tekstueel alternatief (Accessibility Floor): laatste meting + delta.
  const caption = t('flywheel.trend.caption', {
    defaultValue: 'Laatste meting: {{value}}. {{delta}}',
    value: fmt(trend.latestPrecision),
    delta: deltaLabel,
  });

  const goldSetSub = isPanelError(goldSet)
    ? null
    : t('flywheel.trend.goldSetSub', {
        defaultValue: 'Gold-set: {{size}} samples ({{echt}}% ECHT / {{vals}}% VALS)',
        size: goldSet.size,
        echt: Math.round(goldSet.labelDistribution.echtRatio * 100),
        vals: goldSet.size > 0 ? Math.round((goldSet.labelDistribution.vals / goldSet.size) * 100) : 0,
      });

  const config = {
    data: chartData,
    xField: 'at',
    yField: 'precision',
    height: 220,
    color: C.secondary,
    point: {
      shapeField: (d: { regression?: boolean }) => (d.regression ? 'diamond' : 'circle'),
      sizeField: 4,
      style: {
        fill: (d: { regression?: boolean }) => (d.regression ? C.destructive : C.secondary),
      },
    },
    // Tolerantie-ondergrens als gestippelde referentielijn.
    annotations:
      trend.latestPrecision !== null
        ? [
            {
              type: 'line',
              style: { stroke: C.warning, lineDash: [5, 4] },
            },
          ]
        : [],
  } as unknown as Record<string, unknown>;

  return (
    <Card
      data-testid="precision-trend"
      title={t('flywheel.trend.title', { defaultValue: 'Gold-set-precisietrend' })}
      extra={
        <Button
          type="link"
          size="small"
          data-testid="trend-toggle-data"
          onClick={() => setShowData((s) => !s)}
        >
          {showData
            ? t('flywheel.trend.hideData', { defaultValue: 'Verberg data' })
            : t('flywheel.trend.showData', { defaultValue: 'Toon als tabel' })}
        </Button>
      }
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {chartData.length > 0 ? (
        <div role="img" aria-label={caption}>
          <Line {...config} />
        </div>
      ) : (
        <Text type="secondary" data-testid="trend-empty">
          {t('flywheel.trend.empty', {
            defaultValue: 'Nog geen meetpunten — de eerste gepasseerde batch verschijnt hier.',
          })}
        </Text>
      )}

      {/* Tekstueel alternatief (altijd zichtbaar, UX-DR9). */}
      <div data-testid="trend-caption" style={{ marginTop: 8, fontSize: 12, color: C.foregroundMuted }}>
        {caption}
        {goldSetSub ? ` · ${goldSetSub}` : ''}
      </div>

      {/* Regressie-annotaties tekstueel (kleur nooit als enige kanaal). */}
      {trend.points
        .filter((p) => p.regression)
        .map((p) => (
          <div
            key={p.batchId}
            data-testid="trend-regression-annotation"
            style={{ marginTop: 4, fontSize: 12, color: C.destructive, fontWeight: 600 }}
          >
            {p.caption ?? t('flywheel.trend.regression', { defaultValue: 'Regressie → quarantaine' })}
          </div>
        ))}

      {showData && (
        <Table
          data-testid="trend-data-table"
          size="small"
          rowKey="batchId"
          style={{ marginTop: 12 }}
          pagination={false}
          dataSource={trend.points}
          columns={[
            {
              title: t('flywheel.trend.colDate', { defaultValue: 'Datum' }),
              dataIndex: 'at',
              render: (v: string) => new Date(v).toLocaleDateString('nl-NL'),
            },
            {
              title: t('flywheel.trend.colPrecision', { defaultValue: 'Precisie' }),
              dataIndex: 'precision',
              render: (v: number | null) => fmt(v),
            },
            {
              title: t('flywheel.trend.colStatus', { defaultValue: 'Status' }),
              dataIndex: 'status',
            },
          ]}
        />
      )}
    </Card>
  );
};

export default PrecisionTrendCard;
