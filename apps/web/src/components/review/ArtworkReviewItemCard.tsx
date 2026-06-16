/**
 * ArtworkReviewItemCard (Epic 8, Story 8.5 — AC3)
 *
 * A single artwork review item from the T3777 crosscheck. Shows the proposed
 * label, confidence, detection method and discrepancy reason in the list, and —
 * when opened — the crop preview plus full provenance (source file + bounding
 * box). The crop URL is presigned on-view (lazily), never eagerly for the whole
 * queue. ADMIN users get accept/reject actions; others see them disabled.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Tag, Typography, Space, Spin, Tooltip, Image } from 'antd';
import { CheckOutlined, CloseOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  fetchReviewItemCropUrl,
  type ArtworkReviewItem,
} from '@/services/artworkReviewService';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { isBeneluxCode } from '@/data/benelux-codes';

const { Text } = Typography;

interface ArtworkReviewItemCardProps {
  item: ArtworkReviewItem;
  /** Whether the current user may mutate (ADMIN). */
  canMutate: boolean;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

/** Format a confidence (0..1) as a percentage; "—" when absent. */
function formatConfidence(confidence: number | null): string {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return '—';
  return `${Math.round(confidence * 100)}%`;
}

/** Confidence badge colour follows the XXtract palette (green high → red low). */
function confidenceColor(confidence: number | null): string {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return '#94A3B8';
  if (confidence >= 0.85) return '#B7D945';
  if (confidence >= 0.7) return '#54949E';
  return '#D64545';
}

/** Render bbox coordinates defensively (skip NaN/missing fields). */
function formatBbox(bbox: ArtworkReviewItem['bbox']): string | null {
  if (!bbox) return null;
  const parts: string[] = [];
  const fields: Array<[string, number | undefined]> = [
    ['x', bbox.x],
    ['y', bbox.y],
    ['w', bbox.width],
    ['h', bbox.height],
  ];
  for (const [label, value] of fields) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      parts.push(`${label}:${Math.round(value)}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

const ArtworkReviewItemCard: React.FC<ArtworkReviewItemCardProps> = ({
  item,
  canMutate,
  onAccept,
  onReject,
}) => {
  const { t } = useTranslation();
  // Responsive: on phones we give the crop more room and turn the accept/reject
  // controls into large, thumb-friendly full-width buttons. Desktop is unchanged.
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useState(false);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [cropError, setCropError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Presign the crop on mount (once per item) so every row shows a thumbnail —
  // reviewing the queue means SEEING the logos at a glance, not click-to-expand
  // each item. The same presigned URL feeds the thumbnail and the expanded
  // provenance crop. A ref guards against re-fetching on re-render.
  const requestedRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (requestedRef.current === item.id) return;
    requestedRef.current = item.id;
    let active = true;
    setCropLoading(true);
    setCropError(false);
    fetchReviewItemCropUrl(item.id)
      .then(({ cropUrl: c, artworkUrl: a }) => {
        if (active) {
          setCropUrl(c);
          setArtworkUrl(a);
          setCropLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setCropError(true);
          setCropLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [expanded, item.id]);

  const handleAccept = useCallback(async () => {
    setBusy(true);
    try {
      await onAccept(item.id);
    } finally {
      setBusy(false);
    }
  }, [item.id, onAccept]);

  const handleReject = useCallback(async () => {
    setBusy(true);
    try {
      await onReject(item.id);
    } finally {
      setBusy(false);
    }
  }, [item.id, onReject]);

  const bbox = formatBbox(item.bbox);
  const confidenceText = formatConfidence(item.confidence);

  return (
    <Card
      size="small"
      data-testid="artwork-review-item"
      style={{ borderColor: '#E2E8F0' }}
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {/* Header: thumbnail + proposed label + confidence + method */}
        <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space wrap align="center">
            {/* Always-visible crop thumbnail so the queue is reviewable at a
                glance. Click to expand full provenance. */}
            <div
              onClick={() => setExpanded((v) => !v)}
              title={t('review.showDetails', { defaultValue: 'Toon herkomst' })}
              style={{
                width: 64,
                height: 64,
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 6,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {cropLoading ? (
                <Spin size="small" />
              ) : cropUrl || artworkUrl ? (
                <img
                  data-testid="review-item-thumb"
                  src={cropUrl ?? artworkUrl ?? undefined}
                  alt={`${item.t3777Code} ${cropUrl ? 'crop' : 'artwork'}`}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                />
              ) : (
                <Text type="secondary" style={{ fontSize: 10 }}>
                  {cropError ? '—' : '…'}
                </Text>
              )}
            </div>
            <Text strong style={{ color: '#1E293B', fontSize: 15 }}>
              {item.t3777Code}
            </Text>
            {isBeneluxCode(item.t3777Code) && (
              <Tag color="#2F5A7A" data-testid="review-item-benelux">
                🇧🇪🇳🇱 Benelux
              </Tag>
            )}
            <Tag color={confidenceColor(item.confidence)} data-testid="review-item-confidence">
              {t('review.confidence', { defaultValue: 'Confidence' })}: {confidenceText}
            </Tag>
            {item.method && (
              <Tag color="#54949E" data-testid="review-item-method">
                {t('review.method', { defaultValue: 'Methode' })}: {item.method}
              </Tag>
            )}
          </Space>
          <Button
            type={isMobile ? 'default' : 'link'}
            size={isMobile ? 'middle' : 'small'}
            onClick={() => setExpanded((v) => !v)}
            data-testid="review-item-toggle"
            style={isMobile ? { color: '#2F5A7A', marginTop: 4 } : { color: '#54949E' }}
          >
            {expanded
              ? t('review.hideDetails', { defaultValue: 'Verberg details' })
              : isMobile
                ? t('review.showCrop', { defaultValue: 'Toon crop & herkomst' })
                : t('review.showDetails', { defaultValue: 'Toon herkomst' })}
          </Button>
        </Space>

        {/* GTIN + discrepancy reason (always visible in the list) */}
        <Text type="secondary" style={{ fontSize: 12 }}>
          GTIN {item.gtin}
        </Text>
        <Text data-testid="review-item-reason" style={{ color: '#1E293B' }}>
          {item.reason}
        </Text>

        {/* On-view provenance block: crop preview + source + bbox */}
        {expanded && (
          <div
            data-testid="review-item-provenance"
            style={{
              borderTop: '1px solid #E2E8F0',
              paddingTop: 12,
              display: 'flex',
              gap: 16,
              flexDirection: isMobile ? 'column' : 'row',
              flexWrap: 'wrap',
            }}
          >
            {(() => {
              const showArtwork = !cropLoading && !cropUrl && !!artworkUrl;
              return (
                <div
                  style={{
                    // Full-width for the "find the keurmerk on the whole pack" case
                    // so a small mark is actually inspectable; compact for crops.
                    width: isMobile ? '100%' : showArtwork ? '100%' : 160,
                    flexBasis: showArtwork && !isMobile ? '100%' : undefined,
                    minHeight: isMobile ? 200 : 120,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    padding: showArtwork ? 8 : 0,
                  }}
                >
                  {cropLoading ? (
                    <Spin />
                  ) : cropUrl ? (
                    <img
                      data-testid="review-item-crop"
                      src={cropUrl}
                      alt={`${item.t3777Code} crop`}
                      style={{ maxWidth: '100%', maxHeight: isMobile ? 300 : 140, objectFit: 'contain' }}
                    />
                  ) : artworkUrl ? (
                    <>
                      <Image
                        data-testid="review-item-artwork"
                        src={artworkUrl}
                        alt={`${item.gtin} artwork`}
                        style={{ maxHeight: isMobile ? 460 : 520, objectFit: 'contain' }}
                        preview={{
                          mask: t('review.zoomHintArtwork', {
                            defaultValue: '🔍 Klik om in te zoomen en het keurmerk te zoeken',
                          }),
                        }}
                      />
                      <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
                        {t('review.artworkFallback', {
                          defaultValue:
                            'Niet gedetecteerd — volledige verpakking; klik om in te zoomen en het keurmerk te zoeken',
                        })}
                      </Text>
                    </>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {cropError
                        ? t('review.cropError', { defaultValue: 'Crop niet beschikbaar' })
                        : t('review.noCrop', { defaultValue: 'Geen crop' })}
                    </Text>
                  )}
                </div>
              );
            })()}

            <Space direction="vertical" size={4} style={{ flex: 1, minWidth: 180 }}>
              <Text strong style={{ color: '#2F5A7A' }}>
                {t('review.provenance', { defaultValue: 'Herkomst' })}
              </Text>
              {/* Confidence + reason are repeated inside the provenance block so
                  it self-describes the detection (label, confidence, reason,
                  source, bbox) when expanded. */}
              <Text style={{ fontSize: 13 }}>
                {t('review.confidence', { defaultValue: 'Confidence' })}: {confidenceText}
              </Text>
              <Text style={{ fontSize: 13 }}>
                {t('review.sourceFile', { defaultValue: 'Bronbestand' })}:{' '}
                {item.sourceFile ?? t('review.unknown', { defaultValue: 'onbekend' })}
              </Text>
              <Text style={{ fontSize: 13 }}>
                <EnvironmentOutlined style={{ color: '#54949E', marginRight: 4 }} />
                {t('review.bbox', { defaultValue: 'Coördinaten' })}:{' '}
                {bbox ?? t('review.unknown', { defaultValue: 'onbekend' })}
              </Text>
              <Text style={{ fontSize: 13, color: '#1E293B' }}>
                {t('review.reason', { defaultValue: 'Reden' })}: {item.reason}
              </Text>
            </Space>
          </div>
        )}

        {/* Accept / reject actions (ADMIN only) — full-width thumb targets on mobile */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            width: isMobile ? '100%' : 'auto',
            marginTop: isMobile ? 4 : 0,
          }}
        >
          <div style={{ flex: isMobile ? 1 : '0 0 auto' }}>
          <Tooltip
            title={
              canMutate
                ? undefined
                : t('review.adminOnly', {
                    defaultValue: 'Alleen een beheerder kan reviewitems beoordelen',
                  })
            }
          >
            <Button
              type="primary"
              size={isMobile ? 'large' : 'small'}
              block={isMobile}
              icon={<CheckOutlined />}
              loading={busy}
              disabled={!canMutate}
              data-testid="review-item-accept"
              onClick={handleAccept}
              style={
                canMutate
                  ? { background: '#B7D945', borderColor: '#B7D945', color: '#1E293B' }
                  : undefined
              }
            >
              {t('review.accept', { defaultValue: 'Accepteer' })}
            </Button>
          </Tooltip>
          </div>

          <div style={{ flex: isMobile ? 1 : '0 0 auto' }}>
          <Tooltip
            title={
              canMutate
                ? undefined
                : t('review.adminOnly', {
                    defaultValue: 'Alleen een beheerder kan reviewitems beoordelen',
                  })
            }
          >
            <Button
              danger
              size={isMobile ? 'large' : 'small'}
              block={isMobile}
              icon={<CloseOutlined />}
              loading={busy}
              disabled={!canMutate}
              data-testid="review-item-reject"
              onClick={handleReject}
            >
              {t('review.reject', { defaultValue: 'Wijs af' })}
            </Button>
          </Tooltip>
          </div>
        </div>
      </Space>
    </Card>
  );
};

export default React.memo(ArtworkReviewItemCard);
